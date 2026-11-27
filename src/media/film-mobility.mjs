// Lubrication conductance per unit pressure slope, before rho*g/(3*mu).
// levelFloor is the water held in the tooth, not part of the free film. Two
// half cells are hydraulic resistances in series: average 1/h^3, not h.
// Thus a face closes continuously as either free film disappears. Averaging
// the total depths gave a newly connected, almost-damp cell a finite flux.
export function filmMobility(wa, wb, floor) {
  const a = Math.max(0, wa - floor), b = Math.max(0, wb - floor);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (!(lo > 0)) return 0;
  const r = lo / hi;
  // This form avoids multiplying two tiny cubes (underflow in float32).
  return 2 * lo * lo * lo / (1 + r * r * r);
}

export function filmMobilityWgsl() {
  return `fn filmMobility(wa: f32, wb: f32, floor: f32) -> f32 {
  let a = max(0.0, wa - floor); let b = max(0.0, wb - floor);
  let lo = min(a, b); let hi = max(a, b);
  if (!(lo > 0.0)) { return 0.0; }
  let r = lo / hi;
  return 2.0 * lo * lo * lo / (1.0 + r * r * r);
}`;
}
