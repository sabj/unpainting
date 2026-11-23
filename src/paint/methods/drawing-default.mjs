// Which of a prepared drawing's strokes the painter lays when nobody chose them (Auto's default), and how dark, decided
// from the drawing's own data alone: its medium, its maker's tags (tools/seg/tag-medium.py: `drop` marks hatching, tone
// and texture the maker would leave out) and the importance of the line each stroke was fitted to (the line file's
// `contribution`). Nothing here knows the subject.
//
// A PEN drawing is line-led: its lines carry the modelling and every one is laid as drawn.
// A PENCIL drawing is a lay-in: its lines place the forms and the washes model them. The strokes tagged `drop` are left
// for the brush, except those that place a form, which the maker's tagging also drops at times:
//   - a contour (part `outline`), a lay-in stroke (phase `layin`), an inner contour of the growth (part `inner`, phase
//     `growth`: an ear's inside, an eye's rim);
//   - a stroke of one of the drawing's most important lines (contribution in its top quarter), unless it is tone or a
//     fill: the feature lines (a nose, a mouth) that the tagging calls texture;
//   - a stroke lying in a named form that is a feature of a face (kind `eye`, or named eye, nose, lips or mouth), its
//     tone too (a pupil, the line of the lips), not a fill: small features whose lines are short and so not among the
//     most important (Morisot's eyes).
// On Mittens the untagged strokes alone lose both ears, the face's edge, the eyes, the nose and the mouth. The strokes it
// keeps from drop are laid no darker than the drawing's own lay-in lines (its darkest untagged stroke), those of its most
// important lines and of the features up to twice that, so the lay-in stays light and still marks the features.
// A drawing an author chose (`chosen`) is laid exactly as chosen. Pure.

const isPencil = medium => medium === 'pencil' || medium === 'graphite' || /^graphite-/.test(String(medium));
const placesForm = s => s.part === 'outline' || s.phase === 'layin' || (s.part === 'inner' && s.phase === 'growth');
/** The share of the drawing's lines, by importance, whose strokes a lay-in keeps (the top quarter). */
const IMPORTANT_SHARE = 0.25;
/** A named form that is a feature of a face, by its kind or its name. */
const isFeature = f => f.kind === 'eye' || /\b(eyes?|nose|nostrils?|lips?|mouth)\b/i.test(String(f.name ?? ''));

/** A feature form reaches a half of its own size past its mask (a SAM eye is the iris and the white; the lids are drawn
 *  round it), so each is taken as its box grown by half its width and height on every side. */
const REACH = 0.5;
/** The feature forms and a test: does the stroke lie mostly in one? `forms`: {width, height, ids, list: [{id, name, kind}]}. */
function featureTest(doc, forms) {
  if (!forms?.ids || !forms.list?.length) return null;
  const feats = forms.list.filter(isFeature), box = new Map(feats.map(f => [f.id, [Infinity, Infinity, -Infinity, -Infinity]]));
  for (let i = 0; i < forms.ids.length; i++) { const b = box.get(forms.ids[i]); if (!b) continue; const x = i % forms.width, y = (i / forms.width) | 0; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
  // in mm, grown by REACH of the form's own size
  const boxes = [...box.values()].filter(b => b[2] >= b[0]).map(([x0, y0, x1, y1]) => { const sx = doc.sheetMm / forms.width, sy = doc.heightMm / forms.height, w = (x1 - x0 + 1) * sx, h = (y1 - y0 + 1) * sy;
    return [x0 * sx - REACH * w, y0 * sy - REACH * h, (x1 + 1) * sx + REACH * w, (y1 + 1) * sy + REACH * h]; });
  const test = s => {
    const P = s.path ?? []; if (!P.length || !boxes.length) return false;
    return boxes.some(([a, b, c, d]) => { let n = 0; for (const [x, y] of P) if (x >= a && x <= c && y >= b && y <= d) n++; return n * 2 > P.length; });
  };
  return { names: feats.map(f => f.name), test };
}

/**
 * Auto's rule for a drawing: {draws(stroke), stroke(stroke) (as laid), level, important (null when the line file
 * gives no importance), note}. `lines` is the line file beside the vectors (its `lines`, each with `seq` and
 * `contribution`), or null.
 */
export function autoRule(doc, lines = null, forms = null) {
  const pencil = isPencil(doc.medium);
  let level = null; for (const s of doc.strokes) if (s.drop !== true && !(level >= s.dark)) level = s.dark;
  const imp = new Map((lines?.lines ?? []).filter(l => Number.isFinite(l.contribution)).map(l => [l.seq, l.contribution]));
  const sorted = [...imp.values()].sort((a, b) => a - b), floor = sorted.length ? sorted[Math.floor((1 - IMPORTANT_SHARE) * sorted.length)] : null;
  const F = pencil ? featureTest(doc, forms) : null;
  const important = s => (floor != null && s.line != null && (imp.get(Math.floor(s.line)) ?? -Infinity) >= floor) || Boolean(F?.test(s));
  const draws = s => !(pencil && s.drop === true) || placesForm(s) || (s.part !== 'fill' && Boolean(F?.test(s))) || (!['tone', 'fill'].includes(s.part) && important(s));
  const stroke = s => {
    if (!(pencil && s.drop === true && level != null)) return s;
    const cap = level * (important(s) ? 2 : 1);
    return s.dark > cap ? { ...s, dark: +cap.toFixed(4), darkAsDrawn: s.dark } : s;
  };
  const note = !pencil ? 'a pen drawing: every line as drawn, the modelling is in its lines'
    : `a pencil lay-in: its lay-in and contour lines${floor != null ? ', the strokes of its most important lines (a quarter of them)' : ' (the line file gives no importance)'}${F ? `, the lines of its features (${F.names.join(', ') || 'none named'})` : ' (no named forms: no features)'}, at most the lay-in's darkness ${level} (twice it for the important and the features)`;
  return { draws, stroke, level, important: floor, note };
}

/**
 * The strokes a vectors document is laid with: an author's choice (`doc.chosen`) exactly, else Auto's default.
 * Returns {strokes, left (the strokes not laid), rule: one line saying why}.
 */
export function strokesToLay(doc, lines = null, forms = null) {
  if (doc.chosen) return { strokes: doc.strokes, left: [], rule: `as chosen (${doc.chosen})` };
  const R = autoRule(doc, lines, forms), strokes = [], left = [];
  for (const s of doc.strokes) if (R.draws(s)) strokes.push(R.stroke(s)); else left.push(s);
  return { strokes, left, rule: `${R.note}; ${strokes.length} laid${left.length ? `, the ${left.length} other lines tagged drop (hatching, tone, texture) left for the washes` : ''}` };
}
