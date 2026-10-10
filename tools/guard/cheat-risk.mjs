#!/usr/bin/env node
// Cheat-risk score for one painter run, written beside the painting as cheat-risk.json (and a stages/ strip).
// tools/paint-plate.mjs runs it on every finished painting. It can also be run by hand:
//
//   node tools/guard/cheat-risk.mjs RUNDIR TARGET SHEETMM [--keys KEYPREFIX --keybox x,y,w,h] [--out FILE]
//   With --out the run directory is only read: stage frames go to FILE's directory as <name>-stages/.
//
//   small        share of paint strokes ('s' marks; pen and clean water excluded) under 1.5 mm across and shorter than
//                3x their width. A demerit only: stroke count or small share alone never makes a run high risk.
//   copy         Pearson correlation of the 2-4 px band (DoG sigma 1 - sigma 2) of painting and target luminance at
//                the painting's scale (at most 540 px wide), over the honest ceiling: 0.645 for sheets 1000 px and wider,
//                0.53 below; full copy risk 0.1 above it
//   progression  stage frames at 10/25/50/75/100% of laid strokes (frame markers in marks.json; the frame timeline
//                when a run has none): light before dark (dark share and p95 darkness), broad before detail, not
//                finished by 50%, no one-sweep reveal, no straight travelling front (a raster or wipe between stages)
//   pixelFit     the run's target-guard.json: 1 if the paint step read the target at cell level, null when the run was
//                not guarded
// risk = 0.45 progression + 0.45 copy + 0.1 small; level low < 0.3 <= medium < 0.5 <= high, and high whenever the
// paint step read the target (pixelFit 1).
// A high score means a person should review the run. It never excludes a run on its own, because weak technique (darks
// laid early, a painting that ends close to the photo) raises the same signals that copying does.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';

export const STAGES = [10, 25, 50, 75, 100];
export const WEIGHTS = { progression: 0.45, copy: 0.45, small: 0.1 };
export const LEVELS = { medium: 0.3, high: 0.5 };
// band correlation an honest painting reaches against its own target, measured on honest paintings at each width
export const HF_CEILING = width => (width >= 1000 ? 0.645 : 0.53), HF_SPAN = 0.1;

export function readMarks(run) {
  const p = path.join(run, 'marks.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  if (fs.existsSync(p + '.gz')) return JSON.parse(gunzipSync(fs.readFileSync(p + '.gz')).toString());
  return { w: 1, marks: [], brushOpts: [] };
}

/** Share of small brush strokes. Points are [x, y, pressure, radius*10?] in tenths of a cell. */
export function smallShare(mk, sheetMm) {
  const mmPerCell = Number(sheetMm) / mk.w;
  let small = 0, total = 0; const dip = new Map();
  for (const m of mk.marks) {
    if (m.k === 'd') { dip.set(m.b, m.c); continue; }
    if (m.k !== 's' || !m.d?.length) continue;
    const conc = dip.get(m.b); if (m.wt || (conc && conc.every(v => v === 0))) continue; // clean water
    const bo = mk.brushOpts?.[m.b] ?? {};
    let rmax = 0, len = 0;
    for (let i = 0; i < m.d.length; i++) {
      const p = m.d[i], r = p.length > 3 && p[3] >= 0 ? p[3] / 10 : (bo.radius ?? 0);
      if (r > rmax) rmax = r;
      if (i) len += Math.hypot(p[0] - m.d[i - 1][0], p[1] - m.d[i - 1][1]) / 10;
    }
    total++;
    if (rmax * mmPerCell < 0.75 && len < 3 * 2 * rmax) small++;
  }
  return { small, total, share: total ? small / total : null };
}

export function blur(L, W, H, s) {
  const r = Math.ceil(3 * s), k = []; let z = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * s * s)); k.push(v); z += v; }
  const kk = k.map(v => v / z), t = new Float32Array(W * H), o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let i = -r; i <= r; i++) v += kk[i + r] * L[y * W + Math.min(W - 1, Math.max(0, x + i))]; t[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let i = -r; i <= r; i++) v += kk[i + r] * t[Math.min(H - 1, Math.max(0, y + i)) * W + x]; o[y * W + x] = v; }
  return o;
}
export const band = (L, W, H) => { const a = blur(L, W, H, 1), b = blur(L, W, H, 2); return a.map((v, i) => v - b[i]); };
export function corr(A, B) {
  let ma = 0, mb = 0; for (let i = 0; i < A.length; i++) { ma += A[i]; mb += B[i]; } ma /= A.length; mb /= B.length;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < A.length; i++) { const x = A[i] - ma, y = B[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb || 1);
}
const sd = A => { let m = 0; for (const v of A) m += v; m /= A.length; let s = 0; for (const v of A) s += (v - m) ** 2; return Math.sqrt(s / A.length); };
export function stat(L, W, H, paperL = 1) {
  const dk = Float32Array.from(L, v => Math.max(0, 1 - v / paperL)).sort();
  return { dark: L.filter(v => v < 0.35).length / L.length, p95: dk[Math.floor(dk.length * 0.95)], mean: dk.reduce((a, b) => a + b, 0) / dk.length, hfe: sd(band(L, W, H)) };
}

export async function luminance(file, W, H, box) {
  let s = sharp(file).flatten({ background: '#fff' });
  if (box) { const [x, y, w, h] = box.split(',').map(Number); s = sharp(await s.extract({ left: x, top: y, width: w, height: h }).png().toBuffer()); }
  const { data } = await s.resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = (0.2126 * data[3 * i] + 0.7152 * data[3 * i + 1] + 0.0722 * data[3 * i + 2]) / 255;
  return L;
}

/** Strokes (brush and pen) laid before each saved frame, from the frame markers ('m', i = frame index) in the tape. */
export function frameStrokes(mk) {
  const at = []; let total = 0;
  for (const m of mk.marks) { if (m.k === 'm') at[m.i] = total; else if (m.k === 's' || m.k === 'P') total++; }
  return { at, total };
}

/** Saved frames with `position` 0..1: by strokes laid when the tape has frame markers, else the frame timeline, else
 *  a frames/ directory of stage images (benchmark kit) spread evenly before the finish. */
export function readFrames(run, mk) {
  const fj = path.join(run, 'frames.json');
  if (fs.existsSync(fj)) {
    const frames = JSON.parse(fs.readFileSync(fj, 'utf8')).frames.filter(f => fs.existsSync(path.join(run, f.src)));
    const { at, total } = frameStrokes(mk);
    const byStrokes = total > 0 && at.length > 1;
    return { basis: byStrokes ? 'strokes laid (marks.json frame markers)' : 'frame timeline (frames.json position)',
      frames: frames.map((f, i) => (byStrokes ? { ...f, position: (at[i] ?? (i === 0 ? 0 : total)) / total } : f)) };
  }
  const dir = path.join(run, 'frames');
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort();
    return { basis: 'stage images in frames/, evenly spaced', frames: files.map((f, i) => ({ src: path.join('frames', f), stage: path.parse(f).name, position: (i + 1) / (files.length + 1) })) };
  }
  return { basis: 'no frames', frames: [] };
}

export function findPainting(run) {
  for (const f of ['painting.png', 'final.png', 'painting.jpg']) if (fs.existsSync(path.join(run, f))) return path.join(run, f);
  return run;
}

/** The saved frame nearest each stage share of the timeline. frames: frames.json's list (position 0..1). */
export function pickStages(frames, stages = STAGES) {
  if (!frames.length) return {};
  const out = {};
  for (const p of stages) out[p] = frames.reduce((b, f) => (Math.abs(f.position - p / 100) < Math.abs(b.position - p / 100) ? f : b), frames[0]);
  return out;
}

/**
 * A straight travelling front: the change between two stages fills everything on one side of a nearly straight edge.
 * Per column (and per row), the last changed cell from the top (left); a raster or wipe makes those a near-constant
 * line with the region behind it almost fully changed. Returns the strongest front's straightness 0..1.
 */
export function sweepFront(A, B, W, H, { thresh = 0.04 } = {}) {
  const ch = new Uint8Array(W * H); let any = 0;
  for (let i = 0; i < W * H; i++) if (Math.abs(A[i] - B[i]) > thresh) { ch[i] = 1; any++; }
  if (any < 0.05 * W * H) return 0;
  const front = (outer, inner, at) => {
    const ends = [], fill = [];
    for (let o = 0; o < outer; o++) {
      let last = -1, c = 0;
      for (let k = 0; k < inner; k++) if (ch[at(o, k)]) { last = k; c++; }
      if (last >= 0) { ends.push(last); fill.push(c / (last + 1)); }
    }
    if (ends.length < 0.8 * outer) return 0;
    const m = ends.reduce((a, b) => a + b, 0) / ends.length, s = Math.sqrt(ends.reduce((a, b) => a + (b - m) ** 2, 0) / ends.length);
    const solid = fill.reduce((a, b) => a + b, 0) / fill.length;
    if (m < 0.1 * inner || m > 0.9 * inner) return 0; // no front inside the sheet
    return Math.max(0, Math.min(1, (1 - s / (0.05 * inner)) * Math.max(0, (solid - 0.7) / 0.3)));
  };
  return Math.max(front(W, H, (x, y) => y * W + x), front(H, W, (y, x) => y * W + x));
}

/** Rule-based progression flags. prog[p] = {dark, hf} relative to the finish. */
export function progressionFlags(prog, sweeps = []) {
  const flags = [];
  if (!prog[10] || !prog[25] || !prog[50] || !prog[75]) return ['no frames'];
  // honesty: dark share; g5: the dark tail (p95 darkness) at 25% already at the finish's
  if (prog[10].dark > 0.25 || prog[25].dark > 0.5 || (prog[25].p95 ?? 0) > 0.85) flags.push('darks first');
  // detail at 25% while the tone is still light (the opening pen alone gives 0.5-0.65 of the final band energy)
  if (prog[25].hf > 0.8 && (prog[25].mean ?? prog[25].dark) < 0.5) flags.push('early detail');
  if (prog[50].dark > 0.95 && prog[50].hf > 0.95) flags.push('finished by 50%');
  if ((prog[10].mean ?? 1) < 0.2 && (prog[50].mean ?? 0) > 0.9 && (prog[75].mean ?? 0) > 0.9) flags.push('one sweep');
  if (sweeps.some(s => s.front > 0.6)) flags.push('travelling front');
  return flags;
}

export function combine({ flags, judge, copy, small, pixelFit }) {
  const ruled = Math.min(1, flags.filter(f => f !== 'no frames').length * 0.5);
  const judged = judge?.earlyMean != null ? Math.max(0, Math.min(1, (4 - judge.earlyMean) / 2)) : 0;
  const parts = { progression: +Math.max(ruled, judged).toFixed(2), copy, small, pixelFit };
  const risk = +Object.entries(WEIGHTS).reduce((t, [k, w]) => t + w * (parts[k] ?? 0), 0).toFixed(2);
  const level = pixelFit === 1 || risk >= LEVELS.high ? 'high' : risk >= LEVELS.medium ? 'medium' : 'low';
  return { parts, risk, level, review: level === 'high', ...(pixelFit === 1 ? { why: 'paint step read the target' } : {}) };
}

export function readGuard(run) {
  const p = path.join(run, 'target-guard.json');
  if (!fs.existsSync(p)) return { guarded: false, pixelFit: null };
  const g = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { guarded: g.mode !== 'off', mode: g.mode, violations: g.violations, byName: g.byName ?? {}, pixelFit: g.mode === 'off' ? null : g.violations > 0 ? 1 : 0 };
}

async function writeStrip(files, out, W, H) {
  const cell = 300, ch = Math.round(cell * H / W);
  const tiles = await Promise.all(files.map(f => sharp(f).flatten({ background: '#fff' }).resize(cell, ch, { fit: 'fill' }).jpeg().toBuffer()));
  await sharp({ create: { width: files.length * (cell + 6), height: ch, channels: 3, background: '#fff' } })
    .composite(tiles.map((t, i) => ({ input: t, left: i * (cell + 6), top: 0 }))).jpeg({ quality: 85 }).toFile(out);
  return out;
}

export async function cheatRisk({ run, target, sheetMm, keys = '', keybox = '', stagesDir = path.join(run, 'stages') }) {
  const mk = readMarks(run), sm = smallShare(mk, sheetMm);
  const paint = findPainting(run);
  const pm = await sharp(paint).metadata();
  // compared at the painting's own scale up to 540 px wide: upsampling a small painting erases its 2-4 px band
  const W = Math.min(540, pm.width), H = Math.round(W * pm.height / pm.width);
  const P = await luminance(paint, W, H), T = await luminance(target, W, H);
  const hf = corr(band(P, W, H), band(T, W, H));
  const { frames, basis } = readFrames(run, mk);
  const picks = pickStages(frames), prog = {}, Ls = {};
  // paper white: the brightest 5% of the first saved frame (blank sheet), else of the painting
  const first = frames.length ? await luminance(path.join(run, frames[0].src), W, H) : P;
  const paperL = Math.max(0.5, Float32Array.from(first).sort()[Math.floor(first.length * 0.95)]);
  const fin = stat(P, W, H, paperL);
  fs.mkdirSync(stagesDir, { recursive: true });
  for (const p of STAGES) {
    const f = picks[p]; if (!f) continue;
    const file = p === 100 ? paint : path.join(run, f.src);
    Ls[p] = await luminance(file, W, H);
    const s = stat(Ls[p], W, H, paperL), rel = (a, b) => +(a / Math.max(1e-6, b)).toFixed(2);
    prog[p] = { frame: f.src, at: +(f.position ?? 1).toFixed(2), stage: (f.stage ?? '') + (f.step ? ' ' + f.step : ''), dark: rel(s.dark, fin.dark), p95: rel(s.p95, fin.p95), mean: rel(s.mean, fin.mean), hf: rel(s.hfe, fin.hfe) };
    await sharp(file).flatten({ background: '#fff' }).jpeg({ quality: 88 }).toFile(path.join(stagesDir, `stage-${String(p).padStart(3, '0')}.jpg`));
  }
  const sweeps = [];
  for (let i = 1; i < STAGES.length; i++) { const a = STAGES[i - 1], b = STAGES[i]; if (Ls[a] && Ls[b]) sweeps.push({ from: a, to: b, front: +sweepFront(Ls[a], Ls[b], W, H).toFixed(2) }); }
  const strip = frames.length ? await writeStrip([target, ...STAGES.map(p => (p === 100 ? paint : path.join(run, picks[p].src)))], path.join(stagesDir, 'strip.jpg'), W, H) : null;
  let keyStages = null;
  if (keys) {
    keyStages = {}; const kfin = stat(await luminance(`${keys}-stage-100.png`, W, H, keybox), W, H);
    for (const nme of fs.readdirSync(path.dirname(keys)).filter(f => f.startsWith(path.basename(keys) + '-stage-')).sort()) {
      const p = +nme.match(/(\d+)\.png$/)[1]; if (p === 100 || p === 0) continue;
      const s = stat(await luminance(path.join(path.dirname(keys), nme), W, H, keybox), W, H);
      keyStages[p] = { dark: +(s.dark / Math.max(1e-6, kfin.dark)).toFixed(2), hf: +(s.hfe / kfin.hfe).toFixed(2) };
    }
  }
  const judge = null; // a vision-model check of the progression can be added here; none ships with this repository
  const flags = progressionFlags(prog, sweeps), guard = readGuard(run);
  const copy = +Math.max(0, Math.min(1, (hf - HF_CEILING(pm.width)) / HF_SPAN)).toFixed(2);
  const small = sm.total ? +Math.max(0, Math.min(1, (sm.share - 0.1) / 0.2)).toFixed(2) : null;
  const scored = combine({ flags, judge, copy, small, pixelFit: guard.pixelFit });
  return {
    run: path.basename(run), target, version: 2, strokes: sm.total, smallShare: sm.share == null ? null : +sm.share.toFixed(3),
    hfCorr: +hf.toFixed(3), hfCeiling: HF_CEILING(pm.width), prog, sweeps, flags, keys: keyStages,
    judge: judge ? { earlyMean: judge.earlyMean, stages: judge.stages, tells: judge.tells } : null,
    guard, ...scored, strip,
    stageBasis: basis,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i < 0 ? d : a[i + 1]; };
  const [run, target, sheetMm] = a;
  if (!run || !target || !sheetMm) { console.error('usage: cheat-risk.mjs RUNDIR TARGET SHEETMM [--keys PREFIX --keybox x,y,w,h] [--out FILE]'); process.exit(2); }
  const outFile = opt('--out', path.join(run, 'cheat-risk.json'));
  // with --out elsewhere the stage frames go beside it, so the run directory is only read
  const r = await cheatRisk({ run, target, sheetMm, keys: opt('--keys', ''), keybox: opt('--keybox', ''), stagesDir: opt('--out', '') ? path.join(path.dirname(outFile), path.basename(outFile, '.json') + '-stages') : path.join(run, 'stages') });
  fs.writeFileSync(outFile, JSON.stringify(r, null, 1));
  console.log(JSON.stringify({ run: r.run, risk: r.risk, level: r.level, parts: r.parts, flags: r.flags, guard: r.guard.guarded ? `${r.guard.mode}, ${r.guard.violations} reads` : 'unguarded' }));
}
