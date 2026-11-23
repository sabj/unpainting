// The pencil line and pressure: one soft pencil (2B), top to bottom pressed lightly, medium, hard, then light to hard along the line.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const pencil = kit.createPencil({ grade: '2B' });
const wave = (y, p) => Array.from({ length: 28 }, (_, i) => ({ x: 40 + 9 * i, y: y + 6 * Math.sin(i / 2.2), p: typeof p === 'function' ? p(i / 27) : p }));
kit.pencilStroke(pencil, sheet, wave(35, 0.2));                 // light: pale, broken on the grain
kit.pencilStroke(pencil, sheet, wave(75, 0.5));
kit.pencilStroke(pencil, sheet, wave(115, 1));                  // hard: dark and unbroken
kit.pencilStroke(pencil, sheet, wave(160, t => 0.1 + 0.9 * t)); // light to hard along one line
await kit.finish('pencil pressure');
