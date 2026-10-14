// --subjectwash 1: the washes are cut by subject as well as by colour and value. The field itself (SAM subjects,
// their colour and value clusters, wash and shadow groups, subject lights) is subject-clusters.mjs; this module builds
// it for a painting and gives each consumer its part:
//   the value plan (light-to-dark.mjs)   subjectCovers, holdSubjectLights, subjectDomain
//   the legacy ladder (blockin.mjs)      subjectBlockOptions
// Flags: --subjectwash 0|1 (default 0), --subjectform 3 (mm: the form smoothing inside a subject), --subjectbands
// subject|sheet (a subject's middle layers cut at its own value quantiles, or at the whole sheet's), and the field's own
// --subjectk, --subjectsplit, --subjectedge, --subjectmean, --subjectvalue, --subjectchroma, --subjectlights,
// --subjectlightgap.
import path from 'node:path';
import { hasSegments, loadSegments } from '../../crop/segments.mjs';
import { closeLocal, removeSmall } from '../../raster.js';
import { SUBJECT_DEFAULTS, componentsBy, confinedMean, describeField, subjectField } from './subject-clusters.mjs';

// The middle layers' value quantiles inside each subject, pale end first (the whole-sheet plan uses the same four).
const LAYER_QUANTILES = Object.freeze([0, 0.3, 0.55, 0.78]);
// A subject's layer j is laid only when it sits at least j times this much value over the subject's pale end, so a
// flat subject is one wash, not four bands cut along noise.
const MIN_LAYER_STEP = 0.05;
// The subject's pale end, as a quantile of its own values.
const PALE_END = 0.05;

const FLAGS = Object.freeze({ k: 'subjectk', split: 'subjectsplit', edge: 'subjectedge', mean: 'subjectmean', value: 'subjectvalue', chroma: 'subjectchroma', lights: 'subjectlights', lightGap: 'subjectlightgap' });

/** The field for this painting, or null under --subjectwash 0. Fails when it is asked for and there are no segments. */
export async function subjectWashField({ image, px, w, h, families = [], shaped = false, opt, num, log }) {
  if (!(num('subjectwash', 0) > 0)) { log('subject washes: off (--subjectwash 0); the washes are cut by colour and value bands alone'); return null; }
  const base = image ? path.basename(image, path.extname(image)) : '';
  if (!base || !hasSegments(base)) throw new Error('--subjectwash 1 needs the segments, and there are none (see --segments)');
  const seg = await loadSegments(base, w, h);
  const options = Object.fromEntries(Object.entries(FLAGS).map(([k, flag]) => [k, num(flag, SUBJECT_DEFAULTS[k])]));
  const minShape = Math.max(shaped ? 144 : 4, Math.round(w * h * 0.00015)), started = performance.now();
  const bands = opt('subjectbands', 'subject');
  if (!['subject', 'sheet'].includes(bands)) throw new Error(`--subjectbands: subject or sheet, not ${bands}`);
  const field = { ...subjectField({ seg, px, w, h, families, minShape, options }), formMm: num('subjectform', 3), bands };
  log(`${describeField(field)} (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  return field;
}

/**
 * The middle layers' covers, subject by subject: layer 0 is every cell with middle demand; layer j the cells of a
 * subject darker than that subject's j-th quantile of its value, smoothed inside the subject only. The band edges
 * follow each subject's own form, and never run on across its boundary.
 */
export function subjectCovers({ subjects, values, weights, protectedCells, skyCells = null, count, w, h, mmPerCell, minShape, smoothMm }) {
  const n = w * h, subject = subjects.subject;
  const sm = confinedMean(values, subject, w, h, Math.max(1, Math.round(subjects.formMm / mmPerCell)));
  const live = new Map();
  for (let i = 0; i < n; i++) if (!protectedCells[i] && weights[i] > 0) { const s = subject[i]; if (!live.has(s)) live.set(s, []); live.get(s).push(sm[i]); }
  const cut = new Map();
  // --subjectbands sheet: every subject is cut at the whole sheet's quantiles, still of the value smoothed inside it
  if (subjects.bands === 'sheet') {
    const all = [...live.values()].flat().sort((a, b) => a - b), at = q => all[Math.floor(q * (all.length - 1))] ?? Infinity;
    const q = LAYER_QUANTILES.slice(0, count).map(at);
    for (const s of live.keys()) cut.set(s, q);
  } else for (const [s, v] of live) {
    if (v.length < 4 * minShape) continue;
    v.sort((a, b) => a - b);
    const at = q => v[Math.floor(q * (v.length - 1))], pale = at(PALE_END);
    cut.set(s, LAYER_QUANTILES.slice(0, count).map((q, j) => (j && at(q) - pale >= j * MIN_LAYER_STEP ? at(q) : Infinity)));
  }
  const close = smoothMm < 2 ? 1 : 2, least = smoothMm < 2 ? minShape : minShape * 4;
  return Array.from({ length: count }, (_, j) => {
    if (j === 0) return Uint8Array.from(weights, v => (v > 0 ? 1 : 0));
    const raw = Uint8Array.from(sm, (v, i) => (v > (cut.get(subject[i])?.[j] ?? Infinity) && !skyCells?.[i] ? 1 : 0));
    return removeSmall(closeLocal(raw, w, h, close), w, h, least);
  });
}

/**
 * Each subject's lit planes keep the light wash and the first middle layer and miss the later middle layers, which go
 * round them, so they stay the subject's lightest shapes. A light the plan puts in shadow (any shadow-band weight) is
 * not a lit plane and keeps every layer. No demand is moved: a passage lays one mean charge, so demand moved into it
 * would spread over the whole passage instead of landing on the light.
 */
export function holdSubjectLights(steps, lights) {
  const first = steps.findIndex(s => s.band === 2);
  if (first < 0 || !lights) return steps;
  const shadows = steps.filter(s => s.band >= 4);
  const held = Uint8Array.from(lights, (v, i) => (v && !shadows.some(s => s.wt[i] > 0) ? 1 : 0));
  return steps.map((s, k) => (k <= first || s.band < 2 || s.band >= 4 || s.pig ? s : { ...s, wt: Float32Array.from(s.wt, (v, i) => (held[i] ? 0 : v)) }));
}

/** A step's passages: connected pieces of its mask inside one wash group (one shadow group for a glaze). */
export function subjectDomain(mask, subjects, phase, w, h) {
  return componentsBy(mask, phase === 'shadow' ? subjects.shadow : subjects.wash, w, h);
}

/** The wash groups as segment regions for --segwash: a group is ground when most of its cells are in ground segments. */
export function washGroupRegions(subjects, seg) {
  const n = subjects.wash.length, fg = new Uint8Array(n);
  for (const r of seg.regions) if (r.foreground) for (let i = 0; i < n; i++) if (r.mask[i]) fg[i] = 1;
  return subjects.washIds.map(g => {
    const mask = Uint8Array.from(subjects.wash, v => (v === g ? 1 : 0));
    let cells = 0, front = 0; for (let i = 0; i < n; i++) if (mask[i]) { cells++; front += fg[i]; }
    return { id: g, name: `wash group ${g}`, foreground: front > cells / 2, area: cells / n, mask };
  });
}

/** The legacy ladder's options: passes cut at the wash groups, subject lights held after the first value. */
export function subjectBlockOptions(subjects) {
  return subjects ? { regions: subjects.wash, lateHold: subjects.lights } : {};
}
