# Painting plan: White Ships (Sargent), Round V5, Try 3

## Analysis of try 2 failure and try 3 approach

Try 2 scored 4.87 composite but progression judge gave 1.75/5 for early stages. The core failure: uniform global fade-in (whole sheet one pale gray at 10%, 25%, 50%) instead of local light-to-dark building per region.

**Root cause**: Try 2 relied on "painter's own light preservation" without explicit structure guidance. Opening drawing was too minimal (three bare lines).

**Try 3 approach**: Since explicit reserves create unsupported axis-aligned seams that painter refuses, instead:
1. **Strengthen opening drawing** with confident sail outline, dual masts, hull suggestion, horizon line (weight 0.5-0.6)
2. **Rely on painter's own light preservation** triggered by strong structural guidance
3. **Use 4 mid-layer passes** (`_lay4`) for proper light-to-dark progression
4. Opening drawing lines will anchor where painter applies local techniques differently per region

## Reference cues and composition

Sargent's maritime watercolor: delicate boats with white sail canvas against warm pale background. Strong horizontal division—pale luminous sky, white sails with dark masts, deep blue-green reflective water below. Light from above-left creates soft edges and luminous quality.

Requested style: **pure watercolor, no ink** — transparent layering, soft edges, paper brightness throughout.

## Value structure (light to dark)

- **Lights**: white sail canvas (paper), pale cream sky, water reflection light patches
- **Mid-tones**: warm tan background, boat hulls in tan and brown, water mid-values in pale blue-green
- **Darks**: deep blue-green water shadows, hull shadow sides, mast darks

## Opening drawing (graphite structure)

Strong, confident lines that define key structures (weight 0.5-0.6):
- **Horizon line** (10-290, 122-132): separates sky and water; painter will apply different treatments above vs below
- **Left mast** (85, 185 to 85, 40): vertical anchor; marks left sail boundary
- **Right mast** (175, 188 to 175, 45): vertical anchor; marks right sail boundary
- **Left sail edge** (85, 185 to 130, 50): diagonal defining left sail boundary
- **Right sail edge** (130, 50 to 175, 188): diagonal defining right sail boundary
- **Boat hull hint** (80-165, ~155): horizontal suggestion of boat structure below sails

These lines guide the painter on where structural elements live, without creating dark anchors that break progression. They will help the painter apply light washes in sky and water areas while respecting sail positions.

## Painting sequence (expected progression)

1. **Opening graphite** (before first wash): six structure lines barely visible, positioning sails, masts, boat, horizon

2. **Pale sky wash** (first light pass): soft cream wash top to bottom, respecting the horizon line structure, one continuous passage

3. **Initial water tone** (light water pass): pale blue-green base below horizon, respecting where masts are positioned

4. **Mid-tone builds** (passes 2-3 of lay4):
   - Sky deepens its cream tone, preserving paleness at top
   - Water tone deepens toward blue-green
   - Sail area shows warm hull tones building from pale base
   - Masts visible as structural guides darkening where they cross water

5. **Shadow glazes** (passes 3-4 of lay4):
   - Deep blue-green water shadows added
   - Hull shadow sides visible
   - Masts deepen to dark verticals
   - Sky gets final atmospheric subtle depth

6. **Final refinement** (touch-up passes): water ripple and reflection detail on dry paper, mast edge definition, preserve white paper in key sail areas

## Paper state and technique

- **Sky**: wet-in-wet on open paper, pale watery pigment, soft transitions
- **Water**: initial wash wet-on-dry, then dry-on-dry for ripples and reflections
- **Sails and boat**: respects opening lines as structure; warm tones build from pale base with mid values on dry paper

## Progression intents at each stage

1. **10% strokes**: Opening graphite visible. Pale cream wash starting in sky above horizon. Pale water tone beginning below. Impression: painter positioning composition, not opacity fade.

2. **25% strokes**: Sky fully pale and soft. Water showing pale base tone. Sail area showing initial warm wash. Masts and horizon visible as structure guides. Impression: building local forms with clear structural anchors.

3. **50% strokes**: Sky complete with soft quality. Water darkening toward blue. Boat hull forms visible in mid-tones. Sails respecting graphite boundaries. All regions at different states. Impression: clear regional building at different rates.

4. **75% strokes**: Sky and boat at near-final value. Water deep blue-green. Mast darks prominent. Sail area light. Impression: proper light-to-dark progression visible.

5. **100% final**: Luminous painting. Sky soft cream and warm. Sails white and protected. Masts dark and crisp. Water deep with reflection lights. Soft edges in sky, crisp at focal points and structure lines.

## Failure signs and fixes

1. **Uniform fade-in at 10%, 25%**: If whole sheet looks like one pale gray, opening drawing didn't guide regional differences. Fix: next try, add more opening structure or use smaller reserves that don't create seams.

2. **Lost sail white areas**: If sail region gets completely tinted instead of showing white paper patches, painter missed the structural guidance. Fix: stronger opening lines around sails.

3. **Muddy values**: If colors become brown or muddy, pigment mixing. Fix: painter's own pigment selection should work; if not, specify `--paints` in next revision.

4. **Over-blur**: If all edges blur into softness and structure disappears, painter went too wet. Fix: next try, use drier initial washes.

## What changed from try 2

1. **Removed explicit reserves**: They created unsupported axis-aligned seams that painter refused. Now relying on painter's own light preservation.

2. **Strengthened opening drawing**: From three minimal lines to six confident structure lines (weight 0.5-0.6) that outline sails, mark masts, suggest boat, define horizon.

3. **Simplified config**: No families, no reserves. Painter uses own segmentation, but opening drawing provides strong regional structure guidance.

4. **Same lay4 token**: four mid-layer passes, but now with confident opening structure to guide where different techniques apply.

The progression should now show clear regional building instead of uniform fade, because the opening drawing marks where the painter should treat sky differently from water, and where sails should remain light.

## Watercolor technique applied (from SKILL.md)

- Light to dark: opening structure → light washes → mid values → shadow glazes → accents
- Paper state choice: wet for sky, damp for transitions, dry for detail
- Light before dark solves the progression problem
- Opening structure replaces missing reserves as the anchor for regional progression
