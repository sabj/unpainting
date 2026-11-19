// A coat is laid from its direction field: many thin lights running one way in one dark region, never random flecks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { thinLights } from './thin-lights.mjs';
import { RHO_MIN, MIN_STROKE_MM, MIN_SPACING_MM } from './strand-field.mjs';

const W = 700, H = 500, PX = 0.2; // 140 mm by 100 mm
const dark = () => new Float32Array(W * H).fill(3.0);
function rng(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function stroke(D, x, y, ang, len, od) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let t = 0; t <= len; t += 0.5) for (const [ox, oy] of [[0, 0], [-dy, dx]]) { const xx = Math.round(x + dx * t + ox * 0.6), yy = Math.round(y + dy * t + oy * 0.6); if (xx > 0 && yy > 0 && xx < W && yy < H) D[yy * W + xx] = od; }
}
// hairs lying at about 30 degrees, 3 to 6 mm long, 1.2 mm apart, in a patch of the dark
function coat(D, x0, y0, x1, y1, ang, rnd) {
  for (let y = y0; y < y1; y += 6) for (let x = x0; x < x1; x += 9) stroke(D, x + rnd() * 5, y + rnd() * 3, ang + (rnd() - 0.5) * 0.25, 15 + rnd() * 15, 1.4);
}

test('a coat of hairs is laid from the field: strokes follow the hairs\' direction, stay in the coat, and are not a trace', () => {
  const D = dark(), rnd = rng(7); coat(D, 200, 150, 500, 350, Math.PI / 6, rnd);
  const out = thinLights(D, W, H, { pixelMm: PX });
  const field = out.strokes.filter(s => s.field != null);
  assert.ok(out.fields.length >= 1, 'a passage of fur strands');
  assert.ok(field.length >= 10, `a coat is many strokes: ${field.length}`);
  for (const s of field) {
    assert.ok(s.lengthMm >= MIN_STROKE_MM, `no flecks: ${s.lengthMm} mm`);
    assert.ok(s.fit.turnsPerCm <= 0.75, 'smooth');
    const a = s.points[0], b = s.points.at(-1), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), d = Math.abs(((ang - Math.PI / 6 + Math.PI * 1.5) % Math.PI) - Math.PI / 2);
    assert.ok(d < 0.45, `follows the way the coat lies: ${(d * 57.3).toFixed(0)} degrees off`);
    for (const [x, y] of s.points) assert.ok(x > 150 && x < 550 && y > 100 && y < 400, 'inside the coat, none in the flat dark around it');
  }
  // fewer strokes than hairs: a painter lays a hair in two, not every hair
  assert.ok(field.length < 0.8 * out.stats.ridges, `${field.length} strokes from ${out.stats.ridges} ridges`);
});

test('no two strokes lie closer than a rigger can lay them', () => {
  const D = dark(), rnd = rng(11); coat(D, 200, 150, 500, 350, Math.PI / 6, rnd);
  const field = thinLights(D, W, H, { pixelMm: PX }).strokes.filter(s => s.field != null);
  let closest = Infinity;
  field.forEach((a, i) => field.forEach((b, j) => { if (j <= i) return; for (const p of a.points.filter((_, k) => k % 3 === 0)) for (const q of b.points.filter((_, k) => k % 3 === 0)) closest = Math.min(closest, Math.hypot(p[0] - q[0], p[1] - q[1]) * PX); }));
  assert.ok(closest >= MIN_SPACING_MM * 0.45, `closest approach ${closest.toFixed(2)} mm`);
});

test('flat dark and pale ground get no strokes: a coat is laid only where the strands are', () => {
  const D = dark(), rnd = rng(7); coat(D, 200, 150, 400, 300, Math.PI / 6, rnd);
  for (let y = 380; y < 480; y++) for (let x = 20; x < 680; x++) D[y * W + x] = 0.3; // a pale band under the coat
  const field = thinLights(D, W, H, { pixelMm: PX }).strokes.filter(s => s.field != null);
  assert.ok(field.length > 0);
  for (const s of field) for (const [x, y] of s.points) assert.ok(y < 340 && x > 150 && x < 450, 'none in the flat dark beyond the coat, none on the pale band');
});

test('a few single lights are not a coat: they stay single strokes', () => {
  const D = dark(); for (const y of [100, 250, 400]) stroke(D, 150, y, 0.05, 130, 1.0);
  const out = thinLights(D, W, H, { pixelMm: PX });
  assert.equal(out.fields.length, 0);
  assert.equal(out.strokes.filter(s => s.kind === 'strand' && s.field == null).length, 3);
});

test('the field strokes are capped by the ceiling they are given', () => {
  const D = dark(), rnd = rng(7); coat(D, 200, 150, 500, 350, Math.PI / 6, rnd);
  assert.ok(thinLights(D, W, H, { pixelMm: PX, fieldCeiling: 5 }).strokes.filter(s => s.field != null).length <= 5);
  assert.ok(RHO_MIN > 0);
});
