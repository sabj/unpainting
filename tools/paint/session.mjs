// A model author as a working session, not one reply. The model gets a folder of its own outside the repository (the
// locked inputs, the code planner's plan of the subject, the planner's settings, a README of its tools), a shell in
// that folder, and a budget of its own minutes. It may plan as often as it likes; LOOKING is counted and capped
// (bench/v4v5/README.md: looks are stepping back, not search). A look is a real painting of its present choice: the
// painter run small on the GPU through drying (look.mjs), shown as the dried sheet beside the source and the middle
// study, with the stages of the painting and each named form measured on the dried sheet. What it leaves in
// choice.json is painted (choice.mjs): the code planner tuned, its plan edited, or its own script; nothing changed
// is exactly the code planner.
//
// The model's commands are request files this module answers (./unpaint plan|look|status|wait): the planner itself
// runs here, outside the model's folder. The boundary: the folder holds the input pictures the code planner gets and
// the code planner's plan; a plan is PAINTED, RENDERED or MEASURED against the subject only by a counted look. So a
// free plan call answers with whether it compiled and its counts, nothing else; a look is painted, then written into
// a ledger outside the folder before anything of it is delivered (a painting that failed or left the GPU delivers
// nothing and is no look); the folder is never trusted (no symlink is followed, no request is echoed);
// and the model's shell cannot read the repository, the subject list, the caches or other sessions (seatbelt).
// What this cannot stop: a model drawing its own script's polygons with its own code. Its commands are kept.
import { travelLine } from './hand-travel.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readChoice, choiceKind, choiceKey } from './choice.mjs';
import { needsOf } from './author.mjs';
import { editLine } from '../../src/paint/methods/plan-edit.mjs';
import { tinyTouchWarning } from './plan-data.mjs';

/** Looks (each a small real painting of the present choice), and minutes of the model's own time, when the command line names neither. */
export const DEFAULT_LOOKS = 0, DEFAULT_MINUTES = 85;
/** Looks in the hard mode of bench/docs/anti-cheat.md (--looks 100); the default, 0, is gentle mode: no limit, every look recorded. */
export const HARD_LOOKS = 100;
/** Seconds ./unpaint waits before it says "still working". */
const WAIT_SECONDS = 50;

/** The most a file of the session's folder may hold when this side reads it (bytes). */
const MOST_READ = 4 << 20;

/** `rel` inside `dir`, every folder on the way a real folder (no symlink), or a throw. Returns the full path. */
function inside(dir, rel) {
  const parts = String(rel).split('/').filter(Boolean);
  if (!parts.length || parts.some(x => x === '..' || x === '.')) throw new Error('not a path of this folder');
  let at = dir;
  for (const part of parts.slice(0, -1)) { at = path.join(at, part); const st = fs.lstatSync(at, { throwIfNoEntry: false }); if (st && !st.isDirectory()) fs.rmSync(at, { recursive: true, force: true }); if (!st || !st.isDirectory()) fs.mkdirSync(at); }
  return path.join(at, parts.at(-1));
}
/** A file of the session's folder read without trusting it: a plain file with one name, never a link, of bounded size. */
export function safeRead(dir, rel) {
  const file = inside(dir, rel), st = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!st) throw new Error(`there is no file ${rel} in this folder`);
  if (!st.isFile() || st.nlink !== 1) throw new Error(`${rel} must be a plain file of this folder (not a link, not a folder)`);
  if (st.size > MOST_READ) throw new Error(`${rel} is too large`);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { return fs.readFileSync(fd, 'utf8'); } finally { fs.closeSync(fd); }
}
/** A file written into the session's folder: whatever lies at its name is removed first and no link is followed. */
export function safeWrite(dir, rel, data) {
  const file = inside(dir, rel);
  fs.rmSync(file, { recursive: true, force: true });
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o644);
  try { fs.writeFileSync(fd, data); } finally { fs.closeSync(fd); }
}
/** JSON read from the folder; what is wrong is said without quoting the file. */
function safeJson(dir, rel) {
  const text = safeRead(dir, rel);
  try { return { value: JSON.parse(text), text }; } catch { throw new Error(`${rel} is not JSON`); }
}

/** The model's command: a request file in .requests/, then the wait for its answer. POSIX sh, nothing else needed. */
export const UNPAINT_SH = `#!/bin/sh
# ./unpaint status | plan | look | wait      (README.md says what each returns)
d="$(cd "$(dirname "$0")" && pwd)"; r="$d/.requests"
case "\${1:-}" in
  status|plan|look) id="$(date +%s)-$$"; printf '%s\\n' "$1" > "$r/$id.tmp" && mv "$r/$id.tmp" "$r/$id.req" && printf '%s\\n' "$id" > "$r/last" ;;
  wait) id="$(cat "$r/last" 2>/dev/null)"; [ -n "$id" ] || { echo "nothing to wait for"; exit 1; } ;;
  *) echo "usage: ./unpaint status | plan | look | wait"; exit 2 ;;
esac
i=0
while [ ! -f "$r/$id.ans" ]; do
  i=$((i+1)); if [ "$i" -gt ${WAIT_SECONDS} ]; then echo "still working. Run: ./unpaint wait   (waiting is not counted in your time)"; exit 0; fi
  sleep 1
done
cat "$r/$id.ans"
`;

const fill = (text, v) => Object.entries(v).reduce((t, [k, x]) => t.replaceAll(k, () => String(x)), text);

/**
 * The session's folder, written into `dir`: TASK.md (the prompt), README.md, choice.json, the unpaint command, auto/
 * (the code planner's plan: its picture alone, its washes as a table and as data, the settings) and
 * own-script-brief.md, beside the inputs/ the packet already holds. Nothing here sets a plan against the subject:
 * that is a look. `packet` is preparePacket()'s; `auto` {picture: PNG buffer of the plan alone, washesText, plan};
 * `settings` settingsList(); `forms` [{id, name, kind, boxMm}] with `formsIds` the id map's file, or null.
 * Returns {prompt, files}. Nothing of this machine's paths goes into any file of the folder.
 */
export function writeSession({ dir, packet, sheet, medium, auto, settings, forms = null, formsIds = null, looks, minutes, briefFile, readmeFile, previous = null, drawing = null }) {
  const mk = d => fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const d of ['auto', 'plans', 'looks', '.requests']) mk(d);
  const put = (f, text) => fs.writeFileSync(path.join(dir, f), text);
  const ink = /^ink/.test(medium), v = { SHEET_W: sheet.widthMm, SHEET_H: sheet.heightMm, MINUTES: minutes,
    LOOKS_LINE: looks > 0 ? `You have ${looks} looks. Each is counted before it is shown and kept on record.` : 'Look as often as you like, as a painter steps back. Each look paints your plan for real. Every look is recorded (when, of what, and what you changed after it); there is no limit on them.',
    LOOKS_LIMIT: looks > 0 ? `${looks} looks; each is counted before it is shown` : 'no limit; every look is recorded',
    DRAWING_NOTE: ink ? 'The drawing (waterproof ink) is already on the sheet and carries the form; the washes go over it.' : 'The drawing (light pencil) is already on the sheet and only places the forms; the paint must carry form, value and edge.',
    INPUT_LIST: packet.files.map(f => `- \`${f}\`: ${f.includes('source') ? 'the SUBJECT, the picture to paint' : f.includes('drawing') ? 'the opening DRAWING, already on the sheet before any wash' : f.includes('forms') ? 'the NAMED FORMS, each one flat colour' : `block-in STUDY ${/study-(\d)/.exec(f)?.[1]}: the subject simplified to flat shapes (1 the broad shapes, 2 the middle study, 3 details and accents); the code planner reads its washes from these`}`).join('\n') };
  let prompt = fill(fs.readFileSync(briefFile, 'utf8'), v);
  // a later try of the same model on the same subject: its own previous painting and a teacher's words on it, never a number
  if (previous) {
    mk('previous');
    for (const f of previous.files) { const to = path.join(dir, 'previous', f.name); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(f.from, to); }
    prompt += `\n## This is try ${previous.tryNumber} of ${previous.tries}\n\nYou have painted this subject before. \`previous/\` holds your own last try: ${previous.files.map(f => `\`previous/${f.name}\` (${f.what})`).join(', ')}. Open them first. The painting there is the real sheet as it dried at full size; the teacher's words are a watercolour teacher's faults with it, in plain sentences. Keep what worked, put right what the teacher faults and what you see yourself, and hand over a better painting. You may start from what you handed over last time (copy it out of \`previous/\`) or start again.\n`;
  }
  put('TASK.md', prompt); put('README.md', fill(fs.readFileSync(readmeFile, 'utf8'), v));
  put('own-script-brief.md', packet.brief);
  put('choice.json', JSON.stringify({ kind: 'settings', settings: {}, why: '' }, null, 1) + '\n');
  put('unpaint', UNPAINT_SH); fs.chmodSync(path.join(dir, 'unpaint'), 0o755);
  put('auto/settings.json', JSON.stringify({ note: 'Write a setting into choice.json under "settings" by its "set" name. "now" is the value the code planner\'s plan in this folder was made with.', settings }, null, 1) + '\n');
  put('auto/plan.json', JSON.stringify(auto.plan, null, 1) + '\n'); if (auto.toEdit) put('auto/plan-to-edit.json', JSON.stringify(auto.toEdit, null, 1) + '\n'); put('auto/washes.txt', auto.washesText); fs.writeFileSync(path.join(dir, 'auto/plan.png'), auto.picture);
  if (forms && formsIds) { fs.copyFileSync(formsIds, path.join(dir, 'inputs/forms-ids.png')); put('inputs/forms.json', JSON.stringify(forms.map(f => ({ id: f.id, name: f.name, kind: f.kind, boxMm: f.boxMm ?? null })), null, 1) + '\n'); }
  // the drawing's lines, each one a row an author may choose, weight or move after the washes (lines-edit.mjs): `drawing` {listing, picture}
  if (drawing) { mk('drawing'); put('drawing/lines.json', JSON.stringify(drawing.listing) + '\n'); if (drawing.picture) fs.writeFileSync(path.join(dir, 'drawing/all-lines.png'), drawing.picture); }
  const leak = [os.homedir(), os.userInfo().username].filter(Boolean);
  for (const f of ['TASK.md', 'README.md', 'own-script-brief.md', 'auto/settings.json', 'auto/plan.json', 'auto/plan-to-edit.json', 'auto/washes.txt', 'inputs/forms.json', 'drawing/lines.json']) {
    if (fs.existsSync(path.join(dir, f)) && leak.some(w => fs.readFileSync(path.join(dir, f), 'utf8').includes(w))) throw new Error(`session: ${f} would carry a path or name of this machine; the session is not started`);
  }
  return { prompt };
}

/** The looks already written in a run's ledger (one JSON line a look). The ledger lies outside the model's folder. */
export function ledgerLooks(ledger) {
  if (!fs.existsSync(ledger)) return [];
  return fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.look);
}

/**
 * The answering side of the session: the one broker. `compile(choice, script, n)` plans a checked choice outside the
 * model's folder and resolves {ok, error, summary, rows}; `checkScript(obj)` returns a checked script or throws.
 * `look(choice, script, {plan, look}, edit, compiled)` paints a compiled choice for real, small, outside the folder
 * and resolves {ok: true, picture (the dried sheet beside the source and the middle study, PNG), stages (the stage
 * strip, PNG, or null), numbersText, marked, planPicture (the plan's diagram, PNG, or null), painted (what was
 * painted: cells, seconds, backend)} or {ok: false, error}: a painting that failed, or did not stay on the GPU, shows
 * nothing and is no look. `ledger` is a file outside the folder: every request is appended to it, and a look is
 * appended (and synced) once it is painted and BEFORE anything of it is delivered, so a look that fails on the way
 * to the folder is still spent, and a server started again for the same run goes on from the count already there.
 * `keep`: a folder outside the model's folder where each look is kept as it was shown (keep/N/: the choice and its
 * script or edited plan as looked at, the dried sheet, the stages, the numbers). The time a request waits on this
 * side (the planner, a look's painting) is not the model's own. start() begins polling; stop() ends it and returns
 * the record.
 */
export function sessionServer({ dir, looks: asked, minutes, compile, look: paintLook, keep = null, checkScript, checkPlan = null, checkTools = null, ledger, now = Date.now, everyMs = 400 }) {
  // no limit on looks (gentle mode) when the number asked is 0 or not given
  const most = asked > 0 ? asked : Infinity, ofMost = most === Infinity ? '' : ` of ${most}`;
  const plans = [], cache = new Map(), painted = new Map(), requests = [], good = new Set(), seen = new Map();
  let t0 = now(), waitMs = 0, busy = false, timer = null, lastGood = null, n = 0, pending = null, lastEnd = t0;
  const note = entry => { const fd = fs.openSync(ledger, 'a'); try { fs.writeSync(fd, JSON.stringify(entry) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } };
  const used = () => ledgerLooks(ledger).length;
  // the model's own time: the clock less every stretch a request of its was waiting on this side (a stretch counted once)
  const ownSeconds = () => Math.round((now() - t0 - waitMs - (pending == null ? 0 : now() - pending)) / 1000);
  const left = () => { const u = used(); return `Time: ${Math.round(ownSeconds() / 60)} of ${minutes} minutes of your own time used. Looks: ${most === Infinity ? `${u} taken (no limit; each is recorded)` : `${u} of ${most} used, ${Math.max(0, most - u)} left`}. Plans made: ${plans.length}.`; };

  /** The folder's present choice, checked: {choice, script, scriptText, key}. Throws with the reason. */
  function present() {
    const choice = readChoice(safeJson(dir, 'choice.json').value); let script = null, edit = null, text = '';
    if (choice.kind === 'script') { const got = safeJson(dir, choice.script); text = got.text; script = checkScript(got.value); }
    // an edited plan is checked against the code planner's plan it must be an edit of: {edit, record (what it changes, counted)}
    if (choice.kind === 'plan') { if (!checkPlan) throw new Error('an edited plan cannot be read in this session'); const got = safeJson(dir, choice.plan); text = got.text; edit = checkPlan(got.value); }
    // the choice's tools (its lines, its forms, settings per form): their files are read here and checked against the
    // drawing and the forms of the run: {record (what was chosen, counted), said}
    let tools = null;
    if (choice.tools) {
      if (!checkTools) throw new Error('"lines", "forms" and "perForm" cannot be read in this session');
      const t = choice.tools; if (t.lines) t.linesEdit = safeJson(dir, t.lines).value; if (t.forms) t.formsEdit = safeJson(dir, t.forms).value;
      tools = checkTools(t);
    }
    return { choice, script, edit, text, tools, key: choiceKey(choice, text) };
  }

  async function answer(cmd) {
    if (cmd === 'status') return left();
    if (cmd === 'look' && used() >= most) return `REFUSED: all ${most} looks are used. You may still revise once for what your last look showed, and run ./unpaint plan to check that it compiles.\n${left()}`;
    let p; try { p = present(); } catch (e) { return `REFUSED, nothing was planned${cmd === 'look' ? ' and no look was counted' : ''}: ${e.message}`; }
    const id = ++n, what = choiceKind(p.choice), atSeconds = ownSeconds();
    let got = cache.get(p.key);
    if (!got) { try { got = await compile(p.choice, p.script, id, p.edit?.edit ?? null); } catch (e) { got = { ok: false, error: e.message }; } cache.set(p.key, got); }
    const entry = { n: id, atSeconds, what, kind: p.choice.kind, settings: Object.fromEntries(p.choice.sets), script: p.choice.script, plan: p.choice.plan ?? null, edit: p.edit?.record ?? null, tools: p.tools?.record ?? null, why: p.choice.why, key: p.key, ok: got.ok, error: got.ok ? null : got.error, washes: got.summary?.washes ?? null, strokes: got.summary?.strokes ?? null, look: null };
    plans.push(entry);
    if (!got.ok) return `REFUSED by the planner${cmd === 'look' ? ', no look was counted' : ''}: ${got.error}`;
    good.add(p.key); lastGood = { choice: p.choice, script: p.script, edit: p.edit, tools: p.tools, key: p.key, plan: id };
    // what the choice's tools made of the given drawing and forms, as pictures and data of the author's own (mine/)
    for (const f of got.toolFiles ?? []) safeWrite(dir, f.rel, f.data);
    const s = got.summary, line = `${s.passages != null ? `${s.passages} passages, ` : s.shapes != null ? `${s.shapes} shapes, ` : ''}${s.washes} washes, ${s.strokes ?? '?'} strokes, widest wash brush ${s.widestBrushMm ?? '?'} mm${s.washesByStage ? `, washes by stage ${s.washesByStage.join('/')}` : ''}`;
    // a free plan answers with whether it compiled and its counts: no picture, no colours, no places
    // (the painter's own count of the edit when it applied one: it holds the notes of what was laid the nearest way)
    const er = got.editRecord ?? p.edit?.record ?? null; if (er) entry.edit = er;
    const editSaid = er ? ` Your edit: ${editLine(er)}.${er.notes.length ? `\n${er.notes.length} note${er.notes.length > 1 ? 's' : ''} on it (each was laid the nearest way that can be; change it if that is not what you want):\n${er.notes.slice(0, 60).map(x => `- ${x}`).join('\n')}\n` : ''}` : '';
    const edited = `${editSaid}${p.tools ? ` ${p.tools.said}${got.toolFiles?.length ? ` See ${got.toolFiles.map(f => f.rel).join(', ')}.` : ''}` : ''}`;
    // ... and of the strokes too small for a wet bed, before anything is painted (plan-data.mjs tinyTouchWarning)
    const tiny = tinyTouchWarning(s);
    if (cmd === 'plan') return `It compiles (${what}): ${line}.${travelLine(s.handTravel)}${edited}${tiny} Nothing else is shown without a look.\n${left()}`;
    // a look is the choice painted for real, small: the painter runs outside the folder. A painting that fails, or
    // does not stay on the GPU, shows nothing and is no look. The same choice looked at again is not painted again
    // (and is a look again).
    const look = used() + 1;
    let seenIt = painted.get(p.key);
    if (!seenIt) { try { seenIt = await paintLook(p.choice, p.script, { plan: id, look }, p.edit?.edit ?? null, got); } catch (e) { seenIt = { ok: false, error: e.message }; } if (seenIt?.ok) painted.set(p.key, seenIt); }
    if (!seenIt?.ok) { note({ notPainted: String(seenIt?.error ?? 'no painting').slice(0, 300), plan: id, key: p.key }); return `NOT PAINTED, no look was counted: ${seenIt?.error ?? 'the painter gave no painting'}\nYour choice compiles (${what}): ${line}. Ask for the look again, or go on.\n${left()}`; }
    // the look is spent before it is delivered: whatever happens to the delivery, it stays spent
    note({ look, plan: id, atSeconds, at: new Date(now()).toISOString(), what, kind: p.choice.kind, settings: entry.settings, script: p.choice.script, plan: p.choice.plan ?? null, edit: er, tools: p.tools?.record ?? null, key: p.key, marked: seenIt.marked ?? null, painted: seenIt.painted ?? null });
    entry.look = look;
    const folder = `looks/${look}`, t = p.choice.tools, choiceText = JSON.stringify({ kind: p.choice.kind, settings: entry.settings, script: p.choice.script, plan: p.choice.plan ?? null, ...(t ? { lines: t.lines ?? undefined, forms: t.forms ?? undefined, perForm: t.perFormGiven ?? undefined } : {}), why: p.choice.why }, null, 1) + '\n';
    // kept outside the folder as it was shown, with the choice as it was looked at: what changed between looks is read from here
    if (keep) {
      try {
        const at = path.join(keep, String(look)); fs.mkdirSync(at, { recursive: true });
        fs.writeFileSync(path.join(at, 'choice.json'), choiceText); if (p.text) fs.writeFileSync(path.join(at, p.choice.kind === 'script' ? 'script.json' : 'plan-edit.json'), p.text);
        if (t?.linesEdit) fs.writeFileSync(path.join(at, 'lines-edit.json'), JSON.stringify(t.linesEdit)); if (t?.formsEdit) fs.writeFileSync(path.join(at, 'forms-edit.json'), JSON.stringify(t.formsEdit));
        fs.writeFileSync(path.join(at, 'beside.png'), seenIt.picture); if (seenIt.stages) fs.writeFileSync(path.join(at, 'stages.png'), seenIt.stages); fs.writeFileSync(path.join(at, 'numbers.txt'), seenIt.numbersText);
        fs.writeFileSync(path.join(at, 'look.json'), JSON.stringify({ look, plan: id, atSeconds, what, key: p.key, marked: seenIt.marked ?? null, painted: seenIt.painted ?? null }, null, 1) + '\n');
      } catch (e) { note({ fault: `look ${look} not kept outside the folder: ${String(e.message).slice(0, 200)}` }); }
    }
    safeWrite(dir, `${folder}/beside.png`, seenIt.picture); if (seenIt.stages) safeWrite(dir, `${folder}/stages.png`, seenIt.stages); safeWrite(dir, `${folder}/numbers.txt`, seenIt.numbersText);
    if (seenIt.planPicture) safeWrite(dir, `${folder}/plan.png`, seenIt.planPicture);
    safeWrite(dir, `${folder}/plan.json`, JSON.stringify({ choice: { kind: p.choice.kind, settings: entry.settings, script: p.choice.script, plan: p.choice.plan ?? null }, summary: got.summary, washes: got.rows }, null, 1) + '\n');
    const m = seenIt.marked;
    return `LOOK ${look}${ofMost} (${what}), PAINTED${seenIt.painted?.cells ? ` small (${seenIt.painted.cells} cells across${seenIt.painted.fullCells ? ` of the final ${seenIt.painted.fullCells}` : ''})` : ''} and dried: ${line}.${edited}\nOpen ${folder}/beside.png: your painting as it dried, the subject and the middle study, left to right, on the same grid.${seenIt.stages ? ` Open ${folder}/stages.png: the subject, then the sheet at 10, 25, 50, 75 and 100% of the strokes (the order of the work).` : ''} Read ${folder}/numbers.txt: each named form on the DRIED sheet against the study and against your plan${m ? `; ${m.forms} named forms are marked !! (too dark or too pale)${m.washes ? ` and ${m.washes} washes` : ''}` : ''}. ${folder}/plan.json holds every wash as data${seenIt.planPicture ? `, ${folder}/plan.png the plan as a diagram` : ''}.\nStep back from it as from the easel, and revise for what you see.\n${left()}`;
  }

  async function tick() {
    if (busy) return; busy = true;
    try {
      const req = inside(dir, '.requests/x').slice(0, -2);
      for (const f of fs.readdirSync(req).filter(x => /^[0-9]{1,12}-[0-9]{1,8}\.req$/.test(x)).sort()) {
        const id = f.slice(0, -4);
        // the time a request was asked is when this side first saw it; nothing of the file's own dates is believed
        if (!seen.has(id)) seen.set(id, now());
        const asked = Math.max(lastEnd, seen.get(id)); pending = asked;
        let cmd = 'unreadable', text;
        try { const word = safeRead(dir, `.requests/${f}`).trim(); cmd = ['status', 'plan', 'look'].includes(word) ? word : 'unknown'; } catch { /* a request that is a link, a folder or too large is not read */ }
        try { text = cmd === 'unknown' || cmd === 'unreadable' ? 'REFUSED: a request is one of status, plan, look, written by ./unpaint.' : await answer(cmd); } catch (e) { text = `the command failed on this side${cmd === 'look' ? '; if a look was counted it stays counted (./unpaint status says)' : ''}. ${left()}`; note({ fault: String(e.message).slice(0, 300), cmd }); }
        try { fs.rmSync(path.join(req, f), { recursive: true, force: true }); safeWrite(dir, `.requests/${id}.ans.tmp`, text + '\n'); fs.renameSync(path.join(req, `${id}.ans.tmp`), path.join(req, `${id}.ans`)); } catch (e) { note({ fault: `answer not delivered: ${String(e.message).slice(0, 200)}`, cmd }); }
        lastEnd = now(); waitMs += lastEnd - asked; pending = null;
        const entry = { cmd, seconds: Math.round((lastEnd - asked) / 1000), answer: text.split('\n')[0].slice(0, 200) }; requests.push(entry); note({ request: cmd, at: new Date(lastEnd).toISOString(), seconds: entry.seconds, answer: entry.answer });
      }
    } finally { busy = false; }
  }

  return {
    start() { timer = setInterval(() => { tick().catch(() => {}); }, everyMs); }, tick, ownSeconds, present, looksTaken: used,
    /** The model's command starts now: its own time is counted from here (not from when this side was made ready). */
    begin() { t0 = now(); waitMs = 0; lastEnd = Math.max(lastEnd, t0); },
    over: () => ownSeconds() >= minutes * 60,
    async stop() { if (timer) clearInterval(timer); while (busy) await new Promise(r => setTimeout(r, 50)); return { looks: ledgerLooks(ledger), plans, requests, ownSeconds: ownSeconds(), waitSeconds: Math.round(waitMs / 1000), lastGood, good }; },
  };
}

/**
 * What is painted when the session has ended: the folder's choice when it is sound and the planner compiled it in
 * this session (`good` holds the keys of the choices that did; a choice that changes nothing is the code planner's
 * plan, which compiled before the session began); else the last choice that compiled, with the reason; else nothing
 * (a failed run). `ended` is 'done' or 'time limit'.
 * {choice, script, submitted: {kind, what, settings, script, why, from, note}} or {failure}.
 */
export function finalChoice({ present, lastGood, good = new Set(), ended }) {
  const say = (c, from, note) => ({ kind: c.choice.kind, what: choiceKind(c.choice), settings: Object.fromEntries(c.choice.sets), script: c.choice.script, plan: c.choice.plan ?? null, edit: c.edit?.record ?? null,
    ...(c.choice.tools ? { tools: { lines: c.choice.tools.lines, forms: c.choice.tools.forms, perForm: c.choice.tools.perFormGiven, record: c.tools?.record ?? null } } : {}), why: c.choice.why, from, note });
  const cut = ended === 'done' ? null : 'the session ran out of time';
  let p = null, why = null;
  try { p = present(); } catch (e) { why = e.message; }
  if (p && (good.has(p.key) || (p.choice.kind === 'settings' && !p.choice.sets.length && !p.choice.tools))) return { choice: p.choice, script: p.script, edit: p.edit?.edit ?? null, submitted: say(p, 'choice.json as the session left it', cut) };
  if (p) why = 'it was never planned, so it is not known to compile';
  if (lastGood) return { choice: lastGood.choice, script: lastGood.script, edit: lastGood.edit?.edit ?? null, submitted: say(lastGood, `the last choice that compiled (plan ${lastGood.plan})`, `the final choice.json was not taken: ${why}${cut ? `; ${cut}` : ''}`) };
  return { failure: `the session's final choice.json was not taken and no earlier choice had compiled: ${why}` };
}

/** The environment a model's command is started with: what a command line needs and its own keys, nothing else of this session. */
export function cleanEnv(env = process.env) {
  const keep = /^(HOME|USER|LOGNAME|PATH|SHELL|TERM|LANG|LC_[A-Z]+|TMPDIR|ANTHROPIC_API_KEY|ANTHROPIC_BASE_URL|OPENAI_API_KEY|OPENAI_BASE_URL|CODEX_HOME|CLAUDE_CONFIG_DIR|XDG_[A-Z_]+|SSL_CERT_FILE|NODE_EXTRA_CA_CERTS)$/;
  return Object.fromEntries(Object.entries(env).filter(([k]) => keep.test(k)));
}

const q = s => `"${String(s).replace(/[\\"]/g, '\\$&')}"`;
/**
 * A seatbelt profile (macOS sandbox-exec) for a model's whole process tree: it may not read `deny` (the repository,
 * the subject list, the caches, other sessions), may write only under `write`, and reaches the network only on
 * port 443 (its own service). Later rules win, so `cwd`, the session's own folder, is allowed again after the denials.
 * `local`: the command talks to its own helper over this machine's loopback, and runs its shell on a pseudo-terminal.
 */
export function seatbelt({ deny, write, cwd, local = false }) {
  return ['(version 1)', '(allow default)',
    '(deny file-write*)', `(allow file-write* ${write.map(d => `(subpath ${q(d)})`).join(' ')} (literal "/dev/null") (literal "/dev/dtracehelper") (regex #"^/dev/tty"))`,
    `(deny file-read* file-write* ${deny.map(d => `(subpath ${q(d)})`).join(' ')} (regex #"/unpaint-session-"))`,
    `(allow file-read* file-write* (subpath ${q(cwd)}))`,
    '(deny network*)', '(allow network-outbound (remote tcp "*:443") (remote udp "*:53") (remote tcp "*:53") (literal "/private/var/run/mDNSResponder"))', '(allow network-inbound (local udp "*:*"))', '(allow system-socket)',
    ...(local ? ['(allow network-bind (local ip "localhost:*"))', '(allow network-inbound (local ip "localhost:*"))', '(allow network-outbound (remote ip "localhost:*"))', '(allow pseudo-tty)', '(allow file-read* file-write* file-ioctl (literal "/dev/ptmx") (regex #"^/dev/ttys[0-9]+$"))'] : []),
  ].join('\n');
}

/**
 * The command that starts `author` as a working session with a shell in `cwd`. `deny`: folders nothing of the
 * session may read (the repository and its worktrees, the subject list, the caches). {cmd, args, env, unset, closed:
 * what holds the session in its folder, in words}.
 * claude: its own sandbox for the shell and Read rules for its file tools. codex: its own sandbox cannot deny a read
 * and seatbelt profiles do not nest, so the whole command runs under this module's profile with its own switched off.
 * agy: the same profile (its own permission prompts off inside it), with loopback and a pseudo-terminal allowed: it
 * talks to a helper of its own on localhost and runs its shell on a pty.
 */
export function sessionCall(author, { prompt, cwd, deny = [], images = [], home = os.homedir(), tmp = os.tmpdir() }) {
  const real = d => { try { return fs.realpathSync(d); } catch { return d; } }, all = [...new Set(deny.flatMap(d => [d, real(d)]))];
  if (author.cli === 'claude') {
    const settings = { sandbox: { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false }, permissions: { deny: all.map(d => `Read(/${d}/**)`) } };
    return { cmd: 'claude', env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', BASH_DEFAULT_TIMEOUT_MS: '120000', BASH_MAX_TIMEOUT_MS: '600000' }, unset: [],
      args: ['-p', prompt, '--model', author.id, ...(author.effort ? ['--effort', author.effort] : []), '--allowedTools', 'Read Write Edit Glob Grep Bash', '--settings', JSON.stringify(settings), '--setting-sources', 'project', '--no-session-persistence', '--output-format', 'stream-json', '--verbose'],
      probe: null, closed: 'its shell runs in the command\'s own sandbox (writes only in its folder, network held to the command\'s allowed hosts) and neither its shell nor its file tools can read the repository, the subject list, the caches or other sessions' };
  }
  if (author.cli === 'codex') {
    const profile = seatbelt({ deny: all, write: [...new Set([path.join(home, '.codex'), real(tmp), '/private/tmp', '/private/var/folders'])], cwd: real(cwd) });
    return { cmd: 'sandbox-exec', env: {}, unset: [], profile,
      args: ['-p', profile, 'codex', 'exec', '--json', '-m', author.id, ...(author.effort ? ['-c', `model_reasoning_effort="${author.effort}"`] : []), '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', '--ephemeral', '-C', cwd, ...images.flatMap(f => ['-i', f]), '--', prompt],
      probe: file => ({ cmd: 'sandbox-exec', args: ['-p', profile, '/bin/cat', file] }),
      closed: 'the whole command runs under a seatbelt profile of this harness: it cannot read the repository, the subject list, the caches or other sessions, writes only in its folder and temporary folders, and reaches the network on port 443 only (the command\'s own sandbox is off: two do not nest)' };
  }
  if (author.cli === 'agy') {
    const profile = seatbelt({ deny: all, write: [...new Set([path.join(home, '.gemini'), real(tmp), '/private/tmp', '/private/var/folders'])], cwd: real(cwd), local: true });
    return { cmd: 'sandbox-exec', env: { DO_NOT_TRACK: '1' }, unset: [], profile, serial: true,
      args: ['-p', profile, 'agy', '-p', prompt, '--model', author.id, '--dangerously-skip-permissions', '--output-format', 'stream-json'],
      probe: file => ({ cmd: 'sandbox-exec', args: ['-p', profile, '/bin/cat', file] }),
      closed: 'the whole command runs under a seatbelt profile of this harness: neither its shell nor its file tools can read the repository, the subject list, the caches or other sessions, it writes only in its folder, its own settings folder and temporary folders, and reaches the network on port 443 and this machine\'s loopback only (its own permission prompts are off inside the profile)' };
  }
  throw new Error(`author ${author.key}: a working session needs a shell, and "${author.cli}" is called without one here (claude, codex and agy can)`);
}

const kindOfCommand = c => { const m = /(?:^|[\s;&|/])unpaint\s+(status|plan|look|wait)\b/.exec(c); return m ? `unpaint ${m[1]}` : 'shell'; };

/**
 * A session's transcript read: {text (its last message), tokens, costUSD, calls: {kind: count}, commands: [shell
 * commands in order]}. claude: stream-json lines; codex: --json lines; agy: stream-json lines (a step_update for each
 * step as it starts and ends, the tool's parameters in it, and one result).
 */
export function readTranscript(cli, out) {
  const calls = {}, commands = []; let text = '', tokens = null, costUSD = null;
  const count = k => { calls[k] = (calls[k] ?? 0) + 1; };
  const steps = new Set(), said = new Map();
  for (const l of out.split('\n')) {
    let d; try { d = JSON.parse(l); } catch { continue; }
    if (cli === 'agy') {
      const s = d.step_update;
      if (d.event === 'step_update' && s?.step_type === 'tool' && !steps.has(s.step_index)) {
        // a tool step is counted once, when it is first seen (a step cut off by the clock never ends)
        steps.add(s.step_index); const name = s.tool_name ?? s.tool_info?.name ?? 'tool', par = s.tool_info?.parameters ?? {};
        if (name === 'run_command') { const c = String(par.CommandLine ?? ''); commands.push(c); count(kindOfCommand(c)); }
        else { count(/^(read_file|view_file|list_dir|find_by_name|grep_search)$/.test(name) ? 'read file' : /^(write_to_file|replace_file_content|multi_replace_file_content|sed_file)$/.test(name) ? 'write file' : name);
          const places = Object.entries(par).filter(([k, v]) => typeof v === 'string' && /path|file|dir|uri|cwd/i.test(k)).map(([, v]) => v); if (places.length) commands.push(`${name} ${places.join(' ')}`); }
      }
      if (d.event === 'step_update' && s?.step_type === 'agent_response') { if (s.text_delta) said.set(s.step_index, (said.get(s.step_index) ?? '') + s.text_delta); if (s.usage?.total_tokens) tokens = (tokens ?? 0) + s.usage.total_tokens; }
      if (d.event === 'result' && d.result?.response) text = String(d.result.response);
      continue;
    }
    if (cli === 'claude') {
      if (d.type === 'assistant') for (const b of d.message?.content ?? []) {
        if (b.type === 'text' && b.text?.trim()) text = b.text;
        if (b.type !== 'tool_use') continue;
        if (b.name === 'Bash') { const c = String(b.input?.command ?? ''); commands.push(c); count(kindOfCommand(c)); }
        else { count(b.name === 'Read' ? 'read file' : ['Write', 'Edit'].includes(b.name) ? 'write file' : b.name); const f = b.input?.file_path ?? b.input?.path; if (f) commands.push(`${b.name} ${f}`); }
      }
      if (d.type === 'result') { const u = d.usage ?? {}; if (d.result) text = String(d.result); tokens = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'].reduce((a, k) => a + (u[k] || 0), 0) || null; costUSD = d.total_cost_usd ?? null; }
    } else {
      if (d.type === 'item.completed' && d.item) {
        const it = d.item;
        if (it.type === 'agent_message' && it.text) text = it.text;
        else if (it.type === 'command_execution') { const c = String(it.command ?? ''); commands.push(c); count(kindOfCommand(c)); }
        else if (it.type === 'file_change') count('write file');
        else if (it.type !== 'reasoning' && it.type !== 'agent_message') count(it.type);
      }
      if (d.type === 'turn.completed' && d.usage) tokens = (tokens ?? 0) + (d.usage.input_tokens || 0) + (d.usage.output_tokens || 0);
    }
  }
  if (cli === 'agy' && !text && said.size) text = [...said].sort((a, b) => a[0] - b[0]).at(-1)[1];
  return { text, tokens, costUSD, calls, commands };
}

/**
 * Commands (shell, and file tools with their path) that name a place the session must not reach, the painter itself,
 * or another session's folder. `own`: the session's own folder, which it may name freely; so may it the folder its
 * command keeps its own long tool results in, which is named for the session's folder with every mark turned to "-".
 */
export function reachedOutside(commands, roots, own = []) {
  const names = own.filter(Boolean).flatMap(o => [o, o.replace(/[^A-Za-z0-9]/g, '-')]).sort((a, b) => b.length - a.length);
  const mine = c => names.reduce((t, o) => t.replaceAll(o, '.'), c);
  return commands.filter(c => { const t = mine(c); return roots.some(r => r && t.includes(r)) || /paint-plate|value-plan-preview|unpaint-session-/.test(t); }).map(c => c.slice(0, 300));
}

/** The folder a kept session worked in, read back from its commands (the path of a session folder they name most). */
export function ownFolderOf(commands) {
  const seen = new Map();
  for (const c of commands) for (const m of c.matchAll(/\/[^\s'"`]*?\/unpaint-session-[a-z0-9]+-[A-Za-z0-9]{6}/g)) seen.set(m[0], (seen.get(m[0]) ?? 0) + 1);
  return [...seen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Pictures in the session's folder that the harness did not put there (a plan drawn by other means would be one). */
const HARNESS_PICTURES = new Set(['mine/drawing.png', 'mine/forms.png', 'mine/forms-ids.png']);
export function ownPictures(dir) {
  const out = [], walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name), rel = path.relative(dir, f); if (e.isDirectory()) { if (!['inputs', 'auto', 'looks', 'drawing', '.requests'].includes(rel)) walk(f); } else if (/\.(png|jpe?g|gif|webp|bmp|tiff?|svg|ppm|pgm|pdf|html?)$/i.test(e.name) && !HARNESS_PICTURES.has(rel)) out.push(rel); } };
  walk(dir); return out.sort();
}

/**
 * Run the session's command until it ends or `over()` says its own time is up; then it and every process it started
 * are ended (SIGTERM, and SIGKILL to the group after `graceMs`). Its output goes to outFile/errFile.
 * Resolves {exit, ended: 'done' | 'time limit' | 'not started', error}.
 */
export function runSession(call, { cwd, outFile, errFile, over, env = cleanEnv(), everyMs = 5000, wallMinutes = 180, graceMs = 10000 }) {
  return new Promise(resolve => {
    const mine = { ...env, ...call.env }; for (const k of call.unset ?? []) delete mine[k];
    let closed = false; const out = fs.openSync(outFile, 'w'), err = fs.openSync(errFile, 'w'), close = () => { if (closed) return; closed = true; fs.closeSync(out); fs.closeSync(err); };
    let child, cut = false, killer = null; const t0 = Date.now();
    try { child = spawn(call.cmd, call.args, { cwd, env: mine, stdio: ['ignore', out, err], detached: true }); } catch (e) { close(); resolve({ exit: null, ended: 'not started', error: e.message }); return; }
    const group = sig => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* gone */ } } };
    const timer = setInterval(() => { if (!cut && (over() || Date.now() - t0 > wallMinutes * 60000)) { cut = true; group('SIGTERM'); killer = setTimeout(() => group('SIGKILL'), graceMs); } }, everyMs);
    child.on('error', e => { clearInterval(timer); close(); resolve({ exit: null, ended: 'not started', error: `${e.code === 'ENOENT' ? `\`${call.cmd}\` is not installed or not on PATH` : e.message} (needs ${needsOf(call.cmd)})` }); });
    child.on('close', code => { clearInterval(timer); if (killer) clearTimeout(killer); group('SIGKILL'); close(); resolve({ exit: code, ended: cut ? 'time limit' : 'done', error: !cut && code !== 0 ? `the model's command ended with exit ${code}` : null }); });
  });
}
