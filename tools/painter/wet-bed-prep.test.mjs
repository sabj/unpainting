import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWetBed } from './wet-bed-prep.mjs';

// a bed the clean brush wets to glossy, the pickup takes to damp: the order and the brushes the sheet uses
test('a wet-into-wet bed is wetted by a clean brush made like the painting brush, then picked up with a thirsty one', () => {
  const calls = []; let bed = { moistShare: 0, waterP50: 0, waterMax: 0, saturationMax: 0 };
  const out = prepareWetBed({
    settings: { radius: 9, loadWater: 123, depositDepth: 0.2, wetMix: 0.85 }, bristles: 18, seed: 911, pigments: 3, target: 'sheet', points: ['p'], prepOpts: { lift: false },
    observe: () => bed, gate: () => ({ saturationMax: 0 }), advance: () => calls.push('advance'),
    createBrush: o => ({ o }), dip: (b, d) => calls.push(`dip ${d.water} [${d.conc}] depth ${b.o.depositDepth} load ${b.o.loadWater} bridge ${b.o.bridge}`),
    thirsty: (_b, t) => calls.push(`thirsty ${t.water}`),
    stroke: (b, target, points) => { calls.push(`stroke ${target}`); bed = b.o.depositDepth === 0 && calls.some(c => c.startsWith('thirsty')) ? { moistShare: 1, waterP50: 0.1 } : { moistShare: 1, waterP50: 0.4 }; },
  });
  assert.deepEqual(calls, ['dip 0.55 [0,0,0] depth 0 load 123 bridge 0', 'stroke sheet', 'dip 0.08 [0,0,0] depth 0 load 123 bridge 0', 'thirsty 0.08', 'stroke sheet']);
  assert.equal(out.paper.waterP50, 0.1);
});
