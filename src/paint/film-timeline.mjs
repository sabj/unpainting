// --timeline target: re-times a run's recorded frames to follow the target build's own curve. The sheet is never touched.
// The painter films by paint laid, but target builds stay a line drawing for longer.
// Both sides use one measure (tools/judge/rounds/measure.mjs) and are cut into six phases at five milestones.
import { RULE, density, blur } from '../../tools/judge/rounds/measure.mjs';
import { minFilter, maxFilter } from '../raster.js';

// Milestones, in order: washStart, wash pixels at 5% of final density; washHalf, wash coverage at half its final;
// darkHalf, the final darkest decile at half its density; late, 85% of paint laid; inkStart, 97% of paint laid,
// or the frame before a run's first tagged closing-ink frame. Each is a time on its own sequence's clock.
const PAPER_PCT = 0.995, PAPER_DIM = 0.03, WASH_R = 2;
export const PHASES = ['pen', 'first wash', 'mid-values', 'darks', 'detail', 'closing ink'];
export const MILESTONES = ['washStart', 'washHalf', 'darkHalf', 'late', 'inkStart'];
const MILESTONE_RULE = Object.freeze({ washStart: 0.05, washHalf: RULE.washHalf, darkHalf: RULE.darkHalf, late: RULE.lateShare, inkStart: 0.97 });

/**
 * Build curve of grey images of one size (blank sheet first, finish last). Per image, against the final: paint laid,
 * line share, wash coverage and density, darkest-decile density. With a `mask` (1 on the subject), also subject and ground.
 */
export function buildCurve(frames, rule = RULE, mask = null) {
  const { width: w, height: h } = frames[0];
  // each image against its own paper white (99.5th percentile): sources differ, and a sheet slightly darker all over is
  // exposure, not paint. Capped at PAPER_DIM, so a sheet washed from edge to edge keeps its wash.
  const pct = img => Float32Array.from(img.data).sort()[Math.floor(img.data.length * PAPER_PCT)];
  const p0 = pct(frames[0]), white = img => Math.max(p0 * (1 - PAPER_DIM), pct(img));
  const base = density(frames[0], p0);
  const d = frames.map(f => density(f, white(f)).map((v, i) => Math.max(0, v - base[i])));
  const final = d.at(-1);
  const cut = Float32Array.from(final).sort()[Math.floor(final.length * rule.darkDecile)];
  const dark = []; for (let i = 0; i < final.length; i++) if (final[i] >= cut && final[i] > 0) dark.push(i);
  // wash is what survives an opening (a min then a max filter) of radius WASH_R per 432 px: a line, a hatch or a pencil
  // stroke is thinner than the filter and goes; a tone laid over an area stays. Line is the rest.
  const r = Math.max(1, Math.round(WASH_R * w / 432));
  const rows = d.map(x => {
    const wash = maxFilter(minFilter(x, w, h, r), w, h, r);
    let total = 0, washD = 0, washN = 0, dk = 0, subj = 0;
    for (let i = 0; i < x.length; i++) { total += x[i]; const v = Math.min(x[i], wash[i]); washD += v; if (v > rule.washLevel) washN++; if (mask?.[i]) subj += x[i]; }
    for (const i of dark) dk += x[i];
    return { total, washD, washN, dk, subj, ground: total - subj, line: total > 0 ? 1 - washD / total : 0 };
  });
  const F = rows.at(-1), q = (a, b) => a / Math.max(1e-9, b);
  return rows.map(r => ({ paint: q(r.total, F.total), line: r.line, washCov: q(r.washN, F.washN), washDen: q(r.washD, F.washD), dark: q(r.dk, F.dk),
    ...(mask ? { subject: q(r.subj, F.subj), ground: q(r.ground, F.ground) } : {}) }));
}

// the first time a curve reaches `level`, interpolated between samples; `times` are the samples' own clock
const reach = (times, vals, level) => {
  if (vals[0] >= level) return times[0];
  for (let t = 1; t < vals.length; t++) if (vals[t] >= level) {
    const a = vals[t - 1], b = vals[t];
    return times[t - 1] + (times[t] - times[t - 1]) * (b > a ? (level - a) / (b - a) : 1);
  }
  return times.at(-1);
};

/**
 * The five milestones of a curve on its own clock. `inkFrom`, when given, is the time of the first closing-ink frame
 * (a run that tags its closing pen); the detail phase then ends on the frame before it.
 */
export function milestones(curve, times, { inkFrom = null, washFrom = null, rule = MILESTONE_RULE } = {}) {
  const m = {
    washStart: Math.max(washFrom ?? -Infinity, reach(times, curve.map(r => r.washDen), rule.washStart)),
    washHalf: reach(times, curve.map(r => r.washCov), rule.washHalf),
    darkHalf: reach(times, curve.map(r => r.dark), rule.darkHalf),
    late: reach(times, curve.map(r => r.paint), rule.late),
    inkStart: inkFrom !== null ? inkFrom : reach(times, curve.map(r => r.paint), rule.inkStart),
  };
  let lo = times[0];
  for (const k of MILESTONES) { m[k] = Math.max(lo, Math.min(times.at(-1), m[k])); lo = m[k]; }
  return m;
}

/** Each phase's share of the timeline, from milestones on a 0..1 clock. */
export function phaseShares(m) {
  const b = [0, ...MILESTONES.map(k => m[k]), 1];
  return Object.fromEntries(PHASES.map((p, i) => [p, b[i + 1] - b[i]]));
}

/** The median of several milestone sets, taken per milestone and held non-decreasing. */
export function medianMilestones(sets) {
  const med = xs => { const s = [...xs].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const m = {}; let lo = 0;
  for (const k of MILESTONES) { m[k] = Math.max(lo, med(sets.map(s => s[k]))); lo = m[k]; }
  return m;
}

/**
 * New timeline positions for a run's frames: a piecewise-linear map from the run's own milestones (in frame index) to
 * the target's (0..1), with frame 0 at 0 and the last frame at 1. Frames inside one phase keep their even spacing.
 * Returns a new array; the frames are not changed.
 */
export function retimePositions(nFrames, runM, targetM, penEnd = null) {
  const last = nFrames - 1;
  const xs = [0, ...MILESTONES.map(k => runM[k]), last], ys = [0, ...MILESTONES.map(k => targetM[k]), 1];
  // --pencilstage: the opening pen's last frame (penEnd.run, a frame index) lands where the target's drawing is complete
  // (penEnd.target), and the washes that follow it cannot start before that
  if (penEnd) {
    xs.splice(1, 0, Math.min(penEnd.run, xs[1]));
    ys.splice(1, 0, penEnd.target);
    for (let k = 2; k < ys.length - 1; k++) ys[k] = Math.max(ys[k], ys[k - 1]);
  }
  return Array.from({ length: nFrames }, (_, i) => {
    if (last <= 0) return 1;
    let s = 0; while (s < xs.length - 2 && i > xs[s + 1]) s++;
    const x0 = xs[s], x1 = xs[s + 1];
    // a phase with no frames of its own: its share of the timeline is spent holding the frame before
    return x1 > x0 ? ys[s] + (ys[s + 1] - ys[s]) * (i - x0) / (x1 - x0) : ys[s + 1];
  });
}

/** Grey images for buildCurve: every file read at one size, luminance 0..255. */
async function readGrey(sharp, files, width = 432, height = null) {
  const out = [];
  for (const f of files) {
    const { data, info } = await sharp(f).flatten({ background: '#fff' }).resize(width, height ?? undefined, height ? { fit: 'fill' } : {})
      .greyscale().raw().toBuffer({ resolveWithObject: true });
    if (height === null) height = info.height;
    out.push({ data: Float32Array.from(data), width: info.width, height: info.height });
  }
  return out;
}

/** The target's milestones for a code from the v3 manifest, or the median of every code's when it has none. */
export function targetMilestones(manifest, code) {
  const subj = manifest.subjects ?? {};
  if (code && subj[code]?.timeline?.milestones) return { code, milestones: subj[code].timeline.milestones, fallback: false };
  const sets = Object.values(subj).map(s => s.timeline?.milestones).filter(Boolean);
  if (!sets.length) throw new Error('--timeline target: the v3 manifest has no timeline milestones');
  return { code: 'median', milestones: medianMilestones(sets), fallback: true };
}

/** The manifest code whose finish is `image` (by file name, current or old), or null. */
export function codeForImage(manifest, image) {
  const base = String(image).split('/').pop();
  for (const [code, s] of Object.entries(manifest.subjects ?? {})) if ([s.art, s.oldArt, `${code}-art.png`].includes(base)) return code;
  return null;
}

/**
 * The last frame of the opening pen (a 'pen' frame before any paint), or null. Thick pen lines read as a little wash,
 * so washStart is held to after this frame.
 */
export function openingPenUntil(frames) {
  let last = null;
  for (let i = 0; i < frames.length; i++) {
    const s = frames[i].stage;
    if (s === 'paint' || s === 'wash') break;
    if (s === 'pen') last = i;
  }
  return last;
}
/** The index of a run's first closing-ink frame: the first frame tagged ink, accents or gouache after a painted frame. */
export function closingInkFrom(frames) {
  let painted = false;
  for (let i = 0; i < frames.length; i++) {
    const s = frames[i].stage;
    if (s === 'paint' || s === 'wash') painted = true;
    else if (painted && (s === 'ink' || s === 'accents' || s === 'gouache')) return i;
  }
  return null;
}

/**
 * The re-timed positions for a run's recorded frames (`frames` as frames.json lists them, their files in `dir`):
 * the run's curve and milestones on its frame index, the target's from the manifest, and the map between them.
 */
export async function retimeRun({ sharp, dir, frames, manifest, code, join = (a, b) => `${a}/${b}`, penEnd = null }) {
  const grey = await readGrey(sharp, frames.map(f => join(dir, f.src)));
  const curve = buildCurve(grey);
  const ink = closingInkFrom(frames);
  const idx = frames.map((_, i) => i);
  const runM = milestones(curve, idx, { inkFrom: ink === null ? null : ink - 1, washFrom: openingPenUntil(frames) });
  const target = targetMilestones(manifest, code);
  const pen = penEnd != null && openingPenUntil(frames) != null ? { run: openingPenUntil(frames), target: penEnd } : null;
  return { positions: retimePositions(frames.length, runM, target.milestones, pen), curve, runM, target, pen };
}

/** Phase k's share of a run as filmed (its milestones in frame index over `last` frames). */
export function phaseAt(runM, k, last) {
  const b = [0, ...MILESTONES.map(m => runM[m] / Math.max(1, last)), 1];
  return b[k + 1] - b[k];
}

/**
 * An ffmpeg concat list that holds each frame for its share of `seconds`: frame i until frame i + 1's position. A frame
 * whose share is nil is left out; the last is held one frame's worth (and listed twice, as the demuxer wants).
 */
export function concatList(files, positions, seconds) {
  const n = files.length, lines = ['ffconcat version 1.0'];
  for (let i = 0; i < n; i++) {
    const dur = i < n - 1 ? (positions[i + 1] - positions[i]) * seconds : seconds / Math.max(1, n);
    if (dur <= 1e-6) continue;
    lines.push(`file '${files[i]}'`, `duration ${dur.toFixed(4)}`);
  }
  lines.push(`file '${files[n - 1]}'`);
  return lines.join('\n') + '\n';
}

// Frame classes: `orderPhase` is what the painter was doing, from the stage tag; `timelinePhase` is where the frame
// sits on the target's six-phase timeline, from its position and the milestones.
/** A frame's painter-order class from its stage tag; `last` marks the final frame. */
function orderPhase(f, { last = false, painted = false } = {}) {
  if (last) return 'finished';
  const s = f.stage;
  if (s === 'paint' || s === 'wash') return ['ground', 'subject', 'mid', 'dark', 'detail'].includes(f.order) ? f.order : 'mid';
  if (s === 'ink') return painted ? 'closing pen' : 'pen';
  if (!painted) return 'pen';
  return 'detail';
}

/** The timeline class of a position on a 0..1 clock, by milestones (the six PHASES). */
function timelinePhase(position, m) {
  const b = MILESTONES.map(k => m[k]);
  let k = 0; while (k < b.length && position >= b[k]) k++;
  return PHASES[k];
}

/** frames.json's frames with both classes added (a new array). */
export function labelFrames(frames, milestones = null) {
  let painted = false;
  return frames.map((f, i) => {
    if (f.stage === 'paint' || f.stage === 'wash') painted = true;
    const o = orderPhase(f, { last: i === frames.length - 1, painted });
    return { ...f, orderPhase: o, ...(milestones && Number.isFinite(f.position) ? { timelinePhase: timelinePhase(f.position, milestones) } : {}) };
  });
}
