// Pipeline: inking, stage 3b (the order a person draws a traced drawing in). DOM free, no file IO.
// From real-time drawing videos (timelapse study, 2026-11-19): people draw object by object. The largest form is staked out
// first; each object's outline comes before what is inside it, and a containing thing before what it contains (a wall before
// its windows, a frame before its bars); the next mark is near the last; texture and hatching come in a second pass over the
// worked objects; small isolated things come last. Long lines are not drawn first for being long.
// Objects come from enclosure only: the faces the drawn lines close off on the sheet (the sheet's edge closes them too), nested
// by containment. A line that runs on through a junction is drawn as one stroke. Each stroke is pulled one way: downward when
// it runs more up and down than across, else left to right.

import { bridgeGaps } from './stroke-bridge.mjs';
import { strokeContributions } from './stroke-contribution.mjs';
import { byArea } from './area-order.mjs';

const ORDER_DEFAULTS = Object.freeze({
  cellMm: 0.5,          // the grid the faces are found on
  closeMm: 1.5,         // lines are thickened by this, so gaps under twice it still close a face (a drawn wall is rarely sealed)
  minFaceMm2: 6,        // a face smaller than this is a sliver, not an object
  rimMm: 1,             // a stroke within this of a face's edge lies on its outline
  onShare: 0.5,         // share of a stroke's length that must lie on an outline (or inside an object)
  joinMm: 0.8,          // two ends this close ...
  joinCos: 0.94,        // ... that run on in one direction (within 20 degrees) are one stroke
  jaggedDegPerMm: 15,   // texture: a stroke turning more than this ...
  shortMm: 1.5,         // ... or shorter than this (that is not an outline)
  isolatedMm: 1.5,      // a group of marks this far from any other line ...
  smallShare: 0.005,    // ... and smaller than this share of the sheet ...
  smallDiag: 0.06,      // ... and than this share of its diagonal across is a small isolated thing, drawn last
  reachMm: 5,           // the next stroke is the nearest, a long one counted nearer: distance / sqrt(1 + length / reachMm)
  hatchMm: [1, 30],     // a hatching stroke (or a repeated mullion or bar): straight, this long ...
  hatchDeg: 20,         // ... with neighbours within this angle ...
  hatchGapMm: 3,        // ... and this far apart (at least two of them), side by side
  ink: 'full',          // the ink amount inside painted masses (`masses`, a test (x, y) mm -> boolean): none | forms | full
  formMm: 6,            // at 'forms', a stroke inside a mass is kept when at least this long and along the mass's edge
  edgeMm: 1.5,          // ... within this of the edge
  openingMm: 40,        // below 'full': an outline shorter than this frames an opening; joints within jointKeepMm of one stay
  jointKeepMm: 5,
  foregroundShare: 0.75, // ... and joints in the lowest quarter of the sheet stay
  structureMm: 12,      // pass 1: the big structure, smooth lines at least this long (of every mass, main mass first)
  fineMm: 4,            // pass 3: lines shorter than this are fine detail, laid after every object's outline and divisions
  hatching: 'drawn',
  threshold: 0,         // lay only strokes whose contribution (mm2 of ink, stroke-contribution.mjs) is at least this (0: everything)
  objectFloor: 3,       // ... and whatever their rank each object's strongest few strokes and its outline: no element vanishes
  massKeep: 0.3,        // at ink 'forms', inside a mass also the strongest share of its short marks (leaf-cluster curves)
  unitShare: 0.2,       // ... an object is the largest thing round a stroke under this share of the sheet (a window, not the wall)
  objectStickMm: 20,    // growth: leaving an object with work left in it costs this much (finish one object, then the nearest)
  mode: 'passes',       // 'passes' (structure, objects, detail) or 'growth' (lay-in, growth from the main form, development, emphasis)
  growthPull: 1.5,      // growth: the next stroke is the cheapest by hop + growthPull x its distance from the main form
  layIn: 8,             // growth: the light placement lines of the biggest masses
  detailLagMm: 15,      // growth: detail follows the structure of its area at about this distance behind
  mainShare: 0.03,      // growth: a main form smaller than this share of the sheet is not grown from
  majorMm: 25,          // growth: a structure line this long, or one of the main form, is a main line (drawn a little firmer)
  emphasisShare: 0.04,  // growth: the share of contours restated heavier at the end
  accentMm: 40,         // ... a line's length counts up to this in choosing them
  partShare: 0.02,
  bridgeMm: 10,         // pieces of one line broken by gaps up to this are one stroke (stroke-bridge.mjs); 0 leaves them
  tickMm: 6,            // growth: a mark shorter than this with a free end (touching no other line) is a texture tick ...
  looseMm: 15,          // ... and a straight mark shorter than this free at both ends (a stone joint) is one too
  touchMm: 1,           // an end within this of another line touches it
  structInnerMm: 10,    // growth: an inner line is structure (laid in growth) when at least this long; shorter ones are detail      // faces under this share of the sheet split by a line between them are parts of one object (panes of a window)
});

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const pathLength = P => P.reduce((s, q, k) => (k ? s + dist(P[k - 1], q) : 0), 0);

function resample(P, step) {
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

/** Runs of hatching: straight strokes of hatchMm length with at least two neighbours alongside at hatchDeg and hatchGapMm. */
function hatchRuns(strokes, o = {}) {
  const c = { ...ORDER_DEFAULTS, ...o }, n = strokes.length;
  const F = strokes.map(P => {
    const L = pathLength(P), a = P[0], b = P[P.length - 1], ch = dist(a, b);
    return { ok: L >= c.hatchMm[0] && L <= c.hatchMm[1] && ch >= 0.9 * L, L, d: [(b[0] - a[0]) / (ch || 1), (b[1] - a[1]) / (ch || 1)], m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  });
  const g = c.hatchGapMm, grid = new Map(), key = (i, j) => i * 100003 + j;
  F.forEach((f, i) => { if (f.ok) { const k = key(Math.floor(f.m[0] / g), Math.floor(f.m[1] / g)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });
  const cosMin = Math.cos(c.hatchDeg * Math.PI / 180), nb = F.map(() => []);
  F.forEach((f, i) => {
    if (!f.ok) return;
    const i0 = Math.floor(f.m[0] / g), j0 = Math.floor(f.m[1] / g);
    for (let a = i0 - 1; a <= i0 + 1; a++) for (let b = j0 - 1; b <= j0 + 1; b++) for (const j of grid.get(key(a, b)) ?? []) {
      if (j === i) continue;
      const e = F[j], cos = Math.abs(f.d[0] * e.d[0] + f.d[1] * e.d[1]), dx = e.m[0] - f.m[0], dy = e.m[1] - f.m[1];
      const along = Math.abs(dx * f.d[0] + dy * f.d[1]), across = Math.abs(-dx * f.d[1] + dy * f.d[0]);
      if (cos >= cosMin && across <= g && across > 0.1 && along <= (f.L + e.L) / 4 + 0.5) nb[i].push(j);
    }
  });
  const run = new Int32Array(n).fill(-1), runs = [];
  for (let i = 0; i < n; i++) {
    if (run[i] >= 0 || nb[i].length < 2) continue;
    const st = [i], mem = []; run[i] = runs.length;
    while (st.length) { const k = st.pop(); mem.push(k); for (const j of nb[k]) if (run[j] < 0 && nb[j].length >= 1) { run[j] = runs.length; st.push(j); } }
    if (mem.length >= 3) runs.push(mem); else for (const k of mem) run[k] = -1;
  }
  return runs;
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
    const probe = f.cells[0], edge = f.x0 <= 1 || f.y0 <= 1 || f.x1 >= W - 2 || f.y1 >= H - 2;
    objects.push({ id: objects.length, area: filled * cs * cs, edge, parent: null, children: [], box: [(x0 - 1) * cs, (y0 - 1) * cs, (x0 - 1 + bw) * cs, (y0 - 1 + bh) * cs],
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
  // lines that run on through a junction, then pieces of one line across a gap, are one stroke each (with --widths and
  // --weights from the drawing a bridge needs the pieces to be drawn alike)
  let pieces = joinContinuations(strokes, c);
  const perPiece = arr => (arr ? pieces.map(s => { let a = 0, w = 0; for (const i of s.parts) { const L = pathLength(strokes[i]); a += (arr[i] ?? 0) * L; w += L; } return w ? a / w : arr[s.parts[0]]; }) : null);
  let bridges = 0;
  if (c.bridgeMm > 0) {
    const br = bridgeGaps(pieces.map(s => s.points), { gapMm: c.bridgeMm, weights: perPiece(c.weights), widths: perPiece(c.widths), skip: c.skip ? pieces.map(s => s.parts.some(i => c.skip[i])) : null });
    pieces = br.strokes.map(s => ({ points: s.points, parts: s.parts.flatMap(k => pieces[k].parts) })); bridges = br.bridges;
  }
  const heft = perPiece(c.widths);
  const perPart = (arr, s) => { if (!arr) return undefined; let a = 0, w = 0; for (const i of s.parts) { const L = pathLength(strokes[i]); a += (arr[i] ?? 0) * L; w += L; } return w ? a / w : arr[s.parts[0]]; };
  const joined = pieces.map((s, k) => ({ ...s, points: pullDirection(s.points), heft: heft ? heft[k] : 1, skip: !!c.skip && s.parts.some(i => c.skip[i]) }));
  const { objects: faces } = findObjects(joined.map(s => s.points), widthMm, heightMm, c);
  const m = c.rimMm + c.closeMm + c.cellMm, overlaps = (b, P) => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return Math.max(...xs) >= b[0] - m && Math.min(...xs) <= b[2] + m && Math.max(...ys) >= b[1] - m && Math.min(...ys) <= b[3] + m; };
  // per stroke and nearby face: which samples lie on its rim, which inside its fill
  for (const s of joined) {
    s.Q = resample(s.points, c.cellMm);
    // a sample is on a face's outline when the face's fill lies on one side of the line and not the other (a mark that
    // only juts into a face has the face on both sides)
    const d = c.closeMm + 1.5 * c.cellMm, sides = s.Q.map((q, k) => {
      const a = s.Q[Math.max(0, k - 2)], b = s.Q[Math.min(s.Q.length - 1, k + 2)], L = dist(a, b) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
      return [[q[0] + d * nx, q[1] + d * ny], [q[0] - d * nx, q[1] - d * ny], [q[0] + 2 * d * nx, q[1] + 2 * d * ny], [q[0] - 2 * d * nx, q[1] - 2 * d * ny]];
    });
    // each side is read at d and 2d, so a side that meets another line (a bar near a corner) still finds its face
    s.hits = faces.filter(f => overlaps(f.box, s.points)).map(f => ({ f: f.id, rim: sides.map(([l, r, l2, r2]) => (f.inFill(...l) || f.inFill(...l2)) !== (f.inFill(...r) || f.inFill(...r2))), fill: s.Q.map(([x, y]) => f.inFill(x, y)) }));
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
    // a jagged or short mark is texture even where it lies along an outline (foliage against a wall)
    if (!s.division && (turningPerMm(s.points) > c.jaggedDegPerMm || L < c.shortMm)) s.role = 'texture';
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
  // growth: loose ticks (a short mark with a free end, a stone joint free at both ends) are texture, laid in the last part
  if (c.mode === 'growth') markTicks(joined, c);
  // hatching: runs of parallel strokes, laid together in the second pass
  hatchRuns(joined.map(s => s.points), c).forEach((mem, r) => mem.forEach(k => { if (joined[k].role !== 'outline') { joined[k].role = 'hatch'; joined[k].run = r; } }));
  // the strokes that fill a solid dark (trace-drawing.py) are a fill: laid once the form round them is drawn, with the texture
  if (c.fills) for (const s of joined) if (s.parts.every(i => c.fills[i])) { s.role = 'fill'; delete s.run; }
  // HATCHING: none lays no hatching run; sparse lays every second line of a run, and only runs by a form's edge (where the
  // form turns or casts); as drawn lays them all
  if (!['none', 'sparse', 'drawn'].includes(c.hatching)) throw new Error(`hatching: none, sparse or drawn, not ${c.hatching}`);
  if (c.hatching !== 'drawn') {
    const runs = new Map(); for (const s of joined) if (s.role === 'hatch' && !s.taken) { if (!runs.has(s.run)) runs.set(s.run, []); runs.get(s.run).push(s); }
    const edges = joined.filter(s => s.role === 'outline').map(s => resample(s.points, 1));
    const byEdge = mem => mem.some(s => [s.points[0], s.points[s.points.length - 1]].some(q => edges.some(E => E.some(p => dist(p, q) <= c.edgeMm * 3))));
    for (const mem of runs.values()) {
      const keep = c.hatching === 'sparse' && byEdge(mem);
      mem.forEach((s, k) => { if (!keep || k % 2) { s.taken = true; s.dropped = true; } });
    }
  }
  // the ink amount outside the masses, below 'full': diagonal hatching runs are cast shadow and tone (the paint lays them);
  // masonry joints (short straight level or plumb lines) are kept near openings and corners and in the foreground, and
  // thinned to one in three across flat wall
  if (c.ink !== 'full') {
    const runs = new Map(); for (const s of joined) if (s.role === 'hatch') { if (!runs.has(s.run)) runs.set(s.run, []); runs.get(s.run).push(s); }
    for (const mem of runs.values()) {
      let dx = 0, dy = 0; for (const s of mem) { const P = s.points, v = [P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1]]; const sg = v[0] >= 0 ? 1 : -1; dx += sg * v[0]; dy += sg * v[1]; }
      const deg = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 180, off = Math.min(deg, 180 - deg);
      if (off > 20 && off < 70) for (const s of mem) { s.taken = true; s.dropped = true; }
    }
    const frames = joined.filter(s => s.role === 'outline' && pathLength(s.points) < c.openingMm).map(s => resample(s.points, 1));
    const nearFrame = q => frames.some(F => F.some(p => dist(p, q) <= c.jointKeepMm));
    let k = 0;
    for (const s of joined) {
      if (s.taken || s.role === 'outline') continue;
      const P = s.points, L = pathLength(P), a = P[0], b = P[P.length - 1], ch = dist(a, b);
      const ang = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI) % 90, level = Math.min(ang, 90 - ang) < 12;
      if (L < 2 || L > 15 || ch < 0.95 * L || !level) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (mid[1] > c.foregroundShare * heightMm || nearFrame(a) || nearFrame(b) || nearFrame(mid)) continue;
      if (k++ % 3) { s.taken = true; s.dropped = true; }
    }
  }
  // the ink amount: inside a painted mass (sky, cloud, foliage mass, cast shadow) 'none' lays nothing, 'forms' only the
  // long strokes along the mass's edge, 'full' everything; outside the masses every stroke is laid as drawn
  if (!['none', 'forms', 'full'].includes(c.ink)) throw new Error(`ink amount: none, forms or full, not ${c.ink}`);
  // the contribution of every stroke still in play, from its own ink (width and weight) and structure
  const live0 = joined.filter(s => !s.taken);
  if (live0.length && (c.threshold > 0 || (c.masses && c.ink !== 'full') || c.contributions)) {
    const per = (arr, i) => (arr ? arr[i] : undefined);
    const rec = live0.map(s => ({ paths: s.parts.map(i => ({ points: strokes[i], width: per(c.widthsMm, i) ?? 0.3, widths: per(c.pointWidthsMm, i) })), weight: perPart(c.weights, s) ?? 1, role: s.role, len: pathLength(s.points) }));
    const r = strokeContributions(rec, widthMm, heightMm);
    live0.forEach((s, k) => { s.contribution = r.contribution[k]; s.rank = r.rank[k]; });
    joined.contribution = r;
  }
  // inside a painted mass (sky, cloud, foliage mass, cast shadow) 'none' lays nothing; 'forms' keeps the mass's form: the
  // strokes along its edge, its long lines (trunk, branches, the clumps' contours) and the strongest share of its short marks
  // (massKeep, by contribution), so the dense shading inside goes and the mass stays; 'full' everything
  if (c.masses && c.ink !== 'full') {
    const inMass = [];
    for (const s of joined) {
      if (s.taken) continue;
      const Q = resample(s.points, c.cellMm), inside = Q.filter(([x, y]) => c.masses(x, y)).length / Q.length;
      if (inside < 0.5) continue;
      const e = c.edgeMm, edge = Q.filter(([x, y]) => [[e, 0], [-e, 0], [0, e], [0, -e]].some(([dx, dy]) => !c.masses(x + dx, y + dy))).length / Q.length;
      if (c.ink === 'none') { s.taken = true; s.dropped = true; } else if (!(pathLength(s.points) >= c.formMm || edge >= 0.5)) inMass.push(s);
    }
    inMass.sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0)).slice(Math.ceil(c.massKeep * inMass.length)).forEach(s => { s.taken = true; s.dropped = true; });
  }
  const byObj = new Map(); for (const s of joined) { if (!byObj.has(s.object)) byObj.set(s.object, []); byObj.get(s.object).push(s); }
  // CONTRIBUTION THRESHOLD: strokes that add less than `threshold` mm2 of the drawing's ink (structure-weighted) are not laid,
  // except each object's strongest `objectFloor` strokes and its outline lines, so every element keeps its form
  if (c.threshold > 0) {
    const keep = new Set();
    for (const [id, list] of byObj) {
      if (id < 0) continue;
      const live = list.filter(s => !s.taken).sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0));
      live.slice(0, c.objectFloor).forEach(s => keep.add(s));
      live.filter(s => s.role === 'outline' && pathLength(s.points) >= c.fineMm).forEach(s => keep.add(s));
    }
    for (const s of joined) if (!s.taken && !keep.has(s) && (s.contribution ?? 0) < c.threshold) { s.taken = true; s.dropped = true; s.belowThreshold = true; }
  }
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
  // the main mass first: the largest form the lines close off within the sheet (a face that reaches the sheet's edge is
  // ground or sky), from its longest outline; then the nearest next form; strokes in no object go with the forms
  const roots = objects.filter(ob => ob.parent == null).map(ob => ob.id);
  const inner = objects.filter(ob => !ob.faces.some(f => faces[f].edge)), main = (inner.length ? inner : objects).reduce((a, b) => (a.area >= b.area ? a : b), { area: -1 });
  if (main.id != null) {
    const lines = (byObj.get(main.id) ?? []).filter(s => s.role === 'outline');
    if (lines.length) pen = lines.reduce((a, b) => (a.len >= b.len ? a : b)).points[0];
  }
  if (c.mode === 'growth') { const r = growthOrder({ joined, objects, main, byObj, c, heightMm, widthMm, start: pen }); r.bridges = bridges; r.belowThreshold = joined.filter(s => s.belowThreshold).length; r.contribution = joined.contribution; return r; }
  // pass 1: the big structure of the whole picture, the long smooth lines of every mass, from the main mass's longest
  // line, the nearest next (a person sketches the whole composition in before any object is worked)
  { const big = joined.filter(s => !s.taken && (s.role === 'outline' || s.role === 'inner') && s.len >= c.structureMm && turningPerMm(s.points) <= 6);
    nearestFirst(big); for (const r of out) r.pass = 1; }
  // fine detail waits for pass 3: short lines are set aside from the object-by-object pass
  for (const s of joined) if (!s.taken && (s.role === 'outline' || s.role === 'inner') && s.len < c.fineMm) s.role = 'fine';
  const pass2 = out.length;
  if (main.id != null) {
    // its containers first (outline before inside), so start at the outermost one that holds it
    let top = main.id; while (objects[top].parent != null) top = objects[top].parent;
    visit(top);
  }
  for (;;) {
    const items = [...roots.filter(k => !visited.includes(k)).map(k => ({ k })), ...own(-1, 'outline').concat(own(-1, 'inner')).map(s => ({ s }))];
    if (!items.length) break;
    const d = x => (x.s ? cost(x.s) : Math.min(Infinity, ...entry(x.k).map(cost)));
    let b = items[0]; for (const x of items) if (d(x) < d(b)) b = x;
    if (b.s) take(b.s, 1); else visit(b.k);
  }
  // a second pass over the worked objects in the order they were drawn: texture marks, and hatching laid run by run, each
  // run's strokes all pulled one way and taken side by side across the run from its end nearer the pen
  const runOf = new Map(); for (const s of joined) if (s.role === 'hatch' && !s.taken) { if (!runOf.has(s.run)) runOf.set(s.run, []); runOf.get(s.run).push(s); }
  for (const mem of runOf.values()) {
    let dx = 0, dy = 0; const d0 = mem[0].points, r0 = [d0[d0.length - 1][0] - d0[0][0], d0[d0.length - 1][1] - d0[0][1]];
    for (const s of mem) { const P = s.points, v = [P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1]], sg = v[0] * r0[0] + v[1] * r0[1] < 0 ? -1 : 1; dx += sg * v[0]; dy += sg * v[1]; }
    if (Math.abs(dy) > Math.abs(dx) ? dy < 0 : dx < 0) { dx = -dx; dy = -dy; }
    for (const s of mem) { const P = s.points, v = [P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1]]; if (v[0] * dx + v[1] * dy < 0) s.points = [...P].reverse(); }
    const across = s => { const m = s.points[0]; return -m[0] * dy + m[1] * dx; };
    mem.sort((a, b) => across(a) - across(b));
  }
  for (let k = pass2; k < out.length; k++) out[k].pass = 2;
  // pass 3: fine detail, then texture and hatching (the finest repeated detail latest of all), then small isolated things
  { const at = out.length; nearestFirst(joined.filter(s => s.role === 'fine' && !s.taken)); for (let k = at; k < out.length; k++) out[k].pass = 3; }
  for (const id of [...visited, -1]) {
    const at = out.length, T = own(id, 'texture'), R = [...new Set(own(id, 'hatch').map(s => s.run))].map(r => runOf.get(r));
    const items = [...T.map(s => ({ s })), ...R.map(m => ({ m }))];
    while (items.length) {
      const d = x => (x.s ? cost(x.s) : Math.min(dist(pen, x.m[0].points[0]), dist(pen, x.m[x.m.length - 1].points[0])));
      let b = 0; for (let k = 1; k < items.length; k++) if (d(items[k]) < d(items[b])) b = k;
      const x = items.splice(b, 1)[0];
      if (x.s) take(x.s, 2);
      else { const m = dist(pen, x.m[0].points[0]) <= dist(pen, x.m[x.m.length - 1].points[0]) ? x.m : [...x.m].reverse(); for (const s of m) if (!s.taken) take(s, 2); }
    }
    for (let k = at; k < out.length; k++) out[k].pass = 3;
  }
  // small isolated things last
  const at = out.length; nearestFirst(joined.filter(s => s.role === 'small' && !s.taken)); for (let k = at; k < out.length; k++) out[k].pass = 3;
  out.dropped = joined.filter(s => s.dropped).length; out.bridges = bridges;
  return out;
}

/** Marks short loose marks as texture: under tickMm with an end touching no other line, or straight, under looseMm and
 * free at both ends. Outlines of a form (a division that closes it) keep both ends on lines and stay. */
function markTicks(joined, c) {
  const g = c.touchMm, grid = new Map(), key = (i, j) => i * 100003 + j;
  joined.forEach((s, k) => { for (const q of resample(s.points, g / 2)) { const kk = key(Math.floor(q[0] / g), Math.floor(q[1] / g)); (grid.get(kk) ?? grid.set(kk, []).get(kk)).push([q[0], q[1], k]); } });
  const free = (k, p) => { const i0 = Math.floor(p[0] / g), j0 = Math.floor(p[1] / g); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const r of grid.get(key(i, j)) ?? []) if (r[2] !== k && Math.hypot(r[0] - p[0], r[1] - p[1]) <= g) return false; return true; };
  joined.forEach((s, k) => {
    if (s.division || !['outline', 'inner'].includes(s.role)) return;
    const L = pathLength(s.points); if (L >= c.looseMm) return;
    const nFree = free(k, s.points[0]) + free(k, s.points.at(-1)), straight = dist(s.points[0], s.points.at(-1)) >= 0.9 * L;
    if ((L < c.tickMm && nFree >= 1) || (straight && nFree === 2)) { s.role = 'texture'; s.tick = true; }
  });
}

/**
 * Line weight for ink under washes, from the order rather than the drawing (a thin grey drawing gives no weight to copy):
 * the big structure firm and wide, outlines firm, inner lines lighter, fine detail and texture lightest; nearer (lower on
 * the sheet) heavier, farther lighter. Returns { weight (0..1 pressure share), widthScale }.
 */
export function structureWeight(r, heightMm) {
  const [w, s] = r.pass === 1 ? [1, 1.6] : r.pass === 2 && r.role === 'outline' ? [0.9, 1.3] : r.pass === 2 ? [0.75, 1] : [0.6, 0.8];
  const y = r.points.reduce((a, p) => a + p[1], 0) / r.points.length, near = 0.85 + 0.3 * Math.min(1, Math.max(0, y / heightMm));
  return { weight: Math.min(1, w * near), widthScale: s * near };
}

/**
 * The growth order (how people start a drawing): 1. a few long light placement lines of the biggest masses; 2. growth from
 * the main form outward, each form's outline before its divisions, the next stroke the cheapest by hop plus distance from
 * the main form, so the drawn extent widens steadily; 3. development: fine detail the same way, then texture and hatching,
 * small things last; 4. emphasis: the main contours restated heavier. Each stroke carries `phase` (layin, growth, detail,
 * texture, emphasis); weight builds over time (growthWeight).
 */
function growthOrder({ joined, objects, main, byObj, c, heightMm, widthMm, start }) {
  const out = [], live = joined.filter(s => !s.taken);
  for (const s of live) s.len = s.len ?? pathLength(s.points);
  // the drawing grows from the main form; when the lines close off no sizeable form (a dog's open coat), from the middle of
  // the drawn line itself (its length-weighted centre)
  const sizeable = main.id != null && main.area >= c.mainShare * widthMm * heightMm;
  const centre = (() => {
    if (sizeable) { const P = (byObj.get(main.id) ?? []).flatMap(s => s.points); if (P.length) return [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length]; }
    let x = 0, y = 0, w = 0; for (const s of live) for (let k = 1; k < s.points.length; k++) { const a = s.points[k - 1], b = s.points[k], L = dist(a, b); x += L * (a[0] + b[0]) / 2; y += L * (a[1] + b[1]) / 2; w += L; }
    return w ? [x / w, y / w] : [widthMm / 2, heightMm / 2];
  })();
  // a stroke's distance from the main form is its farthest point's: a long line that runs out to the sheet's edge waits until
  // the drawing has grown that far, so the drawn extent widens steadily; the hop to it is to its nearer end
  for (const s of live) { s.rad = Math.max(...resample(s.points, 2).map(q => dist(centre, q))); }
  const rad = s => s.rad, cost = (pen, s) => Math.min(dist(pen, s.points[0]), dist(pen, s.points.at(-1))) + c.growthPull * rad(s);
  let pen = start;
  // the drawing's ordinary line width (length-weighted median): a line drawn over 1.25 times it is a heavy line, drawn at
  // most at the ordinary weight when it is laid and restated at its full weight as an accent at the end
  const heftMid = (() => { const W = live.filter(s => s.heft != null).map(s => [s.heft, s.len]).sort((a, b) => a[0] - b[0]), T = W.reduce((a, w) => a + w[1], 0); let k = 0; for (const [w, L] of W) { k += L; if (k >= T / 2) return w; } return 1; })();
  const emph = new Set(c.emphasisShare > 0 ? live.filter(s => !s.skip && (s.role === 'outline' || s.role === 'inner') && s.len >= c.fineMm && (s.heft ?? 0) >= 1.25 * heftMid) : []);
  const take = (s, phase) => { out.push({ parts: s.parts, points: s.points, object: s.object, role: s.role, phase, pass: phase === 'layin' ? 1 : phase === 'growth' ? 2 : 3, major: s.object === main.id || s.len >= c.majorMm, heavy: emph.has(s), unit: s.unit, contribution: s.contribution }); pen = s.points[s.points.length - 1]; };
  // OBJECT BY OBJECT: the unit of work is an object (a thing the lines close off, taken as the largest enclosing thing under
  // unitShare of the sheet, so a window with its panes is one unit and the wall round it is not); once begun, the hand finishes the unit's eligible strokes before
  // moving on (leaving costs objectStickMm), and the next unit is the nearest unfinished one
  const unitOf = s => { let k = s.object; if (k == null || k < 0 || !objects[k]) return -1; while (objects[k].parent != null && objects[objects[k].parent].area < c.unitShare * widthMm * heightMm) k = objects[k].parent; return objects[k].area < c.unitShare * widthMm * heightMm ? k : -1; };
  for (const s of live) s.unit = unitOf(s);
  const unitRad = new Map(); for (const s of live) if (s.unit >= 0) unitRad.set(s.unit, Math.min(unitRad.get(s.unit) ?? Infinity, s.rad));
  const walk = (list, phase, gate = () => true, after = () => {}, lag = () => 0) => {
    const left = new Set(list), remain = new Map(); let cur = null;
    for (const s of left) remain.set(s.unit, (remain.get(s.unit) ?? 0) + 1);
    // inside the unit in hand the outward pull is the unit's own (its nearest line's), so the unit is finished across;
    // leaving it while it has work left costs objectStickMm
    const stick = s => (cur == null || cur < 0 ? 0 : s.unit === cur ? c.growthPull * (unitRad.get(cur) - s.rad) : remain.get(cur) > 0 ? c.objectStickMm : 0);
    while (left.size) {
      let best = null, bc = Infinity;
      for (const s of left) { if (!gate(s)) continue; const k = cost(pen, s) + lag(s, cur) + stick(s); if (k < bc) { bc = k; best = s; } }
      if (!best) for (const s of left) { const k = cost(pen, s) + lag(s); if (k < bc) { bc = k; best = s; } }
      left.delete(best); remain.set(best.unit, remain.get(best.unit) - 1); cur = best.unit;
      best.taken = true; after(best); take(best, typeof phase === 'function' ? phase(best) : phase);
    }
  };
  const nearest = (list, phase) => { const left = new Set(list); while (left.size) { let b = null; for (const s of left) if (!b || dist(pen, s.points[0]) < dist(pen, b.points[0])) b = s; left.delete(b); take(b, phase); } };
  // 1. lay-in: the longest smooth lines of the biggest masses, light (drawn again at their weight in growth)
  const big = live.filter(s => (s.role === 'outline' || s.role === 'inner') && s.len >= c.structureMm && turningPerMm(s.points) <= 6).sort((a, b) => b.len - a.len).slice(0, c.layIn);
  if (big.length) pen = big.reduce((a, b) => (rad(a) <= rad(b) ? a : b)).points[0];
  nearest(big, 'layin');
  // 2. growth from the main form: outlines and divisions (fineMm and longer); an object's inner lines once its outline is down
  const structural = live.filter(s => (s.role === 'outline' && s.len >= c.fineMm) || (s.role === 'inner' && s.len >= c.structInnerMm));
  const outlineLeft = new Map(); for (const s of structural) if (s.role === 'outline') outlineLeft.set(s.object, (outlineLeft.get(s.object) ?? 0) + 1);
  if (big.length) pen = big.reduce((a, b) => (rad(a) <= rad(b) ? a : b)).points[0];
  // hard rules: a child's outline waits for its parent's outline to be closed; an object's inner lines wait for its own
  // (only a parent the size of a thing holds its contents back: the sheet-wide forms, a whole wall, do not, or no detail
  // could start until every one of their lines across the sheet was down)
  const parentOpen = s => { let p = objects[s.object]?.parent; while (p != null && objects[p].area < c.unitShare * widthMm * heightMm) { if (outlineLeft.get(p) > 0) return true; p = objects[p].parent; } return false; };
  // 3. development rides on the growth: an area's shorter lines (detail) are laid as the growth passes it, a little behind
  // its structure (detailLagMm counted onto their cost), so the drawing is worked outward from the main form instead of
  // being staked out over the whole sheet first; texture and hatching wait for the end
  const isStruct = new Set(structural);
  // short marks (under tickMm) are not part of the sweep: they come once the whole structure is down, before the texture
  const detailAll = live.filter(s => !s.taken && !isStruct.has(s) && (s.role === 'outline' || s.role === 'inner' || s.role === 'fine'));
  const detail = detailAll.filter(s => s.len >= c.tickMm), short = detailAll.filter(s => s.len < c.tickMm);
  // a detail line waits until the structure has grown past it: it lies wholly within the frontier (the farthest reach of the
  // structure drawn so far)
  let frontier = 0;
  walk([...structural, ...detail], s => (isStruct.has(s) ? 'growth' : 'detail'),
    s => (s.role === 'outline' && isStruct.has(s) ? !parentOpen(s) : !(outlineLeft.get(s.object) > 0) && !parentOpen(s) && (isStruct.has(s) || s.rad <= frontier)),
    s => { if (isStruct.has(s)) frontier = Math.max(frontier, s.rad); if (s.role === 'outline' && isStruct.has(s)) outlineLeft.set(s.object, outlineLeft.get(s.object) - 1); },
    // detail in the object in hand is laid with it (no lag): an object is finished, structure and detail, before its neighbour
    (s, cur) => (isStruct.has(s) || (s.unit >= 0 && s.unit === cur) ? 0 : c.detailLagMm));
  walk(short, 'detail');
  const runs = new Map(); for (const s of live) if (!s.taken && s.role === 'hatch') { if (!runs.has(s.run)) runs.set(s.run, []); runs.get(s.run).push(s); }
  const items = [...live.filter(s => !s.taken && (s.role === 'texture' || s.role === 'fill')).map(s => ({ s })), ...[...runs.values()].map(m => ({ m }))];
  while (items.length) {
    const d = x => (x.s ? cost(pen, x.s) : Math.min(...x.m.map(s => cost(pen, s))));
    let b = 0; for (let k = 1; k < items.length; k++) if (d(items[k]) < d(items[b])) b = k;
    const x = items.splice(b, 1)[0];
    for (const s of x.s ? [x.s] : x.m) { s.taken = true; take(s, 'texture'); }
  }
  walk(live.filter(s => !s.taken), 'texture');
  // 4. emphasis: the lines the drawing draws heavy (emph, laid at the ordinary width so far) restated at their own full
  // width; with none, the longest outlines of the main form and the foreground (emphasisShare of the strokes)
  const key = s => Math.min(s.len, c.accentMm) * ((s.heft ?? 1) / heftMid) ** 2 * (s.object === main.id ? 1.5 : 1) * (0.6 + s.points[0][1] / heightMm);
  const pool = emph.size ? [...emph] : structural.filter(s => s.role === 'outline').sort((a, b) => key(b) - key(a)).slice(0, Math.round(c.emphasisShare * out.length));
  nearest(pool, 'emphasis');
  // worked area by area: each thing finished with its own detail and texture before the hand moves outward (area-order.mjs)
  const worked = byArea(out, { centre, mainUnit: sizeable ? main.id : null });
  worked.dropped = joined.filter(s => s.dropped).length;
  return worked;
}

/**
 * Weight over a growth replay, from the drawing: every line ends at the drawing's own width and darkness. The lay-in is faint
 * and fine (it is drawn again in growth); structure, detail and texture are laid at their drawn width and weight as they
 * come, except the lines the drawing draws heavy (`heavy`), which are laid at the ordinary width first and restated at their
 * own full width as accents at the end: the weight builds, and the finished drawing has the drawing's weights.
 * With the stroke's traced width `width` and the drawing's ordinary width `mid`. Returns { weight, widthScale }.
 */
export function growthWeight(r, drawn = 1, { width, mid } = {}) {
  const weight = r.phase === 'layin' ? 0.35 * drawn : drawn;
  if (!(width > 0 && mid > 0)) return { weight: Math.min(1, weight), widthScale: r.phase === 'layin' ? 0.5 : 1 };
  const target = r.phase === 'layin' ? 0.5 * Math.min(width, mid) : r.heavy && r.phase !== 'emphasis' ? Math.max(mid, 0.75 * width) : width;
  return { weight: Math.min(1, weight), widthScale: target / width };
}

/** Hand travel between consecutive strokes (end of one to start of the next). */
function handTravel(ordered) {
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
