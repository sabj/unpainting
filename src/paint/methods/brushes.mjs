// --physical 1: brushes sized from a physical sheet and real brushes (src/paint/brushes.json), so every resolution uses the
// same brushes and pixel sizes are outputs. --sheetmm overrides the sheet's width.
// A brush's reach is half its belly or flat width; one load lays water ml / (uptake ml per cm2 x stroke width cm) cm.
import fs from 'fs';
import path from 'path';

export function loadPhysical({ root, opt, num, W2, H2 = W2 }) {
  if (num('physical', 0) <= 0) return null;
  const cfg = JSON.parse(fs.readFileSync(path.join(root, opt('brushes', 'src/paint/brushes.json')), 'utf8'));
  // the picture fitted inside the sheet turned to its orientation, unless --sheetmm fixes the width
  const sh = cfg.sheet, fit = Math.min(sh.width_mm / Math.min(W2, H2), sh.height_mm / Math.max(W2, H2));
  const mmPerCell = opt('sheetmm', '') !== '' ? num('sheetmm', sh.width_mm) / W2 : fit, mm = mmPerCell * W2;
  const B = name => cfg.brushes[name];
  const half = name => B(name).width_mm / 2 / mmPerCell;
  const washSet = ['rigger', 'round4', 'round8', 'round12', 'flat1in', 'mop'].filter(k => B(k));
  // the smallest real brush that reaches r cells
  const pick = r => washSet.find(k => half(k) >= r * 0.999) ?? washSet[washSet.length - 1];
  const uptake = tech => cfg.uptake_ml_per_cm2[tech] ?? cfg.uptake_ml_per_cm2['wet on dry'];
  const loadCm = (name, tech) => B(name).water_ml / (uptake(tech) * B(name).width_mm / 10);
  const loadCells = (name, tech) => loadCm(name, tech) * 10 / mmPerCell;
  // --washbrush name: the biggest brush a wash passage may use, instead of the kit's wash role. Foliage is dabbed with
  // a round about the size of a clump, not swept with a mop.
  // --floorbrush name: the smallest brush a wash passage may use, instead of the kit's floor role (round4, 3 mm).
  // Strips narrower than the floor brush need a smaller one, or every darker pass paints across them.
  const R = { ...cfg.roles, ...(opt('washbrush', '') ? { wash: opt('washbrush', '') } : {}), ...(opt('floorbrush', '') ? { floor: opt('floorbrush', '') } : {}) };
  if (!B(R.wash)) throw new Error(`--washbrush: no brush ${R.wash} in ${opt('brushes', 'src/paint/brushes.json')}`);
  if (!B(R.floor)) throw new Error(`--floorbrush: no brush ${R.floor} in ${opt('brushes', 'src/paint/brushes.json')}`);
  const P = { cfg, mm, mmPerCell, half, pick, loadCm, loadCells, floorR: half(R.floor), washR: half(R.wash), detailR: half(R.detail), dragW: B(R.drag).width_mm / mmPerCell, dragLoad: loadCells(R.drag, 'dry brush') };
  P.summary = () => washSet.map(k => `${k} ${B(k).width_mm} mm = ${(2 * half(k)).toFixed(1)} px, a load lays ${loadCm(k, 'wet on dry').toFixed(0)} cm (${loadCells(k, 'wet on dry').toFixed(0)} px) wet on dry`).join('; ') + `; dry brush ${B(R.drag).width_mm} mm = ${P.dragW.toFixed(1)} px, ${loadCm(R.drag, 'dry brush').toFixed(0)} cm a load`;
  return P;
}

/** A path cut into loads: the brush is reloaded where the water it released runs out. */
export function splitLoads(pts, loadLen) {
  if (!(loadLen > 0) || pts.length < 2) return [pts];
  const out = []; let cur = [pts[0]], run = 0;
  for (let i = 1; i < pts.length; i++) {
    run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    cur.push(pts[i]);
    if (run >= loadLen && i < pts.length - 1) { out.push(cur); cur = [pts[i]]; run = 0; }
  }
  if (cur.length > 1) out.push(cur); else if (out.length) out[out.length - 1].push(cur[0]);
  return out;
}

// Loads that join without a seam: each fresh load starts `feather` cells back over the end of the
// last one, and both sides ramp their pressure across that overlap so the two deposits sum to
// about one. Plain splitLoads leaves a darker band at every reload across broad glazes.
export function splitLoadsFeathered(pts, loadLen, feather) {
  const loads = splitLoads(pts, loadLen);
  if (loads.length < 2 || !(feather > 0)) return loads;
  const len = q => { const d = [0]; for (let i = 1; i < q.length; i++) d.push(d[i - 1] + Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y)); return d; };
  const ramp = (q, fromStart) => { const d = len(q), L = d.at(-1); return q.map((p, i) => { const t = fromStart ? d[i] / feather : (L - d[i]) / feather; const k = Math.max(0.15, Math.min(1, t)); return { ...p, p: (p.p ?? 1) * k }; }); };
  const out = [];
  for (let j = 0; j < loads.length; j++) {
    let q = loads[j];
    if (j > 0) { const prev = loads[j - 1], d = len(prev), back = []; for (let i = prev.length - 1; i >= 0 && d.at(-1) - d[i] <= feather; i--) back.unshift(prev[i]); q = [...back.slice(0, -1), ...q]; q = ramp(q, true); }
    if (j < loads.length - 1) q = ramp(q, false);
    out.push(q);
  }
  return out;
}
