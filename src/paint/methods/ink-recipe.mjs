// --inkrecipe: one switch for a set of ink flags (docs/ink.md). It sets each flag only when the command line does not,
// so any of them can still be changed on its own.
//   v2    holds the pen to the target's lines (support filter, smoothing, width floor, darkness cap, damp pen). It does
//         not turn ink on.
//   wash  pen-and-wash: ink on, the lines of the lineart models' fused map traced whole (line-model.mjs; copy-lines on
//         the target's own ink only when the models cannot run), mass edges (shadow and wash steps) cut out by the
//         line-or-mass test (ink-decide.mjs) and drawn first with no pencil,
//         held to the target, with the width and darkness of the source's line along each stroke, the ink load
//         matched to the source's line darkness on a scrap, the ink's hue taken from the source, and pale spread lines
//         drawn on damp paper; the pens draw on a fine sheet (--inkres, 4 at 540 px wide, less as the painting is wider; washInkRes), thin, tapered and light. For pen drawings and pen-and-wash sources; not for photographs.
export const INK_RECIPES = Object.freeze({
  v2: Object.freeze({ linesupport: '5', linesmooth: '1', linesmoothcorner: '50',  inkdarkcap: '1', inkdamp: '0.3' }),
  wash: Object.freeze({
    outlinemedium: 'ink', drawing: 'both', linesource: 'source-ink', linemodel: '1', linestroke: '1', inkdecide: '1', inkshadowmask: '0', inkdropfaint: '0', inklabeljudge: 'simple', copylinesmin: '0.005', copylinesagree: '2', copylinesfloor: '0.6', copylinesfill: '1',
    drawingstages: 'off', stages: 'prepink,finishink', prepinkfrom: 'lines', prepinkamount: '1', prepinkkeep: '1', prepinkadd: '0', prepinkdeviate: '0',
    openingpressure: '0.75', drawinghand: '1', drawstroke: '0.1', inkhand: '1', drawtaperin: '2', drawtaperout: '6', drawtaperstart: '0.7', drawtaperend: '0.45', drawdetailscale: '0.75', drawflickmm: '1.5', drawwidthgain: '0.75', inkdarkrule: '1', inkjoin: '2.5', inkeconomy: '1', inkfoliage: '1',
    linesupport: '5', linesmooth: '0.3', linesmoothcorner: '50', linegapmm: '0.6', lineminmm: '0.3',
    linemeasure: '1', inkdarkmatch: '1.3', inkhue: 'source', inkhuegain: '1.5', inkdamp: '0', inkbleed: '0.35',
  }),
});

/**
 * The wash recipe's --inkres for a painting `width` pixels wide: the pens draw on a sheet near 2160 px wide, so N is 2160 over
 * the width, from 1 to 4. At 540 px that is 4, a fine cell of 0.07 mm; at 1200 px it is 2; from 1080 px up it is 2 or 1, so the
 * output is not 4 times as wide.
 */
function washInkRes(width) {
  const w = Number(width);
  return !(w > 0) ? 4 : Math.max(1, Math.min(4, Math.round(2160 / w)));
}

/** The flags --inkrecipe adds to argv: each of the recipe's flags that argv does not already set. */
export function inkRecipeArgs(name, argv) {
  if (!name || name === 'none') return [];
  const r = INK_RECIPES[name];
  if (!r) throw new Error(`--inkrecipe: ${Object.keys(INK_RECIPES).join(' or ')} or none, not ${name}`);
  const flags = Object.entries(r).flatMap(([k, v]) => (argv.includes('--' + k) ? [] : ['--' + k, v]));
  if (name === 'wash') {
    const i = argv.lastIndexOf('--width'), n = argv.includes('--inkres') ? Number(argv[argv.lastIndexOf('--inkres') + 1]) : washInkRes(i >= 0 ? argv[i + 1] : 700);
    if (!argv.includes('--inkres')) flags.push('--inkres', String(n));
    // on a fine sheet a line may be finer than one painting pixel of the source: no floor, and the nib's own least width applies
    if (!argv.includes('--inkwidthfloor')) flags.push('--inkwidthfloor', n >= 2 ? '0' : '1');
  }
  return flags;
}
