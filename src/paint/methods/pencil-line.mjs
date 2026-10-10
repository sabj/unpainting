// --penpencil <stage.png>: the opening drawing laid dry in pencil, in the line colour and weight of the target's own
// drawing stage. A wet dip pen wicks and beads where it slows or overlaps; a pencil line stays light and continuous.
// DOM free apart from the one image read.

/**
 * The target drawing stage's line: per-channel density of the line core against its paper, its rgb, and its share of cells.
 * Line cells are at least `cut` (--pencilcut) levels darker than a blurred copy; the core is their darkest third.
 */
export async function measureLine({ file, w, h, sharp, cut = 12, log, min = 50 }) {
  const img = sharp(file).removeAlpha().resize(w, h, { fit: 'fill' });
  const { data } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  const { data: bg } = await img.clone().blur(4).raw().toBuffer({ resolveWithObject: true });
  const n = w * h, lum = (a, i) => 0.2126 * a[3 * i] + 0.7152 * a[3 * i + 1] + 0.0722 * a[3 * i + 2];
  const cells = [];
  for (let i = 0; i < n; i++) { const dl = lum(bg, i) - lum(data, i); if (dl >= cut) cells.push([dl, i]); }
  if (min === 0 && cells.length < 50) return { density: [0, 0, 0], rgb: [0, 0, 0], share: cells.length / n };
  if (cells.length < 50) throw new Error(`--penpencil: only ${cells.length} line cells in ${file}`);
  cells.sort((a, b) => b[0] - a[0]);
  const core = cells.slice(0, Math.max(20, Math.floor(cells.length / 3)));
  const d = [0, 0, 0], rgb = [0, 0, 0];
  for (const [, i] of core) for (let c = 0; c < 3; c++) { d[c] += Math.max(0, -Math.log(Math.max(1, data[3 * i + c]) / Math.max(1, bg[3 * i + c]))); rgb[c] += data[3 * i + c]; }
  for (let c = 0; c < 3; c++) { d[c] /= core.length; rgb[c] /= core.length; }
  const share = cells.length / n;
  log(`pencil: line of ${file}: ${(100 * share).toFixed(2)}% of cells, core rgb ${rgb.map(v => v.toFixed(0)).join('/')}, density ${d.map(v => v.toFixed(3)).join('/')}`);
  return { density: d, rgb, share };
}

/** The pencil pigment: absorption shaped like the measured line, unit mean; the deposit carries the strength. */
export function pencilPigment(density) {
  const m = (density[0] + density[1] + density[2]) / 3 || 1;
  return { K: density.map(v => Math.max(0.02, v / m)), S: [0.02, 0.02, 0.02], rho: 0.05, omega: 60, gamma: 0, strength: m };
}

// a slow wander in 0..1 along the arc length, seeded per stroke: the pressure a hand gives a line
const wander = (s, seed) => 0.5 + 0.25 * Math.sin(s * 0.045 + seed) + 0.25 * Math.sin(s * 0.11 + 2.3 * seed);

/**
 * Lay strokes [{points: [{x, y, s?}]}] (sheet cells) dry into sheet.D[k]. `amount` is the core's deposit (the
 * measured mean density), `width` the line's width in cells, `vary` how far pressure wanders (0..1).
 * Each cell keeps the most graphite any point of one stroke gives it (a max, so nothing pools); crossing strokes add.
 */
export function pencilDraw(sheet, strokes, k, { amount, width = 1.2, vary = 0.35, tooth = 0.4, spacing = 0.35, seed = 1, pressureReference = null, beforeStroke = null, arcScale = 1, skipOffSheetPlanning = false, usePointWidths = false } = {}) {
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
    if(skipOffSheetPlanning){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of P){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}if(x1+.5+R<0||y1+.5+R<0||x0+.5-R>=w||y0+.5-R>=h){beforeStroke?.({gesture:g,ordinal:gi,cells:[]});drawn++;offSheetSkipped++;return;}}
    let arc = 0; const sd = seed * 7.13 + gi * 1.618;
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
    for (const [i, v] of best) { const t = paper.height ? (1 - tooth) + tooth * Math.min(1, Math.max(0, paper.height[i] * 1.4)) : 1; D[i] += amount * v * t; cellsLaid++; }
    drawn++;
  });
  if (cellsLaid) sheet._gpu?.cpuWroteAll();
  return { drawn, cells: cellsLaid, offSheetSkipped };
}
