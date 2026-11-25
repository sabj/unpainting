// The source decides the medium. An ink request on a source without pen is
// removed, never converted to graphite. Explicit graphite remains opening-only.
// Pure: no I/O.

/** The media a subject can be given. */
export const SUBJECT_MEDIA = Object.freeze(['none', 'pencil', 'pen']);
const isGraphite = v => v === 'graphite' || /^graphite-/.test(String(v));
const INK_STAGES = ['prepInk', 'finishInk'];
// keys of a plan's drawing section that only describe pen work, and painter options only a pen or a closing pass reads
const PEN_KEYS = ['inkColor', 'ink', 'stages', 'resolution', 'closingLines'];
const PEN_FLAGS = ['--drawinglast', '--inkprofile', '--inkfast', '--inkres', '--washinkfree', '--drawinghand', '--inkdarkskip'];

/** The option's value from an argument list (last one wins), checked. Null when absent. */
export function subjectMediumOf(argv) {
  const at = argv.lastIndexOf('--subjectmedium');
  if (at < 0) return null;
  const medium = argv[at + 1];
  if (!SUBJECT_MEDIA.includes(medium)) throw new Error(`--subjectmedium: ${SUBJECT_MEDIA.join(', ')}, not ${medium}`);
  return medium;
}
const noPen = medium => medium === 'none' || medium === 'pencil';

/**
 * A plan's drawing section for a subject of this medium. An ink section (medium ink or auto, or ink stages) on a
 * subject with no pen is disabled without substituting graphite; a graphite or unstated section that
 * asks for closing lines keeps its medium and loses them.
 * @returns {{ drawing: object|null, asked: string|null }} asked: what the plan asked for when it was changed
 */
export function drawingForSubject(drawing, medium) {
  if (!noPen(medium) || drawing == null || typeof drawing !== 'object' || Array.isArray(drawing)) return { drawing, asked: null };
  if (drawing.medium === 'none') return { drawing, asked: null };
  const inkStages = drawing.stages && typeof drawing.stages === 'object' && INK_STAGES.some(k => drawing.stages[k]);
  const asked = isGraphite(drawing.medium) ? null : drawing.medium ?? (inkStages ? 'ink' : null);
  if (asked == null) {
    // graphite or no medium said: only closing lines go
    const closing = Number(drawing.closingLines);
    return Number.isFinite(closing) && closing > 0 ? { drawing: { ...drawing, closingLines: 0 }, asked: drawing.medium ?? 'graphite' } : { drawing, asked: null };
  }
  const kept = Object.fromEntries(Object.entries(drawing).filter(([k]) => !PEN_KEYS.includes(k)));
  return { drawing: { ...kept, medium: 'none', closingLines: 0 }, asked };
}

/**
 * Remove an incompatible ink/automatic request and its drawing paths. An explicit
 * graphite drawing keeps its opening paths; closing and pen-only options go.
 * @param {{ planAsked?: string|null }} [options] what the plan's drawing section asked for, when drawingForSubject changed it
 * @returns {{ argv: string[], asked: string|null, dropped: string[] }}
 */
export function argvForSubject(argv, medium, { planAsked = null } = {}) {
  if (!noPen(medium)) return { argv, asked: null, dropped: [] };
  const pairs = [];
  for (let i = 0; i < argv.length;) { const key = argv[i++]; pairs.push([key, i < argv.length && !argv[i].startsWith('--') ? argv[i++] : undefined]); }
  const last = name => pairs.findLast(([k]) => k === name)?.[1];
  const outline = last('--outlinemedium'), order = last('--drawing') ?? 'first';
  const stages = last('--stages'), inkStages = typeof stages === 'string' && stages.split(',').some(s => INK_STAGES.includes(s));
  // planAsked: the plan's drawing section was already changed for this subject, so its pen leftovers go as well.
  // A graphite or unstated drawing is changed only when it would draw after the washes or carries pen-only options.
  const drawn = order !== 'none' && outline !== 'none';
  const ink = outline !== undefined && !isGraphite(outline) ? outline : inkStages ? 'ink' : null;
  const closing = order !== 'first' || pairs.some(([k]) => PEN_FLAGS.includes(k));
  const asked = planAsked ?? (!drawn ? null : ink ?? (closing ? outline ?? 'graphite' : null));
  if (asked == null) return { argv, asked: null, dropped: [] };
  const disabled = !isGraphite(asked);
  const dropped = [], out = [];
  for (const [key, value] of pairs) {
    if (PEN_FLAGS.includes(key) || (disabled && ['--drawingfile', '--stages'].includes(key))) { dropped.push(key); continue; }
    if (key === '--stages') { const keep = value.split(',').filter(s => !INK_STAGES.includes(s)); if (keep.length) out.push(key, keep.join(',')); else dropped.push(key); continue; }
    out.push(key, ...(value === undefined ? [] : [key === '--outlinemedium' && value !== 'none' ? (disabled ? 'none' : 'graphite') : key === '--drawing' && value !== 'none' ? (disabled ? 'none' : 'first') : value]));
  }
  if (last('--drawing') === undefined) out.push('--drawing', disabled ? 'none' : 'first');
  if (disabled && outline === undefined) out.push('--outlinemedium', 'none');
  return { argv: out, asked, dropped };
}

/** The line the painter logs when the rule changed the drawing. */
export const subjectMediumNote = (medium, asked) => isGraphite(asked)
  ? `subject medium ${medium}: graphite remains a preparatory drawing before the washes, with no closing lines`
  : `subject medium ${medium}: the picture shows no pen lines; the ${asked === 'auto' ? 'automatic' : asked} drawing request is removed, without substituting graphite`;

/**
 * Whether the subject's medium reads as pen: the declared --subjectmedium when given, else the measured pen-line share
 * (pen-share.mjs) at the outline medium's threshold (--penfirst, per cent), the same reading --outlinemedium auto takes.
 */
export function readsAsPen({ argv, penShare, threshold }) {
  const declared = subjectMediumOf(argv);
  if (declared) return declared === 'pen';
  if (!Number.isFinite(penShare) || !Number.isFinite(threshold)) throw new Error('readsAsPen: a pen share and a threshold');
  return 100 * penShare >= threshold;
}

