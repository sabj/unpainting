// A wash laid with the form (script-marks.mjs sweeps, wash-form.mjs): bent lanes whose pressure rises and falls along
// them, painted on the GPU sheet against the CPU sheet. Skipped where there is no GPU or no `webgpu` package.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, step, dry, thickness, DEFAULTS as SHEET_DEFAULTS } from './sheet.mjs';
import { createBrush, dip, stroke } from './brush.mjs';
import { attachGpu, gpuStats } from './gpu/link.mjs';
import { sweeps, handOf } from '../paint/methods/script-marks.mjs';

// the edge flow off, as in gpu-backend.test.mjs (its feed's parity is tested on its own)
const DEFAULTS = { ...SHEET_DEFAULTS, edgeEvap: 0 };
const pigments = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }];
const N = 96;
// a crescent, a cell a millimetre: the lanes run round it, pressed harder in their middles
const crescent = (() => { const P = []; for (let k = 0; k <= 24; k++) { const a = Math.PI * (0.15 + 0.7 * k / 24); P.push([48 + 40 * Math.cos(a), 70 - 40 * Math.sin(a)]); } for (let k = 24; k >= 0; k--) { const a = Math.PI * (0.15 + 0.7 * k / 24); P.push([48 + 30 * Math.cos(a), 74 - 30 * Math.sin(a)]); } return P; })();
const bent = sweeps([crescent], { widthMm: 6, deg: 'form', path: 'curved', pressure: [0.4, 1, 0.5], rng: handOf('gpu') });
// the same wash as lanes were laid before (level, one pressure): the GPU's own distance from the CPU for this brush
const straight = sweeps([crescent], { widthMm: 6, deg: 0, pressure: 0.8, rng: handOf('gpu') });

function paint(sheet, O, lanes) {
  const brush = createBrush({ radius: 3, wetMix: 0.5, capacity: 60, seed: 3 });
  for (const st of lanes) {
    dip(brush, { water: 1, conc: [0.6] });
    stroke(brush, sheet, st.points.map(([x, y, p]) => ({ x, y, p, r: st.radiusMm })), { gpuBetween: true, between: k => { if (k % 6 === 0) step(sheet, O); } });
  }
  for (let q = 0; q < 30; q++) step(sheet, O);
  dry(sheet, 3000, O, { level: 60, levelMax: 90, dt: 6 });
  return thickness(sheet);
}
const fresh = () => createSheet(makePaper(N, N, { seed: 5 }), pigments);
const stats = (a, b) => { let max = 0, sum = 0; for (let k = 0; k < a.length; k++) for (let i = 0; i < a[k].length; i++) { const d = Math.abs(a[k][i] - b[k][i]); if (d > max) max = d; sum += d; } return { max, mean: sum / (a.length * a[0].length) }; };
const peak = t => Math.max(...t.map(a => a.reduce((m, v) => Math.max(m, v), 0)));

// A round laying many lapped strokes parts from the CPU by more than float noise already (straight lanes: a mean of
// about 3e-6 against a floor of 1e-7, on the Mac mini). Bent lanes with a pressure list must keep within that same gap.
test('bent lanes with a pressure list paint on the GPU as close to the CPU as straight lanes do', { timeout: 600000 }, t => {
  assert.ok(bent.length >= 3 && bent.filter(s => s.points.length > 20).length >= 1, `${bent.length} strokes`);
  const O = { ...DEFAULTS, gran: 0.25 }, gap = lanes => {
    const ref = paint(fresh(), O, lanes), g = fresh(), info = attachGpu(g, O, { mode: 'auto', log: () => {} });
    if (info.backend !== 'gpu') return null;
    try { const out = paint(g, O, lanes); assert.ok(gpuStats(g).strokes >= lanes.length, 'the lanes were laid on the GPU'); return { ...stats(out, ref), scale: peak(ref) }; } finally { g._gpu.close(); }
  };
  const s = gap(straight); if (!s) { t.skip('no GPU'); return; }
  const b = gap(bent); console.log(JSON.stringify({ straight: s, bent: b }));
  assert.ok(b.mean <= 1.5 * s.mean + 1e-7 * b.scale, `mean difference ${b.mean} bent against ${s.mean} straight`);
  assert.ok(b.max <= 2 * s.max + 1e-4 * b.scale, `max difference ${b.max} bent against ${s.max} straight`);
});
