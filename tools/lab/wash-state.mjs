// Fixture preparation by physical moisture state, shared by the CLI sheet and
// its bloom contract. A fixed waiting time is not the same damp wash after a
// change to the transport or absorption model.
// Existing wash fixtures use the mean. Material proofs can also require a
// measured fraction of the footprint to have lost its sheen and remain wet.
export function waitForDamp(sheet, indices, o, advance, maxTime = 300, { dampFraction = 0, wetFraction = 0 } = {}) {
  if (!(o.dt > 0) || !indices.length) throw new Error('damp preparation needs a positive dt and a nonempty footprint');
  if (!(dampFraction >= 0 && dampFraction <= 1 && wetFraction >= 0 && wetFraction <= 1)) throw new Error('damp footprint fractions must be between zero and one');
  const state = () => {
    let film = 0, pores = 0, minFilm = Infinity, maxFilm = 0, damp = 0, wet = 0;
    for (const i of indices) {
      const water = sheet.W[i];
      film += water; pores += sheet.s[i] / sheet.paper.capacity[i];
      minFilm = Math.min(minFilm, water); maxFilm = Math.max(maxFilm, water);
      if (water > o.wetEps) { wet++; if (water <= o.film) damp++; }
    }
    return { film: film / indices.length, pores: pores / indices.length, minFilm, maxFilm, dampFraction: damp / indices.length, wetFraction: wet / indices.length };
  };
  let time = 0, wet = state();
  const ready = () => wet.film <= o.film && wet.dampFraction >= dampFraction && wet.wetFraction >= wetFraction;
  while (!ready() && time < maxTime) { advance(sheet, o); time += o.dt; wet = state(); }
  if (!(ready() && wet.film > o.wetEps && wet.pores > .02)) throw new Error(`wash did not reach damp state: ${JSON.stringify({ time, ...wet })}`);
  return { time, ...wet };
}
