// A soft edge next to a hard one: the same stroke is hard-edged on dry paper and soft where the paper is already wet.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const water = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 });
for (const y of [112, 126, 140, 154]) {                        // clean water only, on the lower half: paper wet, no colour
  kit.dip(water, { water: 1, conc: kit.mix({}) });
  kit.stroke(water, sheet, [{ x: 40, y, p: 0.9 }, { x: W - 40, y, p: 0.9 }]);
}
const b = kit.createBrush({ radius: 14, bristles: 28, capacity: 80 });
kit.dip(b, { water: 0.7, conc: kit.mix({ sapgreen: 1.2, umber: 0.4 }) });
kit.stroke(b, sheet, [{ x: 50, y: 92, p: 0.9 }, { x: 160, y: 94, p: 0.9 }, { x: W - 50, y: 92, p: 0.9 }]);   // its top half on dry paper, its bottom half on the wet band
kit.wait(sheet, 40);              // the lower edge runs into the wet paper; the upper edge has nowhere to go
kit.dryAll(sheet, O);
await kit.finish('soft and hard edge');
