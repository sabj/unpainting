// Pipeline: inking, stage 4 (hand plan: chain, order and taper).
// --drawinglogic 1: lays the lines drawing-rank.mjs chose as a hand would: joins continuing lines into gestures,
// orders them tier by tier from where the pen last lifted, and tapers pressure and width at both ends.
// DOM free, no file IO.
import { joinLines } from '../../crop/joinlines.mjs';
import { pathLength } from '../../crop/inktiers.mjs';
import { breakOnLights } from './drawing-scribble.mjs';

function interpPoint(p0, p1, t) {
  const p = { ...p0 };
  p.x = p0.x + t * (p1.x - p0.x);
  p.y = p0.y + t * (p1.y - p0.y);
  for (const key in p0) {
    if (key === 'x' || key === 'y') continue;
    if (typeof p0[key] === 'number' && typeof p1[key] === 'number') {
      p[key] = p0[key] + t * (p1[key] - p0[key]);
    }
  }
  return p;
}

function insertTaperVertices(P, tin, tout, L, flick) {
  if (P.length < 2 || L <= 0) return P;
  const targets = [];
  if (!flick && tin > 0 && tin < L) targets.push(tin);
  if (tout > 0 && L - tout > 0 && L - tout < L) targets.push(L - tout);
  if (!targets.length) return P;

  const s = [0];
  for (let k = 1; k < P.length; k++) {
    s.push(s[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y));
  }

  const eps = 1e-4;
  const needed = targets.filter(t => !s.some(sk => Math.abs(sk - t) <= eps));
  if (!needed.length) return P;

  needed.sort((a, b) => a - b);
  const out = [P[0]];
  let targetIdx = 0;
  for (let k = 1; k < P.length; k++) {
    const s0 = s[k - 1], s1 = s[k];
    const segLen = s1 - s0;
    while (targetIdx < needed.length && needed[targetIdx] < s1 - eps) {
      const d = needed[targetIdx];
      if (d > s0 + eps && segLen > 0) {
        const u = (d - s0) / segLen;
        out.push(interpPoint(P[k - 1], P[k], u));
      }
      targetIdx++;
    }
    out.push(P[k]);
  }
  return out;
}

// Conversion to the sheet must retain instrument controls as well as geometry.
export function scaleDrawingGestures(gestures, scale) {
  return gestures.map(g => ({ ...g,
    ...(g.length == null ? {} : { length: g.length * scale }),
    points: g.points.map(p => ({ ...p, x: p.x * scale, y: p.y * scale,
      ...(p.nw == null ? {} : { nw: p.nw * scale }),
      ...(p.v == null ? {} : { v: p.v * scale }),
      ...(p.width == null ? {} : { width: p.width * scale }),
    })),
  }));
}

// Hand handling of a reviewed file without the form/toning budget changing its selection.
export function handDrawing(lines, { gap = 4, cos = .8, aim = .7, strokeLength = Infinity,
  D = null, w, h, lit = 0, reach = 2, ...shape } = {}) {
  const normLines = lines.map(g => ({ ...g, tier: g.tier ?? 1 }));
  const groups = new Map();
  for (const g of normLines) {
    const key = [g.role, g.kind, g.object, g.region, g.tier].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  }
  let joined = 0;
  const gestures = [...groups.values()].flatMap(gs => {
    const r = gap > 0 ? connect(gs, { gap, cos, aim }) : { gestures: gs, joined: 0 };
    joined += r.joined;
    return r.gestures;
  });
  const broken = lit > 0 && D ? gestures.flatMap(g => breakOnLights(g, D, w, h, { lit, reach, minPts: 2 })) : gestures;
  const ordered = handOrder(broken);
  return {
    joined,
    gestures: gestures.length,
    runs: broken.length,
    strokes: ordered.map(g => shapeGesture(g, {
      ...shape,
      scale: (shape.scale ?? 1) * (g.tier === 2 ? (shape.detailScale ?? 1) : 1),
      widthScale: (shape.widthScale ?? 1) * (g.tier === 2 ? (shape.detailWidth ?? 1) : 1),
    })).flatMap(g => personStrokes(g, strokeLength)),
  };
}

/** Join lines that continue one another. `gap` in cells. Loose gates: a segmenter breaks contours at every junction. */
export function connect(lines, { gap = 4, cos = 0.8, aim = 0.7 } = {}) {
  if (!lines.length) return { gestures: [], joined: 0 };
  const r = joinLines(lines, { gap, cos, aim, step: 1 });
  return { gestures: r.gestures.map(g => ({ ...g, length: pathLength(g.points) })), joined: r.joined };
}

/** Tier by tier (ascending, tier 0 last), nearest-neighbour within a tier from the last lift, reversing a gesture when
 *  its far end is the nearer. The pen starts at the top left. */
export function handOrder(gestures) {
  const tiers = [...new Set(gestures.map(g => g.tier ?? 1))].sort((a, b) => (a || 99) - (b || 99));
  const out = [];
  let pen = { x: 0, y: 0 };
  for (const t of tiers) {
    const left = gestures.filter(g => (g.tier ?? 1) === t);
    const used = new Uint8Array(left.length);
    for (let k = 0; k < left.length; k++) {
      let best = -1, bestD = Infinity, flip = false;
      for (let i = 0; i < left.length; i++) {
        if (used[i]) continue;
        const P = left[i].points, a = P[0], b = P[P.length - 1];
        const da = Math.hypot(a.x - pen.x, a.y - pen.y), db = Math.hypot(b.x - pen.x, b.y - pen.y);
        if (da < bestD) { bestD = da; best = i; flip = false; }
        if (db < bestD) { bestD = db; best = i; flip = true; }
      }
      used[best] = 1;
      const g = left[best], points = flip ? [...g.points].reverse() : g.points;
      out.push(flip ? { ...g, points } : g);
      pen = points[points.length - 1];
    }
  }
  return out;
}

/**
 * Pressure share and contact width along a gesture.
 *
 * @param base   the pressure share at darkness 1 (--drawwant for the first pen, --drawtonewant for the closing one)
 * @param inLen  cells over which the pen presses into the line, from `start` of the share
 * @param outLen cells over which it lifts off, down to `end`
 * @param gain,margin,minNib  the file's measured width to a contact width (drawing-file.mjs's calibration)
 * @param scale  a further factor on the share, per gesture (the toning's need)
 * @param floor  the darkness a line is drawn at when the file says 0, so faint file values still state the form
 */
export function shapeGesture(g, { base = 0.6, inLen = 3, outLen = 5, start = 0.45, end = 0.3, gain = 1.39, margin = 0.42, minNib = 0.3, scale = 1, floor = 0, widthScale = 1, flickCells = 0 } = {}) {
  let P = g.points;
  let L0 = 0;
  for (let k = 1; k < P.length; k++) L0 += Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y);
  const L = L0 || 1, tin = Math.min(inLen, 0.25 * L), tout = Math.min(outLen, 0.3 * L);
  // a flick (a mark under `flickCells` long) is set down and lifted in one motion: no landing taper, and finer
  const flick = flickCells > 0 && L < flickCells, ws = widthScale * (flick ? 0.8 : 1);
  if (L > tin + tout) {
    P = insertTaperVertices(P, tin, tout, L, flick);
  }
  const n = P.length, s = [0];
  for (let k = 1; k < n; k++) s.push(s[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y));
  const ease = u => u * u * (3 - 2 * u);
  const env = d => {
    const a = !flick && tin > 0 && d < tin ? start + (1 - start) * ease(d / tin) : 1;
    const b = tout > 0 && L - d < tout ? end + (1 - end) * ease((L - d) / tout) : 1;
    return Math.min(a, b);
  };
  const lineWeight = g.weight ?? 1;
  const points = P.map((q, k) => {
    const e = env(s[k]), dark = floor + (1 - floor) * Math.max(0, Math.min(1, q.weight ?? lineWeight));
    const out = { ...q, s: Math.min(1, base * dark * e * scale) };
    if (q.width != null) out.nw = Math.max(minNib, (q.width * gain - margin) * (0.5 + 0.5 * e) * ws);
    return out;
  });
  return { ...g, points };
}

/** A gesture cut into strokes of length `L`, each ending where the pen may be dipped. The cuts do not taper:
 *  the envelope is applied to the whole gesture first. */
export function personStrokes(g, L, { dipFirst = false, load = 1, low = null } = {}) {
  if (!g.points || g.points.length < 2) return [];
  if (!Number.isFinite(L) || !(L > 1e-4)) {
    const dip = g.dip ?? (dipFirst ? (load === 1 ? true : load) : undefined);
    return [{ ...g, points: g.points, length: pathLength(g.points), tier: g.tier ?? 1, weight: g.weight ?? 1,
      ...(dip !== undefined ? { dip } : {}),
      ...(dipFirst && low != null ? { low } : {}) }];
  }

  const out = [];
  let cur = [g.points[0]], d = 0;
  let prev = g.points[0];

  for (let k = 1; k < g.points.length; k++) {
    const next = g.points[k];
    let segLen = Math.hypot(next.x - prev.x, next.y - prev.y);
    if (segLen <= 1e-9) {
      cur.push(next);
      prev = next;
      continue;
    }

    while (d + segLen >= L) {
      const rem = L - d;
      if (rem <= 1e-6) {
        if (cur.length >= 2) out.push(cur);
        cur = [prev];
        d = 0;
      } else if (segLen - rem <= 1e-6) {
        cur.push(next);
        out.push(cur);
        cur = [next];
        d = 0;
        prev = next;
        segLen = 0;
        break;
      } else {
        const t = rem / segLen;
        const C = interpPoint(prev, next, t);
        cur.push(C);
        out.push(cur);
        cur = [C];
        d = 0;
        prev = C;
        segLen -= rem;
      }
    }

    if (segLen > 1e-6) {
      d += segLen;
      cur.push(next);
      prev = next;
    }
  }

  if (cur.length >= 2) out.push(cur);

  if (out.length >= 2) {
    const tail = out[out.length - 1];
    if (pathLength(tail) < 0.25 * L) {
      const prevSeg = out[out.length - 2];
      prevSeg.push(...tail.slice(1));
      out.pop();
    }
  }

  const hasDipConfig = g.dip !== undefined || dipFirst;
  return out.map((points, i) => {
    const first = i === 0;
    const dipVal = first ? (g.dip ?? (dipFirst ? (load === 1 ? true : load) : false)) : false;
    return {
      ...g,
      points,
      length: pathLength(points),
      tier: g.tier ?? 1,
      weight: g.weight ?? 1,
      ...(hasDipConfig ? { dip: dipVal } : {}),
      ...(dipFirst && low != null ? { low } : {}),
    };
  });
}
