// The painter on a pool worker (render-pool.mjs). Shipped with each job into the job's folder on the worker, beside a
// copy of stage-look.mjs, so it runs at whatever commit the worker's checkout is at; it imports nothing else of the
// repository. It starts the painter as this Mac would (run.mjs runPainter, stage-look.mjs paintThroughStage for a
// look stopped at a stage), in the checkout named by the job, and writes how it ended into result.json.
//   node <job folder>/render-worker.mjs        (job.json beside it: {cwd, args, env, until})
// Files in the job folder: job.json, painter.log, result.json; out/ is the painter's --out, out.pause/ its pause folder.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { paintThroughStage } from './stage-look.mjs';

/** The painter once, its output into logFile; {exit, signal, seconds}. The same as run.mjs runPainter. */
export function runOnWorker(command, { cwd, logFile }) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now(), log = fs.openSync(logFile, 'a');
    const child = spawn(command.cmd, command.args, { cwd, env: { ...process.env, ...command.env }, stdio: ['ignore', log, log] });
    child.on('error', reject);
    child.on('close', (exit, signal) => { fs.closeSync(log); resolve({ exit, signal, seconds: Math.round((Date.now() - t0) / 1000) }); });
  });
}

/** Paint the job of folder `dir`; resolves the record written to result.json. */
export async function paintJob(dir, run = runOnWorker) {
  const job = JSON.parse(fs.readFileSync(path.join(dir, 'job.json'), 'utf8')), logFile = path.join(dir, 'painter.log');
  const command = { cmd: 'node', args: job.args, env: job.env ?? {} };
  let result;
  if (job.until == null) result = { done: await run(command, { cwd: job.cwd, logFile }), stopped: null };
  else {
    const x = await paintThroughStage({ command, cwd: job.cwd, logFile, pauseDir: path.join(dir, 'out.pause'), stage: job.until, run });
    // the sheet as it stood is named relative to the job folder: the client brings it back beside its own pause folder
    result = { done: x.done, stopped: x.stopped ? { ...x.stopped, sheet: 'out.pause-sheet.png' } : null, endedEarly: x.endedEarly ?? false };
  }
  fs.writeFileSync(path.join(dir, 'result.json.tmp'), JSON.stringify(result, null, 1));
  fs.renameSync(path.join(dir, 'result.json.tmp'), path.join(dir, 'result.json'));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  paintJob(dir).catch(e => { fs.writeFileSync(path.join(dir, 'worker-error.txt'), String(e?.stack ?? e)); process.exit(1); });
}
