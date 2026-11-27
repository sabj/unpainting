import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { codeState } from '../../src/paint/code-state.mjs';
import { sourceScale } from '../../tools/plate/source-scale.mjs';

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

// Authoritative post-render / comparison guardrail: prevents comparing CPU fallback runs against GPU runs, refuses a
// plate painted from an enlarged source, enforces SAM segmentation on non-planless runs, and verifies progressive
// playback stage distinctness.
//
// Source scale: the render width never exceeds the source width, and plates are compared at source scale. A run must
// record both widths, and its sheet may have at most maxSourceScale cells across for each source pixel across (1: the
// painter's own rule, tools/plate/source-scale.mjs). There is no least width: a 300 px target painted 300 cells wide
// passes, and so does every target in bench/v2/targets at its own width. width, when given, is the width the subject
// specifies, and the run must have been painted exactly that wide.
export function verifyComparisonRun(runDir, { requireGpu = true, requireSegments = false, requireStages = false, requireDistinctStages = true, maxSourceScale = 1, width: specWidth = null, readFile = p => fs.readFileSync(p, 'utf8'), readBytes = p => fs.readFileSync(p), exists = fs.existsSync } = {}) {
  const cardPath = path.join(runDir, 'run-card.json');
  const speedPath = path.join(runDir, 'paint-speed-summary.json');
  const card = exists(cardPath) ? JSON.parse(readFile(cardPath)) : null;
  const speed = exists(speedPath) ? JSON.parse(readFile(speedPath)) : null;
  if (!card && !speed) throw new Error(`comparison run ${runDir} is missing run-card.json and paint-speed-summary.json`);
  const records = [
    ['paint-speed-summary.json', speed?.backend, speed?.fallback],
    ['run-card.json gpuBackend', card?.gpuBackend],
    ['run-card.json backend', card?.backend, card?.fallback],
  ].filter(([, record]) => record != null).map(([file, record, fallback]) => ({
    file, backend: typeof record === 'string' ? record : record.backend,
    fallback: typeof record === 'string' ? fallback : record.fallback,
  }));
  const backend = records[0]?.backend;
  // A missing fallback field is not evidence of a hardware run. Check every
  // recorded backend so a healthy speed summary cannot hide a fallback card.
  if (requireGpu && (!records.length || records.some(r => r.backend !== 'gpu' || r.fallback !== false))) {
    const evidence = records.map(r => `${r.file}: backend "${r.backend ?? 'unknown'}" (fallback=${r.fallback ?? 'unrecorded'})`).join(', ') || 'no backend recorded';
    throw new Error(`comparison run ${runDir} has invalid GPU evidence (${evidence}); GPU hardware is required for timing and quality comparisons; record backend "gpu" and fallback false explicitly`);
  }
  // the sheet's cells across; a card from before sheetWidth was recorded has only the output's width, which --inkres widens
  const width = Number(card?.dimensions?.sheetWidth ?? card?.dimensions?.paintWidth ?? speed?.width ?? card?.width ?? card?.frame?.[0] ?? 0);
  if (!(width > 0)) throw new Error(`comparison run ${runDir} records no render width, so it cannot be shown to be painted at source scale`);
  const sourceWidth = Number(card?.dimensions?.sourceWidth ?? 0);
  if (!(sourceWidth > 0)) throw new Error(`comparison run ${runDir} records no source width (run-card.json dimensions.sourceWidth), so it cannot be shown to be painted at source scale`);
  const scale = sourceScale({ sourceWidth, width, allowed: maxSourceScale });
  if (!scale.ok) {
    throw new Error(`comparison run ${runDir} was painted ${width} cells wide from a ${sourceWidth} px source, ${+scale.sourceScale.toFixed(3)} cells for each source pixel (at most ${maxSourceScale}); the render width never exceeds the source width, and plates are compared at source scale`);
  }
  if (specWidth != null && width !== specWidth) {
    throw new Error(`comparison run ${runDir} was painted ${width} cells wide, not the ${specWidth} its subject specifies`);
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
  return { ok: true, backend, width, sourceWidth, sourceScale: scale.sourceScale };
}

export function verifyTearsheetContract({ models = [], stages = [], requiredModels = ['argon', 'astra', 'opus'], minStages = 5 } = {}) {
  const have = new Set(models.map(m => String(m).toLowerCase()));
  const missing = requiredModels.filter(m => !have.has(m));
  if (missing.length) throw new Error(`comparison tear sheet is missing required model families: ${missing.join(', ')}`);
  if (stages.length < minStages) throw new Error(`comparison tear sheet has only ${stages.length} playback stages (at least ${minStages} progressive stages required)`);
  return { ok: true };
}
