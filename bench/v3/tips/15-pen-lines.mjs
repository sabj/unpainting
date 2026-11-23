// The pen line: what the nib, the flex, the pressure and the speed each do. Top to bottom: a fine stiff nib; a broad
// nib; a flexible nib pressed harder along the line (it opens: thin to thick); the same pen drawn slowly then fast.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const ink = kit.mix({ sepia: 3 });
const wave = (y, p, v) => Array.from({ length: 28 }, (_, i) => ({ x: 40 + 9 * i, y: y + 7 * Math.sin(i / 2.2), p: typeof p === 'function' ? p(i / 27) : p, ...(v ? { v: v(i / 27) } : {}) }));
const fine = kit.createPen({ nib: 0.8, flex: 0.2 }); kit.dipPen(fine, ink); kit.penStroke(fine, sheet, wave(35, 0.6));
const broad = kit.createPen({ nib: 2.4, flex: 0.2 }); kit.dipPen(broad, ink); kit.penStroke(broad, sheet, wave(75, 0.6));
const flexy = kit.createPen({ nib: 0.8, flex: 2.5 }); kit.dipPen(flexy, ink); kit.penStroke(flexy, sheet, wave(115, t => 0.1 + 0.9 * t));   // pressure opens a flexible nib
kit.dipPen(flexy, ink); kit.penStroke(flexy, sheet, wave(160, 0.6, t => (t < 0.5 ? 0.5 : 8)));   // slow for the first half, fast for the second
kit.dryAll(sheet, O);
await kit.finish('pen lines');
