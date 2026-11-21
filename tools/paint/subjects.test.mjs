import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { registryPath, resolveSubject, checkInputs, optionPairs } from './subjects.mjs';

const BASE = path.resolve('/reg');
const record = () => ({
  id: 'dune', name: 'dune-dog', use: 'development',
  source: { path: 'src/dune.png', px: [1500, 1000], sha256: 'aa' },
  sheet: { widthMm: 390, cellsAcross: { full: 1500 } },
  inputs: {
    drawingVectors: { stem: 'vec/dune', fittedSheetMm: 390, files: [{ path: 'vec/dune-lines.json', sha256: 'l1' }, { path: 'vec/dune-vectors.json', sha256: 'v1' }] },
    studies: [{ path: 'st/a.png', sha256: 's1', kind: 'block-in study s3', minArea: 6 }, { path: 'st/b.png', sha256: 's2', minArea: 4 }, { path: 'st/c.png', sha256: 's3', minArea: 2 }],
  },
  labels: { path: 'labels/dune.json', sha256: 'lab', count: 5 },
  options: { common: ['--recipe', 'default', '--gpu', 'on'], line: ['--outlinemedium', 'graphite'], paper: [] },
});
const registry = () => ({ file: path.join(BASE, 'SUBJECTS.json'), base: BASE, subjects: [record()] });
const disk = hashes => ({ exists: f => f in hashes, hash: f => hashes[f], readJson: f => hashes[f + ':json'] });
const good = () => Object.fromEntries([['src/dune.png', 'aa'], ['vec/dune-lines.json', 'l1'], ['vec/dune-vectors.json', 'v1'], ['st/a.png', 's1'], ['st/b.png', 's2'], ['st/c.png', 's3'], ['labels/dune.json', 'lab']].map(([f, h]) => [path.join(BASE, f), h]));

test('the subject list is found from the environment, else under the home folder', () => {
  assert.equal(registryPath({ UNPAINT_SUBJECTS: '/x/S.json' }), path.resolve('/x/S.json'));
  assert.match(registryPath({}), /Scratch[\\/]unpainting-033[\\/]SUBJECTS\.json$/);
});

test('a record becomes the run inputs, with roles and floors, and nothing differs', () => {
  const s = resolveSubject(registry(), 'dune');
  assert.deepEqual(s.sheet, { widthMm: 390, cells: 1500, rows: 1000, heightMm: 260, cellMm: 0.26 });
  assert.equal(s.drawing.abs, path.join(BASE, 'vec/dune'));
  assert.deepEqual(s.studies.map(x => x.floorMm2), [6, 4, 2]);
  assert.match(s.studies[0].role, /block-in/); assert.match(s.studies[2].role, /fine/);
  assert.deepEqual(s.options, [['recipe', 'default'], ['gpu', 'on'], ['outlinemedium', 'graphite']]);
  assert.deepEqual(s.deviations, []);
  assert.equal(resolveSubject(registry(), 'dune-dog').id, 'dune', 'the plain name finds it too');
  assert.throws(() => resolveSubject(registry(), 'nope'), /no subject "nope".*Subjects: dune/);
});

test('--set values are laid over the record and each difference is listed', () => {
  const s = resolveSubject(registry(), 'dune', { sets: [['drawing', 'vec/old'], ['width', '1200'], ['sheetmm', '280'], ['floors', '8,4,1'], ['study2.clusters', '20'], ['threads', '2']] });
  assert.equal(s.sheet.cells, 1200); assert.equal(s.sheet.widthMm, 280); assert.equal(s.sheet.cellMm, 0.2333);
  assert.deepEqual(s.drawing.files.map(f => f.sha256), [null, null], 'another drawing is not pinned by the record');
  assert.deepEqual(s.studies[1].read, { clusters: 20 });
  assert.deepEqual(s.deviations.map(d => d.what), ['cells across', 'sheet width (mm)', 'opening drawing', 'study 1 floor (mm2)', 'study 3 floor (mm2)', 'study 2 clusters']);
  assert.deepEqual(s.otherSets, [['threads', '2']]);
  assert.throws(() => resolveSubject(registry(), 'dune', { sets: [['floors', '1,2']] }), /3 numbers/);
  assert.throws(() => resolveSubject(registry(), 'dune', { sets: [['study4.join', '3']] }), /has 3 studies/);
});

test('a variant is a named list of settings; this run\'s own settings win', () => {
  const s = resolveSubject(registry(), 'dune', { variant: { why: 'the old sheet', set: { width: '1200', sheetmm: '280' } }, variantName: 'old', sets: [['width', '1000']] });
  assert.equal(s.sheet.cells, 1000); assert.equal(s.sheet.widthMm, 280); assert.equal(s.variant, 'old');
});

test('every pinned input is checked; a missing file and a changed file both stop the run', () => {
  const ok = checkInputs(resolveSubject(registry(), 'dune'), disk(good()));
  assert.equal(ok.masks, null, 'no receipt beside the source: no named forms');
  const bad = good(); bad[path.join(BASE, 'st/b.png')] = 'zz'; delete bad[path.join(BASE, 'vec/dune-lines.json')];
  assert.throws(() => checkInputs(resolveSubject(registry(), 'dune'), disk(bad)), e => /missing drawing file/.test(e.message) && /study 2 changed/.test(e.message));
  const other = { ...good(), [path.join(BASE, 'vec/old-lines.json')]: 'o1', [path.join(BASE, 'vec/old-vectors.json')]: 'o2' };
  const s = checkInputs(resolveSubject(registry(), 'dune', { sets: [['drawing', 'vec/old']] }), disk(other));
  assert.deepEqual(s.drawing.files.map(f => f.unpinnedSha256), ['o1', 'o2']);
});

test('named forms come from a receipt beside the source or --set masks, and are bound to the source', () => {
  const receipt = path.join(BASE, 'src/dune.png.named-sam.json'), mask = path.join(BASE, 'src/named-sam.png');
  const doc = { schema: 'named-sam-v1', source: { sha256: 'aa' }, labels: { sha256: 'lab' }, mask: { path: 'named-sam.png', sha256: 'mm' }, forms: [{ id: 1, name: 'sky', kind: 'sky' }, { id: 2, name: 'dog face', kind: 'face' }] };
  const files = { ...good(), [receipt]: 'r', [receipt + ':json']: doc, [mask]: 'mm' };
  const s = checkInputs(resolveSubject(registry(), 'dune'), disk(files));
  assert.deepEqual(s.masks.forms.map(f => f.name), ['sky', 'dog face']); assert.equal(s.masks.labelsMatch, true);
  assert.throws(() => checkInputs(resolveSubject(registry(), 'dune'), disk({ ...files, [mask]: 'changed' })), /mask changed/);
  assert.throws(() => checkInputs(resolveSubject(registry(), 'dune'), disk({ ...files, [receipt + ':json']: { ...doc, source: { sha256: 'bb' } } })), /another source/);
  assert.throws(() => checkInputs(resolveSubject(registry(), 'dune', { sets: [['masks', '/nowhere/receipt.json']] }), disk(good())), /missing named-forms receipt/);
});

test('record options must be pairs', () => {
  assert.throws(() => optionPairs(['--a', '1', 'b']), /pairs/);
});
