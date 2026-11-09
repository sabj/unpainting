// Which coat a passage is over the place it covers. A wide plane is laid in lanes, and where two lanes meet the brush
// leaves a thin seam. A painter laying one coat over another moves the stroke joins, so the seams of successive coats
// do not stack into one line. The planner numbers each passage by the coats it has already planned on those cells
// (rounded mean over the passage), whatever the pigment or value band, so the executor can move the joins coat by coat
// (shapedPlanePaths `coat`). The count comes from the plan alone, never from painting progress.

/** A running tally of planned coats per cell; lay(cells) returns the passage's coat number and books it. */
export function coatTally(n) {
  const laid = new Uint16Array(n);
  return {
    lay(cells) {
      if (!cells.length) return 0;
      let sum = 0;
      for (const i of cells) sum += laid[i];
      for (const i of cells) if (laid[i] < 65535) laid[i]++;
      return Math.round(sum / cells.length);
    },
  };
}
