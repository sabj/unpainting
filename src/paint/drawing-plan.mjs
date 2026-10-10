// The plan's drawing section: whether the painter draws, in what medium, how much, which lines and how heavily.
// Line models (tools/seg/lines.py) and tools/seg/ink-lines.mjs only extract candidate lines; this section chooses among
// them. Each field becomes painter flags. An omitted field, or "auto", adds no flag, so the painter's own defaults
// apply: --outlinemedium auto picks graphite or ink from the image, with the default caps and pressure.
// docs/plan-format.md describes the fields.

const MEDIA = Object.freeze(['none', 'graphite', 'ink', 'auto']);
const INK_COLOURS = Object.freeze(['sepia', 'black']);
const LINE_SETS = Object.freeze(['all', 'contours', 'subject', 'regions']);

// Weight 0 is the painter's default line; weight 1 is the heaviest ink the default recipe used to force on every
// subject. Each flag runs linearly between the two.
const WEIGHT_RANGE = Object.freeze({
  inkkscale: [1, 8],
  drawwidthgain: [1.39, 2],
  drawwant: [0.6, 1],
  closingpressure: [0.4, 1],
});
// The closing pen draws only where edge strength is at least this times (1 - closingLines). closingLines 0.5 gives
// the default edge minimum, 0.22.
const CLOSING_EDGE_SPAN = 0.44;
// Amount given: the fixed line caps are lifted and the share decides how many lines the pen draws.
const UNCAPPED = '100000';
// Roles from the line file that each line set leaves out (--drawingskip).
const SKIP_ROLES = Object.freeze({ contours: 'dark fill', subject: 'setting' });
// lines "regions": the order a hand draws a figure in, by the region a line lies in (the line file's `region`, from
// tools/seg/subject-regions.py). The head, hands and the thing held come first, then the clothing's folds, then the
// setting; a line in a dark wash comes last, since the wash already says it. Unknown regions rank with the setting.
const REGION_TIERS = Object.freeze({ head: 1, face: 1, hands: 1, book: 1, clothing: 2, person: 2, chair: 3, background: 3, setting: 3, 'dark wash': 4 });

const round = v => String(Number(v.toFixed(4)));
const lerp = ([a, b], t) => a + (b - a) * t;

function unit(drawing, key) {
  const v = drawing[key];
  if (v == null || v === 'auto') return null;
  if (typeof v !== 'number' || !(v >= 0 && v <= 1)) throw new Error(`drawing.${key}: a number from 0 to 1, or "auto", not ${JSON.stringify(v)}`);
  return v;
}

function choice(drawing, key, allowed) {
  const v = drawing[key];
  if (v == null || v === 'auto') return null;
  if (!allowed.includes(v)) throw new Error(`drawing.${key}: one of ${allowed.join(', ')}, or "auto", not ${JSON.stringify(v)}`);
  return v;
}

/**
 * Painter flags for a plan's drawing section, as an argv array. Null or {} gives [].
 * @param {object|null} drawing { medium, inkColor, amount, lines, weight, closingLines, maxLines }
 */
export function drawingFlags(drawing) {
  if (drawing == null) return [];
  if (typeof drawing !== 'object' || Array.isArray(drawing)) throw new Error('drawing: an object');
  const medium = choice(drawing, 'medium', MEDIA);
  if (medium === 'none') return ['--drawing', 'none'];
  const flags = [];
  if (medium) flags.push('--outlinemedium', medium);
  const colour = choice(drawing, 'inkColor', INK_COLOURS);
  if (colour) flags.push('--inkprofile', `${colour}-ink`);
  const amount = unit(drawing, 'amount');
  if (amount != null) flags.push('--openinglines', UNCAPPED, '--closinglines', UNCAPPED, '--drawshare', round(amount));
  const lines = choice(drawing, 'lines', LINE_SETS);
  if (lines && SKIP_ROLES[lines]) flags.push('--drawingskip', SKIP_ROLES[lines]);
  if (lines === 'regions') flags.push('--drawregions', '1');
  const max = drawing.maxLines;
  if (max != null && max !== 'auto') {
    if (!Number.isInteger(max) || max < 0) throw new Error(`drawing.maxLines: a whole number, 0 or more, or "auto", not ${JSON.stringify(max)}`);
    flags.push('--drawmax', String(max));
    if (amount == null) flags.push('--openinglines', UNCAPPED, '--closinglines', UNCAPPED);
  }
  const weight = unit(drawing, 'weight');
  if (weight != null) for (const [flag, range] of Object.entries(WEIGHT_RANGE)) flags.push(`--${flag}`, round(lerp(range, weight)));
  const closing = unit(drawing, 'closingLines');
  if (closing === 0) flags.push('--drawing', 'first');
  else if (closing != null) flags.push('--closingedgemin', round(CLOSING_EDGE_SPAN * (1 - closing)));
  return flags;
}

// A line's strength for ranking: the model's mean response along it (or its pen weight) times its length, so a long
// sure line outranks a short fragment with the same response.
const lineStrength = g => (g.strength ?? g.weight ?? 1) * (g.length ?? g.points?.length ?? 1);

/**
 * Keeps the strongest `share` of the gestures (see lineStrength), in their own order.
 * Share 1 or more returns the gestures unchanged.
 */
export function strongestShare(gestures, share = 1) {
  if (!(share < 1)) return gestures;
  const keep = Math.ceil(Math.max(0, share) * gestures.length);
  const ranked = gestures.map((g, i) => ({ i, s: lineStrength(g) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, keep);
  const chosen = new Set(ranked.map(r => r.i));
  return gestures.filter((_, i) => chosen.has(i));
}

/**
 * Subject first: the gestures ranked by REGION_TIERS of their `region`, strongest first inside a tier (see
 * lineStrength), the first `max` kept, in their own order. A tier with weight `skip` or above is left out.
 */
export function regionRanked(gestures, { max = Infinity, skip = Infinity, byRegion = true } = {}) {
  const tier = g => (byRegion ? REGION_TIERS[g.region] ?? REGION_TIERS.setting : 0);
  const ranked = gestures.map((g, i) => ({ i, t: tier(g), s: lineStrength(g) }))
    .filter(r => r.t < skip)
    .sort((a, b) => a.t - b.t || b.s - a.s || a.i - b.i)
    .slice(0, Math.max(0, max));
  const chosen = new Set(ranked.map(r => r.i));
  return gestures.filter((_, i) => chosen.has(i));
}

/**
 * The plan's choice from a line file's candidates, from the painter flags drawingFlags writes: --drawshare keeps the
 * strongest share, --drawregions 1 ranks subject first, --drawmax caps the count.
 * @param num the painter's numeric flag reader, (name, fallback) => number
 */
export function planLines(gestures, num) {
  const kept = strongestShare(gestures, num('drawshare', 1));
  const byRegion = num('drawregions', 0) > 0, max = num('drawmax', Infinity);
  return byRegion || Number.isFinite(max) ? regionRanked(kept, { max, byRegion }) : kept;
}
