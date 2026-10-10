// Shared reading of one picture: where the ink is, how wide, and what is line versus broad passage.
// The line/wash scale is found from the picture's own mark widths; pen over wash is found as a density ridge.
import { distanceTransform, components, dilate, blur } from './morph.mjs';
import { quantile, sd } from './image.mjs';

// Otsu's threshold on log width. Pen-and-wash has two width scales, separated by a histogram valley;
// where there is not one (all line, or all wash) the caller checks the separation and ignores the answer.
function splitScale(values) {
  const logs = values.map(v => Math.log2(Math.max(0.6, v)));
  let lo = Infinity, hi = -Infinity;
  for (const v of logs) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const bins = 64;
  if (hi - lo < 0.5) return null;
  const hist = new Float64Array(bins);
  for (const v of logs) hist[Math.min(bins - 1, Math.floor((v - lo) / (hi - lo) * bins))]++;
  const total = logs.length; let sumAll = 0;
  for (let b = 0; b < bins; b++) sumAll += b * hist[b];
  let wB = 0, sumB = 0, best = -1, bestB = 0;
  for (let b = 0; b < bins; b++) {
    wB += hist[b]; if (!wB) continue; const wF = total - wB; if (!wF) break;
    sumB += b * hist[b];
    const between = wB * wF * ((sumB / wB) - ((sumAll - sumB) / wF)) ** 2;
    if (between > best) { best = between; bestB = b; }
  }
  const t = lo + (bestB + 1) / bins * (hi - lo);
  let nLo = 0, sLo = 0, nHi = 0, sHi = 0;
  for (const v of values) { if (Math.log2(Math.max(0.6, v)) <= t) { nLo++; sLo += v; } else { nHi++; sHi += v; } }
  return { radius: 2 ** t, lowMean: sLo / Math.max(1, nLo), highMean: sHi / Math.max(1, nHi), highShare: nHi / total };
}

// Pixels no 8-neighbour beats for distance from the paper: the middle of a mark, where its half-width is.
function ridgePoints(mask, radius, w, h, minComponent) {
  let labels = null, areas = null;
  if (minComponent) ({ labels, areas } = components(mask, w, h));
  const out = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!mask[i]) continue; const r = radius[i]; if (r < 0.9) continue;
    if (labels && areas[labels[i]] < minComponent) continue;
    let top = true;
    for (let dy = -1; dy <= 1 && top; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; if (radius[i + dy * w + dx] > r + 1e-6) { top = false; break; } }
    if (top) out.push(i);
  }
  return out;
}

// `impose` forces the scale split found on another picture, so a target and its painting are read at one scale.
export function buildField(img, impose = null) {
  const { w, h, n, D, inkFloor, noise } = img;
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i++) ink[i] = D[i] > inkFloor ? 1 : 0;
  const inkArea = ink.reduce((a, b) => a + b, 0);
  const radius = distanceTransform(ink, w, h);

  // line/passage split from half-widths sampled along the medial axis, not per pixel, so big washes do not dominate
  const inkRidge = ridgePoints(ink, radius, w, h, null);
  const sampleR = inkRidge.map(i => radius[i]);
  const split = sampleR.length > 200 ? splitScale(sampleR) : null;
  // trust the split only when the scales are apart and the broad one holds a real share
  const twoScale = impose ? impose.twoScale : (!!split && split.highMean >= 3 * split.lowMean && split.highShare >= 0.02 && split.radius >= 2);
  const broadR = twoScale ? (impose ? impose.broadR : split.radius) : Infinity;

  // with no scale break, the median mark width decides whether the sheet is all line or all wash
  const medianR = sampleR.length ? quantile(sampleR, 0.5) : 1;
  const allWash = impose ? impose.allWash : (!twoScale && medianR >= 4 && inkArea > 0.04 * n);

  // a passage survives an opening at that scale; an attached line does not
  let washMask = new Uint8Array(n);
  if (allWash) { for (let i = 0; i < n; i++) washMask[i] = ink[i]; }
  else if (twoScale) {
    const seed = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (ink[i] && radius[i] >= broadR) seed[i] = 1;
    const opened = dilate(seed, w, h, broadR);
    for (let i = 0; i < n; i++) washMask[i] = ink[i] && opened[i] ? 1 : 0;
  }
  const washArea = washMask.reduce((a, b) => a + b, 0);

  // pen over wash: a top hat at line scale, thresholded by the washes' own granulation so grain is not line
  const topR = twoScale ? Math.max(2, Math.min(8, Math.round(0.6 * broadR))) : 0;
  const lineMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (ink[i] && !washMask[i]) lineMask[i] = 1;
  let overWash = 0;
  if (twoScale && washArea > 400) {
    const smooth = blur(D, w, h, topR), top = new Float32Array(n);
    for (let i = 0; i < n; i++) top[i] = D[i] - smooth[i];
    const inWash = []; for (let i = 0; i < n; i += 2) if (washMask[i]) inWash.push(top[i]);
    const tTop = Math.max(0.07, 3.2 * (sd(inWash) || 0.02));
    for (let i = 0; i < n; i++) if (washMask[i] && top[i] > tTop) { lineMask[i] = 1; washMask[i] = 1; overWash++; }
  }
  const lineRadius = distanceTransform(lineMask, w, h);

  // ridge radius is half-width; specks dropped so compression noise does not set the scale
  const ridge = ridgePoints(lineMask, lineRadius, w, h, 8);
  const ridgeR = ridge.map(i => lineRadius[i]);
  const lineWidth = impose ? impose.lineWidth : (ridgeR.length >= 20 ? 2 * Math.max(0.9, quantile(ridgeR, 0.5)) : 2);

  const inkD = []; for (let i = 0; i < n; i++) if (ink[i]) inkD.push(D[i]);
  // darkest ink is shared by the pair, so a lighter painting's greys are not reclassified as pencil
  const dMax = impose ? impose.dMax : (quantile(inkD, 0.995) || inkFloor * 2);
  // grain: density minus a mark-scale trend
  const trend = blur(D, w, h, Math.max(2, lineWidth));
  const grain = new Float32Array(n);
  for (let i = 0; i < n; i++) grain[i] = D[i] - trend[i];

  const lineArea = lineMask.reduce((a, b) => a + b, 0);
  return { img, w, h, n, D, ink, inkArea, inkFrac: inkArea / n, radius, lineRadius, ridge, ridgeR,
    lineWidth, broadR, twoScale, allWash, medianR, lineMask, broadMask: washMask, grain, dMax, inkD, noise,
    lineArea, broadArea: washArea, overWashLine: overWash };
}
