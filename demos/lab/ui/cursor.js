// The brush preview under the pointer: a small overlay canvas over the paper, never part of the painting or of a save.
// It is drawn from the pointer and the tool settings; while a brush is down the worker sends the brush's own state along
// with the frames it already posts (worker.js, cursorState), so nothing is read back from the GPU or asked of the worker.
// Sizes are sheet pixels, drawn through one scale from sheet pixels to screen pixels, so a nib of half a millimetre is half a
// millimetre of paper whatever the size of the page or the resolution of the sheet. DOM free apart from the canvas it is given.
const MM = 25.4, REF_DPI = 60; // the resolution the brush and pen were tuned at (worker.js)
const FREE = 0.4;              // a hair holding less than this share of a full hair no longer wets every hollow (brush.js, free)
const WATER = '79,134,184', INK = '40,36,30';

// the marks the pen and the pencil make, in millimetres: the same sums as worker.js begin(), which the page's HUD reports
const nibMm = sizeMm => ((0.6 + (sizeMm / 2 / MM) * REF_DPI * 0.08) / REF_DPI) * MM;
const pointMm = sizeMm => ((0.5 + (sizeMm / 2 / MM) * REF_DPI * 0.05) * 2 / REF_DPI) * MM;

// the number of hairs worker.js gives a brush, and their lengths as brush.js makes them without its random jitter
const bristleCount = (radius, flat) => Math.max(12, Math.round(radius * (flat ? 2.3 : 2)));
const hairLengths = (n, flat) => Array.from({ length: n }, (_, j) => (flat ? 0.975 : 1 - 0.55 * ((j / Math.max(1, n - 1)) * 2 - 1) ** 2));

/** Where each hair of a tuft touches, as an offset from the tuft's centre in sheet pixels, for a heading (tx, ty), a bend
 *  (the pressure the tuft has settled to) and a radius. The same shape as brush.js stroke(): pressed, the tuft splays wider
 *  and the short hairs near the ferrule reach out ahead of the tip; a flat keeps its width and its corners trail. */
function tuftTips(lens, radius, flat, pe, tx, ty) {
  const n = lens.length, nx = -ty, ny = tx;
  const half = flat ? radius * (0.9 + 0.1 * pe) * Math.sqrt(Math.min(1, pe / 0.5)) * (1 + 0.1 * pe) : radius * (0.2 + 0.65 * pe + 0.2 * pe * pe);
  const reach = radius * 0.9 * (0.15 + 0.85 * pe);
  return lens.map((len, j) => {
    const rel = n > 1 ? (2 * j) / (n - 1) - 1 : 0, along = flat ? -radius * 0.35 * pe * rel * rel : reach * (1 - len);
    return [tx * along + nx * rel * half, ty * along + ny * rel * half];
  });
}

export function createCursor(overlay) {
  const g = overlay.getContext('2d'); let dpr = 1;
  const ring = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); };
  return {
    el: overlay,
    // the overlay is as many pixels as the screen shows of the paper, so its lines stay sharp at any size
    size(width, height, ratio) { dpr = ratio; overlay.width = Math.max(1, Math.round(width * ratio)); overlay.height = Math.max(1, Math.round(height * ratio)); },
    clear() { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, overlay.width, overlay.height); },
    /** Draw the instrument at (x, y) in sheet pixels of a sheet `w` pixels wide; returns what it drew, for the checks.
     *  Brush: tuft (tip, bend, len, sat from the worker while it is down) or row (footprint); sat is the water a hair
     *  carries as a share of a full hair, one number at rest and one per hair while a stroke is down. */
    draw(m) {
      const s = overlay.width / m.w, u = dpr / s, radius = (m.sizeMm / 2 / MM) * m.dpi; // u: one screen pixel, in sheet pixels
      g.setTransform(s, 0, 0, s, 0, 0); g.lineJoin = 'round';
      // a pale line round a dark one reads on white paper and on paint
      const outline = () => { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3 * u; g.stroke(); g.strokeStyle = `rgba(${INK},0.85)`; g.lineWidth = u; g.stroke(); };
      if (m.tool === 'dryer') {
        // the airflow's reach, dashed, and the middle of the nozzle
        g.setLineDash([4 * u, 3 * u]); ring(m.x, m.y, radius * 2); outline(); g.setLineDash([]);
        ring(m.x, m.y, 1.5 * u); g.fillStyle = `rgb(${INK})`; g.fill();
        return { tool: 'dryer', px: 4 * radius };
      }
      if (m.tool === 'pen' || m.tool === 'pencil') {
        const mm = m.tool === 'pen' ? nibMm(m.sizeMm) : pointMm(m.sizeMm), px = (mm / MM) * m.dpi; // the true width, not a minimum size
        ring(m.x, m.y, px / 2); outline();
        ring(m.x, m.y, 0.6 * u); g.fillStyle = `rgb(${INK})`; g.fill();
        return { tool: m.tool, mm, px };
      }
      const sats = Array.isArray(m.sat) ? m.sat : null, meanSat = sats ? sats.reduce((a, b) => a + b, 0) / (sats.length || 1) : m.sat;
      if (m.model === 'tuft') {
        const lens = m.len ?? hairLengths(bristleCount(radius, m.flat), m.flat), c = m.tip ?? m; // the tuft sits at its tip, which drags behind the hand
        let tx = m.hx, ty = m.hy;
        if (m.tip) { const sx = m.x - m.tip.x, sy = m.y - m.tip.y, sm = Math.hypot(sx, sy); if (sm > 0.25) { tx = sx / sm; ty = sy / sm; } } // the tuft's heading is tip to handle
        const tips = tuftTips(lens, radius, m.flat, m.tip ? m.bend : m.p, tx, ty);
        // the water each hair carries, as a faint dot under its tip; then the tips, in the paint they are loaded with
        tips.forEach(([dx, dy], j) => { ring(c.x + dx, c.y + dy, (0.8 + 2.2 * Math.min(1, sats ? sats[j] : meanSat)) * u); g.fillStyle = `rgba(${WATER},0.22)`; g.fill(); });
        g.globalAlpha = 0.9; g.fillStyle = m.colour;
        for (const [dx, dy] of tips) { ring(c.x + dx, c.y + dy, 1.2 * u); g.fill(); }
        g.globalAlpha = 1;
        if (m.tip) { ring(m.x, m.y, 2 * u); g.strokeStyle = `rgba(${INK},0.45)`; g.lineWidth = u; g.stroke(); } // the hand, while the tip lags behind it
        return { tool: m.tool, model: 'tuft', bristles: tips.length, live: Boolean(m.tip), px: 2 * radius };
      }
      // a row of bristles touches a strip across the stroke: as wide as the brush spreads under this pressure, at the heading's angle
      const p = m.p, half = m.flat ? radius * (0.9 + 0.1 * p) * Math.sqrt(Math.min(1, p / 0.5)) : radius * (0.25 + 0.75 * p), depth = Math.max(1.5 * u, 0.3 * half);
      g.save(); g.translate(m.x, m.y); g.rotate(Math.atan2(m.hx, -m.hy)); // local x runs across the stroke
      g.beginPath(); if (m.flat) g.rect(-half, -depth, 2 * half, 2 * depth); else g.arc(0, 0, half, 0, 2 * Math.PI);
      g.globalAlpha = 0.3 * Math.min(1, meanSat / FREE); g.fillStyle = m.colour; g.fill(); g.globalAlpha = 1; // the light fill fades as the brush runs dry
      outline(); g.restore();
      return { tool: m.tool, model: 'row', px: 2 * half, fill: Math.min(1, meanSat / FREE) };
    },
  };
}
