import test from 'node:test';
import assert from 'node:assert/strict';
import { monoPaints, monoAt } from './mono-mix.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { filmLab } from './puddles.mjs';
import { labOf } from '../../eval/colour.mjs';
import { renderLayers } from '../../media/km.mjs';
// the sRGB of a flat film of these amounts over the paper
const film = amounts => Array.from(renderLayers([pigments.map((_, j) => Float32Array.of(amounts[j] ?? 0))], pigments.map(q => ({ K: q.K, S: q.S ?? [0, 0, 0] })), Uint8ClampedArray.from(PAPER), 1, 1));

const PAPER = [252, 251, 248], keys = ['ultramarine', 'sienna', 'sapgreen', 'rose'], pigments = keys.map(key => boxPigment(BOX.find(p => p.key === key)));
// a w x h picture in bands of the given sRGB colours
const bands = (colours, w = 96, h = 64) => { const rgb = new Uint8ClampedArray(w * h * 3); for (let i = 0; i < w * h; i++) rgb.set(colours[Math.floor((i % w) * colours.length / w)], i * 3); return { rgb, w, h }; };

test('a brown wash drawing is near-monochrome: one or two of the palette\'s paints, mixed at each value as the subject is', () => {
  const browns = [0.3, 0.8, 1.6, 3, 5].map(t => film([0.1 * t, 0.9 * t])), { rgb, w, h } = bands(browns);
  const m = monoPaints(rgb, w, h, pigments, PAPER);
  assert.ok(m.mono, m.note);
  assert.ok(m.pigments.includes(1), `burnt sienna in ${m.pigments}`);
  const mix = monoAt(m, 50);
  assert.equal(mix.length, pigments.length); assert.ok(Math.abs(mix.reduce((a, v) => a + v, 0) - 1) < 1e-9);
  // its film at some strength is a brown: warm (b* > a* > 0), not the blue-grey a drifted study would pick
  const lab = filmLab(mix.map(v => v * 2), pigments, PAPER); assert.ok(lab[2] > 5 && lab[1] > 0, lab.join(' '));
});

test('a picture in several hues is not near-monochrome', () => {
  const { rgb, w, h } = bands([[200, 60, 60], [60, 90, 200], [80, 160, 70], [230, 210, 120]]);
  const m = monoPaints(rgb, w, h, pigments, PAPER);
  assert.equal(m.mono, false, m.note);
  assert.ok(labOf([200, 60, 60], 0, PAPER)[1] > 30);
});
