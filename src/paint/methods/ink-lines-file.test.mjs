import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { holdInkLines, inkLineFlags } from './ink-lines-file.mjs';
import { inkRecipeArgs, INK_RECIPES } from './ink-recipe.mjs';

const flags = argv => { const opt = (n, d) => { const i = argv.lastIndexOf('--' + n); return i >= 0 ? argv[i + 1] : d; }; return { argv, opt, num: (n, d) => Number(opt(n, d)) }; };

// a 60 x 40 white target with one dark line along row 10
async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-lines-')), w = 60, h = 40, px = Buffer.alloc(w * h * 3, 235);
  for (let x = 0; x < w; x++) px.fill(60, 3 * (10 * w + x), 3 * (10 * w + x) + 3);
  await sharp(px, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path.join(dir, 'target.png'));
  const line = y => ({ points: Array.from({ length: 11 }, (_, k) => [5 + 5 * k, y]), weight: 0.8 });
  fs.writeFileSync(path.join(dir, 'open-lines.json'), JSON.stringify({ image: { w, h }, lines: [line(10.5), line(30.5)] }));
  fs.writeFileSync(path.join(dir, 'close-lines.json'), JSON.stringify({ image: { w, h }, lines: [line(30.5)] }));
  return dir;
}

test('the files are cut to the target lines, written beside the painting and handed to the pens', async () => {
  const dir = await setup(), f = flags(['--drawingfile', path.join(dir, 'open'), '--drawinglast', path.join(dir, 'close'), '--linesupport', '6', '--linesmooth', '0.5']);
  const r = await holdInkLines({ ...f, image: path.join(dir, 'target.png'), root: dir, out: dir, sheetMm: 120 });
  assert.equal(f.opt('drawingfile'), path.join(dir, 'ink-opening'));
  assert.equal(f.opt('drawinglast'), path.join(dir, 'ink-closing'));
  const open = JSON.parse(fs.readFileSync(path.join(dir, 'ink-opening-lines.json'), 'utf8'));
  assert.equal(open.lines.length, 1);
  assert.ok(open.lines[0].points.every(([, y]) => Math.abs(y - 10.5) < 0.6));
  const close = JSON.parse(fs.readFileSync(path.join(dir, 'ink-closing-lines.json'), 'utf8'));
  assert.equal(close.lines.length, 0);
  assert.match(close.empty, /no line of close-lines.json follows a line in the target/);
  assert.equal(r.pixelMm, 2);
  assert.ok(r.opening.stats.absorbance > 0.8);
  assert.ok(fs.existsSync(path.join(dir, 'ink-lines.json')));
});

test('measuring alone leaves the files and the pens as they were', async () => {
  const dir = await setup(), f = flags(['--drawingfile', path.join(dir, 'open'), '--inkdarkcap', '1']);
  const r = await holdInkLines({ ...f, image: path.join(dir, 'target.png'), root: dir, out: dir, sheetMm: 120 });
  assert.equal(f.argv.length, 4);
  assert.equal(r.opening.out, null);
  assert.equal(r.closing, null);
  assert.ok(r.opening.stats.supportedShare > 0.4 && r.opening.stats.supportedShare < 0.6);
  assert.equal(await holdInkLines({ ...flags([]), image: path.join(dir, 'target.png'), out: dir, sheetMm: 120 }), null, 'no flag, no work');
});

test('the ink flags refuse negative values', () => {
  assert.throws(() => inkLineFlags(flags(['--linesupport', '-1']).num), /support/);
  assert.throws(() => inkLineFlags(flags(['--linesmoothcorner', '200']).num), /linesmoothcorner/);
  assert.equal(inkLineFlags(flags([]).num).measure, false);
});

test('--inkrecipe v2 adds only the flags the command line leaves unset', () => {
  const add = inkRecipeArgs('v2', ['--inkdamp', '0']);
  assert.ok(!add.includes('--inkdamp'));
  assert.deepEqual(add.filter((_, i) => i % 2 === 0).sort(), Object.keys(INK_RECIPES.v2).filter(k => k !== 'inkdamp').map(k => '--' + k).sort());
  assert.deepEqual(inkRecipeArgs('none', []), []);
  assert.throws(() => inkRecipeArgs('v3', []), /--inkrecipe/);
});
