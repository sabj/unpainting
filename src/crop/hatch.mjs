// Hatching: fine pen lines laid along the form (the texture direction of the target) and spaced by how much
// darkness is still wanted, as evenly spaced streamlines (after Jobard and Lefer). Each line is a stroke for
// drawStrokes in pen.mjs. DOM free.
import { gaussian } from '../keyframes/density.mjs';

/** Direction field (unit vectors along the texture) from a density map's structure tensor. */
export function textureDirection(D, w, h, sigma = 2.5) {
  const n = w * h, gx = new Float32Array(n), gy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; gx[i] = D[i + 1] - D[i - 1]; gy[i] = D[i + w] - D[i - w]; }
  const jxx = gaussian(gx.map(v => v * v), w, h, sigma), jyy = gaussian(gy.map(v => v * v), w, h, sigma), jxy = gaussian(gx.map((v, i) => v * gy[i]), w, h, sigma);
  const ux = new Float32Array(n), uy = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = 0.5 * Math.atan2(2 * jxy[i], jxx[i] - jyy[i]) + Math.PI / 2; ux[i] = Math.cos(a); uy[i] = Math.sin(a); }
  return { ux, uy };
}

/**
 * Lines that deliver `need` (mean density wanted over ~6 px) with a nib of width `width` and ink `ink`.
 * Spacing between neighbouring lines = width * ink / need, clamped. Returns strokes.
 */
export function hatch(need, dir, w, h, { width = 1.0, ink = 0.6, minSpacing = 2.2, maxSpacing = 9, minNeed = 0.07, maxLength = 48, minLength = 7, maxTurn = 1.2, seedStep = 3, budget = 400 } = {}) {
  const cell = 2, gw = Math.ceil(w / cell), gh = Math.ceil(h / cell), buckets = new Map(), strokes = [];
  const at = (f, x, y) => f[Math.min(h - 1, Math.max(0, y | 0)) * w + Math.min(w - 1, Math.max(0, x | 0))];
  const spacing = (x, y) => Math.max(minSpacing, Math.min(maxSpacing, width * ink / Math.max(1e-3, at(need, x, y))));
  const key = (x, y) => (Math.floor(y / cell) * gw + Math.floor(x / cell));
  const near = (x, y, r, own) => { const R = Math.ceil(r / cell), cx = Math.floor(x / cell), cy = Math.floor(y / cell); for (let yy = cy - R; yy <= cy + R; yy++) for (let xx = cx - R; xx <= cx + R; xx++) { if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue; const b = buckets.get(yy * gw + xx); if (!b) continue; for (const p of b) if (p.s !== own && (p.x - x) ** 2 + (p.y - y) ** 2 < r * r) return true; } return false; };
  const add = (x, y, s) => { const k = key(x, y); let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push({ x, y, s }); };
  const seeds = []; for (let y = seedStep / 2; y < h; y += seedStep) for (let x = seedStep / 2; x < w; x += seedStep) { const v = at(need, x, y); if (v >= minNeed) seeds.push([v, x + (hash(x, y) - 0.5) * seedStep, y + (hash(y, x) - 0.5) * seedStep]); }
  seeds.sort((a, b) => b[0] - a[0]);
  for (const [, sx, sy] of seeds) {
    if (strokes.length >= budget) break;
    const d0 = spacing(sx, sy); if (near(sx, sy, d0, -1)) continue;
    const id = strokes.length, halves = [];
    for (const sgn of [1, -1]) {
      let x = sx, y = sy, px = 0, py = 0, turned = 0; const pts = [];
      for (let L = 0; L < maxLength / 2; L += 1) {
        let dx = at(dir.ux, x, y), dy = at(dir.uy, x, y); if (!px && !py) { dx *= sgn; dy *= sgn; } else if (dx * px + dy * py < 0) { dx = -dx; dy = -dy; }
        if (px || py) { turned += Math.acos(Math.max(-1, Math.min(1, dx * px + dy * py))); if (turned > maxTurn) break; }
        const nx = x + dx, ny = y + dy; if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) break;
        if (at(need, nx, ny) < minNeed * 0.7 || near(nx, ny, spacing(nx, ny) * 0.6, id)) break;
        x = nx; y = ny; px = dx; py = dy; pts.push({ x, y });
      }
      halves.push(pts);
    }
    const P = [...halves[1].reverse(), { x: sx, y: sy }, ...halves[0]]; if (P.length < minLength) continue;
    const n = P.length, points = P.map((p, j) => { const u = j / (n - 1); return { x: p.x, y: p.y, w: width * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, Math.max(0, u * 1.15 - 0.05))) ** 0.6) }; });
    const inks = points.map((p, j) => ink * (0.8 + 0.2 * Math.sin(Math.PI * j / (n - 1))));
    for (const p of points) add(p.x, p.y, id);
    let len = 0; for (let j = 1; j < n; j++) len += Math.hypot(P[j].x - P[j - 1].x, P[j].y - P[j - 1].y);
    strokes.push({ points, ink: inks, length: len, hatch: true });
  }
  return strokes;
}

function hash(x, y) { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); }
