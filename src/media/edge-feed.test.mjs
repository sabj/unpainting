import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, step, dry, thickness, totals, coherent, DEFAULTS } from './sheet.mjs';
import { edgeProfile } from './edge-feed.mjs';

const ultramarine = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3 };
const phthalo = { K: [0.4861, 0.2344, 0.1063], S: [0.02, 0.02, 0.02], rho: 0.032, omega: 20, gamma: 0 };
const paperAt = (n, mm) => makePaper(n, n, { seed: 9, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: mm, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } });
const O = { ...DEFAULTS, fixedBed: 1, granFill: 0, slideCap: 1 };
// a 20 mm puddle in the middle of a 26 mm sheet
function puddle(mm, pig, conc = 1.5) {
  const n = Math.round(26 / mm), s = createSheet(paperAt(n, mm), [pig]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot((x + 0.5) * mm - 13, (y + 0.5) * mm - 13) < 10) deposit(s, y * n + x, 0.3, [conc * 0.3]);
  return s;
}
// mean dried pigment in the outer mm of the puddle against its middle (more than 3 mm in), and the relative spread of
// the middle's cells
function rimAndGrain(s, mm) {
  const t = thickness(s)[0], n = s.w; let r = 0, rn = 0, c = 0, c2 = 0, cn = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = 10 - Math.hypot((x + 0.5) * mm - 13, (y + 0.5) * mm - 13), v = t[y * n + x]; if (d > 0 && d < 1) { r += v; rn++; } else if (d > 3) { c += v; c2 += v * v; cn++; } }
  const m = c / cn; return { rim: r / rn / m, grain: Math.sqrt(Math.max(0, c2 / cn - m * m)) / m };
}

test('the edge profile averages to one over its band at any cell size', () => {
  for (const mm of [0.1, 0.25, 0.5]) { let s = 0; for (let k = 0; k * mm < 1 - 1e-9; k++) s += edgeProfile(k * mm, (k + 1) * mm, 1) * mm; assert.ok(Math.abs(s - 1) < 1e-9, `${mm}: ${s}`); }
});

test('a poured puddle dries darker at its rim in the full and the fast dry, at two cell sizes', () => {
  for (const mm of [0.25, 0.5]) for (const opts of [{ levelMax: 200 }, { levelMax: 200, dt: 14, analyticTail: true }]) {
    const s = puddle(mm, ultramarine); dry(s, 200000, O, opts);
    const { rim } = rimAndGrain(s, mm);
    assert.ok(rim > 1.2 && rim < 3, `${mm} mm, dt ${opts.dt ?? 2}: rim ${rim.toFixed(2)}`);
  }
});

test('a granulating pigment grains in the paper and a staining one stays smooth', () => {
  const g = puddle(0.25, ultramarine), p = puddle(0.25, phthalo, 1.2); dry(g, 200000, O, { levelMax: 200 }); dry(p, 200000, O, { levelMax: 200 });
  const a = rimAndGrain(g, 0.25).grain, b = rimAndGrain(p, 0.25).grain;
  assert.ok(a > 0.05 && a > 2 * b, `granulating ${a.toFixed(3)}, staining ${b.toFixed(3)}`);
});

test('water and pigment are conserved to 0.1% through the drying, with the edge evaporation counted', () => {
  // no pores (absorb, capRate 0): damp pores drop their last trace when they dry, a sink of their own
  const s = puddle(0.25, ultramarine), a = totals(s), o = { ...O, evap: 0, paperDry: 0, absorb: 0, capRate: 0, dt: 2 };
  s.edgeEvaporated = 0;
  for (let k = 0; k < 300; k++) step(s, o);
  const b = totals(s);
  assert.ok(s.edgeEvaporated > 0.05 * a.water, 'the edge dried');
  assert.ok(Math.abs(b.water + s.edgeEvaporated - a.water) < 1e-3 * a.water, `water ${b.water} + ${s.edgeEvaporated} against ${a.water}`);
  assert.ok(Math.abs(b.pig[0] - a.pig[0]) < 1e-3 * a.pig[0], `pigment ${b.pig[0]} against ${a.pig[0]}`);
});

test('the three wash sheets dry the same on the GPU as on the CPU without the edge feed (which the GPU refuses)', async t => {
  const { attachGpu } = await import('./gpu/link.mjs');
  const o = { ...O, edgeEvap: 0 }, mm = 0.5;
  const cases = {
    puddle: s => put(s, () => { const n = s.w; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot((x + 0.5) * mm - 13, (y + 0.5) * mm - 13) < 10) deposit(s, y * n + x, 0.3, [0.45]); }),
    square: s => { const n = s.w; for (let k = 0; k < 5; k++) { put(s, () => { for (let y = Math.round((3 + 4 * k) / mm); y < Math.round((7 + 4 * k) / mm); y++) for (let x = Math.round(3 / mm); x < Math.round(23 / mm); x++) deposit(s, y * n + x, 0.12, [0.07]); }); for (let q = 0; q < 20; q++) step(s, o); } },
    bloom: s => { const n = s.w; put(s, () => { for (let y = Math.round(3 / mm); y < Math.round(23 / mm); y++) for (let x = Math.round(3 / mm); x < Math.round(23 / mm); x++) deposit(s, y * n + x, 0.2, [0.05]); }); for (let q = 0; q < 600; q++) step(s, o); put(s, () => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot((x + 0.5) * mm - 13, (y + 0.5) * mm - 13) < 4) deposit(s, y * n + x, 0.25, [0.01]); }); },
  };
  // laid straight into the arrays, so a GPU sheet is brought down first and told after
  const put = (s, f) => { if (s._gpu) { coherent(s); f(); s._gpu.cpuWroteAll(); } else f(); };
  for (const [name, lay] of Object.entries(cases)) {
    const cpu = createSheet(paperAt(52, mm), [ultramarine]), gpu = createSheet(paperAt(52, mm), [ultramarine]);
    const info = attachGpu(gpu, o, { mode: 'auto', log: () => {} });
    if (info.backend !== 'gpu') { t.skip(`no GPU: ${info.reason}`); return; }
    try {
      for (const s of [cpu, gpu]) { lay(s); dry(s, 200000, o, { levelMax: 200 }); }
      const a = thickness(cpu)[0], b = thickness(gpu)[0]; let peak = 0, worst = 0, sum = 0;
      for (let i = 0; i < a.length; i++) { peak = Math.max(peak, a[i]); worst = Math.max(worst, Math.abs(a[i] - b[i])); sum += Math.abs(a[i] - b[i]); }
      assert.ok(worst < 0.02 * peak && sum / a.length < 2e-3 * peak, `${name}: worst ${worst} mean ${sum / a.length} against peak ${peak}`);
    } finally { gpu._gpu?.close?.(); }
  }
});
