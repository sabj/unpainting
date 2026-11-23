// Tone from lines: hatching and cross-hatching. Left: wide-spaced hatch, a light tone. Middle: close hatch, darker.
// Right: the close hatch crossed by a second set at an angle, darkest. The lines stay lines; the eye mixes the tone.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const pen = kit.createPen({ nib: 1, flex: 0.4 }), ink = kit.mix({ sepia: 3 });
const hatch = (x0, gap, slope) => { let k = 0; for (let x = x0; x <= x0 + 70; x += gap, k++) { if (k % 6 === 0) kit.dipPen(pen, ink); kit.penStroke(pen, sheet, [{ x, y: 60, p: 0.5 }, { x: x + slope * 0.5, y: 100, p: 0.7 }, { x: x + slope, y: 140, p: 0.4 }]); } };   // every line drawn the same way, top to bottom, lifting at the end
hatch(30, 9, 14);
hatch(125, 4, 14);
hatch(220, 4, 14); hatch(234, 4, -14);
kit.dryAll(sheet, O);
await kit.finish('hatching');
