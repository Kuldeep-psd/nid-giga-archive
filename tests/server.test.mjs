import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArchiveServer } from '../server.mjs';

let temporary, root, server, base;
const pdf = Buffer.from('%PDF-1.7\n0123456789abcdef\n%%EOF');

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'giga-server-'));
  root = join(temporary, 'dist');
  await mkdir(root);
  await Promise.all([
    writeFile(join(root, 'index.html'), '<title>Archive</title>'),
    writeFile(join(root, 'archive.json'), '{"projects":[]}'),
    writeFile(join(root, 'map.pdf'), pdf),
    writeFile(join(root, 'empty.pdf'), ''),
    writeFile(join(root, 'font.woff2'), 'font fixture'),
    writeFile(join(root, 'large.pdf'), Buffer.alloc(4 * 1024 * 1024, 42)),
    writeFile(join(temporary, 'private.txt'), 'not public'),
  ]);
  await symlink(join(temporary, 'private.txt'), join(root, 'outside.txt'));
  server = createArchiveServer({ rootDir: root });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

test('GET and HEAD describe the same file, with correct font MIME and bounded caching', async () => {
  const get = await fetch(`${base}/`);
  assert.equal(get.status, 200);
  assert.equal(await get.text(), '<title>Archive</title>');
  assert.equal(get.headers.get('cache-control'), 'no-cache');
  assert.equal(get.headers.get('x-content-type-options'), 'nosniff');
  const head = await fetch(`${base}/`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), get.headers.get('content-length'));
  assert.equal(head.headers.get('etag'), get.headers.get('etag'));
  assert.equal(await head.text(), '');
  const font = await fetch(`${base}/font.woff2`);
  assert.equal(font.headers.get('content-type'), 'font/woff2');
  assert.equal(font.headers.get('cache-control'), 'public, max-age=3600, must-revalidate');
  await font.arrayBuffer();
});

test('unchanged files revalidate with ETag or Last-Modified and return no response body', async () => {
  const initial = await fetch(`${base}/archive.json`);
  await initial.arrayBuffer();
  const tag = initial.headers.get('etag');
  for (const headers of [
    { 'If-None-Match': tag },
    { 'If-None-Match': `"other", W/${tag}` },
    { 'If-None-Match': '*' },
    { 'If-Modified-Since': initial.headers.get('last-modified') },
  ]) {
    const response = await fetch(`${base}/archive.json`, { headers });
    assert.equal(response.status, 304);
    assert.equal(response.headers.get('etag'), tag);
    assert.equal(await response.text(), '');
  }
  const mismatch = await fetch(`${base}/archive.json`, { headers: {
    'If-None-Match': '"different"', 'If-Modified-Since': initial.headers.get('last-modified'),
  } });
  assert.equal(mismatch.status, 200, 'ETag condition takes precedence over the date');
  await mismatch.arrayBuffer();
});

test('a changed asset gets a new validator and fresh content', async () => {
  const initial = await fetch(`${base}/archive.json`);
  await initial.arrayBuffer();
  await writeFile(join(root, 'archive.json'), '{"projects":[{"id":"new"}]}');
  const nextTime = new Date(Date.now() + 2000);
  await utimes(join(root, 'archive.json'), nextTime, nextTime);
  const changed = await fetch(`${base}/archive.json`, { headers: { 'If-None-Match': initial.headers.get('etag') } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('etag'), initial.headers.get('etag'));
  assert.equal(await changed.text(), '{"projects":[{"id":"new"}]}');
});

test('PDF byte ranges support bounded, open-ended, suffix and clipped requests', async () => {
  for (const [range, start, end] of [
    ['bytes=0-4', 0, 4], ['bytes=7-', 7, pdf.length - 1],
    ['bytes=-5', pdf.length - 5, pdf.length - 1],
    ['bytes=3-999', 3, pdf.length - 1], ['bytes=-999', 0, pdf.length - 1],
  ]) {
    const response = await fetch(`${base}/map.pdf`, { headers: { Range: range } });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${pdf.length}`);
    assert.equal(Number(response.headers.get('content-length')), end - start + 1);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf.subarray(start, end + 1));
  }
});

test('unsatisfiable ranges return 416; unsupported multipart ranges safely return the complete file', async () => {
  for (const range of ['bytes=999-', 'bytes=9-2', 'bytes=-0', 'bytes=-', 'bytes=9007199254740992-']) {
    const response = await fetch(`${base}/map.pdf`, { headers: { Range: range } });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('content-range'), `bytes */${pdf.length}`);
    await response.arrayBuffer();
  }
  const empty = await fetch(`${base}/empty.pdf`, { headers: { Range: 'bytes=0-' } });
  assert.equal(empty.status, 416);
  assert.equal(empty.headers.get('content-range'), 'bytes */0');
  await empty.arrayBuffer();
  const multipart = await fetch(`${base}/map.pdf`, { headers: { Range: 'bytes=0-2,5-7' } });
  assert.equal(multipart.status, 200);
  assert.deepEqual(Buffer.from(await multipart.arrayBuffer()), pdf);
});

test('If-Range prevents mixing versions and HEAD ignores a Range request', async () => {
  const initial = await fetch(`${base}/map.pdf`, { method: 'HEAD' });
  for (const value of [initial.headers.get('etag'), initial.headers.get('last-modified')]) {
    const response = await fetch(`${base}/map.pdf`, { headers: { Range: 'bytes=0-4', 'If-Range': value } });
    assert.equal(response.status, 206);
    await response.arrayBuffer();
  }
  for (const value of ['"outdated"', `W/${initial.headers.get('etag')}`, 'Mon, 01 Jan 1990 00:00:00 GMT']) {
    const response = await fetch(`${base}/map.pdf`, { headers: { Range: 'bytes=0-4', 'If-Range': value } });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  }
  const head = await fetch(`${base}/map.pdf`, { method: 'HEAD', headers: { Range: 'bytes=0-4' } });
  assert.equal(head.status, 200);
  assert.equal(Number(head.headers.get('content-length')), pdf.length);
  assert.equal(await head.text(), '');
});

test('unsupported methods, malformed paths, missing files and traversal receive explicit errors', async () => {
  for (const [path, method, status] of [
    ['/', 'POST', 405], ['/missing', 'GET', 404], ['/missing', 'HEAD', 404],
    ['/%E0%A4%A', 'GET', 400], ['/%00', 'GET', 400],
    ['/%2e%2e%2fprivate.txt', 'GET', 403], ['/outside.txt', 'GET', 403],
  ]) {
    const response = await fetch(`${base}${path}`, { method });
    assert.equal(response.status, status, `${method} ${path}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    if (status === 405) assert.equal(response.headers.get('allow'), 'GET, HEAD');
    const body = await response.text();
    if (method === 'HEAD') assert.equal(body, '');
    assert.ok(!body.includes('not public'));
  }
});

test('cancelling a large response does not interrupt subsequent requests', async () => {
  await new Promise((resolve, reject) => {
    const req = request(`${base}/large.pdf`, response => {
      response.once('data', () => {
        response.destroy();
        resolve();
      });
      response.on('error', () => {});
    });
    req.on('error', reject);
    req.end();
  });
  const response = await fetch(`${base}/map.pdf`, { headers: { Range: 'bytes=0-4' } });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), '%PDF-');
});
