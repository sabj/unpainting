// A pencil lay-in under washes: the same lines, light and heavy, bare on the left, under a pale wash in the middle and a dark wash on the right.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const pencil = kit.createPencil({ grade: '2B' });
[0.25, 1, 0.25, 1, 0.25, 1].forEach((p, k) => kit.pencilStroke(pencil, sheet, [{ x: 20, y: 40 + 24 * k, p }, { x: W - 20, y: 40 + 24 * k + 6, p }]));   // light and heavy in turn
kit.dryAll(sheet, O);
const b = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 });
const wash = (xa, xb, conc) => { let col = 0; for (let x = xa; x <= xb; x += 14, col++) { kit.dip(b, { water: 0.9, conc }); const [y0, y1] = col % 2 ? [H - 25, 25] : [25, H - 25]; kit.stroke(b, sheet, [{ x, y: y0, p: 0.9 }, { x, y: y1, p: 0.9 }], { between: s => { if (s % 6 === 0) kit.step(sheet, O); } }); } };
wash(120, 190, kit.mix({ ultramarine: 0.25 }));                // pale
for (let q = 0; q < 20; q++) kit.step(sheet, O); kit.dryAll(sheet, O);
wash(230, 290, kit.mix({ ultramarine: 1.2, umber: 0.4 }));     // dark
for (let q = 0; q < 20; q++) kit.step(sheet, O); kit.dryAll(sheet, O);
await kit.finish('pencil under a pale and a dark wash');
