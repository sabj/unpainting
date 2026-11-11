// Scrap test: an area plan's dry brush pass is the technique library's dry brush (src/paint/methods/lay.mjs), so on
// cold-press tooth it skips the hollows and leaves paper showing, where the same plan's wet on dry fills them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, thickness, DEFAULTS } from '../../src/media/sheet.mjs';
import { BOX, boxPigment } from '../../src/crop/box.mjs';
import { layPassage, dryFully, TECHNIQUES } from '../../src/paint/methods/lay.mjs';
import { semanticTechnique } from './semantic-areas.mjs';

const O = { ...DEFAULTS, edgeEvap: 0.0012, gran: 0.25 };
const sienna = boxPigment(BOX.find(p => p.key === 'sienna'));
const W = 64, H = 64, N = W * H;
const mask = new Uint8Array(N); for (let y = 12; y < 52; y++) for (let x = 12; x < 52; x++) mask[y * W + x] = 1;
// the same pass, once wet on dry and once dry brush, each at the load the library gives that move
const pass = move => ({ move, load: { water: TECHNIQUES[move].water } });
const bare = T => {
  const sheet = createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), [sienna]);
  layPassage(sheet, mask, [1], { w: W, h: H, T, maxRadius: 8, seed: 3, O }); dryFully(sheet, O);
  const th = thickness(sheet)[0]; let b = 0, c = 0;
  for (let i = 0; i < N; i++) if (mask[i]) { c++; if (th[i] < 0.01) b++; }
  return b / c;
};

test('an area dry brush pass takes the library dry brush contact: the tooth shows where wet on dry fills it', () => {
  const dryT = semanticTechnique({ pass: pass('dry brush') }, {}), wetT = semanticTechnique({ pass: pass('wet on dry') }, {});
  for (const k of ['wetMix', 'bridge', 'bridgeSoft']) assert.equal(dryT[k], TECHNIQUES['dry brush'][k], k);
  const dry = bare(dryT), wet = bare(wetT);
  assert.ok(dry > wet + 0.1, `bare paper: dry brush ${dry.toFixed(2)}, wet on dry ${wet.toFixed(2)}`);
});
