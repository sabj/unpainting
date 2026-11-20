// One wet film. A wash laid in overlapping sweeps is one film of liquid while it is glossy: the overlaps stand a little
// deeper where the brush passed twice, the bead at each sweep's lower edge is picked up by the next, and the film levels
// in a fraction of a second, carrying its pigment with it, long before the pores or the drying fix anything. The
// sheet's explicit flow (sheet.mjs, phase 2) levels at a coefficient calibrated on the legacy grid, a diffusivity of
// about 0.01 mm^2/s: a 0.2 mm film took two minutes to level a 4 mm overlap, the pores drank the shallow parts first,
// and every sweep dried as its own band.
//
// Here the film levels by thin-film (lubrication) flow: the flux per unit width is (rho g / 3 mu) h^3 times the slope of
// the water's surface, scaled by `o.level` (1: the free film; a 0.2 mm film levels a 4 mm overlap in a twentieth of a
// second and a 40 mm square in six seconds, a 0.05 mm damp film 64 times slower). The paper's roughness is in the h^3:
// a film no deeper than its tooth hardly moves. The surface is the depth plus the paper's relief (o.slope times its height, as the explicit flow reads it)
// plus the board's tilt (sheet.tilt, the sine of the angle along x and y), so on a tilted board the film runs down
// and stands as a bead at the lower pinned edge. Because h^3 falls fast, a thin film hardly moves and a damp wash
// keeps its blooms and fronts to the explicit flow.
//
// The step is implicit (backward Euler with each face's conductance taken at the start of the step), solved by
// conjugate gradients preconditioned with an incomplete Cholesky factor on the wet cells of the box, so it is stable
// at any dt. The water each face carries over the step is then moved with the pigment at the donor's concentration, in
// as many substeps as keep every donor above half its water, under the same 95% donor budget as the explicit flow. It
// only moves water between wet cells: fronts onto dry paper are still the sheet's own rule.
import { permeability } from './sheet.mjs';

const KAPPA = 1000 * 9.81 / (3 * 1e-3) / 1e3;   // rho g / (3 mu), 3.27e6 1/(m s), in 1/(mm s): 3270
const scratch = new WeakMap();
function bufs(sheet) {
  let b = scratch.get(sheet);
  if (!b || b.n !== sheet.n) {
    const n = sheet.n;
    b = { n, at: new Int32Array(n).fill(-1), cells: new Int32Array(n), cw: new Float64Array(n), cn: new Float64Array(n), west: new Int32Array(n), north: new Int32Array(n), east: new Int32Array(n), south: new Int32Array(n), diag: new Float64Array(n), lw: new Float64Array(n), ln: new Float64Array(n), ld: new Float64Array(n), H: new Float64Array(n), r: new Float64Array(n), z: new Float64Array(n), p: new Float64Array(n), q: new Float64Array(n), x: new Float64Array(n), t: new Float64Array(n), fe: new Float64Array(n), fs: new Float64Array(n), out: new Float64Array(n), dW: new Float64Array(n), dG: new Float64Array(n), pout: new Float64Array(n) };
    scratch.set(sheet, b);
  }
  return b;
}

/** Board tilt: `deg` degrees, falling towards `toward` ('bottom', 'top', 'left', 'right', or an angle in degrees from
 *  +x towards +y). 0 lays the board flat. */
export function setTilt(sheet, deg, toward = 'bottom') {
  const a = typeof toward === 'number' ? toward * Math.PI / 180 : { right: 0, bottom: Math.PI / 2, left: Math.PI, top: -Math.PI / 2 }[toward];
  if (a === undefined) throw new Error(`setTilt: toward must be bottom, top, left, right or an angle, not ${toward}`);
  const s = Math.sin((deg || 0) * Math.PI / 180);
  sheet.tilt = s ? { x: s * Math.cos(a), y: s * Math.sin(a) } : null;
  return sheet.tilt;
}

/**
 * Level the wet film in box [x0, y0, x1, y1] over one step of o.dt. Returns { cells, iterations, moved } (moved: water
 * carried across faces, mm of a cell's depth summed over faces), or null when nothing needed to move.
 */
export function levelFilm(sheet, o, box, mm) {
  const level = o.level ?? 0, dt = o.dt ?? 0;
  if (!(level > 0) || !(dt > 0)) return null;
  const { w, W, M, G, K, paper } = sheet, [x0, y0, x1, y1] = box, height = paper.valley || paper.height, slope = o.slope ?? 0;
  const tx = sheet.tilt ? sheet.tilt.x * mm : 0, ty = sheet.tilt ? sheet.tilt.y * mm : 0;   // how far the board falls a cell, mm (the surface is lower downhill)
  const b = bufs(sheet), { at, cells, cw, cn, west, north, east, south, diag, H } = b;
  const ff = o.fibreFlow ?? 0.6, perm = ff ? permeability(paper) : null, k0 = level * KAPPA * dt / (mm * mm);
  // the wet cells in raster order, and each one's surface
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0, i = y * w + x0; x <= x1; x++, i++) if (M[i] && W[i] > 0) { at[i] = n; cells[n] = i; H[n] = W[i] + slope * height[i] - tx * x - ty * y; n++; }
  if (n < 2) { for (let k = 0; k < n; k++) at[cells[k]] = -1; return null; }
  // faces to the west and north neighbours, conductance from the mean depth cubed (lubrication) and the fibres
  let most = 0;
  for (let k = 0; k < n; k++) {
    const i = cells[k], x = i % w, y = (i - x) / w;
    const kw = x > x0 ? at[i - 1] : -1, kn = y > y0 ? at[i - w] : -1;
    west[k] = kw; north[k] = kn; east[k] = -1; south[k] = -1;
    if (kw >= 0) { const h = 0.5 * (W[i] + W[i - 1]), p = perm ? 1 - ff + ff * (0.25 + 1.75 * perm.px[i - 1]) : 1; cw[k] = k0 * p * h * h * h; east[kw] = k; most = Math.max(most, cw[k] * Math.abs(H[k] - H[kw])); } else cw[k] = 0;
    if (kn >= 0) { const h = 0.5 * (W[i] + W[i - w]), p = perm ? 1 - ff + ff * (0.25 + 1.75 * perm.py[i - w]) : 1; cn[k] = k0 * p * h * h * h; south[kn] = k; most = Math.max(most, cn[k] * Math.abs(H[k] - H[kn])); } else cn[k] = 0;
  }
  // The meniscus at a contact line: the film meets the paper at an angle, so its depth rises from the line over
  // o.meniscusMm instead of standing as a wall: the surface the film levels to is lowered by o.meniscus (the slope) x
  // (meniscusMm - distance) there. The line's cells are those with a side on dry paper. Levelled flat to the last
  // cell, the edge band held a full-depth film whose pigment dried into a heavier rim (1.43 over the interior at
  // 0.1 mm cells; real brushed washes 1.03 to 1.29).
  const tanA = o.meniscus ?? 0, dm = o.meniscusMm ?? 0.5;
  if (tanA > 0) {
    const R = Math.ceil(dm / mm), dist = b.dist ?? (b.dist = new Int32Array(sheet.n)), queue = b.queue ?? (b.queue = new Int32Array(sheet.n));
    let head = 0, tail = 0;
    for (let k = 0; k < n; k++) { dist[k] = -1; if (west[k] < 0 || north[k] < 0 || east[k] < 0 || south[k] < 0) { dist[k] = 0; queue[tail++] = k; } }
    const visit = (j, d) => { if (j >= 0 && dist[j] < 0) { dist[j] = d; queue[tail++] = j; } };
    while (head < tail) { const k = queue[head++], d = dist[k] + 1; if (d >= R) continue; visit(west[k], d); visit(north[k], d); visit(east[k], d); visit(south[k], d); }
    for (let k = 0; k < n; k++) if (dist[k] >= 0) { const dmm = (dist[k] + 0.5) * mm; if (dmm < dm) H[k] += tanA * (dm - dmm); }
  }
  const done = () => { for (let k = 0; k < n; k++) at[cells[k]] = -1; };
  // a level film (an explicit step would move less than a tenth of a nanometre anywhere) has nothing to solve
  if (!(most > 1e-7)) { done(); return null; }
  // (I + L) d = -L H, with d the change of surface over the step; L is the weighted graph Laplacian of the faces
  const { r, z, p, q, x: d, t, lw, ln, ld } = b;
  let bb = 0;
  for (let k = 0; k < n; k++) {
    const e = east[k], s = south[k], cwk = cw[k], cnk = cn[k], cek = e >= 0 ? cw[e] : 0, csk = s >= 0 ? cn[s] : 0;
    diag[k] = 1 + cwk + cnk + cek + csk;
    let lap = 0;
    if (cwk) lap += cwk * (H[k] - H[west[k]]);
    if (cnk) lap += cnk * (H[k] - H[north[k]]);
    if (cek) lap += cek * (H[k] - H[e]);
    if (csk) lap += csk * (H[k] - H[s]);
    r[k] = -lap; d[k] = 0; bb += lap * lap;
  }
  // incomplete Cholesky, IC(0), on the five-point stencil in raster order (the west and north faces are below the diagonal)
  for (let k = 0; k < n; k++) {
    const kw = west[k], kn = north[k];
    lw[k] = kw >= 0 ? -cw[k] / ld[kw] : 0; ln[k] = kn >= 0 ? -cn[k] / ld[kn] : 0;
    ld[k] = Math.sqrt(Math.max(1e-12, diag[k] - lw[k] * lw[k] - ln[k] * ln[k]));
  }
  const precondition = () => {
    for (let k = 0; k < n; k++) { const kw = west[k], kn = north[k]; t[k] = (r[k] - (kw >= 0 ? lw[k] * t[kw] : 0) - (kn >= 0 ? ln[k] * t[kn] : 0)) / ld[k]; }
    for (let k = n - 1; k >= 0; k--) { const e = east[k], s = south[k]; z[k] = (t[k] - (e >= 0 ? lw[e] * z[e] : 0) - (s >= 0 ? ln[s] * z[s] : 0)) / ld[k]; }
  };
  precondition();
  let rz = 0; for (let k = 0; k < n; k++) { p[k] = z[k]; rz += r[k] * z[k]; }
  const tol = Math.max(1e-24, 1e-12 * bb);   // the residual a millionth of the first
  let rr = bb, iterations = 0;
  for (; rr > tol && iterations < 2000; iterations++) {
    let pq = 0;
    for (let k = 0; k < n; k++) {
      let v = diag[k] * p[k];
      const kw = west[k], kn = north[k], e = east[k], s = south[k];
      if (kw >= 0) v -= cw[k] * p[kw];
      if (kn >= 0) v -= cn[k] * p[kn];
      if (e >= 0) v -= cw[e] * p[e];
      if (s >= 0) v -= cn[s] * p[s];
      q[k] = v; pq += p[k] * v;
    }
    if (!(pq > 0)) break;
    const alpha = rz / pq; rr = 0;
    for (let k = 0; k < n; k++) { d[k] += alpha * p[k]; r[k] -= alpha * q[k]; rr += r[k] * r[k]; }
    precondition();
    let next = 0; for (let k = 0; k < n; k++) next += r[k] * z[k];
    const beta = next / rz; rz = next;
    for (let k = 0; k < n; k++) p[k] = z[k] + beta * p[k];
  }
  // the water each face carries over the step, towards +x (fe) and +y (fs), from the new surface
  const { fe, fs, out, dW, dG, pout } = b, thin = o.wetEps ?? 0.004;
  let worst = 0;
  for (let k = 0; k < n; k++) { out[k] = 0; }
  for (let k = 0; k < n; k++) {
    const e = east[k], s = south[k], Hk = H[k] + d[k];
    fe[k] = e >= 0 ? cw[e] * (Hk - H[e] - d[e]) : 0; fs[k] = s >= 0 ? cn[s] * (Hk - H[s] - d[s]) : 0;
    if (fe[k] > 0) out[k] += fe[k]; else if (fe[k] < 0) out[e] -= fe[k];
    if (fs[k] > 0) out[k] += fs[k]; else if (fs[k] < 0) out[s] -= fs[k];
  }
  for (let k = 0; k < n; k++) { const wk = W[cells[k]]; if (out[k] > 0 && wk > thin) worst = Math.max(worst, out[k] / wk); }
  // substeps: no donor gives more than half its water in one, so the pigment it passes on is the pigment it holds. A
  // film thinner than wetEps is left to the 95% budget: counted, its last micrometre asked for 64 substeps of the box.
  const subs = Math.min(64, Math.max(1, Math.ceil(worst / 0.5)));
  const act = []; for (let g = 0; g < K; g++) { const Gg = G[g]; for (let k = 0; k < n; k++) if (Gg[cells[k]] !== 0) { act.push(g); break; } }
  // the CG's work arrays are free now: ae, as the water each face carries in a substep after its donor's budget, c the
  // donor concentrations, g each cell's pigment
  const ae = p, as = q, c = z, g = t;
  let moved = 0;
  for (let sub = 0; sub < subs; sub++) {
    // water: each donor's outflow is held to 95% of what it has (the explicit flow's budget)
    for (let k = 0; k < n; k++) out[k] = 0;
    for (let k = 0; k < n; k++) {
      const f = fe[k] / subs, h = fs[k] / subs;
      if (f > 0) out[k] += f; else if (f < 0) out[east[k]] -= f;
      if (h > 0) out[k] += h; else if (h < 0) out[south[k]] -= h;
    }
    for (let k = 0; k < n; k++) { const wk = W[cells[k]]; out[k] = out[k] > 0.95 * wk ? (0.95 * wk) / out[k] : 1; }   // now the donor's scale
    for (let k = 0; k < n; k++) {
      const f = fe[k] / subs, h = fs[k] / subs;
      ae[k] = f > 0 ? f * out[k] : f < 0 ? f * out[east[k]] : 0;
      as[k] = h > 0 ? h * out[k] : h < 0 ? h * out[south[k]] : 0;
    }
    // pigment at the donor's concentration, each donor held to 95% of its pigment (pout: its outgoing, then its scale)
    for (let a = 0; a < act.length; a++) {
      const Gg = G[act[a]];
      for (let k = 0; k < n; k++) { const i = cells[k], wk = W[i]; g[k] = Gg[i]; c[k] = wk > 1e-12 ? g[k] / wk : 0; dG[k] = 0; pout[k] = 0; }
      for (let k = 0; k < n; k++) {
        const f = ae[k], h = as[k];
        if (f > 0) pout[k] += f * c[k]; else if (f < 0) pout[east[k]] -= f * c[east[k]];
        if (h > 0) pout[k] += h * c[k]; else if (h < 0) pout[south[k]] -= h * c[south[k]];
      }
      for (let k = 0; k < n; k++) pout[k] = pout[k] > 0.95 * g[k] ? (0.95 * g[k]) / pout[k] : 1;
      for (let k = 0; k < n; k++) {
        const f = ae[k], h = as[k];
        if (f) { const e = east[k], d = f > 0 ? k : e, v = f * c[d] * pout[d]; dG[k] -= v; dG[e] += v; }
        if (h) { const s = south[k], d = h > 0 ? k : s, v = h * c[d] * pout[d]; dG[k] -= v; dG[s] += v; }
      }
      for (let k = 0; k < n; k++) if (dG[k]) { const i = cells[k]; Gg[i] = Math.max(0, g[k] + dG[k]); }
    }
    for (let k = 0; k < n; k++) dW[k] = 0;
    for (let k = 0; k < n; k++) {
      const f = ae[k], h = as[k];
      if (f) { dW[k] -= f; dW[east[k]] += f; moved += Math.abs(f); }
      if (h) { dW[k] -= h; dW[south[k]] += h; moved += Math.abs(h); }
    }
    for (let k = 0; k < n; k++) if (dW[k]) { const i = cells[k]; W[i] = Math.max(0, W[i] + dW[k]); }
  }
  done();
  return { cells: n, iterations, moved };
}
