// Big shapes first, with the big brush: a sky in one wet wash, dried; then the far hill and the near hill, each one
// wash; the small brush comes last, for the few fence posts. Light before dark, broad before detail.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const big = kit.createBrush({ radius: H * 0.05, bristles: 40, capacity: 1500 });
const band = (y0, y1, conc, edge = null) => {            // rows across the sheet, back and forth; with edge(x), every row follows the hill line
  const gap = big.radius * 1.1;
  for (let y = y0, k = 0; y <= y1; y += gap, k++) {
    kit.dip(big, { water: 0.9, conc });
    const pts = Array.from({ length: 13 }, (_, i) => { const x = W * (0.03 + 0.94 * i / 12); return { x, y: edge ? edge(x) + (y - y0) : y, p: 0.85 }; });
    kit.stroke(big, sheet, k % 2 ? pts.reverse() : pts);
  }
};
band(H * 0.06, H * 0.42, kit.mix({ cerulean: 1.05, ultramarine: 0.3 }));                     // 1: the sky, the biggest shape
kit.dryAll(sheet);                                                                         // dried, so the slopes keep their edge against it
band(H * 0.42, H * 0.64, kit.mix({ ultramarine: 0.9, rose: 0.36, ochre: 0.3 }), x => H * (0.42 + 0.06 * Math.sin(x / W * 5)));   // 2: the far hill
kit.dryAll(sheet);
band(H * 0.62, H * 0.88, kit.mix({ sapgreen: 1.8, ochre: 0.9 }), x => H * (0.62 + 0.06 * Math.sin(x / W * 3 + 1)));            // 3: the near hill
kit.dryAll(sheet);                                                                         // dried: marks laid into a very wet wash spread and vanish
const small = kit.createBrush({ radius: H * 0.006, bristles: 10, capacity: 40 });
for (let k = 0; k < 7; k++) {                                                              // 4: last, the small marks
  kit.dip(small, { water: 0.6, conc: kit.mix({ umber: 3, ultramarine: 0.9 }) });
  const x = W * (0.55 + 0.05 * k), y = H * (0.66 + 0.02 * k);
  kit.stroke(small, sheet, [{ x, y, p: 0.9 }, { x, y: y + H * 0.08, p: 0.5 }]);
}
kit.dryAll(sheet);
await kit.finish('big shapes first');
