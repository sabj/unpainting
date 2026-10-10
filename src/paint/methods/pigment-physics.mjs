// --pigphys: gives each recovered pigment settling and granulation by the channel it absorbs most: red absorbed is a
// blue (heavy, granulating), blue absorbed is an earth, even absorption is a grey. Off, pigments pass unchanged.
//   --pigneutral 0.3   a pigment whose absorption spreads less than this share of its peak is a grey
//   --gammablue 0.8, --gammaearth 0.5, --gammagrey 0.6   how strongly each kind granulates
//   --flocblue f, --flocgrey f, --flocviolet f (default 0 = unset): how strongly each kind flocculates, a share in [0, 1]
//   (the grain slide in src/media/sheet.mjs mixes (1 - floc) * fibre + floc * tooth). Any floc flag turns --pigphys on.

const FLOC_FLAGS = ['flocblue', 'flocgrey', 'flocviolet'];
const flocOf = (num, flag) => Math.min(1, Math.max(0, num(flag, 0) || 0));

// --gammaviolet g (default 0.4) covers reds and magentas (green absorbed most). --gammayellow g: reds and yellows
// rarely granulate, so when set, an earth with green under --pigyellow 0.35 of blue is a yellow with its own gamma.
const withPhysics = (p, num) => {
  const [r, g, b] = Array.from(p.K), top = Math.max(r, g, b), spread = top - Math.min(r, g, b);
  let kind = spread < num('pigneutral', 0.3) * top ? 'grey' : top === r ? 'blue' : top === b ? 'earth' : 'violet';
  if (kind === 'earth' && num('gammayellow', -1) >= 0 && g < num('pigyellow', 0.35) * b) kind = 'yellow';
  const phys = { blue: { rho: 0.08, gamma: num('gammablue', 0.8) }, earth: { rho: 0.06, gamma: num('gammaearth', 0.5) }, grey: { rho: 0.06, gamma: num('gammagrey', 0.6) }, violet: { rho: 0.05, gamma: num('gammaviolet', 0.4) }, yellow: { rho: 0.05, gamma: num('gammayellow', 0.1) } }[kind];
  const floc = { blue: flocOf(num, 'flocblue'), grey: flocOf(num, 'flocgrey'), violet: flocOf(num, 'flocviolet'), earth: 0, yellow: 0 }[kind];
  return { ...p, ...phys, ...(floc > 0 ? { floc } : {}), kind };
};

// The palette's pigments, each given a physics by its hue under --pigphys, as a new array either way.
export function pigmentPhysics({ pigments, opt, num, log }) {
  const flocSet = FLOC_FLAGS.filter(f => num(f, 0) !== 0);
  for (const f of flocSet) { const v = num(f, 0); if (v !== flocOf(num, f)) log(`--${f} ${v} clamped to ${flocOf(num, f)} (floc is a share in [0, 1])`); }
  const on = opt('pigphys', '0') !== '0' || flocSet.length > 0;
  if (flocSet.length && opt('pigphys', '0') === '0') log(`--${flocSet.join(', --')} set without --pigphys: pigment physics turned on (floc needs it)`);
  const out = pigments.map(p => (on ? withPhysics(p, num) : p));
  if (on) log(`pigments given a physics by hue: ${out.map((p, j) => `${j} ${p.kind} gamma ${p.gamma} rho ${p.rho}${p.floc ? ` floc ${p.floc}` : ''}`).join(', ')}`);
  return out;
}
