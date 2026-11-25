// A loaded hair lets its free liquid go by contact (033 drying2, brush-review item 2): pressure already sets how many
// hairs touch and how deep into the tooth they reach (the footprint, the contact share, the bridge), so a lighter touch
// of the same brush gives the cells it does touch the same free liquid. Counting pressure again in the release made a
// landing or lifting hand lay 30-60% less paint, and every fresh load of a wash dried outlined by a pale band
// (scrap-seam.test.mjs). Variety off, so the hand does not land or lift.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet } from './sheet.mjs';
import { createBrush, dip, stroke } from './brush.mjs';

const lay = p => {
  const w = 160, h = 60, sheet = createSheet(makePaper(w, h, { seed: 3, tooth: 0, fibres: 0 }), [{ K: [0.3, 0.6, 1], S: [0.05, 0.05, 0.05], rho: 0.06, omega: 1, gamma: 0.5 }]);
  const b = createBrush({ flat: true, model: 'row', radius: 12, bristles: 24, capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0, stiffness: 8, seed: 5, variety: 0 });
  dip(b, { water: 0.62, conc: [0.5] });
  stroke(b, sheet, [{ x: 20, y: 30, p, r: 12 }, { x: 140, y: 30, p, r: 12 }], { upright: 'sweep', spacing: 1.4 });
  let water = 0, pig = 0, n = 0;
  for (let y = 26; y <= 34; y++) for (let x = 60; x <= 100; x++) { const i = y * w + x; water += sheet.W[i] + sheet.s[i]; pig += sheet.G[0][i] + sheet.D[0][i] + sheet.P[0][i]; n++; }
  return { water: water / n, pig: pig / n };
};

test('a light touch of a loaded brush gives the cells it touches the free liquid a full press gives', () => {
  const full = lay(0.9), light = lay(0.5);
  assert.ok(full.water > 0.05, `full press laid water ${full.water}`);
  assert.ok(light.water > 0.9 * full.water, `water per touched cell: light ${light.water.toFixed(4)} against full ${full.water.toFixed(4)}`);
  assert.ok(light.pig > 0.9 * full.pig, `pigment per touched cell: light ${light.pig.toFixed(4)} against full ${full.pig.toFixed(4)}`);
});
