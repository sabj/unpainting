// Trying to lift pencil from under a DRIED wash: heavy lines, a wash over the right half, dried; then one eraser stroke, hard, down across bare and washed paper alike.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const pencil = kit.createPencil({ grade: '2B' });
for (const y of [50, 80, 110, 140]) kit.pencilStroke(pencil, sheet, [{ x: 30, y, p: 1 }, { x: W - 30, y: y + 4, p: 1 }]);
kit.dryAll(sheet, O);
const b = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 });
let row = 0; for (let y = 35; y <= 160; y += 14, row++) { kit.dip(b, { water: 0.9, conc: kit.mix({ ultramarine: 0.35 }) }); kit.stroke(b, sheet, row % 2 ? [{ x: W - 30, y, p: 0.9 }, { x: 170, y, p: 0.9 }] : [{ x: 170, y, p: 0.9 }, { x: W - 30, y, p: 0.9 }], { between: s => { if (s % 6 === 0) kit.step(sheet, O); } }); }
for (let q = 0; q < 20; q++) kit.step(sheet, O); kit.dryAll(sheet, O);
for (const x of [100, 240]) kit.erase(sheet, [{ x, y: 30, p: 1 }, { x, y: 165, p: 1 }], { width: 30 });  // the same rub on bare paper and on the wash
await kit.finish('erasing pencil under a dried wash');
