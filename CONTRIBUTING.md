# Contributing to NID Giga Archive

Thank you for helping keep the archive accurate, useful and easy to explore. Small fixes to credits, descriptions, accessibility and navigation are welcome.

## Choose a route

**Have a map to share?** The About page will link to the Google Form once it is available. You can also open a [map submission issue](https://github.com/Kuldeep-psd/nid-giga-archive/issues/new?template=map-submission.yml). You do not need to prepare tiles or write code to submit a map. Share a public download link to the original file, its batch, and known contributor and guide credits.

**Found an error?** Use the [correction form](https://github.com/Kuldeep-psd/nid-giga-archive/issues/new?template=correction.yml) for content or the [bug report](https://github.com/Kuldeep-psd/nid-giga-archive/issues/new?template=bug-report.yml) for website behaviour. Include the affected map or URL and enough detail to reproduce or verify the issue.

**Want to change the code?** Fork the repository, make a focused branch, run the checks below, and open a pull request explaining the user-facing change. Add a screenshot for visible changes and mention the browsers and viewport sizes checked. Never commit credentials, private contact details, local absolute paths or temporary files.

Public issues and pull requests are visible to everyone. For a rights or privacy concern that should not be posted publicly, email [ks00347@gmail.com](mailto:ks00347@gmail.com).

## Development

Use Node.js 22 LTS. No dependency installation is required.

```sh
npm start
```

The archive runs at [localhost:4173](http://127.0.0.1:4173/). Edit the files in `dist/` and refresh the browser. The original PDFs can be fetched for offline work with `npm run assets:fetch`; they remain outside Git.

Before submitting changes, run:

```sh
npm run check
npm test
npm run build
```

Check visible changes at desktop and phone widths, in light and dark modes, with keyboard navigation. For viewer changes, include a portrait map, section navigation, loading/retry behaviour and a PDF download. Use temporary fixtures for scale or missing-data checks; do not add synthetic projects to the real catalog.

## Keep every map consistent

All current and future maps use `dist/project-template.js` and `dist/project.js`. Add metadata and assets, not a separate HTML page, route implementation or CSS theme.

The shared details format is:

1. One overview paragraph, followed by known methods.
2. Exactly **Batch** and **Team** in the facts column.
3. Separate **Contributors** and **Guided by** rows, then the batch back-link.

Verified duration and institution can remain in metadata but must not add facts rows. Optional process text joins the overview. Credit rows keep the same spacing and separators. Unknown source facts stay omitted; the template displays “Not recorded” for missing credits or team size. Check the printed artwork before treating credits as unknown.

Use shared CSS and theme tokens. Preserve the artwork’s proportions and colours. Do not add generic “Systems design”, “Systems thinking” or “Systems mapping” descriptors, project-specific decorations, site footers, visible result counters or “The complete map” labels. The landing page remains All gigamaps, and contributor contact stays in About.

## Add a catalog entry

1. Confirm the title, batch, credits and subject from the supplied artwork or contributor. Do not infer a batch from a file’s modification date. Do not invent a department, duration, team member or guide.
2. Copy `templates/gigamap.json` into the `projects` array in `dist/data/archive.json`. Replace every placeholder. Use a unique lowercase hyphenated `id` and a concise subject-focused summary and description.
3. Add `overview.webp`, a DZI manifest and the corresponding tile directory under `dist/assets/<id>/`. Keep the full composition in previews, including portrait maps. Set catalog `width` and `height` to the viewer image dimensions, which may differ from the original file.
4. Add descriptive `imageAlt`, broad `domains`, specific `topics` and useful card `tags`. Add research `methods` only when known. Filter menus derive from these records automatically.
5. Add verified `contributors` and `guides` arrays when known. Team count derives from contributors. An optional `teamSize` must agree with named contributors when both are supplied. Retain the spelling printed on the artwork unless a credited person confirms a correction.
6. Define optional `regions` for meaningful section jumps. Both axes are normalized by image width, as required by OpenSeadragon. Region IDs are unique slugs; `whole` is reserved. Use `regions: []` when no sections are needed.
7. Keep the download path `/downloads/<id>.pdf`, record its exact `downloadBytes`, and register the released PDF in `dist/data/downloads.json`. See the asset workflow below. Add reviewed provenance with source filename, file hashes and any credit corrections; omit local filesystem paths.
8. Run the checks and inspect the map on desktop and phone. Confirm preview, zoom, section jumps, credits, batch navigation, filters, search and download.

`ocrText` is optional. Keep raw OCR separate from verified titles, credits and descriptors. It improves discovery but is not evidence that a name is correct. No text recognition happens during a visitor’s search.

## Original files and release assets

Do not commit large original PDFs to Git or replace an existing source PDF with a compressed version. The repository stores the website, previews, tiles and metadata; [GitHub Releases](https://github.com/Kuldeep-psd/nid-giga-archive/releases) distribute the PDFs. Download metadata binds each map to its public release URL, byte size and SHA-256 hash. Builds can validate the published manifest without downloading every original.

For a new map, supply the original PDF through a public file link in the pull request or submission issue. A maintainer uploads it to the `archive-assets-v1` release and completes the manifest entry before merging:

```json
{
  "path": "/downloads/example-map.pdf",
  "url": "https://github.com/Kuldeep-psd/nid-giga-archive/releases/download/archive-assets-v1/example-map.pdf",
  "bytes": 123456,
  "sha256": "replace-with-the-original-file-sha256"
}
```

Append the entry to the manifest’s `assets` array. The values above are illustrative; record the file’s exact byte count and 64-character SHA-256. To calculate them and upload an asset with the GitHub CLI:

```sh
node -e "const fs = require('node:fs'); const crypto = require('node:crypto'); const data = fs.readFileSync(process.argv[1]); console.log({bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex')});" dist/downloads/example-map.pdf
gh release upload archive-assets-v1 dist/downloads/example-map.pdf --repo Kuldeep-psd/nid-giga-archive
```

The upload requires repository write access. Verify the public download URL before merging. The local server uses a local original when present and otherwise redirects to the registered release URL. Vercel redirects `/downloads/:filename` to the same release, so asset filenames must match. If the release location changes, update the manifest and Vercel configuration together.

Do not use temporary signed links or a service that requires a viewer to log in. Preserve published asset names and URLs so existing downloads keep working; corrections that change the artwork should use a new version and retain provenance.

Only share artwork you are entitled to submit. Submitting a map does not change ownership or place it under the website’s MIT license. Keep printed credits and attribution intact. See [CONTENT_RIGHTS.md](CONTENT_RIGHTS.md).

### Image-only originals

Image submissions use the same viewer and downloadable PDF experience. Preserve the submitted PNG or JPEG and its hash. The preparation helper retains the aspect ratio and does not crop or recolour the artwork. It embeds original RGB JPEG bytes directly, or other image pixels losslessly, with invisible OCR text.

`scripts/prepare-image-map.py` requires Python 3.11 or later, Pillow and ReportLab. Its config contains `source`, `assets`, `manifest`, `title`, `contributors`, `batch`, `pdf`, `download` and `ocr` paths. Start from a `config.example.json` in `sources/image-import/` and use a local ignored `config.json` for machine-specific paths. `assets` mode generates the preview and Deep Zoom tiles; `pdf` mode prepares the download.

```sh
python3 scripts/prepare-image-map.py assets path/to/local-config.json
python3 scripts/prepare-image-map.py pdf path/to/local-config.json
```

The included OCR helper uses Apple Vision locally on macOS. Compile and run it before PDF mode, following the commands at the top of `scripts/ocr-image.swift`. On another platform, provide OCR JSON in the same original-image coordinate format and set the config’s `font` to a local Unicode TrueType font. Inspect all visible credits manually; OCR output is best effort.

## Review expectations

Keep pull requests focused, explain the problem and resulting behaviour, and retain third-party license notices. Changes to the shared template or viewer must work for every map, including future entries with optional metadata. CI must pass before merging. Be considerate when discussing student work and credit corrections.
