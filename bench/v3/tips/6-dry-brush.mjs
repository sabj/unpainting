// Dry brush: little water, light pressure, a quick stroke: the paint catches the tops of the paper's grain and skips the hollows.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 9, bristles: 14, capacity: 40, flat: true });
for (const [y, water, p] of [[50, 0.8, 0.9], [100, 0.3, 0.5], [150, 0.15, 0.3]]) {   // top: a wet full stroke, for comparison; then drier and lighter
  kit.dip(b, { water, conc: kit.mix({ umber: 0.9, ultramarine: 0.3 }) });
  kit.stroke(b, sheet, [{ x: 40, y, p }, { x: 160, y: y + 2, p }, { x: W - 40, y, p: p * 0.7 }]);   // no steps between: nothing is left to flow
}
kit.dryAll(sheet, O);
await kit.finish('dry brush');
