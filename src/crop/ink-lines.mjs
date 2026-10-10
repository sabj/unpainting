// A pen-and-wash target's own pen lines as candidate lines for the drawing: the separator's estimated ink
// (inkwash.mjs, the same split the painter uses to tell pen line from wash) thinned to centre lines and traced to
// polylines, in the line-file format lines.mjs reads. Each line can carry the named region it lies in, from a label
// map, so a plan can rank lines by what they draw (drawing-plan.mjs, lines "regions").
// DOM free.
import { separate } from './inkwash.mjs';
import { thin, dilate } from '../raster.js';
import { joinLines } from './joinlines.mjs';
import { gaussian } from '../keyframes/density.mjs';

const pathLength = pts => { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return L; };

const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * A one-pixel skeleton as paths: each walk starts at an end (one neighbour) where there is one, steps to the unvisited
 * neighbour that turns least, and stops when none is left. A staircase pixel or a small spur does not break a line.
 * @returns arrays of pixel indices
 */
export function tracePaths(skel, w, h) {
  const n = w * h, seen = new Uint8Array(n), paths = [];
  const around = i => { const x = i % w, y = (i / w) | 0, out = []; for (let k = 0; k < 8; k++) { const xx = x + N8[k][0], yy = y + N8[k][1]; if (xx >= 0 && yy >= 0 && xx < w && yy < h && skel[yy * w + xx]) out.push([yy * w + xx, k]); } return out; };
  const step = (start, path) => {
    let cur = start, dir = -1;
    for (;;) {
      let best = -1, bestDir = -1, bestTurn = 9;
      for (const [q, k] of around(cur)) {
        if (seen[q]) continue;
        const turn = dir < 0 ? (k % 2) : Math.min((k - dir + 8) % 8, (dir - k + 8) % 8) + (k % 2) * 0.1;
        if (turn < bestTurn) { bestTurn = turn; best = q; bestDir = k; }
      }
      if (best < 0 || bestTurn > 2) return path;
      seen[best] = 1; path.push(best); cur = best; dir = bestDir;
    }
  };
  // from the start one way, then the other way, so a walk begun mid-line still covers all of it
  const walk = start => { seen[start] = 1; const ahead = step(start, [start]); return [...step(start, []).reverse(), ...ahead]; };
  // ends first, so a line is walked from one end to the other; then whatever is left (rings, junction remainders)
  for (const ends of [true, false]) for (let i = 0; i < n; i++) {
    if (!skel[i] || seen[i]) continue;
    if (ends && around(i).length !== 1) continue;
    paths.push(walk(i));
  }
  return paths;
}

/** Douglas-Peucker on [x, y] points: drops points within `tol` of the chord. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1, far = tol;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L;
      if (d > far) { far = d; best = k; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** The label most of a line's points lie on, or null. `labels` is a w x h array of region ids. */
export function majorityLabel(points, labels, w, h) {
  const votes = new Map();
  for (const [x, y] of points) {
    const xi = Math.min(w - 1, Math.max(0, Math.round(x))), yi = Math.min(h - 1, Math.max(0, Math.round(y)));
    const id = labels[yi * w + xi];
    votes.set(id, (votes.get(id) ?? 0) + 1);
  }
  let best = null, n = -1;
  for (const [id, c] of votes) if (c > n) { best = id; n = c; }
  return best;
}

/**
 * Candidate lines from the estimated ink of an RGB picture.
 *
 * @param rgb    raw RGB, length w*h*3
 * @param paper  paper colour [r, g, b]
 * @param opts.labels   optional w x h region ids; opts.legend maps id to region name
 * @param opts.subject  region names that are the subject (role "subject"); the rest are role "setting"
 * @param opts.bridge   cells the ink mask is grown before thinning, so a nib line broken by paper tooth stays one line
 * @param opts.join    the widest gap, in cells, bridged between two pieces that continue each other (joinlines.mjs)
 * @param opts.minLength shortest line kept, in cells
 * @param opts.darkWash mean density, blurred to a passage (washSigma cells), over which a line outside `keep` regions
 *                  lies in a dark wash: its region becomes "dark wash", which a plan ranks last
 * @param opts.margin  share of the short side along the picture's border; a line mostly inside it is the sheet's edge, dropped
 * @returns { lines: [{ points, length, strength, weight, role, kind, region? }], mask, stats }
 */
export function inkLines(rgb, w, h, paper, { labels = null, legend = {}, subject = [], bridge = 0, join = 6, minLength = 8, margin = 0.02, tolerance = 0.8, separator = {},
  darkWash = Infinity, washSigma = 8, keep = ['head', 'hands', 'face'] } = {}) {
  const sep = separate(rgb, w, h, paper, separator);
  const mask = bridge > 0 ? dilate(sep.ink, w, h, bridge) : sep.ink;
  // the separator's ink breaks at paper tooth and crossings: its pieces are joined where they continue each other
  const pieces = tracePaths(thin(mask, w, h), w, h).filter(p => p.length >= 3)
    .map(p => ({ points: simplify(p.map(i => [i % w, (i / w) | 0]), tolerance).map(([x, y]) => ({ x, y })) }));
  const traced = join > 0 ? joinLines(pieces, { gap: join, cos: 0.6, aim: 0.5, step: 1 }).gestures : pieces;
  const lines = [];
  let peak = 0;
  const m = margin * Math.min(w, h);
  const wash = Number.isFinite(darkWash) ? gaussian(sep.DL, w, h, washSigma) : null;
  const at = (x, y, F = sep.DL) => F[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  for (const t of traced) {
    const raw = (t.points ?? t.pts ?? t).map(q => [q.x, q.y]);
    const length = pathLength(raw);
    if (length < minLength) continue;
    if (raw.filter(([x, y]) => x < m || y < m || x >= w - m || y >= h - m).length * 2 > raw.length) continue;
    // the line's darkness: the source density along it, so a firm pen line outranks a faint one
    const strength = raw.reduce((a, [x, y]) => a + at(x, y), 0) / raw.length;
    peak = Math.max(peak, strength);
    const line = { points: simplify(raw, tolerance), length, strength, kind: 'contour' };
    if (labels) {
      const id = majorityLabel(raw, labels, w, h);
      line.region = legend[id] ?? String(id);
      line.role = subject.includes(line.region) ? 'subject' : 'setting';
    }
    if (wash) {
      line.wash = raw.reduce((a, [x, y]) => a + at(x, y, wash), 0) / raw.length;
      if (line.wash > darkWash && !keep.includes(line.region)) line.region = 'dark wash';
    }
    lines.push(line);
  }
  for (const g of lines) g.weight = peak > 0 ? Math.min(1, g.strength / peak) : 1;
  lines.sort((a, b) => b.length * b.strength - a.length * a.strength);
  return { lines, mask: sep.ink, stats: { ...sep.stats, pieces: pieces.length, joined: traced.length, kept: lines.length } };
}
