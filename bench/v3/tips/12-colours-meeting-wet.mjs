// Two colours meeting wet: a sunset sky. Bottom: a yellow wash on the left, dried, then a rose wash on the right whose
// rows reach back over the yellow's edge: a hard seam. Top: the same two washes, the rose laid at once while the
// yellow is still wet: they run together into one soft passage. Soft joins come from wet meeting wet, not from a third,
// mixed colour between. (The bottom is painted first, so nothing wet is left running while the other half is laid.)
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: H * 0.04, bristles: 36, capacity: 800 });
const band = (y0, y1, x0, x1, conc) => { for (let y = y0, k = 0; y <= y1; y += b.radius * 1.1, k++) {
  kit.dip(b, { water: 0.85, conc }); const a = { x: W * x0, y, p: 0.85 }, e = { x: W * x1, y, p: 0.85 }; kit.stroke(b, sheet, k % 2 ? [e, a] : [a, e]); } };
const yellow = kit.mix({ hansa: 1.35 }), rose = kit.mix({ rose: 1.35, hansa: 0.15 });
band(H * 0.58, H * 0.92, 0.04, 0.55, yellow); kit.dryAll(sheet); band(H * 0.58, H * 0.92, 0.5, 0.96, rose);   // bottom: dried between
kit.dryAll(sheet);
band(H * 0.08, H * 0.42, 0.04, 0.55, yellow); band(H * 0.08, H * 0.42, 0.5, 0.96, rose);                     // top: wet meets wet
kit.dryAll(sheet);
await kit.finish('colours meeting wet');
