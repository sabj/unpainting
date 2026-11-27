import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet, deposit, DEFAULTS } from './sheet.mjs';
import { levelFilm } from './film-level.mjs';
import { filmMobility } from './film-mobility.mjs';

const PIG = { K: [0.3, 0.3, 0.3], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1, gamma: 0 };
const sum = a => a.reduce((s, v) => s + v, 0);
const O = { ...DEFAULTS, slope: 0, meniscus: 0, fibreFlow: 0, dt: 0.5 };
function pair(a, b) {
  const s = createSheet(makePaper(8, 8, { seed: 3, mmPerCell: 0.25 }), [PIG]);
  deposit(s, 27, a, [0.5 * a]); deposit(s, 28, b, [0.5 * b]);
  return s;
}

test('free-film conductance has cubic depth scaling and adds hydraulic resistances in series', () => {
  for (const floor of [0, 0.05]) {
    const thick = filmMobility(0.2 + floor, 0.2 + floor, floor);
    const thin = filmMobility(0.1 + floor, 0.1 + floor, floor);
    assert.ok(Math.abs(thick / thin - 8) < 1e-12);
    const neck = filmMobility(0.1 + floor, 0.2 + floor, floor);
    assert.ok(Math.abs(1 / neck - (1 / thin + 1 / thick) / 2) < 1e-9);
    assert.equal(neck, filmMobility(0.2 + floor, 0.1 + floor, floor));
    assert.equal(filmMobility(floor, 0.2 + floor, floor), 0);
  }
});

test('water held below shine-off does not add to a free film\'s levelling conductance', () => {
  const outcomes = [0, 0.05].map(floor => {
    const s = pair(0.1 + floor, 0.2 + floor), before = s.W.slice();
    const water = sum(s.W), paint = sum(s.G[0]);
    levelFilm(s, { ...O, levelFloor: floor }, [0, 0, 7, 7], 0.25);
    assert.ok(Math.abs(sum(s.W) / water - 1) < 1e-6);
    assert.ok(Math.abs(sum(s.G[0]) / paint - 1) < 1e-6);
    return [s.W[27] - before[27], s.W[28] - before[28]];
  });
  assert.ok(outcomes[0][0] > 0.01, 'the free film actually levelled');
  outcomes[0].forEach((v, i) => assert.ok(Math.abs(v - outcomes[1][i]) < 1e-7));
});

test('crossing the damp threshold by less than a nanometre cannot redirect a finite film or pigment mass', () => {
  // The bent-lane hardware trace first separated at W=0.050000146 on the
  // CPU and 0.049999636 on the GPU. Both must have a vanishing connection.
  const near = [0.049999636, 0.050000146].map(depth => {
    const s = pair(depth, 0.2), water = sum(s.W), paint = sum(s.G[0]);
    levelFilm(s, O, [0, 0, 7, 7], 0.25);
    assert.ok(Math.abs(sum(s.W) / water - 1) < 1e-6);
    assert.ok(Math.abs(sum(s.G[0]) / paint - 1) < 1e-6);
    return s;
  });
  for (const field of ['W', 'G']) {
    const a = field === 'G' ? near[0].G[0] : near[0].W;
    const b = field === 'G' ? near[1].G[0] : near[1].W;
    assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-6), `${field}: the marginal face has no finite jump`);
  }
});

test('even a large downhill levelling step cannot drain the water held in the tooth', () => {
  const s = pair(0.06, 0.06), water = sum(s.W), paint = sum(s.G[0]);
  s.tilt = { x: Math.sin(80 * Math.PI / 180), y: 0 };
  for (let t = 0; t < 5; t++) levelFilm(s, { ...O, dt: 14 }, [0, 0, 7, 7], 0.25);
  for (const i of [27, 28]) assert.ok(s.W[i] >= Math.fround(O.levelFloor), `held water ${s.W[i]}`);
  assert.ok(s.W[27] < 0.051, 'the free film actually ran downhill');
  assert.ok(Math.abs(sum(s.W) / water - 1) < 1e-6);
  assert.ok(Math.abs(sum(s.G[0]) / paint - 1) < 1e-6);
});
