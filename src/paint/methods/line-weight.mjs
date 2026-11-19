// Pipeline: drawing, stage 2 (measure the lines).
// A drawn line's weight follows the subject's own line there. Each line of the graphite drawing is read against the target:
// how many L* darker the subject is along it than on both of its sides. The pencil then presses so that its own line, on
// bare paper, is that many L* darker than the paper, by a table drawn on a scrap of the painting's paper
// (pencil-scrap.mjs). A dark whisker is drawn dark; a line the subject does not show keeps the light pressure of a
// preparatory drawing. The match is made on bare paper: a wash over the line hides some of it, a dark wash most of it,
// so under paint the pencil's line is lighter than the subject's, never darker.
//
// The reading is made at line scale: one darkness for a whole line, the median along it, so at least half of the line is
// that dark, as a line is kept or left off whole. Across the path the darkest value within `reachMm` is the line (the
// tracer and the fairing may sit that far off it), and it is compared with the darker of its two sides, so the dark side
// of a tonal edge with no line on it reads as no line.
//
// Pure: arrays in, numbers out. Coordinates are the plane's pixels; L is CIE L* (0..100).

/** The pressure of a line the subject shows no darker line under: the light opening pressure of the graphite drawing. */
export const LIGHT_PRESSURE = 0.35;
/** How far off a traced line the subject's own line may lie: the fairing's 0.4 mm (line-fair.mjs). */
const REACH_MM = 0.4;
/** The band beside the line that is read as its side, starting clear of a line 0.8 mm wide. */
const SIDE_MM = [0.4, 0.9];
/** The length of line the profile across it is averaged over: grain cancels, a line stands. */
const RUN_MM = 2;

const xy = p => (Array.isArray(p) ? p : [p.x, p.y]);
const median = v => { const s = Float64Array.from(v).sort(); return s.length ? s[s.length >> 1] : 0; };

function sample(P, w, h, x, y) {
  const fx = Math.max(0, Math.min(w - 1, x - 0.5)), fy = Math.max(0, Math.min(h - 1, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), u = fx - x0, v = fy - y0;
  return (P[y0 * w + x0] * (1 - u) + P[y0 * w + x1] * u) * (1 - v) + (P[y1 * w + x0] * (1 - u) + P[y1 * w + x1] * u) * v;
}

/** Points every `step` pixels along a polyline, with the unit normal there. */
function along(points, step) {
  const P = points.map(xy), out = [];
  for (let k = 1; k < P.length; k++) {
    const [ax, ay] = P[k - 1], [bx, by] = P[k], L = Math.hypot(bx - ax, by - ay);
    if (!(L > 0)) continue;
    const nx = -(by - ay) / L, ny = (bx - ax) / L, m = Math.max(1, Math.round(L / step));
    for (let q = k === 1 ? 0 : 1; q <= m; q++) out.push([ax + (bx - ax) * q / m, ay + (by - ay) * q / m, nx, ny]);
  }
  return out;
}

/**
 * How dark and how wide the plane's own line is along a path: { drop, on, side, widthMm }, each the median along the
 * path. The profile across the path is first averaged along `runMm` of the path, so a line, which runs on, stands and
 * the grain of a wash, which does not, cancels. `on` is the darkest L* of that profile within the reach, `side` the
 * darker of the two sides beside that point, `drop` their difference in L* (never below 0) and `widthMm` the width at
 * half that depth (NaN where there is no drop). `pxMm` is the size of a pixel in millimetres.
 */
export function lineDarkness(points, L, w, h, pxMm, { reachMm = REACH_MM, sideMm = SIDE_MM, runMm = RUN_MM } = {}) {
  const none = { drop: 0, on: NaN, side: NaN, widthMm: NaN };
  if (!(points?.length >= 2) || !(pxMm > 0)) return none;
  const step = Math.max(0.5, 0.1 / pxMm), cross = 0.5, reach = Math.max(1, Math.round(reachMm / pxMm / cross)), s0 = Math.max(reach + 1, Math.round(sideMm[0] / pxMm / cross)), s1 = Math.max(s0 + 1, Math.round(sideMm[1] / pxMm / cross));
  const P = along(points, step), n = P.length, span = reach + s1, m = 2 * span + 1;
  if (!n) return none;
  // the profile across the path at each point: L* at offsets of half a pixel, out to the far end of both sides
  const raw = new Float32Array(n * m);
  for (let k = 0; k < n; k++) { const [x, y, nx, ny] = P[k]; for (let j = 0; j < m; j++) { const d = (j - span) * cross; raw[k * m + j] = sample(L, w, h, x + d * nx, y + d * ny); } }
  const half = Math.max(0, Math.round(runMm / pxMm / step / 2)), D = [], ON = [], SIDE = [], W = [], prof = new Float32Array(m);
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - half), b = Math.min(n - 1, k + half);
    prof.fill(0); for (let i = a; i <= b; i++) for (let j = 0; j < m; j++) prof[j] += raw[i * m + j] / (b - a + 1);
    let on = Infinity, at = span;
    for (let j = span - reach; j <= span + reach; j++) if (prof[j] < on) { on = prof[j]; at = j; }
    const band = sign => { let s = 0; for (let j = s0; j <= s1; j++) s += prof[at + sign * j]; return s / (s1 - s0 + 1); };
    const side = Math.min(band(1), band(-1));
    ON.push(on); SIDE.push(side); D.push(Math.max(0, side - on));
    if (side - on > 0) {
      // the width at half depth: out from the darkest point each way to where the profile climbs halfway back to the side
      const mid = (on + side) / 2, out = sign => { for (let j = 1; j <= s0; j++) { const v = prof[at + sign * j], u = prof[at + sign * (j - 1)]; if (v >= mid) return j - 1 + (mid - u) / Math.max(1e-6, v - u); } return s0; };
      W.push((out(1) + out(-1)) * cross * pxMm);
    }
  }
  return { drop: median(D), on: median(ON), side: median(SIDE), widthMm: W.length ? median(W) : NaN };
}

/**
 * The pencil pressure whose scrap line is `drop` L* darker than its paper, from a table [{ pressure, drop }] rising in
 * both (pencil-scrap.mjs), by straight interpolation. Not below `floor`, and not above the table's firmest pressure:
 * a line darker than the pencil's firmest takes that pressure, and is not as dark as the subject's.
 */
export function pressureFor(drop, table, { floor = LIGHT_PRESSURE } = {}) {
  if (!Array.isArray(table) || table.length < 2) throw new Error('line weight: a pressure table of at least two rows');
  const top = table.at(-1).pressure, lo = Math.min(floor, top);
  if (!(drop > table[0].drop)) return lo;
  for (let k = 1; k < table.length; k++) {
    const a = table[k - 1], b = table[k];
    if (drop <= b.drop) return Math.max(lo, a.pressure + (b.pressure - a.pressure) * (drop - a.drop) / Math.max(1e-9, b.drop - a.drop));
  }
  return top;
}

/**
 * Strokes with the pressure their subject line asks for. A stroke carrying `subjectLine` { drop } whose pressure comes
 * out above the light one takes that pressure along its whole length, as `weight` and as each point's share `s`, and no
 * contact width of its own: a pencil pressed harder draws wider, by its profile. Every other stroke (a line the subject
 * does not show darker, or a plan's own line, which nobody measured) is drawn as before, at most the light pressure.
 * @returns {{ strokes, stats }} stats { strokes, weighed, light, beyond, firmest, pressures: [p10, p50, p90] of all strokes }
 */
export function weighStrokes(strokes, table, { floor = LIGHT_PRESSURE } = {}) {
  const top = table.at(-1), light = Math.min(floor, top.pressure), ps = [];
  let beyond = 0, weighed = 0;
  const out = strokes.map(g => {
    const drop = g.subjectLine?.drop, pressure = Number.isFinite(drop) ? pressureFor(drop, table, { floor }) : light;
    if (!(pressure > light)) { ps.push(light); return { ...g, weight: Math.min(light, g.weight ?? 1), points: g.points.map(p => (p.s == null ? p : { ...p, s: Math.min(light, p.s) })) }; }
    ps.push(pressure); weighed++; if (drop > top.drop) beyond++;
    return { ...g, weight: pressure, points: g.points.map(({ nw, width, weight, ...p }) => ({ ...p, s: pressure })) };
  });
  ps.sort((a, b) => a - b);
  const q = f => (ps.length ? +ps[Math.min(ps.length - 1, Math.floor(f * ps.length))].toFixed(3) : null);
  return { strokes: out, stats: { strokes: out.length, weighed, light: out.length - weighed, beyond, firmest: top.pressure, pressures: [q(0.1), q(0.5), q(0.9)] } };
}
