// How far one dip goes: four furrows of a ploughed field, each one sweep of the same big brush from one dip, with
// more `capacity` each time (120, 400, 800, 1500). A brush holds a fixed load and runs dry partway along: here, radius
// 43 cells and 36 bristles, capacity 120 lasts about 450 cells and breaks up into dry grain; 400 runs low just before
// the end of the 1,340; 800 and 1,500 last the whole furrow. As a rule (about 36 to 40 bristles), a dip lasts about
// capacity x 150 / radius cells; give a brush that much, or dip again before it runs out.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
[120, 400, 800, 1500].forEach((capacity, k) => {
  const b = kit.createBrush({ radius: H * 0.04, bristles: 36, capacity });
  kit.dip(b, { water: 0.85, conc: kit.mix({ umber: 1.05, ochre: 0.6 }) });
  const y = H * (0.15 + 0.22 * k);
  kit.stroke(b, sheet, Array.from({ length: 13 }, (_, i) => ({ x: W * (0.04 + 0.92 * i / 12), y: y + H * 0.02 * Math.sin(i / 2), p: 0.85 })));
});
kit.dryAll(sheet);
await kit.finish('how far a dip goes');
