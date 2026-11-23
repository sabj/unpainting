// Going round a reserved white: a ring whose middle stays paper. The strokes travel ROUND the hole, the innermost
// first with the brush's edge just outside it; nothing is painted across the hole and nothing is dabbed up to it.
import * as kit from './kit.mjs';
const { sheet, O, W, H } = await kit.open('tips');
const R = 7, b = kit.createBrush({ radius: R, bristles: 16, capacity: 70 });   // the ring is 36 cells wide: a brush 14 wide goes round it three times, overlapping
const cx = 160, cy = 100, hole = 30;
const round = (r, from) => Array.from({ length: 37 }, (_, i) => { const a = from + (Math.PI + 0.35) * i / 36; return { x: cx + 1.25 * r * Math.cos(a), y: cy + r * Math.sin(a), p: 0.85 }; });   // half a turn; an oval, to show it is the path that matters
for (const r of [hole + R, hole + R + 11, hole + R + 22]) {     // three laps 11 cells apart, working outward from the hole while each is wet
  for (const from of [0, Math.PI]) {                            // each lap in two halves, a fresh dip for each: one dip does not last a whole lap
    kit.dip(b, { water: 0.9, conc: kit.mix({ cerulean: 0.5, ultramarine: 0.15 }) });
    kit.stroke(b, sheet, round(r, from - 0.17));   // each half starts before the last one ended and runs past the next one's start: the joins overlap while wet
  }
}
kit.wait(sheet, 20);
kit.dryAll(sheet, O);
await kit.finish('ring round a white');
