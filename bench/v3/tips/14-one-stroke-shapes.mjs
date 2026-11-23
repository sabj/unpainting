// One stroke makes a whole form when the brush changes as it travels: the pressure swells and lifts, a flat's blade
// turns, the hand slows and speeds up, the load runs out. Six single strokes, each a different form. No outline, no fill.
// The positions are shares of the sheet; the capacities are for this full-size sheet.
import * as kit from './kit.mjs';
const { sheet, W, H } = await kit.open('tips');
const S = Math.min(W, H);
// a stroke of n points from t = 0 to 1: at(t) gives { x, y, p, and v (hand speed, mm/s) or blade (degrees) as wanted }
const path = (n, at) => Array.from({ length: n }, (_, i) => at(i / (n - 1)));
const swell = (t, top = 0.45) => (t < top ? Math.sin(Math.PI / 2 * t / top) : Math.cos(Math.PI / 2 * (t - top) / (1 - top)));
const round = kit.createBrush({ radius: S * 0.045, bristles: 40, capacity: 900 });
const flat = kit.createBrush({ radius: S * 0.05, bristles: 44, capacity: 900, flat: true });

// 1. a leaf: lands on the point, presses to the belly through the middle, lifts back to the point, along a curve
kit.dip(round, { water: 0.85, conc: kit.mix({ sapgreen: 2.4, hansa: 0.6 }) });
kit.stroke(round, sheet, path(24, t => ({ x: W * (0.05 + 0.24 * t), y: H * (0.3 - 0.12 * t) - S * 0.06 * Math.sin(Math.PI * t), p: 0.04 + 0.96 * swell(t) })));

// 2. a wedge of shadow: a flat pressed square across (blade 90), twisted onto its edge (blade 0) as it goes:
//    broad where it lands, a thin line where it leaves
kit.dip(flat, { water: 0.85, conc: kit.mix({ ultramarine: 2.4, sienna: 1.6 }) });
kit.stroke(flat, sheet, path(24, t => ({ x: W * (0.38 + 0.24 * t), y: H * 0.2 + S * 0.02 * t, p: 0.95, blade: 90 * (1 - t) })));

// 3. a ribbon: a flat held at one angle on the sheet (upright) along an S: broad where the path crosses the blade,
//    thin where it runs along it, like a fold of cloth or a curling petal
kit.dip(flat, { water: 0.85, conc: kit.mix({ rose: 2.2, ultramarine: 0.3 }) });
kit.stroke(flat, sheet, path(30, t => ({ x: W * (0.7 + 0.26 * t), y: H * 0.22 + S * 0.09 * Math.sin(2 * Math.PI * t), p: 0.9 })), { upright: true });

// 4. a wet belly and a dry tail: a brush given little load (capacity 70), pressed evenly; slow where it lands, so the
//    paint pools, then faster as it goes. Its load runs out partway: from there it catches only the grain of the paper
const thirsty = kit.createBrush({ radius: S * 0.045, bristles: 40, capacity: 70 });
kit.dip(thirsty, { water: 0.85, conc: kit.mix({ sienna: 2.6, umber: 1 }) });
kit.stroke(thirsty, sheet, path(30, t => ({ x: W * (0.05 + 0.28 * t), y: H * 0.68, p: 0.9, v: 20 + 400 * t * t })));

// 5. lands on the point and flicks off: a fast press, held, then lifted while the hand speeds away
kit.dip(round, { water: 0.85, conc: kit.mix({ ultramarine: 2.2, rose: 0.6 }) });
kit.stroke(round, sheet, path(30, t => ({ x: W * (0.38 + 0.24 * t), y: H * (0.75 - 0.15 * t * t), p: t < 0.12 ? 0.05 + 0.9 * t / 0.12 : 0.95 * (1 - (t - 0.12) / 0.88) ** 1.6 + 0.02, v: 40 + 300 * t * t })));

// 6. a hook: drawn down, slowed and pressed at the bottom, then carried on round the turn and flicked up to a point
//    (the path keeps its direction into the turn: no corner)
kit.dip(round, { water: 0.85, conc: kit.mix({ ochre: 1.8, sienna: 1.2 }) });
const hook = t => { if (t < 0.55) return { x: W * 0.76, y: H * (0.5 + 0.28 * t / 0.55), p: 0.35 + 0.5 * t / 0.55, v: 50 };
  const u = (t - 0.55) / 0.45, a = 0.8 * Math.PI * u, r = S * 0.08;   // a = 0 heads straight down; 0.8 pi heads up and right
  return { x: W * 0.76 + r * (1 - Math.cos(a)), y: H * 0.78 + r * Math.sin(a), p: 0.9 * (1 - u) ** 1.3 + 0.02, v: 20 + 300 * u * u }; };
kit.stroke(round, sheet, path(32, hook));

kit.dryAll(sheet);
await kit.finish('one stroke, shaped as it travels');
