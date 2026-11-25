import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { authorOf } from './author.mjs';
import { passageNumbers, formsCovered, formValues, formsTable, numbersTable, stepBackPrompt, scriptDiff, stepBack } from './step-back.mjs';

const AUTHORS = [{ key: 'opus', name: 'Opus 5.5', id: 'claude-opus-5-5', effort: 'high', cli: 'claude' }];
const passage = (id, over = {}) => ({ id, what: `the ${id}`, stage: 1, kind: 'wash', brush: 'mop', paper: 'wet', region: [[10, 10], [60, 10], [60, 40], [10, 40]], paint: { pigments: { ochre: 1 }, dilution: 'pale' }, ...over });
const script = (passages = [passage('p01'), passage('p02', { stage: 2, brush: 'r7' })]) => ({ format: 'painting-script 2', subject: 'cat', author: 'test', sheet: { widthMm: 100, heightMm: 50 }, palette: ['ochre'], brushes: { mop: { shape: 'round', widthMm: 38 }, r7: { shape: 'round', widthMm: 7 } }, passages });
const plan = { passes: [
  { script: { passage: 'p01', planned: [84.2, 1, 2], plannedRGB: [230, 210, 190] }, kind: 'wash', widestBrushMm: 38, strokes: [1, 2, 3], areaMm2: 1500, move: 'wet on wet' },
  { script: { passage: 'p01-c1' }, kind: 'charge', widestBrushMm: 6, strokes: [1], areaMm2: 20 },
  { script: { passage: 'p02', planned: [48, 1, 2], plannedRGB: [120, 100, 90] }, kind: 'wash', widestBrushMm: 7, strokes: [1, 2], areaMm2: 300.4, move: 'wet on dry' },
  { script: { passage: 'p02-small' }, kind: 'wash', widestBrushMm: 7, strokes: [1], areaMm2: 4 }] };
// a 100 x 50 id map at 1 px a mm: form 2 (a face) over the left 70 mm
const mask = { width: 100, height: 50, data: Uint8Array.from({ length: 5000 }, (_, i) => (i % 100 < 70 ? 2 : 0)) }, forms = [{ id: 2, name: 'cat face', kind: 'face' }];

test('the numbers of each passage are read from the compiled plan, charges and small strokes with their passage', () => {
  const n = passageNumbers(plan, script());
  assert.deepEqual(n.map(r => [r.id, r.brushMm, r.strokes, Math.round(r.areaMm2), r.move, r.L, r.charges]), [['p01', 38, 3, 1500, 'wet on wet', 84.2, 1], ['p02', 7, 3, 304, 'wet on dry', 48, 0]]);
});

test('a passage is checked on the footprint of its strokes: a wide brush is marked in a face, and no value is called a fault', () => {
  // strokes in mm on the 100 x 50 mm sheet: p01 a 38 mm sweep along the middle (70% on the face), p02 a 7 mm stroke off it
  const withStrokes = { passes: [{ ...plan.passes[0], strokes: [{ radiusMm: 19, points: [[0, 25, 1], [100, 25, 1]] }] }, { ...plan.passes[2], strokes: [{ radiusMm: 3.5, points: [[80, 10, 1], [95, 10, 1]] }] }] };
  const covered = formsCovered(withStrokes, mask, forms, 100);
  assert.equal(covered.p01[0].name, 'cat face'); assert.ok(Math.abs(covered.p01[0].share - 0.7) < 0.03); assert.deepEqual(covered.p02, []);
  const t = numbersTable(passageNumbers(withStrokes, script()), covered);
  assert.match(t[0], /^p01 \| stage 1 \| brush 38 mm \| 1 strokes \| 1500 mm2 \| wet on wet \| .*L\* 84.*covers cat face 7\d%.*!! BRUSH OVER 17 mm IN cat face \(7\d% of its footprint\)/);
  assert.match(t[1], /^p02 \| stage 2 \| brush 7 mm .*L\* 48.*covers no named form/); assert.doesNotMatch(t[1], /!!/);
  // a corner of a region on a form no longer counts: only what the strokes cover
  const edge = { passes: [{ ...plan.passes[0], strokes: [{ radiusMm: 19, points: [[95, 25, 1], [99, 25, 1]] }] }] };
  assert.doesNotMatch(numbersTable(passageNumbers(edge, script()), formsCovered(edge, mask, forms, 100))[0], /BRUSH OVER/);
});

test('each form is measured in the study and in the plan and marked both ways: too pale and too dark', () => {
  const grey = v => { const b = Buffer.alloc(5000 * 3, v); return b; }, two = [{ id: 2, name: 'hair', kind: 'hair' }, { id: 9, name: 'none', kind: 'other' }];
  const study = formValues(grey(60), mask, two), pale = formValues(grey(200), mask, two), dark = formValues(grey(20), mask, two);
  assert.equal(study.length, 1, 'a form with no cells is left out'); assert.ok(study[0].meanL > 24 && study[0].meanL < 27); assert.equal(study[0].cells, 3500);
  assert.match(formsTable(study, pale)[0], /^hair \(hair\) \| study: mean L\* 25, darks L\* 25 \| your plan, all layers down: mean L\* 81, darks L\* 81 \| !! PALER THAN THE STUDY BY 55; ITS DARKS DO NOT REACH THE STUDY'S \(short by 55\)/);
  assert.match(formsTable(study, dark)[0], /!! DARKER THAN THE STUDY BY 19; ITS DARKS PASS THE STUDY'S BY 19$/);
  assert.match(formsTable(study, study)[0], /\| close$/);
});

test('the prompt of the step back carries the first prompt, the three pictures, both tables, the two-sided checklist and the script', () => {
  const p = stepBackPrompt({ firstPrompt: 'THE BRIEF', script: script(), table: ['p01 | row'], formTable: ['hair (hair) | row'], files: { plan: 'inputs/plan.png', source: 'inputs/source.png', study: 'inputs/study-middle.png' } });
  assert.match(p, /^THE BRIEF/); assert.match(p, /ONE look/); assert.match(p, /`inputs\/plan.png`: the PLAN PREVIEW/); assert.match(p, /p01 \| row/); assert.match(p, /hair \(hair\) \| row/);
  assert.match(p, /first wash pale and connected/); assert.match(p, /leave its form/); assert.match(p, /over 17 mm inside a face/); assert.match(p, /REACH the study's darks by the end/);
  assert.match(p, /darker or more saturated than the middle study, OR paler and weaker/); assert.match(p, /a form paler than the study is as wrong as one darker/);
  assert.doesNotMatch(p, /A DARK IN THE FIRST STAGES/); assert.match(p, /\{"keep": true/); assert.match(p, /"format":"painting-script 2"/);
  assert.doesNotMatch(stepBackPrompt({ firstPrompt: 'B', script: script(), table: [], files: {} }), /Each named form, measured/);
});

test('what changed between two scripts is listed by passage and field', () => {
  const a = script(), b = script([passage('p01', { brush: 'r7' }), passage('p03')]); b.brushes = { ...b.brushes, r17: { shape: 'round', widthMm: 17 } };
  const d = scriptDiff(a, b);
  assert.deepEqual([d.added, d.removed, d.changed], [['p03'], ['p02'], [{ id: 'p01', fields: ['brush'] }]]); assert.equal(d.brushes.revised.r17.widthMm, 17); assert.equal(d.lights, null);
});

test('one revision turn with a stubbed model: a revised script, a keep, and an unusable answer are each a result', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-step-back-test-')); fs.mkdirSync(path.join(d, 'inputs'));
  const files = ['inputs/plan.png', 'inputs/source.png', 'inputs/study-middle.png']; for (const f of files) fs.writeFileSync(path.join(d, f), 'x');
  const opus = authorOf('opus', AUTHORS), first = script(); let calls = 0, seen = '';
  const reply = text => async (call, o) => { calls++; seen = call.args[1]; for (const f of files) assert.ok(fs.existsSync(path.join(o.cwd, f))); fs.writeFileSync(o.outFile, JSON.stringify({ result: text, usage: { output_tokens: 7 }, total_cost_usd: 0.1 })); fs.writeFileSync(o.errFile, ''); return { exit: 0, error: null }; };
  const ask = text => stepBack(opus, { packet: { dir: d, files }, firstPrompt: 'THE BRIEF', script: first, table: ['p01 | row'], sheetWidthMm: 100, run: reply(text) });
  try {
    const revised = { review: ['a', 'b', 'c', 'd', 'e', 'f'], changed: ['p01: the 17 mm round, not the mop'], ...script([passage('p01', { brush: 'r7' }), passage('p02', { stage: 2, brush: 'r7' })]) };
    const r = await ask(`Here:\n${JSON.stringify(revised)}`);
    assert.equal(calls, 1, 'one look only'); assert.match(seen, /The step back, before any paint/); assert.match(seen, /p01 \| row/);
    assert.equal(r.kept, false); assert.equal(r.script.passages[0].brush, 'r7'); assert.equal(r.script.review, undefined); assert.deepEqual(r.changed, ['p01: the 17 mm round, not the mop']);
    assert.deepEqual(r.diff.changed, [{ id: 'p01', fields: ['brush'] }]); assert.equal(r.tokens, 7); assert.equal(r.costUSD, 0.1); assert.equal(first.passages[0].brush, 'mop', 'the first script is not altered');
    assert.match(fs.readFileSync(path.join(d, 'prompt.txt'), 'utf8'), /^THE BRIEF/); assert.ok(fs.existsSync(path.join(d, 'R.call.json')));
    const k = await ask('{"keep": true, "review": ["fine"], "why": "pale and connected already"}');
    assert.equal(k.kept, true); assert.equal(k.script, first); assert.equal(k.why, 'pale and connected already'); assert.equal(k.error, null);
    const same = await ask(JSON.stringify(first)); assert.equal(same.kept, true, 'the same script back is a keep');
    const bad = await ask(JSON.stringify(script([passage('p01', { brush: 'none' })])));
    assert.equal(bad.kept, true); assert.equal(bad.script, first); assert.match(bad.error, /first script stands: .*brush none is not in the kit/);
    assert.equal(calls, 4);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
