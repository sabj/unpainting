import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { authorOf, authorLabel, briefName, keptScriptAuthor, fillBrief, jsonWith, checkAuthored, readScript, gridImage, formBoxes, authorCall, askAuthor, retryPrompt, preparePacket } from './author.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
const AUTHORS = JSON.parse(fs.readFileSync(path.join(HERE, 'authors.json'), 'utf8')).authors;
const BENCH = [{ key: 'sonnet', name: 'Sonnet 5.5', id: 'claude-sonnet-5-5', effort: 'xhigh', runner: 'claude' }, { key: 'minimax', name: 'MiniMax M3', id: 'm3', effort: 'n/a', runner: 'together' }];
const script = (over = {}) => ({
  format: 'painting-script 2', subject: 'dune', author: 'test', sheet: { widthMm: 280, heightMm: 186.7 }, palette: ['ochre', 'ultramarine'],
  brushes: { r12: { shape: 'round', widthMm: 7 } },
  passages: [{ id: 'p01', what: 'first wash', stage: 1, kind: 'wash', brush: 'r12', paper: 'dry', region: [[10, 10], [100, 10], [100, 60], [10, 60]], paint: { pigments: { ochre: 1 }, dilution: 'pale' } }],
  ...over,
});
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paint-author-test-'));

test('an author is auto, a kept script, or a model of authors.json or the benchmark list', () => {
  assert.equal(authorOf('auto', AUTHORS).key, 'auto'); assert.equal(authorLabel(authorOf('auto', AUTHORS)), 'Code planner alone');
  const opus = authorOf('opus', AUTHORS, BENCH); assert.equal(opus.cli, 'claude'); assert.equal(authorLabel({ ...opus, work: 'reply', brief: briefName('x/AUTHOR-BRIEF.md') }), 'Opus 5.5, its own script, brief v2');
  assert.equal(authorLabel({ ...opus, work: 'session' }), 'Opus 5.5, tuning the code planner'); assert.equal(authorLabel({ ...opus, work: 'session', session: { submitted: { kind: 'settings' } } }), 'Opus 5.5, tuning the code planner');
  assert.equal(authorLabel({ ...opus, work: 'session', session: { submitted: { kind: 'script' } } }), 'Opus 5.5, its own script');
  assert.equal(authorLabel({ ...opus, work: 'session', session: { submitted: { kind: 'plan' } } }), 'Opus 5.5, editing the code planner\'s plan');
  const kept = authorOf('edit:some/plan-to-edit.json', AUTHORS); assert.equal(kept.cli, 'edit'); assert.doesNotMatch(authorLabel(kept), /\.json/);
  assert.equal(authorLabel({ ...kept, planEdit: { unchanged: true } }), 'The code planner\'s plan, written out and read back unchanged');
  assert.equal(authorOf('neon', AUTHORS).cli, 'agy'); assert.equal(authorOf('astra', AUTHORS).cli, 'codex');
  assert.equal(authorOf('sonnet', AUTHORS, BENCH).effort, 'xhigh');
  const s = authorOf('script:some/kept-plan.json', AUTHORS); assert.equal(s.cli, 'script'); assert.doesNotMatch(authorLabel(s), /kept-plan|\.json/, 'a column is never named for a file');
  // a kept script is named for the model of the run it lies in, and for the brief and the step back
  const runOf = f => (/run\.json$/.test(f) ? { author: { key: 'astra', name: 'Codex Astra', brief: 'brief v2' } } : {});
  assert.equal(authorLabel({ cli: 'script', ...keptScriptAuthor('/r/cat--astra/step-back/script-revised.json', runOf) }), 'Codex Astra, its own script, revised after one step back, brief v2, written earlier');
  assert.equal(authorLabel({ cli: 'script', ...keptScriptAuthor('/r/x/author/script.json', f => { if (/run\.json$/.test(f)) throw new Error('none'); return { author: 'Opus' }; }) }), 'Opus, its own script, written earlier');
  assert.throws(() => authorOf('minimax', AUTHORS, BENCH), /cannot be called as an author/);
  assert.throws(() => authorOf('gpt9', AUTHORS, BENCH), /auto, script:FILE.json, edit:FILE.json, or one of opus.*sonnet/);
});

test('the committed brief is filled: sheet, pictures, drawing medium, wash brushes, paints, named forms; nothing left blank', () => {
  const fill = medium => fillBrief(fs.readFileSync(path.join(HERE, 'AUTHOR-BRIEF.md'), 'utf8'), { sheet: { widthMm: 280, heightMm: 186.7 }, medium,
    inputs: [{ file: 'inputs/source.png', what: 'the SUBJECT' }], brushes: { mop: { width_mm: 38 }, round12: { width_mm: 7 }, pen: { width_mm: 0.5 }, dry: { width_mm: 4 } },
    paints: [{ key: 'ochre', name: 'yellow ochre' }, { key: 'lampblack', name: 'lamp black' }], forms: [{ id: 2, name: 'cat face', kind: 'face', boxMm: [40, 30, 120, 110] }] });
  const b = fill('pencil (graphite)');
  assert.match(b, /The sheet is `280` by `186.7` mm/); assert.match(b, /- `inputs\/source.png`: the SUBJECT/); assert.match(b, /light pencil lay-in/);
  assert.match(b, /\(name: width in mm\) is: mop: 38, round12: 7\./); assert.match(b, /keys only: `ochre` \(yellow ochre\)\./);
  assert.match(b, /- 2\. cat face \(face\): box x 40 to 120, y 30 to 110 mm/);
  assert.doesNotMatch(b, /SHEET_W|SHEET_H|INPUT_LIST|KIT_LIST|PAINT_LIST|PAINTS_MOST|FORMS_LIST|DRAWING_NOTE|SKILLS_TEXT|lampblack|pen: 0.5/);
  assert.match(b, /so a script may name 14 paints at most/); assert.doesNotMatch(b, /seven paints/);
  assert.match(fill('ink, ink recipe wash'), /waterproof ink/);
  assert.match(b, /"format": "painting-script 2"/); assert.match(b, /One connected base wash over the whole form/); assert.match(b, /"plan": \{/);
});

test('the script is found in a reply with words or a fence round it', () => {
  assert.deepEqual(jsonWith('Here it is:\n```json\n{"format":"x","passages":[{"id":"p1"}]}\n```', 'passages'), { format: 'x', passages: [{ id: 'p1' }] });
  assert.equal(jsonWith('{"seen": "a"}', 'passages'), null); assert.equal(jsonWith('no json', 'passages'), null);
});

test('a script is checked against this run, and the reason is said for its author', () => {
  const ok = checkAuthored(script(), { sheetWidthMm: 280 });
  assert.deepEqual(ok.paints, ['ochre', 'ultramarine']); assert.equal(ok.script.passages.length, 1);
  assert.throws(() => checkAuthored(script(), { sheetWidthMm: 380 }), /written for a sheet 280 mm wide, painted on 380 mm/);
  assert.throws(() => checkAuthored(script({ palette: ['ochre', 'mauve'] }), { sheetWidthMm: 280 }), /palette names mauve, not in the box/);
  assert.throws(() => checkAuthored(script({ palette: [] }), { sheetWidthMm: 280 }), /no palette/);
  // the sheet's 16 pigments less the drawing's ink and graphite: 14 paints pass the palette check, 15 are refused in plain words
  const box = n => ['ochre', 'ultramarine', 'sienna', 'umber', 'rawsienna', 'rose', 'cadred', 'hansa', 'cadyellow', 'cerulean', 'phthaloblue', 'phthalogreen', 'sapgreen', 'paynes', 'sepia'].slice(0, n);
  assert.deepEqual(checkAuthored(script({ palette: box(14) }), { sheetWidthMm: 280 }).paints.length, 14);
  assert.throws(() => checkAuthored(script({ palette: box(15) }), { sheetWidthMm: 280 }), /palette names 15 paints; the painter's sheet holds 16 pigments and the drawing's ink and graphite take two, so a script may name 14 at most/);
  assert.throws(() => checkAuthored(script({ passages: [{ ...script().passages[0], shapes: [3, 4] }] }), { sheetWidthMm: 280 }), /name study shapes by number/);
  assert.throws(() => checkAuthored(script({ passages: [{ ...script().passages[0], brush: 'mop' }] }), { sheetWidthMm: 280 }), /brush mop is not in the kit/);
  const d = tmp();
  try {
    fs.writeFileSync(path.join(d, 's.json'), '{ not json'); assert.throws(() => readScript(path.join(d, 's.json'), { sheetWidthMm: 280 }), /is not JSON/);
    assert.throws(() => readScript(path.join(d, 'none.json'), { sheetWidthMm: 280 }), /no script at/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('pictures carry the sheet grid, and each named form gets its box in millimetres', async () => {
  const d = tmp();
  try {
    const img = path.join(d, 'a.png'); await sharp({ create: { width: 300, height: 200, channels: 3, background: '#c8d8e8' } }).png().toFile(img);
    const m = await sharp(await gridImage(img, 150, { width: 600, pad: 40 })).metadata();
    assert.deepEqual([m.width, m.height], [680, 480]);
    const map = Buffer.alloc(100 * 50); for (let y = 10; y < 20; y++) for (let x = 40; x < 60; x++) map[y * 100 + x] = 2;
    const mask = path.join(d, 'm.png'); await sharp(map, { raw: { width: 100, height: 50, channels: 1 } }).png().toFile(mask);
    const boxes = await formBoxes(mask, [{ id: 1, name: 'sky', kind: 'sky' }, { id: 2, name: 'face', kind: 'face' }], 200);
    assert.equal(boxes[0].boxMm, null); assert.deepEqual(boxes[1].boxMm, [80, 20, 120, 40]);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('each model is called read-only for one reply, and its answer and usage are read back', () => {
  const o = { prompt: 'P', images: ['/w/inputs/a.png'], cwd: '/w' }, by = k => authorCall(authorOf(k, AUTHORS), o);
  const c = by('opus'); assert.equal(c.cmd, 'claude'); assert.deepEqual(c.args.slice(c.args.indexOf('--allowedTools'), c.args.indexOf('--allowedTools') + 2), ['--allowedTools', 'Read']);
  assert.ok(c.args.includes('claude-opus-5-5')); assert.ok(!c.args.some(a => /skip-permissions/.test(a)));
  assert.deepEqual(c.parse(JSON.stringify({ result: '{"passages":[]}', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 }, total_cost_usd: 0.5 })), { text: '{"passages":[]}', tokens: 115, costUSD: 0.5 });
  const x = by('astra'); assert.equal(x.cmd, 'codex'); assert.deepEqual(x.args.slice(x.args.indexOf('-s'), x.args.indexOf('-s') + 2), ['-s', 'read-only']);
  assert.ok(x.args.includes('model_reasoning_effort="high"')); assert.deepEqual(x.args.slice(x.args.indexOf('-i'), x.args.indexOf('-i') + 2), ['-i', '/w/inputs/a.png']);
  assert.deepEqual(x.parse('{"type":"item.completed","item":{"type":"agent_message","text":"ANSWER"}}\n{"type":"turn.completed","usage":{"input_tokens":7,"output_tokens":3}}\n'), { text: 'ANSWER', tokens: 10, costUSD: null });
  const g = by('neon'); assert.equal(g.cmd, 'agy'); assert.ok(g.args.includes('--sandbox')); assert.equal(g.serial, true); assert.equal(g.env.DO_NOT_TRACK, '1');
  assert.deepEqual(g.args.slice(g.args.indexOf('--mode'), g.args.indexOf('--mode') + 2), ['--mode', 'plan']);
});

test('a refused answer, a missing command and a good script are all results; the retry carries the reason', async () => {
  const d = tmp(); fs.mkdirSync(path.join(d, 'inputs')); fs.writeFileSync(path.join(d, 'inputs/a.png'), 'x');
  const packet = { dir: d, prompt: 'the brief', files: ['inputs/a.png'] }, opus = authorOf('opus', AUTHORS);
  const reply = (text, exit = 0, error = null) => async (call, o) => { assert.ok(fs.existsSync(path.join(o.cwd, 'inputs/a.png')), 'the pictures are copied to its folder'); assert.ok(!o.cwd.startsWith(ROOT), 'outside the repository'); fs.writeFileSync(o.outFile, text); fs.writeFileSync(o.errFile, 'not logged in'); return { exit, error }; };
  try {
    const good = await askAuthor(opus, packet, { sheetWidthMm: 280, run: reply(JSON.stringify({ result: 'Here:\n' + JSON.stringify(script()), usage: { output_tokens: 9 }, total_cost_usd: 0.2 })) });
    assert.equal(good.ok, true); assert.equal(good.script.passages.length, 1); assert.equal(good.tokens, 9); assert.equal(good.costUSD, 0.2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'A.call.json'), 'utf8')).ok, true);
    const bad = await askAuthor(opus, packet, { stem: 'A-retry', sheetWidthMm: 380, run: reply(JSON.stringify({ result: JSON.stringify(script()) })) });
    assert.equal(bad.ok, false); assert.match(bad.error, /written for a sheet 280 mm wide/);
    assert.match((await askAuthor(opus, packet, { sheetWidthMm: 280, run: reply(JSON.stringify({ result: 'I cannot.' })) })).error, /no JSON object with "passages"/);
    const down = await askAuthor(opus, packet, { sheetWidthMm: 280, run: reply('', 1) });
    assert.match(down.error, /exit 1 and no answer: not logged in \(needs the `claude` command, logged in/);
    assert.match((await askAuthor(opus, packet, { sheetWidthMm: 280, run: reply('', null, '`claude` is not installed or not on PATH') })).error, /could not be called: `claude` is not installed/);
    const again = retryPrompt('the brief', '{"passages":1}', 'brush mop is not in the kit');
    assert.match(again, /^the brief/); assert.match(again, /refused[\s\S]*brush mop is not in the kit[\s\S]*\{"passages":1\}/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('the packet names its pictures by their path in the folder and carries no path of this machine', async () => {
  const d = tmp();
  try {
    const img = path.join(d, 'a.png'); await sharp({ create: { width: 150, height: 100, channels: 3, background: '#e8d8c8' } }).png().toFile(img);
    const run = { sheet: { widthMm: 150, heightMm: 100 }, subject: { sourceAbs: img }, drawing: { medium: 'pencil (graphite)' }, studies: [{ abs: img, role: 'block-in (the broad shapes)' }], masks: null };
    const p = await preparePacket({ dir: path.join(d, 'author'), root: ROOT, run, drawingPng: img, briefFile: path.join(HERE, 'AUTHOR-BRIEF.md') });
    assert.deepEqual(p.files, ['inputs/source.png', 'inputs/drawing.png', 'inputs/study-1.png']);
    assert.ok(!p.prompt.includes(os.homedir())); assert.ok(!p.prompt.includes(d)); assert.match(p.prompt, /No named forms were made/);
    assert.match(p.prompt, /`inputs\/study-1.png`: STUDY 1, the block-in/); assert.equal(fs.readFileSync(path.join(p.dir, 'prompt.txt'), 'utf8'), p.prompt);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
