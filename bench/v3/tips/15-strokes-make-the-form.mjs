// Two or three shaped strokes side by side make a whole odd form; beside each, the same form outlined and filled
// flat. Left: a rock, a bush, a boat's bow, each built of a few strokes that swell, turn and lift. Right: the same
// silhouettes, outlined with a small brush and filled with even rows of one mix. Positions are shares of the sheet;
// the capacities are for this full-size sheet.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const S = Math.min(W, H);
const path = (n, at) => Array.from({ length: n }, (_, i) => at(i / (n - 1)));
const swell = (t, top = 0.45) => (t < top ? Math.sin(Math.PI / 2 * t / top) : Math.cos(Math.PI / 2 * (t - top) / (1 - top)));
const flat = kit.createBrush({ radius: S * 0.05, bristles: 44, capacity: 1200, flat: true });
const round = kit.createBrush({ radius: S * 0.04, bristles: 40, capacity: 900 });
const rows = [0.2, 0.52, 0.84].map(f => H * f), L = W * 0.25, R = W * 0.72;

// ROCK, left: three flat strokes one above the other, each following the dome, each laid into the one before while it
// is wet, so the joins are soft. A flat's width comes from its blade (90: square across, full width; towards 0: on
// its edge, thin); pressure hardly changes it, but presses more of the hairs down. The lit top: pale, its blade turned
// towards its edge at both ends, so the rock's sides come round instead of ending square. The middle: darker, the
// blade turning towards its edge at the left end. The foot: darkest, pressed harder towards the shadow side (right),
// then carried out along the ground as the cast shadow, faster, lifting and turning onto its edge to a thin end.
const dome = (k, t) => ({ x: L - S * (0.16 - 0.01 * k) + S * (0.32 - 0.02 * k) * t, y: rows[0] - S * 0.05 + S * 0.055 * k - S * (0.06 - 0.02 * k) * Math.sin(Math.PI * t) });
kit.dip(flat, { water: 0.85, conc: kit.mix({ ochre: 1.2, umber: 0.4 }) });
kit.stroke(flat, sheet, path(20, t => ({ ...dome(0, t), p: 0.6 + 0.4 * Math.sin(Math.PI * t), blade: 20 + 70 * Math.sin(Math.PI * t) })));
kit.dip(flat, { water: 0.85, conc: kit.mix({ ultramarine: 1.2, sienna: 1.4 }) });
kit.stroke(flat, sheet, path(20, t => ({ ...dome(1, t), p: 0.9, blade: 30 + 60 * Math.sin(Math.PI * Math.min(1, 0.2 + t)) })));
kit.dip(flat, { water: 0.8, conc: kit.mix({ ultramarine: 2.6, umber: 2.6 }) });
kit.stroke(flat, sheet, path(24, t => (t < 0.7 ? { ...dome(2, t / 0.7), p: 0.5 + 0.5 * t / 0.7, v: 40, blade: 30 + 60 * Math.min(1, 2.5 * t) } : { x: dome(2, 1).x + S * 0.12 * (t - 0.7) / 0.3, y: dome(2, 1).y + S * 0.01, p: 1 - 0.95 * (t - 0.7) / 0.3, v: 40 + 300 * (t - 0.7), blade: 90 - 80 * (t - 0.7) / 0.3 })));

// BUSH, left: five round strokes fanned from the root, each a leaf shape of its own length and press, the darker ones
// laid low and into the first while they are still wet, so they join softly
const bush = [[-0.13, -0.05, 0.6], [-0.05, -0.12, 0.8], [0.06, -0.11, 0.75], [0.14, -0.03, 0.6], [0, 0, 1]];
const x0 = L - S * 0.02, y0 = rows[1] + S * 0.1;   // the root
bush.forEach(([dx, dy, k], j) => {
  kit.dip(round, { water: 0.85, conc: kit.mix(j < 4 ? { sapgreen: 2, hansa: 0.8 } : { sapgreen: 3, ultramarine: 1.6 }) });
  kit.stroke(round, sheet, path(20, t => ({ x: x0 + S * dx * 1.6 * t + S * 0.03 * Math.sin(Math.PI * t), y: y0 + S * (dy * 1.6 - 0.05) * t, p: 0.08 + 0.9 * k * swell(t, 0.55) })));
});

// BOW, left: a boat's bow from two strokes. The hull's side: a flat drawn along the sheer line, pressed square at the
// stern end and twisted onto its edge as it rises to the stem's point. Under it, the shadow below the flare: a round
// pressed hard at the stem and pulled back, thinning as the hand speeds up.
kit.dip(flat, { water: 0.8, conc: kit.mix({ ultramarine: 1.6, rose: 0.5 }) });
const sheer = t => rows[2] - S * 0.12 * t ** 2.2;   // the sheer line rises to the stem
kit.stroke(flat, sheet, path(22, t => ({ x: L - S * 0.22 + S * 0.42 * t, y: sheer(t), p: 0.95 - 0.25 * t, blade: 90 - 80 * t ** 2 })));
kit.dip(round, { water: 0.8, conc: kit.mix({ ultramarine: 3, umber: 2.5 }) });
kit.stroke(round, sheet, path(18, t => ({ x: L + S * 0.17 - S * 0.36 * t, y: sheer(1 - t * 0.85 - 0.08) + S * 0.06, p: 0.9 * (1 - t) + 0.05, v: 40 + 250 * t })));

// RIGHT: the same three silhouettes (each traced round its left-hand form and moved across), outlined with a small
// brush, then filled with even overlapping rows of one middle mix, as a colouring book is
const fine = kit.createBrush({ radius: S * 0.006, bristles: 10, capacity: 600 });
const fill = kit.createBrush({ radius: S * 0.02, bristles: 24, capacity: 600 });
const across = R - L;
const rockOutline = [...path(12, t => ({ x: L - S * 0.16 + S * 0.32 * t, y: rows[0] - S * 0.07 - S * 0.09 * Math.sin(Math.PI * t) })), { x: L + S * 0.17, y: rows[0] + S * 0.11 }, { x: L - S * 0.16, y: rows[0] + S * 0.11 }];
const tips = bush.slice(0, 4).map(([dx, dy]) => ({ x: x0 + S * dx * 1.6, y: y0 + S * (dy * 1.6 - 0.05) }));
const notch = (a, b) => ({ x: x0 + 0.55 * ((a.x + b.x) / 2 - x0), y: y0 + 0.55 * ((a.y + b.y) / 2 - y0) });   // between two leaves, part way back to the root
const bushOutline = [{ x: x0, y: y0 }, tips[0], notch(tips[0], tips[1]), tips[1], notch(tips[1], tips[2]), tips[2], notch(tips[2], tips[3]), tips[3]];
const bowOutline = [{ x: L - S * 0.22, y: rows[2] - S * 0.05 }, { x: L, y: rows[2] - S * 0.08 }, { x: L + S * 0.21, y: rows[2] - S * 0.17 }, { x: L + S * 0.14, y: rows[2] + S * 0.02 }, { x: L - S * 0.22, y: rows[2] + S * 0.06 }];
const silhouettes = [[rockOutline, { ultramarine: 1, sienna: 1.2, ochre: 0.6 }], [bushOutline, { sapgreen: 2.2, hansa: 0.5, ultramarine: 0.3 }], [bowOutline, { ultramarine: 1.8, rose: 0.4, umber: 0.6 }]];
for (const [poly, mix] of silhouettes) {
  const P = poly.map(q => ({ x: q.x + across, y: q.y }));
  // the outline: round the polygon and back to its start, densified so the brush follows each side
  const outline = P.flatMap((a, i) => { const b = P[(i + 1) % P.length]; return path(6, t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: 0.8 })).slice(0, 5); });
  outline.push({ ...outline[0] });
  kit.dip(fine, { water: 0.75, conc: kit.mix(mix) }); kit.stroke(fine, sheet, outline);
  const ys = P.map(q => q.y), top = Math.min(...ys), bottom = Math.max(...ys);
  for (let y = top + fill.radius * 0.6, k = 0; y <= bottom - fill.radius * 0.6; y += fill.radius * 1.1, k++) {
    // the row's ends: where the polygon's sides cross this height
    const xs = P.flatMap((a, i) => { const b = P[(i + 1) % P.length]; return (a.y - y) * (b.y - y) <= 0 && a.y !== b.y ? [a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)] : []; }).sort((a, b) => a - b);
    if (xs.length < 2 || xs.at(-1) - xs[0] < fill.radius * 1.5) continue;
    const pts = [{ x: xs[0] + fill.radius * 0.6, y, p: 0.8 }, { x: xs.at(-1) - fill.radius * 0.6, y, p: 0.8 }];
    kit.dip(fill, { water: 0.85, conc: kit.mix(mix) }); kit.stroke(fill, sheet, k % 2 ? pts.reverse() : pts);
  }
}
kit.dryAll(sheet);
await kit.finish('shaped strokes against outline and flat fill');
