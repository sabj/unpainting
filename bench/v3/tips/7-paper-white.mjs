// Paper white: the lightest light is the paper itself. Left: reserved by painting round it. Middle: masked, then washed
// straight over. Right: lifted out of the wet wash by blotting (paler, soft-edged, never quite white again).
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const disc = (cx, cy, r) => { const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) m[y * W + x] = 1; return m; };
kit.applyResist(sheet, disc(160, 100, 22));                    // masking fluid on the middle disc before any paint
const b = kit.createBrush({ radius: 12, bristles: 24, capacity: 80 });
let row = 0;
for (let y = 30; y <= H - 30; y += 14, row++) {
  kit.dip(b, { water: 0.9, conc: kit.mix({ ultramarine: 0.3, sienna: 0.15 }) });
  const gap = Math.abs(y - 100) < 26;                          // rows that cross the left disc stop short of it and start again after it
  const runs = gap ? [[40, 44], [96, W - 40]] : [[40, W - 40]];
  for (const [x0, x1] of runs) if (x1 - x0 > 30 || !gap) kit.stroke(b, sheet, row % 2 ? [{ x: x1, y, p: 0.9 }, { x: x0, y, p: 0.9 }] : [{ x: x0, y, p: 0.9 }, { x: x1, y, p: 0.9 }], { between: s => { if (s % 6 === 0) kit.step(sheet, O); } });
}
kit.blot(sheet, disc(250, 100, 22), { strength: 1, pigmentShare: 1 });   // a tissue pressed on the wash AT ONCE, while water still stands on it: once it has sunk in there is nothing to lift
for (let q = 0; q < 10; q++) kit.step(sheet, O);
kit.dryAll(sheet, O);
kit.liftResist(sheet);                                         // the mask comes off only when the sheet is dry
await kit.finish('paper white');
