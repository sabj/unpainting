// A look that stops partway (the old rounds' "stop, look, change what is not yet painted"): the painter is started
// with its pause folder (tools/aware/pause.mjs), told at the first boundary where the plan's stage N ends, stopped
// there once that pass has dried, and the sheet as it stands is the look. Nothing after the stop is painted. The
// painter offers the stops itself; this only decides where, from the stages of the passes it lists.
import fs from 'node:fs';
import path from 'node:path';

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, v) => { fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(f + '.tmp', f); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The boundary after the last pass of stage `stage` or earlier: how many of the listed passes lie at or under it, from the first. */
export function boundaryOfStage(passes, stage) {
  let k = 0; while (k < passes.length && Number(passes[k].stage) <= stage) k++;
  return k;
}

/**
 * Run `command` (command.mjs buildCommand, mode paint) through stage `stage` and stop. `run(command, opts)` is
 * run.mjs runPainter. Resolves {done: how the painter ended, stopped: null (it ran to the end: the plan has no later
 * stage) | {boundary, passesDone, passesPlanned, strokes, remaining, sheet: PNG file of the sheet as it stands}}.
 */
export async function paintThroughStage({ command, cwd, logFile, pauseDir, stage, run, pollMs = 400 }) {
  fs.rmSync(pauseDir, { recursive: true, force: true }); fs.mkdirSync(pauseDir, { recursive: true });
  writeJson(path.join(pauseDir, 'control.json'), { stopAt: 0, seq: 1 });
  let done = null; const ended = run({ ...command, args: [...command.args, '--pausedir', pauseDir] }, { cwd, logFile }).then(d => { done = d; return d; });
  const offer = async least => { for (;;) { if (done) return null; const f = fs.readdirSync(pauseDir).map(x => /^offer-(\d+)\.json$/.exec(x)).filter(m => m && Number(m[1]) >= least).sort((a, b) => a[1] - b[1])[0]; if (f && fs.existsSync(path.join(pauseDir, `sheet-${f[1]}.png`))) return { b: Number(f[1]), ...readJson(path.join(pauseDir, f[0])) }; await sleep(pollMs); } };
  const first = await offer(0);
  if (!first) return { done: await ended, stopped: null };
  const passes = first.remaining ?? [], k = boundaryOfStage(passes, stage);
  if (k >= passes.length) {   // the plan ends with this stage: the whole painting, as any look
    writeJson(path.join(pauseDir, 'control.json'), { stopAt: 'end', seq: 2 }); writeJson(path.join(pauseDir, 'go-0.json'), { action: 'continue', stopAt: 'end', seq: 2 });
    return { done: await ended, stopped: null };
  }
  let at = first;
  if (k > 0) {
    writeJson(path.join(pauseDir, 'control.json'), { stopAt: k, seq: 2 }); writeJson(path.join(pauseDir, 'go-0.json'), { action: 'continue', stopAt: k, seq: 2 });
    at = await offer(k);
    if (!at) return { done: await ended, stopped: null, endedEarly: true };
  }
  const sheet = path.join(path.dirname(pauseDir), `${path.basename(pauseDir)}-sheet.png`);
  fs.copyFileSync(path.join(pauseDir, `sheet-${at.b}.png`), sheet);
  writeJson(path.join(pauseDir, `go-${at.b}.json`), { action: 'save-exit', seq: 3 });
  await ended;
  return { done, stopped: { boundary: at.b, passesDone: at.passesDone, passesPlanned: at.passesPlanned, strokes: at.strokes ?? null, remaining: at.remaining ?? [], sheet } };
}

/** What a stopped look says is down and what is still to come, in words for its numbers. */
export function stoppedText(stopped, stage) {
  const left = stopped.remaining, by = new Map(); for (const p of left) by.set(p.stage, (by.get(p.stage) ?? 0) + p.passages);
  return `PAINTED THROUGH STAGE ${stage} AND STOPPED: ${stopped.passesDone} of ${stopped.passesPlanned} passes are on the paper${stopped.strokes != null ? ` (${stopped.strokes} strokes)` : ''}, dried. Nothing after it is painted.
Still to come: ${left.length ? [...by].sort((a, b) => a[0] - b[0]).map(([s, n]) => `stage ${s}: ${n} washes`).join('; ') : 'nothing'}.`;
}
