import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export const RELEASE_URL_PREFIX = 'https://github.com/Kuldeep-psd/nid-giga-archive/releases/download/archive-assets-v1/';
const downloadPathPattern = /^\/downloads\/[a-z0-9]+(?:-[a-z0-9]+)*\.pdf$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unsafePath = message => Object.assign(new Error(message), { code: 'EPERM' });

export function validateManifest(manifest, { projects } = {}) {
  const errors = [];
  if (!object(manifest) || manifest.version !== 1 || !Array.isArray(manifest.assets)) {
    return ['Download manifest must contain version 1 and an assets array.'];
  }
  const paths = new Set();
  for (const [index, asset] of manifest.assets.entries()) {
    const label = `downloads.assets[${index}]`;
    if (!object(asset)) { errors.push(`${label}: expected an asset object.`); continue; }
    if (typeof asset.path !== 'string' || !downloadPathPattern.test(asset.path)) {
      errors.push(`${label}.path: use /downloads/lowercase-slug.pdf without encoding, traversal or query strings.`);
    }
    if (paths.has(asset.path)) errors.push(`${label}.path: duplicate download path.`);
    paths.add(asset.path);
    if (typeof asset.path !== 'string' || asset.url !== RELEASE_URL_PREFIX + asset.path.slice('/downloads/'.length)) {
      errors.push(`${label}.url: use the exact archive GitHub release URL and matching filename.`);
    }
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) errors.push(`${label}.bytes: a positive integer is required.`);
    if (typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      errors.push(`${label}.sha256: a lowercase SHA-256 hash is required.`);
    }
    if (projects !== undefined) {
      const matches = Array.isArray(projects) ? projects.filter(project => project?.download === asset.path) : [];
      if (!matches.length) errors.push(`${label}.path: download is not registered in the archive catalog.`);
      else if (matches.some(project => project.downloadBytes !== asset.bytes)) {
        errors.push(`${label}.bytes: must match the catalog downloadBytes.`);
      }
    }
  }
  return errors;
}

export async function readDownloadManifest(rootDir, options = {}) {
  const root = await realpath(resolve(rootDir));
  const path = join(root, 'data/downloads.json');
  let canonical;
  try { canonical = await realpath(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!canonical.startsWith(root + sep)) throw new Error('Download manifest symlink escapes the public directory.');
  let manifest;
  try { manifest = JSON.parse(await readFile(canonical, 'utf8')); }
  catch (error) { throw new Error(`Cannot read download manifest: ${error.message}`); }
  const errors = validateManifest(manifest, options);
  if (errors.length) throw new Error(`Invalid download manifest:\n${errors.join('\n')}`);
  return manifest;
}

export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// Downloads have a deliberately flat layout. Reject linked directories and
// linked destinations, including broken links, before reading or writing them.
export async function resolveDownloadPath(rootDir, downloadPath, { createDirectory = false } = {}) {
  if (!downloadPathPattern.test(downloadPath)) throw unsafePath('Unsafe download path.');
  const root = await realpath(resolve(rootDir));
  const directory = join(root, 'downloads');
  if (createDirectory) await mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error; });
  try {
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw unsafePath('Downloads directory must be an ordinary directory.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const path = join(root, downloadPath.slice(1));
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw unsafePath('Download destination must be an ordinary file.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return path;
}
