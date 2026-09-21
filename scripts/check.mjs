import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';
import { validateArchive } from './validate-archive.mjs';
import { siteConfig, validateSiteConfig } from '../dist/site-config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function sourceFiles(directory) {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:js|jsx|mjs)$/.test(path) ? [path] : [];
  }));
  return groups.flat();
}

try {
  const files = [
    'server.mjs', 'vite.config.js', 'dist/archive-search.js', 'dist/site-config.js',
    ...await sourceFiles('src'), ...await sourceFiles('scripts'),
  ];
  for (const file of files) {
    if (file.endsWith('.jsx')) {
      await transformWithOxc(await readFile(resolve(root, file), 'utf8'), file, { jsx: { runtime: 'automatic' } });
    } else {
      const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || `Unable to parse ${file}`);
    }
  }
  const validation = await validateArchive({ rootDir: resolve(root, 'dist') });
  const errors = [...validation.errors, ...validateSiteConfig(siteConfig)];
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Checked ${files.length} JavaScript/JSX source files and the archive catalog.`);
} catch (error) {
  console.error(`Check failed: ${error.message}`);
  process.exitCode = 1;
}
