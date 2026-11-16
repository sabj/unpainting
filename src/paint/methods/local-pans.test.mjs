import test from 'node:test';
import assert from 'node:assert/strict';
import { localPans } from './local-pans.mjs';
import { mixtureColour } from './palette-mix.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { channelDensity, unmix } from '../../crop/pigments.mjs';

const keys = ['hansa', 'cadred', 'ultramarine', 'cerulean', 'sapgreen', 'paynes'];
const P = keys.map(k => boxPigment(BOX.find(p => p.key === k))), at = k => keys.indexOf(k), PAPER = [252, 251, 248];
const masses = of => keys.map(k => of[k] ?? 0);

// A sheet in two local colours: an orange left half, a sky blue right half, each graded light to dark down the sheet.
function sheet(w = 24, h = 12) {
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = 0.6 + 0.8 * y / (h - 1);
    const c = mixtureColour(x < w / 2 ? masses({ hansa: 0.3 * t, cadred: 0.15 * t }) : masses({ ultramarine: 0.12 * t, cerulean: 0.08 * t }), P, PAPER);
    for (let ch = 0; ch < 3; ch++) rgb[(y * w + x) * 3 + ch] = c[ch];
  }
  return { rgb, w, h, D: channelDensity(rgb, w * h, PAPER) };
}

test('every cell takes only its local colour\'s pans, and the far side of the wheel stays out', () => {
  const { w, h, D } = sheet(), k = P.length, { A, colours } = localPans(D, w, h, P, PAPER, { families: 2 });
  assert.equal(colours.length, 2);
  const full = unmix(D, w * h, P.map(p => p.K.map(v => v / 0.55)));
  let fullPans = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, used = keys.filter((_, j) => A[i * k + j] > 1e-4);
    const blue = x >= w / 2;
    for (const kk of blue ? ['hansa', 'cadred', 'sapgreen'] : ['ultramarine', 'cerulean', 'paynes', 'sapgreen']) assert.ok(!used.includes(kk), `${x},${y} ${kk} in ${used.join('+')}`);
    assert.ok(used.length >= 1 && used.length <= 3);
    fullPans += keys.filter((_, j) => full[i * k + j] > 1e-4).length;
  }
  assert.ok(fullPans / (w * h) >= 2);
  // the value grading inside each colour stays the plan's: more paint further down
  const total = (x, y) => keys.reduce((s, _, j) => s + A[(y * w + x) * k + j], 0);
  assert.ok(total(2, h - 1) > total(2, 0) && total(w - 3, h - 1) > total(w - 3, 0));
  assert.ok(A[at('hansa')] > 0 || A[at('cadred')] > 0);
});

test('a colour lighter than the paper takes no paint', () => {
  const w = 4, h = 2, D = new Float32Array(w * h * 3).fill(-0.01);
  const { A, colours } = localPans(D, w, h, P, PAPER, { families: 1 });
  assert.ok(A.every(v => v === 0));
  assert.deepEqual(colours[0].pans, []);
});

test('bad input fails loudly', () => {
  assert.throws(() => localPans(new Float32Array(5), 2, 2, P, PAPER), RangeError);
  assert.throws(() => localPans(new Float32Array(12), 2, 2, [], PAPER), RangeError);
});

test('a greying pan goes in with its puddle: no cell holds more of it, for its paint, than the puddle does', () => {
  const k2 = ['ochre', 'rawsienna', 'sienna', 'sepia', 'paynes', 'phthaloblue'], Q = k2.map(kk => boxPigment(BOX.find(p => p.key === kk)));
  const w = 16, h = 8, rgb = new Uint8ClampedArray(w * h * 3);
  // a greyed fur colour, warmer on the left and greyer on the right
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = x / (w - 1), c = [196 - 14 * t, 150 - 10 * t, 100 + 8 * t]; for (let ch = 0; ch < 3; ch++) rgb[(y * w + x) * 3 + ch] = c[ch]; }
  const W = [255, 255, 255], D = channelDensity(rgb, w * h, W), { A, colours } = localPans(D, w, h, Q, W, { families: 1 });
  const { pans, shares, side } = colours[0];
  assert.equal(side, 'across');
  const far = pans.filter((j, q) => !['ochre', 'rawsienna', 'sienna', 'sepia'].includes(k2[j]));
  assert.equal(far.length, 1);
  const cap = shares[pans.indexOf(far[0])];
  for (let i = 0; i < w * h; i++) {
    let t = 0; for (let j = 0; j < Q.length; j++) t += A[i * Q.length + j];
    if (t > 1e-6) assert.ok(A[i * Q.length + far[0]] / t <= cap + 1e-5, `cell ${i}: ${A[i * Q.length + far[0]] / t} > ${cap}`);
  }
});

test('ownPans: the cells of a greyed puddle use only its pans, in their own proportions along a colour change', () => {
  const k2 = ['ochre', 'rawsienna', 'sienna', 'sepia', 'paynes', 'phthaloblue'], Q = k2.map(kk => boxPigment(BOX.find(p => p.key === kk)));
  const w = 16, h = 8, rgb = new Uint8ClampedArray(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = x / (w - 1), c = [196 - 14 * t, 150 - 10 * t, 100 + 8 * t]; for (let ch = 0; ch < 3; ch++) rgb[(y * w + x) * 3 + ch] = c[ch]; }
  const W = [255, 255, 255], D = channelDensity(rgb, w * h, W), cells = Array.from({ length: w * h }, (_, i) => i);
  const { A, colours } = localPans(D, w, h, Q, W, { partition: [cells], ownPans: true });
  const { pans, side } = colours[0];
  assert.equal(side, 'across');
  const ratio = i => { let t = 0; for (let j = 0; j < Q.length; j++) { t += A[i * Q.length + j]; if (!pans.includes(j)) assert.equal(A[i * Q.length + j], 0, `cell ${i} takes ${k2[j]}, not a puddle pan`); } return pans.map(j => A[i * Q.length + j] / Math.max(1e-9, t)); };
  const a = ratio(0), b = ratio(w - 1);
  assert.ok(pans.some((_, q) => Math.abs(a[q] - b[q]) > 0.05), `the warm end and the cool end differ in their pans' shares (${a.map(v => v.toFixed(2))} / ${b.map(v => v.toFixed(2))})`);
});
