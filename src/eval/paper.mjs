// Untouched paper: how much, and whether it reads as deliberate reserves (few, large, smooth) or fill holes.
import { components, close, invert, boundary } from './morph.mjs';

export function measurePaper(field) {
  const { w, h, n, ink, lineWidth, inkFrac } = field;
  // reserves outside the worked field are margin
  const worked = close(ink, w, h, Math.max(4, 6 * lineWidth));
  let workedArea = 0; for (let i = 0; i < n; i++) workedArea += worked[i];
  const reserve = new Uint8Array(n);
  for (let i = 0; i < n; i++) reserve[i] = worked[i] && !ink[i] ? 1 : 0;
  const { labels, areas, count } = components(reserve, w, h);
  const bigCut = Math.max(36, (4 * lineWidth) * (4 * lineWidth));
  let reserveArea = 0, bigArea = 0;
  for (let l = 1; l <= count; l++) { reserveArea += areas[l]; if (areas[l] >= bigCut) bigArea += areas[l]; }
  // speckle: pinhole reserves, counted by area since any real sheet has stray one-pixel holes
  let speckleCount = 0;
  for (let l = 1; l <= count; l++) if (areas[l] < bigCut) speckleCount++;
  return { untouched: 1 - inkFrac, workedFrac: workedArea / n,
    reserveFrac: reserveArea / Math.max(1, workedArea), shapedFrac: reserveArea ? bigArea / reserveArea : NaN,
    speckleArea: reserveArea ? 1 - bigArea / reserveArea : NaN,
    specklePerKpx: 1000 * speckleCount / Math.max(1, n - reserveArea), reserveCount: count, speckleCount };
}

// Paired: what the painting did with the paper the target left alone, and the other way round.
export function paperAgreement(tf, pf) {
  const n = Math.min(tf.n, pf.n);
  let tPaper = 0, pPaper = 0, both = 0, paintedOverPaper = 0, leftBlank = 0;
  for (let i = 0; i < n; i++) {
    const t = !tf.ink[i], p = !pf.ink[i];
    if (t) tPaper++; if (p) pPaper++; if (t && p) both++;
    if (t && !p) paintedOverPaper++;
    if (!t && p) leftBlank++;
  }
  return { targetPaper: tPaper / n, paintingPaper: pPaper / n,
    kept: tPaper ? both / tPaper : NaN, paintedOverPaper: paintedOverPaper / n, leftBlank: leftBlank / n };
}
