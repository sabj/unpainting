// A pen line over a wash: crisp on a DRY wash (top), feathered when the wash is still wet (bottom).
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 });
const band = (ya, yb) => { let row = 0; for (let y = ya; y <= yb; y += 14, row++) { kit.dip(b, { water: 0.9, conc: kit.mix({ ochre: 0.3, rose: 0.08 }) }); const [x0, x1] = row % 2 ? [W - 40, 40] : [40, W - 40]; kit.stroke(b, sheet, [{ x: x0, y, p: 0.9 }, { x: x1, y, p: 0.9 }], { between: s => { if (s % 6 === 0) kit.step(sheet, O); } }); } };
const pen = kit.createPen({ nib: 2, flex: 0.6 });
const line = y => { kit.dipPen(pen, kit.mix({ sepia: 3 })); kit.penStroke(pen, sheet, [{ x: 50, y, p: 0.5 }, { x: 110, y: y - 12, p: 0.9 }, { x: 180, y: y + 10, p: 0.6 }, { x: W - 50, y: y - 4, p: 0.9 }]); };
band(30, 86); kit.dryAll(sheet, O);                            // top band: washed, DRIED, then drawn on
line(58);
band(114, 170); for (let q = 0; q < 4; q++) kit.step(sheet, O); // bottom band: drawn on while wet
line(142);
for (let q = 0; q < 30; q++) kit.step(sheet, O);
kit.dryAll(sheet, O);
await kit.finish('pen over wash');
