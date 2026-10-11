// Planned gestures drawn with the pen on the wash sheet. Pressure follows how much ink the plan wants under the
// point and speed runs the other way. The pen re-dips when it runs low. DOM free.
import { createPen, dipPen, penStroke, penRect } from './pen.mjs';
import { step, dry } from './sheet.mjs';
import { hessianRidges } from '../crop/layers.mjs';
import { gaussian } from '../keyframes/density.mjs';

/**
 * Where a pen should go: ridge strength at a nib's scales, gated by the residual the washes left and put on the
 * residual's scale. A line is a thin dark ridge; a patch of shading is not.
 */
export function lineField(D, residual, w, h, { sigmas = [0.8, 1.2, 1.8] } = {}) {
  const n = w * h, R = hessianRidges(gaussian(D, w, h, 0.7), w, h, sigmas), F = new Float32Array(n);
  const q95 = arr => { const v = []; for (let i = 0; i < n; i++) if (arr[i] > 0) v.push(arr[i]); v.sort((a, b) => a - b); return v.length ? v[Math.floor(v.length * 0.95)] : 1; };
  for (let i = 0; i < n; i++) F[i] = residual[i] > 0 ? R.dark[i] : 0;
  const k = q95(residual) / Math.max(1e-6, q95(F));
  for (let i = 0; i < n; i++) F[i] *= k;
  return F;
}

/**
 * @param sheet     the sheet being painted
 * @param gestures  [{ points: [{x, y}] }] in sheet cells
 * @param want      Float32Array per cell, how much ink the plan wants there (zero where none)
 * @param opts.ink  concentration per pigment of the ink in the pen, as dipPen takes it
 * @param opts.peak the want that means a full-pressure line; defaults to the 95th percentile of the gestures' own
 */
export function drawGestures(sheet, gestures, want, w, h, { ink, peak = null, pen: penOpts = {}, low = 0.25, allowStarvation = false, flowEvery = 60, O, beforeStroke = null, afterStroke = null } = {}) {
  const at = (x, y) => want[Math.max(0, Math.min(h - 1, Math.round(y))) * w + Math.max(0, Math.min(w - 1, Math.round(x)))];
  if (peak == null) {
    const v = [];
    for (const g of gestures) for (const p of g.points) v.push(at(p.x, p.y));
    v.sort((a, b) => a - b);
    peak = v.length ? Math.max(1e-4, v[Math.floor(v.length * 0.95)]) : 1;
  }
  const pen = createPen(penOpts);
  let dips = 0, drawn = 0;
  for (const g of gestures) {
    if (g.points.length < 2) continue;
    // `dip` on a gesture re-dips at its start; a number is the load. `low` is how empty the pen may run before a
    // re-dip inside the gesture (--drawinglogic 2)
    const refillBelow = allowStarvation ? (g.low ?? low) : Math.max(g.low ?? low, Math.min(.9, pen.starve * 1.2));
    if (pen.ink <= 0 || g.dip || pen.ink < pen.capacity * refillBelow) { dipPen(pen, ink, typeof g.dip === 'number' ? g.dip : 1); dips++; }
    // a point may carry its own pressure share `s`, contact width `nw`, speed `v`, and a `dwell` where ink pools
    // (--drawinglogic 2)
    const path = g.points.map(p => {
      const s = p.s != null ? Math.min(1, p.s) : Math.min(1, at(p.x, p.y) / peak);
      const q = { x: p.x + 0.5, y: p.y + 0.5, p: p.p != null ? Math.max(0,Math.min(1,p.p)) : 0.25 + 0.6 * s, v: p.v ?? 1.9 - 1.1 * s };
      if (p.nw != null) q.nw = p.nw;
      if (p.dwell) q.dwell = p.dwell;
      return q;
    });
    if (beforeStroke) beforeStroke({ sheet, pen, path, gesture: g, footprint: penRect(pen, sheet, path), index: drawn });
    const startDips = dips;
    penStroke(pen, sheet, path, { refillBelow, refill: p => { dipPen(p, ink); dips++; }, gpuBetween: true, flowEvery: O ? flowEvery : 0, between: n => { if (O && n % flowEvery === 0) step(sheet, O); } });
    afterStroke?.({pen, gesture:g, reloads:dips-startDips});
    drawn++;
  }
  return { drawn, dips, peak };
}

/**
 * The gestures a drawing of this much line would have, in the order found. The separator's ink share bounds the
 * total length, at a line about a nib and a half wide.
 */
export function lineBudget(gestures, cells, { width = 1.5 } = {}) {
  const kept = [];
  let used = 0;
  for (const g of gestures) {
    if (used >= cells) break;
    kept.push(g);
    used += (g.length ?? g.points.length) * width;
  }
  return kept;
}


// Optional gate for crisp ink, off unless used. Numeric readings are taken between the dip and contact.
export function dryPenGate({ O, audit = [], drySheet = dry } = {}) {
  return ({ sheet, pen, footprint, index }) => {
    const measure = () => {
      if(sheet._gpu)(sheet._gpu.ensurePaperFresh??sheet._gpu.ensureFresh).call(sheet._gpu,sheet,footprint);
      const [x0,y0,width,height] = footprint;
      let water = 0, pore = 0;
      for(let y=y0;y<y0+height;y++) for(let x=x0;x<x0+width;x++){
        const i=y*sheet.w+x;
        water=Math.max(water,sheet.W[i]);
        pore=Math.max(pore,sheet.s[i]/Math.max(1e-9,sheet.paper.capacity[i]));
      }
      if(!Number.isFinite(water)||!Number.isFinite(pore)) throw Error('Nonfinite paper state before ink');
      return {water,pore};
    };
    const before=measure(); let after=before, dried=false;
    if(before.water>.001||before.pore>.02){
      drySheet(sheet,20000,O,{level:60,levelMax:90,dt:6});dried=true;after=measure();
    }
    if(after.water>.001||after.pore>.021) throw Error('Paper still wet before ink gesture '+index);
    if(!Number.isFinite(pen.ink)||pen.ink<=0) throw Error('Empty/nonfinite pen before ink gesture '+index);
    audit.push({index,technique:'ink on dry paper',footprint,before,after,dried,
      instrument:{ink:pen.ink,capacity:pen.capacity,fill:pen.ink/pen.capacity,drop:pen.drop,concentration:Array.from(pen.conc)}});
  };
}
