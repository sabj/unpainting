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

// Each stroke's charge factor is the plan's mean amount under its footprint over the passage mean, fixed before the
// first mark. reachMm > 0: lane ends and outer sides land past or short of the outline by a seeded amount up to reachMm.
export function planLanes(list, w, h, G, amount, { cellMm, laneMm = 6, strokeMm = 30, reachMm = 0, seed = 1, fmin = 0.45, fmax = 1.8 } = {}) {
  if (!(cellMm > 0)) throw Error('planLanes needs cellMm');
  if (!list.length || !(amount > 0)) return null;
  const { cx, cy, ang, dx, dy } = principalAxis(list, w);
  const R = Math.max(1.5, laneMm / 2 / cellMm), reach = reachMm / cellMm, rnd = rng(seed);
  const c = list.length, T = new Float32Array(c), U = new Float32Array(c);
  let uMin = Infinity, uMax = -Infinity;
  list.forEach((i, k) => { const x = i % w + .5 - cx, y = Math.floor(i / w) + .5 - cy; T[k] = x * dx + y * dy; U[k] = -x * dy + y * dx; uMin = Math.min(uMin, U[k]); uMax = Math.max(uMax, U[k]); });
  const step = Math.max(1, .6 * R), maxLen = Math.max(3 * R, strokeMm / cellMm), pad = Math.ceil(R / step / 2);
  const paths = [], factors = [], cells = [];
  for (const u0 of laneOffsets(uMin, uMax, R, reach, rnd)) {
    const st = new Map();
    for (let k = 0; k < c; k++) {
      if (Math.abs(U[k] - u0) > R) continue;
      const s = Math.round(T[k] / step), e = st.get(s) ?? { n: 0, u: 0, g: 0 };
      e.n++; e.u += U[k]; e.g += G[list[k]]; st.set(s, e);
    }
    if (!st.size) continue;
    const keys = [...st.keys()].sort((p, q) => p - q), runs = [];
    let run = [keys[0]];
    for (let q = 1; q < keys.length; q++) { if ((keys[q] - keys[q - 1]) * step > 2 * R) { runs.push(run); run = []; } run.push(keys[q]); }
    runs.push(run);
    for (const rk of runs) {
      const parts = Math.max(1, Math.round(rk.length * step / maxLen));
      for (let p = 0; p < parts; p++) {
        const lo = Math.floor(p * rk.length / parts), hi = Math.max(lo + 1, Math.floor((p + 1) * rk.length / parts));
        // strokes overlap their neighbours by about one brush radius, so the joins go wet into wet
        const a0 = Math.max(0, lo - pad), a1 = Math.min(rk.length, hi + pad);
        let g = 0, n = 0; const pts = [];
        for (const s of rk.slice(a0, a1)) {
          const e = st.get(s), uu = u0 + .5 * (e.u / e.n - u0), t = s * step;
          g += e.g; n += e.n;
          pts.push({ x: cx + dx * t - dy * uu, y: cy + dy * t + dx * uu, r: R, p: .9 });
        }
        if (reach > 0) {
          // the run's first and last strokes stop short of or run past the outline, as the brush runs out
          const ext = (q, sign) => { const e = (rnd() - 0.35) * reach - 0.4 * R; return { ...q, x: q.x + sign * dx * e, y: q.y + sign * dy * e }; };
          if (a0 === 0) pts[0] = ext(pts[0], -1);
          if (a1 === rk.length) pts[pts.length - 1] = ext(pts[pts.length - 1], 1);
        }
        if (pts.length === 1) pts.push({ ...pts[0], x: pts[0].x + dx * .5, y: pts[0].y + dy * .5 });
        paths.push(pts); factors.push((g / Math.max(1, n)) / amount); cells.push(n);
      }
    }
  }
  if (!paths.length) return null;
  // normalised to a cell-weighted mean of one, so the passage still receives its planned mass
  const wsum = cells.reduce((s, v) => s + v, 0), fm = factors.reduce((s, f, k) => s + f * cells[k], 0) / Math.max(1, wsum);
  return { paths, factors: factors.map(f => Math.max(fmin, Math.min(fmax, f / Math.max(1e-6, fm)))), laneR: R, reachCells: reach, angle: ang };
}
