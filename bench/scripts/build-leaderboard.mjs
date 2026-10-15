#!/usr/bin/env node
// Write results/leaderboard.md and results/gallery.md from results/results.json.
//   node bench/scripts/build-leaderboard.mjs [--results bench/results/results.json]
import fs from 'node:fs';
import path from 'node:path';
import { RESULTS, readJson, fmtTokens, fmtCost, fmtInt, COST_NOTE } from './lib.mjs';
import { placeholder } from './images.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const file = path.resolve(opt('results', path.join(RESULTS, 'results.json')));
const outDir = path.dirname(file);
const R = readJson(file);
const crops = Object.fromEntries(R.crops.map(c => [c.key, c]));
const short = key => crops[key]?.name.replace(/\s*\(.*\)$/, '') ?? key;
const list = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const write = (name, lines) => fs.writeFileSync(path.join(outDir, name), lines.join('\n').replace(/\n+$/, '\n'));

// What made these results. A newer painter or sim is benchmarked by rerunning V4 or V5 with it (docs/versions.md).
const PAINTER_LINE = `${R.painter.note} Each result is labelled with its round, painter version, sim version and release. `
  + `To benchmark a newer painter or sim, rerun V4 or V5 with it. To reproduce a result, check out its release tag (${list(R.painter.tags)}).`;
/** Format the painter, simulator and release versions for a result group. */
const versionsLine = r => `Painter ${r.painterVersion} · sim ${r.simVersion} · judges ${r.judgeVersion} · release ${list(r.releases)}.`;
const published = R.rounds.filter(r => r.status === 'published');
const running = R.rounds.filter(r => r.status === 'running');
const runningLines = running.map(r => `- ${r.id} (${r.harness.toLowerCase()}${r.learnsBetweenTries ? ', feedback from earlier attempts' : ''}) is running.`);

const half = ci => ((ci[1] - ci[0]) / 2).toFixed(2);
const scoreCell = (mean, ci) => (mean == null ? '–' : ci ? `${mean.toFixed(2)} ± ${half(ci)}` : `${mean.toFixed(2)}`);
const halfPct = ci => ((ci[1] - ci[0]) / 2).toFixed(1);
/** Indexed score: percent of the target's self-score, one decimal, ± the half-width of its interval. */
const indexedCell = ix => (ix?.mean == null ? '–' : ix.ci95 ? `${ix.mean.toFixed(1)}% ± ${halfPct(ix.ci95)}` : `${ix.mean.toFixed(1)}%`);
const pct = v => `${Math.round(v)}%`;
const effort = e => (e === 'n/a' ? 'none' : e);
const cost = p => fmtCost(p.costUSD ?? p.estCostUSD, p.costUSD == null && p.estCostUSD != null);

/**
 * An HTML table with fixed column widths. GitHub strips CSS but keeps width and align attributes, so every table
 * built from the same column list lines up with the others down the page.
 */
const cell = (tag, col, body) => `<${tag} width="${col.w}"${col.align ? ` align="${col.align}"` : ''}>${body}</${tag}>`;
const htmlTable = (cols, rows) => ['<table>', `<tr>${cols.map(c => cell('th', c, c.label)).join('')}</tr>`,
  ...rows.map(r => `<tr>${r.map((v, i) => cell('td', cols[i], v)).join('')}</tr>`), '</table>'].join('\n');

const ROUND_COLS = [
  { label: '#', w: 16, align: 'right' }, { label: 'Model', w: 90 }, { label: 'Effort', w: 50 },
  { label: 'Score (% of target)', w: 90, align: 'right' }, { label: 'Raw score /10', w: 80, align: 'right' }, { label: 'Best trial', w: 60, align: 'right' }, { label: 'Trials', w: 44, align: 'right' },
  { label: 'Strokes', w: 60, align: 'right' }, { label: 'Minutes', w: 62, align: 'right' }, { label: 'Tokens', w: 54, align: 'right' },
  { label: 'Cost', w: 66, align: 'right' },
];

function roundTable(round) {
  return htmlTable(ROUND_COLS, round.models.map((m, i) => [i + 1, m.name, effort(m.effort), indexedCell(m.indexed), scoreCell(m.mean, m.ci95),
    m.best ? `${m.best.indexed.toFixed(1)}% (${m.best.try})` : '–', m.tries, fmtInt(m.perTry.strokes),
    m.perTry.minutes == null ? '–' : Math.round(m.perTry.minutes), fmtTokens(m.perTry.tokens), cost(m.perTry)]));
}

const lb = ['# Leaderboard', '',
  'Generated from [results.json](results.json) by `scripts/build-leaderboard.mjs`.', '',
  PAINTER_LINE, '',
  'A round is a benchmark version (V1 to V5). A trial is one model session that paints the requested targets. '
  + 'Score is the mean over every scored painting in trials 1 to 3 of its automated score as a percentage of the target scored against itself (the realistic ceiling: '
  + `${list(R.crops.filter(c => c.selfScore != null).map(c => `${short(c.key)} ${c.selfScore.toFixed(2)}`))}), ± the half-width of its 95% confidence interval, estimated by resampling paintings. `
  + 'Raw score is the same mean out of 10. Models are ranked by Score. '
  + 'Best trial gives the indexed score and trial number. Strokes, minutes, tokens and cost are medians per trial. '
  + 'Every trial the cheat-risk score flagged was reviewed by hand, and none of them cheated. One trial was disqualified for a blocked target read ([findings](FINDINGS.md#target-reads-and-cheat-risk)). '
  + `${R.scoring.advisory} Method: [scoring](../docs/scoring.md) and [statistics](../docs/statistics.md).`, '',
  COST_NOTE, ''];
for (const round of published) {
  lb.push(`## ${round.label}: ${round.title}`, '');
  lb.push(`${versionsLine(round)} ${round.explained} Targets: ${list(round.crops.map(short))}.`, '');
  lb.push(roundTable(round), '');
  const fewer = round.models.filter(m => m.fewerTriesReason);
  if (fewer.length) lb.push(`Fewer than ${round.plannedTries} trials: ${list(fewer.map(m => `${m.name} (${m.tries}, ${m.fewerTriesReason})`))}.`, '');
}
if (running.length) lb.push('## Running', '', ...runningLines, '');
write('leaderboard.md', lb);

const up = p => `../${p}`;
const GALLERY_COLS = [
  { label: 'Finished', w: 150 }, { label: 'Model', w: 110 }, { label: 'Score: % of target, /10 (trial)', w: 100, align: 'right' },
  { label: 'Saved stages (10, 25, 50, 75% of strokes)', w: 520 },
];
const [FIN_W, , , STAGES_W] = GALLERY_COLS.map(c => c.w);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const tiles = new Set();
/** A shared [x] tile for one reason, written once to img/missing-<reason>.webp. */
function tile(reason, alt) {
  tiles.add(reason);
  return `<img src="img/missing-${slug(reason)}.webp" width="${FIN_W}" alt="${alt}: ${reason}">`;
}
const g = ['# Gallery', '',
  'Generated from [results.json](results.json) by `scripts/build-leaderboard.mjs`.', '',
  PAINTER_LINE, '',
  'Each row is one model\'s highest-scoring painting of the target in trials 1 to 3. A trial is one model session; V1 to V5 are benchmark versions. '
  + 'The row of images beside it shows the painting at 10, 25, 50 and 75% of its strokes. These stages are faded to make the finished painting easier to see. '
  + 'A grey [x] tile marks a target with no scored painting from that model, with the reason from its run records. '
  + 'The first row of each table is the target scored against itself, the realistic ceiling that paintings are indexed to.', ''];
for (const round of published) {
  g.push(`## ${round.label}: ${round.title}`, '', versionsLine(round), '');
  for (const c of round.crops) {
    const rows = round.models.map(m => ({ m, best: m.perCrop[c]?.best })).filter(x => x.best)
      .sort((a, b) => b.best.score - a.best.score || a.m.model.localeCompare(b.m.model));
    const missing = round.models.filter(m => m.missing?.[c]).sort((a, b) => a.model.localeCompare(b.model));
    if (!rows.length) continue;
    const alt = m => `${m.name}, ${short(c)}`;
    const self = crops[c]?.selfScore;
    g.push(`### ${short(c)}`, '', htmlTable(GALLERY_COLS, [
      [crops[c]?.distributed ? `<img src="../crops/img/${c}.webp" width="${FIN_W}" alt="${short(c)} target">` : '–', 'Target (scored against itself)',
        self == null ? '–' : `100% · ${self.toFixed(2)}`, ''],
      ...rows.map(({ m, best }) => [
        `<img src="${up(best.image)}" width="${FIN_W}" alt="${alt(m)}, finished">`, m.name,
        `<a href="${up(best.image.replace(/[^/]+$/, 'run.json'))}">${best.indexed == null ? '' : `${pct(best.indexed)} · `}${best.score.toFixed(2)} (${best.try})</a>`,
        best.stages ? `<img src="${up(best.stages)}" width="${STAGES_W}" alt="${alt(m)}, at 10, 25, 50 and 75% of its strokes">` : tile('no stages recorded', alt(m))]),
      ...missing.map(m => [tile(m.missing[c], alt(m)), m.name, '–', '']),
    ]), '');
  }
}
if (running.length) g.push('## Running', '', ...runningLines, '');
write('gallery.md', g);
for (const reason of tiles) await placeholder(reason, path.join(outDir, 'img', `missing-${slug(reason)}.webp`));
console.log(`wrote ${path.join(path.relative(process.cwd(), outDir), 'leaderboard.md')} and gallery.md`);
