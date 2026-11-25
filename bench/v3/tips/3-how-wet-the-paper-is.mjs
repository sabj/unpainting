// How wet the paper is decides what a stroke laid into it does. The same grey cloud dropped into the same blue sky,
// three ways. Left: the sky laid very wet (water 0.9): the cloud spreads, pales and loses its edge. Middle: the sky laid
// damp (water 0.45): the cloud stays where it is put, with a soft edge. Right: the sky dried first: a hard edge.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const big = kit.createBrush({ radius: H * 0.045, bristles: 40, capacity: 500 });
const sky = (x0, x1, water) => { for (let y = H * 0.12, k = 0; y <= H * 0.88; y += big.radius * 1.1, k++) {
  kit.dip(big, { water, conc: kit.mix({ cerulean: 1.05, ultramarine: 0.36 }) });
  const a = { x: W * x0, y, p: 0.85 }, b = { x: W * x1, y, p: 0.85 }; kit.stroke(big, sheet, k % 2 ? [b, a] : [a, b]); } };
const c = kit.createBrush({ radius: H * 0.03, bristles: 30, capacity: 200 });
const cloud = cx => { for (let k = 0; k < 3; k++) {          // three short strokes, more paint and less water than the sky
  kit.dip(c, { water: 0.5, conc: kit.mix({ ultramarine: 2.7, umber: 1.8, rose: 0.45 }) });
  const y = H * (0.42 + 0.07 * k); kit.stroke(c, sheet, [{ x: cx - W * 0.09, y, p: 0.5 }, { x: cx, y: y - H * 0.03, p: 0.9 }, { x: cx + W * 0.09, y, p: 0.5 }]); } };
sky(0.67, 0.97, 0.9); kit.dryAll(sheet); cloud(W * 0.82);     // right: the sky dried first
sky(0.35, 0.64, 0.45); cloud(W * 0.495);                      // middle: damp
sky(0.03, 0.32, 0.9); cloud(W * 0.175);                       // left: very wet, laid last so it is not left running while the rest is painted
kit.dryAll(sheet);                                            // kit.finish does not dry: dry once at the end to see the dried painting
await kit.finish('how wet the paper is');
