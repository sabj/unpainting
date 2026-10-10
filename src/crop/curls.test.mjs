// Ringlet fur: the curly regions are found, the glazes stop at the lights' tone and owe the rest, the crescents keep off
// the lights and turn at the curls' radius, and the locks cross the outline root to tip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { curlRegions, curlRadius, capShareOf, clipForCurls, ringletMarks, edgeMarks, planCurls } from './curls.mjs';
import { gaussian } from '../keyframes/density.mjs';

const W = 140, H = 140, N = W * H;
const SAND = [215, 195, 160], BLACK = [22, 22, 26], LIT = [70, 82, 100];
const put = (px, i, c) => { px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2]; };
const inBlob = (x, y, cx = 70, cy = 70, r = 45) => Math.hypot(x - cx, y - cy) < r;

// a black coat of ringlets (the upper half of each curl lit sky blue, on a grid 10 cells apart) with hooks along its
// outline, on sand
const coat = () => {
  const px = new Uint8Array(N * 3);
  for (let i = 0; i < N; i++) put(px, i, SAND);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inBlob(x, y)) put(px, y * W + x, BLACK);
  for (let cy = 30; cy < 112; cy += 10) for (let cx = 30; cx < 112; cx += 10) for (let a = -Math.PI; a <= 0; a += 0.05) {
    const x = Math.round(cx + 3 * Math.cos(a)), y = Math.round(cy + 3 * Math.sin(a));
    if (inBlob(x, y, 70, 70, 41)) put(px, y * W + x, LIT);
  }
  for (let k = 0; k < 40; k++) for (let t = 0; t < 7; t++) {
    const a = (k / 40) * 2 * Math.PI + (k % 2 ? 1 : -1) * t * 0.08, x = Math.round(70 + (44 + t * 0.7) * Math.cos(a)), y = Math.round(70 + (44 + t * 0.7) * Math.sin(a));
    put(px, y * W + x, BLACK);
  }
  return px;
};

test('a curly black coat is found, its lights inside it, its curls about three cells', () => {
  const r = curlRegions(coat(), W, H, gaussian);
  let area = 0, lit = 0, stray = 0;
  for (let i = 0; i < N; i++) { area += r.region[i]; lit += r.lit[i]; if (r.lit[i] && !r.region[i]) stray++; }
  assert.ok(area > 0.85 * Math.PI * 45 * 45, `region ${area}`);
  assert.ok(lit / area > 0.05, `lit ${(lit / area).toFixed(3)}`);
  assert.equal(stray, 0);
  assert.ok(r.radius >= 1.5 && r.radius <= 4.5, `radius ${r.radius}`);
});

test('a flat grey shape and a pale sheet have no curly region', () => {
  const px = new Uint8Array(N * 3);
  for (let i = 0; i < N; i++) put(px, i, SAND);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inBlob(x, y)) put(px, y * W + x, [120, 118, 110]);
  const r = curlRegions(px, W, H, gaussian);
  assert.equal(r.region.reduce((a, v) => a + v, 0), 0);
});

test('the curl radius is half the dark between lights', () => {
  const region = new Uint8Array(400).fill(1), lit = new Uint8Array(400);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x += 8) lit[y * 20 + x] = 1;   // lit lines 8 apart: dark runs 7 wide
  const r = curlRadius(region, lit, 20, 20, { min: 0.5, max: 10 });
  assert.ok(r >= 1.5 && r <= 2.5, `radius ${r}`);
  assert.equal(curlRadius(region, new Uint8Array(400), 20, 20, { min: 1.5 }), 1.5);
});

test('the glazes carry the lights’ share of the dark, clamped', () => {
  const D = new Float32Array(10), region = new Uint8Array(10).fill(1), lit = new Uint8Array(10);
  for (let i = 0; i < 10; i++) { lit[i] = i < 3 ? 1 : 0; D[i] = i < 3 ? 0.8 : 2.0; }
  assert.ok(Math.abs(capShareOf(D, region, lit, 10, 1) - 0.4) < 1e-6);
  for (let i = 0; i < 3; i++) D[i] = 0.1;
  assert.equal(capShareOf(D, region, lit, 10, 1, { min: 0.3 }), 0.3);
  assert.equal(capShareOf(D, region, new Uint8Array(10), 10, 1, { min: 0.3 }), 0.3);
});

test('clipped glazes stop in the region at the share and owe the rest; passages elsewhere are untouched', () => {
  const w = 10, h = 4, n = w * h, region = new Uint8Array(n);
  for (let i = 0; i < n; i++) region[i] = i % w < 5 ? 1 : 0;
  const everywhere = () => new Uint8Array(n).fill(1);
  const elsewhere = Uint8Array.from({ length: n }, (_, i) => (i % w >= 5 ? 1 : 0));
  const outside = { mask: elsewhere, mix: [0.2], amount: 0.2, area: 20 };
  const layers = [1, 2, 3, 4, 5].map(v => ({ value: v, pigment: 0, shapes: [{ mask: everywhere(), mix: [0.2], amount: 0.2, area: n }, ...(v === 1 ? [outside] : [])] }));
  const { layers: out, owed } = clipForCurls(layers, region, w, h, 1, [1], { share: 0.4, minArea: 1 });
  // in the region the running density reaches 0.4 of 1.0 after two passages; the other three are owed
  const kept = out.map(L => L.shapes[0].mask[0]);
  assert.deepEqual(kept, [1, 1, 0, 0, 0]);
  assert.ok(Math.abs(owed[0] - 0.6) < 1e-6, `owed ${owed[0]}`);
  assert.equal(owed[7], 0);
  assert.ok(out.every(L => L.shapes[0].mask[7] === 1));
  assert.equal(out[0].shapes[1], outside);
  assert.equal(layers[4].shapes[0].mask[0], 1, 'the layers given are not changed');
});

test('crescents keep off the lights, turn at the curls’ radius and leave some of the coat', () => {
  const w = 80, h = 80, n = w * h, want = new Float32Array(n), lit = new Uint8Array(n);
  for (let y = 5; y < 75; y++) for (let x = 5; x < 75; x++) want[y * w + x] = 1;
  for (let y = 10; y < 70; y += 9) for (let x = 10; x < 70; x++) if ((x + y) % 11 < 4) lit[y * w + x] = 1;
  const flat = new Float32Array(n), radius = 3;
  const marks = ringletMarks(want, lit, flat, w, h, { radius, coverage: 0.6, seed: 5, follow: 0 });
  assert.ok(marks.length > 30, `${marks.length} marks`);
  let onLight = 0, turn = 0, steps = 0;
  const hit = new Uint8Array(n);
  for (const m of marks) {
    for (const q of m) { const i = Math.round(q.y) * w + Math.round(q.x); if (lit[i]) onLight++; hit[i] = 1; }
    for (let k = 2; k < m.length; k++) {
      const a1 = Math.atan2(m[k - 1].y - m[k - 2].y, m[k - 1].x - m[k - 2].x), a2 = Math.atan2(m[k].y - m[k - 1].y, m[k].x - m[k - 1].x);
      let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d; turn += d; steps++;
    }
    assert.ok(m[0].p < 0.7 && m[m.length - 1].p < 0.7 && Math.max(...m.map(q => q.p)) > 0.9, 'thin at both ends, full in the body');
  }
  assert.equal(onLight, 0);
  assert.ok(Math.abs(turn / steps - 1 / radius) < 0.02, `turn per cell ${(turn / steps).toFixed(3)}`);
  let wanted = 0, covered = 0; for (let i = 0; i < n; i++) if (want[i] && !lit[i]) { wanted++; covered += hit[i]; }
  assert.ok(covered / wanted < 0.6, `covered ${(covered / wanted).toFixed(2)}`);
});

test('locks start inside the outline, end outside it, and lift to a point', () => {
  const w = 100, h = 100, region = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inBlob(x, y, 50, 50, 30)) region[y * w + x] = 1;
  const marks = edgeMarks(region, w, h, gaussian, { radius: 3, seed: 3 });
  assert.ok(marks.length > 20, `${marks.length} locks`);
  let inOut = 0;
  for (const m of marks) {
    const a = m[0], b = m[m.length - 1];
    if (region[Math.round(a.y) * w + Math.round(a.x)] && !region[Math.round(b.y) * w + Math.round(b.x)]) inOut++;
    assert.ok(b.p < a.p || b.p <= 0.2, 'the tip is lighter than the root');
  }
  assert.ok(inOut / marks.length > 0.8, `${inOut} of ${marks.length} cross the outline`);
});

test('planCurls keeps to a box and owes nothing outside it', () => {
  const px = coat(), D = new Float32Array(N);
  for (let i = 0; i < N; i++) D[i] = Math.max(0, -Math.log(Math.max(0.02, (0.2126 * px[i * 3] + 0.7152 * px[i * 3 + 1] + 0.0722 * px[i * 3 + 2]) / 200)));
  const layers = [1, 2, 3].map(v => ({ value: v, pigment: 0, shapes: [{ mask: new Uint8Array(N).fill(1), mix: [0.5], amount: 0.5, area: N }] }));
  const pigments = [{ K: [1, 1, 1] }];
  const all = planCurls(px, W, H, layers, D, pigments, gaussian, { share: 0.4 });
  const half = planCurls(px, W, H, layers, D, pigments, gaussian, { share: 0.4, box: [0, 0, 0.5, 1] });
  assert.ok(half.area < 0.6 * all.area && half.area > 0.4 * all.area, `box ${half.area} of ${all.area}`);
  let owedRight = 0; for (let y = 0; y < H; y++) for (let x = 71; x < W; x++) owedRight += half.owed[y * W + x];
  assert.equal(owedRight, 0);
});
