// Brush size: two lemons of about the same size. Left: a big brush, five sweeps that run the length of the fruit and bend with
// it. Right: a small brush, which needs four times the sweeps for much the same shape. Choose
// the biggest brush the shape allows: here the brush is about a quarter as wide (twice its radius) as the lemon is tall.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const paint = kit.mix({ hansa: 1.5, ochre: 0.24 });
const fill = (cx, cy, rx, ry, b, lanes) => {
  for (let k = 0; k < lanes; k++) {
    const side = -1 + 2 * (k + 0.5) / lanes, pts = [];                 // the lanes' places across the lemon, top to bottom; they meet at its tips
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, half = ry * Math.sin(Math.PI * t) ** 0.6;      // the lemon's half-height along its length
      pts.push({ x: cx - rx + 2 * rx * t, y: cy + side * Math.max(0, half - b.radius * 0.7), p: 0.35 + 0.55 * Math.sin(Math.PI * t) ** 0.5 });
    }
    kit.dip(b, { water: 0.85, conc: paint });                          // a full brush for every sweep
    kit.stroke(b, sheet, k % 2 ? pts.reverse() : pts);
  }
};
fill(W * 0.27, H * 0.5, W * 0.21, H * 0.22, kit.createBrush({ radius: H * 0.05, bristles: 40, capacity: 800 }), 5);
fill(W * 0.73, H * 0.5, W * 0.21, H * 0.22, kit.createBrush({ radius: H * 0.0125, bristles: 14, capacity: 200 }), 20);
kit.dryAll(sheet);
await kit.finish('big brush, small brush');
