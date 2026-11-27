import { census } from '../../media/census.mjs';
import { certifyZeroPaper, certifyDryFixed, hasZeroPaperCertificate, invalidatePaperCertificate } from '../../media/paper-certificate.mjs';
// Pipeline: inking, stage 6 (pen on the fine sheet).
// --inkres N: the pens draw on their own sheet at N times the painting's resolution, so thin lines keep their taper.
// A pencil drawing is drawn there too (graphiteAt: the pencil's own channel beside the ink, or the only channel when the
// sheet has no ink), so a pencil line is as continuous as an ink line of the same weight.
// New ink and graphite are averaged down onto the painting's sheet as pigment, so later glazes lie over them and the
// eraser lifts them there; erased() takes the same lift back on the fine sheet. The fine sheet has no water flow.
// Output: paint upsampled, each pixel scaled by fine over coarse drawing reflectance per channel. DOM free.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, fix, coherent, layersChanged } from '../../media/sheet.mjs';
import { drawGestures } from '../../media/draw.mjs';
import { renderLayers } from '../../media/km.mjs';
import { TAPE } from '../../media/brush.mjs';

const isGraphitePigment = p => /graphite|pencil/i.test(p?.kind ?? p?.name ?? '');

export function makeInkRes({ N, W2, H2, paperOpts, pigments, main, inkAt = 0, graphiteAt = null, gain = 1, pad: opt_pad = null, paper: cachedPaper = null }) {
  if (!Number.isFinite(N)) return null;
  N = Math.round(N);
  if (!(N > 1)) return null;
  const WH = W2 * N, HH = H2 * N, nH = WH * HH, nL = W2 * H2;
  const paper = cachedPaper ?? makePaper(WH, HH, { ...paperOpts, scale: (paperOpts.scale ?? 1) * N });
  if (!Number.isInteger(inkAt) || !pigments[inkAt]) throw new Error('Invalid fine-sheet ink channel');
  if (graphiteAt != null && (!Number.isInteger(graphiteAt) || !isGraphitePigment(pigments[graphiteAt]))) throw new Error(`fine sheet: channel ${graphiteAt} is not the pencil's graphite`);
  // the painting's channels the fine sheet carries: the pen's (or the pencil's, when it is the only drawing channel), then
  // the pencil's beside the ink
  const chans = graphiteAt == null || graphiteAt === inkAt ? [inkAt] : [inkAt, graphiteAt], K = chans.length;
  const finePigments = chans.map(c => pigments[c]);
  const fine = createSheet(paper, finePigments);
  /** The fine sheet's channel for the painting's channel `c`; a channel the fine sheet does not carry is refused. */
  const channel = c => { const k = chans.indexOf(c); if (k < 0) throw new Error(`fine sheet: the painting's channel ${c} is not drawn on it (it carries ${chans.join(', ')})`); return k; };
  function remapInk(ink) {
    if (ink == null) return null;
    if (ink.length !== pigments.length) throw new Error('Fine-sheet ink concentration length');
    for (let k = 0; k < ink.length; k++) if (k !== inkAt && ink[k] !== 0) throw new Error('Only inkAt may deposit on the fine sheet');
    return chans.map(c => ink[c]);
  }
  let materialVersion = 0, renderVersion = -1, inkH, inkL;
  const totalVersion = new Array(K).fill(-1), total = new Array(K).fill(null);
  const changed = () => { materialVersion++; };
  // strokes go on the mark tape tagged with N, so a replay of the tape treats them the same way
  if (main._tape) { fine._tape = main._tape; fine._tapeRes = N; fine._tapePigmentMap = { count: pigments.length, indices: chans }; }
  // what has been carried down to the painting's sheet, per pigment, so the next call carries only what is new
  const seen = finePigments.map(() => new Float32Array(nH)), inkLo = finePigments.map(() => new Float32Array(nL));
  const white = Buffer.alloc(nL * 3, 255), whiteH = Buffer.alloc(nH * 3, 255);
  const totalBuf = finePigments.map(() => new Float32Array(nH)), carryAdd = new Float32Array(nL);
  const layerSum = finePigments.map(() => new Float32Array(nH));
  const layerCount = new Int32Array(K);
  const activeLo = finePigments.map(() => new Int32Array(HH).fill(WH)), activeHi = finePigments.map(() => new Int32Array(HH).fill(-1));
  // Include previously carried cells too: removing a mark must carry its
  // negative delta even when its current total is now zero.
  const carriedLo = finePigments.map(() => new Int32Array(HH).fill(WH)), carriedHi = finePigments.map(() => new Int32Array(HH).fill(-1));
  const layerLo = finePigments.map(() => new Int32Array(HH).fill(WH)), layerHi = finePigments.map(() => new Int32Array(HH).fill(-1));
  let layerVerSeen = -1;
  const fineTotal = k => {
    if (totalVersion[k] === materialVersion) return total[k];
    const out = totalBuf[k], G = fine.G[k], D = fine.D[k], P = fine.P[k], layers = fine.layers;
    const lv = fine._layerVer || 0;
    if (lv !== layerVerSeen) { layerSum.forEach(a => a.fill(0)); layerLo.forEach(a => a.fill(WH)); layerHi.forEach(a => a.fill(-1)); layerCount.fill(0); layerVerSeen = lv; }
    if (layers.length < layerCount[k]) { layerSum[k].fill(0); layerLo[k].fill(WH); layerHi[k].fill(-1); layerCount[k] = 0; }
    const lsum = layerSum[k], lLo = layerLo[k], lHi = layerHi[k];
    for (let m = layerCount[k]; m < layers.length; m++) {
      const a = layers[m][k];
      if (a === fine._zeroLayer) continue;
      for (let y = 0; y < HH; y++) {
        const row = y * WH;
        let x = 0;
        // Empty groups need neither a rounded addition nor per-cell bounds work.
        for (; x + 3 < WH; x += 4) {
          const i = row + x;
          if (!(a[i] || a[i+1] || a[i+2] || a[i+3])) continue;
          for (let q = 0; q < 4; q++) if (a[i+q]) { lsum[i+q] += a[i+q]; if (x+q < lLo[y]) lLo[y] = x+q; if (x+q > lHi[y]) lHi[y] = x+q; }
        }
        for (; x < WH; x++) if (a[row+x]) { lsum[row+x] += a[row+x]; if (x < lLo[y]) lLo[y] = x; if (x > lHi[y]) lHi[y] = x; }
      }
    }
    layerCount[k] = layers.length;
    const lo = activeLo[k], hi = activeHi[k];
    const gb = new Uint32Array(G.buffer,G.byteOffset,nH), db = new Uint32Array(D.buffer,D.byteOffset,nH), pb = new Uint32Array(P.buffer,P.byteOffset,nH);
    out.fill(0);
    for (let y = 0; y < HH; y++) {
      const row = y * WH, end = row + WH;
      let a = row, b = end - 1;
      // Inspect raw words so signed zeros and non-finite inputs retain the same
      // arithmetic. The layer sum's support is cached independently of wet ink.
      while (a+3 < end && !(gb[a]|db[a]|pb[a]|gb[a+1]|db[a+1]|pb[a+1]|gb[a+2]|db[a+2]|pb[a+2]|gb[a+3]|db[a+3]|pb[a+3])) a += 4;
      while (a < end && !(gb[a]|db[a]|pb[a])) a++;
      while (b-3 >= a && !(gb[b]|db[b]|pb[b]|gb[b-1]|db[b-1]|pb[b-1]|gb[b-2]|db[b-2]|pb[b-2]|gb[b-3]|db[b-3]|pb[b-3])) b -= 4;
      while (b >= a && !(gb[b]|db[b]|pb[b])) b--;
      const x0 = Math.min(a-row,lLo[y]), x1 = Math.max(b-row,lHi[y]);
      let first = WH, last = -1;
      for (let x = x0; x <= x1; x++) {
        const i = row+x;
        out[i] = layers.length ? lsum[i] + (G[i] + D[i] + P[i]) : G[i] + D[i] + P[i];
        if (out[i] !== 0) { if (x < first) first = x; last = x; }
      }
      lo[y] = first; hi[y] = last;
    }
    totalVersion[k] = materialVersion;
    return total[k] = out;
  };
  let stats = { calls: 0, ms: 0 };

  /** drawGestures on the fine sheet: points in the painting's cells, want on the painting's grid. */
  function draw(gestures, want, w, h, { ink, peak = null, pen = {}, low = 0.25 } = {}) {
    ink = remapInk(ink);
    const t0 = Date.now();
    const at = (x, y) => want[Math.max(0, Math.min(h - 1, Math.round(y))) * w + Math.max(0, Math.min(w - 1, Math.round(x)))];
    if (peak == null) {
      const v = []; for (const g of gestures) for (const p of g.points) v.push(at(p.x, p.y));
      v.sort((a, b) => a - b); peak = v.length ? Math.max(1e-4, v[Math.floor(v.length * 0.95)]) : 1;
    }
    // every size N times, every volume N squared; the speed N times, so a stroke takes the time it took
    const P = { ...pen, nib: (pen.nib ?? 0.8) * N, flex: (pen.flex ?? 1.5) * N, travel: (pen.travel ?? 1.5) * N, reach: (pen.reach ?? 12) * N,
      reservoir: (pen.reservoir ?? 250) * N * N, feed: (pen.feed ?? 1.2) * N * N, drop: (pen.drop ?? 2) * N * N,
      // At N = 1 a cell floors a line's width; the fine sheet's floor is N times smaller, so lines come out thinner.
      // --inkrespad: widen the contact by this x (N - 1) fine cells; 0.25 matches the ink darkness at N = 1.
      pad: opt_pad ?? 0.25 * (N - 1) };
    const up = gestures.map(g => ({ ...g, points: g.points.map(p => {
      const s = p.s != null ? Math.min(1, p.s) : Math.min(1, at(p.x, p.y) / peak);
      // drawGestures adds half a cell to put a point in its cell's middle; the fine sheet's middle is N times further
      const q = { x: (p.x + 0.5) * N - 0.5, y: (p.y + 0.5) * N - 0.5, s, v: (p.v ?? 1.9 - 1.1 * s) * N };
      if (p.nw != null) q.nw = p.nw * N;
      if (p.dwell) q.dwell = p.dwell;
      return q;
    }) }));
    wet();
    const scaledInk = Array.isArray(ink) ? ink.map(v => v * gain) : ink;
    const r = drawGestures(fine, up, [0], 1, 1, { ink: scaledInk, peak: 1, pen: P, low });
    changed();
    carry();
    stats.calls++; stats.ms += Date.now() - t0;
    return r;
  }

  // Copy the painting's water to the fine sheet before a pen call, so a line in a damp wash wicks further and paler
  // (pen.mjs dampOf). Pores hold the same share of their capacity. Cleared again on settle.
  function wet() {
    if (TAPE && fine._tape) TAPE.push({ k: 'W', r: N });
    if (hasZeroPaperCertificate(main)) {
      if (wetOn) { fine.W.fill(0); fine.s.fill(0); fine.M.fill(0); fine.ever.fill(0); wetOn = false; }
      certifyZeroPaper(fine);
      return;
    }
    coherent(main); // the painting's sheet may live on the GPU; read its water from there
    const cf = paper.capacity, cm = main.paper.capacity;
    let any = false;
    for (let i = 0; i < nL; i++) if (main.M[i] || main.s[i] > 0) { any = true; break; }
    if (!any) { if (wetOn) { fine.W.fill(0); fine.s.fill(0); fine.M.fill(0); fine.ever.fill(0); wetOn = false; } certifyZeroPaper(fine); return; }
    invalidatePaperCertificate(fine);
    const mM = main.M, mEver = main.ever, mW = main.W, ms = main.s;
    const fM = fine.M, fEver = fine.ever, fW = fine.W, fs = fine.s;
    let j = 0;
    for (let yl = 0; yl < H2; yl++) {
      const rowL = yl * W2;
      for (let dy = 0; dy < N; dy++) {
        for (let xl = 0; xl < W2; xl++) {
          const i = rowL + xl;
          const mMi = mM[i], mEveri = mEver[i], mWi = mW[i], cmi = cm[i], msi = ms[i];
          if (cmi > 0 && msi !== 0) {
            for (let dx = 0; dx < N; dx++, j++) {
              fM[j] = mMi; fEver[j] = mEveri; fW[j] = mWi;
              fs[j] = msi * cf[j] / cmi;
            }
          } else {
            for (let dx = 0; dx < N; dx++, j++) {
              fM[j] = mMi; fEver[j] = mEveri; fW[j] = mWi;
              fs[j] = 0;
            }
          }
        }
      }
    }
    wetOn = true;
  }
  let wetOn = false;

  // the new fine ink, averaged over each coarse cell, deposited on the painting's sheet: settled where the painting's
  // sheet is dry, suspended in the water where a wash stands wet, so it moves with that wash as the pen's ink did
  function carry() {
    if (!census) return carryImpl();
    const t = performance.now(); census.inkres.carryCalls++;
    try { return carryImpl(); } finally { census.inkres.carryMs += performance.now() - t; }
  }
  function carryImpl() {
    let wrote = false, wholeWrite = false;
    for (let k = 0; k < K; k++) {
      const T = fineTotal(k), S = seen[k], add = carryAdd;
      let any = false, yLo = H2, yHi = -1;
      const aLo = activeLo[k], aHi = activeHi[k], cLo = carriedLo[k], cHi = carriedHi[k];
      for (let yl = 0; yl < H2; yl++) {
        const rowL = yl * W2;
        for (let dy = 0; dy < N; dy++) {
          const y = yl * N + dy, lo = Math.min(aLo[y], cLo[y]), hi = Math.max(aHi[y], cHi[y]);
          cLo[y] = lo; cHi[y] = hi;
          const xl0 = Math.floor(lo / N), xl1 = Math.floor(hi / N);
          let i = y * WH + xl0 * N;
          for (let xl = xl0; xl <= xl1; xl++) {
            const idxL = rowL + xl;
            for (let dx = 0; dx < N; dx++, i++) {
              const ti = T[i], si = S[i];
              if (ti !== si) {
                const d = ti - si;
                // Add 1e-6 epsilon guard against float jitter / rounding accumulation
                if (d >= 1e-6 || d <= -1e-6) { add[idxL] += d; any = true; S[i] = ti; if (yl < yLo) yLo = yl; if (yl > yHi) yHi = yl; }
              }
            }
          }
        }
      }
      if (!any) continue;
      wrote = true;
      const inv = 1 / (N * N), D = main.D[chans[k]], G = main.G[chans[k]], L = inkLo[k], M = main.M;
      // The fine sheet already identifies the changes. Read only their actual
      // recipient and pigment before adding, never a whole-sheet round trip.
      const cells=[];for(let i=yLo*W2,end=(yHi+1)*W2;i<end;i++)if(add[i])cells.push(i);
      const apply=()=>{for (const i of cells) {
        const ai = add[i];
        if (ai) {
          add[i] = 0;
          const a = ai * inv;
          let applied;
          if (M[i]) {
            const prev = G[i];
            const next = Math.max(0, prev + a);
            G[i] = next;
            applied = next - prev;
          } else {
            const prev = D[i];
            const next = Math.max(0, prev + a);
            D[i] = next;
            applied = next - prev;
          }
          L[i] += applied;
        }
      }};
      if(main._gpu?.editPigmentCells&&!main._gpu.paused)main._gpu.editPigmentCells(main,chans[k],Uint32Array.from(cells),apply);
      else {coherent(main);apply();wholeWrite=true;}
    }
    if (wrote) {
      renderVersion = -1; // Reset renderVersion so downstream composition detects carried ink
      invalidatePaperCertificate(main); // new pigment has not been fixed by the earlier dry
      if(wholeWrite)main._gpu?.cpuWroteAll?.();
    }
  }

  /** The fine sheet dried: its water gone and its pigment fixed, as the painting's sheet is at the end of a pass. */
  function settle() {
    for (let k = 0; k < K; k++) {
      const G = fine.G[k], D = fine.D[k];
      let i = 0;
      // Scan the reservoir itself: settle also accepts direct fine-sheet edits
      // that have not yet invalidated a total or optical cache.
      for (; i+3 < nH; i += 4) {
        if (!(G[i] || G[i+1] || G[i+2] || G[i+3])) continue;
        for (let q = i; q < i+4; q++) if (G[q]) { D[q] += G[q]; G[q] = 0; }
      }
      for (; i < nH; i++) if (G[i]) { D[i] += G[i]; G[i] = 0; }
    }
    fine.W.fill(0); fine.s.fill(0); fine.M.fill(0); fine.ever.fill(0); wetOn = false;
    fix(fine);
    certifyDryFixed(fine);
    changed();
  }

  /** The painting at N times its width: `lo` is the painting's own render (RGB bytes, W2 by H2). */
  function compose(lo) { return Buffer.from(composeKept(lo)); }
  /** The same picture in this sheet's own buffer, not a copy: to be read at once and never written, since the next
   *  composition changes it in place (the film's recorder copies it into its own slot before it returns). */
  function composeKept(lo) {
    if (!census) return composeImpl(lo);
    const t = performance.now(); census.inkres.composeCalls++;
    try { return composeImpl(lo); } finally { census.inkres.composeMs += performance.now() - t; }
  }
  let x0Tab = null, x1Tab = null, txTab = null, y0Tab = null, y1Tab = null, tyTab = null, invInkL = null, hBuf0 = null, hBuf1 = null;
  function ensureComposeTables() {
    if (x0Tab) return;
    x0Tab = new Int32Array(WH); x1Tab = new Int32Array(WH); txTab = new Float32Array(WH);
    for (let x = 0; x < WH; x++) {
      const fx = Math.min(W2 - 1, Math.max(0, (x + 0.5) / N - 0.5)), x0 = Math.floor(fx);
      x0Tab[x] = x0 * 3; x1Tab[x] = Math.min(W2 - 1, x0 + 1) * 3; txTab[x] = fx - x0;
    }
    y0Tab = new Int32Array(HH); y1Tab = new Int32Array(HH); tyTab = new Float32Array(HH);
    for (let y = 0; y < HH; y++) {
      const fy = Math.min(H2 - 1, Math.max(0, (y + 0.5) / N - 0.5)), y0 = Math.floor(fy);
      y0Tab[y] = y0 * W2 * 3; y1Tab[y] = Math.min(H2 - 1, y0 + 1) * W2 * 3; tyTab[y] = fy - y0;
    }
    hBuf0 = new Float64Array(WH * 3);
    hBuf1 = new Float64Array(WH * 3);
  }
  function interpRow(src, yOff, dst, xa = 0, xb = WH - 1) {
    for (let x = xa, o = xa * 3; x <= xb; x++, o += 3) {
      const a = yOff + x0Tab[x], b = yOff + x1Tab[x], tx = txTab[x], tx0 = 1 - tx;
      dst[o] = src[a] * tx0 + src[b] * tx;
      dst[o + 1] = src[a + 1] * tx0 + src[b + 1] * tx;
      dst[o + 2] = src[a + 2] * tx0 + src[b + 2] * tx;
    }
  }
  // The fine pen's transmittance over the coarse ink's, per fine pixel: what the paint's own render of the ink is
  // multiplied by to show the pen at its own grid.
  function ensureInkRatio() {
    ensureComposeTables();
    const rowLen = WH * 3;
    if (renderVersion !== materialVersion) {
      inkH = renderLayers([finePigments.map((_, k) => fineTotal(k))], finePigments, whiteH, nH, 1);
      inkL = renderLayers([inkLo], finePigments, white, nL, 1);
      invInkL ??= new Float32Array(nH * 3);
      let r0 = hBuf0, r1 = hBuf1, cy0 = -1, cy1 = -1;
      for (let y = 0; y < HH; y++) {
        const ya = y0Tab[y], yc = y1Tab[y], ty = tyTab[y], ty0 = 1 - ty, row = y * rowLen;
        if (ya !== cy0) {
          if (ya === cy1) { const t = r0; r0 = r1; r1 = t; cy1 = cy0; cy0 = ya; }
          else { interpRow(inkL, ya, r0); cy0 = ya; }
        }
        let rb = r0;
        if (yc !== ya) {
          if (yc !== cy1) { interpRow(inkL, yc, r1); cy1 = yc; }
          rb = r1;
        }
        for (let i = 0; i < rowLen; i++) {
          const bInk = r0[i] * ty0 + rb[i] * ty;
          invInkL[row + i] = inkH[row + i] / Math.max(1, bInk);
        }
      }
      renderVersion = materialVersion;
    }
  }
  // The last composition and the render it came from: a frame recomposes only the fine rows and columns whose render
  // pixels changed since (a frame after one mark changes a box of them), with the same arithmetic, so the same bytes.
  // The composition is kept in one buffer and changed in place; the render kept beside it is brought up to date over
  // the changed rows only. (It was copied whole three times a frame: 19 MB each at full size.)
  let lastLo = null, lastOut = null, lastVersion = -1;
  function composeImpl(lo) {
    ensureInkRatio();
    const rowLen = WH * 3, loRow = W2 * 3, src = Buffer.from(lo.buffer, lo.byteOffset, lo.byteLength);
    let from = 0, to = H2 - 1, xa = 0, xb = WH - 1;
    const kept = !!lastOut && lastVersion === renderVersion && lastLo.length === src.length;
    if (kept) {
      const same = y => src.compare(lastLo, y * loRow, (y + 1) * loRow, y * loRow, (y + 1) * loRow) === 0;
      while (from < H2 && same(from)) from++;
      if (from === H2) return lastOut;
      while (to > from && same(to)) to--;
      // the first and last render pixel that changed in any of those rows, and the fine columns that read them: a fine
      // column reads its two render pixels (x0Tab, x1Tab, which only grow with x)
      let c0 = loRow, c1 = -1;
      for (let y = from; y <= to; y++) {
        if (y !== from && y !== to && same(y)) continue;
        const o = y * loRow;
        let a = 0; while (a < c0 && src[o + a] === lastLo[o + a]) a++; if (a < c0) c0 = a;
        let b = loRow - 1; while (b > c1 && src[o + b] === lastLo[o + b]) b--; if (b > c1) c1 = b;
      }
      const p0 = ((c0 / 3) | 0) * 3, p1 = ((c1 / 3) | 0) * 3;
      while (xa < WH - 1 && x1Tab[xa] < p0) xa++;
      while (xb > xa && x0Tab[xb] > p1) xb--;
    } else {
      if (!lastOut || lastOut.length !== nH * 3) lastOut = Buffer.allocUnsafe(nH * 3);
      if (!lastLo || lastLo.length !== src.length) lastLo = Buffer.allocUnsafe(src.length);
    }
    const out = lastOut, i0 = xa * 3, i1 = (xb + 1) * 3;
    let r0 = hBuf0, r1 = hBuf1, cy0 = -1, cy1 = -1;
    for (let y = 0; y < HH; y++) {
      const ya = y0Tab[y], yc = y1Tab[y], ty = tyTab[y], ty0 = 1 - ty, row = y * rowLen;
      if ((ya / loRow < from && yc / loRow < from) || (ya / loRow > to && yc / loRow > to)) continue;
      if (ya !== cy0) {
        if (ya === cy1) { const t = r0; r0 = r1; r1 = t; cy1 = cy0; cy0 = ya; }
        else { interpRow(lo, ya, r0, xa, xb); cy0 = ya; }
      }
      let rb = r0;
      if (yc !== ya) {
        if (yc !== cy1) { interpRow(lo, yc, r1, xa, xb); cy1 = yc; }
        rb = r1;
      }
      for (let i = i0; i < i1; i++) {
        const bLo = r0[i] * ty0 + rb[i] * ty;
        const v = Math.round(bLo * invInkL[row + i]);
        out[row + i] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    if (kept) src.copy(lastLo, from * loRow, from * loRow, (to + 1) * loRow); else src.copy(lastLo);
    lastVersion = renderVersion;
    return out;
  }

  /** The pen over a paint render already at the fine grid (WH x HH RGB, such as the sub-cell grain render, which
   *  carries the coarse ink as the sheet holds it): the coarse ink is swapped for the pen's own, pixel by pixel. */
  function composeFine(hi) {
    if (!hi || hi.length !== nH * 3) throw new Error(`inkres composeFine: a ${WH} x ${HH} RGB render is needed, got ${hi ? hi.length / 3 : 0} pixels`);
    ensureInkRatio();
    const out = Buffer.allocUnsafe(nH * 3);
    for (let i = 0; i < nH * 3; i++) { const v = Math.round(hi[i] * invInkL[i]); out[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
    return out;
  }

  // Actual deposited ink on the pen's own grid, on white. No upsampling or geometry replay.
  function nativeInk() {
    if (isGraphitePigment(pigments[inkAt])) return { width: WH, height: HH, pixels: Buffer.alloc(WH * HH * 3, 255) };
    return { width: WH, height: HH, pixels: renderLayers([[fineTotal(0)]], [finePigments[0]], whiteH, nH, 1) };
  }

  /** The pencil the eraser lifted on the painting's sheet, lifted on the fine sheet too: `before` and `after` are the
   *  painting's graphite (channel c) per cell either side of the rub. Each fine cell keeps after / before of its pencil,
   *  so the fine line shows what the painting's sheet still holds. Returns the coarse cells changed. */
  function erased(c, before, after) {
    const k = channel(c);
    if (!isGraphitePigment(finePigments[k])) throw new Error(`fine sheet: erased() follows the pencil's graphite, not channel ${c}`);
    if (before.length !== nL || after.length !== nL) throw new Error('fine sheet: erased() takes the painting\'s graphite per cell before and after');
    const planes = [fine.G[k], fine.D[k], fine.P[k], ...fine.layers.map(L => L[k])], S = seen[k], Lo = inkLo[k];
    let cells = 0;
    for (let yl = 0; yl < H2; yl++) for (let xl = 0; xl < W2; xl++) {
      const i = yl * W2 + xl, b = before[i];
      if (!(b > 0)) continue;
      const f = Math.max(0, Math.min(1, after[i] / b));
      if (f >= 1 - 1e-7) continue;
      cells++; Lo[i] *= f;
      for (let dy = 0; dy < N; dy++) { const row = (yl * N + dy) * WH + xl * N; for (let dx = 0; dx < N; dx++) { const j = row + dx; for (const a of planes) a[j] *= f; S[j] *= f; } }
    }
    if (cells) { layersChanged(fine); changed(); renderVersion = -1; }
    return cells;
  }

  function exportState() {
    coherent(fine);
    const fields=Object.fromEntries(Object.entries(fine).filter(([k,v])=>!['paper','pigments','_gpu','_gpuInfo','_renderCaches'].includes(k)&&typeof v!=='function'));
    return {N,WH,HH,inkAt,fields,seen,inkLo,wetOn,stats};
  }
  function importState(st) {
    for(const [k,v] of Object.entries({N,WH,HH,inkAt}))if(st[k]!==v)throw Error(`inkres state mismatch: ${k}`);
    Object.assign(fine,st.fields);
    seen.forEach((v,k)=>v.set(st.seen[k])); inkLo.forEach((v,k)=>v.set(st.inkLo[k]));
    wetOn=st.wetOn;Object.assign(stats,st.stats);
    layerVerSeen=-1;
    // Restored seen planes may contain a removed mark outside current ink.
    // Start conservatively; the normal carry then preserves those deltas.
    carriedLo.forEach(a=>a.fill(0));carriedHi.forEach(a=>a.fill(WH-1));
    changed();totalVersion.fill(-1);renderVersion=-1;
  }
  return { N, width: WH, height: HH, draw, settle, compose, composeKept, composeFine, nativeInk, carry, wet, stats, fine, remapInk, changed, exportState, importState, channel, channels: chans, erased };
}


// Proof only: read the dedicated ink channel, never paint or graphite.
export function renderInkProof({ thickness, pigments, inkAt, width, height }) {
  if (!Number.isInteger(inkAt) || !pigments[inkAt] || thickness[inkAt]?.length !== width * height)
    throw new Error('Ink proof requires a valid native ink channel');
  if (isGraphitePigment(pigments[inkAt])) return { width, height, pixels: Buffer.alloc(width * height * 3, 255) };
  return { width, height, pixels: renderLayers([[thickness[inkAt]]], [pigments[inkAt]], Buffer.alloc(width * height * 3, 255), width * height, 1) };
}
