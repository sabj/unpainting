// Options an area plan owns (reasoning inventory move 12, docs/how-it-paints.md). With --areaplan the plan's schedule
// is the order of work and its wet sessions are the joins: pass.order and dependsOn say what goes first, pass.session
// which passes are laid back to back while wet (painting-rules 5: the water sets the order, not a ladder). An automatic
// order or join rule typed beside an area plan would either do nothing or overrule the plan, so the run stops before
// painting and names the plan field that says it. Value plans and runs with no plan keep these options.
// Lights too (move 11): the plan lists its lights (pass.lights paper, negativepaint, film or lift, with a polygon and a
// reason; painting-rules 3, 19). No automatic rule holds target-light cells out of an area plan's passes.
const ORDER = 'with an area plan the order of work is the plan\'s: pass.order and pass.dependsOn';
const LIGHTS = 'with an area plan the lights are the plan\'s: pass.lights paper, negativepaint, film or lift, each with a polygon and a reason';
const SESSION = 'with an area plan the wet sessions are the plan\'s: passes named in one pass.session are laid back to back while wet and dry once; every other pass dries as its move needs';
export const AREA_OWNED_OPTIONS = Object.freeze({
  ...Object.fromEntries(['darkfirst', 'subjectorder', 'bgfirst', 'ordersubject', 'ordersubjmax', 'ordersubjmin', 'ordersubjwall',
    'ordermask', 'orderlight', 'orderdark', 'orderregions', 'orderminpart', 'orderminregion', 'orderfar'].map(k => [k, ORDER])),
  ...Object.fromEntries(['washsession', 'charge', 'wetmix', 'wetmixshare', 'drypigment', 'orderdry'].map(k => [k, SESSION])),
  whitefloor: LIGHTS,
});
// switches whose off value is harmless (a recipe may set it) but whose on value adds automatic reserves
const LIGHT_SWITCHES = Object.freeze({ smalllights: ['0'], white: ['none'] });

/** Throws when argv names an area plan together with an order, session or light option, or an --order other than painter. */
export function refuseAreaOwned(argv) {
  const at = argv.lastIndexOf('--areaplan');
  if (at < 0 || !argv[at + 1] || String(argv[at + 1]).startsWith('--')) return;
  const keys = [...new Set(argv.filter(a => typeof a === 'string' && a.startsWith('--')).map(a => a.slice(2)))];
  const hit = keys.filter(k => Object.hasOwn(AREA_OWNED_OPTIONS, k)).map(k => `--${k}: ${AREA_OWNED_OPTIONS[k]}`);
  const o = argv.lastIndexOf('--order');
  if (o >= 0 && argv[o + 1] !== 'painter') hit.push(`--order ${argv[o + 1]}: ${ORDER}`);
  for (const [k, off] of Object.entries(LIGHT_SWITCHES)) { const i = argv.lastIndexOf(`--${k}`); if (i >= 0 && !off.includes(argv[i + 1])) hit.push(`--${k} ${argv[i + 1]}: ${LIGHTS}`); }
  if (hit.length) throw new Error(`--areaplan owns order, wet sessions and lights; remove ${hit.join('; ')}`);
}
