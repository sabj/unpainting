// --passmerge 1 and --strokebudget N: about as many brush strokes as a painter makes, a few hundred to two thousand,
// instead of one stroke per passage, since a pass of one colour at one value is laid as a few sweeps.

// --focusmap <png>: white is focus, any size; a passage's weight is 0.25 + focus, so the focus gets most strokes.
// Without a map the modulation's detail field (modulate.mjs) is used when there is one; otherwise the weight is flat.
export async function loadFocus({ opt, w, h, sharp, path, root }) {
  const f = opt('focusmap', '');
  if (!f) return null;
  const { data } = await sharp(path.resolve(root, f)).greyscale().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  return Float32Array.from(data, v => v / 255);
}

const handling = sh => (sh.graded ? null : `${sh._wow ? 1 : 0}|${sh._opening ?? '-'}|${sh._tint ?? '-'}|${sh._flat ? 1 : 0}|${sh._detail ? 1 : 0}|${sh._mass ?? '-'}`);
const props = sh => { const t = sh.mix.reduce((a, v) => a + v, 0) || 1; return sh.mix.map(v => v / t); };

/**
 * --passmerge 1 (needs --brushfloor, whose clip holds the paint to each passage): one pass's passages with the same
 * handling and a mix within --mergetol (L1) laid as one, its mask the union, its charge the area-weighted mean.
 * Returns new shape objects; the originals are not changed.
 */
export function mergeShapes(shapes, { n, tol = 0.25, amt = 1.35, film = null }) {
  const out = [], groups = [];
  for (const sh of shapes) {
    const key = handling(sh);
    if (key === null || !sh.mix) { out.push(sh); continue; }
    const p = props(sh);
    // and at about the same strength (within a ratio of --mergeamt), so a pale passage and a darker one of the same mix
    // are not laid at their mean
    let g = groups.find(g => g.key === key && g.p.reduce((a, v, j) => a + Math.abs(v - p[j]), 0) < tol && Math.max(g.a / sh.amount, sh.amount / g.a) < amt);
    if (!g) { g = { key, p, a: sh.amount, members: [] }; groups.push(g); }
    g.members.push(sh);
  }
  for (const g of groups) {
    if (g.members.length === 1) { out.push(g.members[0]); continue; }
    const mask = new Uint8Array(n); let area = 0, amt = 0, fm = 0; const K = g.members[0].mix.length, mix = new Array(K).fill(0);
    for (const sh of g.members) {
      const m = sh.mask; let a = 0; for (let i = 0; i < n; i++) if (m[i]) { mask[i] = 1; a++; }
      area += a; amt += sh.amount * a; for (let j = 0; j < K; j++) mix[j] += sh.mix[j] * a;
      if (film) fm += film.get(sh) ?? 0;
    }
    if (!area) continue;
    const first = g.members[0];
    const merged = { mask, area, amount: amt / area, mix: mix.map(v => v / area), merged: g.members.length,
      _wow: first._wow, _opening: first._opening, _tint: first._tint, _flat: first._flat, _detail: first._detail, _mass: first._mass };
    if (film) film.set(merged, fm);
    out.push(merged);
  }
  return out;
}

/**
 * --strokebudget N: brush paths, dip to lift, shared out as --budgetsplit (washes, drags, dry brush, accents). Returns
 * each passage's share of the wash paths by area times focus, at least one, and counts for the other brushes.
 */
export function planBudget({ N, layers, focus, n, split = [0.6, 0.2, 0.08, 0.12] }) {
  if (!(N > 0)) return null;
  const wt = m => { if (!focus) { let a = 0; for (let i = 0; i < n; i++) a += m[i]; return a; } let a = 0; for (let i = 0; i < n; i++) if (m[i]) a += 0.25 + focus[i]; return a; };
  const shapeW = new WeakMap(); let total = 0;
  for (const L of layers) for (const sh of L.shapes) { const v = wt(sh.mask); shapeW.set(sh, v); total += v; }
  const wash = N * split[0];
  return {
    N, wash, drags: Math.round(N * split[1]), dry: Math.round(N * split[2]), accents: Math.round(N * split[3]),
    // a passage's share of the wash strokes, at least one
    target: sh => Math.max(1, Math.round(wash * (shapeW.get(sh) ?? 0) / Math.max(1e-9, total))),
  };
}

