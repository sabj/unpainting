// The drawing's lines as an author may choose them in a working session: which strokes are drawn before the washes,
// which after them as closing lines over the dry paint, which not at all, and how dark each is.
//
// The painter lays a drawing's vector strokes exactly (STEM-vectors.json, tools/plate/drawing.mjs): every stroke of
// --drawingfile before the first wash and every stroke of --drawinglast after the last. So a choice of lines is two
// new stems written into the run's folder, each holding the chosen strokes of the record's drawing with their
// darkness weighted; no stroke's shape is changed and no painter option is added.
//
//   drawing/lines.json    every stroke: id, part, phase, object, tagged, dark, lengthMm, widthMm, boxMm, form
//   my-lines.json         {"format": "lines-edit 1", "rules": [
//     {"where": {"tagged": "drop"}, "do": "drop"},
//     {"where": {"form": ["left eye", "right eye"], "part": "outline"}, "do": "after", "weight": 1.5},
//     {"where": {"ids": [12, 13]}, "weight": 0.5} ]}
// Every stroke starts as the painter lays it today: before the washes, at its own darkness. Rules are applied in
// order and a later rule wins. `where` holds conditions that must all be true.
// Lines after the washes need an ink drawing: the painter lays a pencil drawing before the washes only (its rule,
// src/paint/subject-medium.mjs: graphite is a preparatory drawing, and a subject without pen lines is given none), and
// takes any closing drawing out of a pencil run. So "after" on a pencil drawing is refused here, with that reason,
// and never asked of the painter to be dropped in silence.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LINES_EDIT_FORMAT = 'lines-edit 1';
const DO = ['before', 'after', 'drop'], WEIGHT = [0.1, 4];
/** What a rule may ask of a stroke: lists of words, lists of numbers, and bounds. */
const WORDS = ['form', 'part', 'phase', 'tagged'], BOUNDS = { darkAbove: ['dark', 1], darkBelow: ['dark', -1], lengthAboveMm: ['lengthMm', 1], lengthBelowMm: ['lengthMm', -1], widthAboveMm: ['widthMm', 1], widthBelowMm: ['widthMm', -1] };
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const median = v => { const s = v.filter(x => x > 0).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
function stripWidth(rings) {
  let area = 0, per = 0;
  for (const r of rings ?? []) for (let k = 0, n = r.length; k < n; k++) { const p = r[k], q = r[(k + 1) % n]; area += (p[0] * q[1] - q[0] * p[1]) / 2; per += Math.hypot(q[0] - p[0], q[1] - p[1]); }
  return per > 0 ? 2 * Math.abs(area) / per : 0;
}
/** How the drawing's maker tagged a stroke: a drawn ink line, a pale lay-in contour, or one it would drop (hatching, tone, texture). */
const tagOf = (s, whole) => (s.drop ? 'drop' : (s.medium ?? whole) === 'ink' ? 'ink' : 'layin');

/**
 * Every stroke of a drawing as an author reads it. `vectors`: the STEM-vectors.json document; `mask` {ids, width,
 * height} with `forms` [{id, name}] names the form each stroke lies in (most of its path), or null.
 * {format, sheet, medium, strokes: [{id, part, phase, object, tagged, dark, lengthMm, widthMm, boxMm, form}], counts}.
 */
export function linesListing(vectors, { mask = null, forms = [] } = {}) {
  const whole = vectors.medium === 'ink' ? 'ink' : 'graphite', nameOf = new Map(forms.map(f => [f.id, f.name]));
  const strokes = vectors.strokes.map(s => {
    const P = s.path ?? []; let len = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; const seen = new Map();
    P.forEach((p, i) => {
      if (i) len += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]);
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      if (mask) { const x = Math.min(mask.width - 1, Math.max(0, Math.floor(p[0] / vectors.sheetMm * mask.width))), y = Math.min(mask.height - 1, Math.max(0, Math.floor(p[1] / vectors.heightMm * mask.height))), id = mask.ids[y * mask.width + x]; seen.set(id, (seen.get(id) ?? 0) + 1); }
    });
    const most = [...seen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    return { id: s.seq, part: s.part ?? null, phase: s.phase ?? null, object: s.object ?? null, tagged: tagOf(s, whole), dark: +Number(s.dark).toFixed(3), lengthMm: +len.toFixed(1),
      widthMm: +(Array.isArray(s.widths) && s.widths.length ? median(s.widths) : stripWidth(s.outline)).toFixed(2), boxMm: P.length ? [x0, y0, x1, y1].map(v => +v.toFixed(1)) : null, form: most ? nameOf.get(most) ?? 'none' : 'none' };
  });
  const count = k => strokes.reduce((a, s) => ({ ...a, [s[k] ?? 'none']: (a[s[k] ?? 'none'] ?? 0) + 1 }), {});
  const ink = vectors.medium === 'ink';
  return { format: 'lines 1', sheet: { widthMm: vectors.sheetMm, heightMm: vectors.heightMm }, medium: vectors.medium, linesAfterTheWashes: ink,
    note: `Every stroke is drawn before the washes at its own darkness unless your rules say otherwise. ${ink ? 'This is an ink drawing: its ink lines may also be drawn after the washes ("do": "after").' : 'This is a pencil drawing: the painter lays pencil before the washes only, so "after" is not offered for it; you may choose, drop and weight its lines.'}`,
    counts: { strokes: strokes.length, tagged: count('tagged'), part: count('part'), form: count('form') }, strokes };
}

/**
 * A lines edit checked against the listing: the rules, each {test(stroke), do, weight}. Throws with the reason.
 */
export function checkLinesEdit(edit, listing) {
  const at = 'lines edit';
  if (!edit || typeof edit !== 'object' || Array.isArray(edit)) throw new Error(`${at}: one JSON object, {"format": "${LINES_EDIT_FORMAT}", "rules": [...]}`);
  if (edit.format !== LINES_EDIT_FORMAT) throw new Error(`${at}: "format" is "${LINES_EDIT_FORMAT}"`);
  if (!Array.isArray(edit.rules) || !edit.rules.length) throw new Error(`${at}: "rules" lists what to change, in order; with none, leave "lines" out of choice.json`);
  if (edit.rules.length > 200) throw new Error(`${at}: at most 200 rules`);
  const ids = new Set(listing.strokes.map(s => s.id)), have = Object.fromEntries(WORDS.map(k => [k, new Set(listing.strokes.map(s => String(s[k] ?? 'none')))]));
  return edit.rules.map((r, i) => {
    const who = `${at}, rule ${i + 1}`;
    if (!r || typeof r !== 'object') throw new Error(`${who}: an object with "where" and "do" or "weight"`);
    if (r.do == null && r.weight == null) throw new Error(`${who}: give "do" (${DO.join(', ')}) or "weight" (a factor on the line's darkness), or both`);
    if (r.do != null && !DO.includes(r.do)) throw new Error(`${who}: "do" is "before" (drawn before the washes), "after" (drawn over the dry washes) or "drop" (not drawn)`);
    const weight = r.weight == null ? null : Number(r.weight);
    if (weight != null && !(weight >= WEIGHT[0] && weight <= WEIGHT[1])) throw new Error(`${who}: "weight" is a factor from ${WEIGHT[0]} to ${WEIGHT[1]} on the line's darkness (1: as drawn)`);
    const w = r.where ?? {}, tests = [];
    if (typeof w !== 'object' || Array.isArray(w)) throw new Error(`${who}: "where" is an object of conditions; {} is every line`);
    for (const [k, v] of Object.entries(w)) {
      if (k === 'ids' || k === 'object') {
        const list = (Array.isArray(v) ? v : [v]).map(Number); if (!list.length || list.some(x => !Number.isInteger(x))) throw new Error(`${who}: "${k}" is a number or a list of numbers`);
        if (k === 'ids') { const none = list.filter(x => !ids.has(x)); if (none.length) throw new Error(`${who}: there is no line ${none.slice(0, 5).join(', ')} in drawing/lines.json`); }
        const set = new Set(list); tests.push(s => set.has(k === 'ids' ? s.id : s.object));
      } else if (WORDS.includes(k)) {
        const list = (Array.isArray(v) ? v : [v]).map(String), none = list.filter(x => !have[k].has(x));
        if (none.length) throw new Error(`${who}: no line has ${k} "${none[0]}" (the drawing has: ${[...have[k]].join(', ')})`);
        const set = new Set(list); tests.push(s => set.has(String(s[k] ?? 'none')));
      } else if (BOUNDS[k]) {
        const [field, sign] = BOUNDS[k], x = Number(v); if (!Number.isFinite(x)) throw new Error(`${who}: "${k}" is a number`);
        tests.push(s => (sign > 0 ? s[field] > x : s[field] < x));
      } else throw new Error(`${who}: "${k}" is not a condition (ids, object, ${WORDS.join(', ')}, ${Object.keys(BOUNDS).join(', ')})`);
    }
    return { test: s => tests.every(t => t(s)), do: r.do ?? null, weight };
  });
}

/**
 * The drawing with an edit applied. `vectors` and `lines`: the record's STEM-vectors.json and STEM-lines.json
 * documents. Returns {order: 'first' | 'both' | 'last' | 'none' (the painter's --drawing), opening, closing (each
 * {vectors, lines} or null), state (id -> {do, weight}), record}. Nothing given is altered; no stroke's shape changes.
 */
export function applyLinesEdit(vectors, lines, edit, listing) {
  const rules = checkLinesEdit(edit, listing), state = new Map(), matched = rules.map(() => 0);
  for (const s of listing.strokes) {
    const st = { do: 'before', weight: 1 };
    rules.forEach((r, i) => { if (!r.test(s)) return; matched[i]++; if (r.do) st.do = r.do; if (r.weight != null) st.weight = r.weight; });
    state.set(s.id, st);
  }
  const none = matched.findIndex(m => !m); if (none >= 0) throw new Error(`lines edit, rule ${none + 1}: no line matches its "where"; drop the rule or correct it`);
  const after = listing.strokes.filter(s => state.get(s.id).do === 'after').length;
  if (after && vectors.medium !== 'ink') throw new Error(`lines edit: ${after} lines are to be drawn after the washes, but this drawing is pencil. The painter lays a pencil drawing before the washes only (graphite is a preparatory drawing; a subject without pen lines is given none), so they would not be drawn. Draw them "before" (a "weight" above 1 makes them darker), or drop them`);
  const whole = vectors.medium === 'ink' ? 'ink' : 'graphite', layin = vectors.medium === 'ink' ? vectors.strokes.filter(s => (s.medium ?? whole) === 'graphite' && state.get(s.seq).do === 'after') : [];
  if (layin.length) throw new Error(`lines edit: ${layin.length} of the lines you draw after the washes are the pencil lay-in of an ink drawing (tagged "layin"); the closing pen lays ink only. Draw them before the washes, or drop them`);
  const part = which => {
    const strokes = vectors.strokes.filter(s => state.get(s.seq).do === which).map(s => { const k = state.get(s.seq).weight; return k === 1 ? s : { ...s, dark: +Math.min(1, s.dark * k).toFixed(4), darkAsDrawn: s.dark }; });
    if (!strokes.length) return null;
    // the line file beside the strokes: the lines these strokes were fitted to (a stroke's `line` is its line's seq)
    const keep = new Set(strokes.map(s => (s.line == null ? null : Math.floor(s.line)))), all = keep.has(null) || (lines.lines ?? []).some(g => g.seq == null);
    return { vectors: { ...vectors, strokes, source: `${vectors.source ?? ''}; the author's choice of its lines (${which} the washes)`, mediumMap: undefined }, lines: { ...lines, lines: all ? lines.lines : lines.lines.filter(g => keep.has(Math.floor(g.seq))) } };
  };
  const opening = part('before'), closing = part('after'), by = k => listing.strokes.filter(s => state.get(s.id).do === k);
  const mm = list => Math.round(list.reduce((a, s) => a + s.lengthMm, 0)), weighted = listing.strokes.filter(s => state.get(s.id).do !== 'drop' && state.get(s.id).weight !== 1);
  const record = { strokes: listing.strokes.length, before: by('before').length, after: by('after').length, dropped: by('drop').length, lengthMm: { before: mm(by('before')), after: mm(by('after')), dropped: mm(by('drop')) },
    weighted: weighted.length, darker: weighted.filter(s => state.get(s.id).weight > 1).length, paler: weighted.filter(s => state.get(s.id).weight < 1).length, rules: edit.rules.map((r, i) => ({ where: r.where ?? {}, do: r.do ?? null, weight: r.weight ?? null, lines: matched[i] })) };
  return { order: opening && closing ? 'both' : opening ? 'first' : closing ? 'last' : 'none', opening, closing, state, record };
}

/** One line for a record. */
export function linesLine(r) {
  return `of the drawing's ${r.strokes} lines ${r.before} are drawn before the washes, ${r.after} after them, ${r.dropped} not at all; ${r.weighted} weighted (${r.darker} darker, ${r.paler} paler)`;
}

/**
 * An edit of the record's drawing written as stems of its own in `dir`: opening-lines.json and opening-vectors.json,
 * and closing-* when lines are drawn after the washes. `stem`: the record's drawing stem (absolute). Returns {order,
 * opening, closing (absolute stems or null), record, sets: the run settings that paint it}.
 */
export function writeLinesEdit({ dir, stem, edit, listing }) {
  const vectors = JSON.parse(fs.readFileSync(`${stem}-vectors.json`, 'utf8')), lines = JSON.parse(fs.readFileSync(`${stem}-lines.json`, 'utf8'));
  const got = applyLinesEdit(vectors, lines, edit, listing); fs.mkdirSync(dir, { recursive: true });
  const put = (name, part) => { if (!part) return null; const to = path.join(dir, name); fs.writeFileSync(`${to}-vectors.json`, JSON.stringify(part.vectors)); fs.writeFileSync(`${to}-lines.json`, JSON.stringify(part.lines)); return to; };
  const opening = put('opening', got.opening), closing = put('closing', got.closing);
  fs.writeFileSync(path.join(dir, 'lines-edit.json'), JSON.stringify({ edit, of: { vectorsSha256: sha256(fs.readFileSync(`${stem}-vectors.json`)) }, record: got.record }, null, 1) + '\n');
  const sets = [];
  if (opening) sets.push(['drawing', opening]);
  if (closing) sets.push(['drawinglast', closing], ['drawinglastmin', '0']);
  if (got.order !== 'first') sets.push(['drawingorder', got.order]);
  // a choice of an ink drawing's lines is laid over ink that was set first, as pen and wash is done and as a script is
  // (command.mjs): with most of the pen's lines left out, the first washes lift a larger share of what is left than the
  // painter allows of ink that still rewets, and it stops. The run's own inkfast, when it names one, stands.
  if (vectors.medium === 'ink' && opening) sets.push(['inkfast', '1']);
  return { order: got.order, opening, closing, record: got.record, sets };
}
