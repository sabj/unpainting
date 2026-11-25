// Hard and soft edges on one shape: a pebble. Before it is painted, one stroke of clean water goes along where its
// lower edge will be, damp, not wet. Its top edge meets dry paper and stays hard; its lower edge meets the damp and
// goes soft. Decide each edge before the paint goes on: found or lost.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const cx = W * 0.5, cy = H * 0.48, rx = W * 0.27, ry = H * 0.2;
const water = kit.createBrush({ radius: H * 0.04, bristles: 32, capacity: 800 });
kit.dip(water, { water: 0.45, conc: kit.mix({}) });           // the damp: one stroke of clean water along the pebble's lower edge
kit.stroke(water, sheet, Array.from({ length: 25 }, (_, i) => { const t = i / 24, a = Math.PI * (0.08 + 0.84 * t); return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), p: 0.3 + 0.6 * Math.sin(Math.PI * t) }; }));
const b = kit.createBrush({ radius: H * 0.04, bristles: 32, capacity: 800 }), lanes = 8;
for (let k = 0; k < lanes; k++) {                             // the pebble: strokes along its length, bending with it
  const side = -1 + 2 * k / (lanes - 1), pts = [];           // the outer lanes run along the pebble's edges, so the lowest reaches the damp
  for (let i = 0; i <= 24; i++) { const t = i / 24, half = ry * Math.sin(Math.PI * t) ** 0.5; pts.push({ x: cx - rx + 2 * rx * t, y: cy + side * Math.max(0, half - b.radius * 0.4), p: 0.4 + 0.5 * Math.sin(Math.PI * t) ** 0.4 }); }
  kit.dip(b, { water: 0.7, conc: kit.mix({ umber: 1.5, ultramarine: 0.9 }) });
  kit.stroke(b, sheet, k % 2 ? pts.reverse() : pts);
}
kit.dryAll(sheet);
await kit.finish('hard and soft edges');
