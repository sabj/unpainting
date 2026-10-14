// Joined washes (--washjoin 1). Within one band and pigment the planner splits the cells it will paint by colour
// domain (region or colour family), then drops every connected piece under the minimum shape. Where the target's
// colour regions are busy (a crowd, foliage, fur) a domain breaks into many small pieces, and dropping them leaves
// bare-paper shards that no later pass covers. A painter carries the wash across: a piece too small to be its own
// passage joins the neighbouring domain it shares the most edge with, and is laid with that passage.
// Planning only; the cells, their demand and their band are unchanged, only which passage carries them.

// key[i]: the domain of cell i, or -1 where the step paints nothing. Pieces of fewer than minArea cells (4-connected,
// one domain) take the domain they touch most along their edge. Repeats up to `rounds` times, as joined pieces can
// make neighbours large enough. Returns a new Int32Array; isolated pieces keep their own domain.
export function joinDomainFragments(mask, w, h, keyOf, minArea, rounds = 3) {
  const n = w * h, key = new Int32Array(n), lab = new Int32Array(n), q = new Int32Array(n);
  for (let i = 0; i < n; i++) key[i] = mask[i] ? keyOf(i) : -1;
  for (let round = 0; round < rounds; round++) {
    lab.fill(-1);
    let changed = 0;
    for (let s = 0; s < n; s++) {
      if (key[s] < 0 || lab[s] >= 0) continue;
      const k = key[s];
      let qh = 0, qt = 0;
      q[qt++] = s; lab[s] = s;
      const touch = new Map();
      while (qh < qt) {
        const i = q[qh++], x = i % w, y = (i / w) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j < 0 || key[j] < 0) continue;
          if (key[j] === k) { if (lab[j] < 0) { lab[j] = s; q[qt++] = j; } }
          else touch.set(key[j], (touch.get(key[j]) ?? 0) + 1);
        }
      }
      if (qt >= minArea || !touch.size) continue;
      let best = -1, most = 0;
      for (const [kk, c] of touch) if (c > most || (c === most && kk < best)) { best = kk; most = c; }
      for (let t = 0; t < qt; t++) key[q[t]] = best;
      changed++;
    }
    if (!changed) break;
  }
  return key;
}
