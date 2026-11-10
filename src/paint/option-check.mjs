// Settings that were typed but could not act, so a run says so instead of painting as if they had.
//
// GATES: a setting that acts only while another is on (the code reads it inside the other's branch). Each entry was
// checked against its reader: recesses and stoneblocks in src/paint/methods/light-to-dark.mjs, deepaccent there too
// (deepMask exists only when it is above 0), skyblue in the palette step of tools/paint-plate.mjs, skylanes in
// skyLaneRadius, touchpoints in the touch-up rounds.
// INERT: settings whose reader is unreachable. The short dry-brush texture marks run only when _valuePlan.texture is
// set, and nothing sets it, so --texvariety, --texflow, --texshort and --texpress change no painting.
export const GATES = Object.freeze({
  recesslayers: 'recesses', recessshare: 'recesses', recessclean: 'recesses', recessaccent: 'recesses',
  stoneblockamt: 'stoneblocks', stoneblockmm: 'stoneblocks', stoneirregular: 'stoneblocks', stonecourses: 'stoneblocks', stoneclusters: 'stoneblocks',
  deepgrow: 'deepaccent', deepaccentin: 'deepaccent', eyering: 'deepaccent',
  groundfrom: 'groundglaze', skyfloc: 'skyblue', skylanemm: 'skylanes', skylanestep: 'skylanes', touchgain: 'touchpoints',
});
const NO_TEXTURE = 'the value planner never plans dry-brush texture passages, so it changes no painting';
export const INERT = Object.freeze({ texvariety: NO_TEXTURE, texflow: NO_TEXTURE, texshort: NO_TEXTURE, texpress: NO_TEXTURE });

const isOn = v => Number(v) > 0;

/**
 * The typed settings that cannot act. given: the option names the user typed; value(name): the final value of an
 * option after the recipe, or undefined. Returns [{flag, reason}].
 */
export function ignoredSettings({ given, value }) {
  const out = [];
  for (const flag of new Set(given)) {
    if (Object.hasOwn(INERT, flag)) out.push({ flag, reason: `--${flag}: ${INERT[flag]}` });
    else if (Object.hasOwn(GATES, flag) && !isOn(value(GATES[flag]))) out.push({ flag, reason: `--${flag} acts only with --${GATES[flag]} above 0` });
  }
  return out;
}

/**
 * Number options given a value that is not a number. named: option -> raw value, from the reads that found NaN.
 * text: the options the painter also reads as text, which may hold a word. Returns [{flag, value}].
 */
export function badNumbers(named, text) {
  return [...named].filter(([flag]) => !text.has(flag)).map(([flag, value]) => ({ flag, value }));
}

const SWITCH_WORDS = new Set(['true', 'false', 'on', 'off', 'yes', 'no']);
/**
 * True when a switch whose default is '0' or '1' is given a word. The painter tests these against '0' or '1', so
 * --contain false leaves contain on and --inkfilter off leaves inkfilter on.
 */
export function isSwitchWord(def, value) {
  return (def === '0' || def === '1') && SWITCH_WORDS.has(String(value).toLowerCase());
}
