// Options the painter no longer has, each with the reason. The plan decides what is painted, so a planner or override
// that a plan could not reach, or that replaced the plan's move, was removed (docs/how-it-paints.md). A command line,
// recipe or stored plan that still names one stops before painting with the reason, instead of painting as if the
// setting had acted.
const SUBJECT_WASH = 'subject washes (SAM subjects cut into wash groups) were off by default and no plan reached them; the plan\'s areas or families say what is one wash';
const DEEP_ACCENT = 'the deep accents restated every cell darker than a threshold as two late dark layers, a rule over target pixels; the plan names its last darks';
export const REMOVED_OPTIONS = Object.freeze({
  subjectwash: SUBJECT_WASH, subjectform: SUBJECT_WASH, subjectbands: SUBJECT_WASH, subjectk: SUBJECT_WASH, subjectsplit: SUBJECT_WASH,
  subjectedge: SUBJECT_WASH, subjectmean: SUBJECT_WASH, subjectvalue: SUBJECT_WASH, subjectchroma: SUBJECT_WASH,
  subjectlights: SUBJECT_WASH, subjectlightgap: SUBJECT_WASH,
  deepaccent: DEEP_ACCENT, deepgrow: DEEP_ACCENT, deepaccentin: DEEP_ACCENT,
  ...Object.fromEntries(['hybridbridge', 'hybridfloor', 'hybridjoin', 'hybridkeep', 'hybridmin', 'hybridpar', 'hybridreach', 'hybridstay', 'hybridstroke', 'hybridsupport']
    .map(k => [k, 'the connected drawing (--drawinglogic 2) was removed: it laid the walker\'s gestures on the drawing file and no plan reached it'])),
  glazepasses: 'a glaze is one pass the plan writes; the painter no longer lays a glaze twice in a row by default (the plan writes a second pass when it wants one)',
  eyering: 'the eye ring drew an iris ring round each catchlight reserve inside the deep accents, a rule shaped to one kind of subject; the plan names its eyes\' shapes and darks',
});

/** Throws, naming every removed option in argv with its reason. */
export function refuseRemoved(argv) {
  const hit = [...new Set(argv.filter(a => typeof a === 'string' && a.startsWith('--')).map(a => a.slice(2)))].filter(k => Object.hasOwn(REMOVED_OPTIONS, k));
  if (hit.length) throw new Error(hit.map(k => `--${k} was removed: ${REMOVED_OPTIONS[k]}`).join('; '));
}
