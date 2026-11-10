// The physical properties of the paints, in one table the painter (src/crop/box.mjs) and Paint Lab (pigments.js) both read.
// DOM free.
//
// Each paint is described by what pigment makers and painters publish, as categories: granulation, staining,
// flocculation, opacity, and the pigment's specific gravity. One rule turns each category into the number the sheet
// uses, the same for every paint:
//   granulation  none 0, slight 0.25, moderate 0.55, heavy 0.85            -> gamma
//   staining     non-staining 0.5, moderate 3, staining 20                 -> omega (a paint stains at omega >= 5)
//   flocculation none 0, slight 0.15, yes 0.3                              -> floc
//   opacity      transparent 0.005, semi-transparent 0.02, semi-opaque 0.07, opaque 0.14 -> scatter S, the same in each channel
//   density      specific gravity / 50                                     -> rho (cerulean, at 5.0, gives 0.10; phthalo blue, at 1.6, 0.032)
// The category values are the model's own scale. They were not fitted to any painting or benchmark target.
//
// Sources (the categories and gravities below are the published ratings as recorded when the table was written; they
// were not re-fetched against the pages when the rule was last changed, so check a row against its source before
// leaning on it):
//   HP  Bruce MacEvoy, Handprint, "Paint pigments" and the pigment pages under handprint.com/HP/WCL/ (granulation, staining, transparency)
//   DS  Daniel Smith watercolour pigment information (granulating, staining, transparency per pigment)
//   WN  Winsor & Newton artists' watercolour characteristics (opacity, staining)
//   PH  Pigment specific gravity: Colour Index entries and Kremer Pigmente / Pigment Handbook typical figures
// A field in `estimated` has no published figure for that paint (or the paint is a mix) and is this table's judgement.
//
// Mixed paints (sap green, Payne's grey, sepia) take the share-weighted numbers of their parents, as box.mjs mixes their
// colour. Lab pigments keep their own K and S, fitted to how painters' swatches look; only the physics below is shared.

/** Category to number, one rule for every paint. */
export const CLASS_VALUES = Object.freeze({
  granulation: Object.freeze({ none: 0, slight: 0.25, moderate: 0.55, heavy: 0.85 }),
  staining: Object.freeze({ non: 0.5, moderate: 3, staining: 20 }),
  flocculation: Object.freeze({ none: 0, slight: 0.15, yes: 0.3 }),
  opacity: Object.freeze({ transparent: 0.005, semitransparent: 0.02, semiopaque: 0.07, opaque: 0.14 }),
  densityPerGravity: 0.02,
});

const row = (ci, granulation, staining, flocculation, opacity, sg, source, estimated = []) => ({ ci, granulation, staining, flocculation, opacity, sg, source, estimated });

const DATA = {
  ultramarine: row('PB29', 'heavy', 'non', 'yes', 'transparent', 2.35, 'HP, DS: granulating, flocculating, non-staining, transparent; PH: PB29 about 2.35'),
  phthaloblue: row('PB15:3', 'none', 'staining', 'none', 'transparent', 1.6, 'HP, DS, WN: non-granulating, staining, transparent; PH: PB15 about 1.6'),
  cerulean: row('PB36', 'heavy', 'non', 'yes', 'semiopaque', 5.0, 'HP, DS: granulating, flocculating, non-staining, semi-opaque; PH: cobalt chromite blue about 5.0 (approximate)', ['sg']),
  phthalogreen: row('PG7', 'none', 'staining', 'none', 'transparent', 2.0, 'HP, DS, WN: non-granulating, staining, transparent; PH: PG7 about 2.0 (approximate)', ['sg']),
  hansa: row('PY97', 'none', 'staining', 'none', 'transparent', 1.5, 'HP, DS: non-granulating, staining, transparent to semi-transparent; PH: arylide yellow about 1.5 (approximate)', ['sg']),
  cadyellow: row('PY35', 'none', 'non', 'none', 'opaque', 4.4, 'HP, DS, WN: non-granulating, non-staining, opaque; PH: cadmium zinc sulphide about 4.4'),
  ochre: row('PY43', 'moderate', 'non', 'slight', 'semiopaque', 3.5, 'HP, DS: granulating, non-staining, semi-opaque; PH: natural hydrated iron oxide 3.3 to 4.3', ['flocculation']),
  rawsienna: row('PBr7', 'moderate', 'non', 'none', 'semitransparent', 3.0, 'estimated from the burnt sienna and yellow ochre rows (no raw sienna swatch was measured)', ['granulation', 'staining', 'flocculation', 'opacity', 'sg']),
  sienna: row('PBr7', 'moderate', 'non', 'none', 'semitransparent', 3.4, 'HP, DS: granulating, non-staining, semi-transparent; PH: calcined iron oxide about 3.4 (approximate)', ['sg']),
  umber: row('PBr7', 'slight', 'non', 'none', 'semitransparent', 3.3, 'HP, DS: slightly granulating, non-staining, semi-transparent; PH: iron and manganese oxide about 3.3 (approximate)', ['sg']),
  rose: row('PV19', 'none', 'staining', 'none', 'transparent', 1.5, 'HP, DS, WN: non-granulating, staining, transparent; PH: quinacridone about 1.5'),
  cadred: row('PR108', 'none', 'non', 'none', 'opaque', 4.5, 'HP, DS, WN: non-granulating, non-staining, opaque; PH: cadmium sulphoselenide 4.4 to 4.8'),
  lampblack: row('PBk6', 'none', 'non', 'none', 'semitransparent', 1.8, 'PH: carbon black about 1.8; the other categories are estimated (makers differ)', ['granulation', 'staining', 'flocculation', 'opacity']),
  // Lab-only paints: the Lab palette also holds these.
  lemon: row('PY3', 'none', 'staining', 'none', 'transparent', 1.6, 'HP, DS: non-granulating, staining, transparent; PH: arylide lemon yellow about 1.6 (approximate)', ['sg']),
  walnut: row('natural dye', 'none', 'staining', 'none', 'transparent', 1.2, 'estimated: a plant dye ink, not a pigment; no published ratings', ['granulation', 'staining', 'flocculation', 'opacity', 'sg']),
  alizarin: row('PR83', 'none', 'staining', 'none', 'transparent', 1.4, 'HP, DS: non-granulating, staining, transparent; the specific gravity is estimated', ['sg']),
  indigo: row('PB66', 'none', 'staining', 'none', 'transparent', 1.35, 'HP: non-granulating, staining, transparent; the specific gravity is estimated', ['sg']),
};

/** Mixed paints as shares of parent density, the same shares box.mjs mixes their colour with. */
export const MIXED_OF = Object.freeze({
  sapgreen: Object.freeze({ phthalogreen: 0.48, hansa: 0.52 }),
  paynes: Object.freeze({ lampblack: 0.88, ultramarine: 0.12 }),
  sepia: Object.freeze({ umber: 0.5, lampblack: 0.5 }),
});

const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
const numbers = d => {
  const C = CLASS_VALUES, s = C.opacity[d.opacity];
  return { rho: round(d.sg * C.densityPerGravity, 5), omega: C.staining[d.staining], gamma: C.granulation[d.granulation], floc: C.flocculation[d.flocculation], scatter: [s, s, s] };
};

const build = key => {
  const d = DATA[key];
  if (d) return Object.freeze({ key, ci: d.ci, ...numbers(d), source: d.source, estimated: Object.freeze([...d.estimated]), categories: Object.freeze({ granulation: d.granulation, staining: d.staining, flocculation: d.flocculation, opacity: d.opacity, sg: d.sg }) });
  const of = MIXED_OF[key];
  if (!of) return null;
  const sum = { rho: 0, omega: 0, gamma: 0, floc: 0, scatter: [0, 0, 0] };
  for (const [parent, share] of Object.entries(of)) {
    const p = physicalOf(parent);
    for (const f of ['rho', 'omega', 'gamma', 'floc']) sum[f] += share * p[f];
    for (let c = 0; c < 3; c++) sum.scatter[c] += share * p.scatter[c];
  }
  const parts = Object.entries(of).map(([k, s]) => `${k} ${s}`).join(', ');
  return Object.freeze({ key, ci: null, rho: round(sum.rho, 5), omega: round(sum.omega, 4), gamma: round(sum.gamma, 4), floc: round(sum.floc, 4), scatter: sum.scatter.map(v => round(v, 5)), source: `mixed in density from ${parts}; each parent's row applies`, estimated: Object.freeze(['mixed']) });
};

const cache = new Map();
/** The physical row of a paint: { key, ci, rho, omega, gamma, floc, scatter, source, estimated } or null. */
export function physicalOf(key) {
  if (!cache.has(key)) cache.set(key, build(key));
  return cache.get(key);
}

export const PHYSICAL_KEYS = Object.freeze([...Object.keys(DATA), ...Object.keys(MIXED_OF)]);

/** Paint Lab keys that differ from the box's. */
const LAB_ALIAS = Object.freeze({ phthalo: 'phthaloblue' });
export const labKeyOf = key => LAB_ALIAS[key] ?? key;

/** The physics fields as a pigment carries them; `floc` only when above zero, as before. */
export const physicsFields = row => ({ rho: row.rho, omega: row.omega, gamma: row.gamma, ...(row.floc > 0 ? { floc: row.floc } : {}) });
