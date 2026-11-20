// Generated from src/media/settling.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Settling: suspended pigment falling through the film to the paper, at the Stokes speed of its particles, faster into
// the paper's hollows, and the finest particles reaching the fibres by Brownian diffusion as the film thins. The same
// rule for the CPU step (sheet.mjs), the row-band step (sheet-kernel.mjs) and the GPU step (gpu/stepfull.wgsl).
//
//   v = (rho_p - rho_w) g d^2 / (18 mu)                       Stokes' law, a sphere of diameter d in water
//   D = k T / (3 pi mu d)                                     Stokes-Einstein diffusion of the same particle
//   moved = G [1 - exp(-(v B / h + D / l^2) dt)],  B = 1 + gamma hollow,  l = min(h, FIBRE_GAP_MM)
//                                                             of what is suspended, in one step of dt
//
// The diffusion term is what deposits a staining organic (phthalo, quinacridone, 0.05 to 0.2 um): it falls a few
// micrometres in the minutes a wash dries, but diffuses to the surface fibres standing in the film and sticks, at the
// same rate over crests and hollows, so it dries smooth. Without it nearly all of it stayed suspended until the film
// was thin, and the levelling water drained off the crests leaving its pigment there: a grain on the crests, 0.04 of
// the density, where real phthalo washes have under 0.02. For a micrometre grain the diffusion is a small share of
// the fall.
//
// h is the film's physical depth, `hollow` how far the cell lies below the paper's millimetre mean in RMS units
// (paper-relief.mjs), gamma the pigment's granulation. Exact for a well-mixed film over any step: halving dt and
// taking two steps moves the same share. Units: the sheet's water W is a depth in millimetres (its film of 0.02 to 0.03
// is a glossy film tens of micrometres deep) and its clock runs in seconds (evaporation 0.0003 mm a second); the
// speeds below are in millimetres a second.
// DOM free.

const G = 9.81, RHO_W = 1000, MU = 1.0e-3, KT = 4.05e-21;   // m s^-2, kg m^-3, Pa s, J (water near 20 C)
// the shallowest film settling divides by: a film thinner than a particle has nothing left to fall through
const MIN_FILM_MM = 0.001;
// how far a particle diffuses to reach a fibre: the surface fibres (cotton, 15 to 20 um thick, as far apart) stand in
// the film, so a fine particle finds one within about this distance however deep the film is
const FIBRE_GAP_MM = 0.02;

/** Stokes settling speed in mm/s of particles `dUm` micrometres across with density `rhoP` kg/m^3. */
export const stokesMmPerS = (dUm, rhoP) => (Math.max(0, rhoP - RHO_W) * G * (dUm * 1e-6) ** 2) / (18 * MU) * 1000;

/** Brownian diffusion coefficient in mm^2/s of particles `dUm` micrometres across. */
const diffusionMm2PerS = dUm => (KT / (3 * Math.PI * MU * dUm * 1e-6)) * 1e6;

/**
 * A pigment's effective particle diameter (um) and density (kg/m^3). A paint from the table (pigment-physical.mjs) or
 * the hue classes (paint/methods/pigment-physics.mjs) carries its own. A pigment written without them (test pigments,
 * old tapes) is read back from the numbers it has, by the table's own rules: rho is the specific gravity / 50, and the
 * diameter follows granulation as the table's paints have it, 0.08 + 2 sqrt(gamma) um: 0.08 for a staining organic
 * (gamma 0), about 1 for an umber (0.25), 1.6 for the earths (0.55) and 1.9 for ultramarine (0.85).
 */
export function particleOf(p) {
  const rhoP = p.rhoP ?? (p.rho > 0 ? p.rho * 50 * 1000 : 1500);
  const dUm = p.dUm ?? 0.08 + 2 * Math.sqrt(Math.max(0, p.gamma ?? 0));
  return { dUm, rhoP };
}
/** The pigment's settling speed in mm/s. */
export const settleSpeed = p => { const { dUm, rhoP } = particleOf(p); return stokesMmPerS(dUm, rhoP); };

/** The pigment's diffusion coefficient in mm^2/s. */
export const settleDiffusion = p => diffusionMm2PerS(particleOf(p).dUm);

/** The share of a cell's suspended pigment that settles in one step: 1 - exp(-(v B / h + D / l^2) dt). */
export function settleShare(vMmS, dMm2S, gg, hollow, dt, filmMm) {
  const h = Math.max(MIN_FILM_MM, filmMm), l = Math.min(h, FIBRE_GAP_MM);
  return -Math.expm1(-((vMmS * (1 + gg * hollow)) / h + dMm2S / (l * l)) * dt);
}
