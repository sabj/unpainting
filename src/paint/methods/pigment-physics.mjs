// --pigphys: supplies missing material properties using an absorption-channel heuristic. It does not identify a
// chemical pigment: red absorption is classed as blue, blue as earth, even absorption as grey. Authored properties
// survive unless their matching CLI override is supplied. Off, pigments pass unchanged.
//   --pigneutral 0.3   a pigment whose absorption spreads less than this share of its peak is a grey
//   --gammablue 0.8, --gammaearth 0.5, --gammagrey 0.6   how strongly each kind granulates
//   --flocblue f, --flocgrey f, --flocviolet f, --flocearth f, --flocyellow f (unset preserves pigment): how strongly each kind flocculates, a share in [0, 1]
//   (the grain slide in src/media/sheet.mjs mixes (1 - floc) * fibre + floc * tooth). Any floc flag turns --pigphys on.

// Box paints settle as their pigments do (always on): each box paint on the sheet carries its published granulation,
// flocculation, staining and density (gamma, floc, omega, rho from the table Paint Lab shares,
// src/media/pigment-physical.mjs). A granulating pigment (ultramarine, cerulean, the earths) settles into the
// paper's hollows as the wash dries; a staining, non-granulating one (phthalos, quinacridone, hansa) does not. The
// colour (K) and scattering (S) are the pigment's own as picked, so only what the sheet does with the paint changes,
// and picking is not affected. Pigments with no box name pass unchanged. The hue heuristic below keeps these
// authored properties; an explicit --gamma* or --floc* flag still wins.
import { BOX } from '../../crop/box.mjs';
import { physicsFields } from '../../media/pigment-physical.mjs';

const FLOC_FLAGS = ['flocblue', 'flocgrey', 'flocviolet', 'flocearth', 'flocyellow'];
const flocOf = (num, flag) => Math.min(1, Math.max(0, num(flag, 0) || 0));

// --gammaviolet g (default 0.4) covers reds and magentas (green absorbed most). --gammayellow g: reds and yellows
// rarely granulate, so when set, an earth with green under --pigyellow 0.35 of blue is a yellow with its own gamma.
const withPhysics = (p, num) => {
  const [r, g, b] = Array.from(p.K), top = Math.max(r, g, b), spread = top - Math.min(r, g, b);
  let kind = spread < num('pigneutral', 0.3) * top ? 'grey' : top === r ? 'blue' : top === b ? 'earth' : 'violet';
  if (kind === 'earth' && (num('gammayellow', -1) >= 0 || num('flocyellow', -1) >= 0) && g < num('pigyellow', 0.35) * b) kind = 'yellow';
  const phys = { blue: { rho: 0.08, gamma: num('gammablue', 0.8) }, earth: { rho: 0.06, gamma: num('gammaearth', 0.5) }, grey: { rho: 0.06, gamma: num('gammagrey', 0.6) }, violet: { rho: 0.05, gamma: num('gammaviolet', 0.4) }, yellow: { rho: 0.05, gamma: num('gammayellow', 0.1) } }[kind];
  const flag = 'floc' + kind, configured = num(flag, NaN);
  const floc = Number.isNaN(configured) ? p.floc : flocOf(num, flag);
  return { ...p, rho: p.rho ?? phys.rho, gamma: num('gamma' + kind, p.gamma ?? phys.gamma), ...(floc != null ? { floc } : {}), kind };
};

/** Box pigments given their published settling physics; colour and scattering kept. */
function boxPhysics({ pigments, log }) {
  const out = pigments.map(p => { const paint = BOX.find(b => b.name === p.name && (p.key == null || b.key === p.key)); return paint ? { ...p, ...physicsFields(paint.physics), key: paint.key } : p; });
  if (out.some((p, j) => p !== pigments[j])) log(`pigments settle as published: ${out.map((p, j) => (p === pigments[j] ? `${j} unchanged` : `${j} ${p.name} gamma ${p.gamma} omega ${p.omega} rho ${p.rho}${p.floc ? ` floc ${p.floc}` : ''}`)).join(', ')}`);
  return out;
}

// The palette's pigments, each given a physics by its hue under --pigphys, as a new array either way.
export function pigmentPhysics({ pigments: given, opt, num, log }) {
  const pigments = boxPhysics({ pigments: given, log });
  const flocSet = FLOC_FLAGS.filter(f => opt(f, '') !== '');
  for (const f of flocSet) { const v = num(f, 0); if (v !== flocOf(num, f)) log(`--${f} ${v} clamped to ${flocOf(num, f)} (floc is a share in [0, 1])`); }
  const on = opt('pigphys', '0') !== '0' || flocSet.length > 0;
  if (flocSet.length && opt('pigphys', '0') === '0') log(`--${flocSet.join(', --')} set without --pigphys: pigment physics turned on (floc needs it)`);
  const out = pigments.map(p => (on ? withPhysics(p, num) : p));
  if (on) log(`pigments given a physics by hue: ${out.map((p, j) => `${j} ${p.kind} gamma ${p.gamma} rho ${p.rho}${p.floc ? ` floc ${p.floc}` : ''}`).join(', ')}`);
  return out;
}
