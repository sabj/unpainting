// node --test bench/scripts/add-level-one-target.test.mjs   (npm run bench:test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { BENCH, readJson, loadModels, loadLevelOneCrops } from './lib.mjs';
import { addLevelOneTarget, unitFrom } from './add-level-one-target.mjs';
import { guarded } from './v3.mjs';
import { standardSheet } from '../../tools/paint/sheet-rule.mjs';
import { levelOneTargets, picturesAt } from '../../tools/paint/run-sets.mjs';

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'level-one-target-')), base = path.join(root, 'registry');
  fs.mkdirSync(path.join(root, 'v3'), { recursive: true }); fs.mkdirSync(path.join(base, 'img'), { recursive: true });
  fs.writeFileSync(path.join(root, 'v3', 'crops.json'), JSON.stringify({ _about: 'test', crops: [] }));
  fs.writeFileSync(path.join(root, 'run-sets.json'), '{\n "pictures": [\n  { "id": "big", "title": "Big", "group": "g", "core": true, "levelOne": null },\n  { "id": "small", "title": "Small", "group": "g", "core": false, "levelOne": null }\n ]\n}\n');
  const make = async (name, w, h) => { const f = path.join(base, 'img', `${name}.png`); await sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 150, b: 90 } } }).png().toFile(f); return { path: `img/${name}.png`, px: [w, h], sha256: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') }; };
  const registry = { file: path.join(base, 'SUBJECTS.json'), base, subjects: [{ id: 'big', source: await make('big', 2400, 1800), class: { value: 'ink' } }, { id: 'small', source: await make('small', 400, 300), class: { value: 'none' } }] };
  return { root, registry };
}
const said = { name: 'Big, full size', style: 'pen and wash: a test', source: 'a test picture', licence: 'public domain' };

test('a level 1 target is the registered picture on the standard sheet, with its coarse map, and the run sets point at it', async () => {
  const { root, registry } = await fixture();
  try {
    const sheet = standardSheet([2400, 1800]);
    const e = await addLevelOneTarget({ id: 'big', registry, ...said, root });
    assert.deepEqual([e.task, e.width, e.height, e.medium], ['big-full', sheet.cells, sheet.rows, 'pen']);
    assert.deepEqual(e.subject, { id: 'big', sourceSha256: registry.subjects[0].source.sha256, sourcePx: [2400, 1800], sheet: { rule: 'quarter-sheet-area', widthMm: sheet.widthMm, heightMm: sheet.heightMm, cellMm: 0.26 } });
    const meta = await sharp(path.join(root, 'v3', 'targets', 'big-full.png')).metadata();
    assert.deepEqual([meta.width, meta.height], [sheet.cells, sheet.rows], 'one cell a target pixel');
    assert.equal(readJson(path.join(root, 'v3', 'targets', 'big-full-coarse.json')).cols, 24);
    const sets = fs.readFileSync(path.join(root, 'run-sets.json'), 'utf8');
    assert.match(sets, /\{ "id": "big", "title": "Big", "group": "g", "core": true, "levelOne": "big-full" \},\n {2}\{ "id": "small",.*"levelOne": null \}/, 'only that picture\'s line changes');
    // no unit yet: written, and level 1 will not run it
    assert.equal(e.unit, undefined); assert.throws(() => guarded(['big-full'], readJson(path.join(root, 'v3', 'crops.json')).crops), /big-full: no rendering unit/);
    // its unit, from the prepared folder's record; the picture is not rewritten
    const prepared = { commit: 'abcdef0123456789', subject: { id: 'big' }, unit: { waterSteps: 3000, planWork: { sweeps: 1200, dryings: 4 }, cells: 744 } };
    const before = fs.statSync(path.join(root, 'v3', 'targets', 'big-full.png')).mtimeMs;
    const u = await addLevelOneTarget({ id: 'big', registry, unit: unitFrom(prepared, 'big'), root });
    assert.deepEqual(u.unit, { sweeps: 1200, dryings: 4, waterSteps: 3000, from: 'prepared big at abcdef01: one full look of the automatic plan, 744 cells across', cellsAcross: 744 });
    assert.equal(fs.statSync(path.join(root, 'v3', 'targets', 'big-full.png')).mtimeMs, before); assert.equal(readJson(path.join(root, 'v3', 'crops.json')).crops.length, 1);
    assert.doesNotThrow(() => guarded(['big-full'], readJson(path.join(root, 'v3', 'crops.json')).crops));
    // refusals, each by name
    await assert.rejects(() => addLevelOneTarget({ id: 'big', registry, ...said, root }), /already exists; give --unit/);
    assert.throws(() => unitFrom(prepared, 'small'), /is of big, not small/); assert.throws(() => unitFrom({ subject: { id: 'big' }, unit: {} }, 'big'), /no counted look/);
    await assert.rejects(() => addLevelOneTarget({ id: 'small', registry, ...said, root }), /400 px wide and the standard sheet \d+ cells: a target is never enlarged/);
    await assert.rejects(() => addLevelOneTarget({ id: 'other', registry, ...said, root }), /not one of the benchmark's pictures/);
    fs.appendFileSync(path.join(registry.base, 'img', 'big.png'), 'x'); fs.rmSync(path.join(root, 'v3', 'crops.json')); fs.writeFileSync(path.join(root, 'v3', 'crops.json'), JSON.stringify({ crops: [] }));
    await assert.rejects(() => addLevelOneTarget({ id: 'big', registry, ...said, root }), /not the registered one/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the five core pictures have level 1 targets on the standard sheet; each with its rendering unit', async () => {
  const tasks = levelOneTargets('core'), specs = loadLevelOneCrops();
  assert.deepEqual(tasks, ['manet-morisot-fan-crop-full', 'prout-laundresses-full', 'turner-esseillon-full', 'white-ships-1488-full', 'mittens-closeup-full']);
  for (const t of tasks) {
    const s = specs.find(c => c.task === t); assert.ok(s, t);
    const meta = await sharp(path.join(BENCH, 'v3', s.file)).metadata(), sheet = standardSheet([s.width, s.height]);
    assert.deepEqual([meta.width, meta.height], [s.width, s.height], t);
    assert.ok(Math.abs(sheet.cells - s.width) <= 1 && Math.abs(sheet.rows - s.height) <= 1, `${t} is on the standard sheet (${sheet.cells} x ${sheet.rows})`);
    assert.ok(fs.existsSync(path.join(BENCH, 'v3', s.coarseFile)), t); assert.ok(s.licence && s.source && s.style, t);
  }
  // every core picture has its rendering unit (Prout and the larger White Ships from their prepared Auto at 32698365)
  assert.doesNotThrow(() => guarded(tasks, specs));
});

test('the 0.4 models carry one key, id and effort at level 1 (bench/models.json) and at levels 2 to 4 (tools/paint/authors.json)', () => {
  const models = loadModels(), authors = readJson(path.join(BENCH, '..', 'tools', 'paint', 'authors.json')).authors, cli = { agy: 'agy', claude: 'claude', codex: 'codex' };
  for (const key of ['argon-m', 'neon-m', 'hydrogen-m', 'carbon-m', 'sonnet-m']) {
    const m = models.find(x => x.key === key), a = authors.find(x => x.key === key);
    assert.ok(m, `${key} in bench/models.json`); assert.ok(a, `${key} in tools/paint/authors.json`);
    assert.deepEqual([m.id, m.effort, cli[m.runner], m.name], [a.id, a.effort, a.cli, a.name], key);
  }
  assert.equal(new Set(models.map(m => m.key)).size, models.length, 'no key twice');
  assert.equal(picturesAt('core', 'L1').length, 5);
});
