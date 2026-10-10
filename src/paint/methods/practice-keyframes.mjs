// Practice stages (first washes, darks, modelling, finish) as passages. targetStages derives them from the plan and
// is the live path. keyframeStages reads them from per-stage images and is unused: --practicekf throws.
import fs from 'node:fs';
import sharp from 'sharp';
import { dilate, erode, removeSmall, fillHoles } from '../../raster.js';
import { pieces } from './practice-regions.mjs';
import { fitDark, DENSITY_SCALE, quantile } from './practice-plan.mjs';

async function density(file, w, h) {
  const { data } = await sharp(file).resize(w, h, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const L = Float32Array.from({ length: w * h }, (_, i) => 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]);
  const paper = Float32Array.from(L).sort()[Math.floor(L.length * 0.95)] || 255;
  return Float32Array.from(L, v => Math.max(0, -Math.log(Math.max(0.02, Math.min(1, v / paper)))));
}

// Each stage image says where that stage worked; the artwork plan A says what colour and value went there.
async function keyframeStages(c) {
  const { A, K, T, PIGS, w, h, n, painted, LIGHTS, fg, barrier, focus, pair, gaussian, num, log, dir } = c;
  const kf = {};
  for (const s of ['A', 'B', 'D', 'H', 'I']) kf[s] = gaussian(await density(`${dir}/${s}.jpg`, w, h), w, h, 0.8);
  const short = Math.min(w, h), minP = Math.max(12, Math.round(0.0004 * n));
  const open = i => painted[i] && !LIGHTS[i];
  const laid = new Float32Array(n * K);
  const residual = (i, j) => Math.max(0, A[i * K + j] - laid[i * K + j]);
  const sumOf = (P, i) => { let t = 0; for (let j = 0; j < K; j++) t += P[i * K + j]; return t; };
  const stages = [];
  // Lit planes of the subject: under --kflit of the artwork blurred at --kflitblur (share of the short side).
  // They keep the first wash only; later stages paint round them.
  const Tb = gaussian(T, w, h, Math.max(1.5, num('kflitblur', 0.012) * short));
  const LIT = fg ? removeSmall(Uint8Array.from({ length: n }, (_, i) => (fg[i] && open(i) && T[i] < num('kflit', 0.65) * Tb[i] ? 1 : 0)), w, h, Math.max(6, minP >> 1)) : new Uint8Array(n);
  { let c = 0, f = 0; for (let i = 0; i < n; i++) { c += LIT[i]; if (fg && fg[i]) f++; } log(`practice: ${c} lit cells in the subject (${(100 * c / Math.max(1, f)).toFixed(0)}% of it) keep their first wash only`); }

  // B: first washes, where B added tone to A
  {
    const P = new Float32Array(n * K), share = num('kfbshare', 0.3);
    let M = Uint8Array.from({ length: n }, (_, i) => ((kf.B[i] - kf.A[i] > num('kfbmin', 0.04) || LIT[i]) && open(i) ? 1 : 0));
    M = removeSmall(erode(dilate(M, w, h, 1), w, h, 1), w, h, minP);
    const passages = pieces(M, w, h, { min: minP, cut: barrier }).map((cells, k) => ({ name: `first wash ${k + 1}`, cells, tech: 'wet', prewet: true, soften: 'none' }));
    for (const p of passages) for (const i of p.cells) for (let j = 0; j < K; j++) P[i * K + j] = A[i * K + j] * share;
    // --kfpale (source density): ground lights that are a tint, not paper, get one full-value wash now and are held after
    const pale = num('kfpale', 0);
    if (pale > 0) {
      let Mp = Uint8Array.from({ length: n }, (_, i) => (c.SRC[i] < pale && open(i) && !M[i] && !(fg && fg[i]) ? 1 : 0));
      Mp = removeSmall(Mp, w, h, minP);
      for (const [k, cells] of pieces(Mp, w, h, { min: minP, cut: barrier }).entries()) {
        for (const i of cells) for (let j = 0; j < K; j++) P[i * K + j] = A[i * K + j];
        passages.push({ name: `pale sheen ${k + 1}`, cells, tech: 'wet', prewet: true, soften: 'none', ground: true });
      }
    }
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    stages.push({ key: 'B', name: 'first washes', P, passages });
  }
  // D: dark masses, mixed thick
  {
    const P = new Float32Array(n * K), load = num('kfdload', 0.8);
    const Db = gaussian(kf.D, w, h, 2);
    // only where D is dark and the artwork is too (its darkest --kfdtop of the painted sheet): D can darken mid values
    const pv = []; for (let i = 0; i < n; i++) if (painted[i]) pv.push(T[i]);
    const tTop = quantile(pv, 1 - num('kfdtop', 0.12));
    let M = Uint8Array.from({ length: n }, (_, i) => (Db[i] > num('kfdmin', 0.5) && T[i] >= tTop && open(i) ? 1 : 0));
    M = removeSmall(fillHoles(M, w, h, Math.round(0.0005 * n)), w, h, minP);
    M = Uint8Array.from(M, (v, i) => (v && !LIGHTS[i] ? 1 : 0));
    // only masses: a dark smaller than --kfdarkmin of the sheet is a fold, which the modelling stage carries
    M = removeSmall(M, w, h, Math.round(num('kfdarkmin', 0.0015) * n));
    const passages = [];
    for (const [k, cells] of pieces(M, w, h, { min: minP, cut: barrier }).entries()) {
      // the dark mixed on the palette to the piece's mean colour, then laid heavier where the artwork is darker
      const target = [0, 0, 0]; let mean = 0;
      for (const i of cells) { let t = 0; for (let j = 0; j < K; j++) { const r = residual(i, j); t += r; for (let q = 0; q < 3; q++) target[q] += r * PIGS[j].K[q] / DENSITY_SCALE; } mean += t; }
      mean /= cells.length;
      if (mean < 0.05) continue;
      const mix = fitDark(target.map(v => v / cells.length), PIGS, pair), tot = mix.reduce((a, v) => a + v, 0) || 1;
      for (const i of cells) { let t = 0; for (let j = 0; j < K; j++) t += residual(i, j); const a = t * load; for (let j = 0; j < K; j++) P[i * K + j] = mix[j] / tot * a; }
      passages.push({ name: `dark ${k + 1}`, cells, tech: 'thick', soften: 'far' });
    }
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    stages.push({ key: 'D', name: 'darks', P, passages });
  }
  // H: late modelling inside the subject
  {
    const P = new Float32Array(n * K), load = num('kfhload', 0.7);
    const Hb = gaussian(kf.H, w, h, 1.5), subj = fg ? dilate(fg, w, h, 2) : Uint8Array.from({ length: n }, () => 1);
    let M = Uint8Array.from({ length: n }, (_, i) => (subj[i] && !LIT[i] && Hb[i] > num('kfhmin', 0.10) && open(i) && sumOf(laid, i) < 0.9 * T[i] && T[i] - sumOf(laid, i) > 0.05 ? 1 : 0));
    M = removeSmall(erode(dilate(M, w, h, 1), w, h, 1), w, h, minP);
    const passages = [];
    for (const [k, cells] of pieces(M, w, h, { min: minP, cut: barrier }).entries()) {
      for (const i of cells) for (let j = 0; j < K; j++) P[i * K + j] = residual(i, j) * load;
      passages.push({ name: `modelling ${k + 1}`, cells, tech: 'model', soften: 'far' });
    }
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    stages.push({ key: 'H', name: 'modelling', P, passages });
  }
  // finish: the setting washed wet round the subject, then accents at the focus
  {
    const P = new Float32Array(n * K);
    const ground = Uint8Array.from({ length: n }, (_, i) => (open(i) && !(fg && fg[i]) ? 1 : 0));
    const passages = [];
    for (const [k, cells] of pieces(ground, w, h, { min: Math.max(minP, Math.round(0.002 * n)), cut: barrier }).entries()) {
      for (const i of cells) for (let j = 0; j < K; j++) P[i * K + j] = residual(i, j) * num('kfiground', 0.8);
      passages.push({ name: `setting ${k + 1}`, cells, tech: 'wet', prewet: true, soften: 'none', ground: true });
    }
    // top of the sheet first, as a wash is laid
    passages.sort((a, b) => a.cells[0] - b.cells[0]);
    // then the subject's own colour where earlier stages left it short, as smaller shapes
    if (fg) {
      const owed = Uint8Array.from({ length: n }, (_, i) => { if (!fg[i] || !open(i) || LIT[i]) return 0; const r = T[i] - sumOf(laid, i); return r > num('kfiowed', 0.3) * T[i] && r > 0.05 ? 1 : 0; });
      for (const [k, cells] of pieces(removeSmall(owed, w, h, minP), w, h, { min: minP, cut: barrier }).entries()) {
        for (const i of cells) for (let j = 0; j < K; j++) P[i * K + j] = residual(i, j) * num('kfiload', 0.85);
        passages.push({ name: `subject colour ${k + 1}`, cells, tech: 'model', soften: 'far' });
      }
    }
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    const want = new Float32Array(n), mdir = new Float32Array(n * K), zone = dilate(focus.focal, w, h, Math.max(1, Math.round(0.02 * short)));
    for (let i = 0; i < n; i++) {
      if (!zone[i] || !open(i)) continue;
      let t = 0; for (let j = 0; j < K; j++) t += residual(i, j);
      want[i] = Math.min(num('practicecap4', 1.2), t) * (0.5 + 0.5 * focus.F[i]);
      if (t > 1e-6) for (let j = 0; j < K; j++) mdir[i * K + j] = residual(i, j) / t;
    }
    stages.push({ key: 'I', name: 'setting and finish', P, passages, marks: { want, dir: mdir } });
  }
  for (const s of stages) {
    const area = s.passages.reduce((a, p) => a + p.cells.length, 0);
    log(`practice ${s.key}, ${s.name}: ${s.passages.length} passages over ${(100 * area / n).toFixed(1)}% of the sheet${s.marks ? ', then accents at the focus' : ''}`);
  }
  return stages;
}

// The four stages read off the plan (--practicemode target), using the picture's own shapes:
//   B       first washes: each first-pass group at --kfbshare 0.3 of the plan, cell by cell, so the wash follows the form
//   D       dark masses: the darkest --practicedarks 0.03 of the sheet at a small brush's blur, mixed thick
//   H       modelling: where the owed amount is over its --practicemidq 0.5 quantile, at --kfhload 0.7 of it
//   finish  the rest of each group at --kfiground 0.8 of what is owed, then accents at the focus
export function targetStages(c) {
  const { A, K, T, PIGS, w, h, n, painted, LIGHTS, groups, barrier, focus, pair, gaussian, num, log } = c;
  const short = Math.min(w, h), minP = Math.max(8, Math.round(num('practicepiecemin', 0.0002) * n));
  const open = i => painted[i] && !LIGHTS[i];
  const laid = new Float32Array(n * K);
  const residual = (i, j) => Math.max(0, A[i * K + j] - laid[i * K + j]);
  const owed = i => { let t = 0; for (let j = 0; j < K; j++) t += residual(i, j); return t; };
  const stages = [];
  const groupPieces = (keep, min) => groups.flatMap(g => pieces(Uint8Array.from(g.mask, (v, i) => (v && keep(i) ? 1 : 0)), w, h, { min, cut: barrier }).map(cells => ({ cells, ground: !g.foreground, name: g.name })));
  // B
  {
    const P = new Float32Array(n * K), share = num('kfbshare', 0.3);
    const passages = groupPieces(open, Math.max(minP, Math.round(0.001 * n))).map((p, k) => ({ ...p, name: `first wash ${k + 1} (${p.name})`, tech: 'wet', prewet: true, soften: 'none' }));
    for (const p of passages) for (const i of p.cells) for (let j = 0; j < K; j++) P[i * K + j] = A[i * K + j] * share;
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    stages.push({ key: 'B', name: 'first washes', P, passages });
  }
  // D
  {
    const P = new Float32Array(n * K), load = num('kfdload', 0.8);
    const Td = gaussian(T, w, h, Math.max(0.7, 0.004 * short));
    const tD = quantile(Array.from(Td), 1 - num('practicedarks', 0.03));
    let M = Uint8Array.from({ length: n }, (_, i) => (Td[i] >= tD && open(i) && owed(i) > 0.05 ? 1 : 0));
    M = removeSmall(fillHoles(M, w, h, Math.round(0.0003 * n)), w, h, minP);
    const passages = [];
    for (const [k, cells] of pieces(M, w, h, { min: minP, cut: barrier }).entries()) {
      const target = [0, 0, 0];
      for (const i of cells) for (let j = 0; j < K; j++) { const r = residual(i, j); for (let q = 0; q < 3; q++) target[q] += r * PIGS[j].K[q] / DENSITY_SCALE; }
      const mix = fitDark(target.map(v => v / cells.length), PIGS, pair), tot = mix.reduce((a, v) => a + v, 0) || 1;
      for (const i of cells) { const a = owed(i) * load; for (let j = 0; j < K; j++) P[i * K + j] = mix[j] / tot * a; }
      passages.push({ name: `dark ${k + 1}`, cells, tech: 'thick', soften: 'far' });
    }
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    stages.push({ key: 'D', name: 'darks', P, passages });
  }
  // H
  {
    const P = new Float32Array(n * K), load = num('kfhload', 0.7);
    const O = gaussian(Float32Array.from({ length: n }, (_, i) => (open(i) ? owed(i) : 0)), w, h, 1);
    const vals = []; for (let i = 0; i < n; i++) if (open(i)) vals.push(O[i]);
    const tH = Math.max(0.05, quantile(vals, num('practicemidq', 0.5)));
    let M = Uint8Array.from(O, (v, i) => (v > tH && open(i) ? 1 : 0));
    M = removeSmall(M, w, h, minP);
    const passages = [];
    for (const [k, cells] of pieces(M, w, h, { min: minP, cut: barrier }).entries()) {
      for (const i of cells) for (let j = 0; j < K; j++) P[i * K + j] = residual(i, j) * load;
      passages.push({ name: `modelling ${k + 1}`, cells, tech: 'model', soften: 'far' });
    }
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    stages.push({ key: 'H', name: 'modelling', P, passages });
  }
  // finish
  {
    const P = new Float32Array(n * K), load = num('kfiground', 0.8);
    const passages = groupPieces(i => open(i) && owed(i) > 0.05, minP).map((p, k) => ({ ...p, name: `finish ${k + 1} (${p.name})`, tech: 'dry', soften: 'none' }));
    for (const p of passages) for (const i of p.cells) for (let j = 0; j < K; j++) P[i * K + j] = residual(i, j) * load;
    for (let i = 0; i < n * K; i++) laid[i] += P[i];
    const want = new Float32Array(n), mdir = new Float32Array(n * K), zone = dilate(focus.focal, w, h, Math.max(1, Math.round(0.02 * short)));
    for (let i = 0; i < n; i++) {
      if (!zone[i] || !open(i)) continue;
      const t = owed(i);
      want[i] = Math.min(num('practicecap4', 1.2), t) * (0.5 + 0.5 * focus.F[i]);
      if (t > 1e-6) for (let j = 0; j < K; j++) mdir[i * K + j] = residual(i, j) / t;
    }
    stages.push({ key: 'I', name: 'finish', P, passages, marks: { want, dir: mdir } });
  }
  for (const s of stages) {
    const area = s.passages.reduce((a, p) => a + p.cells.length, 0);
    log(`practice ${s.key}, ${s.name}: ${s.passages.length} passages over ${(100 * area / n).toFixed(1)}% of the sheet${s.marks ? ', then accents at the focus' : ''}`);
  }
  return stages;
}
