// Pipeline: inking, stage 2 (hold and measure the lines): shadow masses as cross-hatching, for pure ink only.
// In pen and wash a shadow is wash and is never drawn. In pure ink (--inkhatch 1) a shadow mass is hatched: parallel strokes
// at a fixed hand angle, or following the form (along the lines of equal tone), spaced by tone (closer where darker), with
// a second direction crossing where the tone is deep. Off by default. Pure: arrays in, arrays out.
import { boxBlur } from './ink-labels.mjs';

export const HATCH_DEFAULTS = Object.freeze({
  angleDeg: 45,          // the hand angle (--hatchangle) when direction is not taken from the form
  fromForm: false,       // --hatchform 1: along the lines of equal tone, per mass
  baseMm: 0.5,           // the scan spacing; a scan line is drawn where the tone is dark enough for its rank
  ranks: [0.16, 0.3, 0.44],  // darkness (0..1 under the paper) a scan line of rank 0, 1, 2 needs: spacing 1.5, 0.75 and 0.5 mm
  crossDark: 0.5,        // a second direction crosses where the darkness reaches this
  crossMm: 1.0,
  minRunMm: 1.5,
  widthMm: 0.1,
  weight: 0.5,
});

/** Hatch strokes for the cells of `mask` (0/1), as lines [{ points: [{x, y, width, weight}], role: 'hatch' }]. L in L*. */
export function hatchShadows(mask, L, w, h, pxMm, o = HATCH_DEFAULTS) {
  const r = Math.max(1, Math.round(0.6 / pxMm)), blur = boxBlur(L, w, h, r), sorted = Float32Array.from(blur).sort(), paper = sorted[Math.floor(0.9 * sorted.length)];
  const dark = i => Math.max(0, (paper - blur[i]) / Math.max(1, paper));
  // a mass's own direction from the gradient of the blurred tone, doubled-angle averaged; one angle per 64 px tile
  const tile = Math.max(8, Math.round(8 / pxMm)), tw = Math.ceil(w / tile), th = Math.ceil(h / tile), cs = new Float32Array(tw * th), sn = new Float32Array(tw * th);
  if (o.fromForm) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    const gx = blur[i + 1] - blur[i - 1], gy = blur[i + w] - blur[i - w], m = Math.hypot(gx, gy), a = 2 * Math.atan2(gy, gx), t = Math.floor(y / tile) * tw + Math.floor(x / tile);
    cs[t] += m * Math.cos(a); sn[t] += m * Math.sin(a);
  }
  const angleAt = (x, y) => { if (!o.fromForm) return o.angleDeg * Math.PI / 180; const t = Math.floor(y / tile) * tw + Math.floor(x / tile); return (Math.hypot(cs[t], sn[t]) > 1e-3 ? Math.atan2(sn[t], cs[t]) / 2 + Math.PI / 2 : o.angleDeg * Math.PI / 180); };
  const lines = [], wpx = o.widthMm / pxMm;
  const scan = (baseAngle, spacingMm, need) => {
    const cos = Math.cos(baseAngle), sin = Math.sin(baseAngle), step = Math.max(1, spacingMm / pxMm), diag = Math.hypot(w, h);
    // scan line k: points c + t * (cos, sin), with c on the normal through the origin at distance k * step
    for (let k = -Math.ceil(diag / step); k <= Math.ceil(diag / step); k++) {
      const rank = ((k % 3) + 3) % 3, ox = -sin * k * step, oy = cos * k * step; let run = [];
      const flush = () => { if (run.length >= 2 && Math.hypot(run.at(-1).x - run[0].x, run.at(-1).y - run[0].y) * pxMm >= o.minRunMm) lines.push({ points: run, role: 'hatch', inkLabel: 'shadow_mass', inkMinMm: 0 }); run = []; };
      for (let t = -diag; t <= diag; t += 1) {
        const x = Math.round(ox + cos * t), y = Math.round(oy + sin * t);
        if (x < 0 || y < 0 || x >= w || y >= h) { flush(); continue; }
        const i = y * w + x, on = mask[i] && dark(i) >= need(rank);
        if (on) run.push({ x: ox + cos * t, y: oy + sin * t, width: wpx, weight: o.weight }); else flush();
      }
      flush();
    }
  };
  if (!o.fromForm) {
    scan(o.angleDeg * Math.PI / 180, o.baseMm, rank => o.ranks[rank]);
    scan((o.angleDeg + 90) * Math.PI / 180, o.crossMm, () => o.crossDark);
  } else {
    // per tile direction: a scan over the whole sheet at each tile's angle, kept inside that tile
    const seen = new Set();
    for (let t = 0; t < tw * th; t++) {
      const a = Math.hypot(cs[t], sn[t]) > 1e-3 ? Math.round((Math.atan2(sn[t], cs[t]) / 2 + Math.PI / 2) * 20) / 20 : o.angleDeg * Math.PI / 180;
      if (seen.has(a)) continue; seen.add(a);
      const before = lines.length; scan(a, o.baseMm, rank => o.ranks[rank]);
      // keep only the strokes inside tiles whose angle is this one
      const keep = lines.splice(before).filter(g => { const p = g.points[g.points.length >> 1], tt = Math.floor(p.y / tile) * tw + Math.floor(p.x / tile); const aa = Math.hypot(cs[tt], sn[tt]) > 1e-3 ? Math.round((Math.atan2(sn[tt], cs[tt]) / 2 + Math.PI / 2) * 20) / 20 : o.angleDeg * Math.PI / 180; return aa === a; });
      lines.push(...keep);
    }
    scan((o.angleDeg + 90) * Math.PI / 180, o.crossMm, () => o.crossDark);
  }
  return lines;
}
