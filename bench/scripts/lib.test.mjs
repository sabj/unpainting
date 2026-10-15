// node --test bench/scripts/lib.test.mjs   (npm run bench:test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { TARGET_SELF_SCORE, CROP_ORDER, compositeTargets, loadCrops, BENCH, REPO, V2, loadRuns, validateRun, cheatRisk, bootstrapMean, mean, readJson, fmtCost, inPublishedScope, writeJson, ROUNDS, RUNS, groupByPainter, paintingScores } from './lib.mjs';
import { brief, prompt, command, installSkills } from './runners.mjs';
import { findingsData } from './findings-data.mjs';

const runs = loadRuns();

test('every committed run.json passes its checks', () => {
  assert.ok(runs.length > 0);
  for (const { file, run } of runs) assert.deepEqual(validateRun(run), [], file);
});

test('every run records its release, painter and sim versions and commit', () => {
  for (const { file, run } of loadRuns()) {
    assert.match(run.release, /^\d+\.\d+\.\d+/, file);
    assert.match(run.painterVersion, /^V\d{3,}$/, file);
    assert.match(run.simVersion, /^\d+$/, file);
    assert.ok('commit' in run, file);
  }
  const { run } = loadRuns()[0];
  assert.match(validateRun({ ...run, painterVersion: undefined }).join(), /painterVersion must be the painter V number/);
  assert.match(validateRun({ ...run, painterVersion: '0.1.96' }).join(), /painterVersion must be the painter V number/);
  assert.match(validateRun({ ...run, simVersion: 'v100' }).join(), /simVersion must be the sim number/);
  assert.match(validateRun({ ...run, release: 'V096' }).join(), /release must be the release semver/);
  assert.match(validateRun({ ...run, commit: 'main' }).join(), /commit must be a git sha or null/);
});

test('groupByPainter splits tries by painter and sim version, oldest first, and keeps the release as a label', () => {
  const e = (painterVersion, simVersion, release, t) => ({ run: { painterVersion, simVersion, judgeVersion: 'J1', release, try: t } });
  const groups = groupByPainter([e('V097', '100', '0.2.0', 1), e('V096', '100', '0.1.0', 1), e('V096', '101', '0.3.0', 1),
    e('V097', '100', '0.2.1', 2), e('V096', '100', '0.1.0', 2)]);
  assert.deepEqual(groups.map(g => [g.painterVersion, g.simVersion, g.releases, g.entries.map(x => x.run.try)]), [
    ['V096', '100', ['0.1.0'], [1, 2]], ['V096', '101', ['0.3.0'], [1]], ['V097', '100', ['0.2.0', '0.2.1'], [1, 2]]]);
});

test('two painter versions in one round build two results entries and never share a mean', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-painter-'));
  try {
    const runsDir = path.join(tmp, 'runs');
    for (const { file } of runs) {
      const to = path.join(runsDir, path.relative(RUNS, file));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(file, to);
    }
    // Relabel one first attempt with a newer painter and release to check version grouping.
    const v4 = loadRuns(runsDir).filter(({ run }) => run.round === 'V4' && inPublishedScope(run));
    const model = v4[0].run.painter.key;
    const mine = v4.filter(({ run }) => run.painter.key === model);
    const [newer, older] = [mine.slice(0, 1), mine.slice(1)];
    assert.ok(older.length > 0);
    for (const { file, run } of newer) writeJson(file, { ...run, painterVersion: 'V097', release: '0.2.0' });
    const out = path.join(tmp, 'results.json');
    execFileSync('node', [path.join(BENCH, 'scripts', 'build-results.mjs'), '--runs', runsDir, '--out', out], { stdio: 'ignore' });
    const R = readJson(out);
    const v4Entries = R.rounds.filter(r => r.id === 'V4');
    assert.deepEqual(v4Entries.map(r => [r.painterVersion, r.simVersion, r.releases, r.label]),
      [['V096', '100', ['0.1.0', '0.1.1'], 'V4 (painter V096 · sim 100 · judges J1)'], ['V097', '100', ['0.2.0'], 'V4 (painter V097 · sim 100 · judges J1)']]);
    assert.deepEqual(R.painter.releases, ['0.1.0', '0.1.1', '0.2.0']);
    const meanOf = es => Math.round(mean(es.flatMap(({ run }) => paintingScores(run))) * 100) / 100;
    const [oldEntry, newEntry] = v4Entries.map(r => r.models.find(m => m.model === model));
    assert.equal(newEntry.tries, newer.length);
    assert.equal(oldEntry.tries, older.length);
    assert.equal(newEntry.mean, meanOf(newer));
    assert.equal(oldEntry.mean, meanOf(older));
    assert.ok(R.rounds.filter(r => r.id !== 'V4').every(r => r.label === r.id && r.painterVersion === 'V096'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('a run with a blocked read must be disqualified', () => {
  const run = structuredClone(runs[0].run);
  run.guard.blockedImageReads = 1;
  assert.match(validateRun(run).join(), /disqualified/);
});

test('the bootstrap is seeded and brackets the mean', () => {
  const xs = [4.1, 4.9, 5.2, 5.6, 3.8, 4.4];
  const a = bootstrapMean(xs), b = bootstrapMean(xs);
  assert.deepEqual(a, b);
  assert.ok(a[0] <= mean(xs) && mean(xs) <= a[1]);
  assert.equal(bootstrapMean([5]), null);
});

test('published runs use only tries 1–3 at each model\'s configured effort', () => {
  for (const { run } of runs) assert.ok(inPublishedScope(run));
  assert.equal(runs.length, 136);
  assert.equal(runs.reduce((n, { run }) => n + Object.keys(run.crops).length, 0), 616);
});

test('V4 and V5 tries keep a plan folder per target and name no local path', () => {
  const pipelineRuns = runs.filter(({ run }) => ['V4', 'V5'].includes(run.round));
  assert.ok(pipelineRuns.length > 0);
  for (const { file, run } of pipelineRuns) {
    const dir = path.dirname(file);
    for (const c of [...Object.keys(run.crops), ...Object.keys(run.unpainted || {})]) assert.ok(fs.existsSync(path.join(dir, `${c}-plan`)), `${dir} ${c}-plan`);
    for (const f of fs.readdirSync(dir, { recursive: true })) {
      assert.doesNotMatch(f, /private-subject/i, path.join(dir, f));
      const p = path.join(dir, f);
      if (fs.statSync(p).isFile() && /\.(json|jsonl|md|txt)$/.test(f)) assert.doesNotMatch(fs.readFileSync(p, 'utf8'), /\/Users\//i, p);
    }
  }
});

test('subscription estimates match their own token split and API prices', () => {
  const prices = readJson(path.join(BENCH, 'api-prices.json')).models;
  let n = 0;
  for (const { run } of runs) {
    if (run.session.estCostUSD == null) continue;
    const rates = prices[run.painter.id];
    const expected = Object.entries(run.session.usage).reduce((sum, [key, tokens]) => sum + tokens * rates[key] / 1e6, 0);
    assert.ok(Math.abs(expected - run.session.estCostUSD) < 0.001, `${run.painter.key} ${run.round} ${run.try}`);
    assert.match(fmtCost(run.session.estCostUSD, true), /^≈\$/);
    assert.equal(run.session.costUSD, null);
    n++;
  }
  assert.equal(n, 78);
  assert.equal(fmtCost(1.25), '$1.25');
});

test('the paired-by-model V1 and V2 comparison is stable', () => {
  const v = findingsData().v1v2;
  assert.equal(v.models.length, 13);
  assert.deepEqual(v.excluded, ['DeepSeek V4.1 Flash']);
  assert.deepEqual([v.v1, v.v2, v.diff, v.ci], [4.36, 4.28, -0.08, [-0.26, 0.11]]);
  assert.match(v.method, /bootstrap over models \(10,000 resamples\)/);
});

test('judge output is attributed to listed evaluators, never to the painter', () => {
  for (const { file, run } of runs) {
    const judges = [...run.evaluators.scoreJudges, ...run.evaluators.progressionJudges];
    assert.ok(!judges.includes(run.painter.id), file);
  }
  const run = structuredClone(runs.find(e => Object.values(e.run.crops).some(c => c.progression)).run);
  const crop = Object.values(run.crops).find(c => c.progression);
  crop.progression.judgeNotes = { ...crop.progression.judgeNotes, [run.painter.id]: 'my own note' };
  assert.match(validateRun(run).join(), /not listed in evaluators\.progressionJudges/);
});

test('round comparison weights models equally, requires five scores and ignores later or lower-effort tries', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-comparison-'));
  const add = (model, round, trial, score, count = 5, effort = 'xhigh') => {
    const run = structuredClone(runs[0].run);
    Object.assign(run, { round, try: trial, complete: false });
    run.painter = { key: model, name: model, id: model, effort };
    run.crops = Object.fromEntries(Object.keys(run.crops).slice(0, count).map(key => [key, { score: { composite: score } }]));
    writeJson(path.join(tmp, round, model, `${trial}-${effort}`, 'run.json'), run);
  };
  try {
    for (const trial of [1, 2]) { add('a', 'V1', trial, 3); add('a', 'V2', trial, 5); }
    for (const trial of [1,2]) {add('b','V1',trial,5);add('b','V2',trial,5);}
    add('c', 'V1', 1, 10); add('c', 'V2', 1, 0, 1);
    add('a', 'V1', 4, 10); add('a', 'V2', 3, 0, 5, 'medium');
    const v = findingsData(tmp).v1v2;
    assert.deepEqual(v.models, ['a', 'b']);
    assert.deepEqual(v.excluded, ['c']);
    assert.deepEqual([v.v1, v.v2, v.diff], [4, 5, 1]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('cheatRisk reproduces the published V1 and V2 cheat-risk scores', () => {
  let n = 0;
  for (const { file, run } of runs) {
    if (!['V1', 'V2'].includes(run.round) || !run.cheat.risk) continue;
    const parts = Object.fromEntries(Object.entries(run.crops).map(([k, c]) => [k, { earlyMean: c.progression?.earlyMean ?? null, copyHF: c.copyHF, smallShare: c.smallShare }]));
    const r = cheatRisk(parts, run.cheat.risk.parts?.audit);
    assert.ok(Math.abs(r.risk.score - run.cheat.risk.score) < 0.011, `${file}: ${r.risk.score} vs ${run.cheat.risk.score}`);
    assert.ok(Math.abs(r.progressionRisk.score - run.cheat.progressionRisk.score) < 0.011, file);
    n++;
  }
  assert.ok(n >= 30);
});

test('the published crop brief and prompt agree with current inputs', () => {
  const all = ['hills', 'south-france', 'sargent', 'mittens', 'trumbull'];
  for (const round of ['naive', 'skill']) {
    const frozen = fs.readFileSync(path.join(V2, round, 'BRIEF.md'), 'utf8').replaceAll('TARGET_DIR', '/x/view');
    assert.equal(brief(round, all, '/x/view'), frozen);
  }
  assert.equal(prompt(all), 'Read bench/BRIEF.md in this directory and do what it says. The five target crops are attached in order: Hills, France, Ships, Mittens, Trumbull. Work without asking questions; nobody will answer.');
  const two = brief('naive', ['sargent', 'trumbull'], '/x/view');
  assert.ok(!two.includes('`hills`') && two.includes('`sargent`') && two.startsWith('# Paint two small crops'));
});

test('repo skill discovery uses one directory through a relative Claude symlink', () => {
  const skills = path.join(REPO, '.agents', 'skills');
  const claude = path.join(REPO, '.claude', 'skills');
  assert.equal(fs.readlinkSync(claude), '../.agents/skills');
  assert.equal(fs.realpathSync(claude), fs.realpathSync(skills));
  for (const name of ['painting-planner', 'watercolor-technique']) {
    assert.ok(fs.readFileSync(path.join(skills, name, 'SKILL.md'), 'utf8').startsWith('---'));
  }
});

test('trial skill discovery copies the published guides for V2 and leaves V1 without skills', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-skills-'));
  try {
    installSkills('naive', tmp);
    assert.ok(!fs.existsSync(path.join(tmp, '.agents')));
    assert.ok(!fs.existsSync(path.join(tmp, '.claude')));
    installSkills('skill', tmp);
    const source = path.join(V2, 'skill', 'skills');
    const skills = path.join(tmp, '.agents', 'skills');
    const claude = path.join(tmp, '.claude', 'skills');
    assert.equal(fs.readlinkSync(claude), '../.agents/skills');
    assert.equal(fs.realpathSync(claude), fs.realpathSync(skills));
    const files = fs.readdirSync(source, { recursive: true }).filter(f => fs.statSync(path.join(source, f)).isFile());
    for (const file of files) {
      assert.deepEqual(fs.readFileSync(path.join(skills, file)), fs.readFileSync(path.join(source, file)), file);
      assert.deepEqual(fs.readFileSync(path.join(claude, file)), fs.readFileSync(path.join(source, file)), file);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('results.json, the leaderboard, the findings and the chart regenerate unchanged from runs/', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-test-'));
  try {
    const out = path.join(tmp, 'results.json');
    execFileSync('node', [path.join(BENCH, 'scripts', 'build-results.mjs'), '--out', out], { stdio: 'ignore' });
    assert.deepEqual(readJson(out), readJson(path.join(BENCH, 'results', 'results.json')));
    execFileSync('node', [path.join(BENCH, 'scripts', 'build-leaderboard.mjs'), '--results', out], { stdio: 'ignore' });
    for (const f of ['leaderboard.md', 'gallery.md']) assert.equal(fs.readFileSync(path.join(tmp, f), 'utf8'), fs.readFileSync(path.join(BENCH, 'results', f), 'utf8'), f);
    execFileSync('node', [path.join(BENCH, 'scripts', 'build-findings.mjs'), '--out', path.join(tmp, 'FINDINGS.md')], { stdio: 'ignore' });
    assert.equal(fs.readFileSync(path.join(tmp, 'FINDINGS.md'), 'utf8'), fs.readFileSync(path.join(BENCH, 'results', 'FINDINGS.md'), 'utf8'));
    execFileSync('node', [path.join(BENCH, 'scripts', 'build-chart.mjs'), '--results', out, '--out', path.join(tmp, 'bench-chart.svg')], { stdio: 'ignore' });
    assert.equal(fs.readFileSync(path.join(tmp, 'bench-chart.svg'), 'utf8'), fs.readFileSync(path.join(REPO, 'docs', 'img', 'bench-chart.svg'), 'utf8'), 'bench-chart.svg');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('every image the gallery links to exists and is under 60 KB', () => {
  const g = fs.readFileSync(path.join(BENCH, 'results', 'gallery.md'), 'utf8');
  const srcs = [...g.matchAll(/src="([^"]+)"/g),...g.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => path.resolve(BENCH, 'results', m[1]));
  assert.ok(srcs.length > 50);
  for (const f of srcs) assert.ok(fs.existsSync(f) && fs.statSync(f).size < 60_000, f);
});

test('the Together runner can read targets while a model-authored script cannot', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'together-guard-'));
  try {
    const viewDir = path.join(tmp, 'view');
    fs.mkdirSync(viewDir);
    const png = path.join(viewDir, 'hills.png');
    fs.writeFileSync(png, 'x');
    const guardDir = path.join(V2, 'kit', 'py');
    // The environment run.mjs builds for every child, then the runner overrides on top.
    const base = { ...process.env, PYTHONPATH: guardDir, BENCH_PYGUARD: guardDir, BENCH_VIOLATIONS: path.join(tmp, 'v.jsonl') };
    const c = command({ runner: 'together', id: 'm' }, { ws: tmp, viewDir, raw: tmp, crops: ['hills'], text: '', sessionCapMin: 10 });
    const runnerEnv = { ...base, ...c.env };
    const read = `import pathlib; print(len(pathlib.Path(r"${png}").read_bytes())); print(len(open(r"${png}", "rb").read()))`;
    // The runner process reads the target to attach it to the prompt.
    assert.equal(execFileSync('python3', ['-c', read], { env: runnerEnv }).toString().trim(), '1\n1');
    // A model-authored script runs with PYTHONPATH=BENCH_PYGUARD (oss_loop.py's bash tool) and is blocked.
    const modelEnv = { ...runnerEnv, PYTHONPATH: runnerEnv.BENCH_PYGUARD };
    assert.throws(() => execFileSync('python3', ['-c', `open(r"${png}", "rb")`], { env: modelEnv, stdio: 'pipe' }), /reading image files is not allowed/);
    assert.ok(fs.existsSync(path.join(tmp, 'v.jsonl')));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('judge versions validate and never share a result group', () => {
  const run = runs[0].run;
  for (const judgeVersion of [undefined, 'J0', 'Jx', 1])
    assert.match(validateRun({ ...run, judgeVersion }).join(), /judgeVersion must/);
  const groups = groupByPainter(['J2', 'J1', 'J1'].map(judgeVersion => ({ run: { ...run, judgeVersion } })));
  assert.deepEqual(groups.map(g => [g.judgeVersion, g.entries.length]), [['J1', 2], ['J2', 1]]);
});

test('Mittens is public with the native self-score, and the CPU Ships rerender is scored', () => {
  assert.equal(TARGET_SELF_SCORE.mittens, 8.76);
  assert.ok(loadCrops().find(c => c.task === 'mittens').distributed);
  assert.equal(runs.filter(({ run }) => run.crops.mittens).length, 109);
  // 0.1.0 painted V3 on three targets; from 0.1.1 V3 paints them all, and its composite still averages the three
  assert.equal(runs.filter(({ run }) => run.round === 'V3' && run.release === '0.1.0' && run.crops.mittens).length, 0);
  const ships = runs.find(({ run }) => run.round === 'V5' && run.painter.key === 'sonnet' && run.try === 2).run.crops.sargent;
  assert.equal(ships.score.composite, 5.93);
  assert.equal(ships.pipeline.renderBackend, 'cpu');
  assert.equal(ships.painterNote, 'rendered on CPU after the run');
});

test('V3 composites average its three published targets; other rounds their own', () => {
  assert.deepEqual(compositeTargets({ round: 'V3', settings: { crops: CROP_ORDER } }), ['hills', 'south-france', 'sargent']);
  assert.deepEqual(compositeTargets({ round: 'V1', settings: { crops: CROP_ORDER } }), CROP_ORDER);
});
