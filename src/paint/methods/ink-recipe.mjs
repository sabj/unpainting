// --inkrecipe: one switch for a set of ink flags (docs/ink.md). It sets each flag only when the command line does not,
// so any of them can still be changed on its own.
//   v2    holds the pen to the target's lines (support filter, smoothing, width floor, darkness cap, damp pen). It does
//         not turn ink on.
//   wash  pen-and-wash: ink on, the lines of the lineart models' fused map traced whole (line-model.mjs; copy-lines on
//         the target's own ink only when the models cannot run) and drawn first with no pencil,
//         held to the target, with the width and darkness of the source's line along each stroke, the ink load
//         matched to the source's line darkness on a scrap, the ink's hue taken from the source, and pale spread lines
//         drawn on damp paper; the pens draw on a sheet 3 times as fine (--inkres 3). For pen drawings and pen-and-wash sources; not for photographs.
export const INK_RECIPES = Object.freeze({
  v2: Object.freeze({ linesupport: '5', linesmooth: '1', linesmoothcorner: '50', inkwidthfloor: '1', inkdarkcap: '1', inkdamp: '0.3' }),
  wash: Object.freeze({
    outlinemedium: 'ink', drawing: 'both', linesource: 'source-ink', linemodel: '1', copylinesmin: '0.005', copylinesagree: '2', copylinesfloor: '0.6', copylinesfill: '1',
    drawingstages: 'off', stages: 'prepink,finishink', prepinkfrom: 'lines', prepinkamount: '1', prepinkkeep: '1', prepinkadd: '0', prepinkdeviate: '0',
    openingpressure: '0.75', inkres: '3', drawinghand: '1', drawstroke: '0.1',
    linesupport: '5', linesmooth: '0.3', linesmoothcorner: '50', linegapmm: '0.6', lineminmm: '0.3', inkwidthfloor: '1',
    linemeasure: '1', inkdarkmatch: '1.6', inkhue: 'source', inkhuegain: '1.5', inkdamp: '0', inkbleed: '0.35',
  }),
});

/** The flags --inkrecipe adds to argv: each of the recipe's flags that argv does not already set. */
export function inkRecipeArgs(name, argv) {
  if (!name || name === 'none') return [];
  const r = INK_RECIPES[name];
  if (!r) throw new Error(`--inkrecipe: ${Object.keys(INK_RECIPES).join(' or ')} or none, not ${name}`);
  return Object.entries(r).flatMap(([k, v]) => (argv.includes('--' + k) ? [] : ['--' + k, v]));
}
