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

test('--linemeasure reads a finer file on the painting grid and writes per-point widths, weights and line cores', async () => {
  const dir = await setup(), w = 60, h = 40, k = 3;
  const fine = y => ({ points: Array.from({ length: 11 }, (_, i) => [k * (5 + 5 * i), k * y]) });
  fs.writeFileSync(path.join(dir, 'fine-lines.json'), JSON.stringify({ image: { w: w * k, h: h * k }, lines: [fine(10.5), fine(30.5)] }));
  const f = flags(['--drawingfile', path.join(dir, 'fine'), '--linesupport', '6', '--linemeasure', '1', '--inkdarkmatch', '1', '--width', String(w)]);
  const r = await holdInkLines({ ...f, image: path.join(dir, 'target.png'), root: dir, out: dir, sheetMm: 120 });
  const open = JSON.parse(fs.readFileSync(path.join(dir, 'ink-opening-lines.json'), 'utf8'));
  assert.deepEqual(open.image, { w, h });
  assert.equal(open.lines.length, 1);
  const g = open.lines[0];
  assert.equal(g.widths.length, g.points.length);
  assert.ok(g.weights.every(v => v >= 0.45 && v <= 1));
  assert.ok(r.opening.stats.peakAbsorbance > 0);
});

test('--inkrecipe wash turns ink on and picks the source lines, and the command line still wins', () => {
  const add = inkRecipeArgs('wash', ['--inkbleed', '0']), opt = n => add[add.indexOf('--' + n) + 1];
  assert.equal(opt('outlinemedium'), 'ink');
  assert.equal(opt('linesource'), 'source-ink');
  assert.equal(opt('inkdarkmatch'), '1.6');
  assert.ok(!add.includes('--inkbleed'));
  assert.ok(!add.includes('--inkdarkcap'), 'the wash recipe matches the darkness instead of capping it');
});

test('--inkres keeps a finer file on its own grid, up to the fine sheet', async () => {
  const dir = await setup(), w = 60, h = 40, k = 3;
  const fine = y => ({ points: Array.from({ length: 11 }, (_, i) => [k * (5 + 5 * i), k * y]) });
  fs.writeFileSync(path.join(dir, 'fine-lines.json'), JSON.stringify({ image: { w: w * k, h: h * k }, lines: [fine(10.5), fine(30.5)] }));
  const f = flags(['--drawingfile', path.join(dir, 'fine'), '--linesupport', '6', '--linemeasure', '1', '--width', String(w), '--inkres', String(k)]);
  await holdInkLines({ ...f, image: path.join(dir, 'target.png'), root: dir, out: dir, sheetMm: 120 });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'ink-opening-lines.json'), 'utf8')).image, { w: w * k, h: h * k });
});

test('the wash recipe draws on a sheet 3 times as fine, by a hand that chains strokes', () => {
  assert.equal(INK_RECIPES.wash.inkres, '3');
  assert.equal(INK_RECIPES.wash.drawinghand, '1');
  assert.equal(INK_RECIPES.wash.drawstroke, '0.1');
});

test('lineart map lines are measured and never cut or marked soft, whatever --linesupport says', async () => {
  const dir = await setup();
  for (const name of ['open', 'close']) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, `${name}-lines.json`), 'utf8'));
    fs.writeFileSync(path.join(dir, `${name}-lines.json`), JSON.stringify({ ...doc, inputKind: 'line-map' }));
  }
  const f = flags(['--drawingfile', path.join(dir, 'open'), '--linesupport', '6', '--linemeasure', '1', '--linesmooth', '0.5', '--lineminmm', '3', '--linegapmm', '1']);
  const r = await holdInkLines({ ...f, image: path.join(dir, 'target.png'), root: dir, out: dir, sheetMm: 120 });
  const open = JSON.parse(fs.readFileSync(path.join(dir, 'ink-opening-lines.json'), 'utf8'));
  assert.equal(open.lines.length, 2, 'the line over bare paper stays');
  assert.equal(open.inputKind, 'line-map');
  assert.ok(open.lines.every(g => g.soft === undefined));
  assert.ok(r.opening.model);
  assert.ok(Math.abs(r.opening.stats.keptPx / r.opening.stats.lengthPx - 1) < 1e-9, 'every pixel of the length is kept');
  assert.equal(open.inkLines.support, 0);
});
