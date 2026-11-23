// Which of a prepared drawing's strokes the painter lays when nobody chose them (Auto's default), decided from the
// drawing's medium and its maker's tags alone (tools/seg/tag-medium.py: `drop` marks hatching, tone and texture the
// maker would leave out). A PENCIL drawing is a lay-in: its lay-in and contour lines place the forms and the washes do
// the modelling, so the strokes tagged `drop` are left for the brush, except the lines that place a form, which the
// maker's tagging also drops at times: a contour (part `outline`), a lay-in stroke (phase `layin`) and an inner contour
// of the form's growth (part `inner`, phase `growth`: an eye, a nose, an ear's inside). On Mittens the untagged
// strokes alone lose both ears, the face's edge and the eyes. Those it keeps are laid no darker than the drawing's
// own lay-in lines (its darkest untagged stroke), so the lay-in stays light. A PEN drawing is line-led: its lines
// carry the modelling and every one is laid as drawn. A drawing an author chose (`chosen`) is laid exactly. Pure.

const isPencil = medium => medium === 'pencil' || medium === 'graphite' || /^graphite-/.test(String(medium));
const placesForm = s => s.part === 'outline' || s.phase === 'layin' || (s.part === 'inner' && s.phase === 'growth');

/** Whether Auto lays this stroke of a drawing in `medium` (the drawing file's own). */
export function autoDraws(stroke, medium) {
  return !(isPencil(medium) && stroke.drop === true) || placesForm(stroke);
}

/** The darkness of a pencil drawing's lay-in: its darkest stroke not tagged drop (null when every stroke is). */
export function layInDark(doc) {
  let d = null; for (const s of doc.strokes) if (s.drop !== true && !(d >= s.dark)) d = s.dark;
  return d;
}

/** The stroke as Auto lays it: a stroke tagged drop that a pencil lay-in keeps, at most the lay-in's darkness. */
export function autoStroke(s, doc, level = layInDark(doc)) {
  return isPencil(doc.medium) && s.drop === true && level != null && s.dark > level ? { ...s, dark: level, darkAsDrawn: s.dark } : s;
}

/**
 * The strokes a vectors document is laid with: an author's choice (`doc.chosen`) exactly, else Auto's default.
 * Returns {strokes, left (the strokes not laid), rule: one line saying why}.
 */
export function strokesToLay(doc) {
  if (doc.chosen) return { strokes: doc.strokes, left: [], rule: `as chosen (${doc.chosen})` };
  const strokes = [], left = [], level = layInDark(doc);
  for (const s of doc.strokes) if (autoDraws(s, doc.medium)) strokes.push(autoStroke(s, doc, level)); else left.push(s);
  return { strokes, left, rule: left.length ? `a pencil lay-in: its ${strokes.length} lay-in and contour lines (at most the lay-in's darkness ${level}), not the ${left.length} other lines tagged drop (hatching, tone, texture, small marks), which the washes model` : isPencil(doc.medium) ? 'a pencil lay-in with no lines tagged drop: every line' : 'a pen drawing: every line, the modelling is in its lines' };
}
