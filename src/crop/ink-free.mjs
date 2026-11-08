// The wash's own target: the original with the planned pen lines taken out, before anything is planned or painted.
//
// A wash plan that reads the original sees the drawing's darkness too and paints it a second time as tone: every
// region crossed by many lines gets a darker mean charge, and dividing that wash out of the original no longer leaves
// the drawing. Here the cells under the planned lines (at their pen contact width, plus a margin for registration)
// are filled from the paper and paint around them, so the wash carries mass and the pen carries line.
//
// Planning only: input is the target and the prepared drawing file; output is a new RGB buffer.

// Planned optical width (cells at the line file's own resolution) to pen contact mm. Calibrated on the line study's
// pen audit: 2.2/1.5/1.0 cells gave about .34/.21/.12 mm. The material clamps contact to its declared range.
const WIDTH_POINTS = Object.freeze([[1.0, 0.12], [1.5, 0.21], [2.2, 0.34]]);
export const PEN_MM = Object.freeze([0.1, 0.4]);

export function contactMm(w) {
  if (Number.isNaN(w) || w === undefined) w = 1.5;
  const pts = WIDTH_POINTS, last = pts[pts.length - 1];
  let mm;
  if (w <= pts[0][0]) mm = pts[0][1] * w / pts[0][0];
  else if (w >= last[0]) mm = last[1] * w / last[0];
  else {
    const k = pts.findIndex(p => p[0] >= w), a = pts[k - 1], b = pts[k];
    mm = a[1] + (b[1] - a[1]) * (w - a[0]) / (b[0] - a[0]);
  }
  return Math.min(PEN_MM[1], Math.max(PEN_MM[0], mm));
}

/** Extracts point coordinates {x, y} from either [x, y] array or {x, y} object representation. */
export function extractPoint(p) {
  if (Array.isArray(p)) {
    if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      return { x: p[0], y: p[1] };
    }
  } else if (p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
    return { x: p.x, y: p.y };
  }
  throw Error(`Invalid point representation: ${JSON.stringify(p)}`);
}

/** Cells within (contact half-width + marginMm) of any planned path, on a w x h grid. */
export function lineCover(doc, w, h, { sheetMm, marginMm = 0.3 } = {}) {
  if (!Number.isInteger(w) || w <= 0 || !Number.isInteger(h) || h <= 0) {
    throw Error('lineCover: w and h must be positive integers');
  }
  if (!doc?.image?.w || !doc?.image?.h || !(doc.image.w > 0) || !(doc.image.h > 0) || !Array.isArray(doc.lines)) {
    throw Error('lineCover: not a drawing file (needs image.w, image.h and lines)');
  }
  if (!(sheetMm > 0)) throw Error('lineCover: sheetMm must be positive');
  if (!(marginMm >= 0)) throw Error('lineCover: marginMm must be non-negative');

  const sx = w / doc.image.w, sy = h / doc.image.h, mmPerCell = sheetMm / w, mask = new Uint8Array(w * h);
  const maxRadius = Math.max(w, h);

  for (const g of doc.lines) {
    const pts = g.points;
    if (!Array.isArray(pts) || pts.length < 2) continue;
    const ws = Array.isArray(g.widths) && g.widths.length === pts.length ? g.widths : pts.map(() => 1.5);
    for (let k = 1; k < pts.length; k++) {
      const p0 = extractPoint(pts[k - 1]);
      const p1 = extractPoint(pts[k]);
      const w0 = Number.isFinite(ws[k - 1]) ? ws[k - 1] : 1.5;
      const w1 = Number.isFinite(ws[k]) ? ws[k] : 1.5;
      const r = Math.min(maxRadius, (contactMm((w0 + w1) / 2) / 2 + marginMm) / mmPerCell);
      stampSegment(mask, w, h, p0.x * sx, p0.y * sy, p1.x * sx, p1.y * sy, r);
    }
  }
  return mask;
}

/**
 * Stamps a line segment of radius r into mask.
 * Pixel centers are at (x + 0.5, y + 0.5).
 */
export function stampSegment(mask, w, h, ax, ay, bx, by, r) {
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by) || !(r > 0)) return;

  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + r));
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;

  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    if (Math.hypot(px - ax - t * dx, py - ay - t * dy) <= r) mask[y * w + x] = 1;
  }
}

/** Fill masked cells from unmasked ones by push-pull (pyramid averaging), per channel. Returns a new buffer. */
function pushPullFill(rgb, mask, w, h, channels = 3) {
  const levels = [];
  let cw = w, ch = h, val = new Float32Array(w * h * channels), wt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) if (!mask[i]) { wt[i] = 1; for (let c = 0; c < channels; c++) val[i * channels + c] = rgb[i * channels + c]; }
  levels.push({ cw, ch, val, wt });
  while (cw > 1 || ch > 1) {
    const nw = Math.max(1, Math.ceil(cw / 2)), nh = Math.max(1, Math.ceil(ch / 2));
    const nv = new Float32Array(nw * nh * channels), nwt = new Float32Array(nw * nh);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const i = y * cw + x, j = (y >> 1) * nw + (x >> 1);
      nwt[j] += wt[i];
      for (let c = 0; c < channels; c++) nv[j * channels + c] += val[i * channels + c];
    }
    levels.push({ cw: nw, ch: nh, val: nv, wt: nwt });
    cw = nw; ch = nh; val = nv; wt = nwt;
  }
  // pull: every level's empty cells take the (normalised) value of their parent
  const mean = (L, j, c) => L.val[j * channels + c] / L.wt[j];
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l], P = levels[l + 1];
    for (let y = 0; y < L.ch; y++) for (let x = 0; x < L.cw; x++) {
      const i = y * L.cw + x;
      if (L.wt[i] > 0) continue;
      const j = (y >> 1) * P.cw + (x >> 1);
      if (P.wt[j] <= 0) continue;
      L.wt[i] = 1;
      for (let c = 0; c < channels; c++) L.val[i * channels + c] = mean(P, j, c);
    }
  }
  const out = Uint8Array.from(rgb);
  const base = levels[0];
  for (let i = 0; i < w * h; i++) if (mask[i] && base.wt[i] > 0) for (let c = 0; c < channels; c++) out[i * channels + c] = Math.round(base.val[i * channels + c] / base.wt[i]);
  return out;
}

/**
 * The target with planned ink removed. Only cells darker than their fill change: the fill never darkens the target,
 * so a planned line over paper (no ink in the source) leaves the paper as it is.
 */
export function removePlannedInk(rgb, w, h, doc, { sheetMm, marginMm = 0.3, channels = 3 } = {}) {
  if (!Number.isInteger(w) || w <= 0 || !Number.isInteger(h) || h <= 0) {
    throw Error('removePlannedInk: w and h must be positive integers');
  }
  if (!rgb || rgb.length < w * h * channels) {
    throw Error('removePlannedInk: rgb buffer size mismatch');
  }
  if (!(sheetMm > 0)) throw Error('removePlannedInk: sheetMm must be positive');

  const mask = lineCover(doc, w, h, { sheetMm, marginMm });
  const filled = pushPullFill(rgb, mask, w, h, channels);
  const out = Uint8Array.from(rgb);
  let changed = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const p = i * channels;
    const lumO = 0.2126 * rgb[p] + 0.7152 * rgb[p + 1] + 0.0722 * rgb[p + 2];
    const lumF = 0.2126 * filled[p] + 0.7152 * filled[p + 1] + 0.0722 * filled[p + 2];
    if (lumF <= lumO) continue;
    for (let c = 0; c < channels; c++) out[p + c] = filled[p + c];
    changed++;
  }
  return { rgb: out, mask, changed };
}
