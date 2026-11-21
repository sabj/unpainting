import test from 'node:test';
import assert from 'node:assert/strict';
import { dryingPressure } from './drying-pressure.mjs';

function solve(w, h, wet, rate) {
  const n = w * h, index = Uint8Array.from({ length: n }, (_, i) => +wet(i % w, (i / w) | 0));
  const order = Int32Array.from(Array.from({ length: n }, (_, i) => i).filter(i => index[i]));
  const sink = Float64Array.from(index, (m, i) => m ? rate(i % w, (i / w) | 0) : 0);
  const fx = new Float64Array(n), fy = new Float64Array(n), pressure = new Float64Array(n);
  const result = dryingPressure(order, order.length, index, w, sink, fx, fy, pressure);
  const div = i => fx[i] + fy[i] - (i % w ? fx[i - 1] : 0) - (i >= w ? fy[i - w] : 0);
  assert.ok(result.relativeResidual < 1e-7, JSON.stringify(result));
  return { sink, fx, fy, div, index };
}

test('pressure supplies a pinned sink from the whole film, without a donor band', () => {
  const w = 61, a = solve(w, w, () => true, (x, y) => x === 0 || y === 0 || x === w - 1 || y === w - 1 ? 1 : 0);
  const mean = a.sink.reduce((s, v) => s + v, 0) / (w * w);
  for (let i = 0; i < w * w; i++) assert.ok(Math.abs(a.div(i) + a.sink[i] - mean) < 1e-7);
  assert.ok(a.fx[30 * w + 40] > 0, 'pigment-bearing liquid flows outwards more than 4 mm behind a rim');
  assert.ok(Math.abs(a.fx[30 * w + 40] - a.fy[40 * w + 30]) < 1e-9, 'quarter-turn symmetry');
});

test('disconnected puddles satisfy their own volume balance', () => {
  const a = solve(30, 12, x => x < 10 || x >= 20, x => x === 0 ? 1 : x === 29 ? 2 : 0);
  for (let i = 0; i < a.index.length; i++) if (a.index[i]) assert.ok(Math.abs(a.div(i) + a.sink[i] - (i % 30 < 10 ? .1 : .2)) < 1e-7);
  assert.equal(a.fx[9], 0); assert.equal(a.fx[19], 0);
});

test('a single-cell puddle and a sink-free component have no face flux', () => {
  const a = solve(10, 10, (x, y) => x === 1 && y === 1 || x > 5 && y > 5, (x, y) => x === 1 && y === 1 ? 1 : 0);
  assert.ok(a.fx.every(v => v === 0)); assert.ok(a.fy.every(v => v === 0));
});

test('uniform nonbinary evaporation has no roundoff-driven pressure failure', () => {
  const a = solve(31, 17, () => true, () => .00123456789);
  assert.ok(a.fx.every(v => Math.abs(v) < 1e-12));
  assert.ok(a.fy.every(v => Math.abs(v) < 1e-12));
});

// The first version of the solve, kept to hold the pooled one to it bit for bit (speed work must not change the look).
function referencePressure(order, count, index, width, sink, fluxX, fluxY, pressure) {
  const n = pressure.length, r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), ap = new Float64Array(n);
  const degree = new Uint8Array(n), edges = new Int32Array(4 * n).fill(-1);
  const sorted = order.slice(0, count).sort();
  for (const i of sorted) {
    const e = 4 * i;
    if (i % width && index[i - 1]) edges[e] = i - 1;
    if ((i + 1) % width && index[i + 1]) edges[e + 1] = i + 1;
    if (i >= width && index[i - width]) edges[e + 2] = i - width;
    if (i + width < n && index[i + width]) edges[e + 3] = i + width;
    for (let a = e; a < e + 4; a++) if (edges[a] >= 0) degree[i]++;
  }
  const component = new Int32Array(n), queue = new Int32Array(count), means = [0], gauges = [0], anchor = new Uint8Array(n);
  let components = 0;
  for (const seed of sorted) {
    if (component[seed]) continue;
    const label = ++components; let head = 0, tail = 1, total = 0;
    queue[0] = seed; component[seed] = label; let centreX = 0, centreY = 0;
    while (head < tail) {
      const i = queue[head++]; total += sink[i]; centreX += i % width; centreY += (i / width) | 0;
      for (let a = 4 * i; a < 4 * i + 4; a++) { const j = edges[a]; if (j >= 0 && !component[j]) { component[j] = label; queue[tail++] = j; } }
    }
    means[label] = total / tail; centreX /= tail; centreY /= tail;
    let gauge = seed, best = Infinity;
    for (let q = 0; q < tail; q++) {
      const i = queue[q], distance = (i % width - centreX) ** 2 + (((i / width) | 0) - centreY) ** 2;
      if (distance < best) { best = distance; gauge = i; }
    }
    // A central gauge avoids conditioning the whole puddle through a hair-
    // thin fringe at the first raster cell. Only pressure differences matter.
    anchor[gauge] = 1; gauges[label] = pressure[gauge];
  }
  for (const i of sorted) pressure[i] -= gauges[component[i]];
  // Incomplete Cholesky on the symmetric five-point stencil. Natural grid
  // order has only west/north entries below the diagonal, and no fill terms
  // between these neighbours. Anchor columns are excluded from the solve.
  const diagonal = new Float64Array(n), west = new Float64Array(n), north = new Float64Array(n), temporary = new Float64Array(n);
  for (const i of sorted) {
    if (anchor[i]) { diagonal[i] = 1; continue; }
    const l = edges[4 * i], u = edges[4 * i + 2];
    if (l >= 0 && !anchor[l]) west[i] = -1 / diagonal[l];
    if (u >= 0 && !anchor[u]) north[i] = -1 / diagonal[u];
    diagonal[i] = Math.sqrt(Math.max(1e-14, degree[i] - west[i] ** 2 - north[i] ** 2));
  }
  const precondition = () => {
    for (const i of sorted) {
      if (anchor[i]) { temporary[i] = 0; continue; }
      const l = edges[4 * i], u = edges[4 * i + 2];
      temporary[i] = (r[i] - (l >= 0 ? west[i] * temporary[l] : 0) - (u >= 0 ? north[i] * temporary[u] : 0)) / diagonal[i];
    }
    for (let q = count - 1; q >= 0; q--) {
      const i = sorted[q]; if (anchor[i]) { z[i] = 0; continue; }
      const e = edges[4 * i + 1], d = edges[4 * i + 3];
      z[i] = (temporary[i] - (e >= 0 ? west[e] * z[e] : 0) - (d >= 0 ? north[d] * z[d] : 0)) / diagonal[i];
    }
  };
  let norm = 0, residual = 0;
  for (const i of sorted) {
    const rhs = means[component[i]] - sink[i]; norm += sink[i] * sink[i];
    if (anchor[i]) continue;
    let lap = degree[i] * pressure[i];
    for (let a = 4 * i; a < 4 * i + 4; a++) if (edges[a] >= 0) lap -= pressure[edges[a]];
    r[i] = rhs - lap; residual += r[i] * r[i];
  }
  const tolerance = Math.max(Math.max(norm, residual) * 1e-22, 1e-30);
  precondition(); let rz = 0;
  for (const i of sorted) { p[i] = z[i]; rz += r[i] * z[i]; }
  let iterations = 0;
  for (; residual > tolerance && iterations < 16 * Math.sqrt(count) + 500; iterations++) {
    let pap = 0;
    for (const i of sorted) {
      if (anchor[i]) continue;
      let v = degree[i] * p[i];
      for (let a = 4 * i; a < 4 * i + 4; a++) if (edges[a] >= 0) v -= p[edges[a]];
      ap[i] = v; pap += p[i] * v;
    }
    if (!(pap > 0)) break;
    const alpha = rz / pap; residual = 0;
    for (const i of sorted) { pressure[i] += alpha * p[i]; r[i] -= alpha * ap[i]; residual += r[i] * r[i]; }
    precondition(); let next = 0;
    for (const i of sorted) next += r[i] * z[i];
    const beta = next / rz; rz = next;
    for (const i of sorted) p[i] = z[i] + beta * p[i];
  }
  // Verify the original Neumann equations, including the excluded gauge row.
  residual = 0;
  for (const i of sorted) {
    let lap = degree[i] * pressure[i];
    for (let a = 4 * i; a < 4 * i + 4; a++) if (edges[a] >= 0) lap -= pressure[edges[a]];
    residual += (lap - means[component[i]] + sink[i]) ** 2;
    fluxX[i] = (i + 1) % width && index[i + 1] ? pressure[i] - pressure[i + 1] : 0;
    fluxY[i] = i + width < n && index[i + width] ? pressure[i] - pressure[i + width] : 0;
  }
  return { components, iterations, relativeResidual: norm ? Math.sqrt(residual / norm) : Math.sqrt(residual) };
}

test('the pooled solve gives the first version pressures and fluxes to the bit, call after call', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let trial = 0; trial < 12; trial++) {
    const w = 20 + Math.floor(rnd() * 40), h = 15 + Math.floor(rnd() * 30), n = w * h;
    // blobs of film, some touching, some apart, with a sink at their edges
    const index = new Int32Array(n), blobs = 1 + Math.floor(rnd() * 4);
    for (let b = 0; b < blobs; b++) { const cx = rnd() * w, cy = rnd() * h, r = 3 + rnd() * 10; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) index[y * w + x] = 1; }
    const order = Int32Array.from(Array.from({ length: n }, (_, i) => i).filter(i => index[i]).reverse());
    const sink = Float64Array.from(index, (m, i) => m ? (rnd() < 0.2 ? rnd() : 0) : 0);
    const run = f => { const fx = new Float64Array(n), fy = new Float64Array(n), pr = new Float64Array(n); const r = f(order, order.length, index, w, sink, fx, fy, pr); return { r, fx, fy, pr }; };
    const a = run(referencePressure);
    const ic = (...a) => dryingPressure(...a, 'ic'); // the IC(0) path keeps the first version's bits
    for (const b of [run(ic), run(ic)]) {   // the second call reuses the first's work arrays
      assert.deepEqual(b.r, a.r);
      for (const k of ['fx', 'fy', 'pr']) for (let i = 0; i < n; i++) assert.ok(Object.is(a[k][i], b[k][i]), `trial ${trial} ${k}[${i}] ${a[k][i]} vs ${b[k][i]}`);
    }
  }
});

// The multigrid-preconditioned solve against the IC(0) solve of 20 Nov, on the shapes a wash takes. The two stop by the
// same residual rule (relative 1e-11), so they agree far inside 1e-9 of the largest pressure and the largest flux.
async function shapeCases() {
  const cases = [];
  const grid = (name, w, h, wet) => cases.push({ name, w, h, wet });
  grid('oval', 240, 160, (x, y) => ((x - 120) / 110) ** 2 + ((y - 80) / 70) ** 2 < 1);
  grid('ring with a hole', 200, 200, (x, y) => { const d = Math.hypot(x - 100, y - 100); return d < 90 && d > 35; });
  grid('two separate puddles', 220, 120, (x, y) => Math.hypot(x - 55, y - 60) < 45 || ((x - 160) / 50) ** 2 + ((y - 60) / 30) ** 2 < 1);
  grid('a thin strip', 400, 40, (x, y) => y >= 18 && y <= 20 + ((x / 40) | 0) % 3 && x > 5 && x < 395);
  // a real wash: the middle values of a block-in study in the repository, as ragged as a painter's mask gets
  const sharp = (await import('sharp')).default, file = new URL('../../examples/studies/sargent-a-tramp-study.png', import.meta.url);
  const { data, info } = await sharp(file.pathname).resize(360).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  grid('a block-in study wash', info.width, info.height, (x, y) => { const k = 3 * (y * info.width + x), l = (data[k] + data[k + 1] + data[k + 2]) / 3; return l > 90 && l < 175; });
  return cases;
}
function solveBoth(w, h, wet) {
  const n = w * h, index = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) index[y * w + x] = wet(x, y) ? 1 : 0;
  const order = Int32Array.from(Array.from({ length: n }, (_, i) => i).filter(i => index[i]));
  // the edge feed's sink: extra drying at the cells on the outline (edge-geometry.mjs), none inside
  const sink = Float64Array.from(index, (m, i) => m && (!(i % w) || !index[i - 1] || !index[i + 1] || !index[i - w] || !index[i + w]) ? 1e-3 * (1 + (i % 5) / 10) : 0);
  const out = {};
  for (const solver of ['ic', 'mg']) {
    const fx = new Float64Array(n), fy = new Float64Array(n), pressure = new Float64Array(n), t = performance.now();
    out[solver] = { res: dryingPressure(order, order.length, index, w, sink, fx, fy, pressure, solver), fx, fy, pressure, ms: performance.now() - t };
  }
  const rel = (a, b) => { let d = 0, m = 0; for (let i = 0; i < a.length; i++) { d = Math.max(d, Math.abs(a[i] - b[i])); m = Math.max(m, Math.abs(a[i])); } return m ? d / m : d; };
  return { out, count: order.length, pressure: rel(out.ic.pressure, out.mg.pressure), flux: Math.max(rel(out.ic.fx, out.mg.fx), rel(out.ic.fy, out.mg.fy)) };
}
test('multigrid and IC(0) give the same pressure and fluxes to 1e-9 on an oval, a ring, two puddles, a strip and a study wash', async () => {
  for (const c of await shapeCases()) {
    const r = solveBoth(c.w, c.h, c.wet), note = `${c.name}: ${r.count} cells, IC ${r.out.ic.res.iterations} iterations, multigrid ${r.out.mg.res.iterations}`;
    // the same stopping rule as IC(0) (relative to the larger of the sink and the first residual): as tight or tighter
    assert.ok(r.out.mg.res.relativeResidual <= Math.max(1.5e-11, 2 * r.out.ic.res.relativeResidual), `${note}: residual ${r.out.mg.res.relativeResidual}`);
    assert.ok(r.pressure < 1e-9, `${note}: pressure differs by ${r.pressure}`);
    assert.ok(r.flux < 1e-9, `${note}: flux differs by ${r.flux}`);
    assert.equal(r.out.mg.res.components, r.out.ic.res.components, note);
    assert.ok(r.out.mg.res.iterations <= 60, note);
  }
});
test('a full-scale first wash (900k cells) is solved by multigrid in bounded time', { timeout: 120000 }, () => {
  const w = 1462, h = 975, n = w * h, index = new Uint8Array(n), order = new Int32Array(n); let count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - w / 2) / (w * .45)) ** 2 + ((y - h / 2) / (h * .45)) ** 2 < 1) { const i = y * w + x; index[i] = 1; order[count++] = i; }
  const sink = Float64Array.from(index, (m, i) => m && (!index[i - 1] || !index[i + 1] || !index[i - w] || !index[i + w]) ? 1e-3 : 0);
  const t = performance.now(), res = dryingPressure(order, count, index, w, sink, new Float64Array(n), new Float64Array(n), new Float64Array(n), 'mg');
  const seconds = (performance.now() - t) / 1000;
  assert.ok(res.relativeResidual <= 1.5e-11, String(res.relativeResidual));
  assert.ok(res.iterations <= 60 && seconds < 20, `${count} cells: ${res.iterations} iterations, ${seconds.toFixed(1)} s`);
});
