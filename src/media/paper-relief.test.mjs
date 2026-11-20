import test from 'node:test';
import assert from 'node:assert/strict';
import { paperRelief, RELIEF_PRESETS } from './paper-relief.mjs';
import { makePaper } from './paper.mjs';
import { bandSpectrum } from '../../tools/lab/wash-measure.mjs';

const stats = a => { let m = 0; for (const v of a) m += v; m /= a.length; let v2 = 0, v3 = 0; for (const v of a) { v2 += (v - m) ** 2; v3 += (v - m) ** 3; } const sd = Math.sqrt(v2 / a.length); return { m, sd, skew: v3 / a.length / sd ** 3 }; };

test('the same sheet at 0.1 and 0.05 mm cells is the same paper: the finer grid averaged up gives the coarser one', () => {
  const S = 12.8, fine = paperRelief(S / 0.05, S / 0.05, 0.05, { seed: 4 }), coarse = paperRelief(S / 0.1, S / 0.1, 0.1, { seed: 4 }), w = S / 0.1, fw = S / 0.05;
  let d2 = 0, c2 = 0;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const up = (fine.zUm[2 * y * fw + 2 * x] + fine.zUm[2 * y * fw + 2 * x + 1] + fine.zUm[(2 * y + 1) * fw + 2 * x] + fine.zUm[(2 * y + 1) * fw + 2 * x + 1]) / 4;
    d2 += (up - coarse.zUm[y * w + x]) ** 2; c2 += coarse.zUm[y * w + x] ** 2;
  }
  assert.ok(Math.sqrt(d2 / c2) < 0.03, `averaged-up fine grid differs from the coarse grid by ${Math.sqrt(d2 / c2)} of its RMS`);
});

test('the relief is never stretched to the grid: a coarser grid sees less of it, a finer one approaches the preset RMS', () => {
  const sd = mm => stats(paperRelief(Math.round(25.6 / mm), Math.round(25.6 / mm), mm, { seed: 2 }).zUm).sd;
  const s25 = sd(0.25), s10 = sd(0.1), s05 = sd(0.05);
  assert.ok(s25 < s10 && s10 < s05 && s05 <= RELIEF_PRESETS.cold.rmsUm * 1.05, `RMS ${s25} ${s10} ${s05} um`);
  assert.ok(s25 > 0.6 * RELIEF_PRESETS.cold.rmsUm, 'most of the relief is coarser than a quarter millimetre');
  // and makePaper's height is that relief at 100 um a unit, about 0.5, at every grid
  const p = makePaper(100, 100, { seed: 2, mmPerCell: 0.1, coldPress: { mmPerCell: 0.1 } }), r = paperRelief(100, 100, 0.1, { seed: 2 });
  for (let i = 0; i < 100; i += 7) assert.ok(Math.abs(p.height[i] - Math.min(1, Math.max(0, 0.5 + r.zUm[i] / 100))) < 1e-6);
});

test('presets: hot press smoother than cold press, rough coarser; all skewed towards pits and a little longer along the fibres', () => {
  const mm = 0.05, w = 256, out = {};
  for (const k of ['hot', 'cold', 'rough']) {
    const r = paperRelief(w, w, mm, { seed: 1, relief: k }), s = stats(r.zUm);
    let gx = 0, gy = 0; for (let y = 0; y < w - 1; y++) for (let x = 0; x < w - 1; x++) { gx += (r.zUm[y * w + x + 1] - r.zUm[y * w + x]) ** 2; gy += (r.zUm[(y + 1) * w + x] - r.zUm[y * w + x]) ** 2; }
    out[k] = { ...s, across: gy / gx };
  }
  assert.ok(out.hot.sd < out.cold.sd && out.cold.sd < out.rough.sd, JSON.stringify(out));
  for (const k in out) { assert.ok(out[k].skew < -0.05, `${k} skew ${out[k].skew}`); assert.ok(out[k].across > 1.05, `${k} anisotropy ${out[k].across}`); }
});

test('cold press: structure from 0.1 mm up, about even per octave from 0.2 to 1 mm and weaker past it, as the crops', () => {
  const mm = 0.025, w = 1024, r = paperRelief(w, w, mm, { seed: 5 }), b = bandSpectrum(r.zUm, w, mm, 0, 0, w, [0.1, 0.2, 0.5, 1, 2]);
  const mid = [b[0.2], b[0.5], b[1]];
  assert.ok(Math.max(...mid) / Math.min(...mid) < 1.6, `octave bands 0.2 to 1 mm: ${mid.map(v => v.toFixed(2)).join(' ')} um`);
  assert.ok(b[2] < 0.8 * b[0.5], `2 mm band ${b[2]} against 0.5 mm ${b[0.5]} um: no millimetre basins to pool in`);
  assert.ok(b[0.1] > 0.3 * b[0.5], `0.1 mm band ${b[0.1]} um: the sheet still has structure there`);
  // hollows (makePaper): a cell's depth below the tooth level, in the relief's RMS, about 0.4 on average and none on
  // the crests, a little shallower on a coarser grid of the same paper
  const hol = mm => { const n = Math.round(25 / mm), p = makePaper(n, n, { seed: 5, mmPerCell: mm, coldPress: { mmPerCell: mm } }); let pos = 0, m = 0; for (const v of p.hollow) { m += v; if (v > 0) pos++; } return { m: m / p.n, pos: pos / p.n }; };
  const h05 = hol(0.05), h25 = hol(0.25);
  assert.ok(h05.m > 0.3 && h05.m < 0.55 && h05.pos < 0.65 && h25.m < h05.m && h25.m > 0.6 * h05.m, JSON.stringify({ h05, h25 }));
});
