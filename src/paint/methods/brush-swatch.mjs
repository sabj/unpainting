// The narrowest line the dry brush lays, measured on a swatch at this run's density. A mark can be no thinner than the
// brush leaves it, and the brush's contact, the paper's tooth and the cell size set that, not the plan. The swatch lays
// strokes of white gouache on a dark ground at a set of brush radii on a scrap sheet of the same paper and cell size,
// dries it, and reads what the paint did: the width of the line (its mean cross-section at a fifth of its height: the extent the eye sees; the core at half height is also kept), how
// much of the line the paint holds (continuity along it), the share of the brush's footprint that takes paint, and the
// area of paint a stroke leaves per cell of its length. The narrowest stable line is the thinnest radius whose line holds
// along at least CONTINUITY of its length. The coat texture (src/crop/coat-texture.mjs) uses these numbers: it lays no
// strand mark where the laid line would be more than SCALE_LIMIT times the strand it stands for, and it counts strokes
// from the paint area measured here. Nothing is fitted to a picture; it is the engine's brush on its paper. DOM free.
import { makePaper } from '../../media/paper.mjs';
import { createSheet, deposit, dry, layersOf, thickness, DEFAULTS } from '../../media/sheet.mjs';
import { createBrush, dip, stroke } from '../../media/brush.mjs';
import { renderLayers } from '../../media/km.mjs';
import { GOUACHE_PIGMENT, GOUACHE_FILM } from '../../media/gouache.mjs';

export const SCALE_LIMIT = 1.5;      // a mark laid wider than this many strands is not laid
export const CONTINUITY = 0.9;       // a stable line holds along this share of its length
const RADII = [1, 1.5, 2, 3, 4, 6];  // brush radii tried, in cells
const SWATCH = { w: 260, rowsPer: 3, length: 200, x0: 30, water: 0.5, loadFilms: 12, hit: 10 };
const BRUSH = { bristles: 10, capacity: 20, belly: 2, feed: 0.06, give: 0.6, free: 0.3, film: 0.2, splay: 0.08, stiffness: 5, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, streak: 0.6 };
export const LOAD_FILMS = SWATCH.loadFilms;      // gouache paste on the brush, in hiding films
export const BRUSH_SETTINGS = Object.freeze({ ...BRUSH, water: SWATCH.water });

const lstar = (r, g, b) => { const Y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 252; return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };

/**
 * @param mmPerCell  the run's sheet density
 * @returns {{ radii: [{ radiusCells, widthMm, continuity, footprintShare, areaPerCell, stable }], narrowest: object|null, mmPerCell }}
 *   areaPerCell: cells that change by more than SWATCH.hit L* per cell of stroke length (the paint a stroke leaves)
 */
export function measureDryBrush({ mmPerCell, seed = 1, radii = RADII }) {
  const rowStep = 4 * Math.max(...radii) + 8, strokes = radii.length * SWATCH.rowsPer, W = SWATCH.w, H = rowStep * strokes + rowStep;
  const pigs = [{ name: 'ground', K: [1.2, 1.1, 0.9], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0.2 }, GOUACHE_PIGMENT];
  const paper = makePaper(W, H, { seed, coldPress: { mmPerCell }, mmPerCell }), sheet = createSheet(paper, pigs);
  for (let i = 0; i < W * H; i++) deposit(sheet, i, 0.5, [3.4 * 0.5, 0]);
  dry(sheet, 20000, DEFAULTS, { levelMax: 900 });
  const base = Buffer.alloc(W * H * 3, 252), before = renderLayers(layersOf(sheet), pigs, base, W * H, 1);
  const placed = [];
  let row = 0;
  for (const r of radii) for (let k = 0; k < SWATCH.rowsPer; k++, row++) {
    const y = rowStep * (row + 1), brush = createBrush({ radius: r, ...BRUSH, seed: 100 + row });
    dip(brush, { water: SWATCH.water, conc: [0, GOUACHE_FILM * SWATCH.loadFilms] });
    stroke(brush, sheet, [{ x: SWATCH.x0, y, p: 1, r }, { x: SWATCH.x0 + SWATCH.length, y, p: 1, r }], { upright: true });
    placed.push({ r, y });
  }
  dry(sheet, 20000, DEFAULTS, { levelMax: 900 });
  const after = renderLayers(layersOf(sheet), pigs, base, W * H, 1);
  const dL = (x, y) => { const i = y * W + x; return lstar(after[i * 3], after[i * 3 + 1], after[i * 3 + 2]) - lstar(before[i * 3], before[i * 3 + 1], before[i * 3 + 2]); };
  const out = radii.map(r => {
    const mine = placed.filter(p => p.r === r), span = Math.ceil(2 * r + 4), xs = [];
    for (let x = SWATCH.x0 + 15; x <= SWATCH.x0 + SWATCH.length - 15; x++) xs.push(x);
    const profile = new Array(2 * span + 1).fill(0); let hit = 0, foot = 0, held = 0, cols = 0;
    for (const { y } of mine) for (const x of xs) {
      let best = 0; cols++;
      for (let d = -span; d <= span; d++) { const v = dL(x, y + d); profile[d + span] += Math.max(0, v) / (mine.length * xs.length); if (v > best) best = v; if (v > SWATCH.hit) { hit++; if (Math.abs(d) <= r) foot++; } }
      if (best > SWATCH.hit) held++;
    }
    const peak = Math.max(...profile);
    // full width of the mean cross-section at a fraction of its height, interpolated at the two crossings
    const widthAt = f => {
      const level = peak * f, lo = profile.findIndex(v => v >= level), hi = profile.length - 1 - [...profile].reverse().findIndex(v => v >= level);
      if (!(peak > 0) || lo < 0) return 0;
      const cross = (a, b) => (profile[b] === profile[a] ? a : a + (level - profile[a]) / (profile[b] - profile[a]) * (b - a));
      return Math.max(1, (hi < profile.length - 1 ? cross(hi + 1, hi) : hi) - (lo > 0 ? cross(lo - 1, lo) : lo));
    };
    const coreCells = widthAt(0.5), extentCells = widthAt(0.2);
    return { radiusCells: r, widthMm: +(extentCells * mmPerCell).toFixed(3), coreMm: +(coreCells * mmPerCell).toFixed(3), continuity: +(held / cols).toFixed(3), footprintShare: +(foot / (cols * (2 * Math.round(r) + 1))).toFixed(3), areaPerCell: +(hit / cols).toFixed(3), stable: held / cols >= CONTINUITY };
  });
  return { radii: out, narrowest: out.find(o => o.stable) ?? null, mmPerCell, settings: BRUSH_SETTINGS };
}

/** The swatch row for the radius nearest `radiusCells` among those measured. */
export function swatchAt(swatch, radiusCells) {
  return swatch.radii.reduce((best, o) => (!best || Math.abs(o.radiusCells - radiusCells) < Math.abs(best.radiusCells - radiusCells) ? o : best), null);
}

// ---------------------------------------------------------------------------------------------------------------------
// The rigger's point: a wet line of dark paint on a light ground. A thin dark the washes could not lay is drawn with it, so
// its line is measured the same way: strokes of dark paint at a set of loads on a scrap sheet of the same paper and cell
// size, dried, and read for the width of the line (extent at a fifth of its height, core at half), how much of it holds
// along its length (continuity), the thickness it leaves at its centre per unit of load, and the step in L* a load makes.
// A line that breaks is not the line: the lightest load whose line holds along CONTINUITY of its length is the stable
// load, and a dark the subject draws with less paint than that cannot be laid as a line by this point.
const POINT = { radius: 1, rowsPer: 4, length: 200, x0: 30, water: 1.0, concs: [3, 6, 12, 24] };
const POINT_BRUSH = { bristles: 6, capacity: 6, belly: 1, feed: 0.12, give: 0.5, free: 0.3, film: 0.2, splay: 0.02, stiffness: 6, wetMix: 0.1, bridge: 0.2, bridgeSoft: 1.0, streak: 0.2 };
const POINT_SETTINGS = Object.freeze({ ...POINT_BRUSH, water: POINT.water, radiusCells: POINT.radius });
export const POINT_INK_K = Object.freeze([1.2, 1.1, 0.9]);   // the swatch's dark paint

/**
 * @returns {{ widthMm, coreMm, rows: [{ conc, continuity, depositPerLoad, stepLstar }], stable: row|null, mmPerCell, settings }}
 */
export function measurePoint({ mmPerCell, seed = 1, water = POINT.water, concs = POINT.concs }) {
  const r = POINT.radius, rowStep = 4 * r + 10, strokes = concs.length * POINT.rowsPer, W = SWATCH.w, H = rowStep * (strokes + 1);
  const pigs = [{ name: 'ink', K: POINT_INK_K, S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0.1 }];
  const paper = makePaper(W, H, { seed, coldPress: { mmPerCell }, mmPerCell }), sheet = createSheet(paper, pigs);
  const base = Buffer.alloc(W * H * 3, 252), before = renderLayers(layersOf(sheet), pigs, base, W * H, 1), th0 = thickness(sheet).map(a => Float32Array.from(a));
  const placed = []; let row = 0;
  for (const conc of concs) for (let k = 0; k < POINT.rowsPer; k++, row++) {
    const y = rowStep * (row + 1), brush = createBrush({ radius: r, ...POINT_BRUSH, seed: 300 + row });
    dip(brush, { water, conc: [conc] });
    stroke(brush, sheet, [{ x: POINT.x0, y, p: 1, r }, { x: POINT.x0 + POINT.length, y, p: 1, r }], { upright: true });
    placed.push({ conc, y });
  }
  dry(sheet, 20000, DEFAULTS, { levelMax: 900 });
  const after = renderLayers(layersOf(sheet), pigs, base, W * H, 1), th1 = thickness(sheet);
  const dL = (x, y) => { const i = y * W + x; return lstar(after[i * 3], after[i * 3 + 1], after[i * 3 + 2]) - lstar(before[i * 3], before[i * 3 + 1], before[i * 3 + 2]); };
  const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  const span = Math.ceil(2 * r + 4), xs = []; for (let x = POINT.x0 + 15; x <= POINT.x0 + POINT.length - 15; x++) xs.push(x);
  const rows = concs.map(conc => {
    const mine = placed.filter(p => p.conc === conc), centre = [], step = []; let held = 0, cols = 0;
    for (const { y } of mine) for (const x of xs) {
      let best = 0, bi = 0; cols++;
      for (let d = -span; d <= span; d++) { const v = -dL(x, y + d); if (v > best) { best = v; bi = d; } }
      if (best > SWATCH.hit) held++;
      centre.push(th1[0][(y + bi) * W + x] - th0[0][(y + bi) * W + x]); step.push(-best);
    }
    return { conc, continuity: +(held / cols).toFixed(3), depositPerLoad: +(med(centre) / conc).toFixed(4), stepLstar: +med(step).toFixed(1) };
  });
  // the width of the line at the stable load (or the heaviest tried): mean cross-section over its strokes
  const stable = rows.find(o => o.continuity >= CONTINUITY) ?? null, at = (stable ?? rows.at(-1)).conc;
  const profile = new Array(2 * span + 1).fill(0), mine = placed.filter(p => p.conc === at);
  for (const { y } of mine) for (const x of xs) for (let d = -span; d <= span; d++) profile[d + span] += Math.max(0, -dL(x, y + d)) / (mine.length * xs.length);
  const peak = Math.max(...profile), widthAt = f => { const level = peak * f, lo = profile.findIndex(v => v >= level), hi = profile.length - 1 - [...profile].reverse().findIndex(v => v >= level); if (!(peak > 0) || lo < 0) return 0; const cross = (a, b) => (profile[b] === profile[a] ? a : a + (level - profile[a]) / (profile[b] - profile[a]) * (b - a)); return Math.max(1, (hi < profile.length - 1 ? cross(hi + 1, hi) : hi) - (lo > 0 ? cross(lo - 1, lo) : lo)); };
  return { widthMm: +(widthAt(0.2) * mmPerCell).toFixed(3), coreMm: +(widthAt(0.5) * mmPerCell).toFixed(3), rows, stable, mmPerCell, settings: { ...POINT_BRUSH, water, radiusCells: r } };
}
