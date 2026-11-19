// The rigger's point is tried on a scrap: what line it holds at each load, and the load that makes a step over a ground.
import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePoint, filmFor, stepOf, loadFor, lineHold, pointRadius, POINT, POINT_LOADS, HOLDS } from './point-swatch.mjs';

const MM = 0.258;
const palette = [{ name: 'dark', K: [1.6, 1.5, 1.2], S: [0.02, 0.02, 0.02] }, { name: 'blue', K: [1.4, 0.8, 0.2], S: [0.05, 0.05, 0.05] }];

test('the point holds a line at every load in every direction, darker with more paint, from a light line to near black', () => {
  const s = measurePoint({ mmPerCell: MM });
  assert.deepEqual(s.rows.map(r => r.conc), [...POINT_LOADS]);
  // the lightest touch tried holds only on a smoother sheet; every load from the next one up holds on this one
  for (const r of s.rows.slice(1)) assert.ok(r.holds && r.held >= HOLDS, `load ${r.conc} holds along ${r.held} of its length`);
  for (let k = 1; k < s.rows.length; k++) assert.ok(s.rows[k].drop >= s.rows[k - 1].drop && s.rows[k].thickness >= s.rows[k - 1].thickness, JSON.stringify(s.rows));
  assert.ok(s.lightest.drop < 8, `the lightest line is ${s.lightest.drop} L* darker than its paper`);
  assert.ok(s.heaviest.drop > 70, `the heaviest ${s.heaviest.drop}`);
  assert.ok(s.rows[0].spread < 3, `the three directions agree at a light load: ${s.rows[0].spread} L*`);
  assert.ok(s.widthMm > 0.5 && s.widthMm < 1.0, `${s.widthMm} mm at half depth`);
  assert.deepEqual(measurePoint({ mmPerCell: MM }), s, 'deterministic');
});

test('the point is a size in millimetres and never under a cell: at twice the density its line is finer and still holds', () => {
  assert.equal(pointRadius(0.4), 1); assert.ok(Math.abs(pointRadius(0.13) - 2) < 0.01);
  const a = measurePoint({ mmPerCell: MM, loads: [0.2, 1] }), b = measurePoint({ mmPerCell: MM / 2, loads: [0.2, 1] });
  assert.ok(b.lightest && b.rows.every(r => r.holds), JSON.stringify(b.rows));
  assert.ok(b.widthMm < a.widthMm, `${a.widthMm} mm at 1x, ${b.widthMm} mm at 2x`);
});

test('a starved point does not hold a line, and the swatch says so', () => {
  const s = measurePoint({ mmPerCell: MM, loads: [1, 3], point: { ...POINT, brush: { ...POINT.brush, capacity: 6, belly: 1, bridge: 0.2 } } });
  assert.ok(s.rows.every(r => !r.holds) && s.lightest === null && s.widthMm === null, JSON.stringify(s.rows));
});

test('another brush is read the same way, and one that is meant to break counts every load that leaves paint', () => {
  // the starved point again, as a brush that is not asked to hold a line: its loads are read, lightest to heaviest
  const point = { ...POINT, pressure: 0.85, brush: { ...POINT.brush, capacity: 6, belly: 1, bridge: 0.2 } }, s = measurePoint({ mmPerCell: MM, loads: [1, 3], point, hold: 0, upright: 'sweep' });
  assert.ok(s.rows.every(r => r.holds && r.drop > 0 && r.thickness > 0) && s.lightest.conc === 1 && s.heaviest.conc === 3, JSON.stringify(s.rows));
  assert.ok(s.rows.some(r => r.held < HOLDS), 'it breaks, and the swatch still says how much');
  assert.equal(s.settings.pressure, 0.85);
  const load = loadFor((s.rows[0].thickness + s.rows[1].thickness) / 2, s);
  assert.ok(load && load.conc > 1 && load.conc < 3, JSON.stringify(load));
});

test('the film for a step makes that step over its ground, and a darker ground needs a thicker film', () => {
  const shares = [0.7, 0.3];
  for (const ground of [[250, 248, 244], [150, 120, 100], [110, 95, 90]]) for (const drop of [6, 15, 30]) {
    const film = filmFor(drop, ground, palette, shares);
    assert.ok(film > 0 && Math.abs(stepOf(film, ground, palette, shares) - drop) < 0.6, `ground ${ground}, ${drop} L*: film ${film} reads ${stepOf(film, ground, palette, shares)}`);
  }
  assert.ok(filmFor(15, [70, 60, 55], palette, shares) > filmFor(15, [250, 248, 244], palette, shares));
  assert.equal(filmFor(0, [200, 200, 200], palette, shares), 0);
  assert.equal(filmFor(40, [12, 12, 12], palette, shares), null, 'no film makes a step the ground has no room for');
});

test('the load for a film is read between the swatch rows that hold, and not beyond them', () => {
  const swatch = { rows: [{ conc: 0.5, thickness: 0.1, widthMm: 0.7, holds: false }, { conc: 1, thickness: 0.2, widthMm: 0.7, holds: true }, { conc: 2, thickness: 0.4, widthMm: 0.8, holds: true }, { conc: 4, thickness: 0.6, widthMm: 0.9, holds: true }] };
  const l = loadFor(0.3, swatch);
  assert.ok(Math.abs(l.conc - 1.5) < 1e-9 && Math.abs(l.widthMm - 0.75) < 1e-9, JSON.stringify(l));
  assert.equal(loadFor(0.15, swatch), null, 'thinner than the lightest line that holds');
  assert.equal(loadFor(0.7, swatch), null, 'thicker than the heaviest tried');
  assert.ok(Math.abs(loadFor(0.6, swatch).conc - 4) < 1e-9);
});

test('a line with a gap is read as not holding', () => {
  const w = 60, h = 20, L = new Float32Array(w * h).fill(95);
  for (let x = 5; x < 55; x++) if (x < 25 || x >= 35) L[10 * w + x] = 60;
  const r = lineHold([[5, 10.5], [55, 10.5]], L, w, h, 0.25, 95);
  assert.ok(Math.abs(r.held - 0.8) < 0.03 && Math.abs(r.gapMm - 2.5) < 0.3, JSON.stringify(r));
});
