// A box of real watercolours as pigments, each a unit direction in per-channel optical density.
// boxpick.mjs chooses the pans a source needs.
//
// Eleven masstones use Bruce MacEvoy's handprint.com averages as CIECAM02 [J, C, h] (Spectrolino, Arches paper).
// Raw sienna is estimated; lamp black uses flat absorption. Each masstone is run back through CIECAM02 (ciecam.mjs) and diluted in CAT02, where masstones stay positive, against paper
// at J 97 until its most absorbed channel passes half the light. The direction is that tint's density.
// Mixed paints (sap green, Payne's grey, sepia) are mixed in density from box pigments; sepia is the least certain.
// Optical constants and physical parameters calibrated against Handprint, Doerner, and Mayer per Color Index.
// (kscale 0.55, authentic K, S, rho, omega, gamma, and floc). DOM free.
import { fromJCh, cat02, xyzOfCat02, linearOfXYZ, encode } from './ciecam.mjs';
import { labOf } from '../eval/colour.mjs';

const unit = v => { const m = Math.hypot(...v); return m > 1e-12 ? v.map(x => x / m) : [0.577, 0.577, 0.577]; };

/** Eleven handprint masstones and estimated raw sienna as CIECAM02 [J, C, h]. */
export const MEASURED = [
  { key: 'ultramarine', name: 'French ultramarine', ci: 'PB29', jch: [21, 70, 254],
    rho: 0.08, omega: 0.35, gamma: 0.85, scatter: [0.020, 0.020, 0.025], floc: 0.35 },
  { key: 'phthaloblue', name: 'phthalo blue', ci: 'PB15:3 green shade', jch: [27, 57, 237],
    rho: 0.035, omega: 2.80, gamma: 0.00, scatter: [0.005, 0.005, 0.005] },
  { key: 'cerulean', name: 'cerulean blue', ci: 'PB36', jch: [37, 58, 231],
    rho: 0.10, omega: 0.40, gamma: 0.80, scatter: [0.120, 0.080, 0.050], floc: 0.25 },
  { key: 'phthalogreen', name: 'phthalo green', ci: 'PG7 blue shade', jch: [31, 51, 178],
    rho: 0.035, omega: 2.50, gamma: 0.00, scatter: [0.005, 0.005, 0.005] },
  { key: 'hansa', name: 'hansa yellow', ci: 'PY97', jch: [85, 80, 91],
    rho: 0.040, omega: 1.80, gamma: 0.00, scatter: [0.010, 0.010, 0.010] },
  { key: 'cadyellow', name: 'cadmium yellow', ci: 'PY35', jch: [81, 78, 82],
    rho: 0.09, omega: 1.10, gamma: 0.15, scatter: [0.140, 0.100, 0.040] },
  { key: 'ochre', name: 'yellow ochre', ci: 'PY43', jch: [58, 50, 64],
    rho: 0.07, omega: 0.50, gamma: 0.60, scatter: [0.080, 0.060, 0.030], floc: 0.20 },
  { key: 'rawsienna', name: 'raw sienna', ci: 'PBr7', estimated: true, jch: [52, 44, 59],
    rho: 0.06, omega: 0.70, gamma: 0.50, scatter: [0.035, 0.025, 0.020] },
  { key: 'sienna', name: 'burnt sienna', ci: 'PBr7', jch: [37, 48, 35],
    rho: 0.07, omega: 0.60, gamma: 0.55, scatter: [0.025, 0.020, 0.015] },
  { key: 'umber', name: 'burnt umber', ci: 'PBr7', jch: [28, 25, 42],
    rho: 0.07, omega: 0.60, gamma: 0.45, scatter: [0.045, 0.035, 0.025] },
  { key: 'rose', name: 'quinacridone rose', ci: 'PV19', jch: [44, 73, 10],
    rho: 0.035, omega: 2.60, gamma: 0.00, scatter: [0.005, 0.005, 0.005] },
  { key: 'cadred', name: 'cadmium red', ci: 'PR108', jch: [41, 86, 24],
    rho: 0.09, omega: 1.20, gamma: 0.10, scatter: [0.140, 0.070, 0.040] },
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
    return {
      key: p.key, name: p.name, ci: p.ci, dir,
      scatter: p.scatter ?? [0.02, 0.02, 0.02],
      rho: p.rho ?? 0.05,
      omega: p.omega ?? 1.4,
      gamma: p.gamma ?? 0.25,
      ...(p.floc != null ? { floc: p.floc } : {}),
      source: `${p.estimated ? "estimated raw-sienna material; pending measured calibration" : "handprint masstone"} J ${p.jch[0]} C ${p.jch[1]} h ${p.jch[2]}`
    };
  });
  const blackPig = {
    key: 'lampblack', name: 'lamp black', ci: 'PBk6', dir: dirs.get('black'),
    scatter: [0.010, 0.010, 0.010], rho: 0.045, omega: 2.00, gamma: 0.10,
    source: 'flat absorption'
  };
  box.push(blackPig);
  const byKey = new Map(box.map(p => [p.key, p]));
  byKey.set('black', blackPig);

  for (const m of MIXED) {
    const v = [0, 0, 0], scat = [0, 0, 0];
    let rho = 0, omega = 0, gamma = 0, floc = 0;
    for (const [k, share] of Object.entries(m.of)) {
      const parent = byKey.get(k);
      for (let c = 0; c < 3; c++) {
        v[c] += share * dirs.get(k)[c];
        scat[c] += share * (parent.scatter?.[c] ?? 0.02);
      }
      rho += share * (parent.rho ?? 0.05);
      omega += share * (parent.omega ?? 1.4);
      gamma += share * (parent.gamma ?? 0.25);
      if (parent.floc) floc += share * parent.floc;
    }
    box.push({
      key: m.key, name: m.name, ci: m.ci, dir: unit(v),
      scatter: scat.map(s => Math.round(s * 1000) / 1000),
      rho: Math.round(rho * 1000) / 1000,
      omega: Math.round(omega * 100) / 100,
      gamma: Math.round(gamma * 100) / 100,
      ...(floc > 0 ? { floc: Math.round(floc * 100) / 100 } : {}),
      source: `mixed ${Object.entries(m.of).map(([k, s]) => `${k} ${s}`).join(', ')}`
    });
  }
  return box;
})();

/** The shelf: { key, name, ci, dir (unit density direction), source } for every paint. */
export const BOX = Object.freeze(built.map(p => Object.freeze({ ...p, dir: Object.freeze(p.dir), scatter: Object.freeze([...p.scatter]) })));

/** A box paint as a sheet pigment in paletteOf's format (asPigment there), with its name kept for the logs. */
export function boxPigment(paint, { kscale = 0.55, scatter, rho, omega, gamma, floc } = {}) {
  const S = Object.freeze(scatter ? [...scatter] : [...(paint.scatter ?? [0.02, 0.02, 0.02])]);
  const r = rho ?? paint.rho ?? 0.05;
  const o = omega ?? paint.omega ?? 1.4;
  const g = gamma ?? paint.gamma ?? 0.25;
  const fl = floc ?? paint.floc;
  return {
    K: paint.dir.map(v => v * kscale),
    S,
    rho: r,
    omega: o,
    gamma: g,
    ...(fl != null ? { floc: fl } : {}),
    name: paint.name,
  };
}
