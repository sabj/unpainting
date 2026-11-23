// Rubbing out pencil BEFORE paint: four lines, an eraser across their middle at full pressure, then light on the right.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const pencil = kit.createPencil({ grade: '2B' });
for (const [y, p] of [[40, 0.4], [70, 1], [100, 0.4], [130, 1]]) kit.pencilStroke(pencil, sheet, [{ x: 30, y, p }, { x: W - 30, y: y + 4, p }]);
kit.erase(sheet, [{ x: 100, y: 25, p: 1 }, { x: 100, y: 145, p: 1 }], { width: 30 });     // hard: almost all of it comes off
kit.erase(sheet, [{ x: 220, y: 25, p: 0.3 }, { x: 220, y: 145, p: 0.3 }], { width: 30 }); // light: a ghost stays
await kit.finish('erasing pencil before paint');
