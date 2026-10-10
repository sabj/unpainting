// --subjlocal <stage.png>: for a subject whose first wash would read as one flat veil, one passage per colour region
// (tintRegions) mixed to its local colour at the stage's lightness, all wet into wet so neighbours blend. Later light
// pieces are charged only for what this wash has not laid. DOM free apart from the one image read.
import { nnls } from '../methods/well.mjs';
import { passage } from '../../crop/blockin.mjs';

/** Mean density per channel of each labelled region on `st` (rgb bytes) against the stage's paper. */
function regionDensity(st, label, R, n) {
  const L = []; for (let i = 0; i < n; i += 7) L.push([0.2126 * st[3 * i] + 0.7152 * st[3 * i + 1] + 0.0722 * st[3 * i + 2], i]);
  L.sort((a, b) => b[0] - a[0]);
  const top = L.slice(0, Math.max(1, Math.floor(L.length / 10))), paper = [0, 0, 0];
  for (const [, i] of top) for (let c = 0; c < 3; c++) paper[c] += st[3 * i + c] / top.length;
  const want = Array.from({ length: R }, () => [0, 0, 0]), cnt = new Array(R).fill(0);
  for (let i = 0; i < n; i++) { const r = label[i]; if (!r) continue; cnt[r - 1]++; for (let c = 0; c < 3; c++) want[r - 1][c] += Math.max(0, -Math.log(Math.max(1, st[3 * i + c]) / Math.max(1, paper[c]))); }
  return { want: want.map((v, r) => v.map(x => (cnt[r] ? x / cnt[r] : 0))), cnt, paper };
}

/** Pigment amounts in the plan's units (paint-plate unmixes with K / 0.55) that make `want`, non-negative. */
export const mixFor = (want, PIGS) => Array.from(nnls(PIGS.map(p => p.K.map(v => v / 0.55)), want, PIGS.length).c, v => Math.max(0, v));

/**
 * Insert the local wash before the first subject pass of painterOrder's `layers` (cut by the same `regions`), and
 * charge the subject's light pieces for the rest. Returns { layers, summary }.
 */
export function localSubjectWash(layers, { regions, st, PIGS, w, h, gain = 1, film = null, minShare = 0.03 }) {
  const n = w * h, R = regions.areas.length, { want, cnt, paper } = regionDensity(st, regions.label, R, n);
  const shapes = [], mixes = [];
  for (let r = 0; r < R; r++) {
    if (cnt[r] < minShare * regions.subjArea) { mixes.push(null); continue; }
    const mix = mixFor(want[r].map(v => v * gain), PIGS), amount = mix.reduce((a, v) => a + v, 0);
    mixes.push(mix);
    if (amount <= 1e-4) continue;
    const box = { x0: w, y0: h, x1: -1, y1: -1 };
    for (let i = 0; i < n; i++) if (regions.label[i] === r + 1) { const x = i % w, y = (i / w) | 0; box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y); }
    const sh = passage(regions.label, r + 1, box, amount, cnt[r], w);
    Object.assign(sh, { mix, _opening: 1, _flat: true, _wow: true, _fwSoften: true, _local: r + 1 });
    film?.set(sh, amount * cnt[r]);
    shapes.push(sh);
  }
  // the subject's light pieces in each region: charged for what the local wash has not laid of their pigment there
  const laid = new Map();
  for (const L of layers) {
    if (L._order?.phase !== 'subject') continue;
    const r = L._order.region ?? 0, mix = mixes[r]; if (!mix) continue;
    for (const sh of L.shapes) {
      const m = sh.mix ?? [], tot = m.reduce((a, v) => a + v, 0); if (tot <= 0) continue;
      // the share of this piece the local wash has already paid, pigment by pigment, used up as pieces claim it
      const key = r; if (!laid.has(key)) laid.set(key, mix.slice());
      const left = laid.get(key);
      let paid = 0; for (let j = 0; j < m.length; j++) { const take = Math.min(left[j] ?? 0, m[j]); left[j] -= take; paid += take; }
      sh._tint = Math.max(0, 1 - paid / tot);
    }
  }
  const pass = { value: 1, pigment: shapes.length ? shapes[0].mix.indexOf(Math.max(...shapes[0].mix)) : 0, mixIndex: null, mixv: null, mix: null, amount: 0, level: 0, ids: null, mask: null, shapes, area: shapes.reduce((a, s) => a + s.area, 0), _order: { phase: 'subject', region: -1, shoot: true, local: true } };
  const at = layers.findIndex(L => L._order && L._order.phase !== 'ground');
  const out = !shapes.length ? layers : at < 0 ? [...layers, pass] : [...layers.slice(0, at), pass, ...layers.slice(at)];
  const summary = mixes.map((m, r) => ({ region: r + 1, cells: cnt[r], want: want[r], mix: m }));
  return { layers: out, summary, paper };
}
