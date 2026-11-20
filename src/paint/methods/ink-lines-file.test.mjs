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

test('measuring alone leaves the files and the pens as they were', async () => {
  const dir = await setup(), f = flags(['--drawingfile', path.join(dir, 'open'), '--inkdarkcap', '1']);
  const r = await holdInkLines({ ...f, image: path.join(dir, 'target.png'), root: dir, out: dir, sheetMm: 120 });
  assert.equal(f.argv.length, 4);
  assert.equal(r.opening.out, null);
  assert.equal(r.closing, null);
  assert.equal(await holdInkLines({ ...flags([]), image: path.join(dir, 'target.png'), out: dir, sheetMm: 120 }), null, 'no flag, no work');
});

test('the ink flags refuse negative values', () => {
  assert.throws(() => inkLineFlags(flags(['--inkdarkcap', '-1']).num), /darkCap/);
  assert.equal(inkLineFlags(flags([]).num).measure, false);
});

test('a drawing file is drawn as it is: its darkness is read, its lines are never cut or rewritten', async () => {
  const dir = await setup(), f = flags(['--drawingfile', path.join(dir, 'open'), '--drawinglast', path.join(dir, 'close'), '--inkdarkmatch', '1']);
  const r = await holdInkLines({ ...f, image: path.join(dir, 'target.png'), root: dir, out: dir, sheetMm: 120 });
  assert.equal(f.argv.length, 6, 'the pens keep the files they were given');
  assert.equal(r.opening.out, null); assert.equal(r.closing.out, null);
  assert.ok(!fs.existsSync(path.join(dir, 'ink-opening-lines.json')));
  assert.ok(r.opening.stats.peakAbsorbance > 0 && r.opening.stats.inkAbsorbance > 0);
  assert.equal(r.pixelMm, 2);
  assert.ok(fs.existsSync(path.join(dir, 'ink-lines.json')));
});

test('--inkrecipe v2 adds only the flags the command line leaves unset', () => {
  const add = inkRecipeArgs('v2', ['--inkdamp', '0']);
  assert.ok(!add.includes('--inkdamp'));
  assert.deepEqual(add.filter((_, i) => i % 2 === 0).sort(), Object.keys(INK_RECIPES.v2).filter(k => k !== 'inkdamp').map(k => '--' + k).sort());
  assert.deepEqual(inkRecipeArgs('none', []), []);
  assert.throws(() => inkRecipeArgs('v3', []), /--inkrecipe/);
});

test('--inkrecipe wash turns ink on, traces no source line, and the command line still wins', () => {
  const add = inkRecipeArgs('wash', ['--inkbleed', '0']), opt = n => add[add.indexOf('--' + n) + 1];
  assert.equal(opt('outlinemedium'), 'ink');
  assert.ok(!add.includes('--linesource') && !add.includes('--linemodel'), 'the line is the drawing file (removed in 0.4)');
  assert.equal(opt('inkdarkmatch'), '1');
  assert.ok(!add.includes('--inkbleed'));
  assert.ok(!add.includes('--inkdarkcap'), 'the wash recipe matches the darkness instead of capping it');
});

test('the wash recipe draws on a fine sheet by width, by a hand that chains strokes, and holds no line to the target', () => {
  const opt = (argv, n) => { const a = inkRecipeArgs('wash', argv); return a[a.indexOf('--' + n) + 1]; };
  assert.equal(opt(['--width', '540'], 'inkres'), '4');
  assert.equal(opt(['--width', '1200'], 'inkres'), '2');
  assert.equal(opt(['--width', '800'], 'inkres'), '3');
  assert.equal(opt(['--width', '2400'], 'inkres'), '1');
  assert.ok(!inkRecipeArgs('wash', ['--width', '540', '--inkres', '2']).includes('--inkres'), 'a flag on the command line wins');
  assert.equal(INK_RECIPES.wash.drawinghand, '1');
  assert.equal(INK_RECIPES.wash.drawstroke, '0');
  const fl = (argv) => { const a = inkRecipeArgs('wash', argv); return a[a.indexOf('--inkwidthfloor') + 1]; };
  assert.equal(fl(['--width', '540']), '0', 'on a fine sheet no floor');
  assert.equal(fl(['--width', '2400']), '1');
  for (const k of ['inkdecide', 'linesupport', 'linesmooth', 'linemeasure']) assert.equal(INK_RECIPES.wash[k], undefined, `${k} was removed in 0.4: a drawing file is drawn as it is`);
});

test('wash with --drawingonly 1: black ink, firm ends, a load match past 4x, one opening pen; flags still win', () => {
  const f = argv => { const a = inkRecipeArgs('wash', argv), m = new Map(); for (let k = 0; k < a.length; k += 2) m.set(a[k], a[k + 1]); return m; };
  const only = f(['--drawingonly', '1', '--width', '1224']), plain = f(['--width', '1224']);
  assert.equal(only.get('--inkprofile'), 'drawing-ink'); assert.equal(only.get('--inkhue'), 'profile'); assert.equal(only.get('--drawtaperstart'), '1');
  assert.equal(only.get('--drawing'), 'first'); assert.equal(only.get('--inkloadmax'), '16'); assert.equal(only.get('--drawwant'), '1'); assert.equal(only.get('--inkdarkmatch'), '2'); assert.equal(plain.get('--inkdarkmatch'), '1');
  assert.equal(plain.get('--inkhue'), 'source'); assert.equal(plain.get('--inkprofile'), undefined); assert.equal(plain.get('--drawtaperstart'), '0.7');
  assert.equal(f(['--drawingonly', '1', '--inkhue', 'source']).get('--inkhue'), undefined);
});
