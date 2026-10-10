// --subjtint <stage.png>: for a subject whose first wash would read as one flat veil, its light pieces weighed per
// colour region so each region lays its own pale local colour, softened only into the subject so regions blend.
// DOM free apart from the image reads.
//   --subjtintk 5       colour regions: k-means on the blurred finish inside the subject mask
//   --subjtintmode 3    mode filter radius in cells, so a region is a patch of local colour, not a speckle
//   --subjtintgain      scales each region's density on the stage
//   --subjtintmax 1     the most a piece's opening is scaled by (`_tint`)
//   --subjtintdefer 1   lay what a tint holds back at the start of the middle values, so the plan's paint is kept
import { nnls } from '../methods/well.mjs';

const lin = rgb => rgb; // densities are taken on the 8-bit values, as look.mjs sheetDensity does

async function rgbAt(file, w, h, sharp, blur = 0) {
  let img = sharp(file).removeAlpha().resize(w, h, { fit: 'fill' });
  if (blur > 0) img = img.blur(blur);
  return (await img.raw().toBuffer({ resolveWithObject: true })).data;
}

/** Colour regions of the subject on the finish: Int32 labels (1..k, 0 off the subject) and their areas. */
export async function tintRegions({ finish, subject, w, h, sharp, k = 5, blur = 3, mode = 3, seed = 3, log }) {
  const n = w * h, px = await rgbAt(finish, w, h, sharp, blur), idx = [];
  for (let i = 0; i < n; i++) if (subject[i]) idx.push(i);
  if (idx.length < k * 20) return null;
  // k-means++-ish start: spread seeds along the subject's luminance order
  const lum = i => 0.2126 * px[3 * i] + 0.7152 * px[3 * i + 1] + 0.0722 * px[3 * i + 2];
  const sorted = [...idx].sort((a, b) => lum(a) - lum(b));
  let C = Array.from({ length: k }, (_, j) => { const i = sorted[Math.floor((j + 0.5) * sorted.length / k)]; return [px[3 * i], px[3 * i + 1], px[3 * i + 2]]; });
  const lab = new Int32Array(n);
  for (let it = 0; it < 12; it++) {
    const S = C.map(() => [0, 0, 0, 0]);
    for (const i of idx) {
      let b = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const d = (px[3 * i] - C[j][0]) ** 2 + (px[3 * i + 1] - C[j][1]) ** 2 + (px[3 * i + 2] - C[j][2]) ** 2; if (d < bd) { bd = d; b = j; } }
      lab[i] = b + 1; const s = S[b]; s[0] += px[3 * i]; s[1] += px[3 * i + 1]; s[2] += px[3 * i + 2]; s[3]++;
    }
    C = S.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : C[j]));
  }
  // mode filter, radius --subjtintmode (3), twice: patches, not speckle
  let cur = lab;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Int32Array(n), cnt = new Int32Array(k + 1), step = Math.max(1, Math.round(mode / 3));
    for (const i of idx) {
      const x = i % w, y = (i / w) | 0; cnt.fill(0);
      for (let dy = -mode; dy <= mode; dy += step) for (let dx = -mode; dx <= mode; dx += step) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; cnt[cur[Y * w + X]]++; }
      let b = cur[i], bc = -1; for (let j = 1; j <= k; j++) if (cnt[j] > bc) { bc = cnt[j]; b = j; }
      out[i] = b;
    }
    cur = out;
  }
  const areas = new Array(k).fill(0); for (const i of idx) areas[cur[i] - 1]++;
  log(`subject tint: ${k} colour regions of the finish, ${areas.map(a => (100 * a / idx.length).toFixed(0) + '%').join(' ')} of the subject, centres ${C.map(c => c.map(v => v.toFixed(0)).join('/')).join(' ')}`);
  return { label: cur, areas, subjArea: idx.length };
}

/**
 * Weigh the subject phase's pieces region by region. `layers` is painterOrder's output; `PIGS` the palette; `stage`
 * the target stage file. Sets `_tint` and `_fwSoften` on each subject piece. Returns a per-region summary.
 */
export async function tintSubject(layers, { regions, stage, PIGS, w, h, sharp, gain = 1, max = 1, opening = 0.55, defer = true, film = null, log }) {
  const n = w * h, st = await rgbAt(stage, w, h, sharp, 1.5);
  // the stage's paper: the mean colour of its lightest tenth
  const L = []; for (let i = 0; i < n; i += 7) L.push([0.2126 * st[3 * i] + 0.7152 * st[3 * i + 1] + 0.0722 * st[3 * i + 2], i]);
  L.sort((a, b) => b[0] - a[0]);
  const top = L.slice(0, Math.max(1, Math.floor(L.length / 10))), paper = [0, 0, 0];
  for (const [, i] of top) for (let c = 0; c < 3; c++) paper[c] += st[3 * i + c] / top.length;
  const R = regions.areas.length, want = Array.from({ length: R }, () => [0, 0, 0]), cnt = new Array(R).fill(0);
  for (let i = 0; i < n; i++) { const r = regions.label[i]; if (!r) continue; cnt[r - 1]++; for (let c = 0; c < 3; c++) want[r - 1][c] += Math.max(0, -Math.log(Math.max(1, lin(st[3 * i + c])) / Math.max(1, paper[c]))); }
  for (let r = 0; r < R; r++) for (let c = 0; c < 3; c++) want[r][c] = cnt[r] ? gain * want[r][c] / cnt[r] : 0;
  const byRegion = Array.from({ length: R }, () => []);
  for (const Ly of layers) {
    if (Ly._order?.phase !== 'subject') continue;
    for (const sh of Ly.shapes) {
      const open = Ly.value <= 1 && !sh.graded ? (sh._opening ?? opening) : 1;
      const d = [0, 0, 0]; const mix = sh.mix ?? [];
      for (let j = 0; j < PIGS.length; j++) for (let c = 0; c < 3; c++) d[c] += PIGS[j].K[c] * (mix[j] ?? 0) * open;
      byRegion[Math.max(0, Math.min(R - 1, Ly._order.region ?? 0))].push({ sh, d, layer: Ly });
    }
  }
  const summary = [], deferred = new Map();
  for (let r = 0; r < R; r++) {
    const ps = byRegion[r]; if (!ps.length) continue;
    const { c } = nnls(ps.map(p => p.d), want[r], ps.length);
    let kept = 0;
    ps.forEach((p, j) => {
      p.sh._tint = Math.min(max, c[j]); p.sh._fwSoften = true; if (p.sh._tint > 0.02) kept++;
      // what the tint holds back is laid at the start of the middle values, so the finish keeps the plan's paint
      if (defer && p.sh._tint < 0.98) {
        const copy = { ...p.sh, _tint: 1 - p.sh._tint, _fwSoften: false };
        film?.set(copy, (film.get(p.sh) ?? p.sh.amount * p.sh.area) * copy._tint);
        if (film?.has(p.sh)) film.set(p.sh, film.get(p.sh) * p.sh._tint);
        if (!deferred.has(p.layer)) deferred.set(p.layer, []);
        deferred.get(p.layer).push(copy);
      }
    });
    const got = [0, 0, 0]; ps.forEach(p => { for (let q = 0; q < 3; q++) got[q] += p.d[q] * p.sh._tint; });
    summary.push({ region: r + 1, pieces: ps.length, kept, want: want[r], got });
  }
  // the held-back remainders, one layer per source layer, just before the first middle value
  const extra = [...deferred.entries()].map(([L, shapes]) => ({ ...L, shapes, area: shapes.reduce((a, q) => a + q.area, 0), _order: { phase: 'mid', region: 0, shoot: false } }));
  const at = layers.findIndex(L => L._order && L._order.phase !== 'ground' && L._order.phase !== 'subject');
  const out = at < 0 ? [...layers, ...extra] : [...layers.slice(0, at), ...extra, ...layers.slice(at)];
  if (extra.length) out[at < 0 ? out.length - 1 : at + extra.length - 1]._order.shoot = true;
  log(`subject tint from ${stage} (paper ${paper.map(v => v.toFixed(0)).join('/')}): ${summary.map(s => `region ${s.region} ${s.kept} of ${s.pieces} pieces, density ${s.want.map(v => v.toFixed(2)).join('/')} laid ${s.got.map(v => v.toFixed(2)).join('/')}`).join('; ')}`);
  log(`subject tint: ${extra.reduce((a, L) => a + L.shapes.length, 0)} held-back remainders in ${extra.length} passes at the start of the middle values`);
  return { layers: out, summary };
}
