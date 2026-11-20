// Pipeline: inking, stage 3b (the order a person draws a traced drawing in). DOM free, no file IO.
// From real-time drawing videos (timelapse study, 2026-11-19): people draw object by object. The largest form is staked out
// first; each object's outline comes before what is inside it, and a containing thing before what it contains (a wall before
// its windows, a frame before its bars); the next mark is near the last; texture and hatching come in a second pass over the
// worked objects; small isolated things come last. Long lines are not drawn first for being long.
// Objects come from enclosure only: the faces the drawn lines close off on the sheet (the sheet's edge closes them too), nested
// by containment. A line that runs on through a junction is drawn as one stroke. Each stroke is pulled one way: downward when
// it runs more up and down than across, else left to right.

export const ORDER_DEFAULTS = Object.freeze({
  cellMm: 0.5,          // the grid the faces are found on
  closeMm: 0.75,        // lines are thickened by this, so gaps under twice it still close a face
  minFaceMm2: 6,        // a face smaller than this is a sliver, not an object
  rimMm: 1,             // a stroke within this of a face's edge lies on its outline
  onShare: 0.6,         // share of a stroke's length that must lie on an outline (or inside an object)
  joinMm: 0.8,          // two ends this close ...
  joinCos: 0.94,        // ... that run on in one direction (within 20 degrees) are one stroke
  jaggedDegPerMm: 15,   // texture: a stroke turning more than this ...
  shortMm: 1.5,         // ... or shorter than this (that is not an outline)
  isolatedMm: 1.5,      // a group of marks this far from any other line ...
  smallShare: 0.005,    // ... and smaller than this share of the sheet ...
  smallDiag: 0.06,      // ... and than this share of its diagonal across is a small isolated thing, drawn last
  reachMm: 5,           // the next stroke is the nearest, a long one counted nearer: distance / sqrt(1 + length / reachMm)
  partShare: 0.02,      // faces under this share of the sheet split by a line between them are parts of one object (panes of a window)
});

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const pathLength = P => P.reduce((s, q, k) => (k ? s + dist(P[k - 1], q) : 0), 0);

export function resample(P, step) {
  const out = [P[0]]; let carry = 0;
  for (let k = 1; k < P.length; k++) {
    const a = P[k - 1], b = P[k], d = dist(a, b); let t = step - carry;
    while (t <= d) { out.push([a[0] + (b[0] - a[0]) * t / d, a[1] + (b[1] - a[1]) * t / d]); t += step; }
    carry = d - (t - step);
  }
  if (dist(out[out.length - 1], P[P.length - 1]) > 1e-9) out.push(P[P.length - 1]);
  return out;
}

/** Total absolute turning in degrees per mm of length (0 for a straight line). */
export function turningPerMm(P, step = 0.5) {
  const L = pathLength(P);
  if (L <= 0 || P.length < 3) return 0;
  const Q = resample(P, Math.min(step, L / 2));
  let turn = 0;
  for (let k = 1; k < Q.length - 1; k++) {
    const ax = Q[k][0] - Q[k - 1][0], ay = Q[k][1] - Q[k - 1][1], bx = Q[k + 1][0] - Q[k][0], by = Q[k + 1][1] - Q[k][1];
    if (Math.hypot(ax, ay) < 1e-9 || Math.hypot(bx, by) < 1e-9) continue;
    turn += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
  }
  return turn * 180 / Math.PI / L;
}

/** A stroke pulled the way a hand pulls it: downward if it runs more up-down than across, else left to right. */
export function pullDirection(P) {
  const a = P[0], b = P[P.length - 1], dx = b[0] - a[0], dy = b[1] - a[1];
  return (Math.abs(dy) > Math.abs(dx) ? dy < 0 : dx < 0) ? [...P].reverse() : P;
}

// the unit direction out of a path's end (`atStart`: out of its first point), read over `reach` mm
function endDir(P, atStart, reach = 1.5) {
  const Q = atStart ? P : [...P].reverse(), a = Q[0];
  let b = Q[1], s = 0;
  for (let k = 1; k < Q.length; k++) { s += dist(Q[k - 1], Q[k]); b = Q[k]; if (s >= reach) break; }
  const d = dist(a, b) || 1;
  return [(a[0] - b[0]) / d, (a[1] - b[1]) / d];
}

/**
 * Lines that run on through a junction, joined: an end meets another end within `joinMm` and both run on in one direction.
 * Returns [{ points, parts: [indices] }].
 */
export function joinContinuations(strokes, o = {}) {
  const c = { ...ORDER_DEFAULTS, ...o }, n = strokes.length, ends = [];
  strokes.forEach((P, i) => { if (P.length >= 2 && pathLength(P) > 0) { ends.push({ i, start: true, p: P[0], d: endDir(P, true) }, { i, start: false, p: P[P.length - 1], d: endDir(P, false) }); } });
  const pairs = [];
  for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) {
    const A = ends[a], B = ends[b];
    if (A.i === B.i) continue;
    const g = dist(A.p, B.p);
    if (g > c.joinMm) continue;
    // A runs out along A.d; B must run on the same way, so B's outward direction is opposite
    if (-(A.d[0] * B.d[0] + A.d[1] * B.d[1]) < c.joinCos) continue;
    pairs.push([g, a, b]);
  }
  pairs.sort((x, y) => x[0] - y[0]);
  const root = Array.from({ length: n }, (_, i) => i), find = i => (root[i] === i ? i : (root[i] = find(root[i])));
  const used = new Set(), link = new Map();
  for (const [, a, b] of pairs) {
    if (used.has(a) || used.has(b)) continue;
    const A = ends[a], B = ends[b];
    if (find(A.i) === find(B.i)) continue;
    used.add(a); used.add(b); root[find(A.i)] = find(B.i);
    link.set(`${A.i}:${A.start}`, B); link.set(`${B.i}:${B.start}`, A);
  }
  const done = new Uint8Array(n), out = [];
  for (let i = 0; i < n; i++) {
    if (done[i] || !(strokes[i].length >= 2)) continue;
    // walk back to a free end, then forward
    let cur = i, fromStart = true, guard = 0;
    for (;;) { const nx = link.get(`${cur}:${fromStart}`); if (!nx || guard++ > n) break; cur = nx.i; fromStart = !nx.start; }
    // cur's free end is `fromStart`: start the chain there
    const parts = [], pts = [];
    let at = cur, enter = fromStart;
    while (at != null && !done[at]) {
      done[at] = 1; parts.push(at);
      const P = enter ? strokes[at] : [...strokes[at]].reverse();
      pts.push(...(pts.length ? P.slice(1) : P));
      const nx = link.get(`${at}:${!enter}`);
      if (!nx) break;
      at = nx.i; enter = nx.start;
    }
    out.push({ points: pts, parts });
  }
  strokes.forEach((P, i) => { if (!done[i]) out.push({ points: P, parts: [i] }); });
  return out;
}

/**
 * The faces the lines close off, as objects nested by containment.
 * @returns { objects: [{ id, area (mm2, filled), parent, box, inFill(x,y), onRim(x,y) }], grid }
 */
export function findObjects(strokes, widthMm, heightMm, o = {}) {
  const c = { ...ORDER_DEFAULTS, ...o }, cs = c.cellMm, W = Math.ceil(widthMm / cs) + 2, H = Math.ceil(heightMm / cs) + 2;
  // a frame of padding cells outside the sheet; the sheet's edge closes faces
  const line = new Uint8Array(W * H), R = c.closeMm / cs, rr = Math.ceil(R);
  for (const P of strokes) for (const [x, y] of resample(P, cs / 2)) {
    const cx = x / cs + 1, cy = y / cs + 1;
    for (let j = Math.floor(cy - rr); j <= Math.ceil(cy + rr); j++) for (let i = Math.floor(cx - rr); i <= Math.ceil(cx + rr); i++)
      if (i >= 1 && j >= 1 && i < W - 1 && j < H - 1 && (i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= R * R) line[j * W + i] = 1;
  }
  const pad = k => { const i = k % W, j = (k / W) | 0; return i === 0 || j === 0 || i === W - 1 || j === H - 1; };
  const lab = new Int32Array(W * H).fill(-1), faces = [], stack = [];
  for (let k = 0; k < W * H; k++) {
    if (line[k] || pad(k) || lab[k] >= 0) continue;
    const id = faces.length, f = { id, cells: [], x0: W, y0: H, x1: 0, y1: 0 };
    lab[k] = id; stack.push(k);
    while (stack.length) {
      const q = stack.pop(), i = q % W, j = (q / W) | 0; f.cells.push(q);
      if (i < f.x0) f.x0 = i; if (i > f.x1) f.x1 = i; if (j < f.y0) f.y0 = j; if (j > f.y1) f.y1 = j;
      for (const n of [q - 1, q + 1, q - W, q + W]) if (!line[n] && !pad(n) && lab[n] < 0) { lab[n] = id; stack.push(n); }
    }
    faces.push(f);
  }
  const objects = [];
  for (const f of faces) {
    if (f.cells.length * cs * cs < c.minFaceMm2) continue;
    // its fill: the face and every hole in it (cells of its box, padded by one, not reachable from the box's edge outside the face)
    const x0 = f.x0 - 1, y0 = f.y0 - 1, bw = f.x1 - f.x0 + 3, bh = f.y1 - f.y0 + 3, own = new Uint8Array(bw * bh), out = new Uint8Array(bw * bh);
    for (const q of f.cells) own[((q / W | 0) - y0) * bw + (q % W - x0)] = 1;
    const st = [];
    for (let i = 0; i < bw; i++) for (const j of [0, bh - 1]) { const q = j * bw + i; if (!own[q] && !out[q]) { out[q] = 1; st.push(q); } }
    for (let j = 0; j < bh; j++) for (const i of [0, bw - 1]) { const q = j * bw + i; if (!own[q] && !out[q]) { out[q] = 1; st.push(q); } }
    while (st.length) { const q = st.pop(), i = q % bw, j = (q / bw) | 0; for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) { if (a < 0 || b < 0 || a >= bw || b >= bh) continue; const n = b * bw + a; if (!own[n] && !out[n]) { out[n] = 1; st.push(n); } } }
    let filled = 0; for (let q = 0; q < bw * bh; q++) if (!out[q]) filled++;
    // a stroke's centre lies about closeMm outside the face it bounds
    const rimR = Math.max(1, Math.ceil((c.rimMm + c.closeMm) / cs));
    // a cell is on the rim when both a filled and an outside cell lie within rimR of it (prefix sums over the box)
    const S = new Int32Array((bw + 1) * (bh + 1));
    for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) S[(j + 1) * (bw + 1) + i + 1] = (out[j * bw + i] ? 0 : 1) + S[j * (bw + 1) + i + 1] + S[(j + 1) * (bw + 1) + i] - S[j * (bw + 1) + i];
    const cell = (x, y) => [Math.floor(x / cs) + 1 - x0, Math.floor(y / cs) + 1 - y0];
    const inFill = (x, y) => { const [i, j] = cell(x, y); return i >= 0 && j >= 0 && i < bw && j < bh && !out[j * bw + i]; };
    const onRim = (x, y) => {
      const [i, j] = cell(x, y);
      const a0 = Math.max(0, i - rimR), a1 = Math.min(bw - 1, i + rimR), b0 = Math.max(0, j - rimR), b1 = Math.min(bh - 1, j + rimR);
      if (a0 > a1 || b0 > b1) return false;
      const full = (a1 - a0 + 1) * (b1 - b0 + 1), inside = S[(b1 + 1) * (bw + 1) + a1 + 1] - S[b0 * (bw + 1) + a1 + 1] - S[(b1 + 1) * (bw + 1) + a0] + S[b0 * (bw + 1) + a0];
      // near the box edge a window can reach past the box: cells there count as outside
      const clipped = (i - rimR < 0) || (j - rimR < 0) || (i + rimR >= bw) || (j + rimR >= bh);
      return inside > 0 && (inside < full || clipped);
    };
    const probe = f.cells[0];
    objects.push({ id: objects.length, area: filled * cs * cs, parent: null, children: [], box: [(x0 - 1) * cs, (y0 - 1) * cs, (x0 - 1 + bw) * cs, (y0 - 1 + bh) * cs],
      probe: [((probe % W) - 1 + 0.5) * cs, (((probe / W) | 0) - 1 + 0.5) * cs], inFill, onRim });
  }
  // the parent: the smallest other object whose fill holds this one's face
  for (const a of objects) {
    let best = null;
    for (const b of objects) if (b !== a && b.area > a.area && b.inFill(...a.probe) && (!best || b.area < best.area)) best = b;
    if (best) { a.parent = best.id; best.children.push(a.id); }
  }
  return { objects };
}

/**
 * The strokes in drawing order. `strokes`: arrays of [x, y] in mm on a sheet `widthMm` x `heightMm`.
 * Returns [{ parts: [input indices], points, object, role: 'outline'|'inner'|'texture'|'small', pass: 1|2|3 }].
 */
export function orderStrokes(strokes, widthMm, heightMm, o = {}) {
  const c = { ...ORDER_DEFAULTS, ...o };
  const joined = joinContinuations(strokes, c).map(s => ({ ...s, points: pullDirection(s.points) }));
  const { objects: faces } = findObjects(joined.map(s => s.points), widthMm, heightMm, c);
  const m = c.rimMm + c.closeMm + c.cellMm, overlaps = (b, P) => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return Math.max(...xs) >= b[0] - m && Math.min(...xs) <= b[2] + m && Math.max(...ys) >= b[1] - m && Math.min(...ys) <= b[3] + m; };
  // per stroke and nearby face: which samples lie on its rim, which inside its fill
  for (const s of joined) {
    s.Q = resample(s.points, c.cellMm);
    // a sample is on a face's outline when the face's fill lies on one side of the line and not the other (a mark that
    // only juts into a face has the face on both sides)
    const d = c.closeMm + 1.5 * c.cellMm, sides = s.Q.map((q, k) => {
      const a = s.Q[Math.max(0, k - 2)], b = s.Q[Math.min(s.Q.length - 1, k + 2)], L = dist(a, b) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      return [[q[0] + d * nx, q[1] + d * ny], [q[0] - d * nx, q[1] - d * ny]];
    });
    s.hits = faces.filter(f => overlaps(f.box, s.points)).map(f => ({ f: f.id, rim: sides.map(([l, r]) => f.inFill(...l) !== f.inFill(...r)), fill: s.Q.map(([x, y]) => f.inFill(x, y)) }));
  }
  // small sibling faces split by a line that runs along both are parts of one object; that line is a division inside it
  const root = faces.map(f => f.id), find = i => (root[i] === i ? i : (root[i] = find(root[i]))), small = f => f.area < c.partShare * widthMm * heightMm;
  for (const s of joined) {
    const along = s.hits.filter(h => h.rim.filter(Boolean).length >= c.onShare * s.Q.length).map(h => faces[h.f]).filter(small);
    for (let a = 0; a < along.length; a++) for (let b = a + 1; b < along.length; b++)
      if (along[a].parent === along[b].parent && along[a].parent != null) { root[find(along[a].id)] = find(along[b].id); s.division = true; }
  }
  // objects: the groups of faces, nested as their faces are
  const gid = new Map(), objects = [];
  for (const f of faces) { const r = find(f.id); if (!gid.has(r)) { gid.set(r, objects.length); objects.push({ id: objects.length, faces: [], area: 0, parent: null, children: [] }); } const g = objects[gid.get(r)]; g.faces.push(f.id); g.area += f.area; }
  for (const g of objects) { const p = faces[g.faces[0]].parent; if (p != null) { g.parent = gid.get(find(p)); objects[g.parent].children.push(g.id); } }
  // each stroke: the outline of the smallest object it lies along, else inside the smallest object that holds it
  for (const s of joined) {
    const share = (g, key) => { const H = s.hits.filter(h => objects[gid.get(find(h.f))] === g); let n = 0; for (let k = 0; k < s.Q.length; k++) if (H.some(h => h[key][k])) n++; return n / s.Q.length; };
    const near = [...new Set(s.hits.map(h => gid.get(find(h.f))))].map(k => objects[k]).sort((a, b) => a.area - b.area);
    const outline = s.division ? null : near.find(g => share(g, 'rim') >= c.onShare), inner = near.find(g => share(g, 'fill') >= c.onShare);
    const L = pathLength(s.points);
    s.object = s.division ? gid.get(find(s.hits.find(h => h.rim.filter(Boolean).length >= c.onShare * s.Q.length).f)) : outline ? outline.id : inner ? inner.id : -1;
    s.role = outline ? 'outline' : 'inner';
    if (s.role === 'inner' && !s.division && (turningPerMm(s.points) > c.jaggedDegPerMm || L < c.shortMm)) s.role = 'texture';
  }
  // small isolated things: groups of non-outline marks that touch no outline and stay small
  const free = joined.filter(s => s.role !== 'outline'), anchors = joined.filter(s => s.role === 'outline').map(s => resample(s.points, c.isolatedMm / 2));
  // a grid of every sample, so each stroke finds the marks within isolatedMm of it without looking at all of them
  const samp = free.map(s => resample(s.points, c.isolatedMm / 2)), grp = new Int32Array(free.length).fill(-1), g = c.isolatedMm;
  const grid = new Map(), key = (i, j) => i * 100003 + j, put = (q, v) => { const k = key(Math.floor(q[0] / g), Math.floor(q[1] / g)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([q[0], q[1], v]); };
  samp.forEach((P, k) => P.forEach(q => put(q, k)));
  anchors.forEach(P => P.forEach(q => put(q, -1)));
  const around = (P, fn) => { for (const q of P) { const i0 = Math.floor(q[0] / g), j0 = Math.floor(q[1] / g); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const r of grid.get(key(i, j)) ?? []) if (Math.hypot(r[0] - q[0], r[1] - q[1]) <= g) fn(r[2]); } };
  for (let a = 0; a < free.length; a++) {
    if (grp[a] >= 0) continue;
    const st = [a], members = []; grp[a] = a; let touches = false;
    while (st.length) { const k = st.pop(); members.push(k); around(samp[k], v => { if (v < 0) touches = true; else if (grp[v] < 0) { grp[v] = a; st.push(v); } }); }
    const pts = members.flatMap(k => free[k].points);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const area = (x1 - x0) * (y1 - y0), across = Math.hypot(x1 - x0, y1 - y0);
    if (!touches && area < c.smallShare * widthMm * heightMm && across < c.smallDiag * Math.hypot(widthMm, heightMm)) for (const k of members) free[k].role = 'small';
  }
  const byObj = new Map(); for (const s of joined) { if (!byObj.has(s.object)) byObj.set(s.object, []); byObj.get(s.object).push(s); }
  const out = []; let pen = [0, 0];
  const take = (s, pass) => { out.push({ parts: s.parts, points: s.points, object: s.object, role: s.role, pass }); pen = s.points[s.points.length - 1]; s.taken = true; };
  // how near a stroke is to start: its start's distance, a long stroke counted nearer (the bigger lines of a thing first)
  for (const s of joined) s.len = pathLength(s.points);
  const cost = s => dist(pen, s.points[0]) / Math.sqrt(1 + s.len / c.reachMm);
  const nearestFirst = list => { const left = [...list]; while (left.length) { let b = 0; for (let k = 1; k < left.length; k++) if (cost(left[k]) < cost(left[b])) b = k; take(left.splice(b, 1)[0], 1); } };
  const own = (id, role) => (byObj.get(id) ?? []).filter(s => s.role === role && !s.taken);
  // the strokes an object and everything inside it would start from: its outline, else anything of it
  const entry = id => { const ob = objects[id], S = [...own(id, 'outline'), ...own(id, 'inner')]; return S.length ? S : ob.children.flatMap(entry); };
  const visited = [];
  const visit = id => {
    visited.push(id);
    nearestFirst(own(id, 'outline'));
    // then what is inside it, a stroke or a contained object at a time, the nearest next
    const items = () => [...own(id, 'inner').map(s => ({ s })), ...objects[id].children.filter(k => !visited.includes(k)).map(k => ({ k }))];
    for (let it = items(); it.length; it = items()) {
      const d = x => (x.s ? cost(x.s) : Math.min(Infinity, ...entry(x.k).map(cost)));
      let b = it[0]; for (const x of it) if (d(x) < d(b)) b = x;
      if (b.s) take(b.s, 1); else visit(b.k);
    }
  };
  // the largest form first, then the nearest next form; strokes in no object go with the forms
  const roots = objects.filter(ob => ob.parent == null).map(ob => ob.id);
  if (roots.length) { const big = roots.reduce((a, b) => (objects[a].area >= objects[b].area ? a : b)); visit(big); }
  for (;;) {
    const items = [...roots.filter(k => !visited.includes(k)).map(k => ({ k })), ...own(-1, 'outline').concat(own(-1, 'inner')).map(s => ({ s }))];
    if (!items.length) break;
    const d = x => (x.s ? cost(x.s) : Math.min(Infinity, ...entry(x.k).map(cost)));
    let b = items[0]; for (const x of items) if (d(x) < d(b)) b = x;
    if (b.s) take(b.s, 1); else visit(b.k);
  }
  // a second pass over the worked objects in the order they were drawn: texture and hatching
  for (const id of [...visited, -1]) { const T = own(id, 'texture'), at = out.length; nearestFirst(T); for (let k = at; k < out.length; k++) out[k].pass = 2; }
  // small isolated things last
  const at = out.length; nearestFirst(joined.filter(s => s.role === 'small' && !s.taken)); for (let k = at; k < out.length; k++) out[k].pass = 3;
  return out;
}

/** Hand travel between consecutive strokes (end of one to start of the next). */
export function handTravel(ordered) {
  return ordered.slice(1).map((r, k) => dist(ordered[k].points[ordered[k].points.length - 1], r.points[0]));
}

/**
 * How the order compares with the study: median jump and the share of jumps over a quarter, as shares of the diagonal;
 * the share of strokes that return to an object worked earlier (not the one just before); objects whose inner lines start
 * before their outline is finished.
 */
export function orderStats(ordered, widthMm, heightMm) {
  const diag = Math.hypot(widthMm, heightMm), T = handTravel(ordered).map(t => t / diag).sort((a, b) => a - b);
  const seen = new Set(); let returns = 0, prev = null;
  for (const r of ordered) { if (r.object !== prev && seen.has(r.object)) returns++; seen.add(r.object); prev = r.object; }
  const lastOutline = new Map(), firstInner = new Map();
  ordered.forEach((r, k) => { if (r.role === 'outline') lastOutline.set(r.object, k); else if (r.role === 'inner' && !firstInner.has(r.object)) firstInner.set(r.object, k); });
  let innerBeforeOutline = 0; for (const [ob, k] of firstInner) if (ob >= 0 && lastOutline.has(ob) && k < lastOutline.get(ob)) innerBeforeOutline++;
  return { strokes: ordered.length, medianJumpDiag: T.length ? T[T.length >> 1] : 0, bigJumpShare: T.length ? T.filter(t => t > 0.25).length / T.length : 0,
    returnShare: ordered.length ? returns / ordered.length : 0, innerBeforeOutline };
}
