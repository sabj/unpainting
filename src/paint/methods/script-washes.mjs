// The wash plan written as a painting script (docs/painting-script.md): passages in the order a painter lays them, each
// with its region (a guide to the hand), its paint, brush, move and kind of mark, what is charged into it while wet and
// what it is laid into. A model that understands painting writes the script, the way a teacher writes out how to paint a
// picture; this module turns it into strokes for the painter (script-marks.mjs) and into the same plan the study wash
// plan makes (study-washes.mjs), so the paint step lays it with the same brush, waits and moves.
//
// One passage is one wash: ONE mix (the script's pigments in its proportions, at the strength whose swatch on white paper
// has the script's lightness), laid in whole strokes placed by the region and never clipped to it. Charges are dabs of
// their own mix dropped into it while wet. A passage `into` the one just before it (wet into wet, or beside damp) is laid
// in the same wet session; any other passage is laid on a dry sheet. Nothing here reads the subject to paint. The subject
// is read only for a check, afterwards: the plan's colour over each passage against the subject's mean colour there.
import { passage } from '../../crop/blockin.mjs';
import { labOf } from '../../eval/colour.mjs';
import { filmLab } from './puddles.mjs';
import { renderLayers } from '../../media/km.mjs';
import { handOf, PRESSURES, sweeps, scattered, lines, written, handled, chargeDab } from './script-marks.mjs';
import { makeMark, MARK_KINDS } from '../marks/index.mjs';
import { checkErase, eraseStrokes, eraseLayer } from './erase-passage.mjs';

/** Swatch lightness (L* on white paper) for each dilution word. */
export const DILUTION_L = Object.freeze({ 'very pale': 88, pale: 79, medium: 66, strong: 52, rich: 40, dark: 30 });
/** Water in the brush for each load word (share of its capacity). */
const LOAD = Object.freeze({ flooded: 0.88, loaded: 0.68, damp: 0.42, dry: 0.22 });
const KINDS = new Set(['wash', 'strokes', 'touches', 'lines', 'erase']);
const PAPERS = new Set(['dry', 'damp', 'wet']);
import { TOUCH_LEAST_MM2, predictedTouchMm2 } from './tiny-touch.mjs';
import { finalWidthOf, cellsOfFinal } from './look-scale.mjs';

/** A stroke laid into its own wet bed covers at least this many sheet cells (study-washes.mjs WET_LEAST_CELLS). */
const WET_LEAST_CELLS = 40;
/** A charge's brush when the script names none (mm). */
const CHARGE_BRUSH_MM = 6;
/** Phase of each stage, as the paint step reads it. */
const PHASE = [null, 'light', 'light', 'shadow', 'mid', 'shadow'];
/** A wash's brush: about this share of the wash's width across its direction (a brush a third of the shape's width). */
const WASH_BRUSH_SHARE = 1 / 3;

/**
 * A passage's mix: the script's pigments in its proportions, at the strength whose film on white paper reaches the
 * swatch's lightness (or the dilution's). `pigments` each carry their box `key`. Amounts per pigment, in their order.
 */
function scriptMix(paint, pigments) {
  const k = pigments.length, keys = pigments.map(p => p.key), white = [255, 255, 255], base = new Array(k).fill(0);
  for (const [key, parts] of Object.entries(paint.pigments)) { const j = keys.indexOf(key); if (j < 0) throw Error(`painting script: pigment ${key} is not in the box`); base[j] += Math.max(0, Number(parts) || 0); }
  const t = base.reduce((a, v) => a + v, 0); if (!(t > 0)) throw Error('painting script: pigment parts must be positive');
  const sw = hexRgb(paint.swatch), target = sw ? labOf(sw, 0, white) : null, want = target ? target[0] : DILUTION_L[paint.dilution] ?? DILUTION_L.medium;
  // the strength whose film on white reaches the lightness wanted, for proportions `unit`
  const atL = unit => {
    const Lat = s => filmLab(unit.map(v => v * s), pigments, white)[0];
    let lo = 0.01, hi = 32; if (Lat(hi) > want) return unit.map(v => v * hi); if (Lat(lo) < want) return unit.map(v => v * lo);
    for (let it = 0; it < 14; it++) { const mid = Math.sqrt(lo * hi); if (Lat(mid) > want) lo = mid; else hi = mid; }
    return unit.map(v => v * Math.sqrt(lo * hi));
  };
  let unit = base.map(v => v / t);
  // with a swatch, the script's own pigments are re-proportioned (never others added) so the film's hue meets the swatch's:
  // a painter mixes to the colour on the scrap, not to the parts written down. Parts the script gave are a start, and each
  // named pigment keeps at least a tenth of its written share.
  const named = base.map(v => v > 0);
  if (target && named.filter(Boolean).length > 1) {
    const err = u => { const m = atL(u), c = filmLab(m, pigments, white); return Math.hypot(c[1] - target[1], c[2] - target[2]) + 0.5 * Math.abs(c[0] - target[0]); };
    let best = err(unit), step = 0.5;
    for (let round = 0; round < 6; round++, step /= 2) for (let j = 0; j < k; j++) if (named[j]) for (const dir of [1, -1]) {
      const u = unit.map((v, q) => (q === j ? Math.max(0.1 * base[q] / t, v * (1 + dir * step)) : v)), su = u.reduce((a, v) => a + v, 0), un = u.map(v => v / su), e = err(un);
      if (e < best - 1e-3) { best = e; unit = un; }
    }
  }
  return atL(unit);
}

/** The colour a passage's mix makes as one film on white paper (sRGB): what the painter will lay, for the preview. */
export function scriptMixRGB(paint, pigments) {
  const mix = scriptMix(paint, pigments), px = renderLayers([pigments.map((_, j) => Float32Array.of(mix[j]))], pigments.map(q => ({ K: q.K, S: q.S ?? [0, 0, 0] })), Uint8ClampedArray.of(255, 255, 255), 1, 1);
  return Array.from(px.slice(0, 3));
}

/** sRGB [r, g, b] from '#rrggbb'. */
export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim()); if (!m) return null;
  const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * A first-format script (painting-script 1: `mark`, `move`, `strokes` as a count) in the second format's terms
 * (painting-script 2: `kind`, `paper`, `handling`, `count`), so both are laid by one executor.
 */
export function upgradeScript(script) {
  if (script?.format !== 'painting-script 1') return script;
  const kind = { sweep: 'wash', tapered: 'strokes', dab: 'touches', wedge: 'touches', scumble: 'touches', line: 'lines' };
  const press = { tapered: [0.15, 1, 0.7, 0.1], dab: [0.1, 1, 0.1], wedge: [0.2, 0.6, 1, 0.85], scumble: [0.6, 0.8, 0.6], line: [0.3, 0.75, 0.6, 0.3], sweep: [0.8, 0.8] };
  return { ...script, format: 'painting-script 2', lights: [], passages: script.passages.map(p => {
    const scale = { light: 0.6, medium: 0.8, firm: 1 }[p.pressure] ?? 0.8;
    return { ...p, kind: kind[p.mark], count: p.strokes, strokes: undefined,
      paper: p.move === 'wet into wet' ? 'wet' : p.move === 'beside damp' ? 'damp' : 'dry',
      handling: { direction: p.direction ?? 0, lengthMm: p.lengthMm, pressure: press[p.mark].map(v => v * scale), hold: p.mark === 'scumble' ? 'side' : 'upright', load: p.move === 'dry brush' ? 'dry' : p.move === 'wet into wet' ? 'flooded' : 'loaded', path: 'straight', speed: 'medium' },
      character: { spread: p.mark === 'tapered' ? 'scattered' : 'clustered', size: 'varied' } };
  }) };
}

/** The script checked: every field the executor reads, with what is wrong said plainly. Returns the passages. */
export function checkScript(script, { keys, sheetWidthMm }) {
  if (!script || script.format !== 'painting-script 2') throw Error('painting script: format must be "painting-script 2" (or 1, upgraded)');
  if (!(Math.abs((script.sheet?.widthMm ?? 0) - sheetWidthMm) <= 0.5)) throw Error(`painting script: written for a sheet ${script.sheet?.widthMm} mm wide, painted on ${sheetWidthMm} mm`);
  const ids = new Set(), brushes = script.brushes ?? {};
  if (!Object.keys(brushes).length) throw Error('painting script: no brushes');
  for (const [name, b] of Object.entries(brushes)) if (!(b?.widthMm > 0)) throw Error(`painting script: brush ${name} has no width`);
  (script.passages ?? []).forEach((p, i) => {
    const at = `painting script, passage ${p?.id ?? i}`;
    if (!p?.id || ids.has(p.id)) throw Error(`${at}: needs a unique id`); ids.add(p.id);
    if (!KINDS.has(p.kind)) throw Error(`${at}: kind ${p.kind} is not one of ${[...KINDS].join(', ')}`);
    if (p.kind === 'erase') { checkErase(p, at); return; }
    if (p.paper != null && !PAPERS.has(p.paper)) throw Error(`${at}: paper ${p.paper} is not dry, damp or wet`);
    if (p.brush != null && !brushes[p.brush]) throw Error(`${at}: brush ${p.brush} is not in the kit`);
    if (p.brush == null && p.kind !== 'wash') throw Error(`${at}: a ${p.kind} passage names its brush`);
    const pig = Object.entries(p.paint?.pigments ?? {});
    if (!pig.length) throw Error(`${at}: no pigments`);
    for (const [k] of pig) if (!keys.includes(k)) throw Error(`${at}: pigment ${k} is not in the painter's box (${keys.join(', ')}); run with --paints naming the script's palette`);
    for (const c of p.charges ?? []) for (const [k] of Object.entries(c.pigments ?? {})) if (!keys.includes(k)) throw Error(`${at}: charge pigment ${k} is not in the box`);
    const given = Array.isArray(p.strokes) && p.strokes.length;
    if (!given && (p.kind === 'lines' ? !(p.paths?.length) : !(regionsOf(p).length))) throw Error(`${at}: a ${p.kind} passage needs ${p.kind === 'lines' ? 'paths' : 'a region'} or its strokes`);
  });
  if (!ids.size) throw Error('painting script: no passages');
  return script.passages;
}

const regionsOf = p => (p.regions?.length ? p.regions : p.region?.length ? [p.region] : []).filter(P => P?.length >= 3);
const lightsOf = script => (script.lights ?? []).map(l => l.region ?? l).filter(P => P?.length >= 3);

/** The brush that lays a wash: the script's, or the kit's nearest to a third of the wash's width across its direction. */
function washBrush(p, brushes) {
  if (p.brush) return brushes[p.brush].widthMm;
  const deg = Number(p.handling?.direction ?? 0) || 0, a = deg * Math.PI / 180, vx = -Math.sin(a), vy = Math.cos(a);
  let lo = Infinity, hi = -Infinity; for (const P of regionsOf(p)) for (const [x, y] of P) { const v = x * vx + y * vy; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const want = Math.max(2, (hi - lo) * WASH_BRUSH_SHARE), kit = Object.values(brushes).map(b => b.widthMm).sort((x, y) => x - y);
  return kit.filter(v => v <= want).at(-1) ?? kit[0];
}

/** A named mark's usual length in brush widths, when the script gives none (the shared library's kinds, src/paint/marks). */
const MARK_LEN = Object.freeze({ sweep: 6, taper: 5, reverse: 4, leaf: 2.4, comma: 2.2, teardrop: 2, dot: 0.8, touch: 1.6, line: 10, edge: 8, wedge: 2, swell: 8, ribbon: 6, contour: 8, hook: 4, bar: 6,
  hatch: 2.5, scumble: 3, drag: 6, 'flying-white': 6, grass: 5, 'leaf-stem': 4, branch: 10, 's-stroke': 6, ring: 4, 'leaf-group': 4 });
/** Marks laid with a nearly dry brush. */
const DRY_MARKS = new Set(['drag', 'flying-white', 'scumble', 'ring']);
const LOAD_SHARE = Object.freeze({ flooded: 1, loaded: 0.75, damp: 0.45, dry: 0.2 });

/**
 * A stroke the executor placed (where it lands, its direction and length, the way its path bends) laid as a named mark
 * of the shared mark library (src/paint/marks): the library sets the pressure rising and falling along it, the hand's
 * speed, a flat's blade and the stroke's water. Returns a list (a hatch, a branch or a leaf group is several strokes).
 */
function asLibraryMark(kind, st, widthMm, { seed, bend = 0, load = 0.75, rng = null }) {
  const P = st.points, a = P[0], b = P.at(-1), len = Math.max(0.5, Math.hypot(b[0] - a[0], b[1] - a[1])), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // each touch its own: width, length, turn, bend and load varied about the passage's handling (never one stamp repeated)
  const v = rng ? { w: rng.range(0.65, 1.35), l: rng.range(0.6, 1.5), t: rng.normal() * 0.18, b: rng.range(-0.35, 0.35), ld: rng.range(0.8, 1.15) } : { w: 1, l: 1, t: 0, b: 0, ld: 1 };
  return makeMark(kind, { x: c[0], y: c[1], length: len * v.l, width: widthMm * v.w, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) + v.t, seed, bend: Math.max(-1, Math.min(1, bend + v.b)), load: Math.min(1, load * v.ld) });
}

/** The strokes of one passage (mm), from its kind, brush and handling; no picture read. */
export function passageStrokes(p, brushes, seed = 0, sheetLights = [], { hand = 1 } = {}) {
  const st = placedStrokes(p, brushes, seed, sheetLights, hand), kind = p.handling?.mark;
  // a named mark from the shared library, unless the author wrote the pressure out (then the author's handling is laid)
  if (!kind || !MARK_KINDS[kind] || p.kind === 'wash' || Array.isArray(p.handling?.pressure)) return st;
  if (p.kind === 'lines' && p.paths?.some(P => P.length > 2)) return st;
  const rng = handOf(`${seed}/${p.id}/marks`), path = p.handling?.path, load = LOAD_SHARE[p.handling?.load] ?? (DRY_MARKS.has(kind) ? 0.3 : 0.75);
  return st.flatMap((q, k) => q.written ? [q] : asLibraryMark(kind, q, 2 * q.radiusMm, { seed: (seed * 7919 + k * 31 + [...p.id].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) | 0,
    bend: path === 'straight' ? 0.05 * (rng.next() < 0.5 ? -1 : 1) : path === 'curved' || path === 'flick' ? rng.range(0.4, 0.8) * (rng.next() < 0.5 ? -1 : 1) : 0, load, rng: p.kind === 'touches' || p.kind === 'strokes' ? rng : null }));
}

function placedStrokes(p, brushes, seed = 0, sheetLights = [], hand = 1) {
  // the paper this passage keeps: the sheet's lights and its own reserves (shapes it is laid round, painted later)
  const lights = [...sheetLights, ...(p.reserveRegions ?? []).filter(P => P?.length >= 3)];
  const named = {}, rng = handOf(`${seed}/${p.id}`), h = { ...named, ...(p.handling ?? {}) }, ch = p.character ?? {}, polys = regionsOf(p);
  const deg = Number(h.direction ?? 0) || 0, pressure = Array.isArray(h.pressure) ? h.pressure.map(Number) : PRESSURES[h.pressure] ?? PRESSURES.medium;
  const widthMm = p.kind === 'wash' ? washBrush(p, brushes) : brushes[p.brush].widthMm;
  const style = { pressure, path: h.path, hold: h.hold, speed: h.speed, start: h.start };
  // strokes the author wrote one by one: point by point with a pressure at each, or from a start along a direction
  if (Array.isArray(p.strokes) && p.strokes.length) return p.strokes.map(s => {
    const w = s.brush && brushes[s.brush] ? brushes[s.brush].widthMm : widthMm;
    if (Array.isArray(s.points) && s.points.length >= 2) return { ...written(s.points, { widthMm: w, rng }), written: true };
    const [x, y] = s.at ?? s.from ?? [0, 0];
    return handled(x, y, { ...style, deg: Number(s.direction ?? deg), len: Number(s.lengthMm ?? h.lengthMm ?? 3 * w), r: w / 2, pressure: Array.isArray(s.pressure) ? s.pressure.map(Number) : pressure, path: s.path ?? h.path, from: !!s.from, rng });
  });
  const n = Math.max(1, Math.round(p.count ?? 1)), lengthMm = Number(h.lengthMm) || (MARK_LEN[h.mark] ? MARK_LEN[h.mark] * widthMm : p.kind === 'touches' ? 2.6 * widthMm : 4 * widthMm);
  switch (p.kind) {
    case 'wash': return sweeps(polys, { widthMm, deg, pressure: Math.max(0.6, Math.max(...pressure)), lights, rng, hand });
    case 'strokes': return scattered(polys, { ...style, n, widthMm, deg, lengthMm, size: ch.size, spread: ch.spread ?? 'scattered', denser: ch.denser, lights, rng });
    case 'touches': return scattered(polys, { ...style, n, widthMm, deg, lengthMm, size: ch.size ?? 'varied', spread: ch.spread ?? 'clustered', denser: ch.denser, touches: true, lights, rng });
    case 'lines': return lines(p.paths, { widthMm, pressure, hold: h.hold, rng });
  }
  return [];
}

/** The painter's move, water and phase for a passage: from its paper, load, stage and what it goes into. */
function moveOf(p, joins) {
  const load = p.handling?.load ?? (['drag', 'flying-white'].includes(p.handling?.mark) ? 'dry' : undefined), water = LOAD[load];
  if (load === 'dry') return { move: 'dry on dry', water: LOAD.dry, phase: null };
  if (p.paper === 'wet') return { move: 'wet on wet', water: water ?? 0.88, phase: null, ownBed: !joins };
  if (p.paper === 'damp' && joins) return { move: 'beside damp', water: water ?? 0.62, phase: null };
  // a lost edge on dry paper: the paint goes into a damp bed of clean water laid under its own footprint first, so its
  // edges run soft (a painter softens them with a damp brush; laid into damp paper they never harden)
  if (p.edges === 'lost') return { move: 'wet on wet', water: water ?? 0.75, phase: null, ownBed: true };
  return (p.stage ?? 2) === 3 ? { move: 'wet on dry', water: water ?? 0.58, phase: 'shadow' } : { move: 'wet on dry', water: water ?? 0.62, phase: null };
}

/** The lap of a wash's lanes (script-marks.mjs sweeps), the one most of its strokes' length is laid at; null for strokes that state none. */
function lapOf(strokes) {
  const by = new Map();
  for (const st of strokes) { if (!Number.isFinite(st.lap)) continue; let len = 0; for (let k = 1; k < st.points.length; k++) len += Math.hypot(st.points[k][0] - st.points[k - 1][0], st.points[k][1] - st.points[k - 1][1]); by.set(st.lap, (by.get(st.lap) ?? 0) + len); }
  return by.size ? [...by].sort((a, b) => b[1] - a[1])[0][0] : null;
}

/** The cells (w x h) a list of strokes touches: each point's footprint, r (0.25 + 0.75 p), joined along the stroke. */
export function footprint(strokes, w, h, cellMm) {
  const m = new Uint8Array(w * h);
  const disc = (x, y, r) => { const cx = x / cellMm, cy = y / cellMm, rc = Math.max(0.5, r / cellMm); for (let yy = Math.max(0, Math.floor(cy - rc)); yy <= Math.min(h - 1, Math.ceil(cy + rc)); yy++) for (let xx = Math.max(0, Math.floor(cx - rc)); xx <= Math.min(w - 1, Math.ceil(cx + rc)); xx++) if ((xx + .5 - cx) ** 2 + (yy + .5 - cy) ** 2 <= rc * rc) m[yy * w + xx] = 1; };
  for (const st of strokes) {
    const P = st.points;
    for (let k = 0; k < P.length; k++) {
      const a = P[k], b = P[Math.min(P.length - 1, k + 1)], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cellMm * 1.5)));
      for (let s = 0; s < steps; s++) { const t = s / steps, p = (a[2] ?? 1) + ((b[2] ?? 1) - (a[2] ?? 1)) * t; disc(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, st.radiusMm * (a[4] ?? 1) * (0.25 + 0.75 * Math.min(1, p))); }
    }
  }
  return m;
}

/**
 * The plan of a painting script, in the shape the paint step takes (study-washes.mjs planStudyWashes returns the same).
 * `script`: the parsed script; `pigments`: the painter's box (each with its `key`); `rgb`: the subject on the sheet's
 * grid, read only for the colour check written to the plan's summary.
 */
export function planScriptWashes({ script: given, k, w, h, pigments, paperRGB = null, sheetWidthMm = 280, rgb = null, density = null, inkValue = null, seed = 0, hand = 1, touchLeastMm2 = TOUCH_LEAST_MM2, finalWidth = null }) {
  // (a look, look-scale.mjs: what is small is what will be small on the final sheet's cells)
  const finalCellMm = sheetWidthMm / finalWidthOf(w, finalWidth), wetLeastCells = cellsOfFinal(WET_LEAST_CELLS, w, finalWidthOf(w, finalWidth));
  const n = w * h, cellMm = sheetWidthMm / w, paperCol = paperRGB ?? [252, 251, 248], keys = pigments.map(p => p.key);
  let script = given;
  if (pigments.length !== k || k < 1) throw Error('the script wash plan needs the pigments');
  script = upgradeScript(script);
  const passages = checkScript(script, { keys, sheetWidthMm }), brushes = script.brushes, lights = lightsOf(script);
  const white = [255, 255, 255];
  // a mix of the script's pigments, at the strength whose film on white paper reaches the swatch's lightness
  const mixOf = paint => scriptMix(paint, pigments);
  const laid = Array.from({ length: k }, () => new Float32Array(n)), labels = new Int32Array(n);
  // the paint of the wet session now open, by cell (all pigments together): what a passage of this session is laid into
  const wetLaid = new Float32Array(n);
  const layers = [], instructions = [], mixes = [], polygons = [], checks = [];
  let session = null, strokeCount = 0, charges = 0, label = 0;
  const dropped = [], laidDry = [], after = [], tinyTouches = [];
  // the plan's own colour over a passage's cells once its whole wet session is laid (it, its charges and the passages
  // laid into it: they dry together, and the plate is measured when the sheet is next dry): the film of everything
  // planned there so far, on this paper, as sRGB and then Lab against white (what the plate is measured against)
  const planColour = sh => {
    { const u = new Array(k).fill(0); let c = 0; for (let i = 0; i < n; i++) if (sh.ids?.[i]) { c++; for (let j = 0; j < k; j++) u[j] += laid[j][i]; }
      if (c) { const px = renderLayers([pigments.map((_, j) => Float32Array.of(u[j] / c))], pigments.map(q => ({ K: q.K, S: q.S ?? [0, 0, 0] })), Uint8ClampedArray.from(paperCol), 1, 1);
        sh._valuePlan.script.planned = labOf(px, 0, [255, 255, 255]).map(v => +v.toFixed(2)); sh._valuePlan.script.plannedRGB = Array.from(px.slice(0, 3)); } }
  };
  const close = () => {
    if (!session) return;
    // A passage's small strokes (laid wet on dry, on the paper as it is) are laid when its sitting is over. Laid straight
    // after their passage they stood between a wash and the passage meant to go into it while damp: a stroke laid wet
    // on dry waits for dry paper, so the painter dried the whole sheet for a touch of a few cells and the damp passage,
    // charged for a damp wash, went onto dry paper and laid twice its paint (or not, as the touch happened to fall).
    session.list.push(...after.splice(0).map(f => f()).filter(Boolean));
    if (!session.list.length) { session = null; wetLaid.fill(0); return; }
    for (const sh of session.list) planColour(sh);
    const list = session.list, area = list.reduce((a, s) => a + s.area, 0), mix = new Array(k).fill(0);
    for (const s of list) s.mix.forEach((v, j) => { mix[j] += v * s.area / area; });
    const t = mix.reduce((a, v) => a + v, 0) || 1, first = list[0]._valuePlan;
    layers.push({ value: session.stage, pigment: mix.indexOf(Math.max(...mix)), mixId: first.mixId, shapes: list, mix: mix.map(v => v / t), amount: list.reduce((a, s) => a + s.amount * s.area, 0) / area, area, _order: { phase: session.stage <= 2 ? 'ground' : session.stage === 3 ? 'mid' : 'dark', region: 0, shoot: true }, _valuePhase: first.phase, _script: session.ids });
    session = null; wetLaid.fill(0);
  };
  // one wash of the plan: its strokes, its mix, its move; the cells its strokes touch are its passage (for the ledger and
  // the wet and dry checks, never a clip)
  const wash = (p, stage, strokes0, mix, how, { kind, what, charge = false, smalls = false }) => {
    // a stroke that lands on no cell of the sheet (a lane run past the edge) cannot be laid: it is reported, with its
    // passage, never dropped quietly. A stroke too small for its own wet bed to be judged (under WET_LEAST_CELLS, as the
    // study plan) is still laid: on the paper as it is, after the passage's other strokes, and reported
    const cellsOf = st => { const m = footprint([st], w, h, cellMm); let c = 0; for (let i = 0; i < n && c < wetLeastCells; i++) c += m[i]; return c; };
    const counts = strokes0.map(cellsOf), offSheet = strokes0.filter((_, q) => counts[q] === 0);
    // A stroke much shorter than its brush is wide touches only the brush's tip, far less than the footprint drawn for
    // it (tiny-touch.mjs): under touchLeastMm2 it is a tiny touch. It is told here, before anything is painted, and is
    // never given a wet bed: in a passage laid into its own bed it joins the small strokes laid on the paper as it is.
    const touch = smalls ? strokes0.map(() => Infinity) : strokes0.map((st, q) => (counts[q] > 0 ? predictedTouchMm2(st, finalCellMm) : Infinity));
    const tiny = strokes0.map((_, q) => touch[q] < touchLeastMm2);
    const small = how.move === 'wet on wet' ? strokes0.filter((_, q) => counts[q] > 0 && (counts[q] < wetLeastCells || tiny[q])) : [];
    const strokes = strokes0.filter((_, q) => counts[q] >= (how.move === 'wet on wet' ? wetLeastCells : 1) && !(how.move === 'wet on wet' && tiny[q]));
    const lengthMm = st => st.points.reduce((a, pt, i) => a + (i ? Math.hypot(pt[0] - st.points[i - 1][0], pt[1] - st.points[i - 1][1]) : 0), 0);
    strokes0.forEach((st, q) => {
      if (!tiny[q]) return;
      const t = { passage: p.id, kind, move: how.move, mm2: +touch[q].toFixed(2), leastMm2: touchLeastMm2, lengthMm: +lengthMm(st).toFixed(2), brushMm: +(2 * st.radiusMm).toFixed(1), atMm: st.points[0].slice(0, 2).map(v => +v.toFixed(1)) };
      tinyTouches.push(t);
      console.log(`PAINTING SCRIPT, TINY TOUCH: passage ${p.id} (${kind}): a stroke ${t.lengthMm} mm long with a ${t.brushMm} mm brush at (${t.atMm.join(', ')}) mm will touch about ${t.mm2} mm2 (under ${touchLeastMm2} mm2): the brush lands on its tip and lifts. It is laid as a plain touch with no wet bed; lengthen it, use a smaller brush, or drop it`);
    });
    const where = st => `(${st.points[0][0].toFixed(1)}, ${st.points[0][1].toFixed(1)}) mm`;
    for (const st of offSheet) { dropped.push({ passage: p.id, kind, reason: 'lands on no cell of the sheet', at: st.points[0].slice(0, 2) }); console.log(`PAINTING SCRIPT, STROKE NOT LAID: passage ${p.id} (${kind}), a stroke from ${where(st)}: it lands on no cell of the sheet`); }
    if (small.length) {
      console.log(`painting script: passage ${p.id} (${kind}), ${small.length} stroke${small.length > 1 ? 's' : ''} under ${wetLeastCells} cells or a tiny touch (from ${small.slice(0, 4).map(where).join('; ')}${small.length > 4 ? '; ...' : ''}): too small for a wet bed, laid on the paper as it is`);
      laidDry.push({ passage: p.id, kind, strokes: small.length });
      after.push(() => wash({ ...p, id: `${p.id}-small` }, stage, small, mix, { move: 'wet on dry', water: how.water, phase: how.phase }, { kind, what: `${what} (its small strokes)`, charge, smalls: true }));
    }
    if (!strokes.length) { if (!small.length) console.log(`PAINTING SCRIPT, NOTHING LAID: passage ${p.id} (${kind}) has no stroke that touches the sheet (${strokes0.length} placed); skipped`); return null; }
    const ids = footprint(strokes, w, h, cellMm), box = { x0: w, y0: h, x1: -1, y1: -1 }; let area = 0;
    for (let i = 0; i < n; i++) if (ids[i]) { area++; const x = i % w, y = (i / w) | 0; if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y; }
    const strength = mix.reduce((a, v) => a + v, 0), mixId = mixes.length; mixes.push({ mix: mix.map(v => v / strength), strength, stage });
    // what of this session's paint, still wet, already lies under the passage: the share of its cells that hold some,
    // and the film there (damp-swatch.mjs charges a passage laid into wet paint by them)
    let underCells = 0, underSum = 0; for (let i = 0; i < n; i++) if (ids[i] && wetLaid[i] > 0) { underCells++; underSum += wetLaid[i]; }
    const under = { share: +(underCells / area).toFixed(3), film: underCells ? +(underSum / underCells).toFixed(4) : 0 };
    label++; for (let i = 0; i < n; i++) if (ids[i]) { labels[i] = label; wetLaid[i] += strength; for (let j = 0; j < k; j++) laid[j][i] += mix[j]; }
    const sh = passage(ids, 1, box, strength, area, w); sh.mix = [...mix]; sh.graded = null; sh._follow = true; sh.firstWash = stage <= 2; sh._opening = 1; sh.dryAfter = true;
    const phase = how.phase ?? PHASE[stage], wet = how.move !== 'wet on dry' && how.move !== 'dry on dry';
    const areaMm2 = area * cellMm * cellMm;
    const intent = { id: `${phase}/s${stage}/m${mixId}/${p.id}${charge ? '-charge' : ''}`, phase, colour: null, valueBand: stage, stage, mixId, thing: what, kind, studyLayer: 1, areaMm2: +areaMm2.toFixed(1), regions: [], crossesRegions: false,
      referenceCue: `painting script passage ${p.id}: ${p.what ?? ''}`, intendedResult: p.why ?? p.what ?? '', cool: false, shaped: true, subject: script.subject ?? null, move: how.move,
      paperBefore: wet ? 'wet: the passage just laid, or clean water' : 'fully dry', baseBefore: wet ? 'wet' : 'fully dry',
      brush: { kind: p.brush ?? 'sized to the wash', contact: p.handling?.hold === 'side' ? 'side/belly' : 'point', width: `${strokes[0]?.radiusMm * 2} mm`, widthMm: strokes[0]?.radiusMm * 2 },
      resolution: { question: 'wash', minimumWashBodyCells: 4, estimatedSupportWidthCells: 0, estimateMethod: 'script', mmPerCell: cellMm },
      layer: stage, break: null, load: { water: how.water, pigment: 'the mix at its strength; calibrated delivery', reload: 'existing finite instrument route' },
      edges: { hardCells: [], softCells: [], policy: p.edges ?? 'mixed' }, outline: [], strokes, softEdges: [], depthMm: 0, uncoveredShare: 0, widestBrushMm: Math.max(...strokes.map(st => 2 * st.radiusMm)),
      protectedLights: p.leave ? [p.leave] : [], failureSigns: 'Lost lights, muddy overlaps, stripes.', stop: 'after the passage', script: { passage: p.id, kind: p.kind, paper: p.paper ?? 'dry', into: p.into ?? null, wait: p.wait ?? null, underShare: under.share, underFilm: under.film, glaze: p.glaze ?? null, handling: p.handling ?? null } };
    { const laneLap = kind === 'wash' ? lapOf(strokes) : null; if (laneLap != null) intent.laneLap = laneLap; } sh._valuePlan = intent; instructions.push({ ...intent, area, plannedPigmentMass: strength * area });
    polygons.push({ stage, thing: what, kind, colour: null, loops: (charge ? [] : regionsOf(p)).map(P => ({ points: P })) });
    strokeCount += strokes.length;
    return sh;
  };
  let prev = null; const washed = [], erases = [];
  for (const p of passages) {
    const stage = Math.max(1, Math.min(5, Math.round(p.stage ?? 2)));
    // an erase: the session before it is closed and dried (unless it says otherwise), and the eraser goes over the
    // sheet as it is; what it will take is told from the paint planned under its path so far
    if (p.kind === 'erase') {
      close();
      const strokes = eraseStrokes(p, seed), ids = footprint(strokes, w, h, cellMm); let cells = 0, painted = 0;
      for (let i = 0; i < n; i++) if (ids[i]) { cells++; if (laid.some(L => L[i] > 0)) painted++; }
      const afterWet = prev != null && prev.kind !== 'erase'; // every passage of paint leaves the sheet wet
      const e = eraseLayer(p, strokes, { stage, overPaint: cells ? painted / cells : 0, afterWet, areaMm2: cells * cellMm * cellMm });
      if (e.instruction.erase.warning) console.log(e.instruction.erase.warning);
      layers.push(e.layer); instructions.push(e.instruction); erases.push(e.instruction); strokeCount += strokes.length; prev = p;
      continue;
    }
    // what the sheet does before this passage: `wait` dry (the default: every earlier passage dried), damp (no drying: it
    // is laid while what is down has just lost its shine, as the next passage of one sitting) or none (straight on)
    const wait = p.wait ?? (p.into != null ? 'damp' : 'dry');
    const joins = prev != null && prev.kind !== 'erase' && (wait === 'damp' || wait === 'none') && (p.into == null || prev.id === p.into);
    if (p.into != null && !joins) console.log(`painting script: ${p.id} is to go into ${p.into}, which is not the passage just before it (${prev?.id ?? 'none'}); laid on its own, on a dry sheet`);
    const own = moveOf({ ...p, paper: p.paper ?? (joins && wait === 'damp' ? 'damp' : 'dry') }, joins);
    if (!joins) close();
    const strokes = passageStrokes(p, brushes, seed, lights, { hand }), mix = mixOf(p.paint);
    const sh = wash(p, stage, strokes, mix, own, { kind: p.kind, what: `${p.id}: ${p.what ?? ''}` });
    prev = p;
    if (!sh && !after.length) continue;
    if (!session) session = { stage, list: [], ids: [] };
    if (sh) session.list.push(sh); session.ids.push(p.id);
    if (!sh) continue;
    // charges: each `at` a dab of the charge's own mix, dropped into this passage while it is wet
    const rng = handOf(`${seed}/${p.id}/charges`);
    for (const [ci, c] of (p.charges ?? []).entries()) {
      if (!c.at?.length) continue;
      const cw = brushes[c.brush]?.widthMm ?? CHARGE_BRUSH_MM;
      const cs = c.at.map(([x, y]) => chargeDab(x, y, { widthMm: cw, rng }));
      const ch = wash({ ...p, id: `${p.id}-c${ci + 1}` }, stage, cs, mixOf({ pigments: c.pigments, dilution: c.dilution ?? 'medium', swatch: c.swatch }), { move: 'wet on wet', water: 0.88, phase: PHASE[stage] }, { kind: 'charge', what: `${p.id}: charge ${ci + 1} dropped in while wet`, charge: true });
      if (ch) { session.list.push(ch); charges++; }
    }
    washed.push([p.id, sh]);
  }
  close();
  // the check (never fed back): the plan's finished film over each passage's cells against the subject's mean colour there
  if (rgb) for (const [id, sh] of washed) {
    const lin = [0, 0, 0], u = new Array(k).fill(0); let c = 0;
    for (let i = 0; i < n; i++) if (sh.ids?.[i]) { c++; for (let q = 0; q < 3; q++) lin[q] += (rgb[i * 3 + q] / 255) ** 2.2; for (let j = 0; j < k; j++) u[j] += laid[j][i]; }
    if (c) { const mean = lin.map(v => Math.round(255 * (v / c) ** (1 / 2.2))), a = labOf(mean, 0, paperCol), b = filmLab(u.map(v => v / c), pigments, paperCol); checks.push({ id, subjectL: +a[0].toFixed(1), planL: +b[0].toFixed(1), dE: +Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]).toFixed(1) }); }
  }
  const covered = laid[0].map((_, i) => (laid.some(L => L[i] > 0) ? 1 : 0)).reduce((a, v) => a + v, 0);
  const summary = { source: 'painting script', author: script.author ?? null, passages: passages.length, sessions: layers.length, washes: instructions.filter(q => q.kind !== 'charge' && q.kind !== 'erase').length, erases: erases.length, charges, stages: new Set(layers.map(l => l.value)).size, plannedStrokes: strokeCount, paintedShare: covered / n,
    kinds: passages.reduce((a, p) => ({ ...a, [p.kind]: (a[p.kind] ?? 0) + 1 }), {}), papers: passages.reduce((a, p) => ({ ...a, [p.paper ?? 'dry']: (a[p.paper ?? 'dry'] ?? 0) + 1 }), {}), lights: lights.length, strokesNotLaid: dropped, smallStrokesLaidDry: laidDry, ...(tinyTouches.length ? { tinyTouches } : {}), colourCheck: checks,
    colourCheckMedianDE: checks.length ? [...checks].sort((a, b) => a.dE - b.dE)[checks.length >> 1].dE : null };
  console.log(`script washes: ${passages.length} passages by ${script.author ?? 'an unnamed author'} in ${layers.length} wet sessions; ${strokeCount} strokes, ${charges} charges; kinds ${JSON.stringify(summary.kinds)}; paper ${JSON.stringify(summary.papers)}; ${lights.length} lights kept; painted ${(100 * summary.paintedShare).toFixed(0)}% of the sheet; colour against the subject's mean over each passage, median dE ${summary.colourCheckMedianDE}`);
  const regions = { source: 'painting script', labels, regions: Array.from({ length: label }, (_, i) => ({ id: i + 1, colour: null, paper: false, parent: null, share: 0 })) };
  return { opticsReport: null, paper: null, style: null, layers, instructions, protectedCells: null, value: inkValue ?? { values: density ?? new Float32Array(n) }, regions, omittedDemand: 0, lightShapes: [], summary, mixes, polygons,
    geometry: 'Washes from a painting script: passages written by an author in painting order, each one mix laid in whole strokes of a named brush and mark, placed by a loose region and never clipped to it; charges dropped in while wet; a passage laid into the one before it while wet, every other on a dry sheet.' };
}
