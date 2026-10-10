// Can the measures tell groups apart? Checked separately for craft (real sheets vs synthetic faults),
// fidelity (renders vs a known-bad render, with self and cross-sheet controls) and overall.
// Separation: median gap in pooled-spread units, and the share of the worse group above the better group's p10.
import { quantile, mean, sd } from './image.mjs';

export function summarise(scores) {
  const v = scores.filter(Number.isFinite);
  if (!v.length) return { n: 0 };
  return { n: v.length, min: Math.min(...v), p10: quantile(v, 0.1), median: quantile(v, 0.5),
    p90: quantile(v, 0.9), max: Math.max(...v), mean: mean(v), sd: sd(v) || 0 };
}

// Cohen's d, plus how much of the low group reaches into the high group.
export function separation(high, low) {
  const a = high.filter(Number.isFinite), b = low.filter(Number.isFinite);
  if (a.length < 2 || b.length < 2) return { d: NaN, overlap: NaN, n: [a.length, b.length] };
  const sa = sd(a), sb = sd(b), pooled = Math.sqrt(((a.length - 1) * sa * sa + (b.length - 1) * sb * sb) / (a.length + b.length - 2)) || 1e-6;
  const floor = quantile(a, 0.1);
  const above = b.filter(v => v >= floor).length / b.length;
  // share of all high/low pairs where the high one wins
  let wins = 0, ties = 0;
  for (const x of a) for (const y of b) { if (x > y) wins++; else if (x === y) ties++; }
  return { d: (mean(a) - mean(b)) / pooled, overlap: above, auc: (wins + 0.5 * ties) / (a.length * b.length), n: [a.length, b.length] };
}

export function verdictLine(name, sep, want = 0.9) {
  if (!Number.isFinite(sep.auc)) return `${name}: not enough data (${sep.n.join(' vs ')})`;
  const pass = sep.auc >= want && sep.overlap <= 0.25;
  return `${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(34)} auc ${sep.auc.toFixed(2)}  d ${sep.d.toFixed(2)}  ${Math.round(100 * sep.overlap)}% of the worse group reaches the better group's p10  (n ${sep.n.join('/')})`;
}
