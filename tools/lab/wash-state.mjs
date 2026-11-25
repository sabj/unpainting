// Fixture preparation by physical moisture state, shared by the CLI sheet and
// its bloom contract. A fixed waiting time is not the same damp wash after a
// change to the transport or absorption model.
export function waitForDamp(sheet, indices, o, advance, maxTime = 300) {
  if (!(o.dt > 0) || !indices.length) throw new Error('damp preparation needs a positive dt and a nonempty footprint');
  const state = () => {
    let film = 0, pores = 0;
    for (const i of indices) { film += sheet.W[i]; pores += sheet.s[i] / sheet.paper.capacity[i]; }
    return { film: film / indices.length, pores: pores / indices.length };
  };
  let time = 0, wet = state();
  while (wet.film > o.film && time < maxTime) { advance(sheet, o); time += o.dt; wet = state(); }
  if (!(wet.film <= o.film && wet.film > o.wetEps && wet.pores > .02)) throw new Error(`wash did not reach damp state: ${JSON.stringify({ time, ...wet })}`);
  return { time, ...wet };
}
