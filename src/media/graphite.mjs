import {TAPE} from './brush.mjs';
// a slow wander in 0..1 along the arc length, seeded per stroke: the pressure a hand gives a line
const wander = (s, seed) => 0.5 + 0.25 * Math.sin(s * 0.045 + seed) + 0.25 * Math.sin(s * 0.11 + 2.3 * seed);

/** How proud each fibre stands, 0 (deepest hollow) to 1 (highest crest), from the paper's `proud` (5th to 95th percentile), kept on the paper. */
function proudness(paper) {
  if (paper._proudRank) return paper._proudRank;
  const src = paper.proud ?? paper.height, s = Float32Array.from(src).sort(), lo = s[Math.floor(0.05 * s.length)], hi = s[Math.floor(0.95 * s.length)], r = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) r[i] = Math.max(0, Math.min(1, (src[i] - lo) / (hi - lo || 1)));
  return (paper._proudRank = r);
}

/**
 * The share of a stroke's graphite a cell takes. The lead touches the fibres that stand proud and skips the hollows
 * between them; pressed lighter it touches fewer, so a light line breaks on the tooth and a firm one fills in.
 * `v` is the stroke's pressure there (0..1), `tooth` how much the paper's relief decides (0 none, 1 all).
 * Before: the paper's absolute height times 1.4, capped at 1, which every cell above 0.71 reached (half the sheet), so the
 * line hardly broke.
 */
export function toothTake(paper, i, v, tooth) {
  if (!(tooth > 0) || !(paper?.proud || paper?.height)) return 1;
  const gate = tooth * 0.8 * (1 - Math.min(1, v)), pr = proudness(paper)[i];
  return (1 - tooth) + tooth * Math.max(0, Math.min(1, (pr - gate) / (1 - gate)));
}

/**
 * Lay strokes [{points: [{x, y, s?}]}] (sheet cells) dry into sheet.D[k]. `amount` is the core's deposit (the
 * measured mean density), `width` the line's width in cells, `vary` how far pressure wanders (0..1).
 * Each cell keeps the most graphite any point of one stroke gives it (a max, so nothing pools); crossing strokes add.
 */
export function pencilDraw(sheet, strokes, k, { amount, width = 1.2, vary = 0.35, tooth = 0.4, spacing = 0.35, seed = 1, pressureReference = null, beforeStroke = null, afterStroke = null, arcScale = 1, skipOffSheetPlanning = false, usePointWidths = false, ordinal = 0 } = {}) {
  if (pressureReference !== null && (!Number.isFinite(pressureReference) || pressureReference <= 0)) throw new Error('pencil pressureReference must be finite and positive');
  // Preserve resident sheet truth before direct dry deposition and publish it afterwards.
  if(!skipOffSheetPlanning)sheet._gpu?.syncAll(sheet);
  let synced=!skipOffSheetPlanning;
  const { w, h } = sheet, paper = sheet.paper, D = sheet.D[k];
  const maxWidth=usePointWidths?Math.max(width,...strokes.flatMap(g=>g.points.map(p=>p.nw??width))):width;
  const r = width / 2, R = Math.ceil(maxWidth / 2 + 1), best = new Map();
  let drawn = 0, cellsLaid = 0, offSheetSkipped=0;
  strokes.forEach((g, gi) => {
    const P = g.points; if (!P || P.length < 2) return;
    best.clear();
    if(skipOffSheetPlanning){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of P){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}if(x1+.5+R<0||y1+.5+R<0||x0+.5-R>=w||y0+.5-R>=h){beforeStroke?.({gesture:g,ordinal:gi,cells:[]});drawn++;offSheetSkipped++;afterStroke?.({gesture:g,ordinal:gi,offSheet:true,skipped:true});return;}}
    let arc = 0; const sd = seed * 7.13 + (gi + ordinal) * 1.618;
    // the stroke's darkness from the plan's pressure share: over pressureReference when set, which keeps the line-role
    // hierarchy across strokes; otherwise normalised to the stroke's strongest point
    let smax = pressureReference ?? 0; if (pressureReference === null) for (const q of P) smax = Math.max(smax, q.s ?? 1);
    for (let j = 1; j < P.length; j++) {
      const a = P[j - 1], b = P[j], L = Math.hypot(b.x - a.x, b.y - a.y), m = Math.max(1, Math.ceil(L / spacing));
      for (let q = 0; q <= m; q++) {
        const u = q / m, x = a.x + (b.x - a.x) * u + 0.5, y = a.y + (b.y - a.y) * u + 0.5;
        const sh = ((a.s ?? 1) + ((b.s ?? 1) - (a.s ?? 1)) * u) / (smax || 1);
        const role = Math.max(0, Math.min(1, sh));
        const p = (1 - vary + vary * wander((arc + L * u) * arcScale, sd)) * (pressureReference === null ? 0.55 + 0.45 * role : role);
        for (let yy = Math.floor(y - R); yy <= Math.ceil(y + R); yy++) for (let xx = Math.floor(x - R); xx <= Math.ceil(x + R); xx++) {
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const contactRadius=usePointWidths?((a.nw??width)+((b.nw??width)-(a.nw??width))*u)/2:r;
          const cover = Math.min(1, contactRadius + 0.5 - Math.hypot(xx + 0.5 - x, yy + 0.5 - y)); if (cover <= 0) continue;
          const i = yy * w + xx, v = cover * p, o = best.get(i);
          if (o == null || v > o) best.set(i, v);
        }
      }
      arc += L;
    }
    if(best.size&&!synced){sheet._gpu?.syncAll(sheet);synced=true;}
    beforeStroke?.({ gesture:g, ordinal:gi, cells:[...best.keys()] });
    if(TAPE && sheet._tape) TAPE.push({k:'g',pigment:k,points:P,options:{amount,width,vary,tooth,spacing,seed,pressureReference,arcScale,usePointWidths,ordinal:gi+ordinal}});
    for (const [i, v] of best) { D[i] += amount * v * toothTake(paper, i, v, tooth); cellsLaid++; }
    drawn++;
    if(afterStroke){if(best.size)sheet._gpu?.cpuWroteAll();afterStroke({gesture:g,ordinal:gi,offSheet:!best.size});}
  });
  if (cellsLaid) sheet._gpu?.cpuWroteAll();
  return { drawn, cells: cellsLaid, offSheetSkipped };
}
