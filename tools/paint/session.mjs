// A model author as a working session, not one reply. The model gets a folder of its own outside the repository (the
// locked inputs, the code planner's plan of the subject, the planner's settings, a README of its tools), a shell in
// that folder, and the benchmark's resource budget for one try: a number of looks and of minutes on the wall clock,
// the same for every model and told at the start. Nothing else caps its work: what it uses is measured (usage.mjs).
// A look is a real painting of its present choice: the painter run small on the GPU through drying (look.mjs), shown
// as the dried sheet beside the source and the middle study, with the stages of the painting and each named form
// measured on the dried sheet. What it leaves in choice.json is painted (choice.mjs): the code planner tuned, its
// plan edited, or its own script; nothing changed is exactly the code planner.
//
// What is refused: a file that cannot be read, a request the painter cannot lay (too many paints, a brush not in the
// kit), anything that reaches outside the folder or measures against the subject, and going back to an earlier
// choice more often than allowed (reverts.mjs). A choice that may spoil the painting is laid as written and the
// answer lists it as a warning: a model's mistake reaches the sheet as a mistake.
//
// The model's commands are request files this module answers (./unpaint plan|look|status|wait): the planner itself
// runs here, outside the model's folder. The boundary: the folder holds the input pictures the code planner gets and,
// for the preflight only, the code planner's plan (levels.mjs: no session at any level has auto/, the only choice is the model's
// own script, and a session that hands in none has handed in nothing); a plan is PAINTED, RENDERED or MEASURED against the subject only by a counted look. So a
// free plan call answers with whether it compiled and its counts, nothing else; a look is painted, then written into
// a ledger outside the folder before anything of it is delivered (a painting that failed or left the GPU delivers
// nothing and is no look); the folder is never trusted (no symlink is followed, no request is echoed);
// and the model's shell cannot read the repository, the subject list, the caches or other sessions (seatbelt).
// What this cannot stop: a model drawing its own script's polygons with its own code. Its commands are kept.
import { travelLine } from './hand-travel.mjs';
import fs from 'node:fs';
import { proxyEnv, TOOLS_OPEN } from './session-net.mjs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { readChoice, choiceKind, choiceKey } from './choice.mjs';
import { OWN_SCRIPT_ONLY } from './levels.mjs';
import { needsOf } from './author.mjs';
import { editLine } from '../../src/paint/methods/plan-edit.mjs';
import { tinyTouchWarning } from './plan-data.mjs';
import { revertCounter, DEFAULT_REVERTS } from './reverts.mjs';
import { readSeen, seenAsk } from './seen.mjs';
import { DEFAULT_LOOK_UNITS, readLookAsk, regionBox, lookCost, costLine, scriptInRegion } from './look-cost.mjs';

/**
 * The benchmark's resource budget for one try (one model, one subject, one level), when the command line names none:
 * rendering, in look units (look-cost.mjs: a full look of the whole plan on the whole sheet costs 1), and minutes on
 * the wall clock, looks and planning included. It is set by whoever runs the benchmark, told to the model at the
 * start, and is not a judgment of the work: a session that reaches it is asked to hand in what it has and the run
 * says so. Nothing else caps a session.
 */
export const DEFAULT_LOOKS = DEFAULT_LOOK_UNITS;
/**
 * The wall clock is not a budget (it depends on the machine and on who shares it): a far safety stop only, after which
 * a session is marked "cut off by the safety stop". Minutes; the grace is the time it then has to hand in.
 */
export const DEFAULT_WALL_MINUTES = 360, DEFAULT_GRACE_MINUTES = 10;
/**
 * The model's own work is budgeted in steps: its tool calls (shell commands, ./unpaint among them, and file tools),
 * counted from its transcript as it goes, the same on any machine. Cheap; the allowance only guards against a runaway.
 * Past it the session is asked to hand in, and STEP_GRACE steps later it is ended.
 */
export const DEFAULT_STEPS = 1000, STEP_GRACE = 50;
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
# ./unpaint status | plan | look [--until STAGE] [--region x0,y0,x1,y1 | --region FORM] | cost [the same] | wait
# (README.md says what each returns)
d="$(cd "$(dirname "$0")" && pwd)"; r="$d/.requests"
case "\${1:-}" in
  status|plan|look|cost) id="$(date +%s)-$$"; printf '%s\\n' "$*" > "$r/$id.tmp" && mv "$r/$id.tmp" "$r/$id.req" && printf '%s\\n' "$id" > "$r/last" ;;
  wait) id="$(cat "$r/last" 2>/dev/null)"; [ -n "$id" ] || { echo "nothing to wait for"; exit 1; } ;;
  *) echo "usage: ./unpaint status | plan | look [--until STAGE] [--region BOX or FORM] | cost [--until STAGE] [--region BOX or FORM] | wait"; exit 2 ;;
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
 * A brief's text for the level: lines between `<!-- L4 -->` and `<!-- end -->` are kept only when the level hands
 * over the code's plan, lines between `<!-- L2 L3 -->` and `<!-- end -->` only when it does not; the marks go.
 */
export function forLevel(text, codePlan) {
  let keep = null; const out = [];
  for (const line of text.split('\n')) {
    const m = /^<!-- (L4|L2 L3|end) -->\s*$/.exec(line);
    if (m) { if (m[1] === 'end') { if (keep == null) throw new Error('brief: an <!-- end --> with no level before it'); keep = null; } else { if (keep != null) throw new Error('brief: a level mark inside another'); keep = (m[1] === 'L4') === codePlan; } continue; }
    if (keep !== false) out.push(line);
  }
  if (keep != null) throw new Error('brief: a level mark with no <!-- end -->');
  return out.join('\n');
}
/** The choice a session starts from: nothing changed (the code planner's plan), or in every session its own script, still to be written. */
const startChoice = codePlan => (codePlan ? { kind: 'settings', settings: {}, why: '' } : { kind: 'script', script: 'script.json', why: '' });
/** The files of the code's plan in a session's folder (the preflight only). */
const AUTO_FILES = ['auto/settings.json', 'auto/plan.json', 'auto/plan-to-edit.json', 'auto/washes.txt', 'auto/plan.png'];

/**
 * The session's folder, written into `dir`: TASK.md (the prompt), README.md, choice.json, the unpaint command,
 * own-script-brief.md, and for the preflight auto/ (the code planner's plan: its picture alone, its washes as a table and as
 * data, the settings), beside the inputs/ the packet already holds. Nothing here sets a plan against the subject:
 * that is a look. `codePlan`: the level hands over the code's plan and planner (levels.mjs; said by every caller).
 * Without it there is no auto/, the briefs say nothing of the code's plan (forLevel), and choice.json starts as the
 * model's own script, not yet written. `packet` is preparePacket()'s; `auto` {picture: PNG buffer of the plan alone,
 * washesText, plan} (the preflight only); `settings` settingsList() (the preflight only); `forms` [{id, name, kind, boxMm}] with
 * `formsIds` the id map's file, or null. Returns {prompt, files}. Nothing of this machine's paths goes into any file.
 */
export function writeSession({ dir, packet, sheet, medium, codePlan, auto = null, settings = null, forms = null, formsIds = null, looks, wallMinutes, steps = DEFAULT_STEPS, graceMinutes = DEFAULT_GRACE_MINUTES, reverts = DEFAULT_REVERTS, briefFile, readmeFile, handed = [], drawing = null, tools = TOOLS_OPEN }) {
  if (typeof codePlan !== 'boolean') throw new Error('session: say whether this level hands over the code\'s plan (codePlan true for the preflight only)');
  if (codePlan && !(auto && settings)) throw new Error('session: the preflight\'s folder holds the code\'s plan and its settings, and none were given');
  if (!codePlan && (auto || settings)) throw new Error(`session: ${OWN_SCRIPT_ONLY}; it is not started`);
  const mk = d => fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const d of [...(codePlan ? ['auto'] : []), 'plans', 'looks', '.requests']) mk(d);
  const put = (f, text) => fs.writeFileSync(path.join(dir, f), text);
  const ink = /^ink/.test(medium), v = { TOOLS_NOTE: tools, STEPS_MOST: steps, SHEET_W: sheet.widthMm, SHEET_H: sheet.heightMm, WALL_MINUTES: wallMinutes, GRACE_MINUTES: graceMinutes, LOOKS_MOST: looks, REVERTS_MOST: reverts,
    DRAWING_NOTE: ink ? 'As prepared, the drawing is waterproof ink laid before the washes; it carries the form and the washes go over it.' : 'As prepared, the drawing is light pencil laid before the washes; it only places the forms, and the paint carries form, value and edge.',
    INPUT_LIST: packet.files.map(f => `- \`${f}\`: ${f.includes('source') ? 'the SUBJECT, the picture to paint' : f.includes('drawing') ? 'the opening DRAWING, already on the sheet before any wash' : f.includes('forms') ? 'the NAMED FORMS, each one flat colour' : `block-in STUDY ${/study-(\d)/.exec(f)?.[1]}: the subject simplified to flat shapes (1 the broad shapes, 2 the middle study, 3 details and accents)${codePlan ? '; the code planner reads its washes from these' : ''}`}`).join('\n') };
  let prompt = fill(forLevel(fs.readFileSync(briefFile, 'utf8'), codePlan), v);
  // what the session is handed beside the subject's inputs (a later try: its own previous try; level 4: the automatic
  // painter's painting): each a folder of plain files and a paragraph of the task; never a number
  const pictures = [];
  for (const h of handed) {
    mk(h.folder);
    for (const f of h.files) { const to = path.join(dir, h.folder, f.name); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(f.from, to); fs.chmodSync(to, 0o444); if (f.picture) pictures.push(`${h.folder}/${f.name}`); }
    // what it is handed is read-only: its own copy of each file, which it may read and copy out, never change in place (the originals lie outside its folder, where it cannot write)
    prompt += `\n## ${h.title}\n\n${h.words}\n\n${h.files.map(f => `- \`${h.folder}/${f.name}\`: ${f.what}`).join('\n')}\n`;
  }
  if (pictures.length) prompt += `\n${seenAsk(pictures)}\n`;
  put('TASK.md', prompt); put('README.md', fill(forLevel(fs.readFileSync(readmeFile, 'utf8'), codePlan), v));
  put('own-script-brief.md', packet.brief);
  put('choice.json', JSON.stringify(startChoice(codePlan), null, 1) + '\n');
  put('unpaint', UNPAINT_SH); fs.chmodSync(path.join(dir, 'unpaint'), 0o755);
  if (codePlan) {
    put('auto/settings.json', JSON.stringify({ note: 'Write a setting into choice.json under "settings" by its "set" name. "now" is the value the code planner\'s plan in this folder was made with.', settings }, null, 1) + '\n');
    put('auto/plan.json', JSON.stringify(auto.plan, null, 1) + '\n'); if (auto.toEdit) put('auto/plan-to-edit.json', JSON.stringify(auto.toEdit, null, 1) + '\n'); put('auto/washes.txt', auto.washesText); fs.writeFileSync(path.join(dir, 'auto/plan.png'), auto.picture);
  } else {
    // in a session nothing of the code's plan is in the folder, and the words given say nothing of it
    const told = ['TASK.md', 'README.md', 'own-script-brief.md'].find(f => /code planner|code's plan|auto\//.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    if (told || AUTO_FILES.some(f => fs.existsSync(path.join(dir, f)))) throw new Error(`session: ${told ? `${told} speaks of the code's plan` : 'the folder holds the code\'s plan'}, and ${OWN_SCRIPT_ONLY}; the session is not started`);
  }
  if (forms && formsIds) { fs.copyFileSync(formsIds, path.join(dir, 'inputs/forms-ids.png')); put('inputs/forms.json', JSON.stringify(forms.map(f => ({ id: f.id, name: f.name, kind: f.kind, boxMm: f.boxMm ?? null })), null, 1) + '\n'); }
  // the drawing's lines, each one a row an author may choose, weight or move after the washes (lines-edit.mjs): `drawing` {listing, picture}
  if (drawing) { mk('drawing'); put('drawing/lines.json', JSON.stringify(drawing.listing) + '\n'); if (drawing.picture) fs.writeFileSync(path.join(dir, 'drawing/all-lines.png'), drawing.picture); }
  const leak = [os.homedir(), os.userInfo().username].filter(Boolean);
  for (const f of ['TASK.md', 'README.md', 'own-script-brief.md', ...AUTO_FILES.filter(f => !f.endsWith('.png')), 'inputs/forms.json', 'drawing/lines.json']) {
    if (fs.existsSync(path.join(dir, f)) && leak.some(w => fs.readFileSync(path.join(dir, f), 'utf8').includes(w))) throw new Error(`session: ${f} would carry a path or name of this machine; the session is not started`);
  }
  return { prompt, pictures };
}

/** The looks already written in a run's ledger (one JSON line a look). The ledger lies outside the model's folder. */
export function ledgerLooks(ledger) {
  if (!fs.existsSync(ledger)) return [];
  return fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.look);
}

/** The words beside each command's token split: how it reports them, and what is not reported. */
const SPLIT_FROM = {
  agy: 'agy reports input (fresh), cache_read (cached) and output per response; thinking tokens it reports apart, and its total is input + output',
  claude: 'claude reports input, cache_creation (counted as fresh input, and also shown as cacheWriteIn), cache_read (cached) and output',
  codex: 'codex reports input (cached included; fresh = input - cached) and output per turn',
};
/** The split of a transcript's tokens, or a plain record that its command did not report one. */
function tokenSplit(cli, split) {
  if (!split) return { reported: false, note: `the ${cli ?? 'model'} transcript reported no token split (fresh input, cached input, output)` };
  return { reported: true, ...split, from: SPLIT_FROM[cli] ?? `as the ${cli} transcript reported them` };
}

/**
 * The answering side of the session: the one broker. `compile(choice, script, n)` plans a checked choice outside the
 * model's folder and resolves {ok, error, summary, rows}; `checkScript(obj)` returns a checked script or throws.
 * `look(choice, script, {plan, look}, edit, compiled, {until, region})` paints a compiled choice for real, small, outside the folder
 * and resolves {ok: true, picture (the dried sheet beside the source and the middle study, PNG), stages (the stage
 * strip, PNG, or null), numbersText, marked, planPicture (the plan's diagram, PNG, or null), painted (what was
 * painted: cells, seconds, backend)} or {ok: false, error}: a painting that failed, or did not stay on the GPU, shows
 * nothing and is no look. `ledger` is a file outside the folder: every request is appended to it, and a look is
 * appended (and synced) once it is painted and BEFORE anything of it is delivered, so a look that fails on the way
 * to the folder is still spent, and a server started again for the same run goes on from the count already there.
 * `keep`: a folder outside the model's folder where each look is kept as it was shown (keep/N/: the choice and its
 * script or edited plan as looked at, the dried sheet, the stages, the numbers). The time a request waits on this
 * side (the planner, a look's painting) is not the model's own, and is measured apart. start() begins polling; stop()
 * ends it and returns the record.
 * The budget (`looks`: look units of rendering, look-cost.mjs; `wallMinutes`, `graceMinutes`) is the benchmark's, for its machines, the same for every model:
 * the wall clock runs from begin(), looks and planning included. When the looks are used a look is not painted; when
 * the minutes are used no look is painted, a plan still is (so the hand-in can be checked), and every answer asks the
 * session to hand in; `graceMinutes` later over() is true and the command is ended. Nothing else stops a session.
 * `reverts`: returns to an earlier choice allowed (reverts.mjs); `startKey`: the fingerprint of the choice the session
 * starts from. `pictures`: handed pictures that each need a line in seen.md before the first plan (seen.mjs).
 * `codePlan`: the level hands over the code's plan and planner (the preflight); without them a plan or a look of anything
 * but the model's own script is refused with OWN_SCRIPT_ONLY (choice.mjs readChoice), and nothing is spent.
 */
export function sessionServer({ dir, codePlan = true, sheet = null, forms = [], looks: most = DEFAULT_LOOKS, wallMinutes = DEFAULT_WALL_MINUTES, graceMinutes = DEFAULT_GRACE_MINUTES, steps: stepsMost = DEFAULT_STEPS, stepsTaken = () => 0, lookSize = 'half', reverts: revertsMost = DEFAULT_REVERTS, startKey = null, pictures = [], compile, look: paintLook, keep = null, checkScript, checkPlan = null, checkTools = null, ledger, now = Date.now, everyMs = 400 }) {
  if (!(most > 0) || !(wallMinutes > 0) || !(stepsMost > 0)) throw new Error('session: the budget is a number of look units and of steps, and the safety stop a number of minutes, each above 0');
  const plans = [], cache = new Map(), painted = new Map(), requests = [], good = new Set(), seen = new Map(), reverts = revertCounter(revertsMost, startKey);
  let t0 = now(), waitMs = 0, busy = false, timer = null, lastGood = null, n = 0, pending = null, lastEnd = t0, reached = null, warningsGiven = 0, described = null;
  const note = entry => { const fd = fs.openSync(ledger, 'a'); try { fs.writeSync(fd, JSON.stringify(entry) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } };
  const used = () => ledgerLooks(ledger).length;
  // rendering spent, in look units: what each look cost when it was painted (a ledger line without a cost is a full look)
  const spent = () => +ledgerLooks(ledger).reduce((a, l) => a + (l.cost ?? 1), 0).toFixed(2), unitsLeft = () => +Math.max(0, most - spent()).toFixed(2);
  // the model's own time: the clock less every stretch a request of its was waiting on this side (a stretch counted once)
  const ownSeconds = () => Math.round((now() - t0 - waitMs - (pending == null ? 0 : now() - pending)) / 1000);
  const wallSeconds = () => Math.round((now() - t0) / 1000), wallUp = () => wallSeconds() >= wallMinutes * 60;
  const steps = () => stepsTaken() ?? 0, stepsUp = () => steps() >= stepsMost, SAFETY = `the safety stop (${wallMinutes} minutes on the clock)`;
  const check = () => { if (wallUp()) reach(SAFETY); if (stepsUp()) reach(`${stepsMost} steps`); };
  // the budget is reached once, by whichever comes first; it is recorded with when, and said in every answer after
  const reach = what => { if (!reached) { reached = { what, safetyStop: what === SAFETY, atWallMinutes: +(wallSeconds() / 60).toFixed(1), looks: used(), lookUnits: spent(), steps: steps() }; note({ budgetReached: reached }); } };
  const HAND_IN = 'Hand in what you have now: leave choice.json as your final choice (./unpaint plan still checks that it compiles), write your last message, and stop.';
  const left = () => { const u = used(), r = reverts.record(); check();
    return `Budget of this try (the benchmark's, the same for every model and machine): ${spent()} of ${most} rendering units spent on ${u} look${u === 1 ? '' : 's'}, ${steps()} of ${stepsMost} steps (your tool calls) taken, ${r.count} of ${r.allowed} returns to an earlier choice. Plans made: ${plans.length}. Time is not budgeted.${reached ? `\nTHE BENCHMARK'S RESOURCE BUDGET IS REACHED (${reached.what}). ${HAND_IN}${reached.safetyStop ? ` The session is ended ${graceMinutes} minutes after the safety stop.` : /steps/.test(reached.what) ? ` The session is ended after ${STEP_GRACE} more steps.` : ''}` : ''}`; };
  /** The handed pictures each described in seen.md, or the words that ask for it. */
  const seenFault = () => {
    if (!pictures.length || described?.ok) return null;
    let text = null; try { text = safeRead(dir, 'seen.md'); } catch { /* not written yet */ }
    described = readSeen(text, pictures);
    return described.ok ? null : `REFUSED, nothing was planned: ${described.missing.length} of the pictures you were handed have no line in seen.md yet (${described.missing.join(', ')}). ${seenAsk(pictures)}`;
  };
  const warned = list => { if (!list?.length) return ''; warningsGiven += list.length; return `\nWARNINGS (${list.length}; each is laid as you wrote it, and is yours to heed or ignore):\n${list.slice(0, 80).map(x => `- ${x}`).join('\n')}\n`; };

  /** The folder's present choice, checked: {choice, script, scriptText, key}. Throws with the reason. */
  function present() {
    const choice = readChoice(safeJson(dir, 'choice.json').value, { codePlan }); let script = null, edit = null, text = '';
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
    // what the choice was warned of: its own form (choice.mjs), and its tools (session-tools.mjs)
    const warnings = [...(choice.warnings ?? []), ...(tools?.warnings ?? [])];
    const drawn = choice.tools && (choice.tools.lines || choice.tools.medium) ? choice.sets.map(([k]) => k).filter(k => ['drawingorder', 'drawinglast', 'drawinglastmin', 'outlinemedium'].includes(k)) : [];
    if (drawn.length) warnings.push(`your settings name ${drawn.join(', ')}, and your choice also names lines or a medium of your own: the drawing follows your lines and medium, and those settings are not used`);
    return { choice, script, edit, text, tools, warnings, key: choiceKey(choice, text) };
  }

  async function answer(cmd, words = []) {
    if (cmd === 'status') return left();
    check();
    // what the look is asked of: the whole painting, or stopped after a stage, or a region (look-cost.mjs)
    const looking = cmd === 'look' || cmd === 'cost'; let ask = { until: null, region: null };
    if (looking) { try { ask = readLookAsk(words); } catch (e) { return `REFUSED, nothing was painted and nothing was spent: ${e.message}`; } }
    else if (words.length) return `REFUSED: ./unpaint ${cmd} takes no further words.`;
    if (cmd === 'look' && reached && !/rendering units/.test(reached.what)) return `NOT PAINTED, no look was counted: the benchmark's resource budget for this try is reached (${reached.what}). This is the benchmark's limit on its machines, not a judgment of your work.\n${left()}`;
    const unseen = seenFault(); if (unseen) return unseen;
    let p; try { p = present(); } catch (e) { return `REFUSED, nothing was planned${cmd === 'look' ? ' and no look was counted' : ''}: ${e.message}`; }
    // a return to a choice the session had left is counted; past the allowed number it is refused (reverts.mjs)
    const back = reverts.see(p.key, ownSeconds());
    if (back.refused) return `REFUSED, nothing was planned${cmd === 'look' ? ' and no look was counted' : ''}: this choice is one you planned before and then left, and you have gone back to an earlier choice ${back.count} times, the most this benchmark allows (${revertsMost}). Going back again and again to keep only what a look liked is the one thing a session may not do. Go on from your present work: change it, do not undo it.\n${left()}`;
    const id = ++n, what = choiceKind(p.choice), atSeconds = ownSeconds(), t1 = now();
    let got = cache.get(p.key);
    if (!got) { try { got = await compile(p.choice, p.script, id, p.edit?.edit ?? null); } catch (e) { got = { ok: false, error: e.message }; } cache.set(p.key, got); }
    const entry = { n: id, atSeconds, atWallSeconds: wallSeconds(), seconds: got.seconds ?? Math.round((now() - t1) / 1000), revert: back.revert, what, kind: p.choice.kind, settings: Object.fromEntries(p.choice.sets), script: p.choice.script, plan: p.choice.plan ?? null, edit: p.edit?.record ?? null, tools: p.tools?.record ?? null, why: p.choice.why, key: p.key, ok: got.ok, error: got.ok ? null : got.error, washes: got.summary?.washes ?? null, strokes: got.summary?.strokes ?? null, look: null };
    plans.push(entry);
    if (!got.ok) return `REFUSED by the planner${cmd === 'look' ? ', no look was counted' : ''}: ${got.error}`;
    good.add(p.key); lastGood = { choice: p.choice, script: p.script, edit: p.edit, tools: p.tools, warnings: p.warnings, key: p.key, plan: id };
    // what the choice's tools made of the given drawing and forms, as pictures and data of the author's own (mine/)
    for (const f of got.toolFiles ?? []) safeWrite(dir, f.rel, f.data);
    const s = got.summary, line = `${s.passages != null ? `${s.passages} passages, ` : s.shapes != null ? `${s.shapes} shapes, ` : ''}${s.washes} washes, ${s.strokes ?? '?'} strokes, widest wash brush ${s.widestBrushMm ?? '?'} mm${s.washesByStage ? `, washes by stage ${s.washesByStage.join('/')}` : ''}`;
    // a free plan answers with whether it compiled and its counts: no picture, no colours, no places
    // (the painter's own count of the edit when it applied one: it holds the notes of what was laid the nearest way)
    const er = got.editRecord ?? p.edit?.record ?? null; if (er) entry.edit = er;
    const editSaid = er ? ` Your edit: ${editLine(er)}.${er.notes.length ? `\n${er.notes.length} note${er.notes.length > 1 ? 's' : ''} on it (each was laid the nearest way that can be; change it if that is not what you want):\n${er.notes.slice(0, 60).map(x => `- ${x}`).join('\n')}\n` : ''}` : '';
    entry.warnings = p.warnings.length ? p.warnings : undefined;
    // what this look would cost, from the plan as compiled, before anything is painted
    let cost = null, region = null;
    if (looking) {
      try {
        region = regionBox(ask.region, { sheet: sheet ?? { widthMm: Infinity, heightMm: Infinity }, forms });
        if (region && p.choice.kind !== 'script') throw new Error('a look of a region is painted for your own script only (its passages are written in millimetres, so those in the box can be painted by themselves); the code planner\'s plan and an edited plan are painted whole, or stopped at a stage with --until');
      } catch (e) { return `REFUSED, nothing was painted and nothing was spent: ${e.message}`; }
      // a region look paints the script's passages that touch the box: its cost is their share of the passages
      if (region) { const inR = scriptInRegion(p.script, region.box); if (!inR.kept) return `REFUSED, nothing was painted and nothing was spent: no passage of your script touches the region ${region.box.join(', ')} mm`; region.passages = inR.kept; region.of = inR.of; region.passageShare = inR.kept / inR.of; }
      // a fixed price by size and share (look-cost.mjs), whatever is in the look: how it paints costs nothing
      cost = lookCost(got.rows ?? [], { until: ask.until, regionShare: region?.passageShare ?? null, size: lookSize });
    }
    const askKey = `${p.key}:${ask.until ?? ''}:${region ? region.box.join(',') : ''}`, costSaid = cost ? `${cost.cost} unit${cost.cost === 1 ? '' : 's'} (${ask.until != null ? `stopped after stage ${ask.until}: ${cost.washes} of the plan's ${cost.of} washes` : `the whole plan, ${cost.of} washes`}${region ? `; the region ${region.name ? `"${region.name}", ` : ''}${region.box.join(', ')} mm, which ${region.passages} of your ${region.of} passages touch` : ', the whole sheet'})` : '';
    const edited = `${editSaid}${p.tools ? ` ${p.tools.said}${got.toolFiles?.length ? ` See ${got.toolFiles.map(f => f.rel).join(', ')}.` : ''}` : ''}${warned(p.warnings)}${back.revert ? `\nThis is a return to a choice you had left: ${back.count} of ${revertsMost} allowed.` : ''}`;
    // ... and of the strokes too small for a wet bed, before anything is painted (plan-data.mjs tinyTouchWarning)
    const tiny = tinyTouchWarning(s) + (s.erases?.said ?? '');
    if (cmd === 'plan') return `It compiles (${what}): ${line}.${travelLine(s.handTravel)}${edited}${tiny}${costLine(got.rows ?? [], unitsLeft(), lookSize)} Nothing else is shown without a look.\n${left()}`;
    if (cmd === 'cost') return `This look would cost ${costSaid}. You have ${unitsLeft()} of ${most} units left. Nothing was painted and nothing was spent.${painted.has(askKey) ? ' (You have already looked at exactly this: looking again renders nothing and costs nothing.)' : ''}\n${left()}`;
    // the same look of the same choice was rendered already: it is shown again and costs nothing
    const charge = painted.has(askKey) ? 0 : cost.cost;
    if (charge > unitsLeft() + 1e-9) { reach(`${most} rendering units`); return `NOT PAINTED, nothing was spent: this look costs ${costSaid} and you have ${unitsLeft()} of ${most} units left. This is the benchmark's limit on its machines, not a judgment of your work. A look stopped at an earlier stage (--until) or of a region (--region) costs less; ./unpaint cost says what one would cost.\n${left()}`; }
    // a look is the choice painted for real, small: the painter runs outside the folder. A painting that fails, or
    // does not stay on the GPU, shows nothing and is no look. The same choice looked at again is not painted again
    // (and is a look again).
    const look = used() + 1;
    let seenIt = painted.get(askKey);
    if (!seenIt) { try { seenIt = await paintLook(p.choice, p.script, { plan: id, look }, p.edit?.edit ?? null, got, { until: ask.until, region }); } catch (e) { seenIt = { ok: false, error: e.message }; } if (seenIt?.ok) painted.set(askKey, seenIt); }
    if (!seenIt?.ok) { note({ notPainted: String(seenIt?.error ?? 'no painting').slice(0, 300), plan: id, key: p.key }); return `NOT PAINTED, no look was counted: ${seenIt?.error ?? 'the painter gave no painting'}\nYour choice compiles (${what}): ${line}. Ask for the look again, or go on.\n${left()}`; }
    // charged its fixed price, as quoted; its work (sweeps, dryings, water steps, cell-steps) is recorded beside the charge and never charged
    const charged = charge, chargedFrom = `the fixed price of a ${lookSize}-size look of ${ask.until != null || region ? 'part of ' : ''}the sheet`;
    // the look is spent before it is delivered: whatever happens to the delivery, it stays spent
    note({ look, cost: charged, quoted: charge, chargedFrom, size: lookSize, work: seenIt.painted?.work ?? null, ask: { until: ask.until, region: region ? { box: region.box, name: region.name, sheetShare: +region.share.toFixed(4), passages: region.passages, of: region.of } : null }, estimate: cost, plan: id, atSeconds, at: new Date(now()).toISOString(), what, kind: p.choice.kind, settings: entry.settings, script: p.choice.script, plan: p.choice.plan ?? null, edit: er, tools: p.tools?.record ?? null, key: p.key, marked: seenIt.marked ?? null, painted: seenIt.painted ?? null });
    entry.look = look;
    const folder = `looks/${look}`, t = p.choice.tools, choiceText = JSON.stringify({ kind: p.choice.kind, settings: entry.settings, script: p.choice.script, plan: p.choice.plan ?? null, ...(t ? { lines: t.lines ?? undefined, forms: t.forms ?? undefined, perForm: t.perFormGiven ?? undefined, medium: t.medium ?? undefined, ink: t.ink ?? undefined } : {}), why: p.choice.why }, null, 1) + '\n';
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
    return `LOOK ${look} (${what}), cost ${charged} unit${charged === 1 ? '' : 's'}${charge ? ` (${chargedFrom})` : ' (looked at before: nothing was rendered)'}, ${unitsLeft()} of ${most} left${seenIt.stoppedText ? `. ${seenIt.stoppedText.split('\n')[0]}` : ''}${region ? `. Only the passages in the region were painted (${seenIt.painted?.regionPassages ?? '?'})` : ''}. PAINTED${seenIt.painted?.cells ? ` small (${seenIt.painted.cells} cells across${seenIt.painted.fullCells ? ` of the final ${seenIt.painted.fullCells}` : ''})` : ''} and dried: ${line}.${edited}\nOpen ${folder}/beside.png: your painting as it dried, the subject and the middle study, left to right, on the same grid.${seenIt.stages ? ` Open ${folder}/stages.png: the subject, then the sheet at 10, 25, 50, 75 and 100% of the strokes (the order of the work).` : ''} Read ${folder}/numbers.txt: each named form on the DRIED sheet against the study and against your plan${m ? `; ${m.forms} named forms are marked !! (too dark or too pale)${m.washes ? ` and ${m.washes} washes` : ''}` : ''}. ${folder}/plan.json holds every wash as data${seenIt.planPicture ? `, ${folder}/plan.png the plan as a diagram` : ''}.\nStep back from it as from the easel, and revise for what you see.\n${left()}`;
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
        let words = [];
        try { const line = safeRead(dir, `.requests/${f}`).trim(), [word, ...rest] = /^[A-Za-z0-9 ,.'_-]{1,300}$/.test(line) ? line.split(/\s+/) : ['']; cmd = ['status', 'plan', 'look', 'cost'].includes(word) ? word : 'unknown'; words = rest; } catch { /* a request that is a link, a folder or too large is not read */ }
        try { text = cmd === 'unknown' || cmd === 'unreadable' ? 'REFUSED: a request is one of status, plan, look, cost, written by ./unpaint.' : await answer(cmd, words); } catch (e) { text = `the command failed on this side${cmd === 'look' ? '; if a look was counted it stays counted (./unpaint status says)' : ''}. ${left()}`; note({ fault: String(e.message).slice(0, 300), cmd }); }
        try { fs.rmSync(path.join(req, f), { recursive: true, force: true }); safeWrite(dir, `.requests/${id}.ans.tmp`, text + '\n'); fs.renameSync(path.join(req, `${id}.ans.tmp`), path.join(req, `${id}.ans`)); } catch (e) { note({ fault: `answer not delivered: ${String(e.message).slice(0, 200)}`, cmd }); }
        lastEnd = now(); waitMs += lastEnd - asked; pending = null;
        const entry = { cmd, seconds: Math.round((lastEnd - asked) / 1000), answer: text.split('\n')[0].slice(0, 200) }; requests.push(entry); note({ request: cmd, at: new Date(lastEnd).toISOString(), seconds: entry.seconds, answer: entry.answer });
      }
    } finally { busy = false; }
  }

  return {
    start() { timer = setInterval(() => { tick().catch(() => {}); }, everyMs); }, tick, ownSeconds, wallSeconds, present, looksTaken: used,
    /** The model's command starts now: the clock runs from here (not from when this side was made ready). */
    begin() { t0 = now(); waitMs = 0; lastEnd = Math.max(lastEnd, t0); reached = null; },
    /** The safety stop and its minutes to hand in, or the steps and their grace, are used: the command is ended. */
    over: () => { check(); return wallSeconds() >= (wallMinutes + graceMinutes) * 60 || steps() >= stepsMost + STEP_GRACE; },
    /** Whether handing over this choice would be a return to an earlier choice past the allowed number. */
    barred: key => reverts.barred(key),
    async stop() { if (timer) clearInterval(timer); while (busy) await new Promise(r => setTimeout(r, 50));
      // the pictures as described when the session ended (a session that never planned is read here)
      if (pictures.length && !described?.ok) { let text = null; try { text = safeRead(dir, 'seen.md'); } catch { /* none */ } described = readSeen(text, pictures); }
      return { looks: ledgerLooks(ledger), plans, requests, ownSeconds: ownSeconds(), wallSeconds: wallSeconds(), waitSeconds: Math.round(waitMs / 1000), lastGood, good, budgetReached: reached, lookUnits: { spent: spent(), budget: most }, steps: { taken: steps(), budget: stepsMost }, reverts: reverts.record(), warningsGiven, pictures: pictures.length ? { handed: pictures, said: described.said, missing: described.missing } : null }; },
  };
}

/**
 * What is painted when the session has ended: the folder's choice when it is sound and the planner compiled it in
 * this session (`good` holds the keys of the choices that did; a choice that changes nothing is the code planner's
 * plan, which compiled before the session began); else the last choice that compiled, with the reason; else nothing
 * (a failed run). `ended` is 'done' or 'budget reached'. `barred(key)`: the hand-in would be a return past the allowed number.
 * `codePlan` false (every session): there is no code planner's plan to fall back on; a session whose own script was
 * never planned and compiled has handed in nothing, and that is its failure, said so.
 * {choice, script, submitted: {kind, what, settings, script, why, from, note}} or {failure}.
 */
export function finalChoice({ present, lastGood, good = new Set(), ended, barred = () => false, codePlan = true }) {
  const say = (c, from, note) => ({ kind: c.choice.kind, what: choiceKind(c.choice), settings: Object.fromEntries(c.choice.sets), script: c.choice.script, plan: c.choice.plan ?? null, edit: c.edit?.record ?? null,
    ...(c.choice.tools ? { tools: { lines: c.choice.tools.lines, forms: c.choice.tools.forms, perForm: c.choice.tools.perFormGiven, ...(c.choice.tools.medium ? { medium: c.choice.tools.medium } : {}), ...(c.choice.tools.ink ? { ink: c.choice.tools.ink } : {}), record: c.tools?.record ?? null } } : {}), ...(c.warnings?.length ? { warnings: c.warnings } : {}), why: c.choice.why, from, note });
  const cut = ended === 'done' ? null : 'the session reached the benchmark\'s resource budget and was ended';
  let p = null, why = null;
  try { p = present(); } catch (e) { why = e.message; }
  // the one hard rule: a hand-in that goes back to an earlier choice past the allowed number is not taken
  if (p && barred(p.key)) { why = 'it goes back to an earlier choice, and the session had already gone back as often as this benchmark allows'; p = null; }
  if (p && (good.has(p.key) || (codePlan && p.choice.kind === 'settings' && !p.choice.sets.length && !p.choice.tools))) return { choice: p.choice, script: p.script, edit: p.edit?.edit ?? null, submitted: say(p, 'choice.json as the session left it', cut) };
  if (p) why = 'it was never planned, so it is not known to compile';
  else if (!why) why = 'it could not be read';
  if (lastGood) return { choice: lastGood.choice, script: lastGood.script, edit: lastGood.edit?.edit ?? null, submitted: say(lastGood, `the last choice that compiled (plan ${lastGood.plan})`, `the final choice.json was not taken: ${why}${cut ? `; ${cut}` : ''}`) };
  if (!codePlan) return { failure: `nothing handed in: the session's final choice.json was not taken and no script of its own had compiled (${why}); at no level does anything stand in for it`, nothingHandedIn: true };
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
export function seatbelt({ deny, write, cwd, local = false, gated = false, readable = [], hidden = [], metadata = [] }) {
  // hidden: folders nothing may list or read (the home folder, other users, other volumes), save what is read again after
  // them: its own folder, `readable` (the toolbox, the model command's own program and settings) and `write`
  // gated: nothing goes out but to this machine's loopback, where the session's gate (session-net.mjs) passes the
  // model's own service only; readable: folders read again after the denials (the toolbox's Python)
  return ['(version 1)', '(allow default)',
    '(deny file-write*)', `(allow file-write* ${write.map(d => `(subpath ${q(d)})`).join(' ')} (literal "/dev/null") (literal "/dev/dtracehelper") (regex #"^/dev/tty"))`,
    `(deny file-read* file-write* ${deny.map(d => `(subpath ${q(d)})`).join(' ')} (regex #"/unpaint-session-"))`,
    ...(hidden.length ? [`(deny file-read* ${hidden.map(d => `(subpath ${q(d)})`).join(' ')})`, `(allow file-read* ${write.map(d => `(subpath ${q(d)})`).join(' ')})`] : []),
    `(allow file-read* file-write* (subpath ${q(cwd)}))`, ...readable.map(d => `(allow file-read* (subpath ${q(d)}))`), ...metadata.map(d => `(allow file-read-metadata (literal ${q(d)}))`),
    '(deny network*)', ...(gated ? ['(allow network-outbound (remote ip "localhost:*"))'] : ['(allow network-outbound (remote tcp "*:443") (remote udp "*:53") (remote tcp "*:53") (literal "/private/var/run/mDNSResponder"))', '(allow network-inbound (local udp "*:*"))']), '(allow system-socket)',
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
export function sessionCall(author, { prompt, cwd, deny = [], images = [], home = os.homedir(), tmp = os.tmpdir(), gate = null, toolbox = null }) {
  const real = d => { try { return fs.realpathSync(d); } catch { return d; } }, all = [...new Set(deny.flatMap(d => [d, real(d)]))];
  if (author.cli === 'claude' && gate) {
    // closed: the whole command under this harness's profile (its own sandbox off: two do not nest), out only through
    // the gate; of the home folder it reads only its program and the login keychain (its sign-in: the accepted
    // exposure, SIGN_IN_EXPOSURE); measured, it signs in and answers without ~/.claude or ~/.claude.json
    const bin = (() => { try { return real(execFileSync('/usr/bin/which', ['claude'], { encoding: 'utf8' }).trim()); } catch { return null; } })();
    const signIn = [path.join(home, 'Library', 'Keychains')];
    const profile = seatbelt({ deny: all, write: [...new Set([real(tmp), '/private/tmp', '/private/var/folders'])], cwd: real(cwd), local: true, gated: true,
      readable: [...new Set([...(toolbox?.readable ?? []), ...(bin ? [path.dirname(bin)] : []), ...signIn])], hidden: [...new Set([home, real(home), '/Users', '/Volumes'])], metadata: [path.join(home, '.local', 'bin'), path.join(home, '.local', 'bin', 'claude'), home] });
    const settings = { sandbox: { enabled: false }, permissions: { deny: all.map(d => `Read(/${d}/**)`) } };
    return { cmd: 'sandbox-exec', env: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', BASH_DEFAULT_TIMEOUT_MS: '120000', BASH_MAX_TIMEOUT_MS: '600000', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', ...proxyEnv(gate.url), ...(toolbox?.env ?? {}) }, unset: [], profile, gated: true, signIn,
      // its own permission prompts off inside the profile, as agy's and codex's are: headless, a prompt is a refusal (the
      // 22 Nov preflight: a compound shell command "requires approval" and a Write to seen.md was refused as sensitive)
      args: ['-p', profile, 'claude', '-p', prompt, '--model', author.id, ...(author.effort ? ['--effort', author.effort] : []), '--allowedTools', 'Read Write Edit Glob Grep Bash', '--dangerously-skip-permissions', '--settings', JSON.stringify(settings), '--setting-sources', 'project', '--no-session-persistence', '--output-format', 'stream-json', '--verbose'],
      probe: file => ({ cmd: 'sandbox-exec', args: ['-p', profile, '/bin/cat', file] }),
      closed: `the whole command runs under a seatbelt profile of this harness (its own sandbox off): nothing of the home folder can be listed or read but its program and the login keychain (${SIGN_IN_EXPOSURE}), it writes only in its folder and temporary folders, and reaches only this machine's loopback, where a gate passes its own service's hosts and refuses every other (its own permission prompts are off inside the profile)` };
  }
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
    // with a gate (session-net.mjs) its network is the gate's: the model's service only; with a toolbox, its Python is on PATH and installs are answered by shims
    // closed (a gate): nothing of the home folder, other users or other volumes can be listed or read, but its own
    // program, its settings folder and the toolbox
    const agy = (() => { try { return real(execFileSync('/usr/bin/which', ['agy'], { encoding: 'utf8' }).trim()); } catch { return null; } })();
    // its sign-in (accepted exposure, SIGN_IN_EXPOSURE): its handle in Application Support and the login keychain; its own folder seen, not listed
    const signIn = gate ? [path.join(home, 'Library', 'Application Support', 'antigravity'), path.join(home, 'Library', 'Keychains')] : [];
    const readable = [...(toolbox?.readable ?? []), ...(gate && agy ? [agy] : []), ...signIn];
    const profile = seatbelt({ deny: all, write: [...new Set([path.join(home, '.gemini'), real(tmp), '/private/tmp', '/private/var/folders'])], cwd: real(cwd), local: true, gated: Boolean(gate), readable: [...new Set(readable)], hidden: gate ? [...new Set([home, real(home), '/Users', '/Volumes'])] : [], metadata: gate && agy ? [path.dirname(agy), home] : [] });
    return { cmd: 'sandbox-exec', env: { DO_NOT_TRACK: '1', ...(gate ? proxyEnv(gate.url) : {}), ...(toolbox?.env ?? {}) }, unset: [], profile, serial: true, gated: Boolean(gate), signIn,
      args: ['-p', profile, 'agy', '-p', prompt, '--model', author.id, '--dangerously-skip-permissions', '--output-format', 'stream-json'],
      probe: file => ({ cmd: 'sandbox-exec', args: ['-p', profile, '/bin/cat', file] }),
      closed: `the whole command runs under a seatbelt profile of this harness: neither its shell nor its file tools can read the repository, the subject list, the caches or other sessions, it writes only in its folder, its own settings folder and temporary folders, and ${gate ? 'reaches only this machine\'s loopback, where a gate passes its own service\'s hosts and refuses every other (no downloads, no installs)' : 'reaches the network on port 443 and this machine\'s loopback only'} (its own permission prompts are off inside the profile)` };
  }
  throw new Error(`author ${author.key}: a working session needs a shell, and "${author.cli}" is called without one here (claude, codex and agy can)`);
}

/** The exposure the owner accepted for runs on his own machine (22 Nov): the model command signs in from the login keychain, and its shell runs under the same profile. */
export const SIGN_IN_EXPOSURE = 'a session\'s shell can read the model tool\'s own secret and list keychain entry names; accepted by the owner for runs on this machine';

const kindOfCommand = c => { const m = /(?:^|[\s;&|/])unpaint\s+(status|plan|look|cost|wait)\b/.exec(c); return m ? `unpaint ${m[1]}` : 'shell'; };

/**
 * A session's transcript read: {text (its last message), tokens, tokensIn, tokensOut (null where the command does not
 * report them apart), costUSD (the command's own report, or null), calls: {kind: count}, commands: [shell
 * commands in order]}. claude: stream-json lines; codex: --json lines; agy: stream-json lines (a step_update for each
 * step as it starts and ends, the tool's parameters in it, and one result).
 */
export function readTranscript(cli, out) {
  const calls = {}, commands = [], toolSteps = [], byId = new Map(); let text = '', tokens = null, costUSD = null, tokensIn = null, tokensOut = null, split = null;
  // the tokens split as the command reports them: fresh input, cached input, output (tokenSplit below)
  const add = (k, v) => { if (!Number.isFinite(v)) return; split ??= { freshIn: 0, cachedIn: 0, out: 0 }; split[k] = (split[k] ?? 0) + v; };
  const count = k => { calls[k] = (calls[k] ?? 0) + 1; };
  // each tool step for tool-use.mjs: its kind, the command or the place, and once it has ended its exit and the start of its output
  const kindOf = name => (/^(read_file|view_file|list_dir|find_by_name|grep_search|Read|Glob|Grep)$/.test(name) ? 'read' : /^(write_to_file|write_file|replace_file_content|multi_replace_file_content|sed_file|Write|Edit)$/.test(name) ? 'write' : name);
  const stepOf = (id, kind, t) => { const st = { kind, text: String(t), exit: null, failed: false, output: null }; toolSteps.push(st); if (id != null) byId.set(id, st); return st; };
  const ended = (st, { exit = null, failed = false, output = null }) => { if (!st) return; const ex = exit ?? (/exited with code (\d+)/.exec(output ?? '')?.[1] != null ? Number(/exited with code (\d+)/.exec(output)[1]) : null); Object.assign(st, { exit: ex, failed: failed || (ex != null && ex !== 0), output: output == null ? null : String(output).slice(0, 2000) }); };
  const steps = new Set(), said = new Map();
  for (const l of out.split('\n')) {
    let d; try { d = JSON.parse(l); } catch { continue; }
    if (cli === 'agy') {
      const s = d.step_update;
      if (d.event === 'step_update' && s?.step_type === 'tool' && !steps.has(s.step_index)) {
        // a tool step is counted once, when it is first seen (a step cut off by the clock never ends)
        steps.add(s.step_index); const name = s.tool_name ?? s.tool_info?.name ?? 'tool', par = s.tool_info?.parameters ?? {};
        if (name === 'run_command') { const c = String(par.CommandLine ?? ''); commands.push(c); count(kindOfCommand(c)); stepOf(s.step_index, 'shell', c); }
        else { count(/^(read_file|view_file|list_dir|find_by_name|grep_search)$/.test(name) ? 'read file' : /^(write_to_file|replace_file_content|multi_replace_file_content|sed_file)$/.test(name) ? 'write file' : name);
          const places = Object.entries(par).filter(([k, v]) => typeof v === 'string' && /path|file|dir|uri|cwd/i.test(k)).map(([, v]) => v); if (places.length) commands.push(`${name} ${places.join(' ')}`); stepOf(s.step_index, kindOf(name), places.join(' ')); }
      }
      if (d.event === 'step_update' && s?.step_type === 'tool' && s.state && s.state !== 'ACTIVE') ended(byId.get(s.step_index), { failed: s.state !== 'DONE', output: s.tool_info?.output ?? s.error ?? null });
      if (d.event === 'step_update' && s?.step_type === 'agent_response') { if (s.text_delta) said.set(s.step_index, (said.get(s.step_index) ?? '') + s.text_delta); if (s.usage?.total_tokens) { tokens = (tokens ?? 0) + s.usage.total_tokens; add('freshIn', s.usage.input_tokens); add('cachedIn', s.usage.cache_read_tokens); add('out', s.usage.output_tokens); add('thinking', s.usage.thinking_tokens); } }
      if (d.event === 'result' && d.result?.response) text = String(d.result.response);
      continue;
    }
    if (cli === 'claude') {
      if (d.type === 'assistant') for (const b of d.message?.content ?? []) {
        if (b.type === 'text' && b.text?.trim()) text = b.text;
        if (b.type !== 'tool_use') continue;
        if (b.name === 'Bash') { const c = String(b.input?.command ?? ''); commands.push(c); count(kindOfCommand(c)); stepOf(b.id, 'shell', c); }
        else { count(b.name === 'Read' ? 'read file' : ['Write', 'Edit'].includes(b.name) ? 'write file' : b.name); const f = b.input?.file_path ?? b.input?.path; if (f) commands.push(`${b.name} ${f}`); stepOf(b.id, kindOf(b.name), f ?? ''); }
      }
      if (d.type === 'user') for (const b of d.message?.content ?? []) if (b.type === 'tool_result') ended(byId.get(b.tool_use_id), { failed: Boolean(b.is_error), output: typeof b.content === 'string' ? b.content : (b.content ?? []).map(x => x.text ?? '').join('\n') });
      if (d.type === 'result') { const u = d.usage ?? {}; if (d.result) text = String(d.result); const tin = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce((a, k) => a + (u[k] || 0), 0); add('freshIn', (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0)); add('cacheWriteIn', u.cache_creation_input_tokens || 0); add('cachedIn', u.cache_read_input_tokens || 0); add('out', u.output_tokens || 0);
        // several turns of one session (a command run again in the same folder) are one cost: their results add up
        tokensIn = (tokensIn ?? 0) + tin; tokensOut = (tokensOut ?? 0) + (u.output_tokens || 0); tokens = (tokens ?? 0) + tin + (u.output_tokens || 0); if (d.total_cost_usd != null) costUSD = (costUSD ?? 0) + d.total_cost_usd; }
    } else {
      if (d.type === 'item.completed' && d.item) {
        const it = d.item;
        if (it.type === 'agent_message' && it.text) text = it.text;
        else if (it.type === 'command_execution') { const c = String(it.command ?? ''); commands.push(c); count(kindOfCommand(c)); ended(stepOf(null, 'shell', c), { exit: it.exit_code ?? null, output: it.aggregated_output ?? null }); }
        else if (it.type === 'file_change') count('write file');
        else if (it.type !== 'reasoning' && it.type !== 'agent_message') count(it.type);
      }
      if (d.type === 'turn.completed' && d.usage) { add('freshIn', (d.usage.input_tokens || 0) - (d.usage.cached_input_tokens || 0)); add('cachedIn', d.usage.cached_input_tokens || 0); add('out', d.usage.output_tokens || 0); tokensIn = (tokensIn ?? 0) + (d.usage.input_tokens || 0); tokensOut = (tokensOut ?? 0) + (d.usage.output_tokens || 0); tokens = tokensIn + tokensOut; }
    }
  }
  if (cli === 'agy' && !text && said.size) text = [...said].sort((a, b) => a[0] - b[0]).at(-1)[1];
  return { text, tokens: tokens || null, tokensIn: tokensIn || null, tokensOut: tokensOut || null, tokenSplit: tokenSplit(cli, split), costUSD, calls, commands, steps: toolSteps };
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
  for (const c of commands) for (const m of c.matchAll(/\/[^\s'"`]*?\/unpaint-session-[a-z0-9]+(?:-[a-z0-9]+)*-[A-Za-z0-9]{6}(?![A-Za-z0-9])/g)) seen.set(m[0], (seen.get(m[0]) ?? 0) + 1);
  return [...seen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Pictures in the session's folder that the harness did not put there (a plan drawn by other means would be one). */
const HARNESS_PICTURES = new Set(['mine/drawing.png', 'mine/forms.png', 'mine/forms-ids.png']);
export function ownPictures(dir) {
  const out = [], walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name), rel = path.relative(dir, f); if (e.isDirectory()) { if (!['inputs', 'auto', 'looks', 'drawing', 'previous', 'auto-painting', '.requests'].includes(rel)) walk(f); } else if (/\.(png|jpe?g|gif|webp|bmp|tiff?|svg|ppm|pgm|pdf|html?)$/i.test(e.name) && !HARNESS_PICTURES.has(rel)) out.push(rel); } };
  walk(dir); return out.sort();
}

/**
 * Run the session's command until it ends or `over()` says the benchmark's budget and the minutes to hand in are used; then it and every process it started
 * are ended (SIGTERM, and SIGKILL to the group after `graceMs`). Its output goes to outFile/errFile.
 * Resolves {exit, ended: 'done' | 'budget reached' | 'not started', error}.
 */
export function runSession(call, { cwd, outFile, errFile, over, env = cleanEnv(), everyMs = 5000, graceMs = 10000 }) {
  return new Promise(resolve => {
    const mine = { ...env, ...call.env }; for (const k of call.unset ?? []) delete mine[k];
    let closed = false; const out = fs.openSync(outFile, 'w'), err = fs.openSync(errFile, 'w'), close = () => { if (closed) return; closed = true; fs.closeSync(out); fs.closeSync(err); };
    let child, cut = false, killer = null;
    try { child = spawn(call.cmd, call.args, { cwd, env: mine, stdio: ['ignore', out, err], detached: true }); } catch (e) { close(); resolve({ exit: null, ended: 'not started', error: e.message }); return; }
    const group = sig => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* gone */ } } };
    const timer = setInterval(() => { if (!cut && over()) { cut = true; group('SIGTERM'); killer = setTimeout(() => group('SIGKILL'), graceMs); } }, everyMs);
    child.on('error', e => { clearInterval(timer); close(); resolve({ exit: null, ended: 'not started', error: `${e.code === 'ENOENT' ? `\`${call.cmd}\` is not installed or not on PATH` : e.message} (needs ${needsOf(call.cmd)})` }); });
    child.on('close', code => { clearInterval(timer); if (killer) clearTimeout(killer); group('SIGKILL'); close(); resolve({ exit: code, ended: cut ? 'budget reached' : 'done', error: !cut && code !== 0 ? `the model's command ended with exit ${code}` : null }); });
  });
}
