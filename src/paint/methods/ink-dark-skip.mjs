// Pen lines are not drawn inside the plan's darkest washes (--inkdarkskip v): the wash already states that edge, and a
// line under or over a near-black mass reads as clutter. Each gesture is cut where the planned value (0 paper, 1 the
// target's darkest) is above v; the runs outside it are kept when they still have two points. Planning only: the
// values are the plan's, read before painting.

/**
 * @param {{points: {x:number,y:number}[]}[]} gestures in plan cells
 * @param {Float32Array} values planned value per plan cell, 0..1
 * @param {number} w plan width
 * @param {number} h plan height
 * @param {number} thr cut where the value is above this
 * @returns gestures split into the runs outside the dark washes, other fields copied
 */
export function cutInDarkWash(gestures, values, w, h, thr) {
  if (!(thr > 0 && thr < 1)) return gestures;
  const at = q => values[Math.min(h - 1, Math.max(0, Math.round(q.y))) * w + Math.min(w - 1, Math.max(0, Math.round(q.x)))];
  const out = [];
  for (const g of gestures) {
    let run = [];
    const flush = () => { if (run.length >= 2) out.push({ ...g, points: run, length: undefined }); run = []; };
    for (const q of g.points) { if (at(q) > thr) flush(); else run.push(q); }
    flush();
  }
  return out.map(g => { const { length, ...rest } = g; return rest; });
}
