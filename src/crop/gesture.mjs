// Turns a traced polyline into a drawn one without moving it off the form: arm and wrist wander, overshoot at both
// ends, breathing pressure. Shared by the pencil and the pen. DOM free.
// Also: pressure rises with curvature (the hand slows into a bend), the lead lands and lifts over `land` px,
// the tail hooks towards the next mark, and `searchPass` drifts a repeat attempt beside the first.
const noise1 = (seed, scale) => { const h = (k) => { const v = Math.sin((k * 127.1 + seed * 311.7)) * 43758.5453; return v - Math.floor(v); }; return x => { const u = x / scale, k = Math.floor(u), f = u - k, s = f * f * (3 - 2 * f); return (h(k) + (h(k + 1) - h(k)) * s) * 2 - 1; }; };
export function gesture(P, seed, { wander = 1.1, overshoot = 0.06, breathe = 0.35, land = 3, hook = 0.5, curve = 0.5, searchPass = 0 } = {}) {
  let Q = P.map(p => ({ ...p }));
  for (let pass = 0; pass < 2; pass++) { // smooth: a drawn line is wrong in the large and smooth in the small
    const S = [Q[0]];
    for (let j = 1; j < Q.length - 1; j++) S.push({ ...Q[j], x: (Q[j - 1].x + 2 * Q[j].x + Q[j + 1].x) / 4, y: (Q[j - 1].y + 2 * Q[j].y + Q[j + 1].y) / 4 });
    S.push(Q[Q.length - 1]); Q = S;
  }
  const n = Q.length; let len = 0; const cum = [0];
  for (let j = 1; j < n; j++) { len += Math.hypot(Q[j].x - Q[j - 1].x, Q[j].y - Q[j - 1].y); cum.push(len); }
  if (len < 3) return Q;
  const arm = noise1(seed, Math.max(18, len * 0.7)), wrist = noise1(seed + 91, Math.max(6, len * 0.22)), hand = noise1(seed + 17, Math.max(10, len * 0.4));
  const drift = searchPass ? noise1(seed + 401 * searchPass, Math.max(24, len * 0.9)) : null;
  const out = Q.map((pt, j) => {
    const a = Q[Math.max(0, j - 1)], c = Q[Math.min(n - 1, j + 1)], tx = c.x - a.x, ty = c.y - a.y, tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
    let off = wander * (0.7 * arm(cum[j]) + 0.3 * wrist(cum[j]));
    if (drift) off += searchPass * 0.9 * drift(cum[j]);
    // curvature here: the turn taken per unit of travel. The hand slows into it and bears down.
    const b = Q[Math.max(0, j - 2)], d = Q[Math.min(n - 1, j + 2)];
    let da = Math.atan2(c.y - pt.y, c.x - pt.x) - Math.atan2(pt.y - b.y, pt.x - b.x);
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const kappa = Math.abs(da) / Math.max(1, Math.hypot(d.x - b.x, d.y - b.y));
    const ends = Math.min(1, 0.25 + 0.75 * Math.min(cum[j], len - cum[j]) / land);
    return { ...pt, x: pt.x + nx * off, y: pt.y + ny * off, p: Math.max(0.03, (pt.p ?? 0.5) * (1 + breathe * hand(cum[j])) * (1 + curve * Math.min(1.5, kappa * 6)) * ends) };
  });
  // the stroke starts before the form and runs past it, the way a hand swings in and out of a line, and the tail
  // swings off it because the hand is already turning towards the next mark as it lifts
  const ext = (from, to, d, swing) => { const dx = to.x - from.x, dy = to.y - from.y, m = Math.hypot(dx, dy) || 1; return { ...to, x: to.x + dx * d - (dy / m) * swing, y: to.y + dy * d + (dx / m) * swing, p: (to.p ?? 0.5) * 0.3 }; };
  const s0 = Math.max(1, Math.hypot(out[1].x - out[0].x, out[1].y - out[0].y)), sN = Math.max(1, Math.hypot(out[n - 1].x - out[n - 2].x, out[n - 1].y - out[n - 2].y));
  const head = ext(out[1] ?? out[0], out[0], overshoot * len / s0, 0);
  const tail = ext(out[n - 2] ?? out[n - 1], out[n - 1], overshoot * len / sN, hook * (arm(len + 7) > 0 ? 1 : -1) * Math.min(2, overshoot * len * 0.4));
  return [head, ...out, tail];
}
