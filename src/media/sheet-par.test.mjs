// The threaded step must leave every array of the sheet, and every scratch buffer the next step reads, exactly as the
// serial step does. Each scenario runs serially, then in bands of a few rows each (the smallest boxes forced into
// bands, so band edges fall everywhere), and the arrays are hashed after every step.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, soak, step, dry, fix, applyResist, liftResist, setThreads, DEFAULTS } from './sheet.mjs';

const pigments = [
  { K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 },
  { K: [0.8, 0.3, 0.2], S: [0.05, 0.04, 0.03], rho: 0.09, omega: 0.6, gamma: 0.7, floc: 0.5 },
  { K: [0.2, 0.3, 0.9], S: [0.02, 0.02, 0.02], rho: 0.03, omega: 2.2, gamma: 0.4, wick: 0.7 },
  { K: [0.5, 0.5, 0.5], S: [0.1, 0.1, 0.1], rho: 0.02, omega: 1, gamma: 0 },
];
const hash = a => crypto.createHash('md5').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex').slice(0, 10);
function snapshot(sh) {
  const sc = sh.scratch, o = {};
  for (const k of ['W', 's', 'M', 'ever', 'edge']) o[k] = hash(sh[k]);
  for (const k of ['G', 'P', 'D']) sh[k].forEach((a, j) => { o[k + j] = hash(a); });
  sh.layers.forEach((L, l) => L.forEach((a, j) => { o[`L${l}.${j}`] = hash(a); }));
  if (sc) {
    for (const k of ['fx', 'fy', 'out', 'C', 'wsc', 'dW', 'went', 'dep', 'wl', 'wf']) o['sc.' + k] = hash(sc[k]);
    // sNext, PNext and dDep are left out: only active spans are initialized, and all are copied
    // afresh before every read, so what they hold between steps is never used
    for (const k of ['qx', 'qy', 'pout', 'dG', 'dSlide']) sc[k].forEach((a, j) => { o[`sc.${k}${j}`] = hash(a); });
  }
  o.steps = sh.steps;
  return o;
}
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// a scenario: blobs of wash, soaked touches, a resist, a dried layer, then a second wash over it; `o` the physics
function scenario(w, h, o, log) {
  const sh = createSheet(makePaper(w, h, { seed: 7 }), pigments), r = rng(11), K = pigments.length;
  const blob = (cx, cy, rad, water, pig) => { for (let y = Math.max(0, cy - rad); y < Math.min(h, cy + rad); y++) for (let x = Math.max(0, cx - rad); x < Math.min(w, cx + rad); x++) if ((x - cx) ** 2 + (y - cy) ** 2 < rad * rad * (0.6 + 0.4 * r())) deposit(sh, y * w + x, water * (0.5 + r()), pig.map(v => v * (0.5 + r()))); };
  blob(w / 3 | 0, h / 3 | 0, w / 4 | 0, 0.7, [0.05, 0.02, 0, 0]);
  blob(2 * w / 3 | 0, h / 2 | 0, w / 5 | 0, 0.5, [0, 0.04, 0.03, 0]);
  for (let t = 0; t < 400; t++) soak(sh, (r() * sh.n) | 0, 0.3 * r(), [0.01 * r(), 0, 0.02 * r(), 0.01]);
  const mask = new Uint8Array(sh.n); for (let y = h / 2 | 0; y < (h / 2 | 0) + 6; y++) for (let x = 4; x < w - 4; x++) mask[y * w + x] = 1;
  for (let t = 0; t < 30; t++) { if (sh.scratch) sh.scratch.sNext.fill(NaN); step(sh, o); log.push(snapshot(sh)); if (t === 10) applyResist(sh, mask); }
  dry(sh, 40000, o, { level: 10, levelMax: 40, onStep: t => { if (t % 7 === 0) log.push(snapshot(sh)); } });
  liftResist(sh);
  log.push(snapshot(sh));
  blob(w / 2 | 0, h / 2 | 0, w / 3 | 0, 0.9, [0.02, 0, 0.01, 0.03]);
  blob(w / 4 | 0, 3 * h / 4 | 0, w / 6 | 0, 0.4, [0, 0.03, 0, 0]);
  for (let t = 0; t < 60; t++) { if (sh.scratch) sh.scratch.sNext.fill(NaN); step(sh, o); log.push(snapshot(sh)); }
  dry(sh, 40000, o, { level: 10, levelMax: 40, onStep: t => { if (t % 5 === 0) log.push(snapshot(sh)); } });
  log.push(snapshot(sh));
  void K;
}

const cases = [
  ['defaults', 48, 40, { ...DEFAULTS }],
  ['granFill, stronger slide', 40, 52, { ...DEFAULTS, granFill: 2, slide: 0.8, gran: 0.25 }],
  ['marangoni, one flow iteration', 36, 36, { ...DEFAULTS, marangoni: 0.5, flowIters: 1 }],
  ['wide edge, three iterations', 44, 30, { ...DEFAULTS, edgeWidth: 4, flowIters: 3, pinning: 1.5, pinFibre: 2 }],
];

for (const [name, w, h, o] of cases) {
  test(`threaded steps are bit-identical to serial: ${name}`, async () => {
    await setThreads(1);
    const serial = []; scenario(w, h, o, serial);
    for (const T of [2, 3, 5, 8]) {
      await setThreads(T);
      const par = await import('./sheet-par.mjs'); par.tune({ minArea: 0, minWet: 0, minRows: 1, minBandWet: 1 });
      const out = []; scenario(w, h, o, out);
      const st = par.stats();
      assert.ok(st.par > 0, 'no step ran in bands');
      assert.equal(out.length, serial.length);
      for (let t = 0; t < serial.length; t++) for (const k of Object.keys(serial[t])) assert.equal(out[t][k], serial[t][k], `threads ${T}, snapshot ${t}, ${k}`);
    }
    await setThreads(1);
  });
}

test('threaded compositing and flow fields are bit-identical to serial', async () => {
  const { renderLayers } = await import('./km.mjs');
  const { flowField } = await import('./wash.mjs');
  const w = 300, h = 240, n = w * h, r = rng(5);
  const layers = Array.from({ length: 5 }, () => pigments.map(() => Float32Array.from({ length: n }, () => (r() < 0.4 ? r() * 0.3 : 0))));
  const paperRGB = Uint8ClampedArray.from({ length: n * 3 }, () => 200 + ((r() * 50) | 0));
  const field = Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.013) + (i % w) * 0.01 + r() * 0.05);
  await setThreads(1);
  const a = renderLayers(layers, pigments, paperRGB, n, 1), fa = flowField(field, w, h);
  const one = renderLayers([layers[2]], pigments, paperRGB, n, 1);
  await setThreads(6);
  const par = await import('./sheet-par.mjs'), ran = () => par.stats();
  // as a sheet hands them over: the dried layers shared, the wet one on top plain
  const mixed = layers.map((L, l) => (l < layers.length - 1 ? L.map(a => { const b = par.shared(Float32Array, n); b.set(a); return b; }) : L));
  const b = renderLayers(mixed, pigments, paperRGB, n, 1), fb = flowField(field, w, h), one2 = renderLayers([layers[2]], pigments, paperRGB, n, 1);
  const fb2 = flowField(field.map(v => v * 0.5), w, h), st = ran();
  assert.ok(st.render === 2 && st.flow === 2, 'the jobs ran on the pool: ' + JSON.stringify(st));
  await setThreads(1);
  const fa2 = flowField(field.map(v => v * 0.5), w, h);
  assert.equal(hash(b), hash(a));
  assert.equal(hash(one2), hash(one));
  for (const k of ['fx', 'fy', 'coh']) assert.equal(hash(fb2[k]), hash(fa2[k]), 'a second flow field in the kept buffers: ' + k);
  for (const k of ['fx', 'fy', 'coh']) assert.equal(hash(fb[k]), hash(fa[k]), k);
});

test('a sheet past the size where the threads scan for water and sum the layers steps and sums as serially', async () => {
  const { thickness } = await import('./sheet.mjs');
  const run = () => {
    const w = 300, h = 240, sh = createSheet(makePaper(w, h, { seed: 3 }), pigments), r = rng(9), log = [];
    for (let pass = 0; pass < 2; pass++) {
      for (let t = 0; t < 6000; t++) { const x = (r() * w) | 0, y = (r() * h) | 0; deposit(sh, y * w + x, 0.5 * r(), [0.02 * r(), 0.01 * r(), 0, 0.005]); if (t % 500 === 0) { step(sh); log.push(snapshot(sh)); } }
      dry(sh, 40000, DEFAULTS, { level: 5, levelMax: 20, onStep: t => { if (t % 50 === 0) log.push(snapshot(sh)); } });
      log.push(snapshot(sh), Object.fromEntries(thickness(sh).map((a, k) => ['thick' + k, hash(a)])));
    }
    return log;
  };
  await setThreads(1);
  const serial = run();
  await setThreads(7);
  const par = await import('./sheet-par.mjs'); par.tune({ minArea: 4096, minWet: 2048, minRows: 6, minBandWet: 1024 });
  const out = run();
  const st = par.stats();
  assert.ok(st.par > 0 && st.tiles > 0 && st.thick === 2, JSON.stringify(st));
  assert.equal(out.length, serial.length);
  for (let t = 0; t < serial.length; t++) for (const k of Object.keys(serial[t])) assert.equal(out[t][k], serial[t][k], `snapshot ${t}, ${k}`);
  await setThreads(1);
});
