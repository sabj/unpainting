// Native Fast approximates the tail of CLI ordinary drying with a larger timestep; flowing, leveling and
// dry checks are unchanged. Transport and settling differ, so it is not pixel-equivalent.
export function nativePaintMode(mode = 'fast') {
  if (!['fast', 'full'].includes(mode)) throw Error('--mode takes fast or full');
  return {
    mode,
    approximate: mode === 'fast',
    approximation: mode === 'fast'
      ? 'ordinary CLI dry uses dt >= 14 after leveling dt >= 140 below 3*wetEps, and analytic settlement below wetEps; quiet pore transport is approximated'
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
