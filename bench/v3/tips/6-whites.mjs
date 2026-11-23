// Whites: watercolour has no white paint, so the whites are planned before the first wash. Two highlights on one wash.
// Left: painted round: the big brush stops short of it and a smaller brush goes round its edge while the wash is wet.
// Right: masking fluid laid first (a 0/1 value a cell, row by row: m[y * W + x]), washed straight over, rubbed off
// when dry. Lifting (a damp clean brush or kit.blot on a wet wash) takes back part of a tone, never to white.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const disc = (cx, cy, r) => { const m = new Uint8Array(W * H); for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, cy + r); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) m[y * W + x] = 1; return m; };
const r = H * 0.08, L = { x: W * 0.3, y: H * 0.42 }, R = { x: W * 0.7, y: H * 0.42 };
kit.applyResist(sheet, disc(R.x, R.y, r));                    // right: the mask goes on before any paint
const b = kit.createBrush({ radius: H * 0.04, bristles: 32, capacity: 1500 }), paint = kit.mix({ ultramarine: 1.05, sienna: 0.6 });
for (let y = H * 0.15, k = 0; y <= H * 0.85; y += b.radius * 1.1, k++) {
  const dy = Math.abs(y - L.y), gap = dy < r + b.radius ? Math.sqrt((r + b.radius) ** 2 - dy ** 2) : 0;   // rows that would cross the left white stop short of it
  const runs = gap ? [[W * 0.06, L.x - gap], [L.x + gap, W * 0.94]] : [[W * 0.06, W * 0.94]];
  for (const [x0, x1] of runs) { kit.dip(b, { water: 0.85, conc: paint }); kit.stroke(b, sheet, k % 2 ? [{ x: x1, y, p: 0.85 }, { x: x0, y, p: 0.85 }] : [{ x: x0, y, p: 0.85 }, { x: x1, y, p: 0.85 }]); }
}
const s = kit.createBrush({ radius: H * 0.015, bristles: 18, capacity: 150 });
for (const from of [0, Math.PI]) {                            // round the left white in two halves, the brush's inner edge just outside it
  const ring = r + s.radius;
  kit.dip(s, { water: 0.85, conc: paint });
  kit.stroke(s, sheet, Array.from({ length: 25 }, (_, i) => { const a = from - 0.2 + (Math.PI + 0.4) * i / 24; return { x: L.x + ring * Math.cos(a), y: L.y + ring * Math.sin(a), p: 0.85 }; }));
}
kit.dryAll(sheet);
kit.liftResist(sheet);                                        // the mask comes off when the sheet is dry
await kit.finish('whites');
