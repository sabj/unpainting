import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorOf, fillBrief, readScript, authorWithModel } from './author.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODELS = [{ key: 'opus', name: 'Opus 5.5', id: 'claude-opus-5-5', effort: 'xhigh', runner: 'claude' }];
const script = (over = {}) => ({
  format: 'painting-script 2', subject: 'dune', author: 'test', sheet: { widthMm: 280, heightMm: 186.7 }, palette: ['ochre', 'ultramarine'],
  brushes: { r12: { shape: 'round', widthMm: 7 } },
  passages: [{ id: 'p01', what: 'first wash', stage: 1, kind: 'wash', brush: 'r12', paper: 'dry', region: [[10, 10], [100, 10], [100, 60], [10, 60]], paint: { pigments: { ochre: 1 }, dilution: 'pale' } }],
  ...over,
});
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paint-author-'));

test('an author is auto, a kept script or a registered model', () => {
  assert.equal(authorOf('auto', MODELS).key, 'auto');
  assert.equal(authorOf('opus', MODELS).runner, 'claude');
  const s = authorOf('script:some/kept-plan.json', MODELS); assert.equal(s.runner, 'script'); assert.equal(s.name, 'script kept-plan');
  assert.throws(() => authorOf('gpt9', MODELS), /auto, script:FILE.json, or one of opus/);
});

test('the committed brief is filled with the sheet, the inputs, the wash brushes and the paints', () => {
  const b = fillBrief(fs.readFileSync(path.join(HERE, 'AUTHOR-BRIEF.md'), 'utf8'), { sheet: { widthMm: 280, heightMm: 186.7 }, inputs: [{ file: 'source.png', what: 'the picture to paint' }],
    brushes: { mop: { width_mm: 38 }, round12: { width_mm: 7 }, pen: { width_mm: 0.5 }, dry: { width_mm: 4 } }, paints: ['ochre', 'ultramarine'] });
  assert.match(b, /The sheet is 280 by 186.7 mm/); assert.match(b, /- `inputs\/source.png`: the picture to paint/);
  assert.match(b, /- mop: 38\n- round12: 7\n\n/); assert.match(b, /\(box keys\): ochre, ultramarine/);
  assert.doesNotMatch(b, /SHEET_W|SHEET_H|INPUT_LIST|KIT_LIST|PAINT_LIST/); assert.doesNotMatch(b, /- pen:/);
});

test('a script is checked against this run before it is painted', () => {
  const d = tmp(), f = path.join(d, 's.json'), write = s => fs.writeFileSync(f, JSON.stringify(s));
  try {
    write(script()); const ok = readScript(f, { sheetWidthMm: 280 });
    assert.deepEqual(ok.paints, ['ochre', 'ultramarine']); assert.equal(ok.script.passages.length, 1);
    assert.throws(() => readScript(f, { sheetWidthMm: 380 }), /written for a sheet 280 mm wide, painted on 380 mm/);
    write(script({ passages: [{ ...script().passages[0], shapes: [3, 4] }] }));
    assert.throws(() => readScript(f, { sheetWidthMm: 280 }), /name study shapes by number/);
    fs.writeFileSync(f, '{ not json'); assert.throws(() => readScript(f, { sheetWidthMm: 280 }), /is not JSON/);
    assert.throws(() => readScript(path.join(d, 'none.json'), { sheetWidthMm: 280 }), /no script at/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('a model is launched once, as the benchmark launches it, with the brief and the input pictures; no script is a failure', async () => {
  const d = tmp(), ws = path.join(d, 'ws'); fs.mkdirSync(path.join(ws, 'inputs'), { recursive: true });
  const png = path.join(ws, 'inputs', 'source.png'); fs.writeFileSync(png, Buffer.from('iVBORw0KGgo=', 'base64'));
  fs.writeFileSync(path.join(ws, 'BRIEF.md'), 'the brief');
  const work = { ws, brief: 'the brief', briefPath: path.join(ws, 'BRIEF.md'), images: [png] };
  try {
    let seen = null;
    const got = await authorWithModel(MODELS[0], { dir: d, work, launch: async (turn, o) => { seen = { turn, o }; fs.writeFileSync(path.join(ws, 'script.json'), '{}'); return 0; } });
    assert.equal(got.file, path.join(ws, 'script.json')); assert.equal(seen.turn.cmd, 'claude'); assert.equal(seen.o.cwd, ws);
    assert.ok(seen.turn.args.includes('claude-opus-5-5'));
    const sent = JSON.parse(fs.readFileSync(seen.turn.stdinFile, 'utf8').trim()).message.content;
    assert.match(sent[0].text, /^the brief/); assert.equal(sent.filter(c => c.type === 'image').length, 1);
    fs.rmSync(path.join(ws, 'script.json'));
    await assert.rejects(authorWithModel(MODELS[0], { dir: d, work, launch: async () => 1 }), /without writing script.json/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
