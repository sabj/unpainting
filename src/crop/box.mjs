// A box of real watercolours as pigments, each a unit direction in per-channel optical density.
// boxpick.mjs chooses the pans a source needs.
//
// Eleven masstones use Bruce MacEvoy's handprint.com averages as CIECAM02 [J, C, h] (Spectrolino, Arches paper).
// Raw sienna is estimated; lamp black uses flat absorption. Each masstone is run back through CIECAM02 (ciecam.mjs) and diluted in CAT02, where masstones stay positive, against paper
// at J 97 until its most absorbed channel passes half the light. The direction is that tint's density.
// Mixed paints (sap green, Payne's grey, sepia) are mixed in density from box pigments; sepia is the least certain.
// Optical constants match paletteOf's (kscale 0.55, scatter 0.02, rho 0.05, omega 1.4, gamma 0.25). DOM free.
import { fromJCh, cat02, xyzOfCat02, linearOfXYZ, encode } from './ciecam.mjs';
import { labOf } from '../eval/colour.mjs';

const unit = v => { const m = Math.hypot(...v); return m > 1e-12 ? v.map(x => x / m) : [0.577, 0.577, 0.577]; };

/** Eleven handprint masstones and estimated raw sienna as CIECAM02 [J, C, h]. */
export const MEASURED = [
  { key: 'ultramarine', name: 'French ultramarine', ci: 'PB29', jch: [21, 70, 254] },
  { key: 'phthaloblue', name: 'phthalo blue', ci: 'PB15:3 green shade', jch: [27, 57, 237] },
  { key: 'cerulean', name: 'cerulean blue', ci: 'PB36', jch: [37, 58, 231] },
  { key: 'phthalogreen', name: 'phthalo green', ci: 'PG7 blue shade', jch: [31, 51, 178] },
  { key: 'hansa', name: 'hansa yellow', ci: 'PY97', jch: [85, 80, 91] },
  { key: 'cadyellow', name: 'cadmium yellow', ci: 'PY35', jch: [81, 78, 82] },
  { key: 'ochre', name: 'yellow ochre', ci: 'PY43', jch: [58, 50, 64] },
  { key: 'rawsienna', name: 'raw sienna', ci: 'PBr7', estimated: true, jch: [52, 44, 59] },
  { key: 'sienna', name: 'burnt sienna', ci: 'PBr7', jch: [37, 48, 35] },
  { key: 'umber', name: 'burnt umber', ci: 'PBr7', jch: [28, 25, 42] },
  { key: 'rose', name: 'quinacridone rose', ci: 'PV19', jch: [44, 73, 10] },
  { key: 'cadred', name: 'cadmium red', ci: 'PR108', jch: [41, 86, 24] },
];

/** Paints mixed from the ones above (and lamp black), as shares of density. */
const MIXED = [
  { key: 'sapgreen', name: 'sap green', ci: 'PG7+PY', of: { phthalogreen: 0.48, hansa: 0.52 } },
  { key: 'paynes', name: "Payne's grey", ci: 'PBk6+PB29', of: { black: 0.88, ultramarine: 0.12 } },
  { key: 'sepia', name: 'sepia', ci: 'PBr7+PBk6', of: { umber: 0.5, black: 0.5 } },
];

const PAPER_J = 97;
const PAPER_CAT = cat02(fromJCh(PAPER_J, 0, 0));
/** The paper the measurements were made against, as the 8-bit sRGB colour the directions are read relative to. */
const MEASURED_PAPER = linearOfXYZ(xyzOfCat02(PAPER_CAT)).map(encode);

/** A masstone [J, C, h] diluted until its most absorbed CAT02 channel passes `transmit` of the light: 8-bit sRGB. */
export function tintOf([J, C, h], transmit = 0.5) {
  const mass = cat02(fromJCh(J, C, h));
  const D = mass.map((v, i) => -Math.log(Math.max(1e-6, v) / PAPER_CAT[i]));
  const t = -Math.log(transmit) / Math.max(...D);
  return linearOfXYZ(xyzOfCat02(PAPER_CAT.map((p, i) => p * Math.exp(-t * D[i])))).map(encode);
}

/** The unit density direction of a colour against a paper, read as channelDensity reads it. Negative densities (a
 *  channel a touch above the paper once rounded) are dropped: a transparent paint cannot add light. */
export const directionOf = (rgb, paper = MEASURED_PAPER) => unit(rgb.map((v, c) => Math.max(0, -Math.log(Math.max(1, v) / paper[c]))));

/** CIELAB lightness, chroma and hue of a direction laid until its most absorbed channel passes `transmit`. */
export function appearance(dir, transmit = 0.15, paper = MEASURED_PAPER) {
  const s = -Math.log(transmit) / Math.max(...dir);
  const rgb = Uint8ClampedArray.from(paper.map((p, c) => p * Math.exp(-s * dir[c])));
  const [L, a, b] = labOf(rgb, 0, [255, 255, 255]);
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, rgb: [...rgb] };
}

const built = (() => {
  const dirs = new Map([['black', unit([1, 1, 1])]]);
  const box = MEASURED.map(p => {
    const dir = directionOf(tintOf(p.jch));
    dirs.set(p.key, dir);
    return { key: p.key, name: p.name, ci: p.ci, dir, source: `${p.estimated ? "estimated raw-sienna material; pending measured calibration" : "handprint masstone"} J ${p.jch[0]} C ${p.jch[1]} h ${p.jch[2]}` };
  });
  box.push({ key: 'lampblack', name: 'lamp black', ci: 'PBk6', dir: dirs.get('black'), source: 'flat absorption' });
  for (const m of MIXED) {
    const v = [0, 0, 0];
    for (const [k, share] of Object.entries(m.of)) for (let c = 0; c < 3; c++) v[c] += share * dirs.get(k)[c];
    box.push({ key: m.key, name: m.name, ci: m.ci, dir: unit(v), source: `mixed ${Object.entries(m.of).map(([k, s]) => `${k} ${s}`).join(', ')}` });
  }
  return box;
})();

/** The shelf: { key, name, ci, dir (unit density direction), source } for every paint. */
export const BOX = Object.freeze(built.map(p => Object.freeze({ ...p, dir: Object.freeze(p.dir) })));

/** A box paint as a sheet pigment in paletteOf's format (asPigment there), with its name kept for the logs. */
export function boxPigment(paint, { kscale = 0.55, scatter = [0.02, 0.02, 0.02], rho = 0.05, omega = 1.4, gamma = 0.25 } = {}) {
  return { K: paint.dir.map(v => v * kscale), S: [...scatter], rho, omega, gamma, name: paint.name };
}
