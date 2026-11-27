// Two grids, phase (b) prototype: pigment on a grid N times finer than the water.
//
// The coarse sheet (src/media/sheet.mjs) runs its water exactly as today and carries no pigment. Each step it writes
// what its water did into a ledger (sheet._flux): the water every face carried (lubrication levelling, edge feed,
// explicit flow), the pore water every face carried (capillary spread), the share of each cell's film the pores drank,
// the share of each cell's pore water that dried, the turnover, and the cells that dried. This module then moves the
// pigment on the fine grid with the same physics the coarse step uses:
//   1. the fine film depth is the coarse film levelled over the fine relief (its surface interpolated between coarse
//      cells, the depth the surface minus the fine paper), each block's mean held to its coarse cell's depth exactly;
//   2. the coarse face fluxes are downscaled to fine faces by lowest-order Raviart-Thomas interpolation (the flux varies
//      linearly across a block, so every fine cell takes the coarse divergence), plus a correction inside each block, the
//      Neumann potential flow (DCT solve) that carries the remainder, so the fine water goes from its reconstruction
//      before the step to its reconstruction after it exactly; the pigment rides at the donor's concentration;
//   3. absorption, Stokes settling with Brownian deposition and residence-time hollow capture (settling.mjs), lift and
//      scour, stranding in a thin film, and the slide of settled grains down the fine relief run per fine cell.
// Pigment is conserved exactly: every move is a face transfer or an exchange inside a cell.
import { materialFine } from './fine-material.mjs';
import { carryFine, diffuseFine } from './fine-transport.mjs';
import { recordFineBackrun, applyFineBackrun } from './fine-backrun.mjs';
import { poreLedger, replayPores } from './fine-pore.mjs';
import { filmLedger, replayFilm, absorbFine } from './fine-film.mjs';
import { resetEdgeFeed } from './edge-feed.mjs';

// orthonormal DCT-II matrix and the Neumann grid Laplacian's eigenvalues, for the in-block potential solve
function dctOf(N) {
  const C = new Float64Array(N * N), lam = new Float64Array(N);
  for (let k = 0; k < N; k++) { lam[k] = 2 - 2 * Math.cos(Math.PI * k / N); for (let x = 0; x < N; x++) C[k * N + x] = (k ? Math.sqrt(2 / N) : Math.sqrt(1 / N)) * Math.cos(Math.PI * k * (x + 0.5) / N); }
  return { C, lam };
}

export function attachFine(sheet, fpaper, N, o) {
  if (!Number.isInteger(N) || N < 2) throw new Error('fine ratio must be an integer of at least 2');
  if (sheet._flux || sheet._gpu) throw new Error('fine pigment requires an unattached CPU sheet');
  if ((o.marangoni ?? 0) !== 0) throw new Error('fine pigment cannot decouple pigment-driven Marangoni water flow');
  const { w, h, n, K, pigments } = sheet, FW = w * N, FH = h * N, fn = FW * FH;
  if (fpaper.w !== FW || fpaper.h !== FH) throw new Error(`fine paper must be ${FW} x ${FH}`);
  const coarseMm = o.mmPerCell > 0 ? o.mmPerCell : sheet.paper.mmPerCell > 0 ? sheet.paper.mmPerCell : 0.3;
  if (!(fpaper.mmPerCell > 0) || Math.abs(fpaper.mmPerCell * N - coarseMm) > 1e-12 * coarseMm) throw new Error('fine paper must cover the same physical extent as the water grid');
  if ([sheet.G, sheet.P, sheet.D, ...sheet.layers].some(planes => planes.some(a => a.some(v => v !== 0)))) throw new Error('fine pigment requires a pigment-free coarse sheet');
  const f32 = () => new Float32Array(fn), f64 = () => new Float64Array(fn);
  const F = {
    sheet, paper: fpaper, N, o, FW, FH, fn, K, ms: 0,
    G: pigments.map(f32), P: pigments.map(f32), D: pigments.map(f32), layers: [],
    M: new Uint8Array(fn), blockMaskCount: new Uint16Array(n), maskVersion: 0,
    ever: new Uint8Array(fn), blockEverCount: new Uint16Array(n), everVersion: 0,
    wb: f32(), wa: f32(), donors: new Uint32Array(fn), sb: f32(), sa: f32(), FX: f64(), FY: f64(), r: f64(), dg: f64(), out: f64(),
    cells: new Uint32Array(fn), wetCells: new Uint32Array(fn), blockCells: new Uint32Array(fn),
    dct: dctOf(N), blk: new Float64Array(N * N), tmp: new Float64Array(N * N),
  };
  // Block order is fixed; each step builds only the active prefix, without per-block JS arrays.
  for (let c = 0; c < n; c++) {
    const base = Math.floor(c / w) * N * FW + (c % w) * N;
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) F.blockCells[c * N * N + b * N + a] = base + b * FW + a;
  }
  const Z = () => new Float64Array(n), Z32 = () => new Float32Array(n);
  const L = { fx: Z(), fy: Z(), px: Z(), py: Z(), aw: Z32(), pd: Z32(), turn: Z32(), catch: Z32(), dried: new Uint8Array(n), W0: Z32(), s0: Z32(), M0: new Uint8Array(n), backruns: [], dt: 0, steps: 0 };
  L.pores = poreLedger(sheet); L.film = filmLedger(sheet); L.catchX = Z32(); L.catchY = Z32();
  L.backrun = event => recordFineBackrun(F, event);
  L.begin = dt => {
    if (L.steps) throw new Error('two grids: a coarse step ran twice without the fine step (time chunks are not supported in the prototype)');
    L.dt = dt; L.steps = 1;
    L.backruns.length = 0;
    L.pores.reset();
    L.film.reset();
    L.fx.fill(0); L.fy.fill(0); L.px.fill(0); L.py.fill(0); L.aw.fill(0); L.pd.fill(0); L.catch.fill(0); L.dried.fill(0); L.turn.fill(0);
    L.W0.set(sheet.W); L.s0.set(sheet.s); L.M0.set(sheet.M);
  };
  sheet._flux = L; F.L = L;
  F.prepareContact = blocks => {
    if (L.steps) throw new Error('two grids: consume the coarse step before brush contact');
    reconstruct(F, sheet.W, sheet.M, sheet.s, F.wa, F.sa, blocks);
  };
  F.step = () => {
    if (F._gpuResident) throw new Error('two grids: sync resident GPU state before CPU step');
    if (L.steps !== 1) throw new Error('two grids: no coarse step to consume');
    const t = performance.now(); L.steps = 2;
    try {
      for (const op of fineStep(F)) {
        if (op.kind === 'film') {
          if (!op.args[3]) carryFine(F, F.G, op.args[0], op.args[1]);
          diffuseFine(F, op.args[1]);
          materialFine(F, op.args[1], op.args[2]);
        }
        else if (op.kind === 'carry') carryFine(F, ...op.args);
        else if (op.kind === 'diffuse') diffuseFine(F, ...op.args);
        else if (op.kind === 'flux') fineFluxes(F, ...op.args);
        else if (op.kind === 'reconstruct' || op.kind === 'reconstructFilm') reconstruct(F, ...op.args);
        else if (op.kind === 'waterCopy') {
          op.args[1].set(op.args[0]);
          if (op.args[2]) reconstructPores(F, op.args[2], op.args[3], op.args[4]);
        }
        else if (op.kind === 'absorb') absorbFine(F, ...op.args);
        else if (op.kind === 'backrun') applyFineBackrun(F, ...op.args);
        else if (op.kind === 'dryPhase') applyDryPhase(F, ...op.args);
        else materialFine(F, ...op.args);
      }
      L.steps = 0;
    } finally { F.ms += performance.now() - t; }
  };
  // The asynchronous transport backend consumes the same phase schedule. Water reconstruction,
  // material exchanges and chronology remain shared with the CPU oracle. A failed/in-flight
  // step stays unconsumed: neither another coarse step nor fixing may conceal partial work.
  F.stepAsync = async (transport, opts = null) => {
    if (L.steps !== 1) throw new Error('two grids: no coarse step to consume');
    const t = performance.now(); L.steps = 2;
    try {
      const advance = async op => {
        if (op.kind === 'film' && !transport.film) {
          if (!op.args[3]) await transport.carry(F, F.G, op.args[0], op.args[1]);
          await transport.diffuse(F, op.args[1]);
          if (transport.material) await transport.material(F, op.args[1], op.args[2]);
          else materialFine(F, op.args[1], op.args[2]);
        }
        else if (op.kind === 'flux' && !transport.flux) fineFluxes(F, ...op.args);
        else if (op.kind === 'material' && !transport.material) materialFine(F, ...op.args);
        else if (op.kind === 'reconstruct' && !transport.reconstruct) reconstruct(F, ...op.args);
        else if (op.kind === 'reconstructFilm') {
          if (transport.reconstruct) await transport.reconstruct(F, ...op.args);
          else reconstruct(F, ...op.args);
        }
        else if (op.kind === 'waterCopy') {
          op.args[1].set(op.args[0]);
          if (op.args[2]) reconstructPores(F, op.args[2], op.args[3], op.args[4]);
        }
        else if (op.kind === 'absorb') absorbFine(F, ...op.args);
        else if (op.kind === 'backrun') applyFineBackrun(F, ...op.args);
        else if (op.kind === 'dryPhase') applyDryPhase(F, ...op.args);
        else await transport[op.kind](F, ...op.args);
      };
      if (transport.sequence) await transport.sequence(F, fineStep(F), advance, opts);
      else for (const op of fineStep(F)) await advance(op);
      L.steps = 0;
    } finally { F.ms += performance.now() - t; }
  };
  F.fix = () => {
    if (F._gpuResident) throw new Error('two grids: sync resident GPU state before fixing pigment');
    if (L.steps) throw new Error('two grids: consume the coarse step before fixing pigment');
    fineFix(F);
  };
  return F;
}

/** Pour: `amount` of pigment 0 on every fine cell whose centre is inside(x mm, y mm). */
export function finePour(F, inside, amount, k = 0) {
  const mm = F.paper.mmPerCell;
  for (let y = 0; y < F.FH; y++) for (let x = 0; x < F.FW; x++) if (inside((x + 0.5) * mm, (y + 0.5) * mm)) F.G[k][y * F.FW + x] += amount;
}
/** Deposit a smooth fine-resolution wet footprint and optional pigment, setting coarse film depth without stair-steps. */
export function fineDeposit(F, inside, waterDepth, amount = 0, k = 0) {
  const s = F.sheet, { w } = s, N = F.N, mm = F.paper.mmPerCell;
  let changed = false, everChanged = false;
  for (let c = 0; c < s.n; c++) {
    const cx = c % w, cy = (c - cx) / w, fx0 = cx * N, fy0 = cy * N;
    let added = 0, count = 0, everCount = 0;
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
      const f = (fy0 + b) * F.FW + fx0 + a;
      if (inside((fx0 + a + 0.5) * mm, (fy0 + b + 0.5) * mm)) {
        if (!F.M[f]) { F.M[f] = 1; changed = true; }
        if (!F.ever[f]) { F.ever[f] = 1; everChanged = true; }
        if (amount) F.G[k][f] += amount;
        added++;
      }
      if (F.M[f]) count++;
      if (F.ever[f]) everCount++;
    }
    F.blockMaskCount[c] = count;
    F.blockEverCount[c] = everCount;
    if (added && waterDepth > 0) {
      s.W[c] += waterDepth; s.M[c] = 1; s.ever[c] = 1; s.wetDirty = 1;
    }
  }
  if (changed) F.maskVersion++;
  if (everChanged) F.everVersion++;
}
/** Physical sheet water volume in coarse-cell units, weighting partially wet boundary blocks by their fine wet share. */
export function fineWaterTotal(F) {
  const s = F.sheet, nn = F.N * F.N;
  let total = 0;
  for (let c = 0; c < s.n; c++) {
    const cnt = F.blockMaskCount[c], share = cnt > 0 && cnt < nn ? cnt / nn : 1;
    total += s.W[c] * share + s.s[c];
  }
  return total;
}
/** Pigment totals in coarse units (a coarse cell is the mean of its N x N fine cells). */
export function fineTotals(F, k = 0) {
  let t = 0; for (const A of [F.G, F.P, F.D, ...F.layers]) { const a = A[k]; for (let i = 0; i < F.fn; i++) t += a[i]; }
  return t / (F.N * F.N);
}
/** Optical snapshots own the nonempty current planes; absent pigments share the same read-only zero as fixed layers. */
export function fineLayers(F) {
  const top = F.G.map((g, k) => {
    const d = F.D[k], p = F.P[k];
    if (!g.some(v => v !== 0) && !d.some(v => v !== 0) && !p.some(v => v !== 0)) return F.zeroLayer ??= new Float32Array(F.fn);
    return Float32Array.from(g, (v, i) => v + d[i] + p[i]);
  });
  return [...F.layers, top];
}
export function fineBytes(F) {
  const buffers = new Set();
  const visit = value => {
    if (value === F.paper || value === F.sheet) return;
    if (ArrayBuffer.isView(value)) buffers.add(value.buffer);
    else if (Array.isArray(value)) for (const v of value) visit(v);
    else if (value && typeof value === 'object') for (const v of Object.values(value)) visit(v);
  };
  for (const [key, value] of Object.entries(F)) if (!['sheet', 'paper', 'L', 'dct', '_gpuResident'].includes(key)) visit(value);
  visit(F.dct.C); visit(F.dct.lam);
  for (const value of Object.values(F.L)) visit(value);
  return [...buffers].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
}

// the coarse cells this step touched: water or pore water before or after
function activeBlocks(F) {
  const s = F.sheet, L = F.L, list = [];
  for (let c = 0; c < s.n; c++) if (L.M0[c] || s.M[c] || L.s0[c] > 0 || s.s[c] > 0 || L.W0[c] > 0 || s.W[c] > 0 || L.pores.touched[c] || L.film.touched[c]) list.push(c);
  return list;
}

function reconstructPores(F, sc, outS, blocks) {
  const N = F.N, nn = N * N, capC = F.sheet.paper.capacity, capF = F.paper.capacity;
  for (const c of blocks) {
    const start = c * nn; let ssum = 0;
    for (let a = 0; a < nn; a++) { const f = F.blockCells[start + a], sv = sc[c] * capF[f] / capC[c]; outS[f] = sv; ssum += sv; }
    const ks = ssum > 0 ? sc[c] * nn / ssum : 0;
    for (let a = 0; a < nn; a++) outS[F.blockCells[start + a]] *= ks;
  }
}

// The coarse film levelled over the fine relief: the surface (depth + slope x height) is interpolated bilinearly between
// the wet coarse cells round a fine cell, the fine depth is that surface over the fine paper, and each block's wet fine
// cells are scaled to its coarse physical depth. When a block carries a sub-coarse fine wet mask (0 < count < N^2), dry
// fine cells stay at zero depth so angled fronts keep fine-cell geometry without stair-steps. Pore water follows fine capacity.
function reconstruct(F, Wc, Mc, sc, outW, outS, blocks) {
  const s = F.sheet, { w, h } = s, N = F.N, nn = N * N, FW = F.FW, slope = F.o.slope ?? 0;
  const hc = s.paper.surface || s.paper.valley || s.paper.height, hf = F.paper.surface || F.paper.valley || F.paper.height;
  const capC = s.paper.capacity, capF = F.paper.capacity, Fm = F.M, counts = F.blockMaskCount;
  for (const c of blocks) {
    const cx = c % w, cy = (c - cx) / w, fx0 = cx * N, fy0 = cy * N;
    const wet = Mc[c] && Wc[c] > 0;
    const maskCount = counts[c], partial = maskCount > 0 && maskCount < nn;
    let sum = 0, ssum = 0;
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
      const f = (fy0 + b) * FW + fx0 + a;
      const cellWet = wet && (!partial || Fm[f] !== 0);
      let d = 0;
      if (cellWet) {
        // fine centre in coarse-centre coordinates
        const u = cx + (a + 0.5) / N - 0.5, v = cy + (b + 0.5) / N - 0.5, ux = Math.floor(u), vy = Math.floor(v), tx = u - ux, ty = v - vy;
        let S = 0, ws = 0;
        for (let q = 0; q < 4; q++) {
          const xx = ux + (q & 1), yy = vy + (q >> 1); if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx; if (!(Mc[j] && Wc[j] > 0)) continue;
          const wt = ((q & 1) ? tx : 1 - tx) * ((q >> 1) ? ty : 1 - ty); S += wt * (Wc[j] + slope * hc[j]); ws += wt;
        }
        S = ws > 0 ? S / ws : Wc[c] + slope * hc[c];
        d = Math.max(0, S - slope * hf[f]);
      }
      outW[f] = d; sum += d;
      const sv = sc[c] * capF[f] / capC[c]; outS[f] = sv; ssum += sv;
    }
    const wetCells = partial ? maskCount : nn;
    const want = Wc[c] * wetCells, k = wet ? (sum > 0 ? want / sum : 0) : 0, swant = sc[c] * nn, ks = ssum > 0 ? swant / ssum : 0;
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
      const f = (fy0 + b) * FW + fx0 + a;
      const cellWet = wet && (!partial || Fm[f] !== 0);
      outW[f] = cellWet ? (sum > 0 ? outW[f] * k : Wc[c]) : 0; outS[f] *= ks;
    }
  }
}

// Fine face fluxes from coarse ones (RT0) plus the in-block Neumann potential correction, so the fine water goes from
// wb to wa exactly with the block's sink spread over its water. Partially masked boundary blocks mask dry fine faces
// to zero and solve the exact Neumann graph Laplacian on the wet fine subset via conjugate gradients.
function fineFluxes(F, fxc, fyc, wb, wa, blocks, maskMode = 'film') {
  const s = F.sheet, { w, h } = s, N = F.N, nn = N * N, FW = F.FW, { FX, FY, r, blk, tmp } = F, { C, lam } = F.dct;
  const ignoreMask = maskMode === true || maskMode === 'none';
  const useEver = maskMode === 'ever';
  const Fm = useEver ? F.ever : F.M, counts = useEver ? F.blockEverCount : F.blockMaskCount;
  const cellIn = (c, f) => {
    if (ignoreMask) return true;
    const cnt = counts[c];
    return cnt === 0 || cnt === nn || Fm[f] !== 0;
  };
  const wet = new Uint8Array(nn), cgR = new Float64Array(nn), cgP = new Float64Array(nn), cgAp = new Float64Array(nn);
  for (const c of blocks) {
    const cx = c % w, cy = (c - cx) / w, fx0 = cx * N, fy0 = cy * N;
    const FL = cx > 0 ? fxc[c - 1] : 0, FR = fxc[c], FT = cy > 0 ? fyc[c - w] : 0, FB = fyc[c];
    let wetCount = 0, uniformBdry = true;
    if (!ignoreMask) {
      for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
        const f = (fy0 + b) * FW + fx0 + a, wf = cellIn(c, f) ? 1 : 0;
        wet[b * N + a] = wf; wetCount += wf;
        if (a === 0 && FL !== 0 && !(wf && cx > 0 && cellIn(c - 1, f - 1))) uniformBdry = false;
        if (a === N - 1 && FR !== 0 && !(wf && cx + 1 < w && cellIn(c + 1, f + 1))) uniformBdry = false;
        if (b === 0 && FT !== 0 && !(wf && cy > 0 && cellIn(c - w, f - FW))) uniformBdry = false;
        if (b === N - 1 && FB !== 0 && !(wf && cy + 1 < h && cellIn(c + w, f + FW))) uniformBdry = false;
      }
    } else wetCount = nn;
    if (wetCount === nn && uniformBdry) {
      for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
        const f = (fy0 + b) * FW + fx0 + a;
        FX[f] = N * (FL + (FR - FL) * (a + 1) / N);
        FY[f] = N * (FT + (FB - FT) * (b + 1) / N);
        if (a === 0 && cx > 0) FX[f - 1] = N * FL;
        if (b === 0 && cy > 0) FY[f - FW] = N * FT;
      }
      continue;
    }
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
      const f = (fy0 + b) * FW + fx0 + a, wf = wet[b * N + a];
      FX[f] = a === N - 1 && cx + 1 < w && wf && cellIn(c + 1, f + 1) ? N * FR : 0;
      FY[f] = b === N - 1 && cy + 1 < h && wf && cellIn(c + w, f + FW) ? N * FB : 0;
      if (a === 0 && cx > 0) FX[f - 1] = wf && cellIn(c - 1, f - 1) ? N * FL : 0;
      if (b === 0 && cy > 0) FY[f - FW] = wf && cellIn(c - w, f - FW) ? N * FT : 0;
    }
  }
  for (const c of blocks) {
    const cx = c % w, cy = (c - cx) / w, fx0 = cx * N, fy0 = cy * N;
    let netIn = 0, dw = 0, sb = 0, sa = 0, wetCount = 0;
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
      const f = (fy0 + b) * FW + fx0 + a, wf = cellIn(c, f) ? 1 : 0;
      wet[b * N + a] = wf; wetCount += wf;
      const inn = (fx0 + a > 0 ? FX[f - 1] : 0) - FX[f] + (fy0 + b > 0 ? FY[f - FW] : 0) - FY[f];
      r[f] = inn;
      if (wf) { netIn += inn; dw += wa[f] - wb[f]; sb += wb[f]; sa += wa[f]; }
    }
    if (wetCount === 0) continue;
    const sink = netIn - dw, base = sb > 0 ? wb : sa > 0 ? wa : null, bs = sb > 0 ? sb : sa;
    let any = false;
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
      const at = b * N + a, f = (fy0 + b) * FW + fx0 + a;
      if (!wet[at]) { blk[at] = 0; continue; }
      const sk = base ? sink * base[f] / bs : sink / wetCount;
      const res = (wa[f] - wb[f]) - r[f] + sk; blk[at] = -res; if (Math.abs(res) > 1e-12) any = true;
    }
    if (!any || N < 2) continue;
    if (wetCount === nn) {
      // phi = C^T (C (-r) C^T / lambda) C
      for (let p = 0; p < N; p++) for (let x = 0; x < N; x++) { let v = 0; for (let y = 0; y < N; y++) v += C[p * N + y] * blk[y * N + x]; tmp[p * N + x] = v; }
      for (let p = 0; p < N; p++) for (let q = 0; q < N; q++) { let v = 0; for (let x = 0; x < N; x++) v += tmp[p * N + x] * C[q * N + x]; const l = lam[p] + lam[q]; blk[p * N + q] = l > 0 ? v / l : 0; }
      for (let y = 0; y < N; y++) for (let q = 0; q < N; q++) { let v = 0; for (let p = 0; p < N; p++) v += C[p * N + y] * blk[p * N + q]; tmp[y * N + q] = v; }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0; for (let q = 0; q < N; q++) v += tmp[y * N + q] * C[q * N + x]; blk[y * N + x] = v; }
      for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
        const f = (fy0 + b) * FW + fx0 + a, ph = blk[b * N + a];
        if (a < N - 1) FX[f] += ph - blk[b * N + a + 1];
        if (b < N - 1) FY[f] += ph - blk[(b + 1) * N + a];
      }
      continue;
    }
    // Masked Neumann graph Laplacian L * phi = blk on the wet subset (zero flux across wet/dry contact faces).
    let mean = 0;
    for (let i = 0; i < nn; i++) if (wet[i]) mean += blk[i];
    mean /= wetCount;
    let rr = 0;
    for (let i = 0; i < nn; i++) { const rv = wet[i] ? blk[i] - mean : 0; cgR[i] = rv; cgP[i] = rv; blk[i] = 0; rr += rv * rv; }
    const tol = Math.max(1e-24, rr * 1e-18);
    for (let it = 0; it < nn && rr > tol; it++) {
      let pAp = 0, pp = 0;
      for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
        const i = b * N + a;
        if (!wet[i]) { cgAp[i] = 0; continue; }
        const pi = cgP[i]; let v = 0;
        if (a > 0 && wet[i - 1]) v += pi - cgP[i - 1];
        if (a + 1 < N && wet[i + 1]) v += pi - cgP[i + 1];
        if (b > 0 && wet[i - N]) v += pi - cgP[i - N];
        if (b + 1 < N && wet[i + N]) v += pi - cgP[i + N];
        cgAp[i] = v; pAp += pi * v; pp += pi * pi;
      }
      if (!(pAp > 1e-12 * pp) || !(pAp > 1e-30)) break;
      const alpha = rr / pAp; let rrNew = 0;
      for (let i = 0; i < nn; i++) if (wet[i]) { blk[i] += alpha * cgP[i]; cgR[i] -= alpha * cgAp[i]; rrNew += cgR[i] * cgR[i]; }
      if (!(rrNew > tol)) break;
      const beta = rrNew / rr;
      for (let i = 0; i < nn; i++) if (wet[i]) cgP[i] = cgR[i] + beta * cgP[i];
      rr = rrNew;
    }
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
      const i = b * N + a, f = (fy0 + b) * FW + fx0 + a, ph = blk[i];
      if (!wet[i]) continue;
      if (a < N - 1 && wet[i + 1]) FX[f] += ph - blk[i + 1];
      if (b < N - 1 && wet[i + N]) FY[f] += ph - blk[i + N];
    }
  }
}


// When a coarse wet front advances into an initially dry coarse block beside a sub-coarse fine mask,
// wet its fine cells along the interpolated coarse wet level-set and fine relief instead of popping an N x N square.
function advanceFineMask(F, blocks) {
  if (!F.maskVersion) return;
  const s = F.sheet, L = F.L, { w, h } = s, N = F.N, nn = N * N, FW = F.FW;
  const hf = F.paper.surface || F.paper.valley || F.paper.height;
  let maskChanged = false, everChanged = false;
  for (const c of blocks) {
    if (L.M0[c] || !s.M[c] || F.blockMaskCount[c] !== 0) continue;
    const cx = c % w, cy = (c - cx) / w;
    let maskedNeighbor = false;
    if (cx > 0 && L.M0[c - 1] && F.blockMaskCount[c - 1] > 0) maskedNeighbor = true;
    else if (cx + 1 < w && L.M0[c + 1] && F.blockMaskCount[c + 1] > 0) maskedNeighbor = true;
    else if (cy > 0 && L.M0[c - w] && F.blockMaskCount[c - w] > 0) maskedNeighbor = true;
    else if (cy + 1 < h && L.M0[c + w] && F.blockMaskCount[c + w] > 0) maskedNeighbor = true;
    if (!maskedNeighbor) continue;
    const fx0 = cx * N, fy0 = cy * N;
    let count = 0, everCount = 0;
    for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
      const f = (fy0 + b) * FW + fx0 + a;
      const u = cx + (a + 0.5) / N - 0.5, v = cy + (b + 0.5) / N - 0.5;
      const ux = Math.floor(u), vy = Math.floor(v), tx = u - ux, ty = v - vy;
      let mInterp = 0, wSum = 0;
      for (let q = 0; q < 4; q++) {
        const xx = ux + (q & 1), yy = vy + (q >> 1);
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx, wt = ((q & 1) ? tx : 1 - tx) * ((q >> 1) ? ty : 1 - ty);
        mInterp += wt * (L.M0[j] ? 1 : s.M[j] ? 0.5 : 0); wSum += wt;
      }
      const score = (wSum > 0 ? mInterp / wSum : 0.5) - 0.2 * (hf[f] - 0.5);
      const enters = (a === 0 && cx > 0 && F.M[f - 1]) || (a === N - 1 && cx + 1 < w && F.M[f + 1]) ||
        (b === 0 && cy > 0 && F.M[f - FW]) || (b === N - 1 && cy + 1 < h && F.M[f + FW]);
      if (enters || score >= 0.42) {
        F.M[f] = 1; count++; maskChanged = true;
        if (!F.ever[f]) { F.ever[f] = 1; everChanged = true; }
      }
      if (F.ever[f]) everCount++;
    }
    if (count === 0) {
      for (let a = 0; a < nn; a++) {
        const f = F.blockCells[c * nn + a];
        F.M[f] = 1; maskChanged = true;
        if (!F.ever[f]) { F.ever[f] = 1; everChanged = true; }
      }
      count = nn; everCount = nn;
    }
    F.blockMaskCount[c] = count;
    F.blockEverCount[c] = everCount;
  }
  if (maskChanged) F.maskVersion++;
  if (everChanged) F.everVersion++;
}

function applyDryPhase(F, blocks) {
  const s = F.sheet, L = F.L, nn = F.N * F.N, { K, G, P, D } = F;
  for (const c of blocks) {
    const pd = L.pd[c], dried = L.dried[c] || (!s.M[c] && L.M0[c]);
    if (!pd && !dried) continue;
    const start = c * nn;
    for (let k = 0; k < K; k++) {
      const p = P[k], d = D[k], g = G[k];
      for (let a = 0; a < nn; a++) {
        const f = F.blockCells[start + a];
        if (pd) { const q = p[f] * pd; p[f] -= q; d[f] += q; }
        if (dried) { d[f] += g[f]; g[f] = 0; }
      }
    }
  }
}

function* fineStep(F) {
  const s = F.sheet, L = F.L, dt = L.dt, N = F.N, pigments = s.pigments;
  if (!(dt > 0)) return;
  const blocks = activeBlocks(F); if (!blocks.length) return;
  advanceFineMask(F, blocks);
  const { wb, wa, sb, sa, G } = F;
  const mob = pigments.map(p => p.wick ?? Math.max(0.05, Math.min(0.9, 1 - p.gamma)));
  const nn = N * N, cellsOf = c => F.blockCells.subarray(c * nn, (c + 1) * nn);
  let nc = 0, nw = 0, hasFilm = L.film.events.length > 0 || L.backruns.length > 0;
  for (const c of blocks) {
    const cells = cellsOf(c); F.cells.set(cells, nc); nc += nn;
    if (L.M0[c] || s.M[c] || L.W0[c] > 0 || s.W[c] > 0) hasFilm = true;
    if (s.M[c]) {
      const cnt = F.blockMaskCount[c];
      if (cnt > 0 && cnt < nn) {
        for (let a = 0; a < nn; a++) { const f = cells[a]; if (F.M[f]) F.wetCells[nw++] = f; }
      } else {
        F.wetCells.set(cells, nw); nw += nn;
      }
    }
  }
  F.activeCells = F.cells.subarray(0, nc);
  F.activeWetCells = F.wetCells.subarray(0, nw);
  if (hasFilm) {
    if (L.film.recorded) yield* replayFilm(F, blocks, mob);
    else {
      yield { kind: 'reconstruct', args: [L.W0, L.M0, L.s0, wb, sb, blocks] };
      yield { kind: 'reconstruct', args: [s.W, s.M, s.s, wa, sa, blocks] };
      // Manual diagnostic ledgers may supply one aggregate phase. Ordinary
      // coarse steps always use the chronological records above.
      for (const event of L.backruns) {
        yield { kind: 'reconstruct', args: [event.beforeW, event.mask, L.s0, wa, sa, blocks] };
        yield { kind: 'flux', args: [event.fx, event.fy, wb, wa, blocks] };
        yield { kind: 'carry', args: [G, wb, wa] };
        yield { kind: 'backrun', args: [event] };
        yield { kind: 'reconstruct', args: [event.afterW, event.mask, L.s0, wb, sb, blocks] };
      }
      if (L.backruns.length) yield { kind: 'reconstruct', args: [s.W, s.M, s.s, wa, sa, blocks] };
      yield { kind: 'absorb', args: [L.aw, blocks, mob] };
    }
    // 2. the film's water carries its pigment: lubrication levelling, edge feed and explicit flow, downscaled
    const skipFinalCarry = L.film.recorded && !F.finalRedistributed;
    if (!skipFinalCarry) yield { kind: 'flux', args: [L.fx, L.fy, wb, wa, blocks] };
    // These phases are adjacent: a backend may keep suspension resident until
    // all three finish. CPU exchanges resume only after their shared boundary.
    yield { kind: 'film', args: [wb, wa, blocks, skipFinalCarry] };
  }
  // 4. capillary spread: the pore water carries its pigment; fibres catch some where it enters dry paper
  yield* replayPores(F);
  // 5. damp paper dries (its pore pigment stays on the fibres); a cell that dried leaves its suspension on the paper
  let anyDry = false, maskCleared = false;
  for (const c of blocks) {
    const pd = L.pd[c], dried = L.dried[c] || (!s.M[c] && L.M0[c]);
    if (pd || dried) anyDry = true;
    if (dried && !s.M[c] && F.blockMaskCount[c]) {
      const start = c * nn;
      for (let a = 0; a < nn; a++) F.M[F.blockCells[start + a]] = 0;
      F.blockMaskCount[c] = 0; maskCleared = true;
    }
  }
  if (anyDry) yield { kind: 'dryPhase', args: [blocks] };
  if (maskCleared) F.maskVersion++;
}

function fineFix(F) {
  resetEdgeFeed(F.sheet);
  for (let k = 0; k < F.K; k++) { const P = F.P[k], D = F.D[k], G = F.G[k]; for (let i = 0; i < F.fn; i++) { D[i] += P[i] + G[i]; P[i] = 0; G[i] = 0; } }
  if (F.blockMaskCount.some(v => v !== 0)) { F.M.fill(0); F.blockMaskCount.fill(0); F.maskVersion++; }
  if (F.blockEverCount.some(v => v !== 0)) { F.ever.fill(0); F.blockEverCount.fill(0); F.everVersion++; }
  if (!F.D.some(d => d.some(v => v !== 0))) return;
  F.layers.push(F.D.map(d => d.some(v => v !== 0) ? Float32Array.from(d) : (F.zeroLayer ??= new Float32Array(F.fn))));
  // The pigment-free coarse fix cannot see this layer. Close its old wash footprint here,
  // otherwise an earlier passage's contact line keeps shaping evaporation in the next glaze.
  F.sheet.ever.fill(0);
  for (const d of F.D) d.fill(0);
}
