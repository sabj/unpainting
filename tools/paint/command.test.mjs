import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommand, washPlanOf, shellLine, describeRun, runFolder } from './command.mjs';

const spec = (over = {}) => ({
  id: 'dune', name: 'dune-dog', variant: null,
  source: { abs: '/r/src/dune.png' }, sheet: { widthMm: 390, cells: 1500 }, drawing: { abs: '/r/vec/dune' },
  studies: [{ abs: '/r/a.png', floorMm2: 6, read: {} }, { abs: '/r/b.png', floorMm2: 4, read: { clusters: 20, join: 6 } }],
  labels: { abs: '/r/labels.json' }, masks: { receipt: null, none: 'no receipt' }, otherSets: [],
  options: [['recipe', 'default'], ['gpu', 'on'], ['targetguard', 'gentle'], ['marks', '1'], ['outlinemedium', 'ink'], ['inkrecipe', 'wash']],
  ...over,
});
const known = new Set(['threads', 'marks', 'outlinemedium', 'gpu', 'thingmasks']);
const value = (c, name) => c.argv[c.argv.indexOf(`--${name}`) + 1];

test('the wash plan names each study with its floor and its settings', () => {
  assert.equal(washPlanOf(spec().studies), '/r/a.png:6,/r/b.png:4@clusters=20@join=6');
});

test('plan is the CPU plan only; paint is the GPU painting; the rest is the record', () => {
  const plan = buildCommand(spec(), { mode: 'plan', out: '/o', known }), paint = buildCommand(spec(), { mode: 'paint', out: '/o', known });
  assert.equal(value(plan, 'gpu'), 'off'); assert.equal(value(plan, 'valuepreviewonly'), '1');
  assert.equal(value(paint, 'gpu'), 'on'); assert.ok(!paint.argv.includes('--valuepreviewonly'));
  for (const c of [plan, paint]) {
    assert.equal(value(c, 'targetguard'), 'gentle'); assert.equal(value(c, 'image'), '/r/src/dune.png');
    assert.equal(value(c, 'width'), '1500'); assert.equal(value(c, 'sheetmm'), '390'); assert.equal(value(c, 'drawingfile'), '/r/vec/dune');
    assert.deepEqual(c.settings, []); assert.ok(!c.argv.includes('--allowdirty'));
  }
  assert.match(plan.medium, /^ink, ink recipe wash/);
  assert.equal(paint.args[1], 'tools/paint-plate.mjs');
  assert.ok(buildCommand(spec(), { mode: 'plan', out: '/o', known, dirty: true }).argv.join(' ').endsWith('--allowdirty 1'));
});

test('a setting changes one option and is reported with the default it replaces', () => {
  const c = buildCommand(spec({ otherSets: [['threads', '2'], ['marks', '0'], ['outlinemedium', 'default'], ['heapmb', '8192']] }), { mode: 'paint', out: '/o', known });
  assert.equal(value(c, 'threads'), '2'); assert.equal(value(c, 'marks'), '0'); assert.ok(!c.argv.includes('--outlinemedium'));
  assert.equal(c.args[0], '--max-old-space-size=8192');
  assert.deepEqual(c.settings.map(s => [s.name, s.value, s.default]), [['threads', '2', '(painter default)'], ['marks', '0', '1'], ['outlinemedium', null, 'ink'], ['heapmb', '8192', '18432']]);
});

test('what the command owns cannot be set, and gentle mode stays', () => {
  const run = sets => () => buildCommand(spec({ otherSets: sets }), { mode: 'plan', out: '/o', known });
  assert.throws(run([['gpu', 'on']]), /sets this itself/);
  assert.throws(run([['targetguard', 'off']]), /gentle mode stays on/);
  assert.throws(run([['nosuchoption', '1']]), /neither a setting/);
  assert.throws(() => buildCommand(spec({ options: [['targetguard', 'off']] }), { mode: 'plan', out: '/o', known }), /gentle mode only/);
});

test('named forms go to the planner when the painter reads them; an authored script replaces the studies', () => {
  const masks = { receipt: '/m/receipt.json', labels: '/m/labels.json', forms: [] };
  const c = buildCommand(spec({ masks }), { mode: 'plan', out: '/o', known });
  assert.equal(value(c, 'thingmasks'), '/m/receipt.json'); assert.equal(value(c, 'things'), '/m/labels.json'); assert.equal(c.masksRead, true);
  assert.equal(buildCommand(spec({ masks }), { mode: 'plan', out: '/o', known: new Set() }).masksRead, false);
  const s = buildCommand(spec({ masks }), { mode: 'paint', out: '/o', known, script: { file: '/o/author/script.json', paints: ['ochre', 'ultramarine'] } });
  assert.equal(value(s, 'washplan'), 'script:/o/author/script.json'); assert.equal(value(s, 'paints'), 'ochre,ultramarine'); assert.equal(value(s, 'paintsextend'), '0');
  assert.equal(s.masksRead, false, 'the script\'s plan reads no forms'); assert.equal(value(s, 'thingmasks'), '/m/receipt.json', 'its drawing does');
  // an edited plan: the studies are read as always (the forms too), and the edit file goes first in the wash plan
  const e = buildCommand(spec({ masks }), { mode: 'paint', out: '/o', known, edit: { file: '/o/author/plan-edit.json' } });
  assert.equal(value(e, 'washplan'), `edit:/o/author/plan-edit.json,${value(c, 'washplan')}`); assert.equal(e.masksRead, true); assert.equal(value(e, 'paints'), value(c, 'paints'));
});

test('the shell line quotes what needs it and puts the environment first', () => {
  assert.equal(shellLine({ cmd: 'node', args: ['a b', "it's", 'x=1'], env: { K: '/p q' } }), "K='/p q' node 'a b' 'it'\\''s' x=1");
});

test('the block before a run says everything in plain rows', () => {
  const lines = describeRun({
    mode: 'plan', studiesMode: 'locked', out: '/o', command: 'node x',
    subject: { id: 'dune', name: 'dune-dog', variant: 'old', variantWhy: 'the old sheet', source: 'src/dune.png', sourcePx: [1500, 1000], labels: 'labels/dune.json', labelCount: 5, deviations: [{ what: 'cells across', now: '1200', record: '1500' }] },
    sheet: { widthMm: 280, heightMm: 186.7, cells: 1200, rows: 800, cellMm: 0.2333 },
    drawing: { stem: 'vec/old', medium: 'ink', pinned: false },
    studies: [{ path: 'st/a.png', role: 'block-in', floorMm2: 6, read: { clusters: 20 } }],
    masks: { receipt: null, none: 'no receipt at /f/dune/receipt.json' }, author: { key: 'auto' }, settings: [{ name: 'threads', value: '2', default: '(painter default)' }], switches: { X_NO_CHARGES: '1' },
    code: { commit: 'db0bb9df1992', dirty: true, tracked: ['a'], untracked: [] },
  }).join('\n');
  for (const want of [/subject: +dune \(dune-dog\), variant "old"/, /sheet: +280 x 186.7 mm, 1200 x 800 cells, 0.2333 mm a cell/, /drawing: +vec\/old, ink \(not the record's drawing; unpinned\)/,
    /study 1: +st\/a.png, block-in, shapes from 6 mm2, clusters 20/, /masks: +none/, /author: +the code planner alone \(the control\)/, /mode: +plan only, CPU; locked inputs; target guard gentle/,
    /DIFFERS: +cells across: 1200 \(the record: 1500\)/, /setting: +threads = 2/, /SWITCH: +X_NO_CHARGES=1/, /commit: +db0bb9df plus uncommitted changes/, /command: +node x/]) assert.match(lines, want);
});

test('run folders are safe names', () => {
  assert.equal(runFolder({ id: 'h36', variant: 'approved' }, 'Opus 5.5'), 'h36-approved--Opus_5.5');
});

test('a study setting for one named form goes into the wash plan after the study\'s own: @name#FORM=value', () => {
  const s = spec({ studies: [{ abs: '/r/a.png', floorMm2: 6, read: { clusters: 20 }, forms: { 3: { clusters: 24, floor: 3 }, 11: { formbase: 0 } } }, { abs: '/r/b.png', floorMm2: 4, read: {}, forms: { 3: { lay: 1 } } }, { abs: '/r/c.png', floorMm2: 2, read: {} }] });
  assert.equal(washPlanOf(s.studies), '/r/a.png:6@clusters=20@clusters#3=24@floor#3=3@formbase#11=0,/r/b.png:4@lay#3=1,/r/c.png:2');
});

test('the pen\'s ink is chosen by name: waterproof sets it before the washes, soluble lets it rewet, anything else is refused', () => {
  const ink = v => buildCommand(spec({ otherSets: [['ink', v]] }), { mode: 'paint', out: '/o', known });
  assert.equal(value(ink('waterproof'), 'inkfast'), '1');
  assert.equal(value(ink('soluble'), 'inkfast'), '0');
  assert.ok(!ink('default').argv.includes('--inkfast'));
  assert.ok(!ink('waterproof').argv.includes('--ink'));
  assert.throws(() => ink('indian'), /--set ink: waterproof, soluble, default/);
});
