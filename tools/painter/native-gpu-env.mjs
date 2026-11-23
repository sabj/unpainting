// The GPU settings the main painter (tools/paint-plate.mjs, native mode 'fast', its default) runs with, for a caller that
// paints on the same engine without the painter's command line: the level 1 kit (bench/v2/kit/kit.mjs). Each is the value
// tools/plate/setup.mjs gives when no option or environment variable overrides it; a variable already set is kept.
// They change how the sheet travels between the CPU and the GPU (resident sheet, demand-window reads, tracked uploads,
// sparse wet frontier, background drying), not what a stroke lays; the drying's fast tail is nativeDryOptions
// (native-paint-mode.mjs) and the broad-wash splat spacing nativeBodyCadence (native-body-cadence.mjs).
export const NATIVE_FAST_GPU_ENV = Object.freeze({
  GPU_RESIDENT: '1',          // the sheet lives on the GPU between strokes (setup.mjs)
  GPU_COMPOSITE: '1',         // the lower layers are composited on the GPU
  GPU_ASYNC_DRY: '1',         // a drying runs on the GPU while the CPU goes on
  GPU_DEMAND_READBACK: 'fast', // a CPU brush reads only the 8-cell tiles it touches (demand-policy.mjs)
  GPU_DIRTY_UPLOAD: '1',      // and sends back only the cells it changed (nativeUploadPolicy)
  GPU_SIGNED_ZERO: 'ignore',
  GPU_PAPER_OBSERVE: '1',     // fresh regional paper reads
  GPU_FUSE_WETSCAN: '1', GPU_EDGE_PINGPONG: '1', GPU_SPARSE_ALL: '1', GPU_SKIP_ZERO_LAYER: '1',
});

/** Set the painter's fast GPU settings in `env` where they are unset. Returns what was set and what was kept. */
export function applyNativeFastGpuEnv(env = process.env) {
  const set = [], kept = [];
  for (const [k, v] of Object.entries(NATIVE_FAST_GPU_ENV)) {
    if (env[k] == null) { env[k] = v; set.push(k); } else kept.push(k);
  }
  return { set, kept };
}
