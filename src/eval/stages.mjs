// Process measures read from recorded frames (frames.json from tools/paint-plate.mjs): is the painting made the way a
// person makes one? None is a target alone; they expose end-state gains bought with an implausible process.
//   early shapes    big shapes stated a third of the way in, at hand-scale blur
//   early speckle   dark isolated specks in the first half where the sheet is still pale: detail before depth
//   backward        steps where a tenth or more of the sheet lightens at passage scale
//   pops            steps where a quarter of the sheet changes at once, or nothing visible changes
//   mid colour      chroma halfway against the end, where both have paint: muddy half-tones read low
//   reached         share of final density down at a quarter, half and three quarters
//   line, wash      line contrast against its neighbours, and tone off the line, at the same three points
// Marks on source.line or source.drawn are not counted as specks or half-tones. stageFlags takes the style's order
// ('line first'). Callers pass density and Lab planes.

/** Pearson correlation of two arrays. */
const corr = (a, b) => {
  const n = a.length; let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n; let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y; }
  return aa > 1e-12 && bb > 1e-12 ? ab / Math.sqrt(aa * bb) : 0;
};

/**
 * @param frames   [{ position, D (density), L (Lab planes {L,a,b}) }] in order, all the same size as the source
 * @param source   { D } density of the source at that size
 * @param blur     (F, w, h, sigma) => Float32Array
 */
export function stageMeasures(frames, source, w, h, blur, { hand = 0.03 } = {}) {
  const n = w * h, side = Math.min(w, h), sigmaHand = Math.max(2, hand * side), sigmaPassage = 2;
  // the source's line, and two cells round it, where a pen mark belongs
  const lineCells = source.drawn ?? source.line;
  const nearLine = source.line || source.drawn ? dilateSquare(Uint8Array.from({ length: n }, (_, i) => ((source.line?.[i] ?? 0) || (source.drawn?.[i] ?? 0) ? 1 : 0)), w, h, 2) : null;
  const last = frames[frames.length - 1];
  const at = p => frames.reduce((best, f) => (Math.abs(f.position - p) < Math.abs(best.position - p) ? f : best), frames[0]);
  const mean = F => { let s = 0; for (let i = 0; i < n; i++) s += F[i]; return s / n; };

  // early shapes: correlation with the source at hand scale, a third of the way in, and what the end reaches
  const srcHand = blur(source.D, w, h, sigmaHand);
  const earlyShapes = corr(blur(at(0.33).D, w, h, sigmaHand), srcHand), endShapes = corr(blur(last.D, w, h, sigmaHand), srcHand);

  // early speckle: specks 0.25 OD above passage-scale surroundings still under a third of final tone, before halfway;
  // per thousand cells, worst frame
  const finalPassage = blur(last.D, w, h, sigmaPassage * 3);
  let speckle = 0;
  for (const f of frames.filter(f => f.position > 0 && f.position <= 0.5)) {
    const local = blur(f.D, w, h, sigmaPassage * 3); let k = 0;
    for (let i = 0; i < n; i++) if (f.D[i] - local[i] > 0.25 && local[i] < finalPassage[i] / 3 && !(nearLine && nearLine[i])) k++;
    speckle = Math.max(speckle, 1000 * k / n);
  }

  // backward steps and pops at passage scale; pops skip the opening fifth, where a broad first wash is normal
  let backward = 0, pops = 0, dead = 0, steps = 0, prev = null;
  for (const f of frames) {
    const B = blur(f.D, w, h, sigmaPassage);
    if (prev) {
      let lighter = 0, changed = 0;
      for (let i = 0; i < n; i++) { const d = B[i] - prev[i]; if (d < -0.03) lighter++; if (Math.abs(d) > 0.05) changed++; }
      steps++;
      if (lighter > n * 0.1) backward++;
      if (changed > n * 0.25 && f.position > 0.2) pops++;
      if (changed < n * 0.002) dead++;
    }
    prev = B;
  }

  // chroma halfway against the source's (not the finished sheet's) in cells where both carry paint, and the hue turn
  const mid = at(0.5), ref = source.L ?? last.L; let cm = 0, ce = 0, dh = 0, kh = 0;
  if (mid.L && ref) for (let i = 0; i < n; i++) if (mid.D[i] > 0.1 && source.D[i] > 0.1 && !(nearLine && nearLine[i])) {
    const a = Math.hypot(mid.L.a[i], mid.L.b[i]), b = Math.hypot(ref.a[i], ref.b[i]); cm += a; ce += b;
    if (a > 6 && b > 6) { let d = Math.abs(Math.atan2(mid.L.b[i], mid.L.a[i]) - Math.atan2(ref.b[i], ref.a[i])) * 180 / Math.PI; if (d > 180) d = 360 - d; dh += d; kh++; }
  }
  const midChroma = ce > 1e-6 ? cm / ce : 1, midHue = kh ? dh / kh : 0;

  // counted from the first frame, which is not zero for a filmed sheet (tape, exposure)
  const base = mean(frames[0].D), total = Math.max(1e-6, mean(last.D) - base);
  const reached = [0.25, 0.5, 0.75].map(p => (mean(at(p).D) - base) / total);
  // on the line and away from it
  const part = sel => {
    let k = 0; for (let i = 0; i < n; i++) if (sel(i)) k++;
    if (!k) return null;
    const m = F => { let s = 0; for (let i = 0; i < n; i++) if (sel(i)) s += F[i]; return s / k; };
    const b = m(frames[0].D), tot = Math.max(1e-6, m(last.D) - b);
    return [0.25, 0.5, 0.75].map(p => (m(at(p).D) - b) / tot);
  };
  const washReached = nearLine ? part(i => !nearLine[i]) : null;
  // line contrast: line cell density less the mean of adjacent off-line cells
  let lineReached = null;
  if (lineCells) {
    const off = Float32Array.from({ length: n }, (_, i) => (nearLine[i] ? 0 : 1)), offB = blur(off, w, h, 4);
    let k = 0; for (let i = 0; i < n; i++) if (lineCells[i] && offB[i] > 0.05) k++;
    const contrast = F => { const B = blur(Float32Array.from(F, (v, i) => v * off[i]), w, h, 4); let s = 0; for (let i = 0; i < n; i++) if (lineCells[i] && offB[i] > 0.05) s += F[i] - B[i] / offB[i]; return k ? s / k : 0; };
    const c0 = contrast(frames[0].D), tot = contrast(last.D) - c0;
    if (k && tot > 1e-3) lineReached = [0.25, 0.5, 0.75].map(p => (contrast(at(p).D) - c0) / tot);
  }
  return { earlyShapes, endShapes, speckle, backwardShare: steps ? backward / steps : 0, pops, dead, steps, midChroma, midHue, reached, lineReached, washReached };
}

/** Flags in words against a person's process. Bands are provisional. */
export function stageFlags(m, { order } = {}) {
  const flags = [];
  const lineFirst = order === 'line first';
  // loose band from one reference film: half the final line down by a quarter
  if (lineFirst && m.lineReached && m.lineReached[0] < 0.5) flags.push(`a quarter of the way in ${(100 * m.lineReached[0]).toFixed(0)}% of the drawing is down; this style draws first`);
  // when drawn first, big shapes are contours, which hand-blur tone correlation cannot see
  if (!lineFirst && m.earlyShapes < 0.5 * m.endShapes) flags.push(`a third of the way in the big shapes are barely stated (${m.earlyShapes.toFixed(2)} against ${m.endShapes.toFixed(2)} at the end)`);
  if (m.speckle > 2) flags.push(`dark specks before depth: ${m.speckle.toFixed(1)} per thousand cells in the first half`);
  if (m.backwardShare > 0.3) flags.push(`${(100 * m.backwardShare).toFixed(0)}% of steps lighten a tenth of the sheet`);
  if (m.pops > 1) flags.push(`${m.pops} steps change a quarter of the sheet at once`);
  if (m.midChroma < 0.7) flags.push(`halfway the colour holds ${(100 * m.midChroma).toFixed(0)}% of the source's chroma: muddy half-tones`);
  if (m.midHue > 20) flags.push(`halfway the hue is turned ${m.midHue.toFixed(0)} degrees from the source`);
  // one reference film has about 35% of final tone by a quarter;
  // ground-wash-first methods put more down early, so flag only past 70%
  const early = lineFirst && m.washReached ? m.washReached[0] : m.reached[0];
  if (early > 0.7) flags.push(`${(100 * early).toFixed(0)}% of the final ${lineFirst ? 'wash' : 'tone'} is down a quarter of the way in (one watercolourist's film: about 35%)`);
  return flags;
}

/** A square dilation by r cells of a 0/1 mask. */
function dilateSquare(M, w, h, r) {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (M[y * w + x]) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < h && xx < w) o[yy * w + xx] = 1; }
  }
  return o;
}
