# White Ships — V5, try 1

Target: Sargent crop, 300 × 244 source pixels. Fixed execution: 1200 × 976 native cells, 280 × 227.733 mm sheet; 0.2333 mm/cell. Pure watercolor, no ink or graphite. This plan follows watercolor-technique and painting-planner. No previous attempt or critique is available.

## Reference and values

Five-value thumbnail: cream paper lights; pale cool hull tint; middle blue-grey bow and green water; deep blue-green lower reflection; small near-black warm-grey fittings and upper-left recesses. The focal relationship is the curved central bow against the light right hull, with a small dark central fitting and warm ropes. The lower dark wedge anchors the composition and must remain connected.

Protect the brightest cream shapes of the right hull, coherent central light facets and water glints through the painter's target-derived near-paper light extraction. These are bare paper. Adjacent hull facets and rope lights are pale painted planes receiving band 1. There are no explicit rectangular reserves: the fitted light shapes supply irregular silhouettes. No opaque corrections. Eyes and portrait catchlights do not apply.

## Executable choices and changes from V096

Use precise-watercolor globally. All five families explicitly use wet on dry. The boxes label overlapping target-derived color/value shapes; they are not wash clipping rectangles. No region style override divides the hull. The rounded hull is a wash question; ropes and fittings are small painted shapes; water is connected wash with naturally broken reserved glints. Below-four-cell lines are suggested by adjacent edges or omitted, never enlarged or drawn in ink.

- `_lay2` replaces four middle layers with two to reduce repeated contour buildup over the light hulls.
- `_noslane` removes uniform sky lanes: the cool forms are curved hulls and reflections.
- `_cg10` changes the base's 1.3 cool gain to 1.0, preserving muted blue-grey whites and warm ropes.
- `_softs` chooses small clean damp brush contacts on selected soft boundaries, avoiding nearby hard edges. This should soften hull turns while preserving ropes and fittings; no optical blur.
- Palette: ochre and burnt sienna for ropes; cerulean and ultramarine for hulls and water; sap green for right water; sepia watercolor for neutral dark mixtures. Sepia is a watercolor here, not ink.
- Retain cold-press paper, fitted W13 physical brush paths, 1.3 shadow gain, and two final shadow stages. Both drawing files contain zero paths with medium none, including the fallback used by the base's closing-line setting.

## Region techniques

All quoted loads are planner water fractions, with pigment strength independently assigned by the value ladder and finite calibrated reloads. Brush sizes below are intentions relative to the reference, not claimed execution measurements.

| Region and cue | Resolution decision | Technique, paper, load, edges and order |
| --- | --- | --- |
| Central rounded hull: broad blue-grey bow, irregular pale facets | Wash. Facets 8–40 source px = 32–160 native cells (7.5–37 mm). Fitted broad belly radius roughly 16–80 cells; feature/radius near 2. Oval fitting 8–16 source px = 32–64 cells. | Band 1 watery pale wash on dry paper, water .62 and dilute pigment. Connect own wet overlaps. Dry; band 2 in two transparent middle layers, medium pigment, followed by remaining band 3 plane share. Soften selected turning edges; upper rim and fitting stay firm. Final glaze crosses lower bow into reflection. |
| Right white hull: cream face, oblique blue shadows | Wash. Planes 12–50 source px = 48–200 cells (11–47 mm); broad belly radius about half local width. | Reserve irregular cream lights before band 1; dilute tint outside reserves on dry paper, .62 water. Middle blue planes only where demanded. Dry fully before .45-water shadow glazes. Upper structure crisp, internal light transitions lost. |
| Left rigging and boatside: ochre verticals, loop, blue fragments | Small painted shapes. Significant ropes 2–5 source px = 8–20 cells (1.9–4.7 mm); radius about 4–10 cells, ratio near 2. One-source-pixel slivers are at the four-cell limit. | Pale foundation first, dry, then connected ochre/sienna band 2/3 marks on dry paper with medium pigment and belly-to-point taper. Keep rope holes open. Dark junctions late. No equal dots, hatch or extra string detail. |
| Right diagonal rope across hull and water | Small painted shape, 2–7 source px = 8–28 cells (1.9–6.5 mm); radius about 4–14 cells, ratio near 2. | Dry underlying light wash, then warm middle paint with a connected fitted diagonal gesture, medium load. Preserve lighter side and reference-supported interruptions. Sharp side against cool surroundings; no ink outline. |
| Lower reflection and right green water | Wash masses; reserved broken paper edges suggest sparkle. Ripples 2–6 source px = 8–24 cells (1.9–5.6 mm); broad reflection many tens of cells. | Pale connected band 1 underwash on dry paper; dry middle blue-green planes. Bands 4/5 transparent medium pigment with .45 water join central lower hull, left dark edge and reflection. Keep right water lighter and preserve cream horizontal glints. |

The source is small but each source pixel spans four native cells. Significant ropes therefore have paintable bodies at this fixed density. W13 fits brush radius to each shape. Inspect actual paths and native output at checkpoints; do not mistake an enlarged source for additional detail.

## Moisture, glazes and drawing

First washes begin on fully dry paper; same-passage strokes may overlap wet. This crop contains shaped hull planes, not a sky needing a whole-sheet wet-in-wet bath. Controlled softening stays on selected soft boundaries. Details remain dry. A half-dried neighbour requires drying, not a compensating wetter stroke.

The existing value-plan executor measures each candidate footprint and its three-cell neighbours before physical paint contact, dries and remeasures when a dry passage is not ready, permits only its own wet overlap, and logs paper state and brush loads. Keep these gates enabled; invent no moisture readings. Light/middle water is .62; shadow water .45. Broad light paint is watery and dilute; middle shapes and transparent shadows use controlled medium pigment.

Glaze 1 (band 4) crosses the central lower bow, left boatside and lower reflected wedge over a fully dry base. Glaze 2 (band 5) restates the shared deepest support and small fittings over the fully dry first glaze. The shadow support crosses color-family boundaries, retaining lit hulls and warm ropes. Right green water remains a middle value. Final touches reinforce existing fitted darks without painting reserves.

No departure from light-to-dark. No opening or closing drawing. No whole-sheet rewet, overlay, export recolor or physics bypass.

## Preflight and checkpoint intentions

Run `bash bench/check.sh` before physics to check option reads, family limits, target-derived geometry and unsupported straight seams. Inspect value progression, light shapes, selected moves and cross-region shadows in the compiled plan. The task permits only the whole-sheet painter through `bench/paint.sh`; its early stops serve as physical technique proof rather than a separate crop render.

1. Before wash: cream paper and no drawn contours.
2. Light band: pale coherent hull relationships, reserved whites, no early dark outlines. Judge against its unfinished intention.
3. Middle band: readable central curve and waterline, warm continuous ropes, distinctly light right hull. Inspect native pixels for ridges, scratches and smeared fittings.
4. Shadows: coherent lower dark reflection, retained middle bow, selective crisp fittings. Judge values, lights, edge roles, landmarks, mark character, then progression.
5. Finish without closing ink. Record observations and revisions below. Accept changes only against the technique skill's final checklist, without losing another region.

Failure signs: blue covering the hull lights, rectangular edges, parallel lanes, nested contours, fragmented lower dark mass, stippled ropes, dark halos around every light, or uniform blur. Revise only unpainted work at a stopped boundary when an observed failure can still be addressed; preserve scheduling where possible.

## Observations and revisions

Initial plan prepared before painting. Compile inspection: 74 pigment/region passes and 2519 fitted connected shapes; 23 connected paper-light reserves; no unsupported axis-aligned edges. All compiled moves are wet on dry. The two-layer option folds the middle share into band 2, leaving no separate band 3: references to band 2/3 above mean that combined middle stage. Shadow bands 4 and 5 contain 186 and 178 cross-region shapes respectively. The right rope shares the warm rigging color family, rather than getting an independent color-region label. No physical observations yet.

Standalone `bash bench/check.sh` completed with `ADMITTED` and `planningStep: passed`. `bench/paint.sh start` submitted the admitted plan; waiting for its cloud GPU allocation.

### Revision 1, after pass 20

Look 1 showed untouched paper, zero brush strokes and zero pen lines. Look 2 showed the completed light foundation: 2877 brush strokes, zero pen lines. Warm ropes, cool hull masses and the broad white right hull are located correctly; values are appropriately pale for this stage. However, large straight diagonal gaps cut through the central hull and lower reflection, unlike the reference's smaller irregular facets. This is a coverage failure of an oversized fitted gesture, not a reason to increase pigment or add ink. The fixed shaped-path implementation specifically identifies this diagonal-wedge failure when cool-plane coverage strokes are disabled.

For unpainted work, remove `_noslane` to restore the base's overlapping cool-plane coverage strokes (6 mm radius, .8-radius spacing). Add `_spl8` for other broad planes: 8 mm wide overlapping physical strokes, up to the default 30 mm length, following the fitted plane axis. Narrow shapes retain their existing fitted gesture. No wash reach beyond the target shape is added; protected lights remain protected. Use `--splwet 0` because this revision still calls for dry-paper middle planes, with only each passage's own wet overlap. Keep both middle layers, shadow gains, pigments, drawing files, reserves and family assignments unchanged. Already-painted washes remain as they are.

Technique rationale by affected region: the central hull and lower reflection need connected wash bodies without uncovered diagonal wedges; the white hull keeps its negative-painted lights; warm ropes retain their narrower fitted shapes. This supersedes the initial no-lane choice above. The tradeoff is a risk of visible parallel stroke joins, so inspect after pass 40, the first middle layer, before completing the second. Accept only if the hull gains connected tone, the light reserves survive, and strokes merge without a regular striped texture.

### Revision 2, after pass 40

Look 3: 6918 brush strokes, zero pen lines. Blue masses and warm rope bodies are stronger, and the reserved right hull survives. However, the neutral center still has diagonal undercoverage. Compile inspection explains the incomplete correction: the two largest neutral middle shapes have 291266 and 131220 cells but estimated support widths of only 7.19 and 4.72 mm; both were below `_spl8`'s 8 mm eligibility cutoff and therefore retained the oversized single fitted path. This revision has not yet earned whole-picture artistic acceptance.

Add `_lad`: adapt stroke width to each plane's support (up to 8 mm, with a 2 mm minimum) and admit sufficiently large planes down to that support width. This is a connected-wash coverage correction for the central hull and reflection; small marks still follow their fitted supports and all strokes remain physically clipped away from protected lights. Keep `--splwet 0`, existing moisture gates, pigment allocations, two middle layers and final glazes. Inspect after pass 60.

The visible horizontal middle-stage break at approximately 62% of sheet height matches the base's ground-glaze deferral, which moves lower neutral middle demand to band 4. Keep that already-committed allocation so the later connected glaze can deliver it; disabling it now would omit the portion deferred from the first middle layer. This is a known progression defect to flag for the next try, even if the final glaze removes the visible seam. All earlier pigment stays on the sheet.

### Pass 60 inspection

Revision 2 passed both standalone admission and the harness revision check. Look 4: 13990 brush strokes, zero pen lines. The warm ropes and cool hull silhouettes remain legible, reserved white hull planes remain open, and some upper neutral coverage is stronger. The image is still patchy and has conspicuous pale diagonal remnants and the horizontal deferred-ground break. Do not call this a final artistic success. The dark fittings and connected lower shadow have not yet received their planned glazes. Retain the 1.3 shadow gain and inspect at pass 67 after the first connected glaze, then proceed to the final shadow and touch-up if its values remain appropriate. No third revision at this checkpoint.

### Revision 3, after pass 67

Look 5: 16934 brush strokes, zero pen lines. The first shadow glaze establishes the central dark fitting, upper fittings and lower reflected wedge; the formerly empty lower neutral area has received paint. However, narrow overlapping strokes leave conspicuous regular stripes in the dark fittings and lower glaze. The earlier coverage correction has therefore not met the mark-character acceptance check. The 62%-height break is reduced but still legible, and several diagonal remnants remain.

For the final unpainted shadow band and touch-up, switch from W13 planned narrow lanes to `region_w15_lay2_cg10_softs`. W15 chooses a physical brush for each passage and uses fewer, broader contacts: a rigger/round for sufficiently narrow features, flat or mop for broader planes. Remove `_spl8`, `_lad` and the now-inapplicable `--splwet 0`. The change targets the dark fittings, upper structural darks and lower reflection: glaze on fully dry paper with the existing .45 water and medium transparent pigment, fitted support, preserved white hull, and no extra paint demand. Keep all colors, mid-layer count, 1.3 dark gain, family geometry and drawing files unchanged. The final shadow uses the same pass indices and should tone earlier stripes rather than restating the narrow lanes. Already-painted stripes cannot be erased by this revision; judge the remaining limitation honestly.

This is a material/gesture correction, not a claim that W15 has already improved the picture. Inspect before the empty closing drawing, then finish. Initial variant was `region_w13_lay2_noslane_cg10_softs`; revision 1 used `region_w13_lay2_cg10_softs_spl8`; revision 2 added `_lad`; the final variant is the W15 choice above. All looks are this fixed Sargent subject, V5 try 1, 1200 × 976 native output, 2026-10-09.

### Final paint inspection, before the empty closing drawing

The final W15 plan passed `bash bench/check.sh` with ADMITTED and passed the harness revision check. The painter expanded its corrective touch-up into additional glazes, ending with 90 completed passes. Look 6 (`bench/looks/06-compare.jpg`, native sheet `06-sheet.jpg`) reports 23251 brush strokes and zero pen lines. No paint passages remain; finish the empty closing stage with `bench/paint.sh finish`.

Value/landmark assessment: the curved blue hull, warm ropes, upper fittings and lower dark wedge are recognizable and in their intended positions. The final shadow/touch-up strengthens the dark fittings and reflection. The right hull retains ample paper light, and no ink was used. Material execution and artistic acceptance are separate: the painting still falls short of the reference's connected, luminous hull planes and economical brushwork.

Remaining visible failures: fragmented neutral planes in the central hull; bright irregular gaps that are larger and harder than the target facets; residual diagonal undercoverage and parallel stroke bands; the artificial horizontal change at about 62% sheet height; overly faceted warm rope shapes; and a cooler/whiter light-hull appearance than the reference. W15's final contacts cannot erase patterns already laid by the first wash and narrow-lane glazes. Do not describe this as a whole-picture win or a calibrated artistic score.

Learning for the next try: settle physical coverage and brush choice before the first wash, test the largest neutral shape as well as the blue shapes, and assess the inherited ground-glaze deferral against this nautical reference before painting. The attempt demonstrates why partial coverage repair during later value layers is less effective than a connected initial foundation. The final plan files record the last segment's settings; the revision history above is necessary to understand this particular painted sheet.
