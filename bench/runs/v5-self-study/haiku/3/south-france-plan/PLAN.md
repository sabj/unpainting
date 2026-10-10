# Painting plan: South France v3, urban sketch, V5 round 3

## Changes from Try 2

**Critical fix:** Try 2's progression looked like a digital fade-in (judges: "dissolve effect revealing the target," "faint ghost at 10%," 0 of 2 judges found the work human). The painting itself was compositionally sound (edge 9.1) but the order of work was wrong.

**Root cause:** With no reserves and a single light-to-dark ladder, the painter applied strokes globally at low opacity, creating a unified fade rather than building region by region with clear structure.

**Try 3 approach:**
1. **Protected lights:** Add small strategic reserves to force the painter to establish bright areas first, creating clear white-paper lights that build toward dark
2. **Better gradation:** Increase mid-layers from 2 to 4, preventing the "flat evenly-toned slabs" the judges reported
3. **Enforced region order:** List regions from lightest (sky) to darkest (buildings), signaling the order of work
4. **Clearer opening:** The pen drawing should read as confident gestures on the first pass, not speckle

## Reference cues

Tuscan hilltop village, afternoon light from the left. Pale blue sky with horizon glow. Cypress trees as vertical dark silhouettes. Cluster of terracotta buildings on the right with warm-lit façades and deep shadow sides. Rolling grass field in bright golden-green, with cast shadows where terrain turns and trees shadow the ground. Brightest: sun-facing wall, grass in full light. Darkest: cypress trunks and building recesses. No pure blacks.

## Value structure

**Lights (to protect):**
- Pale sky at horizon (warmest light area)
- Brightest grass patches in middle distance (left side)
- Sunlit foreground grass (lower left)

**Half-tones:**
- Mid grass with gradual darkening toward tree shadows
- Building façades in warm mid-tone
- Tree canopy as connected dark mass

**Darks:**
- Cypress trunks and shadow masses
- Building shadow sides (cool and deep)
- Cast shadow across field (unifying glaze)

**Focal point:** Building cluster on right with roofline silhouette and façade planes

## Regions and techniques (in painting order)

**1. sf.sky (top, 0–0.4):** Lightest region first. Pale continuous wash on dry paper, graded pale cream near horizon to pale blue at top. Reserve bright horizon light. No tiles, no overblending—keep a subtle visible gradation. Single connected passage, one big brush, watery load, few strokes.

**2. sf.grass (bottom, 0.45–1.0):** Light golden-green wash, one or two passes, dry paper. Pale wash across entire field first, with big brush, watery. Reserves protect brightest patches. Dry fully. Then shadow glaze where cast shadows fall and terrain turns. Foreground only: light dry-brush flicks follow grass direction.

**3. sf.trees (left/center, 0.15–0.7):** Dark masses come after lights establish the value range. One wet canopy per tree shape, big brush. Charge soft shadow into still-wet base where the reference shows blended edge. Otherwise dry and layer. Cypress trunks last, tapered from belly to point. Keep branches connected to trunk, not scattered.

**4. sf.buildings (right, 0.25–0.8):** Opening pen traces structure (rooflines, corners, junctions). Pale warm wash for lit walls on dry, one pass, medium load. Dry. Mid values: roofs and shadow-side walls, connected planes, one glaze per shadow face crossing boundaries. Dry. Recesses and window depth as last darks. Closing ink restores crisp roofline at focal points only.

## Drawing plan

**Opening:** Comprehensive pen lines from the target image. Rooflines, building edges, cypress silhouettes, main junctions of trees and buildings. Light to medium pressure, gestures not geometry. No fills or ruled hatches; should read like a painter's first confident marks.

**Closing:** Selective ink on dry paint at focal point (building roofline, corners that carry structure). Light hand, accents only. Cypress valley lines if needed, never dark fills.

## Load and moves

- **Sky wash:** Watery, big brush, 3–4 strokes, paper showing, damp with shine just gone
- **Grass wash:** Very watery, big brush, 2–3 strokes, big area, nearly monochrome at first
- **Trees:** Medium load, wet-on-wet for soft canopy, or dry layered for hard-edged shadow shapes
- **Buildings:** Medium load for walls, controlled edges, shadows as glazes
- **Pen:** Confident, light-to-medium pressure, natural gesture, width follows pressure

## Protected lights (reserves)

Three small reserves preserve paper white where they matter most:
- **Sky highlight:** Bright horizon zone (0.2–0.5 x 0.32–0.39), kept white for luminous sky edge
- **Grass mid-distance:** Brightest patches near building shadows (0.6–0.85 x 0.7–0.8), foil for dark cypress
- **Foreground:** Sunlit grass in lower left (0.1–0.4 x 0.85–0.95), bright anchor

These reserves are small enough to avoid "artificial mask holes" but large enough to force a clear light-to-dark progression as the painter works around them.

## Failure signs to watch

1. **Ghost at 10%:** If the whole image appears very faint all at once, the painter is applying global low-opacity strokes instead of building region by region. Indicators: sky and grass and trees all equally pale; no clear structure; looks like a fade-in filter.
   - **Fix if seen:** Revise to reduce the number of initial passes or increase opacity of early strokes.

2. **Speckle instead of pen lines:** If the opening drawing reads as dotted trails or noise rather than confident gestures, the pen weight might be too fine or the lines too short.
   - **Fix if seen:** Thicken opening lines in the drawing file or increase `_dwg` token.

3. **Flat green slabs:** If grass and tree areas read as uniform patches rather than connected washes with visible flow, the wash is too fragmented.
   - **Fix if seen:** Reduce mid-layers or increase water/pigment load to merge strokes better.

4. **Tiles or banding:** If sky shows distinct horizontal bands or separate tiles instead of one graded passage, the sky wash was applied in disconnected parts.
   - **Fix if seen:** Single connected sky passage, one drying, no rework.

5. **Muddy buildings:** If terracotta walls blend into shadows without clear planes, the shadow glaze isn't crossing boundaries properly.
   - **Fix if seen:** Increase glaze opacity or adjust region bounds to ensure shadows cross multiple regions.

## Tokens and why

- **`lay4`:** Four mid-layers instead of two. Prevents the flat, over-simplified appearance from try 2. Better value separation and visible build-up at each stage.
- **`ink2`:** Selective, light closing ink. Urban sketch is restrained; heavy ink fails.
- **`mg12`:** Midgain 1.2 (boost mid-value visibility). Makes the mid-pass progression more distinct, less likely to read as a global fade. Helps show that values are building progressively, not all at once.

## Stage intents (what each checkpoint should look like)

1. **Opening drawing (pen only):** Clear rooflines, building corners, cypress silhouettes readable. Pen marks visible as connected gestures, not speckle or tremor. No fills.

2. **Sky wash:** Upper sheet pale blue-grey, horizon area slightly warmer cream. Paper showing, fresh. Reserve white glows at horizon. No gradation banding.

3. **Grass wash:** Entire bottom half a pale golden-green, nearly monochrome, connected as one area. Tone building from light but not yet varied. Reserves hold white patches. Foreground not darker yet.

4. **First tree and building washes:** Tree canopy shapes appear; buildings read as warm mid-tone planes. Sky and grass still pale; darks introduced. The value ladder begins: lights → mid.

5. **Mid-layer 1 & 2:** Grass field shows turning planes with subtle shadow glaze beginning. Building shadow sides define form. Trees deepen but canopy is still partially open.

6. **Mid-layer 3 & 4:** Tree shadows connected; building recesses read. Value contrast clear: bright reserved lights, mid planes, dark shadows. Composition unified.

7. **Shadow glaze:** One connected dark glaze across grass where cast shadow and terrain turn. Same glaze touches tree shadow and building shade, unifying the composition.

8. **Closing ink:** Roofline crisp at focal point, building corners restored for structure. Light cypress accent lines in dark mass valleys. Selective, never a fill.

## How this fixes Try 2

- **Progression judge tell: "faint ghost at 10%"** → With reserves holding white lights and a 4-layer gradation, the early 10% stage should show clear pale wash in sky and grass with protected whites, not a uniform fade. This looks like a painter establishing lights first.
- **"Flat evenly-toned slabs"** → Four layers instead of two create visible value stepping and prevent the over-simplified appearance.
- **"Speckle instead of pen"** → The same opening drawing file will be more carefully timed; pen structure should appear clearly in the first few strokes.
- **"No judges found order human"** → Enforcing region order (light → dark), using reserves (which force working around lights), and increasing mid-layers (which show progressive build-up) should make the progression feel like a person painting: lights first, then mid-tones, then darks, then accents.

## Recipe base

V096 base with modifications:
- Tokens: `region_w13_lay4_ink2_mg12` (replace lay2 with lay4, add mg12)
- All other base recipe tokens remain: rec2x, rcl, sky3, leaf, cg13, vio, rg10, blk60, bmm40, bka20, birr, skyb, cpp, dk13, tv8, uncap, pgreen, dwg200, tp2, shs

## Fast proof checklist

Before running paint.sh:
- [ ] Opening lines file contains cypress silhouettes, rooflines, building corners (reviewed visually)
- [ ] Closing ink is selective and light (set in file)
- [ ] Three reserves are positioned over brightest areas without being obvious rectangular masks
- [ ] Regions list sky first (lightest), then grass, then trees, then buildings (darkest)
- [ ] config.json admits without errors: `bash bench/check.sh`
