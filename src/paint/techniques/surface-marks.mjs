// Surface marks: the brush marks a painter uses to say what a surface is made of, named by the plan on an area pass
// (`pass.marks` in an area plan, tools/painter/semantic-areas.mjs). The planner chooses the kind from what the subject
// shows; the painter never picks one by itself and reads no target pixels here.
//
//   short-coat   short, smooth fur: one flick per mark, pressed at the root and lifted to the tip, laid along the coat's
//                flow, a little spread in angle as hairs are.
//   curly-coat   curly fur or hair: small open crescents, each one turn of the wrist, in no single direction.
//   long-hair    long hair or a long coat: long strokes along the flow with a slow wave in them.
//   masonry      cut stone or brick: block hints in level courses, one flat-brush stroke per block, staggered by half a
//                block from course to course, laid sparsely, since a painter hints a wall rather than draws every stone.
//
// Every length is a multiple of the pass's own brush width (pass.brush.widthMm): the mark is what that brush makes in
// one movement. The plan supplies the flow line (short coat, long hair), the course angle (masonry), the share of the
// area the marks visit (cover) and where they go (placement): `edge` keeps them within two brush widths of the shape's
// edge, as painters suggest fur, hair or stone with a few marks at the silhouette of a mass that is otherwise one wash,
// never unit by unit across it; `whole` spreads them over the shape. Nothing has a default. Marks are kept only where the whole stroke lies inside the
// shape being painted. Pure geometry, DOM free.

export const SURFACE_MARKS = Object.freeze(['short-coat', 'curly-coat', 'long-hair', 'masonry']);
const NEEDS_FLOW = new Set(['short-coat', 'long-hair']);

// In brush widths. A flick is about four widths long; a long-hair stroke a dozen, with a wave of half a width every
// six; a crescent turns about two thirds of a circle on a radius of one and a half widths; a masonry course is one
// flat-brush width tall and a block one and a half to three courses long. Marks sit one width apart across the flow.
const FORM = Object.freeze({
  'short-coat': { length: 4, across: 1, along: 4, spread: 15 },
  'long-hair': { length: 12, across: 1.5, along: 12, spread: 6, wave: 0.5, waveLength: 6 },
  'curly-coat': { radius: 1.5, turn: 220, pitch: 3 },
  masonry: { course: 1, blockMin: 1.5, blockMax: 3, gap: 0.3 },
});

const fail = m => { throw new Error(`surface marks: ${m}`); };
const finite = x => typeof x === 'number' && Number.isFinite(x);
const point = p => Array.isArray(p) && p.length === 2 && p.every(v => finite(v) && v >= 0 && v <= 1);

/** Checks a plan's marks entry; throws with the reason. */
export function validateSurfaceMarks(marks, key = 'pass', { flowGiven = false } = {}) {
  if (!marks || typeof marks !== 'object' || Array.isArray(marks)) fail(`${key}.marks must be an object`);
  if (!SURFACE_MARKS.includes(marks.kind)) fail(`${key}.marks.kind must be one of ${SURFACE_MARKS.join(', ')}`);
  if (typeof marks.reason !== 'string' || !marks.reason.trim()) fail(`${key}.marks.reason required: what the subject shows there`);
  if (!finite(marks.cover) || marks.cover <= 0 || marks.cover > 1) fail(`${key}.marks.cover must be a share in (0, 1]`);
  if (!['edge', 'whole'].includes(marks.placement)) fail(`${key}.marks.placement must be edge or whole`);
  if (NEEDS_FLOW.has(marks.kind) && !flowGiven && (!Array.isArray(marks.flow) || marks.flow.length < 2 || !marks.flow.every(point)))
    fail(`${key}.marks.flow required for ${marks.kind}: two or more normalized points along the coat`);
  if (marks.kind === 'masonry' && (!finite(marks.courseAngleDeg) || Math.abs(marks.courseAngleDeg) > 45))
    fail(`${key}.marks.courseAngleDeg required for masonry: the courses' angle in degrees, -45 to 45`);
  return true;
}

// A small seeded generator, so a plan paints the same marks every run.
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };

// The flow's direction at a point: that of the nearest flow segment.
function flowAt_(flow, x, y) {
  let best = Infinity, dir = [1, 0];
  for (let k = 1; k < flow.length; k++) {
    const [ax, ay] = flow[k - 1], [bx, by] = flow[k], vx = bx - ax, vy = by - ay, n = vx * vx + vy * vy;
    const t = n ? Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / n)) : 0, d = (x - ax - t * vx) ** 2 + (y - ay - t * vy) ** 2;
    if (d < best) { best = d; const len = Math.hypot(vx, vy) || 1; dir = [vx / len, vy / len]; }
  }
  return dir;
}

/**
 * The marks for one shape, as brush paths.
 * @param marks    the plan's marks entry (validated)
 * @param mask     Uint8Array w * h: the shape on the plan grid
 * @param mmPerCell plan cell size in mm
 * @param brushMm  the pass's brush width in mm
 * @param toCell   ([nx, ny]) => [x, y] on the plan grid, for the plan's normalized flow points
 * @param scale    sheet cells per plan cell
 * @param seedKey  text that seeds the marks (the pass key)
 * @param flowAt   optional ([x, y]) => [dx, dy], the coat's growth direction at a plan cell, in place of the plan's flow line
 * @param weight   optional Float32Array w * h in 0..1: how much a mark is wanted at each cell (the cover is scaled by it)
 * @returns [[{x, y, r, p}]] in sheet cells
 */
export function surfaceMarkPaths(marks, { mask, w, h, mmPerCell, brushMm, toCell, scale = 1, seedKey = '', flowAt = null, weight = null }) {
  validateSurfaceMarks(marks, 'pass', { flowGiven: typeof flowAt === 'function' });
  if (!finite(brushMm) || brushMm <= 0 || !finite(mmPerCell) || mmPerCell <= 0) fail('brush width and cell size required');
  const W = brushMm / mmPerCell, f = FORM[marks.kind], rnd = rng(hash(`${marks.kind}:${seedKey}`)), r = W / 2;
  const flow = marks.flow && !flowAt ? marks.flow.map(toCell) : null;
  const direction = (x, y) => (flowAt ? flowAt(x, y) : flowAt === null && flow ? flowAt_(flow, x, y) : [1, 0]);
  const wanted = (x, y) => { if (!weight) return 1; const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < w && Y < h ? weight[Y * w + X] : 0; };
  const inside = (x, y) => { const X = Math.round(x), Y = Math.round(y); return X >= 0 && Y >= 0 && X < w && Y < h && mask[Y * w + X] === 1; };
  // a candidate centre is at the edge when some point two brush widths away lies outside the shape
  const nearEdge = (x, y) => { for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; if (!inside(x + 2 * W * Math.cos(a), y + 2 * W * Math.sin(a))) return true; } return false; };
  const placed = (x, y) => inside(x, y) && (marks.placement === 'whole' || nearEdge(x, y));
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) if (mask[i]) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return [];
  const out = [];
  const keep = pts => { if (pts.every(q => inside(q.x, q.y))) out.push(pts.map(q => ({ x: q.x * scale, y: q.y * scale, r: r * scale, p: q.p }))); };
  // a straight or waved stroke from (cx, cy) along (dx, dy), pressed at the root and lifted towards the tip
  const stroke = (cx, cy, dx, dy, len, wave = 0, waveLength = 1) => {
    const steps = Math.max(2, Math.ceil(len / Math.max(0.5, r))), nx = -dy, ny = dx, phase = rnd() * Math.PI * 2, pts = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, s = (t - 0.5) * len, o = wave ? wave * Math.sin(phase + 2 * Math.PI * s / waveLength) : 0;
      pts.push({ x: cx + dx * s + nx * o, y: cy + dy * s + ny * o, p: 1 - 0.7 * t });
    }
    return pts;
  };
  if (marks.kind === 'short-coat' || marks.kind === 'long-hair') {
    // a grid laid out across the bounding box; each cell of it is a candidate mark, kept at the plan's cover
    const across = f.across * W, along = f.along * W;
    for (let y = y0; y <= y1; y += across) for (let x = x0 + (rnd() * along); x <= x1; x += along) {
      if (rnd() >= marks.cover) continue;
      const cx = x + (rnd() - 0.5) * across, cy = y + (rnd() - 0.5) * across;
      if (!placed(cx, cy) || (weight && rnd() >= wanted(cx, cy))) continue;
      const [dx0, dy0] = direction(cx, cy), a = (rnd() - 0.5) * 2 * f.spread * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      keep(stroke(cx, cy, dx0 * ca - dy0 * sa, dx0 * sa + dy0 * ca, f.length * W, (f.wave ?? 0) * W, (f.waveLength ?? 1) * W));
    }
  } else if (marks.kind === 'curly-coat') {
    const pitch = f.pitch * W, R = f.radius * W, turn = f.turn * Math.PI / 180;
    for (let row = 0, y = y0; y <= y1; y += pitch * 0.866, row++) for (let x = x0 + (row % 2 ? pitch / 2 : 0); x <= x1; x += pitch) {
      if (rnd() >= marks.cover) continue;
      const cx = x + (rnd() - 0.5) * pitch * 0.5, cy = y + (rnd() - 0.5) * pitch * 0.5, start = rnd() * Math.PI * 2;
      if (!placed(cx, cy) || (weight && rnd() >= wanted(cx, cy))) continue;
      const steps = Math.max(4, Math.ceil(turn * R / Math.max(0.5, r))), pts = [];
      for (let k = 0; k <= steps; k++) { const t = k / steps, a = start + turn * t; pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), p: 1 - 0.6 * t }); }
      keep(pts);
    }
  } else {
    // masonry: courses along the plan's angle, blocks staggered by half a block per course
    const course = f.course * W, a = marks.courseAngleDeg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]], along = corners.map(([x, y]) => x * dx + y * dy), across = corners.map(([x, y]) => x * nx + y * ny);
    const u0 = Math.min(...along), u1 = Math.max(...along), v0 = Math.min(...across), v1 = Math.max(...across);
    for (let v = v0 + course / 2, k = 0; v <= v1; v += course, k++) {
      for (let u = u0 - (k % 2 ? f.blockMax * course / 2 : 0); u <= u1;) {
        const len = (f.blockMin + rnd() * (f.blockMax - f.blockMin)) * course, mid = u + len / 2;
        const cx = mid * dx + v * nx, cy = mid * dy + v * ny;
        if (rnd() < marks.cover && placed(cx, cy) && (!weight || rnd() < wanted(cx, cy))) {
          const run = Math.max(W, len - f.gap * W), pts = [];
          for (let s = 0, steps = Math.max(2, Math.ceil(run / Math.max(0.5, r))); s <= steps; s++) { const t = s / steps - 0.5; pts.push({ x: cx + dx * run * t, y: cy + dy * run * t, p: 1 }); }
          keep(pts);
        }
        u += len;
      }
    }
  }
  return out;
}
