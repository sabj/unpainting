// Tapering to a point by lifting pressure. Top: one stroke at even pressure, blunt at both ends. Middle: the same path
// with the pressure lifted away at the end. Bottom: a sliver, thin-thick-thin, from one stroke.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 10, bristles: 20, capacity: 70 });
const path = (y, press) => Array.from({ length: 21 }, (_, i) => ({ x: 50 + 11 * i, y: y + 6 * Math.sin(i / 3.2), p: press(i / 20) }));
for (const [y, press] of [[50, () => 0.85], [100, t => (t < 0.5 ? 0.85 : 0.85 * (1 - (t - 0.5) / 0.5) ** 1.5 + 0.03)], [150, t => 0.05 + 0.85 * Math.sin(Math.PI * t) ** 1.5]]) {
  kit.dip(b, { water: 0.8, conc: kit.mix({ sienna: 0.7, umber: 0.2 }) });
  kit.stroke(b, sheet, path(y, press));
}
kit.dryAll(sheet, O);
await kit.finish('taper to a point');
