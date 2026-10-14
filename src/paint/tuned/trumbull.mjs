// Settings fitted to Trumbull reference images, including examples/targets/trumbull.jpg
// with examples/plans/trumbull-values.json. Limitations: docs/techniques.md.

// The rules below run only through the architecture preset (presets.mjs): --recesses 1 turns on RECESS.

// A dark recess (window, door, deep opening): brightest channel under `dark`, or blue over red by more than
// `blueOverRed` with the brightest channel under `blue`. Levels 0..255. --recessmax scales `dark` and `blue`.
export const RECESS = Object.freeze({ dark: 105, blue: 150, blueOverRed: 15 });

// Stone block hints (--stoneblocks): a cell is wall when red and green exceed blue by these margins and its
// luminance is inside minL..maxL. These tests run on every subject when --stoneblocks is on.
export const STONE_WALL = Object.freeze({ redOverBlue: 25, greenOverBlue: 10, minL: 110, maxL: 235 });
// Block colours and the chance each is picked.
export const STONE_BLOCK_PIGMENTS = Object.freeze(['yellow ochre', 'raw sienna', 'burnt sienna']);
export const STONE_BLOCK_SHARES = Object.freeze([.55, .45, 0]);

// Ground glaze (--groundglaze): below `from` (a share of the sheet height), cool-neutral mid-light cells count as
// ground in shadow. --groundfrom overrides `from`.
export const GROUND = Object.freeze({ from: .62, blueUnderRed: 4, maxChroma: 40, minL: 120, maxL: 240 });

