// The code planner's wash plan as something an author can edit and hand back (tools/paint/SESSION-README.md, "Editing the plan").
//
// The plan the study planner builds (study-washes.mjs) holds, for every wash, its cells, its mix, its strokes and how
// it is laid; none of that fits the painting-script format without loss (a script re-places every stroke from a loose
// region and mixes on white paper). So the plan itself is not exported: the painter builds it again from the same
// studies, and an edit names what to change by wash number. A wash the edit does not name a change for is the very
// object the planner made: same cells, same mix, same strokes. An edit that changes nothing returns the plan itself.
//
//   planListing(plan)        every wash in painting order with what an author may change (the file an author edits)
//   checkPlanEdit(edit, listing)   the edit's form, against that listing; what it changes, counted
//   applyPlanEdit(plan, edit, ctx) the edited plan, in the shape the paint step takes
//
// What an entry may change: colour (what the place is to read as once the wash is down), strength (its paint, times),
// brushMm and direction (the wash is laid again in lanes over the same outline), lay (wet on dry, beside damp, wet on
// wet), its place in the order and its wet session. Washes may be dropped (left out), merged into one, and an author's
// own passages (painting-script passages, with a colour in place of a paint) added between them.
// Plan time only; nothing of the subject is read.
import crypto from 'node:crypto';
import { passage } from '../../crop/blockin.mjs';
import { components } from '../../raster.js';
import { outlineLoops } from './wash-strokes.mjs';
import { laneFill } from './sweep-fill.mjs';
import { roundMask } from './study-shapes.mjs';
import { valueMix, valueRefOf } from './value-mix.mjs';
import { mixFor, filmLab } from './puddles.mjs';
import { labToRgb } from './study-washes.mjs';
import { labOf } from '../../eval/colour.mjs';
import { planScriptWashes, checkScript } from './script-washes.mjs';
import { sweeps, handOf } from './script-marks.mjs';
import { checkErase, eraseStrokes, eraseLayer } from './erase-passage.mjs';
import { footprint } from './script-washes.mjs';

export const PLAN_EDIT_FORMAT = 'plan-edit 1';
/** How a wash may be laid: hard-edged on the dry sheet, against the wash before it while that is damp, or into clean water. */
const LAYS = Object.freeze(['wet on dry', 'beside damp', 'wet on wet']);
/** A wash's strength may be changed by a factor between these. */
const STRENGTH = Object.freeze([0.05, 4]);
/** Merged washes are joined across gaps up to this wide (mm), and a merged outline is simplified to this (mm). */
const MERGE_CLOSE_MM = 1.2, TOL_MM = 0.4;
/** A re-laid wash's lanes run this far past its outline (mm), as the planner's do. */
const GROW_MM = 0.4;
/** A stroke laid into its own wet bed covers at least this many sheet cells (study-washes.mjs). */
const WET_LEAST_CELLS = 40;
/**
 * Watercolour only darkens: a wash cannot make its place lighter than what is laid under it. A colour asked for that
 * is lighter than what is under it by up to this much (L*) is laid as the nearest that can be, a faint wash of the
 * colour's own paints, and said in a note; lighter than that is refused. The edit may give its own (`nearestWithin`).
 */
export const NEAREST_WITHIN_L = 8;
/** The nearest that can be: the colour's own paints laid to read this much darker (L*) than what is under them. */
const NEAREST_STEP_L = 1.5;
/** The fields of a kept wash an author may change. */
const FIELDS = Object.freeze(['colour', 'strength', 'brushMm', 'direction', 'lay']);

/** What is wrong with an edit, said for its author: a fault of one wash (others are still checked) or the whole list. */
const fault = message => Object.assign(Error(message), { planEditFault: true });
const allFaults = faults => Object.assign(Error(`plan edit: ${faults.length} thing${faults.length > 1 ? 's' : ''} to correct, ${faults.length > 1 ? 'every one listed here; correct them all, then plan again' : 'listed here'}.\n${faults.map(f => `- ${f.replace(/^plan edit, /, '')}`).join('\n')}`), { planEditFaults: faults });
const washesOf = plan => plan.layers.flatMap((l, L) => l.shapes.map(sh => ({ sh, L, layer: l })));
const inTouches = q => !q.outline?.length || /touches/.test(q.brush?.kind ?? '');
const same = (a, b) => (Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((v, i) => Number(v) === Number(b[i])) : a === b || (a == null && b == null) || (typeof a === 'number' && Number(b) === a));

/** A fingerprint of a plan's washes (their order, cells, strokes and mixes): an edit made from one plan is refused on another. */
export function planFingerprint(plan) {
  const h = crypto.createHash('sha256');
  for (const { sh, L } of washesOf(plan)) h.update(JSON.stringify([L, sh._valuePlan.id, sh.area, sh._valuePlan.strokes?.length ?? 0, sh.mix.map(v => +v.toFixed(5))]));
  return h.digest('hex').slice(0, 16);
}

/**
 * The plan as the file an author edits: {format, of, sheet, brushesMm, washes: [{wash, session, colour, strength,
 * brushMm, direction, lay, about}]} in painting order. `wash` is the wash's number in value-plan.json (1 from the
 * first); `about` describes it and is not read back.
 */
export function planListing(plan, { w, h, sheetWidthMm, kitMm }) {
  const cellMm = sheetWidthMm / w, num = new Map(plan.instructions.map((q, i) => [q.id, i + 1]));
  const washes = washesOf(plan).map(({ sh, L }) => {
    const q = sh._valuePlan, b = sh.box;
    return { wash: num.get(q.id), session: L + 1, colour: q.colour ? q.colour.map(Math.round) : null, strength: 1, brushMm: q.widestBrushMm, direction: null, lay: q.move,
      about: { what: q.thing, stage: q.stage, kind: q.kind, laidIn: inTouches(q) ? 'touches' : 'lanes', strokes: q.strokes.length, areaMm2: Math.round(q.areaMm2),
        boxMm: b ? [b.x0 * cellMm, b.y0 * cellMm, (b.x1 + 1) * cellMm, (b.y1 + 1) * cellMm].map(Math.round) : null, forms: (q.forms ?? []).filter(f => f.share >= 0.05).map(f => `${f.name} ${Math.round(100 * f.share)}%`).join(', ') || 'no named form' } };
  });
  return { format: PLAN_EDIT_FORMAT, of: planFingerprint(plan), nearestWithin: NEAREST_WITHIN_L, sheet: { widthMm: sheetWidthMm, heightMm: +(h * cellMm).toFixed(1) }, brushesMm: [...new Set(kitMm)].sort((a, b) => b - a), washes };
}

/** An author's own passages as the one-passage painting scripts the script planner takes; the paint is a stand-in (the colour sets the mix). */
function ownScript(p, { sheet, brushesMm, key }) {
  const { colour, brushMm, session, lay, paint, charges, into, wait, paper, edges, ...rest } = p;
  return { format: 'painting-script 2', author: 'plan edit', sheet, palette: [key], brushes: Object.fromEntries(brushesMm.map(v => [`b${v}`, { shape: 'round', widthMm: v }])),
    passages: [{ ...rest, ...(brushMm != null ? { brush: `b${brushMm}` } : {}), paint: { pigments: { [key]: 1 }, dilution: 'medium' } }] };
}

/**
 * An edit checked against the listing it was made from. Returns {entries, record}: the entries in order, each
 * {type: 'keep' | 'merge' | 'own', group (its wet session's index), lay, ...}, and what the edit does, counted:
 * {auto, kept, untouched, changed, moved, merged, mergedFrom, dropped, added, untouchedShare, unchanged, notes}.
 * Throws with the reason, said so that the author can correct the file.
 */
export function checkPlanEdit(edit, listing) {
  const at = 'plan edit';
  if (!edit || typeof edit !== 'object' || Array.isArray(edit)) throw Error(`${at}: one JSON object, the copy of auto/plan-to-edit.json you changed`);
  if (edit.format !== PLAN_EDIT_FORMAT) throw Error(`${at}: "format" must stay "${PLAN_EDIT_FORMAT}"`);
  if (edit.of !== listing.of) throw Error(`${at}: "of" must stay as it was (${listing.of}): the file is an edit of that one plan`);
  if (!Array.isArray(edit.washes) || !edit.washes.length) throw Error(`${at}: "washes" is the list of washes in painting order; an empty plan paints nothing`);
  const auto = new Map(listing.washes.map((x, i) => [x.wash, { ...x, at: i }])), kit = listing.brushesMm, used = new Set(), notes = [], ownIds = new Set();
  const colourOk = c => Array.isArray(c) && c.length === 3 && c.every(v => Number.isFinite(Number(v)) && v >= 0 && v <= 255);
  const fields = (e, who, base) => {
    const out = {};
    if (e.colour != null && !same(e.colour, base?.colour)) { if (!colourOk(e.colour)) throw Error(`${who}: "colour" is [red, green, blue], each 0 to 255`); out.colour = e.colour.map(Number); }
    if (e.strength != null && Number(e.strength) !== 1) { const s = Number(e.strength); if (!(Number.isFinite(s) && s > 0)) throw Error(`${who}: "strength" is a number above 0, a factor on the wash's paint (1: as it is)`); if (!(s >= STRENGTH[0] && s <= STRENGTH[1])) notes.push(`WARNING, ${who}: a strength of ${s} is outside the usual ${STRENGTH[0]} to ${STRENGTH[1]}; it is laid as you wrote it`); out.strength = s; }
    if (e.brushMm != null && !same(e.brushMm, base?.brushMm)) { if (!kit.includes(Number(e.brushMm))) throw Error(`${who}: "brushMm" ${e.brushMm} is not a brush of the kit (${kit.join(', ')} mm)`); out.brushMm = Number(e.brushMm); }
    if (e.direction != null) { const d = Number(e.direction); if (!(Number.isFinite(d) && Math.abs(d) <= 360)) throw Error(`${who}: "direction" is degrees (0 the lanes run left to right, 90 top to bottom), or null for the planner's own`); out.direction = d; }
    if (e.lay != null && e.lay !== base?.lay) { if (!LAYS.includes(e.lay)) throw Error(`${who}: "lay" is one of ${LAYS.map(l => `"${l}"`).join(', ')}`); out.lay = e.lay; }
    return out;
  };
  const take = (n, who) => {
    const a = auto.get(Number(n)); if (!a) throw Error(`${who}: there is no wash ${n} in the code planner's plan (1 to ${listing.washes.length})`);
    if (used.has(a.wash)) throw Error(`${who}: wash ${a.wash} is named twice; a wash is kept once, merged once, or left out`);
    used.add(a.wash); return a;
  };
  // every entry is checked, and every fault is kept: the author gets them all at once
  const faults = [];
  let group = -1, lastSession;
  const checked = edit.washes.map((e, i) => { try { return one(e, i); } catch (err) { faults.push(err.message); return null; } });
  function one(e, i) {
    if (!e || typeof e !== 'object') throw Error(`${at}, entry ${i + 1}: an object`);
    const kinds = ['wash', 'merge', 'own'].filter(k => e[k] != null);
    if (kinds.length !== 1) throw Error(`${at}, entry ${i + 1}: one of "wash" (a wash of the plan, by number), "merge" (several, as one wash) or "own" (a passage of your own)`);
    // consecutive entries with the same "session" are one wet session; an entry without one is a session by itself
    const session = e.session ?? (e.own?.session ?? null);
    if (session == null || session !== lastSession) group++;
    lastSession = session;
    if (e.wash != null) {
      const who = `${at}, wash ${e.wash}`, a = take(e.wash, who), changes = fields(e, who, a);
      if ((changes.brushMm != null || changes.direction != null) && a.about.laidIn === 'touches') throw Error(`${who}: it is laid in touches, not lanes; its brush and direction cannot be changed (change its colour or strength, leave it out, or add a passage of your own)`);
      return { type: 'keep', wash: a.wash, at: a.at, group, autoSession: a.session, changes, lay: changes.lay ?? a.lay };
    }
    if (e.merge != null) {
      const who = `${at}, merge of ${Array.isArray(e.merge) ? e.merge.join(' ') : e.merge}`;
      if (!Array.isArray(e.merge) || e.merge.length < 2) throw Error(`${who}: "merge" lists two or more washes by number`);
      const members = e.merge.map(n => take(n, who)), changes = fields(e, who, null);
      return { type: 'merge', washes: members.map(a => a.wash), group, changes, lay: changes.lay ?? (members[0].lay === 'beside damp' ? 'wet on dry' : members[0].lay) };
    }
    const p = e.own, who = `${at}, own passage ${p?.id ?? i + 1}`;
    if (typeof p !== 'object' || Array.isArray(p)) throw Error(`${who}: "own" is one passage, written as own-script-brief.md describes, with "colour" in place of "paint"`);
    if (typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(p.id) || ownIds.has(p.id)) throw Error(`${who}: needs an "id" of its own (letters and digits)`);
    ownIds.add(p.id);
    // an erase of your own: the pencil rubbed out where it passes, on the sheet as the washes before it leave it
    if (p.kind === 'erase') { checkErase(p, who); return { type: 'own', id: p.id, passage: p, erase: true, group, lay: 'erase' }; }
    if (!colourOk(p.colour)) throw Error(`${who}: "colour" is [red, green, blue]: what the place is to read as once the passage is down (the mix is made for you, over what is under it)`);
    if (p.brushMm != null && !kit.includes(Number(p.brushMm))) throw Error(`${who}: "brushMm" ${p.brushMm} is not a brush of the kit (${kit.join(', ')} mm)`);
    if (p.brushMm == null && p.kind !== 'wash') throw Error(`${who}: a ${p.kind} passage names its "brushMm"`);
    if (p.charges?.length) throw Error(`${who}: charges are not read in an edited plan; add another passage with "lay": "wet on wet"`);
    if (p.shapes || p.reserve) throw Error(`${who}: write its region in millimetres`);
    const lay = e.lay ?? p.lay ?? 'wet on dry'; if (!LAYS.includes(lay)) throw Error(`${who}: "lay" is one of ${LAYS.map(l => `"${l}"`).join(', ')}`);
    try { checkScript(ownScript(p, { sheet: listing.sheet, brushesMm: kit, key: 'x' }), { keys: ['x'], sheetWidthMm: listing.sheet.widthMm }); } catch (err) { throw Error(`${who}: ${err.message.replace(/^painting script(, passage [^:]*)?: /, '')}`); }
    return { type: 'own', id: p.id, passage: p, colour: p.colour.map(Number), group, lay };
  }
  const entries = checked.filter(Boolean);
  // a wash laid beside a damp neighbour needs that neighbour: the entry before it, in the same session
  entries.forEach((e, i) => {
    if (e.lay !== 'beside damp' || (i > 0 && entries[i - 1].group === e.group)) return;
    if (e.type === 'keep' && e.changes.lay == null) { e.lay = 'wet on dry'; e.changes.lay = 'wet on dry'; notes.push(`wash ${e.wash} was laid beside a damp neighbour that is no longer just before it in its session: it is laid on the dry sheet`); return; }
    faults.push(`${at}, ${e.type === 'keep' ? `wash ${e.wash}` : e.type === 'merge' ? `merge of ${e.washes.join(' ')}` : `own passage ${e.id}`}: "beside damp" needs the entry just before it in the same "session"; give both the same "session", or lay it "wet on dry" or "wet on wet"`);
  });
  if (faults.length) throw allFaults(faults);
  // moved: kept washes outside the longest run that is still in the planner's order
  const kept = entries.filter(e => e.type === 'keep'), tails = [], prev = new Array(kept.length).fill(-1), endAt = [];
  kept.forEach((e, i) => { let lo = 0, hi = tails.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < e.at) lo = mid + 1; else hi = mid; } tails[lo] = e.at; endAt[lo] = i; prev[i] = lo ? endAt[lo - 1] : -1; });
  const still = new Set(); for (let i = endAt[tails.length - 1] ?? -1; i >= 0; i = prev[i]) still.add(i);
  kept.forEach((e, i) => { e.moved = !still.has(i); });
  const changed = kept.filter(e => Object.keys(e.changes).length).length, moved = kept.filter(e => e.moved).length, untouched = kept.filter(e => !e.moved && !Object.keys(e.changes).length).length;
  const merges = entries.filter(e => e.type === 'merge'), mergedFrom = merges.reduce((a, e) => a + e.washes.length, 0), added = entries.filter(e => e.type === 'own').length, n = listing.washes.length;
  // the sessions are as the planner's when every session holds exactly one planner session's washes, whole and in order
  const groups = new Map(); for (const e of entries) { if (!groups.has(e.group)) groups.set(e.group, []); groups.get(e.group).push(e); }
  const bySession = new Map(); for (const x of listing.washes) { if (!bySession.has(x.session)) bySession.set(x.session, []); bySession.get(x.session).push(x.wash); }
  const sessionsKept = [...groups.values()].every(g => g.every(e => e.type === 'keep') && same(g.map(e => e.wash), bySession.get(g[0].autoSession)));
  const dropped = n - kept.length - mergedFrom;
  const record = { auto: n, kept: kept.length, untouched, changed, moved, merged: merges.length, mergedFrom, dropped, added, untouchedShare: +(untouched / n).toFixed(4),
    unchanged: untouched === n && !added && sessionsKept, sessionsKept, fields: Object.fromEntries(FIELDS.map(f => [f, kept.filter(e => e.changes[f] != null).length]).filter(([, c]) => c)), notes };
  return { entries, record };
}

/** One line for a record, as the planner's answer and the run say it. */
export function editLine(r) {
  if (r.unchanged) return `the code planner's plan, unchanged (${r.auto} washes)`;
  return `of the code planner's ${r.auto} washes ${r.untouched} are untouched (${Math.round(100 * r.untouchedShare)}%), ${r.changed} changed${Object.keys(r.fields ?? {}).length ? ` (${Object.entries(r.fields).map(([k, c]) => `${k} ${c}`).join(', ')})` : ''}, ${r.moved} moved, ${r.mergedFrom} merged into ${r.merged}, ${r.dropped} left out; ${r.added} passages of your own added`;
}

/**
 * The plan with an edit applied. `ctx`: {w, h, k, pigments, paperRGB, sheetWidthMm, kitMm, mono, seed}. Returns
 * {plan, record}. An edit that changes nothing returns the plan it was given, the same object; in any other, every
 * wash without a change is the planner's own shape object, and every session kept whole is the planner's own layer.
 */
export function applyPlanEdit(plan, edit, { w, h, k, pigments, paperRGB = null, sheetWidthMm, kitMm, mono = null, seed = 0 }) {
  const listing = planListing(plan, { w, h, sheetWidthMm, kitMm }), { entries, record } = checkPlanEdit(edit, listing);
  if (record.unchanged) return { plan, record };
  const n = w * h, cellMm = sheetWidthMm / w, paperCol = paperRGB ?? [252, 251, 248];
  const all = washesOf(plan), byNum = new Map(listing.washes.map((x, i) => [x.wash, all[i]])), instructionOf = new Map(plan.instructions.map(q => [q.id, q]));
  const mixes = plan.mixes.map(m => ({ ...m })), laid = Array.from({ length: k }, () => new Float32Array(n));
  const cellsOf = sh => { const out = [], b = sh.box, f = sh.ids; if (f && b) { for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (f[y * w + x] === sh.id) out.push(y * w + x); } else { const m = sh.mask; for (let i = 0; i < n; i++) if (m[i]) out.push(i); } return out; };
  const lay = sh => { for (const i of cellsOf(sh)) for (let j = 0; j < k; j++) laid[j][i] += sh.mix[j]; };
  const under = cells => { const u = new Array(k).fill(0); for (const i of cells) for (let j = 0; j < k; j++) u[j] += laid[j][i] / cells.length; return u; };
  // what is laid so far, entry by entry, to name the washes under a place when a colour cannot be laid over them
  const placed = [], faults = [], notes = [], valueRef = valueRefOf(paperCol), within = Number(edit.nearestWithin ?? NEAREST_WITHIN_L), monoOf = mono?.mono ? mono : null;
  const underWho = cells => {
    const at = new Set(cells), found = [];
    for (const { label, sh } of placed) { let c = 0; for (const i of cellsOf(sh)) if (at.has(i)) c++; if (c >= 0.1 * cells.length) found.push([label, c]); }
    return found.sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, c]) => `${label} over ${Math.round(100 * c / cells.length)}% of it`).join(', ');
  };
  /**
   * The mix that brings these cells to a colour over what is laid there. Watercolour only darkens: a colour lighter
   * than what is under it by no more than `within` (L*) is laid as the nearest that can be (a faint wash of the colour's
   * own paints) with a note; lighter than that is a fault that says what would be accepted. Null: nothing can be laid.
   */
  const toColour = (colour, cells, who) => {
    const u = under(cells), mix = valueMix(colour, u, { pigments, paperCol, mono: monoOf });
    if (mix.reduce((a, v) => a + v, 0) > 1e-6) return mix;
    const Lu = filmLab(u, pigments, paperCol)[0], La = labOf(colour, 0, valueRef)[0], lighter = La - Lu, [, a, b] = labOf(colour, 0, valueRef);
    const darkest = labToRgb([Math.max(0, Lu - NEAREST_STEP_L), a, b], valueRef).map(v => Math.max(0, Math.min(255, Math.round(v)))), below = underWho(cells);
    const own = mixFor(colour, pigments, paperCol), t = own.reduce((x, v) => x + v, 0);
    if (!(t > 1e-9)) { notes.push(`${who}: the colour asked for is the paper's; over what is laid there (L* ${Lu.toFixed(0)}) nothing can be laid, so it is left out`); return null; }
    const nearest = valueMix(darkest, u, { pigments, paperCol, mono: monoOf, given: own.map(v => v / t) });
    // paint cannot lighten what is under it: the wash is laid all the same, as the nearest that can be, and the author is told
    // (a colour far lighter than its ground is a mistake the author may make; it shows on the sheet as a faint wash that lightens nothing)
    notes.push(`${lighter > within ? 'WARNING, ' : ''}${who}: the colour asked for, [${colour.map(Math.round).join(', ')}] (L* ${La.toFixed(0)}), is ${lighter > within ? `${lighter.toFixed(0)} L* lighter than` : 'no darker than'} what is laid under it (L* ${Lu.toFixed(0)}${below ? `: ${below}` : ''}). Watercolour only darkens, so it is laid as the nearest that can be: a faint wash of your colour (about [${darkest.join(', ')}]) that will not lighten the place${lighter > within ? '. To make the place lighter, pale or leave out what is under it' : ''}`);
    return nearest;
  };
  // a wash laid again over its outline: in lanes of one brush along the part's own length, or along a direction given
  const relaidWith = (loops, brushMm, direction, key) => {
    if (direction != null) return sweeps(loops.map(l => l.points), { widthMm: brushMm, deg: direction, lights: [], rng: handOf(`plan-edit/${seed}/${key}`) });
    return laneFill(loops, { kitMm: [brushMm], growMm: GROW_MM }).strokes;
  };
  // (a brush too wide to lay a stroke in the wash: the widest smaller brush of the kit that does, with a note)
  const relaid = (loops, brushMm, direction, key) => {
    for (const mm of [brushMm, ...listing.brushesMm.filter(v => v < brushMm)]) { const strokes = relaidWith(loops, mm, direction, key); if (strokes.length) { if (mm !== brushMm) notes.push(`${key}: a ${brushMm} mm brush lays no stroke in it; laid with the ${mm} mm brush`); return strokes; } }
    throw fault(`${key}: no brush of the kit lays a stroke in it over these cells; leave its brush and direction as they are`);
  };
  const how = (q, move, strokes, who) => {
    // (strokes too small for a bed of water: the wash stays on the dry sheet, with a note)
    if (move === 'wet on wet') { const fit = strokes.filter(st => Math.PI * st.radiusMm ** 2 / (cellMm * cellMm) >= WET_LEAST_CELLS); if (fit.length) strokes = fit; else { move = 'wet on dry'; notes.push(`${who}: its strokes are too small to be laid into water; it is laid on the dry sheet`); } }
    const wet = move !== 'wet on dry';
    return { move, strokes, paperBefore: wet ? 'wet: the wash or its neighbour just laid' : 'fully dry; own same-passage wet overlap allowed', baseBefore: wet ? 'wet' : 'fully dry', load: { ...q.load, water: move === 'wet on wet' ? 0.88 : 0.62 },
      edges: { ...q.edges, policy: move === 'wet on wet' ? 'soft: dropped into a wet wash' : move === 'beside damp' ? 'soft: laid against a neighbour still damp' : 'hard: the edge is where the strokes end' } };
  };
  // a new shape of the plan: its cells, its mix, and the planner's intent of the wash it comes from with what changed
  const shape = (ids, id, box, area, mix, like, q, edited) => {
    const strength = mix.reduce((a, v) => a + v, 0), mixId = mixes.length; mixes.push({ mix: mix.map(v => v / strength), strength, stage: q.stage });
    const sh = passage(ids, id, box, strength, area, w);
    Object.assign(sh, { mix: [...mix], graded: null, _follow: like?._follow ?? true, firstWash: like?.firstWash ?? q.stage <= 2, _opening: like?._opening ?? 1, dryAfter: like?.dryAfter ?? true });
    sh._valuePlan = { ...q, id: `${q.phase}/s${q.stage}/m${mixId}/edit`, mixId, widestBrushMm: Math.max(...q.strokes.map(st => 2 * st.radiusMm)), edited };
    sh._valuePlan.brush = { ...q.brush, widthMm: sh._valuePlan.widestBrushMm };
    return sh;
  };
  const changedWash = (e) => {
    const { sh } = byNum.get(e.wash), q = sh._valuePlan, c = e.changes, who = `wash ${e.wash}`, cells = cellsOf(sh);
    let mix = c.colour ? toColour(c.colour, cells, who) : [...sh.mix]; if (!mix) return null; if (c.strength) mix = mix.map(v => v * c.strength);
    let strokes = q.strokes; if (c.brushMm != null || c.direction != null) strokes = relaid(q.outline, c.brushMm ?? q.widestBrushMm, c.direction ?? null, who);
    const h2 = c.lay || strokes !== q.strokes ? how(q, e.lay, strokes, who) : { strokes };
    return shape(sh.ids ?? sh.mask, sh.ids ? sh.id : 1, sh.box ?? boxOf(sh.mask), sh.area, mix, sh, { ...q, ...h2, colour: c.colour ?? q.colour }, { of: [e.wash], changed: Object.keys(c) });
  };
  const boxOf = m => { const box = { x0: w, y0: h, x1: -1, y1: -1 }; for (let i = 0; i < n; i++) if (m[i]) { const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; } return box; };
  const mergedWash = e => {
    const members = e.washes.map(v => byNum.get(v).sh), who = `merge of ${e.washes.join(' ')}`, c = e.changes, own = new Uint8Array(n);
    for (const sh of members) for (const i of cellsOf(sh)) own[i] = 1;
    // gaps between the pieces are closed; the pieces' own cells always stay
    const m = roundMask(own, w, h, Math.max(1, Math.round(MERGE_CLOSE_MM / 2 / cellMm))); for (let i = 0; i < n; i++) if (own[i]) m[i] = 1;
    const cc = components(m, w, h, 4), parts = [];
    for (let id = 1; id <= cc.count; id++) { const box = { x0: w, y0: h, x1: -1, y1: -1 }; for (let i = 0; i < n; i++) if (cc.labels[i] === id) { const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; } const l = outlineLoops(cc.labels, id, box, w, h, { cellMm, tolMm: TOL_MM }); if (l.length) parts.push(l); }
    if (!parts.length) throw fault(`${who}: the washes hold no cells`);
    const top = l => Math.min(...l.flatMap(o => o.points.map(p => p[1]))); parts.sort((a, b) => top(a) - top(b));
    const loops = parts.flat(), cells = []; for (let i = 0; i < n; i++) if (m[i]) cells.push(i);
    const brushMm = c.brushMm ?? Math.max(...members.map(sh => sh._valuePlan.widestBrushMm));
    const strokes0 = c.direction != null ? relaid(loops, brushMm, c.direction, who) : relaid(loops, brushMm, null, who);
    // the same paint in one wash (the members' paint over the joined cells), or the colour asked for over what is under
    let mix = c.colour ? toColour(c.colour, cells, who) : members[0].mix.map((_, j) => members.reduce((a, sh) => a + sh.mix[j] * sh.area, 0) / cells.length);
    if (!mix) return null; if (c.strength) mix = mix.map(v => v * c.strength);
    const q0 = members[0]._valuePlan, total = members.reduce((a, sh) => a + sh.area, 0), colour = c.colour ?? [0, 1, 2].map(ch => Math.round(members.reduce((a, sh) => a + (sh._valuePlan.colour?.[ch] ?? 0) * sh.area, 0) / total));
    const big = members.reduce((a, sh) => (sh.area > a.area ? sh : a), members[0]);
    const q = { ...q0, ...how(q0, e.lay, strokes0, who), colour, thing: `washes ${e.washes.join(' ')} of the code planner's plan, merged into one`, areaMm2: +(cells.length * cellMm * cellMm).toFixed(1), outline: loops, softEdges: [], depthMm: 0, uncoveredShare: 0, ...(big._valuePlan.forms ? { forms: big._valuePlan.forms } : {}) };
    const ids = Uint8Array.from(m);
    return shape(ids, 1, boxOf(ids), cells.length, mix, members[0], q, { of: e.washes, changed: ['merged', ...Object.keys(c)] });
  };
  const ownWashes = e => {
    // (the stand-in paint only places the strokes; the mix is made below, for the colour)
    const keyed = pigments.map((p, j) => ({ ...p, key: p.key ?? `p${j}` }));
    const sub = planScriptWashes({ script: ownScript(e.passage, { sheet: listing.sheet, brushesMm: listing.brushesMm, key: keyed[0].key }), k, w, h, pigments: keyed, paperRGB, sheetWidthMm, seed }), who = `own passage ${e.id}`;
    const made = sub.layers.flatMap(l => l.shapes); if (!made.length) throw fault(`${who}: none of its strokes touches the sheet (${listing.sheet.widthMm} by ${listing.sheet.heightMm} mm); check its region`);
    const cells = [...new Set(made.flatMap(cellsOf))], mix = toColour(e.colour, cells, who);
    if (!mix) return { value: sub.layers[0].value, order: sub.layers[0]._order, shapes: [] };
    return { value: sub.layers[0].value, order: sub.layers[0]._order, shapes: made.map(sh => { const q = sh._valuePlan; return shape(sh.ids, sh.id, sh.box, sh.area, mix, sh, { ...q, ...how(q, e.lay, q.strokes, who), colour: e.colour, phase: q.phase }, { of: [], changed: ['own'] }); }) };
  };

  // the entries in order, session by session; what is laid so far is kept for the washes whose colour is asked for
  const layerOfShape = new Map(all.map(x => [x.sh, x.layer])), layers = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    const whole = cur.from && cur.shapes.length === cur.from.shapes.length && cur.shapes.every((sh, i) => sh === cur.from.shapes[i]);
    if (whole) layers.push(cur.from);
    else { const area = cur.shapes.reduce((a, s) => a + s.area, 0), mix = new Array(k).fill(0); for (const s of cur.shapes) s.mix.forEach((v, j) => { mix[j] += v * s.area / area; }); const t = mix.reduce((a, v) => a + v, 0) || 1;
      layers.push({ value: cur.value, pigment: mix.indexOf(Math.max(...mix)), mixId: cur.shapes[0]._valuePlan.mixId, shapes: cur.shapes, mix: mix.map(v => v / t), amount: cur.shapes.reduce((a, s) => a + s.amount * s.area, 0) / area, area, _order: { ...cur.order }, _valuePhase: cur.shapes[0]._valuePlan.phase }); }
    cur = null;
  };
  let group = null;
  for (const [ei, e] of entries.entries()) {
    if (e.erase) {
      close(); group = null;
      const strokes = eraseStrokes(e.passage, seed), ids = footprint(strokes, w, h, cellMm); let cells = 0, painted = 0;
      for (let i = 0; i < n; i++) if (ids[i]) { cells++; if (laid.some(L => L[i] > 0)) painted++; }
      const stage = Math.max(1, Math.min(5, Math.round(e.passage.stage ?? 2))), prior = entries[ei - 1];
      const made = eraseLayer(e.passage, strokes, { stage, overPaint: cells ? painted / cells : 0, afterWet: prior != null && !prior.erase, areaMm2: cells * cellMm * cellMm });
      if (made.instruction.erase.warning) notes.push(made.instruction.erase.warning);
      layers.push(made.layer); continue;
    }
    if (e.group !== group) { close(); group = e.group; }
    // a wash that cannot be laid as asked is a fault, kept with the rest; the planner's own wash stands in for it so
    // that the washes after it are checked over what would really be under them
    let shapes, like, value = null, order = null;
    const label = e.type === 'keep' ? `wash ${e.wash}` : e.type === 'merge' ? `the merge of ${e.washes.join(' ')}` : `your passage ${e.id}`;
    try {
      if (e.type === 'keep') { const o = byNum.get(e.wash); like = o.layer; shapes = [Object.keys(e.changes).length ? changedWash(e) : o.sh]; }
      else if (e.type === 'merge') { like = byNum.get(e.washes[0]).layer; shapes = [mergedWash(e)]; }
      else { const o = ownWashes(e); shapes = o.shapes; value = o.value; order = o.order; }
    } catch (err) {
      if (!err.planEditFault && e.type !== 'own') throw err;
      faults.push(err.planEditFault ? err.message : `own passage ${e.id}: ${err.message.replace(/^painting script(, passage [^:]*)?: /, '')}`);
      shapes = e.type === 'keep' ? [byNum.get(e.wash).sh] : e.type === 'merge' ? e.washes.map(v => byNum.get(v).sh) : []; like = e.type === 'own' ? null : byNum.get(e.type === 'keep' ? e.wash : e.washes[0]).layer;
    }
    shapes = shapes.filter(Boolean); if (!shapes.length) continue;
    if (!cur) cur = { shapes: [], from: e.type === 'keep' ? layerOfShape.get(byNum.get(e.wash).sh) : null, value: value ?? like.value, order: order ?? like._order };
    cur.shapes.push(...shapes);
    for (const sh of shapes) { lay(sh); placed.push({ label, sh }); }
  }
  if (faults.length) throw allFaults(faults);
  close();
  record.notes.push(...notes); record.nearest = notes.filter(x => /nearest that can be/.test(x)).length;
  if (!layers.length) throw allFaults(['nothing is left to lay: every wash was left out']);
  const instructions = layers.flatMap(l => (l._erase ? [l._erase.instruction] : l.shapes.map(sh => instructionOf.get(sh._valuePlan.id) ?? { ...sh._valuePlan, area: sh.area, plannedPigmentMass: sh.amount * sh.area })));
  const byStage = [0, 0, 0, 0]; for (const q of instructions) if (q.kind !== 'erase') byStage[Math.min(4, Math.max(1, q.stage)) - 1]++;
  const summary = { ...plan.summary, source: 'study, edited', washes: instructions.filter(q => q.stage !== 2 && q.kind !== 'erase').length, erases: instructions.filter(q => q.kind === 'erase').length, washesByStage: byStage, stages: byStage.filter(Boolean).length, mixes: mixes.length, plannedStrokes: instructions.reduce((a, q) => a + (q.strokes?.length ?? 0), 0), edit: record };
  return { plan: { ...plan, layers, instructions, mixes, summary, geometry: `${plan.geometry} Edited by an author: ${editLine(record)}.` }, record };
}
