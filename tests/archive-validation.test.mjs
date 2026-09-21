import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateArchive, validateArchiveData } from '../scripts/validate-archive.mjs';

let temporary, root;
const pdf = '%PDF-1.7\nfixture\n%%EOF';
const dzi = (width, height) => `<?xml version="1.0" encoding="UTF-8"?>\n<Image xmlns="http://schemas.microsoft.com/deepzoom/2008" Format="webp" Overlap="1" TileSize="512"><Size Width="${width}" Height="${height}" /></Image>`;
const fixture = () => ({
  id: 'sample-map', title: 'Sample map', batch: 2026,
  summary: 'A description of a sample map.', description: 'The longer context for the map.',
  imageAlt: 'A sample image used only by validation tests.',
  domains: ['Environment'], topics: ['Water'], tags: ['Water'], methods: ['Interviews'],
  contributors: ['Sample contributor'], width: 1000, height: 500,
  overview: '/overview.webp', tileSource: '/map.dzi', download: '/map.pdf',
  downloadBytes: Buffer.byteLength(pdf),
  regions: [{ id: 'context', title: 'Context', description: 'Map context.', bounds: [0, 0, 0.4, 0.5] }],
});

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'giga-validation-'));
  root = join(temporary, 'dist');
  await mkdir(root);
  await Promise.all([
    writeFile(join(root, 'overview.webp'), 'image fixture'),
    writeFile(join(root, 'map.dzi'), dzi(1000, 500)),
    writeFile(join(root, 'portrait.dzi'), dzi(500, 1500)),
    writeFile(join(root, 'map.pdf'), pdf),
    writeFile(join(temporary, 'outside.pdf'), pdf),
  ]);
  await symlink(join(temporary, 'outside.pdf'), join(root, 'symlink.pdf'));
});
after(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); });
const validate = projects => validateArchiveData({ projects }, { rootDir: root });

test('current archive validates with all real assets and PDF sizes', async () => {
  const result = await validateArchive();
  assert.ok(result.count > 0);
  assert.deepEqual(result.errors, []);
});

test('the new-map template follows the contract after its asset placeholders are replaced', async () => {
  const template = JSON.parse(await readFile(new URL('../templates/gigamap.json', import.meta.url), 'utf8'));
  const assetValues = fixture();
  for (const key of ['overview', 'tileSource', 'download', 'downloadBytes', 'width', 'height']) template[key] = assetValues[key];
  assert.deepEqual((await validate([template])).errors, []);
  assert.equal(template.contributors, undefined);
  assert.deepEqual(template.regions, []);
});

test('valid metadata and optional guide lists pass; duplicate ids are rejected', async () => {
  assert.deepEqual((await validate([fixture()])).errors, []);
  const duplicate = await validate([fixture(), fixture()]);
  assert.ok(duplicate.errors.some(error => error.includes('duplicate project id')));
});

test('unknown optional metadata can be omitted or empty without inventing methods or credits', async () => {
  const withoutOptional = fixture();
  for (const key of ['methods', 'contributors', 'guides']) delete withoutOptional[key];
  withoutOptional.regions = [];
  assert.deepEqual((await validate([withoutOptional])).errors, []);
  const emptyOptional = { ...withoutOptional, methods: [], contributors: [], guides: [], teamSize: 3 };
  assert.deepEqual((await validate([emptyOptional])).errors, []);
  for (const key of ['domains', 'topics', 'tags']) {
    assert.ok((await validate([{ ...withoutOptional, [key]: [] }])).errors.some(error => error.includes(`.${key}:`)), key);
  }
});

test('team size agrees with supplied credits and duplicate labels or names are rejected', async () => {
  assert.deepEqual((await validate([{ ...fixture(), teamSize: 1 }])).errors, []);
  assert.ok((await validate([{ ...fixture(), teamSize: 2 }])).errors.some(error => error.includes('.teamSize: expected 1')));
  for (const key of ['domains', 'topics', 'tags', 'methods', 'contributors', 'guides']) {
    const { errors } = await validate([{ ...fixture(), [key]: ['Repeated entry', ' Repeated entry '] }]);
    assert.ok(errors.some(error => error.includes(`.${key}: remove duplicate`)), key);
  }
});

test('DZI dimensions must match metadata in both landscape and portrait orientation', async () => {
  const portrait = {
    ...fixture(), tileSource: '/portrait.dzi', width: 500, height: 1500,
    regions: [{ id: 'lower-section', title: 'Lower section', description: 'A region in the lower portrait map.', bounds: [0, 2, 1, 1] }],
  };
  assert.deepEqual((await validate([portrait])).errors, []);
  const wrongLandscape = await validate([{ ...fixture(), width: 1200 }]);
  assert.ok(wrongLandscape.errors.some(error => error.includes('.width: expected 1000 to match the DZI')));
  const swappedPortrait = await validate([{ ...portrait, width: 1500, height: 500 }]);
  assert.ok(swappedPortrait.errors.some(error => error.includes('.width: expected 500 to match the DZI')));
  assert.ok(swappedPortrait.errors.some(error => error.includes('.height: expected 1500 to match the DZI')));
  const outsidePortrait = await validate([{ ...portrait, regions: [{ ...portrait.regions[0], bounds: [0, 2.1, 1, 1] }] }]);
  assert.ok(outsidePortrait.errors.some(error => error.includes('section must be inside the map')));
});

test('malformed or incomplete DZI manifests fail before a broken viewer reaches the archive', async () => {
  const invalid = [
    '<Image/>',
    '<Image><Size Width="1000" /></Image>',
    '<Image><Size Width="1000" Height="0" /></Image>',
    '<Image><Size Width="1000" Height="500" />',
    '<Image><Size Width="1000" Height="500" Height="501" /></Image>',
    '<Image><Size Width="1000" Height="500px" /></Image>',
    '<Image><Size Width="1000" Height="500" garbage /></Image>',
  ];
  for (const [index, xml] of invalid.entries()) {
    const filename = `invalid-${index}.dzi`;
    await writeFile(join(root, filename), xml);
    const { errors } = await validate([{ ...fixture(), tileSource: `/${filename}` }]);
    assert.ok(errors.some(error => error.includes('.tileSource: expected a valid single-image DZI')), xml);
  }
  await writeFile(join(root, 'alternate.dzi'), "<Image Format='webp' TileSize='512' Overlap='1'><Size Height='500' Width='1000'></Size></Image>");
  assert.deepEqual((await validate([{ ...fixture(), tileSource: '/alternate.dzi' }])).errors, []);
});

test('missing required text, malformed arrays, invalid dimensions and wrong PDF size are reported together', async () => {
  const project = fixture();
  Object.assign(project, { title: ' ', topics: 'Water', contributors: [''], width: 0, height: -5, downloadBytes: 7, batch: '2026' });
  const { errors } = await validate([project]);
  for (const key of ['title', 'topics', 'contributors', 'width', 'height', 'downloadBytes', 'batch']) {
    assert.ok(errors.some(error => error.includes(`.${key}:`)), key);
  }
});

test('generic descriptors cannot return through tags, filters or the discipline field', async () => {
  for (const [key, value] of [
    ['discipline', 'Systems design'], ['tags', ['systems thinking']],
    ['methods', ['Systems Design']], ['domains', ['SYSTEMS THINKING']], ['topics', ['Systems   design']],
    ['methods', ['Systems mapping']], ['tags', ['Systems Mapping']],
  ]) {
    const project = { ...fixture(), [key]: value };
    assert.ok((await validate([project])).errors.some(error => error.includes(`.${key}: remove generic`)), key);
  }
});

test('OCR text is optional source content and must be a non-empty string when supplied', async () => {
  assert.deepEqual((await validate([fixture()])).errors, []);
  assert.deepEqual((await validate([{ ...fixture(), ocrText: 'Source discussion of systems design and community commons.' }])).errors, []);
  for (const ocrText of [null, 42, [], {}, '', ' \n ']) {
    const { errors } = await validate([{ ...fixture(), ocrText }]);
    assert.ok(errors.some(error => error.includes('.ocrText:')), JSON.stringify(ocrText));
  }
});

test('asset checks reject missing files, remote paths, traversal and escaping symlinks', async () => {
  for (const value of ['/missing.pdf', 'https://example.com/map.pdf', '/%2e%2e/outside.pdf', '/symlink.pdf', '/map.pdf?x=1']) {
    const project = { ...fixture(), download: value };
    assert.ok((await validate([project])).errors.some(error => error.includes('.download:')), value);
  }
});

test('section navigation cannot contain duplicate ids or out-of-bounds coordinates', async () => {
  const project = fixture();
  project.regions.push({ ...project.regions[0], bounds: [0.9, 0, 0.2, 0.8] });
  const { errors } = await validate([project]);
  assert.ok(errors.some(error => error.includes('duplicate section id')));
  assert.ok(errors.some(error => error.includes('section must be inside the map')));
});

test('section ids use unique URL slugs and cannot override the whole-map viewer action', async () => {
  for (const id of ['whole', 'Bad ID', 'context#part', 'two--parts', 'context/part']) {
    const project = fixture();
    project.regions[0].id = id;
    const { errors } = await validate([project]);
    assert.ok(errors.some(error => error.includes('.regions[0].id:')), id);
  }
});

test('invalid archive structure and unreadable JSON return actionable validation errors', async () => {
  assert.match((await validateArchiveData({ projects: null }, { rootDir: root })).errors[0], /projects array/);
  assert.match((await validateArchive({ rootDir: root, archivePath: join(root, 'missing.json') })).errors[0], /Cannot read archive JSON/);
  assert.match((await validate([null])).errors[0], /project object/);
});
