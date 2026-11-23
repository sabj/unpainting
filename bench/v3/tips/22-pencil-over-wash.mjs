// Pencil over a wash: on the DRY wash (top) and, to show what the simulator does, on the wash while it is still wet (bottom).
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 }), pencil = kit.createPencil({ grade: '2B' });
const band = (ya, yb) => { let row = 0; for (let y = ya; y <= yb; y += 14, row++) { kit.dip(b, { water: 0.9, conc: kit.mix({ ochre: 0.3, rose: 0.08 }) }); const [x0, x1] = row % 2 ? [W - 40, 40] : [40, W - 40]; kit.stroke(b, sheet, [{ x: x0, y, p: 0.9 }, { x: x1, y, p: 0.9 }]); } };
const line = y => kit.pencilStroke(pencil, sheet, [{ x: 50, y, p: 0.6 }, { x: 110, y: y - 12, p: 1 }, { x: 180, y: y + 10, p: 0.7 }, { x: W - 50, y: y - 4, p: 1 }]);
band(30, 86); kit.dryAll(sheet, O);                            // top band: washed, DRIED, then drawn on
line(58);
band(114, 170); kit.wait(sheet, 4); // bottom band: drawn on while wet
line(142);
kit.wait(sheet, 30);
kit.dryAll(sheet, O);
await kit.finish('pencil over a wash');
