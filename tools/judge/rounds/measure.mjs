// One stage-selection contract for every run, from what is on the sheet.
//
// Frame 0 is the blank sheet. Each frame is read as ink density against the run's own paper, d = 1 - L / paper,
// where paper is the mean of the lightest tenth of frame 0, less frame 0's own density (paper grain) and clamped to
// 0..1. A pixel carries wash when its density at the area scale (a Gaussian of 1.5% of the width) is over 0.04, it has
// tone itself under 0.45, and it is not a line peak: a pen line, the paper beside it and a solid inked mass are the
// pen's, not a wash. Every stage is then defined against the run's own final
// frame, with one rule for every run. No tags, stage names or frame counts are read, so a run cannot pick its own
// stages and recording cadence cannot move them.
//
//   A  end of the first pen: the last frame before the first wash-led step. A step is wash-led when it lays half or
//      more of its new density in wash pixels, or when under a quarter of it is finer than the area scale (a tint
//      too pale to count as wash pixels is still a wash, not a line). A run whose first marks are wash-led has no pen
//      stage.
//   B  end of the first wash pass: the first frame after A whose wash coverage reaches half its final coverage, kept
//      before D.
//   D  the darks: the first frame where the darkest decile of the final painting reaches 50% of its final density.
//   H  the late stage: the first frame at 85% of the total paint laid, so late pen and accents are inside it.
//   I  the final frame.
//
// A stage a run does not reach (a run with no pen has no A) is null. Stages may share a frame; the reason says so.
//
// DOM free: callers hand in grey images as { data: Float32Array of luminance 0..255, width, height }.

// Stage names for measureRun and selectStages. Rounds use liveStages and selectByPosition instead.
export const STAGES = ['A', 'B', 'D', 'H', 'I'];

/**
 * The live site's stages for one subject (work/references/manifest.json, `subjects[id]`): every stage over 0
 * percent, named by its percent as the files are ("025"), placed at its timeline position where the manifest gives
 * one (v2) and at its percent otherwise (v3), the finish at 1.
 */
export function liveStages(subject, dir = 'work/references') {
  return subject.stages.filter(s => s.percent > 0).map(s => ({
    name: String(s.percent).padStart(3, '0'), percent: s.percent, position: s.percent >= 100 ? 1 : Number.isFinite(s.timeline) ? s.timeline : s.percent / 100,
    file: `${dir}/${s.file}`,
    label: s.percent === 100 ? 'the finish' : s.label ? `${s.label.toLowerCase()}, ${s.percent}% of the live sequence` : `${s.percent}% of the live sequence`,
  }));
}

/** Each frame's place in its run, 0 to 1: frames.json's own `position`, or the frame's index when it has none. */
export function framePositions(frames) {
  const n = frames.length;
  return frames.map((f, i) => (Number.isFinite(f.position) ? f.position : n > 1 ? i / (n - 1) : 1));
}

/**
 * One frame per live stage: the frame nearest the stage's timeline position (the later of two equally near), and the
 * last frame for the finish. Nothing on the sheet is read, so every run is placed by the same clock the site plays.
 */
export function selectByPosition(positions, stages) {
  const idx = {}, why = {}, last = positions.length - 1;
  for (const s of stages) {
    if (s.position >= 1) { idx[s.name] = last; why[s.name] = 'final frame'; continue; }
    let best = 0;
    for (let t = 0; t <= last; t++) if (Math.abs(positions[t] - s.position) <= Math.abs(positions[best] - s.position)) best = t;
    idx[s.name] = best;
    why[s.name] = `nearest frame to the live stage's position ${s.position.toFixed(3)} (frame at ${positions[best].toFixed(3)})`;
  }
  return { idx, why };
}

/** The rule's constants, frozen before any result is seen. */
export const RULE = Object.freeze({
  blurFrac: 0.015,    // the area scale: a Gaussian of 1.5% of the width separates a wash from a line
  minStep: 0.002,     // increments under this mean density are ignored (noise, JPEG)
  washLevel: 0.04,    // wash: area density over this,
  toneMin: 0.03,      // the pixel's own density over this,
  linePeak: 0.08,     // and the pixel no more than this over its area density,
  inkLevel: 0.45,     // and under this: a solid inked mass is the pen's, not a wash
  washLed: 0.5,       // A: a step is wash-led when half or more of its new density lands in wash pixels,
  fineLed: 0.25,      // or when under a quarter of its new density is finer than the area scale
  washHalf: 0.5,      // B: half the final wash coverage
  darkDecile: 0.9,    // D: the pixels at or over the 90th percentile of the final density
  darkHalf: 0.5,      // D: at half their final density
  lateShare: 0.85,    // H: 85% of the total paint laid
});

/** Paper luminance: the mean of the lightest tenth. */
function paperOf(img) {
  const v = Float32Array.from(img.data).sort();
  const top = v.subarray(Math.floor(v.length * 0.9));
  return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
}

/** Ink density against a paper luminance. */
export function density(img, paper) {
  const out = new Float32Array(img.data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, 1 - img.data[i] / paper));
  return out;
}

/** A separable Gaussian by three box passes. Returns a new array. */
export function blur(data, w, h, sigma) {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  let a = Float32Array.from(data), b = new Float32Array(data.length);
  const pass = (src, dst, horizontal) => {
    const n = horizontal ? w : h, lines = horizontal ? h : w;
    for (let l = 0; l < lines; l++) {
      const at = k => (horizontal ? l * w + k : k * w + l);
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[at(Math.min(n - 1, Math.max(0, k)))];
      for (let k = 0; k < n; k++) {
        dst[at(k)] = sum / (2 * r + 1);
        sum += src[at(Math.min(n - 1, k + r + 1))] - src[at(Math.max(0, k - r))];
      }
    }
  };
  for (let p = 0; p < 3; p++) { pass(a, b, true); pass(b, a, false); }
  return a;
}

const mean = xs => { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[i]; return s / Math.max(1, xs.length); };

/** Per-frame measurements for one run. `frames` are grey images of one size, first to final. */
export function measureRun(frames, rule = RULE) {
  const { width: w, height: h } = frames[0];
  const paper = paperOf(frames[0]);
  const sigma = rule.blurFrac * w;
  const base = density(frames[0], paper);
  const d = frames.map(f => density(f, paper).map((v, i) => Math.max(0, v - base[i])));
  const area = d.map(x => blur(x, w, h, sigma));
  const final = d.at(-1);
  const cut = Float32Array.from(final).sort()[Math.floor(final.length * rule.darkDecile)];
  const dark = []; for (let i = 0; i < final.length; i++) if (final[i] >= cut && final[i] > 0) dark.push(i);
  const darkMean = x => dark.reduce((s, i) => s + x[i], 0) / Math.max(1, dark.length);
  const rows = d.map((x, t) => {
    const prev = t ? d[t - 1] : new Float32Array(x.length);
    const inc = x.map((v, i) => Math.max(0, v - prev[i]));
    const incArea = blur(inc, w, h, sigma);
    let fine = 0; for (let i = 0; i < inc.length; i++) fine += Math.max(0, inc[i] - incArea[i]);
    const step = mean(inc);
    let wash = 0, incWash = 0;
    for (let i = 0; i < x.length; i++) {
      if (area[t][i] > rule.washLevel && x[i] > rule.toneMin && x[i] < rule.inkLevel && x[i] - area[t][i] < rule.linePeak) { wash++; incWash += inc[i]; }
    }
    const sumInc = step * inc.length;
    return { total: mean(x), step, lineShare: sumInc > 0 ? fine / sumInc : 0, washShare: sumInc > 0 ? incWash / sumInc : 0, wash: wash / x.length, dark: darkMean(x) };
  });
  const F = rows.at(-1);
  return rows.map(r => ({ ...r, paint: r.total / Math.max(1e-9, F.total), washFrac: r.wash / Math.max(1e-9, F.wash), darkFrac: r.dark / Math.max(1e-9, F.dark) }));
}

const pct = x => `${Math.round(x * 100)}%`;

/** The stage frames by the rule, as indexes into the frames, with a reason for each. */
export function selectStages(rows, rule = RULE) {
  const n = rows.length, why = {};
  const first = (from, test) => { for (let t = from; t < n; t++) if (test(rows[t], t)) return t; return null; };
  // A: the frames before the first wash-led step
  const washLed = r => r.washShare >= rule.washLed || r.lineShare < rule.fineLed;
  const firstMark = first(1, r => r.step >= rule.minStep);
  let A = null;
  if (firstMark === null) why.A = 'no marks';
  else if (washLed(rows[firstMark])) why.A = `the first marks are wash-led (${pct(rows[firstMark].washShare)} in wash, ${pct(rows[firstMark].lineShare)} fine): no pen stage`;
  else {
    const washed = first(firstMark, r => r.step >= rule.minStep && washLed(r));
    A = washed === null ? n - 1 : washed - 1;
    why.A = washed === null ? 'no wash-led step follows the pen'
      : `the frame before the first wash-led step (frame ${washed}: ${pct(rows[washed].washShare)} in wash, ${pct(rows[washed].lineShare)} fine)`;
  }
  const D = first(0, r => r.darkFrac >= rule.darkHalf);
  why.D = `first frame with the final darkest decile at ${pct(rows[D].darkFrac)} of its final density`;
  let B = first(A === null ? 0 : A + 1, r => r.washFrac >= rule.washHalf);
  if (B !== null && B >= D && D > (A ?? -1) + 1) { B = D - 1; why.B = `wash coverage reaches half only at or after D; held to the frame before D (${pct(rows[B].washFrac)})`; }
  else if (B !== null) why.B = `first frame after A with wash coverage at ${pct(rows[B].washFrac)} of final`;
  else why.B = 'wash coverage never reaches half of final after A';
  const H = first(0, r => r.paint >= rule.lateShare);
  why.H = `first frame with ${pct(rows[H].paint)} of the total paint laid`;
  const I = n - 1;
  why.I = 'final frame';
  const idx = { A, B, D, H, I };
  for (const s of STAGES) for (const t of STAGES) if (s < t && idx[s] !== null && idx[s] === idx[t]) why[t] += `; same frame as ${s}`;
  return { idx, why };
}
