import { createServer } from 'node:http';
import { open, readFile, realpath } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDownloadManifest, resolveDownloadPath, validateManifest } from './scripts/download-manifest.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.dzi': 'application/xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function respond(req, res, status, message, headers = {}) {
  const body = Buffer.from(message);
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function notModified(req, etag, modified) {
  // If-None-Match takes precedence, including when a supplied tag does not match.
  if (req.headers['if-none-match'] !== undefined) {
    return req.headers['if-none-match'].split(',').some(tag =>
      tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag);
  }
  const since = Date.parse(req.headers['if-modified-since']);
  return Number.isFinite(since) && Math.floor(modified / 1000) <= Math.floor(since / 1000);
}

function rangeAllowed(value, etag, modified) {
  if (!value) return true;
  if (value.startsWith('"') || value.startsWith('W/')) return value === etag;
  const date = Date.parse(value);
  return Number.isFinite(date) && Math.floor(modified / 1000) <= Math.floor(date / 1000);
}

function byteRange(value, size) {
  // Multiple ranges and other range units are deliberately served as a full response.
  if (!value || !value.startsWith('bytes=') || value.includes(',')) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || !size) return false;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return false;
  if (!match[1]) {
    if (!end) return false;
    start = Math.max(0, size - end);
    end = size - 1;
  }
  if (start >= size || start > end) return false;
  return { start, end: Math.min(end, size - 1) };
}

async function releaseDownload(root, pathname) {
  if (!pathname?.startsWith('/downloads/')) return null;
  const manifest = await readDownloadManifest(root);
  const asset = manifest?.assets.find(item => item.path === pathname);
  if (!asset) return null;
  const catalog = JSON.parse(await readFile(resolve(root, 'data/archive.json'), 'utf8'));
  const errors = validateManifest(manifest, { projects: catalog.projects ?? [] });
  if (errors.length) throw new Error(`Invalid download manifest: ${errors.join('; ')}`);
  await resolveDownloadPath(root, pathname);
  return asset;
}

export function createArchiveServer({ rootDir = defaultRoot } = {}) {
  const root = resolve(rootDir);
  return createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      respond(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
      return;
    }
    let handle, pathname;
    try {
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname.includes('\0')) throw new Error('Invalid path');
      } catch {
        respond(req, res, 400, 'Bad request');
        return;
      }
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(root + sep)) {
        respond(req, res, 403, 'Forbidden');
        return;
      }
      // Resolve symlinks as well as URL traversal before opening an asset.
      const [canonicalRoot, canonicalFile] = await Promise.all([realpath(root), realpath(file)]);
      if (!canonicalFile.startsWith(canonicalRoot + sep)) {
        respond(req, res, 403, 'Forbidden');
        return;
      }
      handle = await open(canonicalFile, 'r');
      const info = await handle.stat();
      if (!info.isFile()) {
        respond(req, res, 404, 'Not found');
        return;
      }
      const extension = extname(file).toLowerCase();
      const etag = `"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
      const headers = {
        'Content-Type': types[extension] || 'application/octet-stream',
        'Cache-Control': /\.(html|js|css|json|dzi)$/.test(extension)
          ? 'no-cache' : 'public, max-age=3600, must-revalidate',
        ETag: etag, 'Last-Modified': info.mtime.toUTCString(),
        'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
      };
      if (notModified(req, etag, info.mtimeMs)) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      // Range only applies to GET; HEAD always describes the complete representation.
      const range = req.method === 'GET' && rangeAllowed(req.headers['if-range'], etag, info.mtimeMs)
        ? byteRange(req.headers.range, info.size) : null;
      if (range === false) {
        respond(req, res, 416, 'Range not satisfiable', { 'Content-Range': `bytes */${info.size}` });
        return;
      }
      headers['Content-Length'] = range ? range.end - range.start + 1 : info.size;
      if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
      res.writeHead(range ? 206 : 200, headers);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      // Pipeline closes the file stream when a navigation or download is cancelled.
      await pipeline(handle.createReadStream(range || {}), res);
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) {
        res.destroy(error);
      } else if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR') {
        try {
          const asset = error.code === 'ENOENT' ? await releaseDownload(root, pathname) : null;
          if (asset) respond(req, res, 307, 'PDF available from the archive release', { Location: asset.url });
          else respond(req, res, 404, 'Not found');
        } catch (downloadError) {
          if (downloadError.code === 'EPERM' || downloadError.code === 'EACCES') respond(req, res, 403, 'Forbidden');
          else respond(req, res, 500, 'Unable to resolve this download');
        }
      } else if (error.code === 'EACCES' || error.code === 'EPERM') {
        respond(req, res, 403, 'Forbidden');
      } else {
        respond(req, res, 500, 'Unable to read this file');
      }
    } finally {
      if (handle) await handle.close().catch(() => {});
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4173;
  createArchiveServer().listen(port, '127.0.0.1', () =>
    console.log(`Giga Archive running at http://127.0.0.1:${port}`));
}
