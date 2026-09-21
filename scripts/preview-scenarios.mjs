// Local verification only. Start one scenario, inspect it, then stop and restart:
//   SCENARIO=slow node scripts/preview-scenarios.mjs
//   SCENARIO=retry node scripts/preview-scenarios.mjs
//   SCENARIO=preview-error node scripts/preview-scenarios.mjs
//   SCENARIO=many node scripts/preview-scenarios.mjs
//   SCENARIO=module-error node scripts/preview-scenarios.mjs
//   SCENARIO=viewer-error node scripts/preview-scenarios.mjs
//   SCENARIO=project-error node scripts/preview-scenarios.mjs
//   SCENARIO=future node scripts/preview-scenarios.mjs
// Run npm run build first. Open http://127.0.0.1:4174/ (PORT can override 4174).
// Synthetic metadata exists only in memory. No real archive files are changed.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createArchiveServer } from '../server.mjs';

const scenario = process.env.SCENARIO || 'slow';
const scenarios = new Set(['slow', 'retry', 'preview-error', 'many', 'future', 'module-error', 'viewer-error', 'project-error']);
if (!scenarios.has(scenario)) {
  console.error(`Unknown SCENARIO: ${scenario}. Choose ${[...scenarios].join(', ')}.`);
  process.exit(1);
}
const port = Number(process.env.PORT || 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer from 1 to 65535.');
  process.exit(1);
}

const archive = JSON.parse(await readFile(new URL('../dist/data/archive.json', import.meta.url), 'utf8'));
let bundleManifest;
try {
  bundleManifest = JSON.parse(await readFile(new URL('../build/.vite/manifest.json', import.meta.url), 'utf8'));
} catch {
  console.error('Build the React app with npm run build before starting a verification scenario.');
  process.exit(1);
}
const entryPath = `/${bundleManifest['index.html'].file}`;
const projectChunk = Object.entries(bundleManifest).find(([source, chunk]) =>
  /ProjectPage/.test(source) || /ProjectPage/.test(chunk.name || ''))?.[1];
const previewPaths = new Set(archive.projects.map(project => project.overview));
const synthetic = scenario === 'many' ? Buffer.from(JSON.stringify({
  ...archive,
  projects: Array.from({ length: 100 }, (_, i) => {
    const project = archive.projects[i % archive.projects.length];
    return {
      ...project,
      id: `preview-${i + 1}-${project.id}`,
      title: `Preview map ${String(i + 1).padStart(3, '0')} · ${project.title}`,
      batch: 2014 + (i % 13),
    };
  }),
})) : null;

// Two in-memory edge cases exercise the same template used by real maps.
const futureProjects = scenario === 'future' ? (() => {
  const minimal = structuredClone(archive.projects[0]);
  minimal.id = 'future-minimal';
  minimal.title = 'Future entry with optional metadata omitted';
  for (const key of ['methods', 'contributors', 'guides', 'duration', 'institution', 'process', 'teamSize']) delete minimal[key];
  minimal.regions = [];
  const detailed = structuredClone(archive.projects.find(project => project.height > project.width));
  detailed.id = 'future-detailed';
  detailed.title = 'A future portrait gigamap with a longer title, detailed credits, and twelve navigable sections';
  detailed.regions = Array.from({ length: 12 }, (_, i) => ({ ...detailed.regions[0], id: `section-${i + 1}`, title: `Section ${i + 1}: a longer topic and its related context` }));
  return Buffer.from(JSON.stringify({ projects: [minimal, detailed] }));
})() : null;

const archiveServer = createArchiveServer({ spaFallback: true });
let failedOnce = false;

function reply(req, res, status, text, type = 'text/plain; charset=utf-8') {
  const body = Buffer.isBuffer(text) ? text : Buffer.from(text);
  res.writeHead(status, {
    'Content-Type': type, 'Content-Length': body.length,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = createServer(async (req, res) => {
  // Keep scenario switches reproducible instead of reusing previously cached assets.
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  const writeHead = res.writeHead;
  res.writeHead = function (status, headers) {
    return writeHead.call(this, status, { ...headers, 'Cache-Control': 'no-store' });
  };
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const archiveRequest = pathname === '/data/archive.json';
  if (scenario === 'slow' && archiveRequest) {
    console.log('[slow] Delaying archive metadata by 3 seconds.');
    await new Promise(resolve => setTimeout(resolve, 3000));
    if (res.destroyed) return;
  }
  if (scenario === 'retry' && archiveRequest && req.method === 'GET' && !failedOnce) {
    failedOnce = true;
    console.log('[retry] First metadata request failed; the next request will succeed.');
    reply(req, res, 503, 'Simulated metadata failure. Retry will succeed.');
    return;
  }
  if (scenario === 'module-error' && pathname === entryPath && req.method === 'GET' && !failedOnce) {
    failedOnce = true;
    console.log('[module-error] First app module request failed; a reload will succeed.');
    reply(req, res, 503, 'Simulated app module failure. Reload will succeed.');
    return;
  }
  const failingModule = scenario === 'viewer-error' ? '/assets/vendor/openseadragon.min.js'
    : scenario === 'project-error' && projectChunk ? `/${projectChunk.file}` : null;
  if (failingModule && pathname === failingModule && req.method === 'GET' && !failedOnce) {
    failedOnce = true;
    console.log(`[${scenario}] First ${failingModule} request failed; the next request will succeed.`);
    reply(req, res, 503, 'Simulated module failure. Retry will succeed.');
    return;
  }
  if (scenario === 'preview-error' && previewPaths.has(pathname)) {
    console.log(`[preview-error] Returning 404 for ${pathname}`);
    reply(req, res, 404, 'Simulated preview failure.');
    return;
  }
  if (scenario === 'future' && archiveRequest) {
    reply(req, res, 200, futureProjects, 'application/json; charset=utf-8');
    return;
  }
  if (scenario === 'many' && archiveRequest) {
    reply(req, res, 200, synthetic, 'application/json; charset=utf-8');
    return;
  }
  archiveServer.emit('request', req, res);
});

server.on('error', error => {
  console.error(`Scenario server failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Giga Archive verification: ${scenario} at http://127.0.0.1:${port}/`);
  console.log('Temporary test responses only; the real archive is unchanged. Ctrl+C stops this server.');
});
