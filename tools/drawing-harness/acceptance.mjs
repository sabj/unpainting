// The drawing harness on the GPU: the same matrix and checks as harness.test.mjs (the CPU gate in `npm test`), every
// painting on the GPU, one at a time, after any other GPU painting on this machine has finished (it waits; it never
// shares the GPU). A release gate: it exits 1 when a cell fails, and writes the table cell by cell.
//
//   node tools/drawing-harness/acceptance.mjs --out DIR [--md FILE]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runHarness, resultsMarkdown } from './harness.mjs';

const at = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
if (!at('--out')) { console.error('usage: node tools/drawing-harness/acceptance.mjs --out DIR [--md FILE]'); process.exit(2); }
const dir = path.resolve(at('--out'));
if (fs.existsSync(dir) && fs.readdirSync(dir).length) { console.error(`acceptance: ${dir} is not empty; give a new folder`); process.exit(2); }

/** Other painters on the GPU now (their pids and a few words of their command). */
function gpuPainters() {
  const ps = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  return ps.split('\n').filter(l => /paint-plate\.mjs/.test(l) && /--gpu (on|auto)/.test(l) && !l.includes(dir)).map(l => l.trim().slice(0, 120));
}
for (let waited = 0; ; waited++) {
  const busy = gpuPainters();
  if (!busy.length) break;
  if (waited % 10 === 0) console.log(`acceptance: waiting for the GPU (${busy.length} painting${busy.length > 1 ? 's' : ''} on it: ${busy[0]})`);
  await new Promise(r => setTimeout(r, 30000));
}
fs.mkdirSync(dir, { recursive: true });
const { results, extra } = await runHarness(dir, { gpu: true, jobs: 1 });
const commit = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim();
fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ commit, gpu: true, cells: results.map(({ cell, status, checks, why }) => ({ cell: cell.id, status, why, checks })), extra }, null, 1));
const md = resultsMarkdown(results, { extra, title: 'Drawing harness on the GPU', commit });
if (at('--md')) fs.writeFileSync(at('--md'), md);
process.stdout.write(md);
process.exitCode = results.some(r => r.status === 'fail') || extra.some(e => e.status === 'fail') ? 1 : 0;
