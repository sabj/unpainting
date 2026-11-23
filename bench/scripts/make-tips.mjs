#!/usr/bin/env node
// node bench/scripts/make-tips.mjs [N ...]   Paints the worked examples of bench/v3/TIPS.md (bench/v3/tips/N-name.mjs)
// with the kit, on the GPU, each on a blank sheet of its own (320 x 200 cells, 83 x 52 mm), and writes each dried
// result beside its script as N-name.png. The sheet is blank paper: no benchmark subject, and no target at all.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BENCH, V2 } from './lib.mjs';

const REPO = path.resolve(BENCH, '..'), TIPS = path.join(BENCH, 'v3', 'tips'), only = process.argv.slice(2);
const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'tips-')), wb = path.join(ws, 'ws', 'bench'); fs.mkdirSync(path.join(wb, 'tasks'), { recursive: true });
try {
  fs.symlinkSync(path.join(REPO, 'src'), path.join(ws, 'ws', 'src')); fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(ws, 'ws', 'node_modules')); fs.copyFileSync(path.join(REPO, 'package.json'), path.join(ws, 'ws', 'package.json'));
  for (const f of ['kit.mjs', 'guard.mjs']) fs.copyFileSync(path.join(V2, 'kit', f), path.join(wb, f));
  // the blank sheet's "coarse map": every cell paper; the kit only takes the sheet's size from it
  const cols = 24, rows = 15;
  fs.writeFileSync(path.join(wb, 'tasks', 'tips-coarse.json'), JSON.stringify({ task: 'tips', w: 320, h: 200, cols, rows, cellPx: 320 / cols, palette: Array.from({ length: 8 }, () => [240, 237, 228]), cells: Array(cols * rows).fill(0), value: Array(cols * rows).fill(0.95) }));
  for (const f of fs.readdirSync(TIPS).filter(f => /^\d+-.*\.mjs$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b))) {
    if (only.length && !only.includes(String(parseInt(f)))) continue;
    fs.copyFileSync(path.join(TIPS, f), path.join(wb, f));
    const t = Date.now(); execFileSync(process.execPath, [f], { cwd: wb, env: { ...process.env, BENCH_NO_FILM: '1' }, stdio: ['ignore', 'ignore', 'inherit'] });
    const stats = JSON.parse(fs.readFileSync(path.join(wb, 'out', 'tips', 'stats.json'), 'utf8'));
    if (stats.backend !== 'gpu') throw new Error(`${f}: painted on ${stats.backend}, not the GPU`);
    fs.copyFileSync(path.join(wb, 'out', 'tips', 'final.png'), path.join(TIPS, f.replace(/\.mjs$/, '.png')));
    // the stroke paths as arrows over the result, from the kit's own stroke log (bench/v3/tips/arrows.py)
    execFileSync(process.env.BENCH_SCORE_PYTHON || 'python3', [path.join(TIPS, 'arrows.py'), path.join(wb, 'out', 'tips', 'strokes.jsonl.gz'), path.join(TIPS, f.replace(/\.mjs$/, '.png')), path.join(TIPS, f.replace(/\.mjs$/, '-arrows.png'))], { stdio: 'inherit' });
    console.log(`${f}: ${stats.strokes} strokes, ${Math.round((Date.now() - t) / 1000)} s, ${stats.backend}`);
  }
} finally { fs.rmSync(ws, { recursive: true, force: true }); }
