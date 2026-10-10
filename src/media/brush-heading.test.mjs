import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from './paper.mjs';
import { createSheet } from './sheet.mjs';
import { createBrush, dip, stroke, candidateContact, setStrokeVariety, turnHeading } from './brush.mjs';

const pigments = [{ K: [0.35, 0.49, 0.66], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 }];
const N = 200, R = 20, FROM = [34, 40], TO = [166, 150], VERTEX = 8;

// A straight diagonal sampled every VERTEX cells and rounded to a two-cell grid, as pointer samples on a 120 dpi sheet or a pixel path give it.
const gridPath = () => {
  const L = Math.hypot(TO[0] - FROM[0], TO[1] - FROM[1]), pts = [];
  for (let s = 0; s <= L; s += VERTEX) pts.push({ x: 2 * Math.round((FROM[0] + (TO[0] - FROM[0]) * s / L) / 2), y: 2 * Math.round((FROM[1] + (TO[1] - FROM[1]) * s / L) / 2), p: 1 });
  return pts;
};

// Each edge's distance from the planned line every quarter cell over the middle 60%, detrended: its RMS (cells) and
// its amplitude at the vertex period.
function edgeRoughness(on) {
  const L = Math.hypot(TO[0] - FROM[0], TO[1] - FROM[1]), ux = (TO[0] - FROM[0]) / L, uy = (TO[1] - FROM[1]) / L, ds = 0.25;
  return [1, -1].map(sg => {
    const e = [];
    for (let s = 0.2 * L; s <= 0.8 * L; s += ds) {
      let d0 = 0;
      for (let d = 0; d < 2 * R; d += 0.1) { const x = Math.floor(FROM[0] + ux * s - sg * uy * d), y = Math.floor(FROM[1] + uy * s + sg * ux * d); if (on(y * N + x)) d0 = d; }
      e.push(d0);
    }
    const n = e.length, m = e.reduce((a, b) => a + b, 0) / n;
    let sx = 0, sxy = 0; for (let i = 0; i < n; i++) { sx += (i - n / 2) ** 2; sxy += (i - n / 2) * (e[i] - m); }
    const r = e.map((v, i) => v - m - (sxy / sx) * (i - n / 2)), w = 2 * Math.PI * ds / VERTEX;
    let c = 0, s2 = 0; for (let i = 0; i < n; i++) { c += r[i] * Math.cos(w * i); s2 += r[i] * Math.sin(w * i); }
    return { rms: Math.sqrt(r.reduce((a, b) => a + b * b, 0) / n), atVertex: 2 * Math.hypot(c, s2) / n };
  });
}

const brushOf = flat => { const b = createBrush({ flat, radius: R, capacity: 40, splay: 0 }); dip(b, { water: 1, conc: [0.6] }); return b; };

for (const flat of [true, false]) {
  test(`a ${flat ? 'flat' : 'round'} brush on a grid-sampled diagonal keeps straight edges, with no scallop at the vertex spacing`, t => {
    setStrokeVariety(0); t.after(() => setStrokeVariety(1));
    const sheet = createSheet(makePaper(N, N), pigments);
    stroke(brushOf(flat), sheet, gridPath());
    for (const side of edgeRoughness(i => sheet.G[0][i] + sheet.D[0][i] > 1e-6)) {
      // before the heading eased, the edges were notched at every vertex: RMS 2.0-2.3 cells, 0.8-1.1 cells at the vertex period
      assert.ok(side.rms < 1.6, `edge RMS ${side.rms.toFixed(2)} cells`);
      assert.ok(side.atVertex < 0.5, `edge amplitude at the ${VERTEX}-cell vertex period ${side.atVertex.toFixed(2)} cells`);
    }
  });
}

test('the GPU stroke plan (through candidate contact) keeps the same straight edges', t => {
  setStrokeVariety(0); t.after(() => setStrokeVariety(1));
  const sheet = createSheet(makePaper(N, N), pigments), { mask } = candidateContact(brushOf(true), sheet, gridPath());
  for (const side of edgeRoughness(i => mask[i] > 0)) {
    assert.ok(side.rms < 1.6, `edge RMS ${side.rms.toFixed(2)} cells`);
    assert.ok(side.atVertex < 0.5, `edge amplitude at the vertex period ${side.atVertex.toFixed(2)} cells`);
  }
});

test('the footprint heading follows a straight path exactly and eases round a kink', () => {
  assert.deepEqual(turnHeading(null, 0.6, 0.8, 10, 0.7), [0.6, 0.8]);
  assert.deepEqual(turnHeading([0.6, 0.8], 0.6, 0.8, 10, 0.7), [0.6, 0.8]);
  const [x, y] = turnHeading([1, 0], 0.5, Math.sqrt(3) / 2, 10, 0.7), turned = Math.atan2(y, x);
  assert.ok(turned > 0 && turned <= 1.2 / 10 + 1e-12, `turned ${turned} rad in one step`);
  assert.deepEqual(turnHeading([1, 0], -1, 0, 10, 0.7), [-1, 0]); // a reversal starts afresh
  assert.deepEqual(turnHeading(null, 0, 0, 10, 0.7), [0, 1]); // a press on one point
  assert.deepEqual(turnHeading([1, 0], 0, 0, 10, 0.7), [1, 0]);
});
