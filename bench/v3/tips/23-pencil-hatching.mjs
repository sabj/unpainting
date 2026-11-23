// Hatching in pencil: tone from spacing and a crossing set, every line at the same pressure; and the same tone pressed solid (right).
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const pencil = kit.createPencil({ grade: 'HB' });
const hatch = (x0, gap, slope, p = 0.6) => { for (let x = x0; x <= x0 + 60; x += gap) kit.pencilStroke(pencil, sheet, [{ x, y: 60, p }, { x: x + slope, y: 140, p }]); };
hatch(20, 8, 14);                         // wide apart: light
hatch(100, 3, 14);                        // close: darker
hatch(180, 3, 14); hatch(194, 3, -14);    // crossed: darkest
const blunt = kit.createPencil({ grade: 'HB', width: 6 });     // the side of the lead, pressed hard
for (let y = 60; y <= 140; y += 4) kit.pencilStroke(blunt, sheet, [{ x: 262, y, p: 1 }, { x: 302, y, p: 1 }]);
await kit.finish('pencil hatching');
