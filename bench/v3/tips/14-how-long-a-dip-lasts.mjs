// How long one dip lasts: six equal strokes from ONE dip, top to bottom, then the same six with a dip before each.
// Count your strokes: after two or three the brush is giving less paint and the wash goes pale and streaky.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 9, bristles: 18, capacity: 70 });
const paint = kit.mix({ rose: 0.5, ultramarine: 0.2 });
kit.dip(b, { water: 0.85, conc: paint });                       // left: one dip for all six
for (let k = 0; k < 6; k++) kit.stroke(b, sheet, [{ x: 30, y: 30 + 28 * k, p: 0.85 }, { x: 150, y: 30 + 28 * k, p: 0.85 }]);
for (let k = 0; k < 6; k++) {                                   // right: a dip before every stroke
  kit.dip(b, { water: 0.85, conc: paint });
  kit.stroke(b, sheet, [{ x: 170, y: 30 + 28 * k, p: 0.85 }, { x: 290, y: 30 + 28 * k, p: 0.85 }]);
}
kit.dryAll(sheet, O);
await kit.finish('how long a dip lasts');
