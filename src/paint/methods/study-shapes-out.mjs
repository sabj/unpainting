// The block-in study's flat shapes as the planner read them, written out as data (study-shapes.json beside
// value-plan.json): BEFORE anything is nested, merged or filtered into washes. The planner holds them only in
// memory (study-washes.mjs studyShapes: a label for every plan cell and each shape's colour); this turns that into
// what an author can select from: each shape's number, its outline as polygons in sheet millimetres, its colour,
// its area, whether the planner keeps it as paper, the shape it lies inside, and the named forms it lies in.
// Nothing here is read back by the planner: the plan is the same with or without it. Pure: no file is touched.
import { outlineLoops } from './wash-strokes.mjs';

const r1 = v => +v.toFixed(1);

/**
 * `read`: what the plan returns as `studyShapes`: {pw, ph, cellMm, label (plan cell -> shape index), shapes: [{colour,
 * cells, paper, light, parent}], named: {ids (plan cell -> form number), forms: [{id, name, kind}]} or null}.
 * Returns {format, study, sheet, shapes: [{n, colour, areaMm2, paper, inside, boxMm, forms, polygons}]}; `n` is 1 from
 * the first shape, `inside` the number of the shape it is nested in or null.
 */
export function studyShapesDoc(read, { tolMm = null } = {}) {
  const { pw, ph, cellMm, label, shapes, named } = read, k = shapes.length, box = Array.from({ length: k }, () => ({ x0: pw, y0: ph, x1: -1, y1: -1 })), inForm = Array.from({ length: k }, () => new Map());
  for (let q = 0; q < pw * ph; q++) {
    const s = label[q], x = q % pw, y = (q / pw) | 0, b = box[s];
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    if (named) { const f = named.ids[q]; if (f) inForm[s].set(f, (inForm[s].get(f) ?? 0) + 1); }
  }
  const nameOf = new Map((named?.forms ?? []).map(f => [f.id, f.name]));
  return { format: 'study-shapes 2', study: 1, note: 'The block-in study\'s flat shapes as the planner read them, before they are nested, joined or filtered into washes. Polygons are sheet millimetres (outer edges and holes).',
    sheet: { widthMm: r1(pw * cellMm), heightMm: r1(ph * cellMm), cellMm: +cellMm.toFixed(3) },
    shapes: shapes.map((s, i) => {
      const b = box[i], loops = b.x1 < 0 ? [] : outlineLoops(label, i, b, pw, ph, { cellMm, tolMm: tolMm ?? cellMm / 2 });
      return { n: i + 1, colour: s.colour.map(Math.round), areaMm2: Math.round(s.cells * cellMm * cellMm), paper: Boolean(s.light), inside: s.parent >= 0 ? s.parent + 1 : null,
        boxMm: b.x1 < 0 ? null : [r1(b.x0 * cellMm), r1(b.y0 * cellMm), r1((b.x1 + 1) * cellMm), r1((b.y1 + 1) * cellMm)],
        forms: [...inForm[i]].map(([f, c]) => ({ name: nameOf.get(f) ?? `form ${f}`, share: +(c / s.cells).toFixed(2) })).filter(f => f.share >= 0.05).sort((a, c) => c.share - a.share),
        polygons: loops.map(l => l.points.map(p => [r1(p[0]), r1(p[1])])).filter(P => P.length >= 3) };
    }) };
}
