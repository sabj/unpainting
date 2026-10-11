import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

// Diagnostic runner: independent Node processes, sequentially on one GPU box.
// All runs share inputs and a private pure-step cache. The last run's ordinary
// outputs remain at --out; each run retains its painting, log and telemetry.
export async function runSpeedSequence(argv, script) {
  const at = argv.lastIndexOf('--speedsequence');
  if (at < 0) return false;
  const runs = JSON.parse(argv[at + 1]);
  if (!Array.isArray(runs) || !runs.length || runs.length > 8 || runs.some(r => !Array.isArray(r) || r.some(v => typeof v !== 'string'))) throw Error('--speedsequence requires 1 to 8 arrays of CLI strings');
  if (runs.some(r => r.some(v => ['--out', '--image', '--valueplan', '--areaplan', '--drawingfile', '--targetguard', '--speedsequence'].includes(v)))) throw Error('sequence variants cannot override inputs, guard or output');
  const args = argv.slice(); args.splice(at, 2);
  const oi = args.lastIndexOf('--out');
  if (oi < 0 || !args[oi + 1]) throw Error('--speedsequence requires --out');
  const out = path.resolve(args[oi + 1]);
  fs.mkdirSync(out, { recursive: true });
  const cache = path.join(out, '.sequence-cache'), rows = [];
  try {
    for (let i = 0; i < runs.length; i++) {
      const dir = path.join(out, 'sequence', String(i)), childArgs = args.slice();
      childArgs[oi + 1] = dir;
      fs.mkdirSync(dir, { recursive: true });
      const fd = fs.openSync(path.join(dir, 'paint.log'), 'w'), start = performance.now();
      let code;
      try {
        code = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [script, ...childArgs, ...runs[i]], { stdio: ['ignore', fd, fd], env: { ...process.env, W2_CACHE_DIR: cache } });
          child.once('error', reject); child.once('close', resolve);
        });
      } finally { fs.closeSync(fd); }
      const painting = path.join(dir, 'painting.png');
      const row = { index: i, args: runs[i], seconds: (performance.now() - start) / 1000, exit: code,
        sha256: fs.existsSync(painting) ? crypto.createHash('sha256').update(fs.readFileSync(painting)).digest('hex') : null };
      rows.push(row); fs.writeFileSync(path.join(out, 'sequence.json'), JSON.stringify(rows, null, 2));
      console.log('speed sequence:', JSON.stringify(row));
      if (code !== 0) throw Error('speed sequence run failed: ' + code + '; see ' + path.join(dir, 'paint.log'));
      if (i === runs.length - 1) {
        for (const name of fs.readdirSync(dir)) fs.cpSync(path.join(dir, name), path.join(out, name), { recursive: true });
      }
      for (const name of fs.readdirSync(dir)) {
        if (name !== 'painting.png' && name !== 'paint.log' && !['speed-profile.json', 'backend.json', 'target-guard.json', 'value-executed-counts.json'].includes(name)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      }
    }
  } finally { fs.rmSync(cache, { recursive: true, force: true }); }
  return true;
}
