// Lost edges by water (--softwet mm). Every value-plan passage is laid wet on dry and clipped to its mask, so every
// boundary dries as a hard, stepped rim, even where the target's value turns softly (a cheek, a fur stripe, the
// next step of a graded shadow). A painter makes that edge soft by wetting the paper just past it with clean water
// before the colour goes in, so the colour bleeds out and fades. Here the clean water goes on a ring outside the
// passage along its soft boundary cells only (the planner's low-contrast edge cells); along its hard boundary cells
// the paper stays dry and the edge stays crisp. The paint itself is still clipped to the passage: what crosses into
// the ring is carried by the sheet's own flow. Planning geometry only; no target read while painting.

const nb4 = (i, w, n) => {
  const x = i % w;
  return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i + w < n ? i + w : -1];
};

// Distance in 4-steps from the seed cells over cells outside `mask`, up to `radius`; Infinity where not reached.
function outsideDistance(seeds, mask, w, n, radius) {
  const d = new Float32Array(n).fill(Infinity);
  let q = [];
  for (const i of seeds) {
    for (const j of nb4(i, w, n)) if (j >= 0 && !mask[j] && d[j] > 1) { d[j] = 1; q.push(j); }
  }
  for (let k = 1; k < radius && q.length; k++) {
    const next = [];
    for (const i of q) for (const j of nb4(i, w, n)) if (j >= 0 && !mask[j] && d[j] > k + 1) { d[j] = k + 1; next.push(j); }
    q = next;
  }
  return d;
}

/**
 * The clean-water ring for one passage: cells outside `mask`, within `radius` cells of a soft boundary cell and
 * nearer to a soft boundary cell than to a hard one, never a protected light. Returns a Uint8Array mask.
 */
export function softRing(mask, softCells, hardCells, w, h, radius, protect = null) {
  const n = w * h, out = new Uint8Array(n), R = Math.max(1, Math.round(radius));
  if (!softCells?.length) return out;
  const ds = outsideDistance(softCells, mask, w, n, R), dh = hardCells?.length ? outsideDistance(hardCells, mask, w, n, R) : null;
  for (let i = 0; i < n; i++) if (ds[i] <= R && !(dh && dh[i] <= ds[i]) && !protect?.[i]) out[i] = 1;
  return out;
}
