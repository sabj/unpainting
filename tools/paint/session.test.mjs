import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LOOKS, DEFAULT_MINUTES, writeSession, sessionServer, ledgerLooks, safeRead, safeWrite, finalChoice, cleanEnv, seatbelt, sessionCall, readTranscript, reachedOutside, ownFolderOf, ownPictures, runSession } from './session.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paint-session-test-'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
function folder({ looks = 2, minutes = 85 } = {}) {
  const dir = tmp(); fs.mkdirSync(path.join(dir, 'inputs')); fs.writeFileSync(path.join(dir, 'inputs/source.png'), PNG); fs.writeFileSync(path.join(dir, 'inputs/study-2.png'), PNG);
  const out = writeSession({ dir, packet: { files: ['inputs/source.png', 'inputs/study-2.png'], brief: 'HOW TO WRITE A SCRIPT' }, sheet: { widthMm: 280, heightMm: 186.7 }, medium: 'pencil (graphite)',
    auto: { picture: PNG, washesText: 'AUTO WASHES', plan: { summary: { washes: 3 }, washes: [] }, toEdit: { format: 'plan-edit 1', of: 'abc', washes: [] } }, settings: [{ set: 'floors', now: '6,4,2', meaning: 'the least shape' }], forms: [{ id: 2, name: 'cat face', kind: 'face', boxMm: [1, 2, 3, 4] }], formsIds: path.join(dir, 'inputs/source.png'),
    looks, minutes, briefFile: path.join(HERE, 'SESSION-BRIEF.md'), readmeFile: path.join(HERE, 'SESSION-README.md') });
  return { dir, ledger: path.join(tmp(), 'looks.jsonl'), ...out };
}
const compiled = n => ({ ok: true, summary: { shapes: 10, washes: 20 + n, strokes: 100, widestBrushMm: 17 }, rows: [{ n: 1 }], numbersText: 'NUMBERS', picture: PNG, marked: { forms: 1, washes: 0 } });
const put = (dir, choice) => fs.writeFileSync(path.join(dir, 'choice.json'), JSON.stringify(choice));
let seq = 0;
async function ask(dir, server, cmd) { fs.writeFileSync(path.join(dir, '.requests', `${Date.now() % 1e9}-${++seq}.req`), cmd); await server.tick(); const f = fs.readdirSync(path.join(dir, '.requests')).filter(x => x.endsWith('.ans')).map(x => path.join(dir, '.requests', x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs || b.localeCompare(a)); const all = f.map(x => fs.readFileSync(x, 'utf8')); for (const x of f) fs.rmSync(x); return all[0]; }

test('the folder holds the task, the tools, the code planner\'s plan and a choice that changes nothing', () => {
  const { dir, prompt } = folder({ looks: 4 });
  try {
    for (const f of ['TASK.md', 'README.md', 'choice.json', 'unpaint', 'own-script-brief.md', 'auto/plan.png', 'auto/washes.txt', 'auto/plan.json', 'auto/settings.json', 'inputs/forms-ids.png', 'inputs/forms.json']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'choice.json'), 'utf8')), { kind: 'settings', settings: {}, why: '' });
    assert.match(prompt, /`280` by `186.7` mm/); assert.match(prompt, /85 minutes of your own time/); assert.match(prompt, /You have 4 looks/); assert.match(prompt, /exactly the code\s+planner's/); assert.match(prompt, /No score is ever shown/); assert.match(prompt, /light pencil/);
    assert.doesNotMatch(prompt, /SHEET_W|LOOKS looks|MINUTES minutes|DRAWING_NOTE/);
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
    assert.match(readme, /`inputs\/source.png`: the SUBJECT/); assert.match(readme, /`inputs\/study-2.png`: block-in STUDY 2/); assert.match(readme, /\| `\.\/unpaint look` \|.*\| 4 looks; each is counted before it is shown \|/); assert.doesNotMatch(readme, /INPUT_LIST|SHEET_W/);
    assert.ok(fs.statSync(path.join(dir, 'unpaint')).mode & 0o100, 'the command can be run');
    assert.ok(!fs.existsSync(path.join(dir, 'auto/beside.png')) && !fs.existsSync(path.join(dir, 'auto/numbers.txt')), 'nothing at the start sets a plan against the subject: that is a look');
    assert.equal(DEFAULT_LOOKS, 4); assert.equal(DEFAULT_MINUTES, 85);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a plan answers with counts only and looks are counted: after the last look the command refuses, and a refused choice costs nothing', async () => {
  const { dir, ledger } = folder({ looks: 2 }); let n = 0;
  try {
    const server = sessionServer({ dir, ledger, looks: 2, minutes: 85, checkScript: s => { if (!s.passages) throw new Error('painting script: no passages'); return s; }, compile: async (choice) => (choice.sets.some(([k]) => k === 'bogus') ? { ok: false, error: '--set bogus: not an option' } : compiled(++n)) });
    assert.match(await ask(dir, server, 'status'), /Looks: 0 of 2 used, 2 left\. Plans made: 0\./);
    const free = await ask(dir, server, 'plan');
    assert.match(free, /^It compiles \(nothing changed\): 10 shapes, 21 washes, 100 strokes, widest wash brush 17 mm\. Nothing else is shown without a look\./);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'plans')), [], 'a free plan leaves no data and no picture in the folder'); assert.doesNotMatch(free, /rgb|box|covers|plan\.json/);
    put(dir, { kind: 'settings', settings: { 'study1.shapes': 60 } });
    assert.match(await ask(dir, server, 'look'), /^LOOK 1 of 2 \(settings\).*\n.*looks\/1\/beside\.png.*looks\/1\/numbers\.txt: 1 named forms and 0 washes are marked/);
    assert.ok(fs.existsSync(path.join(dir, 'looks/1/beside.png'))); assert.equal(fs.readFileSync(path.join(dir, 'looks/1/numbers.txt'), 'utf8'), 'NUMBERS'); assert.ok(fs.existsSync(path.join(dir, 'looks/1/plan.json')));
    for (const bad of [{ kind: 'plan' }, { kind: 'settings', settings: { masks: 'none' } }, { kind: 'settings', settings: { bogus: 1 } }, { kind: 'script', script: 'none.json' }]) { put(dir, bad); assert.match(await ask(dir, server, 'look'), /^REFUSED.*no look was counted/, JSON.stringify(bad)); }
    fs.writeFileSync(path.join(dir, 'script.json'), '{"palette": ["ochre"]}'); put(dir, { kind: 'script', script: 'script.json' });
    assert.match(await ask(dir, server, 'plan'), /^REFUSED, nothing was planned: painting script: no passages/);
    fs.writeFileSync(path.join(dir, 'script.json'), '{"palette": ["ochre"], "passages": [1]}');
    assert.match(await ask(dir, server, 'look'), /^LOOK 2 of 2 \(own script\)/);
    assert.match(await ask(dir, server, 'look'), /^REFUSED: all 2 looks are used/);
    assert.match(await ask(dir, server, 'plan'), /^It compiles \(own script\)/, 'planning goes on after the last look');
    assert.equal(n, 3, 'the same choice is planned once');
    const rec = await server.stop();
    assert.deepEqual(rec.looks.map(l => [l.look, l.what, l.settings]), [[1, 'settings', { 'study1.shapes': '60' }], [2, 'own script', {}]]);
    assert.equal(rec.plans.length, 5); assert.equal(rec.plans.filter(p => !p.ok).length, 1); assert.equal(rec.lastGood.choice.kind, 'script'); assert.equal(rec.good.size, 3);
    const lines = fs.readFileSync(ledger, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.equal(lines.filter(l => l.look).length, 2); assert.ok(lines.filter(l => l.request).length >= 10, 'every request is in the ledger');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a look is spent before it is delivered, and the count outlives the server', async () => {
  const { dir, ledger } = folder({ looks: 2 });
  try {
    const mk = () => sessionServer({ dir, ledger, looks: 2, minutes: 85, checkScript: s => s, compile: async () => compiled(1) });
    // the session blocks the delivery of the numbers with a folder that cannot be replaced by a file write alone, and
    // points the picture at a file outside its folder: the look is counted all the same, and nothing outside is written
    const outside = path.join(path.dirname(ledger), 'host-file.txt'); fs.writeFileSync(outside, 'HOST');
    fs.mkdirSync(path.join(dir, 'looks/1/numbers.txt/deep'), { recursive: true }); fs.symlinkSync(outside, path.join(dir, 'looks/1/beside.png'));
    const a = mk(); assert.match(await ask(dir, a, 'look'), /^LOOK 1 of 2/);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'HOST', 'a link in the folder is replaced, never written through'); assert.ok(fs.lstatSync(path.join(dir, 'looks/1/beside.png')).isFile()); assert.equal(fs.readFileSync(path.join(dir, 'looks/1/numbers.txt'), 'utf8'), 'NUMBERS');
    assert.equal(ledgerLooks(ledger).length, 1); await a.stop();
    // a delivery that fails outright still leaves the look spent
    fs.rmSync(path.join(dir, 'looks'), { recursive: true }); fs.symlinkSync(path.dirname(ledger), path.join(dir, 'looks'));
    const b = mk(); assert.match(await ask(dir, b, 'status'), /Looks: 1 of 2 used, 1 left/, 'a new server goes on from the ledger');
    assert.match(await ask(dir, b, 'look'), /^LOOK 2 of 2/); assert.ok(!fs.existsSync(path.join(path.dirname(ledger), '2')), 'looks/ as a link is replaced by a real folder');
    assert.match(await ask(dir, b, 'look'), /^REFUSED: all 2 looks are used/); await b.stop();
    assert.match(await ask(dir, mk(), 'look'), /^REFUSED: all 2 looks are used/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the folder is not trusted: no link is followed and no request is echoed', async () => {
  const { dir, ledger } = folder(); const secret = path.join(path.dirname(ledger), 'secret.txt'); fs.writeFileSync(secret, 'SECRET-GEOMETRY');
  try {
    const server = sessionServer({ dir, ledger, looks: 2, minutes: 85, checkScript: s => s, compile: async () => compiled(1) });
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
    const server = sessionServer({ dir, ledger, looks: 2, minutes: 1, now: () => clock, checkScript: s => s, compile: async () => { clock += 600000; return compiled(1); } });
    clock = 30000; assert.equal(server.over(), false);
    fs.writeFileSync(path.join(dir, '.requests/1-1.req'), 'plan'); fs.utimesSync(path.join(dir, '.requests/1-1.req'), 1, 1); await server.tick();
    assert.equal(server.ownSeconds(), 30, 'ten minutes in the planner are not counted, and the request\'s own date is not believed'); clock += 31000; assert.equal(server.over(), true);
    await server.stop();
    const live = sessionServer({ dir, ledger, looks: 2, minutes: 85, checkScript: s => s, compile: async () => compiled(1), everyMs: 50 }); live.start();
    const out = await new Promise((res, rej) => import('node:child_process').then(cp => cp.execFile(path.join(dir, 'unpaint'), ['status'], { cwd: dir }, (e, so) => (e ? rej(e) : res(so)))));
    await live.stop(); assert.match(out, /Looks: 0 of 2 used/);
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
  const cut = finalChoice({ present: () => c('settings', [['floors', '8,4,2']], 'old'), lastGood: null, good: new Set(['old']), ended: 'time limit' });
  assert.match(cut.submitted.note, /ran out of time/);
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
  assert.match(astra.profile, /\(deny file-read\* file-write\* \(subpath "\/repo"\) \(regex #"\/unpaint-session-"\)\)/); assert.match(astra.profile, /\(deny file-write\*\)/); assert.match(astra.profile, /\(deny network\*\)/);
  assert.ok(astra.profile.indexOf('(allow file-read* file-write* (subpath "/tmp/s"))') > astra.profile.indexOf('unpaint-session-'), 'its own folder is allowed again after the denials');
  assert.deepEqual(astra.probe('/repo/x').args.slice(-2), ['/bin/cat', '/repo/x']);
  // agy: the same profile, with loopback and a pseudo-terminal (its helper and its shell), its own prompts off inside it
  const argon = sessionCall({ key: 'argon', id: 'gemini-4-argon-high', effort: 'high', cli: 'agy' }, { prompt: 'P', cwd: '/tmp/s', deny: ['/repo'], home: '/home/x', tmp: '/tmp' });
  assert.equal(argon.cmd, 'sandbox-exec'); assert.equal(argon.args[2], 'agy'); assert.deepEqual(argon.args.slice(3, 7), ['-p', 'P', '--model', 'gemini-4-argon-high']); assert.ok(argon.args.includes('--dangerously-skip-permissions') && argon.args.includes('stream-json'));
  assert.match(argon.profile, /\(deny file-read\* file-write\* \(subpath "\/repo"\)/); assert.match(argon.profile, /\(subpath "\/home\/x\/\.gemini"\)/); assert.match(argon.profile, /\(allow network-bind \(local ip "localhost:\*"\)\)/); assert.match(argon.profile, /\(allow pseudo-tty\)/);
  assert.doesNotMatch(astra.profile, /localhost|pseudo-tty/, 'codex gets neither'); assert.equal(argon.serial, true); assert.deepEqual(argon.probe('/repo/x').args.slice(-2), ['/bin/cat', '/repo/x']);
  assert.throws(() => sessionCall({ key: 'other', cli: 'ollama' }, { prompt: 'P', cwd: '/x' }), /needs a shell/);
  assert.match(seatbelt({ deny: ['/a "b'], write: ['/w'], cwd: '/c' }), /\(subpath "\/a \\"b"\)/);
  assert.deepEqual(cleanEnv({ HOME: '/h', PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', X_GRADE: '1', OPENAI_API_KEY: 'k', LC_ALL: 'C' }), { HOME: '/h', PATH: '/bin', OPENAI_API_KEY: 'k', LC_ALL: 'C' });
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
});

test('pictures the model made itself are found, and the clock ends a session', async () => {
  const { dir } = folder();
  try {
    fs.mkdirSync(path.join(dir, 'looks/1'), { recursive: true }); fs.writeFileSync(path.join(dir, 'looks/1/beside.png'), PNG); fs.mkdirSync(path.join(dir, 'notes')); fs.writeFileSync(path.join(dir, 'notes/mine.PNG'), PNG); fs.writeFileSync(path.join(dir, 'render.svg'), '<svg/>');
    assert.deepEqual(ownPictures(dir), ['notes/mine.PNG', 'render.svg']);
    const at = f => path.join(dir, f); let asked = 0;
    // a command that ignores the first signal and has started a child of its own: both are ended
    const cut = await runSession({ cmd: 'sh', args: ['-c', 'trap "" TERM; sleep 31 & echo $! > child.pid; sleep 30'], env: {} }, { cwd: dir, outFile: at('o'), errFile: at('e'), over: () => ++asked > 1, everyMs: 30, graceMs: 200 });
    assert.equal(cut.ended, 'time limit'); await new Promise(r => setTimeout(r, 100));
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
    const server = sessionServer({ dir, ledger, looks: 2, minutes: 85, checkScript: s => s, checkPlan, compile: async (choice, script, n, edit) => { seen = edit; return compiled(1); } });
    assert.ok(fs.existsSync(path.join(dir, 'auto/plan-to-edit.json')));
    put(dir, { kind: 'plan', plan: 'my-plan.json' });
    assert.match(await ask(dir, server, 'plan'), /^REFUSED, nothing was planned: there is no file my-plan.json/);
    fs.writeFileSync(path.join(dir, 'my-plan.json'), '{"of": "other"}');
    assert.match(await ask(dir, server, 'look'), /^REFUSED, nothing was planned and no look was counted: plan edit: "of" must stay/);
    fs.writeFileSync(path.join(dir, 'my-plan.json'), '{"of": "abc", "washes": []}');
    const free = await ask(dir, server, 'plan');
    assert.match(free, /^It compiles \(edited plan\): .* Your edit: of the code planner's 20 washes 15 are untouched \(75%\), 2 changed \(colour 2\), 0 moved, 2 merged into 1, 1 left out; 1 passages of your own added\. Nothing else is shown without a look\./);
    assert.deepEqual(seen, { of: 'abc', washes: [] }); assert.doesNotMatch(free, /rgb|box|covers/);
    assert.match(await ask(dir, server, 'look'), /^LOOK 1 of 2 \(edited plan\)/);
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
