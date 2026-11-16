// Pipeline: planning (before the target guard seals the subject), laid in stage 5 after the touch-ups.
// Accents: the last few strong touches a painter puts in on dry paper (painting rules 37, 45, 49; art-teacher.md
// section 8): a pupil, a nostril, the mouth line, the dark under a door, each one mark of near-solid paint with a small
// brush, and the catchlight the brush goes round. The value ladder cannot carry them: a dark smaller than its minimum
// shape is merged into the band around it, so the plan books it at that band's value.
//
// Chosen here, at planning, from the subject's own value scale (its paper to its ink in nine steps, the rule the pen
// tracer and the touch-ups use), never from a count:
//   - a dark accent is a connected piece of the subject's two darkest steps, no smaller than one touch of the detail
//     brush's tip and smaller than the ladder's minimum shape (a larger dark is the ladder's own), at least one band of
//     the plan's ladder darker than the paper or paint round it (two tip widths out). The ring is read at its median, so
//     a dark lying on one side of a darker mass, or a gap between lit curls in a dark coat, is not an accent: a dark only
//     a step off its surroundings sits inside a band the ladder already lays;
//   - darks closer together than the ladder's minimum shape is across are one group, and only its darkest piece is an
//     accent (rule 49: group them and let one lead); the others are that shape's texture (curl gaps in a coat);
//   - a catchlight is a light piece of the subject's lightest steps, no larger than a tip touch, inside or against a
//     dark accent: the mark goes round it and the washes leave it as paper.
// Each accent is one mark shaped like its piece: a round touch for a compact piece, one stroke along the centreline of a
// longer one, as wide as the piece (never narrower than the tip).
import { components } from '../../raster.js';
import { subjectValueStep } from '../step-backs.mjs';
import { channelDensity, unmix } from '../../crop/pigments.mjs';
import { renderLayers } from '../../media/km.mjs';
import { planLedger } from '../../eval/plan-values.mjs';

/** Cells within `r` cells (chessboard) of a piece, not in `member`. */
function ring(list, w, h, r, member) {
  const out = [], seen = new Set(list);
  for (const i of list) {
    const x = i % w, y = (i / w) | 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx; if (seen.has(j)) continue; seen.add(j); if (!member[j]) out.push(j);
    }
  }
  return out;
}

/** A piece's centre, long axis (angle), length along it and mean width (area over length), in cells. */
function pieceAxis(list, w) {
  let sx = 0, sy = 0;
  for (const i of list) { sx += i % w; sy += (i / w) | 0; }
  const cx = sx / list.length, cy = sy / list.length;
  let xx = 0, yy = 0, xy = 0;
  for (const i of list) { const dx = i % w - cx, dy = ((i / w) | 0) - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(angle), uy = Math.sin(angle);
  let lo = Infinity, hi = -Infinity;
  for (const i of list) { const t = (i % w - cx) * ux + (((i / w) | 0) - cy) * uy; if (t < lo) lo = t; if (t > hi) hi = t; }
  const length = hi - lo + 1;
  return { cx, cy, angle, lo, hi, length, width: list.length / length };
}

/**
 * The accents of one subject, chosen at planning.
 * lum: the subject's luminance per cell, 0 (black) .. 1 (white). mmPerCell: sheet mm per cell. tipMm: the detail
 * brush's tip width. maxCells: the ladder's minimum shape in cells. pen: cells the planned drawing covers (left to the
 * pen), protect: lights the plan already keeps (0/1 per cell, or null).
 * Returns { step, all (every dark piece with its group), darks (each group's leader): [{ cells, lum, ring, cx, cy, angle, lo, hi, length, width }], lights: 0/1 mask, lightCount }.
 */
export function planAccents(lum, w, h, { mmPerCell, tipMm, maxCells, bands, pen = null, protect = null } = {}) {
  const n = w * h;
  if (lum.length !== n) throw new Error('accents: luminance must be w x h');
  if (!(mmPerCell > 0) || !(tipMm > 0) || !(maxCells > 0) || !(bands >= 1)) throw new Error('accents: mmPerCell, tipMm, maxCells and the ladder\'s band count must be positive');
  const step = subjectValueStep(lum);
  const sorted = Float32Array.from(lum).sort(), ink = sorted[Math.floor(0.001 * (n - 1))], paper = sorted[Math.floor(0.99 * (n - 1))];
  const tipCells = Math.max(1, tipMm / mmPerCell), touch = Math.max(1, Math.round(Math.PI * (tipCells / 2) ** 2));
  const reach = Math.max(1, Math.round(2 * tipCells)), band = (paper - ink) / bands;
  // a dark shape is a connected piece of the subject's two darkest steps (a whole shape, so the rim of a large dark is
  // not mistaken for a small one)
  const cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (lum[i] <= ink + 2 * step && !(pen && pen[i]) && !(protect && protect[i])) cand[i] = 1;
  const cc = components(cand, w, h), lists = Array.from({ length: cc.count + 1 }, () => []);
  for (let i = 0; i < n; i++) if (cc.labels[i]) lists[cc.labels[i]].push(i);
  const darks = [];
  for (let id = 1; id <= cc.count; id++) {
    const list = lists[id];
    if (list.length < touch || list.length >= maxCells) continue;
    let inside = 0; for (const i of list) inside += lum[i]; inside /= list.length;
    const rc = ring(list, w, h, reach, cand); if (!rc.length) continue;
    // it stands in lighter surroundings: more than half its ring is a band lighter (the ring's median), not one side of a dark mass
    const rv = Float32Array.from(rc, j => lum[j]).sort(), out = rv[rv.length >> 1];
    if (out - inside < band) continue;
    darks.push({ cells: list, lum: inside, ring: out, ...pieceAxis(list, w) });
  }
  // group them and let one lead (painting rule 49; Maginnis, ch. VI): darks closer together than the ladder's minimum
  // shape is across are one group (the curl gaps of a coat, the pupil and lid line of one eye); the group's darkest
  // piece is its accent, the rest are that shape's texture, left to its washes
  const sep = Math.max(1, Math.round(Math.sqrt(maxCells / Math.PI))), owner = new Int32Array(n).fill(-1);
  darks.forEach((d, k) => { for (const i of d.cells) owner[i] = k; });
  const parent = darks.map((_, k) => k), root = k => (parent[k] === k ? k : (parent[k] = root(parent[k])));
  darks.forEach((d, k) => {
    for (const i of d.cells) {
      const x = i % w, y = (i / w) | 0;
      for (let dy = -sep; dy <= sep; dy++) for (let dx = -sep; dx <= sep; dx++) {
        if (dx * dx + dy * dy > sep * sep) continue;
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const o = owner[yy * w + xx]; if (o >= 0 && o !== k) parent[root(o)] = root(k);
      }
    }
  });
  const lead = new Map();
  darks.forEach((d, k) => { const g = root(k), b = lead.get(g); if (!b || d.lum < b.lum || (d.lum === b.lum && d.cells.length > b.cells.length)) lead.set(g, d); });
  const found = darks.length, all = darks.map((d, k) => ({ ...d, group: root(k) }));
  darks.length = 0; darks.push(...lead.values());
  darks.sort((a, b) => a.lum - b.lum);
  // catchlights: lights of the two lightest steps, no larger than a tip touch, touching a dark accent's ring
  const darkMask = new Uint8Array(n); for (const d of darks) for (const i of d.cells) darkMask[i] = 1;
  const near = new Uint8Array(n); for (const d of darks) for (const j of ring(d.cells, w, h, Math.max(1, Math.round(tipCells)), darkMask)) near[j] = 1;
  const pale = Uint8Array.from(lum, (v, i) => (v >= paper - 2 * step && !darkMask[i] ? 1 : 0));
  const pc = components(pale, w, h), pl = Array.from({ length: pc.count + 1 }, () => []);
  for (let i = 0; i < n; i++) if (pc.labels[i]) pl[pc.labels[i]].push(i);
  const lights = new Uint8Array(n);
  let lightCount = 0;
  for (let id = 1; id <= pc.count; id++) {
    const list = pl[id];
    if (list.length > touch || !list.some(i => near[i])) continue;
    for (const i of list) lights[i] = 1;
    lightCount++;
  }
  return { step, band, ink, paper, touch, reach, found, all, darks, lights, lightCount };
}

/**
 * One mark per accent, shaped like its piece (sheet coordinates, SC sheet cells per plan cell, radius at least tipR):
 * a compact piece (a pupil, a nostril) is one round touch at its deepest point, as wide as the piece; a longer piece (a
 * lid line, a mouth line) is one stroke along its own centreline, the geodesic between its two ends, as wide as the
 * piece at each point. A painter's accent follows the shape it states; a straight bar across a curve does not.
 */
export function accentStroke(d, w, { SC, tipR }) {
  const inside = new Set(d.cells), nb = i => { const x = i % w; return [i - w, i + w, ...(x > 0 ? [i - 1, i - w - 1, i + w - 1] : []), ...(x < w - 1 ? [i + 1, i - w + 1, i + w + 1] : [])]; };
  // depth: steps to the nearest cell outside the piece (1 on its edge)
  const depth = new Map(), q = [];
  for (const i of d.cells) if (nb(i).some(j => !inside.has(j))) { depth.set(i, 1); q.push(i); }
  for (let h = 0; h < q.length; h++) for (const j of nb(q[h])) if (inside.has(j) && !depth.has(j)) { depth.set(j, depth.get(q[h]) + 1); q.push(j); }
  const far = from => { const par = new Map([[from, -1]]), o = [from]; for (let h = 0; h < o.length; h++) for (const j of nb(o[h])) if (inside.has(j) && !par.has(j)) { par.set(j, o[h]); o.push(j); } return { end: o.at(-1), par }; };
  const a = far(d.cells[0]).end, { end: b, par } = far(a), path = [];
  for (let i = b; i !== -1; i = par.get(i)) path.push(i);
  const dmax = Math.max(...depth.values()), r = c => Math.max(tipR, (c - 0.5) * SC), at = i => ({ x: (i % w + 0.5) * SC, y: (((i / w) | 0) + 0.5) * SC });
  if (path.length <= 2 * dmax) {
    const deep = d.cells.filter(i => depth.get(i) === dmax);
    const x = deep.reduce((s, i) => s + (i % w), 0) / deep.length, y = deep.reduce((s, i) => s + ((i / w) | 0), 0) / deep.length;
    const p = { x: (x + 0.5) * SC, y: (y + 0.5) * SC, r: r(dmax), p: 1 };
    return [p, { ...p, x: p.x + 0.01 }];
  }
  const every = Math.max(1, Math.round(tipR / SC));
  return path.filter((_, k) => k % every === 0 || k === path.length - 1).map(i => ({ ...at(i), r: r(depth.get(i)), p: 1 }));
}

/** Optical density each accent still lacks over what the plan books there, per channel: subject minus ledger, never below 0. */
export function accentLack(subjectD, ledgerD, cells) {
  const s = [0, 0, 0], l = [0, 0, 0];
  for (const i of cells) for (let c = 0; c < 3; c++) { s[c] += subjectD[3 * i + c]; l[c] += ledgerD[3 * i + c]; }
  return s.map((v, c) => Math.max(0, (v - l[c]) / cells.length));
}

/**
 * The accent passages of a value plan, at planning. px: the subject (RGB per plan cell, read before the guard seals
 * it), plan: the value plan ({ layers, protectedCells }), pigments: the painter's pans ({ K }), paperRGB.
 * The strength of each mark is the density the subject has there less what the plan already books there (the ledger
 * through the sheet's optics on flat paper): planned, so strict mode lays it with no look. Catchlights join the plan's
 * reserved lights and leave every passage that covered them. Returns { passages: [{ mask, area, amount, mix, accent }],
 * lightCount, darks, step, band }.
 */
export function planAccentPasses({ px, plan, pigments, paperRGB, w, h, mmPerCell, tipMm, maxCells, bands, pen = null }) {
  const n = w * h, k = pigments.length;
  const lum = Float32Array.from({ length: n }, (_, i) => (0.2126 * px[3 * i] + 0.7152 * px[3 * i + 1] + 0.0722 * px[3 * i + 2]) / 255);
  const A = planAccents(lum, w, h, { mmPerCell, tipMm, maxCells, bands, pen, protect: plan.protectedCells });
  for (let i = 0; i < n; i++) if (A.lights[i]) plan.protectedCells[i] = 1;
  if (A.lightCount) for (const layer of plan.layers) for (const sh of layer.shapes) {
    let cut = 0; for (let i = 0; i < n; i++) if (sh.mask[i] && A.lights[i]) { sh.mask[i] = 0; cut++; }
    if (cut) sh.area = Math.max(0, (sh.area ?? 0) - cut);
  }
  const ledger = planLedger(plan, n, k), flat = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) flat[3 * i + c] = paperRGB[c];
  const booked = renderLayers([pigments.map((_, j) => Float32Array.from({ length: n }, (_, i) => ledger[i * k + j]))], pigments, flat, n, 1);
  const Ds = channelDensity(px, n, paperRGB), Dl = channelDensity(booked, n, paperRGB), Ks = pigments.map(p => p.K.map(v => v / 0.55));
  const passages = [];
  for (const d of A.darks) {
    const lack = accentLack(Ds, Dl, d.cells);
    const a = unmix(Float32Array.from(lack), 1, Ks), mix = pigments.map((_, j) => (a[j] > 0.004 ? a[j] : 0));
    const amount = mix.reduce((s, v) => s + v, 0); if (!(amount > 0)) continue;
    const mask = new Uint8Array(n); for (const i of d.cells) mask[i] = 1;
    passages.push({ mask, area: d.cells.length, amount, mix, accent: d });
  }
  return { passages, lightCount: A.lightCount, darks: A.found, step: A.step, band: A.band };
}
