import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashFile, readDownloadManifest, resolveDownloadPath } from './download-manifest.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const genericDescriptor = /\bsystems\s+(?:design|thinking|mapping)\b/i;
const urlSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The archive uses ordinary single-image DZI manifests. Parse that small format
// explicitly; do not resolve XML entities or accept an unrelated XML document.
function dziDimensions(xml) {
  const text = xml.replace(/^\uFEFF/, '').trim();
  const match = text.match(/^(?:<\?xml\s+[^?]*\?>\s*)?<Image\b([^>]*)>\s*<Size\b([^>]*?)(?:\/>|>\s*<\/Size>)\s*<\/Image>$/);
  if (!match) return null;
  const attributes = source => {
    const values = new Map();
    const attribute = /\s+([A-Za-z_][\w:.-]*)\s*=\s*(["'])([^<]*?)\2/y;
    let position = 0;
    while (source.slice(position).trim()) {
      attribute.lastIndex = position;
      const item = attribute.exec(source);
      if (!item || values.has(item[1])) return null;
      values.set(item[1], item[3]);
      position = attribute.lastIndex;
    }
    return values;
  };
  if (!attributes(match[1])) return null;
  const size = attributes(match[2]);
  if (!size) return null;
  const dimensions = ['Width', 'Height'].map(key => {
    const value = size.get(key);
    return /^\d+$/.test(value || '') ? Number(value) : NaN;
  });
  return dimensions.every(positiveInteger) ? dimensions : null;
}

export async function validateArchiveData(data, { rootDir = defaultRoot } = {}) {
  const errors = [];
  const root = resolve(rootDir);
  if (!data || !Array.isArray(data.projects)) {
    return { count: 0, errors: ['Archive must contain a projects array.'] };
  }
  let canonicalRoot;
  try { canonicalRoot = await realpath(root); }
  catch { return { count: data.projects.length, errors: [`Asset directory does not exist: ${root}`] }; }
  const ids = new Set();
  let downloads;
  try { downloads = await readDownloadManifest(root, { projects: data.projects }); }
  catch (error) { errors.push(error.message); }
  const registeredDownloads = new Map((downloads?.assets || []).map(asset => [asset.path, asset]));

  async function checkAsset(value, label, extension) {
    if (!hasText(value)) {
      errors.push(`${label}: a local asset path is required.`);
      return;
    }
    let decoded;
    try { decoded = decodeURIComponent(value); }
    catch { errors.push(`${label}: asset path contains invalid URL encoding.`); return; }
    if (!decoded.startsWith('/') || decoded.startsWith('//') || /[?#\0\\]/.test(decoded)) {
      errors.push(`${label}: use a root-relative local asset path without a query or fragment.`);
      return;
    }
    const path = resolve(root, `.${decoded}`);
    if (!path.startsWith(root + sep)) {
      errors.push(`${label}: asset path escapes the public directory.`);
      return;
    }
    if (extension && extname(path).toLowerCase() !== extension) {
      errors.push(`${label}: expected a ${extension} file.`);
    }
    const registered = extension === '.pdf' ? registeredDownloads.get(value) : undefined;
    if (registered) {
      try { await resolveDownloadPath(root, value); }
      catch (error) { errors.push(`${label}: ${error.message}`); return; }
    }
    try {
      const canonical = await realpath(path);
      if (!canonical.startsWith(canonicalRoot + sep)) {
        errors.push(`${label}: asset symlink escapes the public directory.`);
        return;
      }
      const info = await stat(canonical);
      if (!info.isFile() || !info.size) {
        errors.push(`${label}: asset must be a non-empty file.`);
        return;
      }
      return { info, path: canonical };
    } catch (error) {
      if (registered && error.code === 'ENOENT') return { remote: registered };
      errors.push(`${label}: asset not found (${value}).`);
    }
  }

  for (const [index, project] of data.projects.entries()) {
    const label = `projects[${index}]${hasText(project?.id) ? ` (${project.id})` : ''}`;
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      errors.push(`${label}: expected a project object.`);
      continue;
    }
    for (const key of ['id', 'title', 'summary', 'description', 'imageAlt']) {
      if (!hasText(project[key])) errors.push(`${label}.${key}: non-empty text is required.`);
    }
    if (hasText(project.id)) {
      if (!urlSlug.test(project.id)) errors.push(`${label}.id: use a lowercase URL slug.`);
      if (ids.has(project.id)) errors.push(`${label}.id: duplicate project id.`);
      ids.add(project.id);
    }
    if (!Number.isInteger(project.batch) || project.batch < 1000 || project.batch > 9999) {
      errors.push(`${label}.batch: use a four-digit year.`);
    }
    for (const key of ['width', 'height', 'downloadBytes']) {
      if (!positiveInteger(project[key])) errors.push(`${label}.${key}: a positive integer is required.`);
    }
    for (const key of ['domains', 'topics', 'tags', 'methods', 'contributors', 'guides']) {
      const optional = ['methods', 'contributors', 'guides'].includes(key);
      if (optional && project[key] === undefined) continue;
      if (!Array.isArray(project[key]) || (!optional && !project[key].length) || !project[key].every(hasText)) {
        errors.push(`${label}.${key}: use an array of non-empty strings${optional ? ' (omit or leave empty if unknown)' : ' with at least one entry'}.`);
      } else {
        const entries = project[key].map(value => value.trim());
        if (new Set(entries).size !== entries.length) errors.push(`${label}.${key}: remove duplicate entries.`);
      }
    }
    for (const key of ['discipline', 'domains', 'topics', 'tags', 'methods']) {
      const descriptors = Array.isArray(project[key]) ? project[key] : [project[key]];
      if (descriptors.some(value => typeof value === 'string' && genericDescriptor.test(value))) {
        errors.push(`${label}.${key}: remove generic “Systems design”, “Systems thinking” or “Systems mapping” descriptors.`);
      }
    }
    for (const key of ['duration', 'institution', 'process', 'discipline', 'ocrText']) {
      if (project[key] !== undefined && !hasText(project[key])) errors.push(`${label}.${key}: omit unknown values instead of using empty text.`);
    }
    if (project.teamSize !== undefined && !positiveInteger(project.teamSize)) {
      errors.push(`${label}.teamSize: a positive integer is required when provided.`);
    } else if (positiveInteger(project.teamSize) && Array.isArray(project.contributors) && project.contributors.length && project.teamSize !== project.contributors.length) {
      errors.push(`${label}.teamSize: expected ${project.contributors.length} to match the contributor list, found ${project.teamSize}.`);
    }
    const assets = [
      ['overview', undefined], ['tileSource', '.dzi'], ['download', '.pdf'],
      ...(project.cover !== undefined ? [['cover', undefined]] : []),
    ];
    const assetResults = await Promise.all(assets.map(([key, extension]) => checkAsset(project[key], `${label}.${key}`, extension)));
    const downloadInfo = assetResults[2]?.info;
    if (downloadInfo && positiveInteger(project.downloadBytes) && downloadInfo.size !== project.downloadBytes) {
      errors.push(`${label}.downloadBytes: expected ${downloadInfo.size}, found ${project.downloadBytes}.`);
    }
    const registeredDownload = registeredDownloads.get(project.download);
    if (downloadInfo && registeredDownload) {
      try {
        if (await hashFile(assetResults[2].path) !== registeredDownload.sha256) {
          errors.push(`${label}.download: SHA-256 does not match the registered release asset.`);
        }
      } catch (error) { errors.push(`${label}.download: could not verify SHA-256 (${error.message}).`); }
    }
    if (assetResults[1]) {
      try {
        const dimensions = dziDimensions(await readFile(assetResults[1].path, 'utf8'));
        if (!dimensions) {
          errors.push(`${label}.tileSource: expected a valid single-image DZI with a Size element and positive Width and Height.`);
        } else {
          for (const [dimension, key] of dimensions.map((value, index) => [value, ['width', 'height'][index]])) {
            if (positiveInteger(project[key]) && project[key] !== dimension) {
              errors.push(`${label}.${key}: expected ${dimension} to match the DZI, found ${project[key]}.`);
            }
          }
        }
      } catch {
        errors.push(`${label}.tileSource: could not read the DZI manifest.`);
      }
    }
    if (!Array.isArray(project.regions)) {
      errors.push(`${label}.regions: use an array (empty if no section navigation is available).`);
      continue;
    }
    const regionIds = new Set();
    project.regions.forEach((region, regionIndex) => {
      const regionLabel = `${label}.regions[${regionIndex}]`;
      if (!region || typeof region !== 'object' || Array.isArray(region)) {
        errors.push(`${regionLabel}: expected a region object.`);
        return;
      }
      for (const key of ['id', 'title', 'description']) {
        if (!hasText(region[key])) errors.push(`${regionLabel}.${key}: non-empty text is required.`);
      }
      if (hasText(region.id)) {
        if (!urlSlug.test(region.id)) errors.push(`${regionLabel}.id: use a lowercase URL slug.`);
        if (region.id === 'whole') errors.push(`${regionLabel}.id: “whole” is reserved for the entire map.`);
      }
      if (regionIds.has(region.id)) errors.push(`${regionLabel}.id: duplicate section id.`);
      regionIds.add(region.id);
      const bounds = region.bounds;
      if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) {
        errors.push(`${regionLabel}.bounds: provide four finite numbers [x, y, width, height].`);
      } else {
        const [x, y, width, height] = bounds;
        const mapHeight = project.height / project.width;
        if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.002 || y + height > mapHeight + 0.002) {
          errors.push(`${regionLabel}.bounds: section must be inside the map in image-width coordinates.`);
        }
      }
    });
  }
  return { count: data.projects.length, errors };
}

export async function validateArchive({ rootDir = defaultRoot, archivePath = resolve(rootDir, 'data/archive.json') } = {}) {
  let data;
  try { data = JSON.parse(await readFile(archivePath, 'utf8')); }
  catch (error) { return { count: 0, errors: [`Cannot read archive JSON: ${error.message}`] }; }
  return validateArchiveData(data, { rootDir });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateArchive();
  if (result.errors.length) {
    console.error(`Archive validation failed:\n${result.errors.map(error => `- ${error}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`Archive validated: ${result.count} gigamaps, metadata, local assets and registered downloads checked.`);
  }
}
