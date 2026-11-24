import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { levelOf, OWN_SCRIPT_ONLY } from './levels.mjs';
import { shapesHanded, checkWithheld, WITHHELD } from './level4.mjs';
import { DEFAULT_LOOKS, DEFAULT_WALL_MINUTES, DEFAULT_STEPS, forLevel, writeSession, sessionServer, ledgerLooks, ledgerShowings, safeRead, safeWrite, finalChoice, cleanEnv, seatbelt, sessionCall, readTranscript, transcriptFile, reachedOutside, ownFolderOf, ownPictures, runSession } from './session.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paint-session-test-'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
// a session's folder: at a level (levels.mjs: no level is handed the code's plan), or by default the preflight's folder,
// which still holds the code's plan in auto/ to check the tools with (codePlan true)
function folder({ looks = 2, minutes = 85, handed = [], level = null, codePlan: plan = null, realSize = null } = {}) {
  const dir = tmp(); fs.mkdirSync(path.join(dir, 'inputs')); fs.writeFileSync(path.join(dir, 'inputs/source.png'), PNG); fs.writeFileSync(path.join(dir, 'inputs/study-2.png'), PNG);
  const codePlan = plan ?? (level ? levelOf(level).codePlan : true);
  const out = writeSession({ dir, packet: { files: ['inputs/source.png', 'inputs/study-2.png'], brief: 'HOW TO WRITE A SCRIPT' }, sheet: { widthMm: 280, heightMm: 186.7 }, realSize, medium: 'pencil (graphite)', codePlan,
    ...(codePlan ? { auto: { picture: PNG, washesText: 'AUTO WASHES', plan: { summary: { washes: 3 }, washes: [] }, toEdit: { format: 'plan-edit 1', of: 'abc', washes: [] } }, settings: [{ set: 'floors', now: '6,4,2', meaning: 'the least shape' }] } : {}), forms: [{ id: 2, name: 'cat face', kind: 'face', boxMm: [1, 2, 3, 4] }], formsIds: path.join(dir, 'inputs/source.png'),
    looks, wallMinutes: minutes, handed, briefFile: path.join(HERE, 'SESSION-BRIEF.md'), readmeFile: path.join(HERE, 'SESSION-README.md'), drawing: { listing: { format: 'lines 1', strokes: [] }, picture: PNG } });
  return { dir, ledger: path.join(tmp(), 'looks.jsonl'), codePlan, ...out };
}
const compiled = n => ({ ok: true, summary: { shapes: 10, washes: 20 + n, strokes: 100, widestBrushMm: 17 }, rows: [{ n: 1 }], numbersText: 'NUMBERS', picture: PNG, marked: { forms: 1, washes: 0 } });
// a look's painting as the painter's side hands it back: the dried sheet, the stages, the numbers measured on it
const looked = async () => ({ ok: true, picture: PNG, stages: PNG, planPicture: PNG, numbersText: 'DRIED NUMBERS', marked: { forms: 2, washes: 0 }, painted: { cells: 543, fullCells: 1086, seconds: 240, backend: { backend: 'gpu', fallback: false } } });
const put = (dir, choice) => fs.writeFileSync(path.join(dir, 'choice.json'), JSON.stringify(choice));
let seq = 0;
async function ask(dir, server, cmd) { fs.writeFileSync(path.join(dir, '.requests', `${Date.now() % 1e9}-${++seq}.req`), cmd); await server.tick(); const f = fs.readdirSync(path.join(dir, '.requests')).filter(x => x.endsWith('.ans')).map(x => path.join(dir, '.requests', x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs || b.localeCompare(a)); const all = f.map(x => fs.readFileSync(x, 'utf8')); for (const x of f) fs.rmSync(x); return all[0]; }

test('the preflight\'s folder holds the task, the tools, the code planner\'s plan and a choice that changes nothing', () => {
  const { dir, prompt } = folder({ looks: 4 });
  try {
    for (const f of ['TASK.md', 'README.md', 'choice.json', 'unpaint', 'own-script-brief.md', 'auto/plan.png', 'auto/washes.txt', 'auto/plan.json', 'auto/settings.json', 'inputs/forms-ids.png', 'inputs/forms.json']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'choice.json'), 'utf8')), { kind: 'settings', settings: {}, why: '' });
    assert.match(prompt, /`280` by `186.7` mm/); assert.match(prompt, /Steps: `1000` of your tool calls/); assert.match(prompt, /Time is not budgeted: waiting for a look or for the machine costs\s+you nothing \(a far safety stop ends a session after `85` minutes\)/); assert.match(prompt, /you are allowed to make mistakes/); assert.match(prompt, /you may do it `20` times/); assert.doesNotMatch(prompt, /\bmust\b|\bnever\b|ROUNDS ONLY|sent back/); assert.match(prompt, /No score is ever shown/); assert.match(prompt, /light pencil/);
    assert.doesNotMatch(prompt, /REAL_SIZE_LINE|SHEET_W|LOOKS_MOST|WALL_MINUTES|GRACE_MINUTES|REVERTS_MOST|STEPS_MOST|DRAWING_NOTE/);
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    assert.match(readme, /`inputs\/source.png`: the SUBJECT/); assert.match(readme, /`inputs\/study-2.png`: block-in STUDY 2/); assert.match(readme, /\| `\.\/unpaint look` \|.*\| its cost in look units, of 4 for this try \(the benchmark's budget\) \|/); assert.doesNotMatch(readme, /INPUT_LIST|SHEET_W|LOOKS_MOST|REVERTS_MOST/); assert.match(readme, /"own": \[/); assert.match(readme, /`"medium": "pencil"`, `"pen"` or `"none"` beside your script/); assert.match(readme, /`"ink": "waterproof"` or `"soluble"` beside your script/);
    assert.ok(fs.statSync(path.join(dir, 'unpaint')).mode & 0o100, 'the command can be run');
    assert.ok(!fs.existsSync(path.join(dir, 'auto/beside.png')) && !fs.existsSync(path.join(dir, 'auto/numbers.txt')), 'nothing at the start sets a plan against the subject: that is a look');
    assert.equal(DEFAULT_LOOKS, 3, 'three full looks\' worth of rendering, ten half-size whole looks'); assert.equal(DEFAULT_WALL_MINUTES, 360, 'the wall clock is a far safety stop, not a budget');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a plan answers with counts only and looks are counted: after the last look the command refuses, and a refused choice costs nothing', async () => {
  const { dir, ledger } = folder({ looks: 2 }); let n = 0;
  try {
    const server = sessionServer({ lookSize: 'full', dir, ledger, look: looked, looks: 2, wallMinutes: 85, checkScript: s => { if (!s.passages) throw new Error('painting script: no passages'); return s; }, compile: async (choice) => (choice.sets.some(([k]) => k === 'bogus') ? { ok: false, error: '--set bogus: not an option' } : compiled(++n)) });
    assert.match(await ask(dir, server, 'status'), /0 of 2 rendering units spent on 0 looks, 0 of 1000 steps \(your tool calls\) taken, 0 of 20 returns to an earlier choice\. Plans made: 0\. Time is not budgeted\./);
    const free = await ask(dir, server, 'plan');
    assert.match(free, /^It compiles \(nothing changed\): 10 shapes, 21 washes, 100 strokes, widest wash brush 17 mm\. A look of this plan costs 1 of your [\d.]+ units left; a look of a region of your own script, the share of its passages that touch it; never under 0\.2\. The price is fixed by size and share: how you paint costs nothing\. Nothing else is shown without a look\./);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'plans')), [], 'a free plan leaves no data and no picture in the folder'); assert.doesNotMatch(free, /rgb|box|covers|plan\.json/);
    put(dir, { kind: 'settings', settings: { 'study1.shapes': 60 } });
    assert.match(await ask(dir, server, 'look'), /^LOOK 1 \(settings\), cost 1 unit \(the fixed price of a full-size look of the sheet\), [\d.]+ of \d+ left\. PAINTED small \(543 cells across of the final 1086\) and dried.*\n.*looks\/1\/beside\.png: your painting as it dried.*looks\/1\/stages\.png.*looks\/1\/numbers\.txt: each named form on the DRIED sheet.*2 named forms are marked !!/);
    assert.ok(fs.existsSync(path.join(dir, 'looks/1/beside.png'))); assert.ok(fs.existsSync(path.join(dir, 'looks/1/stages.png'))); assert.equal(fs.readFileSync(path.join(dir, 'looks/1/numbers.txt'), 'utf8'), 'DRIED NUMBERS'); assert.ok(fs.existsSync(path.join(dir, 'looks/1/plan.json')));
    for (const bad of [{ kind: 'plan' }, { kind: 'settings', settings: { masks: 'none' } }, { kind: 'settings', settings: { bogus: 1 } }, { kind: 'script', script: 'none.json' }]) { put(dir, bad); assert.match(await ask(dir, server, 'look'), /^REFUSED.*no look was counted/, JSON.stringify(bad)); }
    fs.writeFileSync(path.join(dir, 'script.json'), '{"palette": ["ochre"]}'); put(dir, { kind: 'script', script: 'script.json' });
    assert.match(await ask(dir, server, 'plan'), /^REFUSED, nothing was planned: painting script: no passages/);
    fs.writeFileSync(path.join(dir, 'script.json'), '{"palette": ["ochre"], "passages": [1]}');
    assert.match(await ask(dir, server, 'look'), /^LOOK 2 \(own script\), cost 1 unit/);
    fs.writeFileSync(path.join(dir, 'script.json'), '{"palette": ["ochre"], "passages": [1, 2]}');
    assert.match(await ask(dir, server, 'look'), /^NOT PAINTED, nothing was spent: this look costs 1 unit \(the whole plan, \d+ washes, the whole sheet\) and you have 0 of 2 units left/);
    assert.match(await ask(dir, server, 'plan'), /^It compiles \(own script\)/, 'planning goes on after the last look');
    assert.equal(n, 4, 'the same choice is planned once');
    const rec = await server.stop();
    assert.deepEqual(rec.looks.map(l => [l.look, l.what, l.settings]), [[1, 'settings', { 'study1.shapes': '60' }], [2, 'own script', {}]]);
    assert.equal(rec.plans.length, 6); assert.equal(rec.plans.filter(p => !p.ok).length, 1); assert.equal(rec.lastGood.choice.kind, 'script'); assert.equal(rec.good.size, 4);
    const lines = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.equal(lines.filter(l => l.look).length, 2); assert.ok(lines.filter(l => l.request).length >= 10, 'every request is in the ledger');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a look is spent before it is delivered, and the count outlives the server', async () => {
  const { dir, ledger } = folder({ looks: 2 });
  try {
    const mk = () => sessionServer({ lookSize: 'full', dir, ledger, look: looked, looks: 2, wallMinutes: 85, checkScript: s => s, compile: async () => compiled(1) });
    // the session blocks the delivery of the numbers with a folder that cannot be replaced by a file write alone, and
    // points the picture at a file outside its folder: the look is counted all the same, and nothing outside is written
    const outside = path.join(path.dirname(ledger), 'host-file.txt'); fs.writeFileSync(outside, 'HOST');
    fs.mkdirSync(path.join(dir, 'looks/1/numbers.txt/deep'), { recursive: true }); fs.symlinkSync(outside, path.join(dir, 'looks/1/beside.png'));
    const a = mk(); assert.match(await ask(dir, a, 'look'), /^LOOK 1 \(/);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'HOST', 'a link in the folder is replaced, never written through'); assert.ok(fs.lstatSync(path.join(dir, 'looks/1/beside.png')).isFile()); assert.equal(fs.readFileSync(path.join(dir, 'looks/1/numbers.txt'), 'utf8'), 'DRIED NUMBERS');
    assert.equal(ledgerLooks(ledger).length, 1); await a.stop();
    // a delivery that fails outright still leaves the look spent
    fs.rmSync(path.join(dir, 'looks'), { recursive: true }); fs.symlinkSync(path.dirname(ledger), path.join(dir, 'looks'));
    const b = mk(); assert.match(await ask(dir, b, 'status'), /1 of 2 rendering units spent/, 'a new server goes on from the ledger');
    assert.match(await ask(dir, b, 'look'), /^LOOK 2 \(/); assert.ok(!fs.existsSync(path.join(path.dirname(ledger), '2')), 'looks/ as a link is replaced by a real folder');
    // the same look again renders nothing and costs nothing; a changed choice would cost a unit that is not left
    assert.match(await ask(dir, b, 'look'), /^LOOK 3 \(nothing changed\), cost 0 units \(looked at before: nothing was rendered\), 0 of 2 left/);
    put(dir, { kind: 'settings', settings: { 'study1.shapes': 61 } });
    assert.match(await ask(dir, b, 'look'), /^NOT PAINTED, nothing was spent: this look costs 1 unit \(the whole plan, \d+ washes, the whole sheet\) and you have 0 of 2 units left/); await b.stop();
    assert.match(await ask(dir, mk(), 'look'), /^NOT PAINTED, nothing was spent/, 'what was spent outlives the server');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a look is a real painting: one that fails or leaves the GPU costs no look; one painted is counted, kept outside the folder, and the same choice is painted once', async () => {
  const { dir, ledger } = folder({ looks: 3 }), keep = path.join(path.dirname(ledger), 'kept'); let paints = 0, fail = 'the painting did not stay on the GPU (backend cpu, fallback true), so it is not shown';
  try {
    const seenArgs = [];
    const server = sessionServer({ lookSize: 'full', dir, ledger, keep, looks: 3, wallMinutes: 85, checkScript: s => s, compile: async () => compiled(1),
      look: async (choice, script, at, edit, got) => { seenArgs.push({ kind: choice.kind, at, compiled: got.ok }); if (fail) return { ok: false, error: fail }; paints++; return looked(); } });
    // the painter fell back to the CPU: nothing is shown, nothing is counted, and the ledger says why
    const refused = await ask(dir, server, 'look');
    assert.match(refused, /^NOT PAINTED, no look was counted: the painting did not stay on the GPU/); assert.match(refused, /0 of 3 rendering units spent/);
    assert.ok(!fs.existsSync(path.join(dir, 'looks/1')), 'nothing of a failed painting reaches the folder'); assert.equal(ledgerLooks(ledger).length, 0);
    assert.ok(fs.readFileSync(ledger, 'utf8').includes('"notPainted"'));
    // painted: the look is counted, delivered, and kept outside the folder with the choice as it was looked at
    fail = null; fs.writeFileSync(path.join(dir, 'script.json'), '{"palette": ["ochre"], "passages": [1]}'); put(dir, { kind: 'script', script: 'script.json', why: 'mine' });
    assert.match(await ask(dir, server, 'look'), /^LOOK 1 \(own script\), cost 1 unit \(the fixed price of a full-size look of the sheet\), [\d.]+ of \d+ left\. PAINTED small/);
    assert.deepEqual(seenArgs.at(-1), { kind: 'script', at: { plan: 2, look: 1 }, compiled: true }, 'the look paints the compiled choice');
    for (const f of ['choice.json', 'script.json', 'beside.png', 'stages.png', 'numbers.txt', 'look.json']) assert.ok(fs.existsSync(path.join(keep, '1', f)), `kept outside the folder: ${f}`);
    assert.equal(JSON.parse(fs.readFileSync(path.join(keep, '1', 'look.json'), 'utf8')).painted.backend.fallback, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(keep, '1', 'script.json'), 'utf8')).passages.length, 1);
    // the same look again shows the same sheet: nothing is rendered and nothing is spent
    assert.match(await ask(dir, server, 'look'), /^LOOK 2 \(own script\), cost 0 units \(looked at before: nothing was rendered\), 2 of 3 left/); assert.equal(paints, 1);
    // a changed choice is painted, and costs
    fs.writeFileSync(path.join(dir, 'script.json'), '{"palette": ["ochre"], "passages": [1, 2]}');
    assert.match(await ask(dir, server, 'look'), /^LOOK 3 \(/); assert.equal(paints, 2);
    assert.match(await ask(dir, server, 'cost'), /^This look would cost 1 unit \(the whole plan, \d+ washes, the whole sheet\)\. You have 1 of 3 units left\. Nothing was painted and nothing was spent\. \(You have already looked at exactly this/);
    fs.writeFileSync(path.join(dir, 'script.json'), '{"palette": ["ochre"], "passages": [1, 2, 3]}'); assert.match(await ask(dir, server, 'look'), /^LOOK 4 \(/); assert.equal(paints, 3);
    fs.writeFileSync(path.join(dir, 'script.json'), '{"palette": ["ochre"], "passages": [1, 2, 3, 4]}');
    assert.match(await ask(dir, server, 'look'), /^NOT PAINTED, nothing was spent: this look costs 1 unit \(the whole plan, \d+ washes, the whole sheet\) and you have 0 of 3 units left/); assert.equal(paints, 3, 'no painting is started for a look that cannot be paid for');
    const rec = await server.stop();
    assert.deepEqual(rec.looks.map(l => [l.look, l.cost]), [[1, 1], [2, 0], [3, 1], [4, 1]]); assert.deepEqual(rec.lookUnits, { spent: 3, budget: 3 }); assert.equal(rec.budgetReached.what, '3 rendering units'); assert.equal(rec.looks[0].painted.cells, 543);
    // the free plan stays compile-only
    assert.match(await ask(dir, sessionServer({ lookSize: 'full', dir, ledger, keep, look: looked, looks: 3, wallMinutes: 85, checkScript: s => s, compile: async () => compiled(1) }), 'plan'), /^It compiles \(own script\).*Nothing else is shown without a look\./);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(path.dirname(ledger), { recursive: true, force: true }); }
});

test('time is not a budget: a look that waits an hour costs nothing of it; the far safety stop cuts a session off and marks it so', async () => {
  const { dir, ledger } = folder({ looks: 5, minutes: 360 }); let clock = 1000;
  try {
    const server = sessionServer({ lookSize: 'full', dir, ledger, looks: 5, wallMinutes: 360, graceMinutes: 10, now: () => clock, checkScript: s => s, compile: async () => compiled(1), look: async () => { clock += 60 * 60000; return looked(); } });
    server.begin();
    assert.match(await ask(dir, server, 'look'), /^LOOK 1 \(/); assert.equal(server.over(), false);
    assert.match(await ask(dir, server, 'status'), /1 of 5 rendering units spent on 1 look, 0 of 1000 steps[\s\S]*Time is not budgeted\./);
    clock += 300 * 60000; put(dir, { kind: 'settings', settings: { 'study1.shapes': 70 } });
    assert.equal(server.wallSeconds(), 21600); assert.equal(server.over(), false, 'the safety stop is reached, and the session has its minutes to hand in');
    const refused = await ask(dir, server, 'look');
    assert.match(refused, /^NOT PAINTED, no look was counted: the benchmark's resource budget for this try is reached \(the safety stop \(360 minutes on the clock\)\)/); assert.match(refused, /Hand in what you have now.*The session is ended 10 minutes after the safety stop/);
    assert.match(await ask(dir, server, 'plan'), /^It compiles \(settings\)[\s\S]*THE BENCHMARK'S RESOURCE BUDGET IS REACHED/, 'the hand-in can still be checked');
    clock += 10 * 60000; assert.equal(server.over(), true);
    const rec = await server.stop();
    assert.deepEqual(rec.budgetReached, { what: 'the safety stop (360 minutes on the clock)', safetyStop: true, atWallMinutes: 360, looks: 1, lookUnits: 1, steps: 0 }); assert.ok(rec.waitSeconds >= 3600, 'the hour the look waited is measured apart');
    assert.ok(fs.readFileSync(ledger, 'utf8').includes('"budgetReached"'), 'reaching the stop is written down, not hidden');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('steps are the model\'s tool calls: at the allowance it is asked to hand in and no look is painted; fifty steps later it is ended', async () => {
  const { dir, ledger } = folder({ looks: 5 }); let taken = 0;
  try {
    const server = sessionServer({ lookSize: 'full', dir, ledger, looks: 5, steps: 100, stepsTaken: () => taken, checkScript: s => s, compile: async () => compiled(1), look: looked });
    server.begin(); taken = 99;
    assert.match(await ask(dir, server, 'status'), /99 of 100 steps \(your tool calls\) taken/); assert.equal(server.over(), false);
    taken = 100; const refused = await ask(dir, server, 'look');
    assert.match(refused, /^NOT PAINTED, no look was counted: the benchmark's resource budget for this try is reached \(100 steps\)/); assert.match(refused, /The session is ended after 50 more steps/);
    assert.equal(server.over(), false); taken = 150; assert.equal(server.over(), true);
    const rec = await server.stop(); assert.deepEqual(rec.steps, { taken: 150, budget: 100 }); assert.equal(rec.budgetReached.what, '100 steps'); assert.equal(rec.budgetReached.safetyStop, false);
    assert.equal(DEFAULT_STEPS, 1000);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('going back to an earlier choice is counted, and past the allowed number it is refused; the hand-in is held to the same rule', async () => {
  const { dir, ledger } = folder({ looks: 9 });
  try {
    const key = c => JSON.stringify(c);
    const server = sessionServer({ lookSize: 'full', dir, ledger, looks: 9, wallMinutes: 60, reverts: 1, startKey: null, look: looked, checkScript: s => s, compile: async () => compiled(1) });
    const A = { kind: 'settings', settings: { 'study1.shapes': 60 } }, B = { kind: 'settings', settings: { 'study1.shapes': 80 } };
    put(dir, A); assert.match(await ask(dir, server, 'plan'), /^It compiles/); assert.match(await ask(dir, server, 'plan'), /^It compiles/, 'the same choice again is no return');
    put(dir, B); assert.doesNotMatch(await ask(dir, server, 'look'), /return to a choice/);
    put(dir, A); assert.match(await ask(dir, server, 'plan'), /This is a return to a choice you had left: 1 of 1 allowed\./);
    put(dir, B); const refused = await ask(dir, server, 'look');
    assert.match(refused, /^REFUSED, nothing was planned and no look was counted: this choice is one you planned before and then left, and you have gone back to an earlier choice 1 times, the most this benchmark allows \(1\)/); assert.match(refused, /change it, do not undo it/);
    assert.match(await ask(dir, server, 'status'), /1 of 1 returns to an earlier choice/);
    put(dir, { kind: 'settings', settings: { 'study1.shapes': 90 } }); assert.match(await ask(dir, server, 'plan'), /^It compiles/, 'a new choice is always taken');
    // handing in B now would be one more return: it is not taken, and the last choice that compiled is painted
    put(dir, B); const rec = await server.stop(), fin = finalChoice({ present: server.present, lastGood: rec.lastGood, good: rec.good, ended: 'done', barred: server.barred });
    assert.deepEqual(fin.choice.sets, [['study1.shapes', '90']]); assert.match(fin.submitted.note, /goes back to an earlier choice/);
    assert.deepEqual([rec.reverts.count, rec.reverts.allowed, rec.reverts.refused], [1, 1, 1]); assert.equal(rec.plans.filter(p => p.revert).length, 1); void key;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('handed pictures: no plan until each has its line in seen.md; the lines are kept', async () => {
  const from = tmp(); fs.writeFileSync(path.join(from, 'a.jpg'), PNG); fs.writeFileSync(path.join(from, 'w.txt'), 'The sky is flat.');
  const handed = [{ folder: 'previous', title: 'This is try 2', words: 'You have painted this subject before.', files: [{ from: path.join(from, 'a.jpg'), name: 'final-beside-subject.jpg', what: 'your previous painting beside the subject', picture: true }, { from: path.join(from, 'w.txt'), name: 'teachers-words.txt', what: 'a teacher\'s words' }] },
    { folder: 'auto-painting', title: 'What the code alone made', words: 'This is what the code alone made; improve on it, change it, or discard it.', files: [{ from: path.join(from, 'a.jpg'), name: 'final-beside-subject.jpg', what: 'the automatic painting beside the subject', picture: true }] }];
  const { dir, ledger, prompt, pictures } = folder({ looks: 3, handed });
  try {
    assert.deepEqual(pictures, ['previous/final-beside-subject.jpg', 'auto-painting/final-beside-subject.jpg']);
    assert.match(prompt, /## This is try 2\n\nYou have painted this subject before\.\n\n- `previous\/final-beside-subject\.jpg`: your previous painting beside the subject\n- `previous\/teachers-words\.txt`/); assert.match(prompt, /## What the code alone made\n\nThis is what the code alone made; improve on it, change it, or discard it\./); assert.match(prompt, /Before your first plan, open each of these pictures and write one line on each into `seen\.md`/); assert.doesNotMatch(prompt, /score of|verdict|try 2 of/i);
    for (const f of [...pictures, 'previous/teachers-words.txt']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    const server = sessionServer({ lookSize: 'full', dir, ledger, looks: 3, wallMinutes: 60, pictures, look: looked, checkScript: s => s, compile: async () => compiled(1) });
    assert.match(await ask(dir, server, 'plan'), /^REFUSED, nothing was planned: 2 of the pictures you were handed have no line in seen\.md yet/);
    fs.writeFileSync(path.join(dir, 'seen.md'), 'previous/final-beside-subject.jpg: my cat sits too dark against a pale wall, the ear is lost\nauto-painting/final-beside-subject.jpg: ok\n');
    assert.match(await ask(dir, server, 'look'), /^REFUSED.*1 of the pictures.*auto-painting\/final-beside-subject\.jpg/, 'a bare word is not a look at the picture');
    fs.appendFileSync(path.join(dir, 'seen.md'), '- `auto-painting/final-beside-subject.jpg`: the code\'s sheet is all hard edges and the face is cut into facets\n');
    assert.match(await ask(dir, server, 'plan'), /^It compiles/);
    const rec = await server.stop(); assert.deepEqual(rec.pictures.missing, []); assert.match(rec.pictures.said['auto-painting/final-beside-subject.jpg'], /hard edges/);
    assert.deepEqual(ownPictures(dir), [], 'handed pictures are not pictures the model made');
    assert.equal(fs.statSync(path.join(dir, 'previous', 'final-beside-subject.jpg')).mode & 0o222, 0, 'what it is handed is read-only in its folder'); assert.throws(() => fs.writeFileSync(path.join(dir, 'previous', 'teachers-words.txt'), 'x'), /EACCES/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(from, { recursive: true, force: true }); }
});

test('a choice that may spoil the painting is planned all the same, and its warnings are listed in the answer and kept', async () => {
  const { dir, ledger } = folder({ looks: 3 });
  try {
    const server = sessionServer({ lookSize: 'full', dir, ledger, looks: 3, wallMinutes: 60, look: looked, checkScript: s => s, compile: async () => compiled(1), checkTools: t => ({ record: { lines: { own: { lines: 1 } } }, said: 'Your drawing: 1 line of your own.', warnings: t.medium === 'pen' ? ['lines edit, own line 1: pencil over the dry washes sits grey on top of the paint'] : [] }) });
    fs.writeFileSync(path.join(dir, 'my-lines.json'), '{}');
    put(dir, { kind: 'settings', settings: { drawingorder: 'last' }, medium: 'pen', lines: 'my-lines.json', perForm: { 'cat face': { 'study1.clusters': 900 } } });
    const got = await ask(dir, server, 'look');
    assert.match(got, /^LOOK 1 \(settings with its choice of lines, the drawing in pen, settings per form\), cost 1 unit \(the fixed price of a full-size look of the sheet\), [\d.]+ of \d+ left\. PAINTED/);
    assert.match(got, /WARNINGS \(3; each is laid as you wrote it, and is yours to heed or ignore\):\n- "perForm", cat face: "study1\.clusters" is 900, outside the usual 2 to 64.*\n- lines edit, own line 1: pencil over the dry washes.*\n- your settings name drawingorder, and your choice also names lines or a medium of your own/);
    const rec = await server.stop(); assert.equal(rec.warningsGiven, 3); assert.equal(rec.plans[0].warnings.length, 3); assert.equal(rec.lastGood.warnings.length, 3);
    assert.equal(finalChoice({ present: server.present, lastGood: rec.lastGood, good: rec.good, ended: 'done' }).submitted.warnings.length, 3, 'what it was warned of goes with what it handed over');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the folder is not trusted: no link is followed and no request is echoed', async () => {
  const { dir, ledger } = folder(); const secret = path.join(path.dirname(ledger), 'secret.txt'); fs.writeFileSync(secret, 'SECRET-GEOMETRY');
  try {
    const server = sessionServer({ lookSize: 'full', dir, ledger, look: looked, looks: 2, wallMinutes: 85, checkScript: s => s, compile: async () => compiled(1) });
    const answers = () => fs.readdirSync(path.join(dir, '.requests')).filter(f => f.endsWith('.ans')).map(f => fs.readFileSync(path.join(dir, '.requests', f), 'utf8')).join('\n');
    fs.symlinkSync(secret, path.join(dir, '.requests/100-1.req')); fs.writeFileSync(path.join(dir, '.requests/100-2.req'), 'SECRET-IN-A-REQUEST'); fs.writeFileSync(path.join(dir, '.requests/../x.req'), 'look');
    await server.tick();
    assert.doesNotMatch(answers(), /SECRET/); assert.match(answers(), /REFUSED: a request is one of status, plan, look/);
    fs.rmSync(path.join(dir, 'choice.json')); fs.symlinkSync(secret, path.join(dir, 'choice.json'));
    assert.match(await ask(dir, server, 'look'), /^REFUSED, nothing was planned and no look was counted: choice.json must be a plain file/);
    fs.rmSync(path.join(dir, 'choice.json')); put(dir, { kind: 'script', script: 'script.json' }); fs.symlinkSync(secret, path.join(dir, 'script.json'));
    const a = await ask(dir, server, 'plan'); assert.match(a, /script.json must be a plain file/); assert.doesNotMatch(a, /SECRET/);
    fs.rmSync(path.join(dir, 'script.json')); fs.writeFileSync(path.join(dir, 'script.json'), 'SECRET not json');
    assert.doesNotMatch(await ask(dir, server, 'plan'), /SECRET/, 'a file that is not JSON is not quoted');
    fs.rmSync(path.join(dir, 'script.json')); fs.linkSync(secret, path.join(dir, 'script.json'));
    assert.match(await ask(dir, server, 'plan'), /must be a plain file/, 'a second name of a file elsewhere is refused');
    assert.equal(ledgerLooks(ledger).length, 0); await server.stop();
    assert.throws(() => safeRead(dir, '../x'), /not a path of this folder/); assert.throws(() => safeWrite(dir, 'a/../../x', 'y'), /not a path of this folder/);
    fs.symlinkSync(path.dirname(ledger), path.join(dir, 'out')); safeWrite(dir, 'out/file.txt', 'mine');
    assert.ok(!fs.existsSync(path.join(path.dirname(ledger), 'file.txt'))); assert.equal(safeRead(dir, 'out/file.txt'), 'mine');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the model\'s command writes a request and prints its answer, and time spent waiting is not the model\'s own', async () => {
  const { dir, ledger } = folder(); let clock = 0;
  try {
    const server = sessionServer({ lookSize: 'full', dir, ledger, look: looked, looks: 2, wallMinutes: 1, graceMinutes: 10, now: () => clock, checkScript: s => s, compile: async () => { clock += 600000; return compiled(1); } });
    clock = 30000; assert.equal(server.over(), false);
    fs.writeFileSync(path.join(dir, '.requests/1-1.req'), 'plan'); fs.utimesSync(path.join(dir, '.requests/1-1.req'), 1, 1); await server.tick();
    assert.equal(server.ownSeconds(), 30, 'ten minutes in the planner are measured apart from its own work, and the request\'s own date is not believed'); assert.equal(server.wallSeconds(), 630, 'and they are on the clock of the try'); assert.equal(server.over(), false, 'reached, with its minutes to hand in'); clock += 31000; assert.equal(server.over(), true);
    await server.stop();
    const live = sessionServer({ lookSize: 'full', dir, ledger, look: looked, looks: 2, wallMinutes: 85, checkScript: s => s, compile: async () => compiled(1), everyMs: 50 }); live.start();
    const out = await new Promise((res, rej) => import('node:child_process').then(cp => cp.execFile(path.join(dir, 'unpaint'), ['status'], { cwd: dir }, (e, so) => (e ? rej(e) : res(so)))));
    await live.stop(); assert.match(out, /0 of 2 rendering units spent/);
    assert.throws(() => execFileSync(path.join(dir, 'unpaint'), ['paint'], { cwd: dir, stdio: 'pipe' }), e => e.status === 2 && /usage: \.\/unpaint/.test(String(e.stdout)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('what is painted: the choice left when it compiled, else the last that did; nothing changed is the code planner', () => {
  const c = (kind, sets = [], key = 'k') => ({ choice: { kind, sets, script: kind === 'script' ? 's.json' : null, why: 'w' }, script: kind === 'script' ? { passages: [] } : null, key });
  const unchanged = finalChoice({ present: () => c('settings'), lastGood: null, ended: 'done' });
  assert.equal(unchanged.submitted.what, 'nothing changed'); assert.deepEqual(unchanged.choice.sets, []);
  const tuned = finalChoice({ present: () => c('settings', [['floors', '8,4,2']]), lastGood: null, good: new Set(['k']), ended: 'done' });
  assert.deepEqual([tuned.submitted.kind, tuned.submitted.what, tuned.submitted.settings, tuned.submitted.note], ['settings', 'settings', { floors: '8,4,2' }, null]);
  const unplanned = finalChoice({ present: () => c('settings', [['floors', '9,9,9']], 'new'), lastGood: { ...c('settings', [['floors', '8,4,2']], 'old'), plan: 2 }, good: new Set(['old']), ended: 'done' });
  assert.deepEqual(unplanned.choice.sets, [['floors', '8,4,2']], 'a choice never planned is not painted, even when the session ended by itself'); assert.match(unplanned.submitted.note, /never planned/);
  assert.match(finalChoice({ present: () => c('script', [], 'new'), lastGood: null, ended: 'done' }).failure, /never planned/);
  const bad = finalChoice({ present: () => { throw new Error('choice.json is not JSON'); }, lastGood: { ...c('script'), plan: 3 }, ended: 'done' });
  assert.equal(bad.submitted.what, 'own script'); assert.match(bad.submitted.from, /last choice that compiled \(plan 3\)/); assert.match(bad.submitted.note, /not taken: choice.json is not JSON/);
  const cut = finalChoice({ present: () => c('settings', [['floors', '8,4,2']], 'old'), lastGood: null, good: new Set(['old']), ended: 'budget reached' });
  assert.match(cut.submitted.note, /reached the benchmark's resource budget/);
  assert.match(finalChoice({ present: () => { throw new Error('no file'); }, lastGood: null, ended: 'done' }).failure, /no earlier choice had compiled: no file/);
});

test('a session is started with a shell held to its folder; a model without a shell route is refused', () => {
  const opus = sessionCall({ key: 'opus', id: 'claude-opus-5-5', effort: 'high', cli: 'claude' }, { prompt: 'P', cwd: '/tmp/s', deny: ['/repo', '/subjects'] });
  const settings = JSON.parse(opus.args[opus.args.indexOf('--settings') + 1]);
  assert.equal(settings.sandbox.enabled, true); assert.equal(settings.sandbox.allowUnsandboxedCommands, false); assert.deepEqual(settings.permissions.deny, ['Read(//repo/**)', 'Read(//subjects/**)']);
  assert.match(opus.args[opus.args.indexOf('--allowedTools') + 1], /Bash/); assert.ok(opus.args.includes('stream-json')); assert.match(opus.closed, /can read the repository/);
  // codex cannot deny a read itself, and seatbelt profiles do not nest: the whole command runs under this harness's profile
  const astra = sessionCall({ key: 'astra', id: 'gpt-6.2-astra', effort: 'high', cli: 'codex' }, { prompt: 'P', cwd: '/tmp/s', deny: ['/repo'], images: ['/tmp/s/inputs/source.png'], home: '/home/x', tmp: '/tmp' });
  assert.equal(astra.cmd, 'sandbox-exec'); assert.deepEqual(astra.args.slice(0, 1), ['-p']); assert.equal(astra.args[2], 'codex'); assert.ok(astra.args.includes('--dangerously-bypass-approvals-and-sandbox'), 'its own sandbox is off only inside ours');
  assert.match(astra.profile, /\(deny file-read\* file-write\* \(subpath "\/repo"\) \(regex #"\/unpaint-session-"\) \(regex #"\/unpaint-bench-"\)\)/); assert.match(astra.profile, /\(deny file-write\*\)/); assert.match(astra.profile, /\(deny network\*\)/);
  assert.ok(astra.profile.indexOf('(allow file-read* file-write* (subpath "/tmp/s"))') > astra.profile.indexOf('unpaint-session-'), 'its own folder is allowed again after the denials');
  assert.deepEqual(astra.probe('/repo/x').args.slice(-2), ['/bin/cat', '/repo/x']);
  // agy: the same profile, with loopback and a pseudo-terminal (its helper and its shell), its own prompts off inside it
  const argon = sessionCall({ key: 'argon', id: 'gemini-4-argon-high', effort: 'high', cli: 'agy' }, { prompt: 'P', cwd: '/tmp/s', deny: ['/repo'], home: '/home/x', tmp: '/tmp' });
  assert.equal(argon.cmd, 'sandbox-exec'); assert.equal(argon.args[2], 'agy'); assert.deepEqual(argon.args.slice(3, 7), ['-p', 'P', '--model', 'gemini-4-argon-high']); assert.ok(argon.args.includes('--dangerously-skip-permissions') && argon.args.includes('stream-json'));
  assert.match(argon.profile, /\(deny file-read\* file-write\* \(subpath "\/repo"\)/); assert.match(argon.profile, /\(subpath "\/home\/x\/\.gemini"\)/); assert.match(argon.profile, /\(allow network-bind \(local ip "localhost:\*"\)\)/); assert.match(argon.profile, /\(allow pseudo-tty\)/);
  assert.doesNotMatch(astra.profile, /localhost|pseudo-tty/, 'codex gets neither'); assert.equal(argon.serial, true); assert.deepEqual(argon.probe('/repo/x').args.slice(-2), ['/bin/cat', '/repo/x']);
  // muse: the same profile with its own sandbox off, also without a gate (the check of an author before a run)
  const wonder = sessionCall({ key: 'wonderfull-m', id: 'muse-wonder-full-1.0', effort: 'medium', cli: 'muse' }, { prompt: 'P', cwd: '/tmp/s', deny: ['/repo'], home: '/home/x', tmp: '/tmp' });
  assert.equal(wonder.cmd, 'sandbox-exec'); assert.deepEqual(wonder.args.slice(2, 4), ['muse', 'exec']); assert.ok(wonder.args.includes('--disable-sandbox')); assert.match(wonder.profile, /\(deny file-read\* file-write\* \(subpath "\/repo"\)/); assert.match(wonder.profile, /remote tcp "\*:443"/);
  assert.throws(() => sessionCall({ key: 'other', cli: 'ollama' }, { prompt: 'P', cwd: '/x' }), /needs a shell/);
  assert.match(seatbelt({ deny: ['/a "b'], write: ['/w'], cwd: '/c' }), /\(subpath "\/a \\"b"\)/);
  assert.deepEqual(cleanEnv({ HOME: '/h', PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', X_GRADE: '1', OPENAI_API_KEY: 'k', LC_ALL: 'C' }), { HOME: '/h', PATH: '/bin', OPENAI_API_KEY: 'k', LC_ALL: 'C' });
});

test('under the closed profile a session reads its own folder, never another session\'s nor the repository', { skip: process.platform !== 'darwin' && 'the profile is macOS seatbelt' }, () => {
  // real processes under the real profile (no model): the temporary folders are writable and read again after the
  // home folder is hidden, and other sessions live in them
  const tmp = fs.realpathSync(os.tmpdir()), mine = fs.mkdtempSync(path.join(tmp, 'unpaint-session-mine-')), theirs = fs.mkdtempSync(path.join(tmp, 'unpaint-session-theirs-')), attempt = fs.mkdtempSync(path.join(tmp, 'unpaint-bench-'));
  try {
    for (const d of [mine, theirs, attempt]) fs.writeFileSync(path.join(d, 'f.txt'), 'x');
    const repo = path.resolve('package.json');
    for (const hidden of [[os.homedir(), '/Users', '/Volumes'], []]) {
      const profile = seatbelt({ deny: [path.dirname(repo)], write: [tmp, '/private/tmp', '/private/var/folders'], cwd: mine, local: true, gated: hidden.length > 0, hidden });
      const can = (cmd, ...a) => { try { execFileSync('sandbox-exec', ['-p', profile, cmd, ...a], { stdio: 'pipe' }); return true; } catch { return false; } };
      const how = hidden.length ? 'the home folder hidden' : 'the home folder not hidden';
      assert.equal(can('/bin/cat', path.join(mine, 'f.txt')), true, `its own file is read (${how})`);
      assert.equal(can('/usr/bin/touch', path.join(mine, 'new.txt')), true, `its own folder is written (${how})`);
      assert.equal(can('/bin/cat', path.join(theirs, 'f.txt')), false, `another session's file is not read (${how})`);
      assert.equal(can('/usr/bin/touch', path.join(theirs, 'new.txt')), false, `another session's folder is not written (${how})`);
      assert.equal(can('/bin/cat', path.join(attempt, 'f.txt')), false, `a level 1 attempt's file is not read (${how})`);
      assert.equal(can('/bin/cat', repo), false, `a file of the repository is not read (${how})`);
    }
  } finally { for (const d of [mine, theirs, attempt]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('a transcript gives the tool calls by kind, the commands, the last message and the cost', () => {
  const claude = [
    { type: 'assistant', message: { content: [{ type: 'text', text: 'looking' }, { type: 'tool_use', name: 'Read', input: { file_path: 'inputs/source.png' } }, { type: 'tool_use', name: 'Bash', input: { command: './unpaint plan' } }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'cd . && ./unpaint look' } }, { type: 'tool_use', name: 'Bash', input: { command: 'python3 -c "print(1)"' } }, { type: 'tool_use', name: 'Write', input: {} }] } },
    { type: 'result', result: 'I tuned the planner.', usage: { input_tokens: 10, output_tokens: 5 }, total_cost_usd: 1.5 },
  ].map(x => JSON.stringify(x)).join('\n');
  const a = readTranscript('claude', claude);
  assert.deepEqual(a.calls, { 'read file': 1, 'unpaint plan': 1, 'unpaint look': 1, shell: 1, 'write file': 1 }); assert.equal(a.text, 'I tuned the planner.'); assert.equal(a.tokens, 15); assert.equal(a.costUSD, 1.5); assert.deepEqual(a.commands, ['Read inputs/source.png', './unpaint plan', 'cd . && ./unpaint look', 'python3 -c "print(1)"']);
  const codex = [{ type: 'item.completed', item: { type: 'command_execution', command: "/bin/zsh -lc './unpaint wait'" } }, { type: 'item.completed', item: { type: 'command_execution', command: 'cat /Users/x/repo/tools/paint-plate.mjs' } }, { type: 'item.completed', item: { type: 'file_change' } }, { type: 'item.completed', item: { type: 'reasoning', text: 'hm' } }, { type: 'item.completed', item: { type: 'agent_message', text: 'done' } }, { type: 'turn.completed', usage: { input_tokens: 7, output_tokens: 3 } }].map(x => JSON.stringify(x)).join('\nnot json\n');
  const b = readTranscript('codex', codex);
  assert.deepEqual(b.calls, { 'unpaint wait': 1, shell: 1, 'write file': 1 }); assert.equal(b.text, 'done'); assert.equal(b.tokens, 10);
  assert.equal(reachedOutside(b.commands, ['/Users/x/repo']).length, 1); assert.deepEqual(reachedOutside(a.commands, ['/Users/x/repo']), []); assert.equal(reachedOutside(['Read /Users/x/repo/work/cache/a.json', 'ls /tmp/unpaint-session-opus-1'], ['/Users/x/repo']).length, 2);
  assert.deepEqual(reachedOutside(['cat /tmp/unpaint-session-opus-1/README.md', 'ls /tmp/unpaint-session-astra-2'], ['/Users/x/repo'], ['/tmp/unpaint-session-opus-1']), ['ls /tmp/unpaint-session-astra-2'], 'its own folder may be named; another session\'s may not');
  const own = '/private/var/folders/tm/a_b/T/unpaint-session-opus-OLJL43', kept = [`Read ${own}/inputs/source.png`, 'Read /Users/x/.claude/projects/-private-var-folders-tm-a-b-T-unpaint-session-opus-OLJL43/295f/tool-results/b.txt', `Read ${own}/auto/plan.png`];
  assert.deepEqual(reachedOutside(kept, ['/Users/x/repo'], [own]), [], 'the place its command keeps its own long tool results is its own');
  assert.equal(ownFolderOf(kept), own); assert.equal(ownFolderOf(['ls']), null);
  // an author key with a hyphen (the -m models) names its folder as well
  for (const key of ['neon-m', 'sonnet-m', 'argon-m']) { const f = `/private/var/folders/tm/a_b/T/unpaint-session-${key}-Ab3dE9`; assert.equal(ownFolderOf([`Read ${f}/inputs/source.png`, `ls ${f}/mine`]), f, key); }
});

test('pictures the model made itself are found, and the clock ends a session', async () => {
  const { dir } = folder();
  try {
    fs.mkdirSync(path.join(dir, 'looks/1'), { recursive: true }); fs.writeFileSync(path.join(dir, 'looks/1/beside.png'), PNG); fs.mkdirSync(path.join(dir, 'notes')); fs.writeFileSync(path.join(dir, 'notes/mine.PNG'), PNG); fs.writeFileSync(path.join(dir, 'render.svg'), '<svg/>');
    assert.deepEqual(ownPictures(dir), ['notes/mine.PNG', 'render.svg']);
    const at = f => path.join(dir, f); let asked = 0;
    // a command that ignores the first signal and has started a child of its own: both are ended
    const cut = await runSession({ cmd: 'sh', args: ['-c', 'trap "" TERM; sleep 31 & echo $! > child.pid; sleep 30'], env: {} }, { cwd: dir, outFile: at('o'), errFile: at('e'), over: () => ++asked > 1, everyMs: 30, graceMs: 200 });
    assert.equal(cut.ended, 'budget reached'); await new Promise(r => setTimeout(r, 100));
    assert.throws(() => process.kill(Number(fs.readFileSync(at('child.pid'), 'utf8')), 0), /ESRCH/, 'the child it started is gone too');
    const done = await runSession({ cmd: 'sh', args: ['-c', 'echo hi'], env: {} }, { cwd: dir, outFile: at('o'), errFile: at('e'), over: () => false });
    assert.deepEqual([done.ended, done.exit, done.error], ['done', 0, null]); assert.equal(fs.readFileSync(at('o'), 'utf8'), 'hi\n');
    assert.equal((await runSession({ cmd: 'no-such-model-command', args: [], env: {} }, { cwd: dir, outFile: at('o'), errFile: at('e'), over: () => false })).ended, 'not started');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an edited plan: the free answer says what the edit changes, in counts; the record keeps them; a bad edit costs nothing', async () => {
  const { dir, ledger } = folder({ looks: 2 }); let seen = null;
  try {
    const record = { auto: 20, kept: 17, untouched: 15, changed: 2, moved: 0, merged: 1, mergedFrom: 2, dropped: 1, added: 1, untouchedShare: 0.75, unchanged: false, fields: { colour: 2 }, notes: [] };
    const checkPlan = e => { if (e.of !== 'abc') throw new Error('plan edit: "of" must stay as it was'); return { edit: e, record }; };
    const server = sessionServer({ lookSize: 'full', dir, ledger, look: looked, looks: 2, wallMinutes: 85, checkScript: s => s, checkPlan, compile: async (choice, script, n, edit) => { seen = edit; return compiled(1); } });
    assert.ok(fs.existsSync(path.join(dir, 'auto/plan-to-edit.json')));
    put(dir, { kind: 'plan', plan: 'my-plan.json' });
    assert.match(await ask(dir, server, 'plan'), /^REFUSED, nothing was planned: there is no file my-plan.json/);
    fs.writeFileSync(path.join(dir, 'my-plan.json'), '{"of": "other"}');
    assert.match(await ask(dir, server, 'look'), /^REFUSED, nothing was planned and no look was counted: plan edit: "of" must stay/);
    fs.writeFileSync(path.join(dir, 'my-plan.json'), '{"of": "abc", "washes": []}');
    const free = await ask(dir, server, 'plan');
    assert.match(free, /^It compiles \(edited plan\): .* Your edit: of the code planner's 20 washes 15 are untouched \(75%\), 2 changed \(colour 2\), 0 moved, 2 merged into 1, 1 left out; 1 passages of your own added\. A look of this plan costs 1 of your [\d.]+ units left; a look of a region of your own script, the share of its passages that touch it; never under 0\.2\. The price is fixed by size and share: how you paint costs nothing\. Nothing else is shown without a look\./);
    assert.deepEqual(seen, { of: 'abc', washes: [] }); assert.doesNotMatch(free, /rgb|box|covers/);
    assert.match(await ask(dir, server, 'look'), /^LOOK 1 \(edited plan\), cost 1 unit/);
    const rec = await server.stop();
    assert.equal(rec.looks[0].plan, 'my-plan.json'); assert.equal(rec.looks[0].edit.untouchedShare, 0.75); assert.equal(rec.plans.at(-1).edit.dropped, 1);
    const fin = finalChoice({ present: server.present, lastGood: rec.lastGood, good: rec.good, ended: 'done' });
    assert.equal(fin.submitted.kind, 'plan'); assert.equal(fin.submitted.what, 'edited plan'); assert.equal(fin.submitted.plan, 'my-plan.json'); assert.equal(fin.submitted.edit.untouchedShare, 0.75); assert.deepEqual(fin.edit, { of: 'abc', washes: [] });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an agy transcript: each tool step once, shell commands and file places kept, the last message and the tokens', () => {
  const step = (i, x) => ({ event: 'step_update', step_update: { step_index: i, ...x } }), tool = (i, state, name, parameters) => step(i, { state, step_type: 'tool', tool_name: name, tool_info: { name, parameters } });
  const out = [{ event: 'init', init: { model: 'm' } }, step(1, { state: 'DONE', step_type: 'agent_response', usage: { total_tokens: 100 } }),
    tool(2, 'ACTIVE', 'run_command', { CommandLine: './unpaint plan' }), tool(2, 'DONE', 'run_command', { CommandLine: './unpaint plan' }),
    tool(3, 'ACTIVE', 'read_file', { Path: '/repo/tools/paint-plate.mjs' }), tool(3, 'ERROR', 'read_file', { Path: '/repo/tools/paint-plate.mjs' }),
    tool(4, 'ACTIVE', 'write_to_file', { TargetFile: 'my-plan.json', CodeContent: 'a file that says paint-plate inside' }), tool(5, 'ACTIVE', 'run_command', { CommandLine: 'python3 measure.py' }),
    step(6, { state: 'ACTIVE', step_type: 'agent_response', text_delta: 'I edited ' }), step(6, { state: 'ACTIVE', step_type: 'agent_response', text_delta: 'the plan.' }), step(6, { state: 'DONE', step_type: 'agent_response', usage: { total_tokens: 50 } })].map(x => JSON.stringify(x)).join('\n');
  const a = readTranscript('agy', out);
  assert.deepEqual(a.calls, { 'unpaint plan': 1, 'read file': 1, 'write file': 1, shell: 1 }); assert.deepEqual(a.commands, ['./unpaint plan', 'read_file /repo/tools/paint-plate.mjs', 'write_to_file my-plan.json', 'python3 measure.py']);
  assert.equal(a.tokens, 150); assert.equal(a.text, 'I edited the plan.', 'cut off before its result: the last words it said');
  assert.equal(readTranscript('agy', `${out}\n${JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: 'Final.' } })}`).text, 'Final.');
  assert.deepEqual(reachedOutside(a.commands, ['/repo']), ['read_file /repo/tools/paint-plate.mjs'], 'a file tool aimed outside is seen; what a written file holds is not a place');
});

test('the model\'s own time: not the wait for a place to start, nor a compile, nor a look\'s painting; an edit\'s faults and notes reach it whole', async () => {
  const { dir, ledger } = folder({ looks: 100, minutes: 85 }); let clock = 1e9;
  try {
    const faults = 'plan edit: 2 things to correct, every one listed here; correct them all, then plan again.\n- wash 12: the colour asked for is 20 L* lighter than what is under it. Accepted here: a colour of L* 50 or darker\n- wash 40: the colour asked for is 31 L* lighter';
    const notes = { auto: 20, untouched: 18, untouchedShare: 0.9, changed: 2, moved: 0, merged: 0, mergedFrom: 0, dropped: 0, added: 0, fields: { colour: 2 }, notes: ['wash 7: the colour asked for (L* 60) is no darker than what is laid under it (L* 58); laid as the nearest that can be'] };
    const server = sessionServer({ lookSize: 'full', dir, ledger, looks: 100, wallMinutes: 85, now: () => clock, checkScript: s => s, checkPlan: e => ({ edit: e, record: { ...notes, notes: [] } }),
      compile: async (choice, script, n, edit) => { clock += 9 * 60000; return edit?.bad ? { ok: false, error: faults } : { ...compiled(1), editRecord: edit ? notes : null }; },
      look: async () => { clock += 30 * 60000; return { ok: true, picture: PNG, numbersText: 'NUMBERS', marked: { forms: 0, washes: 0 }, painted: { cells: 100 } }; } });
    // an hour and a half passes before a place among the models is free: none of it is on the try's clock
    clock += 95 * 60000; assert.equal(server.over(), true, 'before its command starts the clock is not yet its own');
    server.begin(); assert.equal(server.ownSeconds(), 0); assert.equal(server.wallSeconds(), 0); assert.equal(server.over(), false);
    clock += 60000; put(dir, { kind: 'plan', plan: 'my-plan.json' }); fs.writeFileSync(path.join(dir, 'my-plan.json'), '{"bad": true}');
    const refused = await ask(dir, server, 'plan');
    assert.match(refused, /^REFUSED by the planner: plan edit: 2 things to correct/); assert.match(refused, /\n- wash 12: .*Accepted here: a colour of L\* 50 or darker\n- wash 40: /, 'every fault, each on its line');
    assert.equal(server.ownSeconds(), 60, 'the nine minutes of the compile are not its time');
    clock += 120000; fs.writeFileSync(path.join(dir, 'my-plan.json'), '{"bad": false}');
    const look = await ask(dir, server, 'look');
    assert.match(look, /^LOOK 1 \(edited plan\), cost 1 unit/); assert.match(look, /1 note on it \(each was laid the nearest way that can be; change it if that is not what you want\):\n- wash 7: the colour asked for \(L\* 60\) is no darker/);
    assert.equal(server.ownSeconds(), 180, 'nor the compile and the half hour of the look\'s painting'); assert.equal(server.over(), false);
    const rec = await server.stop(); assert.equal(rec.waitSeconds, (9 + 9 + 30) * 60); assert.equal(rec.ownSeconds, 180); assert.equal(rec.plans.at(-1).edit.notes.length, 1); assert.equal(rec.looks[0].edit.notes.length, 1);
    assert.equal(rec.wallSeconds, 51 * 60, 'the clock of the try holds both'); clock += 45 * 60000; assert.equal(server.over(), true, 'the 85 minutes of the try and the 10 to hand in end it');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a choice with lines, forms and settings per form: its files are read and checked, what they do is said and recorded, and its pictures are put in mine/', async () => {
  const { dir, ledger } = folder({ looks: 2 }); let seen = null, checked = 0;
  try {
    const record = { lines: { file: 'my-lines.json', strokes: 10, before: 6, after: 1, dropped: 3 }, forms: { file: 'my-forms.json', forms: 3, merged: 1 }, perForm: [{ form: 'face', id: 1, study: 3, setting: 'lay', value: 1 }] };
    const checkTools = t => { checked++; if (t.linesEdit?.rules?.[0]?.do === 'erase') throw new Error('lines edit, rule 1: "do" is "before", "after" or "drop"'); return { record, said: 'Your lines: 6 before the washes, 1 after, 3 dropped.' }; };
    const server = sessionServer({ lookSize: 'full', dir, ledger, looks: 2, wallMinutes: 85, checkScript: s => s, checkTools, look: async () => ({ ok: true, picture: PNG, numbersText: 'NUMBERS', marked: { forms: 0, washes: 0 }, painted: { cells: 100 } }),
      compile: async choice => { seen = choice.tools; return { ...compiled(1), toolFiles: [{ rel: 'mine/drawing.png', data: PNG }, { rel: 'mine/forms.json', data: '[]\n' }] }; } });
    assert.ok(fs.existsSync(path.join(dir, 'drawing/lines.json')) && fs.existsSync(path.join(dir, 'drawing/all-lines.png')), 'the lines are in the folder from the start');
    put(dir, { kind: 'settings', settings: {}, lines: 'my-lines.json', forms: 'my-forms.json', perForm: { face: { 'study3.lay': 1 } } });
    assert.match(await ask(dir, server, 'plan'), /^REFUSED, nothing was planned: there is no file my-lines.json/);
    fs.writeFileSync(path.join(dir, 'my-forms.json'), '{"edits": []}'); fs.writeFileSync(path.join(dir, 'my-lines.json'), '{"rules": [{"do": "erase"}]}');
    assert.match(await ask(dir, server, 'look'), /^REFUSED, nothing was planned and no look was counted: lines edit, rule 1: "do" is/);
    fs.writeFileSync(path.join(dir, 'my-lines.json'), '{"rules": [{"do": "drop"}]}');
    const free = await ask(dir, server, 'plan');
    assert.match(free, /^It compiles \(the code planner with its choice of lines, its own forms, settings per form\): .* Your lines: 6 before the washes, 1 after, 3 dropped\. See mine\/drawing\.png, mine\/forms\.json\. A look of this plan costs 1 of your [\d.]+ units left; a look of a region of your own script, the share of its passages that touch it; never under 0\.2\. The price is fixed by size and share: how you paint costs nothing\. Nothing else is shown without a look\./);
    assert.deepEqual(seen.linesEdit, { rules: [{ do: 'drop' }] }); assert.deepEqual(seen.formsEdit, { edits: [] }); assert.deepEqual(seen.perForm, [['face', [[3, 'lay', 1]]]]);
    assert.ok(fs.existsSync(path.join(dir, 'mine/drawing.png'))); assert.equal(fs.readFileSync(path.join(dir, 'mine/forms.json'), 'utf8'), '[]\n');
    assert.match(await ask(dir, server, 'look'), /^LOOK 1 \(the code planner with its choice of lines/);
    const rec = await server.stop();
    assert.equal(rec.plans.at(-1).tools.lines.dropped, 3); assert.equal(rec.looks[0].tools.perForm[0].form, 'face');
    const fin = finalChoice({ present: server.present, lastGood: rec.lastGood, good: rec.good, ended: 'done' });
    assert.deepEqual(fin.submitted.tools, { lines: 'my-lines.json', forms: 'my-forms.json', perForm: { face: { 'study3.lay': 1 } }, record }); assert.equal(fin.choice.tools.linesEdit.rules[0].do, 'drop');
    // a choice with tools is not "nothing changed": unplanned, it is not taken
    put(dir, { kind: 'settings', settings: {}, lines: 'my-lines.json' }); fs.writeFileSync(path.join(dir, 'my-lines.json'), '{"rules": [{"do": "after"}]}');
    assert.match(finalChoice({ present: server.present, lastGood: null, good: new Set(), ended: 'done' }).failure, /never planned/);
    assert.ok(checked >= 4);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a look to a stage or of a region is priced from the plan before it is painted, charged in units, and the painter is told what to paint', async () => {
  const { dir, ledger } = folder({ looks: 2 }); const asked = [];
  try {
    const rows = [...Array(3).fill({ stage: 1 }), ...Array(5).fill({ stage: 3 }), ...Array(2).fill({ stage: 4 })];
    const server = sessionServer({ lookSize: 'full', dir, ledger, looks: 2, wallMinutes: 60, sheet: { widthMm: 200, heightMm: 100 }, forms: [{ name: 'cat face', boxMm: [50, 0, 150, 50] }], checkScript: s => s, compile: async () => ({ ...compiled(1), rows }),
      look: async (choice, script, at, edit, got, ask) => { asked.push(ask); return { ...(await looked()), stoppedText: ask.until ? `PAINTED THROUGH STAGE ${ask.until} AND STOPPED: 2 of 5 passes are on the paper\nStill to come: stage 3` : null, painted: { cells: 100, regionPassages: ask.region ? '2 of 9 passages' : null } }; } });
    assert.match(await ask(dir, server, 'plan'), /A look of this plan costs 1 of your 2 units left; stopped after a stage, its share \(--until 1: 0\.3, --until 3: 0\.8\); a look of a region of your own script, the share of its passages that touch it; never under 0\.2\. The price is fixed by size and share: how you paint costs nothing\./);
    assert.match(await ask(dir, server, 'cost --until 1'), /^This look would cost 0\.3 units \(stopped after stage 1: 3 of the plan's 10 washes, the whole sheet\)\. You have 2 of 2 units left\. Nothing was painted and nothing was spent\./);
    assert.equal(ledgerLooks(ledger).length, 0);
    const first = await ask(dir, server, 'look --until 1');
    assert.match(first, /^LOOK 1 \(nothing changed\), cost 0\.3 units \(the fixed price of a full-size look of part of the sheet\), 1\.7 of 2 left\. PAINTED THROUGH STAGE 1 AND STOPPED: 2 of 5 passes are on the paper\. PAINTED/); assert.deepEqual(asked[0], { until: 1, region: null });
    assert.match(await ask(dir, server, 'look --region cat face'), /^REFUSED, nothing was painted and nothing was spent: a look of a region is painted for your own script only/);
    // a script of four passages: two touch the cat's face, one of them and one other the left half, one lies off both
    fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify({ passages: [{ id: 'a', region: [[60, 10], [90, 10], [90, 40]] }, { id: 'b', region: [[120, 10], [140, 10], [140, 40]] }, { id: 'c', region: [[10, 60], [40, 60], [40, 90]] }, { id: 'd', region: [[160, 60], [190, 60], [190, 90]] }] })); put(dir, { kind: 'script', script: 'script.json' });
    assert.match(await ask(dir, server, 'cost --region cat face'), /^This look would cost 0\.5 units \(the whole plan, 10 washes; the region "cat face", 50, 0, 150, 50 mm, which 2 of your 4 passages touch\)/);
    const second = await ask(dir, server, 'look --until 3 --region cat face');
    assert.match(second, /^LOOK 2 \(own script\), cost 0\.4 units \([^)]*\), 1\.3 of 2 left.*Only the passages in the region were painted \(2 of 9 passages\)/); assert.deepEqual((({ box, name, passages, of }) => ({ box, name, passages, of }))(asked[1].region), { box: [50, 0, 150, 50], name: 'cat face', passages: 2, of: 4 }); assert.equal(asked[1].until, 3);
    assert.match(await ask(dir, server, 'look --region 0,0,100,100'), /^LOOK 3 \(own script\), cost 0\.5 units \([^)]*\), 0\.8 of 2 left/);
    assert.match(await ask(dir, server, 'look --region 195,95,200,100'), /^REFUSED, nothing was painted and nothing was spent: no passage of your script touches the region/);
    assert.match(await ask(dir, server, 'look --until 3'), /^LOOK 4 \(own script\), cost 0\.8 units \([^)]*\), 0 of 2 left/);
    assert.match(await ask(dir, server, 'look --until 1'), /^NOT PAINTED, nothing was spent: this look costs 0\.3 units .* and you have 0 of 2 units left\. This is the benchmark's limit on its machines, not a judgment of your work\./);
    assert.match(await ask(dir, server, 'look --until soon'), /^REFUSED, nothing was painted and nothing was spent: --until: the number of a stage/); assert.match(await ask(dir, server, 'look --region dog'), /there is no form "dog" with a box \(the forms: cat face\)/);
    assert.match(await ask(dir, server, 'plan --fast'), /^REFUSED: \.\/unpaint plan takes no further words/); assert.match(await ask(dir, server, 'look; rm -rf x'), /^REFUSED: a request is one of status, plan, look, cost/);
    const rec = await server.stop();
    assert.deepEqual(rec.looks.map(l => [l.cost, l.ask.until, l.ask.region?.box ?? null]), [[0.3, 1, null], [0.4, 3, [50, 0, 150, 50]], [0.5, null, [0, 0, 100, 100]], [0.8, 3, null]]); assert.deepEqual(rec.lookUnits, { spent: 2, budget: 2 }); assert.equal(rec.looks[0].estimate.washes, 3);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a look has a fixed price by size and share, whatever is in it: how it paints is recorded beside the charge, never charged', async () => {
  const { dir, ledger } = folder({ looks: 3 }); let work = { sweeps: 45, dryings: 3, waterSteps: 4000 };
  try {
    const rows = [{ stage: 1 }, { stage: 1 }, { stage: 2 }, { stage: 3 }];
    const server = sessionServer({ dir, ledger, looks: 3, checkScript: s => s, compile: async () => ({ ...compiled(1), rows }), look: async () => { const l = await looked(); return { ...l, painted: { ...l.painted, work } }; } });
    assert.match(await ask(dir, server, 'plan'), /A look of this plan costs 0\.3 of your 3 units left; stopped after a stage, its share \(--until 1: 0\.2, --until 2: 0\.22\).*never under 0\.2\. The price is fixed by size and share: how you paint costs nothing\./);
    assert.match(await ask(dir, server, 'look'), /^LOOK 1 \(nothing changed\), cost 0\.3 units \(the fixed price of a half-size look of the sheet\), 2\.7 of 3 left/, 'a half-size look of the whole sheet is 0.3');
    // ten times the water and the strokes: the same price
    work = { sweeps: 4500, dryings: 30, waterSteps: 40000 }; put(dir, { kind: 'settings', settings: { 'study1.shapes': 60 } });
    assert.match(await ask(dir, server, 'look'), /^LOOK 2 \(settings\), cost 0\.3 units .*2\.4 of 3 left/);
    put(dir, { kind: 'settings', settings: { 'study1.shapes': 70 } });
    assert.match(await ask(dir, server, 'look --until 1'), /^LOOK 3 \(settings\), cost 0\.2 units \(the fixed price of a half-size look of part of the sheet\), 2\.2 of 3 left/, 'a partial look its share, never under 0.2');
    const l = ledgerLooks(ledger); assert.deepEqual(l.map(x => [x.cost, x.quoted, x.size]), [[0.3, 0.3, 'half'], [0.3, 0.3, 'half'], [0.2, 0.2, 'half']]);
    assert.deepEqual(l[1].work, { sweeps: 4500, dryings: 30, waterSteps: 40000 }, 'the work is recorded beside the charge');
    const full = sessionServer({ lookSize: 'full', dir, ledger: `${ledger}2`, looks: 3, checkScript: s => s, compile: async () => ({ ...compiled(1), rows }), look: looked });
    assert.match(await ask(dir, full, 'look'), /cost 1 unit \(the fixed price of a full-size look of the sheet\), 2 of 3 left/, 'a full-size look is 1.0');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('at every level the folder holds the code planner\'s inputs and no code plan: no auto/, words that do not speak of it, and the model\'s own script to write', () => {
  const prev = tmp(); fs.writeFileSync(path.join(prev, 'a.jpg'), PNG);
  const previous = { folder: 'previous', title: 'Your own previous painting of this subject', words: 'Judge it yourself.', files: [{ from: path.join(prev, 'a.jpg'), name: 'final-beside-subject.jpg', what: 'your painting beside the subject', picture: true }] };
  fs.writeFileSync(path.join(prev, 'shapes.json'), '{"shapes": []}');
  for (const [level, handed] of [['L2', []], ['L3', [previous]], ['L4', [previous, shapesHanded(path.join(prev, 'shapes.json'))]]]) {
    const { dir, prompt } = folder({ level, handed });
    try {
      assert.ok(!fs.existsSync(path.join(dir, 'auto')), `${level}: no auto/ folder`);
      for (const f of ['TASK.md', 'README.md', 'choice.json', 'unpaint', 'own-script-brief.md', 'inputs/source.png', 'inputs/study-2.png', 'inputs/forms-ids.png', 'inputs/forms.json', 'drawing/lines.json']) assert.ok(fs.existsSync(path.join(dir, f)), `${level}: ${f}`);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'choice.json'), 'utf8')), { kind: 'script', script: 'script.json', why: '' }, `${level}: it starts from its own script, not yet written`);
      const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
      for (const [name, text] of [['TASK.md', prompt], ['README.md', readme]]) {
        assert.doesNotMatch(text, /code planner|code's plan|auto\/|plan-to-edit|settings choice|"kind": "settings"|"kind": "plan"|perForm|edited plan|<!--/, `${level}: ${name} says nothing of the code's plan or planner`);
      }
      assert.match(prompt, /your own painting script/); assert.match(prompt, /has handed in nothing/); assert.match(prompt, /Looks: `2` units\. A look has a fixed price, whatever is in it: a\s+look of your whole plan on the whole sheet, painted at half size, costs 0\.3/); assert.match(prompt, /and at least 0\.2/); assert.match(prompt, /How you paint costs nothing: water, wetness, brushwork, the number of\s+strokes, waits and dryings are yours, and the final painting is not charged/); assert.doesNotMatch(prompt, /charged what it really took|brush sweeps and its dryings|painting work it really takes/, 'nothing says water or strokes cost budget');
      assert.match(readme, /`inputs\/study-2.png`: block-in STUDY 2: the subject simplified to flat shapes \(1 the broad shapes, 2 the middle study, 3 details and accents; to look at only\)\n/);
      assert.match(readme, /"kind": "erase"/, 'its erase passages are its own to write'); assert.match(readme, /"lines": "my-lines.json"/);
      if (level !== 'L2') assert.match(prompt, /`previous\/final-beside-subject.jpg`/);
      if (level === 'L4') {
        // given: the studies' traced shapes, offered and maybe wrong; nothing of Auto
        assert.ok(fs.existsSync(path.join(dir, 'resources/shapes.json')));
        assert.match(prompt, /offered, not required, and they may be wrong/); assert.match(prompt, /Use them, change them, redraw them, or ignore them/); assert.doesNotMatch(prompt, /\bmust use\b/i);
        // withheld: the code's plan and planner, the plan's washes, Auto's painting, film (replay sheet) and stroke map (arrows)
        for (const f of WITHHELD) assert.ok(!fs.existsSync(path.join(dir, f)), `L4 withholds ${f}`);
        assert.doesNotMatch(prompt, /auto-painting|Auto|washes\.json/); assert.doesNotThrow(() => checkWithheld(dir));
        fs.mkdirSync(path.join(dir, 'auto-painting')); fs.writeFileSync(path.join(dir, 'auto-painting/final-beside-subject.jpg'), 'x');
        assert.throws(() => checkWithheld(dir), /holds auto-painting, auto-painting\/final-beside-subject\.jpg, which no level hands over/, 'Auto\'s finished painting stops a session');
        fs.mkdirSync(path.join(dir, 'auto')); assert.throws(() => checkWithheld(dir), /holds auto, auto-painting/);
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  fs.rmSync(prev, { recursive: true, force: true });
  // the level is always said, and what a level hands over must agree with it
  const dir = tmp(); fs.mkdirSync(path.join(dir, 'inputs'));
  const base = { dir, packet: { files: [], brief: 'B' }, sheet: { widthMm: 280, heightMm: 186.7 }, medium: 'pencil', looks: 2, wallMinutes: 60, briefFile: path.join(HERE, 'SESSION-BRIEF.md'), readmeFile: path.join(HERE, 'SESSION-README.md') };
  try {
    assert.throws(() => writeSession(base), /say whether this level hands over the code's plan/);
    assert.throws(() => writeSession({ ...base, codePlan: false, auto: { picture: PNG, washesText: '', plan: {} }, settings: [] }), new RegExp(OWN_SCRIPT_ONLY));
    assert.throws(() => writeSession({ ...base, codePlan: true }), /the preflight's folder holds the code's plan/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a brief\'s level marks: level 4 text is kept only with the code\'s plan, the levels 2 and 3 text only without; the marks go', () => {
  const text = 'a\n<!-- L4 -->\nfour\n<!-- end -->\n<!-- L2 L3 -->\ntwo\n<!-- end -->\nb';
  assert.equal(forLevel(text, true), 'a\nfour\nb'); assert.equal(forLevel(text, false), 'a\ntwo\nb');
  assert.throws(() => forLevel('<!-- L4 -->\nx', true), /no <!-- end -->/); assert.throws(() => forLevel('x\n<!-- end -->', true), /no level before it/); assert.throws(() => forLevel('<!-- L4 -->\n<!-- L2 L3 -->', true), /inside another/);
  for (const f of ['SESSION-BRIEF.md', 'SESSION-README.md']) { const t = fs.readFileSync(path.join(HERE, f), 'utf8'); for (const c of [true, false]) assert.doesNotMatch(forLevel(t, c), /<!--/, f); }
});

test('at every level the settings choice, the plan edit, forms and perForm are refused, nothing is spent, and the model\'s own script is planned and looked at', async () => {
  for (const level of ['L2', 'L4']) await refusedAt(level);
});
async function refusedAt(level) {
  const { dir, ledger } = folder({ level, looks: 3 }); let compiledN = 0;
  try {
    const server = sessionServer({ lookSize: 'full', dir, ledger, codePlan: false, look: looked, looks: 3, wallMinutes: 85, checkScript: s => s, checkPlan: e => ({ edit: e, record: {} }), checkTools: () => ({ record: {}, said: '', warnings: [] }), compile: async () => { compiledN++; return compiled(1); } });
    assert.match(await ask(dir, server, 'plan'), /^REFUSED, nothing was planned: there is no file script\.json in this folder/, 'its script is still to be written: nothing stands in for it');
    const L4 = /^REFUSED, nothing was planned( and no look was counted)?: choice\.json: the code's plan, its planner and its settings are handed over at no level: every level hands in its own script\./;
    for (const bad of [{ kind: 'settings', settings: {} }, { kind: 'settings', settings: { 'study1.shapes': 60 } }, { kind: 'plan', plan: 'my-plan.json' }, { kind: 'script', script: 'script.json', forms: 'my-forms.json' }, { kind: 'script', script: 'script.json', perForm: { 'cat face': { 'study1.clusters': 24 } } }, { kind: 'script', script: 'script.json', settings: { floors: '8,4,2' } }]) {
      put(dir, bad); fs.writeFileSync(path.join(dir, 'my-plan.json'), '{}'); fs.writeFileSync(path.join(dir, 'script.json'), '{"passages": [1]}');
      for (const cmd of ['plan', 'look', 'cost']) assert.match(await ask(dir, server, cmd), cmd === 'plan' ? L4 : cmd === 'look' ? /^REFUSED, nothing was planned and no look was counted: choice\.json: the code's plan, its planner and its settings are handed over at no level/ : L4, `${cmd} ${JSON.stringify(bad)}`);
    }
    assert.equal(compiledN, 0, 'nothing of the code\'s plan was planned'); assert.equal(ledgerLooks(ledger).length, 0, 'nothing was spent');
    put(dir, { kind: 'script', script: 'script.json', lines: 'my-lines.json', medium: 'pen', why: 'mine' }); fs.writeFileSync(path.join(dir, 'my-lines.json'), '{}');
    assert.match(await ask(dir, server, 'plan'), /^It compiles \(own script with its choice of lines, the drawing in pen\)/);
    const looks = await ask(dir, server, 'look'); assert.match(looks, /^LOOK 1 \(own script with its choice of lines, the drawing in pen\)/); assert.doesNotMatch(looks, /code planner|auto\//);
    const rec = await server.stop(), fin = finalChoice({ present: server.present, lastGood: rec.lastGood, good: rec.good, ended: 'done', barred: server.barred, codePlan: false });
    assert.equal(fin.submitted.kind, 'script'); assert.equal(fin.submitted.from, 'choice.json as the session left it');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('at every level a session that hands in no script of its own has handed in nothing: the code\'s plan is never painted in its place', async () => {
  const { dir, ledger } = folder({ level: 'L3' });
  try {
    const server = sessionServer({ lookSize: 'full', dir, ledger, codePlan: false, look: looked, looks: 2, wallMinutes: 85, checkScript: s => s, compile: async () => compiled(1) });
    // the folder as it was handed: choice.json names a script that was never written
    let rec = await server.stop(), fin = finalChoice({ present: server.present, lastGood: rec.lastGood, good: rec.good, ended: 'done', codePlan: false });
    assert.match(fin.failure, /^nothing handed in: the session's final choice\.json was not taken and no script of its own had compiled \(there is no file script\.json in this folder\)/); assert.equal(fin.nothingHandedIn, true); assert.equal(fin.choice, undefined);
    // a choice that changes nothing is the code planner's plan at level 4, and nothing at all below it
    put(dir, { kind: 'settings', settings: {} });
    fin = finalChoice({ present: server.present, lastGood: null, ended: 'budget reached', codePlan: false });
    assert.match(fin.failure, /^nothing handed in: .*handed over at no level.*at no level does anything stand in for it$/);
    // a script it wrote and planned, then broke, is what it handed in
    fs.writeFileSync(path.join(dir, 'script.json'), '{"passages": [1]}'); put(dir, { kind: 'script', script: 'script.json' });
    assert.match(await ask(dir, server, 'plan'), /^It compiles \(own script\)/);
    fs.writeFileSync(path.join(dir, 'script.json'), 'not json'); rec = await server.stop();
    fin = finalChoice({ present: server.present, lastGood: rec.lastGood, good: rec.good, ended: 'done', codePlan: false });
    assert.equal(fin.submitted.kind, 'script'); assert.match(fin.submitted.from, /the last choice that compiled/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('levels 2 to 4 are told the original\'s real size in one line beside their sheet\'s; with none recorded, nothing', () => {
  for (const level of ['L2', 'L3', 'L4']) {
    const { dir, prompt } = folder({ level, realSize: { heightCm: 19.7, widthCm: 28, nominal: false, part: false } });
    try { assert.match(prompt, /mm\. You do not paint stroke by stroke: you decide the plan the painter follows\.\nThe original is 19\.7 x 28 cm; your sheet is 18\.7 x 28 cm \(height x width\)\.\n\n\*\*The goal/, level); assert.equal(fs.readFileSync(path.join(dir, 'TASK.md'), 'utf8'), prompt); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  const none = folder({ level: 'L2' });
  try { assert.doesNotMatch(none.prompt, /original is|REAL_SIZE/); assert.match(none.prompt, /the painter follows\.\n\n\*\*The goal/); } finally { fs.rmSync(none.dir, { recursive: true, force: true }); }
});

test('a Muse session\'s transcript is its own session log: found by the session id, and read for steps, commands, exits, the last message and the tokens', () => {
  const root = tmp(), id = '0f0e0d0c-0b0a-4908-8706-050403020100', dir = path.join(root, '2026', '11', '23', id), out = path.join(root, 'S.out.txt'), keep = path.join(root, 'S.log.jsonl');
  try {
    fs.writeFileSync(out, '{"some":"line of its output"}\n');
    const call = { log: { root, id } };
    assert.equal(transcriptFile({}, out), out, 'a command without a log of its own is read from its output'); assert.equal(transcriptFile(call, out), out, 'no log yet: the output');
    const ev = event => JSON.stringify({ schema_version: 1, payload: { kind: 'run', event } });
    const usage = (family, q) => ev({ kind: 'goal_usage_attribution', record: { usage_family: family, quantity: q } });
    fs.mkdirSync(path.join(root, '.msp-view-v1', id), { recursive: true }); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'session.jsonl'), [
      ev({ kind: 'assistant_tool_calls_committed', tool_calls: [{ id: 'i1', call_id: 'c1', name: 'read_file', args: '{"path":"inputs/source.png"}' }, { id: 'i2', call_id: 'c2', name: 'bash', args: '{"command":"./unpaint plan","description":"plan"}' }] }),
      ev({ kind: 'tool_result_batch_committed', results: [{ tool_call_index: 0, tool_call_id: 'c1', text: 'a picture' }, { tool_call_index: 1, tool_call_id: 'c2', text: '{\n  "exit_code": 0,\n  "output": "It compiles"\n}' }] }),
      usage('provider', { input_tokens: 1000, cached_tokens: 600, output_tokens: 40, reasoning_tokens: 25 }), usage('tool', { input_tokens: 9999 }),
      ev({ kind: 'assistant_tool_calls_committed', tool_calls: [{ id: 'i3', call_id: 'c3', name: 'bash', args: '{"command":"ls /nowhere"}' }, { id: 'i4', call_id: 'c4', name: 'bash', args: 'not json' }] }),
      ev({ kind: 'tool_result_batch_committed', results: [{ tool_call_id: 'c3', text: '{"exit_code": 2, "output": "No such file"}' }] }),
      ev({ kind: 'assistant_message_committed', text: 'I wrote my script.' }), usage('provider', { input_tokens: 500, cached_tokens: 0, output_tokens: 10, reasoning_tokens: 0 }), '{"a partial last li',
    ].join('\n'));
    const file = transcriptFile(call, out); assert.equal(file, path.join(dir, 'session.jsonl'));
    assert.equal(transcriptFile({ log: { root, id } }, out, keep), keep, 'at the end the log is copied into the run\'s folder and read there'); assert.equal(fs.readFileSync(keep, 'utf8'), fs.readFileSync(file, 'utf8'));
    const m = readTranscript('muse', fs.readFileSync(file, 'utf8'));
    assert.deepEqual(m.calls, { 'read file': 1, 'unpaint plan': 1, shell: 2 }); assert.deepEqual(m.commands, ['read_file inputs/source.png', './unpaint plan', 'ls /nowhere', '']);
    assert.deepEqual(m.steps.map(x => [x.kind, x.exit, x.failed]), [['read', null, false], ['shell', 0, false], ['shell', 2, true], ['shell', null, false]]); assert.equal(m.steps.length, 4, 'each tool call is one step of the budget');
    assert.equal(m.text, 'I wrote my script.'); assert.equal(m.tokensIn, 1500); assert.equal(m.tokensOut, 50); assert.equal(m.tokens, 1550); assert.equal(m.costUSD, null);
    assert.deepEqual([m.tokenSplit.reported, m.tokenSplit.freshIn, m.tokenSplit.cachedIn, m.tokenSplit.out, m.tokenSplit.thinking], [true, 900, 600, 50, 25]); assert.match(m.tokenSplit.from, /its own session log/);
    assert.deepEqual(readTranscript('muse', '{"some":"line of its output"}').steps, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('eyes only: the pictures lie in the folder at the start, are put away by a plan, and ./unpaint show brings one back, counted, the original at its price', async () => {
  const { dir, ledger, eyesOnly } = folder({ looks: 0.5, level: 'L2' }), store = tmp();
  try {
    assert.deepEqual(eyesOnly, ['inputs/source.png', 'inputs/study-2.png'], 'the subject and the studies; the forms and the drawing are data');
    for (const f of eyesOnly) { fs.mkdirSync(path.dirname(path.join(store, f)), { recursive: true }); fs.copyFileSync(path.join(dir, f), path.join(store, f)); }
    put(dir, { kind: 'script', script: 'script.json' }); fs.writeFileSync(path.join(dir, 'script.json'), '{"passages": []}');
    const server = sessionServer({ dir, codePlan: false, ledger, looks: 0.5, wallMinutes: 60, eyes: { files: eyesOnly, store }, look: async () => ({ ...(await looked()), sheet: PNG }), checkScript: s => s, compile: async () => compiled(1) });
    server.begin();
    assert.deepEqual(ledgerShowings(ledger).map(e => [e.shown, e.cost, e.atStart]), [['inputs/source.png', 0, true], ['inputs/study-2.png', 0, true]], 'the first showing of each is the start, free and recorded');
    assert.match(await ask(dir, server, 'show inputs/source.png'), /^`inputs\/source\.png` is in your folder already: nothing was spent\./);
    assert.match(await ask(dir, server, 'cost'), /would cost/); assert.ok(fs.existsSync(path.join(dir, 'inputs/source.png')), 'pricing a look puts nothing away');
    assert.match(await ask(dir, server, 'plan'), /^It compiles/);
    for (const f of eyesOnly) assert.equal(fs.existsSync(path.join(dir, f)), false, `${f} is put away by a plan`);
    assert.ok(fs.existsSync(path.join(dir, 'inputs/forms.json')) && fs.existsSync(path.join(dir, 'inputs/forms-ids.png')) && fs.existsSync(path.join(dir, 'drawing/lines.json')), 'the data stays');
    const shown = await ask(dir, server, 'show inputs/source.png');
    assert.match(shown, /^SHOWN: `inputs\/source\.png` is in your folder until your next plan or look, cost 0\.05 of a unit\. Open it with your image viewer; a program may not read it\./); assert.match(shown, /0\.05 of 0\.5 rendering units spent on 0 looks and 1 showing of the subject/);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'inputs/source.png')), PNG); assert.equal(fs.statSync(path.join(dir, 'inputs/source.png')).mode & 0o222, 0);
    assert.match(await ask(dir, server, 'show study-2'), /^SHOWN: `inputs\/study-2\.png` .*, free\./, 'a study by its short name, free');
    assert.match(await ask(dir, server, 'show inputs/forms.json'), /^REFUSED, nothing was shown and nothing was spent: name the picture/);
    assert.match(await ask(dir, server, 'show ../x'), /^REFUSED/);
    // a look puts them away again, and delivers the session's own sheet alone beside the pictures
    assert.match(await ask(dir, server, 'look'), /^LOOK 1 .*cost 0\.3 units.*0\.15 of 0\.5 left/s); assert.equal(fs.existsSync(path.join(dir, 'inputs/source.png')), false);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'looks/1/sheet.png')), PNG);
    // the showings and the looks share one budget: with 0.15 left three showings are had, the fourth is refused and counted
    for (let i = 0; i < 3; i++) { assert.match(await ask(dir, server, 'show source'), /^SHOWN/); assert.match(await ask(dir, server, 'plan'), /^It compiles/); }
    assert.match(await ask(dir, server, 'show source'), /^NOT SHOWN, nothing was spent: showing `inputs\/source\.png` costs 0\.05 and you have 0 of 0\.5 units left\./); assert.equal(fs.existsSync(path.join(dir, 'inputs/source.png')), false);
    assert.match(await ask(dir, server, 'show study-2'), /^SHOWN/, 'a free picture is still shown');
    const rec = await server.stop();
    assert.equal(rec.showings.filter(e => e.shown === 'inputs/source.png' && e.cost === 0.05).length, 4); assert.deepEqual(rec.lookUnits, { spent: 0.5, budget: 0.5 });
    assert.ok(rec.showings.every(e => e.at && e.shown), 'each showing says which picture and when');
    // the count outlives the server
    const again = sessionServer({ dir, codePlan: false, ledger, looks: 0.5, wallMinutes: 60, eyes: { files: eyesOnly, store }, look: looked, checkScript: s => s, compile: async () => compiled(1) });
    again.begin(); assert.equal(ledgerShowings(ledger).filter(e => e.atStart).length, 2, 'the start is recorded once');
    assert.match(await ask(dir, again, 'status'), /0\.5 of 0\.5 rendering units spent on 1 look and 4 showings of the subject/); await again.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(store, { recursive: true, force: true }); }
});

test('eyes only: the session is told in plain words what is a picture and what is data, and nothing invites it to measure a picture with code', () => {
  const { dir, prompt } = folder({ level: 'L2' });
  try {
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    assert.match(readme, /\*\*No program may read a picture\.\*\*/); assert.match(readme, /reading a picture with code disqualifies the try/);
    assert.match(readme, /`\.\/unpaint show inputs\/source\.png` brings one back until your next plan or look: the subject costs\n0\.05 of a look unit each time/);
    assert.match(readme, /The data is yours to read with any code: `inputs\/forms\.json` and `inputs\/forms-ids\.png`/);
    assert.match(prompt, /Look at the pictures with your own eyes only/); assert.match(prompt, /brings the subject back for\n0\.05 of a look unit/);
    for (const text of [readme, prompt]) { assert.doesNotMatch(text, /measure the input pictures|sampling a colour|colours from the\s+studies|SHOW_COST/); }
    assert.match(fs.readFileSync(path.join(dir, 'unpaint'), 'utf8'), /status\|plan\|look\|cost\|show\)/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('eyes only: every profile of this harness names the model command\'s own program as the one reader of the pictures; a command that is not installed is not started', { skip: process.platform !== 'darwin' && 'the profile is macOS seatbelt' }, () => {
  const cwd = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'unpaint-session-eyes-'));
  try {
    const call = sessionCall({ key: 'x', id: 'm', cli: 'no-such-model-command' }, { prompt: 'P', cwd, eyesOnly: null });
    assert.fail(`started ${call.cmd}`);
  } catch (e) { assert.match(e.message, /needs a shell/); } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
  assert.throws(() => sessionCall({ key: 'x', id: 'm', cli: 'no-such-model-command' }, { prompt: 'P', cwd: '/tmp/x', eyesOnly: ['inputs/source.png'] }), /eyes only: the `no-such-model-command` command is not on PATH/);
});
