// Pen lines are not drawn inside the plan's darkest washes (--inkdarkskip v): the wash already states that edge, and a
// line under or over a near-black mass reads as clutter. Each gesture is cut where the planned value (0 paper, 1 the
// target's darkest) is above v; the runs outside it are kept when they still have two points. Planning only: the
// values are the plan's, read before painting.

const getX = q => Array.isArray(q) ? q[0] : (q?.x ?? NaN);
const getY = q => Array.isArray(q) ? q[1] : (q?.y ?? NaN);

function interpPoint(p0, p1, t) {
  const x0 = getX(p0), y0 = getY(p0), x1 = getX(p1), y1 = getY(p1);
  const x = x0 + (x1 - x0) * t;
  const y = y0 + (y1 - y0) * t;
  if (Array.isArray(p0)) return [x, y];
  const out = { ...p0, x, y };
  if ('r' in p0 && 'r' in p1) out.r = p0.r + (p1.r - p0.r) * t;
  if ('d' in p0 && 'd' in p1) out.d = p0.d + (p1.d - p0.d) * t;
  if ('width' in p0 && 'width' in p1) out.width = p0.width + (p1.width - p0.width) * t;
  if ('weight' in p0 && 'weight' in p1) out.weight = p0.weight + (p1.weight - p0.weight) * t;
  if ('nw' in p0 && 'nw' in p1) out.nw = p0.nw + (p1.nw - p0.nw) * t;
  if ('v' in p0 && 'v' in p1) out.v = p0.v + (p1.v - p0.v) * t;
  return out;
}

/**
 * @param {{points: ({x:number,y:number}|number[])[], widths?: number[], weights?: number[], dip?: boolean|number}[]} gestures in plan cells
 * @param {Float32Array|number[]} values planned value per plan cell, 0..1 (from ink-free wash plan)
 * @param {number} w plan width
 * @param {number} h plan height
 * @param {number} thr cut where the value is above this
 * @param {{ hysteresis?: number, minPoints?: number }} options
 * @returns gestures split into the runs outside the dark washes, other fields copied
 */
export function cutInDarkWash(gestures, values, w, h, thr, { hysteresis = 0.04, minPoints = 2 } = {}) {
  if (!(thr > 0 && thr < 1) || !gestures?.length || !values) return gestures;

  const at = q => {
    const x = getX(q), y = getY(q);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    const col = Math.min(w - 1, Math.max(0, Math.floor(x)));
    const row = Math.min(h - 1, Math.max(0, Math.floor(y)));
    return values[row * w + col];
  };

  const thrHigh = thr;
  const thrLow = Math.max(0.5 * thr, thr - (hysteresis ?? 0.04));
  const out = [];

  for (const g of gestures) {
    if (!g.points || g.points.length < 2) continue;
    const hasWidths = Array.isArray(g.widths) && g.widths.length === g.points.length;
    const hasWeights = Array.isArray(g.weights) && g.weights.length === g.points.length;
    let run = [];
    let runWidths = [];
    let runWeights = [];
    let isCutting = false;
    let firstEmitted = true;

    const flush = () => {
      if (run.length >= minPoints) {
        const frag = { ...g, points: run };
        delete frag.length;
        if (hasWidths) {
          frag.widths = runWidths.slice();
        }
        if (hasWeights) {
          frag.weights = runWeights.slice();
        }
        if ('dip' in g) {
          frag.dip = firstEmitted ? Boolean(g.dip) : false;
          firstEmitted = false;
        }
        out.push(frag);
      }
      run = [];
      runWidths = [];
      runWeights = [];
    };

    for (let k = 0; k < g.points.length; k++) {
      const q = g.points[k];
      const wVal = hasWidths ? g.widths[k] : undefined;
      const wtVal = hasWeights ? g.weights[k] : undefined;

      if (k === 0) {
        const val = at(q);
        if (val > thrHigh) {
          isCutting = true;
        } else {
          run.push(q);
          if (hasWidths) runWidths.push(wVal);
          if (hasWeights) runWeights.push(wtVal);
        }
        continue;
      }

      const prevQ = g.points[k - 1];
      const px = getX(prevQ), py = getY(prevQ), cx = getX(q), cy = getY(q);
      const dist = Math.hypot(cx - px, cy - py);
      const wPrev = hasWidths ? g.widths[k - 1] : undefined;
      const wtPrev = hasWeights ? g.weights[k - 1] : undefined;

      if (dist > 1.5) {
        // Multi-step interpolation along long segments
        const steps = Math.ceil(dist);
        let prevSample = prevQ;
        let prevSampleW = wPrev;
        let prevSampleWt = wtPrev;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const samplePt = interpPoint(prevQ, q, t);
          const sampleW = hasWidths ? wPrev + (wVal - wPrev) * t : undefined;
          const sampleWt = hasWeights ? wtPrev + (wtVal - wtPrev) * t : undefined;
          const sVal = at(samplePt);

          if (isCutting) {
            if (sVal < thrLow) {
              isCutting = false;
              run.push(samplePt);
              if (hasWidths) runWidths.push(sampleW);
              if (hasWeights) runWeights.push(sampleWt);
            }
          } else {
            if (sVal > thrHigh) {
              if (s > 1 && run.length > 0) {
                const lastPt = run[run.length - 1];
                if (Math.hypot(getX(lastPt) - getX(prevSample), getY(lastPt) - getY(prevSample)) > 0.5) {
                  run.push(prevSample);
                  if (hasWidths) runWidths.push(prevSampleW);
                  if (hasWeights) runWeights.push(prevSampleWt);
                }
              }
              flush();
              isCutting = true;
            } else if (s === steps) {
              run.push(q);
              if (hasWidths) runWidths.push(wVal);
              if (hasWeights) runWeights.push(wtVal);
            }
          }
          prevSample = samplePt;
          prevSampleW = sampleW;
          prevSampleWt = sampleWt;
        }
      } else {
        // Short step: vertex evaluation
        const val = at(q);
        if (isCutting) {
          if (val < thrLow) {
            isCutting = false;
            run.push(q);
            if (hasWidths) runWidths.push(wVal);
            if (hasWeights) runWeights.push(wtVal);
          }
        } else {
          if (val > thrHigh) {
            flush();
            isCutting = true;
          } else {
            run.push(q);
            if (hasWidths) runWidths.push(wVal);
            if (hasWeights) runWeights.push(wtVal);
          }
        }
      }
    }
    flush();
  }

  return out.map(g => { const { length, ...rest } = g; return rest; });
}
