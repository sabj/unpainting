# Mittens — V4, independent try 2

Target: `bench/targets/mittens-crop.png`, 300 × 259 source pixels. Painting: 1200 × 1036 native pixels, 234.107 × 202.112 mm, seed 0, 2026-10-09. Style: watercolor portrait sketch, fine lines and light washes. Use the watercolor-technique and painting-planner guides. Judge this reference and this painting only.

## Reference and values

The tabby occupies the left half, looks upward, and overlaps the man's left temple. The man enters from the lower right with a tilted eye line and a gentle smile. Ear set, the cat's unequal visible eyes, white muzzle, human eye spacing and hairline carry the likeness. The main focal point is the cat's eyes; the man's eyes are the secondary focus.

Five-value thumbnail: (1) bare paper background, white muzzle/chest, forehead and nose ridge; (2) pale ochre fur and warm skin tint; (3) amber stripes, skin turns and a light neutral hair foundation; (4) brown eye sockets, the shaded right shoulder and charcoal hair; (5) pupils, upper lids, nostrils, smile corners and isolated hair valleys. Darks must arrive progressively. Whites occupy much of the finished sheet.

## Lights

Four small measured eye catchlights are explicit physical reserves, approximately 1.13 mm square each. The cat's right glint is near (81,56), left glint near (26,63); human glints near (181,186) and (243,176). Their rectangular edges are much shorter than the seam threshold. Keep the pupil outside each light. These pinpoint lights remain paper; do not enlarge them into white iris discs.

Broad white muzzle, chest, forehead, nose ridge, lower lip and background are the painter's target-derived paper reserves, with irregular reference geometry. Warm fur sheen, sclera, cheek and temple highlights are pale painted planes where the target contains tint, rather than extra rectangular masks. White whiskers are negative-painted gaps through warm cheek washes; grey whiskers are sparse opening lines. Hair's pale holes remain open. No broad rectangular reserves.

## Region techniques and resolution

Family bounds label the painter's color/value segmentation; they are descriptive bounds, not painted rectangular shapes. All families use precise-watercolor to retain the fitted geometry and the same connected value ladder. Fine fur uses the ink-and-wash resolution decision within that style, without replacing the painted value planes with ink tone.

At native density one cell is 0.19509 mm; one reference pixel spans four native cells and 0.78036 mm. A wash feature should be at least four cells (0.78 mm) across. Smaller lines use the physical nib. Its pressure range gives about 0.18–0.22 mm contact width, or approximately 0.9–1.2 native cells in diameter and 0.45–0.6 cell radius. The drawing path width is a source measurement; the material profile determines actual contact. Wash radius follows each fitted shape and is recorded in the compile/run, rather than invented from a bounding box. Broad planes use side/belly contact and narrow fitted planes use the point. Inspect the actual 1200-pixel sheet for focal edges.

| Region | Reference cue and resolution choice | Sequence, state and load | Edges and details |
|---|---|---|---|
| Cat ears, crown and eyes | Warm ear rims and forehead stripes surround white fur. Iris bodies about 8–15 source pixels, 32–60 cells; lids and stray hairs 0.3–0.8 source pixels, 1.2–3.2 cells. Wash for iris/stripe planes; ink-and-wash for lids and hair. | Layer 1: connected dilute ochre/raw-sienna foundation on dry paper, watery load, water 0.62. Dry. Two controlled middle layers build amber planes, medium pigment, same finite calibrated brush route. Dry before each independent plane. Layers 4–5: medium neutral/warm glazes on dry paint, water 0.40; strongest eye accents last. | Upper lids and ear rim segments crisp; turning forehead edges softened on one side, white inner ears lost into paper. Keep eye footprints dry beside all fur washes. Iris remains tinted around the catchlight. |
| Cat muzzle and cheek | White muzzle, tiny dark nose and swept fur/whiskers. Nose about 5 source pixels / 20 cells, whiskers mostly below 4 cells. Wash for the cheek; ink-and-wash for whiskers. | Reserve white muzzle first. Pale cheek underwash, dry, amber patch planes, dry. Two connected shadow glazes cross cheek into right neck/shoulder. Few directional fine lines on the dry base, avoiding lights. No stipple. | Nose and mouth junction hard; muzzle outline broken/lost. Long curved cheek growth and whisker paths, never ruled hatch. White whiskers come from paint avoidance. |
| Cat chest, left leg and right shoulder | Large white chest, narrow orange leg, stronger amber shoulder. Fur planes 4–20 source pixels, 16–80 cells; strands 1–3 cells. Wash plus selective ink-and-wash. | Retain chest as irregular paper. One pale watery passage for each connected warm mass, dry. Middle planes and a shoulder shadow continuous with the head; dry, then restrained accents. | Outer shoulder firm where it overlaps the human face, lost into paper at the chest. Few downward strokes in shadow, no equal flecks or dense scribble. |
| Human hair | Coarse charcoal locks, paper holes and a broken crown/temple silhouette. Locks 4–15 source pixels / 16–60 cells; strands 1–3 cells. Wash for dark masses; ink-and-wash for a few lock directions. | Dilute sepia/ultramarine/burnt-sienna neutral foundation on dry paper, watery load. Dry. Two middle layers form coherent locks. Dry. Two shadow glazes deepen internal valleys, medium pigment at water 0.40. | Retain a light first mass and the paper holes; later darks are inside the silhouette. Curved pen gestures explain a few locks only. Dark hair stays paint, with no ink fill and no imposed dry-brush stippling. |
| Human forehead, cheeks and nose | Forehead almost bare, warm temple and jaw turns, lit nose ridge. Planes 6–35 source pixels / 24–140 cells. Wash question. | Layer 1 thin warm local tint, watery on dry paper. Dry. Two restrained mid-plane layers; hard on the shadow side and soft at the turning side. Dry. Late connected neutral-warm glazes cross temple, cheek and jaw, retaining the ridge and lit cheek. | Broad bare forehead is deliberate. No uniform blur, boxed face or skin-colored sclera. Cheek/nose transitions soft on one edge; nostrils crisp. |
| Human eyes, brows and mouth | Tilted paired eyes, light sclera, brown irises, small dark nostrils and smiling lip junction. Irises 6–10 source pixels / 24–40 cells; lid ribbon 1–3 cells. Wash plus ink-and-wash focal detail. | Sparse sepia placing drawing before washes. Reserve glints. Pale local tint around eyes, dry. Iris and socket planes on fully dry paper with point contact and medium flowing load. Late dark accents and selective closing ink on dry paper. | Tapered upper lids, light lower lids. Sclera pale tint. No pen creases under eyes. Avoid outlining the entire nose or lip; keep nostrils and smile corners. |
| Paper/background | White reference paper with a few stray hairs. Reserve question. | No background wash. | Portrait vignette stays open; no border or arbitrary seam. |

## Glazes and paper checks

The shadow support is the painter's connected target-derived shadow geometry, shared by bands 4 and 5 and independent of color-family ownership. It carries the cat cheek–neck–shoulder turn, human temple–cheek–jaw turn, and linked hair valleys. Each pigment contributes transparent paint over the same dried support; there are two complementary shadow stages, not separate region fills. Unconnected lights remain bare. There is no invented wash connecting the cat and human across a light gap.

Before every stroke the fixed executor measures the actual footprint and its three-cell neighbors, including the brush water and pigment mass. For these wet-on-dry moves it establishes measured dry paper, except for genuine wet overlap inside the same connected passage. An independent layer or shadow needs a fully dry base. Use the existing dry gate, physical cold-press paper and calibrated finite loads. Do not infer paper dryness from elapsed time. No wet-in-wet break is needed: the reference's soft edges are local turning edges, while the eyes and fine contours require dry placement.

## Drawing

Opening drawing: 24 reviewed source paths, mostly simplified and corner-smoothed registered target traces, with the left cat lid and right human brow added as sparse landmark gestures. Sepia ink explicitly declared. First place ears and focal features; then a few muzzle, whisker, face-boundary and hair-lock cues. The executor may omit paths crossing protected lights or below its minimum; inspect the opening stop to establish which landmarks actually reached the sheet.

Closing drawing: 35 candidate paths, selected by dry target-edge evidence and value contrast. Reinforce lids, pupils where supported, nose/mouth junctions and a handful of directional locks. Do not draw under-eye creases, fill hair with pen, or outline all wash patches. Opening pressure 0.25, closing cap 0.38; sepia absorption 4× rather than the base's 8×. Judge ink together with wash edges.

## Choices relative to the frozen base

`region_w13_lay2_dk12_sep4_opp25`: retain fitted physical wash paths; reduce four middle layers to two because this high-key sketch needs few transparent planes rather than repeated nested contours. Shadow gain 1.2 rather than 1.3 preserves charcoal hair without overwhelming pale skin and fur. Half the base sepia absorption and controlled drawing pressure retain fine lines. After reviewing the path-only drawing, two quarter-point smoothing rounds remove digital stair steps from the traced paths while retaining their source endpoints; this prevents zig-zag line character. Palette: ochre, raw sienna, burnt sienna, ultramarine and sepia. Shadow water 0.40 gives a controlled glaze; no global water reduction, splatter, lane recipe or extra texture pass.

## Checkpoints and acceptance

1. Admission/compile: require ADMITTED; inspect the written value ladder, reserve sizes, target-supported seams and per-region technique instructions. This verifies planning, not artistic quality.
2. Opening: ears and all four eye placements should read as a sparse sketch; no hair tone made from ink. Check actual drawing before first wash.
3. End of light foundation: faint coherent warm masses and neutral hair map; chest, muzzle and forehead stay open. A light beginning is expected.
4. End of middle planes: cat silhouette, amber stripes, warm skin turns and hair locks established; still luminous. Stop at the first visible failure before adding darker paint.
5. Before closing: transparent connected shadows, crisp landmarks, catchlights and white whiskers intact. Reduce remaining pen if it would duplicate already strong edges.
6. Finished: judge thumbnail value shapes, then lights, hard/soft/lost edges, landmarks, mark character, and light-to-dark progress frames in that order. No pixel-error judgment. Failure signs: missing glints, flat black hair, ink fill, blurry eyes, scratchy/stippled fur, parallel hatch, patchwork seams, heavy rims, white iris discs or over-dark skin. The finished painting must be complete; stop once it is finished.

The fast proof for this fixed cloud painter is the first actual passage and its dry checkpoint, viewed before later layers. Do not launch a separate physics render. Keep the plan and any observed revisions recorded here.

## Admission observations

`bash bench/check.sh` ended with **ADMITTED**. The full-width planning step reports 26 pigment/region passes and 414 connected wash shapes, six target color families, and no unsupported axis-aligned first-wash edges. Every compiled paint move is wet on dry with a fully dry base; foundation/middle water is 0.62 and shadow water is 0.40. The late shadow list contains 192 shapes crossing color-family boundaries. All four explicit glints are present. These are planning checks; the actual sheet is still to be inspected at the painter's stops.

The CPU drawing preview showed 23 retained paths: the human right-eye trace included a pupil branch crossing its explicit glint, so the entire path was omitted. Before the first physical wash, the drawing files were corrected to keep only that fitted upper-lid arc, outside the catchlight. Geometry of washes, palette and values are unchanged. The physical opening stop will establish whether the cloud start picked up this correction; if it already used the earlier snapshot, retain the corrected path for the final selective drawing and record that limitation.

The first pending cloud start was refused because these files changed during its admission check; no painting was started. Restart with the corrected files held fixed throughout admission, so the opening drawing uses the corrected upper lid. No physical restart or discarded painting is involved.
