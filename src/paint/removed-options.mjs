// Options the painter no longer has, each with the reason. The plan decides what is painted, so a planner or override
// that a plan could not reach, or that replaced the plan's move, was removed (docs/how-it-paints.md). A command line,
// recipe or stored plan that still names one stops before painting with the reason, instead of painting as if the
// setting had acted.
const SUBJECT_WASH = 'subject washes (SAM subjects cut into wash groups) were off by default and no plan reached them; the plan\'s areas or families say what is one wash';
const DEEP_ACCENT = 'the deep accents restated every cell darker than a threshold as two late dark layers, a rule over target pixels; the plan names its last darks';
const PLAN_MOVE = 'the plan\'s move is final: this switch replaced a passage\'s planned technique (wet on wet, wet on dry, dry brush) or dried the sheet between passages by a rule of its own';
export const REMOVED_OPTIONS = Object.freeze({
  ...Object.fromEntries(['masswet', 'gradedwet', 'firstwet', 'firstwashwet', 'wetpolicy', 'wetlight', 'wetbig', 'wetmin', 'wetsubject', 'figuredry', 'nowow', 'nowowpart', 'dryeach', 'dryeachlevel'].map(k => [k, PLAN_MOVE])),
  subjectwash: SUBJECT_WASH, subjectform: SUBJECT_WASH, subjectbands: SUBJECT_WASH, subjectk: SUBJECT_WASH, subjectsplit: SUBJECT_WASH,
  subjectedge: SUBJECT_WASH, subjectmean: SUBJECT_WASH, subjectvalue: SUBJECT_WASH, subjectchroma: SUBJECT_WASH,
  subjectlights: SUBJECT_WASH, subjectlightgap: SUBJECT_WASH,
  deepaccent: DEEP_ACCENT, deepgrow: DEEP_ACCENT, deepaccentin: DEEP_ACCENT,
  ...Object.fromEntries(['hybridbridge', 'hybridfloor', 'hybridjoin', 'hybridkeep', 'hybridmin', 'hybridpar', 'hybridreach', 'hybridstay', 'hybridstroke', 'hybridsupport']
    .map(k => [k, 'the connected drawing (--drawinglogic 2) was removed: it laid the walker\'s gestures on the drawing file and no plan reached it'])),
  glazepasses: 'a glaze is one pass the plan writes; the painter no longer lays a glaze twice in a row by default (the plan writes a second pass when it wants one)',
  ...Object.fromEntries(['skyblue', 'skygran', 'skyfloc', 'skybluewick', 'skywide'].map(k => [k, 'the sky tube was removed: it swapped the blue of sky cells for a second, heavily granulating tube, a switch by region; every box paint now granulates, flocculates and stains as published (src/paint/methods/pigment-physics.mjs)'])),
  gran: 'the sheet-wide granulation scale was removed: each pigment granulates by its own published rating on the paper, with no scale',
  slidecap: 'settled grains always stop rolling when the slope is gone (slideCap 1): without it heavy granulation dried as a one-cell checkerboard',
  boxphys: 'box paints always settle with their published physics (granulation, flocculation, staining, density), so there is nothing to switch',
  eyering: 'the eye ring drew an iris ring round each catchlight reserve inside the deep accents, a rule shaped to one kind of subject; the plan names its eyes\' shapes and darks',
});

/** Throws, naming every removed option in argv with its reason. */
export function refuseRemoved(argv) {
  const hit = [...new Set(argv.filter(a => typeof a === 'string' && a.startsWith('--')).map(a => a.slice(2)))].filter(k => Object.hasOwn(REMOVED_OPTIONS, k));
  if (hit.length) throw new Error(hit.map(k => `--${k} was removed: ${REMOVED_OPTIONS[k]}`).join('; '));
}
