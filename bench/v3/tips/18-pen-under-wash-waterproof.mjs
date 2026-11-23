// A pen line UNDER a wash, with waterproof ink: the wash passes over it and moves none. Compare example 17: the same script, the other ink.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips', { ink: 'waterproof' });
const pen = kit.createPen({ nib: 1.6, flex: 0.5 }), ink = kit.mix({ sepia: 3 });
for (const y of [60, 100, 140]) { kit.dipPen(pen, ink); kit.penStroke(pen, sheet, Array.from({ length: 14 }, (_, i) => ({ x: 50 + 17 * i, y: y + (i % 2 ? 12 : -12), p: 0.7 }))); }   // three zigzags
kit.dryAll(sheet, O);                                          // the ink is DRY before the wash either way
const b = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 });
let row = 0;
for (let y = 40; y <= 160; y += 14, row++) {                   // a pale wash over the right two thirds: the left third of each line stays as drawn
  kit.dip(b, { water: 0.95, conc: kit.mix({ ochre: 0.2 }) });
  const [x0, x1] = row % 2 ? [W - 40, 120] : [120, W - 40];
  kit.stroke(b, sheet, [{ x: x0, y, p: 0.9 }, { x: x1, y, p: 0.9 }], { between: s => { if (s % 6 === 0) kit.step(sheet, O); } });
}
for (let q = 0; q < 20; q++) kit.step(sheet, O);
kit.dryAll(sheet, O);
await kit.finish('pen under a wash, waterproof ink');
