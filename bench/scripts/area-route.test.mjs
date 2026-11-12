// V4 and V5 on the area route: the model writes an area plan (bench/plan/area-plan.json) and the drawing section, not
// config.json + recipe tokens + painter settings. The token route stays as it is (rounds.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { BENCH, ROUNDS, V2, validateRun, readJson } from './lib.mjs';
import { checkAreaDocument, resolveAreaPlan, AREA_TARGET_PATH } from './pipeline/area-args.mjs';
import { optionMap, resolvePlan } from './pipeline/plan-args.mjs';
import { renderTask, loadSubjects } from './pipeline/round45.mjs';
import { planSnapshot } from './pipeline/session.mjs';

const EXAMPLE = path.join(BENCH, 'v4v5', 'example-area');
const example = () => JSON.parse(fs.readFileSync(path.join(EXAMPLE, 'plan', 'area-plan.json'), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'area-route-'));
const planDir = (doc, lines = true) => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'area-plan.json'), JSON.stringify(doc));
  if (lines) fs.copyFileSync(path.join(EXAMPLE, 'plan', 'opening-lines.json'), path.join(d, 'opening-lines.json'));
  return d;
};
const TARGET = path.join(EXAMPLE, 'plan', 'target.png');
const spec = (medium = 'none', extra = {}) => ({ width: 600, sheetmm: 140, medium, ...extra });

test('the worked area example is admissible by the harness and names nothing private', () => {
  assert.deepEqual(checkAreaDocument(example()), []);
  const t = fs.readFileSync(path.join(EXAMPLE, 'plan', 'area-plan.json'), 'utf8');
  assert.doesNotMatch(t, /\/Users\/|\/private\//);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(TARGET)).digest('hex');
  assert.equal(example().target.sha256, sha);
});

test('area plan refusals: the drawing section, paints, token-route keys, the target path and gains', () => {
  const ok = example();
  const bad = (edit, re) => { const d = structuredClone(ok); edit(d); assert.ok(checkAreaDocument(d).some(p => re.test(p)), `${re}: ${JSON.stringify(checkAreaDocument(d))}`); };
  bad(d => { delete d.drawing; }, /needs a drawing section/);
  bad(d => { d.drawing.medium = 'pen'; }, /drawing\.medium must be/);
  bad(d => { d.drawing.reason = ''; }, /drawing\.reason/);
  bad(d => { d.drawing.stages = {}; }, /drawing\.stages is not read/);
  bad(d => { delete d.paints; }, /needs paints/);
  bad(d => { d.families = []; }, /families belongs to the token route/);
  bad(d => { d.target.path = 'bench/v2/targets/x.png'; }, /target\.path must be/);
  // a pigment scale on every load is a gain on delivery, refused as the token route refuses its value gains
  bad(d => { d.areas[0].passes[0].load.pigmentScale = 1.4; }, /pigmentScale must be 1: a pigment scale is a gain/);
  bad(d => { d.areas[0].passes[0].valueGain = 2; }, /valueGain is refused: a gain/);
  assert.deepEqual(checkAreaDocument(null), ['area-plan.json is missing or not a JSON object']);
});

test('the area route forces none of the token route\'s settings and keeps the harness\'s own', () => {
  const dir = planDir(example());
  const r = resolveAreaPlan({ spec: spec('none', { noTargetLooks: true }), planDir: dir, target: TARGET, out: path.join(dir, 'out') });
  assert.deepEqual(r.problems, []);
  const o = optionMap(r.args);
  // move 5: the five settings the token route forces on every subject are gone, with the value route's recipe
  for (const k of ['touchpoints', 'skylanes', 'skyblue', 'midlayers', 'drawinghand', 'valueplan', 'order', 'brushchoice', 'shapedmarks', 'paperrel', 'paperlights'])
    assert.ok(!o.has(k), `--${k} must not be set on the area route`);
  // the template, the target guard, strict mode, the subject medium and the plan
  assert.equal(o.get('targetguard'), 'gentle');
  assert.equal(o.get('notargetlooks'), '1');
  assert.equal(o.get('subjectmedium'), 'none');
  assert.equal(o.get('paints'), 'cerulean,ultramarine,sepia,sienna');
  assert.equal(o.get('areaplan'), r.planFile);
  assert.equal(o.get('mode'), 'fast');
  assert.equal(o.get('seed'), '0');
  assert.ok(!o.has('areaplanonly'));
  // the painter reads a copy that points at the real target; nothing else in the plan changes
  const run = JSON.parse(fs.readFileSync(r.planFile, 'utf8')), mine = example();
  assert.equal(run.target.path, path.resolve(TARGET));
  assert.deepEqual({ ...run, target: { ...run.target, path: mine.target.path } }, mine);
  const c = resolveAreaPlan({ spec: spec(), planDir: dir, target: TARGET, out: path.join(dir, 'out2'), compile: true });
  assert.equal(optionMap(c.args).get('areaplanonly'), '1');
  assert.ok(!optionMap(c.args).has('notargetlooks'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the subject medium decides on the area route too: no ink and no closing lines on a pencil subject', () => {
  const d = example(); d.drawing = { medium: 'ink', reason: 'asked for ink', ink: 'black-ink' };
  const dir = planDir(d);
  fs.copyFileSync(path.join(dir, 'opening-lines.json'), path.join(dir, 'closing-lines.json'));
  const pencil = resolveAreaPlan({ spec: spec('pencil'), planDir: dir, target: TARGET, out: path.join(dir, 'o1') });
  const p = optionMap(pencil.args);
  assert.equal(p.get('outlinemedium'), 'graphite');
  assert.equal(p.get('drawing'), 'first');
  assert.ok(!p.has('drawinglast') && !p.has('inkprofile') && !p.has('washinkfree'));
  assert.equal(pencil.layering.mediumOverride.drawn, 'graphite');
  assert.equal(pencil.layering.mediumOverride.closingDropped, true);
  const pen = resolveAreaPlan({ spec: spec('pen'), planDir: dir, target: TARGET, out: path.join(dir, 'o2') });
  const q = optionMap(pen.args);
  assert.deepEqual([q.get('outlinemedium'), q.get('drawing'), q.get('inkprofile'), q.get('washinkfree')], ['ink', 'both', 'black-ink', '1']);
  assert.ok(!q.has('drawinghand'));
  assert.equal(pen.layering.mediumOverride, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an area plan with no lines asks for no drawing, and token-route files beside it are refused', () => {
  const d = example(); d.drawing = { medium: 'none', reason: 'no drawing' };
  const dir = planDir(d, false);
  const r = resolveAreaPlan({ spec: spec(), planDir: dir, target: TARGET, out: path.join(dir, 'o') });
  assert.deepEqual(r.problems, []);
  assert.equal(optionMap(r.args).get('drawing'), 'none');
  d.drawing = { medium: 'graphite', reason: 'pencil' };
  fs.writeFileSync(path.join(dir, 'area-plan.json'), JSON.stringify(d));
  assert.ok(resolveAreaPlan({ spec: spec(), planDir: dir, target: TARGET, out: path.join(dir, 'o3') }).problems.some(p => /no opening-lines\.json or closing-lines\.json/.test(p)));
  fs.writeFileSync(path.join(dir, 'config.json'), '{}');
  assert.ok(resolveAreaPlan({ spec: spec(), planDir: dir, target: TARGET, out: path.join(dir, 'o4') }).problems.some(p => /config\.json belongs to the token route/.test(p)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the area brief fills every field, names nothing private, and offers no tokens or painter settings', () => {
  const subjects = loadSubjects();
  for (const round of ROUNDS.filter(r => ['V4', 'V5'].includes(r.id))) for (const n of [1, 2]) for (const crop of Object.keys(subjects)) {
    const t = renderTask({ round, n, tries: 3, spec: subjects[crop], planForm: 'area' });
    assert.doesNotMatch(t, /\{[A-Z_]+\}/, `${round.id} try ${n} ${crop}`);
    assert.doesNotMatch(t, /\/Users\/|cloud GPU|V096|owner/i);
    assert.match(t, /area-plan\.json/);
    assert.doesNotMatch(t, /region_w13|variant\.txt \(required\)|--midlayers|TOKENS\.md/);
  }
  // the token brief is the one it was
  const s = subjects.trumbull, round = ROUNDS.find(r => r.id === 'V4');
  assert.equal(renderTask({ round, n: 1, tries: 3, spec: s, planForm: 'token' }), renderTask({ round, n: 1, tries: 3, spec: s }));
});

test('the plan snapshot keeps an area plan', () => {
  const ws = tmp();
  fs.mkdirSync(path.join(ws, 'bench', 'plan'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'bench', 'plan', 'area-plan.json'), '{}');
  fs.writeFileSync(path.join(ws, 'bench', 'PLAN.md'), '# p');
  const dest = planSnapshot(ws, path.join(ws, 'snap'));
  assert.deepEqual(fs.readdirSync(dest).sort(), ['PLAN.md', 'area-plan.json']);
  fs.rmSync(ws, { recursive: true, force: true });
});

test('the token route is unchanged: the same args for the same plan', () => {
  // a plan as the dry planner writes it, resolved as before; the area work adds nothing to it
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ subject: 'dry', name: 'd', styleSelection: { style: 'precise-watercolor', reason: 'r' }, families: [], reserves: [] }));
  const r = resolvePlan({ spec: { ...loadSubjects().trumbull, width: 300 }, planDir: dir, variant: 'region_w13', target: path.join(V2, 'targets', 'trumbull.png'), out: '/o' });
  const o = optionMap(r.args);
  assert.deepEqual(['touchpoints', 'skylanes', 'midlayers'].map(k => o.get(k)), ['2', '1', '4']);
  assert.ok(!o.has('skyblue'), 'the sky tube was removed; the base no longer carries it');
  assert.ok(!o.has('areaplan'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('dry run on the area route: plans, checks, paints with stops, looks, cannot revise, and finishes', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dry-area-'));
  execFileSync(process.execPath, [path.join(BENCH, 'scripts', 'run.mjs'), '--dry-run', '--round', 'V4', '--profile', 'full', '--crops', 'hills', '--tries', '1', '--planform', 'area', '--out', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  const r = readJson(path.join(out, 'v4-pipeline', 'dry-run', '1', 'run.json')), p = r.crops.hills.pipeline;
  assert.deepEqual(validateRun(r), []);
  assert.equal(r.settings.planForm, 'area');
  assert.equal(p.outcome, 'painted');
  assert.equal(p.paintedBy, 'the model');
  assert.equal(p.tokens, 'area-plan');
  assert.ok(p.looks >= 1, JSON.stringify(p));
  assert.equal(p.revisions, 0);
  assert.equal(p.segments, 1);
  const dir = path.join(out, 'v4-pipeline', 'dry-run', '1', 'hills-plan');
  assert.ok(fs.existsSync(path.join(dir, 'area-plan.json')));
  assert.ok(!fs.existsSync(path.join(dir, 'config.json')));
  assert.match(fs.readFileSync(path.join(dir, 'CHECKPOINTS.jsonl'), 'utf8'), /"kind":"look"/);
  fs.rmSync(out, { recursive: true, force: true });
});

test('the area route removes example plans of benchmark subjects from the model\'s tree', async () => {
  const { removeSubjectPlans } = await import('./pipeline/round45.mjs');
  const ws = tmp(), dir = path.join(ws, 'examples', 'plans');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mittens-area.json'), JSON.stringify({ target: { path: 'bench/v2/targets/mittens.png' } }));
  fs.writeFileSync(path.join(dir, 'trumbull-values.json'), '{}');
  fs.writeFileSync(path.join(dir, 'graded-wash.json'), '{}');
  fs.writeFileSync(path.join(dir, 'study.json'), JSON.stringify({ target: { path: 'bench/v2/targets/h36a.png' } }));
  assert.deepEqual(removeSubjectPlans(ws).sort(), ['mittens-area.json', 'study.json', 'trumbull-values.json']);
  assert.deepEqual(fs.readdirSync(dir), ['graded-wash.json']);
  fs.rmSync(ws, { recursive: true, force: true });
});
