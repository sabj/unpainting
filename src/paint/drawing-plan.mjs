// The plan's drawing section: whether the painter draws, in what medium, how much, which lines and how heavily.
// Line models (tools/seg/lines.py) and tools/seg/ink-lines.mjs only extract candidate lines; this section chooses among
// them. Each field becomes painter flags. An omitted field, or "auto", adds no flag, so the painter's own defaults
// apply: --outlinemedium auto picks graphite or ink from the image, with the default caps and pressure.
// docs/plan-format.md describes the fields.

const MEDIA = Object.freeze(['none', 'graphite', 'ink', 'auto']);
const INK_COLOURS = Object.freeze(['sepia', 'black']);
const LINE_SETS = Object.freeze(['all', 'contours', 'subject', 'regions']);
// drawing.linework "auto": the universal linework stage (src/paint/methods/linework-stage.mjs) picks the source, cleans
// the lines and gates whether to draw, the medium and how much; "off" (the default) leaves the source to drawing.source.
const LINEWORK = Object.freeze(['auto', 'off']);
// Where the line set comes from (--linesource, src/paint/methods/linework-plan.mjs).
const LINE_SOURCES = Object.freeze(['auto', 'none', 'photo-sketch', 'source-ink', 'structure-lines', 'structure-combine', 'line-map']);
// The linked stages (src/paint/methods/drawing-stages.mjs) and the few choices each takes.
const STAGES = Object.freeze(['prep', 'prepInk', 'finishInk']);
const PREP_INK_METHODS = Object.freeze(['contour', 'connected', 'scribble']);
const FINISH_METHODS = Object.freeze(['accent', 'architecture']);
const FINISH_SELECT = Object.freeze(['edges', 'darks', 'both']);
const FINISH_MASSES = Object.freeze(['none', 'scribble']);
// prepInk.method: contour draws the stage's lines as planned; connected lays the walker's connected gestures on them
// (--drawinglogic 2); scribble joins them into fewer, longer strokes, opens the lit edges and scribbles the dark masses
// (--drawinglogic 3).
const METHOD_LOGIC = Object.freeze({ connected: '2', scribble: '3' });
// finishInk.method "architecture": the Y1 / V096 closing pen. Traced lines restated whole at full pressure, widths from
// the target's darkness, a wide nib and strong ink. (--inkofftrees is left out: its tree detector read 64% of h36-a's
// stone as trees and removed 148 of 171 opening lines.) For buildings drawn from photographs or pen sheets.
const ARCHITECTURE_FLAGS = Object.freeze(['--closingpressure', '1', '--drawwant', '1', '--drawwidthgain', '2']);
const ARCHITECTURE_SEPIA = Object.freeze(['--inkkscale', '8']);

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

function stageObject(stages, key) {
  const v = stages[key];
  if (v == null || v === false) return null;
  if (v === true) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error(`drawing.stages.${key}: true or an object`);
  return v;
}

function stageUnit(o, path, key) {
  const v = o[key];
  if (v == null) return null;
  if (typeof v !== 'number' || !(v >= 0 && v <= 1)) throw new Error(`drawing.stages.${path}.${key}: a number from 0 to 1, not ${JSON.stringify(v)}`);
  return v;
}

function stageChoice(o, path, key, allowed) {
  const v = o[key];
  if (v == null) return null;
  if (!allowed.includes(v)) throw new Error(`drawing.stages.${path}.${key}: one of ${allowed.join(', ')}, not ${JSON.stringify(v)}`);
  return v;
}

/**
 * Painter flags for drawing.stages: { prep?: {amount}, prepInk?: {from, keep, add, amount, method},
 * finishInk?: {from, select, restate, method, masses} }. A stage that is missing or false is not drawn; true takes
 * its defaults. `inkColor` decides whether the architecture method strengthens sepia.
 */
function stageFlags(stages, { inkColor = null } = {}) {
  if (typeof stages !== 'object' || stages == null || Array.isArray(stages)) throw new Error('drawing.stages: an object with prep, prepInk and finishInk');
  for (const k of Object.keys(stages)) if (!STAGES.includes(k)) throw new Error(`drawing.stages: prep, prepInk or finishInk, not ${k}`);
  const prep = stageObject(stages, 'prep'), prepInk = stageObject(stages, 'prepInk'), finishInk = stageObject(stages, 'finishInk');
  const names = [prep && 'prep', prepInk && 'prepink', finishInk && 'finishink'].filter(Boolean);
  if (!names.length) throw new Error('drawing.stages: name at least one of prep, prepInk and finishInk (or use medium "none")');
  const flags = ['--stages', names.join(',')];
  const unitFlag = (o, path, key, flag) => { const v = stageUnit(o, path, key); if (v != null) flags.push(flag, round(v)); };
  if (prep) {
    unitFlag(prep, 'prep', 'amount', '--prepamount');
    unitFlag(prep, 'prep', 'weight', '--preppressure');
    const fade = stageUnit(prep, 'prep', 'fade');
    if (fade != null) flags.push('--prepfade', fade > 0 ? '1' : '0', '--prepunder', String(fade));
    if (prep.frames != null) {
      if (!Array.isArray(prep.frames) || prep.frames.length !== 3 || prep.frames.some(n=>!Number.isInteger(n)||n<1||n>30)) throw Error('drawing.stages.prep.frames: three positive frame counts, at most 30');
      flags.push('--prepframes', prep.frames.join(','));
    }
  }
  if (prepInk) {
    const from = stageChoice(prepInk, 'prepInk', 'from', ['prep', 'lines']);
    if (from === 'prep' && !prep) throw new Error('drawing.stages.prepInk.from "prep" needs a prep stage');
    if (from) flags.push('--prepinkfrom', from);
    unitFlag(prepInk, 'prepInk', 'keep', '--prepinkkeep');
    unitFlag(prepInk, 'prepInk', 'add', '--prepinkadd');
    unitFlag(prepInk, 'prepInk', 'amount', '--prepinkamount');
    unitFlag(prepInk, 'prepInk', 'deviate', '--prepinkdeviate');
    const method = stageChoice(prepInk, 'prepInk', 'method', PREP_INK_METHODS);
    if (METHOD_LOGIC[method]) flags.push('--drawinglogic', METHOD_LOGIC[method]);
    // a plan that asks for scribble gets it, whatever the style's ink share (logic 3 otherwise falls back to logic 1
    // under --scribbleink 0.5)
    if (method === 'scribble') flags.push('--scribbleink', '0');
  }
  if (finishInk) {
    const from = stageChoice(finishInk, 'finishInk', 'from', ['prepInk', 'prep', 'lines']);
    if (from === 'prepInk' && !prepInk) throw new Error('drawing.stages.finishInk.from "prepInk" needs a prepInk stage');
    if (from === 'prep' && !prep) throw new Error('drawing.stages.finishInk.from "prep" needs a prep stage');
    if (from) flags.push('--finishfrom', from);
    for (const [key, flag] of [['hatch', 'finishhatch'], ['fur', 'finishfur']]) {
      const v=finishInk[key];
      if (v == null || v === false) continue;
      if (typeof v !== 'object' || Array.isArray(v)) throw Error(`drawing.stages.finishInk.${key}: an object`);
      flags.push('--'+flag, JSON.stringify(v));
    }
    const select = stageChoice(finishInk, 'finishInk', 'select', FINISH_SELECT);
    if (select) flags.push('--finishselect', select);
    unitFlag(finishInk, 'finishInk', 'restate', '--finishrestate');
    unitFlag(finishInk, 'finishInk', 'deviate', '--finishdeviate');
    const method = stageChoice(finishInk, 'finishInk', 'method', FINISH_METHODS);
    if (method === 'architecture') flags.push('--finishmethod', 'architecture', ...ARCHITECTURE_FLAGS, ...(inkColor === 'black' ? [] : ARCHITECTURE_SEPIA));
    if (stageChoice(finishInk, 'finishInk', 'masses', FINISH_MASSES) === 'scribble') flags.push('--finishmasses', '1');
  }
  return flags;
}

/** drawing.ink: { color: sepia|black, waterproof: true|false }. Waterproof defaults to the colour's own (black yes). */
function inkFlags(ink, inkColor) {
  if (ink == null) return { flags: [], color: inkColor };
  if (typeof ink !== 'object' || Array.isArray(ink)) throw new Error('drawing.ink: an object with color and waterproof');
  for (const k of Object.keys(ink)) if (!['color', 'waterproof'].includes(k)) throw new Error(`drawing.ink: color or waterproof, not ${k}`);
  const flags = [];
  let color = inkColor;
  if (ink.color != null && ink.color !== 'auto') {
    if (!INK_COLOURS.includes(ink.color)) throw new Error(`drawing.ink.color: one of ${INK_COLOURS.join(', ')}, or "auto", not ${JSON.stringify(ink.color)}`);
    if (inkColor && inkColor !== ink.color) throw new Error('drawing.ink.color and drawing.inkColor disagree');
    if (!inkColor) flags.push('--inkprofile', `${ink.color}-ink`);
    color = ink.color;
  }
  if (ink.waterproof != null && ink.waterproof !== 'auto') {
    if (typeof ink.waterproof !== 'boolean') throw new Error(`drawing.ink.waterproof: true, false or "auto", not ${JSON.stringify(ink.waterproof)}`);
    flags.push('--inkfast', ink.waterproof ? '1' : '0');
  }
  return { flags, color };
}

/**
 * Painter flags for a plan's drawing section, as an argv array. Null or {} gives [].
 * @param {object|null} drawing { medium, inkColor, ink, linework, source, amount, lines, weight, closingLines, maxLines, stages }
 */
export function drawingFlags(drawing) {
  if (drawing == null) return [];
  if (typeof drawing !== 'object' || Array.isArray(drawing)) throw new Error('drawing: an object');
  const medium = choice(drawing, 'medium', MEDIA);
  if (medium === 'none') return ['--drawing', 'none'];
  const flags = [];
  if (drawing.linework != null) {
    if (!LINEWORK.includes(drawing.linework)) throw new Error(`drawing.linework: one of ${LINEWORK.join(', ')}, not ${JSON.stringify(drawing.linework)}`);
    flags.push('--linework', drawing.linework);
  }
  if (drawing.resolution != null) {
    if (![1,2].includes(drawing.resolution)) throw Error('drawing.resolution: 1 or 2');
    flags.push('--inkres', String(drawing.resolution));
  }
  if (drawing.map != null) {
    if (typeof drawing.map !== 'string' || !drawing.map) throw Error('drawing.map: prepared line map path');
    flags.push('--sketchmap', drawing.map);
  }
  if (drawing.mapSmoothing != null) {
    if (!Number.isFinite(drawing.mapSmoothing) || drawing.mapSmoothing < 0 || drawing.mapSmoothing > 2) throw Error('drawing.mapSmoothing: 0..2 cells');
    flags.push('--mapsmoothing', String(drawing.mapSmoothing));
  }
  if (medium) flags.push('--outlinemedium', medium);
  const colour = choice(drawing, 'inkColor', INK_COLOURS);
  if (colour) flags.push('--inkprofile', `${colour}-ink`);
  const ink = inkFlags(drawing.ink, colour);
  flags.push(...ink.flags);
  const source = drawing.source === 'auto' ? 'auto' : choice(drawing, 'source', LINE_SOURCES);
  if (source) flags.push('--linesource', source);
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
  if (drawing.stages != null) {
    if (closing != null) throw new Error('drawing: closingLines and stages both decide the closing pen; use stages.finishInk');
    if (medium === 'graphite') throw new Error('drawing: medium "graphite" with stages; use stages.prep for the pencil and leave medium out');
    flags.push(...stageFlags(drawing.stages, { inkColor: ink.color }));
    return flags;
  }
  if (closing === 0) flags.push('--drawing', 'first');
  else if (closing != null) flags.push('--drawing', 'both', '--closingedgemin', round(CLOSING_EDGE_SPAN * (1 - closing)));
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
