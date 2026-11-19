// White gouache laid last: it goes only where the source has a small light and the painting has lost it, it hides what
// it lies on rather than filtering it as a glaze does, it thins where the light is thinner than a cell, and a dry brush
// leaves the paper's hollows showing through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gouacheCover, dryCover, overlay } from './gouache.mjs';

test('white goes where the source has a light and the painting went over it, and nowhere else', () => {
  const share = Float32Array.from([1, 1, 0, 0.25, 1]);
  const painted = Float32Array.from([1.2, 0.05, 1.2, 1.2, 0.5]);
  const source = Float32Array.from([0.1, 0.02, 0.1, 0.4, 0.45]);
  const cover = gouacheCover(share, painted, source, 5, { margin: 0.08, full: 0.5 });
  assert.equal(cover[0], 1, 'a catchlight painted over is covered');
  assert.equal(cover[1], 0, 'a light the painting kept is left alone');
  assert.equal(cover[2], 0, 'no light in the source, no white');
  assert.equal(cover[3], 0.5, 'a whisker a quarter of a cell wide covers half the cell');
  assert.equal(cover[4], 0, 'a cell within the margin of its source is left alone');
});

test('a dry brush misses the hollows, never more than its opacity', () => {
  const cover = Float32Array.from([1, 1, 1, 0]);
  const height = Float32Array.from([0.9, 0.55, 0.1, 0.9]);
  const out = dryCover(cover, height, 4, { opacity: 0.9, dry: 0.5 });
  assert.ok(Math.abs(out[0] - 0.9) < 1e-6, `on a hill the stroke covers its opacity: ${out[0]}`);
  assert.ok(Math.abs(out[1] - 0.9) < 1e-6, 'and at the middle of the relief');
  assert.ok(out[2] < out[0] && out[2] >= 0.45 - 1e-6, `in a hollow it covers less: ${out[2].toFixed(2)}`);
  assert.equal(out[3], 0, 'no stroke, no white');
});

test('opaque white hides a dark wash it lies on', () => {
  const rgb = Buffer.from([40, 30, 20, 40, 30, 20]);
  const out = overlay(rgb, Float32Array.from([0.9, 0]), [250, 248, 240], 2);
  assert.ok(out[0] > 220 && out[1] > 215, `covered at 0.9 the cell reads white: ${out[0]}/${out[1]}/${out[2]}`);
  assert.deepEqual([...out.subarray(3)], [40, 30, 20], 'the cell with no white is as it was');
  assert.deepEqual([...rgb], [40, 30, 20, 40, 30, 20], 'the painting given is not changed');
});

// --- rigger gouache in the sheet's physics ---------------------------------------------------------------------
import { renderLayers } from './km.mjs';
import { GOUACHE_PIGMENT, GOUACHE_FILM, HIDING, gouacheTint, riggerPoints } from './gouache.mjs';

const COAT = { K: [1.6, 1.5, 1.2], S: [0.02, 0.02, 0.02] };            // a dark coat glaze
const OCHRE = { K: [0.35, 0.8, 2.2], S: [0.02, 0.02, 0.02] };          // a warm earth
const PAPER = [252, 251, 248];
const paperOf = n => Uint8Array.from({ length: n * 3 }, (_, i) => PAPER[i % 3]);

test('a loaded stroke of gouache hides a dark coat, because it is thick: Kubelka-Munk, not a composite', () => {
  const dark = new Float32Array([1.5, 0]), white = new Float32Array([GOUACHE_FILM, GOUACHE_FILM]);
  const rgb = renderLayers([[dark, new Float32Array(2)], [new Float32Array(2), white]], [COAT, GOUACHE_PIGMENT], paperOf(2), 2, 1);
  assert.ok(rgb[0] > 215 && rgb[1] > 215 && rgb[2] > 210, `over the coat it reads white: ${rgb[0]}/${rgb[1]}/${rgb[2]}`);
  assert.ok(rgb[3] > 225, `over bare paper it is white too: ${rgb[3]}`);
  const bare = renderLayers([[dark, new Float32Array(2)]], [COAT, GOUACHE_PIGMENT], paperOf(2), 2, 1);
  assert.ok(bare[0] < 60, `the coat alone is dark: ${bare[0]}`);
});

test('a thin film hides less: the stroke thins with pressure and at its tip', () => {
  const read = x => renderLayers([[new Float32Array([1.5]), new Float32Array(1)], [new Float32Array(1), new Float32Array([x])]], [COAT, GOUACHE_PIGMENT], paperOf(1), 1, 1)[0];
  const full = read(GOUACHE_FILM), half = read(GOUACHE_FILM / 2), tenth = read(GOUACHE_FILM / 10);
  assert.ok(full > half && half > tenth, `${full} > ${half} > ${tenth}`);
  assert.ok(Math.abs(HIDING - GOUACHE_PIGMENT.S[0] * GOUACHE_FILM) < 1e-9, 'the film is the hiding thickness');
});

test('a light near paper white takes pure white; a warm light takes a little of the warm paint that gives its colour', () => {
  assert.deepEqual(gouacheTint([250, 249, 246], PAPER, [COAT, OCHRE]), { mix: [], residual: 0 });
  const t = gouacheTint([236, 214, 160], PAPER, [COAT, OCHRE]);
  assert.deepEqual(t.mix.map(m => m.pigment), [1], 'ochre, not the dark coat paint');
  assert.ok(t.mix[0].amount > 0 && t.mix[0].amount < 1, `a little: ${t.mix[0].amount}`);
  // laid as the film and the tint in one layer, it reads that colour
  const rgb = renderLayers([[new Float32Array([1.5]), new Float32Array(1), new Float32Array(1)], [new Float32Array(1), new Float32Array([t.mix[0].amount]), new Float32Array([GOUACHE_FILM])]], [COAT, OCHRE, GOUACHE_PIGMENT], paperOf(1), 1, 1);
  assert.ok(Math.abs(rgb[0] - 236) < 30 && Math.abs(rgb[1] - 214) < 25 && Math.abs(rgb[2] - 160) < 20 && rgb[2] < rgb[0] - 30, `tinted white reads ${rgb[0]}/${rgb[1]}/${rgb[2]}`);
});

test('a neutral grey light takes a mix of paints, not one paint with its cast', () => {
  const BLUE = { K: [2.0, 1.2, 0.3] }, ORANGE = { K: [0.2, 0.7, 1.9] }, GREEN = { K: [1.5, 0.4, 1.4] };
  const grey = gouacheTint([150, 150, 150], PAPER, [BLUE, ORANGE, GREEN]);
  assert.ok(grey.mix.length >= 2, `a mix: ${JSON.stringify(grey.mix)}`);
  const one = gouacheTint([150, 150, 150], PAPER, [GREEN]);
  assert.ok(grey.residual < one.residual, `the mix misses less (${grey.residual.toFixed(3)} against ${one.residual.toFixed(3)})`);
  assert.ok(grey.mix.every(m => m.amount > 0), 'no negative paint');
});

test('a light is never taken darker than the floor, so a stroke stays lighter than the coat it lies on', () => {
  const need = t => t.mix.reduce((a, m) => a + m.amount, 0);
  assert.ok(need(gouacheTint([60, 50, 40], PAPER, [COAT, OCHRE], { floor: 0.9 })) < need(gouacheTint([60, 50, 40], PAPER, [COAT, OCHRE], { floor: 0.6 })) + 1e-9, 'a higher floor asks for less tint');
});

test('a rigger stroke is pressed at the root and lifts to the tip', () => {
  const pts = riggerPoints(Array.from({ length: 20 }, (_, i) => [i, 0]), { widthCells: 2, scale: 2 });
  assert.equal(pts[0].x, 0); assert.equal(pts[19].x, 38);
  assert.ok(pts[2].nw > pts[19].nw, 'wider near the root than at the tip');
  assert.ok(pts[0].nw < pts[3].nw, 'it enters the paper, it does not start at full width');
  assert.ok(pts.every(p => p.nw >= 0.5 && p.s > 0 && p.s <= 1));
});
