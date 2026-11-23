// Two shapes meeting along a shared edge. Left pair: the first is DRIED before its neighbour is laid against it, and
// the edge between them stays crisp. Right pair: the neighbour is laid while the first is wet, and the two run together
// along the edge (a lost edge). Both are right; choose which the edge should be.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const b = kit.createBrush({ radius: 8, bristles: 18, capacity: 70 });
const edge = y => 14 * Math.sin((y - 30) / 26);                 // the shared edge: a wavy line, x as a function of y
const block = (x0, side, paint) => {                            // strokes run ALONG the shared edge (down the sheet), the one beside the edge first
  for (let k = 0; k < 4; k++) {
    const pts = Array.from({ length: 15 }, (_, i) => { const y = 34 + 9.5 * i; return { x: x0 + edge(y) + side * (8 + 11 * k), y, p: 0.85 }; });
    kit.dip(b, { water: 0.9, conc: paint });
    kit.stroke(b, sheet, k % 2 ? pts.reverse() : pts, { between: s => { if (s % 6 === 0) kit.step(sheet, O); } });
  }
};
block(90, -1, kit.mix({ hansa: 0.5, ochre: 0.1 }));
kit.dryAll(sheet, O);                                           // dry first: a crisp shared edge
block(90, +1, kit.mix({ ultramarine: 0.45 }));
kit.dryAll(sheet, O);
block(235, -1, kit.mix({ hansa: 0.5, ochre: 0.1 }));            // not dried: the blue goes in beside wet yellow and the edge is lost
block(235, +1, kit.mix({ ultramarine: 0.45 }));
for (let q = 0; q < 30; q++) kit.step(sheet, O);
kit.dryAll(sheet, O);
await kit.finish('shared edge');
