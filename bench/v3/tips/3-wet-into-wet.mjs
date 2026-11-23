// Wet into wet: a second colour laid into a wash that is still wet joins it with a soft, travelling edge.
// Lower band: the second colour is laid OVERLAPPING the wet first one and on past it: the two run together.
// Upper band (kit only): one strong stroke dropped into the middle of the wet wash. In this simulator it all but
// vanishes: the standing water thins it and carries it off. So charge colour in from the wash's edge, as below.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 });
const rows = (ya, yb, xa, xb, paint) => { let r = 0; for (let y = ya; y <= yb; y += 14, r++) { kit.dip(b, { water: 0.9, conc: paint }); const [x0, x1] = r % 2 ? [xb, xa] : [xa, xb]; kit.stroke(b, sheet, [{ x: x0, y, p: 0.9 }, { x: x1, y, p: 0.9 }], { between: s => { if (s % 6 === 0) kit.step(sheet, O); } }); } };
rows(30, 72, 40, W - 40, kit.mix({ ochre: 0.3 }));              // upper band, wet
const c = kit.createBrush({ radius: 9, bristles: 18, capacity: 70 });
kit.dip(c, { water: 0.5, conc: kit.mix({ ultramarine: 1.6, rose: 0.3 }) });
kit.stroke(c, sheet, [{ x: 80, y: 50, p: 0.8 }, { x: 160, y: 54, p: 0.9 }, { x: 240, y: 50, p: 0.8 }]);   // dropped into the middle of it
rows(114, 170, 40, 190, kit.mix({ ochre: 0.3 }));               // lower band: the first colour, left part
rows(114, 170, 150, W - 40, kit.mix({ ultramarine: 0.5, rose: 0.1 }));   // at once, the second colour from inside the wet first one outward
for (let q = 0; q < 12; q++) kit.step(sheet, O);                // the running together happens in these steps and while the sheet dries
kit.dryAll(sheet, O);
await kit.finish('wet into wet');
