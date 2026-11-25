// When a wet-on-wet passage's clean water goes down. The scrap swatch that charges the passage (scrap-swatch.mjs) wets
// each lane just before the loaded brush follows it, so the brush meets a freshly wet bed. A passage wetted along its
// own lanes is wetted the same way, each lane just ahead of the brush. Wetting every lane first lets the early lanes
// soak in while the later ones are wetted, so the brush meets a drier bed than on its swatch and lays more than it was
// charged for: a drier bed draws more paint out of the brush.
// A passage wetted over a shape other than its lanes (a graded wash's reach past its edge, an inset) is wetted whole
// first, and a passage that prepares its own bed stroke by stroke (a value plan's passage material) keeps that.

/**
 * @param {{ intoWet: boolean, wetsOwnLanes: boolean, preparesOwnBed: boolean }} passage intoWet: laid into clean
 *   water; wetsOwnLanes: the water goes down along the passage's own lanes; preparesOwnBed: each stroke prepares its
 *   own bed before it is laid.
 * @returns {boolean} true: wet each lane just before it is charged; false: wet the whole passage first.
 */
export function wetsLaneByLane({ intoWet, wetsOwnLanes, preparesOwnBed }) {
  for (const [k, v] of Object.entries({ intoWet, wetsOwnLanes, preparesOwnBed })) if (typeof v !== 'boolean') throw new TypeError(`prewet order: ${k} must be true or false, got ${v}`);
  return intoWet && wetsOwnLanes && !preparesOwnBed;
}
