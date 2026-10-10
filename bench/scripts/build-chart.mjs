#!/usr/bin/env node
// Write docs/img/bench-chart.svg from results/results.json: one row per model, one dot per round for the mean
// indexed score with its 95% interval. Rounds with no scored paintings for a model are left out. The title and a
// legend line with the round colours sit inside the SVG, so the README needs no caption.
//   node bench/scripts/build-chart.mjs [--results bench/results/results.json] [--out docs/img/bench-chart.svg]
import fs from 'node:fs';
import path from 'node:path';
import { RESULTS, REPO, readJson } from './lib.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const resultsFile = path.resolve(opt('results', path.join(RESULTS, 'results.json')));
const outFile = path.resolve(opt('out', path.join(REPO, 'docs', 'img', 'bench-chart.svg')));

// Mid-tone colours that read on both white and GitHub's dark background.
export const TITLE = "Mean score per model and round, % of the target's own score, 95% intervals";
const NO_DOT = 'no dot = round not run';
const ROUND_COLOURS = { V1: '#5b8fd1', V2: '#e08a2e', V3: '#3fa66b', V4: '#a77bd6', V5: '#d9534f' };
const LAYOUT = { width: 800, left: 150, right: 30, top: 70, rowH: 30, axisH: 36, laneGap: 4.5, dotR: 4 };

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = v => Number(v.toFixed(1));

/** Collect each model's indexed mean and interval per round and painter version (its label), in results order. */
export function chartData(R) {
  const rounds = R.rounds.filter(r => (r.models ?? []).some(m => m.indexed?.mean != null)).map(r => r.label ?? r.id);
  const colours = Object.fromEntries(R.rounds.map(r => [r.label ?? r.id, ROUND_COLOURS[r.id] ?? '#888888']));
  const byModel = new Map();
  for (const round of R.rounds) for (const m of round.models ?? []) {
    if (m.indexed?.mean == null) continue;
    const entry = byModel.get(m.name) ?? { name: m.name, points: [] };
    byModel.set(m.name, { ...entry, points: [...entry.points, { round: round.label ?? round.id, colour: colours[round.label ?? round.id], mean: m.indexed.mean, ci95: m.indexed.ci95 ?? null }] });
  }
  const best = m => Math.max(...m.points.map(p => p.mean));
  const models = [...byModel.values()].sort((a, b) => best(b) - best(a) || a.name.localeCompare(b.name));
  return { rounds, colours, models };
}

function axisRange(models) {
  const values = models.flatMap(m => m.points.flatMap(p => [p.mean, ...(p.ci95 ?? [])]));
  const lo = Math.max(0, Math.floor(Math.min(...values) / 10) * 10);
  const hi = Math.min(100, Math.ceil(Math.max(...values) / 10) * 10);
  return [lo, hi];
}

export function renderSvg({ rounds, colours = {}, models }) {
  const { width, left, right, top, rowH, axisH, laneGap, dotR } = LAYOUT;
  const height = top + models.length * rowH + axisH;
  const [lo, hi] = axisRange(models);
  const x = v => num(left + ((v - lo) / (hi - lo)) * (width - left - right));
  const plotBottom = top + models.length * rowH;
  const lane = id => (rounds.indexOf(id) - (rounds.length - 1) / 2) * laneGap;

  const ticks = [];
  for (let t = lo; t <= hi; t += 10) ticks.push(t);
  const grid = ticks.map(t => `<line class="grid" x1="${x(t)}" y1="${top - 6}" x2="${x(t)}" y2="${plotBottom}"/>`
    + `<text class="tick" x="${x(t)}" y="${plotBottom + 16}" text-anchor="middle">${t}%</text>`);

  const rows = models.map((m, i) => {
    const cy = top + i * rowH + rowH / 2;
    const marks = m.points.map(p => {
      const y = num(cy + lane(p.round));
      const colour = p.colour ?? ROUND_COLOURS[p.round] ?? '#888888';
      const bar = p.ci95 ? `<line x1="${x(p.ci95[0])}" y1="${y}" x2="${x(p.ci95[1])}" y2="${y}" stroke="${colour}" stroke-width="1.5"/>` : '';
      return `${bar}<circle cx="${x(p.mean)}" cy="${y}" r="${dotR}" fill="${colour}"><title>${esc(m.name)} ${p.round}: ${p.mean.toFixed(1)}%</title></circle>`;
    });
    const sep = i ? `<line class="row" x1="${left}" y1="${top + i * rowH}" x2="${width - right}" y2="${top + i * rowH}"/>` : '';
    return `${sep}<text class="label" x="${left - 12}" y="${num(cy + 4)}" text-anchor="end">${esc(m.name)}</text>${marks.join('')}`;
  });

  // Legend slots are 56 px, wider for a long label such as "V4 (painter 0.1.97)".
  const slot = id => Math.max(56, 28 + Math.ceil(id.length * 7.5));
  const legend = rounds.map((id, i) => {
    const lx = left + rounds.slice(0, i).reduce((sum, r) => sum + slot(r), 0);
    return `<circle cx="${lx + dotR}" cy="44" r="${dotR}" fill="${colours[id] ?? ROUND_COLOURS[id] ?? '#888888'}"/><text class="label" x="${lx + 14}" y="48">${id}</text>`;
  });
  const noteX = left + rounds.reduce((sum, r) => sum + slot(r), 0) + 8;
  legend.push(`<text class="axis" x="${noteX}" y="48">${NO_DOT}</text>`);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="13">`,
    '<style>',
    '.title { fill: #1f2328; font-size: 14px; font-weight: 600; } .label { fill: #424a53; } .tick, .axis { fill: #6e7781; font-size: 11px; } .grid { stroke: #d0d7de; stroke-width: 1; } .row { stroke: #eaeef2; stroke-width: 1; }',
    '@media (prefers-color-scheme: dark) { .title { fill: #e6edf3; } .label { fill: #c9d1d9; } .tick, .axis { fill: #8b949e; } .grid { stroke: #30363d; } .row { stroke: #21262d; } }',
    '</style>',
    `<text class="title" x="${left}" y="20">${esc(TITLE)}</text>`,
    ...legend,
    ...grid,
    ...rows,
    `<text class="axis" x="${num((left + width - right) / 2)}" y="${height - 4}" text-anchor="middle">% of the target's own score</text>`,
    '</svg>',
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const svg = renderSvg(chartData(readJson(resultsFile)));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, svg);
  console.log(`wrote ${path.relative(REPO, outFile)}`);
}
