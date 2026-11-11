import test from 'node:test';
import assert from 'node:assert/strict';
import { createPen, dipPen, penStroke } from './pen.mjs';
import { createSheet, step, dry, DEFAULTS } from './sheet.mjs';
import { makePaper } from './paper.mjs';
import { resetChecks, continuedSummary } from './checks.mjs';

// Ink a pen gives to paper it finds damp goes into the pores. That water dries like any other: the dry steps until the
// pores are empty, rather than finding nothing to step and leaving it to the dry limit (the ink dark match's scrap
// sheet, --inkrecipe v2's inkdamp 0.3).
const pig = { K: [0.396, 0.481, 0.619], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0 };
const quiet = fn => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };
const inkThenDry = damp => {
  const w = 64, h = 48, sheet = createSheet(makePaper(w, h, { seed: 3 }), [pig]);
  step(sheet); // a step over dry paper: the sheet's record of where it is wet is now clean and empty
  const pen = createPen({ damp });
  dipPen(pen, [4]);
  penStroke(pen, sheet, Array.from({ length: 30 }, (_, k) => ({ x: 10 + k, y: 20 + k / 3, p: 0.6, v: 1 })));
  const pores = () => { let n = 0; for (let i = 0; i < sheet.n; i++) if (sheet.M[i] || sheet.s[i] > 0.02 * sheet.paper.capacity[i]) n++; return n; };
  const before = pores();
  const steps = quiet(() => dry(sheet, 20000, DEFAULTS, { level: 60, levelMax: 90, dt: 6 }));
  return { before, steps, after: pores(), limit: continuedSummary().checks['Sheet is still wet after dry() limit']?.count ?? 0 };
};

for (const damp of [0, 0.3]) test(`ink from a pen that finds the paper ${damp} damp dries by the physics, not at the dry limit`, () => {
  resetChecks();
  try {
    const r = inkThenDry(damp);
    assert.ok(r.before > 0, 'the stroke wetted the paper');
    assert.ok(r.steps > 0, `the dry stepped the damp pores (${r.steps} steps)`);
    assert.equal(r.after, 0);
    assert.equal(r.limit, 0, 'no water was left for the dry limit');
  } finally { resetChecks(); }
});
