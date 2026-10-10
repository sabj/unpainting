// --inkres N: the pens draw on their own sheet at N times the painting's resolution, so thin lines keep their taper.
// New ink is averaged down onto the painting's sheet as pigment, so later glazes lie over it. The fine sheet has no
// water flow. Output: paint upsampled, each pixel scaled by fine over coarse ink reflectance per channel. DOM free.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, fix } from '../../media/sheet.mjs';
import { drawGestures } from '../../media/draw.mjs';
import { renderLayers } from '../../media/km.mjs';
import { TAPE } from '../../media/brush.mjs';

export function makeInkRes({ N, W2, H2, paperOpts, pigments, main, gain = 1, pad: opt_pad = null }) {
  if (!(N > 1)) return null;
  N = Math.round(N);
  const WH = W2 * N, HH = H2 * N, nH = WH * HH, nL = W2 * H2, K = pigments.length;
  const paper = makePaper(WH, HH, { ...paperOpts, scale: (paperOpts.scale ?? 1) * N });
  const fine = createSheet(paper, pigments);
  // strokes go on the mark tape tagged with N, so a replay of the tape treats them the same way
  if (main._tape) { fine._tape = main._tape; fine._tapeRes = N; }
  // what has been carried down to the painting's sheet, per pigment, so the next call carries only what is new
  const seen = pigments.map(() => new Float32Array(nH)), inkLo = pigments.map(() => new Float32Array(nL));
  const white = Buffer.alloc(nL * 3, 255), whiteH = Buffer.alloc(nH * 3, 255);
  const fineTotal = k => { const out = new Float32Array(nH), G = fine.G[k], D = fine.D[k], P = fine.P[k]; for (const L of fine.layers) { const a = L[k]; for (let i = 0; i < nH; i++) out[i] += a[i]; } for (let i = 0; i < nH; i++) out[i] += G[i] + D[i] + P[i]; return out; };
  let stats = { calls: 0, ms: 0 };

  /** drawGestures on the fine sheet: points in the painting's cells, want on the painting's grid. */
  function draw(gestures, want, w, h, { ink, peak = null, pen = {}, low = 0.25 } = {}) {
    const t0 = Date.now();
    const at = (x, y) => want[Math.max(0, Math.min(h - 1, Math.round(y))) * w + Math.max(0, Math.min(w - 1, Math.round(x)))];
    if (peak == null) {
      const v = []; for (const g of gestures) for (const p of g.points) v.push(at(p.x, p.y));
      v.sort((a, b) => a - b); peak = v.length ? Math.max(1e-4, v[Math.floor(v.length * 0.95)]) : 1;
    }
    // every size N times, every volume N squared; the speed N times, so a stroke takes the time it took
    const P = { ...pen, nib: (pen.nib ?? 0.8) * N, flex: (pen.flex ?? 1.5) * N, travel: (pen.travel ?? 1.5) * N, reach: (pen.reach ?? 12) * N,
      reservoir: (pen.reservoir ?? 250) * N * N, feed: (pen.feed ?? 1.2) * N * N, drop: (pen.drop ?? 2) * N * N,
      // At N = 1 a cell floors a line's width; the fine sheet's floor is N times smaller, so lines come out thinner.
      // --inkrespad: widen the contact by this x (N - 1) fine cells; 0.25 matches the ink darkness at N = 1.
      pad: opt_pad ?? 0.25 * (N - 1) };
    const up = gestures.map(g => ({ ...g, points: g.points.map(p => {
      const s = p.s != null ? Math.min(1, p.s) : Math.min(1, at(p.x, p.y) / peak);
      // drawGestures adds half a cell to put a point in its cell's middle; the fine sheet's middle is N times further
      const q = { x: (p.x + 0.5) * N - 0.5, y: (p.y + 0.5) * N - 0.5, s, v: (p.v ?? 1.9 - 1.1 * s) * N };
      if (p.nw != null) q.nw = p.nw * N;
      if (p.dwell) q.dwell = p.dwell;
      return q;
    }) }));
    wet();
    // --inkresgain: the ink's strength on the fine sheet, for calibrating a line's darkness against the artwork's
    const r = drawGestures(fine, up, [0], 1, 1, { ink: gain === 1 ? ink : ink.map(v => v * gain), peak: 1, pen: P, low });
    carry();
    stats.calls++; stats.ms += Date.now() - t0;
    return r;
  }

  // Copy the painting's water to the fine sheet before a pen call, so a line in a damp wash wicks further and paler
  // (pen.mjs dampOf). Pores hold the same share of their capacity. Cleared again on settle.
  function wet() {
    if (TAPE && fine._tape) TAPE.push({ k: 'W', r: N });
    const cf = paper.capacity, cm = main.paper.capacity;
    let any = false;
    for (let i = 0; i < nL; i++) if (main.M[i] || main.s[i] > 0) { any = true; break; }
    if (!any) { if (wetOn) { fine.W.fill(0); fine.s.fill(0); fine.M.fill(0); fine.ever.fill(0); wetOn = false; } return; }
    for (let y = 0; y < HH; y++) { const yl = (y / N) | 0; for (let x = 0; x < WH; x++) {
      const j = y * WH + x, i = yl * W2 + ((x / N) | 0);
      fine.M[j] = main.M[i]; fine.ever[j] = main.ever[i]; fine.W[j] = main.W[i];
      fine.s[j] = cm[i] > 0 ? main.s[i] * cf[j] / cm[i] : 0;
    } }
    wetOn = true;
  }
  let wetOn = false;

  // the new fine ink, averaged over each coarse cell, deposited on the painting's sheet: settled where the painting's
  // sheet is dry, suspended in the water where a wash stands wet, so it moves with that wash as the pen's ink did
  function carry() {
    for (let k = 0; k < K; k++) {
      const T = fineTotal(k), S = seen[k], add = new Float32Array(nL);
      let any = false;
      for (let y = 0; y < HH; y++) { const yl = (y / N) | 0; for (let x = 0; x < WH; x++) { const i = y * WH + x, d = T[i] - S[i]; if (d !== 0) { add[yl * W2 + ((x / N) | 0)] += d; any = true; } } }
      if (!any) continue;
      S.set(T);
      const inv = 1 / (N * N), D = main.D[k], G = main.G[k], L = inkLo[k];
      for (let i = 0; i < nL; i++) if (add[i]) { const a = add[i] * inv; if (main.M[i]) G[i] += a; else D[i] += a; L[i] += a; }
    }
  }

  /** The fine sheet dried: its water gone and its pigment fixed, as the painting's sheet is at the end of a pass. */
  function settle() {
    for (let k = 0; k < K; k++) { const G = fine.G[k], D = fine.D[k]; for (let i = 0; i < nH; i++) if (G[i]) { D[i] += G[i]; G[i] = 0; } }
    fine.W.fill(0); fine.s.fill(0); fine.M.fill(0); fine.ever.fill(0); wetOn = false;
    fix(fine);
  }

  /** The painting at N times its width: `lo` is the painting's own render (RGB bytes, W2 by H2). */
  function compose(lo) {
    const inkH = renderLayers([pigments.map((_, k) => fineTotal(k))], pigments, whiteH, nH, 1);
    const inkL = renderLayers([inkLo], pigments, white, nL, 1);
    const out = Buffer.alloc(nH * 3);
    for (let y = 0; y < HH; y++) {
      const fy = Math.min(H2 - 1, Math.max(0, (y + 0.5) / N - 0.5)), y0 = Math.floor(fy), y1 = Math.min(H2 - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < WH; x++) {
        const fx = Math.min(W2 - 1, Math.max(0, (x + 0.5) / N - 0.5)), x0 = Math.floor(fx), x1 = Math.min(W2 - 1, x0 + 1), tx = fx - x0;
        const a = y0 * W2 + x0, b = y0 * W2 + x1, c = y1 * W2 + x0, d = y1 * W2 + x1, o = (y * WH + x) * 3;
        for (let ch = 0; ch < 3; ch++) {
          const bil = F => (F[a * 3 + ch] * (1 - tx) + F[b * 3 + ch] * tx) * (1 - ty) + (F[c * 3 + ch] * (1 - tx) + F[d * 3 + ch] * tx) * ty;
          const ratio = inkH[o + ch] / Math.max(1, bil(inkL));
          out[o + ch] = Math.max(0, Math.min(255, Math.round(bil(lo) * Math.min(ratio, 255 / Math.max(1, bil(lo))))));
        }
      }
    }
    return out;
  }

  return { N, width: WH, height: HH, draw, settle, compose, carry, wet, stats, fine };
}
