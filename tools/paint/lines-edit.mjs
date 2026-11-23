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
// An author may also draw lines of its own ("own": points in millimetres, pen or pencil, a width, a darkness, before or
// after the washes) and choose the medium of the whole drawing (pencil, pen, none) whatever the source shows.
// Only a file that cannot be read is refused. A choice that may spoil the drawing (pencil over the dry washes, a
// weight far outside the usual, a rule that matches nothing) is laid as written and listed as a warning: a mistake
// reaches the sheet as a mistake.
// How it is laid: a drawing all in pencil and all before the washes is a pencil file. Anything else is an ink file
// whose pencil strokes are marked graphite (the painter's lay-in route); a closing file that holds pencil says so
// (pencilAfterWashes), and the painter then lays its graphite over the dry washes (tools/plate/drawing.mjs).
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
  return { format: 'lines 1', sheet: { widthMm: vectors.sheetMm, heightMm: vectors.heightMm }, medium: vectors.medium, linesAfterTheWashes: true,
    note: `Every stroke is drawn before the washes at its own darkness unless your rules say otherwise. This is ${ink ? 'an ink' : 'a pencil'} drawing as prepared; the medium is yours to change ("medium" in choice.json: pencil, pen or none), any line may be drawn after the washes ("do": "after"), and you may draw lines of your own ("own").`,
    counts: { strokes: strokes.length, tagged: count('tagged'), part: count('part'), form: count('form') }, strokes };
}

/** A problem of form: the file cannot be read as a choice of lines at all. Everything else is a warning. */
const OWN_MEDIA = ['pen', 'pencil'], WHEN = ['before', 'after'];
/** The media an author may choose for the drawing, whatever the source shows. */
export const DRAWING_MEDIA = Object.freeze(['pencil', 'pen', 'none']);

/**
 * A lines edit checked against the listing: the rules, each {test(stroke), do, weight}. Throws only when the file
 * cannot be read (its form); a choice that may spoil the drawing is laid as written and told in `warnings`.
 */
export function checkLinesEdit(edit, listing, warnings = []) {
  const at = 'lines edit';
  if (!edit || typeof edit !== 'object' || Array.isArray(edit)) throw new Error(`${at}: one JSON object, {"format": "${LINES_EDIT_FORMAT}", "rules": [...], "own": [...]}`);
  if (edit.format !== LINES_EDIT_FORMAT) throw new Error(`${at}: "format" is "${LINES_EDIT_FORMAT}"`);
  const rules = edit.rules ?? [], own = edit.own ?? [];
  if (!Array.isArray(rules) || !Array.isArray(own)) throw new Error(`${at}: "rules" and "own" are lists`);
  if (!rules.length && !own.length) throw new Error(`${at}: "rules" lists what to change of the drawing's lines and "own" the lines you draw yourself; with neither, leave "lines" out of choice.json`);
  const ids = new Set(listing.strokes.map(s => s.id)), have = Object.fromEntries(WORDS.map(k => [k, new Set(listing.strokes.map(s => String(s[k] ?? 'none')))]));
  return rules.map((r, i) => {
    const who = `${at}, rule ${i + 1}`;
    if (!r || typeof r !== 'object') throw new Error(`${who}: an object with "where" and "do" or "weight"`);
    if (r.do == null && r.weight == null) throw new Error(`${who}: give "do" (${DO.join(', ')}) or "weight" (a factor on the line's darkness), or both`);
    if (r.do != null && !DO.includes(r.do)) throw new Error(`${who}: "do" is "before" (drawn before the washes), "after" (drawn over the dry washes) or "drop" (not drawn)`);
    const weight = r.weight == null ? null : Number(r.weight);
    if (weight != null && !(Number.isFinite(weight) && weight > 0)) throw new Error(`${who}: "weight" is a number above 0, a factor on the line's darkness (1: as drawn)`);
    if (weight != null && !(weight >= WEIGHT[0] && weight <= WEIGHT[1])) warnings.push(`${who}: a weight of ${weight} is outside the usual ${WEIGHT[0]} to ${WEIGHT[1]}; it is laid as you wrote it (a line never goes past black)`);
    const w = r.where ?? {}, tests = [];
    if (typeof w !== 'object' || Array.isArray(w)) throw new Error(`${who}: "where" is an object of conditions; {} is every line`);
    for (const [k, v] of Object.entries(w)) {
      if (k === 'ids' || k === 'object') {
        const list = (Array.isArray(v) ? v : [v]).map(Number); if (!list.length || list.some(x => !Number.isInteger(x))) throw new Error(`${who}: "${k}" is a number or a list of numbers`);
        if (k === 'ids') { const none = list.filter(x => !ids.has(x)); if (none.length) warnings.push(`${who}: there is no line ${none.slice(0, 5).join(', ')} in drawing/lines.json; the rule changes the others it names`); }
        const set = new Set(list); tests.push(s => set.has(k === 'ids' ? s.id : s.object));
      } else if (WORDS.includes(k)) {
        const list = (Array.isArray(v) ? v : [v]).map(String), none = list.filter(x => !have[k].has(x));
        if (none.length) warnings.push(`${who}: no line has ${k} "${none[0]}" (the drawing has: ${[...have[k]].join(', ')})`);
        const set = new Set(list); tests.push(s => set.has(String(s[k] ?? 'none')));
      } else if (BOUNDS[k]) {
        const [field, sign] = BOUNDS[k], x = Number(v); if (!Number.isFinite(x)) throw new Error(`${who}: "${k}" is a number`);
        tests.push(s => (sign > 0 ? s[field] > x : s[field] < x));
      } else throw new Error(`${who}: "${k}" is not a condition (ids, object, ${WORDS.join(', ')}, ${Object.keys(BOUNDS).join(', ')})`);
    }
    return { test: s => tests.every(t => t(s)), do: r.do ?? null, weight };
  });
}

/** A line of even width as the closed outline the painter lays: the path offset half its width to each side (mm). */
export function lineOutline(points, widthMm) {
  const P = points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]), r = widthMm / 2, left = [], right = [];
  if (P.length < 2) { const [x, y] = P[0]; return [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]; }
  P.forEach((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    left.push([+(p[0] + nx * r).toFixed(3), +(p[1] + ny * r).toFixed(3)]); right.push([+(p[0] - nx * r).toFixed(3), +(p[1] - ny * r).toFixed(3)]);
  });
  return [...left, ...right.reverse()];
}

/**
 * The lines an author draws itself ("own" in a lines edit), checked: [{points, medium: 'pen' | 'pencil', widthMm,
 * dark, when: 'before' | 'after'}]. Each is a path in sheet millimetres. Throws only when a line cannot be read;
 * a line that may spoil the drawing (off the sheet, very wide, pencil over the dry washes) is drawn and told in `warnings`.
 */
export function checkOwnLines(own, sheet, warnings = []) {
  return (own ?? []).map((o, i) => {
    const who = `lines edit, own line ${i + 1}`;
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${who}: an object {"points": [[x, y], ...], "medium": "pen" | "pencil", "widthMm": 0.4, "dark": 0.8, "when": "before" | "after"}`);
    const P = o.points;
    if (!Array.isArray(P) || P.length < 2 || P.some(p => !Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(v => typeof v === 'number' && Number.isFinite(v)))) throw new Error(`${who}: "points" is two or more points [x, y] in sheet millimetres`);
    const medium = o.medium ?? 'pencil', when = o.when ?? 'before', widthMm = o.widthMm == null ? 0.4 : Number(o.widthMm), dark = o.dark == null ? 0.7 : Number(o.dark);
    if (!OWN_MEDIA.includes(medium)) throw new Error(`${who}: "medium" is "pen" or "pencil"`);
    if (!WHEN.includes(when)) throw new Error(`${who}: "when" is "before" (before the washes) or "after" (over the dry washes)`);
    if (!(Number.isFinite(widthMm) && widthMm > 0)) throw new Error(`${who}: "widthMm" is the line's width in millimetres, above 0`);
    if (!(Number.isFinite(dark) && dark >= 0)) throw new Error(`${who}: "dark" is the line's darkness, 0 (nothing) to 1 (black)`);
    const points = P.map(p => [Number(p[0]), Number(p[1])]);
    if (points.every(([x, y]) => x < 0 || x > sheet.widthMm || y < 0 || y > sheet.heightMm)) warnings.push(`${who}: every point lies off the sheet (${sheet.widthMm} by ${sheet.heightMm} mm); nothing of it will show`);
    if (widthMm > 3) warnings.push(`${who}: ${widthMm} mm is wider than any pen or pencil draws (about 0.2 to 1 mm); it is laid that wide`);
    if (dark > 1) warnings.push(`${who}: a darkness of ${dark} is past black; it is laid black`);
    if (dark === 0) warnings.push(`${who}: a darkness of 0 draws nothing`);
    if (medium === 'pencil' && when === 'after') warnings.push(`${who}: pencil over the dry washes sits grey on top of the paint and hardly shows over a dark wash; it is drawn as you wrote it`);
    return { points, medium, widthMm, dark: Math.min(1, dark), when };
  });
}

/**
 * The drawing with an author's choice applied. `vectors` and `lines`: the record's STEM-vectors.json and
 * STEM-lines.json documents; `edit` a lines edit (rules on the drawing's lines, lines of the author's own) or null;
 * `medium` 'pencil' | 'pen' | 'none' (the drawing's lines all in that medium, or none of them drawn) or null (as the
 * drawing has them). Returns {order: 'first' | 'both' | 'last' | 'none' (the painter's --drawing), opening, closing
 * (each {vectors, lines} or null), laidAs ('pencil' | 'ink' | null: the medium the files declare), state (id -> {do,
 * weight}), record, warnings}. Nothing given is altered; no prepared stroke's shape changes.
 */
export function applyLinesEdit(vectors, lines, edit, listing, { medium = null } = {}) {
  if (medium != null && !DRAWING_MEDIA.includes(medium)) throw new Error(`"medium" is one of ${DRAWING_MEDIA.join(', ')}`);
  if (!edit && medium == null) throw new Error('lines edit: neither lines nor a medium is chosen');
  const warnings = [], rules = edit ? checkLinesEdit(edit, listing, warnings) : [], state = new Map(), matched = rules.map(() => 0);
  const own = edit ? checkOwnLines(edit.own, { widthMm: vectors.sheetMm, heightMm: vectors.heightMm }, warnings) : [];
  for (const s of listing.strokes) {
    const st = { do: 'before', weight: 1 };
    rules.forEach((r, i) => { if (!r.test(s)) return; matched[i]++; if (r.do) st.do = r.do; if (r.weight != null) st.weight = r.weight; });
    state.set(s.id, st);
  }
  matched.forEach((m, i) => { if (!m) warnings.push(`lines edit, rule ${i + 1}: no line matches its "where"; the rule changes nothing`); });
  const whole = vectors.medium === 'ink' ? 'ink' : 'graphite', as = medium === 'pencil' ? 'graphite' : medium === 'pen' ? 'ink' : null;
  const mediumOf = s => as ?? s.medium ?? whole, drawn = s => medium !== 'none' && state.get(s.seq).do !== 'drop';
  const pencilAfter = vectors.strokes.filter(s => drawn(s) && state.get(s.seq).do === 'after' && mediumOf(s) === 'graphite').length;
  if (pencilAfter) warnings.push(`lines edit: ${pencilAfter} of the drawing's lines are drawn in pencil over the dry washes; pencil there sits grey on top of the paint and hardly shows over a dark wash. They are drawn as you wrote them`);
  if (medium === 'none' && rules.length) warnings.push('lines edit: the medium is "none", so none of the drawing\'s own lines is drawn and your rules change nothing; your own lines are drawn');
  if (medium === 'pen' && whole === 'graphite') { const soft = vectors.strokes.filter(s => drawn(s) && s.drop).length; if (soft) warnings.push(`the medium is pen on a drawing made in pencil: ${soft} of its lines are hatching, tone or texture, and in ink they are laid as dark as drawn; drop or pale them if that is not what you want`); }
  // what is drawn, in the drawing's order and then the author's own lines in theirs: each with its time and its medium
  let seq = vectors.strokes.reduce((m, s) => Math.max(m, s.seq), 0);
  const all = [
    ...vectors.strokes.filter(drawn).map(s => { const st = state.get(s.seq); return { s, when: st.do, weight: st.weight, m: mediumOf(s) }; }),
    ...own.map(o => ({ when: o.when, weight: 1, m: o.medium === 'pen' ? 'ink' : 'graphite',
      s: { seq: ++seq, line: null, part: 'own', phase: 'own', object: -1, unit: -1, dark: o.dark, path: o.points, widths: o.points.map(() => o.widthMm), drawn: 'path', outline: [lineOutline(o.points, o.widthMm)], own: true } })),
  ];
  const anyAfter = all.some(x => x.when === 'after'), laidAs = !all.length ? null : all.every(x => x.m === 'graphite') && !anyAfter ? 'pencil' : 'ink', wholeNow = laidAs === 'ink' ? 'ink' : 'graphite';
  const part = which => {
    const mine = all.filter(x => x.when === which); if (!mine.length) return null;
    // a stroke is the record's own unless its darkness is weighted or the file's medium no longer says what it is drawn in
    const strokes = mine.map(({ s, weight, m }) => { const k = weight, keep = k === 1 && (s.medium ?? (laidAs === vectors.medium ? m : null)) === m && !s.own; return keep ? s : { ...s, ...(k === 1 ? {} : { dark: +Math.min(1, s.dark * k).toFixed(4), darkAsDrawn: s.dark }), medium: m }; });
    // the line file beside the strokes: the lines these strokes were fitted to (a stroke's `line` is its line's seq)
    const keep = new Set(strokes.map(s => (s.line == null ? null : Math.floor(s.line)))), every = keep.has(null) || (lines.lines ?? []).some(g => g.seq == null);
    const pencilOver = which === 'after' && strokes.some(s => (s.medium ?? wholeNow) === 'graphite');
    return { vectors: { ...vectors, medium: laidAs, strokes, source: `${vectors.source ?? ''}; the author's choice of its lines (${which} the washes)`, mediumMap: undefined, ...(pencilOver ? { pencilAfterWashes: true } : {}) }, lines: { ...lines, medium: laidAs, lines: every ? lines.lines : lines.lines.filter(g => keep.has(Math.floor(g.seq))) } };
  };
  const opening = part('before'), closing = part('after'), by = k => listing.strokes.filter(s => (medium === 'none' ? 'drop' : state.get(s.id).do) === k);
  const mm = list => Math.round(list.reduce((a, s) => a + s.lengthMm, 0)), weighted = listing.strokes.filter(s => medium !== 'none' && state.get(s.id).do !== 'drop' && state.get(s.id).weight !== 1);
  const ownMm = o => o.points.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - o.points[i - 1][0], p[1] - o.points[i - 1][1]) : 0), 0);
  const record = { strokes: listing.strokes.length, before: by('before').length, after: by('after').length, dropped: by('drop').length, lengthMm: { before: mm(by('before')), after: mm(by('after')), dropped: mm(by('drop')) },
    weighted: weighted.length, darker: weighted.filter(s => state.get(s.id).weight > 1).length, paler: weighted.filter(s => state.get(s.id).weight < 1).length, rules: (edit?.rules ?? []).map((r, i) => ({ where: r.where ?? {}, do: r.do ?? null, weight: r.weight ?? null, lines: matched[i] })),
    ...(own.length ? { own: { lines: own.length, pen: own.filter(o => o.medium === 'pen').length, pencil: own.filter(o => o.medium === 'pencil').length, before: own.filter(o => o.when === 'before').length, after: own.filter(o => o.when === 'after').length, lengthMm: Math.round(own.reduce((a, o) => a + ownMm(o), 0)) } } : {}),
    ...(medium != null || laidAs !== vectors.medium ? { medium: { chosen: medium, theDrawingIs: vectors.medium, laidAs } } : {}),
    ...(warnings.length ? { warnings } : {}) };
  return { order: opening && closing ? 'both' : opening ? 'first' : closing ? 'last' : 'none', opening, closing, laidAs, state, record, warnings };
}

/** One line for a record. */
export function linesLine(r) {
  const own = r.own ? `; ${r.own.lines} lines of your own (${r.own.pen} pen, ${r.own.pencil} pencil; ${r.own.before} before the washes, ${r.own.after} after them)` : '';
  const medium = r.medium ? `; the drawing is laid ${r.medium.laidAs == null ? 'not at all' : r.medium.laidAs === 'pencil' ? 'in pencil' : 'as a pen drawing (ink, with any pencil lines of it in graphite)'}${r.medium.chosen ? ` (you chose "${r.medium.chosen}"; the prepared drawing is ${r.medium.theDrawingIs})` : ''}` : '';
  return `of the drawing's ${r.strokes} lines ${r.before} are drawn before the washes, ${r.after} after them, ${r.dropped} not at all; ${r.weighted} weighted (${r.darker} darker, ${r.paler} paler)${own}${medium}`;
}

/**
 * A choice of the record's drawing written as stems of its own in `dir`: opening-lines.json and opening-vectors.json,
 * and closing-* when lines are drawn after the washes. `stem`: the record's drawing stem (absolute); `edit` a lines
 * edit or null; `medium` the chosen medium or null. Returns {order, opening, closing (absolute stems or null), laidAs,
 * record, warnings, sets: the run settings that paint it}.
 */
export function writeLinesEdit({ dir, stem, edit, listing, medium = null }) {
  const vectors = JSON.parse(fs.readFileSync(`${stem}-vectors.json`, 'utf8')), lines = JSON.parse(fs.readFileSync(`${stem}-lines.json`, 'utf8'));
  const got = applyLinesEdit(vectors, lines, edit, listing, { medium }); fs.mkdirSync(dir, { recursive: true });
  const put = (name, part) => { if (!part) return null; const to = path.join(dir, name); fs.writeFileSync(`${to}-vectors.json`, JSON.stringify(part.vectors)); fs.writeFileSync(`${to}-lines.json`, JSON.stringify(part.lines)); return to; };
  const opening = put('opening', got.opening), closing = put('closing', got.closing);
  fs.writeFileSync(path.join(dir, 'lines-edit.json'), JSON.stringify({ edit, medium, of: { vectorsSha256: sha256(fs.readFileSync(`${stem}-vectors.json`)) }, record: got.record }, null, 1) + '\n');
  const sets = [];
  // a closing drawing alone still names an opening file: the painter reads the medium of the run from it, and lays none of it (order last)
  if (opening ?? closing) sets.push(['drawing', opening ?? closing]);
  if (closing) sets.push(['drawinglast', closing], ['drawinglastmin', '0']);
  if (got.order !== 'first') sets.push(['drawingorder', got.order]);
  // the medium the files declare is the run's: a pencil drawing chosen as pen needs the pen's ink on the sheet, and the other way round
  if (got.laidAs && got.laidAs !== vectors.medium) sets.push(['outlinemedium', got.laidAs === 'ink' ? 'ink' : 'graphite']);
  // a choice of an ink drawing's lines is laid over ink that was set first, as pen and wash is done and as a script is
  // (command.mjs): with most of the pen's lines left out, the first washes lift a larger share of what is left than the
  // painter allows of ink that still rewets, and it stops. The run's own inkfast, when it names one, stands.
  if (got.laidAs === 'ink' && opening) sets.push(['inkfast', '1']);
  return { order: got.order, opening, closing, laidAs: got.laidAs, record: got.record, warnings: got.warnings, sets };
}
