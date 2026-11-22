import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { registryPath, formsPath, resolveSubject, checkInputs, optionPairs } from './subjects.mjs';

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
  assert.equal(ok.masks.receipt, null, 'no receipt in the folder: no named forms');
  const bad = good(); bad[path.join(BASE, 'st/b.png')] = 'zz'; delete bad[path.join(BASE, 'vec/dune-lines.json')];
  assert.throws(() => checkInputs(resolveSubject(registry(), 'dune'), disk(bad)), e => /missing drawing file/.test(e.message) && /study 2 changed/.test(e.message));
  const other = { ...good(), [path.join(BASE, 'vec/old-lines.json')]: 'o1', [path.join(BASE, 'vec/old-vectors.json')]: 'o2' };
  const s = checkInputs(resolveSubject(registry(), 'dune', { sets: [['drawing', 'vec/old']] }), disk(other));
  assert.deepEqual(s.drawing.files.map(f => f.unpinnedSha256), ['o1', 'o2']);
});

test('named forms: --set masks first, then the named-forms folder, then none; bound to the source', () => {
  const forms = path.resolve('/forms'), receipt = path.join(forms, 'dune', 'receipt.json'), mask = path.join(forms, 'dune', 'named-sam.png');
  const doc = { schema: 'named-sam-v1', source: { sha256: 'aa' }, labels: { path: 'labels.json', sha256: 'lab' }, mask: { path: 'named-sam.png', sha256: 'mm' }, forms: [{ id: 1, name: 'sky', kind: 'sky' }, { id: 2, name: 'dog face', kind: 'face' }] };
  const files = { ...good(), [receipt]: 'r', [receipt + ':json']: doc, [mask]: 'mm', [path.join(forms, 'dune', 'review.jpg')]: 'rv' };
  const get = (sets, disk0) => checkInputs(resolveSubject(registry(), 'dune', { sets, formsDir: forms }), disk(disk0));
  const s = get([], files);
  assert.equal(s.masks.from, 'folder'); assert.deepEqual(s.masks.forms.map(f => f.name), ['sky', 'dog face']);
  assert.equal(s.masks.review, path.join(forms, 'dune', 'review.jpg')); assert.equal(s.masks.labels, path.join(forms, 'dune', 'labels.json'));
  assert.deepEqual(s.deviations, [], 'the folder receipt is the default, not a difference');
  const none = get([], good()); assert.equal(none.masks.receipt, null); assert.match(none.masks.none, /no receipt at/);
  const off = get([['masks', 'none']], files); assert.equal(off.masks.receipt, null); assert.match(off.masks.none, /turned off/); assert.equal(off.deviations[0].what, 'named forms');
  const other = path.resolve('/else/receipt.json'), viaSet = get([['masks', other]], { ...files, [other]: 'r2', [other + ':json']: doc, [path.resolve('/else/named-sam.png')]: 'mm' });
  assert.equal(viaSet.masks.from, 'set'); assert.equal(viaSet.masks.receipt, other);
  assert.throws(() => get([], { ...files, [mask]: 'changed' }), /mask changed/);
  assert.throws(() => get([], { ...files, [receipt + ':json']: { ...doc, source: { sha256: 'bb' } } }), /another source/);
  assert.throws(() => get([['masks', '/nowhere/receipt.json']], good()), /missing named-forms receipt/);
  assert.equal(formsPath({ base: '/reg' }, { UNPAINT_FORMS: '/f' }), path.resolve('/f')); assert.equal(formsPath({ base: '/reg' }, {}), path.resolve('/reg/named-forms'));
});

test('record options must be pairs', () => {
  assert.throws(() => optionPairs(['--a', '1', 'b']), /pairs/);
});

test('a study setting for one named form, and when the drawing is laid, are settings of the run and are said to differ', () => {
  const s = resolveSubject(registry(), 'dune', { sets: [['form3.study1.clusters', '24'], ['form3.study3.lay', '1'], ['form11.study1.floor', '3'], ['drawingorder', 'both'], ['drawinglast', '/run/lines/closing'], ['threads', '2']] });
  assert.deepEqual(s.studies[0].forms, { 3: { clusters: 24 }, 11: { floor: 3 } }); assert.deepEqual(s.studies[2].forms, { 3: { lay: 1 } }); assert.equal(s.studies[1].forms, undefined);
  assert.deepEqual(s.options.find(([k]) => k === 'drawing'), ['drawing', 'both']);
  assert.deepEqual(s.otherSets, [['drawinglast', '/run/lines/closing'], ['threads', '2']], 'the closing drawing is a painter option; the rest is read here');
  assert.ok(s.deviations.some(d => d.what === 'study 1 clusters in named form 3' && d.now === '24')); assert.ok(s.deviations.some(d => d.what === 'when the drawing is laid' && d.now === 'both' && d.record === 'first'));
  assert.equal(resolveSubject(registry(), 'dune').options.some(([k]) => k === 'drawing'), false, 'nothing asked: the record\'s options as they are');
  assert.throws(() => resolveSubject(registry(), 'dune', { sets: [['drawingorder', 'sometimes']] }), /one of first, both, last, none/);
  assert.throws(() => resolveSubject(registry(), 'dune', { sets: [['form3.study9.clusters', '4']] }), /the subject has 3 studies/);
});
