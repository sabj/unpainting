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

/**
 * The strokes in drawing order (seq), cut into at most `frames` batches at equal shares of the hand's time; no batch is
 * empty, and a stroke longer than a share is a batch by itself. Returns [{ strokes, done }] where `done` is the share of the drawing's time laid once the batch is down.
 */
export function drawingBatches(strokes, frames, { liftMm = LIFT_MM } = {}) {
  const S = [...strokes].sort((a, b) => a.seq - b.seq), n = Math.max(1, Math.min(S.length, Math.round(frames) || 1));
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
