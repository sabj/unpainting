// Pipeline: inking, stage 2 (hold and measure the lines): the ink-or-wash decision for every candidate line.
// A point of a candidate line is drawn only when the ink rule of the ground under it allows it (ink-labels.mjs) and the
// source shows a pen line there, not a mass edge (line-class.mjs). A long, smooth line that is mostly pen line is
// structure and is kept whatever the ground says. Pure: arrays in, arrays out, with a record of every cut.
import { resample, turning } from './ink-lines.mjs';
import { classifyPathDetail, CLASS, MASS_DEFAULTS } from './line-class.mjs';
import { ruleAt, INK_RULES } from './ink-labels.mjs';

const arc = pts => { const d = [0]; for (let k = 1; k < pts.length; k++) d.push(d[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y)); return d; };
export const DECIDE_DEFAULTS = Object.freeze({
  ...MASS_DEFAULTS,
  reachMm: 0.6,            // a contour is drawn when either side within this reach is ink-worthy
  dropFaint: true,         // a point with no contrast of its own and no step beside it is texture
  keepPenShare: 0.6,       // a structural line is at least this share pen line
  elongatedDegPerMm: 25,   // a trunk or branch stroke turns no faster than this
});

/**
 * Decide `lines` ({ points: [{x, y, width?, weight?}], ... }).
 * @param ctx { L, w, h, pxMm, cellLabel(x, y) -> label, shadow? (0/1 plane) }
 * @returns { lines, stats } stats: { lengthPx, keptPx, massBefore, massAfter, dropped: { mass, faint, label, short, squiggle }, byLabel }
 */
export function decideLines(lines, ctx, o = DECIDE_DEFAULTS) {
  const { L, w, h, pxMm } = ctx, reach = Math.max(1, o.reachMm / pxMm);
  const labelAt = (x, y) => {
    const xi = Math.max(0, Math.min(w - 1, x)), yi = Math.max(0, Math.min(h - 1, y));
    return ctx.shadow && ctx.shadow[yi * w + xi] ? 'shadow_mass' : ctx.cellLabel(xi, yi);
  };
  const drop = { mass: 0, faint: 0, label: {}, short: 0 }, byLabel = {}, out = [];
  let lengthPx = 0, keptPx = 0, massLen = 0, keptMass = 0;
  const add = (label, key, px) => { (byLabel[label] ??= { keptPx: 0, droppedPx: 0 })[key] += px; };
  for (const g of lines) {
    const R = resample(g.points, 1); if (R.length < 2) continue;
    const { cls, contrast } = classifyPathDetail(R, L, w, h, pxMm, o), d = arc(R), total = d.at(-1);
    lengthPx += total;
    let pen = 0, mass = 0;
    for (let k = 1; k < R.length; k++) { const s = d[k] - d[k - 1]; if (cls[k] === CLASS.pen) pen += s; else if (cls[k] === CLASS.mass) { mass += s; massLen += s; } }
    const structural = total * pxMm >= o.structureMm && turning(R) / pxMm <= o.structureDegPerMm && pen >= o.keepPenShare * total;
    const rules = R.map(p => ruleAt(labelAt, p.x, p.y, reach));
    const live = new Uint8Array(R.length);
    for (let k = 0; k < R.length; k++) {
      const seg = k ? d[k] - d[k - 1] : 0, r = rules[k];
      if (structural) { live[k] = 1; continue; }
      if (cls[k] === CLASS.mass) { drop.mass += seg; add(r.label ?? 'none', 'droppedPx', seg); continue; }
      if (cls[k] === CLASS.faint && o.dropFaint) { drop.faint += seg; add(r.label ?? 'none', 'droppedPx', seg); continue; }
      if (r.ink !== 'none' && r.penContrast && contrast[k] < r.penContrast) { const name = r.label; drop.label[name] = (drop.label[name] ?? 0) + seg; add(name, 'droppedPx', seg); continue; }
      if (r.ink === 'none') { const name = labelAt(Math.round(R[k].x), Math.round(R[k].y)); drop.label[name] = (drop.label[name] ?? 0) + seg; add(name, 'droppedPx', seg); continue; }
      live[k] = 1;
    }
    let start = -1;
    for (let k = 0; k <= R.length; k++) {
      const on = k < R.length && live[k];
      if (on && start < 0) start = k;
      if (!on && start >= 0) {
        const piece = R.slice(start, k), pd = arc(piece), pl = pd.at(-1), mid = rules[start + (piece.length >> 1)];
        const lenMm = pl * pxMm, tooShort = piece.length < 2 || lenMm < Math.max(0.3, structural ? 0 : (mid.minMm ?? 0));
        const tooTurny = !structural && mid.ink === 'elongated' && turning(piece) / pxMm > o.elongatedDegPerMm;
        if (tooShort || tooTurny) { drop.short += pl; add(mid.label ?? 'none', 'droppedPx', pl); }
        else {
          out.push({ ...g, points: piece });
          keptPx += pl; add(mid.label ?? 'none', 'keptPx', pl);
          for (let j = start + 1; j < k; j++) if (cls[j] === CLASS.mass) keptMass += d[j] - d[j - 1];
        }
        start = -1;
      }
    }
  }
  const mm = px => px * pxMm;
  return { lines: out, stats: {
    lines: lines.length, pieces: out.length, lengthPx, keptPx,
    massBefore: lengthPx ? massLen / lengthPx : 0, massAfter: keptPx ? keptMass / keptPx : 0,
    droppedMm: { mass: mm(drop.mass), faint: mm(drop.faint), short: mm(drop.short), label: Object.fromEntries(Object.entries(drop.label).map(([k, v]) => [k, mm(v)])) },
    byLabelMm: Object.fromEntries(Object.entries(byLabel).map(([k, v]) => [k, { kept: mm(v.keptPx), dropped: mm(v.droppedPx) }])),
  } };
}

export { INK_RULES };
