// node --test bench/scripts/fairness.test.mjs   (npm run bench:test)
// Every scored painting in bench/runs must have been scored the same way as the others in its round: at the
// target's own size, by the J1 judges with the J1 rubric, through the same judge route. A difference passes only
// when bench/scoring-exceptions.json lists it with Sam's approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { BENCH, V2, PIPELINE_ROUNDS, loadRuns, readJson } from './lib.mjs';

const J1_JUDGES = ['Qwen/Qwen3.5-9B', 'moonshotai/Kimi-K3', 'zai-org/GLM-5.3-Flash'];
const RUBRIC = 'bench-v3-median5, 5 calls per judge model, median per model';
const EXCEPTIONS = path.join(BENCH, 'scoring-exceptions.json');
const exceptions = fs.existsSync(EXCEPTIONS) ? readJson(EXCEPTIONS).exceptions : [];

/** The judge route: judgeRoute when the scorer recorded it; before that, OpenRouter scores listed judgeProviders and Together ones did not. */
const routeOf = s => s.judgeRoute ?? (s.judgeProviders && Object.keys(s.judgeProviders).length ? 'openrouter' : 'together');
const approved = (rule, round, model) => exceptions.some(e => e.rule === rule && e.approvedBy === 'Sam'
  && (e.rounds ?? [round]).includes(round) && (e.models ?? [model]).includes(model));

async function scored() {
  const sizes = {};
  for (const f of fs.readdirSync(path.join(V2, 'targets')).filter(f => /^[a-z-]+\.png$/.test(f))) {
    const m = await sharp(path.join(V2, 'targets', f)).metadata(); sizes[f.replace('.png', '')] = [m.width, m.height];
  }
  const out = [];
  for (const { run } of loadRuns()) for (const [crop, e] of Object.entries(run.crops || {})) {
    if (e.score?.composite == null) continue;
    out.push({ round: run.round, model: run.painter.key, try: run.try, crop, score: e.score, sheet: e.sheet, judgeVersion: run.judgeVersion, size: sizes[crop] });
  }
  return out;
}
const fmt = list => [...new Set(list.map(p => `${p.round} ${p.model}`))].join(', ');

test('V4/V5 paintings were scored at the target size, as the published tries were', async () => {
  const bad = (await scored()).filter(p => PIPELINE_ROUNDS.has(p.round) && !approved('native-size', p.round, p.model)
    && !(p.score.protocol === 'native' && p.score.scoreInput?.w === p.size[0] && p.score.scoreInput?.h === p.size[1]));
  assert.equal(bad.length, 0, `scored at the painter's size, not the target's (rescore with score.mjs): ${fmt(bad)}`);
});

test('V1-V3 paintings were painted, and so scored, at the target size', async () => {
  const bad = (await scored()).filter(p => !PIPELINE_ROUNDS.has(p.round) && p.sheet?.W != null
    && (p.sheet.W !== p.size[0] || p.sheet.H !== p.size[1]) && !approved('native-size', p.round, p.model));
  assert.equal(bad.length, 0, `toolkit paintings not at the target size: ${fmt(bad)}`);
});

test('every painting was judged by the J1 judges with the J1 rubric', async () => {
  const bad = (await scored()).filter(p => !approved('judges', p.round, p.model) && (p.judgeVersion !== 'J1'
    || JSON.stringify(Object.keys(p.score.judgeScores || {}).sort()) !== JSON.stringify(J1_JUDGES)
    || (p.score.rubric && !RUBRIC.startsWith(p.score.rubric))));
  assert.equal(bad.length, 0, `judged differently: ${fmt(bad)}`);
});

test('within a round every model went through the same judge route', async () => {
  const all = await scored(), bad = [];
  for (const round of new Set(all.map(p => p.round))) {
    const inRound = all.filter(p => p.round === round), routes = new Set(inRound.map(p => routeOf(p.score)));
    if (routes.size < 2) continue;
    const counts = {}; for (const p of inRound) counts[routeOf(p.score)] = (counts[routeOf(p.score)] || 0) + 1;
    const usual = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    bad.push(...inRound.filter(p => routeOf(p.score) !== usual && !approved('judge-route', p.round, p.model)));
  }
  assert.equal(bad.length, 0, `judged through a different route than the rest of the round: ${fmt(bad)}`);
});
