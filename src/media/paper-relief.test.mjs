import test from 'node:test';
import assert from 'node:assert/strict';
import { paperRelief, RELIEF_PRESETS, scanRelief } from './paper-relief.mjs';
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
  // hollows (makePaper): a cell's depth below the tooth level of the relief low-passed at 0.2 mm (grain-field.mjs), in
  // that field's RMS about its millimetre mean: about 0.6 on average and none on the crests, the same on a coarser grid
  // of the same paper (at rc4, read cell by cell, 0.40 at 0.05 mm fell to 0.28 at 0.25 mm)
  const hol = mm => { const n = Math.round(25 / mm), p = makePaper(n, n, { seed: 5, mmPerCell: mm, coldPress: { mmPerCell: mm } }); let pos = 0, m = 0; for (const v of p.hollow) { m += v; if (v > 0) pos++; } return { m: m / p.n, pos: pos / p.n }; };
  const h05 = hol(0.05), h25 = hol(0.25);
  assert.ok(h05.m > 0.45 && h05.m < 0.8 && h05.pos < 0.65 && Math.abs(h25.m / h05.m - 1) < 0.1, JSON.stringify({ h05, h25 }));
});

test('grain strength varies across the sheet at centimetre scale, seeded: some patches grainier, same seed same sheet', () => {
  const mm = 0.1, w = 600, h = 400, r = paperRelief(w, h, mm, { seed: 3 }), B = 50, rms = [];
  for (let by = 0; by + B <= h; by += B) for (let bx = 0; bx + B <= w; bx += B) {
    let v = 0; for (let y = by; y < by + B; y++) for (let x = bx; x < bx + B; x++) v += r.zUm[y * w + x] ** 2;
    rms.push(Math.sqrt(v / (B * B)));
  }
  const s = stats(rms), lo = Math.min(...rms), hi = Math.max(...rms);
  assert.ok(s.sd / s.m > 0.15 && hi / lo > 1.8 && hi / lo < 4, `5 mm block RMS over 60 x 40 mm: cv ${(s.sd / s.m).toFixed(2)}, ${lo.toFixed(1)} to ${hi.toFixed(1)} um`);
  const again = paperRelief(w, h, mm, { seed: 3 }); for (let i = 0; i < w * h; i += 997) assert.equal(again.zUm[i], r.zUm[i]);
});

test('a scanned relief: scaled to the base preset RMS, keyed by its id, read by every grid as the same paper', () => {
  const W = 1100, H = 1030, data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = Math.round(128 + 60 * Math.sin(x * 0.05) * Math.cos(y * 0.043));
  const relief = scanRelief({ data, width: W, height: H }, { id: 'test-waves', mmPerPx: 0.01 });
  assert.ok(JSON.stringify(relief).length < 400, 'its key carries the id, not the pixels');
  const r = paperRelief(200, 200, 0.05, { relief }), sd = stats(r.zUm).sd;
  assert.ok(Math.abs(sd / RELIEF_PRESETS.cold.rmsUm - 1) < 0.15, `scan relief RMS ${sd} um`);
  const r2 = paperRelief(100, 100, 0.1, { relief }); let d = 0, c = 0;
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) { const up = (r.zUm[2 * y * 200 + 2 * x] + r.zUm[2 * y * 200 + 2 * x + 1] + r.zUm[(2 * y + 1) * 200 + 2 * x] + r.zUm[(2 * y + 1) * 200 + 2 * x + 1]) / 4; d += (up - r2.zUm[y * 100 + x]) ** 2; c += r2.zUm[y * 100 + x] ** 2; }
  assert.ok(Math.sqrt(d / c) < 0.05, `fine vs coarse ${Math.sqrt(d / c)}`);
});
