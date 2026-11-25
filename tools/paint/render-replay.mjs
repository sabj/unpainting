#!/usr/bin/env node
// render-replay.mjs: paint a kept painter command again, through the render pool or on this Mac, into a new folder,
// and say where it ran, how long it took and what work the painter counted (brush sweeps plus dryings, the rendering
// units' measure: look-cost.mjs). For the operator, to prove a worker paints what this Mac paints.
//   node tools/paint/render-replay.mjs <kept .command.txt> --out DIR --commit HASH [--until STAGE] [--sessions N]
// The command is the shell line cli.mjs writes beside a look (<plate>.command.txt); its --out is replaced by DIR.
// UNPAINT_RENDER chooses where it is painted as in a session; UNPAINT_POOL_ONLY=pod|mini|local limits the workers.
// Prints one JSON line: {out, render, work, exit, seconds}.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderer } from './render.mjs';
import { paintedWork, sweepsInLog } from './look-cost.mjs';

/** The words of a shell line as shellLine (command.mjs) writes it: plain words and '...' quoted ones. */
export function shellWords(line) {
  const out = []; let cur = null, i = 0;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === "'") { const j = line.indexOf("'", i + 1); if (j < 0) throw new Error('an unclosed quote in the command'); cur = (cur ?? '') + line.slice(i + 1, j); i = j; }
    else if (c === '\\' && line[i + 1] === "'") { cur = (cur ?? '') + "'"; i++; }
    else if (/\s/.test(c)) { if (cur != null) out.push(cur); cur = null; }
    else cur = (cur ?? '') + c;
  }
  if (cur != null) out.push(cur);
  return out;
}

/** {cmd, args, env} of a kept command line, its --out put to `out`. */
export function keptCommand(line, out) {
  const w = shellWords(line.trim()), env = {};
  while (w.length && /^[A-Z_][A-Z0-9_]*=/.test(w[0])) { const [k, ...v] = w.shift().split('='); env[k] = v.join('='); }
  const cmd = w.shift(), i = w.indexOf('--out');
  if (cmd !== 'node' || i < 0) throw new Error('not a painter command (node ... --out DIR)');
  w[i + 1] = path.resolve(out);
  return { cmd, args: w, env };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };
  const file = a[0], out = opt('--out'), commit = opt('--commit'), until = opt('--until'), sessions = Number(opt('--sessions') ?? 1);
  if (!file || !out || !commit) { console.error('usage: render-replay.mjs <kept .command.txt> --out DIR --commit HASH [--until STAGE] [--sessions N]'); process.exit(2); }
  if (fs.existsSync(out) && fs.readdirSync(out).length) { console.error(`${out} already holds a painting; give a fresh --out`); process.exit(2); }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const full = execFileSync('git', ['-C', root, 'rev-parse', '--verify', `${commit}^{commit}`], { encoding: 'utf8' }).trim();
  const command = keptCommand(fs.readFileSync(file, 'utf8'), out), r = renderer(process.env, { root, codeState: () => ({ commit: full, dirty: false }) });
  r.register(sessions);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const t = Date.now(), got = await r.paint(command, { cwd: root, logFile: `${path.resolve(out)}.log`, until: until == null ? null : Number(until), pauseDir: `${path.resolve(out)}.pause`, kind: until == null ? 'operator look' : 'operator look stopped at a stage', onLine: () => {} });
  let work = null; try { const passes = (JSON.parse(fs.readFileSync(path.join(out, 'value-plan.json'), 'utf8')).passes ?? []).map(p => ({ layer: p.layer ?? null })); work = paintedWork({ sweeps: got.stopped ? got.stopped.strokes : sweepsInLog(fs.readFileSync(`${path.resolve(out)}.log`, 'utf8')), passes, passesDone: got.stopped?.passesDone ?? null }); } catch (e) { work = { fault: e.message }; }
  console.log(JSON.stringify({ out: path.resolve(out), exit: got.done.exit, signal: got.done.signal, seconds: Math.round((Date.now() - t) / 1000), work, stopped: got.stopped ? { passesDone: got.stopped.passesDone, strokes: got.stopped.strokes, sheet: got.stopped.sheet } : null, render: got.render }));
  process.exit(got.done.exit === 0 || got.done.exit === 3 ? 0 : 1);
}
