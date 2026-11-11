// --subjectmedium none|pencil|pen: the drawing medium a person sees in the picture being painted.
// A picture with no pen lines is not drawn in ink. When the medium is none or pencil, any drawing (a plan's drawing
// section, --outlinemedium ink, the automatic choice, graphite, or no medium said at all) becomes what a watercolourist
// does on such a sheet: a light graphite preparatory drawing before the washes, with no closing lines and no ink
// stages. A drawing that is already graphite and opening only, or no drawing, is left alone, and so is every run
// without the option or with medium pen. Pure: no I/O.

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
 * subject with no pen keeps its line choices and becomes graphite, opening only; a graphite or unstated section that
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
  return { drawing: { ...kept, medium: 'graphite', closingLines: 0 }, asked };
}

/**
 * The expanded argument list for a subject of this medium: an ink or automatic outline becomes graphite, the drawing
 * comes first only, and pen-only options are dropped (so nothing is left unread).
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
  const dropped = [], out = [];
  for (const [key, value] of pairs) {
    if (PEN_FLAGS.includes(key)) { dropped.push(key); continue; }
    if (key === '--stages') { const keep = value.split(',').filter(s => !INK_STAGES.includes(s)); if (keep.length) out.push(key, keep.join(',')); else dropped.push(key); continue; }
    out.push(key, ...(value === undefined ? [] : [key === '--outlinemedium' && value !== 'none' ? 'graphite' : key === '--drawing' && value !== 'none' ? 'first' : value]));
  }
  if (last('--drawing') === undefined) out.push('--drawing', 'first');
  return { argv: out, asked, dropped };
}

/** The line the painter logs when the rule changed the drawing. */
export const subjectMediumNote = (medium, asked) => `subject medium ${medium}: the picture shows no pen lines, so the ${asked === 'auto' ? 'automatic' : asked} drawing is a light graphite preparatory drawing before the washes, with no closing lines`;

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

