// Paintings in progress for the visitor to carry on with. Each is scripted strokes through the same physics as the
// demonstrations (demos.js): the paint flows, blooms and dries on the sheet as it would under a hand, played fast and
// handed back with the paper as the example says, dry or still wet. Positions are in units of 1/320 of the sheet's shorter
// side from its centre; brush sizes are millimetres, so an example on any sheet is the same strokes with the same brushes.
const UNIT_MM = (6 * 25.4) / 320;
const dia = units => 2 * units * UNIT_MM;

// a small seeded generator, so an example lays the same strokes every time
const seeded = seed => { let s = seed * 7919 + 13; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

function painter({ W, H, begin, move, end, alive }) {
  const S = Math.min(W, H) / 320, cx = W / 2, cy = H / 2;
  const at = (x, y, p) => ({ x: cx + x * S, y: cy + y * S, p });
  // a stroke through `points` ([x, y] or [x, y, pressure]), resampled every two units
  const lay = async (tool, points) => {
    if (!alive()) return;
    const path = [];
    for (let j = 0; j < points.length; j++) {
      const [x, y, p = 0.8] = points[j];
      if (j === 0) { path.push(at(x, y, p)); continue; }
      const [x0, y0, p0 = 0.8] = points[j - 1], n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / 2));
      for (let q = 1; q <= n; q++) { const u = q / n; path.push(at(x0 + (x - x0) * u, y0 + (y - y0) * u, p0 + (p - p0) * u)); }
    }
    await begin(path[0], tool);
    for (let j = 1; j < path.length; j++) { if (!alive()) return; await move(path[j]); }
    await end();
  };
  return { lay };
}

const flat = (pigment, amount, water = 1.1, units = 28) => ({ tool: 'flat', sizeMm: dia(units), water, pigment, amount });
const tuft = (pigment, amount, water = 1.1, units = 10) => ({ tool: 'round', model: 'tuft', sizeMm: dia(units), water, pigment, amount });
const clean = (water = 1.5, units = 30) => ({ tool: 'water', sizeMm: dia(units), water });
// A line across the sheet at height y, gently waved so no edge is ruled. Sampled densely and smoothly: a flat brush turned
// sharply at a corner of a coarse polyline left a notch of bare paper on the outside of the turn.
const across = (y, { x0 = -192, x1 = 192, wave = 3, phase = 0, tilt = 0 } = {}) =>
  Array.from({ length: 49 }, (_, j) => { const u = j / 48; return [x0 + (x1 - x0) * u, y + tilt * (u - 0.5) + wave * Math.sin(phase + u * 6.1)]; });
// a ridge line: the top edge of a range of hills
const ridge = (y, height, phase) => Array.from({ length: 49 }, (_, j) => { const u = j / 48; return [-192 + 384 * u, y - height * (0.55 + 0.45 * Math.sin(phase + u * 4.3)) * (0.75 + 0.25 * Math.sin(phase * 3 + u * 7))]; });
// a short curved dab, as a round brush leaves when pressed and lifted
const dab = (rnd, x, y, size) => { const a = rnd() * Math.PI * 2, b = a + (rnd() - 0.5) * 1.6; return [[x, y, 0.9], [x + size * Math.cos(a), y + size * Math.sin(a), 0.75], [x + size * (Math.cos(a) + 0.7 * Math.cos(b)), y + size * (Math.sin(a) + 0.7 * Math.sin(b)), 0.35]]; };

/** Landscape: a graded sky left to dry, then distant hills and the fields below them, run softly into each other,
 *  and dried. Handed back dry. */
async function landscape(api) {
  const { lay } = painter(api);
  // the sky, graded from ultramarine at the top through cerulean to clean water at the horizon, each stroke into the last
  const sky = [[-142, flat('ultramarine', 0.13, 1.35)], [-124, flat('ultramarine', 0.09, 1.35)], [-106, flat('cerulean', 0.09, 1.35)], [-88, flat('cerulean', 0.05, 1.35)], [-70, clean(1.35, 28)]];
  for (const [y, tool] of sky) await lay(tool, across(y, { wave: 2, phase: y }));
  await api.settle(2); await api.dryAll();
  // distant hills, blue-violet and pale: the ridge drawn with the tip, filled below, alizarin dropped in at the right
  await lay(tuft('ultramarine', 0.16, 1.15, 8), ridge(-30, 42, 0.7));
  for (const y of [-44, -28, -12]) await lay(flat('ultramarine', 0.13, 1.25, 22), across(y, { wave: 4, phase: 2 + y }));
  await lay(tuft('alizarin', 0.16, 1.3, 16), [[20, -50], [90, -58], [185, -44]]);
  await lay(tuft('paynes', 0.12, 1.3, 14), [[-185, -22], [-110, -30], [-40, -20]]);
  // the fields: yellow ochre laid down to the foreground, sap green dropped into its lower half, burnt sienna at the front
  await lay(tuft('ochre', 0.24, 1.2, 9), ridge(12, 6, 2.4));
  for (const y of [22, 38, 52]) await lay(flat('ochre', 0.22, 1.3), across(y, { wave: 3, phase: y, tilt: -8 }));
  for (const y of [68, 90]) await lay(flat('sapgreen', 0.32, 1.3), across(y, { wave: 5, phase: y, tilt: -12 }));
  await lay(flat('sapgreen', 0.45, 1.25), across(114, { wave: 6, phase: 3, tilt: -6 }));
  await lay(tuft('sienna', 0.35, 1.2, 11), across(134, { wave: 4, phase: 1 }));
  await api.settle(2); await api.dryAll(true);
}

/** A tree: the ground and trunk, the pale foliage dry, then the shadowed side in a mid green left wet for the darks. */
async function tree(api) {
  const { lay } = painter(api), rnd = seeded(3);
  for (const y of [112, 130]) await lay(flat('ochre', 0.16, 1.25), across(y, { x0: -175, x1: 175, wave: 3, phase: y }));
  await lay(tuft('sapgreen', 0.22, 1.3, 12), across(104, { x0: -170, x1: 170, wave: 4, phase: 1 }));
  await lay(tuft('sienna', 0.6, 0.9, 7), [[2, 118, 1], [-3, 70, 0.9], [2, 30, 0.75], [-2, -10, 0.55]]);
  await lay(tuft('sienna', 0.5, 0.9, 4), [[-1, 22, 0.7], [-24, 0, 0.5], [-48, -22, 0.3]]);
  await lay(tuft('sienna', 0.5, 0.9, 4), [[1, 6, 0.7], [26, -14, 0.5], [44, -36, 0.3]]);
  await api.settle(0.5); await api.dryAll();
  // the light: lemon and sap green dabbed over the whole crown, overlapping so they run into each other
  for (let d = 0; d < 64; d++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()), x = 100 * r * Math.cos(a), y = -60 + 72 * r * Math.sin(a);
    await lay(d % 3 === 0 ? tuft('lemon', 0.22, 1.4, 17) : tuft('sapgreen', 0.16, 1.4, 17), dab(rnd, x, y, 14));
  }
  await api.settle(1.5); await api.dryAll();
  // the mid values on the shadow side, below and to the right, with indigo in the deepest part: left wet
  for (let d = 0; d < 34; d++) {
    const a = 0.05 + rnd() * 2.1, r = 0.3 + 0.7 * Math.sqrt(rnd()), x = 92 * r * Math.cos(a), y = -54 + 64 * r * Math.sin(a);
    await lay(d % 4 === 3 ? tuft('indigo', 0.22, 1.4, 12) : tuft('sapgreen', 0.4, 1.4, 14), dab(rnd, x, y, 12));
  }
  await api.settle(0.8);
}

/** An evening sky laid wet in wet: the land dry first, then clean water over the sky and colour dropped into it. Handed back wet. */
async function sky(api) {
  const { lay } = painter(api), rnd = seeded(5);
  await lay(tuft('indigo', 0.4, 1.1, 8), ridge(98, 22, 4.1));
  for (const y of [106, 124]) await lay(flat('indigo', 0.32, 1.2, 22), across(y, { wave: 3, phase: y }));
  await lay(flat('sapgreen', 0.3, 1.2, 20), across(138, { wave: 3 }));
  await api.settle(0.5); await api.dryAll();
  for (let r = 0; r < 9; r++) await lay(clean(1.25), across(-142 + r * 24, { wave: 2, phase: r }));
  await lay(flat('ultramarine', 0.5, 1.2, 24), across(-138, { tilt: 16, wave: 6 }));
  await lay(flat('cerulean', 0.45, 1.2, 22), across(-110, { x0: -192, x1: 80, tilt: 14, wave: 8, phase: 2 }));
  await lay(flat('alizarin', 0.35, 1.25, 18), across(28, { x0: -110, x1: 192, tilt: -10, wave: 6, phase: 1 }));
  await lay(flat('ochre', 0.45, 1.25, 18), across(56, { tilt: -6, wave: 5, phase: 4 }));
  for (let c = 0; c < 3; c++) {
    const y = -64 + c * 30 + 10 * rnd(), x0 = -190 + 60 * rnd(), x1 = 40 + 140 * rnd();
    await lay(tuft('paynes', 0.32, 1.35, 14), Array.from({ length: 9 }, (_, j) => { const u = j / 8; return [x0 + (x1 - x0) * u, y + 7 * Math.sin(u * 5 + c), 0.95 - 0.55 * Math.abs(u - 0.4)]; }));
  }
  await api.settle(2.5);
}

// The target picture's plan (target.js), set by the worker from the page's 'play' message before it plays 'target'.
let targetPlan = { steps: [] };
export const setTargetPlan = plan => { targetPlan = plan && Array.isArray(plan.steps) ? plan : { steps: [] }; };

/** A target picture painted light to dark from its plan: each pass of rows dried before the next. Handed back dry. */
async function target(api) {
  const { lay } = painter(api);
  for (const step of targetPlan.steps) {
    if (!api.alive()) return;
    if (step.stroke) await lay(step.stroke.tool, step.stroke.points);
    else if (step.dry) { await api.settle(0.3); await api.dryAll(); }
    else if (step.settle) await api.settle(step.settle);
  }
  await api.dryAll(true);
}

/** The examples by name: what each is called, whether it is handed back wet, and its strokes. */
export const EXAMPLES = Object.freeze({
  target: { label: 'Target', wet: false, play: async api => { await target(api); return api.alive(); } },
  landscape: { label: 'Landscape', wet: false, play: async api => { await landscape(api); return api.alive(); } },
  tree: { label: 'Tree', wet: true, play: async api => { await tree(api); return api.alive(); } },
  sky: { label: 'Evening sky', wet: true, play: async api => { await sky(api); return api.alive(); } },
});
