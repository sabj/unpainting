import test from 'node:test';
import assert from 'node:assert/strict';
import { scrapAbsorbance, inkCapOnScrap } from './ink-scrap.mjs';

const sepia = scale => ({ name: 'sepia ink', K: [0.396, 0.481, 0.619].map(v => v * scale), S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0 });
const scrap = { mmPerCell: 0.29, widthMm: 0.5 };

test('a scrap line darkens with the ink load and the ink strength', () => {
  const a = scrapAbsorbance({ ...scrap, pigment: sepia(1), conc: 2 }), b = scrapAbsorbance({ ...scrap, pigment: sepia(1), conc: 6 }), c = scrapAbsorbance({ ...scrap, pigment: sepia(4), conc: 6 });
  assert.ok(a > 0 && b > 1.5 * a && c > 1.5 * b, `${a} ${b} ${c}`);
  assert.equal(scrapAbsorbance({ ...scrap, pigment: sepia(1), conc: 2 }), a, 'deterministic');
  assert.throws(() => scrapAbsorbance({ ...scrap, pigment: sepia(1), conc: 0 }), /positive/);
});

test('the cap brings a near-black pen line to the target darkness', () => {
  const r = inkCapOnScrap({ ...scrap, pigment: sepia(4), conc: 6, targetAbsorbance: 0.8, cap: 1 });
  assert.ok(r.before > 3, `uncapped ${r.before}`);
  assert.ok(r.factor < 0.3, `factor ${r.factor}`);
  assert.ok(Math.abs(r.after - 0.8) < 0.1, `capped line ${r.after}`);
});

test('the cap never darkens a line already lighter than the target', () => {
  const r = inkCapOnScrap({ ...scrap, pigment: sepia(1), conc: 1, targetAbsorbance: 3, cap: 1 });
  assert.equal(r.factor, 1);
  assert.equal(r.after, r.before);
});
