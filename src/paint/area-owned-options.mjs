// Options an area plan owns (reasoning inventory move 12, docs/how-it-paints.md). With --areaplan the plan's schedule
// is the order of work and its wet sessions are the joins: pass.order and dependsOn say what goes first, pass.session
// which passes are laid back to back while wet (painting-rules 5: the water sets the order, not a ladder). An automatic
// order or join rule typed beside an area plan would either do nothing or overrule the plan, so the run stops before
// painting and names the plan field that says it. Value plans and runs with no plan keep these options.
// Lights too (move 11): the plan lists its lights (pass.lights paper, negativepaint, film or lift, with a polygon and a
// reason; painting-rules 3, 19). No automatic rule holds target-light cells out of an area plan's passes. Edges too
// (move 6): every edge is the plan's (edges, pass.edges.kind, pass.soften; painting-rules 8); no automatic soft ring.
// Ink per area (move 10): each area's drawingRole says whether it gets lines (painting-rules 21); the region-label ink
// decision (sky never inked, and so on) is not run beside an area plan. Sketch-check and the trace-ink limits stay.
const ORDER = 'with an area plan the order of work is the plan\'s: pass.order and pass.dependsOn';
const LIGHTS = 'with an area plan the lights are the plan\'s: pass.lights paper, negativepaint, film or lift, each with a polygon and a reason';
const EDGES = 'with an area plan the edges are the plan\'s: edges (each shared boundary hard, soft or lost), pass.edges.kind and pass.soften';
const INK = 'with an area plan each area\'s drawingRole (none, scaffold, structural, focal) decides its lines: opening lines in scaffold and structural areas, closing ink in structural and focal ones; the region-label ink decision is for value plans';
const SESSION = 'with an area plan the wet sessions are the plan\'s: passes named in one pass.session are laid back to back while wet and dry once; every other pass dries as its move needs';
export const AREA_OWNED_OPTIONS = Object.freeze({
  ...Object.fromEntries(['darkfirst', 'subjectorder', 'bgfirst', 'ordersubject', 'ordersubjmax', 'ordersubjmin', 'ordersubjwall',
    'ordermask', 'orderlight', 'orderdark', 'orderregions', 'orderminpart', 'orderminregion', 'orderfar'].map(k => [k, ORDER])),
  ...Object.fromEntries(['washsession', 'charge', 'wetmix', 'wetmixshare', 'drypigment', 'orderdry'].map(k => [k, SESSION])),
  whitefloor: LIGHTS,
  ...Object.fromEntries(['softwet', 'softwetphases', 'softwetsteps', 'softwetwater', 'softarcs', 'softarclen', 'softmm', 'softsplit', 'softclipmm', 'fwsoften', 'fwsoftmin', 'fwsoftr'].map(k => [k, EDGES])),
});
// switches whose off value is harmless (a recipe may set it) but whose on value adds automatic reserves
const LIGHT_SWITCHES = Object.freeze({ smalllights: ['0'], white: ['none'] }), INK_SWITCHES = Object.freeze({ inkdecide: ['0'], inkdarkrule: ['0'] });

/** Throws when argv names an area plan together with an order, session, light, edge or ink-label option, or an --order other than painter. */
export function refuseAreaOwned(argv) {
  const at = argv.lastIndexOf('--areaplan');
  if (at < 0 || !argv[at + 1] || String(argv[at + 1]).startsWith('--')) return;
  const keys = [...new Set(argv.filter(a => typeof a === 'string' && a.startsWith('--')).map(a => a.slice(2)))];
  const hit = keys.filter(k => Object.hasOwn(AREA_OWNED_OPTIONS, k)).map(k => `--${k}: ${AREA_OWNED_OPTIONS[k]}`);
  const o = argv.lastIndexOf('--order');
  if (o >= 0 && argv[o + 1] !== 'painter') hit.push(`--order ${argv[o + 1]}: ${ORDER}`);
  for (const [sw, why] of [[LIGHT_SWITCHES, LIGHTS], [INK_SWITCHES, INK]]) for (const [k, off] of Object.entries(sw)) { const i = argv.lastIndexOf(`--${k}`); if (i >= 0 && !off.includes(argv[i + 1])) hit.push(`--${k} ${argv[i + 1]}: ${why}`); }
  if (hit.length) throw new Error(`--areaplan owns order, wet sessions, lights, edges and which areas get lines; remove ${hit.join('; ')}`);
}
