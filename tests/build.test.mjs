import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildArchive } from '../scripts/build.mjs';

test('deployment compiles React while keeping archive assets and excluding PDFs and legacy renderers', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'nid-build-'));
  const sourceDir = join(temporary, 'dist');
  const outputDir = join(temporary, 'build');
  try {
    await mkdir(join(sourceDir, 'data'), { recursive: true });
    await mkdir(join(sourceDir, 'downloads'));
    const pdf = Buffer.from('%PDF-1.7\nfixture\n%%EOF');
    const project = {
      id: 'sample-map', title: 'Sample map', batch: 2023, summary: 'Sample summary.', description: 'Sample context.',
      imageAlt: 'Sample map.', domains: ['Environment'], topics: ['Water'], tags: ['Water'],
      width: 1000, height: 500, overview: '/overview.webp', tileSource: '/map.dzi',
      download: '/downloads/sample-map.pdf', downloadBytes: pdf.length, regions: [],
    };
    const manifest = { version: 1, assets: [{
      path: project.download, bytes: pdf.length,
      url: 'https://github.com/Kuldeep-psd/nid-giga-archive/releases/download/archive-assets-v1/sample-map.pdf',
      sha256: createHash('sha256').update(pdf).digest('hex'),
    }] };
    await Promise.all([
      writeFile(join(sourceDir, 'index.html'), '<title>Archive</title>'),
      writeFile(join(sourceDir, 'app.js'), 'legacy application must not ship'),
      writeFile(join(sourceDir, 'project.js'), 'legacy viewer must not ship'),
      writeFile(join(sourceDir, 'overview.webp'), 'preview'),
      writeFile(join(sourceDir, 'map.dzi'), '<Image><Size Width="1000" Height="500" /></Image>'),
      writeFile(join(sourceDir, 'data/archive.json'), JSON.stringify({ projects: [project] })),
      writeFile(join(sourceDir, 'data/downloads.json'), JSON.stringify(manifest)),
      writeFile(join(sourceDir, 'downloads/unused.pdf'), pdf),
    ]);
    assert.equal((await buildArchive({ sourceDir, outputDir })).count, 1);
    const html = await readFile(join(outputDir, 'index.html'), 'utf8');
    assert.match(html, /type="module"[^>]+src="\/app-assets\/[^\"]+\.js"/);
    const bundled = JSON.parse(await readFile(join(outputDir, '.vite/manifest.json'), 'utf8'));
    assert.ok(bundled['index.html']?.isEntry);
    assert.ok(Object.values(bundled).some(chunk => /ProjectPage/.test(chunk.src || chunk.name || '')), 'map route is code split');
    for (const file of ['app.js', 'project.js']) await assert.rejects(access(join(outputDir, file)));
    assert.equal(await readFile(join(outputDir, 'overview.webp'), 'utf8'), 'preview');
    assert.equal(await readFile(join(outputDir, 'map.dzi'), 'utf8'), '<Image><Size Width="1000" Height="500" /></Image>');
    await assert.rejects(access(join(outputDir, 'downloads')));

    // Local PDFs also stay out of deployed output; downloads always resolve via the release.
    await writeFile(join(sourceDir, 'downloads/sample-map.pdf'), pdf);
    await buildArchive({ sourceDir, outputDir, bundle: false });
    await assert.rejects(access(join(outputDir, 'downloads')));

    await writeFile(join(sourceDir, 'data/downloads.json'), JSON.stringify({ version: 1, assets: [] }));
    await assert.rejects(buildArchive({ sourceDir, outputDir }), /Publish and register the PDF/);
    await assert.rejects(buildArchive({ sourceDir, outputDir: sourceDir }), /separate/);
    await assert.rejects(buildArchive({ sourceDir, outputDir: temporary }), /separate/);

    await writeFile(join(sourceDir, 'data/downloads.json'), JSON.stringify(manifest));
    const vercelConfigPath = join(temporary, 'vercel.json');
    await writeFile(vercelConfigPath, JSON.stringify({ redirects: [] }));
    await assert.rejects(buildArchive({ sourceDir, outputDir, vercelConfigPath }), /redirect does not match/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
