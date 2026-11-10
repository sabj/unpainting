// The subject's drawing medium (none, pencil, pen) and what the harness does with an ink plan on a subject with no pen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BENCH, V2, readJson } from './lib.mjs';
import { resolvePlan, optionMap, SUBJECT_MEDIA } from './pipeline/plan-args.mjs';
import { renderTask, loadSubjects } from './pipeline/round45.mjs';
import { addTarget } from './add-target.mjs';

const TARGET = path.join(BENCH, 'v2/targets/hills.png');
const LINES = JSON.stringify({ image: { w: 306, h: 242 }, lines: [{ points: [[10, 10], [60, 40]], width: 1, weight: 1 }], medium: 'ink' });
function plan(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-medium-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), typeof text === 'string' ? text : JSON.stringify(text));
  return dir;
}
const resolve = (dir, medium) => resolvePlan({ spec: { width: 96, sheetmm: 280, taskStyle: 'watercolour', ...(medium ? { medium } : {}) }, planDir: dir, variant: 'region_w13_lay2', target: TARGET, out: '/out' });

test('every subject and every crop names its medium, and the two lists agree', () => {
  const subjects = loadSubjects(), crops = readJson(path.join(V2, 'crops.json')).crops;
  for (const [id, s] of Object.entries(subjects)) assert.ok(SUBJECT_MEDIA.includes(s.medium), `${id}: medium ${s.medium}`);
  for (const c of crops) {
    assert.ok(SUBJECT_MEDIA.includes(c.medium), `${c.task}: medium ${c.medium}`);
    if (subjects[c.task]) assert.equal(c.medium, subjects[c.task].medium, c.task);
  }
  const pen = Object.entries(subjects).filter(([, s]) => s.medium === 'pen').map(([id]) => id).sort();
  assert.deepEqual(pen, ['dog-ink', 'h34a', 'h36a', 'hills', 'south-france']);
  // a subject with no pen is not described in words that read as pen lines
  for (const [id, s] of Object.entries(subjects)) if (s.medium !== 'pen') assert.doesNotMatch(s.taskStyle, /\bfine lines\b|\bpen\b|\bink (and|led)\b/i, id);
});

test('a subject file entry with no medium, or an unknown one, is an error', () => {
  const dir = plan({ 'config.json': {} });
  try {
    assert.throws(() => resolve(dir, 'charcoal'), /medium must be none, pencil or pen/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an ink plan on a subject with no pen is drawn in graphite before the washes, and the override is recorded', () => {
  const dir = plan({ 'config.json': { drawing: { medium: 'ink' } }, 'opening-lines.json': LINES, 'closing-lines.json': LINES,
    'extra-args.json': ['--inkprofile', 'black-ink', '--midlayers', '3'] });
  try {
    for (const medium of ['pencil', 'none']) {
      const r = resolve(dir, medium), o = optionMap(r.args);
      assert.deepEqual(r.problems, []);
      assert.equal(o.get('outlinemedium'), 'graphite');
      assert.equal(o.get('drawing'), 'first');
      assert.ok(o.has('drawingfile') && !o.has('drawinglast'), 'the opening lines stay, the closing pen lines go');
      for (const inkOnly of ['inkprofile', 'washinkfree', 'drawinghand', 'inkdarkskip']) assert.ok(!o.has(inkOnly), inkOnly);
      assert.equal(o.get('midlayers'), '3');
      assert.equal(o.get('subjectmedium'), medium, 'the painter is told, because a plan drawing section outranks every argument');
      assert.ok(!r.extraOptions.includes('inkprofile'), 'a removed ink setting is not held against the plan as unread');
      const m = r.layering.mediumOverride;
      assert.equal(m.subjectMedium, medium);
      assert.equal(m.asked, 'ink');
      assert.equal(m.drawn, 'graphite');
      assert.equal(m.closingDropped, true);
      assert.deepEqual(m.removed, ['--inkprofile black-ink']);
      assert.match(m.reason, /no pen/);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('ink asked for through extra-args, or left to the painter (auto), is overridden the same way', () => {
  for (const asked of ['ink', 'auto']) {
    const dir = plan({ 'config.json': {}, 'opening-lines.json': LINES, 'extra-args.json': ['--outlinemedium', asked, '--drawing', 'both'] });
    try {
      const r = resolve(dir, 'pencil'), o = optionMap(r.args);
      assert.equal(o.get('outlinemedium'), 'graphite');
      assert.equal(o.get('drawing'), 'first');
      assert.equal(r.layering.mediumOverride.asked, asked);
      assert.deepEqual([...new Set(r.args.filter((_, i) => r.args[i - 1] === '--outlinemedium'))], ['graphite'], 'no ink request is left for the painter to read');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('the plan drawing section outranks extra-args, as in the painter: what it asks decides the override', () => {
  const inkOverGraphite = plan({ 'config.json': { drawing: { medium: 'ink' } }, 'extra-args.json': ['--outlinemedium', 'graphite'] });
  const graphiteOverInk = plan({ 'config.json': { drawing: { medium: 'graphite' } }, 'extra-args.json': ['--outlinemedium', 'ink'] });
  const stages = plan({ 'config.json': { drawing: { stages: { prep: {}, finishInk: {} } } } });
  const off = plan({ 'config.json': { drawing: { medium: 'ink' } }, 'extra-args.json': ['--drawing', 'none'] });
  try {
    assert.equal(resolve(inkOverGraphite, 'pencil').layering.mediumOverride.asked, 'ink');
    assert.equal(resolve(graphiteOverInk, 'pencil').layering.mediumOverride, null);
    assert.equal(resolve(stages, 'none').layering.mediumOverride.asked, 'ink');
    const none = resolve(off, 'none');
    assert.equal(none.layering.mediumOverride, null);
    assert.equal(optionMap(none.args).get('drawing'), 'none');
  } finally { for (const d of [inkOverGraphite, graphiteOverInk, stages, off]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('a pen subject keeps its ink plan exactly; a plan may always choose graphite or no drawing', () => {
  const ink = plan({ 'config.json': { drawing: { medium: 'ink' } }, 'opening-lines.json': LINES, 'closing-lines.json': LINES, 'extra-args.json': ['--inkprofile', 'black-ink'] });
  const none = plan({ 'config.json': { drawing: { medium: 'none' } } });
  const pencil = plan({ 'config.json': { drawing: { medium: 'graphite' } }, 'opening-lines.json': LINES, 'closing-lines.json': LINES });
  try {
    const pen = resolve(ink, 'pen'), unset = resolve(ink, null);
    assert.deepEqual(pen.args, unset.args, 'medium pen changes nothing in the painter command');
    assert.equal(optionMap(pen.args).get('outlinemedium'), 'ink');
    assert.equal(optionMap(pen.args).get('drawing'), 'both');
    assert.equal(optionMap(pen.args).get('inkprofile'), 'black-ink');
    assert.equal(pen.layering.mediumOverride, null);
    const told = (args, medium) => (medium === 'pen' ? args : args.filter((a, i) => a !== '--subjectmedium' && args[i - 1] !== '--subjectmedium'));
    for (const medium of ['none', 'pencil', 'pen']) {
      const n = resolve(none, medium);
      assert.equal(n.layering.mediumOverride, null);
      assert.deepEqual(told(n.args, medium), resolve(none, null).args);
      const g = resolve(pencil, medium);
      assert.equal(g.layering.mediumOverride, null);
      assert.deepEqual(told(g.args, medium), resolve(pencil, null).args, 'a graphite plan keeps its drawing as the plan wrote it');
      assert.equal(optionMap(g.args).get('subjectmedium'), medium === 'pen' ? undefined : medium);
    }
  } finally { for (const d of [ink, none, pencil]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('the brief names the subject medium, says when ink is wrong, and gives two contrasting palettes', () => {
  const subjects = loadSubjects(), round = { id: 'V4' };
  const mittens = renderTask({ round, n: 1, tries: 1, spec: subjects.mittens });
  assert.match(mittens, /Drawing medium of the target: \*\*pencil\*\*/);
  assert.match(mittens, /Use ink only when/);
  assert.match(mittens, /most saturated colours/);
  assert.doesNotMatch(mittens, /ochre,sienna,ultramarine,cerulean,sepia/);
  assert.ok([...mittens.matchAll(/"--paints","[a-z,]+"/g)].length >= 2, 'two example palettes');
  assert.doesNotMatch(mittens, /\{[A-Z_]+\}/);
  assert.match(renderTask({ round, n: 1, tries: 1, spec: subjects.h36a }), /Drawing medium of the target: \*\*pen\*\*/);
  assert.match(renderTask({ round, n: 1, tries: 1, spec: subjects.sargent }), /Drawing medium of the target: \*\*none\*\*/);
  assert.throws(() => renderTask({ round, n: 1, tries: 1, spec: { ...subjects.sargent, medium: undefined } }), /medium/);
});

test('a new target must say its medium', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'add-target-medium-'));
  try {
    fs.mkdirSync(path.join(root, 'v2'), { recursive: true }); fs.mkdirSync(path.join(root, 'v4v5'));
    fs.copyFileSync(path.join(V2, 'crops.json'), path.join(root, 'v2', 'crops.json'));
    fs.copyFileSync(path.join(BENCH, 'v4v5', 'subjects.json'), path.join(root, 'v4v5', 'subjects.json'));
    const base = { image: path.join(V2, 'targets', 'sargent.png'), name: 'Harbour', style: 'loose watercolor: boats', source: 'test image', licence: 'public domain', crop: [0, 0, 200, 150], width: 160, root };
    await assert.rejects(addTarget({ ...base, task: 'harbour' }), /--medium/);
    await assert.rejects(addTarget({ ...base, task: 'harbour', medium: 'ink' }), /--medium/);
    const { entry } = await addTarget({ ...base, task: 'harbour', medium: 'none' });
    assert.equal(entry.medium, 'none');
    assert.equal(readJson(path.join(root, 'v4v5', 'subjects.json')).subjects.harbour.medium, 'none');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
