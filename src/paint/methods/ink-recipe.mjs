// --inkrecipe: one switch for a set of ink flags (docs/ink.md). It sets each flag only when the command line does not,
// so any of them can still be changed on its own.
//   v2    the pen's darkness matched to the target's lines, on a damp pen. It does not turn ink on.
//   wash  pen-and-wash: ink on, the drawing file's lines, laid as drawn, first and with no pencil,
//         each stroke with one width and darkness read from the source's line along it (stroke-weight.mjs), the ink load
//         matched to the source's firm lines on a scrap, the ink's hue taken from the source, and pale spread lines
//         drawn on damp paper; the pens draw on a fine sheet (--inkres, 4 at 540 px wide, less as the painting is wider; washInkRes), thin, tapered and light. For pen drawings and pen-and-wash sources; not for photographs.
export const INK_RECIPES = Object.freeze({
  v2: Object.freeze({ inkdarkmatch: '1', inkdamp: '0.3' }),
  wash: Object.freeze({
    outlinemedium: 'ink', drawing: 'both',
    drawingstages: 'off', stages: 'prepink,finishink', prepinkfrom: 'lines', prepinkamount: '1', prepinkkeep: '1', prepinkadd: '0', prepinkdeviate: '0',
    openingpressure: '1', drawinghand: '1', drawstroke: '0', inkhand: '1', drawtaperin: '2', drawtaperout: '6', drawtaperstart: '0.7', drawtaperend: '0.45', drawdetailscale: '0.75', drawflickmm: '0', drawwidthgain: '1', drawjoingap: '14',
    inkdarkmatch: '1', inkhue: 'source', inkhuegain: '1.5', inkdamp: '0', inkbleed: '0.35',
  }),
});

// wash with --drawingonly 1: a prepared pen drawing laid alone on dry paper. A pen line there is near black with a firm
// start and a short lift, pressed fully (the stroke's own weight sets how hard), loaded to twice the subject's line
// absorbance (a drawing's line is near black where a painting's is grey), its contact widened to the drawn width: black ink (not the source's sepia) in the flexible drawing nib (0.03 to 1.2 mm, so each stroke
// keeps its drawn width), a load match that may go past 4x, no damp, one opening pen.
const PEN_ONLY = Object.freeze({ inkprofile: 'drawing-ink', inkhue: 'profile', inkloadmax: '16', drawing: 'first', stages: 'prepink', drawwant: '1', inkdarkmatch: '2', drawwidthgain: '1.4',
  drawtaperin: '1', drawtaperstart: '1', drawtaperout: '3', drawtaperend: '0.85', inkbleed: '0' });

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
  const i0 = argv.lastIndexOf('--drawingonly'), penOnly = name === 'wash' && i0 >= 0 && Number(argv[i0 + 1]) > 0;
  const flags = Object.entries(penOnly ? { ...r, ...PEN_ONLY } : r).flatMap(([k, v]) => (argv.includes('--' + k) ? [] : ['--' + k, v]));
  if (name === 'wash') {
    const i = argv.lastIndexOf('--width'), n = argv.includes('--inkres') ? Number(argv[argv.lastIndexOf('--inkres') + 1]) : washInkRes(i >= 0 ? argv[i + 1] : 700);
    if (!argv.includes('--inkres')) flags.push('--inkres', String(n));
    // on a fine sheet a line may be finer than one painting pixel of the source: no floor, and the nib's own least width applies
    if (!argv.includes('--inkwidthfloor')) flags.push('--inkwidthfloor', n >= 2 ? '0' : '1');
  }
  return flags;
}

/**
 * A pencil drawing is drawn on the fine sheet the pen draws on, at the same --inkres (washInkRes: near 2160 px across), so
 * a pencil line is as continuous as an ink line of the same weight (the owner, 22 Nov: "why isnt pencil executed the same
 * way as ink"). The flags to add for a run whose drawing is pencil laid from a drawing file; none when --inkres is given,
 * when there is no drawing, or when the painting is already that fine (N of 1).
 */
export function pencilInkResArgs(argv, { pencil }) {
  const last = k => { const i = argv.lastIndexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (!pencil || argv.includes('--inkres') || last('--drawing') === 'none' || !(last('--drawingfile') || last('--drawinglast'))) return [];
  const n = washInkRes(last('--width') ?? 700);
  return n > 1 ? ['--inkres', String(n)] : [];
}

