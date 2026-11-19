// mediumForRun: the plan and the source decide the medium before the recipe expands the command line.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mediumForRun } from './medium-run.mjs';
import { expandRecipe } from './recipe.mjs';

const flags = argv => { const m = new Map(); for (let i = 0; i < argv.length;) { const k = argv[i++]; m.set(k, i < argv.length && !argv[i].startsWith('--') ? argv[i++] : undefined); } return m; };
const withDir = fn => async () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medium-run-')); try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
const plan = (dir, doc) => { const f = path.join(dir, 'config.json'); fs.writeFileSync(f, JSON.stringify(doc)); return f; };
const never = async () => { throw new Error('the pen share must not be measured'); };

test('a plan that names an ink style asks for ink and the source is not measured', withDir(async dir => {
  const f = plan(dir, { styleSelection: { style: 'ink-and-wash', reason: 'r', regions: {} } });
  const r = await mediumForRun({ argv: ['--valueplan', f, '--image', 'x.png'], root: dir, penShareOf: never });
  assert.deepEqual(r.argv.slice(-2), ['--outlinemedium', 'ink']);
  assert.equal(r.decision.basis, 'plan');
  assert.equal(r.decision.evidence.penSharePct, null);
}));

test('no plan and no ink request: a graphite subject, the source is not measured, and no ink option can reach the washes', withDir(async dir => {
  const argv = ['--recipe', 'none', '--image', 'x.png', '--outlinemedium', 'graphite', '--washinkfree', '1', '--drawing', 'both', '--drawinglast', 'c'];
  const r = await mediumForRun({ argv, root: dir, penShareOf: never });
  assert.deepEqual([r.decision.medium, r.decision.basis, r.decision.vetoed], ['pencil', 'default', false]);
  const f = flags(expandRecipe({ argv: r.argv, root: dir }).argv);
  assert.equal(f.get('--outlinemedium'), 'graphite');
  for (const k of ['--washinkfree', '--drawinglast']) assert.ok(!f.has(k), k);
  assert.equal(f.get('--drawing'), 'first');
}));

test('a plain graphite run with no ink option is not changed beyond the subject medium', withDir(async dir => {
  const r = await mediumForRun({ argv: ['--image', 'x.png'], root: dir, penShareOf: never });
  assert.deepEqual(r.argv, ['--image', 'x.png', '--subjectmedium', 'pencil']);
}));

test('an ink request on a source with little pen line becomes the graphite drawing, with no ink-only option left', withDir(async dir => {
  const argv = ['--recipe', 'none', '--image', 'x.png', '--outlinemedium', 'ink', '--drawing', 'both', '--drawingfile', 'o', '--drawinglast', 'c', '--washinkfree', '1', '--inkrecipe', 'wash'];
  const r = await mediumForRun({ argv, root: dir, penShareOf: async () => 0.0031 });
  assert.equal(r.decision.vetoed, true);
  assert.equal(r.decision.evidence.penSharePct, 0.31);
  const f = flags(expandRecipe({ argv: r.argv, root: dir }).argv);
  assert.equal(f.get('--outlinemedium'), 'graphite');
  assert.equal(f.get('--drawing'), 'first');
  assert.equal(f.get('--drawingfile'), 'o');
  for (const k of ['--drawinglast', '--washinkfree', '--inkrecipe']) assert.ok(!f.has(k), k);
}));

test('the same request on a source with pen line is left as it is', withDir(async dir => {
  const argv = ['--image', 'x.png', '--inkrecipe', 'wash', '--washinkfree', '1'];
  const r = await mediumForRun({ argv, root: dir, penShareOf: async () => 0.008 });
  assert.deepEqual(r.argv, argv);
  assert.deepEqual([r.decision.medium, r.decision.vetoed], ['pen', false]);
}));

test('a plan that declares no drawing keeps no drawing when ink is asked for', withDir(async dir => {
  const f = plan(dir, { drawing: { medium: 'none' } });
  const r = await mediumForRun({ argv: ['--recipe', 'none', '--valueplan', f, '--image', 'x.png', '--outlinemedium', 'ink'], root: dir, penShareOf: never });
  const e = flags(expandRecipe({ argv: r.argv, root: dir }).argv);
  assert.equal(e.get('--drawing'), 'none');
}));

test('an ink request with no image and no plan fails loudly', withDir(async dir => {
  await assert.rejects(mediumForRun({ argv: ['--inkrecipe', 'wash'], root: dir, penShareOf: never }), /needs --image/);
}));

test('an area plan that declares ink is the plan\'s word: the harness flag repeating it is not vetoed by the pen share', withDir(async dir => {
  const f = path.join(dir, 'area-plan.run.json');
  fs.writeFileSync(f, JSON.stringify({ drawing: { medium: 'ink', reason: 'pen sketch' }, paints: ['sepia'], areas: [] }));
  const argv = ['--recipe', 'none', '--image', 'x.png', '--outlinemedium', 'ink', '--drawing', 'both', '--drawingfile', 'o', '--drawinglast', 'c', '--areaplan', f];
  const r = await mediumForRun({ argv, root: dir, penShareOf: never });
  assert.deepEqual([r.decision.medium, r.decision.basis, r.decision.vetoed], ['pen', 'plan', false]);
  assert.equal(r.decision.evidence.planDeclared, 'ink (drawing.medium)');
  assert.deepEqual(r.argv, argv, 'nothing is added or removed');
}));

test('an area plan that declares graphite removes an ink flag, and one with no drawing section leaves the source to decide', withDir(async dir => {
  const f = path.join(dir, 'area-plan.run.json'), argv = ['--recipe', 'none', '--image', 'x.png', '--outlinemedium', 'ink', '--areaplan', f];
  fs.writeFileSync(f, JSON.stringify({ drawing: { medium: 'graphite', reason: 'pencil' }, areas: [] }));
  const graphite = await mediumForRun({ argv, root: dir, penShareOf: never });
  assert.deepEqual([graphite.decision.medium, graphite.decision.basis, graphite.decision.vetoed], ['pencil', 'plan', true]);
  fs.writeFileSync(f, JSON.stringify({ areas: [] }));
  const bare = await mediumForRun({ argv, root: dir, penShareOf: async () => 0.0009 });
  assert.deepEqual([bare.decision.medium, bare.decision.basis, bare.decision.vetoed], ['pencil', 'source', true]);
  // a value plan beside it keeps the first word
  const v = plan(dir, { drawing: { medium: 'none' } });
  fs.writeFileSync(f, JSON.stringify({ drawing: { medium: 'ink' }, areas: [] }));
  assert.equal((await mediumForRun({ argv: [...argv, '--valueplan', v], root: dir, penShareOf: never })).decision.evidence.planDeclared, 'none (drawing.medium)');
}));
