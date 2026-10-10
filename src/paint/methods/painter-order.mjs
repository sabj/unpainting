// --order legacy-painter: reorders the plan's passages into a watercolourist's order instead of the ladder's pan-major order
// (each pan pale to dark before the next). Each passage keeps its plan; a passage straddling the subject is cut so
// its ground and subject parts can go on at different times. The phases:
//   ground  the light values of every pan on the ground, region by region (connected parts, top of the sheet first),
//           each region's light values across all pans before the next region;
//   subject the light values of every pan on the subject;
//   mid     the middle values, value by value across all pans, ground before subject within a value;
//   dark    the dark values the same way;
//   detail  the detail layers (--detailpasses), last.
// A value's band comes from its place on the ladder, (value - 1) / (steps - 1): light below --orderlight, dark from
// --orderdark. Value 1 is always light.
//
// Pure: no sheet, no files. The caller passes the subject mask (the --fwmask mask) and the film's mass map.
import { passage, dropMask } from '../../crop/blockin.mjs';

const PHASES = ['ground', 'subject', 'mid', 'dark', 'detail'];
const SKIP_KEYS = new Set(['ids', 'id', 'box', '_mask', 'mask', 'area', '_brushMask', 'w']);

/** The band of a ladder value: light, mid or dark. */
export function bandOf(value, steps, { light = 0.25, dark = 0.6 } = {}) {
  if (value <= 1) return 'light';
  const t = (value - 1) / Math.max(1, steps - 1);
  return t < light ? 'light' : t < dark ? 'mid' : 'dark';
}

/** 4-connected components of a byte mask inside a box: a label field (0 outside) and each label's area and centroid. */
export function components(mask, w, box) {
  const lab = new Int32Array(mask.length), parts = [], stack = [];
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) {
    const s = y * w + x;
    if (!mask[s] || lab[s]) continue;
    const id = parts.length + 1; let area = 0, sy = 0, sx = 0;
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(), cx = i % w, cy = (i / w) | 0;
      area++; sx += cx; sy += cy;
      const nb = [cx > box.x0 ? i - 1 : -1, cx < box.x1 ? i + 1 : -1, cy > box.y0 ? i - w : -1, cy < box.y1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && mask[j] && !lab[j]) { lab[j] = id; stack.push(j); }
    }
    parts.push({ id, area, cx: sx / area, cy: sy / area });
  }
  return { lab, parts };
}

const boxOf = (m, w, n) => {
  const b = { x0: w, y0: Infinity, x1: -1, y1: -1 };
  for (let i = 0; i < n; i++) if (m[i]) { const x = i % w, y = (i / w) | 0; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
  return b;
};

// A part of a passage over the cells where `field` equals `id`, keeping the passage's plan.
function part(sh, field, id, box, area, w) {
  const c = passage(field, id, box, sh.amount, area, w);
  for (const k of Object.keys(sh)) if (!SKIP_KEYS.has(k)) c[k] = sh[k];
  return c;
}

/**
 * Cut a passage into its ground and subject parts, and the ground part into its connected regions when it is light.
 * Returns [{ sh, side, cy }]: `side` 'ground' or 'subject', `cy` the part's centroid row. A passage with little on one
 * side (under --minpart of it, or a few cells) goes whole to its larger side; a graded passage is never cut.
 */
function cutPassage(sh, { subject, w, n, field, nextId, light, minPart = 0.08, minRegion = 0.1, film }) {
  const m = sh.mask, all = sh.area || 1;
  let as = 0, sy = 0, gy = 0; const wholeY = () => { let y = 0, a = 0; for (let i = 0; i < n; i++) if (m[i]) { y += (i / w) | 0; a++; } return a ? y / a : 0; };
  if (subject) for (let i = 0; i < n; i++) if (m[i]) { if (subject[i]) { as++; sy += (i / w) | 0; } else gy += (i / w) | 0; }
  const ag = all - as;
  const small = a => a < Math.max(16, minPart * all);
  if (!subject || sh.graded || small(as) || small(ag)) {
    const side = subject && as > ag ? 'subject' : 'ground';
    if (side === 'ground' && light && !sh.graded) return splitRegions(sh, m, { w, n, field, nextId, minRegion, film, all });
    return [{ sh, side, cy: subject ? (side === 'subject' ? sy / Math.max(1, as) : gy / Math.max(1, ag)) : wholeY() }];
  }
  const mass = film?.get(sh);
  const g = new Uint8Array(n), s = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (m[i]) { if (subject[i]) s[i] = 1; else g[i] = 1; }
  const out = [];
  const sid = nextId(); for (let i = 0; i < n; i++) if (s[i]) field[i] = sid;
  const sp = part(sh, field, sid, boxOf(s, w, n), as, w);
  if (mass != null) film.set(sp, mass * as / all);
  const gpart = light ? splitRegions(sh, g, { w, n, field, nextId, minRegion, film, all, mass }) : (() => {
    const gid = nextId(); for (let i = 0; i < n; i++) if (g[i]) field[i] = gid;
    const gp = part(sh, field, gid, boxOf(g, w, n), ag, w);
    if (mass != null) film.set(gp, mass * ag / all);
    return [{ sh: gp, side: 'ground', cy: gy / Math.max(1, ag) }];
  })();
  out.push(...gpart, { sh: sp, side: 'subject', cy: sy / Math.max(1, as) });
  return out;
}

// A ground mask as its connected regions: each region of --minregion of the mask or more is its own part, the rest
// one part together. `all` is the whole passage's area, for the film's mass.
function splitRegions(sh, g, { w, n, field, nextId, minRegion, film, all, mass = film?.get(sh) }) {
  const box = boxOf(g, w, n);
  if (box.x1 < 0) return [];
  const { lab, parts } = components(g, w, box);
  let total = 0; for (const p of parts) total += p.area;
  const big = parts.filter(p => p.area >= minRegion * total);
  if (big.length <= 1 && parts.length === big.length && g === sh.mask) return [{ sh, side: 'ground', cy: parts[0]?.cy ?? 0 }];
  const idOf = new Map(), out = [];
  for (const p of big) { const id = nextId(); idOf.set(p.id, id); out.push({ id, area: p.area, cy: p.cy, sy: 0 }); }
  const rest = parts.filter(p => p.area < minRegion * total);
  if (rest.length) { const id = nextId(); let a = 0, y = 0; for (const p of rest) { idOf.set(p.id, id); a += p.area; y += p.cy * p.area; } out.push({ id, area: a, cy: y / a }); }
  for (let yy = box.y0; yy <= box.y1; yy++) for (let x = box.x0; x <= box.x1; x++) { const i = yy * w + x; if (lab[i]) field[i] = idOf.get(lab[i]); }
  return out.map(o => {
    const b = { x0: w, y0: Infinity, x1: -1, y1: -1 };
    for (let yy = box.y0; yy <= box.y1; yy++) for (let x = box.x0; x <= box.x1; x++) { const i = yy * w + x; if (lab[i] && field[i] === o.id) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (yy < b.y0) b.y0 = yy; if (yy > b.y1) b.y1 = yy; } }
    const p = part(sh, field, o.id, b, o.area, w);
    if (mass != null) film.set(p, mass * o.area / all);
    return { sh: p, side: 'ground', cy: o.cy };
  });
}

/**
 * --ordersubject drawing: the subject cut into the regions its drawing closes off, so its first wash goes on region by
 * region, not in one frame. The lines (on the sheet's grid) are walls; the subject's open cells form components; the
 * `max` largest of at least `minShare` of the subject seed regions, and every other subject cell (walls, small pockets)
 * joins the seed it reaches first inside the subject. Returns a label field (0 off the subject, 1 the largest region)
 * and the regions' areas, or null when fewer than two regions qualify.
 */
export function subjectRegions(subject, lines, { w, n, max = 6, minShare = 0.04, dilate = 0 }) {
  const h = Math.round(n / w), wall = new Uint8Array(n);
  // `dilate` thickens the walls by that many cells, so a drawing's small gaps still close a region
  const put = (x, y) => { const xi = Math.round(x), yi = Math.round(y); for (let dy = -dilate; dy <= dilate; dy++) for (let dx = -dilate; dx <= dilate; dx++) { const X = xi + dx, Y = yi + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) wall[Y * w + X] = 1; } };
  for (const g of lines) for (let k = 1; k < g.points.length; k++) {
    const a = g.points[k - 1], b = g.points[k], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let t = 0; t <= steps; t++) put(a.x + (b.x - a.x) * t / steps, a.y + (b.y - a.y) * t / steps);
  }
  let subjArea = 0; const open = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (subject[i]) { subjArea++; if (!wall[i]) open[i] = 1; }
  if (!subjArea) return null;
  const { lab, parts } = components(open, w, { x0: 0, y0: 0, x1: w - 1, y1: h - 1 });
  const seeds = parts.filter(p => p.area >= minShare * subjArea).sort((a, b) => b.area - a.area || a.cy - b.cy).slice(0, max);
  if (seeds.length < 2) return null;
  const label = new Int32Array(n), of = new Map(seeds.map((p, k) => [p.id, k + 1]));
  let queue = [];
  for (let i = 0; i < n; i++) if (lab[i] && of.has(lab[i])) { label[i] = of.get(lab[i]); queue.push(i); }
  while (queue.length) {
    const next = [];
    for (const i of queue) {
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && subject[j] && !label[j]) { label[j] = label[i]; next.push(j); }
    }
    queue = next;
  }
  // subject pieces no seed reaches: the nearest seed by centroid
  for (let i = 0; i < n; i++) if (subject[i] && !label[i]) {
    const x = i % w, y = (i / w) | 0; let best = 1, bd = Infinity;
    seeds.forEach((p, k) => { const d = (p.cx - x) ** 2 + (p.cy - y) ** 2; if (d < bd) { bd = d; best = k + 1; } });
    label[i] = best;
  }
  const areas = new Array(seeds.length).fill(0); for (let i = 0; i < n; i++) if (label[i]) areas[label[i] - 1]++;
  return { label, areas, subjArea };
}

// A subject part cut by the region labels: one part per region it touches, in region order.
function splitByLabel(p, labels, { w, n, field, nextId, film }) {
  const m = p.sh.mask, mass = film?.get(p.sh), all = p.sh.area || 1, by = new Map();
  for (let i = 0; i < n; i++) if (m[i] && labels[i]) { const r = labels[i]; if (!by.has(r)) by.set(r, []); by.get(r).push(i); }
  if (by.size <= 1) return [{ ...p, region: by.size ? [...by.keys()][0] - 1 : 0 }];
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([r, cells]) => {
    const id = nextId(), b = { x0: w, y0: Infinity, x1: -1, y1: -1 }; let sy = 0;
    for (const i of cells) { field[i] = id; const x = i % w, y = (i / w) | 0; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; sy += y; }
    const c = part(p.sh, field, id, b, cells.length, w);
    if (mass != null) film.set(c, mass * cells.length / all);
    return { sh: c, side: 'subject', cy: sy / cells.length, region: r - 1 };
  });
}

/**
 * The ladder reordered. `layers` is the ladder as painted (detail layers last); returns { layers, summary }, where each
 * new layer is one original layer's parts in one phase (and one region for the ground), carrying `_order`:
 * { phase, region, shoot } (shoot: film a frame when the layer is done, at the end of each ground region).
 */
// `far` (--orderfar 1): the ground's middle values also go on far to near, region by region down the sheet,
// not value by value across it.
export function painterOrder(layers, { subject, w, n, steps, light = 0.25, dark = 0.6, regions = 4, minPart = 0.08, minRegion = 0.1, film = null, subjectLabels = null, far = false, darkFirst = false }) {
  const opts = { darkFirst };
  const h = Math.round(n / w);
  const pieces = [], detail = [];
  layers.forEach((layer, li) => {
    if (layer._detail) { detail.push(layer); return; }
    const band = bandOf(layer.value, steps, { light, dark });
    const field = new Uint16Array(n); let id = 0; const nextId = () => ++id;
    for (const sh of layer.shapes) {
      for (const p0 of cutPassage(sh, { subject, w, n, field, nextId, light: band === 'light' || (far && band === 'mid'), minPart, minRegion, film })) {
        // --ordersubject: the subject's light parts cut by its drawing's regions, each region its own frame
        const split = subjectLabels && band === 'light' && p0.side === 'subject' && !p0.sh.graded ? splitByLabel(p0, subjectLabels, { w, n, field, nextId, film }) : [p0];
        for (const p of split) {
          const phase = band === 'light' ? p.side : band;
          const region = phase === 'ground' || (far && phase === 'mid' && p.side === 'ground') ? Math.min(regions - 1, Math.floor(regions * p.cy / Math.max(1, h))) : phase === 'subject' && subjectLabels ? p.region ?? 0 : 0;
          pieces.push({ ...p, li, layer, band, phase, region });
        }
      }
      if (sh.ids) dropMask(sh);
    }
  });
  // darkFirst: dark values (shadow glazes, accents) before the middle values
  const ORDER = opts.darkFirst ? ['ground', 'subject', 'dark', 'mid', 'detail'] : PHASES;
  const rank = p => ORDER.indexOf(p.phase);
  const side = p => (p.side === 'ground' ? 0 : 1);
  pieces.sort((a, b) => rank(a) - rank(b)
    || (a.phase === 'ground' || a.phase === 'subject' ? a.region - b.region : 0)
    || (far && a.phase === 'mid' ? side(a) - side(b) || (a.side === 'ground' ? a.region - b.region : 0) : 0)
    || a.layer.value - b.layer.value
    || (a.phase === 'mid' || a.phase === 'dark' ? side(a) - side(b) : 0)
    || a.li - b.li
    || a.cy - b.cy);
  const out = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && last._src === p.layer && last._order.phase === p.phase && last._order.region === p.region && last._side === p.side) { last.shapes.push(p.sh); last.area += p.sh.area; continue; }
    const L = p.layer;
    out.push({ value: L.value, pigment: L.pigment, mixIndex: L.mixIndex, mixv: L.mixv, mix: L.mix, amount: L.amount, level: L.level, ids: null, mask: null, shapes: [p.sh], area: p.sh.area, _src: p.layer, _side: p.side, _order: { phase: p.phase, region: p.region, shoot: false, side: p.side } });
  }
  const shotPhase = ph => ph === 'ground' || (ph === 'subject' && subjectLabels);
  out.forEach((L, k) => { const nx = out[k + 1]; if (shotPhase(L._order.phase) && (!nx || nx._order.phase !== L._order.phase || nx._order.region !== L._order.region)) L._order.shoot = true; });
  for (const L of out) { delete L._src; delete L._side; }
  const summary = PHASES.map(ph => {
    const ls = ph === 'detail' ? detail : out.filter(L => L._order.phase === ph);
    let a = 0, c = 0, mass = 0; for (const L of ls) for (const sh of L.shapes) { a += sh.area; c++; mass += film?.get(sh) ?? sh.amount * sh.area; }
    return { phase: ph, layers: ls.length, passages: c, area: a / n, mass };
  });
  return { layers: [...out, ...detail], summary };
}
