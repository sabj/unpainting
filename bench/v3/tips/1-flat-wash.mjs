// A flat wash: one even tone with no stripes and no gaps.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 });
const paint = kit.mix({ ultramarine: 0.35 });
let row = 0;
for (let y = 30; y <= H - 30; y += 14, row++) {              // rows 14 cells apart for a brush 24 cells wide: every row overlaps the last by almost half
  kit.dip(b, { water: 0.9, conc: paint });                    // a full brush for every row: a brush that runs dry leaves a pale stripe
  const [x0, x1] = row % 2 ? [W - 40, 40] : [40, W - 40];     // back and forth, as a hand does
  kit.stroke(b, sheet, [{ x: x0, y, p: 0.9 }, { x: (x0 + x1) / 2, y: y + 1, p: 0.9 }, { x: x1, y, p: 0.9 }],
    { between: s => { if (s % 6 === 0) kit.step(sheet, O); } });   // let the water move while the row is laid
}
for (let q = 0; q < 20; q++) kit.step(sheet, O);              // the rows are all still wet: give them time to level into one
kit.dryAll(sheet, O);
await kit.finish('flat wash');
