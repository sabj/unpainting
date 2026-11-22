// The base wash of a soft named form (named-forms.mjs): a face, fur, an animal, hair, a figure, clothing, a sky or water
// is begun with ONE pale wet wash over the whole form, at the form's light value, its lights left as paper; the darker
// shapes of the study go over it. Geometry and the study's own shape colours only.

/** The kinds of form begun with one base wash. */
const SOFT_KINDS = Object.freeze(['face', 'fur', 'animal', 'hair', 'figure', 'clothing', 'sky', 'water']);
/** A form smaller than this (mm2 of painted paper) gets none. */
const BASE_LEAST_MM2 = 150;
/** The form's light value: its lightest study shape that holds at least this share of the form's painted cells. */
const LIGHT_SHARE = 0.08;

/**
 * The base washes: {bases: [{id, name, kind, cells, light}], baseOf: Int32Array (shape -> index in bases, or -1)}.
 * `cells`: the form's plan cells that are painted (not a light left as paper); `light`: the study shape whose colour the
 * wash takes. A shape belongs to a base when more than half of its cells lie in that form's cells.
 * @param named namedForms() of the plan grid, or null (no bases)
 * @param label plan cell -> shape; shapes: [{cells, lab, paper}]; paperMask: 1 where paper is kept
 */
export function formBases(named, label, shapes, paperMask, cellMm2) {
  const baseOf = new Int32Array(shapes.length).fill(-1), bases = [];
  if (!named) return { bases, baseOf };
  const byForm = new Map();
  for (let q = 0; q < label.length; q++) { const id = named.ids[q]; if (!id || paperMask[q] || shapes[label[q]].paper || !SOFT_KINDS.includes(named.forms[id - 1].kind)) continue; if (!byForm.has(id)) byForm.set(id, []); byForm.get(id).push(q); }
  const inBase = shapes.map(() => new Map());
  for (const [id, cells] of [...byForm].sort((a, b) => a[0] - b[0])) {
    if (cells.length * cellMm2 < BASE_LEAST_MM2) continue;
    const count = new Map(); for (const q of cells) count.set(label[q], (count.get(label[q]) ?? 0) + 1);
    const held = [...count].filter(([, c]) => c >= LIGHT_SHARE * cells.length).sort((a, b) => shapes[b[0]].lab[0] - shapes[a[0]].lab[0]);
    const light = held.length ? held[0][0] : [...count].sort((a, b) => b[1] - a[1])[0][0];
    for (const [s, c] of count) inBase[s].set(bases.length, c);
    bases.push({ id, name: named.forms[id - 1].name, kind: named.forms[id - 1].kind, cells, light });
  }
  shapes.forEach((s, i) => { let best = -1, bv = 0; for (const [b, c] of inBase[i]) if (c > bv) { bv = c; best = b; } if (best >= 0 && bv > 0.5 * s.cells.length) baseOf[i] = best; });
  return { bases, baseOf };
}
