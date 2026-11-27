import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, coherent, DEFAULTS } from './sheet.mjs';
import { createBrush, dip, stroke } from './brush.mjs';

// A 12 mm flat (the painter's section brush) dragged once, light and fast, over dry cold-press paper at 0.1 mm a cell.
function drag(water, mm = 0.1, pressure = 0.35, attach = null) {
  const w = Math.round(50 / mm), h = Math.round(20 / mm);
  const paper = makePaper(w, h, { seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm } }), sheet = createSheet(paper, [{ K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85 }]);
  attach?.(sheet);
  const r = 6 / mm, b = createBrush({ model: 'section', flat: true, radius: r, bristles: Math.ceil(r * 2), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, seed: 70 });
  dip(b, { water, conc: [1.5] });
  stroke(b, sheet, [{ x: 5 / mm, y: 10 / mm, p: pressure }, { x: 45 / mm, y: 10.5 / mm, p: pressure }], { upright: 'sweep', speed: 250 });
  coherent(sheet);
  // the band the stroke crossed, away from its ends
  const cells = []; for (let y = 0; y < h; y++) for (let x = Math.round(8 / mm); x < Math.round(42 / mm); x++) if (Math.abs((y + 0.5) * mm - 10.25) < 5) cells.push(y * w + x);
  const med = Float32Array.from(cells, i => paper.height[i]).sort()[cells.length >> 1];
  let tot = 0, above = 0, cover = 0;
  for (const i of cells) { const m = sheet.G[0][i] + sheet.D[0][i] + sheet.P[0][i]; tot += m; if (paper.height[i] > med) above += m; if (m > 1e-4) cover++; }
  return { tot, above: above / tot, cover: cover / cells.length, sheet };
}

test('a nearly dry brush dragged over the paper leaves its paint on the crests, a loaded one covers the hollows too', () => {
  const dryB = drag(0.18), wet = drag(1);
  console.log(`nearly dry: ${(100 * dryB.above).toFixed(1)}% of the paint above the median height, ${(100 * dryB.cover).toFixed(0)}% of the band touched; loaded: ${(100 * wet.above).toFixed(1)}%, ${(100 * wet.cover).toFixed(0)}%`);
  assert.ok(dryB.tot > 0 && dryB.above > 0.7, `nearly dry brush: ${dryB.above} of its paint above the median`);
  assert.ok(dryB.cover < 0.8, `nearly dry brush touched ${dryB.cover} of the band: white hollows between`);
  assert.ok(wet.cover > 0.95 && wet.above < 0.6, `loaded brush: cover ${wet.cover}, ${wet.above} above the median`);
});

test('low-water section contact agrees on CPU and GPU sheets', async t => {
  const { attachGpu } = await import('./gpu/link.mjs');
  let gpu;
  try {
    for (const water of [0.2, 0.4, 0.6]) {
      const cpu = drag(water, 0.26, 0.9);
      let other;
      try {
        other = drag(water, 0.26, 0.9, sheet => {
          attachGpu(sheet, { ...DEFAULTS, edgeEvap: 0 }, { mode: 'on', log: () => {} });
          gpu = sheet._gpu;
        });
      } catch (e) {
        if (process.env.GPU_REQUIRED === '1' || !e.message.includes('no WebGPU adapter')) throw e;
        t.skip(e.message); return;
      }
      // Verify the stroke actually executed on the GPU Section brush (f32 + simultaneous midpoint lane-head exchange),
      // rather than falling back to CPU deposition, and matches CPU within tight field/mass/crest parity bounds.
      assert.ok((gpu.stats.sectionGpuStrokes ?? 0) > 0, `water ${water}: expected GPU section stroke`);
      assert.equal(gpu.stats.cpuStrokes ?? 0, 0, `water ${water}: expected zero CPU fallback strokes`);
      assert.ok(Math.abs(cpu.above - other.above) < 1e-3, `above, water ${water}: ${cpu.above} vs ${other.above}`);
      assert.ok(Math.abs(cpu.cover - other.cover) < 1e-3, `cover, water ${water}: ${cpu.cover} vs ${other.cover}`);
      for (const key of ['W', 's', 'G', 'D', 'P']) {
        const a = ['G', 'D', 'P'].includes(key) ? cpu.sheet[key][0] : cpu.sheet[key];
        const b = ['G', 'D', 'P'].includes(key) ? other.sheet[key][0] : other.sheet[key];
        let maxD = 0, sumD = 0, sumA = 0, sumB = 0;
        for (let i = 0; i < a.length; i++) {
          const d = Math.abs(a[i] - b[i]);
          if (d > maxD) maxD = d;
          sumD += d; sumA += a[i]; sumB += b[i];
        }
        assert.ok(maxD < 2e-4, `${key}, water ${water}: max diff ${maxD}`);
        assert.ok(sumD / a.length < 1e-5, `${key}, water ${water}: mean diff ${sumD / a.length}`);
        if (sumA > 0) assert.ok(Math.abs(sumB - sumA) / sumA < 5e-4, `${key}, water ${water}: rel mass diff ${(sumB - sumA) / sumA}`);
      }
      gpu.close(); gpu = null;
    }
  } finally { gpu?.close(); }
});

for (const mm of [0.26, 0.1]) test(`a fast flat leaves progressively fuller broken marks at water 0.2, 0.4, 0.6 (${mm} mm)`, () => {
  const marks = [0.1, 0.2, 0.4, 0.6, 1].map(w => drag(w, mm, 0.9));
  console.log(`dry card ${mm} mm: ${marks.map(m => `${(100 * m.cover).toFixed(1)}% cover, ${(100 * m.above).toFixed(1)}% on crests`).join('; ')}`);
  for (const m of marks) assert.ok(m.tot > 0, 'a damp brush still releases pigment');
  assert.ok(marks[1].above > 0.7 && marks[1].cover < 0.7, 'low-water pigment stays on the crests');
  assert.ok(marks[2].cover < 0.9, 'half a load has not bridged every pit');
  for (let j = 1; j < marks.length; j++) assert.ok(marks[j].cover > marks[j - 1].cover, 'coverage grows with water');
  assert.ok(marks.at(-1).cover > 0.95, 'a full load reaches the hollows');
});
