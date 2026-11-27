import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, step, dry, DEFAULTS } from './sheet.mjs';
import { backRun } from './backrun.mjs';
import { settleShare, settleSpeed, settleDiffusion } from './settling.mjs';
import { attachFine, finePour, fineDeposit, fineTotals, fineLayers, fineBytes } from './fine-pigment.mjs';

const PIG = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3 };
const paper = (w, h, mm) => makePaper(w, h, { seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm }, cockle: { rmsMm: 0 } });
const make = (N, o = DEFAULTS, K = 1) => {
  const s = createSheet(paper(6, 5, 0.52), Array.from({ length: K }, () => ({ ...PIG })));
  return attachFine(s, paper(s.w * N, s.h * N, 0.52 / N), N, { ...DEFAULTS, ...o });
};
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} against ${b}`);

test('fine pigment refuses invalid geometry, pigment-driven water and existing backends', () => {
  const s = createSheet(paper(6, 5, 0.52), [PIG]), fp = paper(12, 10, 0.26);
  for (const N of [0, 1, 1.5, NaN]) assert.throws(() => attachFine(s, fp, N, DEFAULTS), /ratio/);
  assert.throws(() => attachFine(s, fp, 3, DEFAULTS), /fine paper/);
  assert.throws(() => attachFine(s, { ...fp, mmPerCell: 0.13 }, 2, DEFAULTS), /physical extent/);
  assert.throws(() => attachFine(s, fp, 2, { ...DEFAULTS, marangoni: 1 }), /Marangoni/);
  s._gpu = {}; assert.throws(() => attachFine(s, fp, 2, DEFAULTS), /unattached CPU/); delete s._gpu;
  s.G[0][0] = 1; assert.throws(() => attachFine(s, fp, 2, DEFAULTS), /pigment-free/); s.G[0][0] = 0;
  attachFine(s, fp, 2, DEFAULTS);
  assert.throws(() => attachFine(s, fp, 2, DEFAULTS), /unattached CPU/);
});

test('reconstruction preserves each coarse block mean and fine relief, including pore capacity', () => {
  const F = make(4, { flow: 0, flowIters: 0, level: 0, evap: 0, edgeEvap: 0, absorb: 0, paperDry: 0, capRate: 0, slide: 0 });
  const s = F.sheet;
  for (let i = 0; i < s.n; i++) { deposit(s, i, 0.25 + i * 0.002); s.s[i] = 0.03; }
  step(s, { ...F.o, dt: 0.1 }); F.step();
  for (let c = 0; c < s.n; c++) {
    let w = 0, p = 0, lo = Infinity, hi = 0;
    for (let j = c * 16; j < (c + 1) * 16; j++) { const f = F.blockCells[j]; w += F.wa[f]; p += F.sa[f]; lo = Math.min(lo, F.wa[f]); hi = Math.max(hi, F.wa[f]); }
    close(w / 16, s.W[c]); close(p / 16, s.s[c]);
    assert.ok(hi > lo, 'fine relief changes the film depth');
  }
});

for (const N of [2, 4, 8]) test(`ratio ${N}: a wet-to-dry two-pigment wash conserves all pigment`, () => {
  const F = make(N, { edgeEvap: 0.0012, fixedBed: 1, granFill: 0, slideCap: 1 }, 2), s = F.sheet;
  for (let y = 1; y < s.h - 1; y++) for (let x = 1; x < s.w - 1; x++) deposit(s, y * s.w + x, 0.3);
  const inside = (x, y) => x > 0.52 && x < 2.6 && y > 0.52 && y < 2.08;
  finePour(F, inside, 0.36); finePour(F, inside, 0.17, 1);
  const before = [fineTotals(F), fineTotals(F, 1)];
  dry(s, 2000, F.o, { dt: 2, onStep: () => F.step() }); F.fix();
  for (let k = 0; k < 2; k++) {
    close(fineTotals(F, k), before[k]);
    assert.ok(F.G[k].every(v => v === 0) && F.P[k].every(v => v === 0));
    for (const L of fineLayers(F)) assert.ok(L[k].every(v => Number.isFinite(v) && v >= 0));
  }
  assert.equal(F.L.steps, 0);
});

test('fine back-run matches coarse pigment shares and keeps fine spatial variation', () => {
  const o = { ...DEFAULTS, flow: 0, flowIters: 0, diffuse: 0, filmDiffuse: 0, settle: 0, lift: 0, scour: 0, slide: 0, holdDepth: 0 };
  for (const N of [2, 4, 8]) {
    const F = make(N, o), s = F.sheet, ref = createSheet(s.paper, [PIG]);
    for (let i = 0; i < s.n; i++) {
      deposit(s, i, i % s.w === 1 ? 0.2 : 0.01); deposit(ref, i, s.W[i], [0.03]); ref.D[0][i] = 0.05;
      for (let a = 0; a < N * N; a++) { const f = F.blockCells[i * N * N + a]; F.G[0][f] = 0.03; F.D[0][f] = 0.04 + 0.02 * a / (N * N - 1); }
    }
    const before = fineTotals(F), box = [0, 0, s.w - 1, s.h - 1], options = { ...o, dt: 0.1 };
    F.L.begin(0.1);
    const given = backRun(s, options, box, 0.52);
    backRun(ref, options, box, 0.52);
    assert.ok(given > 0); assert.equal(F.L.backruns.length, 1);
    F.step(); close(fineTotals(F), before);
    for (let c = 0; c < s.n; c++) {
      let g = 0, d = 0;
      for (let a = 0; a < N * N; a++) { const f = F.blockCells[c * N * N + a]; g += F.G[0][f]; d += F.D[0][f]; }
      close(g / (N * N), ref.G[0][c]); close(d / (N * N), ref.D[0][c]);
      assert.equal(s.W[c], ref.W[c]);
      let left = 1;
      const event = F.L.backruns[0];
      for (let e = 0; e < event.from.length; e++) if (event.from[e] === c) left -= event.deposit[e];
      for (let a = 0; a < N * N; a++) close(F.D[0][F.blockCells[c * N * N + a]], (0.04 + 0.02 * a / (N * N - 1)) * left);
    }
    // A second event starts from the previous state; stale transfers must not be replayed.
    F.L.begin(0.1); assert.equal(F.L.backruns.length, 0);
  }
});

test('unconsumed coarse steps fail, and memory accounting counts buffers only once', () => {
  const F = make(2), s = F.sheet;
  deposit(s, 8, 0.3); step(s, { ...F.o, dt: 0.1 });
  assert.throws(() => step(s, { ...F.o, dt: 0.1 }), /twice without the fine step/);
  assert.throws(() => F.fix(), /consume the coarse step/);
  F.step(); const bytes = fineBytes(F);
  assert.throws(() => F.step(), /no coarse step/);
  F.activeCells = F.cells.subarray(0, 1); assert.equal(fineBytes(F), bytes);
  finePour(F, () => true, 0.1);
  F.fix(); assert.equal(fineBytes(F) - bytes, F.fn * F.K * 4);
});

test('empty passages allocate no layer; absent pigments share one zero plane across fixed layers', () => {
  const F = make(2, DEFAULTS, 3);
  F.fix(); assert.equal(F.layers.length, 0);
  finePour(F, () => true, 0.1); F.fix();
  assert.equal(F.layers[0][1], F.layers[0][2]);
  finePour(F, () => true, 0.2); F.fix();
  assert.equal(F.layers[0][1], F.layers[1][1]);
  close(fineTotals(F), F.sheet.n * 0.3);
});

test('fixing fine pigment closes the coarse wash footprint and its pending edge demand', () => {
  const F = make(2), s = F.sheet;
  deposit(s, 8, 0.3);
  s.edgeDemandPending = 0.2; s.edgePending = new Float64Array(s.n).fill(0.01);
  F.fix();
  assert.equal(s.edgeDemandPending, 0); assert.ok(s.edgePending.every(v => v === 0));
  assert.equal(s.ever[8], 1, 'an empty fix does not claim to bind a layer');
  const water = s.W.slice(), mask = s.M.slice();
  finePour(F, () => true, 0.1); F.fix();
  assert.ok(s.ever.every(v => v === 0), 'a fixed pigment layer releases the old passage boundary');
  assert.deepEqual(s.W, water); assert.deepEqual(s.M, mask);
  close(fineTotals(F), s.n * 0.1);
});

test('optical snapshots share absent pigment planes and retain independent nonempty current paint', () => {
  const F = make(2, DEFAULTS, 16);
  finePour(F, () => true, 0.1, 3);
  const before = fineBytes(F), top = fineLayers(F).at(-1);
  assert.equal(new Set(top).size, 2, 'one painted plane and one shared zero, rather than sixteen image planes');
  assert.equal(fineBytes(F) - before, F.fn * 4, 'the retained zero plane is counted once');
  finePour(F, () => true, 0.2, 3);
  assert.ok(top[3].every(v => v === Math.fround(0.1)), 'a nonempty snapshot owns its pixels');
  F.fix(); const emptyTop = fineLayers(F).at(-1);
  assert.equal(new Set(emptyTop).size, 1);
  assert.equal(emptyTop[3], F.layers[0][0], 'the empty current wash also shares the fixed layer zero');
  close(fineTotals(F, 3), F.sheet.n * 0.3);
});

test('rewetting lifts only the top fine layer at the pigment material rate and only under connected film', () => {
  const F = make(4, { slope: 0, flowIters: 0, settle: 0, lift: 0, scour: 0, slide: 0, holdDepth: 0, rewetLift: 0.02 }, 2), s = F.sheet;
  finePour(F, () => true, 0.03); F.fix();
  finePour(F, () => true, 0.07); F.fix();
  const lower = F.layers[0][0].slice(), top = F.layers[1][0].slice(), before = fineTotals(F);
  deposit(s, 0, 0.3); deposit(s, s.n - 1, F.o.film / 2);
  F.L.begin(1); F.step();
  assert.deepEqual(F.layers[0][0], lower);
  for (let c = 0; c < s.n; c++) for (let a = 0; a < F.N * F.N; a++) {
    const f = F.blockCells[c * F.N * F.N + a], lifted = c === 0 ? top[f] * 0.02 / PIG.omega : 0;
    close(F.G[0][f], lifted); close(F.layers[1][0][f], top[f] - lifted);
  }
  assert.ok(F.layers[1][1].every(v => v === 0), 'the shared absent-pigment plane stays empty');
  close(fineTotals(F), before);
});

test('fine hollow filling uses the pre-settling loose bed and keeps the physical landing terms', () => {
  const F = make(2, { slope: 0, flowIters: 0, lift: 0, scour: 0, slide: 0, holdDepth: 0, granFill: 4 }), s = F.sheet, dt = 0.1;
  for (let c = 0; c < s.n; c++) deposit(s, c, 0.2);
  finePour(F, () => true, 0.5); F.D[0].fill(0.2);
  const before = fineTotals(F);
  F.L.begin(dt); F.step();
  for (let f = 0; f < F.fn; f++) {
    const hol = F.paper.hollow[f] * Math.max(0, 1 - Math.fround(0.2) * 4);
    const down = 0.5 * settleShare(settleSpeed(PIG) * F.o.settle, settleDiffusion(PIG) * F.o.settle, PIG.gamma * F.o.gran, hol, dt, F.wa[f]);
    close(F.G[0][f], 0.5 - down); close(F.D[0][f], Math.fround(0.2) + down);
  }
  close(fineTotals(F), before);
});

test('the flux ledger and fine observer leave coarse water unchanged through moving wet fronts', () => {
  const F = make(4), s = F.sheet, ref = createSheet(s.paper, [PIG]), o = { ...F.o, dt: 0.1 };
  for (let i = 0; i < s.n; i++) if (i % 3) {
    deposit(s, i, 0.02 + 0.01 * i); deposit(ref, i, s.W[i], [0.07]);
  }
  finePour(F, () => true, 0.07);
  for (let t = 0; t < 20; t++) {
    step(s, o); F.step(); step(ref, o);
    assert.deepEqual(s.W, ref.W); assert.deepEqual(s.s, ref.s); assert.deepEqual(s.M, ref.M);
  }
});

test('DCT correction matches reconstructed divergence at every fine cell, with fixed coarse boundary fluxes', () => {
  for (const N of [2, 4, 8]) {
    const F = make(N, { flowIters: 0, slide: 0 }), s = F.sheet;
    for (let c = 0; c < s.n; c++) deposit(s, c, 0.2 + c * 0.001);
    F.L.begin(0.1);
    // A water transfer across one coarse face, plus evaporation in a different block.
    const src = 2 * s.w + 2, dst = src + 1, q = 0.04;
    F.L.fx[src] = q; s.W[src] -= q; s.W[dst] += q; s.W[1] *= 0.9;
    F.step();
    for (let c = 0; c < s.n; c++) {
      const values = [];
      let sumIn = 0, change = 0, water = 0;
      for (let a = 0; a < N * N; a++) {
        const f = F.blockCells[c * N * N + a], x = f % F.FW, y = Math.floor(f / F.FW);
        const incoming = (x ? F.FX[f - 1] : 0) - F.FX[f] + (y ? F.FY[f - F.FW] : 0) - F.FY[f];
        values.push([f, incoming]); sumIn += incoming; change += F.wa[f] - F.wb[f]; water += F.wb[f];
        if ((a % N) === N - 1) close(F.FX[f], N * F.L.fx[c], 1e-12);
        if (Math.floor(a / N) === N - 1) close(F.FY[f], N * F.L.fy[c], 1e-12);
      }
      const sink = sumIn - change;
      for (const [f, incoming] of values) close(F.wa[f] - F.wb[f], incoming - sink * F.wb[f] / water, 1e-10);
    }
  }
});

test('fineDeposit keeps angled wet fronts at fine resolution, conserves mass and clears mask on fix', () => {
  for (const N of [4, 8]) {
    const F = make(N, { edgeEvap: 0.0012, fixedBed: 1, slideCap: 1 }), s = F.sheet;
    const inside = (x, y) => x * 0.8 + y * 0.6 > 1.2 && x < 2.6 && y < 2.2;
    fineDeposit(F, inside, 0.3, 0.36);
    assert.ok(F.blockMaskCount.some(c => c > 0 && c < N * N), 'angled edge creates partially wet blocks');
    const before = fineTotals(F), mm = F.paper.mmPerCell;
    const partialBlocks = new Set();
    for (let c = 0; c < s.n; c++) if (F.blockMaskCount[c] > 0 && F.blockMaskCount[c] < N * N) partialBlocks.add(c);
    const steps = dry(s, 4000, F.o, { levelMax: 80, dt: 2, onStep: () => {
      F.step();
      for (let y = 0; y < F.FH; y++) for (let x = 0; x < F.FW; x++) {
        const f = y * F.FW + x, c = Math.floor(y / N) * s.w + Math.floor(x / N);
        if (F.blockMaskCount[c] > 0 && !F.M[f]) assert.ok(F.G[0][f] < 1e-5, 'film suspension stays inside partial-block fine mask');
      }
    } });
    assert.ok(steps > 0 && steps < 4000);
    F.fix();
    close(fineTotals(F), before, 1e-6);
    const plane = F.layers[0][0];
    let dryHalfMax = 0, dryHalfSum = 0, dryHalfCount = 0, wetHalfSum = 0, wetHalfCount = 0;
    for (let y = 0; y < F.FH; y++) for (let x = 0; x < F.FW; x++) {
      const c = Math.floor(y / N) * s.w + Math.floor(x / N);
      if (!partialBlocks.has(c)) continue;
      const v = plane[y * F.FW + x];
      if (inside((x + 0.5) * mm, (y + 0.5) * mm)) { wetHalfSum += v; wetHalfCount++; }
      else { dryHalfMax = Math.max(dryHalfMax, v); dryHalfSum += v; dryHalfCount++; }
    }
    const wetMean = wetHalfSum / wetHalfCount, dryMean = dryHalfSum / dryHalfCount;
    assert.ok(dryMean < 0.01 * wetMean && dryHalfMax < 0.15 * wetMean, `dry side of partial blocks (mean ${dryMean}, max ${dryHalfMax}) stays crisp against wet side (${wetMean})`);
    assert.ok(F.blockMaskCount.every(c => c === 0) && F.M.every(v => v === 0), 'fix clears the passage wet mask');
    assert.ok(F.blockEverCount.every(c => c === 0) && F.ever.every(v => v === 0), 'fix clears the passage ever mask');
  }
});

test('partial fine masks keep back-runs and pores inside the wash footprint and smooth advancing fronts', () => {
  const N = 4, mm = 0.52 / N, w = 10, h = 10;
  const s = createSheet(paper(w, h, 0.52), [PIG]);
  const F = attachFine(s, paper(w * N, h * N, mm), N, { ...DEFAULTS, edgeEvap: 0.0012, fixedBed: 1, granFill: 0, slideCap: 1 });
  // Angled puddle next to a damp angled strip triggers both back-run and capillary pore passes on partial blocks.
  const puddle = (x, y) => (x - 2.2) * Math.cos(0.5) + (y - 2.2) * Math.sin(0.5) < 0 && x > 0.6 && y > 0.6 && x < 4.4 && y < 4.4;
  const damp = (x, y) => (x - 2.2) * Math.cos(0.5) + (y - 2.2) * Math.sin(0.5) >= 0.55 && (x - 2.2) * Math.cos(0.5) + (y - 2.2) * Math.sin(0.5) < 2.2 && x > 0.6 && y > 0.6 && x < 4.4 && y < 4.4;
  fineDeposit(F, puddle, 0.30, 0.3);
  fineDeposit(F, damp, 0.035, 0.2);
  // Bridge the coarse face directly so a 0.30 mm puddle block borders a 0.035 mm damp block.
  for (let c = 0; c < s.n; c++) if (s.M[c] && s.W[c] > 0.2) { const nb = c + 1; if (nb < s.n && !s.M[nb]) fineDeposit(F, (x, y) => Math.floor(x / 0.52) === nb % w && Math.floor(y / 0.52) === Math.floor(nb / w) && ((x % 0.52) + (y % 0.52) < 0.6), 0.035, 0.2); }
  // Pre-load pores on wet blocks above capEps so capillary spread runs immediately alongside the back-run.
  for (let c = 0; c < s.n; c++) if (s.M[c]) s.s[c] = 0.55 * s.paper.capacity[c];
  const initEver = Uint8Array.from(F.ever), before = fineTotals(F);
  let sawBackrun = false, sawPores = false;
  for (let t = 0; t < 200; t++) {
    if (!step(s, { ...F.o, dt: t < 15 ? 0.1 : 1 })) break;
    if (F.L.backruns.length) sawBackrun = true;
    if (F.L.pores.events.length) sawPores = true;
    F.step();
  }
  assert.ok(sawBackrun && sawPores, `test must exercise both back-runs (${sawBackrun}) and capillary pores (${sawPores})`);
  close(fineTotals(F), before, 1e-6);
  // Dry fine cells inside partially wet blocks must receive zero pigment from back-runs or pores.
  for (let c = 0; c < s.n; c++) {
    if (F.blockEverCount[c] === 0 || F.blockEverCount[c] === N * N) continue;
    for (let a = 0; a < N * N; a++) {
      const f = F.blockCells[c * N * N + a];
      if (!initEver[f]) assert.equal(F.G[0][f] + F.P[0][f] + F.D[0][f], 0, `dry cell ${f} in partial block ${c} stayed clean`);
    }
  }
  // Expanding coarse front into a dry block beside a masked block initializes a partial fine mask smoothly.
  const s2 = createSheet(paper(8, 8, 0.52), [PIG]);
  const F2 = attachFine(s2, paper(8 * N, 8 * N, mm), N, { ...DEFAULTS, spill: 0.2, edgeEvap: 0 });
  fineDeposit(F2, (x, y) => x > 1 && x < 2.25 && y > 1 && y < 2.8, 0.6, 0.2);
  const dryBefore = Array.from({ length: s2.n }, (_, c) => !s2.M[c]);
  step(s2, { ...F2.o, dt: 0.1 });
  const expanded = [];
  for (let c = 0; c < s2.n; c++) if (dryBefore[c] && s2.M[c]) expanded.push(c);
  assert.ok(expanded.length > 0, 'coarse front expanded into dry blocks');
  F2.step();
  assert.ok(expanded.some(c => F2.blockMaskCount[c] > 0 && F2.blockMaskCount[c] < N * N), 'advancing front wets a smooth sub-coarse subset rather than popping full blocks');
});
