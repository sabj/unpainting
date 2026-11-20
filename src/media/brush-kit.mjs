// The painter's brush settings per technique, and the wash and detail brushes built from them. lay.mjs paints with
// these; Paint Lab's stroke bench (demos/lab/strokes/) gets a generated copy, so a change here shows on the bench.
// Sizes are in sheet cells. DOM free.

/** Technique settings, chooseTechnique's numbers (src/crop/technique.mjs), keyed by name. */
export const TECHNIQUES = Object.freeze({
  'wet on dry': { name: 'wet on dry', water: 0.62, wetMix: 0.55, bridge: 0.78, bridgeSoft: 2.2, intoWet: false, dryAfter: true, passes: 1 },
  // a first wash: the same brush carried fuller, reaching the bottom of the tooth; a lower bridge leaves paper showing
  // as white holes. Bridge 0.9 with a transition of 3 matches paint-plate's first stain.
  'first wash': { name: 'first wash', water: 0.76, wetMix: 0.7, bridge: 0.9, bridgeSoft: 3, intoWet: false, dryAfter: true, passes: 1 },
  'wet on wet': { name: 'wet on wet', water: 0.88, wetMix: 0.85, bridge: 0.98, bridgeSoft: 3, intoWet: true, dryAfter: false, passes: 1 },
  glazed: { name: 'glazed', water: 0.58, wetMix: 0.3, bridge: 0.82, bridgeSoft: 2.4, intoWet: false, dryAfter: true, passes: 1 },
  'dry brush': { name: 'dry brush', water: 0.22, wetMix: 0, bridge: 0.38, bridgeSoft: 1.0, intoWet: false, dryAfter: false, passes: 1 },
});

/** createBrush options for the brush of radius r a technique is laid with: a flat mop, or under 2.5 cells a round,
 *  since a mop that small is a point. `round: true` keeps the wash settings on a round tuft. */
export function washBrushOptions(r, T, seed, { grainShift = 0, round = false } = {}) {
  if (r < 2.5) return { grainShift, radius: r, bristles: Math.max(8, Math.ceil(r * 3)), capacity: 26, belly: 2, feed: 0.08, give: 0.7, free: 0.4, film: 0.22, splay: 0.06, stiffness: 5, wetMix: T.intoWet ? 0.6 : 0.15, bridge: Math.min(T.bridge, 0.55), bridgeSoft: 1.2, streak: 0.5, seed };
  return { grainShift, flat: !round, ...(round ? { model: 'tuft' } : {}), radius: r, bristles: Math.max(12, Math.ceil(r * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: T.wetMix, bridge: T.bridge, bridgeSoft: T.bridgeSoft, seed };
}

/** A planned pen point's contact from its share of the line's strength s (0..1): pressed harder and drawn slower where
 *  the line is stronger, as drawGestures (draw.mjs) lays a prepared drawing. */
export const penContact = s => ({ p: 0.25 + 0.6 * s, v: 1.9 - 1.1 * s });
