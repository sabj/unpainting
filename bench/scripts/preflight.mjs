import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { codeState } from '../../src/paint/code-state.mjs';

export const scorePython = (explicit, env = process.env) => explicit || env.BENCH_SCORE_PYTHON || 'python3';

// Run before creating model sessions; dry runs deliberately skip this contract.
export function preflight({ root, python, env = process.env, run = spawnSync, exists = fs.existsSync, state = codeState(root) }) {
  if (!state.git || state.dirty) throw new Error('benchmark requires a clean git checkout');
  if (!env.PAINTER_SEG_PYTHON) throw new Error('set PAINTER_SEG_PYTHON before launching a benchmark');
  if (!env.PAINTER_SAM_CHECKPOINT || !exists(env.PAINTER_SAM_CHECKPOINT)) throw new Error('PAINTER_SAM_CHECKPOINT must name an existing SAM checkpoint');
  for (const [label, executable, modules] of [
    ['PAINTER_SEG_PYTHON', env.PAINTER_SEG_PYTHON, 'numpy, cv2, torch, segment_anything'],
    ['scorer python', scorePython(python, env), 'numpy, scipy, skimage, PIL'],
  ]) {
    const result = run(executable, ['-c', `import ${modules}`], { env, encoding: 'utf8', timeout: 60000 });
    if (result.error || result.status !== 0) throw new Error(`${label} (${executable}) is not ready: ${result.error?.message || result.stderr || 'dependency probe failed'}`);
  }
}
