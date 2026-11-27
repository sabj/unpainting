// Native Fast uses larger drying steps on both backends; it keeps the same transport and dry-admission rules.
// The resulting transport/settling schedule differs from Full, so the two modes are not pixel-equivalent.
import { DRY_TAIL_CHUNK_DT } from '../../src/media/time-chunks.mjs';
export function nativePaintMode(mode = 'fast') {
  if (!['fast', 'full'].includes(mode)) throw Error('--mode takes fast or full');
  return {
    mode,
    approximate: mode === 'fast',
    approximation: mode === 'fast'
      ? `ordinary CLI dry uses dt >= 14 after leveling, split into substeps no longer than ${DRY_TAIL_CHUNK_DT}; only pore-local evaporation finishes analytically, after the surface is gone and no pore can wick`
      : 'prior ordinary drying schedule unchanged',
    scope: 'paint-plate ordinary dry calls, including its calibration; other instrument APIs retain their schedules',
    wetFlow: 'unchanged',
    dryAdmission: 'actual whole-footprint/neighbor/material checks unchanged',
  };
}
export function nativeDryOptions(mode, options) {
  nativePaintMode(mode);
  if (mode === 'full') return options;
  // Watched checkpoints keep their step schedule, so requested snapshots stay at the same physical times.
  if (options?.onStep) return options;
  const dt = options?.dt ?? 2;
  if (!Number.isFinite(dt) || dt <= 0) throw Error('ordinary dry dt must be finite and positive');
  return {...options, dt: Math.max(14, dt), analyticTail: true};
}

// Fast mode: between strokes' flows the GPU edge feed's geometry trails the moving outline by up to this many steps
// (src/media/gpu/stepfull.mjs EF_STROKE_LAG), not remade at every step. Full mode and other callers: remade at once.
export const FAST_EDGE_LAG = 16;
export function nativeEdgeLagPolicy(mode) {
  nativePaintMode(mode);
  return { environmentVariable: 'GPU_EDGE_LAG', value: mode === 'fast' ? String(FAST_EDGE_LAG) : '0' };
}

// CLI policy only: generic GpuLink callers keep their own environment.
export function nativeUploadPolicy(mode, explicit) {
  nativePaintMode(mode);
  const value = explicit ?? (mode === 'fast' ? '1' : '0');
  return {
    environmentVariable: 'GPU_DIRTY_UPLOAD', value,
    enabled: value === '1',
    selection: explicit == null ? 'native-mode-default' : 'explicit-environment',
    scope: 'tracked CPU fallback dirty-bbox uploads; full readbacks, logical stroke bounds and conservative fallback unchanged; other upload optimizations unchanged',
  };
}
