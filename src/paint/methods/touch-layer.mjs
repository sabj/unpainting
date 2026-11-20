// A layer of touches from a richer study, laid over the dry washes: the small shapes the study shows that the washes
// before it have not laid (a stone warmer or cooler than the wall, a streak of cast shadow, a pane, a leaf cluster),
// each ONE mark of the brush chosen by its shape (src/paint/marks markFor), not a filled outline. Watercolour only darkens,
// so a touch goes only where the study is darker than what is laid, or as dark but of another hue (a warm or cool
// change). Touches are ranked by what they add (area times the change) and only the noise tail is left out: shapes
// smaller than the least size, and changes too faint to see. Touches of one colour are one mix, laid in one session.
// Plan time only. Reads the study, never the subject.
import { labOf } from '../../eval/colour.mjs';
import { kmeans } from './study-shapes.mjs';
import { shapeGeometry, markFor, makeMark } from '../marks/index.mjs';

/** A touch where the study is at least this much darker (L*) than what is laid, or this far off its hue (a*b*) and not lighter. */
const DARKER = 3, HUE_OFF = 6, NOT_LIGHTER = 3;
/** The study's colours in the changed cells, this many clusters (fine: a touch is one colour). */
const CLUSTERS = 14;
/** A touch whose change (mean dE times its area, mm2) is under this is not painted (the noise tail). */
const LEAST_GAIN = 40;
/** Foliage: a green between these hues (degrees in Lab), at least this chromatic. */
const GREEN = [95, 175], GREEN_C = 8, GREEN_L = 72;
/** A change larger than this (mm2) is a glaze over a passage, not one mark. */
const WASH_FROM_MM2 = 80;
/** A dark (L* under DARK_L) bigger than DARK_LEAST_MM2 is laid as a dark only where the coarser studies are within
 * DARK_JUSTIFIED (L*) of it; else it is a glaze at the coarser studies' value. */
const DARK_L = 45, DARK_LEAST_MM2 = 6, DARK_JUSTIFIED = 20;
/** A mark with more than this share of its points outside its shape (grown by 1 mm) is laid as a glaze instead. */
const OUTSIDE_MOST = 0.2;

/** 4-connected parts of the cells where label === id among `cells` (cells is a mask); returns arrays of cell indices. */
function partsOf(label, pw, ph) {
  const seen = new Uint8Array(label.length), out = [], stack = [];
  for (let s = 0; s < label.length; s++) {
    if (label[s] < 0 || seen[s]) continue;
    const id = label[s], cells = []; seen[s] = 1; stack.push(s);
    while (stack.length) { const q = stack.pop(); cells.push(q); const x = q % pw; for (const j of [x ? q - 1 : -1, x < pw - 1 ? q + 1 : -1, q - pw, q + pw]) if (j >= 0 && j < label.length && !seen[j] && label[j] === id) { seen[j] = 1; stack.push(j); } }
    out.push({ id, cells });
  }
  return out;
}

/** Each cell's label replaced by the commonest of its 3 x 3 neighbourhood among labelled cells (rims of shapes and specks go). */
function majority(lab, pw, ph) {
  const out = Int32Array.from(lab), votes = new Map();
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const i = y * pw + x; if (lab[i] < 0) continue; votes.clear(); let best = lab[i], bv = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy < 0 || xx < 0 || yy >= ph || xx >= pw) continue; const v = lab[yy * pw + xx]; if (v < 0) continue; const c = (votes.get(v) ?? 0) + 1; votes.set(v, c); if (c > bv) { bv = c; best = v; } }
    // (only a speck changes: a cell with two or more like neighbours keeps its label, so a window's bars stay bars)
    if (bv >= 4 && (votes.get(lab[i]) ?? 0) <= 2) out[i] = best;
  }
  return out;
}

/**
 * The touches a richer study adds. `grid` is the study (pw x ph sRGB), `ref` what is laid as the studies before read
 * ({L, A, B} Float32Arrays, paper L 100), `paper` a mask of cells kept as paper, `mmX` the grid's cell (mm), `minMm2`
 * the least touch, `kit` the round widths (mm). Returns groups, lightest first: [{ colour (sRGB), lab, cells, touches:
 * [{ name, strokes, cells, gain }] }].
 */
export function touchesFrom({ grid, ref, paper, pw, ph, mmX, paperRGB, minMm2 = 3, kit = [1, 2, 4, 8], salt = 0, coarseL = null }) {
  const pn = pw * ph, L = new Float32Array(pn), A = new Float32Array(pn), B = new Float32Array(pn), changed = new Uint8Array(pn);
  for (let q = 0; q < pn; q++) {
    const [l, a, b] = labOf(grid, q, paperRGB); L[q] = l; A[q] = a; B[q] = b;
    if (paper?.[q]) continue;
    const dl = ref.L[q] - l, dh = Math.hypot(a - ref.A[q], b - ref.B[q]);
    if (dl >= DARKER || (dh >= HUE_OFF && dl >= -NOT_LIGHTER)) changed[q] = 1;
  }
  const idx = []; for (let q = 0; q < pn; q++) if (changed[q]) idx.push(q);
  if (!idx.length) return [];
  const step = Math.max(1, Math.round(idx.length / 6000)), rows = [];
  for (let k = 0; k < idx.length; k += step) { const q = idx[k]; rows.push(L[q], A[q], B[q]); }
  const centres = kmeans(Float32Array.from(rows), 3, Math.min(CLUSTERS, Math.max(1, rows.length / 3 >> 2)), 20);
  let lab = new Int32Array(pn).fill(-1);
  for (const q of idx) { let best = 0, bd = Infinity; centres.forEach((c, f) => { const d = (L[q] - c[0]) ** 2 + (A[q] - c[1]) ** 2 + (B[q] - c[2]) ** 2; if (d < bd) { bd = d; best = f; } }); lab[q] = best; }
  lab = majority(lab, pw, ph);
  const cellMm2 = mmX * mmX, groups = new Map();
  for (const { id, cells } of partsOf(lab, pw, ph)) {
    const area = cells.length * cellMm2; if (area < minMm2) continue;
    let gain = 0; for (const q of cells) gain += Math.hypot(Math.max(0, ref.L[q] - L[q]), A[q] - ref.A[q], B[q] - ref.B[q]); gain *= cellMm2;
    if (gain < LEAST_GAIN * Math.min(1, area / 20)) continue;
    const c = centres[id], hue = (Math.atan2(c[2], c[1]) * 180 / Math.PI + 360) % 360, chroma = Math.hypot(c[1], c[2]);
    let dl = 0, db = 0; for (const q of cells) { dl += ref.L[q] - L[q]; db += ref.B[q] - B[q]; } dl /= cells.length; db /= cells.length;
    const what = chroma >= GREEN_C && hue >= GREEN[0] && hue <= GREEN[1] && c[0] <= GREEN_L ? 'foliage' : dl >= DARKER && db >= 3 ? 'shadow' : '';
    // a large change is not a touch: it is a glaze over a passage, laid as a wash (the caller lays `wash` touches in lanes)
    let big = area > WASH_FROM_MM2 && what !== 'foliage';
    // a dark bigger than a few mm2 must be dark in the coarser studies there too, else it is a glaze at their value
    let meanL = 0; for (const q of cells) meanL += L[q]; meanL /= cells.length;
    let glazeL = null;
    if (coarseL && meanL < DARK_L && area > DARK_LEAST_MM2) { let cl = 0; for (const q of cells) cl += coarseL[q]; cl /= cells.length; if (cl > meanL + DARK_JUSTIFIED) { big = true; glazeL = cl; } }
    const g = shapeGeometry(cells, pw, mmX);
    let m = big ? { name: 'wash', strokes: [] } : markFor(g, { what, kit, seed: (salt * 7919 + cells[0]) | 0 });
    // a leaf is a mark for foliage only; elsewhere the same shape is a pressed touch
    if (!big && /leaf/.test(m.name) && what !== 'foliage' && m.params) m = { name: 'touch', params: m.params, strokes: makeMark('touch', m.params) };
    // a mark never reaches past its shape: if a fifth of its points lie outside the shape (grown by a millimetre), the
    // shape is laid as a glaze over its own cells instead
    if (!big && m.strokes.length) {
      const inMask = new Uint8Array(pn); for (const q of cells) inMask[q] = 1;
      const grow = Math.max(1, Math.round(1 / mmX)), near = (x, y) => { const gx = Math.floor(x / mmX), gy = Math.floor(y / mmX); for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) { const xx = gx + dx, yy = gy + dy; if (xx >= 0 && yy >= 0 && xx < pw && yy < ph && inMask[yy * pw + xx]) return true; } return false; };
      let all = 0, out = 0; for (const st of m.strokes) for (const p of st.points) { all++; if (!near(p[0], p[1])) out++; }
      if (all && out / all > OUTSIDE_MOST) { big = true; m = { name: 'wash', strokes: [] }; }
    }
    if (!groups.has(id)) groups.set(id, { id, cells: [], touches: [] });
    const gr = groups.get(id); gr.cells.push(...cells); gr.touches.push({ name: m.name, strokes: m.strokes, cells, gain, what, wash: big, glazeL, meanL, areaMm2: area, length: g.length, width: g.width });
  }
  const out = [...groups.values()].map(gr => {
    const colour = [0, 1, 2].map(ch => { const v = gr.cells.map(q => grid[q * 3 + ch]).sort((a, b) => a - b); return v[v.length >> 1]; });
    gr.touches.sort((a, b) => b.gain - a.gain);
    return { ...gr, colour, lab: labOf(colour, 0, paperRGB) };
  });
  return out.sort((a, b) => b.lab[0] - a.lab[0]);
}
