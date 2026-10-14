import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, step, dry } from './sheet.mjs';
import { resetChecks, setStrict, continuedSummary } from '../paint/checks.mjs';

const pigments = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }];
const wetBlock = () => {
  const w = 32, sheet = createSheet(makePaper(w, w, { seed: 5 }), pigments);
  for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) deposit(sheet, y * w + x, 0.8, [0.05]);
  step(sheet);
  return sheet;
};
const quiet = fn => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const pigmentTotal = sheet => sheet.G[0].reduce((a, v) => a + v, 0) + sheet.D[0].reduce((a, v) => a + v, 0) + sheet.P[0].reduce((a, v) => a + v, 0) + sheet.layers.reduce((a, L) => a + L[0].reduce((b, v) => b + v, 0), 0);

test('dry() past its limit lets the water left stand where it is, fixes the wash, and records the check', () => {
  resetChecks();
  const sheet = wetBlock(), before = pigmentTotal(sheet);
  const t = quiet(() => dry(sheet, 5));
  assert.equal(t, 5);
  assert.ok(sheet.M.every(v => v === 0) && sheet.W.every(v => v === 0), 'the sheet is dry afterwards');
  assert.ok(Math.abs(pigmentTotal(sheet) - before) < 1e-3 * before, 'no pigment is lost');
  const c = continuedSummary().checks['Sheet is still wet after dry() limit'];
  assert.equal(c.count, 1);
  assert.equal(c.examples[0].max, 5);
  assert.ok(c.examples[0].wetCells > 0 && c.examples[0].water > 0);
  resetChecks();
});

test('dry() past its limit still stops the run under strict', () => {
  resetChecks(); setStrict(true);
  try { assert.throws(() => dry(wetBlock(), 5), /Sheet is still wet after dry\(\) limit/); }
  finally { resetChecks(); }
});
