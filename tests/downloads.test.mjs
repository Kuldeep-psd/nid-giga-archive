import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RELEASE_URL_PREFIX, readDownloadManifest, validateManifest } from '../scripts/download-manifest.mjs';
import { fetchDownloads } from '../scripts/fetch-downloads.mjs';
import { validateArchive } from '../scripts/validate-archive.mjs';
import { createArchiveServer } from '../server.mjs';

const pdf = Buffer.from('%PDF-1.7\nrelease fixture\n%%EOF');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const asset = () => ({ path: '/downloads/sample-map.pdf', url: `${RELEASE_URL_PREFIX}sample-map.pdf`, bytes: pdf.length, sha256: digest(pdf) });
const manifest = () => ({ version: 1, assets: [asset()] });
const project = () => ({
  id: 'sample-map', title: 'Sample map', batch: 2024,
  summary: 'A sample map.', description: 'Verified sample context.', imageAlt: 'Fixture map.',
  domains: ['Environment'], topics: ['Water'], tags: ['Water'], width: 1000, height: 500,
  overview: '/overview.webp', tileSource: '/map.dzi', download: asset().path,
  downloadBytes: pdf.length, regions: [],
});

async function fixture(t, { registered = true, local = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'giga-downloads-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'data'));
  await mkdir(join(root, 'downloads'));
  await Promise.all([
    writeFile(join(root, 'data/archive.json'), JSON.stringify({ projects: [project()] })),
    writeFile(join(root, 'overview.webp'), 'fixture'),
    writeFile(join(root, 'map.dzi'), '<Image Format="webp" TileSize="512" Overlap="1"><Size Width="1000" Height="500" /></Image>'),
  ]);
  if (registered) await writeFile(join(root, 'data/downloads.json'), JSON.stringify(manifest()));
  if (local) await writeFile(join(root, 'downloads/sample-map.pdf'), pdf);
  return root;
}

async function serve(t, root) {
  const server = createArchiveServer({ rootDir: root });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('download manifests accept only safe archive release assets linked to the catalog', () => {
  assert.deepEqual(validateManifest(manifest(), { projects: [project()] }), []);
  for (const value of [null, [], {}, { version: 2, assets: [] }, { version: 1, assets: {} }]) {
    assert.ok(validateManifest(value).length);
  }
  for (const changes of [
    { path: '/downloads/../sample-map.pdf' }, { path: '/downloads/%73ample-map.pdf' },
    { path: '/downloads/sample-map.pdf?x=1' }, { path: '//downloads/sample-map.pdf' },
    { path: '/downloads/nested/sample-map.pdf' }, { path: '/downloads/sample-map.svg' },
    { url: 'https://example.com/sample-map.pdf' }, { url: `${RELEASE_URL_PREFIX}other.pdf` },
    { url: `${RELEASE_URL_PREFIX}sample-map.pdf?redirect=x` },
    { bytes: 0 }, { bytes: 1.5 }, { bytes: Number.MAX_SAFE_INTEGER + 1 },
    { sha256: 'abcd' }, { sha256: 'G'.repeat(64) },
  ]) assert.ok(validateManifest({ version: 1, assets: [{ ...asset(), ...changes }] }).length, JSON.stringify(changes));
  assert.ok(validateManifest({ version: 1, assets: [asset(), asset()] }).some(error => /duplicate/.test(error)));
  assert.ok(validateManifest(manifest(), { projects: [] }).some(error => /not registered/.test(error)));
  assert.ok(validateManifest(manifest(), { projects: [{ ...project(), downloadBytes: 1 }] }).some(error => /downloadBytes/.test(error)));
});

test('only a valid registered release permits a missing local PDF; other assets remain required', async t => {
  const root = await fixture(t);
  assert.deepEqual((await validateArchive({ rootDir: root })).errors, []);
  await rm(join(root, 'overview.webp'));
  assert.ok((await validateArchive({ rootDir: root })).errors.some(error => /overview.*not found/.test(error)));
  await writeFile(join(root, 'overview.webp'), 'fixture');
  await rm(join(root, 'data/downloads.json'));
  assert.equal(await readDownloadManifest(root), null);
  assert.ok((await validateArchive({ rootDir: root })).errors.some(error => /download.*not found/.test(error)));
  await writeFile(join(root, 'downloads/sample-map.pdf'), pdf);
  assert.deepEqual((await validateArchive({ rootDir: root })).errors, [], 'unregistered new local PDFs remain valid');
});

test('invalid manifests and registered local hash mismatches fail validation', async t => {
  const root = await fixture(t, { local: true });
  assert.deepEqual((await validateArchive({ rootDir: root })).errors, []);
  await writeFile(join(root, 'downloads/sample-map.pdf'), Buffer.alloc(pdf.length, 42));
  assert.ok((await validateArchive({ rootDir: root })).errors.some(error => /SHA-256/.test(error)));
  const wrong = manifest(); wrong.assets[0].url = 'https://example.com/file.pdf';
  await writeFile(join(root, 'data/downloads.json'), JSON.stringify(wrong));
  await assert.rejects(readDownloadManifest(root), /Invalid download manifest/);
  assert.ok((await validateArchive({ rootDir: root })).errors.some(error => /Invalid download manifest/));
  await writeFile(join(root, 'data/downloads.json'), '{broken');
  await assert.rejects(readDownloadManifest(root), /Cannot read download manifest/);
});

test('fetch verifies streams, atomically installs PDFs and skips files already matching the manifest', async t => {
  const root = await fixture(t);
  let calls = 0;
  const fetchImpl = async url => { calls++; assert.equal(url, asset().url); return new Response(pdf); };
  assert.deepEqual(await fetchDownloads({ rootDir: root, fetchImpl, log() {} }), { downloaded: 1, skipped: 0 });
  assert.deepEqual(await readFile(join(root, 'downloads/sample-map.pdf')), pdf);
  assert.deepEqual(await fetchDownloads({ rootDir: root, fetchImpl, log() {} }), { downloaded: 0, skipped: 1 });
  assert.equal(calls, 1);
  assert.deepEqual(await readdir(join(root, 'downloads')), ['sample-map.pdf']);
});

test('failed downloads retain the previous PDF and remove partial files before stopping', async t => {
  const root = await fixture(t);
  const previous = Buffer.from('previous local file');
  await writeFile(join(root, 'downloads/sample-map.pdf'), previous);
  for (const bytes of [Buffer.alloc(pdf.length, 42), pdf.subarray(0, 5), Buffer.alloc(pdf.length + 1)]) {
    await assert.rejects(fetchDownloads({ rootDir: root, fetchImpl: async () => new Response(bytes), log() {} }), /size|SHA-256/);
    assert.deepEqual(await readFile(join(root, 'downloads/sample-map.pdf')), previous);
    assert.deepEqual(await readdir(join(root, 'downloads')), ['sample-map.pdf']);
  }
  await assert.rejects(fetchDownloads({ rootDir: root, fetchImpl: async () => new Response('missing', { status: 404 }), log() {} }), /Download failed/);
});

test('download fetching and validation reject symlink destinations and symlink directories', async t => {
  const root = await fixture(t);
  const outside = join(root, 'private.pdf');
  await writeFile(outside, pdf);
  await symlink(outside, join(root, 'downloads/sample-map.pdf'));
  let calls = 0;
  const options = { rootDir: root, fetchImpl: async () => { calls++; return new Response(pdf); }, log() {} };
  await assert.rejects(fetchDownloads(options), /ordinary file/);
  assert.ok((await validateArchive({ rootDir: root })).errors.some(error => /ordinary file/));
  assert.equal(calls, 0);
  await rm(join(root, 'downloads'), { recursive: true });
  await mkdir(join(root, 'linked-downloads'));
  await symlink(join(root, 'linked-downloads'), join(root, 'downloads'));
  await assert.rejects(fetchDownloads(options), /ordinary directory/);
  assert.equal(calls, 0);
  assert.deepEqual(await readFile(outside), pdf);
});

test('missing registered PDFs redirect GET and HEAD without affecting 404s or local byte ranges', async t => {
  const root = await fixture(t);
  const base = await serve(t, root);
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(`${base}${asset().path}`, { method, redirect: 'manual', headers: { Range: 'bytes=0-4' } });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), asset().url);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (method === 'HEAD') assert.equal(await response.text(), '');
    else await response.arrayBuffer();
  }
  const missing = await fetch(`${base}/downloads/unknown.pdf`, { redirect: 'manual' });
  assert.equal(missing.status, 404); assert.equal(missing.headers.get('location'), null); await missing.arrayBuffer();
  await writeFile(join(root, 'downloads/sample-map.pdf'), pdf);
  const range = await fetch(`${base}${asset().path}`, { headers: { Range: 'bytes=0-4' }, redirect: 'manual' });
  assert.equal(range.status, 206); assert.equal(await range.text(), '%PDF-');
  assert.equal(range.headers.get('location'), null);
});

test('the server fails closed on invalid release metadata and broken symlinks', async t => {
  const root = await fixture(t);
  const base = await serve(t, root);
  const invalid = manifest(); invalid.assets[0].sha256 = 'invalid';
  await writeFile(join(root, 'data/downloads.json'), JSON.stringify(invalid));
  const bad = await fetch(`${base}${asset().path}`, { redirect: 'manual' });
  assert.equal(bad.status, 500); assert.equal(bad.headers.get('location'), null); await bad.arrayBuffer();
  await writeFile(join(root, 'data/downloads.json'), JSON.stringify(manifest()));
  await symlink(join(root, 'missing-private.pdf'), join(root, 'downloads/sample-map.pdf'));
  const linked = await fetch(`${base}${asset().path}`, { redirect: 'manual' });
  assert.equal(linked.status, 403); assert.equal(linked.headers.get('location'), null); await linked.arrayBuffer();
});
