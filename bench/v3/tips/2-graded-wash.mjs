// A graded wash: dark at the top, fading to paper, with no steps.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 });
const rows = Math.floor((H - 60) / 14) + 1;
for (let r = 0; r < rows; r++) {
  const y = 30 + 14 * r, fade = 1 - r / (rows - 1);            // 1 at the top, 0 at the bottom
  kit.dip(b, { water: 0.95, conc: kit.mix({ sienna: 0.5 * fade * fade }) });   // the same water every row, less paint each time
  const [x0, x1] = r % 2 ? [W - 40, 40] : [40, W - 40];
  kit.stroke(b, sheet, [{ x: x0, y, p: 0.9 }, { x: (x0 + x1) / 2, y: y + 1, p: 0.9 }, { x: x1, y, p: 0.9 }],
    { between: s => { if (s % 6 === 0) kit.step(sheet, O); } });
}
for (let q = 0; q < 30; q++) kit.step(sheet, O);              // wet rows blend into their neighbours: the steps disappear
kit.dryAll(sheet, O);
await kit.finish('graded wash');
