// The dry brush's narrowest line is measured on a swatch, in cells, so it halves in mm when the cell does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { measureDryBrush, measurePoint, swatchAt, SCALE_LIMIT, CONTINUITY } from './brush-swatch.mjs';

test('the brush lays a line about two and a half cells wide whatever its nominal radius, and it holds along its length', () => {
  const s = measureDryBrush({ mmPerCell: 0.258, radii: [2, 4] });
  assert.equal(s.radii.length, 2);
  for (const o of s.radii) {
    assert.ok(o.widthMm > 0.4 && o.widthMm < 1.0, `radius ${o.radiusCells}: the visible line is ${o.widthMm} mm`);
    assert.ok(o.coreMm <= o.widthMm, 'the core is inside the extent');
    assert.ok(o.continuity >= CONTINUITY && o.stable, `holds along its length: ${o.continuity}`);
    assert.ok(o.areaPerCell > 1 && o.areaPerCell < 4, `paint per cell of length ${o.areaPerCell}`);
    assert.ok(o.footprintShare > 0.1 && o.footprintShare < 0.9);
  }
  assert.equal(s.narrowest.radiusCells, 2);
  assert.equal(swatchAt(s, 3.6).radiusCells, 4, 'the nearest radius measured');
  assert.equal(SCALE_LIMIT, 1.5);
});

test('at twice the density the same brush lays a line half as wide in millimetres', () => {
  const a = measureDryBrush({ mmPerCell: 0.258, radii: [2] }).narrowest.widthMm, b = measureDryBrush({ mmPerCell: 0.129, radii: [2] }).narrowest.widthMm;
  assert.ok(b < 0.65 * a && b > 0.4 * a, `${a} mm at 1x, ${b} mm at 2x`);
});

test('the rigger\'s point lays a line about two and a half cells wide, which holds only from a stable load, darker with more paint', () => {
  const a = measurePoint({ mmPerCell: 0.258 }), b = measurePoint({ mmPerCell: 0.129 });
  assert.ok(a.widthMm > 0.5 && a.widthMm < 0.9, `${a.widthMm} mm at 1x`);
  assert.ok(b.widthMm < 0.65 * a.widthMm && b.widthMm > 0.4 * a.widthMm, `${b.widthMm} mm at 2x`);
  assert.ok(a.stable && a.stable.continuity >= CONTINUITY, `a stable load: ${JSON.stringify(a.stable)}`);
  assert.ok(a.rows[0].continuity < a.rows.at(-1).continuity, 'a heavier load holds a line better');
  assert.ok(a.rows[0].stepLstar > a.rows.at(-1).stepLstar, 'and is darker');
  assert.ok(a.stable.depositPerLoad > 0.05 && a.stable.depositPerLoad < 0.2);
});
