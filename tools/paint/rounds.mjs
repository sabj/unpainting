// Fixed rounds: one level of one picture as a short conversation with no shell and no tools (the V4/V5 shape on the
// 0.4 painter: plan, paint, look, revise, final). Round 0: the brief, the pictures and the level's data go out; the
// model answers with its painting script. Each later round: the harness paints a look and sends back the SHEET ONLY
// (never a picture that holds the original or a study, never a number measured against them); the model answers with
// CHANGES to its script (edits; a whole new script stays allowed), asks for its next look (whole, stopped at a
// stage, or a region) or says it is done. Then the full-size final with its film (cli.mjs paints it).
// A script that does not compile is returned once, free, for a corrected answer; a second failure ends the try when
// there is no script yet, and otherwise keeps the last script that compiled. Looks are charged as in the open
// session (look-cost.mjs: 0.3 a whole half-size look, a stage or a region its share, never under 0.05; budget 3.0).
// Everything else is measured, never limited: seconds, tokens (fresh, cached, output) and look units a round.
// Pure but for the calls it is handed (ask, check, compile, look): nothing is read, written or started here.
import crypto from 'node:crypto';
import { lookCost, regionBox, scriptInRegion, LEAST_LOOK_COST, DEFAULT_LOOK_UNITS } from './look-cost.mjs';

/** The most turns of one level's conversation: a runaway guard only (ten whole looks and their corrections fit twice). */
export const ROUNDS_MOST = 40;
/** The edit operations a reply may hold, in the order they are documented (ROUNDS-BRIEF.md). */
export const EDIT_OPS = Object.freeze(['add', 'remove', 'replace', 'move', 'set', 'drawing']);
const DRAWING_KEYS = ['medium', 'ink', 'lines'];
const copy = v => JSON.parse(JSON.stringify(v));
const round2 = v => +v.toFixed(2);

/** The fingerprint of what would be painted: the script and the drawing choice beside it. Twelve hex characters. */
export function stateHash(state) {
  return crypto.createHash('sha256').update(JSON.stringify([state.script, state.drawing ?? null])).digest('hex').slice(0, 12);
}

/** The first JSON object in a reply that has one of `keys` (a model may wrap its answer in words or a code fence). */
function jsonWithAny(text, keys) {
  const end = text.lastIndexOf('}'); let tries = 0;
  for (let i = text.indexOf('{'); i >= 0 && i < end && tries < 300; i = text.indexOf('{', i + 1), tries++) {
    try { const v = JSON.parse(text.slice(i, end + 1)); if (v && typeof v === 'object' && !Array.isArray(v) && keys.some(k => k in v)) return v; } catch { /* not this brace */ }
  }
  return null;
}

/**
 * A reply read: {script (a whole script, or null), drawing (beside a whole script, or null), edits ([..] or null),
 * look ({until, region} or null: no look asked), done (true: paint the final now), words}. Throws, said so its
 * author can correct it, when the reply holds none of them.
 */
export function readReply(text) {
  const obj = jsonWithAny(String(text ?? ''), ['passages', 'script', 'edits', 'done', 'look']);
  if (!obj) throw new Error('the answer holds no JSON object with "passages" (a whole script), "edits", "look" or "done"');
  const whole = Array.isArray(obj.passages) ? obj : obj.script && Array.isArray(obj.script.passages) ? obj.script : null;
  if (obj.edits != null && !Array.isArray(obj.edits)) throw new Error('"edits" is a list of edit operations');
  if (whole && obj.edits?.length) throw new Error('an answer holds a whole script or "edits" to the present one, not both');
  let look = null;
  if (obj.look != null && obj.look !== false && obj.look !== 'none') {
    const l = obj.look === true || obj.look === 'whole' ? {} : obj.look;
    if (typeof l !== 'object' || Array.isArray(l)) throw new Error('"look" is "whole", {"until": STAGE}, {"region": [x0, y0, x1, y1]} or {"region": "FORM NAME"}');
    if (l.until != null && !(Number.isInteger(l.until) && l.until >= 1 && l.until <= 9)) throw new Error('"look": "until" is the number of a stage of your script (1 the first washes)');
    if (l.region != null && !(typeof l.region === 'string' || (Array.isArray(l.region) && l.region.length === 4 && l.region.every(Number.isFinite)))) throw new Error('"look": "region" is a box in millimetres [x0, y0, x1, y1] or the name of a form');
    look = { until: l.until ?? null, region: l.region ?? null };
  }
  let drawing = null;
  if (whole) { const d = Object.fromEntries(DRAWING_KEYS.filter(k => obj[k] != null && k !== 'lines' ? true : k === 'lines' && obj.lines && typeof obj.lines === 'object').map(k => [k, obj[k]])); if (Object.keys(d).length) drawing = d; }
  let script = whole;
  if (whole === obj) { script = { ...obj }; for (const k of ['edits', 'look', 'done', 'medium', 'ink', 'lines', 'words']) delete script[k]; }
  return { script, drawing, edits: obj.edits?.length ? obj.edits : null, look, done: obj.done === true, words: typeof obj.words === 'string' ? obj.words.slice(0, 2000) : null };
}

function at(passages, id, op) {
  const i = passages.findIndex(p => p.id === id);
  if (i < 0) throw new Error(`edit ${op}: there is no passage "${id}" (the passages: ${passages.map(p => p.id).join(', ')})`);
  return i;
}
function place(passages, passage, e, op) {
  if (e.after != null && e.before != null) throw new Error(`edit ${op}: "after" or "before", not both`);
  const i = e.after != null ? at(passages, e.after, op) + 1 : e.before != null ? at(passages, e.before, op) : passages.length;
  passages.splice(i, 0, passage);
}
/** A value set, or removed with null, at a dotted path of an object ("paint.pigments.sienna", "strokes.2.points"). */
function setPath(root, path, value, op) {
  const keys = String(path).split('.'); let o = root;
  for (const k of keys.slice(0, -1)) {
    if (o[k] == null) o[k] = {};
    if (typeof o[k] !== 'object') throw new Error(`edit ${op}: "${path}" passes through "${k}", which is not an object or a list`);
    o = o[k];
  }
  const last = keys.at(-1);
  if (value === null) { if (Array.isArray(o)) o.splice(Number(last), 1); else delete o[last]; } else o[last] = value;
}

/**
 * Edits applied, in order, to a state {script, drawing}: a new state and what each edit did. The whole list is applied
 * or none of it: the first edit that cannot be applied throws, naming itself.
 *   {op: "add", passage: {...}, after|before: ID}        a new passage (at the end when no place is named)
 *   {op: "remove", id}                                    a passage out
 *   {op: "replace", id, passage: {...}}                   a passage written again, in its place
 *   {op: "move", id, after|before: ID}                    the order changed
 *   {op: "set", id | ids: [..] | ids: "*", path, value}   one field of a passage, or of several at once ("paint.dilution", "brush", "region",
 *                                                          "handling.direction"); null removes it. Without id: a field
 *                                                          of the script itself ("palette", "brushes.r8", "lights")
 *   {op: "drawing", medium, ink, lines}                   the drawing beside the script: its medium, the pen's ink,
 *                                                          the choice of prepared lines and lines of its own
 */
export function applyEdits(state, edits) {
  const next = { script: copy(state.script), drawing: state.drawing ? copy(state.drawing) : null }, did = [];
  const P = next.script.passages;
  for (const [n, e] of edits.entries()) {
    const op = e?.op, where = `${n + 1} (${op})`;
    if (!EDIT_OPS.includes(op)) throw new Error(`edit ${n + 1}: "op" is one of ${EDIT_OPS.join(', ')}, not ${JSON.stringify(op)}`);
    if (op === 'add' || op === 'replace') {
      if (!e.passage || typeof e.passage !== 'object' || typeof e.passage.id !== 'string') throw new Error(`edit ${where}: "passage" is a whole passage with its "id"`);
    }
    if (op === 'add') {
      if (P.some(p => p.id === e.passage.id)) throw new Error(`edit ${where}: there is already a passage "${e.passage.id}"; use replace`);
      place(P, copy(e.passage), e, where); did.push(`added ${e.passage.id}`);
    } else if (op === 'remove') { P.splice(at(P, e.id, where), 1); did.push(`removed ${e.id}`);
    } else if (op === 'replace') {
      const i = at(P, e.id ?? e.passage.id, where);
      if (e.passage.id !== P[i].id && P.some(p => p.id === e.passage.id)) throw new Error(`edit ${where}: there is already a passage "${e.passage.id}"`);
      P[i] = copy(e.passage); did.push(`replaced ${e.id ?? e.passage.id}`);
    } else if (op === 'move') {
      if (e.after == null && e.before == null) throw new Error(`edit ${where}: say where, "after" or "before" a passage`);
      const [p] = P.splice(at(P, e.id, where), 1); place(P, p, e, where); did.push(`moved ${e.id}`);
    } else if (op === 'set') {
      if (typeof e.path !== 'string' || !e.path || !('value' in e)) throw new Error(`edit ${where}: "path" (a field, dotted) and "value" (null removes the field)`);
      // several passages at once (a bulk retune): "ids": [..], or "ids": "*" for every passage that has the field's parent
      const many = e.ids === '*' ? P.map(p => p.id) : Array.isArray(e.ids) ? e.ids : e.id != null ? [e.id] : null;
      if (many) { if (e.path === 'id') throw new Error(`edit ${where}: a passage keeps its id; replace it to rename it`); for (const id of many) setPath(P[at(P, id, where)], e.path, copy(e.value), where); did.push(`set ${many.length === 1 ? many[0] : `${many.length} passages`}.${e.path}`); }
      else { if (/^(passages|format|sheet|subject)\b/.test(e.path)) throw new Error(`edit ${where}: "${e.path}" is not set this way (passages have their own edits; the sheet and the format are fixed)`); setPath(next.script, e.path, copy(e.value), where); did.push(`set ${e.path}`); }
    } else {
      const d = { ...(next.drawing ?? {}) };
      for (const k of DRAWING_KEYS) if (k in e) { if (e[k] === null) delete d[k]; else d[k] = copy(e[k]); }
      next.drawing = Object.keys(d).length ? d : null; did.push(`drawing: ${DRAWING_KEYS.filter(k => k in e).join(', ') || 'nothing'}`);
    }
  }
  return { state: next, did };
}

/** How much of the script a reply changed: {passages, touched (ids added, removed, replaced, moved or set), share}. */
export function changeOf(before, after) {
  const a = new Map((before?.script.passages ?? []).map((p, i) => [p.id, JSON.stringify([i, p])])), b = new Map(after.script.passages.map((p, i) => [p.id, JSON.stringify([i, p])]));
  const touched = [...new Set([...a.keys(), ...b.keys()])].filter(id => a.get(id) !== b.get(id));
  return { passages: b.size, touched: touched.length, share: round2(touched.length / Math.max(1, new Set([...a.keys(), ...b.keys()]).size)) };
}

/** What the model is told of the terms each round: the budget left and what a look costs. */
function budgetLine(left, rows) {
  if (left < LEAST_LOOK_COST) return `Your look budget is used up (${left} units left, the least look costs ${LEAST_LOOK_COST}).`;
  const c = lookCost(rows);
  return `Look budget: ${left} units left. A look of the whole script costs ${c.cost}${c.stages.length > 1 ? `; stopped after a stage, its share (${c.stages.slice(0, -1).map(s => `until ${s.stage}: ${s.cost}`).join(', ')})` : ''}; a region, the share of the passages that touch it; never under ${LEAST_LOOK_COST}.`;
}

const ANSWER = `Answer with ONE JSON object and nothing else: {"edits": [...], "look": "whole" | {"until": STAGE} | {"region": [x0, y0, x1, y1]} | {"region": "FORM NAME"}} to change your script and see it again; {"edits": [...], "done": true} (or {"done": true}) to have it painted at full size as your painting; send your last edits and "done": true together, in one answer. "edits" changes the present script (add, remove, replace, move, set, drawing); a whole new script in place of "edits" is allowed and is the exception.`;

/**
 * One level's rounds. `first`: {text, images} of round 0. The calls it is handed:
 *   ask({text, images, round}) -> {ok, text, error, seconds, tokens: {fresh, cached, output} | null, costUSD}
 *   check(state) -> the script as the painter will read it (throws with the reason)
 *   compile(state, checked, n) -> {ok, error, rows, text (the plan in numbers: the sheet's own, nothing against the subject), warnings}
 *   look(state, checked, compiled, {until, region: {box, name} | null}, n) -> {ok, error, images: [files], text, painted}
 * `sheet` {widthMm, heightMm} and `forms` [{name, boxMm}] place a region; `lookSize` 'half' | 'full' prices a look.
 * Returns {ended: 'done' | 'budget used' | 'no script' | 'model failed' | 'rounds guard', failure (when nothing can be
 * painted), state, checked, compiled, rounds: [..], looks: [..], lookUnits: {spent, budget}, tokens, seconds}.
 * Never throws for what a model did: that is a result.
 */
export async function runRounds({ first, ask, check, compile, look, sheet, forms = [], budget = DEFAULT_LOOK_UNITS, lookSize = 'half', roundsMost = ROUNDS_MOST, wallMinutes = null, now = Date.now, say = () => {} }) {
  const rounds = [], looks = [], seen = new Set();
  let state = null, checked = null, compiled = null, spent = 0, ended = null, failure = null, compiles = 0;
  const left = () => round2(budget - spent), deadline = wallMinutes != null ? now() + wallMinutes * 60000 : null;
  let send = { text: first.text, images: first.images ?? [] }, corrected = false;
  const accept = async candidate => {
    const c = await check(candidate); compiles++;
    const got = await compile(candidate, c, compiles);
    if (!got.ok) throw new Error(got.error);
    return { c, got };
  };
  for (let n = 0; n < roundsMost && !ended; n++) {
    const leftMin = deadline == null ? null : (deadline - now()) / 60000;
    if (leftMin != null && leftMin <= 0) { ended = 'wall clock'; say(`round ${n}: ${wallMinutes} min on the clock reached; ${state ? `script ${stateHash(state)} is painted` : 'nothing was painted'}`); if (!state) failure = `the ${wallMinutes}-minute clock ran out before any script compiled`; break; }
    const reply = await ask({ ...send, round: n, ...(leftMin != null ? { maxMinutes: Math.max(1, Math.ceil(leftMin)) } : {}) });
    const row = { round: n, sent: { text: send.text, images: send.images.map(f => String(f).split('/').slice(-3).join('/')) }, reply: reply.text ?? '', seconds: reply.seconds ?? null, tokens: reply.tokens ?? null, costUSD: reply.costUSD ?? null, lookUnits: 0, ok: Boolean(reply.ok), correction: corrected, continuedBy: reply.continuedBy ?? null, tokensTotal: reply.tokensTotal ?? null };
    rounds.push(row);
    if (!reply.ok) { row.error = reply.error; ended = 'model failed'; if (!state) failure = `the model gave no answer in round ${n}: ${reply.error}`; break; }
    let asked = null, candidate = null, why = null;
    try {
      asked = readReply(reply.text);
      if (!state && !asked.script) throw new Error('there is no script yet: answer with your whole painting script (a JSON object with "passages")');
      if (asked.script) candidate = { script: asked.script, drawing: asked.drawing ?? (state?.drawing ?? null) }, row.kind = state ? 'rewrite' : 'script';
      else if (asked.edits) { const done = applyEdits(state, asked.edits); candidate = done.state; row.kind = 'edits'; row.edits = done.did; }
      else row.kind = asked.done ? 'done' : 'look';
      if (candidate) {
        const { c, got } = await accept(candidate);
        row.change = changeOf(state, candidate);
        state = candidate; checked = c; compiled = got;
      }
    } catch (e) { why = e.message; }
    row.hash = state ? stateHash(state) : null;
    if (why) {
      row.refused = why;
      // returned once, free, for a corrected answer; a second failure ends it
      if (corrected) { ended = state ? 'done' : 'no script'; row.ended = `a second answer in a row could not be used${state ? '; the last script that compiled is painted' : ''}`; if (!state) failure = `no script: two answers in a row could not be used. The last reason: ${why}`; break; }
      corrected = true;
      send = { images: [], text: `Your answer could not be used and nothing was changed${state ? ` (your script is still ${row.hash})` : ''}. The reason:\n${why}\n\nCorrect it and answer again${state ? '' : ' with your whole script'}. This correction is free; a second answer that cannot be used ends ${state ? 'the changes: your last script that compiled is then painted as your painting' : 'the try'}.` };
      say(`round ${n}: refused (${why.slice(0, 160)})`);
      continue;
    }
    corrected = false;
    if (asked.done) { ended = 'done'; say(`round ${n}: done, script ${row.hash}`); break; }
    // the look it asked for (a whole one when it named none), priced before it is painted
    const want = asked.look ?? { until: null, region: null };
    let region = null, note = '';
    try { region = regionBox(want.region, { sheet, forms }); } catch (e) { note = `${e.message}. `; }
    const inR = region ? scriptInRegion(checked, region.box) : null;
    if (region && !inR.kept) { note = `No passage of your script touches the region ${region.box.join(', ')} mm. `; region = null; }
    const price = lookCost(compiled.rows ?? [], { until: want.until, regionShare: region ? inR.kept / inR.of : null, size: lookSize }), key = `${row.hash}:${want.until ?? ''}:${region ? region.box.join(',') : ''}`;
    if (note) { send = { images: [], text: `${note}Nothing was painted and nothing charged. ${budgetLine(left(), compiled.rows ?? [])}\n\n${ANSWER}` }; continue; }
    if (left() < LEAST_LOOK_COST) { ended = 'budget used'; say(`round ${n}: the look budget is used (${left()} left); script ${row.hash} is painted`); break; }
    if (seen.has(key)) { send = { images: [], text: `You have already seen this look of this script (${row.hash}); nothing was painted and nothing charged. ${budgetLine(left(), compiled.rows ?? [])}\n\n${ANSWER}` }; continue; }
    if (price.cost > left() + 1e-9) { send = { images: [], text: `That look costs ${price.cost} units and you have ${left()} left; nothing was painted. ${budgetLine(left(), compiled.rows ?? [])} Ask for a smaller look (a stage or a region), or say you are done.\n\n${ANSWER}` }; continue; }
    const got = await look(state, checked, compiled, { until: want.until, region }, looks.length + 1);
    if (!got.ok) {
      // a painting that failed on this side costs no look; the model may ask again or stop
      row.lookFailed = got.error; send = { images: [], text: `NOT PAINTED: ${got.error}\nNothing was charged. ${budgetLine(left(), compiled.rows ?? [])}\n\n${ANSWER}` };
      if (looks.filter(l => l.failed).length >= 2) { ended = 'done'; row.ended = 'three looks in a row were not painted; the present script is painted'; break; }
      looks.push({ look: looks.length + 1, round: n, failed: got.error, cost: 0 }); continue;
    }
    spent = round2(spent + price.cost); seen.add(key); row.lookUnits = price.cost;
    looks.push({ look: looks.length + 1, round: n, hash: row.hash, cost: price.cost, size: lookSize, ask: { until: want.until, region: region ? { box: region.box, name: region.name } : null }, painted: got.painted ?? null });
    say(`round ${n}: ${row.kind}, script ${row.hash}; look ${looks.length} for ${price.cost} (${left()} left)`);
    send = { images: got.images ?? [], text: `LOOK ${looks.length} of your script ${row.hash}${want.until != null ? `, stopped after stage ${want.until}` : ''}${region ? `, the passages that touch ${region.name ?? region.box.join(', ')}` : ''}: the picture attached is your own sheet as it dried, on the millimetre grid. It cost ${price.cost} units.\n\n${got.text ?? ''}\n\n${budgetLine(left(), compiled.rows ?? [])}\n\n${ANSWER}` };
  }
  if (!ended) ended = 'rounds guard';
  const sum = k => (rounds.some(r => r.tokens?.[k] != null) ? rounds.reduce((a, r) => a + (r.tokens?.[k] ?? 0), 0) : null);
  return { ended, failure, state, checked, compiled, rounds, looks, lookUnits: { spent, budget }, compiles,
    // fresh input counts what was written to the provider's cache (cacheWrite, where the command says: it is priced apart)
    tokens: { fresh: sum('fresh'), cached: sum('cached'), output: sum('output'), ...(sum('cacheWrite') != null ? { cacheWrite: sum('cacheWrite') } : {}) }, seconds: rounds.reduce((a, r) => a + (r.seconds ?? 0), 0),
    costUSD: rounds.some(r => r.costUSD != null) ? +rounds.reduce((a, r) => a + (r.costUSD ?? 0), 0).toFixed(4) : null };
}

/** The share of a script's washes that reuse a supplied shape by number (level 4: recorded beside the result). */
export function shapeReuse(script) {
  const P = script?.passages ?? [], uses = p => Boolean(p.shapes?.length || p.reserve?.length || (p.strokes ?? []).some(s => s?.along != null));
  const n = P.filter(uses).length;
  return { passages: P.length, reuse: n, share: P.length ? round2(n / P.length) : 0 };
}

/** The transcript as text people can read: each round, what went out and what came back. */
export function transcriptText(result, { title }) {
  const out = [`# ${title}`, '', `Ended: ${result.ended}${result.failure ? ` (${result.failure})` : ''}. Look units ${result.lookUnits.spent} of ${result.lookUnits.budget}. Tokens: fresh ${result.tokens.fresh ?? 'not reported'}, cached ${result.tokens.cached ?? 'not reported'}, output ${result.tokens.output ?? 'not reported'}.`, ''];
  for (const r of result.rounds) {
    out.push(`## Round ${r.round}${r.correction ? ' (free correction)' : ''}: ${r.kind ?? 'no answer'}${r.hash ? `, script ${r.hash}` : ''}`, '',
      `Sent (${r.sent.images.length} pictures${r.sent.images.length ? `: ${r.sent.images.join(', ')}` : ''}):`, '', '```', r.sent.text.length > 3000 ? `${r.sent.text.slice(0, 1500)}\n[... ${r.sent.text.length - 3000} characters ...]\n${r.sent.text.slice(-1500)}` : r.sent.text, '```', '',
      `Reply (${r.seconds ?? '?'} s${r.tokens ? `; fresh ${r.tokens.fresh ?? '?'}, cached ${r.tokens.cached ?? '?'}, output ${r.tokens.output ?? '?'}` : ''}${r.lookUnits ? `; look ${r.lookUnits} units` : ''}):`, '', '```', r.reply.length > 6000 ? `${r.reply.slice(0, 3000)}\n[... ${r.reply.length - 6000} characters ...]\n${r.reply.slice(-3000)}` : r.reply, '```', '',
      ...(r.refused ? [`Refused: ${r.refused}`, ''] : []), ...(r.edits ? [`Edits: ${r.edits.join('; ')}`, ''] : []));
  }
  return out.join('\n');
}
