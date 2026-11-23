import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet } from './sheet.mjs';
import { createBrush, dip, stroke } from './brush.mjs';
import { CpuDemandWindow } from './gpu/cpu-demand-window.mjs';
import { sectionContactLookahead } from './cpu-contact-lookahead.mjs';

const pig = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }];
const path = [{ x: 20, y: 60, p: 0.8 }, { x: 110, y: 40, p: 1 }, { x: 200, y: 75, p: 0.7 }];

// A section stroke on a CPU sheet behind a demand window that goes stale every `every` steps, as the GPU's flows make it.
function lay(flat, every, flowEvery) {
  const sheet = createSheet(makePaper(220, 120, { seed: 2, mmPerCell: 0.5 }), pig), reads = [];
  const win = sheet._cpuDemandWindow = new CpuDemandWindow(sheet.w, sheet.h, [sheet.W], r => reads.push(r.slice()));
  const b = createBrush({ model: 'section', flat, radius: flat ? 14 : 6, bristles: 24, capacity: 60, belly: 8, give: 0.9, seed: 5 });
  dip(b, { water: 1, conc: [0.4] });
  stroke(b, sheet, path, { between: s => { if (s % every === 0) win.afterFlow(); }, ...(flowEvery ? { flowEvery } : {}) });
  return { reads, W: Array.from(sheet.W) };
}

test('a section stroke reads where its hand goes next once a flow, not at every step its tuft moves on', () => {
  for (const flat of [true, false]) {
    const { reads } = lay(flat, 24, 24), steps = Math.ceil(200 / 0.7), flows = Math.floor(steps / 24);
    assert.ok(reads.length <= 2 * (flows + 1), `${reads.length} reads for ${flows} flows (${flat ? 'flat' : 'round'})`);
  }
});

test('reading ahead does not change what the stroke lays', () => {
  const a = lay(true, 24, 24), b = lay(true, 24, 0);
  assert.deepEqual(a.W, b.W);
});

test('the read ahead covers the hand and the widest tuft at each of the next steps', () => {
  const b = { radius: 10 }, r = sectionContactLookahead(b, path, { k: 1, t: 0, spacing: 0.7, count: 40, w: 220, h: 120 });
  for (let j = 0; j < 40; j++) {
    const x = 20 + 90 * (0.7 * j) / Math.hypot(90, 20), y = 60 - 20 * (0.7 * j) / Math.hypot(90, 20);
    assert.ok(r[0] <= x - 14.5 && r[0] + r[2] >= x + 14.5 && r[1] <= y - 14.5 && r[1] + r[3] >= y + 14.5, `step ${j}`);
  }
});
