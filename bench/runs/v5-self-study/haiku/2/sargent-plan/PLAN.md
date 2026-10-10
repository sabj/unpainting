# Painting plan: White Ships (Sargent), Round V5, Try 2

## Reference cues and composition

Sargent's maritime watercolor: a delicate composition with white sail canvas against a warm pale background. The subject has strong horizontal layering—pale luminous sky, boats with masts and white sails, deep reflective water below. Light comes from above-left, creating subtle warm tones in the background and bright white paper on the sails, with deep blue-green reflections in the water.

Requested style: **pure watercolor, no ink** — transparent layering with soft edges, paper brightness carrying light throughout.

## Value structure (light to dark)

1. **Lights**: white sail canvas (paper), pale cream background, pale water patches
2. **Mid-tones**: warm tan background, boat hulls, water mid-values
3. **Darks**: deep blue-green water shadows, mast darks, hull shadows

## Key change from try 1

Try 1 failed because:
- No explicit reserves in config—only mentioned in plan text
- Whole sheet faded uniformly, no light-to-dark progression per region
- Opening drawing had fine rigging detail traced from target—appeared dark at 10%, breaking progression
- Only 2 mid-layer passes (`_lay2`)—not enough to show proper sequence
- Progression judge saw opacity fade-in, not a painting process

**Try 2 approach**: 
- Keep painter's natural segmentation (no rigid families) to avoid seam problems
- Add explicit reserves to protect white sails and key lights throughout
- Use very minimal graphite opening drawing (just horizon and mast positions, no detail rigging)
- Use 4 mid-layer passes (`_lay4`) to show proper light-to-dark building
- This forces light-to-dark progression per region without creating unsupported seams

## Reserves (protected lights)

**None.** Rectangular reserves create unsupported axis-aligned seams at this subject scale. Instead, rely on:
- Painter's own light preservation (cells near paper value)
- Minimal opening graphite guiding the composition
- More mid-layer passes (lay4) allowing better light-to-dark progression naturally

## Opening drawing

Minimal graphite pencil lines only:
- Horizon line (water/boat boundary)
- Two mast positions (vertical guides)
- No rigging detail, no boat structure shading—just basic framework

Weight: 0.3 (very light), width: 1.0—guides painter to major forms without creating dark anchors that break progression.

Goal: these lines help painter locate composition structure, but all value and form building happens in the wash layers.

## Recipe tokens

- **Base**: Champion V096 with base recipe
- **Tokens**: `region_w13_lay4_noslane`
  - `region_w13`: standard brush choice per passage
  - `_lay4`: four mid-layer passes (instead of lay2) to show proper progression light-to-dark across more passes
  - `_noslane`: no sky lanes; background stays one soft graded wash

## Painting sequence (expected progression)

Painter's own segmentation + reserves will guide:

1. **Pale background wash** (first light pass): soft gradation from warm cream to pale, covering top half; dries fully
2. **Initial water tone** (light water pass): pale blue-green, respecting water reflection reserve light patch
3. **Mid-tone builds** (passes 2-3): painter adds mid values to sky, water, boat forms—values build toward darker tones
4. **Shadow glazes** (passes 3-4): deep water darks, hull shadows, atmospheric depth added as transparent glazes over dry base
5. **Final accents**: deepest darks and any final refinement

With 4 passes instead of 2, each region has more time to build its own light-to-dark progression, avoiding the uniform fade-in effect of try 1.

## Reserves anchor the progression

The three reserves protect white paper in:
- Sail canvas (brightest element)
- Water reflection (bright secondary light)
- Sky highlight (atmospheric light)

These stay untouched throughout all passes, creating reference points that make the surrounding values appear to deepen properly. Without them, everything fades uniformly.

## Failure signs and fixes

1. **Uniform fade-in again**: if 10% and 25% stages look like opacity fade (whole sheet one gray), reserves aren't enforced. Fix: check reserve bounds against actual target white areas.

2. **Lost white sails**: if sail reserve gets tinted, reserve bounds are too small or positioned wrong. Fix: enlarge reserve bounds to fully cover white canvas in target.

3. **Rigging or detail too early**: if opening drawing creates dark crisp lines at 10%, they're too heavy. Fix: graphite weight should be 0.3 or lighter, no detail lines.

4. **Muddy progression**: if values jump or arrive unevenly, the 4 passes aren't distributed properly. This is painter calibration—can't fix in plan.

5. **Over-blurred edges**: if all forms disappear into soft edges, painter is wet-merging too much. Pure watercolor needs dry paper for detail. Fix: next try, add small regions to constrain which areas go wet.

## Checkpoint intents

1. **After opening drawing** (before wash): three light graphite lines barely visible
2. **At 10% strokes**: first pale wash starting, reserves creating dark-edged white patches, structure taking shape over gray
3. **At 25% strokes**: pale background and water established, white sail reserve prominent, mid-tones beginning
4. **At 50% strokes**: mid-tone values visible in sky and water, sail canvas still white, boat structure forming
5. **At 75% strokes**: shadow glazes adding depth, water dark where reflected, white reserves toned only at edges
6. **At 100% final**: complete luminous painting with clear light-to-dark progression, white paper visible in reserves, soft edges where appropriate

The key difference from try 1: reserves should be visible as bright islands throughout all five stages, creating visual anchors that make surrounding values appear to properly deepen.

## What changed from try 1

1. **Simpler opening drawing**: try 1 used fine traced rigging lines that appeared dark and crisp at 10%, breaking progression. Try 2 uses just three minimal graphite lines (weight 0.3, width 1.0): horizon + two mast guides. No detail.

2. **Four mid-layer passes** (`_lay4`): instead of lay2, giving painter more opportunities to build light-to-dark per region without uniform fade-in.

3. **No complex reserves**: try 1 planned reserves but didn't include them in config; rectangular reserves create unsupported seams anyway at this scale. Instead, rely on painter's own light preservation (cells near paper value).

4. **Same noslane token**: background stays one soft graded wash without sky lanes (atmospheric quality).

Key change: progression now driven by simpler opening (just structure, no detail), more passes for natural light-to-dark building, and painter's own segmentation (no rigid families or reserves creating seams).

This should avoid both the "detail too early" problem (from traced rigging) and the "uniform fade" problem (from no progression structure) that plagued try 1.
