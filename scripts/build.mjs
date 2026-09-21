import { cp, readFile, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArchive } from './validate-archive.mjs';
import { readDownloadManifest } from './download-manifest.mjs';
import { siteConfig, validateSiteConfig } from '../dist/site-config.js';
import { build as buildVite } from 'vite';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function buildArchive({
  sourceDir = resolve(repositoryRoot, 'dist'),
  outputDir = resolve(repositoryRoot, 'build'),
  vercelConfigPath = resolve(repositoryRoot, 'vercel.json'),
  bundle = true,
} = {}) {
  const source = resolve(sourceDir);
  const output = resolve(outputDir);
  if (source === output || source.startsWith(output + sep) || output.startsWith(source + sep)) {
    throw new Error('Build output must be separate from the source directory.');
  }
  const validation = await validateArchive({ rootDir: source });
  const errors = [...validation.errors, ...validateSiteConfig(siteConfig)];
  if (errors.length) throw new Error(errors.join('\n'));
  const { projects } = JSON.parse(await readFile(resolve(source, 'data/archive.json'), 'utf8'));
  const manifest = await readDownloadManifest(source, { projects });
  const downloads = new Map((manifest?.assets || []).map(asset => [asset.path, asset]));
  const vercel = JSON.parse(await readFile(vercelConfigPath, 'utf8'));
  const redirect = vercel.redirects?.find(rule => rule.source === '/downloads/:filename');
  for (const project of projects) {
    const asset = downloads.get(project.download);
    if (!asset) throw new Error(`Publish and register the PDF before deployment: ${project.download}`);
    const destination = redirect?.destination?.replace(':filename', project.download.split('/').pop());
    if (destination !== asset.url || !asset.url.startsWith(`${siteConfig.repositoryUrl}/releases/download/`)) {
      throw new Error(`Vercel download redirect does not match the release manifest: ${project.download}`);
    }
  }
  await rm(output, { recursive: true, force: true });
  const downloadsDir = resolve(source, 'downloads');
  await cp(source, output, {
    recursive: true,
    filter: path => {
      if (path === downloadsDir || path.startsWith(downloadsDir + sep)) return false;
      // Application source is compiled by Vite. Only the archive's original
      // assets, metadata and shared styles are copied as stable public URLs.
      if (dirname(path) === source && (/\.(?:js|html)$/.test(path))) return false;
      return true;
    },
  });
  if (bundle) {
    await buildVite({
      root: repositoryRoot,
      configFile: resolve(repositoryRoot, 'vite.config.js'),
      build: { outDir: output, emptyOutDir: false },
    });
  }
  return { count: projects.length, outputDir: output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await buildArchive();
    console.log(`Built ${result.count} gigamaps. Static website: ${result.outputDir}`);
    console.log('PDF downloads use the verified GitHub Release manifest.');
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
