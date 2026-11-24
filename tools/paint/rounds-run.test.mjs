// The whole ladder as fixed rounds with the stand-in model and a stand-in painter: level 2, then level 3 from its
// result, then level 4 from that with the traced shapes, and a level 1 by itself. What is sent, what is kept and what
// the records hold are the real code's (rounds-run.mjs); only the painter and the model are stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { roundsRun } from './rounds-run.mjs';
import { levelOneTemplate, previousHanded, shapesHandedRounds } from './rounds-levels.mjs';
import { LEVELS, levelOf, handedAt } from './levels.mjs';
import { parseArgs } from './args.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..', '..'), BRIEF = path.join(HERE, 'AUTHOR-BRIEF.md');
const png = (w, h, background) => sharp({ create: { width: w, height: h, channels: 3, background } }).png().toBuffer();

/** A subject's files in `dir` and one run of `level` on them, with the stand-in for cli.mjs's side. */
async function world(dir) {
  const f = n => path.join(dir, n);
  fs.writeFileSync(f('source.png'), await png(60, 80, '#a08060')); fs.writeFileSync(f('study.png'), await png(60, 80, '#c0b090'));
  // a form map: grey value 1 in the middle of the sheet
  fs.writeFileSync(f('mask.png'), await sharp({ create: { width: 60, height: 80, channels: 3, background: '#000000' } }).composite([{ input: await png(20, 20, { r: 1, g: 1, b: 1 }), left: 20, top: 30 }]).png().toBuffer());
  fs.writeFileSync(f('shapes.json'), JSON.stringify({ format: 'study-shapes 1', sheet: { widthMm: 120, heightMm: 160 }, shapes: [{ n: 1, colour: [200, 150, 100], areaMm2: 900, paper: false, inside: null, boxMm: [30, 40, 60, 70], forms: [{ name: 'cat face', share: 0.8 }], polygons: [[[30, 40], [60, 40], [60, 70], [30, 70]]] }, { n: 2, colour: [240, 240, 235], areaMm2: 30, paper: true, inside: 1, boxMm: [40, 50, 45, 56], forms: [], polygons: [[[40, 50], [45, 50], [45, 56]]] }] }));
  const run = (level, out) => ({ spec: { id: 'tabby', sheet: { widthMm: 120, heightMm: 160, cells: 400 } }, authorFull: { key: 'dry-rounds', name: 'Scripted stand-in', id: null, cli: 'dry', work: 'rounds' },
    record: { out, plate: path.join(out, 'plate'), sheet: { widthMm: 120, heightMm: 160 }, subject: { id: 'tabby', sourceAbs: f('source.png') }, drawing: { medium: 'pencil (graphite)', files: [] }, studies: [{ role: 'block-in', abs: f('study.png') }, { role: 'middle study', abs: f('study.png') }],
      masks: { receipt: 'r', mask: f('mask.png'), forms: [{ id: 1, name: 'cat face', kind: 'face' }] }, author: { key: 'dry-rounds', name: 'Scripted stand-in', level, tryNumber: 1, budget: { looks: 3 } } } });
  const lent = (level, previous = null) => {
    const seen = { looks: [], compiled: [], final: null, toolsChecked: 0 };
    return { seen, root: ROOT, briefFile: BRIEF, looksMost: 3, level, terms: handedAt(levelOf(level), { previous }), previous, say: () => {}, guard: () => {}, slot: () => fn => fn(),
      shapesFile: () => f('shapes.json'), toolsCheck: async () => { seen.toolsChecked++; },
      compile: async (r, choice, script, plate) => { seen.compiled.push({ choice, script }); return { ok: true, rows: script.passages.map(p => ({ stage: p.stage })), table: script.passages.map(p => `${p.id} | stage ${p.stage}`), summary: { passages: script.passages.length, washes: script.passages.length, strokes: 10, widestBrushMm: 17 }, plate }; },
      look: async (r, choice, script, plate, at, compiled, ask) => { seen.looks.push({ ask, choice }); fs.mkdirSync(plate, { recursive: true }); const painting = path.join(plate, 'painting.png'); fs.writeFileSync(painting, await png(30, 40, '#e8d8c8')); return { ok: true, painted: { painting, seconds: 60, cells: 200, fullCells: 400 } }; },
      paintChoice: async (r, fin) => { seen.final = fin; fs.mkdirSync(r.record.plate, { recursive: true }); fs.writeFileSync(path.join(r.record.plate, 'painting.png'), await png(60, 80, '#d8c8b8')); fs.writeFileSync(path.join(r.record.out, 'run.json'), JSON.stringify(r.record)); } };
  };
  return { run, lent };
}
const read = (out, f) => fs.readFileSync(path.join(out, 'author', f), 'utf8');

test('the ladder in fixed rounds with the stand-in: L2, L3 from it, L4 from that with the shapes, and L1 by itself', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rounds-ladder-'));
  try {
    const w = await world(dir), out = l => path.join(dir, l);
    // level 2: the subject, the drawing and the studies go out once; the forms as names and boxes, never their picture
    const r2 = w.run('L2', out('L2')), x2 = w.lent('L2'); await roundsRun(r2, x2);
    const k2 = JSON.parse(read(out('L2'), 'rounds.json')), p2 = read(out('L2'), 'rounds-prompt.txt');
    assert.deepEqual(k2.picturesGiven, ['source.jpg', 'drawing.jpg', 'study-1.jpg', 'study-2.jpg']); assert.doesNotMatch(p2, /forms\.png|forms picture/); assert.match(p2, /1\. cat face \(face\): box x 40 to 80, y 60 to 100 mm/);
    assert.match(p2, /fixed rounds/); assert.doesNotMatch(p2, /LOOKS_MOST|LOOKS_WHOLE|your-previous-painting|traced-shapes/); assert.match(p2, /3 look units for this try: enough for 10 looks of the whole script/); assert.match(p2, /say `"done": true` in that\s+same answer/);
    assert.equal(k2.ended, 'done'); assert.equal(k2.lookUnits.spent, 0.8); assert.deepEqual(k2.rounds.map(q => q.kind), ['script', 'edits', 'edits', 'done']);
    // a look sends back the sheet only, with the sheet's own numbers
    assert.deepEqual(k2.rounds[1].sent.images, ['looks/1/sheet.jpg']); assert.match(k2.rounds[1].sent.text, /THE SHEET AS IT DRIED/); assert.doesNotMatch(k2.rounds[1].sent.text, /TOO DARK|TOO PALE|study/i);
    assert.ok(x2.seen.looks.every(l => l.ask.until === 1 || l.ask.until == null)); assert.equal(x2.seen.looks.length, 3);
    // the record: a session-shaped record cli.mjs writes usage.json from, the transcript, and the folder a later level reads
    const s2 = r2.record.author.session;
    assert.deepEqual([s2.work, s2.level, s2.lookUnits.spent, s2.looks.length, s2.editRounds, s2.rewrites, s2.submitted.kind], ['rounds', 'L2', 0.8, 3, 2, 0, 'script']);
    assert.ok(r2.record.author.tokenSplit.reported && r2.record.author.tokensOut > 0); assert.ok(s2.rounds.every(q => q.tokens && q.seconds != null));
    for (const f of ['rounds.md', 'folder/script.json', 'folder/choice.json', 'looks/2/numbers.txt', 'sent/source.jpg']) assert.ok(fs.existsSync(path.join(out('L2'), 'author', f)), f);
    assert.equal(x2.seen.final.script.passages.length, 4); assert.equal(x2.seen.final.choice.tools, undefined);
    // level 3: a fresh conversation, handed its own level 2 painting to look at and its script as text; a full budget again
    const r3 = w.run('L3', out('L3')), x3 = w.lent('L3', out('L2')); await roundsRun(r3, x3);
    const k3 = JSON.parse(read(out('L3'), 'rounds.json')), p3 = read(out('L3'), 'rounds-prompt.txt');
    assert.equal(k3.picturesGiven.at(-1), 'your-previous-painting.jpg'); assert.match(p3, /Your own previous painting of this subject \(level L2\)/); assert.match(p3, /YOUR PREVIOUS SCRIPT:\n\{"format":"painting-script 2"/); assert.match(p3, /"id":"p4"/);
    assert.doesNotMatch(p3, /LOOK 1 of your script|traced-shapes/); assert.equal(k3.lookUnits.budget, 3); assert.equal(k3.rounds.length, 4);
    assert.equal(r3.record.author.previousTry.from, out('L2')); assert.deepEqual([r3.record.author.ladder, r3.record.author.session.ladder, r3.record.author.previousTry.level], ['L3 after L2', 'L3 after L2', 'L2']); assert.equal(r3.record.author.session.shapeReuse.reuse, 0);
    // level 4: the same from level 3, and the traced shapes as a picture and a list; a passage names one by number
    const r4 = w.run('L4', out('L4')), x4 = w.lent('L4', out('L3')); await roundsRun(r4, x4);
    const k4 = JSON.parse(read(out('L4'), 'rounds.json')), p4 = read(out('L4'), 'rounds-prompt.txt');
    assert.deepEqual(k4.picturesGiven.slice(-2), ['your-previous-painting.jpg', 'traced-shapes.jpg']); assert.match(p4, /1 \| rgb 200\/150\/100 \| 900 mm2 \| box x 30-60, y 40-70 \| in cat face/); assert.match(p4, /level L3/); assert.match(p4, /they may be wrong/);
    assert.doesNotMatch(p4, /this\s+run has no numbered shape list/);
    // the shape named by number reaches the painter as its outline, and the share of washes that reuse a shape is recorded
    assert.deepEqual(x4.seen.final.script.passages.find(p => p.id === 's1').regions, [[[30, 40], [60, 40], [60, 70], [30, 70]]]);
    assert.deepEqual(r4.record.author.session.shapeReuse, { passages: 5, reuse: 1, share: 0.2 }); assert.deepEqual(JSON.parse(read(out('L4'), 'folder/script.json')).passages.find(p => p.id === 's1').shapes, [1]);
    // level 4 straight from a level 2 result (no level 3 between) is allowed, and the record names it
    const r42 = w.run('L4', out('L4-after-L2')), x42 = w.lent('L4', out('L2')); await roundsRun(r42, x42);
    assert.deepEqual([r42.record.author.ladder, r42.record.author.session.previousLevel], ['L4 after L2', 'L2']); assert.match(read(out('L4-after-L2'), 'rounds-prompt.txt'), /Your own previous painting of this subject \(level L2\)/);
    // level 1: the subject alone; no drawing, study or form is sent or named, and the prepared drawing is never laid
    const r1 = w.run('L1', out('L1')), x1 = w.lent('L1'); await roundsRun(r1, x1);
    const k1 = JSON.parse(read(out('L1'), 'rounds.json')), p1 = read(out('L1'), 'rounds-prompt.txt');
    assert.deepEqual(k1.picturesGiven, ['source.jpg']); assert.doesNotMatch(p1, /study-1|drawing\.jpg|cat face|## FORMS|DRAWING_NOTE|INPUT_LIST|SHEET_W/); assert.match(p1, /nothing is on the sheet before you\s+start/);
    assert.ok(x1.seen.compiled.every(c => c.choice.tools.medium === 'none')); assert.equal(x1.seen.final.choice.tools.medium, 'none'); assert.equal(r1.record.author.session.level, 'L1');
    // a region look by a form's name has no forms to go by at level 1
    assert.equal(k1.ended, 'done');
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

test('the level 1 brief is the toolkit and the tips: nothing of the prepared inputs; level 1 is rounds only', async () => {
  const t = levelOneTemplate(fs.readFileSync(BRIEF, 'utf8'));
  assert.doesNotMatch(t, /## FORMS|FORMS_LIST|DRAWING_NOTE|One way to paint a named form|in the studies|Read the studies/); assert.match(t, /## The brushes/); assert.match(t, /SKILLS_TEXT/); assert.match(t, /INPUT_LIST/);
  assert.throws(() => levelOneTemplate('# a brief without its sections'), /no longer has its section/);
  assert.equal(LEVELS.L1.noInputs, true); assert.equal(handedAt(levelOf('L1'), {}).noInputs, true); assert.equal(handedAt(levelOf('L2'), {}).noInputs, undefined);
  assert.throws(() => parseArgs(['s', 'paint', '--author', 'neon-m', '--level', 'L1']), /fixed rounds/); assert.equal(parseArgs(['s', 'paint', '--author', 'neon-m', '--level', 'L1', '--work', 'rounds']).level, 'L1');
  const h = await shapesHandedRounds({ shapes: [{ n: 7, colour: [1, 2, 3], areaMm2: 500, boxMm: [0, 0, 10, 10], polygons: [[[0, 0], [10, 0], [10, 10]]] }] }, { widthMm: 100, heightMm: 50 });
  assert.match(h.text, /7 \| rgb 1\/2\/3 \| 500 mm2/); assert.equal((await sharp(h.picture).metadata()).width, 1400);
});
