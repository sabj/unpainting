// A coat's texture follows what the subject shows in it, at the scale the brush can lay: wide-enough strands only, none over
// features, varied in length and taper, and as many as the measured paint area asks for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { coatTexture, thinPlanes, strandWidths, structureMask, LENGTH_MM } from './coat-texture.mjs';

const w = 360, h = 240, MM = 0.25;
const brush = (laid = 0.7, area = 1.9) => ({ narrowest: { radiusCells: 1, widthMm: laid, areaPerCell: area }, radii: [] });
function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// a dark coat (OD 2.6) with light hairs at 30 degrees in its left half, a lighter passage (OD 0.9) with dark hairs on the right
function scene(thick = 2.4) {
  const D = new Float32Array(w * h), rgb = new Uint8Array(w * h * 3), labelMap = new Uint8Array(w * h).fill(1), rnd = rng(3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; D[i] = x < 180 ? 2.6 : 0.9; const v = Math.round(252 * Math.exp(-D[i])); rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = v; }
  const hair = (x0, y0, ang, len, od, col) => { for (let t = 0; t <= len; t += 0.4) for (let o = -thick / 2; o <= thick / 2; o += 0.4) { const x = Math.round(x0 + Math.cos(ang) * t - Math.sin(ang) * o), y = Math.round(y0 + Math.sin(ang) * t + Math.cos(ang) * o); if (x > 0 && y > 0 && x < w && y < h) { const i = y * w + x; D[i] = od; rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]; } } };
  for (let y = 10; y < h - 10; y += 7) for (let x = 10; x < 160; x += 11) hair(x + rnd() * 4, y + rnd() * 3, Math.PI / 6 + (rnd() - 0.5) * 0.2, 10 + rnd() * 8, 1.0, [200, 190, 175]);
  for (let y = 10; y < h - 10; y += 16) for (let x = 215; x < 340; x += 24) hair(x + rnd() * 4, y + rnd() * 3, -Math.PI / 5 + (rnd() - 0.5) * 0.2, 10 + rnd() * 8, 2.4, [40, 30, 25]);
  return { D, rgb, labelMap };
}
const run = (s, over = {}) => coatTexture({ fine: { ...s, w, h, mmPerCell: MM }, plan: { w, h, mmPerCell: MM }, kinds: { 1: 'curly-coat' }, brush: brush(), ...over });

test('strand widths are measured per pixel from the ridge, in mm', () => {
  const { D } = scene(2.4), p = thinPlanes(D, w, h, MM), wd = strandWidths(p.light, w, h, MM), ws = []; for (let i = 0; i < w * h; i++) if (p.light[i]) ws.push(wd[i]);
  ws.sort((a, b) => a - b); const med = ws[ws.length >> 1];
  assert.ok(med > 0.4 && med < 1.0, `a 0.6 mm hair measures ${med} mm`);
});

test('a strand\'s step is how far it stands off its own ring, in L*, and is read only on a strand', () => {
  const { D } = scene(2.4), p = thinPlanes(D, w, h, MM); let on = 0, off = 0;
  for (let i = 0; i < w * h; i++) { if (p.light[i] || p.dark[i]) { on++; assert.ok(p.step[i] >= 10, `a strand is at least a step the eye sees off its ring: ${p.step[i]}`); } else off += p.step[i]; }
  assert.ok(on > 500 && off === 0, `${on} strand pixels, ${off} L* read off them`);
});

test('the scale rule: strands about as wide as the brush line are laid, strands far thinner are not', () => {
  const wide = run(scene(2.4)), thin = run(scene(1.0));
  assert.ok(wide.strokes.length > 15, `hairs of 0.6 mm under a 0.7 mm line: ${wide.strokes.length}`);
  assert.ok(thin.strokes.length < wide.strokes.length / 4, `hairs of 0.25 mm under the same line: ${thin.strokes.length}`);
  assert.match(thin.regions[0].lightRule, /under|laid/);
  const coarse = run(scene(2.4), { brush: brush(3.0) });
  assert.equal(coarse.strokes.length, 0, 'a coarse sheet lays no strand marks');
  assert.match(coarse.regions[0].lightRule, /over 1.5 times/);
  assert.equal(run(scene(2.4), { brush: { narrowest: null, radii: [] } }).strokes.length, 0, 'no measured line, nothing laid');
});

test('strokes follow the strands in their colour, light in the dark coat and dark in the lighter passage', () => {
  const { strokes, regions } = run(scene(2.4));
  const light = strokes.filter(s => s.polarity === 'light'), dark = strokes.filter(s => s.polarity === 'dark');
  assert.ok(light.length > 15 && dark.length > 3, `${light.length} light, ${dark.length} dark`);
  for (const s of light) { assert.ok(s.points[0].x < 200 && s.points.at(-1).x < 200); assert.ok(s.rgb[0] > 150, `the hair's colour: ${s.rgb}`); }
  const ang = s => { const a = s.points[0], b = s.points.at(-1); return ((Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) % 180 + 180) % 180; };
  assert.ok(light.filter(s => Math.abs(ang(s) - 30) < 25 || Math.abs(ang(s) - 30) > 155).length / light.length > 0.7, 'along the hairs');
  for (const s of dark) { assert.ok(s.rgb[0] < 100); assert.ok(s.strandMm >= 0.4 && s.strandMm < 1.2); }
  // each stroke carries the step its strands stand off their own ground: about 34 L* in this scene, either way
  for (const s of strokes) assert.ok(s.step > 25 && s.step < 40, `a ${s.polarity} strand's step: ${s.step} L*`);
  assert.ok(regions[0].lightStrokes === light.length && regions[0].laidLineMm === 0.7);
});

test('strokes vary in length, taper to a fine tip, and keep to the measured paint area', () => {
  const { strokes, regions } = run(scene(2.4)), lens = strokes.map(s => s.lengthMm);
  assert.ok(Math.max(...lens) > 1.6 * Math.min(...lens), `lengths ${Math.min(...lens)} to ${Math.max(...lens)} mm`);
  for (const s of strokes) { const a = s.points[0], b = s.points.at(-1); assert.ok(b.r < a.r && b.p < a.p, 'pressed at the root, finer at the tip'); }
  const r = regions[0], paint = strokes.filter(s => s.polarity === 'light').reduce((a, s) => a + s.lengthMm * 1.9 * MM, 0), strandArea = r.lightWideEnoughPx * MM * MM;
  assert.ok(paint > 0.5 * strandArea && paint < 1.5 * strandArea, `paint ${paint.toFixed(0)} mm2 for strands of ${strandArea.toFixed(0)} mm2`);
  assert.ok(LENGTH_MM['curly-coat'] > 0);
});

test('no strand mark within reach of a broad feature, and a ceiling and the same plan twice are kept', () => {
  const s = scene(2.4);
  for (let y = 100; y < 130; y++) for (let x = 60; x < 110; x++) { s.D[y * w + x] = 6; const i = y * w + x; s.rgb[i * 3] = s.rgb[i * 3 + 1] = s.rgb[i * 3 + 2] = 1; } // an eye: a broad dark in the coat
  const m = structureMask(thinPlanes(s.D, w, h, MM).L, w, h, MM);
  assert.equal(m[115 * w + 85], 1); assert.equal(m[115 * w + 20], 0, 'far from it, free');
  const out = run(s);
  for (const k of out.strokes) for (const p of k.points) assert.ok(!(p.x > 68 && p.x < 102 && p.y > 105 && p.y < 125), 'nothing over the feature');
  assert.ok(run(s, { ceiling: 7 }).strokes.length <= 7);
  assert.deepEqual(run(s).strokes[0].points[0], run(s).strokes[0].points[0]);
  assert.equal(run(s, { kinds: {} }).strokes.length, 0);
});
