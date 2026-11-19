// The last stage's surface marks: the marks planned for coats and dressed stone (tools/plate/surface-plan.mjs), laid on the
// dry painting as dry-brush flicks of the region's own paint. A mark is the paint the washes under it are made of, in the
// fractions the sheet holds it, a little deeper (DEEPEN_OD of density at full pressure), broken by the paper's tooth: the
// brush picked up the same mix again and dragged it dry. It is laid by the dry-deposit route a pencil uses
// (src/media/graphite.mjs), as palette pigment in the sheet's top layer, so the Kubelka-Munk render draws it with the
// glazes. A mark goes only where the painting is dense enough to take it (MIN_OD): none in a light. Nothing is read from
// the target here.
import fs from 'node:fs';
import path from 'node:path';
import { pencilDraw } from '../../src/media/graphite.mjs';
import { layersChanged, thickness } from '../../src/media/sheet.mjs';

export const DEEPEN_OD = 0.2;
export const MIN_OD = 0.3;
const TOOTH = 0.6, VARY = 0.3;

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/** The palette's pigments in the fractions the sheet holds them over the given cells (their darkest 40% by absorption). */
export function regionMix(thick, cells, K) {
  const kbar = K.map(k => (k[0] + k[1] + k[2]) / 3), dens = cells.map(i => thick.reduce((a, t, j) => a + t[i] * kbar[j], 0));
  const order = cells.map((_, q) => q).sort((a, b) => dens[b] - dens[a]).slice(0, Math.max(1, Math.ceil(cells.length * 0.4)));
  const sum = thick.map(() => 0); let total = 0;
  for (const q of order) thick.forEach((t, j) => { sum[j] += t[cells[q]]; total += t[cells[q]]; });
  return total > 1e-9 ? sum.map(v => v / total) : sum.map(() => 0);
}

/** Amounts of each pigment that add DEEPEN_OD of density at full pressure, in the given fractions. */
export function deepenAmounts(fractions, K) {
  const kbar = K.map(k => (k[0] + k[1] + k[2]) / 3), perUnit = fractions.reduce((a, f, j) => a + f * kbar[j], 0);
  return perUnit > 1e-9 ? fractions.map(f => f * DEEPEN_OD / perUnit) : fractions.map(() => 0);
}

export async function layMarks(ctx) {
  const { SURFACE_PLAN: plan, PIGS, SC, W2, H2, N2, w, h, out, num, render, sheetDensity, shoot, FILM_BY_PAINT, SEED } = ctx;
  const sheet = ctx.sheet, sheetMm = num('sheetmm', 280), mmPerCell = sheetMm / W2, painted = sheetDensity(render()), thick = thickness(sheet);
  const K = PIGS.map(p => Array.from(p.K));
  const laid = { marks: 0, byKind: {}, skippedLight: 0, lengthMm: 0, cellsTouched: 0 }, touched = new Uint8Array(N2);
  const cellOf = p => Math.min(H2 - 1, Math.max(0, Math.round(p.y * SC))) * W2 + Math.min(W2 - 1, Math.max(0, Math.round(p.x * SC)));
  let gi = 0;
  for (const g of plan.groups) {
    const keep = g.paths.filter(path => median(path.map(p => painted[Math.min(h - 1, Math.max(0, Math.round(p.y))) * w + Math.min(w - 1, Math.max(0, Math.round(p.x)))])) >= MIN_OD);
    laid.skippedLight += g.paths.length - keep.length;
    if (!keep.length) continue;
    const amounts = deepenAmounts(regionMix(thick, keep.flatMap(p => p.map(cellOf)), K), K);
    const strokes = keep.map(path => ({ points: path.map(p => ({ x: p.x * SC - 0.5, y: p.y * SC - 0.5, nw: Math.max(0.5, 2 * p.r * SC), s: p.p })) }));
    amounts.forEach((a, j) => { if (a > 1e-4) pencilDraw(sheet, strokes, j, { amount: a, width: 1, vary: VARY, tooth: TOOTH, seed: SEED + 5200 + gi, usePointWidths: true }); });
    gi++;
    laid.marks += keep.length; laid.byKind[g.kind] = (laid.byKind[g.kind] ?? 0) + keep.length;
    for (const path of keep) for (let k = 0; k < path.length; k++) {
      if (k) laid.lengthMm += Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y) * (sheetMm / w);
      const r = Math.max(1, Math.round(path[k].r * SC)), c = cellOf(path[k]), cx = c % W2, cy = (c / W2) | 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < W2 && y < H2) touched[y * W2 + x] = 1; }
    }
  }
  if (laid.marks) layersChanged(sheet);
  for (let i = 0; i < N2; i++) laid.cellsTouched += touched[i];
  laid.lengthMm = +laid.lengthMm.toFixed(1); laid.shareOfSheet = +(laid.cellsTouched / N2).toFixed(5); laid.deepenOd = DEEPEN_OD; laid.minOd = MIN_OD; laid.mmPerCell = +mmPerCell.toFixed(4);
  ctx.SURFACE_RECORD = { ...plan.record, laid };
  fs.writeFileSync(path.join(out, 'surface-marks.json'), JSON.stringify(ctx.SURFACE_RECORD, null, 1));
  console.log(`surface marks: ${laid.marks} laid (${Object.entries(laid.byKind).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}), ${laid.lengthMm} mm, ${(100 * laid.shareOfSheet).toFixed(3)}% of the sheet; ${laid.skippedLight} planned marks fell in lights and were left`);
  ctx.STAGE = { stage: 'surface-marks' }; ctx.NATIVE_CAPTURE?.('surface-marks');
  if (laid.marks && !FILM_BY_PAINT) await shoot();
  return laid;
}
