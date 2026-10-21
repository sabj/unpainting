// The hair dryer as an instrument: warm air blown at the paper from a nozzle the pointer holds. Under the nozzle the water
// on the paper and in its pores evaporates fast, falling off with distance from the middle of the airflow; and the airflow
// pushes standing water, with the pigment suspended in it, away from the nozzle, so a wet bead can be chased across the
// sheet as a real dryer chases it. Like the brush and the pen it works on the CPU copy of the sheet (worker.js touching()),
// so the WebGPU sheet takes the same change as the CPU sheet. DOM free.
//
// Rates are per second of blowing; a stroke's points each count for TICK of it, and a held nozzle for HOLD each time the
// page reports it still there, so the same path blows the same air whatever the frame rate.
export const TICK = 0.016, HOLD = 0.03;
const EVAP = 4;     // water depth evaporated per second at the middle of the airflow (a wash stands about 0.5 to 2 deep)
const PORES = 1;    // and from the pores of damp paper
const PUSH = 20;    // the share of standing water moved one cell outward per second, per pass, at the middle
const PASSES = 4;   // passes per blow at 60 dpi: how many cells a bead can travel in one blow, so it runs ahead of the nozzle
const FILM = 0.01;  // water thinner than this clings to the paper and is not pushed

/** A dryer whose airflow reaches `radius` sheet pixels; `res` is the sheet's resolution against the reference 60 dpi. */
export function createDryer({ radius, res = 1 }) {
  return { radius: Math.max(2, radius), passes: Math.max(1, Math.round(PASSES * res)) };
}

/** How far from the nozzle a blow can change the sheet, in cells. */
export const dryerReach = d => Math.ceil(d.radius) + d.passes + 2;

/** Blow at `at` ({ x, y } in sheet pixels) for `seconds`. */
export function blow(dryer, sheet, at, seconds) {
  const { w, h, W, s, M, ever, G, K } = sheet, R = dryer.radius;
  const x0 = Math.max(0, Math.floor(at.x - R)), x1 = Math.min(w - 1, Math.ceil(at.x + R)), y0 = Math.max(0, Math.floor(at.y - R)), y1 = Math.min(h - 1, Math.ceil(at.y + R));
  if (x1 < x0 || y1 < y0) return;
  // the heat falls off steeply from the middle of the airflow; the push less so, as the air fans out over the paper
  const falloff = (x, y) => { const d = Math.hypot(x - at.x, y - at.y) / R; return d >= 1 ? 0 : (1 - d) * (1 - d); };
  const fan = (x, y) => { const d = Math.hypot(x - at.x, y - at.y) / R; return d >= 1 ? 0 : 1 - d; };
  // evaporation, strongest in the middle of the airflow
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const f = falloff(x, y); if (!f) continue;
    const i = y * w + x;
    if (W[i] > 0) W[i] = Math.max(0, W[i] - EVAP * f * seconds);
    if (s[i] > 0) s[i] = Math.max(0, s[i] - PORES * f * seconds);
  }
  // the push: each pass moves a share of each cell's standing water and suspended pigment one cell outward, split between
  // its neighbours across and along by the direction away from the nozzle; worked out from the sheet before the pass, so
  // the order of the cells does not matter. More passes at a finer resolution move the water as far in millimetres.
  const bw = x1 - x0 + 3, bh = y1 - y0 + 3, dW = new Float32Array(bw * bh), dG = Array.from({ length: K }, () => new Float32Array(bw * bh));
  const share = Math.min(0.6, PUSH * seconds);
  for (let pass = 0; pass < dryer.passes; pass++) {
    dW.fill(0); for (const a of dG) a.fill(0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * w + x, water = W[i]; if (water <= FILM) continue;
      const f = fan(x, y); if (!f) continue;
      let dx = x - at.x, dy = y - at.y; const d = Math.hypot(dx, dy); if (d < 0.5) continue; // the middle has no outward
      dx /= d; dy /= d;
      const q = (water - FILM) * share * f, ax = Math.abs(dx), ay = Math.abs(dy), sum = ax + ay;
      const local = (y - y0 + 1) * bw + (x - x0 + 1);
      for (const [to, part, nx, ny] of [[local + Math.sign(dx), ax / sum, x + Math.sign(dx), y], [local + Math.sign(dy) * bw, ay / sum, x, y + Math.sign(dy)]]) {
        if (!part || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const moved = q * part, frac = moved / water;
        dW[local] -= moved; dW[to] += moved;
        for (let k = 0; k < K; k++) { const g = G[k][i] * frac; if (g) { dG[k][local] -= g; dG[k][to] += g; } }
      }
    }
    for (let ly = 0; ly < bh; ly++) for (let lx = 0; lx < bw; lx++) {
      const l = ly * bw + lx, d = dW[l], x = x0 - 1 + lx, y = y0 - 1 + ly;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      if (d) { W[i] = Math.max(0, W[i] + d); if (d > 0) { M[i] = 1; ever[i] = 1; } }
      for (let k = 0; k < K; k++) { const g = dG[k][l]; if (g) G[k][i] = Math.max(0, G[k][i] + g); }
    }
  }
  sheet.wetDirty = 1;
}
