// --practicemode loose (the default under --practice 1): light washes, then details as dry brush. Highlight and detail
// areas keep their paper and get their form from dry brush and small marks; broad areas may take a fuller wash.
//   W1  one fast wet pass per region with a big brush: broad ground at --loosebroad of the artwork's amount, subject
//       and focus at --loosedetail. These dials come from the measured style (practice-style.mjs).
//   W2  a second pale wash where a broad area still lacks --loosew2 0.5 of its tone (pieces of at least
//       --loosew2min 0.003 of the sheet), at --loosew2share 0.6 of what is missing.
//   DB  small darks from the palette's blue and earth (--loosedark of what is left), then dry-brush strokes along the
//       form where the subject, focus and textured ground still want tone.
// The pen comes last, from paint-plate's closing pass.
import { removeSmall, dilate } from '../../raster.js';
import { pieces } from './practice-regions.mjs';
import { fitDark, DENSITY_SCALE, quantile } from './practice-plan.mjs';

export function looseStages(c) {
  const { A, K, T, PIGS, w, h, n, painted, LIGHTS, groups, fg, barrier, focus, pair, gaussian, num, log, SRC, dials } = c;
  const short = Math.min(w, h);
  const open = i => painted[i] && !LIGHTS[i];
  const laid = new Float32Array(n * K);
  const owed = i => { let t = 0; for (let j = 0; j < K; j++) t += Math.max(0, A[i * K + j] - laid[i * K + j]); return t; };
  const detail = Uint8Array.from({ length: n }, (_, i) => ((fg && fg[i]) || focus.focal[i] ? 1 : 0));
  const detailZone = dilate(detail, w, h, Math.max(1, Math.round(0.01 * short)));
  const stages = [];
  // W1
  {
    const P = new Float32Array(n * K), broad = dials.loosebroad, fine = dials.loosedetail;
    for (let i = 0; i < n; i++) if (open(i)) { const s = detailZone[i] ? fine : broad; for (let j = 0; j < K; j++) P[i * K + j] = A[i * K + j] * s; }
    const passages = groups.map((g, k) => {
      const cells = []; for (let i = 0; i < n; i++) if (g.mask[i] && open(i)) cells.push(i);
      return { name: `wet pass ${k + 1} (${g.name})`, cells: Int32Array.from(cells), kind: 'mop', ground: !g.foreground, prewet: true };
    }).filter(p => p.cells.length > 20).sort((a, b) => (a.ground === b.ground ? a.cells[0] - b.cells[0] : a.ground ? -1 : 1));
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    stages.push({ key: 'W1', name: 'one light wet pass', P, passages });
  }
  // W2
  {
    const P = new Float32Array(n * K), share = num('loosew2share', 0.6), need = num('loosew2', 0.5);
    const M = Uint8Array.from({ length: n }, (_, i) => (open(i) && !detailZone[i] && owed(i) > need * T[i] && owed(i) > 0.05 ? 1 : 0));
    const passages = pieces(removeSmall(M, w, h, Math.round(num('loosew2min', 0.003) * n)), w, h, { min: Math.round(num('loosew2min', 0.003) * n), cut: barrier })
      .map((cells, k) => ({ name: `second wash ${k + 1}`, cells, kind: 'mop', ground: true, prewet: false }));
    for (const p of passages) for (const i of p.cells) for (let j = 0; j < K; j++) P[i * K + j] = Math.max(0, A[i * K + j] - laid[i * K + j]) * share;
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    stages.push({ key: 'W2', name: 'a second pale wash where needed', P, passages });
  }
  // DB: the small darks, then dry brush
  {
    const P = new Float32Array(n * K), load = dials.loosedark;
    const Td = gaussian(T, w, h, Math.max(0.7, 0.004 * short));
    const tD = quantile(Array.from(Td), 1 - dials.loosedarks);
    const minP = Math.max(6, Math.round(0.0002 * n));
    const M = removeSmall(Uint8Array.from({ length: n }, (_, i) => (Td[i] >= tD && open(i) && owed(i) > 0.1 ? 1 : 0)), w, h, minP);
    const passages = [];
    for (const [k, cells] of pieces(M, w, h, { min: minP, cut: barrier }).entries()) {
      const target = [0, 0, 0];
      for (const i of cells) for (let j = 0; j < K; j++) { const r = Math.max(0, A[i * K + j] - laid[i * K + j]); for (let q = 0; q < 3; q++) target[q] += r * PIGS[j].K[q] / DENSITY_SCALE; }
      const mix = fitDark(target.map(v => v / cells.length), PIGS, pair), tot = mix.reduce((a, v) => a + v, 0) || 1;
      for (const i of cells) { const a = owed(i) * load; for (let j = 0; j < K; j++) P[i * K + j] = mix[j] / tot * a; }
      passages.push({ name: `small dark ${k + 1}`, cells, tech: 'thick', soften: 'far' });
    }
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    // what the dry brush is for: the detail zone, and ground whose source carries texture
    const B = gaussian(SRC, w, h, 1.5);
    const want = new Float32Array(n), dir = new Float32Array(n * K), cap = num('loosedrycap', 1.5);
    for (let i = 0; i < n; i++) {
      if (!open(i)) continue;
      const tex = Math.abs(SRC[i] - B[i]) > num('loosetexture', 0.04);
      if (!detailZone[i] && !tex) continue;
      const t = owed(i); if (t < 0.03) continue;
      want[i] = Math.min(cap, t) * (detailZone[i] ? 1 : dials.loosegroundry);
      for (let j = 0; j < K; j++) dir[i * K + j] = Math.max(0, A[i * K + j] - laid[i * K + j]) / t;
    }
    stages.push({ key: 'DB', name: 'small darks and dry brush', P, passages, dry: { want, dir, coverage: dials.loosedrycover } });
  }
  for (const s of stages) {
    const area = s.passages.reduce((a, p) => a + p.cells.length, 0);
    log(`practice ${s.key}, ${s.name}: ${s.passages.length} passages over ${(100 * area / n).toFixed(1)}% of the sheet${s.dry ? ', then dry brush' : ''}`);
  }
  return stages;
}
