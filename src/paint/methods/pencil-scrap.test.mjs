// The pencil tried on a scrap of the paper: how dark its line reads at each pressure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pencilScrap, SCRAP_PRESSURES } from './pencil-scrap.mjs';
import { pressureFor } from './line-weight.mjs';

const MM = 0.26;

test('a firmer pencil reads darker and draws wider, the same every time', () => {
  const t = pencilScrap({ medium: 'graphite-HB', mmPerCell: MM });
  assert.deepEqual(t.map(r => r.pressure), [...SCRAP_PRESSURES]);
  for (let k = 1; k < t.length; k++) assert.ok(t[k].drop >= t[k - 1].drop && t[k].widthMm > t[k - 1].widthMm, JSON.stringify(t));
  assert.ok(t[0].drop > 0.3 && t[0].drop < 3, `the lightest touch is nearly paper: ${t[0].drop}`);
  assert.ok(t.at(-1).drop > 4 * t[0].drop, `full pressure ${t.at(-1).drop} against ${t[0].drop}`);
  assert.deepEqual(pencilScrap({ medium: 'graphite-HB', mmPerCell: MM }), t, 'deterministic');
});

test('a softer pencil is darker at the same pressure', () => {
  const hb = pencilScrap({ medium: 'graphite-HB', mmPerCell: MM, pressures: [0.5, 1] }), b2 = pencilScrap({ medium: 'graphite-2B', mmPerCell: MM, pressures: [0.5, 1] });
  assert.ok(b2[0].drop > 1.5 * hb[0].drop && b2[1].drop > 1.5 * hb[1].drop, `${JSON.stringify(hb)} ${JSON.stringify(b2)}`);
});

test('the pressure the table gives for a darkness draws a line that dark', () => {
  const t = pencilScrap({ medium: 'graphite-HB', mmPerCell: MM }), want = (t[4].drop + t[5].drop) / 2;
  const p = pressureFor(want, t, { floor: 0.1 }), [got] = pencilScrap({ medium: 'graphite-HB', mmPerCell: MM, pressures: [p] });
  assert.ok(Math.abs(got.drop - want) < 0.1 * want, `asked ${want} L*, drew ${got.drop} at pressure ${p}`);
});

test('only a pencil is tried, on a sheet with a size', () => {
  assert.throws(() => pencilScrap({ medium: 'sepia-ink', mmPerCell: MM }), /not a pencil/);
  assert.throws(() => pencilScrap({ medium: 'graphite-HB', mmPerCell: 0 }), /positive/);
});
