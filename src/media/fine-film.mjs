// Chronological film transfers. Each record owns only its worked box plus the
// one-cell halo needed by bilinear free-surface reconstruction. No pigment or
// water equation runs here; this is an observation of the coarse solver.
export function filmLedger(sheet) {
  const events = [], touched = new Uint8Array(sheet.n);
  let pending = null;
  const copy = (out, input, e) => {
    for (let y = 0; y < e.h; y++) {
      const at = (e.y + y) * sheet.w + e.x;
      out.set(input.subarray(at, at + e.w), y * e.w);
    }
  };
  const ledger = {
    events, touched, recorded: false,
    reset() { events.length = 0; touched.fill(0); pending = null; ledger.recorded = false; },
    begin(box, absorption = false) {
      if (pending) throw new Error('two grids: unfinished film pass');
      ledger.recorded = true;
      const x = Math.max(0, box[0] - 1), y = Math.max(0, box[1] - 1);
      const w = Math.min(sheet.w - 1, box[2] + 1) - x + 1;
      const h = Math.min(sheet.h - 1, box[3] + 1) - y + 1, n = w * h;
      pending = { x, y, w, h, box: [...box], before: new Float32Array(n), after: new Float32Array(n),
        mask: new Uint8Array(n), afterMask: new Uint8Array(n), fx: new Float64Array(n), fy: new Float64Array(n),
        absorption, moves: 0 };
      copy(pending.before, sheet.W, pending); copy(pending.mask, sheet.M, pending);
    },
    face(i, vertical, amount) {
      if (!amount) return;
      const e = pending;
      if (!e) throw new Error('two grids: film face outside a pass');
      const at = (Math.floor(i / sheet.w) - e.y) * e.w + i % sheet.w - e.x;
      (vertical ? e.fy : e.fx)[at] += amount; e.moves++;
      touched[i] = 1; touched[i + (vertical ? sheet.w : 1)] = 1;
    },
    end() {
      const e = pending;
      if (!e) throw new Error('two grids: no film pass to finish');
      copy(e.after, sheet.W, e);
      copy(e.afterMask, sheet.M, e);
      let absorbs = false;
      if (e.absorption) for (let y = e.box[1]; y <= e.box[3]; y++) for (let x = e.box[0]; x <= e.box[2]; x++)
        if (sheet._flux.aw[y * sheet.w + x] > 0) absorbs = true;
      if (e.moves || absorbs || e.after.some((v, i) => v !== e.before[i] || e.afterMask[i] !== e.mask[i])) {
        if (e.absorption) {
          e.aw = new Float32Array(e.w * e.h);
          for (let y = e.box[1]; y <= e.box[3]; y++) for (let x = e.box[0]; x <= e.box[2]; x++)
            e.aw[(y - e.y) * e.w + x - e.x] = sheet._flux.aw[y * sheet.w + x];
        }
        events.push(e);
        for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) {
          const at = y * e.w + x;
          if (e.before[at] || e.after[at] || e.mask[at] || e.afterMask[at]) touched[(e.y + y) * sheet.w + e.x + x] = 1;
        }
      }
      pending = null;
    },
    backrun(event) { if (ledger.recorded) events.push({ backrun: event }); },
  };
  return ledger;
}

function patch(F, e, source, water, mask, sourceMask) {
  let changed = false;
  for (let y = 0; y < e.h; y++) {
    const at = (e.y + y) * F.sheet.w + e.x;
    for (let x = 0; x < e.w; x++) if (water[at + x] !== source[y * e.w + x] || mask[at + x] !== sourceMask[y * e.w + x]) changed = true;
    water.set(source.subarray(y * e.w, (y + 1) * e.w), at);
    mask.set(sourceMask.subarray(y * e.w, (y + 1) * e.w), at);
  }
  return changed;
}

export function absorbFine(F, shares, blocks, mobility) {
  const nn = F.N * F.N;
  for (const c of blocks) {
    const aw = shares[c]; if (!aw) continue;
    const start = c * nn;
    for (let k = 0; k < F.K; k++) {
      const g = F.G[k], p = F.P[k], m = mobility[k];
      for (let a = 0; a < nn; a++) {
        const f = F.blockCells[start + a], amount = g[f] * aw * m;
        g[f] -= amount; p[f] += amount;
      }
    }
  }
}

// Replay every donor state before the next pass changes it. The full coarse
// scratch is reused, while retained records stay cropped. Fine scratch is the
// existing pair of water planes; there is no per-event fine allocation.
export function* replayFilm(F, blocks, mobility) {
  const { L, sheet: s, wb, wa, sb, sa } = F;
  const W = L.filmWater ??= new Float32Array(s.n), M = L.filmMask ??= new Uint8Array(s.n);
  W.set(L.W0); M.set(L.M0);
  yield { kind: 'reconstructFilm', args: [W, M, L.s0, wb, sb, blocks] };
  for (const e of L.film.events) {
    if (e.backrun) {
      const b = e.backrun;
      yield { kind: 'reconstructFilm', args: [b.beforeW, b.mask, L.s0, wb, sb, blocks] };
      yield { kind: 'backrun', args: [b] };
      W.set(b.afterW); M.set(b.mask);
      yield { kind: 'reconstructFilm', args: [W, M, L.s0, wb, sb, blocks] };
      continue;
    }
    if (patch(F, e, e.before, W, M, e.mask)) yield { kind: 'reconstructFilm', args: [W, M, L.s0, wb, sb, blocks] };
    patch(F, e, e.after, W, M, e.afterMask);
    yield { kind: 'reconstructFilm', args: [W, M, L.s0, wa, sa, blocks] };
    L.fx.fill(0); L.fy.fill(0);
    if (e.absorption) L.aw.fill(0);
    for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) {
      const at = y * e.w + x, c = (e.y + y) * s.w + e.x + x;
      L.fx[c] = e.fx[at]; L.fy[c] = e.fy[at];
      if (e.absorption) L.aw[c] = e.aw[at];
    }
    if (e.moves) {
      yield { kind: 'flux', args: [L.fx, L.fy, wb, wa, blocks] };
      yield { kind: 'carry', args: [F.G, wb, wa] };
    }
    if (e.absorption) yield { kind: 'absorb', args: [L.aw, blocks, mobility] };
    yield { kind: 'waterCopy', args: [wa, wb] };
  }
  // Preserve any final free-surface redistribution after the last recorded
  // transfer (including a changed wet mask), then diffuse and settle once.
  let finalChanged = false;
  for (const c of blocks) if (W[c] !== s.W[c] || M[c] !== s.M[c]) { finalChanged = true; break; }
  F.finalRedistributed = finalChanged;
  if (finalChanged) yield { kind: 'reconstructFilm', args: [s.W, s.M, s.s, wa, sa, blocks] };
  else yield { kind: 'waterCopy', args: [wb, wa, s.s, sa, blocks] };
  L.fx.fill(0); L.fy.fill(0);
}
