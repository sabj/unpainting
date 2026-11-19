// A coat's texture follows what the subject shows in it: strokes where there are strands, along them, in their colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { coatTexture, thinPlanes, STREAK, LENGTH_MM } from './coat-texture.mjs';

const w = 360, h = 240, MM = 0.25;
function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// a dark coat (OD 2.6) with light hairs at 30 degrees in its left half; a lighter passage on the right (OD 0.9) with dark hairs
function scene() {
  const D = new Float32Array(w * h), rgb = new Uint8Array(w * h * 3), labelMap = new Uint8Array(w * h), rnd = rng(3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; D[i] = x < 180 ? 2.6 : 0.9; labelMap[i] = 1; const v = Math.round(252 * Math.exp(-D[i])); rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = v; }
  const hair = (x0, y0, ang, len, od, col) => { for (let t = 0; t <= len; t += 0.5) for (const o of [0, 0.3, 0.6, 0.9]) { const x = Math.round(x0 + Math.cos(ang) * t - Math.sin(ang) * o), y = Math.round(y0 + Math.sin(ang) * t + Math.cos(ang) * o); if (x > 0 && y > 0 && x < w && y < h) { const i = y * w + x; D[i] = od; rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]; } } };
  for (let y = 10; y < h - 10; y += 7) for (let x = 10; x < 160; x += 11) hair(x + rnd() * 4, y + rnd() * 3, Math.PI / 6 + (rnd() - 0.5) * 0.2, 10 + rnd() * 8, 1.0, [200, 190, 175]);
  for (let y = 10; y < h - 10; y += 16) for (let x = 215; x < 340; x += 24) hair(x + rnd() * 4, y + rnd() * 3, -Math.PI / 5 + (rnd() - 0.5) * 0.2, 10 + rnd() * 8, 2.4, [40, 30, 25]);
  return { D, rgb, labelMap };
}

test('light strands over the dark coat and dark strands over the lighter passage are found as two thin planes', () => {
  const { D } = scene(), p = thinPlanes(D, w, h, MM);
  let l = 0, d = 0; for (let i = 0; i < w * h; i++) { l += p.light[i]; d += p.dark[i]; }
  assert.ok(l > 800 && d > 600, `${l} light and ${d} dark pixels`);
  for (let y = 0; y < h; y++) for (let x = 200; x < w; x++) assert.equal(p.light[y * w + x], 0, 'no light strand in the lighter passage');
});

test('strokes follow the strands: light ones in the dark coat along 30 degrees in the hairs\' colour, dark ones in the lighter passage', () => {
  const { D, rgb, labelMap } = scene();
  const { strokes, regions } = coatTexture({ D, rgb, labelMap, kinds: { 1: 'curly-coat' }, w, h, mmPerCell: MM });
  const light = strokes.filter(s => s.polarity === 'light'), dark = strokes.filter(s => s.polarity === 'dark');
  assert.ok(light.length > 15 && dark.length > 10, `${light.length} light, ${dark.length} dark`);
  for (const s of light) { const a = s.points[0], b = s.points.at(-1); assert.ok(a.x < 200 && b.x < 200, 'light strokes stay in the dark coat'); assert.ok(s.rgb[0] > 150, `the colour of the hair: ${s.rgb}`); }
  const ang = s => { const a = s.points[0], b = s.points.at(-1); return ((Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) % 180 + 180) % 180; };
  const near = light.filter(s => Math.abs(ang(s) - 30) < 25 || Math.abs(ang(s) - 30) > 155).length;
  assert.ok(near / light.length > 0.7, `${near} of ${light.length} lie along the hairs`);
  for (const s of dark) { assert.ok(s.points[0].x > 190, 'dark strokes in the lighter passage'); assert.ok(s.rgb[0] < 100, `a dark hair's colour: ${s.rgb}`); }
  const rec = regions[0]; assert.ok(rec.lightShare > 0.02 && rec.lightStrokes === light.length);
});

test('strokes are laid until the paint they leave cover as much as the strands, and none where there are none', () => {
  const { D, rgb, labelMap } = scene();
  const out = coatTexture({ D, rgb, labelMap, kinds: { 1: 'short-coat' }, w, h, mmPerCell: MM }), rec = out.regions[0];
  const per = (LENGTH_MM['short-coat'] / MM) * (1.6 / MM) * STREAK, covered = out.strokes.filter(s => s.polarity === 'light').length * per / rec.cells;
  assert.ok(covered > 0.6 * rec.lightShare && covered < 1.4 * rec.lightShare, `paint covers ${covered.toFixed(3)} against strand share ${rec.lightShare}`);
  const bare = coatTexture({ D: new Float32Array(w * h).fill(2.6), rgb, labelMap, kinds: { 1: 'short-coat' }, w, h, mmPerCell: MM });
  assert.equal(bare.strokes.length, 0, 'a flat dark coat gets nothing');
});

test('a ceiling and a label that is not a coat are respected, and the same plan comes out twice', () => {
  const { D, rgb, labelMap } = scene();
  assert.ok(coatTexture({ D, rgb, labelMap, kinds: { 1: 'curly-coat' }, w, h, mmPerCell: MM, ceiling: 7 }).strokes.length <= 7);
  assert.equal(coatTexture({ D, rgb, labelMap, kinds: {}, w, h, mmPerCell: MM }).strokes.length, 0);
  const a = coatTexture({ D, rgb, labelMap, kinds: { 1: 'curly-coat' }, w, h, mmPerCell: MM }), b = coatTexture({ D, rgb, labelMap, kinds: { 1: 'curly-coat' }, w, h, mmPerCell: MM });
  assert.deepEqual(a.strokes[0].points[0], b.strokes[0].points[0]);
});
