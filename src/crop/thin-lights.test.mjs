// Thin lights: found where a painter could not reserve them, laid as smooth whole strokes, and nowhere else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { thinLights, fitCubic, smoothStrokes, turnSigns, TOUCH_MM } from './thin-lights.mjs';

const W = 260, H = 200, PX = 0.2; // 0.2 mm a pixel, a rigger touch is 6 pixels
const field = od => new Float32Array(W * H).fill(od);
// a light line from (x0, y0) to (x1, y1) with a gentle bow, `wide` pixels across, at density `od`
function line(D, x0, y0, x1, y1, wide, od, bow = 0) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + bow * Math.sin(Math.PI * t);
    for (let dy = -wide; dy <= wide; dy++) for (let dx = -wide; dx <= wide; dx++) {
      if (Math.hypot(dx, dy) > wide / 2) continue;
      const xx = Math.round(x + dx), yy = Math.round(y + dy);
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) D[yy * W + xx] = od;
    }
  }
}
function scene() {
  const D = field(1.0);                                   // a dark coat
  line(D, 30, 40, 110, 46, 3, 0.3, 4);                    // three whiskers, 16 mm long, 0.6 mm wide
  line(D, 30, 56, 112, 66, 3, 0.3, 5);
  line(D, 32, 74, 108, 92, 3, 0.35, 3);
  for (let y = 120; y < 190; y++) for (let x = 20; x < 100; x++) D[y * W + x] = 0.1;   // a broad light plane
  for (let y = 100; y < 105; y++) for (let x = 180; x < 185; x++) D[y * W + x] = 0.05; // a glint, 1 mm
  for (let y = 150; y < 190; y++) for (let x = 150; x < 240; x++) D[y * W + x] = 0.05; // pale ground...
  line(D, 160, 170, 230, 172, 3, 0.0, 0);                 // ...with a line on it: nothing to lighten
  return D;
}

test('whiskers over a dark coat are found as smooth strokes, and a broad light plane is left to the wash', () => {
  const { strokes } = thinLights(scene(), W, H, { pixelMm: PX });
  const strands = strokes.filter(s => s.kind === 'strand');
  assert.equal(strands.length, 3, `three whiskers: ${strands.length}`);
  for (const s of strands) {
    assert.ok(s.lengthMm >= 14, `whole stroke, not a piece: ${s.lengthMm.toFixed(1)} mm`);
    assert.ok(s.widthMm >= 0.25 && s.widthMm <= 1.0, `rigger width: ${s.widthMm}`);
    assert.ok(s.fit.maxMm <= 0.3, `stays on its ridge: ${s.fit.maxMm} mm`);
    assert.ok(s.fit.turnsPerCm <= 0.75, `no wobble: ${s.fit.turnsPerCm} sign changes per cm`);
    assert.ok(s.points.every(([x, y]) => y < 100), 'nothing in the broad light plane or the pale ground');
  }
});

test('a glint qualifies, a dot of the same size in a pale area does not', () => {
  const { strokes } = thinLights(scene(), W, H, { pixelMm: PX });
  const glints = strokes.filter(s => s.kind === 'glint');
  assert.equal(glints.length, 1);
  assert.ok(glints[0].points[0][0] > 175 && glints[0].points[0][0] < 190);
  const D = field(0.2); for (let y = 100; y < 105; y++) for (let x = 180; x < 185; x++) D[y * W + x] = 0.02;
  assert.equal(thinLights(D, W, H, { pixelMm: PX }).strokes.length, 0, 'a light on a pale ground is not a light over dark');
});

test('a light wider than a rigger touch is the planner\'s, not the rigger\'s', () => {
  const D = field(1.0); line(D, 30, 100, 150, 104, 12, 0.1, 0);
  assert.ok(12 * PX > TOUCH_MM);
  assert.equal(thinLights(D, W, H, { pixelMm: PX }).strokes.length, 0);
});

test('a short isolated fragment is not laid, and a lone short one among others is', () => {
  const D = field(1.0); line(D, 30, 100, 62, 101, 3, 0.2, 0); // 6 mm, alone
  assert.equal(thinLights(D, W, H, { pixelMm: PX }).strokes.length, 0, 'a fleck stands alone');
  line(D, 30, 108, 62, 109, 3, 0.2, 0); // a neighbour
  assert.equal(thinLights(D, W, H, { pixelMm: PX }).strokes.filter(s => s.kind === 'strand').length, 2);
});

test('the colour of the light is read along the stroke, and the strokes are capped, best first', () => {
  const D = scene(), rgb = new Uint8Array(W * H * 3).fill(40);
  for (let i = 0; i < W * H; i++) if (D[i] < 0.4) { rgb[i * 3] = 230; rgb[i * 3 + 1] = 210; rgb[i * 3 + 2] = 160; }
  const all = thinLights(D, W, H, { pixelMm: PX, rgb });
  assert.deepEqual(all.strokes.find(s => s.kind === 'strand').rgb, [230, 210, 160]);
  const two = thinLights(D, W, H, { pixelMm: PX, rgb, strokesMax: 2, glintsMax: 0 });
  assert.equal(two.strokes.length, 2);
  assert.ok(two.strokes[0].score >= two.strokes[1].score);
});

test('one cubic follows a bowed ridge and a zigzag is cut, never fitted as a wobble', () => {
  const bow = Array.from({ length: 60 }, (_, i) => [i * 2, 10 * Math.sin(Math.PI * i / 59)]);
  const f = fitCubic(bow); assert.ok(f.max < 1.0, `bow within ${f.max.toFixed(2)} px`);
  const zig = Array.from({ length: 80 }, (_, i) => [i * 2, (Math.floor(i / 10) % 2 ? 1 : -1) * 6 + 0]);
  const parts = smoothStrokes(zig, { tol: 1.5, minLen: 30 });
  for (const p of parts) assert.ok(p.max <= 1.5 && turnSigns(p.curve) <= 2, 'every part is smooth and on its ridge');
  assert.ok(parts.length < 8);
});

test('the pixel size is required', () => {
  assert.throws(() => thinLights(field(1), W, H, {}), /millimetres/);
});
