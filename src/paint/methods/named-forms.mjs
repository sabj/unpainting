// Named forms for the wash planner: a reviewed SAM id map of the source (tools/painter/thing-masks.mjs: receipt.json and
// named-sam.png) registered to the plan's grid, so the planner knows for each plan cell which named form it lies in and
// that form's kind. The map is geometry and names only; no colour of the subject is read here.

/** The kinds a form may have (the label file's `kind`); anything else, or none, is 'other'. */
const FORM_KINDS = Object.freeze(['face', 'eye', 'fur', 'sky', 'animal', 'figure', 'clothing', 'foliage', 'ground', 'water', 'hair', 'shadow', 'building', 'boat', 'other']);

/** The mask's ids on a width x height grid, read at each cell's centre (ids are never interpolated: that would invent forms at their boundaries). */
export function formGrid(mask, width, height) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = Math.min(mask.height - 1, Math.floor((y + 0.5) * mask.height / height)) * mask.width;
    for (let x = 0; x < width; x++) out[y * width + x] = mask.ids[row + Math.min(mask.width - 1, Math.floor((x + 0.5) * mask.width / width))];
  }
  return out;
}

/**
 * The named forms on the plan's grid: {ids (Uint8Array, 0 = no named form), forms: [{id, name, kind, cells}], kindAt(q)}.
 * `mask`: {width, height, ids, names, kinds} as loadThingMasks returns it. Null without a mask.
 */
export function namedForms(mask, pw, ph) {
  if (!mask) return null;
  if (!(mask.width > 0 && mask.height > 0) || mask.ids?.length !== mask.width * mask.height) throw Error('named forms: the mask needs width x height ids');
  const ids = formGrid(mask, pw, ph), count = new Int32Array(256);
  for (const id of ids) count[id]++;
  const kindOf = id => { const k = mask.kinds?.[id - 1]; return FORM_KINDS.includes(k) ? k : 'other'; };
  const forms = mask.names.map((name, i) => ({ id: i + 1, name, kind: kindOf(i + 1), cells: count[i + 1] }));
  const kinds = [null, ...forms.map(f => f.kind)];
  return { ids, forms, kindAt: q => kinds[ids[q]] ?? null };
}

/** The named forms a list of plan cells lies in, largest share first: [{id, name, kind, share}] (cells in no form are not listed). */
export function formCoverage(cells, named) {
  const counts = new Map();
  for (const q of cells) { const id = named.ids[q]; if (id) counts.set(id, (counts.get(id) ?? 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id, c]) => ({ id, name: named.forms[id - 1].name, kind: named.forms[id - 1].kind, share: +(c / cells.length).toFixed(4) }));
}
