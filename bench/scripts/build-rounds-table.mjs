#!/usr/bin/env node
// Rebuild only the marked Rounds table in bench/README.md, using published J1 scores.
import fs from 'node:fs';
import path from 'node:path';
import { BENCH, PUBLIC_CROPS, ROUNDS, readJson } from './lib.mjs';

const START = '<!-- rounds-table:start -->', END = '<!-- rounds-table:end -->';
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('|', '&#124;');
export function roundWinner(results, id) {
  const publicKeys = results.crops.filter(c => c.distributed && PUBLIC_CROPS.includes(c.key)).map(c => c.key);
  return results.rounds.filter(r => r.id === id && r.judgeVersion === 'J1').flatMap(r =>
    r.models.flatMap(m => publicKeys.flatMap(c => {
      const b = m.perCrop[c]?.best;
      return b?.image && Number.isFinite(b.indexed) ? [{ ...b, model: m.name, crop: c }] : [];
    }))).sort((a, b) => b.indexed - a.indexed || a.model.localeCompare(b.model) || a.crop.localeCompare(b.crop))[0];
}
export function roundsTable(results) {
  const descriptions = ['A painting toolkit and the targets', 'V1 plus the technique guides', 'V2 plus its own earlier tries', 'The full painting pipeline', 'The full pipeline plus its own earlier tries'];
  return [START, '| Round | What the model gets | Learns between tries | Winning painting (J1) |', '|---|---|---|---|', ...ROUNDS.map((r, i) => {
    const p = roundWinner(results, r.id);
    const thumb = p ? `<a href="results/gallery.md"><img src="${esc(p.image)}" width="96" alt="${esc(`${p.model}, ${p.crop}, ${p.indexed}% of target`)}"></a>` : 'Pending';
    return `| ${r.id} | ${descriptions[i]} | ${r.learning ? 'Yes' : 'No'} | ${thumb} |`;
  }), END].join('\n');
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = path.join(BENCH, 'README.md');
  const source = fs.readFileSync(file, 'utf8');
  const from = source.indexOf(START), to = source.indexOf(END);
  if (from < 0 || to < from) throw Error('Missing rounds-table markers');
  fs.writeFileSync(file, source.slice(0, from) + roundsTable(readJson(path.join(BENCH, 'results/results.json'))) + source.slice(to + END.length));
}
