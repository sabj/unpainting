// A crescent: the strokes follow the curve from tip to tip, and pressure rises from nothing at a tip to full in the
// belly and back to nothing, so the brush itself draws the taper. No small strokes are needed at the points.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 9, bristles: 18, capacity: 70 });
const arc = (r, a0, a1, lift) => Array.from({ length: 25 }, (_, i) => { const t = i / 24, a = a0 + (a1 - a0) * t; return { x: 160 + r * Math.cos(a), y: 150 - r * Math.sin(a), p: lift ? 0.12 + 0.8 * Math.sin(Math.PI * t) : 0.85 }; });
let k = 0;
for (const r of [96, 88, 80]) {                                 // three arcs 8 cells apart, the outer one first
  kit.dip(b, { water: 0.85, conc: kit.mix({ ultramarine: 0.5, rose: 0.15 }) });
  const span = 0.18 + 0.1 * k;                                  // the inner arcs stop sooner: the shape is thinner toward its tips
  const pts = arc(r, Math.PI * (1 - span), Math.PI * span, true);
  kit.stroke(b, sheet, k++ % 2 ? pts.reverse() : pts, { between: s => { if (s % 6 === 0) kit.step(sheet, O); } });
}
for (let q = 0; q < 15; q++) kit.step(sheet, O);
kit.dryAll(sheet, O);
await kit.finish('crescent');
