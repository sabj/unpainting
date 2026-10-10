# Hills — V4 independent try 3

Reference: bench/targets/hills-crop.png, 306 × 242 target pixels. Output 1224 × 968 at 158.047882 mm wide, 0.129124 mm per native cell. Requested loose ink and wash. This plan uses only this reference and the frozen painter.

## Composition and values

The focal point is the spreading oak beside the central cream path bend (target x105–145, y135–155). Preserve the alternating diagonal ribbons of sunlight and woodland. Five-value thumbnail: cream tracks and paper breaks; light yellow-green sunlit ridges; middle olive-grey crowns; blue-grey connected valley shadows; deepest cool trunk-side and near-left grove accents. The upper grove recedes by subdued colour and fewer lines. This crop contains no sky, buildings, eyes or water.

The reference is densely painted. Do not invent a white vignette. The tracks, crown gaps and sun glints supply breathing space. Path interiors are near-paper reserves inferred from the target; warmer margins are pale painted ochre. Broad grass lights are painted yellow-green, not white cutouts. No explicit rectangular reserves: they would box the curving tracks or enlarge tiny highlights into square holes. The painter's irregular connected target-light mask protects the actual brightest shapes throughout.

## Technique and order

All eight descriptive families use ink-and-wash and wet on dry. Bounds label fitted colour/value segmentation, not rectangular painted panels. There are no rectangular style overrides. The ink-and-wash profile executes a local-colour foundation and connected shadow stage (42%/58% of demand in shadow regions; areas outside the shadow support receive their required light colour in the foundation). It suppresses the identity profile's extra middle and texture layers. The base recipe supplies physical cold-press paper and its normal touch-up mechanism.

1. Sparse opening sepia pen on measured dry paper: central oak forks, a few neighboring trunks, short path turns and an upper ridge gesture. Twelve selected paths, light pressure 0.28. Leave most contour explanation to the brush.
2. Large light local-colour washes on dry paper, watery to medium flowing load, profile water 0.55. Use connected fitted belly/side brush paths, allowing wet overlap within the same passage. Let the paper show through. Separate pigment passes belong to this single value stage.
3. Dry completely, measured across each footprint and its neighbors. Darker tree groups use a controlled medium pigment load, profile water 0.40. Connected transparent glazes cross adjoining crown, trunk and cast-shadow regions on the dry foundation. They must not terminate at descriptive family bounds.
4. Dry. Review values and built-in touch-up passes. Close with narrow sepia branches and reference-supported dark edge spans, pressure capped at 0.55. Keep the grassy slopes and path interiors free of hatch or stipple.

| Region | Reference cue and resolution decision | Passage, load and edges |
| --- | --- | --- |
| Upper groves | Muted distant blue-grey trees; wash question. Crown groups 2–6 source px = 8–24 native cells, about 1–3 mm. | Connected watery foundation on dry; medium cool glaze on fully dry. Few hard internal lines, lost internal joins and irregular outer edges. |
| Upper ridge | Yellow-green slope and cream track; wash question. Broad planes at least 10 source px = 40 cells. | Light ochre/hansa/green wash; restrained olive turns, crisp tree silhouettes. No individual grass blades. |
| Left ridge | Narrow luminous corridor; wash question. Track generally 3–9 source px = 12–36 cells. | Pale warm margins beside transparent green; broken dry shaded edges. Keep the light corridor continuous. |
| Ravine | Largest interconnected canopy mass; wash question. Crowns 5–20 source px = 20–80 cells. | Light blue/olive foundation, dry, then connected blue-grey/sepia shadow-stage glaze crossing individual crowns. Retain lighter crowns without outlining each one. |
| Focal oak | Wide crown and forked trunk; wash plus ink question. Crown lobes 3–10 source px = 12–40 cells; twigs about 0.3–1 px = 1.2–4 cells. | Olive-grey wash, full dry, cool trunk-side glaze. Sub-four-cell branches become tapered pen strokes. Crisp against the path, lost inside the dark grove. |
| Near left grove | Strongest foreground dark; wash plus selective ink question. Masses 8–30 source px = 32–120 cells. | Medium flowing blue-grey over the light base; deepest connected dry glaze. A few directional trunks, no ink fill or leaf dots. |
| Foreground meadow | Broad light yellow-green slope; wash question, paper tooth for texture. Blades below one source px are below four cells. | One light flowing wash and target-supported dry shadow groups. Preserve green lights between shadows; do not dab every blade. |
| Path | Cream winding track; wash and negative-gap question. Interior 3–12 source px = 12–48 cells. | Hold inferred near-paper core; pale ochre margins. Adjacent green and shadow washes describe the bend; interrupted shaded-edge ink only. |

Native brush paths fit connected shapes. For a representative 20-cell crown support, a 6–10-cell effective brush radius gives support/radius about 2–3.3; these are planning estimates, not measurements. Inspect actual path support in the compile and execution records. Broad field contacts span more cells. The physical sepia nib spans 0.12–0.45 mm, about 0.9–3.5 native cells, appropriate for branches the wash cannot resolve. Density and sheet dimensions stay fixed.

The executor's value-plan contact gate observes footprint plus neighboring cells before every stroke. A new wash or glaze requires fully dry paper; only same-passage overlap may remain wet. When the measured state is wrong, the physical dry operation finishes and measures again. No timer substitutes for that reading. No intentional wet-in-wet passage is needed: the reference's broken crisp crown silhouettes justify wet-on-dry placement.

## Pigments and changes from the fixed base

Wash palette: yellow ochre, hansa yellow, sap green, ultramarine, cerulean and sepia. It supplies warm luminous greens, cream tracks, olive-grey crowns and cool deep shadows. Sepia ink is the separate declared drawing material in the style profile. `_sep4` reduces the base ink absorption multiplier from eight to four; pressure caps keep narrow branches subordinate to paint. Opening lines are sparse reference-read gestures. Closing lines retain coherent target-supported spans, with reduced point density, mainly in trees. No complete canopy tracing, repeated hatch or pen-filled dark masses.

No departure from light-to-dark. The cross-region shadow stage unifies the trees. No splatter, added export texture, disabled physical effects, post-render recolour or additional render route. Painting is only through bench/paint.sh.

## Checkpoints and acceptance

Run bench/check.sh and inspect the value-plan and region check before starting. The task supplies no separate crop-render route, so preflight and the first actual wash checkpoint serve as the fast proof. Opening should show a sparse plausible scaffold. After the light stage, the path and ridge rhythm should read with trees lighter than the final reference. After the shadow stage, woodland should connect and deepen while tracks remain luminous. Before closing, review whether the planned ink is still appropriate.

Accept against the watercolor skill's list, in order: thumbnail value shapes; retained, correctly placed and toned lights; hard/soft/lost edge roles; central tree and path landmarks; purposeful connected marks without stamps, scratches, rings or tiled panels; light-to-dark progression; appropriate untouched-paper share for this densely painted crop. Failure means a broken or swallowed path, square white holes, isolated leaf dots, uniform blur, ink heavier than paint, or slopes buried under shadow. Judge early stages against their stated intent. Revise only unpainted work when a checkpoint identifies a concrete failure.

Preflight result: bench/check.sh ended ADMITTED. The compiled plan has 21 pigment/region passes: 14 light passes (seven pans across two colour groups) followed by seven cross-region shadow passes. The region check reports zero unsupported axis-aligned edges. Its 21 irregular light reserves total 34,523 native cells, about 2.9% of the sheet. The material log confirms sepia ink. These are planning results, not a claim that the finished painting has succeeded.

Execution note: bench/paint.sh start cleared admission, queued for a GPU, then remained in full-size startup well beyond the stated one-to-five-minute estimate. A look request confirmed that no stopped frame was available. After waiting, bench/paint.sh finish was requested so the admitted plan can complete without further checkpoints. No executable plan revisions were made, and no visual acceptance of an unseen painting is claimed.
