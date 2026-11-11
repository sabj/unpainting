// Options an area plan owns (reasoning inventory move 12, docs/how-it-paints.md). With --areaplan the plan's schedule
// is the order of work and its wet sessions are the joins: pass.order and dependsOn say what goes first, pass.session
// which passes are laid back to back while wet (painting-rules 5: the water sets the order, not a ladder). An automatic
// order or join rule typed beside an area plan would either do nothing or overrule the plan, so the run stops before
// painting and names the plan field that says it. Value plans and runs with no plan keep these options.
const ORDER = 'with an area plan the order of work is the plan\'s: pass.order and pass.dependsOn';
const SESSION = 'with an area plan the wet sessions are the plan\'s: passes named in one pass.session are laid back to back while wet and dry once; every other pass dries as its move needs';
export const AREA_OWNED_OPTIONS = Object.freeze({
  ...Object.fromEntries(['darkfirst', 'subjectorder', 'bgfirst', 'ordersubject', 'ordersubjmax', 'ordersubjmin', 'ordersubjwall',
    'ordermask', 'orderlight', 'orderdark', 'orderregions', 'orderminpart', 'orderminregion', 'orderfar'].map(k => [k, ORDER])),
  ...Object.fromEntries(['washsession', 'charge', 'wetmix', 'wetmixshare', 'drypigment', 'orderdry'].map(k => [k, SESSION])),
});

/** Throws when argv names an area plan together with an order or session option, or an --order other than painter. */
export function refuseAreaOwned(argv) {
  const at = argv.lastIndexOf('--areaplan');
  if (at < 0 || !argv[at + 1] || String(argv[at + 1]).startsWith('--')) return;
  const keys = [...new Set(argv.filter(a => typeof a === 'string' && a.startsWith('--')).map(a => a.slice(2)))];
  const hit = keys.filter(k => Object.hasOwn(AREA_OWNED_OPTIONS, k)).map(k => `--${k}: ${AREA_OWNED_OPTIONS[k]}`);
  const o = argv.lastIndexOf('--order');
  if (o >= 0 && argv[o + 1] !== 'painter') hit.push(`--order ${argv[o + 1]}: ${ORDER}`);
  if (hit.length) throw new Error(`--areaplan owns order and wet sessions; remove ${hit.join('; ')}`);
}
