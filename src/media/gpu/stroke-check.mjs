// --gpustrokes check: eligible ordinary GPU strokes are laid twice from the same state, on CPU and GPU.
// CPU fallback strokes and wash splats bypass this check. Results are compared inside the stroke's box.
// Both executions omit within-stroke flow. The GPU result is kept, so check mode can change the painting.
// Lines are printed for strokes that differ.
const snap = (brush, sheet) => ({
  hairs: brush.hairs.map(h => ({ water: h.water, pig: h.pig && h.pig.slice() })), resW: brush.resW, resP: brush.resP && brush.resP.slice(), rs: brush.rs.s,
  carry: brush.carry, heading: brush.heading, travel: brush.travel, sinceDip: brush.sinceDip, onPaper: brush._onPaper, t0: brush._strokeT0, clock: sheet.clock, contact: sheet._contactBrush, touched: sheet.touched ? sheet.touched.slice() : null,
});
const restore = (brush, sheet, s) => {
  brush.hairs.forEach((h, j) => { h.water = s.hairs[j].water; if (s.hairs[j].pig) for (let k = 0; k < s.hairs[j].pig.length; k++) h.pig[k] = s.hairs[j].pig[k]; });
  brush.resW = s.resW; if (s.resP) for (let k = 0; k < s.resP.length; k++) brush.resP[k] = s.resP[k];
  brush.rs.s = s.rs; brush.carry = s.carry; brush.heading = s.heading; brush.travel = s.travel; brush.sinceDip = s.sinceDip; brush._onPaper = s.onPaper; brush._strokeT0 = s.t0; sheet.clock = s.clock; sheet._contactBrush = s.contact;
  if (s.touched) sheet.touched.set(s.touched); else sheet.touched = null;
};
const CHECK = { strokes: 0, bad: 0, worst: 0, sum: 0, shown: 0 };
if (typeof process !== 'undefined') process.on('exit', () => { if (CHECK.strokes) console.log(`stroke check: ${CHECK.strokes} strokes, ${CHECK.bad} differing (worst ${CHECK.worst.toExponential(2)})`); });

export function checkedStroke(brush, sheet, path, options, { cpuStroke, gpuStroke, rect }) {
  const link = sheet._gpu, [x0, y0, rw, rh] = rect;
  link.ensureFresh(sheet, rect);
  const s0 = snap(brush, sheet), fields = [sheet.W, sheet.s, sheet.M, sheet.ever, ...sheet.G, ...sheet.P, ...sheet.D];
  const grab = () => fields.map(a => { const o = new Float32Array(rw * rh); for (let y = 0; y < rh; y++) o.set(a.subarray((y0 + y) * sheet.w + x0, (y0 + y) * sheet.w + x0 + rw), y * rw); return o; });
  const before = grab();
  const { between, ...plain } = options;
  link.pause(); let ret; try { ret = cpuStroke(brush, sheet, path, plain); } finally { link.resume(); }
  const cpu = grab(), cb = snap(brush, sheet);
  // put the CPU copy back as it was (the GPU still holds the state before the stroke), then lay it on the GPU
  fields.forEach((a, f) => { for (let y = 0; y < rh; y++) a.set(before[f].subarray(y * rw, (y + 1) * rw), (y0 + y) * sheet.w + x0 + 0); });
  restore(brush, sheet, s0);
  gpuStroke(brush, sheet, path, plain);
  link.settleBrush(brush);
  link.down(sheet, rect);
  const gpu = grab();
  let worst = 0, sum = 0, n = 0, over = 0;
  for (let f = 0; f < fields.length; f++) for (let i = 0; i < cpu[f].length; i++) { const d = Math.abs(cpu[f][i] - gpu[f][i]); if (d > worst) worst = d; sum += d; n++; if (d > 1e-4) over++; }
  let hairD = 0; brush.hairs.forEach((h, j) => { hairD = Math.max(hairD, Math.abs(h.water - cb.hairs[j].water)); });
  CHECK.strokes++; CHECK.sum += sum / n; if (worst > CHECK.worst) CHECK.worst = worst;
  const LIMIT = +((typeof process !== 'undefined' && process.env.GPU_CHECK_LIMIT) || 2e-5);
  if (worst > LIMIT || over > 0 || hairD > 1e-2) {
    CHECK.bad++;
    console.log(`stroke check: ${path.length} pts, radius ${brush.radius}, ${brush.hairs.length} hairs${brush.flat ? ' flat' : ''}, bridge ${brush.bridge}, wetMix ${brush.wetMix}, clip ${sheet.clip ? 'on' : 'off'}, wetting ${sheet.wetting ? 'on' : 'off'}, upright ${options.upright}; box ${rw}x${rh}: worst ${worst.toExponential(2)}, mean ${(sum / n).toExponential(2)}, cells over 1e-4 ${over}, hair water worst ${hairD.toExponential(2)}, rng ${cb.rs === brush.rs.s ? 'same' : 'DIFFERENT'}`);
  }
  if (worst > LIMIT && CHECK.shown++ < 6) {
    let shown = 0;
    for (let y = 0; y < rh && shown < 8; y++) for (let x = 0; x < rw && shown < 8; x++) {
      const j = y * rw + x; let bad = false; for (let f = 0; f < fields.length; f++) if (Math.abs(cpu[f][j] - gpu[f][j]) > LIMIT) bad = true;
      if (bad) { shown++; const i = (y0 + y) * sheet.w + x0 + x; console.log(`  cell ${x0 + x},${y0 + y}: W ${cpu[0][j].toFixed(4)} ${gpu[0][j].toFixed(4)}  s ${cpu[1][j].toFixed(4)} ${gpu[1][j].toFixed(4)}  M ${cpu[2][j]} ${gpu[2][j]}  before W ${before[0][j].toFixed(4)} M ${before[2][j]}  clip ${sheet.clip ? sheet.clip[i] : '-'}`); }
    }
    console.log(`  path ${JSON.stringify(path.slice(0, 4).map(p => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), p: p.p == null ? null : +p.p.toFixed(3), r: p.r == null ? null : +p.r.toFixed(3) })))} carry ${s0.carry} travel ${s0.travel}`);
  }
  return ret;
}
