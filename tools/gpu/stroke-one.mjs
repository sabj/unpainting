// One brush stroke, no flow: the sheet on the GPU (stroke laid there) against the CPU sheet, field by field.
//   node tools/gpu/stroke-one.mjs [flat|dry] [lift=1]
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, DEFAULTS, coherent } from '../../src/media/sheet.mjs';
import { createBrush, dip, stroke } from '../../src/media/brush.mjs';
import { attachGpu } from '../../src/media/gpu/link.mjs';

const kind = process.argv[2] || 'flat', lift = process.argv[3] !== '0', N = 96;
const pigments = [
  { K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 },
  { K: [0.8, 0.5, 0.2], S: [0.03, 0.03, 0.02], rho: 0.3, omega: 0.9, gamma: 0.6 },
];
const fresh = () => createSheet(makePaper(N, N, { seed: 5 }), pigments);
function go(sheet) {
  const b = kind === 'one' ? createBrush({ flat: true, radius: 6, bristles: 1, wetMix: 0.5, capacity: 80, seed: 3 }) : kind === 'flat' ? createBrush({ flat: true, radius: 6, wetMix: 0.5, capacity: 80, seed: 3 }) : createBrush({ radius: 4, bristles: 10, capacity: 20, belly: 2, feed: 0.06, give: 0.6, free: 0.3, film: 0.2, splay: 0.08, stiffness: 5, bridge: 0.38, bridgeSoft: 1.0, streak: 0.6, seed: 9 });
  dip(b, { water: kind !== 'dry' ? 1 : 0.22, conc: [0.8, 0.1] });
  const len = +(process.argv[4] || 54);
  if (kind === 'case') { // a small wash brush as the painter makes one, over a short horizontal path
    const r = 1.2857142857142856, bb = createBrush({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, bridge: 0.82, bridgeSoft: 2.4, seed: 31 });
    dip(bb, { water: 0.58, conc: [0.6, 0.2] });
    stroke(bb, sheet, [{ x: 39.85, y: 62.35, p: 0.18, r }, { x: 43.35, y: 62.35, p: 1, r }, { x: 46.85, y: 62.35, p: 0.18, r }], { upright: 'sweep', lift });
    return bb;
  }
  stroke(b, sheet, [{ x: 20, y: 24, p: 1, r: 6 }, { x: 20 + len, y: 24 + len * 0.11, p: 0.9, r: 6 }], { upright: 'sweep', lift });
  // a second stroke with the same brush, not dipped again: on the GPU it carries on from the hairs the first left there
  if (process.argv[7] === 'twice') stroke(b, sheet, [{ x: 20, y: 44, p: 1, r: 6 }, { x: 20 + len, y: 50, p: 0.9, r: 6 }], { upright: 'sweep', lift });
  return b;
}
const c = fresh(), bc = go(c);
const g = fresh(); attachGpu(g, { ...DEFAULTS }, { mode: 'on', log: () => {} });
const bg = go(g); coherent(g); g._gpu.settleBrush(bg);
const cmp = (name, a, b) => { let m = 0, s = 0, n = 0, big = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; s += d; if (d > 1e-4) big++; n++; } console.log(name.padEnd(6), 'mean', (s / n).toExponential(2), 'max', m.toExponential(2), 'cells >1e-4', big); };
cmp('W', c.W, g.W); cmp('s', c.s, g.s); cmp('M', c.M, g.M); cmp('ever', c.ever, g.ever);
for (let k = 0; k < 2; k++) { cmp(`G${k}`, c.G[k], g.G[k]); cmp(`D${k}`, c.D[k], g.D[k]); }
if (process.argv[5]) { let shown = 0; for (let i = 0; i < c.W.length && shown < 12; i++) if (Math.abs(c.W[i] - g.W[i]) > 1e-4 || c.M[i] !== g.M[i] || Math.abs(c.s[i] - g.s[i]) > 1e-4) { shown++; console.log(`cell ${i % N},${(i / N) | 0} W ${c.W[i].toFixed(5)} ${g.W[i].toFixed(5)}  s ${c.s[i].toFixed(5)} ${g.s[i].toFixed(5)}  M ${c.M[i]} ${g.M[i]}`); } }
const tot = a => a.reduce((s, v) => s + v, 0), cells = a => a.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
console.log('total W cpu', tot(c.W).toFixed(3), 'gpu', tot(g.W).toFixed(3), ' s cpu', tot(c.s).toFixed(3), 'gpu', tot(g.s).toFixed(3), ' G0 cpu', tot(c.G[0]).toFixed(3), 'gpu', tot(g.G[0]).toFixed(3), ' cells with W cpu', cells(c.W), 'gpu', cells(g.W));
console.log('hair water cpu', bc.hairs.slice(0, 4).map(h => h.water.toFixed(3)).join(' '), 'gpu', bg.hairs.slice(0, 4).map(h => h.water.toFixed(3)).join(' '));
console.log('belly cpu', bc.resW.toFixed(3), 'gpu', bg.resW.toFixed(3), 'rng cpu', bc.rs.s, 'gpu', bg.rs.s);
g._gpu.close(); process.exit(0);
