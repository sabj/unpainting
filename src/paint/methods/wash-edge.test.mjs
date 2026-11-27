import test from 'node:test';
import assert from 'node:assert/strict';
import { organicOutline, edgeWanderMm, EDGE_HAND } from './wash-edge.mjs';
import { areaOf } from './script-marks.mjs';

const square = [[10, 10], [60, 10], [60, 60], [10, 60]];

test('the outline is seeded, rounded and wanders within its bound', () => {
  const a = organicOutline(square, { seed: 3 }), b = organicOutline(square, { seed: 3 }), c = organicOutline(square, { seed: 4 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.length > 40);
  const amp = edgeWanderMm(square);
  assert.ok(amp >= EDGE_HAND.least && amp <= EDGE_HAND.most);
  // no point at the sharp corner: it is rounded off
  assert.ok(Math.min(...a.map(([x, y]) => Math.hypot(x - 10, y - 10))) > 1);
  // area kept near the guide's
  assert.ok(Math.abs(areaOf([a]) - areaOf([square])) / areaOf([square]) < 0.12);
  // every point within the wander (plus the corner rounding) of the square's edge
  for (const [x, y] of a) { const d = Math.min(Math.abs(x - 10), Math.abs(x - 60), Math.abs(y - 10), Math.abs(y - 60)); assert.ok(d <= amp + 0.1 || (x > 10 && x < 60 && y > 10 && y < 60)); }
});

test('a wetter wash wanders more than a drier one', () => {
  assert.ok(edgeWanderMm(square, 'wet') > edgeWanderMm(square, 'dry'));
});

test('a small part keeps its size under the organic edge, and every part of a wash gets a lane, whatever the seed', async () => {
  const fs = await import('node:fs'), { sweeps, handOf, inside } = await import('./script-marks.mjs'), { passageStrokes } = await import('./script-washes.mjs');
  // flank3 (tiny-touch.fixture.json): four parts, one a 28 mm2 sliver that once got no stroke at all
  const f = JSON.parse(fs.readFileSync(new URL('./tiny-touch.fixture.json', import.meta.url), 'utf8')), s = f.alongItsLength.script, p = s.passages[0];
  const lights = (s.lights ?? []).map(l => l.region ?? l), reach = s.brushes[p.brush].widthMm / 2;
  for (let k = 0; k < 16; k++) {
    for (const [q, P] of p.regions.entries()) { const o = organicOutline(P, { seed: `${k}/${p.id}/${q}`, wetness: 'wet' }); assert.ok(areaOf([o]) >= 0.6 * areaOf([P]), `seed ${k}, part ${q}: keeps ${areaOf([o]).toFixed(1)} of ${areaOf([P]).toFixed(1)} mm2`); }
    const st = passageStrokes(p, s.brushes, k, lights);
    for (const [q, P] of p.regions.entries()) assert.ok(st.some(t => t.points.some(([x, y]) => inside([P], x, y) || P.some(([px, py]) => Math.hypot(px - x, py - y) < reach))), `seed ${k}: part ${q} has no lane`);
  }
  // a part wholly under a light stays paper: no lane is added for it
  const sliver = p.regions[2], big = p.regions[3];
  const lit = sweeps([big, sliver], { widthMm: 13, deg: -29, pressure: 0.8, rng: handOf('lit'), hand: 1, lights: [[[90, 205], [110, 205], [110, 226], [90, 226]]] });
  assert.ok(!lit.some(t => t.points.some(([x, y]) => inside([sliver], x, y))), 'no lane in a part the lights keep');
});
