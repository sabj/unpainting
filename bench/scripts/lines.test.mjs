// Drawn lines: where a plan's lines come from and what the try record says about them. Tracing lines from the
// target is allowed; this is reporting only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { V2, ROUNDS } from './lib.mjs';
import { lineSources, copyRecord } from './pipeline/copy.mjs';
import { resolvePlan } from './pipeline/plan-args.mjs';
import { renderTask, loadSubjects } from './pipeline/round45.mjs';

const drawn = { points: [[10, 10], [60, 12], [110, 9]], width: 1, weight: 1 };
const traced = { points: [[0.5, 8.5], [2.5, 8.5]], object: 'target-hard-line', selection: { method: 'traced target thin dark line, darker than both sides by 0.12' } };
const supported = { points: [[0.5, 8.5], [2.5, 8.5]], object: 'arch', selection: { method: 'target hard-dark-line support, broken where support lapses' } };

test('lines a tracer made are counted as traced; lines the model wrote are not', () => {
  const s = lineSources({ 'opening-lines.json': { lines: [drawn, traced, traced] }, 'closing-lines.json': { lines: [supported, drawn] } });
  assert.deepEqual(s.files, { 'opening-lines.json': { lines: 3, traced: 2 }, 'closing-lines.json': { lines: 2, traced: 1 } });
  assert.equal(s.lines, 5);
  assert.equal(s.traced, 3);
  assert.equal(s.painterOwnDrawing, false);
});

test('a file the tracer stamped as a whole counts every unstamped line in it as traced', () => {
  const s = lineSources({ 'opening-lines.json': { registration: 'traced from the target crop itself', lines: [{ points: [[1, 1], [2, 2]] }, drawn] } });
  assert.equal(s.traced, 2);
});

test('a drawing left to the painter is the painter tracing the target, and is recorded', () => {
  assert.equal(lineSources({}, { painterOwnDrawing: true }).painterOwnDrawing, true);
});

const planDir = files => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-'));
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify({ subject: 'x', name: 'x', styleSelection: { style: 'ink-and-wash', reason: 'r' }, families: [], reserves: [] }));
  for (const [f, v] of Object.entries(files)) fs.writeFileSync(path.join(d, f), JSON.stringify(v));
  return d;
};
const hills = () => ({ spec: loadSubjects().hills, target: path.join(V2, 'targets', 'hills.png') });
const image = t => { const b = fs.readFileSync(t); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

test('the check reports the line sources of a plan', () => {
  const { spec, target } = hills();
  const d = planDir({ 'opening-lines.json': { image: image(target), lines: [drawn, traced] } });
  const p = resolvePlan({ spec, planDir: d, variant: 'region_w13', target, out: path.join(d, 'out'), compile: true });
  assert.deepEqual(p.problems, []);
  assert.deepEqual(p.layering.lines, { files: { 'opening-lines.json': { lines: 2, traced: 1 } }, lines: 2, traced: 1, painterOwnDrawing: false });
  const none = planDir({});
  const q = resolvePlan({ spec, planDir: none, variant: 'region_w13', target, out: path.join(none, 'out'), compile: true });
  assert.equal(q.layering.lines.painterOwnDrawing, true, 'no drawing file: the painter reads the lines off the target');
  fs.writeFileSync(path.join(none, 'extra-args.json'), JSON.stringify(['--drawing', 'none']));
  assert.equal(resolvePlan({ spec, planDir: none, variant: 'region_w13', target, out: path.join(none, 'out'), compile: true }).layering.lines.painterOwnDrawing, false);
  for (const x of [d, none]) fs.rmSync(x, { recursive: true, force: true });
});

test('the copy record: the painter\'s own measure and the line sources, nothing hidden when the number is missing', () => {
  const lines = { files: {}, lines: 12, traced: 9, painterOwnDrawing: false };
  assert.deepEqual(copyRecord({ hfCorr: 0.737, hfCeiling: 0.645 }, lines), { hfCorr: 0.737, ceiling: 0.645, over: true, margin: -0.092, lines: 12, tracedLines: 9, painterOwnDrawing: false });
  assert.equal(copyRecord({ hfCorr: 0.645, hfCeiling: 0.645 }, lines).over, false, 'at the ceiling is not over it');
  const missing = copyRecord({ error: 'no frames' }, lines);
  assert.equal(missing.over, null);
  assert.match(missing.error, /no frames/);
  assert.match(copyRecord(null, lines).error, /no cheat-risk record/);
});

test('tracing is allowed and is not discouraged: the brief offers the tracers and says nothing of a copy ceiling', () => {
  const subjects = loadSubjects();
  for (const round of ROUNDS.filter(r => ['V4', 'V5'].includes(r.id))) for (const crop of Object.keys(subjects)) {
    const t = renderTask({ round, n: 1, tries: 2, spec: subjects[crop] });
    assert.match(t, /trace-ink\.mjs/, crop);
    assert.doesNotMatch(t, /copy ceiling|hfCorr|do not trace|Draw the lines yourself/i, crop);
  }
});
