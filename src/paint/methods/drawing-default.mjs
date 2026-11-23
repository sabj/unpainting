// Which of a prepared drawing's strokes the painter lays when nobody chose them (Auto's default), decided from the
// drawing's medium and its maker's tags alone (tools/seg/tag-medium.py: `drop` marks hatching, tone and texture the
// maker would leave out). A PENCIL drawing is a lay-in: its lay-in and contour lines place the forms and the washes do
// the modelling, so the strokes tagged `drop` are left for the brush, except a contour (part `outline`) or a lay-in
// stroke (phase `layin`), which the maker's tagging also drops at times and which the lay-in needs (on Mittens the
// untagged strokes alone lose both ears and the face's edge). A PEN drawing is line-led: its lines carry the
// modelling and every one is laid. A drawing an author chose (a lines edit, `chosen`) is laid exactly as chosen. Pure.

const isPencil = medium => medium === 'pencil' || medium === 'graphite' || /^graphite-/.test(String(medium));

/** Whether Auto lays this stroke of a drawing in `medium` (the drawing file's own). */
export function autoDraws(stroke, medium) {
  return !(isPencil(medium) && stroke.drop === true) || stroke.part === 'outline' || stroke.phase === 'layin';
}

/**
 * The strokes a vectors document is laid with: an author's choice (`doc.chosen`) exactly, else Auto's default.
 * Returns {strokes, left (the strokes not laid), rule: one line saying why}.
 */
export function strokesToLay(doc) {
  if (doc.chosen) return { strokes: doc.strokes, left: [], rule: `as chosen (${doc.chosen})` };
  const strokes = [], left = [];
  for (const s of doc.strokes) (autoDraws(s, doc.medium) ? strokes : left).push(s);
  return { strokes, left, rule: left.length ? `a pencil lay-in: its ${strokes.length} lay-in and contour lines, not the ${left.length} other lines tagged drop (hatching, tone, texture, inner marks), which the washes model` : isPencil(doc.medium) ? 'a pencil lay-in with no lines tagged drop: every line' : 'a pen drawing: every line, the modelling is in its lines' };
}
