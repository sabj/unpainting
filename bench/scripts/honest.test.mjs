// Honest harness: what the model may see and set between planning and the finished painting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { PaintSession, LOOKS } from './pipeline/session.mjs';

const png = (f, rgb) => sharp({ create: { width: 40, height: 30, channels: 3, background: rgb } }).png().toFile(f);
const until = async (f, ms = 10000) => { const t = Date.now(); while (!fs.existsSync(f)) { if (Date.now() - t > ms) throw new Error('no answer ' + f); await new Promise(r => setTimeout(r, 20)); } return JSON.parse(fs.readFileSync(f, 'utf8')); };

/** A session whose painter is a stub, stopped at boundary `at.b`. */
async function stubSession({ strict }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'honest-')), ws = path.join(root, 'ws'), raw = path.join(root, 'raw');
  fs.mkdirSync(path.join(ws, 'bench', 'plan'), { recursive: true });
  const target = path.join(root, 'target.png'), sheet = path.join(root, 'sheet.png');
  await png(target, '#c04020'); await png(sheet, '#f0f0f0');
  fs.copyFileSync(target, path.join(ws, 'bench', 'plan', 'target.png'));
  const s = new PaintSession({ repo: root, ws, raw, spec: { width: 40, sheetmm: 100, noTargetLooks: strict }, target });
  const at = { b: 0 };
  s.painting = { state: 'running', segments: [], currentStop: () => [at.b, { label: `stop ${at.b}`, strokes: 1, penLines: 0, passesDone: at.b, passesPlanned: 9, remaining: [] }], sheetImage: () => sheet, progress: () => ({}) };
  s.started = true; s.planHash = {};
  let seq = 0;
  const ask = async (cmd, args = []) => {
    const k = String(++seq).padStart(4, '0');
    fs.writeFileSync(path.join(s.io, `req-${k}.json`), JSON.stringify({ cmd, args, t: new Date().toISOString() }));
    s.tick();
    return until(path.join(s.io, `res-${k}.json`));
  };
  return { s, ws, raw, root, at, ask };
}

test('strict: a look shows the sheet and never the target, and the target leaves the worktree when painting starts', async () => {
  const { s, ws, raw, root, ask } = await stubSession({ strict: true });
  s.withdrawTarget();
  assert.equal(fs.existsSync(path.join(ws, 'bench', 'plan', 'target.png')), false);
  const r = await ask('look');
  assert.equal(r.exit, 0);
  assert.doesNotMatch(r.text, /compare|target left/);
  const looks = fs.readdirSync(path.join(ws, 'bench', 'looks'));
  assert.deepEqual(looks.filter(f => /compare/.test(f)), [], 'a strict session writes no compare image');
  assert.ok(looks.some(f => /sheet\.jpg$/.test(f)));
  const rows = fs.readFileSync(path.join(raw, 'CHECKPOINTS.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  assert.ok(rows.filter(x => x.kind === 'look').every(x => x.target === false));
  // every answer the model read is kept
  assert.match(fs.readFileSync(path.join(raw, 'paint-answers.jsonl'), 'utf8'), /"cmd":"look"/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('default mode: a look shows target and sheet; looks are few and fixed, never repeated until something converges', async () => {
  const { s, ws, root, at, ask } = await stubSession({ strict: false });
  for (let k = 1; k <= LOOKS; k++) {
    at.b = k;
    const r = await ask('look');
    assert.equal(r.exit, 0, r.text);
    assert.match(r.text, new RegExp(`Look ${k} of ${LOOKS}`));
  }
  assert.ok(fs.readdirSync(path.join(ws, 'bench', 'looks')).some(f => /compare\.jpg$/.test(f)));
  at.b = LOOKS + 1;
  const over = await ask('look');
  assert.equal(over.exit, 1);
  assert.match(over.text, /most a painting gets/);
  assert.equal(s.steps, LOOKS);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a revision follows a look at the same stop, once', async () => {
  const { s, root, at, ask } = await stubSession({ strict: false });
  s.planFilesHash = () => ({ 'config.json': 'changed' });
  at.b = 2;
  const blind = await ask('revise');
  assert.equal(blind.exit, 1);
  assert.match(blind.text, /follows a look/);
  await ask('look');
  at.b = 3;
  const elsewhere = await ask('revise');
  assert.equal(elsewhere.exit, 1, 'a look at one stop does not license a revision at the next');
  fs.rmSync(root, { recursive: true, force: true });
});

test('the brief says what a look shows in each mode, and that looks are counted', async () => {
  const { renderTask, loadSubjects } = await import('./pipeline/round45.mjs');
  const { ROUNDS } = await import('./lib.mjs');
  const spec = Object.values(loadSubjects())[0], round = ROUNDS.find(r => r.id === 'V4');
  const strict = renderTask({ round, n: 1, tries: 1, spec: { ...spec, noTargetLooks: true } });
  const loose = renderTask({ round, n: 1, tries: 1, spec });
  for (const t of [strict, loose]) { assert.doesNotMatch(t, /\{[A-Z_]+\}|as often as you like|as you like/); assert.match(t, /three looks while painting/); }
  assert.doesNotMatch(strict, /compare\.jpg/);
  assert.match(strict, /no target view after planning/);
  assert.match(loose, /compare\.jpg/);
});

test('V5 feedback carries the painting and the judges\' words, never a score', async () => {
  const { writeFeedback, scrubScores } = await import('./pipeline/feedback.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'honest-fb-')), prevRaw = path.join(root, 'raw'), prevOut = path.join(root, 'out'), dest = path.join(root, 'fb');
  fs.mkdirSync(path.join(prevOut, 'frames'), { recursive: true }); fs.mkdirSync(path.join(prevRaw, 'plan'), { recursive: true });
  const target = path.join(root, 't.png'); await png(target, '#336699'); await png(path.join(prevOut, 'final.png'), '#eeeeee');
  const entry = {
    score: { composite: 6.42, complete: true, classic: 0.731, criteria: { valueStructure: 7.5, edges: 5.25 }, judgeScores: { 'judge-a': 6.1 }, hfCorr: 0.653, j1: 7.37, ceiling: 0.645 },
    progression: { stages: { 10: 3.5, 25: 2.75, 50: 4, 75: 4, 100: 4.25 }, mean: 3.65, earlyMean: 3.125, humanOrderVotes: 1, judgesN: 2, tells: { e: 3, k: 1 },
      judgeNotes: { a: 'Washes go down light to dark; the sky reads as one passage. Stage score 2/5 at 25%.', b: 'score: 4. Edges are all the same.' } },
    pipeline: { paintExit: 0, segments: 1 }, strokes: 671,
  };
  await writeFeedback({ dest, prev: { n: 1, outcome: 'scored', entry }, prevRaw, prevOut, target });
  const md = fs.readFileSync(path.join(dest, 'FEEDBACK.md'), 'utf8');
  for (const v of ['6.42', '0.731', '7.5', '5.25', '6.1', '0.653', '7.37', '0.645', '3.65', '3.125', '2.75', '4.25', '2/5', 'out of', 'score: 4', '(3)'])
    assert.ok(!md.includes(v), `FEEDBACK.md gives back ${v}`);
  assert.doesNotMatch(md, /composite|judge score|hfCorr|J1|ceiling/i);
  assert.match(md, /sky reads as one passage/);
  assert.match(md, /Edges are all the same/);
  assert.match(md, /the whole sheet at one faint value/);
  assert.ok(fs.existsSync(path.join(dest, 'previous-painting.png')) && fs.existsSync(path.join(dest, 'compare.png')));
  assert.equal(scrubScores('rated 3 out of 5, mean 3.2'), 'rated , mean');
  fs.rmSync(root, { recursive: true, force: true });
});

test('the plan cannot set a gain or calibration: washes.charge, _dp/_acc/_lit/_novar, any --*gain or --*cal', async () => {
  const { resolvePlan, checkExtraArgs, ALLOWED_EXTRA_ARGS, GAIN_OPTION } = await import('./pipeline/plan-args.mjs');
  const { BENCH } = await import('./lib.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'honest-gain-'));
  const plan = (config, variant) => { fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config)); return resolvePlan({ spec: { width: 96, sheetmm: 280 }, planDir: dir, variant, target: path.join(BENCH, 'v2/targets/hills.png'), out: '/out' }).problems; };
  assert.deepEqual(plan({ families: [] }, 'region_w13_lay2'), []);
  assert.ok(plan({ families: [], washes: { charge: 0.5 } }, 'region_w13').some(p => /washes\.charge/.test(p)));
  for (const t of ['dp80', 'acc3', 'lit20', 'novar']) {
    const p = plan({ families: [] }, 'region_w13_' + t);
    assert.ok(p.some(m => m.includes(`"${t}" is refused`)), t + ': ' + JSON.stringify(p));
  }
  for (const flag of ['touchgain', 'coolgain', 'stylegain', 'inkresgain', 'pwwetgain', 'deliverycal', 'techcalmax', 'skycal', 'semanticcalibrationmode', 'dogcal'])
    assert.match(checkExtraArgs(['--' + flag, '1'], '/p')[0] ?? '', /may not set/, flag);
  assert.match(checkExtraArgs(['--touchgain', '.6'], '/p')[0], /gain or calibration/);
  for (const k of Object.keys(ALLOWED_EXTRA_ARGS)) assert.doesNotMatch(k, GAIN_OPTION, `${k} is allowed but reads as a gain`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('item 3: the bench base and template carry no sky numbers fitted to one subject', async () => {
  const { argsBuilder, layerBase, optionMap, BASE } = await import('./pipeline/plan-args.mjs');
  const build = argsBuilder({ planDir: '/p', target: '/t.png', width: 600, sheetmm: 140, targetPixels: [300, 240] });
  const args = optionMap(layerBase({ variant: 'region_w13', build }).args);
  assert.equal(args.get('skylanes'), undefined, 'sky lanes inherit the default painter');
  for (const k of ['skylanemm', 'skylanestep', 'skyfloc']) assert.ok(!args.has(k), `the base sets --${k} (Trumbull's fitted value)`);
  assert.doesNotMatch(BASE, /_(rg|blk|bmm|bka)\d|_birr|_pgreen/);
});

test('item 4: plan-args has no per-subject branch: every subject resolves the same way', async () => {
  const { resolvePlan, optionMap } = await import('./pipeline/plan-args.mjs');
  const { BENCH } = await import('./lib.mjs');
  const src = fs.readFileSync(new URL('./pipeline/plan-args.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /trumbull|architecture|basePalette/i);
  const subjects = JSON.parse(fs.readFileSync(path.join(BENCH, 'v4v5', 'subjects.json'), 'utf8')).subjects;
  for (const [k, s] of Object.entries(subjects)) assert.ok(!('trumbull' in s) && !('architecture' in s), `${k} carries a subject switch`);
  const o = { planDir: '/missing', variant: 'region_w13', target: path.join(BENCH, 'v2/targets/hills.png'), out: '/out' };
  const a = optionMap(resolvePlan({ ...o, spec: { width: 96, sheetmm: 280 } }).args), b = optionMap(resolvePlan({ ...o, spec: { width: 96, sheetmm: 280, trumbull: true, architecture: true } }).args);
  assert.deepEqual([...b], [...a]);
  assert.ok(!a.has('paints') && !a.has('stoneblocks') && !a.has('groundglaze'));
});
