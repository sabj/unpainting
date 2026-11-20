// Wet strokes laid with the sheet flowing inside them, on the CPU sheet and on the GPU sheet with the pinned-edge feed and
// the film's levelling on: a loaded stroke laid across a wash that is still drying and out past its edge, and two wet
// strokes crossing with the sheet stepping between them. On the GPU the stroke's flows run inside the stroke's own
// dispatches; the feed's geometry is made again before each one where the wet outline moved (stepfull.mjs efMidStroke),
// as the CPU's edgeFeed finds its footprint every step. The dried colour must agree within 2 L* over every 1 mm square.
// Skipped where there is no GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makePaper } from '../../src/media/paper.mjs';
import * as S from '../../src/media/sheet.mjs';
import * as B from '../../src/media/brush.mjs';
import { renderLayers } from '../../src/media/km.mjs';
import { attachGpu, gpuStats } from '../../src/media/gpu/link.mjs';

const PIGMENTS = [
  { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3 },
  { K: [0.4861, 0.2344, 0.1063], S: [0.02, 0.02, 0.02], rho: 0.032, omega: 20, gamma: 0 },
];
const O = { ...S.DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 };
const MM = 0.25, SIZE = 40, W = Math.round(SIZE / MM);
const paper = () => makePaper(W, W, { seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, mmPerCell: MM, coldPress: { mmPerCell: MM, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } });
const brush = (seed, r = 3) => B.createBrush({ flat: true, radius: r / MM, capacity: 80, wetMix: 0.5, seed });
// the sheet flows every fourth brush step, inside the stroke
const lay = (sheet, b, pts) => B.stroke(b, sheet, pts.map(q => ({ ...q, x: q.x / MM, y: q.y / MM })), { upright: 'sweep', gpuBetween: true, between: k => { if (k % 4 === 0) S.step(sheet, O); } });
const raw = (sheet, f) => { S.coherent(sheet); f(); sheet._gpu?.cpuWroteAll(); };
const CASES = {
  'a stroke into a drying wash': sheet => {
    raw(sheet, () => { for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (Math.hypot((x + .5) * MM - 20, (y + .5) * MM - 20) < 12) S.deposit(sheet, y * W + x, 0.2, [0.25, 0]); });
    for (let i = 0; i < 30; i++) S.step(sheet, O);
    const b = brush(5); B.dip(b, { water: 1, conc: [0, 0.6] }); lay(sheet, b, [{ x: 6, y: 18, p: 1 }, { x: 36, y: 23, p: 1 }]);
  },
  'two crossing wet strokes': sheet => {
    const a = brush(7); B.dip(a, { water: 1, conc: [0.6, 0] }); lay(sheet, a, [{ x: 6, y: 14, p: 1 }, { x: 34, y: 18, p: 1 }]);
    for (let i = 0; i < 10; i++) S.step(sheet, O);
    const b = brush(8); B.dip(b, { water: 1, conc: [0, 0.5] }); lay(sheet, b, [{ x: 18, y: 4, p: 1 }, { x: 22, y: 34, p: 1 }]);
  },
};
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
function lightness(sheet) {
  const n = W * W, base = new Uint8Array(n * 3); for (let i = 0; i < n; i++) base.set([246, 245, 239], i * 3);
  const rgb = renderLayers(S.layersOf(sheet), PIGMENTS, base, n), L = new Float64Array(n);
  for (let i = 0; i < n; i++) { const Y = 0.2126 * lin(rgb[3 * i]) + 0.7152 * lin(rgb[3 * i + 1]) + 0.0722 * lin(rgb[3 * i + 2]); L[i] = Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; }
  return L;
}

for (const [name, paint] of Object.entries(CASES)) {
  test(`${name} dries to the same colour on the GPU sheet as on the CPU sheet, each 1 mm square within 2 L*`, { timeout: 300000 }, t => {
    const g = S.createSheet(paper(), PIGMENTS), info = attachGpu(g, O, { mode: 'auto', log: () => {} });
    if (info.backend !== 'gpu') return t.skip(`no GPU: ${info.reason}`);
    try {
      const cpu = S.createSheet(paper(), PIGMENTS);
      paint(cpu); S.dry(cpu, 200000, O, { levelMax: 200 });
      paint(g); S.dry(g, 200000, O, { levelMax: 200 });
      assert.ok(gpuStats(g).strokes >= 1, 'the strokes were laid on the GPU');
      const a = lightness(cpu), b = lightness(g), k = Math.round(1 / MM);
      let square = 0, mean = 0;
      for (let i = 0; i < a.length; i++) mean += Math.abs(a[i] - b[i]) / a.length;
      for (let y = 0; y + k <= W; y += k) for (let x = 0; x + k <= W; x += k) {
        let s = 0; for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += a[(y + j) * W + x + i] - b[(y + j) * W + x + i];
        square = Math.max(square, Math.abs(s) / (k * k));
      }
      t.diagnostic(`${name}: mean |dL*| ${mean.toFixed(4)}, worst 1 mm square ${square.toFixed(3)}`);
      assert.ok(square < 2, `a 1 mm square differs by ${square} L*`);
      assert.ok(mean < 0.05, `L* differs by ${mean} on average`);
    } finally { g._gpu?.close?.(); }
  });
}
