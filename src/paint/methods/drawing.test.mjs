import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../media/paper.mjs';
import { createSheet, thickness, DEFAULTS } from '../../media/sheet.mjs';
import { BOX, boxPigment } from '../../crop/box.mjs';
import { readSubject } from './subject.mjs';
import { outlineGestures, drawPencil, GRAPHITE } from './drawing.mjs';

const W = 60, H = 40, N = W * H, PAPER = [250, 249, 245];
function picture() {
  const px = new Uint8ClampedArray(N * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let rgb = x < W / 2 ? [200, 210, 230] : [120, 90, 60];
    if (Math.hypot(x - 45, y - 20) < 6) rgb = PAPER;
    for (let c = 0; c < 3; c++) px[i * 3 + c] = rgb[c];
  }
  return px;
}

test('outlineGestures traces the figure against its ground and the reserved light', () => {
  const S = readSubject(picture(), W, H, PAPER);
  const g = outlineGestures(S, W, H, { scale: 1.5, minArea: 0.01, minLength: 8, budget: 0.1 });
  assert.ok(g.length >= 1, 'at least the boundary');
  const nearBoundary = g.some(q => { const xs = q.points.map(p => p.x); const m = xs.reduce((a, b) => a + b, 0) / xs.length; return m > 26 && m < 34 && q.points.length >= 12; });
  assert.ok(nearBoundary, `no long gesture along x=30: ${g.map(q => q.points.length).join(', ')}`);
});

test('drawPencil leaves graphite along the gestures and nowhere else', () => {
  const S = readSubject(picture(), W, H, PAPER), O = { ...DEFAULTS, edgeEvap: 0.0012 };
  const sheet = createSheet(makePaper(W, H, { seed: 5, scale: 1, toothScale: 0.2 }), [boxPigment(BOX[0]), GRAPHITE]);
  const g = outlineGestures(S, W, H, { scale: 1.5, minArea: 0.01, minLength: 8, budget: 0.1 });
  const r = drawPencil(sheet, g, { w: W, h: H, graphiteAt: 1, O });
  assert.ok(r.drawn >= 1);
  const th = thickness(sheet)[1];
  let on = 0, off = 0;
  for (let y = 5; y < H - 5; y++) { on += th[y * W + 30] + th[y * W + 29] + th[y * W + 31]; off += th[y * W + 10]; }
  assert.ok(on > 0.05, `graphite on the boundary ${on}`);
  assert.ok(off < 0.001, `graphite away from it ${off}`);
  assert.equal(thickness(sheet)[0].reduce((a, b) => a + b, 0), 0, 'no paint');
});
