// --darkmass <segments|auto>: technique for black fur and other dark surfaces, built in paint with little or no ink.
// The ladder's glazes and the pens keep off the mass, which darkens in four steps spread over the ladder: a mid wash
// with the lit edge lifted, a darker glaze on the shadow side, dry brush at the silhouette, then the darkest accents.
// Flags, all off unless --darkmass is given:
//   --darkmassat 0,0.3,0.55,0.8   where in the ladder each step runs, as shares of its passes
//   --darkmassq 0.9               under auto, a dark cell is at this quantile of the sheet's plan density or more
//   --darkmass1 0.35              step 1 lays this share of the plan; --darkmasslitmul 0.75 of that on the lit cells
//   --darkmasslit 0.15            the lit cells: this palest share of the mass, and the top edge (--darkmasstop 1 cell)
//   --darkmasslight 0.3           a whole segment drops cells under this share of its median plan density
//   --darkmassinset 2             step 1 stops this many cells inside the edge; the fur carries it out
//   --darkmassglazes 6            a wash step is up to this many glazes, until the sheet holds --darkmassenough 0.9
//   --darkmass2 0.8               step 2 brings the shadow side (above the --darkmassshade 0.3 quantile) to this share,
//                                 the lit cells to --darkmass2lit 0.6
//   --darkmassfur 1               step 3 on whole-segment masses (2 on every mass, 0 off; off by default with curls)
//                                 --darkmassfurin 3 and --darkmassfurout 4 cells either side of the edge,
//                                 --darkmassfurgap 2 cells between roots, --darkmassfurwater 0.42,
//                                 --darkmassfurcharge 1.2 times the plan at the root
//   --darkmassdeep 0.8            step 4 works the cells above this quantile of the mass's plan
//   --darkmasslift 1              the lift in step 1 on or off
//   --darkmasspen cut             cut the pens off the mass (cut) or leave them (keep)
//   --darkmassshape artwork       a named mass is shaped from the artwork's density (dark-mass-shape.mjs), or `segment`
//   --darkmasscurls walker|<base> curly brush strokes after steps 1 and 2: along the pen walker's own gestures on the mass
//                                 (walker; the pen does not draw them), or along work/lines/<base>-lines.json
//   --darkmasscurlw 2,5           their width in cells; --darkmassslivers 0.015 of the mass kept paper as slivers beside them
//   --darkmassprewet 1            step 1's first glaze goes into clean water laid over the same sweeps
import { hasSegments, loadSegments } from '../../crop/segments.mjs';
import { artworkMass, outerEdge, curlPaths, walkerCurls, sliverFlecks } from './dark-mass-shape.mjs';


// the masses to paint: a named segment whole; under `auto` a segment whole when --darkmassshare of it is dark, else
// its dark components (closed by --darkmassclose cells, at least --darkmassmin cells)
function chooseMasses({ seg, names, PLAN, SRC, w, h, n, components, dilate, erode, num, opt, log }) {
  // dark is relative to the sheet: the plan's densities are in pan amounts, whose scale changes with the palette
  const od = opt('darkmassod', '') !== '' ? num('darkmassod', 0) : quantileOver(PLAN, new Uint8Array(n).fill(1), num('darkmassq', 0.9));
  const share = num('darkmassshare', 0.5);
  const close = Math.max(0, Math.round(num('darkmassclose', 1))), min = Math.max(4, Math.round(num('darkmassmin', 30)));
  const auto = names.includes('auto');
  const out = [];
  if (auto) log(`dark mass: auto, a cell is dark at plan density ${od.toFixed(2)} or more`);
  for (const r of seg.regions) {
    if (!r.area || !(auto || names.includes(r.name))) continue;
    let cells = 0, dark = 0;
    for (let i = 0; i < n; i++) if (r.mask[i]) { cells++; if (PLAN[i] >= od) dark++; }
    if (cells < min) continue;
    // a segment named in the flag is a mass whole; under `auto` a segment is whole only when most of it is dark
    if (names.includes(r.name) || dark / cells >= share) {
      // --darkmassshape artwork (the default when the artwork's density is at hand): the shape read off the artwork
      // inside the grown segment, with its flecks (dark-mass-shape.mjs); `segment` keeps the segment's own shape
      if (SRC && opt('darkmassshape', 'artwork') === 'artwork') {
        const a = artworkMass({ seg: r.mask, SRC, w, h, n, dilate, erode, components, num });
        let f = 0; for (let i = 0; i < n; i++) f += a.flecks[i];
        log(`dark mass: ${r.name} shaped from the artwork's density (${a.cut.toFixed(2)} or more inside the grown segment), ${f} fleck cells kept as paper`);
        out.push({ name: r.name, mask: a.filled, flecks: a.flecks, whole: true });
        continue;
      }
      // whole, less the cells the plan keeps light: a segment traced on the photograph overhangs the painted form.
      // Those cells stay with the ladder. --darkmasslight is a share of the segment's median plan density.
      const vals = []; for (let i = 0; i < n; i++) if (r.mask[i]) vals.push(PLAN[i]);
      vals.sort((a, b) => a - b);
      const floor = num('darkmasslight', 0.3) * vals[vals.length >> 1];
      let m = Uint8Array.from(r.mask, (v, i) => (v && PLAN[i] >= floor ? 1 : 0));
      if (close) m = erode(dilate(m, w, h, close), w, h, close);
      for (let i = 0; i < n; i++) if (!r.mask[i]) m[i] = 0;
      const { labels, areas, count } = components(m, w, h);
      const keep = new Set(); for (let id = 1; id <= count; id++) if (areas[id] >= min) keep.add(id);
      out.push({ name: r.name, mask: Uint8Array.from(labels, l => (keep.has(l) ? 1 : 0)), whole: true });
      continue;
    }
    let m = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (r.mask[i] && PLAN[i] >= od) m[i] = 1;
    if (close) m = erode(dilate(m, w, h, close), w, h, close);
    for (let i = 0; i < n; i++) if (!r.mask[i]) m[i] = 0;
    const { labels, areas, count } = components(m, w, h);
    const keep = new Set(); for (let id = 1; id <= count; id++) if (areas[id] >= min) keep.add(id);
    if (!keep.size) continue;
    const mask = new Uint8Array(n); for (let i = 0; i < n; i++) if (keep.has(labels[i])) mask[i] = 1;
    out.push({ name: `${r.name} darks`, mask, whole: false });
  }
  return out;
}

// the plan's quantile over a mask
function quantileOver(F, mask, q) {
  const v = []; for (let i = 0; i < mask.length; i++) if (mask[i]) v.push(F[i]);
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.max(0, Math.floor(q * (v.length - 1))))];
}

// pen strokes cut where they cross the mask, each surviving run kept if it has two points
export function cutStrokes(strokes, mask, w, h) {
  if (!strokes || !mask) return strokes;
  const inside = q => { const x = Math.min(w - 1, Math.max(0, Math.round(q.x))), y = Math.min(h - 1, Math.max(0, Math.round(q.y))); return mask[y * w + x] === 1; };
  const len = pts => pts.reduce((a, p, k) => a + (k ? Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y) : 0), 0);
  const out = [];
  for (const g of strokes) {
    let run = [];
    const flush = () => { if (run.length >= 2) out.push({ ...g, points: run, length: len(run) }); run = []; };
    for (const q of g.points) { if (inside(q)) flush(); else run.push(q); }
    flush();
  }
  return out;
}

export async function darkMass(ctx) {
  const spec = ctx.opt('darkmass', '');
  if (!spec) return null;
  const { w, h, n, K, A, image, path, dilate, erode, components, num, opt, log, sheet } = ctx;
  const base = image ? path.basename(image, path.extname(image)) : '';
  if (!base || !hasSegments(base)) { log(`dark mass: no segments for ${base || 'this source'}, nothing chosen`); return null; }
  const seg = await loadSegments(base, w, h);
  const PLAN = new Float32Array(n);
  for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < K; j++) t += A[i * K + j]; PLAN[i] = t; }
  const names = spec.split(',').map(s => s.trim()).filter(Boolean);
  const masses = chooseMasses({ seg, names, PLAN, SRC: ctx.SRC, w, h, n, components, dilate, erode, num, opt, log });
  if (!masses.length) { log(`dark mass: no dark mass in ${names.join(', ')}`); return null; }
  const owned = new Uint8Array(n);
  for (const m of masses) for (let i = 0; i < n; i++) if (m.mask[i]) owned[i] = 1;
  let area = 0; for (let i = 0; i < n; i++) area += owned[i];
  for (const m of masses) {
    let a = 0; for (let i = 0; i < n; i++) a += m.mask[i];
    log(`dark mass: ${m.name}${m.whole ? ' (whole segment)' : ''}, ${a} cells, plan density median ${quantileOver(PLAN, m.mask, 0.5).toFixed(2)}, 90th ${quantileOver(PLAN, m.mask, 0.9).toFixed(2)}, 10th ${quantileOver(PLAN, m.mask, 0.1).toFixed(2)}`);
  }
  log(`dark mass: ${(100 * area / n).toFixed(1)}% of the sheet left to the dark-mass steps; the ladder and the pens keep off it`);
  const penCut = opt('darkmasspen', 'cut') !== 'keep' ? dilate(owned, w, h, 1) : null;
  const at = opt('darkmassat', '0,0.3,0.55,0.8').split(',').map(Number);
  if (at.length !== 4 || at.some(v => !Number.isFinite(v))) throw new Error(`--darkmassat: four shares of the ladder, not ${opt('darkmassat', '')}`);
  const steps = [paintStep1, paintStep2, paintStep3, paintStep4];
  let next = 0;
  const painter = makePainter({ ...ctx, PLAN });
  return {
    owned,
    masses,
    // a ladder passage with the mass taken out, or null when the passage was all mass
    clip(mask) {
      let hit = 0; for (let i = 0; i < n; i++) if (mask[i] && owned[i]) { hit = 1; break; }
      if (!hit) return mask;
      const m = Uint8Array.from(mask, (v, i) => (v && !owned[i] ? 1 : 0));
      let a = 0; for (let i = 0; i < n; i++) a += m[i];
      return a ? { mask: m, area: a } : null;
    },
    cutPen: strokes => (penCut ? cutStrokes(strokes, penCut, w, h) : strokes),
    // the pen walker's gestures, handed over before the pen draws; those on a mass are kept as its curl paths
    takeGestures(gestures) {
      if (opt('darkmasscurls', '') !== 'walker') return;
      for (const m of masses) m.curls = walkerCurls({ gestures, mass: m.mask, w, h, dilate, num, log });
    },
    // run every step whose place in the ladder has come
    async at(share) {
      while (next < 4 && share >= at[next]) {
        for (const m of masses) await steps[next](painter, m);
        painter.finishStep(next + 1);
        next++;
        if (next === 4 && painter.ownResist) { ctx.liftResist(sheet); painter.dryAll(); }
      }
    },
  };
}

// the shared machinery of the four steps: reading the sheet, charging a brush for what a target still lacks, strokes
function makePainter(ctx) {
  const {
    sheet, w, h, n, SC, W2, H2, N2, K, A, expected, used, O, SEED, UPRIGHT, CAL, PLAN,
    thickness, gaussian, dilate, erode, distanceToZero, createBrush, dip, stroke, step, dry,
    brushedWashPaths, containPaths, sweepCover, clock, snap, setStage, num, log,
  } = ctx;
  let s = (Math.round(SEED) + 7717) | 0 || 1;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const STRENGTH = num('strength', 2.2);
  const up = m => {
    if (SC === 1) return m instanceof Uint8Array ? m : Uint8Array.from(m);
    const o = new Uint8Array(N2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) o[y * W2 + x] = m[((y / SC) | 0) * w + ((x / SC) | 0)];
    return o;
  };
  const upF = f => {
    const o = new Float32Array(N2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) o[y * W2 + x] = f[((y / SC) | 0) * w + ((x / SC) | 0)];
    return o;
  };
  const onSheet = () => {
    const th = thickness(sheet), on = new Float32Array(n * K);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const i = ((y / SC) | 0) * w + ((x / SC) | 0), c = y * W2 + x;
      for (let j = 0; j < K; j++) on[i * K + j] += th[j][c] / (SC * SC);
    }
    return on;
  };
  const cellOf = p => Math.min(h - 1, Math.max(0, Math.round(p.y / SC - 0.5))) * w + Math.min(w - 1, Math.max(0, Math.round(p.x / SC - 0.5)));
  const flowEvery = k => Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, k))));
  const settle = q => clock('flow', () => { for (let t = 0; t < q; t++) step(sheet, O); });
  const dryAll = () => clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  const count = (k, v) => { used[k] = (used[k] || 0) + v; };
  const book = (mask, share) => { for (let i = 0; i < n; i++) if (mask[i]) for (let j = 0; j < K; j++) expected[i * K + j] = Math.max(expected[i * K + j], A[i * K + j] * share); };
  // the mean density the sheet holds over a mask, all pans, for the log: the numbers behind each frame
  const held = mask => { const on = onSheet(); let t = 0, p = 0, c = 0; for (let i = 0; i < n; i++) if (mask[i]) { for (let j = 0; j < K; j++) t += on[i * K + j]; p += PLAN[i]; c++; } return c ? `${(t / c).toFixed(2)} of the plan's ${(p / c).toFixed(2)}` : '-'; };
  const pressure = pts => {
    const total = pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0) || 1;
    let run = 0;
    return pts.map((p, i) => {
      if (i) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      const u = run / total;
      return { ...p, p: Math.max(0.2, Math.min(1, (0.74 + 0.26 * Math.sin(Math.PI * u)) * Math.min(Math.min(1, u / 0.06), Math.min(1, (1 - u) / 0.1)))) };
    });
  };
  // Wash strokes over a mask, each recharged every few cells for what the target still lacks under it, per pan, so a
  // step over paint already dark enough lays next to nothing there. A step is laid as glazes on the dry sheet until it
  // holds --darkmassenough of the target or --darkmassglazes are down: one wet pass delivers about a third of a black.
  // The last glaze is left wet, so a lift can follow it.
  const wash = (mask, target, opts) => {
    const glazes = Math.max(1, Math.round(num('darkmassglazes', 6))), enough = num('darkmassenough', 0.9);
    let total = 0;
    for (let g = 0; g < glazes; g++) {
      const on = onSheet(); let want = 0, have = 0;
      for (let i = 0; i < n; i++) if (mask[i]) for (let j = 0; j < K; j++) { const t = target(i, j); want += t; have += Math.min(t, on[i * K + j]); }
      if (!(want > 0) || have >= enough * want) break;
      if (g) dryAll();
      total += washOnce(mask, target, { ...opts, prewet: !!opts.prewet && g === 0, seed: opts.seed + 97 * g });
      settle(num('darkmasssettle', 24));
    }
    return total;
  };
  const washOnce = (mask, target, { maxRadius, water, brush: bopts, cal, seed, chunk = 5, overlap = 0.25, pad = 0.6, prewet = false }) => {
    const M2 = up(mask), dist = distanceToZero(M2, W2, H2);
    let rIn = 0; for (let i = 0; i < N2; i++) if (dist[i] > rIn) rIn = dist[i];
    const RAD = Math.max(SC, Math.min(maxRadius, Math.round(0.45 * rIn)));
    const on = onSheet(), lack = new Float32Array(n * K), field = new Float32Array(n);
    for (let i = 0; i < n; i++) if (mask[i]) for (let j = 0; j < K; j++) { const v = Math.max(0, target(i, j) - on[i * K + j]); lack[i * K + j] = v; field[i] += v; }
    let paths = brushedWashPaths(M2, W2, H2, { pad: pad * SC, minRadius: SC, minLength: 3 * SC, maxRadius: RAD, field: upF(field), seed: seed + SEED, overlap, walk: true });
    paths = containPaths(paths, dist, W2, H2, { minRadius: 0.7 * SC, minLength: 2 * SC, slack: 0.35 * SC });
    if (!paths.length) return 0;
    const cover = Math.max(1, sweepCover(paths, M2, W2, H2)), every = flowEvery(paths.length), chunkLen = Math.max(2, chunk * SC);
    // prewet: clean water over the same sweeps first, so the charge goes into damp paper and the lanes merge; wet on
    // dry, each lane's edge dries into a line before the next arrives
    if (prewet) for (const pts of paths) {
      const r = Math.max(SC, Math.max(...pts.map(p => p.r)));
      const wet = createBrush({ flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, seed: seed + 7 + SEED });
      dip(wet, { water: 1, conc: new Array(K).fill(0) });
      clock('strokes', () => stroke(wet, sheet, pts, { upright: UPRIGHT }));
    }
    let k = 0;
    for (const raw of paths) {
      const pts = pressure(raw), r = Math.max(SC, Math.max(...pts.map(p => p.r)));
      const brush = createBrush({ radius: r, bristles: Math.max(8, Math.ceil(r * 2)), capacity: 60, belly: 6, feed: 0.25, give: 0.85, free: 0.4, film: 0.25, splay: 0.05, stiffness: 6, seed: seed + 31 * k++ + SEED, ...bopts });
      const chunks = []; let d = 0;
      for (let q = 0; q < pts.length; q++) {
        if (q) d += Math.hypot(pts[q].x - pts[q - 1].x, pts[q].y - pts[q - 1].y);
        if (!chunks.length || d >= chunkLen) { chunks.push(q ? [pts[q - 1]] : []); d = 0; }
        chunks[chunks.length - 1].push(pts[q]);
      }
      clock('strokes', () => chunks.forEach(ch => {
        const conc = new Array(K).fill(0);
        for (const p of ch) { const i = cellOf(p); for (let j = 0; j < K; j++) conc[j] += lack[i * K + j]; }
        dip(brush, { water, conc: conc.map(v => v / ch.length * STRENGTH * cal / cover) });
        stroke(brush, sheet, ch, { upright: UPRIGHT, flowEvery: every, between: t => { if (t % every === 0) clock('flow', () => step(sheet, O)); } });
      }));
    }
    return paths.length;
  };
  // strokes of a given brush along given paths, each dipped at the lack under its first few cells
  // absolute: charged at the target itself, not at what the sheet lacks of it; a dry brush lays a film at the brush's
  // own concentration wherever it touches, so its value is set by the charge and not by what is under it
  const drag = (paths, target, { water, brush: bopts, cal, seed, upright = false, absolute = false }) => {
    if (!paths.length) return 0;
    const on = onSheet(), every = flowEvery(paths.length);
    const brush = createBrush({ ...bopts, seed: seed + SEED });
    clock('strokes', () => { for (const pts of paths) {
      const conc = new Array(K).fill(0), m = Math.min(pts.length, 4);
      for (let q = 0; q < m; q++) { const i = cellOf(pts[q]); for (let j = 0; j < K; j++) conc[j] += absolute ? target(i, j) : Math.max(0, target(i, j) - on[i * K + j]); }
      dip(brush, { water, conc: conc.map(v => v / m * STRENGTH * cal) });
      stroke(brush, sheet, pts, { upright, flowEvery: every, between: t => { if (t % every === 0) clock('flow', () => step(sheet, O)); } });
    } });
    return paths.length;
  };
  return {
    ...ctx, rnd, up, upF, onSheet, settle, dryAll, count, book, held, wash, drag, pressure, flowEvery,
    calWet: CAL?.['wet on dry'] ?? 1, calDry: CAL?.['dry brush'] ?? 1,
    finishStep(k) { log(`dark mass: step ${k} done`); },
    // flecks under masking fluid, joined to the sheet's own; when the sheet had none, lifted again after step 4
    ownResist: false,
    keepFlecks(mask) {
      const here = up(mask), was = sheet.resist, both = new Uint8Array(N2);
      for (let i = 0; i < N2; i++) both[i] = here[i] || (was && was[i]) ? 1 : 0;
      if (!was) this.ownResist = true;
      ctx.applyResist(sheet, both);
    },
  };
}

// the lit cells of a mass: its palest share by the plan, and a band along its top edge
function litCells(P, mass) {
  const { w, h, n, PLAN, erode, num } = P;
  const cut = quantileOver(PLAN, mass, num('darkmasslit', 0.15));
  const top = Math.max(0, Math.round(num('darkmasstop', 1)));
  const lit = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (mass[i] && PLAN[i] <= cut) lit[i] = 1;
  if (top) {
    // a cell is on the top edge when some cell up to `top` above it is outside the mass
    for (let i = 0; i < n; i++) if (mass[i]) { const x = i % w, y = (i / w) | 0; for (let d = 1; d <= top; d++) { if (y - d < 0 || !mass[(y - d) * w + x]) { lit[i] = 1; break; } } }
  }
  return lit;
}

// 1. the mid-value wash, wet, lit cells paler, then the lift out of the damp lit back
async function paintStep1(P, m) {
  const { n, K, A, SC, num, opt, log, setStage, snap, erode, w, h } = P;
  const mass = m.mask, lit = litCells(P, mass), share = num('darkmass1', 0.35), litMul = num('darkmasslitmul', 0.75);
  const body = erode(mass, w, h, Math.max(0, Math.round(num('darkmassinset', 2))));
  const target = (i, j) => A[i * K + j] * share * (lit[i] ? litMul : 1);
  // the artwork's paper flecks under masking fluid before any paint, added to whatever the sheet already carries;
  // with walker curls the flecks are slivers along them (sliverFlecks), since round holes read as pinpoints
  if (opt('darkmasscurls', '') === 'walker') { if (m.curls?.length) P.keepFlecks(sliverFlecks({ curls: m.curls, mass: m.mask, w, h, n, num, rnd: P.rnd, log })); }
  else if (m.flecks) P.keepFlecks(m.flecks);
  const k = P.wash(body, target, { maxRadius: Math.max(SC, Math.round(num('darkmassradius', 5) * SC)), water: num('darkmasswater', 0.55), cal: P.calWet, seed: 4101, prewet: num('darkmassprewet', 1) > 0,
    brush: { wetMix: 0.8, bridge: 0.95, bridgeSoft: 2.8, breakup: 1.2, grainShift: 2 } });
  P.count('dark mass wash', k);
  log(`dark mass: ${m.name}, step 1, ${k} wet strokes of a mid wash; the mass holds ${P.held(mass)}`);
  setStage({ stage: 'dark mass', step: `${m.name}: 1, a mid-value wash over the whole mass, the lit back paler`, strokes: k });
  snap();
  if (num('darkmasslift', 1) > 0) {
    // a thirsty brush, squeezed damp and no pigment, dragged along the lit back while the wash still stands
    const L2 = P.up(lit), ld = P.distanceToZero(L2, P.W2, P.H2);
    let lp = P.brushedWashPaths(L2, P.W2, P.H2, { pad: 0.4 * SC, minRadius: SC, minLength: 3 * SC, maxRadius: Math.max(SC, Math.round(num('darkmassliftr', 1.6) * SC)), seed: 4201 + P.SEED, overlap: -0.6, walk: true });
    lp = P.containPaths(lp, ld, P.W2, P.H2, { minRadius: 0.6 * SC, minLength: 2 * SC, slack: 0.3 * SC });
    const zero = () => 0;
    const r = Math.max(SC, Math.round(num('darkmassliftr', 1.6) * SC));
    const j = P.drag(lp.map(p => p.map(q => ({ ...q, p: 0.55 }))), zero, { water: num('darkmassliftwater', 0.1), cal: 0, seed: 4301, upright: P.UPRIGHT,
      brush: { radius: r, bristles: Math.max(6, 3 * r), capacity: 30, belly: 2, feed: 0.15, give: 0.6, free: 0.55, film: 0.2, splay: 0.1, stiffness: 3, wetMix: 0, bridge: 0.3, bridgeSoft: 0.8, breakup: 2.4, streak: 0.6 } });
    P.settle(12);
    P.count('dark mass lift', j);
    log(`dark mass: ${m.name}, step 1, ${j} thirsty drags lift the damp lit back; the mass holds ${P.held(mass)}`);
    setStage({ stage: 'dark mass', step: `${m.name}: 1, lights lifted out of the damp wash`, drags: j });
    snap();
  }
  P.dryAll();
  P.book(mass, share);
  await paintCurls(P, m, 1);
}

// 2. a darker glaze on the dry sheet over the shadow side, soft into the lit side and onto the cast shadow below
async function paintStep2(P, m) {
  const { n, K, A, SC, w, h, num, log, setStage, snap, gaussian, dilate, PLAN } = P;
  const mass = m.mask, lit = litCells(P, mass), share = num('darkmass2', 0.8);
  const mid = quantileOver(PLAN, mass, 0.5);
  // The shadow side as a coherent shape: the mass above the --darkmassshade quantile of its plan, smoothed, less the lit
  // cells. For black fur that is most of the mass, not only its darker half.
  const shadeCut = quantileOver(PLAN, mass, num('darkmassshade', 0.3));
  const raw = Float32Array.from({ length: n }, (_, i) => (mass[i] && PLAN[i] >= shadeCut ? 1 : 0));
  const sm = gaussian(raw, w, h, num('darkmassshadesmooth', 1.5));
  const shade = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (mass[i] && !lit[i] && sm[i] >= 0.5) shade[i] = 1;
  // the cast shadow: ground cells within a few cells below the mass where the plan is dark too
  let cy = 0, c = 0; for (let i = 0; i < n; i++) if (mass[i]) { cy += (i / w) | 0; c++; }
  cy /= Math.max(1, c);
  const near = dilate(mass, w, h, Math.round(num('darkmasscast', 3)));
  for (let i = 0; i < n; i++) if (near[i] && !mass[i] && ((i / w) | 0) >= cy && PLAN[i] >= mid * num('darkmasscastod', 0.35)) shade[i] = 1;
  let area = 0; for (let i = 0; i < n; i++) area += shade[i];
  if (area < 6) { log(`dark mass: ${m.name}, step 2, no shadow side`); return; }
  // The glaze goes over the lit cells too, charged lighter (--darkmass2lit of the plan), so the lit back is a dark grey
  // and not the first wash's mid grey: black fur is dark on its lit side too. The brush is recharged
  // as it crosses from shadow to light, which grades the change rather than cutting it.
  const litShare = num('darkmass2lit', 0.6);
  const over = Uint8Array.from(shade, (v, i) => (v || mass[i] ? 1 : 0));
  const target = (i, j) => A[i * K + j] * (shade[i] ? share : litShare);
  const k = P.wash(over, target, { maxRadius: Math.max(SC, Math.round(num('darkmassradius', 5) * SC * 0.8)), water: num('darkmass2water', 0.45), cal: P.calWet, seed: 5101,
    brush: { wetMix: 0.3, bridge: 0.7, bridgeSoft: 1.8, breakup: 1.7, grainShift: 2 } });
  // the last glaze is still wet: soften now
  // the edge where the glaze meets the lit side is lost: a clean damp brush run along it while the glaze is wet
  const inner = new Uint8Array(n);
  const grown = dilate(shade, w, h, 1);
  for (let i = 0; i < n; i++) if (grown[i] && !shade[i] && mass[i]) inner[i] = 1;
  const rings = [];
  {
    const pts = []; for (let i = 0; i < n; i++) if (inner[i]) pts.push(i);
    // short strokes of three to five cells along the band, each from a band cell to its nearest band neighbour chain
    const taken = new Uint8Array(n);
    for (const i0 of pts) {
      if (taken[i0]) continue;
      let i = i0; const run = [];
      while (run.length < 6) {
        taken[i] = 1; run.push({ x: ((i % w) + 0.5) * SC, y: (((i / w) | 0) + 0.5) * SC, r: SC * 1.2, p: 0.6 });
        let nxt = -1; const x = i % w, y = (i / w) | 0;
        for (let dy = -1; dy <= 1 && nxt < 0; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if ((dx || dy) && xx >= 0 && yy >= 0 && xx < w && yy < h && inner[yy * w + xx] && !taken[yy * w + xx]) { nxt = yy * w + xx; break; } }
        if (nxt < 0) break; i = nxt;
      }
      if (run.length >= 3) rings.push(run);
    }
  }
  const r = Math.max(SC, Math.round(1.2 * SC));
  const soft = P.drag(rings, () => 0, { water: num('darkmasssoftwater', 0.5), cal: 0, seed: 5201,
    brush: { radius: r, bristles: Math.max(6, 3 * r), capacity: 40, belly: 4, feed: 0.3, give: 0.85, free: 0.4, film: 0.25, splay: 0.05, stiffness: 4, wetMix: 0.6, bridge: 0.9, bridgeSoft: 2.5, breakup: 1.0 } });
  P.settle(num('darkmasssettle', 24));
  P.dryAll();
  P.count('dark mass glaze', k); P.count('dark mass soft edge', soft);
  P.book(shade, share);
  log(`dark mass: ${m.name}, step 2, ${k} strokes of a darker glaze over the shadow side (${area} cells), ${soft} soft-edge strokes; the mass holds ${P.held(mass)}`);
  setStage({ stage: 'dark mass', step: `${m.name}: 2, a darker glaze on the shadow side, lost edges`, strokes: k });
  snap();
  await paintCurls(P, m, 2);
}

// 3. dry brush dragged outward along the fur at the silhouette
async function paintStep3(P, m) {
  const { n, K, A, SC, w, h, num, opt, log, setStage, snap, gaussian, rnd, distanceToZero } = P;
  // Fur is for a coat. A mass cut out of a larger segment (jacket folds, hair under a head) has an edge inside it where
  // flicks look spiky, so such masses get fur only with --darkmassfur 2. With curls, flicks on top read as a crusty rim.
  const fur = num('darkmassfur', opt('darkmasscurls', '') ? 0 : 1);
  if (fur <= 0 || (!m.whole && fur < 2)) return;
  const mass = m.mask;
  const S = gaussian(Float32Array.from(mass), w, h, num('darkmasssmooth', 1.6));
  let cx = 0, cy = 0, c = 0; for (let i = 0; i < n; i++) if (mass[i]) { cx += i % w; cy += (i / w) | 0; c++; }
  cx /= c; cy /= c;
  // from the outer silhouette only: flicks from the rims of holes inside the mass read as stars
  const outer = outerEdge(mass, w, h);
  const edge = []; for (let i = 0; i < n; i++) if (outer[i]) edge.push(i);
  edge.sort((a, b) => Math.atan2(((a / w) | 0) - cy, (a % w) - cx) - Math.atan2(((b / w) | 0) - cy, (b % w) - cx));
  const gap = Math.max(1, num('darkmassfurgap', 2)), taken = new Uint8Array(n), inL = num('darkmassfurin', 3), outL = num('darkmassfurout', 4);
  const hooks = num('darkmassfurhook', 0.35), rootR = num('darkmassfurr', 1.2), tipR = num('darkmassfurtip', 0.35);
  const paths = [];
  const G = Math.ceil(gap);
  for (const i of edge) {
    if (taken[i]) continue;
    const px = i % w, py = (i / w) | 0;
    for (let dy = -G; dy <= G; dy++) for (let dx = -G; dx <= G; dx++) { const xx = px + dx, yy = py + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && dx * dx + dy * dy <= gap * gap) taken[yy * w + xx] = 1; }
    if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) continue;
    let gx = -(S[i + 1] - S[i - 1]) / 2, gy = -(S[i + w] - S[i - w]) / 2;
    const gm = Math.hypot(gx, gy);
    if (gm < 1e-4) { gx = px - cx; gy = py - cy; }
    const mm = Math.hypot(gx, gy) || 1; gx /= mm; gy /= mm;
    const scale = 0.6 + 0.8 * rnd(), hook = rnd() < hooks;
    const li = inL * scale, lo = outL * scale * (hook ? num('darkmassfurhooklen', 2.2) : 1), total = li + lo;
    const a0 = Math.atan2(gy, gx) + (rnd() - 0.5) * num('darkmassfurscatter', 0.8);
    const bend = (hook ? (rnd() < 0.5 ? -1 : 1) * (0.6 + 0.6 * rnd()) : (rnd() - 0.5)) * num('darkmassfurbend', 0.4);
    let x = px - Math.cos(a0) * li, y = py - Math.sin(a0) * li, a = a0;
    const pts = [], st = 0.7;
    for (let t = 0; t <= total + 1e-6; t += st) {
      const u = Math.min(1, t / total);
      if (x < 0 || y < 0 || x > w - 1 || y > h - 1) break;
      // pressed at the root inside the coat, lifting as it leaves it, so the tip breaks up first
      pts.push({ x: (x + 0.5) * SC, y: (y + 0.5) * SC, r: SC * (rootR + (tipR - rootR) * u), p: Math.max(0.15, 0.95 - 0.8 * Math.pow(u, 1.2)) });
      a += bend * st; x += Math.cos(a) * st; y += Math.sin(a) * st;
    }
    if (pts.length >= 3) paths.push(pts);
  }
  // the fur holds the mass's own dark: every stroke charged at what the plan asks at its root, near the full plan
  const share = num('darkmassfurshare', 0.95);
  const target = (i, j) => A[i * K + j] * share;
  const r = Math.max(1, Math.round(rootR * SC));
  const k = P.drag(paths, target, { water: num('darkmassfurwater', 0.42), cal: P.calDry * num('darkmassfurcharge', 1.2), seed: 6101, absolute: true,
    brush: { radius: r, bristles: Math.max(5, Math.round(4 * r)), capacity: 30, belly: 3, feed: 0.3, give: 0.85, free: 0.45, film: 0.28, splay: 0.09, stiffness: 3, wetMix: 0.15, bridge: num('darkmassfurbridge', 0.62), bridgeSoft: 1.5, breakup: num('darkmassfurbreakup', 1.0), streak: 0.5 } });
  P.settle(10);
  P.dryAll();
  P.count('dark mass dry-brush fur', k);
  log(`dark mass: ${m.name}, step 3, ${k} dry-brush strokes dragged outward at the silhouette, ${inL} cells in to ${outL} out; the mass holds ${P.held(mass)}`);
  setStage({ stage: 'dark mass', step: `${m.name}: 3, dry brush dragged out along the fur at the edge`, strokes: k });
  snap();
}

// 4. the darkest accents, a small tip, only in the deepest cells
async function paintStep4(P, m) {
  const { n, K, A, SC, w, h, num, log, setStage, snap, PLAN, components } = P;
  const mass = m.mask, cut = quantileOver(PLAN, mass, num('darkmassdeep', 0.8));
  const lit = litCells(P, mass);
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (mass[i] && !lit[i] && PLAN[i] >= cut) raw[i] = 1;
  const { labels, areas, count } = components(raw, w, h);
  const deep = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (labels[i] && areas[labels[i]] >= 3) deep[i] = 1;
  let area = 0; for (let i = 0; i < n; i++) area += deep[i];
  if (area < 3) { log(`dark mass: ${m.name}, step 4, no deep cells`); return; }
  const target = (i, j) => A[i * K + j] * num('darkmassdeepshare', 1.0);
  const k = P.wash(deep, target, { maxRadius: Math.max(1, Math.round(num('darkmasstip', 1.2) * SC)), water: num('darkmass4water', 0.3), cal: P.calWet, seed: 7101, chunk: 3, overlap: -0.2, pad: 0.3,
    brush: { capacity: 25, belly: 2, feed: 0.2, wetMix: 0.1, bridge: 0.55, bridgeSoft: 1.2, breakup: num('darkmass4breakup', 2.0), streak: 0.5 } });
  P.settle(10);
  P.dryAll();
  P.count('dark mass accents', k);
  P.book(mass, 1);
  log(`dark mass: ${m.name}, step 4, ${k} small-tip accents over the deepest ${area} cells (of ${count} pieces); the mass holds ${P.held(mass)}`);
  setStage({ stage: 'dark mass', step: `${m.name}: 4, the darkest accents with a small tip`, strokes: k });
  snap();
}


// Curly brush strokes, dark on dark: a small round brush, wet, in the mass's dark mix, along the artwork's own traced
// curls, which run past the silhouette where the artwork's do. Laid once the mid wash is down (pass 1, --darkmasscurl1
// 0.8 of the dark mix) and again over the shadow glaze (pass 2, --darkmasscurl2 1.0), so the fur is brush work, not pen.
async function paintCurls(P, m, pass) {
  const { K, A, SC, w, h, n, num, opt, log, setStage, snap, dilate, rnd } = P;
  const base = opt('darkmasscurls', '');
  if (!base) return;
  if (!m.curls && base !== 'walker') m.curls = curlPaths({ base, mass: m.mask, w, h, dilate, num, rnd, log });
  if (!m.curls?.length) { log(`dark mass: ${m.name}, no curl paths${base === 'walker' ? ' (the walker drew no first pass)' : ''}`); return; }
  const share = num(`darkmasscurl${pass}`, pass === 1 ? 0.8 : 1.0), mix = new Array(K).fill(0);
  for (let j = 0; j < K; j++) { const v = []; for (let i = 0; i < n; i++) if (m.mask[i]) v.push(A[i * K + j]); v.sort((a, b) => a - b); mix[j] = (v[Math.floor(num('darkmasscurlq', 0.7) * (v.length - 1))] ?? 0) * share; }
  // --darkmasscurlw lo,hi: stroke width in cells; each stroke takes one of three sizes between the two, at random
  const [wlo, whi] = opt('darkmasscurlw', '2,5').split(',').map(Number);
  const sizes = [0, 1, 2].map(t => Math.max(0.6, (wlo + (whi - wlo) * t / 2) / 2) * SC), groups = sizes.map(() => []);
  for (const g of m.curls) {
    const t = Math.min(2, Math.floor(rnd() * 3));
    groups[t].push(P.pressure(g.map(q => ({ x: q.x * SC, y: q.y * SC, r: sizes[t] }))).map(q => ({ ...q, p: q.p * num('darkmasscurlpress', 0.85) })));
  }
  let k = 0;
  for (const [t, paths] of groups.entries()) {
    const r = sizes[t];
    k += P.drag(paths, (i, j) => mix[j], { water: num('darkmasscurlwater', 0.4), cal: P.calWet, seed: 8101 + 10 * pass + t, absolute: true,
      brush: { radius: r, bristles: Math.max(6, Math.ceil(4 * r)), capacity: 30, belly: 3, feed: 0.3, give: 0.85, free: 0.4, film: 0.25, splay: 0.05, stiffness: 3, wetMix: 0.3, bridge: 0.85, bridgeSoft: 1.8, breakup: 1.1 } });
  }
  P.settle(12);
  P.dryAll();
  P.count('dark mass curls', k);
  log(`dark mass: ${m.name}, curls ${pass}, ${k} curly strokes of a small round brush, dark on dark; the mass holds ${P.held(m.mask)}`);
  setStage({ stage: 'dark mass', step: `${m.name}: curls ${pass}, curly brush strokes dark on dark`, strokes: k });
  snap();
}
