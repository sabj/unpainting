// A glaze: a thin second wash over a DRY first one. Both colours show, and the edges of the first stay where they were.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 });
const wash = (paint, xa, xb, ya, yb) => {
  let row = 0;
  for (let y = ya; y <= yb; y += 14, row++) {
    kit.dip(b, { water: 0.9, conc: paint });
    const [x0, x1] = row % 2 ? [xb, xa] : [xa, xb];
    kit.stroke(b, sheet, [{ x: x0, y, p: 0.9 }, { x: x1, y, p: 0.9 }], { between: s => { if (s % 6 === 0) kit.step(sheet, O); } });
  }
  for (let q = 0; q < 15; q++) kit.step(sheet, O);
};
wash(kit.mix({ hansa: 0.4 }), 40, W - 120, 30, H - 30);
kit.dryAll(sheet, O);                                          // the whole point: the first wash is DRY before the second goes on
wash(kit.mix({ cerulean: 0.3 }), 120, W - 40, 60, H - 60);     // thin, laid once, not scrubbed: scrubbing lifts the wash below
kit.dryAll(sheet, O);
await kit.finish('glaze');
