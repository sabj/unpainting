// Read-only trace of the sheet's water at the moment each stroke lands, and what the dries and pass waits do to it.
// Set WET_TRACE=<file.jsonl> to write it. It reads the sheet (bringing water planes down from the GPU, as the painter's
// own paper checks do) and never writes the sheet, the brush or the plan.
//
// Thresholds are the physics' own depths (src/media/sheet.mjs DEFAULTS), not fitted to any result:
// - film (filmDepth, 0.03 water per cell): paint mixes across a face at a rate min(1, min(W_i, W_j) / filmDepth), so
//   two lanes fuse at full rate only where both hold at least this film;
// - wet (wetEps, 0.004 water per cell): below it a cell has no wet face and passes no water to its neighbours.
import fs from 'node:fs';
import { DEFAULTS, SHEET_CLOCK } from '../../src/media/sheet.mjs';
import { strokeCells } from '../../src/paint/methods/wetdry.mjs';

/** Water statistics over a list of cells: count, mean water, share at or above the film depth, share above wetEps,
 *  mean pore saturation. */
function waterStats(sheet, cells, { film = DEFAULTS.filmDepth, wet = DEFAULTS.wetEps } = {}) {
  const W = sheet.W, s = sheet.s, cap = sheet.paper.capacity;
  let sw = 0, nf = 0, nw = 0, ss = 0;
  for (const i of cells) { const v = W[i]; sw += v; if (v >= film) nf++; if (v > wet) nw++; ss += s[i] / Math.max(1e-8, cap[i]); }
  const c = cells.length || 1;
  return { n: cells.length, meanW: +(sw / c).toFixed(5), film: +(nf / c).toFixed(4), wet: +(nw / c).toFixed(4), sat: +(ss / c).toFixed(4) };
}

/** Bounding rectangle [x, y, w, h] of cells on a sheet of width w. */
function rectOf(cells, w) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const i of cells) { const y = (i / w) | 0, x = i - y * w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

export function createWetTrace({ file, sheet, contact = null, film = DEFAULTS.filmDepth, wet = DEFAULTS.wetEps }) {
  const { w, h, n } = sheet;
  const clock = { t: 0, dries: 0 };
  // the clock is not enumerable, so nothing that walks the sheet's fields (saved states, tapes) sees it
  Object.defineProperty(sheet, SHEET_CLOCK, { value: clock, enumerable: false, configurable: true });
  const owner = new Int32Array(n).fill(-1), landW = new Float32Array(n), mark = new Uint32Array(n);
  const strokes = [];
  let epoch = 0, passage = null, lane = 0, buf = [];
  const dips = new WeakMap();
  const fd = fs.openSync(file, 'w');
  const emit = rec => { buf.push(JSON.stringify(rec)); if (buf.length >= 256) flush(); };
  const flush = () => { if (buf.length) { fs.writeSync(fd, buf.join('\n') + '\n'); buf = []; } };
  // fresh water planes over a rectangle (the painter's own paper reads do the same); a CPU sheet is always fresh
  const fresh = rect => { if (rect && sheet._gpu && !sheet._gpu.paused) sheet._gpu.ensurePaperFresh(sheet, rect, true); };
  const all = { length: n, *[Symbol.iterator]() { for (let i = 0; i < n; i++) yield i; } };
  const ring = cells => {
    const e = ++epoch, out = [];
    for (const i of cells) mark[i] = e;
    for (const i of cells) {
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && mark[j] !== e) { mark[j] = e; out.push(j); }
    }
    return out;
  };
  // cells within three cells of this passage's own paint (the contact gate looks three cells round a stroke)
  const nearOwn = new Uint8Array(n), tmp = new Uint8Array(n);
  const markNearOwn = () => {
    nearOwn.fill(0); if (!passage) return;
    for (let i = 0; i < n; i++) { const o = owner[i]; if (o >= 0 && strokes[o].passage === passage.id) nearOwn[i] = 1; }
    for (let pass = 0; pass < 3; pass++) {
      tmp.set(nearOwn);
      for (let i = 0; i < n; i++) if (!tmp[i]) { const x = i % w; if ((x > 0 && tmp[i - 1]) || (x < w - 1 && tmp[i + 1]) || (i >= w && tmp[i - w]) || (i + w < n && tmp[i + w])) nearOwn[i] = 1; }
    }
  };
  const damp = sheet.paper.capacity;
  const sheetWater = () => {
    fresh([0, 0, w, h]);
    const st = waterStats(sheet, all, { film, wet });
    markNearOwn();
    // wet cells (W > wetEps) and damp ones (no wet face, pores over 0.02 full: the painter's own dry test fails on
    // them) by whose paint they are: this passage's own, beside it (within 3 cells), another passage's, or elsewhere
    const by = { own: [0, 0], beside: [0, 0], other: [0, 0], elsewhere: [0, 0] };
    let wetCells = 0, filmCells = 0, own = 0, ownFilm = 0;
    for (let i = 0; i < n; i++) {
      const v = sheet.W[i], o = owner[i], mine = passage && o >= 0 && strokes[o].passage === passage.id;
      if (v >= film) filmCells++;
      if (mine) { own++; if (v >= film) ownFilm++; }
      const isWet = v > wet, isDamp = !isWet && sheet.s[i] > 0.02 * damp[i];
      if (!isWet && !isDamp) continue;
      if (isWet) wetCells++;
      const k = mine ? 'own' : nearOwn[i] ? 'beside' : o >= 0 ? 'other' : 'elsewhere';
      by[k][isWet ? 0 : 1]++;
    }
    return { ...st, wetCells, filmCells, passageCells: own, passageFilm: own ? +(ownFilm / own).toFixed(4) : null, wetDamp: by };
  };
  return {
    clock, film, wet,
    /** The passage now being laid ({pass, shape, technique, move, value}); null between passes. */
    passage(info) { passage = info ? { ...info, id: `${info.pass}/${info.shape}` } : null; lane = 0; },
    /** The next lane (one planned path) of the passage begins. */
    lane() { lane++; },
    /** A brush was dipped, with pigment or with clean water only. */
    dipped(b, paint) { dips.set(b, paint); },
    /** A physical stroke on the sheet. Its footprint is the painter's own read-only contact prediction (the primary
     *  cells the hairs can touch, inside the clip, off resist), the same cells its paper checks use. Where that
     *  prediction is not available (the wash-splat route) it is measured: the cells whose water (surface and pores)
     *  rose by more than wetEps while the stroke was laid. What the stroke met there, and at the seam with the last lane
     *  beside it, is read from the sheet as it stood just before. */
    stroke(b, target, points, options, fn) {
      let predicted = null;
      if (contact) try {
        const c = contact(b, sheet, points, { ...options, neighborRadius: 0, includeTouched: false });
        predicted = c.cells.filter(i => c.primaryMask[i] && (!sheet.clip || sheet.clip[i]) && !sheet.resist?.[i]);
      } catch { predicted = null; }
      const env = predicted?.length ? predicted : strokeCells(sheet, points, b.radius), rect = rectOf([...env, ...ring(env)], w);
      if (!rect) return fn(b, target, points, options);
      fresh(rect);
      const [rx, ry, rw, rh] = rect, before = new Float32Array(rw * rh), bW = new Float32Array(rw * rh), bS = new Float32Array(rw * rh);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const i = (ry + y) * w + rx + x, k = y * rw + x; bW[k] = sheet.W[i]; bS[k] = sheet.s[i]; before[k] = bW[k] + bS[k]; }
      const t0 = clock.t, d0 = clock.dries;
      const result = fn(b, target, points, options);
      fresh(rect);
      let cells = predicted;
      if (!cells?.length) { cells = []; for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const i = (ry + y) * w + rx + x; if (sheet.W[i] + sheet.s[i] > before[y * rw + x] + wet) cells.push(i); } }
      const at = i => { const y = ((i / w) | 0) - ry, x = (i % w) - rx; return y * rw + x; };
      // the sheet as it stood just before the stroke, over these cells
      const statsBefore = list => { let sw = 0, nf = 0, nw = 0, ss = 0; for (const i of list) { const k = at(i), v = bW[k]; sw += v; if (v >= film) nf++; if (v > wet) nw++; ss += bS[k] / Math.max(1e-8, sheet.paper.capacity[i]); } const c = list.length || 1; return { n: list.length, meanW: +(sw / c).toFixed(5), film: +(nf / c).toFixed(4), wet: +(nw / c).toFixed(4), sat: +(ss / c).toFixed(4) }; };
      const around = ring(cells), near = [...cells, ...around].filter(i => { const y = ((i / w) | 0) - ry, x = (i % w) - rx; return x >= 0 && y >= 0 && x < rw && y < rh; });
      const id = strokes.length, here = passage?.id ?? null, kind = !dips.has(b) ? null : dips.get(b) ? 'paint' : 'clean';
      const rec = { k: 's', id, t: +t0.toFixed(2), dries: d0, passage: here, technique: passage?.technique ?? null, move: passage?.move ?? null, texture: passage?.texture ?? null, kind, lane, footprint: predicted?.length ? 'contact' : 'measured', strokeT: +(clock.t - t0).toFixed(2), env: env.length, fp: statsBefore(cells) };
      // the most recent paint stroke of this passage from another lane (its lapped neighbour), and from this lane (the
      // reload that continues it), among the footprint and the cells one face from it
      let nb = -1, prev = -1;
      if (here) for (const i of near) {
        const o = owner[i]; if (o < 0 || strokes[o].passage !== here) continue;
        if (strokes[o].lane !== lane) { if (o > nb) nb = o; } else if (o > prev) prev = o;
      }
      const seam = o => {
        if (o < 0) return null;
        const list = []; let land = 0;
        for (const i of near) if (owner[i] === o) { list.push(i); land += landW[i]; }
        const r = strokes[o];
        return { id: o, dt: +(t0 - r.t).toFixed(2), driedSince: d0 > r.dries, landW: +(land / (list.length || 1)).toFixed(5), ...statsBefore(list) };
      };
      rec.nb = seam(nb); rec.prev = seam(prev);
      const after = waterStats(sheet, cells, { film, wet });
      rec.after = { meanW: after.meanW, film: after.film, wet: after.wet };
      strokes.push({ passage: here, lane, t: clock.t, dries: clock.dries });
      if (kind === 'paint' && here) for (const i of cells) { owner[i] = id; landW[i] = sheet.W[i]; }
      emit(rec);
      return result;
    },
    /** A dry of the sheet: the water on it before and after. */
    dry(args, fn) {
      const before = sheetWater();
      // where the dry was asked for: the callers' frames in the painter, past the dry wrappers themselves
      const at = (new Error().stack ?? '').split('\n').slice(2).map(l => l.match(/(plate|painter)\/([\w-]+\.mjs):(\d+)/)).filter(Boolean).map(m => `${m[2]}:${m[3]}`).filter(f => !f.startsWith('wet-trace')).slice(0, 4);
      const result = fn(...args);
      clock.dries++;
      const after = sheetWater();
      emit({ k: 'd', t: +clock.t.toFixed(2), dries: clock.dries, passage: passage?.id ?? null, technique: passage?.technique ?? null, texture: passage?.texture ?? null, site: at, max: args[1], steps: result, before, after });
      return result;
    },
    /** A pass boundary ('end' before its wait or dry, 'next' after it). */
    boundary(when, info) { emit({ k: 'b', when, t: +clock.t.toFixed(2), dries: clock.dries, ...info, sheet: sheetWater() }); },
    close() { flush(); fs.closeSync(fd); },
  };
}
