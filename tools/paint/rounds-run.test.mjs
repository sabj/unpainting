// The levels of fixed rounds with the stand-in model and a stand-in painter: L1, L2 and L3, each a fresh session
// handed no other level's result, and the replay-only L4-retry from an earlier result. What is sent, what is kept and what
// the records hold are the real code's (rounds-run.mjs); only the painter and the model are stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { roundsRun } from './rounds-run.mjs';
import { previousHanded, shapesHandedRounds, shapesCsv } from './rounds-levels.mjs';
import { withoutLevel, BRIEF_VERSION } from './brief.mjs';
import { LEVELS, levelOf, handedAt } from './levels.mjs';
import { parseArgs } from './args.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..');
const png = (w, h, background) => sharp({ create: { width: w, height: h, channels: 3, background } }).png().toBuffer();

/** A subject's files in `dir` and one run of `level` on them, with the stand-in for cli.mjs's side. */
async function world(dir) {
  const f = n => path.join(dir, n);
  fs.writeFileSync(f('source.png'), await png(60, 80, '#a08060')); fs.writeFileSync(f('auto.png'), await png(60, 80, '#9080a0')); fs.writeFileSync(f('study.png'), await png(60, 80, '#c0b090'));
  // a form map: grey value 1 in the middle of the sheet
  fs.writeFileSync(f('mask.png'), await sharp({ create: { width: 60, height: 80, channels: 3, background: '#000000' } }).composite([{ input: await png(20, 20, { r: 1, g: 1, b: 1 }), left: 20, top: 30 }]).png().toBuffer());
  fs.writeFileSync(f('shapes.json'), JSON.stringify({ format: 'study-shapes 1', sheet: { widthMm: 120, heightMm: 160 }, shapes: [{ n: 1, colour: [200, 150, 100], areaMm2: 900, paper: false, inside: null, boxMm: [30, 40, 60, 70], forms: [{ name: 'cat face', share: 0.8 }], polygons: [[[30, 40], [60, 40], [60, 70], [30, 70]]] }, { n: 2, colour: [240, 240, 235], areaMm2: 30, paper: true, inside: 1, boxMm: [40, 50, 45, 56], forms: [], polygons: [[[40, 50], [45, 50], [45, 56]]] }] }));
  const run = (level, out) => ({ spec: { id: 'tabby', sheet: { widthMm: 120, heightMm: 160, cells: 400 } }, authorFull: { key: 'dry-rounds', name: 'Scripted stand-in', id: null, cli: 'dry', work: 'rounds' },
    record: { out, plate: path.join(out, 'plate'), sheet: { widthMm: 120, heightMm: 160 }, subject: { id: 'tabby', sourceAbs: f('source.png') }, drawing: { medium: 'pencil (graphite)', files: [] }, studies: [{ role: 'block-in', abs: f('study.png') }, { role: 'middle study', abs: f('study.png') }],
      masks: { receipt: 'r', mask: f('mask.png'), forms: [{ id: 1, name: 'cat face', kind: 'face' }] }, author: { key: 'dry-rounds', name: 'Scripted stand-in', level, tryNumber: 1, budget: { looks: 3 } } } });
  const lent = (level, previous = null) => {
    const seen = { looks: [], compiled: [], final: null, toolsChecked: 0 };
    return { seen, root: ROOT, looksMost: 3, wallMinutes: 60, level, terms: handedAt(levelOf(level), { previous }), previous, say: () => {}, guard: () => {}, slot: () => fn => fn(),
      shapesFile: () => f('shapes.json'), autoOf: async () => { seen.autoAsked = (seen.autoAsked ?? 0) + 1; return { painting: f('auto.png'), washes: 'THE CODE PLANNER\'S PLAN IN NUMBERS\n121 washes\n\nEACH WASH:\n1 | stage 1 | a big wash', from: 'prepared/x', paintingSha256: 'a1', planSha256: 'b2' }; }, toolsCheck: async () => { seen.toolsChecked++; },
      compile: async (r, choice, script, plate) => { seen.compiled.push({ choice, script }); return { ok: true, rows: script.passages.map(p => ({ stage: p.stage })), table: script.passages.map(p => `${p.id} | stage ${p.stage}`), summary: { passages: script.passages.length, washes: script.passages.length, strokes: 10, widestBrushMm: 17 }, plate }; },
      look: async (r, choice, script, plate, at, compiled, ask) => { seen.looks.push({ ask, choice }); fs.mkdirSync(plate, { recursive: true }); const painting = path.join(plate, 'painting.png'); fs.writeFileSync(painting, await png(30, 40, '#e8d8c8')); return { ok: true, painted: { painting, seconds: 60, cells: 200, fullCells: 400 } }; },
      paintChoice: async (r, fin) => { seen.final = fin; fs.mkdirSync(r.record.plate, { recursive: true }); fs.writeFileSync(path.join(r.record.plate, 'painting.png'), await png(60, 80, '#d8c8b8')); fs.writeFileSync(path.join(r.record.out, 'run.json'), JSON.stringify(r.record)); } };
  };
  return { run, lent };
}
const read = (out, f) => fs.readFileSync(path.join(out, 'author', f), 'utf8');

test('the levels in fixed rounds with the stand-in (Option A): L2 visual studies only (no drawing/forms/shapes); L3 opt-in drawing + forms + shapes + Auto; L1 bare', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rounds-ladder-'));
  try {
    const w = await world(dir), out = l => path.join(dir, l);
    // level 2 (Option A): the subject and colour studies ONLY; no prepared drawing, no named forms, no traced shapes, nothing of Auto; prepared drawing forced off
    const r2 = w.run('L2', out('L2')), x2 = w.lent('L2'); await roundsRun(r2, x2);
    const k2 = JSON.parse(read(out('L2'), 'rounds.json')), p2 = read(out('L2'), 'rounds-prompt.txt');
    assert.deepEqual(k2.picturesGiven, ['source.jpg', 'study-1.jpg', 'study-2.jpg']);
    assert.doesNotMatch(p2, /drawing\.jpg|forms\.png|forms picture|cat face|traced-shapes|auto-painting|Auto's plan|CODE PLANNER'S PLAN|your-previous-painting|YOUR PREVIOUS SCRIPT/);
    assert.match(p2, /Three colour studies are given for visual value and colour reference/);
    assert.ok(x2.seen.compiled.every(c => c.choice.tools.medium === 'none'), 'L2 never lays the prepared drawing');
    assert.equal(x2.seen.final.choice.tools.medium, 'none');
    assert.equal(x2.seen.autoAsked, undefined, 'L2 asks for nothing of Auto'); assert.equal(r2.record.author.autoHanded, undefined);
    assert.match(p2, /fixed rounds/); assert.doesNotMatch(p2, /LOOKS_MOST|LOOKS_WHOLE/); assert.match(p2, /3 look units for this try, enough for 10 looks of the whole script/);
    assert.deepEqual([r2.record.author.brief.version, r2.record.author.brief.sha256.length], [BRIEF_VERSION, 64]);
    assert.equal(k2.ended, 'done'); assert.deepEqual(k2.rounds.map(q => q.kind), ['script', 'edits', 'edits', 'done']);
    // a look sends back the sheet only, with the sheet's own numbers and no named-form leak
    assert.deepEqual(k2.rounds[1].sent.images, ['looks/1/sheet.jpg']); assert.match(k2.rounds[1].sent.text, /THE SHEET AS IT DRIED/); assert.doesNotMatch(k2.rounds[1].sent.text, /TOO DARK|TOO PALE|study|named forms/i);
    assert.ok(x2.seen.looks.every(l => l.ask.until === 1 || l.ask.until == null)); assert.equal(x2.seen.looks.length, 3);
    // the record: a session-shaped record cli.mjs writes usage.json from, and the transcript; no previous level, no ladder
    const s2 = r2.record.author.session;
    assert.deepEqual([s2.work, s2.level, s2.looks.length, s2.editRounds, s2.rewrites, s2.submitted.kind, s2.ladder, s2.previousLevel], ['rounds', 'L2', 3, 2, 0, 'script', null, null]);
    assert.ok(r2.record.author.tokenSplit.reported && r2.record.author.tokensOut > 0); assert.ok(s2.rounds.every(q => q.tokens && q.seconds != null));
    for (const f of ['rounds.md', 'folder/script.json', 'folder/choice.json', 'looks/2/numbers.txt', 'sent/source.jpg', 'sent/study-1.jpg']) assert.ok(fs.existsSync(path.join(out('L2'), 'author', f)), f);
    // level 3 (Option A): full packet (opt-in prepared drawing, named forms, traced shapes, Auto plan & painting); blank paper unless script opts in
    const r3 = w.run('L3', out('L3')), x3 = w.lent('L3'); await roundsRun(r3, x3);
    const k3 = JSON.parse(read(out('L3'), 'rounds.json')), p3 = read(out('L3'), 'rounds-prompt.txt');
    assert.deepEqual(k3.picturesGiven, ['source.jpg', 'drawing.jpg', 'study-1.jpg', 'study-2.jpg', 'traced-shapes.jpg', 'auto-painting.jpg']); assert.equal(x3.seen.autoAsked, 1);
    assert.match(p3, /1\. cat face \(face\): box x 40 to 80, y 60 to 100 mm/);
    assert.match(p3, /## Data: traced shapes[\s\S]*\n1, #c89664, 900 mm², box 30-60,40-70\n/); assert.doesNotMatch(p3, /\n2, #/, 'a shape too small to be numbered is not listed'); assert.ok(p3.indexOf('## Data: traced shapes') > p3.indexOf('## Appendix C')); assert.match(p3, /may cut across a form/); assert.match(p3, /`traced-shapes\.jpg`, TRACED SHAPES: .* px per mm\./);
    assert.match(p3, /### Auto's plan/); assert.match(p3, /`auto-painting\.jpg`, AUTO'S PAINTING: the finished painting of this subject by Auto/); assert.match(p3, /THE CODE PLANNER'S PLAN IN NUMBERS\n121 washes/); assert.match(p3, /cannot be handed in/);
    assert.match(p3, /prepared drawing is optional and OFF by default/);
    assert.equal(x3.seen.final.choice.tools.medium, 'none', 'L3 defaults to blank paper unless script explicitly opts into prepared drawing');
    assert.deepEqual(x3.seen.final.script.passages.find(p => p.id === 's1').regions, [[[30, 40], [60, 40], [60, 70], [30, 70]]]);
    assert.deepEqual(r3.record.author.session.shapeReuse, { passages: 5, reuse: 1, share: 0.2 });
    assert.deepEqual(JSON.parse(read(out('L3'), 'folder/script.json')).passages.find(p => p.id === 's1').regions, [[[30, 40], [60, 40], [60, 70], [30, 70]]], 'effective hand-in stores resolved script for exact replay');
    assert.deepEqual(JSON.parse(read(out('L3'), 'folder/raw-script.json')).passages.find(p => p.id === 's1').shapes, [1], 'raw authored script with numbered shapes preserved beside resolved script');
    assert.equal(JSON.parse(read(out('L3'), 'folder/choice.json')).medium, 'none', 'effective choice.json records medium: none when L3 opt-in drawing was not selected');
    assert.doesNotMatch(p3, /"medium": "pencil \(graphite\)"|"medium": "ink"/, 'brief never tells models to send refused display medium strings');
    assert.doesNotMatch(p3, /your-previous-painting|YOUR PREVIOUS SCRIPT|level L2\)/); assert.equal(k3.lookUnits.budget, 3); assert.equal(r3.record.author.previousTry, undefined); assert.equal(r3.record.author.session.ladder, null);
    assert.deepEqual(r3.record.author.autoHanded, { plan: true, painting: true, from: 'prepared/x', paintingSha256: 'a1', planSha256: 'b2' });
    // the brief is the same text at every level outside its marked level block (no added coaching)
    assert.equal(withoutLevel(p3), withoutLevel(p2));
    // level 1: the subject alone; no drawing, study, form, shape or anything of Auto is sent or named, and the prepared drawing is never laid
    const r1 = w.run('L1', out('L1')), x1 = w.lent('L1'); await roundsRun(r1, x1);
    const k1 = JSON.parse(read(out('L1'), 'rounds.json')), p1 = read(out('L1'), 'rounds-prompt.txt');
    assert.deepEqual(k1.picturesGiven, ['source.jpg']); assert.doesNotMatch(p1, /study-1|drawing\.jpg|cat face|## FORMS|DRAWING_NOTE|INPUT_LIST|SHEET_W|traced-shapes|auto-painting|Auto's plan/); assert.match(p1, /nothing is on the sheet before you start/); assert.equal(withoutLevel(p1), withoutLevel(p2)); for (const p of [p1, p2, p3]) assert.match(p, /- Time: 60 minutes on the clock for the whole try/);
    assert.ok(x1.seen.compiled.every(c => c.choice.tools.medium === 'none')); assert.equal(x1.seen.final.choice.tools.medium, 'none'); assert.equal(r1.record.author.session.level, 'L1'); assert.equal(x1.seen.autoAsked, undefined);
    assert.equal(k1.ended, 'done');
    // no benchmark level takes an earlier result: the old "L4 after L2" is the replay level L4-retry only, and it names its ladder
    for (const l of ['L1', 'L2', 'L3']) assert.throws(() => w.lent(l, out('L2')), /one fresh session, handed no other level's result/);
    const rr = w.run('L4-retry', out('L4-retry')), xr = w.lent('L4-retry', out('L2')); await roundsRun(rr, xr);
    assert.deepEqual([rr.record.author.ladder, rr.record.author.session.previousLevel], ['L4-retry after L2', 'L2']); assert.match(read(out('L4-retry'), 'rounds-prompt.txt'), /Your own previous painting of this subject \(level L2\)/);
    assert.deepEqual(JSON.parse(read(out('L4-retry'), 'rounds.json')).picturesGiven.slice(-2), ['your-previous-painting.jpg', 'traced-shapes.jpg']); assert.equal(xr.seen.autoAsked, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a retry is refused without a previous run that handed in its own script and was painted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rounds-prev-'));
  try {
    assert.throws(() => previousHanded(dir, { subject: 's', author: 'a' }), /no finished run/);
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ subject: { id: 's' }, author: { key: 'b' } }));
    assert.throws(() => previousHanded(dir, { subject: 's', author: 'a' }), /not a run of a on s/);
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ subject: { id: 's' }, author: { key: 'a', level: 'L2' } }));
    assert.throws(() => previousHanded(dir, { subject: 's', author: 'a' }), /kept no script of its own/);
    fs.mkdirSync(path.join(dir, 'author', 'folder'), { recursive: true }); fs.writeFileSync(path.join(dir, 'author', 'folder', 'script.json'), '{"passages": []}');
    assert.throws(() => previousHanded(dir, { subject: 's', author: 'a' }), /full-size painting is not there/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('level 1 is rounds only; the traced shapes are a picture and a list', async () => {
  assert.equal(LEVELS.L1.noInputs, true); assert.equal(handedAt(levelOf('L1'), {}).noInputs, true); assert.equal(handedAt(levelOf('L2'), {}).noInputs, undefined);
  assert.throws(() => parseArgs(['s', 'paint', '--author', 'neon-m', '--level', 'L1']), /fixed rounds/); assert.equal(parseArgs(['s', 'paint', '--author', 'neon-m', '--level', 'L1', '--work', 'rounds']).level, 'L1');
  const h = await shapesHandedRounds({ shapes: [{ n: 7, colour: [1, 2, 3], areaMm2: 500, boxMm: [0, 0, 10, 10], polygons: [[[0, 0], [10, 0], [10, 10]]] }] }, { widthMm: 100, heightMm: 50 });
  assert.equal(h.list[0], '7, #010203, 500 mm², box 0-10,0-10'); assert.equal(shapesCsv({ shapes: [{ n: 7, colour: [1, 2, 3], areaMm2: 500.4, boxMm: [0, 0, 10.4, 9.6], paper: true, inside: 3 }] }), 'n,hex,area_mm2,x0,x1,y0,y1,paper,inside\n7,#010203,500,0,10,0,10,1,3\n'); assert.equal((await sharp(h.picture).metadata()).width, 1400);
});
