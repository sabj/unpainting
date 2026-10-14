// Settings fitted to Trumbull reference images, including examples/targets/trumbull.jpg
// with examples/plans/trumbull-values.json. Limitations: docs/techniques.md.

// The rules below run only through presets (presets.mjs): --recesses 1 (architecture) turns on RECESS, and
// --trumbullrules 1 the shadow glaze, first-ink and stone mix rules.

// A dark recess (window, door, deep opening): brightest channel under `dark`, or blue over red by more than
// `blueOverRed` with the brightest channel under `blue`. Levels 0..255. --recessmax scales `dark` and `blue`.
export const RECESS = Object.freeze({ dark: 105, blue: 150, blueOverRed: 15 });

// Shadow glaze on the subject: ultramarine's share of the shadow mass; the rest is the warm earth. --violetshadow adds
// up to `violetLift`, ramping in as blue minus red rises from -violetOffset over violetSpan levels. --roseviolet splits
// ultramarine and quinacridone rose instead.
export const SHADOW_GLAZE = Object.freeze({ blueShare: .55, violetLift: .3, violetOffset: 10, violetSpan: 25, roseBlue: .55, roseRose: .45 });

// Stone block hints (--stoneblocks): a cell is wall when red and green exceed blue by these margins and its
// luminance is inside minL..maxL. These tests run on every subject when --stoneblocks is on.
export const STONE_WALL = Object.freeze({ redOverBlue: 25, greenOverBlue: 10, minL: 110, maxL: 235 });
// Block colours and the chance each is picked.
export const STONE_BLOCK_PIGMENTS = Object.freeze(['yellow ochre', 'raw sienna', 'burnt sienna']);
export const STONE_BLOCK_SHARES = Object.freeze([.55, .45, 0]);

// Ground glaze (--groundglaze): below `from` (a share of the sheet height), cool-neutral mid-light cells count as
// ground in shadow. --groundfrom overrides `from`.
export const GROUND = Object.freeze({ from: .62, blueUnderRed: 4, maxChroma: 40, minL: 120, maxL: 240 });

// The first ink on the subject leaves out pen paths whose object label matches this.
export const FIRST_INK_SKIP = /window|mullion|ground|shadow/;
