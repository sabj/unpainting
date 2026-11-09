import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

// Authoritative post-render / comparison guardrail: prevents comparing CPU fallback runs against GPU runs,
// prevents passing 300px crop thumbnails as full-resolution plates, enforces SAM segmentation on non-planless runs,
// and verifies progressive playback stage distinctness.
export function verifyComparisonRun(runDir, { requireGpu = true, requireSegments = false, requireStages = false, requireDistinctStages = true, minWidth = 540, minSourceWidth = 0, readFile = p => fs.readFileSync(p, 'utf8'), readBytes = p => fs.readFileSync(p), exists = fs.existsSync } = {}) {
  const cardPath = path.join(runDir, 'run-card.json');
  const speedPath = path.join(runDir, 'paint-speed-summary.json');
  const card = exists(cardPath) ? JSON.parse(readFile(cardPath)) : null;
  const speed = exists(speedPath) ? JSON.parse(readFile(speedPath)) : null;
  if (!card && !speed) throw new Error(`comparison run ${runDir} is missing run-card.json and paint-speed-summary.json`);
  const backend = speed?.backend?.backend ?? card?.gpuBackend?.backend ?? card?.backend?.backend ?? card?.backend;
  const fallback = speed?.backend?.fallback ?? card?.gpuBackend?.fallback ?? card?.backend?.fallback ?? false;
  if (requireGpu && (backend !== 'gpu' || fallback)) {
    throw new Error(`comparison run ${runDir} used backend "${backend ?? 'unknown'}" (fallback=${fallback}); GPU hardware is required for timing and quality comparisons`);
  }
  const width = Number(card?.dimensions?.paintWidth ?? speed?.width ?? card?.width ?? card?.frame?.[0] ?? 0);
  if (minWidth > 0 && (!(width > 0) || width < minWidth)) {
    throw new Error(`comparison run ${runDir} rendered at width ${width}px (< ${minWidth}px minimum); do not substitute 300px crop thumbnails for full-resolution targets`);
  }
  const sourceWidth = Number(card?.dimensions?.sourceWidth ?? 0);
  const enlargement = Number(card?.dimensions?.enlargement ?? (sourceWidth > 0 && width > 0 ? +(width / sourceWidth).toFixed(2) : 0));
  if (minSourceWidth > 0 && (!(sourceWidth > 0) || sourceWidth < minSourceWidth)) {
    throw new Error(`comparison run ${runDir} used a ${sourceWidth}px source target (< ${minSourceWidth}px minimum, ${enlargement}x enlargement)`);
  }
  if (requireSegments) {
    const segPath = path.join(runDir, 'segments.json');
    if (exists(segPath)) {
      const seg = JSON.parse(readFile(segPath));
      const segBackend = seg?.backend ?? seg?.mode ?? seg?.status;
      if (segBackend !== 'sam') throw new Error(`comparison run ${runDir} ran with --segments ${segBackend ?? 'unknown'}; full SAM segmentation is required`);
    } else if (card?.segments) {
      const segBackend = card.segments.backend ?? card.segments.mode;
      if (segBackend !== 'sam') throw new Error(`comparison run ${runDir} ran with --segments ${segBackend ?? 'unknown'}; full SAM segmentation is required`);
    } else {
      throw new Error(`comparison run ${runDir} is missing segmentation evidence (segments.json / run-card.segments); full SAM segmentation is required`);
    }
  }
  const stagePcts = [10, 25, 50, 75, 100];
  const stageFiles = stagePcts.map(p => ({ pct: p, file: path.join(runDir, 'stages', `stage-${String(p).padStart(3, '0')}.jpg`) }));
  const presentStages = stageFiles.filter(s => exists(s.file));
  if (requireStages && presentStages.length < stagePcts.length) {
    const missing = stageFiles.filter(s => !exists(s.file)).map(s => `${s.pct}%`);
    throw new Error(`comparison run ${runDir} is missing progressive stage images: ${missing.join(', ')}`);
  }
  if (requireDistinctStages && presentStages.length === stagePcts.length) {
    const hashes = presentStages.map(s => ({ pct: s.pct, sha256: crypto.createHash('sha256').update(readBytes(s.file)).digest('hex') }));
    for (let i = 1; i < hashes.length; i++) {
      if (hashes[i].sha256 === hashes[i - 1].sha256) {
        throw new Error(`comparison run ${runDir} has duplicate consecutive playback stages (${hashes[i - 1].pct}% and ${hashes[i].pct}% are byte-identical); progressive playback requires distinct stages`);
      }
    }
  }
  return { ok: true, backend, width, sourceWidth, enlargement };
}

export function verifyTearsheetContract({ models = [], stages = [], requiredModels = ['argon', 'astra', 'opus'], minStages = 5 } = {}) {
  const have = new Set(models.map(m => String(m).toLowerCase()));
  const missing = requiredModels.filter(m => !have.has(m));
  if (missing.length) throw new Error(`comparison tear sheet is missing required model families: ${missing.join(', ')}`);
  if (stages.length < minStages) throw new Error(`comparison tear sheet has only ${stages.length} playback stages (at least ${minStages} progressive stages required)`);
  return { ok: true };
}
