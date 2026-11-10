// Charge calibration per instrument. A painter tries the loaded brush on scrap before a passage, and the trial only
// tells the truth if the scrap is brushed the way the sheet will be: the same water in the brush, the same number of
// passes, the same paper state. A swatch laid with a wetter brush and brushed twice says nothing about a damp brush
// drawn across once.
//
// tools/paint-plate.mjs lays one swatch per stock technique (wet on dry, wet on wet, glazed, dry brush). A passage whose
// instrument is the stock one of its name takes that swatch's reading. A passage that carries its own load or pass
// count (a value plan's glaze is laid at the plan's water in one pass) gets a swatch of its own, laid once and kept.
// Nothing here reads the sheet or the target.

// what a swatch's delivery depends on in a technique
const FIELDS = ['water', 'wetMix', 'bridge', 'bridgeSoft', 'passes'];

/** The instrument a technique is laid with, as a key: its name, brush load, wet mixing, tooth reach, wet bed and passes. */
export function instrumentKey(T) {
  if (!T || typeof T.name !== 'string' || !T.name) throw new TypeError('instrument calibration: a technique needs a name');
  for (const f of FIELDS) if (!Number.isFinite(T[f])) throw new TypeError(`instrument calibration: ${T.name} has no finite ${f} (${T[f]})`);
  if (!Number.isInteger(T.passes) || T.passes < 1) throw new RangeError(`instrument calibration: ${T.name} needs a whole number of passes, got ${T.passes}`);
  return [T.name, ...FIELDS.map(f => T[f]), T.intoWet ? 'into wet' : 'on dry'].join('|');
}

/**
 * @param {{ stock: Record<string, { technique: object, cal: number, graded?: object | null }>, measure: (T: object) => { cal: number, graded?: object | null }, log?: (line: string) => void }} options
 *   stock: the stock techniques by name with their swatch readings (cal: the charge factor; graded: the recharged
 *   swatch's { all, escape, edge }, or null when no graded swatch is laid); measure: lays a swatch for a technique
 *   and returns the same reading.
 */
export function createInstrumentCal({ stock, measure, log = () => {} }) {
  const stockKey = new Map(Object.entries(stock).map(([name, s]) => [name, instrumentKey(s.technique)]));
  const own = new Map();
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
        log(`  ${T.name} at ${s ? differs.map(f => `${f} ${T[f]}`).join(', ') : `water ${T.water}, passes ${T.passes}`}: its own swatch charges ${own.get(key).cal.toFixed(2)}x${s ? ` (the stock ${T.name} swatch, ${differs.map(f => `${f} ${s.technique[f]}`).join(', ')}: ${s.cal.toFixed(2)}x)` : ' (no stock swatch of that name)'}`);
      }
      return { ...own.get(key), key, stock: false };
    },
    /** The stock swatch of a technique's name whatever its load: the calibration before this module. Unknown names charge 1. */
    byName(name) { const s = stock[name]; return { cal: s?.cal ?? 1, graded: s?.graded ?? null, key: null, stock: true }; },
    /** The swatches laid beyond the stock ones, for a cache or a report. */
    entries: () => [...own].map(([key, r]) => [key, { ...r }]),
    /** Readings kept from an earlier run of the same swatches. */
    load(entries) { for (const [key, r] of entries) own.set(key, check(key, r)); },
  };
}
