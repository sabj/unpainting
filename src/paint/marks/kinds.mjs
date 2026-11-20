// The mark library: one maker per kind of brush mark, each returning the stroke(s) the hand makes for it (hand.mjs).
// The kinds and their handling come from instruction books and from single marks in real watercolours and ink
// paintings (the study's FINDINGS.md): where the stroke lands (on the point, or pressed on the belly), how the pressure
// rises and falls along it (more than once in a long stroke), how the path turns (curves, a hook, a wrist's S), how fast
// the hand goes (a slow landing or pause leaves more paint; a fast lift leaves a point), and how loaded the brush is.
//
// Every maker takes one options object { x, y, length, width, angle, seed, bend, load, place } in millimetres and
// radians: (x, y) the mark's middle (or its start with place: 'start'), `length` along the stroke, `width` the widest
// it should be, `angle` the direction the hand moves (0 along +x; y runs down the sheet), `bend` -1..1 which way and how
// much the stroke curves (0: the maker's own; the seed chooses a side), `load` 0..1 how wet the brush is (1 full).
// It returns an array of plan strokes (one for most kinds; a gesture of several, such as a branch and its twigs, is
// laid in order without reloading between them only when the caller lays them so).
import { hand, movesPath, place, hash } from './hand.mjs';

// The section brush (src/media/tuft-section.mjs): a round lays down the share 0.62 p^0.85 of its tuft at pressure p, and
// the part laid down is as wide as its widest section, the belly's at p 0.87 and over. The pressure that makes a round
// of belly width `belly` lay a line `w` wide:
const pressureForWidth = (w, belly) => Math.min(1, Math.pow(Math.min(1, w / belly) * 0.55 / 0.62, 1 / 0.85));
// a flat's blade is 0.24 of its half-length thick (its edge)
const EDGE = 0.24;

const sideOf = o => (o.bend ? Math.sign(o.bend) : hash(o.seed ?? 0, 99) < 0.5 ? -1 : 1);
const bendOf = (o, own) => (o.bend ? Math.abs(o.bend) : own);
const loadOf = o => (o.load ?? 1);
// The lift. On this brush a point drawn off fast lays almost nothing (BRUSH-GAPS.md 5): at 180 mm/s the last 3 mm of a
// belly-first stroke were 0.76 mm wide and pale and the mark ended in a stub; slowing the last fifth to 15 to 25 mm/s gave
// a hair-fine dark tail (0.35 mm a millimetre from the end) as long as a real one. So every stroke but the dry, fast ones
// eases off over its last fifth to SLOW_LIFT mm/s, until the brush keeps a fast flick's tail.
const SLOW_LIFT = 22, FAST_LIFT = new Set(['sweep', 'drag', 'scumble', 'flying-white', 'ring']);
const slowLift = knots => {
  const before = knots.filter(([u]) => u < 0.8), at = Math.min(45, knots.reduce((v, [u, x]) => (u <= 0.8 ? x : v), knots[0][1]));
  return [...before, [0.8, at], [1, Math.min(SLOW_LIFT, knots[knots.length - 1][1])]];
};

/** The common work: moves to a path of `length`, turned to `angle` and placed, then driven by the hand. With `hide` (a
 *  share of the length) the tip is hidden as calligraphers hide it: the brush lands moving back against the stroke for
 *  that share, then turns and comes forward over its own landing, so the belly is already down where the stroke begins
 *  and its head is round and blunt (a brush that lands moving forward opens from its point). */
function one(o, name, moves, width, opts, step) {
  let { hide = o.hide ?? 0, ...rest } = opts;
  if (hide > 0) {
    const h = Math.min(0.2, hide), h2 = 2 * h / (1 + 2 * h), map = ks => ks.map(([u, v]) => [h2 + u * (1 - h2), v]);
    moves = [{ len: h, turn: 0, fixed: true }, { len: 0.0005, turn: Math.PI, fixed: true }, { len: h, turn: 0, fixed: true }, ...moves];
    rest = { ...rest, pressure: [[0, 0.5 * rest.pressure[0][1] + 0.3], ...map(rest.pressure)], speed: [[0, 6], ...map(rest.speed)] };
  }
  const L = o.length * (1 + 2 * Math.min(0.2, hide)), path = place(movesPath(moves, L, Math.max(0.1, Math.min(0.5, L / 60)), o.seed ?? 0), o.x, o.y, (o.angle ?? 0) + (hide > 0 ? Math.PI : 0), o.place !== 'start');
  if (!FAST_LIFT.has(name)) rest = { ...rest, speed: slowLift(rest.speed) };
  return hand(name, path, width, { seed: o.seed ?? 0, step, ...(o.load != null && rest.water == null ? { water: o.load } : {}), ...rest });
}

const KINDS = {
  sweep: {
    label: 'wash sweep: a loaded flat held square, even pressure, slow, carrying a bead along its lower edge',
    make: o => [one(o, 'sweep', [{ len: 1, turn: 0.06 * sideOf(o) * bendOf(o, 1) }], o.width,
      { flat: true, angle: 90, wob: 0.02, jitter: 0.03, pressure: [[0, 0.6], [0.05, 0.9], [0.95, 0.9], [1, 0.75]], speed: [[0, 15], [0.08, 30], [1, 30]] })],
  },
  taper: {
    label: 'tapered stroke: lands on the point, swells on the belly, eases, swells again, lifts off to a point',
    make: o => { const s = sideOf(o), b = bendOf(o, 0.35); return [one(o, 'taper', [{ len: 0.5, turn: s * b }, { len: 0.5, turn: s * 0.6 * b }], o.width,
      { pressure: [[0, 0.04], [0.28, 1], [0.5, 0.6], [0.66, 0.9], [1, 0.02]], speed: [[0, 30], [0.3, 60], [1, 150]] })]; },
  },
  reverse: {
    label: 'belly-first stroke (bamboo leaf): pressed down where it lands, drawn out and lifted to a fine point',
    make: o => { const s = sideOf(o), b = bendOf(o, 0.3); return [one(o, 'reverse', [{ len: 0.15, turn: s * 0.05 }, { len: 0.85, turn: s * b }], o.width,
      { pressure: [[0, 0.8], [0.05, 1], [0.3, 0.75], [0.65, 0.3], [1, 0.02]], speed: [[0, 12], [0.12, 45], [0.6, 100], [1, 180]] })]; },
  },
  leaf: {
    label: 'leaf or petal: lands on the point, presses to the belly through the middle, lifts back to the point',
    make: o => { const s = sideOf(o), b = bendOf(o, 0.45); return [one(o, 'leaf', [{ len: 0.5, turn: s * b * 0.6 }, { len: 0.5, turn: s * b }], o.width,
      { pressure: [[0, 0.04], [0.3, 1], [0.45, 0.95], [1, 0.02]], speed: [[0, 35], [0.35, 40], [1, 90]] })]; },
  },
  comma: {
    label: 'comma: pressed round head, then the tail pulled off round a curve, thinning as it speeds up',
    make: o => { const s = sideOf(o), b = bendOf(o, 1.3); return [one(o, 'comma', [{ len: 0.22, turn: s * 0.35 }, { len: 0.78, turn: s * b }], o.width,
      { pressure: [[0, 0.9], [0.08, 1], [0.2, 0.9], [0.5, 0.4], [1, 0.02]], speed: [[0, 8], [0.18, 25], [1, 160]] })]; },
  },
  teardrop: {
    label: 'teardrop: the belly pressed and held a moment, then pulled straight back to a point',
    make: o => [one(o, 'teardrop', [{ len: 1, turn: 0.08 * sideOf(o) * bendOf(o, 1) }], o.width,
      { pressure: [[0, 0.9], [0.08, 1], [0.25, 0.8], [1, 0.02]], speed: [[0, 6], [0.2, 35], [1, 130]] })],
  },
  dot: {
    label: 'dot: the point set down and pressed while the hand turns a little, then lifted (a press without moving does not open the tuft)',
    make: o => { const s = sideOf(o); return [one({ ...o, length: Math.max(o.length ?? 0, 0.9 * o.width) }, 'dot', [{ len: 0.6, turn: s * 0.8 }, { len: 0.4, turn: s * 1.2 }], o.width,
      { wob: 0, pressure: [[0, 0.15], [0.45, 1], [0.75, 1], [1, 0.2]], speed: [[0, 6], [1, 8]] })]; },
  },
  touch: {
    label: 'touch: a short stroke laid on the belly, a little drag, lifted blunt (Homer\'s and Sargent\'s leaf and twig touches)',
    make: o => { const s = sideOf(o); return [one(o, 'touch', [{ len: 1, turn: s * bendOf(o, 0.25) }], o.width,
      { pressure: [[0, 0.9], [0.15, 1], [0.7, 0.85], [1, 0.35]], speed: [[0, 8], [0.2, 30], [0.85, 40], [1, 15]] })]; },
  },
  line: {
    label: 'long fine line with the point: the brush upright and light, the pressure breathing a little, drawn steadily (slow enough for the point to lay its paint)',
    make: o => {
      const belly = Math.max(1.5, 4 * o.width), p = pressureForWidth(o.width, belly), s = sideOf(o), b = bendOf(o, 0.2);
      return [one(o, 'line', [{ len: 0.5, turn: s * b }, { len: 0.5, turn: -s * b * 0.7 }], belly,
        { wob: 0.01, jitter: 0.12, pressure: [[0, 0.03], [0.04, p * 1.2], [0.3, p * 0.85], [0.55, p * 1.3], [0.8, p * 0.9], [0.96, p * 1.1], [1, 0.02]], speed: [[0, 12], [0.08, 28], [0.9, 32], [1, 45]] })];
    },
  },
  edge: {
    label: 'line with a flat on its edge: the blade drawn along its own length, a line as thin as the blade',
    make: o => { const blade = Math.max(2, o.width / EDGE); return [one(o, 'edge', [{ len: 1, turn: 0.05 * sideOf(o) * bendOf(o, 1) }], blade,
      { flat: true, angle: 0, wob: 0.005, pressure: [[0, 0.4], [0.08, 0.8], [0.5, 0.65], [0.92, 0.8], [1, 0.3]], speed: [[0, 10], [0.1, 35], [0.9, 35], [1, 20]] })]; },
  },
  wedge: {
    label: 'wedge: a flat held at a slant and pulled a short way, pressed at the start and eased off',
    make: o => [one({ ...o, length: Math.max(o.length, 0.3 * o.width) }, 'wedge', [{ len: 1, turn: 0 }], o.width,
      { flat: true, angle: 55, wob: 0.01, pressure: [[0, 0.7], [0.15, 1], [0.7, 0.75], [1, 0.25]], speed: [[0, 8], [0.2, 30], [1, 50]] })],
  },
  swell: {
    label: 'thin-thick-thin (orchid leaf): the pressure rises and falls three times along a long turning stroke, the last lift to a hair',
    make: o => { const s = sideOf(o), b = bendOf(o, 0.45); return [one(o, 'swell', [{ len: 0.35, turn: s * b }, { len: 0.3, turn: -s * b * 0.5 }, { len: 0.35, turn: s * b * 1.2 }], o.width,
      { pressure: [[0, 0.04], [0.12, 0.6], [0.22, 0.25], [0.45, 1], [0.6, 0.4], [0.75, 0.75], [1, 0.02]], speed: [[0, 40], [0.5, 70], [1, 140]] })]; },
  },
  ribbon: {
    label: 'ribbon: a flat held at one angle on the sheet along an S, broad where the path crosses the blade, thin where it runs along it',
    make: o => { const s = sideOf(o), b = bendOf(o, 1.4); return [one(o, 'ribbon', [{ len: 0.5, turn: s * b }, { len: 0.5, turn: -s * b }], o.width,
      { flat: true, held: 'fixed', angle: Math.round(((o.angle ?? 0) * 180 / Math.PI + 40 * s + 360) % 360), wob: 0.01, pressure: [[0, 0.5], [0.1, 0.9], [0.9, 0.9], [1, 0.4]], speed: [[0, 20], [0.15, 60], [1, 80]] })]; },
  },
  contour: {
    label: 'contour (crescent): the belly pulled round a curve, landing and lifting on the point, pressed twice along it, the wet load leaving a crisp rim',
    make: o => { const s = sideOf(o), b = bendOf(o, 1.1); return [one(o, 'contour', [{ len: 0.5, turn: s * b * 0.45 }, { len: 0.5, turn: s * b * 0.55 }], o.width,
      { pressure: [[0, 0.05], [0.3, 0.95], [0.5, 0.7], [0.7, 1], [1, 0.03]], speed: [[0, 25], [0.3, 40], [0.75, 40], [1, 90]] })]; },
  },
  hook: {
    label: 'hook: a stroke drawn down, paused and pressed at the turn, then flicked out sharply to a point',
    make: o => { const s = sideOf(o); return [one(o, 'hook', [{ len: 0.74, turn: 0.04 * s }, { len: 0.06, turn: -s * 1.2 }, { len: 0.2, turn: -s * 0.9 }], o.width,
      { pressure: [[0, 0.5], [0.06, 0.85], [0.45, 0.6], [0.72, 0.75], [0.79, 1], [0.84, 0.7], [1, 0.02]], speed: [[0, 15], [0.1, 70], [0.7, 55], [0.79, 8], [0.85, 40], [1, 200]] })]; },
  },
  bar: {
    label: 'bar (bamboo stalk, the horizontal of Yong, a roof line): pressed into a head where it lands, lighter along, pressed and turned down at the end',
    make: o => [one(o, 'bar', [{ len: 0.96, turn: 0.04 * sideOf(o) * bendOf(o, 1) }, { len: 0.04, turn: 0.6 * sideOf(o) }], o.width,
      { pressure: [[0, 0.55], [0.07, 1], [0.18, 0.7], [0.82, 0.7], [0.93, 1], [1, 0.35]], speed: [[0, 6], [0.1, 15], [0.18, 70], [0.82, 70], [0.93, 10], [1, 15]] })],
  },
  hatch: {
    label: 'hatch touches: a few short strokes side by side in one direction, each landed with a press and lifted quick',
    make: o => {
      const n = Math.max(3, Math.min(7, Math.round(o.length / (0.9 * o.width)))), len = 2.5 * o.width, out = [], ca = Math.cos(o.angle ?? 0), sa = Math.sin(o.angle ?? 0);
      for (let k = 0; k < n; k++) {
        const seed = (o.seed ?? 0) * 31 + k, j = hash(seed, 5) - 0.5, t = ((k + 0.5 + 0.5 * (hash(seed, 3) - 0.5)) / n - 0.5) * o.length, lag = (hash(seed, 4) - 0.5) * 0.6 * len;
        // the touches lie across the run's direction, each a little off parallel
        out.push(one({ ...o, seed, length: len * (0.6 + 0.8 * hash(seed, 6)), x: o.x + ca * t + sa * lag, y: o.y + sa * t - ca * lag, angle: (o.angle ?? 0) - Math.PI / 2 + 0.5 * j }, 'hatch',
          [{ len: 1, turn: 0.15 * j }], o.width * (0.85 + 0.3 * hash(seed, 7)), { pressure: [[0, 0.35], [0.15, 1], [0.6, 0.8], [1, 0.08]], speed: [[0, 15], [0.2, 50], [1, 120]] }));
      }
      return out;
    },
  },
  scumble: {
    label: 'scumble: one scrubbing stroke of a half-dry brush, back and forth across a patch, turning sharply at each end, the pressure rising and falling',
    make: o => {
      const n = 6, moves = [], s = sideOf(o), seed = o.seed ?? 0;
      // each leg as long as the patch, a little slanted, then a sharp turn back (the tuft flips over at each turn)
      for (let k = 0; k < n; k++) { moves.push({ len: 0.8 + 0.4 * hash(seed, k, 9), turn: 0.2 * (hash(seed, k, 8) - 0.5) }); if (k < n - 1) moves.push({ len: 0.03, turn: (k % 2 ? -1 : 1) * s * (Math.PI - 0.35), fixed: true }); }
      return [one({ ...o, length: o.length * n }, 'scumble', moves, o.width, { water: 0.45 * loadOf(o), wob: 0.08, jitter: 0.15, pressure: [[0, 0.3], [0.08, 0.8], [0.3, 0.5], [0.5, 0.9], [0.7, 0.55], [0.9, 0.85], [1, 0.1]], speed: [[0, 40], [0.1, 150], [1, 170]] })];
    },
  },
  drag: {
    label: 'dragged broken stroke: a nearly dry flat pulled fast across the tooth, catching only the hills of the paper',
    make: o => [one(o, 'drag', [{ len: 1, turn: 0.08 * sideOf(o) * bendOf(o, 1) }], o.width,
      { flat: true, angle: 90, water: 0.3 * loadOf(o), wob: 0.03, jitter: 0.1, pressure: [[0, 0.5], [0.1, 0.85], [0.5, 0.7], [0.8, 0.9], [1, 0.4]], speed: [[0, 120], [0.2, 260], [1, 280]] })],
  },
  'flying-white': {
    label: 'flying white: a round with little water swept fast round a curve, the hairs streaking apart as it empties',
    make: o => { const s = sideOf(o), b = bendOf(o, 0.9); return [one(o, 'flying-white', [{ len: 0.5, turn: s * b * 0.5 }, { len: 0.5, turn: s * b }], o.width,
      { water: 0.45 * loadOf(o), jitter: 0.1, pressure: [[0, 0.45], [0.08, 1], [0.45, 0.7], [0.75, 0.95], [1, 0.3]], speed: [[0, 30], [0.15, 180], [1, 260]] })]; },
  },
  grass: {
    label: 'grass blade: pressed at the root and flicked upward, curving, fast enough to lift to a hair',
    make: o => { const s = sideOf(o), b = bendOf(o, 0.5); return [one({ ...o, angle: o.angle ?? -Math.PI / 2 }, 'grass', [{ len: 0.4, turn: s * b * 0.3 }, { len: 0.6, turn: s * b }], o.width,
      { pressure: [[0, 0.7], [0.08, 1], [0.35, 0.6], [1, 0.01]], speed: [[0, 15], [0.12, 80], [1, 260]] })]; },
  },
  'leaf-stem': {
    label: 'leaf with its stem: one gesture, the point drawing the stem, then pressed into the leaf and lifted to its tip',
    make: o => { const s = sideOf(o), b = bendOf(o, 0.3), stem = pressureForWidth(Math.max(0.25, 0.15 * o.width), o.width); return [one(o, 'leaf-stem', [{ len: 0.38, turn: s * b }, { len: 0.62, turn: s * b * 1.4 }], o.width,
      { pressure: [[0, 0.03], [0.05, stem], [0.36, stem * 1.2], [0.68, 1], [0.82, 0.85], [1, 0.02]], speed: [[0, 40], [0.36, 80], [0.5, 35], [0.7, 40], [1, 100]] })]; },
  },
  branch: {
    label: 'branch that thins and forks: heavy at the butt, eased and pressed again at each joint; twigs drawn off from the joints, each lighter',
    make: o => {
      const s = sideOf(o), seed = o.seed ?? 0, main = one({ ...o, place: o.place }, 'branch', [{ len: 0.35, turn: s * 0.15 }, { len: 0.35, turn: -s * 0.25 }, { len: 0.3, turn: s * 0.2 }], o.width,
        { pressure: [[0, 0.8], [0.06, 1], [0.3, 0.6], [0.36, 0.85], [0.62, 0.38], [0.7, 0.6], [1, 0.03]], speed: [[0, 12], [0.1, 50], [1, 140]] });
      const P = main.points, out = [main];
      for (const [k, at, w] of [[0, 0.36, 0.55], [1, 0.7, 0.4]]) {
        const i = Math.round(at * (P.length - 1)), a = P[Math.max(0, i - 2)], b = P[Math.min(P.length - 1, i + 2)], h = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const side = (k % 2 ? 1 : -1) * s, ang = h + side * (0.5 + 0.3 * hash(seed, k, 21));
        out.push(one({ ...o, seed: seed * 7 + k, x: P[i][0], y: P[i][1], place: 'start', angle: ang, length: o.length * (0.45 - 0.12 * k) }, 'branch', [{ len: 0.5, turn: side * 0.2 }, { len: 0.5, turn: -side * 0.15 }], o.width * w,
          { pressure: [[0, 0.5], [0.08, 0.8], [0.5, 0.45], [1, 0.02]], speed: [[0, 20], [0.1, 60], [1, 150]] }));
      }
      return out;
    },
  },
  's-stroke': {
    label: 'S stroke: one stroke that bends one way then the other, swelling on each bend and thinning where it changes',
    make: o => { const s = sideOf(o), b = bendOf(o, 1.2); return [one(o, 's-stroke', [{ len: 0.5, turn: s * b }, { len: 0.5, turn: -s * b }], o.width,
      { pressure: [[0, 0.04], [0.25, 0.95], [0.5, 0.35], [0.75, 0.95], [1, 0.03]], speed: [[0, 30], [0.25, 50], [0.5, 80], [0.75, 50], [1, 140]] })]; },
  },
  ring: {
    label: 'ring (enso): one turn of the arm, pressed at the start, breathing round, running dry and breaking up as it closes',
    make: o => { const s = sideOf(o); return [one(o, 'ring', [{ len: 1, turn: s * 2 * Math.PI * 0.93 }], o.width,
      { water: 0.7 * loadOf(o), pressure: [[0, 0.6], [0.04, 1], [0.35, 0.7], [0.6, 0.9], [0.9, 0.6], [1, 0.3]], speed: [[0, 10], [0.06, 60], [0.6, 120], [1, 220]] })]; },
  },
  'leaf-group': {
    label: 'leaf group (bamboo): three leaves fanned from one point on the twig, each landing thin there, swelling at a third, tapering long to its tip',
    make: o => {
      const out = [], s = sideOf(o), seed = o.seed ?? 0;
      for (let k = 0; k < 3; k++) {
        const ang = (o.angle ?? 0) + s * (k - 1) * 0.5 + 0.15 * (hash(seed, k, 31) - 0.5), len = o.length * (k === 1 ? 1 : 0.7 + 0.2 * hash(seed, k, 32)), sk = s * ((k - 1) || 0.5);
        out.push(one({ ...o, seed: seed * 5 + k, place: 'start', length: len, angle: ang }, 'leaf-group', [{ len: 0.35, turn: sk * 0.15 }, { len: 0.65, turn: sk * 0.2 }], o.width * (k === 1 ? 1 : 0.8),
          { pressure: [[0, 0.1], [0.28, 1], [0.5, 0.75], [1, 0.02]], speed: [[0, 25], [0.3, 40], [1, 150]] }));
      }
      return out;
    },
  },
};

/** The mark kinds, each with its one-line recipe. */
export const MARK_KINDS = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label]));

/** Make a mark of kind `name` (see KINDS): an array of plan strokes. */
export function makeMark(name, o) {
  const k = KINDS[name];
  if (!k) throw new Error(`marks: no mark kind '${name}'`);
  if (!(o.width > 0) || !(o.length > 0) || !Number.isFinite(o.x) || !Number.isFinite(o.y)) throw new RangeError(`marks: ${name} needs x, y, length and width in mm`);
  return k.make(o);
}
