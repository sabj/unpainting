// Starting the painter for one run: the checks before it (no third GPU painting, no stale value plan), the process
// itself with its log, and what it left in the run folder.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { FRAME_FILE } from '../../src/media/frame-file.mjs';

/** The GPU paintings in a `ps -axo pid=,command=` listing: paint-plate runs that are not --gpu off. [{pid, command}] */
export function gpuPaints(psText) {
  return psText.split('\n').map(l => /^\s*(\d+)\s+(.*)$/.exec(l)).filter(Boolean)
    .filter(m => /^\S*node\s/.test(m[2]) && m[2].includes('paint-plate.mjs') && !/--gpu\s+off\b/.test(m[2]))
    .map(m => ({ pid: Number(m[1]), command: m[2] }));
}

const psNow = () => execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', maxBuffer: 1 << 26 });
/** How many GPU paintings are running now. */
export const gpuPaintCount = (psText = psNow()) => gpuPaints(psText).length;

/** Throws when `most` GPU paintings are already running (one painting asked for by itself is refused, not queued). */
export function refuseExtraGpuPaint(most, psText = psNow()) {
  const running = gpuPaints(psText);
  if (running.length >= most) throw new Error(`${running.length} GPU paintings are already running (pids ${running.map(r => r.pid).join(', ')}); one more is refused at --jobs ${most}. Wait for one to end, or run "plan".`);
  return running.length;
}

/**
 * The painter's cache folder for a run. The cache is keyed on the code and the arguments, not on the X_* experiment
 * switches of the environment, so a value plan made under other switches would be read back as this run's. Each set
 * of switches therefore gets a cache folder of its own, apart from the one hand-run commands share.
 */
export function cacheDirFor(base, switches) {
  const names = Object.keys(switches);
  const key = names.length ? crypto.createHash('sha256').update(JSON.stringify(Object.entries(switches).sort())).digest('hex').slice(0, 10) : 'plain';
  return path.join(base, `paint-${key}`);
}

/** The X_* experiment switches set in the environment. */
export function switchesOf(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => /^X_[A-Z0-9_]+$/.test(k)).sort());
}

/**
 * The main checkout of the linked git worktree at `root`, wherever the worktree lies: its .git is a file naming the
 * worktree's git folder, whose `commondir` names the shared one. null in a main checkout and outside git.
 */
export function mainCheckoutOf(root, read = f => fs.readFileSync(f, 'utf8')) {
  let gitDir, common;
  try { gitDir = /^gitdir: (.+)$/m.exec(read(path.join(root, '.git')))?.[1].trim(); } catch { return null; }   // a folder (a main checkout) or none
  if (!gitDir) return null;
  gitDir = path.resolve(root, gitDir);
  try { common = read(path.join(gitDir, 'commondir')).trim(); } catch { return null; }   // a submodule's git folder has none
  return path.dirname(path.resolve(gitDir, common));
}

/**
 * PAINTER_SEG_PYTHON and PAINTER_SAM_CHECKPOINT for the painter when the environment names neither and the checkout
 * has none of its own: a git worktree finds them in its main checkout or a sibling worktree. Nothing is invented: a
 * file that is found nowhere is left for the painter to fail on loudly.
 */
export function segEnvFor(root, env = process.env, exists = fs.existsSync, siblings = dirs, main = mainCheckoutOf) {
  const out = {}, near = [root, main(root), path.dirname(path.dirname(root)), ...siblings(path.dirname(root))].filter(Boolean);
  const first = rel => near.map(d => path.join(d, rel)).find(exists);
  if (!env.PAINTER_SEG_PYTHON && !exists(path.join(root, '.venv-seg/bin/python'))) { const f = first('.venv-seg/bin/python'); if (f) out.PAINTER_SEG_PYTHON = f; }
  if (!env.PAINTER_SAM_CHECKPOINT && !exists(path.join(root, 'work/models/sam_vit_b_01ec64.pth'))) { const f = first('work/models/sam_vit_b_01ec64.pth'); if (f) out.PAINTER_SAM_CHECKPOINT = f; }
  return out;
}

/**
 * The segmentation python for the checkout at `root`: PAINTER_SEG_PYTHON, else the checkout's own .venv-seg, else the one
 * segEnvFor finds for a worktree. The path may not exist: the caller fails on that loudly.
 */
export function segPythonFor(root, env = process.env) {
  return env.PAINTER_SEG_PYTHON ?? segEnvFor(root, env).PAINTER_SEG_PYTHON ?? path.join(root, '.venv-seg', 'bin', 'python');
}
function dirs(d) { try { return fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => path.join(d, e.name)).sort(); } catch { return []; } }

/** Run the painter; its output goes to logFile and, line by line, to onLine. Resolves {exit, signal, seconds}. */
export function runPainter(command, { cwd, logFile, onLine = () => {} }) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now(), log = fs.createWriteStream(logFile);
    const child = spawn(command.cmd, command.args, { cwd, env: { ...process.env, ...command.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let rest = '';
    const take = chunk => { log.write(chunk); rest += chunk; const lines = rest.split('\n'); rest = lines.pop(); lines.forEach(onLine); };
    child.stdout.on('data', take); child.stderr.on('data', take);
    child.on('error', reject);
    child.on('close', (exit, signal) => { if (rest) onLine(rest); log.end(() => resolve({ exit, signal, seconds: Math.round((Date.now() - t0) / 1000) })); });
  });
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/**
 * What a run folder holds after the painter: the files the sheet shows and the numbers under them.
 * state: 'plan only' | 'finished' | 'unfinished' | 'no plan'.
 */
export function collectResults(out, mode) {
  const files = fs.existsSync(out) ? fs.readdirSync(out) : [];
  const stage = files.map(f => /-stage-(\d+)\.png$/.exec(f)).filter(Boolean).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const has = f => (files.includes(f) ? path.join(out, f) : null);
  const plan = readJson(path.join(out, 'value-plan.json')), risk = readJson(path.join(out, 'cheat-risk.json')), tiny = readJson(path.join(out, 'tiny-touches.json'));
  const painting = has('painting.png') ?? has('painting.jpg');
  const lastFrame = files.filter(f => FRAME_FILE.test(f)).sort().pop();
  const strip = fs.existsSync(path.join(out, 'stages', 'strip.jpg')) ? path.join(out, 'stages', 'strip.jpg') : null;
  const sum = plan?.summary ?? null, passes = plan?.passes ?? [], be = readJson(path.join(out, 'backend.json'));
  const widest = passes.reduce((m, p) => Math.max(m, Number(p.widestBrushMm) || 0), 0);
  return {
    state: mode === 'plan' ? (stage || plan ? 'plan only' : 'no plan') : painting ? 'finished' : plan || lastFrame ? 'unfinished' : 'no plan',
    planPreview: stage ? path.join(out, stage.input) : has('plan.jpg'),
    painting: painting ?? (lastFrame ? path.join(out, lastFrame) : null), strip,
    plan: plan ? {
      shapes: sum?.shapes ?? null, passages: sum?.passages ?? null, washes: sum?.washes ?? passes.length, strokes: sum?.plannedStrokes ?? null, stages: sum?.stages ?? null,
      widestBrushMm: widest || null, softJoins: sum?.softJoins ?? null, dabbed: sum?.dabbed ?? null,
      studies: (sum?.layersOfStudy ?? []).map(l => ({ study: l.study, minMm2: l.minMm2, shapes: l.shapes, washes: l.washes, strokes: l.strokes })),
    } : null,
    backend: be ? { backend: be.backend ?? null, fallback: be.fallback ?? null, adapter: be.adapter ?? null } : null,
    // strokes too small for a wet bed (src/paint/methods/tiny-touch.mjs): those the plan told of, and those the painter laid as plain touches
    ...(sum?.tinyTouches?.length || tiny?.touches?.length ? { tinyTouches: { leastMm2: tiny?.leastMm2 ?? sum?.tinyTouches?.[0]?.leastMm2 ?? null, planned: sum?.tinyTouches ?? [], laid: tiny?.touches ?? [] } } : {}),
    cheatRisk: risk ? { level: risk.level ?? null, risk: risk.risk ?? null, parts: risk.parts ?? null, flags: risk.flags ?? [], error: risk.error ?? null } : null,
  };
}
