// Generated from src/media/gpu/dispatch-1d.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Browser- and Node-compatible 1D workgroup dispatch helper for WebGPU compute shaders.

/** Dispatch 1D work across 2D workgroups when group count exceeds device limit. */
export function dispatch1D(pass, count, workgroupSize, maxPerDim = 65535) {
  if (count <= 0) return;
  const groups = Math.ceil(count / workgroupSize);
  const x = Math.min(groups, maxPerDim);
  const y = Math.ceil(groups / x);
  pass.dispatchWorkgroups(x, y, 1);
}
