// One step of sheet.mjs's stepBox, cut into phases that row bands run side by side (sheet-par.mjs), bit-identical to
// a serial step. Cross-band face sums are added by the receiving band in raster order; writes another band reads wait
// for the next phase; the wet front's in-place scan uses recomputed or snapshotted neighbour rows. The chamfer edge
// distance is capped at edgeWidth + 1 so each band recomputes nearby rows privately. DOM free, no Node imports.

// ctrl (Int32) layout
export const GEN = 0, PHASE = 1, SHEET = 2, DONE = 3, ERR = 4, NT = 5, READY = 6, NCH = 8;
const NXT = 7;
export const BOX = 16, IT = 20, ITERS = 21, LAST = 22, NA = 23, N3 = 24, NGROUP = 25;
const NK = 26;
export const MAXT = 64, MAXC = 256, MAXK = 64;
export const BAND = 64, ACT = BAND + 2 * MAXC, ACT3 = ACT + MAXK, GROUP = ACT3 + MAXK, GREP = GROUP + MAXK, MV = GREP + MAXK, AF = MV + MAXK, DF = AF + MAXK, TF = DF + MAXK, CTRL_LEN = TF + MAXK;
// prm (Float64) layout: the step's constants, worked out on the main thread exactly as stepBox works them out
export const P = {
  dt: 0, edgeWidth: 1, evap: 2, edgeEvap: 3, absorb: 4, film: 5, ff: 6, flowDepth: 7, flow: 8, slope: 9, mar: 10,
  diffuse: 11, cd: 12, gran: 13, liftDepth: 14, scour: 15, holdCap: 16, settle: 17, lift: 18, looseLift: 19,
  rewetLift: 20, granFill: 21, slide: 22, fill: 23, repose: 24, capStep: 25, sizing: 26, filter: 27, capEps: 28,
  capDelta: 29, wetEps: 30, paperDry: 31, capSigma: 32, spill: 33, spillHeight: 34, dampEase: 35, pinning: 36,
  pinFibre: 37, hasTop: 38, hasResist: 39, enclose: 40, slideCap: 41, holeSpan: 42, holeFill: 43, filmDiff: 44, filmDepth: 45,
};
export const PK = 64, PKS = 10; // per pigment: mobility, rho, omega, gamma, gg, lift, scour, rep, floc
export const PRM_LEN = PK + PKS * MAXK;
export const PH = { A: 1, B: 2, F0: 3, F1: 4, F2: 5, F3: 6, S3: 7, SL: 8, AP: 9, P5: 10, PM: 11, JOB: 12, QUIT: 99 };

const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
// holeSpan (sheet.mjs stepBox): a dry cell held by covered paper within R cells on all four sides is a hole, not an edge
function heldHole(M, ever, w, h, x, y, R) {
  for (let d = 0; d < 4; d++) {
    let held = false;
    for (let k = 1; k <= R; k++) {
      const xx = x + DX[d] * k, yy = y + DY[d] * k; if (xx < 0 || yy < 0 || xx >= w || yy >= h) break;
      const j = yy * w + xx; if (M[j] || ever[j]) { held = true; break; }
    }
    if (!held) return false;
  }
  return true;
}

// buffers each thread keeps to itself
const PRIV = { E: new Float32Array(0), ex: new Float32Array(4), la: new Int32Array(MAXK) };
const grow = (a, n, T = Float32Array) => (a.length >= n ? a : new T(Math.max(n, Math.ceil(a.length * 1.5))));

// Work goes out in more chunks than threads, claimed by compare-and-swap on a counter carrying the phase's generation,
// so a late thread finds nothing to claim and a slow one takes fewer.
export function claim(ctrl, g) {
  const tag = (g & 0xfffff) << 10;
  for (;;) {
    const v = Atomics.load(ctrl, NXT);
    if ((v & ~1023) !== tag) return -1;
    const c = v & 1023; if (c >= ctrl[NCH]) return -1;
    if (Atomics.compareExchange(ctrl, NXT, v, v + 1) === v) return c;
  }
}
export const openPhase = (ctrl, g, nChunks) => { ctrl[NCH] = nChunks; Atomics.store(ctrl, NXT, (g & 0xfffff) << 10); };

/** Run one chunk of a phase: phase A's share of rows, or band c of the box's bands for the others. */
export function runChunk(C, c, phase) {
  if (phase === PH.A) return phaseA(C, c);
  const ctrl = C.ctrl, ya = ctrl[BAND + 2 * c], yb = ctrl[BAND + 2 * c + 1];
  if (ya > yb) return;
  switch (phase) {
    case PH.B: return phaseB(C, ya, yb);
    case PH.F0: return phaseF0(C, ya, yb);
    case PH.F1: return phaseF1(C, ya, yb);
    case PH.F2: return phaseF2(C, ya, yb);
    case PH.F3: return phaseF3(C, ya, yb);
    case PH.S3: return phaseS3(C, ya, yb);
    case PH.SL: return phaseSL(C, ya, yb);
    case PH.AP: return phaseAP(C, ya, yb, c);
    case PH.P5: return phaseP5(C, ya, yb, c);
    case PH.PM: return phasePM(C, ya, yb);
  }
  throw new Error(`sheet-kernel: no phase ${phase}`);
}

// the rows of the box an even share of which this thread scans in phase A, before the bands are known
function phaseA(C, c) {
  const { ctrl, w, M, s, rlo, rhi, dlo, dhi, wcnt } = C, x0 = ctrl[BOX], y0 = ctrl[BOX + 1], x1 = ctrl[BOX + 2], y1 = ctrl[BOX + 3], nC = ctrl[NCH];
  const rows = y1 - y0 + 1, a0 = y0 + Math.floor((rows * c) / nC), a1 = y0 + Math.floor((rows * (c + 1)) / nC) - 1;
  for (let y = a0; y <= a1; y++) {
    const r = y * w; let a = -1, b = -1, c = -1, d = -1, cnt = 0;
    for (let x = x0; x <= x1; x++) {
      const i = r + x, m = M[i];
      if (m) { if (a < 0) a = x; b = x; cnt++; }
      if (m || s[i] > 0) { if (c < 0) c = x; d = x; }
    }
    rlo[y] = a; rhi[y] = b; dlo[y] = c; dhi[y] = d; wcnt[y] = cnt;
  }
}

// a row's two spans, as stepBox works them out from its own and its neighbours' wet and damp extents
function spans(C, y, y0, y1, x0, x1, out) {
  const { rlo, rhi, dlo, dhi, w } = C;
  let a = w, b = -1, c = w, d = -1;
  for (let q = -1; q <= 1; q++) {
    const yy = y + q; if (yy < y0 || yy > y1) continue;
    if (rhi[yy] >= 0) { if (rlo[yy] < a) a = rlo[yy]; if (rhi[yy] > b) b = rhi[yy]; }
    if (dhi[yy] >= 0) { if (dlo[yy] < c) c = dlo[yy]; if (dhi[yy] > d) d = dhi[yy]; }
  }
  if (b < 0) { out[0] = 0; out[1] = -1; } else { out[0] = Math.max(x0, a - 2); out[1] = Math.min(x1, b + 2); }
  if (d < 0) { out[2] = 0; out[3] = -1; } else { out[2] = Math.max(x0, c - 2); out[3] = Math.min(x1, d + 2); }
}

function phaseB(C, ya, yb) {
  const { ctrl, prm, w, h, M, s, W, G, D, P: Pp, K, ever, edge, capacity, wl, wrow, wf, rlo, rhi, wlo, whi, plo, phi } = C;
  const x0 = ctrl[BOX], y0 = ctrl[BOX + 1], x1 = ctrl[BOX + 2], y1 = ctrl[BOX + 3];
  const sp = [0, 0, 0, 0];
  for (let y = ya; y <= yb; y++) { spans(C, y, y0, y1, x0, x1, sp); wlo[y] = sp[0]; whi[y] = sp[1]; plo[y] = sp[2]; phi[y] = sp[3]; }
  for (let y = ya; y <= yb; y++) {
    const r = y * w; let q = wrow[y];
    if (rhi[y] >= 0) for (let x = rlo[y], e = rhi[y]; x <= e; x++) if (M[r + x]) wl[q++] = r + x;
  }
  const q0 = wrow[ya], q1 = wrow[yb + 1];
  for (let y = ya; y <= yb; y++) {
    const r = y * w;
    for (let q = wrow[y], e = wrow[y + 1]; q < e; q++) {
      const i = wl[q], x = i - r;
      wf[q] = (x < x1 && M[i + 1] ? 1 : 0) | (y < y1 && M[i + w] ? 2 : 0) | (x > x0 && M[i - 1] ? 4 : 0) | (y > y0 && M[i - w] ? 8 : 0);
    }
  }
  // distance to the pinned boundary, worked out privately over the band and cap rows either side (a value below the
  // cap is witnessed by a path of fewer than cap cells, so rows further off cannot change the band's)
  const edgeWidth = prm[P.edgeWidth], cap = edgeWidth + 1, H = Math.ceil(cap), hs = prm[P.holeSpan] || 0;
  const L = Math.max(y0, ya - H), U = Math.min(y1, yb + H), rA = Math.max(0, L - 1), rB = Math.min(h - 1, U + 1);
  const base = rA * w; PRIV.E = grow(PRIV.E, (rB - rA + 1) * w); const E = PRIV.E;
  const cx0 = Math.max(0, x0 - 1), cx1 = Math.min(w - 1, x1 + 1);
  for (let y = rA; y <= rB; y++) {
    const r = y * w;
    // rows outside the box keep what the sheet holds there, as the serial pass reads them; rows inside the box
    // but outside the private range stand in at the cap, which no cell of the band can see through
    for (let x = cx0; x <= cx1; x++) E[r + x - base] = edge[r + x];
    if (y < y0 || y > y1) continue;
    spans(C, y, y0, y1, x0, x1, sp);
    const fake = y < L || y > U;
    for (let i = r + sp[0], e = r + sp[1]; i <= e; i++) E[i - base] = fake ? cap : (M[i] || ever[i] || (hs > 0 && heldHole(M, ever, w, h, i - r, y, hs)) ? cap : 0);
  }
  for (let y = L; y <= U; y++) {
    if (rhi[y] < 0) continue; const r = y * w;
    for (let x = rlo[y], xe = rhi[y]; x <= xe; x++) { const i = r + x; if (!M[i]) continue; const e = i - base; const a = x > 0 ? E[e - 1] : 0, c = y > 0 ? E[e - w] : 0; E[e] = Math.min(E[e], a + 1, c + 1); }
  }
  for (let y = U; y >= L; y--) {
    if (rhi[y] < 0) continue; const r = y * w;
    for (let x = rhi[y], xe = rlo[y]; x >= xe; x--) { const i = r + x; if (!M[i]) continue; const e = i - base; const a = x < w - 1 ? E[e + 1] : 0, c = y < h - 1 ? E[e + w] : 0; E[e] = Math.min(E[e], a + 1, c + 1); }
  }
  for (let y = ya; y <= yb; y++) { const r = y * w; for (let i = r + wlo[y], e = r + whi[y]; i <= e; i++) edge[i] = E[i - base]; }

  // which pigments are suspended or deposited in this band's water: the main thread joins the bands' flags into
  // stepBox's lists. Drying walks this band's own list; a pigment with nothing suspended at a cell dries to nothing.
  const la = PRIV.la; let nl = 0;
  for (let k = 0; k < K; k++) {
    const Gk = G[k]; for (let q = q0; q < q1; q++) if (Gk[wl[q]] !== 0) { ctrl[AF + k] = 1; la[nl++] = k; break; }
    const Dk = D[k]; for (let q = q0; q < q1; q++) if (Dk[wl[q]] !== 0) { ctrl[DF + k] = 1; break; }
  }
  const dt = prm[P.dt], evap = prm[P.evap], edgeEvap = prm[P.edgeEvap], absorb = prm[P.absorb], oFilm = prm[P.film];
  for (let q = q0; q < q1; q++) {
    const i = wl[q];
    const near = edge[i] <= edgeWidth ? 1 - (edge[i] - 1) / edgeWidth : 0;
    W[i] = Math.max(0, W[i] - dt * (evap + edgeEvap * near));
    const a = Math.min(dt * absorb, Math.max(0, capacity[i] - s[i]), Math.max(0, W[i] - oFilm));
    if (a > 0) { const aw = a / W[i]; for (let n = 0; n < nl; n++) { const k = la[n], Gk = G[k], g = Gk[i] * aw * prm[PK + k * PKS]; Gk[i] -= g; Pp[k][i] += g; } }
    s[i] += a; W[i] -= a;
  }
}

// the pigment and its budget a band's first and last rows held back in the last pigment flow
function applyG(C, ya, yb) {
  const { ctrl, G, pout, Gd, wl, wrow } = C, nA = ctrl[NA];
  for (let side = 0; side < 2; side++) {
    const y = side ? yb : ya; if (side && yb === ya) break;
    for (let n = 0; n < nA; n++) {
      const k = ctrl[ACT + n], Gk = G[k], po = pout[k], gd = Gd[k];
      for (let q = wrow[y], e = wrow[y + 1]; q < e; q++) { const i = wl[q]; po[i] = 0; Gk[i] = gd[i]; }
    }
  }
}

function phaseF0(C, ya, yb) {
  const { ctrl, W, G, K, Cc, wl, wrow } = C;
  if (ctrl[IT] > 0) applyG(C, ya, yb);
  for (let q = wrow[ya], e = wrow[yb + 1]; q < e; q++) { const i = wl[q]; if (W[i] < 1e-4) { Cc[i] = 0; continue; } let c = 0; for (let k = 0; k < K; k++) c += G[k][i]; Cc[i] = Math.min(2, c / W[i]); }
}

function phaseF1(C, ya, yb) {
  const { ctrl, prm, w, W, height, px, py, Cc, fx, fy, out, wsc, wl, wrow, wf } = C;
  const y0 = ctrl[BOX + 1], y1 = ctrl[BOX + 3], mar = prm[P.mar];
  if (!mar && ctrl[IT] > 0) applyG(C, ya, yb);
  const ff = prm[P.ff], flowDepth = prm[P.flowDepth], flow = prm[P.flow], slope = prm[P.slope];
  // the row above's faces into this band's first row, before anything of this band's own
  if (ya > y0) for (let q = wrow[ya - 1], e = wrow[ya]; q < e; q++) {
    if (!(wf[q] & 2)) continue;
    const i = wl[q], hi = W[i] + slope * height[i];
    const j = i + w, p = 1 - ff + ff * (0.25 + 1.75 * py[i]), m = Math.max(W[i], W[j]) / flowDepth, rate = Math.min(0.25, Math.max(0, p * flow * (m >= 1 ? 1 : m * m)));
    const f = rate * (hi - W[j] - slope * height[j]) + (mar ? p * mar * (Cc[i] - Cc[j]) * Math.min(W[i], W[j]) : 0);
    out[j] += Math.max(0, -f);
  }
  for (let y = ya; y <= yb; y++) {
    const cross = y === yb && yb < y1;
    for (let q = wrow[y], e = wrow[y + 1]; q < e; q++) {
      const fl = wf[q], i = wl[q];
      if (fl & 3) {
        const hi = W[i] + slope * height[i];
        if (fl & 1) {
          const j = i + 1, p = 1 - ff + ff * (0.25 + 1.75 * px[i]), m = Math.max(W[i], W[j]) / flowDepth, rate = Math.min(0.25, Math.max(0, p * flow * (m >= 1 ? 1 : m * m)));
          const f = rate * (hi - W[j] - slope * height[j]) + (mar ? p * mar * (Cc[i] - Cc[j]) * Math.min(W[i], W[j]) : 0);
          fx[i] = f; out[i] += Math.max(0, f); out[j] += Math.max(0, -f);
        }
        if (fl & 2) {
          const j = i + w, p = 1 - ff + ff * (0.25 + 1.75 * py[i]), m = Math.max(W[i], W[j]) / flowDepth, rate = Math.min(0.25, Math.max(0, p * flow * (m >= 1 ? 1 : m * m)));
          const f = rate * (hi - W[j] - slope * height[j]) + (mar ? p * mar * (Cc[i] - Cc[j]) * Math.min(W[i], W[j]) : 0);
          fy[i] = f; out[i] += Math.max(0, f); if (!cross) out[j] += Math.max(0, -f);
        }
      }
      // every face that adds to this cell's outflow has been visited: its budget share is final
      wsc[i] = out[i] > W[i] * 0.95 ? (W[i] * 0.95) / out[i] : 1; out[i] = 0;
    }
  }
}

function phaseF2(C, ya, yb) {
  const { ctrl, prm, w, W, G, fx, fy, wsc, dW, went, qx: QX, qy: QY, pout: POUT, wl, wrow, wf, Wd } = C;
  const y0 = ctrl[BOX + 1], y1 = ctrl[BOX + 3], nA = ctrl[NA], it = ctrl[IT];
  const cd = prm[P.cd], diffuse = prm[P.diffuse], fdf = prm[P.filmDiff] || 0, fdd = prm[P.filmDepth] || 0.03;
  if (ya > y0) for (let q = wrow[ya - 1], e = wrow[ya]; q < e; q++) {
    if (!(wf[q] & 2)) continue;
    const i = wl[q], j = i + w, f = fy[i];
    const sgn = f > 0 ? 1 : f < 0 ? -1 : 0, amt = f === 0 ? 0 : (f > 0 ? f : -f) * wsc[f > 0 ? i : j];
    dW[j] += sgn * amt;
    const wi = W[i], wj = W[j], mw = wi < wj ? wi : wj;
    const mi = wi / cd, mj = wj / cd, carryI = mi >= 1 ? 1 : mi * mi, carryJ = mj >= 1 ? 1 : mj * mj, carryM = carryI < carryJ ? carryI : carryJ;
    for (let n = 0; n < nA; n++) {
      const k = ctrl[ACT + n], Gk = G[k], ci = wi > 1e-6 ? Gk[i] / wi : 0, cj = wj > 1e-6 ? Gk[j] / wj : 0;
      const v = sgn * amt * (f > 0 ? ci * carryI : cj * carryJ) + (diffuse * carryM + (fdf ? Math.min(0.2, fdf * Math.min(1, mw / fdd)) : 0)) * (ci - cj) * mw;
      if (!(v > 0)) POUT[k][j] -= v;
    }
  }
  for (let y = ya; y <= yb; y++) {
    const cross = y === yb && yb < y1, hold = y === ya || y === yb;
    for (let q = wrow[y], e = wrow[y + 1]; q < e; q++) {
      const i = wl[q], fl = wf[q];
      let dw = dW[i];
      for (let dir = 0; dir < 2; dir++) {
        if (!(fl & (dir + 1))) continue;
        const j = dir === 0 ? i + 1 : i + w, xs = dir === 1 && cross;
        const f = dir === 0 ? fx[i] : fy[i], Q = dir === 0 ? QX : QY;
        const sgn = f > 0 ? 1 : f < 0 ? -1 : 0, amt = f === 0 ? 0 : (f > 0 ? f : -f) * wsc[f > 0 ? i : j];
        dw = Math.fround(dw - sgn * amt); if (!xs) dW[j] += sgn * amt;
        const wi = W[i], wj = W[j], mw = wi < wj ? wi : wj;
        const mi = wi / cd, mj = wj / cd, carryI = mi >= 1 ? 1 : mi * mi, carryJ = mj >= 1 ? 1 : mj * mj, carryM = carryI < carryJ ? carryI : carryJ;
        for (let n = 0; n < nA; n++) {
          const k = ctrl[ACT + n], Gk = G[k], ci = wi > 1e-6 ? Gk[i] / wi : 0, cj = wj > 1e-6 ? Gk[j] / wj : 0;
          const v = sgn * amt * (f > 0 ? ci * carryI : cj * carryJ) + (diffuse * carryM + (fdf ? Math.min(0.2, fdf * Math.min(1, mw / fdd)) : 0)) * (ci - cj) * mw;
          Q[k][i] = v; if (v > 0) POUT[k][i] += v; else if (!xs) POUT[k][j] -= v;
        }
      }
      dW[i] = 0;
      if (hold) Wd[i] = dw ? Math.max(0, W[i] + dw) : W[i];
      else if (dw) W[i] = Math.max(0, W[i] + dw);
      const v = 0.5 * ((fl & 1 ? Math.abs(fx[i]) : 0) + (fl & 2 ? Math.abs(fy[i]) : 0) + (fl & 4 ? Math.abs(fx[i - 1]) : 0) + (fl & 8 ? Math.abs(fy[i - w]) : 0));
      went[i] = it === 0 ? v : went[i] + v;
    }
  }
}

function phaseF3(C, ya, yb) {
  const { ctrl, prm, w, W, G, K, pout: POUT, qx: QX, qy: QY, dG: DG, wl, wrow, wf, top, Wd, Gd } = C;
  const y0 = ctrl[BOX + 1], y1 = ctrl[BOX + 3], nA = ctrl[NA];
  // the water the first and last rows held back
  for (let side = 0; side < 2; side++) {
    const y = side ? yb : ya; if (side && yb === ya) break;
    for (let q = wrow[y], e = wrow[y + 1]; q < e; q++) { const i = wl[q]; W[i] = Wd[i]; }
  }
  // once the last iteration is done the water is final: which pigments of the layer below the water is deep enough to lift
  if (ctrl[LAST] && top) {
    const oFilm = prm[P.film], q0 = wrow[ya], q1 = wrow[yb + 1];
    for (let k = 0; k < K; k++) { const t = top[k]; for (let q = q0; q < q1; q++) { const i = wl[q]; if (t[i] !== 0 && W[i] > oFilm) { ctrl[TF + k] = 1; break; } } }
  }
  for (let n = 0; n < nA; n++) {
    const k = ctrl[ACT + n], Gk = G[k], po = POUT[k], qx = QX[k], qy = QY[k], dG = DG[k], gd = Gd[k];
    if (ya > y0) for (let q = wrow[ya - 1], e = wrow[ya]; q < e; q++) {
      if (!(wf[q] & 2)) continue;
      const i = wl[q], qq = qy[i], m = qq > 0 ? i : i + w, v = qq * (po[m] > Gk[m] * 0.95 ? (Gk[m] * 0.95) / po[m] : 1);
      dG[i + w] += v;
    }
    for (let y = ya; y <= yb; y++) {
      const cross = y === yb && yb < y1, hold = y === ya || y === yb;
      for (let q = wrow[y], e = wrow[y + 1]; q < e; q++) {
        const i = wl[q], fl = wf[q];
        let d = dG[i];
        if (fl & 1) { const qq = qx[i], m = qq > 0 ? i : i + 1, v = qq * (po[m] > Gk[m] * 0.95 ? (Gk[m] * 0.95) / po[m] : 1); d = Math.fround(d - v); dG[i + 1] += v; }
        if (fl & 2) { const qq = qy[i], m = qq > 0 ? i : i + w, v = qq * (po[m] > Gk[m] * 0.95 ? (Gk[m] * 0.95) / po[m] : 1); d = Math.fround(d - v); if (!cross) dG[i + w] += v; }
        dG[i] = 0;
        if (hold) gd[i] = d ? Math.max(0, Gk[i] + d) : Gk[i];
        else { po[i] = 0; if (d) Gk[i] = Math.max(0, Gk[i] + d); }
      }
    }
  }
}

function phaseS3(C, ya, yb) {
  const { ctrl, prm, W, G, D, K, height, went, dep, wl, wrow, resist, top, fibreH, tooth, surf } = C;
  applyG(C, ya, yb);
  const n3 = ctrl[N3], dt = prm[P.dt], oFilm = prm[P.film];
  const liftDepth = prm[P.liftDepth], holdCap = prm[P.holdCap], settle = prm[P.settle], rewetLift = prm[P.rewetLift], granFill = prm[P.granFill];
  const slide = prm[P.slide], fill = prm[P.fill], nG = ctrl[NGROUP];
  const topLayer = top || null, resistOn = prm[P.hasResist] ? resist : null;
  for (let q = wrow[ya], e = wrow[yb + 1]; q < e; q++) {
    const i = wl[q];
    if (granFill > 0) { let d = 0; for (let k = 0; k < K; k++) d += D[k][i]; dep[i] = d; }
    if (!(resistOn !== null && resistOn[i])) {
      const Wi = W[i], hh = height[i], thin = Math.min(3, 0.12 / Math.max(0.04, Wi)), ld = Wi / liftDepth, wetting = ld >= 1 ? 1 : ld * ld;
      const rewet = topLayer !== null && Wi > oFilm, turnover = Wi > 1e-6 ? Math.min(1, went[i] / Wi) : 0;
      for (let n = 0; n < n3; n++) {
        const k = ctrl[ACT3 + n], Gk = G[k], Dk = D[k];
        if (Gk[i] === 0 && Dk[i] === 0 && !(rewet && topLayer[k][i] !== 0)) continue;
        const pk = PK + k * PKS, rho = prm[pk + 1], omega = prm[pk + 2];
        const filled = granFill > 0 ? Math.min(1, hh + dep[i] * granFill) : hh;
        const gg = prm[pk + 4], down = Gk[i] * Math.max(0, 1 - filled * gg) * rho * settle * thin * dt;
        const shape = Math.max(0, 1 + (hh - 1) * gg);
        const up = Dk[i] * shape * (prm[pk + 5] * wetting * dt + prm[pk + 6] * turnover * wetting);
        const dn = Math.min(Gk[i], Math.max(0, down)), u = Math.min(Dk[i], Math.max(0, up));
        Dk[i] += dn - u; Gk[i] += u - dn;
        if (rewet) { const t = topLayer[k], r = Math.min(t[i], (t[i] * rewetLift * dt) / omega); t[i] -= r; Gk[i] += r; }
      }
      let gs = 0; for (let n = 0; n < n3; n++) gs += G[ctrl[ACT3 + n]][i];
      const hold = holdCap * Wi;
      if (gs > hold) { const f = 1 - hold / gs; for (let n = 0; n < n3; n++) { const k = ctrl[ACT3 + n], q2 = G[k][i] * f; G[k][i] -= q2; D[k][i] += q2; } }
    }
    if (slide > 0) {
      let d = 0; for (let n = 0; n < n3; n++) d += D[ctrl[ACT3 + n]][i]; dep[i] = fill * d;
      for (let m = 0; m < nG; m++) { const k = ctrl[GREP + m], fk = prm[PK + k * PKS + 8], f1 = 1 - fk; surf[m][i] = f1 * fibreH[i] + fk * tooth[i] + dep[i]; }
    }
  }
}

// the settled grains of one wet cell rolling to lower neighbours; `mode` 0 writes wherever the band owns the cell,
// 1 only the neighbour below (the row above this band), 2 only the neighbour above (the row below this band)
function slideCell(C, q, mode, ya, yb, y, flags) {
  const { ctrl, prm, w, W, D, dSlide, wl, wf, surf } = C;
  const i = wl[q], Wi = W[i]; if (Wi <= 0) return;
  const fg = wf[q], oFilm = prm[P.film], slide = prm[P.slide], dt = prm[P.dt], n3 = ctrl[N3], ex = PRIV.ex, w_ = w;
  const film = Math.min(3, 0.12 / Math.max(0.04, Wi)) * (Wi > oFilm ? 1 : Wi / oFilm);
  const up = mode === 0 ? y > ya : mode === 2, down = mode === 0 ? y < yb : mode === 1, side = mode === 0;
  for (let n = 0; n < n3; n++) {
    const k = ctrl[ACT3 + n], pk = PK + k * PKS, gg = prm[pk + 4]; const Dk = D[k]; if (gg <= 0 || Dk[i] <= 0) continue;
    const S = surf[ctrl[GROUP + k]], rep = prm[pk + 7];
    let sum = 0; const here = S[i];
    ex[0] = fg & 1 ? Math.max(0, here - S[i + 1] - rep) : 0; sum += ex[0];
    ex[1] = fg & 4 ? Math.max(0, here - S[i - 1] - rep) : 0; sum += ex[1];
    ex[2] = fg & 2 ? Math.max(0, here - S[i + w_] - rep) : 0; sum += ex[2];
    ex[3] = fg & 8 ? Math.max(0, here - S[i - w_] - rep) : 0; sum += ex[3];
    if (sum <= 0) continue;
    let moved = Dk[i] * Math.min(0.2, slide * gg * film * sum * dt); const dd = dSlide[k];
    // slideCap (sheet.mjs): no move reverses the slope it rolled down
    const cap = prm[P.slideCap] || 0, fill = prm[P.fill];
    if (cap > 0 && fill > 0) { let lim = Infinity; for (let e = 0; e < 4; e++) if (ex[e] > 0) lim = Math.min(lim, cap * ex[e] / (fill * (1 + ex[e] / sum))); if (moved > lim) moved = lim; }
    if (side) { flags[k] = 1; dd[i] -= moved; }
    if (side && ex[0] > 0) dd[i + 1] += moved * ex[0] / sum;
    if (side && ex[1] > 0) dd[i - 1] += moved * ex[1] / sum;
    if (down && ex[2] > 0) dd[i + w_] += moved * ex[2] / sum;
    if (up && ex[3] > 0) dd[i - w_] += moved * ex[3] / sum;
  }
}

function phaseSL(C, ya, yb) {
  const { ctrl, wrow } = C, y0 = ctrl[BOX + 1], y1 = ctrl[BOX + 3], flags = C.ctrl.subarray(MV, MV + MAXK);
  if (ya > y0) for (let q = wrow[ya - 1], e = wrow[ya]; q < e; q++) slideCell(C, q, 1, ya, yb, ya - 1, flags);
  for (let y = ya; y <= yb; y++) for (let q = wrow[y], e = wrow[y + 1]; q < e; q++) slideCell(C, q, 0, ya, yb, y, flags);
  if (yb < y1) for (let q = wrow[yb + 1], e = wrow[yb + 2]; q < e; q++) slideCell(C, q, 2, ya, yb, yb + 1, flags);
}

// one pore giving water to its neighbours; `only` limits it to one direction and to the neighbour's side
// (the rows either side of the band), `self` whether this band owns the donor
function capCell(C, x, y, only, ya, yb, pact, nP) {
  const { ctrl, prm, w, s, capacity, grain, fdx, fdy, sNext, PNext, P: Pp, dDep } = C;
  const x0 = ctrl[BOX], y0 = ctrl[BOX + 1], x1 = ctrl[BOX + 2], y1 = ctrl[BOX + 3];
  const i = y * w + x, si = s[i]; if (si <= prm[P.capEps] * capacity[i]) return;
  const capDelta = prm[P.capDelta], sizing = prm[P.sizing], capStep = prm[P.capStep], filter = prm[P.filter];
  const self = only < 0;
  const gi = grain[i], alongX = Math.abs(fdx[i]) * gi, alongY = Math.abs(fdy[i]) * gi;
  for (let d = 0; d < 4; d++) {
    if (only >= 0 && d !== only) continue;
    let j;
    if (d === 0) { if (x >= x1) continue; j = i + 1; } else if (d === 1) { if (x <= x0) continue; j = i - 1; } else if (d === 2) { if (y >= y1) continue; j = i + w; } else { if (y <= y0) continue; j = i - w; }
    const sj = s[j]; if (si <= sj) continue;
    const along = d < 2 ? alongX : alongY, rate = 0.5 + along;
    const open = sj > capDelta * capacity[j] ? 1 : (1 - sizing) * (0.4 + 0.6 * along);
    const ds = (Math.max(0, Math.min(si - sj, capacity[j] - sj)) / 4) * capStep * rate * open; if (ds <= 0) continue;
    const f = Math.min(1, ds / si);
    const jy = d === 2 ? y + 1 : d === 3 ? y - 1 : y, mine = jy >= ya && jy <= yb;
    if (self) sNext[i] -= ds;
    if (mine) sNext[j] += ds;
    const catchF = sj > capDelta * capacity[j] ? 0 : filter;
    for (let n = 0; n < nP; n++) {
      const k = pact[n], q = Pp[k][i] * f; if (!q) continue;
      if (self) PNext[k][i] -= q;
      if (mine) { PNext[k][j] += q * (1 - catchF); dDep[k][j] += q * catchF; }
    }
  }
}

function phaseAP(C, ya, yb, ch) {
  const { ctrl, prm, w, K, D, dSlide, s, sNext, sSnap, PNext, P: Pp, dDep, wl, wrow, plo, phi, cpact } = C;
  const x0 = ctrl[BOX], y0 = ctrl[BOX + 1], x1 = ctrl[BOX + 2], y1 = ctrl[BOX + 3];
  if (prm[P.slide] > 0) for (let k = 0; k < K; k++) {
    if (!ctrl[MV + k]) continue; const Dk = D[k], dd = dSlide[k];
    for (let q = wrow[ya], e = wrow[yb + 1]; q < e; q++) { const i = wl[q], d = dd[i]; if (d) Dk[i] = Math.max(0, Dk[i] + d); dd[i] = 0; }
  }
  // the pigments in the pores this band's cells can give or receive: its own rows and one either side
  // kept per band for the wet fronts, which may run on another thread
  const pb = ch * (MAXK + 1), pact = cpact.subarray(pb + 1, pb + 1 + MAXK); let nP = 0;
  const ra = Math.max(y0, ya - 1), rb = Math.min(y1, yb + 1);
  for (let k = 0; k < K; k++) {
    const Pk = Pp[k]; let any = false;
    for (let y = ra; y <= rb && !any; y++) for (let i = y * w + plo[y], e = y * w + phi[y]; i <= e; i++) if (Pk[i] !== 0) { any = true; break; }
    if (any) pact[nP++] = k;
  }
  cpact[pb] = nP;
  for (let y = ya; y <= yb; y++) { const a = y * w + plo[y], b = y * w + phi[y] + 1; if (b > a) sNext.set(s.subarray(a, b), a); }
  for (let n = 0; n < nP; n++) { const k = pact[n], Pk = Pp[k], PN = PNext[k], dd = dDep[k]; for (let y = ya; y <= yb; y++) { const a = y * w + plo[y], b = y * w + phi[y] + 1; if (b <= a) continue; PN.set(Pk.subarray(a, b), a); dd.fill(0, a, b); } }
  // the first row's damp as it stands before the wet fronts, for the band above to read
  sSnap.set(s.subarray(ya * w + x0, ya * w + x1 + 1), ya * w + x0);
  if (ya > y0) for (let x = plo[ya - 1], xe = phi[ya - 1]; x <= xe; x++) capCell(C, x, ya - 1, 2, ya, yb, pact, nP);
  for (let y = ya; y <= yb; y++) for (let x = plo[y], xe = phi[y]; x <= xe; x++) capCell(C, x, y, -1, ya, yb, pact, nP);
  if (yb < y1) for (let x = plo[yb + 1], xe = phi[yb + 1]; x <= xe; x++) capCell(C, x, yb + 1, 3, ya, yb, pact, nP);
}

function phaseP5(C, ya, yb, ch) {
  const { ctrl, prm, w, h, K, W, s, M, G, D, P: Pp, PNext, dDep, sNext, sSnap, ever, capacity, fdx, fdy, grain, height, throats, wlo, whi, plo, phi, cpact, mark } = C;
  const x0 = ctrl[BOX], y0 = ctrl[BOX + 1], x1 = ctrl[BOX + 2], y1 = ctrl[BOX + 3];
  const pb = ch * (MAXK + 1), nP = cpact[pb], pact = cpact.subarray(pb + 1, pb + 1 + nP);
  // what changes wetness is marked, 1 newly wet and 2 dried, and applied once every band has read the old state; the
  // two sets never share a cell (one is dry cells, the other wet)
  for (let n = 0; n < nP; n++) { const k = pact[n], Pk = Pp[k], PN = PNext[k], Dk = D[k], dd = dDep[k]; for (let y = ya; y <= yb; y++) for (let i = y * w + plo[y], e = y * w + phi[y]; i <= e; i++) { Pk[i] = Math.max(0, PN[i]); Dk[i] += dd[i]; } }
  const dt = prm[P.dt], oFilm = prm[P.film], wetEps = prm[P.wetEps], paperDry = prm[P.paperDry], capSigma = prm[P.capSigma], spill = prm[P.spill], spillHeight = prm[P.spillHeight], dampEase = prm[P.dampEase], pinning = prm[P.pinning], pinFibre = prm[P.pinFibre], enclose = prm[P.enclose] || 0, holeFill = prm[P.holeFill] || 0;
  // the damp of a neighbour as the serial scan finds it: the row above this band after this step's drying of its
  // pores, the row below before it
  const sAt = (j, yy, xx) => {
    if (yy === ya - 1 && yy >= y0 && xx >= plo[yy] && xx <= phi[yy]) {
      let v = Math.max(0, sNext[j]);
      if (W[j] <= wetEps && v > 0) { let d = Math.min(v, dt * paperDry); if (v - d <= 0.02 * capacity[j]) d = v; v = Math.fround(v - d); }
      return v;
    }
    if (yy === yb + 1 && yy <= y1 && xx >= x0 && xx <= x1) return sSnap[j];
    return s[j];
  };
  for (let y = ya; y <= yb; y++) for (let x = plo[y], xe = phi[y]; x <= xe; x++) {
    const i = y * w + x;
    s[i] = Math.max(0, sNext[i]);
    if (W[i] <= wetEps && s[i] > 0) {
      let d = Math.min(s[i], dt * paperDry); if (s[i] - d <= 0.02 * capacity[i]) d = s[i];
      const f = d / s[i]; s[i] -= d;
      for (let n = 0; n < nP; n++) { const k = pact[n], q = Pp[k][i] * f; Pp[k][i] -= q; D[k][i] += q; }
    }
    if (!M[i]) {
      if (x > x0 && x < x1 && y > y0 && y < y1 && (x < wlo[y] || x > whi[y])) continue;
      let feeding = false, wn = 0, ws = 0, hn = 0;
      for (let d = 0; d < 4; d++) { const xx = x + DX[d], yy = y + DY[d]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (!M[j]) continue; wn++; ws += W[j]; hn += height[j]; if (W[j] > oFilm) feeding = true; }
      if (feeding && ever[i] && s[i] > capSigma * capacity[i]) { mark[i] = 1; continue; }
      if (wn >= 4 && ws / wn > oFilm) mark[i] = 1;
      // holeFill (sheet.mjs): a dry hollow the standing wash surrounds fills where it is lower than the wet paper beside it
      else if (holeFill > 0 && wn > 0 && ws / wn > oFilm && height[i] < hn / wn && heldHole(M, M, w, h, x, y, holeFill)) mark[i] = 1;
      continue;
    }
    if (W[i] > wetEps) {
      for (let d = 0; d < 4; d++) {
        const xx = x + DX[d], yy = y + DY[d]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (M[j]) continue;
        const damp = ever[j] ? Math.min(1, sAt(j, yy, xx) / (capSigma * capacity[j])) : 0;
        const aligned = Math.abs(fdx[j] * (xx - x) + fdy[j] * (yy - y)) * grain[j], throat = throats[j];
        let need = (spill + spillHeight * height[j]) * (1 - dampEase * damp) * Math.exp(damp * (pinning * 2 * throat - pinFibre * aligned));
        // encloseEase (sheet.mjs DEFAULTS): a dry cell held by water on more sides fills more easily
        if (enclose > 0) { let ws2 = 0; for (let d2 = 0; d2 < 4; d2++) { const x2 = xx + DX[d2], y2 = yy + DY[d2]; if (x2 >= 0 && y2 >= 0 && x2 < w && y2 < h && M[y2 * w + x2]) ws2++; } need *= Math.max(0, 1 - enclose * (ws2 - 1) / 3); }
        if (W[i] > need) mark[j] = 1;
      }
    } else if (s[i] < capSigma * capacity[i]) {
      let thinAround = true;
      for (let d = 0; d < 4; d++) { const xx = x + DX[d], yy = y + DY[d]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (M[j] && W[j] > 3 * wetEps) { thinAround = false; break; } }
      if (thinAround && W[i] === 0) { for (let k = 0; k < K; k++) { D[k][i] += G[k][i]; G[k][i] = 0; } mark[i] = 2; }
    }
  }
}

// the marks of this band's rows, over the widest span a mark can fall in: the wet cells of the rows either side and
// their neighbours, and the damp spans the wet front walked
function phasePM(C, ya, yb) {
  const { w, M, ever, mark, wlo, whi, plo, phi } = C;
  for (let y = ya; y <= yb; y++) {
    let a = w, b = -1;
    if (whi[y] >= wlo[y]) { a = wlo[y]; b = whi[y]; }
    if (phi[y] >= plo[y]) { if (plo[y] < a) a = plo[y]; if (phi[y] > b) b = phi[y]; }
    const r = y * w;
    for (let i = r + a, e = r + b; i <= e; i++) { const m = mark[i]; if (!m) continue; if (m === 1) { M[i] = 1; ever[i] = 1; } else M[i] = 0; mark[i] = 0; }
  }
}
