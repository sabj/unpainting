// What an eraser does to a pen line (soluble sepia, dry): three zigzags, then the eraser rubbed hard across the middle three times.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const pen = kit.createPen({ nib: 1.6, flex: 0.5 }), ink = kit.mix({ sepia: 3 });
for (const y of [60, 100, 140]) { kit.dipPen(pen, ink); kit.penStroke(pen, sheet, Array.from({ length: 14 }, (_, i) => ({ x: 50 + 17 * i, y: y + (i % 2 ? 12 : -12), p: 0.7 }))); }
kit.dryAll(sheet, O);
for (let k = 0; k < 3; k++) kit.erase(sheet, [{ x: 160, y: 35, p: 1 }, { x: 160, y: 165, p: 1 }], { width: 40 });
await kit.finish('erasing a pen line');
