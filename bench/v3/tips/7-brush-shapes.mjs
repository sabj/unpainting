// The brush's own shape makes the form: a leaf is one stroke (press, then lift to a point); a petal is a curved
// stroke thin, full, thin; grass is a flick that starts pressed and ends in the air. No outlines, no filling in.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: H * 0.03, bristles: 30, capacity: 300 });
const swell = t => 0.08 + 0.85 * Math.sin(Math.PI * t) ** 1.2;        // nothing, full, nothing
const leaf = (x, y, dx, dy, bend) => { kit.dip(b, { water: 0.8, conc: kit.mix({ sapgreen: 2.1, ochre: 0.45 }) });
  kit.stroke(b, sheet, Array.from({ length: 17 }, (_, i) => { const t = i / 16; return { x: x + dx * t - bend * dy * Math.sin(Math.PI * t), y: y + dy * t + bend * dx * Math.sin(Math.PI * t), p: swell(t) }; })); };
for (let k = 0; k < 5; k++) leaf(W * 0.08, H * (0.2 + 0.15 * k), W * 0.25, -H * 0.05, 0.12);   // left: five leaves, one stroke each
for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3;                                       // middle: a flower of six petals
  kit.dip(b, { water: 0.8, conc: kit.mix({ rose: 1.8, hansa: 0.15 }) });
  kit.stroke(b, sheet, Array.from({ length: 13 }, (_, i) => { const t = i / 12, rr = H * 0.18 * t, aa = a + 0.35 * Math.sin(Math.PI * t); return { x: W * 0.52 + rr * Math.cos(aa), y: H * 0.5 + rr * Math.sin(aa), p: swell(t) }; })); }
const g = kit.createBrush({ radius: H * 0.012, bristles: 14, capacity: 100 });
for (let k = 0; k < 14; k++) { kit.dip(g, { water: 0.7, conc: kit.mix({ sapgreen: 2.4, umber: 0.6 }) });   // right: grass, flicked upward
  const x = W * (0.72 + 0.018 * k), y = H * 0.85; kit.stroke(g, sheet, Array.from({ length: 13 }, (_, i) => { const t = i / 12; return { x: x + W * 0.03 * t * t * (k % 2 ? 1 : -0.6), y: y - H * (0.2 + 0.1 * (k % 3)) * t, p: 0.9 * (1 - t) + 0.03 }; })); }
kit.dryAll(sheet);
await kit.finish('the brush makes the shape');
