#!/usr/bin/env python3
"""Prepare local image gigamaps. Requires Pillow; PDF mode also needs reportlab.

Assets keep the shared archive's 18,000px viewer limit. PDF mode preserves
original JPEG bytes or embeds other source pixels losslessly at 300dpi,
then adds an invisible, best-effort OCR layer.
No image or OCR request is sent to an external service.
"""
from pathlib import Path
import argparse, hashlib, json, math, shutil
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['assets', 'pdf'])
parser.add_argument('config')
args = parser.parse_args()
config = json.loads(Path(args.config).read_text())
source = Path(config['source'])
assets = Path(config['assets'])
assets.mkdir(parents=True, exist_ok=True)
image = Image.open(source)
image.load()
source_width, source_height = image.size

if args.mode == 'assets':
    width = min(18000, source_width)
    height = round(source_height * width / source_width)
    resized = image.resize((width, height), Image.Resampling.LANCZOS)
    image.close()
    # The supplied artwork has an opaque background; retain alpha if it exists.
    if resized.mode == 'RGBA' and resized.getchannel('A').getextrema() == (255, 255):
        image = resized.convert('RGB'); resized.close()
    else:
        image = resized
    preview = image.resize((2400, round(height * 2400 / width)), Image.Resampling.LANCZOS)
    preview.save(assets / 'overview.webp', 'WEBP', quality=90, method=6)
    preview.close()
    maximum = math.ceil(math.log2(max(width, height)))
    tile_size, overlap, count = 512, 1, 0
    current = image
    for level in range(maximum, -1, -1):
        divisor = 2 ** (maximum - level)
        size = (math.ceil(width / divisor), math.ceil(height / divisor))
        if current.size != size:
            previous = current
            current = previous.resize(size, Image.Resampling.LANCZOS)
            previous.close()
        folder = assets / 'map_files' / str(level)
        folder.mkdir(parents=True, exist_ok=True)
        for row in range(math.ceil(size[1] / tile_size)):
            for column in range(math.ceil(size[0] / tile_size)):
                box = (max(0, column*tile_size-overlap), max(0, row*tile_size-overlap),
                       min(size[0], (column+1)*tile_size+overlap), min(size[1], (row+1)*tile_size+overlap))
                part = current.crop(box)
                part.save(folder / f'{column}_{row}.webp', 'WEBP', quality=90, method=4)
                part.close(); count += 1
        print(f'{assets.name}: zoom level {level} ready', flush=True)
    current.close()
    (assets / 'map.dzi').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="webp" Overlap="1" TileSize="512">\n  <Size Width="{width}" Height="{height}" />\n</Image>\n')
    result = {'sourceWidth':source_width,'sourceHeight':source_height,'width':width,'height':height,'tiles':count}
    Path(config['manifest']).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result),flush=True)
else:
    from reportlab.pdfgen import canvas
    from reportlab import rl_config
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    output = Path(config['pdf'])
    output.parent.mkdir(parents=True, exist_ok=True)
    rl_config.useA85 = 0
    scale = 72 / 300
    page_width, page_height = source_width*scale, source_height*scale
    pdf = canvas.Canvas(str(output), pagesize=(page_width,page_height), pageCompression=1)
    pdf.setTitle(config['title'])
    pdf.setAuthor(', '.join(config.get('contributors', [])))
    batch = f", batch {config['batch']}" if config.get('batch') else ''
    pdf.setSubject(f'Gigamap - National Institute of Design archive{batch}')
    pdf.setCreator('Giga Archive - lossless image conversion with local OCR')
    pixel_hashes = []
    original_jpeg = image.format == 'JPEG' and image.mode == 'RGB'
    if original_jpeg:
        # Passing the filename lets ReportLab embed the original JPEG stream
        # directly, without decoding/recompressing it or inflating the download.
        pdf.drawImage(str(source),0,0,width=page_width,height=page_height)
    else:
        # Strips cap peak memory and stay below PDF parser stream-size limits.
        for top in range(0, source_height, 256):
            strip = image.crop((0,top,source_width,min(source_height,top+256)))
            if strip.mode == 'RGBA' and strip.getchannel('A').getextrema() == (255,255):
                rgb = strip.convert('RGB'); strip.close(); strip = rgb
            pixel_hashes.append(hashlib.sha256(strip.convert('RGB').tobytes()).hexdigest())
            pdf.drawImage(ImageReader(strip),0,(source_height-top-strip.height)*scale,
                          width=source_width*scale,height=strip.height*scale,mask='auto')
            strip.close()
    image.close()
    print(f'{output.name}: full-resolution artwork embedded; waiting for OCR', flush=True)
    import time
    deadline = time.monotonic() + 600
    while not Path(config['ocr']).exists():
        if time.monotonic() > deadline:
            raise RuntimeError('OCR output is not ready; run local OCR first.')
        time.sleep(1)
    words = json.loads(Path(config['ocr']).read_text())['words']
    # A Unicode font allows copied OCR to retain punctuation and diacritics.
    font_path = config.get('font','/System/Library/Fonts/Supplemental/Arial.ttf')
    pdfmetrics.registerFont(TTFont('ArchiveOCR',font_path))
    included = 0
    for word in words:
        text = word['text'].strip()
        x,y,w,h = word['bbox']
        if not text or w<=0 or h<=0 or word.get('confidence',0)<0.35:
            continue
        font_size = h*scale
        target_width = w*scale
        text_width = pdfmetrics.stringWidth(text,'ArchiveOCR',font_size)
        if text_width<=0: continue
        text_object = pdf.beginText()
        text_object.setTextRenderMode(3)
        text_object.setFont('ArchiveOCR',font_size)
        text_object.setHorizScale(100*target_width/text_width)
        text_object.setTextOrigin(x*scale,(source_height-y-h)*scale+font_size*0.15)
        text_object.textOut(text)
        pdf.drawText(text_object)
        included += 1
    pdf.showPage(); pdf.save()
    destination = Path(config['download'])
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(output,destination)
    result = json.loads(Path(config['manifest']).read_text())
    with source.open('rb') as stream: result['sourceSHA256'] = hashlib.file_digest(stream,'sha256').hexdigest()
    with output.open('rb') as stream: result['pdfSHA256'] = hashlib.file_digest(stream,'sha256').hexdigest()
    result.update(downloadBytes=output.stat().st_size,ocrWords=included,
                  embedding='original-jpeg' if original_jpeg else 'lossless-pixel-strips',
                  stripPixelHashes=pixel_hashes)
    Path(config['manifest']).write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({key:value for key,value in result.items() if key!='stripPixelHashes'}),flush=True)
