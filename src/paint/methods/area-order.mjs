// Pipeline: inking, stage 3b (the growth order worked area by area). DOM free, no file IO.
// The growth order (stroke-order.mjs) lays the whole structure, then the detail, then all the texture in one sweep over the
// sheet. A person finishes one thing with its own detail before moving outward. Here the ordered strokes are regrouped:
// the lay-in first, then the main form, then area by area outward from it, each area finished (its structure, an outline before the
// lines inside it, then its detail, then its texture, nearest stroke first) before the next, the next area the nearest unfinished one to the pen with
// the nearer-the-main-form ones first; the closing accents stay last. An area is an object (a stroke's `unit`: a window
// with its panes) or, for the lines no object holds (a wall's joints, foliage), a patch of the sheet `cellMm` across.

const mid = P => P[Math.floor(P.length / 2)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * `ordered`: the growth order's strokes ({ points, phase, unit, object }). `centre`: the middle of the main form (mm);
 * `mainUnit`: the main form's unit or object id (its strokes come straight after the lay-in). Returns the same strokes
 * regrouped; nothing added or dropped.
 */
export function byArea(ordered, { centre, mainUnit = null, cellMm = 30, pull = 0.5 } = {}) {
  const head = ordered.filter(s => s.phase === 'layin'), tail = ordered.filter(s => s.phase === 'emphasis');
  const body = ordered.filter(s => s.phase !== 'layin' && s.phase !== 'emphasis');
  // an object's area is the patch its middle falls in, so a small object and the wall round it are worked together
  const unitMid = new Map();
  for (const s of body) if (s.unit != null && s.unit >= 0) { const m = unitMid.get(s.unit) ?? [0, 0, 0], q = mid(s.points); m[0] += q[0]; m[1] += q[1]; m[2]++; unitMid.set(s.unit, m); }
  const cell = p => `${Math.floor(p[0] / cellMm)},${Math.floor(p[1] / cellMm)}`;
  const keyOf = s => (mainUnit != null && (s.unit === mainUnit || s.object === mainUnit) ? 'main' : s.unit != null && s.unit >= 0 ? (m => cell([m[0] / m[2], m[1] / m[2]]))(unitMid.get(s.unit)) : cell(mid(s.points)));
  const areas = new Map();
  for (const s of body) { const k = keyOf(s); if (!areas.has(k)) areas.set(k, []); areas.get(k).push(s); }
  const out = [...head];
  let pen = head.length ? head[head.length - 1].points.at(-1) : centre;
  // inside an area: its structure (an object's outline before the lines inside it), then its detail, then its texture, each
  // taken nearest stroke first from where the pen is
  const nearest = (list, ready = () => true, done = () => {}) => {
    const left = [...list];
    while (left.length) {
      let b = -1;
      for (let k = 0; k < left.length; k++) if (ready(left[k]) && (b < 0 || dist(pen, left[k].points[0]) < dist(pen, left[b].points[0]))) b = k;
      if (b < 0) b = 0;
      const s = left.splice(b, 1)[0]; done(s); out.push(s); pen = s.points.at(-1);
    }
  };
  const lay = list => {
    const structure = list.filter(s => s.phase !== 'detail' && s.phase !== 'texture'), open = new Map();
    for (const s of structure) if (s.role === 'outline') open.set(s.object, (open.get(s.object) ?? 0) + 1);
    nearest(structure, s => s.role === 'outline' || !(open.get(s.object) > 0), s => { if (s.role === 'outline') open.set(s.object, open.get(s.object) - 1); });
    nearest(list.filter(s => s.phase === 'detail')); nearest(list.filter(s => s.phase === 'texture'));
  };
  if (areas.has('main')) { lay(areas.get('main')); areas.delete('main'); }
  const centreOf = list => { let x = 0, y = 0; for (const s of list) { const q = mid(s.points); x += q[0]; y += q[1]; } return [x / list.length, y / list.length]; };
  const left = [...areas.values()].map(list => ({ list, c: centreOf(list) }));
  while (left.length) {
    let b = 0, bc = Infinity;
    for (let k = 0; k < left.length; k++) { const cost = dist(pen, left[k].c) + pull * dist(centre, left[k].c); if (cost < bc) { bc = cost; b = k; } }
    lay(left.splice(b, 1)[0].list);
  }
  return [...out, ...tail];
}
