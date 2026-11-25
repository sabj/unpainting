import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet } from './sheet.mjs';
import { createBrush, dip, stroke } from './brush.mjs';

// A 12 mm flat (the painter's section brush) dragged once, light and fast, over dry cold-press paper at 0.1 mm a cell.
function drag(water, mm = 0.1) {
  const w = Math.round(50 / mm), h = Math.round(20 / mm);
  const paper = makePaper(w, h, { seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm } }), sheet = createSheet(paper, [{ K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85 }]);
  const r = 6 / mm, b = createBrush({ model: 'section', flat: true, radius: r, bristles: Math.ceil(r * 2), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, seed: 70 });
  dip(b, { water, conc: [1.5] });
  stroke(b, sheet, [{ x: 5 / mm, y: 10 / mm, p: 0.35 }, { x: 45 / mm, y: 10.5 / mm, p: 0.35 }], { upright: 'sweep', speed: 250 });
  // the band the stroke crossed, away from its ends
  const cells = []; for (let y = 0; y < h; y++) for (let x = Math.round(8 / mm); x < Math.round(42 / mm); x++) if (Math.abs((y + 0.5) * mm - 10.25) < 5) cells.push(y * w + x);
  const med = Float32Array.from(cells, i => paper.height[i]).sort()[cells.length >> 1];
  let tot = 0, above = 0, cover = 0;
  for (const i of cells) { const m = sheet.G[0][i] + sheet.D[0][i] + sheet.P[0][i]; tot += m; if (paper.height[i] > med) above += m; if (m > 1e-4) cover++; }
  return { tot, above: above / tot, cover: cover / cells.length };
}

test('a nearly dry brush dragged over the paper leaves its paint on the crests, a loaded one covers the hollows too', () => {
  const dryB = drag(0.18), wet = drag(0.5);
  console.log(`nearly dry: ${(100 * dryB.above).toFixed(1)}% of the paint above the median height, ${(100 * dryB.cover).toFixed(0)}% of the band touched; loaded: ${(100 * wet.above).toFixed(1)}%, ${(100 * wet.cover).toFixed(0)}%`);
  assert.ok(dryB.tot > 0 && dryB.above > 0.7, `nearly dry brush: ${dryB.above} of its paint above the median`);
  assert.ok(dryB.cover < 0.8, `nearly dry brush touched ${dryB.cover} of the band: white hollows between`);
  assert.ok(wet.cover > 0.95 && wet.above < 0.6, `loaded brush: cover ${wet.cover}, ${wet.above} above the median`);
});
