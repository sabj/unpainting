// V4 and V5: the plan checks, the brief, the model commands, and a dry run of each round end to end (a scripted
// stand-in instead of a model, a small painting on the CPU, no keys).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BENCH, ROUNDS, validateRun, readJson } from './lib.mjs';
import { resolvePlan, argsBuilder, layerBase, checkExtraArgs, unknownTokens, checkPlanLimits, renderVerdict, optionMap } from './pipeline/plan-args.mjs';
import { tokensMarkdown } from './pipeline/tokens.mjs';
import { renderTask, loadSubjects } from './pipeline/round45.mjs';
import { turnCommand } from './runners.mjs';
import { modelCheckSpec } from './pipeline/check.mjs';
import { makeWorktree } from './pipeline/harness.mjs';

const build = argsBuilder({ planDir: '/p', target: '/t.png', width: 600, sheetmm: 140, targetPixels: [300, 240] });

test('a model token replaces the base token in its slot; every subject gets the same base', () => {
  const l = layerBase({ variant: 'region_w13_lay2', build });
  assert.equal(optionMap(l.args).get('midlayers'), '2');
  assert.deepEqual(l.applied, [], 'the base inherits the default recipe without token overrides');
  for (const gain of ['darkgain', 'coolgain', 'midgain']) assert.ok(!optionMap(l.args).has(gain), `the base sets no ${gain}`);
  // the stone, recess, lit and palette tokens and the fitted sky-lane values were removed in 0.3.3
  const args = optionMap(layerBase({ variant: 'region_w13', build }).args);
  for (const k of ['stoneblocks', 'groundglaze', 'recesses', 'litwarm', 'paints', 'skylanemm', 'skylanestep', 'skyfloc']) assert.ok(!args.has(k), k);
  assert.equal(args.get('skylanes'), undefined);
});

test('refusals before painting: unknown tokens, locked options, paths out of the plan folder, plan limits', () => {
  assert.deepEqual(unknownTokens('region_w13_lay2_bogus', build), ['bogus']);
  for (const token of ['pwarm', 'pgreen', 'blk60', 'rg10', 'birr', 'rec2', 'rcl', 'lw', 'lit20', 'slane']) assert.deepEqual(unknownTokens('region_w13_' + token, build), [token]);
  assert.match(unknownTokens('region_w9_lay2', build)[0], /prefix/);
  assert.equal(checkExtraArgs(['--midlayers', '3'], '/p').length, 0);
  // a plan states values; gains were removed in 0.3.3, as tokens and as settings
  for (const gain of ['darkgain', 'coolgain', 'midgain', 'calibratedplan']) assert.match(checkExtraArgs([`--${gain}`, '1'], '/p')[0], /may not set/);
  for (const token of ['dk13', 'cg13', 'mg12']) assert.deepEqual(unknownTokens('region_w13_' + token, build), [token]);
  assert.match(checkExtraArgs(['--targetguard', 'off'], '/p')[0], /may not set --targetguard/);
  assert.match(checkExtraArgs(['--focusmap', '../x.json'], '/p')[0], /leaves the plan folder/);
  const bad = checkPlanLimits({ families: [{ id: 'f', bounds: [0, 0, 0.001, 1] }], reserves: [{ bounds: [0, 0, 0.5, 0.5] }] }, 140, {}, [300, 240]);
  assert.equal(bad.length, 2);
});

test('strict verdict: a setting the plan chose that nothing read fails the painting; an unread base setting does not', () => {
  assert.equal(renderVerdict({ paintExit: 3, unused: ['--foliagerefit'], baseOptions: ['foliagerefit'], strict: true, continued: { total: 0, checks: {} } }).exit, 0);
  const v = renderVerdict({ paintExit: 3, unused: ['--stonewarm'], extraOptions: ['stonewarm'], strict: true, continued: { total: 0, checks: {} } });
  assert.equal(v.exit, 4);
  assert.match(v.failures[0].reason, /read by nothing: --stonewarm/);
  assert.equal(renderVerdict({ paintExit: 0, dropped: 2, droppedPct: 1.5, strict: true, continued: { total: 0, checks: {} } }).exit, 5);
});

test('TOKENS.md is generated from plan-args.mjs', () => {
  assert.equal(fs.readFileSync(path.join(BENCH, 'v4v5', 'TOKENS.md'), 'utf8'), tokensMarkdown());
});

test('the V4 and V5 briefs fill every field and name nothing private', () => {
  const subjects = loadSubjects();
  for (const round of ROUNDS.filter(r => ['V4', 'V5'].includes(r.id))) for (const n of [1, 2]) for (const crop of Object.keys(subjects)) for (const strictVerdict of [false, true]) {
    const t = renderTask({ round, n, tries: 3, spec: subjects[crop], strictVerdict });
    assert.doesNotMatch(t, /\{[A-Z_]+\}/, `${round.id} try ${n} ${crop}`);
    assert.match(t, strictVerdict ? /An option nothing reads\s+fails the painting/ : /the painting still counts/);
    assert.doesNotMatch(t, /\/Users\/|cloud GPU|V096|owner/i);
  }
  for (const dir of ['v3', 'v4v5']) for (const f of fs.readdirSync(path.join(BENCH, dir), { recursive: true })) {
    const p = path.join(BENCH, dir, f);
    if (fs.statSync(p).isFile() && /\.(md|json|sh|mjs)$/.test(f)) assert.doesNotMatch(fs.readFileSync(p, 'utf8'), /\/Users\/|\/private\/tmp/i, p);
  }
});

test('later turns resume the same session', () => {
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-'));
  const claude = { key: 'opus', id: 'claude-opus-5-5', effort: 'xhigh', runner: 'claude' }, codex = { key: 'sol', id: 'gpt-6.1-sol', effort: 'xhigh', runner: 'codex' };
  const c1 = turnCommand(claude, { ws: '/ws', raw, text: 'go', sessionId: 'S' });
  assert.ok(c1.args.includes('--session-id') && c1.stdinFile);
  const c2 = turnCommand(claude, { ws: '/ws', raw, text: 'again', sessionId: 'S', resume: true });
  assert.deepEqual(c2.args.slice(c2.args.indexOf('--resume'), c2.args.indexOf('--resume') + 2), ['--resume', 'S']);
  const x2 = turnCommand(codex, { ws: '/ws', raw, text: 'again', sessionId: 'T', resume: true, images: ['/a.png'] });
  assert.deepEqual(x2.args.slice(x2.args.indexOf('resume'), x2.args.indexOf('resume') + 3), ['resume', 'T', 'again']);
  fs.rmSync(raw, { recursive: true, force: true });
});

const dryRun = (round, extra) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `dry-${round}-`));
  execFileSync(process.execPath, [path.join(BENCH, 'scripts', 'run.mjs'), '--dry-run', '--round', round, '--profile', 'full', '--crops', 'hills', '--out', out, ...extra], { stdio: ['ignore', 'ignore', 'pipe'] });
  return out;
};
const runOf = (out, dir, n) => readJson(path.join(out, dir, 'dry-run', String(n), 'run.json'));

test('dry run: V4 plans, is refused once, paints with stops, looks, revises and finishes', () => {
  const out = dryRun('V4', ['--tries', '1']);
  const r = runOf(out, 'v4-pipeline', 1), p = r.crops.hills.pipeline;
  assert.deepEqual(validateRun(r), []);
  assert.equal(p.outcome, 'painted');
  assert.equal(p.paintedBy, 'the model');
  assert.ok(p.looks >= 2 && p.revisions === 1 && p.segments === 2);
  assert.deepEqual(p.optionCheck.model, []);
  const ck = fs.readFileSync(path.join(out, 'v4-pipeline', 'dry-run', '1', 'hills-plan', 'CHECKPOINTS.jsonl'), 'utf8');
  assert.match(ck, /start-refused/);
  // the painter's copy measure is in the try record, with the plan's line sources beside it; the model is not told
  assert.ok(Number.isFinite(p.copy.hfCorr) && p.copy.ceiling === 0.53 && typeof p.copy.over === 'boolean', JSON.stringify(p.copy));
  assert.equal(typeof p.copy.lines, 'number');
  assert.doesNotMatch(ck, /"copy"/);
  // the preview was made and the cost is in the try record and run.json: the dry planner ran the check once itself, the
  // refused start, the start and the revision ran it again; one render, whose segments include the revision's
  assert.ok(p.cost.checks >= 3 && p.cost.previewSeconds > 0 && p.cost.renders === 1 && p.cost.renderSeconds > 0, JSON.stringify(p.cost));
  assert.deepEqual([r.session.checks, r.session.renders], [p.cost.checks, 1]);
  assert.ok(r.session.previewSeconds > 0);
  fs.rmSync(out, { recursive: true, force: true });
});

test('dry run: V5 try 2 gets feedback on try 1 and writes its self-review', () => {
  const out = dryRun('V5', ['--tries', '2']);
  const r = runOf(out, 'v5-self-study', 2), p = r.crops.hills.pipeline;
  assert.deepEqual(validateRun(r), []);
  assert.equal(p.feedback, 'hills-plan/FEEDBACK.md');
  assert.equal(p.selfReview, 'hills-plan/SELF-REVIEW.md');
  const dir = path.join(out, 'v5-self-study', 'dry-run', '2', 'hills-plan');
  assert.match(fs.readFileSync(path.join(dir, 'FEEDBACK.md'), 'utf8'), /previous try \(try 1\)/);
  assert.equal(runOf(out, 'v5-self-study', 1).score.status, 'dry-run');
  fs.rmSync(out, { recursive: true, force: true });
});

test('extra args admit only validated artistic controls, never execution or ink bypasses', () => {
  for (const key of ['segments', 'allowdirty', 'inkrecipe', 'inkres', 'speedvaluecache', 'aware', 'awarefoo', 'physics', 'linesupport', 'inkdarkcap', 'unknown']) {
    for (const args of [[`--${key}`, '1'], [`--${key}=1`]]) assert.ok(checkExtraArgs(args, '/p').length, args.join(' '));
  }
  for (const args of [['--midlayers'], ['--midlayers', 'NaN'], ['--midlayers', '9'], ['--drawing', 'bogus'], ['--midlayers', '--drawing', 'first'], ['orphan']]) assert.ok(checkExtraArgs(args, '/p').length);
  assert.deepEqual(checkExtraArgs(['--outlinemedium', 'ink', '--drawing', 'both', '--midlayers', '2'], '/p'), []);
  const args = optionMap(layerBase({variant: 'region_w13', build}).args);
  assert.equal(args.get('recipe'), 'default');
  assert.equal(args.get('inkrecipe'), undefined);
  for (const key of ['inkkscale', 'closingpressure', 'drawwidthgain', 'openinglines']) assert.ok(!args.has(key), key);
  for (const token of ['ink2', 'ink3', 'ink4', 'sep8', 'uncap', 'dwg200']) assert.deepEqual(unknownTokens('region_w13_' + token, build), [token]);
});


test('the model\'s own check plans with the dirty-tree refusal off, because its worktree is stripped', () => {
  const options={spec:{width:96,sheetmm:280},planDir:'/missing-fixture',variant:'region_w13_lay2',target:path.join(BENCH,'v2/targets/hills.png'),out:'/out'};
  assert.equal(optionMap(resolvePlan({...options,spec:modelCheckSpec(options.spec)}).args).get('allowdirty'),'1');
  assert.equal(options.spec.offlineFixture,undefined);
});

test('each session gets its own temporary folder, outside the workspace, gone with the worktree', () => {
  const a = makeWorktree(), b = makeWorktree();
  try {
    assert.ok(fs.statSync(a.scratch).isDirectory());
    assert.notEqual(a.scratch, b.scratch);
    assert.ok(!a.scratch.startsWith(a.ws + path.sep));
    assert.equal(path.dirname(a.scratch), a.tmp);
  } finally { a.cleanup(); b.cleanup(); }
  assert.ok(!fs.existsSync(a.scratch));
});

test('the planner is seeded with the repository\'s current skills, not the frozen V2 copy', () => {
  const src = fs.readFileSync(new URL('./pipeline/round45.mjs', import.meta.url), 'utf8');
  assert.match(src, /path\.join\(REPO, '\.agents', 'skills'\), path\.join\(b, 'skills'\)/);
  assert.doesNotMatch(src, /'skill', 'skills'/);
});

test('only explicitly offline fixture specs authorize a deliberately stripped worktree', () => {
  const options={spec:{width:96,sheetmm:280},planDir:'/missing-fixture',variant:'region_w13_lay2',target:path.join(BENCH,'v2/targets/hills.png'),out:'/out'};
  assert.equal(resolvePlan(options).args.includes('--allowdirty'),false);
  const fixture=resolvePlan({...options,spec:{...options.spec,offlineFixture:true}});
  assert.equal(optionMap(fixture.args).get('allowdirty'),'1');
});

test('extra args allow lanemm auto/0..40 and reject invalid ranges', () => {
  assert.deepEqual(checkExtraArgs(['--lanemm', 'auto'], '/p'), []);
  assert.deepEqual(checkExtraArgs(['--lanemm', '0'], '/p'), []);
  assert.deepEqual(checkExtraArgs(['--lanemm', '40'], '/p'), []);
  assert.ok(checkExtraArgs(['--lanemm', '45'], '/p').length);
});

test('extra args refuse every delivery calibration: the engine owns delivery, not the plan', () => {
  for (const flag of ['techcal', 'techcalfrom', 'techcalmax', 'techcalmin', 'deliverycal', 'deliverycalmax']) {
    const bad = checkExtraArgs(['--' + flag, '1'], '/p');
    assert.ok(bad.some(m => m.includes('may not set --' + flag)), flag + ': ' + JSON.stringify(bad));
  }
});

test('resolvePlan resolves outlineMedium from config.drawing.medium or spec.taskStyle', () => {
  const baseOpt = { planDir: '/missing-fixture', variant: 'region_w13_lay2', target: path.join(BENCH, 'v2/targets/hills.png'), out: '/out' };
  // fallback when no config.drawing.medium: penwash -> ink, hills -> graphite
  const penwash = resolvePlan({ ...baseOpt, spec: { width: 96, sheetmm: 280, taskStyle: 'penwash' } });
  assert.equal(optionMap(penwash.args).get('outlinemedium'), 'ink');
  const yale = resolvePlan({ ...baseOpt, spec: { width: 96, sheetmm: 280, taskStyle: 'loose ink-and-watercolor field sketch, ink led' } });
  assert.equal(optionMap(yale.args).get('outlinemedium'), 'ink');
  const hills = resolvePlan({ ...baseOpt, spec: { width: 96, sheetmm: 280, taskStyle: 'loose ink and wash' } });
  assert.equal(optionMap(hills.args).get('outlinemedium'), 'graphite');

  // when config.drawing.medium is authored, it takes precedence over spec.taskStyle
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-med-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({ drawing: { medium: 'graphite' } }));
    const overPenwash = resolvePlan({ spec: { width: 96, sheetmm: 280, taskStyle: 'penwash' }, planDir: tmpDir, variant: 'region_w13_lay2', target: path.join(BENCH, 'v2/targets/hills.png'), out: '/out' });
    assert.equal(optionMap(overPenwash.args).get('outlinemedium'), 'graphite');

    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({ drawing: { medium: 'ink' } }));
    const overHills = resolvePlan({ spec: { width: 96, sheetmm: 280, taskStyle: 'loose ink and wash' }, planDir: tmpDir, variant: 'region_w13_lay2', target: path.join(BENCH, 'v2/targets/hills.png'), out: '/out' });
    assert.equal(optionMap(overHills.args).get('outlinemedium'), 'ink');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resolvePlan sets no gain and enables --drawing both when closing lines exist', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-close-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'opening-lines.json'), '[]');
    const openOnly = resolvePlan({ spec: { width: 96, sheetmm: 280 }, planDir: tmpDir, variant: 'region_w13', target: path.join(BENCH, 'v2/targets/hills.png'), out: '/out' });
    const openMap = optionMap(openOnly.args);
    assert.equal(openMap.get('drawing'), 'first');
    for (const gain of ['darkgain', 'coolgain', 'midgain']) assert.equal(openMap.has(gain), false);
    assert.equal(openMap.has('techcal'), false);

    fs.writeFileSync(path.join(tmpDir, 'closing-lines.json'), '[]');
    const withClosing = resolvePlan({ spec: { width: 96, sheetmm: 280 }, planDir: tmpDir, variant: 'region_w13', target: path.join(BENCH, 'v2/targets/hills.png'), out: '/out' });
    const closeMap = optionMap(withClosing.args);
    assert.equal(closeMap.get('drawing'), 'both');
    assert.equal(closeMap.has('darkgain'), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

