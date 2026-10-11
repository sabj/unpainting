// Whole-sheet jobs the thread pool (sheet-par.mjs) splits by cells or rows: layer compositing (km.mjs) and the flow
// field passes (wash.mjs). Each thread runs the serial code on its share. No Node imports: the workers load it.
import { renderCells } from './km.mjs';
import { gradRows, tensorRows } from './flow-kernel.mjs';
import { unmixRange } from '../crop/unmix-kernel.mjs';
import { blurRows, blurCols } from '../keyframes/blur-kernel.mjs';

/** Chunk c of nC of a job. */
export function runJob(a, c, nC) {
  if (a.kind === 'render') {
    const c0 = Math.floor((a.n * c) / nC), c1 = Math.floor((a.n * (c + 1)) / nC);
    if (c1 > c0) renderCells(a.layers, a.Kp, a.Sp, a.paperRGB, c0, c1, a.scale, null, a.out, a.init ?? null, a.keep ?? null, a.micro ?? null);
  } else if (a.kind === 'grad' || a.kind === 'tensor') {
    // rows lo..hi of the pass, an even share each
    const lo = a.lo ?? (a.kind === 'grad' ? 1 : 2), hi = a.hi ?? (a.kind === 'grad' ? a.h - 2 : a.h - 3), rows = hi - lo + 1;
    if (rows < 1) return;
    const ya = lo + Math.floor((rows * c) / nC), yb = lo + Math.floor((rows * (c + 1)) / nC) - 1;
    if (yb < ya) return;
    if (a.kind === 'grad') gradRows(a.field, a.w, a.gx, a.gy, ya, yb, a.xlo, a.xhi);
    else tensorRows(a.gx, a.gy, a.w, a.fx, a.fy, a.coh, ya, yb, a.xlo, a.xhi);
  } else if (a.kind === 'blurH' || a.kind === 'blurV') {
    const y0 = Math.floor((a.h * c) / nC), y1 = Math.floor((a.h * (c + 1)) / nC);
    if (y1 > y0) { if (a.kind === 'blurH') blurRows(a.src, a.tmp, a.w, a.k, a.r, y0, y1); else blurCols(a.tmp, a.out, a.w, a.h, a.k, a.r, y0, y1); }
  } else if (a.kind === 'unmix') {
    const i0 = Math.floor((a.n * c) / nC), i1 = Math.floor((a.n * (c + 1)) / nC);
    if (i1 > i0) unmixRange(a.D, a.A, a.k, a.Gf, a.P0, a.P1, a.P2, a.L, a.iterations, i0, i1);
  } else if (a.kind === 'tiles') {
    // sheet.mjs wetBoxes' scan of the whole sheet for tiles holding water or damp, by rows of tiles
    const { M, s, capacity, on, w, h, tw, th, TILE } = a, t0 = Math.floor((th * c) / nC), t1 = Math.floor((th * (c + 1)) / nC);
    for (let y = t0 * TILE, ye = Math.min(h, t1 * TILE); y < ye; y++) {
      const r = y * w, tr = ((y / TILE) | 0) * tw;
      for (let x = 0; x <= w - 1;) {
        const tx = (x / TILE) | 0, xe = Math.min(w - 1, tx * TILE + TILE - 1);
        if (!on[tr + tx]) for (let xx = x; xx <= xe; xx++) if (M[r + xx] || s[r + xx] > 0.02 * capacity[r + xx]) { on[tr + tx] = 1; break; }
        x = xe + 1;
      }
    }
  } else if (a.kind === 'thick') {
    // sheet.mjs thickness: every layer's pigment summed per cell, oldest first, then what is still wet or unfixed
    const { layers, G, D, P, out, n } = a, c0 = Math.floor((n * c) / nC), c1 = Math.floor((n * (c + 1)) / nC);
    for (let k = 0; k < out.length; k++) {
      const o = out[k];
      for (const layer of layers) { const q = layer[k]; for (let i = c0; i < c1; i++) o[i] += q[i]; }
      const Gk = G[k], Dk = D[k], Pk = P[k];
      for (let i = c0; i < c1; i++) o[i] += Math.fround(Gk[i] + Dk[i] + Pk[i]);
    }
  } else throw new Error(`jobs-kernel: no job ${a.kind}`);
}
