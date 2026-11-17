// How many wet passes and how many pans the plan lays on each painted cell: the over-wetting and mud check. Every
// passage rewets what is under it, and each pan laid as its own wash is one more chance to mix complements on the
// paper. Recorded in value-plan.json (washStats) so a plan that stacks too many washes can be seen and compared;
// it changes nothing in the plan.
const summary = (counts, cells) => {
  if (!cells.length) return { mean: 0, p95: 0, max: 0 };
  const v = Uint16Array.from(cells, i => counts[i]).sort();
  let sum = 0; for (const c of v) sum += c;
  return { mean: +(sum / v.length).toFixed(2), p95: v[Math.floor(0.95 * (v.length - 1))], max: v[v.length - 1] };
};

/** @param layers plan layers ({pigment, shapes: [{mask}]}) @returns {{cells, passes, pans}} over cells with any paint */
export function washStats(layers, n) {
  const passes = new Uint16Array(n), pans = new Uint16Array(n), seen = new Map();
  for (const L of layers) {
    const pan = L.pigment, mark = seen.get(pan) ?? seen.set(pan, new Uint8Array(n)).get(pan);
    for (const sh of L.shapes ?? []) {
      const m = sh.mask; if (!m) continue;
      for (let i = 0; i < n; i++) if (m[i]) { passes[i]++; if (!mark[i]) { mark[i] = 1; pans[i]++; } }
    }
  }
  const cells = []; for (let i = 0; i < n; i++) if (passes[i]) cells.push(i);
  return { cells: cells.length, passes: summary(passes, cells), pans: summary(pans, cells) };
}
