// The drawing laid in phases with the painting, as a person works: a light lay-in of the big forms before the first
// washes, then each later line just before the wash that needs it, on dry paper; detail no wash claims with the last
// stage. Decided from the drawing's own data (its lines' passes and paths) and the wash plan's own (each wash's stage,
// the cells it covers, whether it is laid into a wet bed); nothing here knows the subject.
//
// A PENCIL drawing is a lay-in under the washes, so Auto phases it:
//   - the lay-in lines (pass 0) go down before the first wash;
//   - a line on the edge of a wash (most of it within EDGE_MM of the wash's border) places that wash: it goes down
//     before it, or before the first washes when that wash is one of them;
//   - a line inside a later stage's wash (not on any edge) goes down before the first later wash that covers it;
//   - a line no later wash claims: a placing line (pass 1 or 2: outlines, inner structure) before the first washes,
//     detail (small marks, hatching, tone, texture, accents) with the last stage, before its first wash.
//   A line due before a wash that is laid into a wet bed goes down at the last wash before it laid on dry paper.
// A PEN drawing is pen-led: a penman inks the whole drawing, lets it set, then washes over it. Auto lays all of it
// before the first wash.
// An author may time any line: `when` 'before' (before the first wash), 'stage N' (with stage N: just before the first
// wash of that stage that claims it, else before that stage's first wash), or 'auto' (Auto's timing, as above; a line
// with no `when` is timed as Auto times it). Pure.
import { passOf } from './drawing-film.mjs';

/** How near a wash's border a line lies to be drawing that border (mm): a pencil line placed for a wash edge. */
export const EDGE_MM = 1.5;

/** A line's `when`: {auto} | {before} | {stage: N}. Throws on anything else. */
export function parseWhen(w) {
  if (w == null || w === 'auto') return { auto: true };
  if (w === 'before') return { before: true };
  const m = /^stage (\d+)$/.exec(String(w));
  if (m) return { stage: Number(m[1]) };
  throw new Error(`drawing phases: a line's "when" is "before", "stage N" or "auto", not ${JSON.stringify(w)}`);
}

/**
 * Which strokes a wash claims: for each stroke {edge, inside}, from the wash's cells. `test(i)` says whether plan cell
 * i is the wash's, `box` {x0, y0, x1, y1} bounds its cells; strokes are [{points: [[x, y] in cells]}]; `r` is EDGE_MM
 * in cells. A point is on the edge when the square of side 2r+1 round it holds cells of the wash and cells not of it,
 * inside when it holds any of the wash's; a stroke is either when most of its points are. Returns [{edge, inside}].
 */
export function washClaims(test, box, w, h, strokes, r) {
  const x0 = Math.max(0, box.x0 - r), y0 = Math.max(0, box.y0 - r), x1 = Math.min(w - 1, box.x1 + r), y1 = Math.min(h - 1, box.y1 + r);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, S = new Int32Array((bw + 1) * (bh + 1));
  // a summed-area table of the wash's cells over its box grown by r
  for (let y = 0; y < bh; y++) { let row = 0; for (let x = 0; x < bw; x++) { row += test((y + y0) * w + x + x0) ? 1 : 0; S[(y + 1) * (bw + 1) + x + 1] = S[y * (bw + 1) + x + 1] + row; } }
  const count = (ax, ay, bx, by) => S[(by + 1) * (bw + 1) + bx + 1] - S[ay * (bw + 1) + bx + 1] - S[(by + 1) * (bw + 1) + ax] + S[ay * (bw + 1) + ax];
  return strokes.map(s => {
    let edge = 0, inside = 0;
    for (const [px, py] of s.points) {
      const cx = Math.round(px), cy = Math.round(py);
      if (cx < x0 - r || cx > x1 + r || cy < y0 - r || cy > y1 + r) continue;
      // the window clipped to the sheet: cells off the sheet are neither the wash's nor beside it
      const ax = Math.max(0, cx - r), ay = Math.max(0, cy - r), bx = Math.min(w - 1, cx + r), by = Math.min(h - 1, cy + r);
      const all = (bx - ax + 1) * (by - ay + 1), qx0 = Math.max(ax, x0), qy0 = Math.max(ay, y0), qx1 = Math.min(bx, x1), qy1 = Math.min(by, y1);
      const k = qx0 <= qx1 && qy0 <= qy1 ? count(qx0 - x0, qy0 - y0, qx1 - x0, qy1 - y0) : 0;
      if (k > 0) inside++;
      if (k > 0 && k < all) edge++;
    }
    const n = s.points.length || 1;
    return { edge: edge * 2 > n, inside: inside * 2 > n };
  });
}

/**
 * When each line goes down. `strokes` [{seq, pass?, part?, phase?, when?}]; `washes` in painting order, each
 * {stage, dry (laid on dry paper, not into a wet bed), claims: [{edge, inside}] by stroke index}; `penLed`: the drawing
 * is a pen drawing. Returns {at: [index of the wash each stroke goes down before, -1 the first washes, washes.length
 * after the last], why: [one phrase a stroke], warnings}.
 */
export function scheduleLines(strokes, washes, { penLed = false } = {}) {
  const n = washes.length, at = new Array(strokes.length), why = new Array(strokes.length), warnings = [];
  const first = n ? washes[0].stage : 0, last = n ? Math.max(...washes.map(q => q.stage)) : 0;
  const before = (k, said) => [k, said];
  // the last wash at or before k laid on dry paper: a line is never drawn into a wet bed
  const dryAt = k => { for (let j = k; j >= 0; j--) if (washes[j].dry) return j; return -1; };
  const firstOfStage = (N, i) => {
    const claimed = washes.findIndex((q, k) => q.stage === N && (q.claims[i].edge || q.claims[i].inside));
    if (claimed >= 0) return before(claimed, `stage ${N}, its first wash over the line`);
    const any = washes.findIndex(q => q.stage === N);
    if (any >= 0) return before(any, `stage ${N}, its first wash`);
    const later = washes.findIndex(q => q.stage > N);
    if (later >= 0) { warnings.push(`stage ${N} has no wash in this plan: line ${strokes[i].seq} is drawn with the next stage, ${washes[later].stage}`); return before(later, `stage ${N} (none in the plan): the next stage`); }
    warnings.push(`stage ${N} has no wash in this plan: line ${strokes[i].seq} is drawn after the last wash`);
    return before(n, `stage ${N} (none in the plan): after the washes`);
  };
  strokes.forEach((s, i) => {
    const w = parseWhen(s.when);
    let k, said;
    if (w.before || !n) [k, said] = [-1, w.before ? 'before the washes, as chosen' : 'no washes'];
    else if (w.stage != null) [k, said] = firstOfStage(w.stage, i);
    else if (penLed) [k, said] = [-1, 'a pen drawing: inked whole before the washes'];
    else if (passOf(s) === 0) [k, said] = [-1, 'the lay-in'];
    else {
      const e = washes.findIndex(q => q.claims[i].edge);
      const c = washes.findIndex(q => q.stage > first && q.claims[i].inside);
      if (e >= 0) [k, said] = washes[e].stage === first ? [-1, 'the edge of a first wash'] : [e, 'the edge of its wash'];
      else if (c >= 0) [k, said] = [c, 'inside a later wash'];
      else if (passOf(s) <= 2) [k, said] = [-1, 'a placing line no later wash claims'];
      else if (last === first) [k, said] = [-1, 'detail; the plan has one stage'];
      else [k, said] = [washes.findIndex(q => q.stage === last), 'detail no wash claims: with the last stage'];
    }
    if (k >= 0 && k < n) { const d = dryAt(k); if (d !== k) { said += d < 0 ? '; its wash goes into a wet bed: before the first washes' : '; its wash goes into a wet bed: at the last dry paper before it'; k = d; } }
    // a line due before one of the first washes is part of the lay-in
    if (k >= 0 && k < n && washes[k].stage === first && parseWhen(s.when).stage == null) { k = -1; }
    at[i] = k; why[i] = said;
  });
  return { at, why, warnings };
}

/** The scheduled lines grouped: {opening: [stroke], phases: [{at, strokes}] in painting order}. */
export function groupPhases(strokes, at) {
  const opening = [], by = new Map();
  strokes.forEach((s, i) => { if (at[i] < 0) opening.push(s); else { if (!by.has(at[i])) by.set(at[i], []); by.get(at[i]).push(s); } });
  return { opening, phases: [...by.entries()].sort((a, b) => a[0] - b[0]).map(([k, list]) => ({ at: k, strokes: list })) };
}
