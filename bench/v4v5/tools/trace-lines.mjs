// The tracer's line rules, used by trace-ink.mjs (it sits beside it so both are copied into a planning workspace).
// A pen follows the line it is on, carries no pixel staircase, lifts where the line turns back on itself, joins only
// where one piece continues another across the tracer's own gap, and goes on contours, not inside dark masses.
// Points are [x, y] in the target's pixels. No settable limit: the tolerances are the trace's own pixel and reach.

/** Thinned mask (1 = line pixel) to pixel chains (index arrays). From each end, and at a junction the walk takes the
 *  neighbour that best continues the direction of the last few pixels, so a crossing is walked straight through. */
export function walkChains(M, W, H) {
  const n = W * H, seen = new Uint8Array(n);
  const nb = i => { const x = i % W, y = (i / W) | 0, r = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && M[yy * W + xx]) r.push(yy * W + xx); } return r; };
  const walk = s => {
    const path = [s]; seen[s] = 1; let c = s;
    for (;;) {
      const next = nb(c).filter(j => !seen[j]);
      if (!next.length) break;
      if (next.length > 1 && path.length >= 2) {
        const b = path[Math.max(0, path.length - 4)], dx = c % W - b % W, dy = ((c / W) | 0) - ((b / W) | 0), m = Math.hypot(dx, dy) || 1;
        const along = k => { const ex = k % W - c % W, ey = ((k / W) | 0) - ((c / W) | 0); return (ex * dx + ey * dy) / (m * Math.hypot(ex, ey)); };
        next.sort((i, j) => along(j) - along(i));
      }
      c = next[0]; seen[c] = 1; path.push(c);
    }
    return path;
  };
  const chains = [];
  for (let i = 0; i < n; i++) if (M[i] && nb(i).length === 1 && !seen[i]) chains.push(walk(i));
  for (let i = 0; i < n; i++) if (M[i] && !seen[i]) chains.push(walk(i));
  return chains;
}

/** Douglas-Peucker: drop points within `tol` pixels of the chord. At one pixel this removes the thinning's staircase,
 *  which is the trace's sampling, not a direction the pen took. */
export function simplify(P, tol = 1) {
  if (P.length < 3) return P;
  const a = P[0], b = P.at(-1), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let k = -1, dm = 0;
  for (let i = 1; i < P.length - 1; i++) {
    const d = L > 1e-9 ? Math.abs((b[0] - a[0]) * (a[1] - P[i][1]) - (a[0] - P[i][0]) * (b[1] - a[1])) / L : Math.hypot(P[i][0] - a[0], P[i][1] - a[1]);
    if (d > dm) { dm = d; k = i; }
  }
  return dm > tol ? [...simplify(P.slice(0, k + 1), tol).slice(0, -1), ...simplify(P.slice(k), tol)] : [a, b];
}

/** Split a line where it turns back on itself (more than a right angle between consecutive segments): a pen lifts
 *  there, so a zigzag is several strokes, each judged on its own. */
export function splitAtTurns(P) {
  const out = []; let cur = [P[0]];
  for (let j = 1; j < P.length; j++) {
    cur.push(P[j]);
    if (j < P.length - 1) {
      const ax = P[j][0] - P[j - 1][0], ay = P[j][1] - P[j - 1][1], bx = P[j + 1][0] - P[j][0], by = P[j + 1][1] - P[j][1];
      if (ax * bx + ay * by < 0) { out.push(cur); cur = [P[j]]; }
    }
  }
  out.push(cur);
  return out;
}

const unit = (x, y) => { const m = Math.hypot(x, y); return m > 1e-9 ? [x / m, y / m] : [1, 0]; };

/** Join pieces where the end of one points at the start of another across at most `gap` pixels, with tangents that
 *  agree (cos) and a gap that lies along both (aim): the painter's hand gates (drawing-hand.mjs, 0.8 and 0.7). A piece
 *  meeting another at a corner, or lying beside it, is not joined. */
export function joinPieces(pieces, { gap, cos = 0.8, aim = 0.7 } = {}) {
  let items = pieces.filter(P => P.length >= 2).map(P => P.slice());
  for (let changed = true; changed;) {
    changed = false;
    let best = null;
    const end = (P, atStart) => { const p = atStart ? P[0] : P.at(-1), q = atStart ? P[1] : P.at(-2); return { p, t: unit(p[0] - q[0], p[1] - q[1]) }; };
    for (let a = 0; a < items.length; a++) for (let b = 0; b < items.length; b++) {
      if (a === b) continue;
      for (const sa of [false, true]) for (const sb of [true, false]) {
        const A = end(items[a], sa), B = end(items[b], sb), dx = B.p[0] - A.p[0], dy = B.p[1] - A.p[1], d = Math.hypot(dx, dy);
        if (d > gap) continue;
        if (-(A.t[0] * B.t[0] + A.t[1] * B.t[1]) < cos) continue;
        if (d > 1e-9) { const u = [dx / d, dy / d]; if (Math.min(A.t[0] * u[0] + A.t[1] * u[1], -(B.t[0] * u[0] + B.t[1] * u[1])) < aim) continue; }
        if (!best || d < best.d) best = { a, b, sa, sb, d };
      }
    }
    if (best) {
      const A = best.sa ? items[best.a].slice().reverse() : items[best.a], B = best.sb ? items[best.b] : items[best.b].slice().reverse();
      items = items.filter((_, i) => i !== best.a && i !== best.b).concat([[...A, ...B]]);
      changed = true;
    }
  }
  return items;
}

/** Whether the line is a contour: on at least half its points one side, `reach` pixels out across it, is lighter than
 *  the middle of the subject's value scale (`mid`). A line with dark on both sides lies inside a dark mass, where the
 *  wash states the form; ink there is shadow or texture rewritten as line. `at(x, y)` is luminance 0..1. */
export function hasLightSide(P, at, mid, reach = [3, 4]) {
  const pts = [];
  for (let j = 1; j < P.length; j++) { const L = Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]), k = Math.max(1, Math.ceil(L)); for (let s = 0; s < k; s++) pts.push([P[j - 1][0] + (P[j][0] - P[j - 1][0]) * s / k, P[j - 1][1] + (P[j][1] - P[j - 1][1]) * s / k, P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]]); }
  if (!pts.length) return false;
  let lit = 0;
  for (const [x, y, dx, dy] of pts) {
    const [tx, ty] = unit(dx, dy), nx = -ty, ny = tx;
    const side = s => Math.max(...reach.map(r => at(Math.floor(x + s * nx * r), Math.floor(y + s * ny * r))));
    if (Math.max(side(1), side(-1)) > mid) lit++;
  }
  return lit >= pts.length / 2;
}
