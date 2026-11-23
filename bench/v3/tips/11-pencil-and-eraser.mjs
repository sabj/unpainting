// Pencil lay-in and the eraser: a jug drawn lightly in HB; one wrong line rubbed out BEFORE paint; its base gone over
// in a heavy 2B line; then one pale wash. Light lines all but vanish under the paint; the heavy one shows through.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const hb = kit.createPencil({ grade: 'HB' }), soft = kit.createPencil({ grade: '2B' });
const arc = (cx, cy, rx, ry, a0, a1, p) => Array.from({ length: 25 }, (_, i) => { const a = a0 + (a1 - a0) * i / 24; return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), p }; });
kit.pencilStroke(hb, sheet, arc(W * 0.4, H * 0.55, W * 0.15, H * 0.3, -Math.PI * 0.3, Math.PI * 1.3, 0.4));   // the jug's body, light
kit.pencilStroke(hb, sheet, arc(W * 0.535, H * 0.5, W * 0.07, H * 0.12, -Math.PI / 2, Math.PI / 2, 0.4));    // the handle, both ends on the body
kit.pencilStroke(hb, sheet, [{ x: W * 0.2, y: H * 0.3, p: 0.6 }, { x: W * 0.62, y: H * 0.2, p: 0.6 }]);       // a wrong line...
kit.erase(sheet, [{ x: W * 0.2, y: H * 0.3, p: 1 }, { x: W * 0.62, y: H * 0.2, p: 1 }], { width: H * 0.03 });  // ...rubbed out on bare paper
kit.pencilStroke(soft, sheet, arc(W * 0.4, H * 0.55, W * 0.15, H * 0.3, Math.PI * 0.1, Math.PI * 0.9, 1));     // the base gone over in heavy 2B
const b = kit.createBrush({ radius: H * 0.04, bristles: 32, capacity: 1000 });
for (let y = H * 0.28, k = 0; y <= H * 0.9; y += b.radius * 1.1, k++) { kit.dip(b, { water: 0.9, conc: kit.mix({ cerulean: 0.75, ochre: 0.15 }) }); const a = { x: W * 0.15, y, p: 0.85 }, c = { x: W * 0.85, y, p: 0.85 }; kit.stroke(b, sheet, k % 2 ? [c, a] : [a, c]); }
kit.dryAll(sheet);
await kit.finish('pencil and eraser');
