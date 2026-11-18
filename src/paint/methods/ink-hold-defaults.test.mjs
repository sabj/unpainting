// Ink hold defaults: an ink drawing is always held to the target and decided by meaning, whether its lines came from the
// line model or from the plan. The defaults are the pruning half of the wash recipe; a flag on the command line wins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { inkHoldArgs, INK_HOLD_FLAGS, INK_POOL_FLAGS } from './ink-hold-defaults.mjs';
import { holdInkLines } from './ink-lines-file.mjs';
import { INK_RECIPES } from './ink-recipe.mjs';

const flags = a => { const m = new Map(); for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]); return m; };

test('an ink drawing gets the hold and decision flags it does not set', () => {
  const f = flags(inkHoldArgs(['--outlinemedium', 'ink', '--inkjoin', '4']));
  assert.equal(f.get('--inkdecide'), '1');
  assert.equal(f.get('--linesupport'), '5');
  assert.equal(f.get('--inklabeljudge'), 'simple');
  assert.ok(!f.has('--inkjoin'), 'a flag on the command line wins');
  assert.ok(!f.has('--linemodel'), 'no line source named, so no pool flags');
});

test('graphite, no medium, no drawing, a graphite subject and the ink-free options get nothing', () => {
  for (const argv of [['--outlinemedium', 'graphite'], [], ['--outlinemedium', 'none'], ['--outlinemedium', 'ink', '--drawing', 'none'],
    ['--outlinemedium', 'ink', '--subjectmedium', 'pencil'], ['--outlinemedium', 'auto'], ['--outlinemedium', 'ink', '--areaplan', 'plan.json']]) assert.deepEqual(inkHoldArgs(argv), [], JSON.stringify(argv));
});

test('a source-ink line source in ink takes the line model for its pool; auto may choose another source and gets none', () => {
  assert.ok(!flags(inkHoldArgs(['--outlinemedium', 'ink', '--linesource', 'auto'])).has('--linemodel'));
  for (const source of ['source-ink']) {
    const f = flags(inkHoldArgs(['--outlinemedium', 'ink', '--linesource', source]));
    for (const [k, v] of Object.entries(INK_POOL_FLAGS)) assert.equal(f.get('--' + k), v, k);
  }
  assert.deepEqual(INK_POOL_FLAGS, { linemodel: 'strict', copylinesmin: '0' });
  assert.ok(!flags(inkHoldArgs(['--outlinemedium', 'ink', '--linesource', 'photo-sketch'])).has('--linemodel'));
});

test('the defaults are the pruning half of the wash recipe, with the same values', () => {
  for (const [k, v] of Object.entries(INK_HOLD_FLAGS)) assert.equal(INK_RECIPES.wash[k], v, k);
});

test('the wash recipe already sets every flag, so nothing is added twice', () => {
  const recipe = Object.entries(INK_RECIPES.wash).flatMap(([k, v]) => ['--' + k, v]);
  assert.deepEqual(inkHoldArgs(recipe), []);
});

// a plan's authored line files (no inputKind) are held and decided like a model's lines
test('authored lines are held to the target and decided by meaning: a line across a dark mass is left off whole', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hold-authored-'));
  try {
    const W = 160, H = 100, px = Buffer.alloc(W * H * 3, 235);
    const put = (x, y, v) => px.fill(v, 3 * (y * W + x), 3 * (y * W + x) + 3);
    for (let x = 5; x < 150; x++) { put(x, 20, 40); put(x, 21, 40); }            // a pen line on paper
    for (let y = 50; y < 95; y++) for (let x = 20; x < 140; x++) put(x, y, 45);  // a dark mass
    const image = path.join(dir, 'target.png');
    await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(image);
    const line = (y, x0, x1) => ({ points: Array.from({ length: 30 }, (_, k) => [x0 + (x1 - x0) * k / 29, y + 0.5]) });
    const doc = { image: { w: W, h: H }, medium: 'ink', lines: [line(20, 5, 150), line(72, 30, 130)] };
    fs.writeFileSync(path.join(dir, 'opening-lines.json'), JSON.stringify(doc));
    const argv = ['--segments', 'off', ...inkHoldArgs(['--outlinemedium', 'ink'])];
    const read = n => { const i = argv.lastIndexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined; };
    const opt = (n, d) => read(n) ?? d, num = (n, d) => Number(read(n) ?? d);
    argv.push('--drawingfile', path.join(dir, 'opening'));
    const res = await holdInkLines({ opt: (n, d) => (n === 'drawingfile' ? path.join(dir, 'opening') : opt(n, d)), num, argv, image, root: dir, out: dir, sheetMm: 24, log: () => {} });
    assert.ok(res, 'the hold runs for an authored file with no recipe');
    const held = JSON.parse(fs.readFileSync(path.join(dir, 'ink-opening-lines.json'), 'utf8'));
    assert.equal(held.inkDecided, true);
    assert.equal(held.lines.length, 1, 'the pen line stays, the line across the mass goes');
    assert.ok(held.lines[0].points.every(([, y]) => y < 30));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
