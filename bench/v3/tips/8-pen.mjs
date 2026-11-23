// The pen: a garden fence. Posts in a broad, firm line; rails in a fine one; the ground in a flexible nib, pressed
// harder from left to right so it swells from thin to thick. Between the posts, three patches of hatching show three
// tones: lines of one direction far apart (light), close (darker), and crossed (darkest).
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const ink = kit.mix({ sepia: 3 });
const broad = kit.createPen({ nib: 2.4, flex: 0.3 }), fine = kit.createPen({ nib: 0.8, flex: 0.2 }), flexy = kit.createPen({ nib: 0.8, flex: 2.5 });
for (let k = 0; k < 6; k++) { kit.dipPen(broad, ink); const x = W * (0.1 + 0.15 * k); kit.penStroke(broad, sheet, [{ x, y: H * 0.25, p: 0.7 }, { x: x + W * 0.002, y: H * 0.8, p: 0.8 }]); }   // posts
for (const y of [0.35, 0.65]) { kit.dipPen(fine, ink); kit.penStroke(fine, sheet, [{ x: W * 0.08, y: H * y, p: 0.6 }, { x: W * 0.9, y: H * (y + 0.02), p: 0.6 }]); }   // rails
kit.dipPen(flexy, ink); kit.penStroke(flexy, sheet, Array.from({ length: 20 }, (_, i) => ({ x: W * (0.08 + 0.82 * i / 19), y: H * (0.86 + 0.02 * Math.sin(i)), p: 0.15 + 0.85 * i / 19 })));   // the ground line, thin to thick
const hatch = (x0, x1, gap, slope) => { let k = 0; for (let x = x0; x <= x1; x += gap, k++) { if (k % 8 === 0) kit.dipPen(fine, ink); kit.penStroke(fine, sheet, [{ x, y: H * 0.4, p: 0.5 }, { x: x + slope, y: H * 0.6, p: 0.5 }]); } };
hatch(W * 0.12, W * 0.22, W * 0.012, W * 0.03);                    // apart: light
hatch(W * 0.42, W * 0.52, W * 0.005, W * 0.03);                    // close: darker
hatch(W * 0.72, W * 0.82, W * 0.005, W * 0.03); hatch(W * 0.72, W * 0.82, W * 0.005, -W * 0.03);   // crossed: darkest
kit.dryAll(sheet);                                                 // as every example: dried to show the dried sheet
await kit.finish('pen');
