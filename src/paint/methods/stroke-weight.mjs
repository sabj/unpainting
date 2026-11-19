// Pipeline: inking, stage 4 (hand plan). A pen stroke has one weight: the draughtsman decides how heavy a line is before
// the nib lands, and the pressure then rises, holds and lifts along it. The line file's per-point readings of the
// subject's line (width, darkness) are evidence for that one decision, never a profile the nib replays point by point.
// A stroke also has one direction of travel: at a sharp corner the pen lifts and a new stroke starts.

const median = v => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** The stroke's own width and darkness: the medians of its points' readings, or null where no point has one. */
export function strokeWeight(points) {
  return { width: median(points.map(q => q.width)), weight: median(points.map(q => q.weight)) };
}

/** The gesture with every point carrying the stroke's one width and weight (points with no reading are left alone). */
export function withStrokeWeight(g) {
  const { width, weight } = strokeWeight(g.points);
  if (width == null && weight == null) return g;
  return { ...g, ...(weight == null ? {} : { weight }), points: g.points.map(q => ({ ...q, ...(width == null || q.width == null ? {} : { width }), ...(weight == null || q.weight == null ? {} : { weight }) })) };
}

const lerp = (a, b, u) => { const out = { ...a, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; for (const k of ['width', 'weight']) if (a[k] != null && b[k] != null) out[k] = a[k] + (b[k] - a[k]) * u; return out; };

/**
 * A gesture cut where it turns a sharp corner, so each piece is one stroke in one direction.
 * The turn at a point is the angle between the chords reaching `span` cells back and ahead along the path; a local
 * maximum of at least `deg` degrees is a corner. A piece shorter than `spur` cells left at either end of the gesture by
 * a cut is a hook (the tracer rounding a junction into the next line) and is not drawn; pieces between two corners stay.
 * @returns the pieces (the gesture itself, unchanged, when it has no corner)
 */
export function splitAtCorners(g, { span = 3, deg = 60, spur = 4 } = {}) {
  const P = g.points, n = P.length;
  if (n < 3 || !(span > 0)) return [g];
  const s = [0]; for (let k = 1; k < n; k++) s.push(s[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y));
  const L = s[n - 1];
  if (!(L > 2 * span)) return [g];
  const at = d => { let k = 1; while (k < n - 1 && s[k] < d) k++; const seg = s[k] - s[k - 1]; return lerp(P[k - 1], P[k], seg > 0 ? (d - s[k - 1]) / seg : 0); };
  // the turn is read at the path's own vertices and, on long segments, between them
  const step = span / 3, stops = []; for (let d = span; d <= L - span + 1e-9; d += step) stops.push(d);
  for (let k = 1; k < n - 1; k++) if (s[k] >= span / 2 && s[k] <= L - span / 2) stops.push(s[k]);
  stops.sort((a, b) => a - b);
  const turn = d => {
    const reach = Math.min(span, d, L - d), a = at(d - reach), b = at(d), c = at(d + reach);
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y, m = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    return m > 0 ? Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / m))) * 180 / Math.PI : 0;
  };
  const turns = stops.map(turn), cuts = [];
  for (let i = 0; i < stops.length; i++) {
    if (turns[i] < deg) continue;
    let peak = true;
    for (let j = 0; j < stops.length; j++) if (j !== i && Math.abs(stops[j] - stops[i]) <= span && (turns[j] > turns[i] || (turns[j] === turns[i] && j < i))) { peak = false; break; }
    if (peak) cuts.push(stops[i]);
  }
  if (!cuts.length) return [g];
  const bounds = [0, ...cuts, L], pieces = [];
  for (let c = 0; c < bounds.length - 1; c++) {
    const a = bounds[c], b = bounds[c + 1], end = c === 0 || c === bounds.length - 2;
    if (end && b - a < spur) continue;
    const points = [at(a), ...P.filter((_, k) => s[k] > a + 1e-6 && s[k] < b - 1e-6), at(b)];
    pieces.push({ ...g, points, length: b - a });
  }
  return pieces.length ? pieces : [g];
}
