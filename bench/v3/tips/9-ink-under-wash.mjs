// Ink under a wash: a kite drawn in ink, dried, then washed over on its right half. Once the ink is dry the wash moves
// none of it: the same script with the sheet opened for { ink: 'waterproof' } gave the same picture to the pixel. Only a
// wash laid into ink that is still wet moves a little of soluble ink (the default).
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips', { ink: 'soluble' });
const pen = kit.createPen({ nib: 1.8, flex: 0.5 }), ink = kit.mix({ sepia: 3 });
const kite = [[0.5, 0.12], [0.72, 0.42], [0.5, 0.88], [0.28, 0.42], [0.5, 0.12]];
kit.dipPen(pen, ink); kit.penStroke(pen, sheet, kite.map(([x, y]) => ({ x: W * x, y: H * y, p: 0.8 })));
for (const [a, b2] of [[0, 2], [1, 3]]) { kit.dipPen(pen, ink); kit.penStroke(pen, sheet, [kite[a], kite[b2]].map(([x, y]) => ({ x: W * x, y: H * y, p: 0.7 }))); }
kit.dryAll(sheet);                                        // the ink is dry before the wash, either way
const b = kit.createBrush({ radius: H * 0.04, bristles: 32, capacity: 800 });
for (let x = W * 0.5, k = 0; x <= W * 0.8; x += b.radius * 1.1, k++) { kit.dip(b, { water: 0.9, conc: kit.mix({ rose: 0.9, hansa: 0.3 }) }); const a = { x, y: H * 0.08, p: 0.85 }, c = { x, y: H * 0.92, p: 0.85 }; kit.stroke(b, sheet, k % 2 ? [c, a] : [a, c]); }
kit.dryAll(sheet);
await kit.finish('ink under a wash');
