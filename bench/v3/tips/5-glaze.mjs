// A glaze over a dried wash: a pear in one yellow-green wash, dried; then one thin violet wash over its shadow side,
// laid once and left. The first colour shows through the second: a shadow without mud.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: H * 0.04, bristles: 36, capacity: 800 });
const half = t => W * 0.17 * Math.sin(Math.PI * t) ** 0.6 * (0.3 + 0.8 * t);              // the pear's half-width, narrow at the top (t 0), round at the base (t 1)
const pear = (conc, from, lanes) => { for (let k = 0; k < lanes; k++) {   // strokes from stalk to base, bending with the outline
  const side = from + (1 - from) * (k + 0.5) / lanes, pts = [];             // -1 the left edge, +1 the right
  for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push({ x: W * 0.5 + side * Math.max(0, half(t) - b.radius * 0.7), y: H * (0.1 + 0.8 * t), p: 0.4 + 0.5 * Math.sin(Math.PI * t) ** 0.4 }); }
  kit.dip(b, { water: 0.8, conc }); kit.stroke(b, sheet, k % 2 ? pts.reverse() : pts); } };
pear(kit.mix({ hansa: 1.2, sapgreen: 0.45 }), -1, 7);         // the pear
kit.dryAll(sheet);                                            // DRY before the glaze
pear(kit.mix({ ultramarine: 0.6, rose: 0.24 }), 0.1, 3);      // the glaze: thin, over the right side, once
kit.dryAll(sheet);
await kit.finish('glaze');
