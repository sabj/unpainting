// Conservative fine-grid transport. Face order and float64 accumulation match the CPU oracle.
import { flowTime } from './flow-time.mjs';

// Carry `arrays` (pigment masses per fine cell) along FX, FY at the donor's concentration, with the water going from wb
// to wa linearly over the substeps; each donor gives at most 95% of its pigment a substep (the coarse flow's budget).
// catchAt.x/y: the share caught at each coarse face in this pore pass, left on the donor's side.
export function carryFine(F, arrays, wb, wa, catchAt = null, catchInto = null) {
  const { w } = F.sheet, N = F.N, FW = F.FW;
  const { FX, FY, donors, dg, out: gain, r: volume, activeCells: cells } = F;
  const count = cells.length, active = [];
  for (let k = 0; k < arrays.length; k++) {
    const A = arrays[k];
    for (let i = 0; i < count; i++) if (A[cells[i]] !== 0) { active.push(k); break; }
  }
  if (!active.length) return;
  for (let i = 0; i < count; i++) { const f = cells[i]; volume[f] = 0; dg[f] = 0; }
  for (let i = 0; i < count; i++) {
    const f = cells[i];
    const a = FX[f], b = FY[f];
    if (a > 0) volume[f] += a; else if (a < 0) volume[f + 1] -= a;
    if (b > 0) volume[f] += b; else if (b < 0) volume[f + FW] -= b;
  }
  let worst = 0;
  for (let i = 0; i < count; i++) { const f = cells[i], wv = Math.max(wb[f], wa[f]); if (volume[f] > 0) worst = Math.max(worst, wv > 1e-9 ? volume[f] / (0.5 * wv) : 1); }
  const subs = Math.min(64, Math.max(1, Math.ceil(worst)));
  let changing = 0;
  for (let i = 0; i < count; i++) {
    const f = cells[i]; gain[f] = 0;
    if (!(volume[f] > 0)) continue; // A cell with no outgoing water never supplies a face.
    const limit = 0.95 / volume[f]; volume[f] = limit;
    gain[f] = wb[f] > 1e-9 ? Math.min(1 / (subs * wb[f]), limit) : 0;
    // Static depth, or the 95% budget binding throughout the linear depth interval: the gain
    // cannot change. Every other donor is revisited at every substep, with the same expression.
    const capped = Math.min(wb[f], wa[f]) > 1e-9 && 1 / (subs * Math.max(wb[f], wa[f])) >= limit;
    if (wb[f] !== wa[f] && !capped) donors[changing++] = f;
  }
  for (let sub = 0; sub < subs; sub++) {
    const t = sub / subs;
    // All outgoing faces read the same donor concentration. The pigment mass cancels from its 95% budget:
    // (q/subs) * (A/W) * min(1, .95*A / (V*A/(subs*W))) = q*A * min(1/(subs*W), .95/V).
    // Compute this water-only gain once per donor, including the original thin-water cutoff. This keeps the
    // same flux, budget and substeps without a per-pigment outgoing scan or a separate water-update pass.
    for (let i = 0; sub > 0 && i < changing; i++) {
      const f = donors[i];
      const depth = wb[f] + (wa[f] - wb[f]) * t;
      gain[f] = depth > 1e-9 ? Math.min(1 / (subs * depth), volume[f]) : 0;
    }
    for (let k = 0; k < active.length; k++) {
      const A = arrays[active[k]], deposit = catchInto?.[active[k]];
      // Keep the original cell order, with the right face before the bottom face. Expanding the two
      // directions removes the axis branch from the hot loop without changing accumulation order.
      // Block-raster traversal visits left/top faces before a cell's own right/bottom faces. After
      // those two faces, nobody reads this cell's old pigment again in this substep. Spend and clear
      // its float64 change there, as the coarse solver does, retaining synchronous donor reads and
      // the same sum order without separate whole-list clear/apply passes.
      for (let i = 0; i < count; i++) {
        const f = cells[i], qx = FX[f], qy = FY[f];
        if (qx) {
          const d = qx > 0 ? f : f + 1, recv = qx > 0 ? f + 1 : f;
          const v = Math.abs(qx) * A[d] * gain[d];
          let caught = 0;
          if (catchAt && (f % FW + 1) % N === 0) {
            const c = Math.floor(f / FW / N) * w + Math.floor((f % FW) / N);
            caught = catchAt.x[c];
          }
          dg[d] -= v; dg[recv] += v * (1 - caught); if (caught) deposit[d] += v * caught;
        }
        if (qy) {
          const d = qy > 0 ? f : f + FW, recv = qy > 0 ? f + FW : f;
          const v = Math.abs(qy) * A[d] * gain[d];
          let caught = 0;
          if (catchAt && (Math.floor(f / FW) + 1) % N === 0) {
            const c = Math.floor(f / FW / N) * w + Math.floor((f % FW) / N);
            caught = catchAt.y[c];
          }
          dg[d] -= v; dg[recv] += v * (1 - caught); if (caught) deposit[d] += v * caught;
        }
        const delta = dg[f]; dg[f] = 0;
        if (delta) A[f] = Math.max(0, A[f] + delta);
      }
    }
  }
}

// in-film pigment diffusion at fine faces, the coarse step's own coefficients in physical units (x N^2 per fine face)
export function diffuseFine(F, wa) {
  const s = F.sheet, o = { ...F.o, dt: F.L.dt }, { iters, fraction } = flowTime(s, o), N = F.N, FW = F.FW, { w } = s;
  const diffuse = Math.min(0.25, Math.max(0, o.diffuse * fraction)), cd = o.carryDepth ?? 0.08, fdf = Math.max(0, (o.filmDiffuse ?? 0) * fraction), fdd = o.filmDepth ?? 0.03;
  if (!(iters > 0) || !(diffuse > 0 || fdf > 0)) return;
  const k0 = iters * N * N, subs = Math.max(1, Math.ceil(k0 * (diffuse + Math.min(0.2, fdf)) / 0.2)), M = s.M;
  // Advection has consumed these face planes. Moisture and topology stay fixed through the diffusion substeps,
  // so compute conductance once, then reuse it for every pigment and substep (the same explicit stencil).
  const { dg, FX: kx, FY: ky, activeWetCells: cells } = F;
  const count = cells.length;
  const wetF = f => M[Math.floor(f / FW / N) * w + Math.floor((f % FW) / N)] && wa[f] > 1e-6;
  for (let i = 0; i < count; i++) {
    const f = cells[i];
    kx[f] = 0; ky[f] = 0; dg[f] = 0;
    if (!wetF(f)) continue;
    for (let dir = 0; dir < 2; dir++) {
      const j = dir ? f + FW : f + 1;
      if ((!dir && (f + 1) % FW === 0) || j >= F.fn || !wetF(j)) continue;
      const wi = wa[f], wj = wa[j], mw = Math.min(wi, wj), mi = wi / cd, mj = wj / cd;
      const cM = Math.min(mi >= 1 ? 1 : mi * mi, mj >= 1 ? 1 : mj * mj);
      (dir ? ky : kx)[f] = Math.min(0.2, k0 / subs * (diffuse * cM + (fdf ? Math.min(0.2, fdf * Math.min(1, mw / fdd)) : 0))) * mw;
    }
  }
  for (const A of F.G) {
    let active = false;
    for (let i = 0; i < count; i++) if (A[cells[i]] !== 0) { active = true; break; }
    if (!active) continue;
    for (let sub = 0; sub < subs; sub++) {
      for (let i = 0; i < count; i++) {
        const f = cells[i];
        if (kx[f]) { const j = f + 1, v = kx[f] * (A[f] / wa[f] - A[j] / wa[j]); dg[f] -= v; dg[j] += v; }
        if (ky[f]) { const j = f + FW, v = ky[f] * (A[f] / wa[f] - A[j] / wa[j]); dg[f] -= v; dg[j] += v; }
        // Both neighbouring donor concentrations were read before either cell was changed.
        const delta = dg[f]; dg[f] = 0;
        if (delta) A[f] = Math.max(0, A[f] + delta);
      }
    }
  }
}
