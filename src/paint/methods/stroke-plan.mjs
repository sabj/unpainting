// Stroke plan: a shaped passage laid as overlapping lanes of a real brush (laneMm wide) along its long axis, cut into
// strokes of at most strokeMm, so a wash has no ruled mask edge and no flat mean. Planning only: reads the per-cell
// amounts G; the paint step reads only the returned list.

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function principalAxis(list, w) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const i of list) { const x = i % w + .5, y = Math.floor(i / w) + .5; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
  const c = list.length, cx = sx / c, cy = sy / c, a = sxx / c - cx * cx, b = syy / c - cy * cy, cv = sxy / c - cx * cy;
  const ang = .5 * Math.atan2(2 * cv, a - b);
  return { cx, cy, ang, dx: Math.cos(ang), dy: Math.sin(ang) };
}

function laneOffsets(uMin, uMax, R, reach, rnd) {
  const span = uMax - uMin, spacing = 1.7 * R;
  const nl = Math.max(1, Math.ceil(Math.max(0, span - 2 * R) / spacing) + 1);
  const lanes = [];
  for (let j = 0; j < nl; j++) {
    let u = nl === 1 ? (uMin + uMax) / 2 : uMin + R + j * (span - 2 * R) / (nl - 1);
    // the outer lanes' far sides land at the outline plus or minus the reach (seeded), not on it
    if (reach > 0 && nl > 1 && (j === 0 || j === nl - 1)) u += (j === 0 ? -1 : 1) * (rnd() - 0.35) * reach;
    lanes.push(u);
  }
  return lanes;
}

function segmentTouchesProtected(p0, p1, R, protect, w, h) {
  if (!protect) return false;
  const x0 = p0.x, y0 = p0.y, x1 = p1.x, y1 = p1.y;
  const vx = x1 - x0, vy = y1 - y0;
  const len2 = vx * vx + vy * vy;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - R));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + R));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - R));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + R));

  for (let y = minY; y <= maxY; y++) {
    const cy = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      if (!protect[y * w + x]) continue;
      const cx = x + 0.5;
      let u = 0;
      if (len2 > 1e-6) u = Math.max(0, Math.min(1, ((cx - x0) * vx + (cy - y0) * vy) / len2));
      const qx = x0 + u * vx, qy = y0 + u * vy;
      const d2 = (cx - qx) ** 2 + (cy - qy) ** 2;
      if (d2 <= (R - 0.5) ** 2) return true;
    }
  }
  return false;
}

// Each stroke's charge factor is the plan's mean amount under its footprint over the passage mean, fixed before the
// first mark. reachMm > 0: lane ends and outer sides land past or short of the outline by a seeded amount up to reachMm.
export function planLanes(list, w, h, G, amount, { cellMm, laneMm = 6, strokeMm = 30, reachMm = 0, seed = 1, fmin = 0.45, fmax = 1.8, protect = null, curved = false } = {}) {
  if (!(cellMm > 0)) throw Error('planLanes needs cellMm');
  if (!list.length || !(amount > 0)) return null;
  const { cx, cy, ang, dx, dy } = principalAxis(list, w);
  const c = list.length, T = new Float32Array(c), U = new Float32Array(c);
  let uMin = Infinity, uMax = -Infinity;
  list.forEach((i, k) => { const x = i % w + .5 - cx, y = Math.floor(i / w) + .5 - cy; T[k] = x * dx + y * dy; U[k] = -x * dy + y * dx; uMin = Math.min(uMin, U[k]); uMax = Math.max(uMax, U[k]); });

  let effectiveLaneMm = laneMm;
  if (laneMm === 'auto' || !(laneMm > 0)) {
    const preBin = Math.max(1, Math.round(3 / cellMm));
    const sliceMinMax = new Map();
    for (let k = 0; k < c; k++) {
      const s = Math.round(T[k] / preBin);
      const mm = sliceMinMax.get(s) ?? [Infinity, -Infinity];
      if (U[k] < mm[0]) mm[0] = U[k];
      if (U[k] > mm[1]) mm[1] = U[k];
      sliceMinMax.set(s, mm);
    }
    const spans = [...sliceMinMax.values()].map(([u0, u1]) => (u1 - u0) * cellMm).filter(Number.isFinite).sort((a, b) => a - b);
    const t90 = spans.length ? spans[Math.floor(spans.length * 0.9)] : (uMax - uMin) * cellMm;
    const target = 1.2 * t90;
    const SIZES = [6, 12, 20, 38];
    effectiveLaneMm = SIZES.reduce((prev, curr) => Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev);
  }

  const R = Math.max(1.5, effectiveLaneMm / 2 / cellMm), reach = reachMm / cellMm, rnd = rng(seed);
  const step = Math.max(1, .6 * R);
  const maxLen = strokeMm > 0 && Number.isFinite(strokeMm) ? Math.max(3 * R, strokeMm / cellMm) : Infinity;
  const pad = Math.ceil(R / step / 2);

  const stepCentroid = new Map();
  if (curved) {
    for (let k = 0; k < c; k++) {
      const s = Math.round(T[k] / step);
      const e = stepCentroid.get(s) ?? { u: 0, n: 0 };
      e.u += U[k]; e.n++; stepCentroid.set(s, e);
    }
  }

  let uRelMin = Infinity, uRelMax = -Infinity;
  const Urel = new Float32Array(c);
  for (let k = 0; k < c; k++) {
    const s = Math.round(T[k] / step);
    const spineU = curved && stepCentroid.has(s) ? stepCentroid.get(s).u / stepCentroid.get(s).n : 0;
    const ur = U[k] - spineU;
    Urel[k] = ur;
    uRelMin = Math.min(uRelMin, ur);
    uRelMax = Math.max(uRelMax, ur);
  }

  const paths = [], factors = [], relDeltas = [], cells = [];
  for (const u0 of laneOffsets(curved ? uRelMin : uMin, curved ? uRelMax : uMax, R, reach, rnd)) {
    const st = new Map();
    for (let k = 0; k < c; k++) {
      if (Math.abs(Urel[k] - u0) > R) continue;
      const s = Math.round(T[k] / step);
      const e = st.get(s) ?? { n: 0, u: 0, t: 0, g: 0 };
      e.n++; e.u += U[k]; e.t += T[k]; e.g += G[list[k]]; st.set(s, e);
    }
    if (!st.size) continue;
    const lanePt = s => {
      const e = st.get(s);
      const uu = curved ? e.u / e.n : u0 + .5 * (e.u / e.n - u0);
      const tt = e.t / e.n;
      return { x: cx + dx * tt - dy * uu, y: cy + dy * tt + dx * uu };
    };
    const keys = [...st.keys()].sort((p, q) => p - q), runs = [];
    let run = [keys[0]];
    for (let q = 1; q < keys.length; q++) {
      const sPrev = keys[q - 1], sCur = keys[q];
      const gap = (sCur - sPrev) * step;
      const p0 = lanePt(sPrev);
      const p1 = lanePt(sCur);
      if (gap > 2 * R || (sCur - sPrev > 1 && segmentTouchesProtected(p0, p1, R, protect, w, h))) {
        runs.push(run);
        run = [];
      }
      run.push(sCur);
    }
    runs.push(run);
    for (const rk of runs) {
      const parts = Math.max(1, Math.round(rk.length * step / maxLen));
      for (let p = 0; p < parts; p++) {
        const lo = Math.floor(p * rk.length / parts), hi = Math.max(lo + 1, Math.floor((p + 1) * rk.length / parts));
        const a0 = Math.max(0, lo - pad), a1 = Math.min(rk.length, hi + pad);
        let g = 0, n = 0; const pts = [];
        const sliceKeys = rk.slice(a0, a1);
        for (const s of sliceKeys) {
          const e = st.get(s), uu = curved ? e.u / e.n : u0 + .5 * (e.u / e.n - u0), tt = e.t / e.n;
          g += e.g; n += e.n;
          pts.push({ x: cx + dx * tt - dy * uu, y: cy + dy * tt + dx * uu, r: R, p: .9 });
        }
        if (reach > 0) {
          const ext = (q, sign) => {
            const e = (rnd() - 0.35) * reach - 0.4 * R;
            const cand = { ...q, x: q.x + sign * dx * e, y: q.y + sign * dy * e };
            return protect && segmentTouchesProtected(cand, cand, R, protect, w, h) ? q : cand;
          };
          if (a0 === 0) pts[0] = ext(pts[0], -1);
          if (a1 === rk.length) pts[pts.length - 1] = ext(pts[pts.length - 1], 1);
        }
        if (pts.length === 1) pts.push({ ...pts[0], x: pts[0].x + dx * .5, y: pts[0].y + dy * .5 });
        const fStroke = (g / Math.max(1, n)) / amount;
        let relDelta = 0;
        if (sliceKeys.length > 2) {
          const half = Math.max(1, Math.floor(sliceKeys.length / 2));
          let g0 = 0, n0 = 0, g1 = 0, n1 = 0;
          for (let j = 0; j < half; j++) { const e = st.get(sliceKeys[j]); if (e) { g0 += e.g; n0 += e.n; } }
          for (let j = sliceKeys.length - half; j < sliceKeys.length; j++) { const e = st.get(sliceKeys[j]); if (e) { g1 += e.g; n1 += e.n; } }
          const m0 = n0 > 0 ? g0 / n0 : amount, m1 = n1 > 0 ? g1 / n1 : amount, mMean = n > 0 ? g / n : amount;
          relDelta = mMean > 1e-6 ? Math.max(-0.45, Math.min(0.45, (m1 - m0) / (2 * mMean))) : 0;
        }
        paths.push(pts); factors.push(fStroke); relDeltas.push(relDelta); cells.push(n);
      }
    }
  }
  if (!paths.length) return null;
  const wsum = cells.reduce((s, v) => s + v, 0);
  const fm = factors.reduce((s, f, k) => s + f * cells[k], 0) / Math.max(1, wsum);
  let clampedFactors;
  if (!(fm > 1e-9)) {
    clampedFactors = factors.map(() => 1.0);
  } else {
    const r = factors.map(f => f / fm);
    let sMax = 0, minPosR = Infinity;
    for (let k = 0; k < r.length; k++) {
      if (r[k] > 1e-9) {
        sMax += cells[k] * fmax;
        if (r[k] < minPosR) minPosR = r[k];
      } else {
        sMax += cells[k] * fmin;
      }
    }
    if (sMax < wsum) {
      const posMass = r.reduce((s, val, k) => s + (val > 1e-9 ? cells[k] * fmax : 0), 0);
      const zeroCells = r.reduce((s, val, k) => s + (val <= 1e-9 ? cells[k] : 0), 0);
      const zeroFactor = zeroCells > 0 ? (wsum - posMass) / zeroCells : 1.0;
      clampedFactors = r.map(val => val > 1e-9 ? fmax : Math.max(fmin, Math.min(fmax, zeroFactor)));
    } else {
      const sUpper = minPosR < Infinity ? fmax / minPosR : 1.0;
      let low = 0, high = Math.max(1.0, sUpper);
      for (let it = 0; it < 36; it++) {
        const mid = (low + high) * 0.5;
        let s = 0;
        for (let k = 0; k < r.length; k++) {
          s += Math.max(fmin, Math.min(fmax, r[k] * mid)) * cells[k];
        }
        if (s < wsum) low = mid; else high = mid;
      }
      const scale = (low + high) * 0.5;
      clampedFactors = r.map(val => Math.max(fmin, Math.min(fmax, val * scale)));
    }
  }

  const clampedRamps = clampedFactors.map((fMean, k) => {
    const rawDelta = fMean * relDeltas[k];
    const maxDelta = Math.min(fMean - fmin, fmax - fMean);
    const boundDelta = Math.max(0, Math.min(maxDelta, Math.abs(rawDelta)));
    const delta = rawDelta >= 0 ? boundDelta : -boundDelta;
    return {
      start: fMean - delta,
      end: fMean + delta
    };
  });
  return { paths, factors: clampedFactors, ramps: clampedRamps, cells, laneR: R, reachCells: reach, angle: ang };
}
