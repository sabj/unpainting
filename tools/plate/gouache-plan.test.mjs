// The decision to use gouache is made from the planning data: a thin light over dark makes strokes, a plain picture makes none.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planGouache, STROKES_PER_100_CM2 } from './gouache-plan.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gouache-plan-'));
async function image(name, draw) {
  const W = 600, H = 400, px = Buffer.alloc(W * H * 3, 20);
  draw(px, W);
  const file = path.join(dir, name);
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
  return file;
}
const PAPER = [252, 251, 248], PIGS = [{ K: [0.4, 0.8, 2.0] }, { K: [1.4, 1.3, 1.1] }];
const hair = (px, W, x0, x1, y, rgb) => { for (let x = x0; x <= x1; x++) for (let dy = 0; dy < 2; dy++) { const i = ((y + dy + Math.round(0.02 * (x - x0))) * W + x) * 3; px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; } };

test('light hairs over a dark coat decide for gouache, with the tint and the record the run card keeps', async () => {
  const file = await image('hairs.png', (px, W) => { for (let k = 0; k < 3; k++) hair(px, W, 100, 260, 60 + k * 120, [235, 215, 170]); });
  const { strokes, record } = await planGouache({ image: file, w: 600, h: 400, sheetMm: 150, paperRGB: PAPER, pigments: PIGS });
  assert.equal(record.decision, 'gouache');
  assert.ok(strokes.length >= 3 && strokes.length <= Math.ceil(STROKES_PER_100_CM2 * 150 * 100 / 100 / 100) + 1, `a handful: ${strokes.length}`);
  for (const s of strokes) { assert.ok(s.widthMm >= 0.25 && s.widthMm <= 1.0); assert.ok(s.tint.mix.length >= 1 && s.tint.mix[0].pigment === 0, 'a warm light takes the warm paint'); assert.ok(s.fit.maxMm <= 0.3); }
  assert.equal(record.read.stage, 'planning, before the first wash');
  assert.ok(record.rule.includes('thinner'));
});

test('a plain dark picture, or a pale one, decides against gouache and adds nothing to the sheet', async () => {
  const dark = await image('dark.png', () => {});
  assert.equal((await planGouache({ image: dark, w: 600, h: 400, sheetMm: 150, paperRGB: PAPER, pigments: PIGS })).record.decision, 'none');
  const pale = await image('pale.png', (px, W) => { px.fill(240); for (let k = 0; k < 3; k++) hair(px, W, 100, 260, 60 + k * 120, [255, 255, 255]); });
  assert.equal((await planGouache({ image: pale, w: 600, h: 400, sheetMm: 150, paperRGB: PAPER, pigments: PIGS })).strokes.length, 0, 'no light over dark, no gouache');
});

test('a coat of strands is laid only where the surface labels say coat: no labels, or a wall, no coat strokes', async () => {
  const W = 700, H = 500;
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const file = path.join(dir, 'coat.png'), px = Buffer.alloc(W * H * 3, 20);
  for (let y = 150; y < 350; y += 6) for (let x = 200; x < 500; x += 9) {
    const x0 = x + rnd() * 5, y0 = y + rnd() * 3, a = Math.PI / 6 + (rnd() - 0.5) * 0.25, len = 15 + rnd() * 15;
    for (let t = 0; t <= len; t += 0.5) for (const o of [0, 0.6]) { const xx = Math.round(x0 + Math.cos(a) * t - Math.sin(a) * o), yy = Math.round(y0 + Math.sin(a) * t + Math.cos(a) * o), i = (yy * W + xx) * 3; px[i] = 140; px[i + 1] = 135; px[i + 2] = 130; }
  }
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
  const run = coat => planGouache({ image: file, w: W, h: H, sheetMm: 140, paperRGB: PAPER, pigments: PIGS, coat });
  const none = await run(null), wall = await run({ status: 'ok', mask: new Uint8Array(W * H) }), unavailable = await run({ status: 'unavailable', mask: new Uint8Array(W * H).fill(1) });
  for (const r of [none, wall, unavailable]) assert.equal(r.strokes.filter(s => s.field != null).length, 0);
  assert.match(unavailable.record.coat.reason, /judge could not run/);
  assert.match(wall.record.coat.reason, /not in a region labelled a coat/);
  const fur = await run({ status: 'ok', mask: new Uint8Array(W * H).fill(1) });
  assert.ok(fur.strokes.filter(s => s.field != null).length >= 10, 'a labelled coat is laid from its field');
  assert.ok(fur.record.planned.shareOfCeiling > 0 && fur.record.fields.length >= 1);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
