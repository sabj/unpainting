import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readReply, applyEdits, stateHash, runRounds, shapeReuse, changeOf, transcriptText } from './rounds.mjs';
import { dryModel, roundCall, roundsAsker } from './rounds-call.mjs';
import { standInScript, standInReplies } from './rounds-standin.mjs';
import { checkAuthored } from './author.mjs';
import { choiceOf, planText } from './rounds-run.mjs';
import { loadRounds, rank, screeningCommand, scoresOf } from './screening.mjs';

const SHEET = { widthMm: 230, heightMm: 305 };
const state0 = () => ({ script: standInScript(SHEET), drawing: null });
const rowsOf = script => script.passages.map(p => ({ stage: p.stage }));
/** A stand-in painter: compiles by the real check's passages, "paints" by counting. */
function painter({ failCompileOn = () => false, failLook = false } = {}) {
  const seen = { compiles: 0, looks: [] };
  return { seen,
    check: state => checkAuthored(state.script, { sheetWidthMm: SHEET.widthMm }).script,
    compile: async (state, checked) => { seen.compiles++; return failCompileOn(checked) ? { ok: false, error: 'the planner refused it: a wash with no cells' } : { ok: true, rows: rowsOf(checked), table: [], summary: { passages: checked.passages.length, washes: checked.passages.length } }; },
    look: async (state, checked, compiled, want, n) => { seen.looks.push({ n, want, passages: checked.passages.length }); return failLook ? { ok: false, error: 'the painter ended before the sheet was dry' } : { ok: true, images: [`looks/${n}/sheet.jpg`], text: 'THE SHEET AS IT DRIED: ...', painted: { seconds: 100 } }; } };
}
const run = (replies, p = painter(), more = {}) => runRounds({ first: { text: 'BRIEF', images: ['sent/source.jpg'] }, ask: dryModel({ replies }), sheet: SHEET, forms: [{ name: 'cat face', boxMm: [60, 80, 170, 220] }], ...p, ...more });

test('a reply is read: a whole script, edits, a look, done', () => {
  assert.equal(readReply(`here it is\n\`\`\`json\n${JSON.stringify(standInScript(SHEET))}\n\`\`\``).script.passages.length, 3);
  const r = readReply('{"edits": [{"op": "remove", "id": "p3"}], "look": {"until": 2}}');
  assert.deepEqual([r.edits.length, r.look, r.done], [1, { until: 2, region: null }, false]);
  assert.equal(readReply('{"done": true}').done, true);
  assert.deepEqual(readReply('{"look": "whole"}').look, { until: null, region: null });
  assert.throws(() => readReply('no json here'), /no JSON object/);
  assert.throws(() => readReply(JSON.stringify({ ...standInScript(SHEET), edits: [{ op: 'remove', id: 'p1' }] })), /not both/);
  // the drawing beside a whole script is kept apart from it
  const d = readReply(JSON.stringify({ ...standInScript(SHEET), medium: 'pen', ink: 'soluble' }));
  assert.deepEqual(d.drawing, { medium: 'pen', ink: 'soluble' }); assert.equal(d.script.medium, undefined);
});

test('edits: add, remove, replace, move, set (one, several, top level, removal), drawing', () => {
  const s = state0(), ids = st => st.script.passages.map(p => p.id).join(' ');
  const { state, did } = applyEdits(s, [
    { op: 'add', passage: { id: 'p4', kind: 'wash', stage: 4 }, after: 'p1' },
    { op: 'move', id: 'p3', before: 'p1' },
    { op: 'remove', id: 'p2' },
    { op: 'set', id: 'p1', path: 'paint.pigments.sienna', value: 2 },
    { op: 'set', ids: '*', path: 'handling.load', value: 'damp' },
    { op: 'set', id: 'p1', path: 'edges', value: null },
    { op: 'set', path: 'palette', value: ['ochre', 'sienna'] },
    { op: 'replace', id: 'p4', passage: { id: 'p4', kind: 'strokes', stage: 5 } },
    { op: 'drawing', medium: 'none' },
  ]);
  assert.equal(ids(state), 'p3 p1 p4'); assert.equal(did.length, 9);
  const p1 = state.script.passages[1];
  assert.equal(p1.paint.pigments.sienna, 2); assert.equal(p1.handling.load, 'damp'); assert.equal('edges' in p1, false);
  assert.deepEqual(state.script.palette, ['ochre', 'sienna']); assert.equal(state.script.passages[2].kind, 'strokes'); assert.deepEqual(state.drawing, { medium: 'none' });
  // the state given is not changed, and the hash follows what would be painted
  assert.equal(ids(s), 'p1 p2 p3'); assert.notEqual(stateHash(s), stateHash(state)); assert.equal(stateHash(s), stateHash(state0()));
  assert.equal(changeOf(s, state).touched, 4);
  // all or nothing, and the refusal names the edit
  assert.throws(() => applyEdits(s, [{ op: 'remove', id: 'p1' }, { op: 'remove', id: 'nope' }]), /edit 2 \(remove\): there is no passage "nope"/);
  assert.throws(() => applyEdits(s, [{ op: 'paint', id: 'p1' }]), /"op" is one of/);
  assert.throws(() => applyEdits(s, [{ op: 'add', passage: { id: 'p1' } }]), /already a passage/);
  assert.throws(() => applyEdits(s, [{ op: 'set', path: 'sheet.widthMm', value: 100 }]), /fixed/);
});

test('the stand-in runs a whole level: script, edits, a stage look, a region look, done; the budget is charged by size and share', async () => {
  const p = painter(), got = await run(standInReplies(SHEET), p);
  assert.equal(got.ended, 'done'); assert.equal(got.failure, null);
  assert.deepEqual(got.rounds.map(r => r.kind), ['script', 'edits', 'edits', 'done']);
  // look 1 whole 0.3; look 2 until stage 1 (1 wash of 3: its share, floored at 0.2); look 3 a region every passage touches: 0.3
  assert.deepEqual(got.looks.map(l => l.cost), [0.3, 0.2, 0.3]); assert.equal(got.lookUnits.spent, 0.8);
  assert.deepEqual(p.seen.looks.map(l => [l.want.until, Boolean(l.want.region)]), [[null, false], [1, false], [null, true]]);
  assert.equal(got.checked.passages.length, 4); assert.equal(got.state.script.passages.find(q => q.id === 'p3').paint.dilution, 'strong');
  // records are complete: every round has its tokens and its look units, and the sums are there
  assert.ok(got.rounds.every(r => r.tokens && r.hash && r.seconds != null)); assert.ok(got.tokens.fresh > 0 && got.tokens.output > 0);
  assert.equal(new Set(got.rounds.map(r => r.hash)).size, 3);
  // what goes back after a look is the sheet only
  assert.match(got.rounds[1].sent.text, /your own sheet as it dried/); assert.deepEqual(got.rounds[1].sent.images, ['looks/1/sheet.jpg']);
  assert.match(transcriptText(got, { title: 't' }), /## Round 3: done/);
});

test('a compile failure is returned once, free; a second in a row ends the try with no script', async () => {
  const script = JSON.stringify(standInScript(SHEET)), bad = JSON.stringify({ ...standInScript(SHEET), palette: ['mauve'] });
  const once = await run([bad, script, '{"done": true}']);
  assert.equal(once.ended, 'done'); assert.match(once.rounds[0].refused, /not in the box/); assert.equal(once.rounds[1].correction, true);
  assert.match(once.rounds[1].sent.text, /This correction is free/); assert.equal(once.lookUnits.spent, 0.3);
  const twice = await run([bad, 'still not a script']);
  assert.equal(twice.ended, 'no script'); assert.match(twice.failure, /two answers in a row/); assert.equal(twice.state, null);
  // the planner's own refusal is a compile failure too
  const planner = await run([script, script], painter({ failCompileOn: () => true }));
  assert.equal(planner.ended, 'no script'); assert.match(planner.rounds[0].refused, /planner refused/);
  // later: two bad edits in a row keep the last script that compiled, which is painted
  const kept = await run([script, '{"edits": [{"op": "remove", "id": "zz"}]}', '{"edits": [{"op": "remove", "id": "zz"}]}']);
  assert.equal(kept.ended, 'done'); assert.equal(kept.failure, null); assert.equal(kept.checked.passages.length, 3);
});

test('the budget is enforced: looks stop when it is used, and a look it cannot pay for is not painted', async () => {
  const script = JSON.stringify(standInScript(SHEET)), edit = n => JSON.stringify({ edits: [{ op: 'set', id: 'p1', path: 'what', value: `v${n}` }], look: 'whole' });
  const p = painter(), got = await run([script, ...Array.from({ length: 20 }, (_, i) => edit(i))], p);
  assert.equal(got.ended, 'budget used'); assert.equal(got.looks.length, 10); assert.equal(got.lookUnits.spent, 3); assert.equal(p.seen.looks.length, 10);
  // 0.25 left: a whole look (0.3) is refused and said, a stage look (0.2) is painted
  const q = painter(), tight = await run([script, edit(1), JSON.stringify({ edits: [{ op: 'set', id: 'p1', path: 'what', value: 'x' }], look: { until: 1 } }), '{"done": true}'], q, { budget: 0.55 });
  assert.match(tight.rounds[2].sent.text, /costs 0.3 units and you have 0.25 left; nothing was painted/); assert.deepEqual(tight.looks.map(l => l.cost), [0.3, 0.2]);
  // the same look of the same script is not painted or charged twice
  const same = await run([script, '{"look": "whole"}', '{"done": true}']);
  assert.equal(same.looks.length, 1); assert.match(same.rounds[2].sent.text, /already seen this look/);
  // a look that fails on the harness's side costs nothing
  const failed = await run([script, '{"done": true}'], painter({ failLook: true }));
  assert.equal(failed.lookUnits.spent, 0); assert.match(failed.rounds[1].sent.text, /NOT PAINTED/); assert.equal(failed.ended, 'done');
});

test('a model that gives no answer fails the try when it has no script, and keeps its script otherwise', async () => {
  const silent = async () => ({ ok: false, text: '', error: 'the model\'s command ended with exit 1 and no answer', seconds: 3 });
  const none = await runRounds({ first: { text: 'B', images: [] }, ask: silent, sheet: SHEET, ...painter() });
  assert.equal(none.ended, 'model failed'); assert.match(none.failure, /no answer in round 0/);
  let n = 0; const later = await runRounds({ first: { text: 'B', images: [] }, ask: async a => (n++ === 0 ? dryModel({ replies: [JSON.stringify(standInScript(SHEET))] })(a) : silent()), sheet: SHEET, ...painter() });
  assert.equal(later.ended, 'model failed'); assert.equal(later.failure, null); assert.equal(later.checked.passages.length, 3);
});

test('the choice a state stands for, the plan text and the share of supplied shapes reused', () => {
  assert.equal(choiceOf(state0()).tools, undefined);
  // lines that change nothing and draw nothing are no choice of lines (a model sent {"format": ..., "own": []})
  assert.equal(choiceOf({ script: standInScript(SHEET), drawing: { lines: { format: 'lines-edit 1', own: [], rules: [] } } }).tools, undefined);
  const c = choiceOf({ script: standInScript(SHEET), drawing: { medium: 'pen', ink: 'soluble', lines: { format: 'lines-edit 1', own: [{ points: [[10, 10], [20, 20]] }] } } });
  assert.deepEqual([c.kind, c.tools.medium, c.tools.ink, c.tools.lines, c.tools.linesEdit.format], ['script', 'pen', 'soluble', 'my-lines.json', 'lines-edit 1']);
  const t = planText({ summary: { passages: 3, washes: 3, strokes: 40, widestBrushMm: 17 }, table: ['p1 | stage 1'] });
  assert.match(t, /3 passages, 3 washes, 40 strokes/); assert.doesNotMatch(t, /study|TOO DARK|TOO PALE|subject/i);
  assert.deepEqual(shapeReuse({ passages: [{ id: 'a', shapes: [3] }, { id: 'b' }, { id: 'c', strokes: [{ along: 2 }] }, { id: 'd' }] }), { passages: 4, reuse: 2, share: 0.5 });
});

test('each command is called in print mode with no tools, its pictures attached, and continued with its own resume', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rounds-test-')), img = path.join(dir, 'a.jpg'); fs.writeFileSync(img, 'x');
  const call = (cli, resume, more = {}) => roundCall({ key: 'k', id: 'model-id', effort: 'medium', cli, ...more }, { text: 'PROMPT', images: [img], cwd: dir, state: { uuid: 'U-1', id: 'T-1' }, resume });
  const claude = call('claude', false), msg = JSON.parse(claude.stdin);
  assert.deepEqual(claude.args.slice(claude.args.indexOf('--tools'), claude.args.indexOf('--tools') + 2), ['--tools', '']); assert.ok(claude.args.includes('--session-id')); assert.ok(!claude.args.includes('--no-session-persistence'));
  assert.deepEqual(msg.message.content.map(b => b.type), ['text', 'image']); assert.equal(msg.message.content[1].source.media_type, 'image/jpeg');
  assert.deepEqual(call('claude', true).args.slice(-2), ['--resume', 'U-1']);
  const codex = call('codex', false); assert.ok(codex.args.includes('read-only') && codex.args.includes('-i') && !codex.args.includes('--ephemeral'));
  assert.deepEqual(call('codex', true).args.slice(-6), ['resume', 'T-1', '-i', img, '--', 'PROMPT']);
  const agy = call('agy', true); assert.ok(agy.args.includes('plan') && agy.args.includes('--sandbox')); assert.deepEqual(agy.args.slice(-2), ['--conversation', 'T-1']); assert.match(agy.args[agy.args.indexOf('-p') + 1], /a\.jpg/);
  const muse = call('muse', true); assert.ok(['--disable-shell', '--disable-write', '--disable-web-tools', '--image'].every(f => muse.args.includes(f))); assert.ok(!muse.args.includes('--workspace')); assert.equal(muse.args[muse.args.indexOf('--session-id') + 1], 'U-1');
  assert.throws(() => call('together', false), /rounds cannot call/);
  // the transcript's tokens are read split, as the open session's are
  const out = JSON.stringify({ type: 'result', result: 'ANSWER', usage: { input_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 100, output_tokens: 7 }, total_cost_usd: 0.01 });
  assert.deepEqual(claude.parse(out), { text: 'ANSWER', costUSD: 0.01, tokens: { fresh: 15, cached: 100, output: 7, cacheWrite: 5 }, id: 'U-1' });
  // claude's cost figure runs on through a resumed session: a resumed call is charged what it added
  const st = { uuid: 'U-2', id: null }, mk = resume => roundCall({ key: 'k', id: 'm', effort: null, cli: 'claude' }, { text: 'P', images: [], cwd: dir, state: st, resume }), res = c => JSON.stringify({ type: 'result', result: 'A', usage: { input_tokens: 1, output_tokens: 1 }, total_cost_usd: c });
  assert.equal(mk(false).parse(res(0.10)).costUSD, 0.1); assert.equal(mk(true).parse(res(0.14)).costUSD, 0.04);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a continued call that fails is asked once more with the transcript, and the round says so', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rounds-test-')), calls = [];
  const run = async (call, { outFile, errFile }) => { calls.push(call.args); fs.writeFileSync(errFile, ''); const resumed = call.args.includes('--resume'); fs.writeFileSync(outFile, resumed ? '' : JSON.stringify({ type: 'result', result: `answer ${calls.length}`, usage: { input_tokens: 1, output_tokens: 1 } })); return { exit: resumed ? 1 : 0, error: null }; };
  const ask = roundsAsker({ key: 'k', id: 'm', effort: null, cli: 'claude' }, { dir, run });
  const a = await ask({ text: 'first', images: [], round: 0 }), b = await ask({ text: 'second', images: [], round: 1 });
  ask.close();
  assert.equal(a.ok, true); assert.equal(b.ok, true); assert.match(b.continuedBy, /transcript, sent again/); assert.equal(calls.length, 3);
  assert.ok(fs.existsSync(path.join(dir, 'R1-resent.call.json')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the screening stage: the roster of ten, two pictures at level 2, the top half and one of each family', () => {
  const rounds = loadRounds();
  assert.equal(rounds.roster.length, 10); assert.deepEqual(rounds.screening.pictures, ['mittens-closeup-qs', 'turner-esseillon-qs']);
  assert.deepEqual([...new Set(rounds.roster.map(m => m.family))].sort(), ['anthropic', 'codex', 'gemini', 'muse']);
  const cmd = screeningCommand(rounds); assert.match(cmd, /paint -- mittens-closeup-qs,turner-esseillon-qs paint --work rounds --level L2 --author wonderfull-m,neon-m,/); assert.match(cmd, /frames=240/); assert.match(cmd, /UNPAINT_RENDER=pool/);
  // muse scores lowest and still goes on: never fewer than one of each family
  const score = { 'wonderfull-m': 10, 'neon-m': 90, 'carbon-m': 80, 'argon-m': 70, 'astra-m': 60, 'sol-m': 50, 'terra-m': 40, 'fable-m': 30, 'opus-m': 20, 'sonnet-m': 15 };
  const scores = Object.entries(score).flatMap(([author, s]) => rounds.screening.pictures.map(subject => ({ author, subject, score: s })));
  const got = rank(rounds, scores), on = got.ranked.filter(r => r.on).map(r => r.key);
  assert.equal(got.keep, 5); assert.deepEqual(on, ['neon-m', 'carbon-m', 'argon-m', 'astra-m', 'sol-m', 'fable-m', 'wonderfull-m']);
  assert.match(got.ranked.find(r => r.key === 'fable-m').why, /best of its family/);
  // a failed painting counts 0, a missing one too, and both are said
  const short = rank(rounds, [{ author: 'neon-m', subject: 'mittens-closeup', score: 80 }, { author: 'neon-m', subject: 'turner-esseillon-qs', score: null }], { keep: 1 });
  assert.deepEqual([short.ranked[0].key, short.ranked[0].mean, short.ranked[0].failed], ['neon-m', 40, 1]); assert.equal(short.ranked[1].missing, 2);
  assert.deepEqual(scoresOf({ paintings: [{ auto: true, level: null }, { author: 'neon-m', level: 'L2', subject: 's', combined: 55 }, { author: 'neon-m', level: 'L3', subject: 's', combined: 1 }] }), [{ author: 'neon-m', subject: 's', score: 55 }]);
});
