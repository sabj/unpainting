// The drawing as a hand lays it, for the film: a prepared drawing's vector strokes carry their order (seq: big forms
// first, detail last, tools/seg/order-strokes.mjs and form-order) and are laid in it, a few at a time, with a frame of
// the film after each few, so the drawing is seen being drawn. The cuts are at equal shares of the hand's time: a
// stroke takes its own length and a lift and move to it, so a frame holds one long contour or many short hatches.
// What is laid is the same as in one step: the darker holds where strokes meet, whatever the batches.

/** The lift and move between two strokes, as millimetres of line drawn in the same time. */
const LIFT_MM = 4;

/** A stroke's length (mm): its drawn path, or for a filled shape half its outline. */
export function strokeLengthMm(s) {
  const along = P => { let d = 0; for (let k = 1; k < P.length; k++) d += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); return d; };
  if (s.path?.length > 1) return along(s.path);
  return (s.outline ?? []).reduce((a, ring) => a + (ring.length > 1 ? along([...ring, ring[0]]) / 2 : 0), 0);
}

/** The hand's time over a list of strokes, in millimetres of line (each stroke its length and one lift). */
export const drawingTimeMm = (strokes, liftMm = LIFT_MM) => strokes.reduce((a, s) => a + strokeLengthMm(s) + liftMm, 0);

/** The pass a stroke belongs to when its file gives none, from the part of the drawing it is. */
const PART_PASS = Object.freeze({ outline: 1, inner: 2, small: 3, fill: 3, hatch: 4, tone: 5, texture: 5 });

/**
 * The strokes as a hand draws a whole sheet: big forms first, detail last. The drawing's passes in turn over the whole
 * sheet (1 the outlines that place each form, then its inner structure, the small detail, hatching, tone and texture,
 * accents last: a stroke's `pass`, else its `part`), and within a pass the forms from the largest to the smallest (a
 * form is the stroke's `object`, its size the span of all its strokes); while a form is placed its outline comes first
 * and its long strokes before its short ones, and its shading and texture keep the file's own order.
 * A file ordered form by form finishes one ear with its shading before the head is placed; this never does. Which
 * strokes are laid does not change, only when. Returns a new list.
 */
export function bigFormsFirst(strokes) {
  const box = new Map();
  for (const s of strokes) {
    const b = box.get(s.object) ?? [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of (s.path?.length ? s.path : (s.outline ?? []).flat())) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    box.set(s.object, b);
  }
  const size = o => { const b = box.get(o); return b && b[2] >= b[0] ? Math.hypot(b[2] - b[0], b[3] - b[1]) : 0; };
  // (the lay-in lines that place the whole subject come before any form's own outline)
  const pass = s => (s.phase === 'layin' ? 0 : Number.isFinite(s.pass) ? s.pass : PART_PASS[s.part] ?? 3);
  // while a form is being placed (its outline and inner structure) its long strokes come first, the outline before the
  // rest; shading and texture keep the file's order, which works across a form patch by patch
  const placing = s => pass(s) <= 2, lead = s => (placing(s) ? (s.part === 'outline' ? 0 : 1) : 0), long = s => (placing(s) ? -strokeLengthMm(s) : 0);
  return [...strokes].sort((a, b) => pass(a) - pass(b) || size(b.object) - size(a.object) || (a.object ?? 0) - (b.object ?? 0) || lead(a) - lead(b) || long(a) - long(b) || a.seq - b.seq);
}

/**
 * The strokes in drawing order (seq, or as given with `given`), cut into at most `frames` batches at equal shares of the hand's time; no batch is
 * empty, and a stroke longer than a share is a batch by itself. Returns [{ strokes, done }] where `done` is the share of the drawing's time laid once the batch is down.
 */
export function drawingBatches(strokes, frames, { liftMm = LIFT_MM, given = false } = {}) {
  const S = given ? [...strokes] : [...strokes].sort((a, b) => a.seq - b.seq), n = Math.max(1, Math.min(S.length, Math.round(frames) || 1));
  if (!S.length) return [];
  const total = drawingTimeMm(S, liftMm), out = [];
  let cur = [], t = 0, next = total / n;
  for (const [i, s] of S.entries()) {
    cur.push(s); t += strokeLengthMm(s) + liftMm;
    // the batch closes when the time laid reaches the next share; a long stroke that runs through several shares takes
    // their frames with it (the film shows it once, whole), so the strokes after it are not hurried out one a frame
    if (i === S.length - 1 || t >= next - 1e-9) { out.push({ strokes: cur, done: t / total }); cur = []; next = (Math.floor(t / (total / n) + 1e-9) + 1) * total / n; }
  }
  return out;
}
