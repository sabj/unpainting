// Generated from src/media/flow-time.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Legacy coefficients are calibrated at 0.25 mm cells and dt 2 (the full-dry reference). Convert
// them to a physical diffusivity and subdivide the explicit face stencil.
// Each pass stays below 0.2 even at the largest fibre permeability (1.5).
export function flowTime(sheet, o) {
  const mm = o.mmPerCell > 0 ? o.mmPerCell : sheet.paper.mmPerCell > 0 ? sheet.paper.mmPerCell : .3;
  const transport = o.dt * .25 ** 2 / (2 * mm * mm), budget = Math.max(o.flow * 1.5, o.diffuse + (o.filmDiffuse ?? 0));
  const iters = o.flowIters > 0 ? Math.max(1, Math.ceil(o.flowIters * transport * budget / .2)) : 0;
  return { iters, fraction: iters ? transport * o.flowIters / iters : 0 };
}

// Pore diffusion already included dt, but clipping its rate discarded elapsed
// transport time and its cell-based coefficient changed physical reach with dx.
export function poreTime(sheet, o) {
  const mm = o.mmPerCell > 0 ? o.mmPerCell : sheet.paper.mmPerCell > 0 ? sheet.paper.mmPerCell : .3;
  const exposure = Math.max(0, o.capRate * o.dt * 10 * (.25 / mm) ** 2);
  const iters = Math.max(1, Math.ceil(exposure / (2 / 3)));
  return { iters, fraction: exposure / iters };
}
