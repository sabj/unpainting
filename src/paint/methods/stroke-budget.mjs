// --passmerge 1: fewer strokes, closer to what a painter makes: the passages of one pass and mix laid as one, since a
// pass of one colour at one value is laid as a few sweeps. (--strokebudget N was removed in 0.4.)

// --focusmap <png or json>: a png's white is focus, any size; a json holds one value per cell or regions with bounds.
// A passage's weight is 0.25 + focus, so the focus gets most strokes.
// Without a map the modulation's detail field (modulate.mjs) is used when there is one; otherwise the weight is flat.
export async function loadFocus({ opt, w, h, sharp, path, root }) {
  const f = opt('focusmap', '');
  if (!f) return null;
  const full = path.resolve(root, f);
  if (full.endsWith('.json')) {
    const fs = await import('node:fs');
    const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
    const out = new Float32Array(w * h);
    const arr = Array.isArray(doc) ? doc : (Array.isArray(doc?.values) ? doc.values : (Array.isArray(doc?.focus) ? doc.focus : null));
    if (arr && arr.length === w * h && typeof arr[0] === 'number') {
      for (let i = 0; i < w * h; i++) out[i] = Math.max(0, Math.min(1, arr[i] > 1 ? arr[i] / 255 : arr[i]));
      return out;
    }
    if (arr && typeof arr[0] === 'number') throw new Error(`--focusmap ${f}: ${arr.length} values, expected ${w * h} (${w}x${h})`);
    const boxes = Array.isArray(doc?.regions) ? doc.regions : (Array.isArray(doc?.boxes) ? doc.boxes : (Array.isArray(doc) ? doc : []));
    const usable = boxes.filter(r => { const b = r?.bounds ?? r?.box ?? (Array.isArray(r) ? r : null); return Array.isArray(b) && b.length >= 4; });
    if (!usable.length) throw new Error(`--focusmap ${f}: no values or regions with bounds`);
    for (const r of usable) {
      const b = r?.bounds ?? r?.box ?? r;
      const wt = Math.max(0, Math.min(1, Number(r?.weight ?? r?.focus ?? 1)));
      const x0 = Math.max(0, Math.floor((b[0] <= 1 && b[2] <= 1 ? b[0] * w : b[0]))), y0 = Math.max(0, Math.floor((b[1] <= 1 && b[3] <= 1 ? b[1] * h : b[1])));
      const x1 = Math.min(w, Math.ceil((b[0] <= 1 && b[2] <= 1 ? b[2] * w : b[2]))), y1 = Math.min(h, Math.ceil((b[1] <= 1 && b[3] <= 1 ? b[3] * h : b[3])));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[y * w + x] = Math.max(out[y * w + x], wt);
    }
    return out;
  }
  const { data } = await sharp(full).greyscale().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
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
