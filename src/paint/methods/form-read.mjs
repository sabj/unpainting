// Study settings for single named forms. A wash plan may give a study a setting for one form, by the form's number in
// the run's named forms (--washplan FILE@name#FORM=value, tools/painter/study-load.mjs): inside that form the study is
// read with that value in place of the study's own. Without any, the plan is exactly as it was.
//   the block-in (the first study): clusters, join (the form's cells are read into colours of their own), shapes (the
//     most shapes in the form), floor (its least shape, mm2), formbrush (its widest wash brush, mm, whatever its kind),
//     formbase (1: it begins with one pale base wash, whatever its kind; 0: it gets none)
//   a later study: floor (the least touch or glaze it adds in the form, mm2), lay (0: it adds nothing in the form; 1: it
//     does, also when the study's own lay is 0, and also on skin, which takes no touches otherwise), largest (the
//     largest touch kept, mm2), lightest (touches at least this dark are kept, L*)

/** The settings one form may be given, for the block-in and for a later study. */
export const FORM_READ = Object.freeze({ first: Object.freeze(['clusters', 'join', 'shapes', 'floor', 'formbrush', 'formbase']), later: Object.freeze(['floor', 'lay', 'largest', 'lightest']) });

/**
 * A study's per-form settings checked against the run's named forms. `forms`: {formId: {key: value}} or nothing;
 * `named`: namedForms() of the plan grid, or null. Returns {none, per(id, key, fallback), ids(key), any(keys)}.
 * A form the run has not, a setting a form cannot take, or per-form settings without named forms stop the plan.
 */
export function formRead(forms, named, { first = false } = {}) {
  const entries = Object.entries(forms ?? {});
  if (!entries.length) return { none: true, per: (id, key, fallback) => fallback, ids: () => [], any: () => false };
  if (!named) throw Error('--washplan: a study setting names a form (@name#FORM=value), but this run has no named forms (--thingmasks)');
  const allowed = FORM_READ[first ? 'first' : 'later'], map = new Map();
  for (const [id, set] of entries) {
    const n = Number(id);
    if (!Number.isInteger(n) || !named.forms[n - 1]) throw Error(`--washplan: @...#${id}: the run's named forms are numbered 1 to ${named.forms.length}`);
    for (const k of Object.keys(set)) if (!allowed.includes(k)) throw Error(`--washplan: @${k}#${id}: not a setting of a form for ${first ? 'the block-in' : 'a later study'} (${allowed.join(', ')})`);
    map.set(n, set);
  }
  return { none: false, per: (id, key, fallback) => map.get(id)?.[key] ?? fallback, ids: key => [...map].filter(([, s]) => s[key] != null).map(([id]) => id), any: keys => [...map.values()].some(s => keys.some(k => s[k] != null)) };
}

/** The named form most of these plan cells lie in: its number, or 0 (most in no form, or no named forms). */
export function formOfCells(cells, named) {
  if (!named || !cells.length) return 0;
  const count = new Map(); for (const q of cells) { const id = named.ids[q]; count.set(id, (count.get(id) ?? 0) + 1); }
  let best = 0, bv = 0; for (const [id, c] of count) if (c > bv || (c === bv && id < best)) { bv = c; best = id; }
  return best;
}
