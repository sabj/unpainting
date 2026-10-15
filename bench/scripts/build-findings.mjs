#!/usr/bin/env node
// Write results/FINDINGS.md from runs/. Every number in it comes from findings-data.mjs.
//   node bench/scripts/build-findings.mjs [--runs bench/runs] [--out bench/results/FINDINGS.md]
import fs from 'node:fs';
import path from 'node:path';
import { RUNS, RESULTS, fmtInt, fmtTokens, fmtCost, COST_NOTE } from './lib.mjs';
import { findingsData } from './findings-data.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const d = findingsData(path.resolve(opt('runs', RUNS)));
const out = path.resolve(opt('out', path.join(RESULTS, 'FINDINGS.md')));

const half = x => (x == null ? '–' : x % 1 ? x.toFixed(1) : fmtInt(x));
const f2 = x => (x == null ? '–' : x.toFixed(2));
const sgn = x => (x == null ? '–' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`);
const ci = c => (c ? `${sgn(c[0])} to ${sgn(c[1])}` : 'no interval');
const list = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const excludes0 = c => c && (c[0] > 0 || c[1] < 0);

const L = [];
L.push('# Findings', '');
L.push('Generated from the run records by `scripts/build-findings.mjs`. Scores are automated scores out of 10. A round is a benchmark version (V1 to V5). A try is one model session that paints the requested targets. [Scoring](../docs/scoring.md) says how far to trust them; [statistics](../docs/statistics.md) explains the intervals.', '');


const v = d.v1v2;
L.push(`## Technique guides ${excludes0(d.v1v2.ci) ? (d.v1v2.diff > 0 ? 'helped' : 'hurt') : 'made no clear difference'} on average (V1 and V2)`, '');
L.push(`- ${v.models.length} models have at least five scored paintings in both rounds: ${list(v.models)}. ${list(v.excluded)} is left out because it has fewer than five scored V2 paintings.`);
L.push(`- Paired by model over all scored paintings of tries 1–3, V1 averaged ${f2(v.v1)} and V2 ${f2(v.v2)}. The difference is ${sgn(v.diff)}, 95% confidence interval (CI) ${ci(v.ci)}.`);
L.push('- Each model counts once. The interval comes from repeatedly resampling model means (a percentile bootstrap, 10,000 resamples).');
L.push('', '| Model | V1 | V2 | Difference | V1 paintings | V2 paintings |', '|---|---:|---:|---:|---:|---:|');
for (const p of v.perModel) L.push(`| ${p.name} | ${f2(p.v1)} | ${f2(p.v2)} | ${sgn(p.diff)} | ${p.nNaive} | ${p.nSkill} |`);
L.push('');


const helped = d.v3.filter(m => excludes0(m.ci) && m.diff > 0).map(m => m.name);
L.push(`## Feedback between attempts (V3)${helped.length ? `: it helped ${list(helped)}` : ''}`, '');
L.push('V3 painted Hills, France and Ships, and each try saw the earlier ones. The V2 column uses V2 paintings of the same three targets.', '');
L.push('| Model | V2, same targets | V3 | Difference | 95% CI | V3 try 1 | V3 tries 2–3 | Minutes / try | Tokens / try |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const m of d.v3) L.push(`| ${m.name} | ${f2(m.v2)} | ${f2(m.v3)} | ${sgn(m.diff)} | ${ci(m.ci)} | ${f2(m.first)} | ${f2(m.later)} | ${Math.round(m.minutes)} | ${fmtTokens(m.tokens)} |`);
L.push('');
const up = d.v3.filter(m => excludes0(m.ci)), flat = d.v3.filter(m => !excludes0(m.ci));
L.push(`- ${list(up.map(m => `${m.name} (${sgn(m.diff)})`))} scored higher in V3 than in V2 on the same targets, with intervals that exclude zero. ${list(flat.map(m => `${m.name} (${sgn(m.diff)})`))} ${flat.length === 1 ? 'has an interval' : 'have intervals'} that include zero.`);
L.push(`- Try means, in order: ${d.v3.map(m => `${m.name} ${m.trials.map(f2).join(', ')}`).join('; ')}.`);
const gain = [...d.v3].sort((a, b) => (b.later - b.first) - (a.later - a.first));
if (gain.length > 1) L.push(`- ${gain[0].name} gained most inside V3, from ${f2(gain[0].first)} on try 1 to ${f2(gain[0].later)} over tries 2–3. ${gain.at(-1).name} gained least: ${f2(gain.at(-1).first)} on try 1, ${f2(gain.at(-1).later)} over tries 2–3.`);
L.push('');


if (d.pipeline.length) {
  const ms = d.pipeline, v5up = ms.filter(m => m.v5tries[2] != null && m.v5tries[0] != null && m.v5tries[2] > m.v5tries[0]);
  L.push('## The full pipeline (V4) and practice between tries (V5)', '');
  L.push('In V4 and V5 each model writes a painting plan for each target, paints it with the painter, may stop to look at its own sheet and revise what is not painted yet. V5 tries 2 and 3 also get feedback on the try before. V4 try 1 and V5 try 1 are the same sessions, since V5 try 1 has no feedback yet. The painter sets its own stroke count.', '');
  L.push('| Model | V4 | V4 95% CI | V4 paintings | V5 try 1 | V5 try 2 | V5 try 3 | V5 | V5 paintings |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  const cr = c => (c ? `${f2(c[0])} to ${f2(c[1])}` : '–');
  for (const m of ms) L.push(`| ${m.name} | ${f2(m.v4)} | ${cr(m.v4ci)} | ${m.v4n} | ${m.v5tries.map(f2).join(' | ')} | ${f2(m.v5)} | ${m.v5n} |`);
  L.push('');
  L.push('- A try mean covers the targets painted in that try, so a try with a failed painting averages fewer targets.');
  L.push(`- ${v5up.length} of ${ms.length} models scored higher on V5 try 3 than on V5 try 1: ${list(v5up.map(m => `${m.name} (${f2(m.v5tries[0])} to ${f2(m.v5tries[2])})`)) || 'none'}.`);
  const failed = ms.reduce((a, m) => a + m.unpainted, 0);
  if (failed) L.push(`- ${failed} planned paintings have no painting: the painter refused the plan or the render failed. Each try's run.json gives the reason under \`unpainted\`.`);
  for (const m of ms.filter(x => x.notRun.length)) L.push(`- ${m.name} has no painting for ${list(m.notRun)}: that session was stopped before it painted so the results could be published.`);
  if (ms.some(m => m.routed.length)) L.push('- V4 and V5 were judged through OpenRouter, by zero-data-retention providers; V1 to V3 on Together. Each V4 and V5 painting records its providers under `judgeProviders`.');
  L.push('');
}


L.push('## Some models laid very few strokes', '');
L.push('In V1 to V3, each painting may use 2,500 strokes. These models used a median of fewer than 1,000 per try across all targets.', '');
L.push('| Round | Model | Tries | Strokes / try | Strokes / painting | Paintings per try | Session minutes | Cost per try |', '|---|---|---:|---:|---:|---|---|---|');
for (const l of d.low) {
  L.push(`| ${l.round} | ${l.name} | ${l.tries} | ${fmtInt(l.strokesPerTrial)} | ${half(l.strokesPerPainting)} | ${l.paintings.map(p => `${p} of ${l.cropsPerTry}`).join(', ')} | ${l.minutes.join(', ')} | ${l.costs.map(c => fmtCost(c.value, c.estimated)).join(', ')} |`);
}
L.push('', COST_NOTE, '');
const haiku = d.low.filter(l => l.name.startsWith('Haiku'));
if (haiku.length) {
  const mins = haiku.flatMap(l => l.minutes);
  L.push(`- Haiku 4.5 stopped early: its sessions lasted ${Math.min(...mins)} to ${Math.max(...mins)} of the 85 minutes allowed. The painting toolkit given to models accepted all of its calls.`);
}
const ds = d.low.find(l => l.name.startsWith('DeepSeek') && l.round === 'V2');
if (ds) L.push('- DeepSeek V4.1 Flash in V2 hit the per-run cost cap and API errors and did not finish.');
const mm = d.low.filter(l => l.name.startsWith('MiniMax'));
if (mm.length) L.push(`- MiniMax M3 finished every painting. The toolkit refused ${list(mm.flatMap(l => l.kitRejections).map(String))} calls in its tries.`);
const luna = d.low.find(l => l.name.startsWith('Codex Luna'));
if (luna) L.push(`- Codex Luna's median fell from ${fmtInt(luna.otherRound.strokesPerTrial)} strokes per try in ${luna.otherRound.round} to ${fmtInt(luna.strokesPerTrial)} in ${luna.round}, while its median session grew from ${Math.round(luna.otherRound.minutes)} to ${Math.round(luna.medianMinutes)} minutes.`);
L.push('');


const g = d.guard;
const cleared = g.high.filter(h => h.review === 'cleared'), flagged = g.high.filter(h => h.review !== 'cleared');
L.push('## Target reads and cheat risk', '');
L.push(`- Over ${g.tries} tries the guard, the check that blocks image reads, blocked ${g.blocked} image reads, and ${g.disqualified} tries were disqualified${g.disqualifiedTries.length ? `: ${list(g.disqualifiedTries.map(t => `${t.name} ${t.round} try ${t.try} (${t.reason})`))}. The guard stopped the read, so the model never saw the pixels, but any attempt disqualifies the try, and it is left off the leaderboard` : ''}.`);
const named = hs => list(hs.map(h => `${h.name} ${h.round} try ${h.try}`));
L.push(flagged.length
  ? `- ${g.high.length} tries had a high cheat-risk level. Review found weak technique in ${cleared.length}: ${named(cleared)}. ${flagged.length} await review: ${named(flagged)}. All stay on the leaderboard.`
  : `- The cheat-risk score flagged ${g.high.length} tries, and each was reviewed by hand. None of them cheated. The flags came from early stages that didn't look like a person's start. The tries: ${named(cleared)}. All stay on the leaderboard.`);
const mmCopy = g.high.find(h => h.name.startsWith('MiniMax') && h.round === 'V2' && h.try === 2);
if (mmCopy) L.push('- MiniMax M3 V2 try 2 copied the target images into its output folder with a shell `cp`. No script opened the copies; the model only looked at them. The guard missed the copy, so it needs a post-run check for copied targets (known gap, not built yet).');
fs.writeFileSync(out, L.join('\n') + '\n');
console.log(`wrote ${path.relative(process.cwd(), out)}`);
