// Filling an irregular shape: strokes run along its LONG axis and bend with it, each overlapping the last by about
// half the brush, so the shape is one wet wash with no tiles and no paper gaps.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
// the shape: a bent band. centre(t) is its middle line, half(t) its half-width there (cells), t from 0 to 1
const centre = t => ({ x: 50 + 220 * t, y: 105 + 38 * Math.sin(2.6 * t + 0.4) });
const half = t => 12 + 26 * Math.sin(Math.PI * t) ** 0.8 * (1 + 0.25 * Math.sin(7 * t));
const R = 8, b = kit.createBrush({ radius: R, bristles: 18, capacity: 70 });   // 16 cells wide: several strokes fit even where the shape is narrowest
const lanes = 7;                                                // strokes side by side across the widest part: 2 x 38 / 7 = 11 cells apart, under the brush's 16
for (let k = 0; k < lanes; k++) {
  const side = -1 + 2 * (k + 0.5) / lanes, pts = [];            // -1 is one edge of the shape, +1 the other
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, c = centre(t), d = centre(Math.min(1, t + 0.01)), n = Math.hypot(d.x - c.x, d.y - c.y) || 1;
    const off = side * Math.max(0, half(t) - R * 0.8);          // keep the brush's own edge inside the outline
    pts.push({ x: c.x - (d.y - c.y) / n * off, y: c.y + (d.x - c.x) / n * off, p: 0.85 });
  }
  kit.dip(b, { water: 0.9, conc: kit.mix({ sapgreen: 0.45, ochre: 0.15 }) });   // a full brush for every lane
  kit.stroke(b, sheet, k % 2 ? pts.reverse() : pts);
}
kit.wait(sheet, 20);
kit.dryAll(sheet, O);
await kit.finish('fill a shape');
