import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness, DEFAULTS } from '../../media/sheet.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { readSubject } from './subject.mjs';
import { GRAPHITE } from './drawing.mjs';
import { paint } from './painter.mjs';

const W = 56, H = 48, N = W * H, PAPER = [250, 249, 245];
/** A pale blue-grey ground, a dark brown disc, a white square kept as paper. */
function picture() {
  const px = new Uint8ClampedArray(N * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let rgb = [205, 212, 228];
    if (Math.hypot(x - 22, y - 26) < 12) rgb = [110, 80, 50];
    if (x >= 40 && x < 52 && y >= 6 && y < 16) rgb = PAPER;
    for (let c = 0; c < 3; c++) px[i * 3 + c] = rgb[c];
  }
  return px;
}

test('the loop paints light first, cuts the dark in over it, keeps the lights as paper, and mixes a handful of wells', async () => {
  const px = picture(), S = readSubject(px, W, H, PAPER), O = { ...DEFAULTS, edgeEvap: 0.0012, gran: 0.25 };
  const paints = ['cerulean', 'sienna', 'umber'].map(k => boxPigment(BOX.find(p => p.key === k)));
  const paper = makePaper(W, H, { seed: 9, scale: 1, toothScale: 0.2 });
  const base = new Uint8ClampedArray(N * 3); for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) base[i * 3 + c] = PAPER[c];
  const sheet = createSheet(paper, [...paints, GRAPHITE]);
  const frames = [], lines = [];
  const out = await paint({ sheet, base, paints, S, w: W, h: H, O, shoot: async st => { frames.push(st); }, log: m => lines.push(m) }, { rounds: 3, wells: 6, cap: 8, frames: 20, brushShare: 0.15 });
  assert.equal(frames[0].stage, 'pencil', 'the drawing comes first');
  assert.ok(out.stats.acts >= 3, `${out.stats.acts} acts`);
  assert.ok(out.stats.wells <= 8 && out.stats.mixed <= 9 && out.stats.washouts <= 2, `wells ${out.stats.wells}, mixed ${out.stats.mixed}, washed out ${out.stats.washouts}`);
  // light before dark: the first act is a lighter note than a later one
  const first = out.acts[0], darkest = out.acts.reduce((a, b) => (b.mass > a.mass ? b : a));
  assert.ok(first.round === 1 && darkest.mass >= first.mass, `first ${first.mass}, darkest ${darkest.mass}`);
  // the darks are cut in as their own act over the ground, in a later round than the first washes
  assert.ok(out.acts.some(a => a.round >= 2), 'a later round acted');
  // residual falls round on round
  for (let i = 1; i < out.rounds.length; i++) assert.ok(out.rounds[i].residual <= out.rounds[i - 1].residual + 1e-6, JSON.stringify(out.rounds));
  assert.ok(out.stats.residual < out.rounds[0].residual, 'the end is nearer the subject than after the first washes');
  // the lights are paper
  assert.ok(out.stats.lightsMass < 0.02, `paint on the lights ${out.stats.lightsMass}`); // a soft first wash creeps a little into a reserved light; 0.02 is a fiftieth of a wash
  // nothing is worked to death
  assert.ok(out.stats.passesMedian <= 4, `median passes ${out.stats.passesMedian}`);
  assert.ok(out.stats.passesMax <= 6);
  assert.equal(frames.at(-1).stage, 'finished');
});
