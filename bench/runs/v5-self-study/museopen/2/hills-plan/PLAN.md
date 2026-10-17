# Hills — Loose Ink and Wash Plan (V5 try 2)

## Reference cues
- Rolling sunlit hillside with a winding pale sandy path cutting diagonally from upper-left to lower-right.
- Sunlit meadows: bright, variegated yellow-greens with warm ochre undertones, broken washes with soft mottling and dry-brush texture.
- Tree masses: dark olive/forest greens, dense foliage clumps, especially lower-left and mid-right, with soft turning edges and directional ink for trunks/branches.
- Distant wooded ridge at top: darker, cooler, softer, merging into mid-slope.
- Path: paper-white to pale sand, organic, soft where it fades into grass, harder where cut by shadow. No sky visible; all land.

## Regions and technique
- **No families (single continuous sheet)**. The hillside is a single diagonal form; horizontal stratification (distant/midslope/foreground) was artificial and caused the "region arriving finished while neighbour untouched" procedural tell. One continuous family lets washes connect across the sheet and encourages the painter's own segmentation to follow value, not geometry.
- Style `ink-and-wash` for the whole sheet: opening sepia ink establishes tree structure and path edges, then transparent washes light-to-dark, closing ink reinforces dark accents. No region-specific styles needed.

## Moisture and load
- Opening ink on dry paper, crisp, limited to 12 strongest lines (tuned cap) to avoid dotted speckle.
- First washes: moderate water, light pigment load, broad mop for meadows; softened edges while damp (`softs`: softsplit, softarcs) so the distant ridge merges softly.
- Mid layers: 2 layers (`lay2`) for looser handling — target's washes are broad, not heavily glazed. Progressive darkening with drying between glazes for distinct shadow shapes. `edgefade 1.2` and `layertexture` add variegation to meadows; `texflow 0.8` / `texshadow 0.8` add broken texture to foliage and shadows.
- Closing ink: dry, directional, on dry paper, limited to 24 lines, only where edge strength is sufficient (`closingedgemin 0.22`).

## Protected lights
- **No rectangular reserves**. The three small axis-aligned reserves in try 1 created persistent white rectangles and unsupported straight seams. The path's organic shape cannot be preserved by rectangles.
- Rely on the painter's own near-paper lights (paper white <0.04 density) and the value plan to keep the path luminous. The path is the lightest shape; the painter will naturally leave it as paper/near-paper if not over-glazed. This avoids hard seams and lets the path's edges be soft/broken as in the target.

## Edges and values
- Soft/lost edges between distant ridge and mid-slope via `softs` (softsplit + softarcs) and wet-in-wet handling.
- Hard/broken edges for tree silhouettes via ink, with `edgefade` to avoid cut/scalloped wash edges.
- Path edges: soft where path fades into grass, harder where cut by shadow — achieved by not reserving and letting washes naturally vary.
- Value ladder: paper white (path) → pale yellow-green (sunlit grass, warm ochre) → mid olive (shadowed meadow) → dark forest green/brown (trees) → sepia ink accents. `darkgain 1.2` (slightly lighter than base 1.3) and `midgain 1.15` keep meadows luminous; `coolgain 1.10` adds depth to distant greens without mud.

## What would show failure
- Path lost (overpainted with green) or replaced by white rectangles.
- Meadows as flat, evenly-toned olive/yellow slabs with scalloped edges and no internal variation.
- Trees as flat blue-black blobs without ink structure or soft turning edges.
- Dotted/speckled ink trails instead of loose directional lines.
- Even sheet-wide mid-tone wash at 10% stage (faded-in look) or region-by-region arrival.

## V5 changes from try 1 and why
- **Removed all 3 families → 0 families**: Try 1's horizontal bands caused region-by-region painting (top tell, 6 mentions). A continuous hillside needs no stratification; single sheet encourages connected washes and human-like progression.
- **Removed all 3 reserves → 0 reserves**: Reserves caused crisp white rectangular voids persisting to finish (judge note) and unsupported axis-aligned seams. Replaced with painter's own paper lights for organic path preservation.
- **Capped drawing: `uncap` (100000 lines) → 12 opening / 24 closing via extra-args**: Try 1's traced file had many short broken segments at low contrast (0.12) and `uncap` let all through, creating stippled dotted trails (5 mentions). Now no traced files; painter draws from its own reading, limited to tuned caps (12/24) with pressure 0.30/0.40 and edgeMin 0.22, so only the strongest, longest lines survive.
- **Reduced mid layers `lay3` → `lay2`**: Target's washes are broad and luminous, not heavily glazed. Fewer layers = looser, more transparent, less flat-slab risk.
- **Added texture/edge tokens: `softs` + `efade` + `lt` + `tfl8` + `tsh8` + `sml30` + `wre15` + `spl6`**: Directly addresses flat slabs, cut edges, and lack of variegation. `softs` softens first-wash edges while damp; `efade` fades hard edges; `lt`/`tfl8`/`tsh8` add broken dry-brush texture to meadows and foliage; `sml30`/`wre15`/`spl6` control stroke spacing and wash reach for more natural brushwork.
- **Adjusted values: `darkgain 1.15` → 1.20, added `midgain 1.15`/`coolgain 1.10`**: Try 1's meadows were dull olive-grey (first wash too cool/dark). Slightly higher darkgain deepens tree darks for better value separation; midgain/coolgain tune meadow luminosity and distant ridge coolness.
- **Kept palette**: ochre,rawsienna,sienna,hansa,ultramarine,cerulean,sapgreen,sepia remains appropriate for earths/greens; no change needed.

## Critique points rejected
- Rejected adding more reserves/families to "control" washes — critique correctly identified them as causes; fix is simplification, not more geometry.
- Rejected treating LLM judges' 2/10 as precise target; they agree with humans only ~50% and vary ±0.5. Aim is own 6–7/10 (recognizable loose ink-and-wash with varied washes, soft edges, minimal artifacts) rather than overfitting to noisy composite.
- "No change from previous snapshot (2)" — not strongly observed; 10%→25%→50% do show change (adding darks, then ochres); weighted less than top tells.

## Expected outcome
- Meadows with variegated, luminous yellow-green washes and soft mottling, not flat slabs.
- Trees as dark masses with directional ink structure and soft turning edges.
- Path preserved as organic paper-white shape without rectangles, integrated with surrounding shadows.
- Progression: selective pale washes at 10% (not sheet-wide), then darks, then warm accents — plausible human order without region-by-region or dotted-trail tells.
