import { createHash, randomUUID } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { lstat, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { hashFile, readDownloadManifest, resolveDownloadPath, validateManifest } from './download-manifest.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

export async function fetchDownloads({ rootDir = defaultRoot, fetchImpl = globalThis.fetch, log = console.log } = {}) {
  const manifest = await readDownloadManifest(rootDir);
  if (!manifest) { log('No registered release downloads.'); return { downloaded: 0, skipped: 0 }; }
  const catalog = JSON.parse(await readFile(resolve(rootDir, 'data/archive.json'), 'utf8'));
  const errors = validateManifest(manifest, { projects: catalog.projects ?? [] });
  if (errors.length) throw new Error(`Invalid download manifest:\n${errors.join('\n')}`);
  const result = { downloaded: 0, skipped: 0 };
  for (const asset of manifest.assets) {
    const destination = await resolveDownloadPath(rootDir, asset.path, { createDirectory: true });
    try {
      const info = await lstat(destination);
      if (info.size === asset.bytes && await hashFile(destination) === asset.sha256) {
        result.skipped++;
        log(`Verified ${asset.path}`);
        continue;
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }

    const temporary = join(dirname(destination), `.${asset.path.split('/').pop()}.${randomUUID()}.part`);
    try {
      const response = await fetchImpl(asset.url);
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(`Download failed (${response.status}) for ${asset.path}.`);
      }
      let bytes = 0;
      const hash = createHash('sha256');
      const verify = new Transform({
        transform(chunk, encoding, callback) {
          bytes += chunk.length;
          if (bytes > asset.bytes) { callback(new Error(`Download exceeds registered size for ${asset.path}.`)); return; }
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body), verify,
        createWriteStream(temporary, { flags: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), mode: 0o644 }),
      );
      if (bytes !== asset.bytes || hash.digest('hex') !== asset.sha256) {
        throw new Error(`Downloaded size or SHA-256 does not match ${asset.path}.`);
      }
      // Recheck the destination immediately before replacing it. A failed
      // transfer leaves any previous local PDF intact and removes its .part.
      await resolveDownloadPath(rootDir, asset.path);
      await rename(temporary, destination);
      result.downloaded++;
      log(`Downloaded and verified ${asset.path}`);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await fetchDownloads();
    console.log(`Downloads ready: ${result.downloaded} fetched, ${result.skipped} already verified.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
