// Charge calibration per instrument. A painter tries the loaded brush on scrap before a passage, and the trial only
// tells the truth if the scrap is brushed the way the sheet will be: the same water in the brush, the same number of
// passes, the same paper state. A swatch laid with a wetter brush and brushed twice says nothing about a damp brush
// drawn across once.
//
// tools/paint-plate.mjs lays one swatch per stock technique (wet on dry, wet on wet, glazed, dry brush). A passage whose
// instrument is the stock one of its name takes that swatch's reading. A passage that carries its own load or pass
// count (a value plan's glaze is laid at the plan's water in one pass), or states how far its lanes lap (`lap`, a share
// of the brush's width: a painting script's wash), gets a swatch of its own, laid once and kept.
// Nothing here reads the sheet or the target.

// what a swatch's delivery depends on in a technique
const FIELDS = ['water', 'wetMix', 'bridge', 'bridgeSoft', 'passes'];

export const swatchTechnique = T => Object.fromEntries(['name',...FIELDS,'intoWet','lap'].filter(key=>Object.hasOwn(T,key)).map(key=>[key,T[key]]));

/** The instrument a technique is laid with, as a key: its name, brush load, wet mixing, tooth reach, wet bed and passes. */
export function instrumentKey(T) {
  if (!T || typeof T.name !== 'string' || !T.name) throw new TypeError('instrument calibration: a technique needs a name');
  for (const f of FIELDS) if (!Number.isFinite(T[f])) throw new TypeError(`instrument calibration: ${T.name} has no finite ${f} (${T[f]})`);
  if (!Number.isInteger(T.passes) || T.passes < 1) throw new RangeError(`instrument calibration: ${T.name} needs a whole number of passes, got ${T.passes}`);
  // (a wash that states how far its lanes lap is tried in lanes lapped so: another lap, another swatch)
  return [T.name, ...FIELDS.map(f => T[f]), T.intoWet ? 'into wet' : 'on dry', ...(Number.isFinite(T.lap) ? [`lap ${(+T.lap).toFixed(2)}`] : [])].join('|');
}

/**
 * Whether a passage is charged from a swatch laid with its own instrument (`of`) rather than the stock swatch of its name
 * (`byName`). Every passage is, wet on wet included, since its swatch wets and waits on each lane as the sheet does
 * (scrap-swatch.mjs): on sized paper a 0.55-water brush gives a wet bed far less than the stock 0.88 one. Authored area
 * plans keep their own calibration, and a technique marked stockSwatch keeps the stock one.
 */
export const chargedFromOwnSwatch = (T, { instrumentOn, authored }) => Boolean(instrumentOn && !authored && !T.stockSwatch);

/**
 * @param {{ stock: Record<string, { technique: object, cal: number, graded?: object | null }>, measure: (T: object) => { cal: number, graded?: object | null }, log?: (line: string) => void }} options
 *   stock: the stock techniques by name with their swatch readings (cal: the charge factor; graded: the recharged
 *   swatch's { all, escape, edge }, or null when no graded swatch is laid); measure: lays a swatch for a technique
 *   and returns the same reading.
 */
export function createInstrumentCal({ stock, measure, measureMark = null, markKey = null, measureDamp = null, log = () => {} }) {
  const stockKey = new Map(Object.entries(stock).map(([name, s]) => [name, instrumentKey(s.technique)]));
  const own = new Map(), marks = new Map(), damps = new Map();
  const check = (key, r) => {
    if (!r || !(r.cal > 0) || !Number.isFinite(r.cal)) throw new Error(`instrument calibration: the swatch for ${key} gave no charge factor`);
    return { cal: r.cal, graded: r.graded ?? null };
  };
  return {
    /** The swatch reading for a passage's technique: the stock swatch when its instrument is the stock one, else its own. */
    of(T) {
      const key = instrumentKey(T);
      if (stockKey.get(T.name) === key) { const s = stock[T.name]; return { cal: s.cal, graded: s.graded ?? null, key, stock: true }; }
      if (!own.has(key)) {
        own.set(key, check(key, measure(T)));
        const s = stock[T.name], differs = s ? [...FIELDS, 'intoWet'].filter(f => (f === 'intoWet' ? !!T[f] !== !!s.technique[f] : T[f] !== s.technique[f])) : [];
        log(`  ${T.name} at ${[...(s ? differs.map(f => `${f} ${T[f]}`) : [`water ${T.water}, passes ${T.passes}`]), ...(Number.isFinite(T.lap) ? [`lanes lapped by ${T.lap} of the brush`] : [])].join(', ')}: its own swatch charges ${own.get(key).cal.toFixed(2)}x${s ? ` (the stock ${T.name} swatch, ${differs.map(f => `${f} ${s.technique[f]}`).join(', ')}: ${s.cal.toFixed(2)}x)` : ' (no stock swatch of that name)'}`);
      }
      return { ...own.get(key), key, stock: false };
    },
    /**
     * The swatch reading for a passage of separate marks (mark-swatch.mjs): laid with the passage's technique AND its own
     * mark (brush, length, pressures), read at the mark's core. Washes never come here; `of` is unchanged for them.
     */
    ofMark(T, mark) {
      if (!measureMark || !markKey) throw new Error('instrument calibration: no mark swatch can be laid here');
      const key = `${instrumentKey(T)}|${markKey(mark)}`;
      if (!marks.has(key)) {
        const r = measureMark(T, mark);
        if (!r || !(r.cal > 0) || !Number.isFinite(r.cal)) throw new Error(`instrument calibration: the mark swatch for ${key} gave no charge factor`);
        marks.set(key, r);
        log(`  ${T.name} mark, brush ${(2 * mark.radiusMm).toFixed(1)} mm, ${mark.lengthMm.toFixed(1)} mm long, pressure ${mark.pressure.toFixed(2)}, ${(mark.depth ?? 1) >= 1.25 ? `${mark.depth.toFixed(1)} deep in a mass` : 'apart'}${mark.damp ? `, laid into a damp wash (it takes up ${(100 * r.lift).toFixed(0)}% of the wash under it)` : ''}: its own swatch lays ${r.mass.toFixed(2)} of its charge (inside its planned footprint ${r.whole.toFixed(2)}; the paint covers ${(100 * r.coverage).toFixed(0)}% of it)${mark.damp ? '' : `, so it is charged ${r.cal.toFixed(2)}x`}`);
      }
      return { ...marks.get(key), graded: null, key, stock: false };
    },
    /**
     * The swatch reading for a painting script's wash laid into paint still wet from its own sitting (damp-swatch.mjs):
     * the passage's technique laid in lanes over a wash that has just lost its shine. { delivered, lift, cal }: what it
     * laid of its own charge, the share of the wash its brush took up, and the factor over a wash as strong as itself;
     * the caller reckons each passage's own factor from the wash that lies under it. No graded reading.
     */
    ofDamp(T) {
      if (!measureDamp) throw new Error('instrument calibration: no damp swatch can be laid here');
      const key = `${instrumentKey(T)}|damp`;
      if (!damps.has(key)) {
        const r = measureDamp(T);
        if (!r || !(r.cal > 0) || !Number.isFinite(r.cal)) throw new Error(`instrument calibration: the damp swatch for ${key} gave no charge factor`);
        damps.set(key, r);
        log(`  ${T.name} (water ${T.water}, ${T.passes} pass${T.passes > 1 ? 'es' : ''}) laid into a damp wash delivers ${r.delivered.toFixed(2)} of its charge and takes up ${(100 * r.lift).toFixed(0)}% of the wash, so over a wash as strong as itself it is charged ${r.cal.toFixed(2)}x (on dry paper ${r.dry.toFixed(2)}x)`);
      }
      return { ...damps.get(key), graded: null, key, stock: false };
    },
    /** The mark swatches laid, for a report. */
    markEntries: () => [...marks].map(([key, r]) => [key, { ...r }]),
    /** The stock swatch of a technique's name whatever its load: the calibration before this module. Unknown names charge 1. */
    byName(name) { const s = stock[name]; return { cal: s?.cal ?? 1, graded: s?.graded ?? null, key: null, stock: true }; },
    /** The swatches laid beyond the stock ones, for a cache or a report. */
    entries: () => [...own].map(([key, r]) => [key, { ...r }]),
    /** Readings kept from an earlier run of the same swatches. */
    load(entries) { for (const [key, r] of entries) own.set(key, check(key, r)); },
  };
}
