// The drawing harness inside `npm test`: the whole matrix of small CPU paintings (harness.mjs), every cell to pass, and a
// named test for each fault the drawing has had. About a minute on a laptop, five on a busy one (limit: 15 minutes).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runHarness, resultsMarkdown, cells } from './harness.mjs';

let dir, H;
const cell = id => { const r = H.results.find(q => q.cell.id === id); assert.ok(r, `no cell ${id}`); return r; };
const check = (id, name) => { const c = cell(id).checks.find(k => k.check.startsWith(name)); assert.ok(c, `${id}: no check "${name}"`); return c; };
const laid = (id, closing = false) => { const f = path.join(cell(id).out, closing ? 'drawing-laid-closing.json' : 'drawing-laid.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };

before(async () => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-harness-')); H = await runHarness(dir); }, { timeout: 900000 });
after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test('every cell of the matrix passes, and every cell that does not exist says why', () => {
  assert.equal(H.results.length, cells().length);
  const failed = H.results.filter(r => r.status === 'fail');
  assert.equal(failed.length, 0, resultsMarkdown(failed));
  for (const r of H.results.filter(r => r.status === 'n/a')) assert.ok(r.why.length > 10, r.cell.id);
});

test('erasing, pencil against ink, and a model\'s medium against the drawing\'s pass', () => {
  for (const e of H.extra) assert.equal(e.status, 'pass', `${e.what}: ${JSON.stringify(e.checks)}`);
});

test('regression: finals painted with the full drawing instead of the model\'s lines', () => {
  for (const size of ['look', 'full']) {
    const r = laid(`pencil/before/lines/${size}`);
    assert.deepEqual(r.laidIds, [1, 2, 3, 5], 'the model\'s lines: its hatching line 3 kept, 4 left as Auto leaves it');
    assert.equal(r.chosen, 'lines edit');
  }
  assert.ok(check('pencil/before/lines/look', 'look and final lay the same lines').ok);
});

test('regression: Kasha\'s rewetting ink (soluble ink under the first washes stays within its limit, or the run stops loudly)', () => {
  for (const id of ['soluble/before/auto/full', 'soluble/before/lines/full', 'soluble/before/own/full']) {
    const c = cell(id).checks.find(k => k.check.startsWith('soluble ink moves within its limit') || k.check === 'the painting finished');
    assert.ok(c?.ok, `${id}: ${c?.detail}`);
  }
  assert.ok(check('waterproof/before/auto/full', 'waterproof ink moves none').ok);
});

test('regression: dropped strokes laid anyway on a pencil lay-in (and a pen drawing keeps them)', () => {
  assert.deepEqual(laid('pencil/before/auto/full').laidIds, [1, 2, 5], 'hatching 3 and 4 are left for the washes');
  assert.match(laid('pencil/before/auto/full').rule, /pencil lay-in/);
  assert.deepEqual(laid('waterproof/before/auto/full').laidIds, [1, 2, 3, 4, 5], 'on a pen drawing they carry the modelling');
  assert.ok(check('pencil/before/auto/full', 'lines not chosen do not show').ok);
});

test('regression: the drawing appearing in one frame', () => {
  for (const id of ['pencil/before/auto/full', 'waterproof/before/auto/full', 'pencil/before/lines/full']) {
    assert.ok(check(id, 'the film shows the drawing drawn over several frames').ok, id);
    assert.ok(check(id, 'the film lays the big forms first').ok, id);
  }
});

test('regression: the medium following the source against a model\'s choice', () => {
  // a pen chosen on a pencil drawing of a subject whose source shows no pen line is laid in ink, and the other way round
  for (const id of ['waterproof/before/lines/full', 'soluble/after/own/full']) assert.ok(check(id, 'the medium on the sheet is the one chosen').ok, id);
  assert.equal(H.extra.find(e => e.id === 'medium-cross').status, 'pass');
});

test('none means no prepared line on the sheet', () => {
  for (const id of ['none/before/auto/full', 'none/before/lines/full']) { const r = laid(id); assert.ok(r == null || r.laid === 0, id); }
});
