// Where a GPU painting is painted: the one place cli.mjs starts the painter for a look, a look stopped at a stage, a
// full-size final and a subject's prepared Auto painting. One setting, UNPAINT_RENDER:
//   local (the default)  on this Mac, as always: one machine runs everything
//   pool                 on a free worker of the render pool (render-pool.mjs: this Mac, a pod or the Mac mini), at
//                        the session's commit, the painting's files brought back where the session reads them
// An execution setting, not a painting change: the same command is painted, at the same commit, and the same files
// come back. A plan preview (CPU, valuepreviewonly: a session's compile of each script) goes the same way as kind
// 'plan', so the pool's UNPAINT_POOL_ONLY keeps it off this Mac too and its places cap how many run here at once.
import { runPainter, gpuPaintCount } from './run.mjs';
import { paintThroughStage } from './stage-look.mjs';
import { paintOnPool, poolDir, registerClient, DEFAULT_CAP } from './render-pool.mjs';

/** The UNPAINT_RENDER setting: 'local' | 'pool'. Anything else throws: a misspelt setting is not read as local. */
export function renderSetting(env) {
  const v = env.UNPAINT_RENDER ?? 'local';
  if (v !== 'local' && v !== 'pool') throw new Error(`UNPAINT_RENDER=${v}: it is local (this Mac, the default) or pool (the render pool)`);
  return v;
}

/** The --out folder of a painter command. */
export function outOf(command) {
  const i = command.args.indexOf('--out');
  if (i < 0 || !command.args[i + 1]) throw new Error('a painter command without --out cannot be painted');
  return command.args[i + 1];
}

/** This Mac paints `command`; with `until`, stopped after that stage (stage-look.mjs). {done, stopped, endedEarly} */
export async function paintHere(command, { cwd, logFile, onLine, until = null, pauseDir = null }, run = runPainter) {
  if (until == null) return { done: await run(command, { cwd, logFile, onLine }), stopped: null, endedEarly: false };
  const x = await paintThroughStage({ command, cwd, logFile, pauseDir, stage: until, run });
  return { done: x.done, stopped: x.stopped, endedEarly: x.endedEarly ?? false };
}

/**
 * The painter starter for this command's settings. paint(command, {cwd, logFile, onLine, until, pauseDir, kind})
 * resolves {done, stopped, endedEarly, render}; render says where it was painted and for how long (the operator's
 * record: never what the model is charged, which stays the painter's own count of its work).
 * `codeState()`: the checkout's {commit, dirty}; the pool paints committed code only, since only a commit travels.
 */
export function renderer(env, { root, codeState, run = runPainter }) {
  const mode = renderSetting(env);
  if (mode === 'local') {
    return { mode, pool: false, cap: null, register: () => null,
      plan: (command, opts) => run(command, opts),
      paint: async (command, opts) => {
        const t = Date.now(), r = await paintHere(command, opts, run);
        return { ...r, render: { mode, worker: 'this Mac', workerKind: 'local', waitSeconds: 0, paintSeconds: Math.round((Date.now() - t) / 1000), copySeconds: 0, costUSD: 0 } };
      } };
  }
  const dir = poolDir(env, root), cap = Number(env.UNPAINT_POOL_CAP ?? DEFAULT_CAP);
  if (!(cap >= 1)) throw new Error(`UNPAINT_POOL_CAP=${env.UNPAINT_POOL_CAP}: the most pods at once, 1 or more`);
  const committed = () => {
    const s = codeState();
    if (!s.commit || s.dirty) throw new Error(`UNPAINT_RENDER=pool paints committed code only (a worker paints at the commit): ${root} ${s.commit ? 'has uncommitted changes' : 'has no commit'}`);
    return s.commit;
  };
  const paint = (command, opts) => paintOnPool({ ...opts, command, out: outOf(command), commit: committed() }, { dir, env, local: (c, o) => paintHere(c, { ...o, until: opts.until, pauseDir: opts.pauseDir }, run), gpuCount: gpuPaintCount, repo: root });
  return { mode, pool: true, cap, dir,
    register: sessions => registerClient(dir, { sessions, commit: committed() }),
    // a plan preview through the pool: {exit, signal, seconds} as runPainter gives it
    plan: (command, opts) => paint(command, { ...opts, kind: 'plan' }).then(x => x.done),
    paint };
}
