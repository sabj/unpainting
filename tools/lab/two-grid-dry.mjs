// Awaited observer for the experimental GPU fine transport. Keep the ordinary
// dry() levelling schedule: real time first, then dt=2 after surface convergence.
// No analytic tail or drying-in-place is permitted in this proof driver.
import { dry, step, fix } from '../../src/media/sheet.mjs';
import { levelEvery } from '../../src/media/time-chunks.mjs';

export async function dryFine(F, transport = null, { max = 200000, level = 60, levelMax = 200, levelTol = .02, dt = 2, onStep = () => {}, observeEachStep = false } = {}) {
  const s = F.sheet, o = F.o;
  if (!transport) {
    const count = dry(s, max, o, { level, levelMax, levelTol, dt, onStep: t => { F.step(); onStep(t); } });
    F.fix(); return count;
  }
  const surfaceLevel = () => {
    const height = s.paper.surface || s.paper.valley || s.paper.height, slope = o.slope ?? 0;
    let most = 0;
    for (let i = 0; i < s.n; i++) if (s.M[i]) {
      const here = s.W[i] + slope * height[i];
      if (i % s.w < s.w - 1 && s.M[i + 1]) most = Math.max(most, Math.abs(here - (s.W[i + 1] + slope * height[i + 1])));
      if (i + s.w < s.n && s.M[i + s.w]) most = Math.max(most, Math.abs(here - (s.W[i + s.w] + slope * height[i + s.w])));
    }
    return most;
  };
  let fast = false, t = 0;
  const slow = { ...o, dt: o.dt }, quick = { ...o, dt };
  const keepResident = typeof transport.syncHost === 'function' && !observeEachStep;
  const stepOpts = keepResident ? { keepResident: true } : null;
  try {
    for (; t < max; t++) {
      if (!fast && t >= level && (t >= levelMax || (t % levelEvery(false) === 0 && surfaceLevel() < levelTol))) fast = true;
      if (!step(s, fast ? quick : slow)) break;
      await F.stepAsync(transport, stepOpts); onStep(t);
    }
    if (keepResident) await transport.syncHost(F);
  } catch (err) {
    if (keepResident) { try { await transport.syncHost(F); } catch {} }
    throw err;
  }
  if (t === max) throw new Error('two-grid proof is still wet at the drying limit');
  fix(s); F.fix(); return t;
}
