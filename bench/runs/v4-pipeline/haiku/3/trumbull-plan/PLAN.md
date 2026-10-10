# Trumbull, V4, Try 3: Precise Architectural Watercolor Plan

## Value Intent

Trumbull is a complex multi-story stone building with regular fenestration. The composition is:
- **Lights**: pale sky, lit stone facade on the main elevation, architectural edges (window sills, mullions)
- **Focal point**: the central arched entrance and tower rising above the roofline
- **Shadows**: recessed windows, shadow side of the building, eaves

Progression: pale sky and lifted stone → mid-tone facades → shadow glazes across forms → window recesses → closing ink for architectural clarity

## Reserved Lights and Wet Barriers

**Reserves:**
- Sky highlights and cloud edge tops (if clouds appear; may be left to lift from the wet passage)
- The lit edge of the main facade (north-facing stone, warm tan)
- Architectural highlights: window sill edges, arches, door frame edges
- Small glints on metallic elements (signs, railings)

**Dry barriers:** Keep the facade and windows clear from sky spill-over with a dry margin. Sky painted as one continuous passage; facade painted after dry.

## By Region (light to dark)

### Sky (top ~25% of image)
- **Reference cue**: pale graded blue-grey, clear and open above the building
- **Technique**: wash on dry paper (may shift to wet-on-wet if the reference shows soft cloud merging)
- **Move**: Light wash, one or two connected passages
- **Load**: watery, pale concentration
- **Paper state**: dry or lightly dampened to control the soft grading
- **Progression stage**: Layer 1 (first wash)
- **Edge roles**: soft top edge fading to white paper; hard bottom edge above the roofline

### Main Building Facade (center)
- **Reference cue**: warm golden-tan stone with regular fenestration, lit front elevation
- **Technique**: wash and value planes (architecture is a wash question at this scale)
- **Move**: broad wash on dry paper, one connected passage for the whole facade
- **Load**: medium concentration, watery enough to flow but not diluted
- **Paper state**: dry, to control the shape and preserve the stone texture
- **Progression stage**: Layer 2 (mid-tone base)
- **Edge roles**: soft edge where it meets the sky; hard edge where it meets shadow forms
- **Detail within**: window openings left as the paper base initially; will be tinted and detailed later

### Roof and Eaves (top of building outline)
- **Reference cue**: darker stone or shadow line that anchors the top of the facade
- **Technique**: wash and mid-value plane
- **Move**: wash on dry paper, following the architectural line
- **Load**: medium, slightly less water than the facade
- **Paper state**: dry
- **Progression stage**: Layer 3 (after facade is dry)
- **Edge roles**: defines the top silhouette; one hard edge on the bottom

### Windows and Recesses
- **Reference cue**: deep shadow recesses, glass reflections, regular grid
- **Technique**: ink and wash (mullions are lines thinner than brush marks; glass is a dark glaze)
- **Move**: pale tint on the facade pass, then window recesses as a mid-glaze, then closing ink for mullions
- **Load**: for glazes, thin and dark; for ink lines, controlled pen pressure
- **Paper state**: painted areas must be dry before glazing or inking
- **Progression stage**: glass tint in Layer 2, recesses in Layer 4, closing ink in Layer 6
- **Edge roles**: mullions are lines; recesses have soft shadows inside, hard edges where they frame the opening
- **Resolution check**: windows are ~0.875 mm at 1200 px (about 3.7 cells). Mullions are thinner and require ink lines. Closing ink ensures clarity at viewing scale.

### Shadow Side of Building (if visible)
- **Reference cue**: warmer, darker tone where the sun doesn't reach
- **Technique**: glaze on the facade (crossing building but following the form)
- **Move**: dry-on-dry glaze, unifying shadow regions
- **Load**: medium concentration, warm brown
- **Paper state**: facade dry
- **Progression stage**: Layer 4 (shadow glaze, after all mid-tone bases)
- **Edge roles**: soft edge on the lit side; hard crease where it meets a lit plane

### Vegetation and Ground Details
- **Reference cue**: if present, trees/foliage on sides, street level details
- **Technique**: wash for foliage masses, ink for branch structure if needed
- **Move**: connected wash, or charged dark into wet if soft shadows needed
- **Load**: watery to medium, greens or muted earth tones
- **Paper state**: dry for detailed foliage, may be wet-on-wet for soft background trees
- **Progression stage**: Layer 2–4 depending on priority
- **Detail within**: few dry-brush or pen strokes on foreground elements only

## Recipe Tokens and Painter Settings

**Base recipe**: V096 champion, frozen
**Variant**: `region_w13_lay2_dk11`
- `_lay2`: fewer light-to-mid passes (2 instead of 4), allowing clearer value separation
- `_dk11`: darker key, pushing the window recesses and shadows to true darks

**Reason**: Precise architectural work benefits from cleaner, fewer passes with clear value steps. The regular fenestration of Trumbull calls for defined mid-tones that support closing ink clarity.

**Extra painter settings** (if needed):
- `--darkgain 1.0`: neutral; the V096 base is tuned on this subject
- Pigment palette: warm earth tones and cool greys support the stone and sky
- No special settings needed; the base is configured for Trumbull

## Opening Drawing

**Style**: sparse pen or graphite, confident gestures
**Content**:
- Roofline and main horizontal/vertical structure
- Major arches and entrance portal
- Window grid (light indication of columns/mullions, not every pane)
- Significant junctions (where walls meet eaves, door frames)
- Building corner lines and silhouette

**Execution**: Use `node tools/q-trace-ink.mjs` with `minContrast=.12 minLen=10 maxLum=.62` to extract high-contrast edges from the target. This will capture the architectural structure. Then review and thin the lines to ensure confidence and sparseness.

**Duration**: one confident pass; no corrections or scratchwork

## Closing Drawing

**Style**: selective, tonal ink on dry paint at focal points
**Content**:
- Mullions (vertical and horizontal window divisions) where they define the fenestration pattern
- Arches and their keystone detail at the main entrance
- Chimney stacks and corner angles that anchor form
- Door and window frames where they are focal

**Ink pigment**: neutral sepia or black (declare in execution log)
**Density**: follows value; heavier in deep recesses, light on lit edges
**No fill**: ink scribble only, never a solid fill
**Focal priority**: heaviest ink at the building entrance and tower; light elsewhere

## Wet Passages and Dry Sections

- **Sky**: one continuous passage (wet on dry or wet-on-wet, decided at the paper state check)
- **Facade**: one connected passage on dry paper, preserving the overall shape
- **Roof/eaves**: separate from facade, on dry paper (prevents bleeding into facade shadow)
- **Shadow glaze**: crosses boundaries as needed to unify shadow masses
- **Windows**: tinted in the facade passage; recesses glazed on dry paint; ink lines on dry paint

No detail regions (eyes, fine fur strands) in this subject. The detail is architectural: mullions, arches, junctions. These come from closing ink, not blurred paint.

## Progression Checkpoints

**After opening drawing:**
- Building silhouette in place, major junctions and windows indicated
- Clean lines, no scratchwork visible

**After sky wash:**
- Pale, graded tone with atmosphere; color should be cool and light
- Clear boundary above the roofline (no spill onto facade)
- Cloud shapes (if any) indicated; highlights reserved

**After facade wash:**
- Warm golden-tan tone across the main elevation
- Unified shape, no patchwork; window openings evident as the paper base
- Value step from sky is clear: facades are darker than sky

**After mid-tones (roof, eaves, first roof shadows):**
- Architectural structure is clear: roof defined, eaves separated from walls
- No harsh edges (except where junctions intentionally meet); mostly soft transitions between lit and half-lit planes
- Focal entrance begins to advance

**After shadow glaze:**
- Shadow side of the building is unified; shadow doesn't patch but flows across regions
- Value ladder is complete: lights → mid-tones → shadows
- Facade detail should be readable; no over-darkening

**After window recesses:**
- Windows read as deep openings, not as flat patterns
- Glass reflections and mullion shadows suggest form
- Focal entrance is the darkest point (strategic reserve of the lightest value in openings)

**After closing ink:**
- Mullions and arches are crisp and confident
- Closing ink anchors the architecture; minimal ink, maximal clarity
- No heavy outline; architectural lines are structure, not decoration

## What Would Show Failure

1. **Blurry facade**: if the main walls lose their crisp planes and edges, the architecture reads as mushy
2. **Patchy windows**: if recesses are unconnected or have separate islands, they read as noise, not form
3. **Over-worked sky**: if the sky is too many passes or over-merged, it flattens the composition
4. **Ink without paint structure**: if closing ink is heavy but the underlying paint is weak or blurry, it looks fake
5. **Lost lights**: if architectural highlights (sills, arches, door frame) disappear into mid-tones, the form collapses
6. **Disconnected shadow**: if shadows don't flow across regions but stay patchwork, the building looks assembled, not lit

## Changes from Prior Tries (if applicable)

This is V4, try 3 of 3. No prior tries are visible. The plan is designed from first principles:
- Light-to-dark progression throughout
- Reserves protect lights before any wash
- Wet passages are intentional and bounded
- Ink supports structure, not rescue
- Architectural detail lives in paint edges and closing ink, not in many passes

## Summary

The Trumbull building is precise architecture: clear structure, regular fenestration, warm stone lit by directional light. The plan reserves lights early, builds form with three value layers (sky, facade, shadows), and closes with ink that anchors the architectural grid. No special effects or over-working; clean technique with careful attention to dry-paper control and the drying sequence.

Stage 1: Reserve and open drawing
Stage 2: Sky and facade washes, one each
Stage 3: Roof and eaves mid-tones
Stage 4: Shadow glaze, unifying
Stage 5: Window recesses and glass detail
Stage 6: Closing ink at focal points
