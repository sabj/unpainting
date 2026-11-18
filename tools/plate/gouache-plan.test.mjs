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
  const file = await image('hairs.png', (px, W) => { for (let k = 0; k < 6; k++) hair(px, W, 100, 260, 100 + k * 14, [235, 215, 170]); });
  const { strokes, record } = await planGouache({ image: file, w: 600, h: 400, sheetMm: 150, paperRGB: PAPER, pigments: PIGS });
  assert.equal(record.decision, 'gouache');
  assert.ok(strokes.length >= 4 && strokes.length <= Math.ceil(STROKES_PER_100_CM2 * 150 * 100 / 100 / 100) + 1, `a handful: ${strokes.length}`);
  for (const s of strokes) { assert.ok(s.widthMm >= 0.25 && s.widthMm <= 1.0); assert.ok(s.tint.pigment === 0, 'a warm light takes the warm paint'); assert.ok(s.fit.maxMm <= 0.3); }
  assert.equal(record.read.stage, 'planning, before the first wash');
  assert.ok(record.rule.includes('thinner'));
});

test('a plain dark picture, or a pale one, decides against gouache and adds nothing to the sheet', async () => {
  const dark = await image('dark.png', () => {});
  assert.equal((await planGouache({ image: dark, w: 600, h: 400, sheetMm: 150, paperRGB: PAPER, pigments: PIGS })).record.decision, 'none');
  const pale = await image('pale.png', (px, W) => { px.fill(240); for (let k = 0; k < 4; k++) hair(px, W, 100, 260, 100 + k * 14, [255, 255, 255]); });
  assert.equal((await planGouache({ image: pale, w: 600, h: 400, sheetMm: 150, paperRGB: PAPER, pigments: PIGS })).strokes.length, 0, 'no light over dark, no gouache');
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
