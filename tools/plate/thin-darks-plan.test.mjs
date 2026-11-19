// Thin darks are found in the planning data, laid only where the point's measured line fits the subject's, never twice and never in a coat.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planThinDarks, drawnMask, drawnLines } from './thin-darks-plan.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thin-darks-'));
const W = 600, H = 400, PAPER = [252, 251, 248];
const swatch = (line = 0.67) => ({ widthMm: line, coreMm: 0.5, rows: [], stable: { conc: 6, continuity: 0.94, depositPerLoad: 0.1, stepLstar: -41 }, settings: { radiusCells: 1, water: 1 } });
async function image(name, draw) { const px = Buffer.alloc(W * H * 3, 205); draw(px); const f = path.join(dir, name); await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(f); return f; }
const line = (px, x0, x1, y, wide = 2, v = 25) => { for (let x = x0; x <= x1; x++) for (let d = 0; d < wide; d++) { const i = ((y + d + Math.round(0.02 * (x - x0))) * W + x) * 3; px[i] = px[i + 1] = px[i + 2] = v; } };
const run = (file, over = {}) => planThinDarks({ image: file, w: W, h: H, sheetMm: 150, paperRGB: PAPER, swatch: swatch(), ...over });

test('a dark line over a lighter ground is laid, with the subject\'s own colour and width, as a smooth stroke', async () => {
  const f = await image('rims.png', px => { line(px, 100, 300, 100); line(px, 120, 330, 220); });
  const { strokes, record } = await run(f);
  assert.equal(record.decision, 'lay'); assert.ok(strokes.length >= 2, `${strokes.length} lines`);
  for (const s of strokes) { assert.ok(s.measuredMm > 0.3 && s.measuredMm < 0.9, `the line measures ${s.measuredMm} mm`); assert.ok(s.rgb[0] < 80, `dark: ${s.rgb}`); assert.ok(s.fit.maxMm <= 0.3 && s.fit.turnsPerCm <= 0.75); assert.ok(s.lengthMm > 25); }
  assert.ok(record.planned.strokes === strokes.length && record.point.lineMm === 0.67);
});

test('the scale rule: where the point lays a line over one and a half times the subject\'s, nothing is laid; with no stable line, nothing', async () => {
  const f = await image('rims2.png', px => line(px, 100, 300, 100));
  const coarse = await run(f, { swatch: swatch(1.8) });
  assert.equal(coarse.strokes.length, 0); assert.ok(coarse.record.skippedTooFine >= 1);
  const none = await run(f, { swatch: { ...swatch(), stable: null } });
  assert.equal(none.strokes.length, 0); assert.match(none.record.reason, /no stable line/);
  assert.equal((await run(f, { swatch: null })).strokes.length, 0);
});

test('a line the drawing layer already draws is not laid twice, and a coat\'s strands are the coat\'s', async () => {
  const f = await image('rims3.png', px => { line(px, 100, 300, 100); line(px, 120, 330, 250); });
  const base = (await run(f)).strokes.length;
  const lines = [{ points: [[100, 100], [200, 102], [300, 104]], grid: { w: W, h: H } }];
  const drawn = await run(f, { drawn: lines });
  assert.equal(drawn.strokes.length, base - 1); assert.equal(drawn.record.skippedAlreadyDrawn, 1);
  const coat = new Uint8Array(W * H); for (let y = 200; y < 300; y++) for (let x = 0; x < W; x++) coat[y * W + x] = 1;
  assert.equal((await run(f, { coat: { mask: coat } })).strokes.length, base - 1, 'nothing in the coat');
});

test('the drawing layer\'s visible lines: ink always, graphite only at visible weight', () => {
  const f = path.join(dir, 'lines.json'); fs.writeFileSync(f, JSON.stringify({ image: { w: 10, h: 10 }, lines: [{ points: [[0, 0], [9, 9]] }] }));
  const files = { prep: 'lines.json', prepInk: 'lines.json' };
  assert.equal(drawnLines(files, { root: dir, out: dir, graphiteAmount: 0.3 }).lines.length, 1, 'ink only: the light pencil is not drawn at visible weight');
  assert.equal(drawnLines(files, { root: dir, out: dir, graphiteAmount: 0.8 }).lines.length, 2);
  const m = drawnMask([{ points: [[2, 2], [8, 2]], grid: { w: 10, h: 10 } }], 10, 10, 0.5, 0.5);
  assert.equal(m[2 * 10 + 5], 1); assert.equal(m[8 * 10 + 5], 0);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
