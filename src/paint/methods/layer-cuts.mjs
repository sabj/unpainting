// Middle-layer cut levels. The value planner builds a form's middle values as nested layers cut at quantiles of the
// smoothed value. Cut on the whole sheet, a form whose values sit inside one sheet-wide step (a sunlit face in a dark
// scene) gets one flat plane; cut on each colour region's own values (--layerlocal 1) it gets its own light, half and
// shadow planes. More than four layers (--midlayers N) take evenly spaced quantiles.

/** Quantile fractions for n layers: the historical four, or evenly spaced cuts for more. */
export const layerFractions = n => (n <= 4 ? [0, 0.3, 0.55, 0.78].slice(0, n) : Array.from({ length: n }, (_, j) => j / n));

/**
 * Per-region cut levels: Map(label -> levels) for every region with at least minCells eligible cells.
 * labels: region label per cell; values: smoothed value per cell; eligible(i): the cell carries middle demand.
 */
export function regionCuts(labels, values, eligible, fractions, minCells) {
  const by = new Map();
  for (let i = 0; i < values.length; i++) if (eligible(i)) { const L = labels[i]; if (!by.has(L)) by.set(L, []); by.get(L).push(values[i]); }
  const out = new Map();
  for (const [L, vals] of by) {
    if (vals.length < minCells) continue;
    vals.sort((a, b) => a - b);
    out.set(L, fractions.map(f => vals[Math.floor(f * (vals.length - 1))]));
  }
  return out;
}
