// Split line work into single marks and measure their width, breaks and load variation.
import { thin } from './morph.mjs';
import { quantile, mean, sd } from './image.mjs';

// Thinned line work to polylines: each degree-2 run between junctions or ends is one mark; junction-free rings once round.
function traceSkeleton(skel, w, h) {
  const n = w * h, deg = new Uint8Array(n), nb = (i) => {
    const x = i % w, y = (i / w) | 0, out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx; if (skel[j]) out.push(j);
    }
    return out;
  };
  const pts = []; for (let i = 0; i < n; i++) if (skel[i]) { deg[i] = nb(i).length; pts.push(i); }
  const done = new Set(), paths = [];
  const walk = (start, first) => {
    const path = [start]; let prev = start, cur = first;
    for (let guard = 0; guard < n; guard++) {
      path.push(cur);
      if (deg[cur] !== 2) break;
      const next = nb(cur).find(j => j !== prev);
      if (next === undefined || path.length > 4 && next === start) break;
      prev = cur; cur = next;
    }
    return path;
  };
  for (const p of pts) {
    if (deg[p] === 2) continue;
    for (const q of nb(p)) {
      if (done.has(p * n + q)) continue;
      const path = walk(p, q);
      done.add(p * n + q); done.add(path[path.length - 1] * n + path[path.length - 2]);
      paths.push({ pts: path, open: deg[p] === 1, openEnd: deg[path[path.length - 1]] === 1 });
    }
  }
  // rings: untouched and all degree 2
  const seen = new Set(paths.flatMap(p => p.pts));
  for (const p of pts) {
    if (seen.has(p) || deg[p] !== 2) continue;
    const path = walk(nb(p)[0], p); for (const q of path) seen.add(q);
    paths.push({ pts: path, open: false, openEnd: false, ring: true });
  }
  return paths;
}

const polyLength = (pts, w) => { let L = 0; for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; L += (a % w === b % w || ((a / w) | 0) === ((b / w) | 0)) ? 1 : Math.SQRT2; } return L; };

export function measureStrokes(field) {
  const { w, h, lineRadius: radius, lineMask, lineWidth, D } = field;
  // nearly all "line" means the line/wash split failed; stop instead of thinning a solid block
  const coverage = field.lineArea / (w * h);
  if (coverage > 0.4 || lineWidth > 24) return { count: 0, resolved: false, tooDense: true, lineWidth, coverage, strokes: [] };
  const skel = thin(lineMask, w, h);
  const traced = traceSkeleton(skel, w, h);
  const minLen = Math.max(5, 3 * lineWidth);
  const strokes = [];
  for (const t of traced) {
    const L = polyLength(t.pts, w);
    if (L < minLen || t.pts.length < 5) continue;
    const width = t.pts.map(i => 2 * radius[i]), dens = t.pts.map(i => D[i]);
    const lo = Math.max(1, Math.round(t.pts.length * 0.18)), hi = t.pts.length - lo;
    const body = width.slice(lo, hi);
    if (body.length < 3) continue;
    const bodyMed = quantile(body, 0.5) || lineWidth;
    const bodyD = dens.slice(lo, hi), bodyDMed = quantile(bodyD, 0.5) || 0.1;
    const tip = Math.max(2, Math.round(width.length * 0.08));
    const ends = [], endsD = [];
    if (t.open) { ends.push(mean(width.slice(0, tip)) / bodyMed); endsD.push(mean(dens.slice(0, tip)) / bodyDMed); }
    if (t.openEnd) { ends.push(mean(width.slice(-tip)) / bodyMed); endsD.push(mean(dens.slice(-tip)) / bodyDMed); }
    strokes.push({ len: L, lenInWidths: L / bodyMed, bodyMed, endsD,
      loadRatio: (quantile(bodyD, 0.9) || bodyDMed) / Math.max(0.02, quantile(bodyD, 0.1) || bodyDMed),
      widthRatio: (quantile(body, 0.9) || bodyMed) / Math.max(0.5, quantile(body, 0.1) || bodyMed),
      widthSpan: body.reduce((a,v)=>Math.max(a,v),0) / Math.max(0.5, body.reduce((a,v)=>Math.min(a,v),Infinity)),
      densRange: (quantile(dens, 0.9) - quantile(dens, 0.1)) / Math.max(1e-3, quantile(dens, 0.5)),
      ends, freeEnds: (t.open ? 1 : 0) + (t.openEnd ? 1 : 0) });
  }
  const lens = strokes.map(s => s.lenInWidths), allEnds = strokes.flatMap(s => s.ends), allEndsD = strokes.flatMap(s => s.endsD);
  const totalLen = strokes.reduce((a, s) => a + s.lenInWidths, 0);
  const freeEnds = strokes.reduce((a, s) => a + s.freeEnds, 0);
  return {
    count: strokes.length, resolved: lineWidth >= 2.2, lineWidth,
    widthRatio: strokes.length ? quantile(strokes.map(s => s.widthRatio), 0.5) : NaN,
    widthRatioP90: strokes.length ? quantile(strokes.map(s => s.widthRatio), 0.9) : NaN,
    lenMedian: strokes.length ? quantile(lens, 0.5) : NaN,
    lenCV: strokes.length > 2 ? sd(lens) / mean(lens) : NaN,
    lenP90overP10: strokes.length > 4 ? quantile(lens, 0.9) / Math.max(0.5, quantile(lens, 0.1)) : NaN,
    endTaper: allEnds.length ? quantile(allEnds.map(r => Math.abs(Math.log2(r))), 0.5) : NaN,
    blotEnds: allEnds.length ? allEnds.filter(r => r > 1.25).length / allEnds.length : NaN,
    thinEnds: allEnds.length ? allEnds.filter(r => r < 0.8).length / allEnds.length : NaN,
    tidyEnds: allEnds.length ? allEnds.filter(r => r >= 0.8 && r <= 1.25).length / allEnds.length : NaN,
    endsMeasured: allEnds.length,
    breaksPer100: totalLen > 0 ? 100 * freeEnds / totalLen : NaN,
    densRange: strokes.length ? quantile(strokes.map(s => s.densRange), 0.5) : NaN,
    // ink load variation along a mark, measurable where width is too narrow to read
    loadRatio: strokes.length ? quantile(strokes.map(s => s.loadRatio), 0.5) : NaN,
    loadRatioP90: strokes.length ? quantile(strokes.map(s => s.loadRatio), 0.9) : NaN,
    endLoad: allEndsD.length ? quantile(allEndsD.map(r => Math.abs(Math.log2(Math.max(0.05, r)))), 0.5) : NaN,
    blotLoadEnds: allEndsD.length ? allEndsD.filter(r => r > 1.2).length / allEndsD.length : NaN,
    fadeEnds: allEndsD.length ? allEndsD.filter(r => r < 0.8).length / allEndsD.length : NaN,
    flatEnds: allEndsD.length ? allEndsD.filter(r => r >= 0.8 && r <= 1.2).length / allEndsD.length : NaN,
    strokes,
  };
}

// Buckshot: ink as evenly scattered tiny specks. Real stipple clumps where tone is wanted.
export function measureDots(field, comps) {
  const { w, lineWidth } = field, { labels, areas, count } = comps;
  // a nib dot is a disc a little wider than the nib's line, so the size cut allows for it
  const maxDot = Math.max(6, 2.2 * lineWidth * lineWidth);
  const sums = new Float64Array(count + 1), sxs = new Float64Array(count + 1), sys = new Float64Array(count + 1);
  for (let i = 0; i < field.n; i++) { const l = labels[i]; if (!l) continue; sums[l]++; sxs[l] += i % w; sys[l] += (i / w) | 0; }
  const dots = []; let dotArea = 0, inkArea = 0;
  for (let l = 1; l <= count; l++) { inkArea += areas[l]; if (areas[l] > 0 && areas[l] <= maxDot) { dots.push([sxs[l] / sums[l], sys[l] / sums[l]]); dotArea += areas[l]; } }
  const dotFrac = inkArea ? dotArea / inkArea : 0;      // share of the ink that arrived as specks
  const dotCountFrac = count ? dots.length / count : 0;
  let nnRatio = NaN;
  if (dots.length >= 12) {
    const step = Math.ceil(dots.length / 1500), pick = dots.filter((_, i) => i % step === 0);
    const nn = pick.map(([x, y]) => { let best = Infinity; for (const [u, v] of dots) { if (u === x && v === y) continue; const d = (u - x) ** 2 + (v - y) ** 2; if (d < best) best = d; } return Math.sqrt(best); });
    // Clark and Evans: mean nearest-neighbour distance over that of random points at the same density
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of dots) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const area = Math.max(1, (x1 - x0) * (y1 - y0));
    nnRatio = mean(nn) / (0.5 * Math.sqrt(area / dots.length));
  }
  return { dots: dots.length, dotFrac, dotCountFrac, nnRatio, comps: count };
}
