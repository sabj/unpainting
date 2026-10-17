# Mittens - watercolor portrait sketch, fine lines and light washes

- Reference cues: orange tabby cat (left, warm ochre/sienna fur, white chest, pink nose, dark eyes) held by person (right, light skin, dark hair, light eyes). White paper background throughout. Light, transparent washes with fine ink structure.

- Regions: no families (painter's own color/value segmentation unlabelled). Precise-watercolor throughout: value planes carry form, dry focal details, selective closing drawing. Light washes need soft edges, not hard family seams.

- Protected lights: none explicit; painter's own near-paper lights preserve white background, cat's white chest, eye highlights. Reserves would create hard rectangles on soft portrait.

- Drawing: no authored drawing files; painter's own graphite/sepia reading for fine lines. Base sepia ink (sep8) for warm portrait linework, drawwidthgain 2 for fine but visible lines.

- Values: 3 mid layers (lay3 vs base 4) for lighter, more transparent washes; darkgain 1.1 (vs 1.3) for softer darks - target has no deep blacks, only warm fur shadows and hair. Cool gain 1.3 and violet shadows for cool fur shadows, ground glaze for warmth.

- Tokens: region_w13_lay3_dk11_noslane - 13mm regions, 3 mid layers, darkgain 1.1, no sky lanes (no sky in portrait). Base tokens kept: ink4, rec2x, rcl, sky3, leaf, sep8, cg13, vio, rg10, skyb, cpp, tv8, uncap, dwg200, tp2, shs. Stone tokens skipped (architecture only), pgreen skipped (Trumbull only).

- Paints: ochre, rawsienna, sienna, hansa, ultramarine, cerulean, rose, sepia via --paints. Warm oranges for cat fur (ochre/rawsienna/sienna/hansa), cool blues for shadows and hair (ultramarine/cerulean), rose for skin/nose, sepia for darks. Granulation 0.25 and pigphys 1 for paper texture.

- Moisture/load: coldpress paper, wet on dry for fur/skin details, light washes (low darkgain, 3 layers).

- Edges: soft, not hard; no reserves or families to create unsupported seams. Paperlights give soft white preservation.

- Failure: heavy darks (over-dark fur/hair), muddy skin (over-mixed), lost white chest/background (over-washed), hard rectangular whites (if reserves added), sky lanes banding (removed via noslane).

- What would show failure: cat fur as flat orange, skin as grey, background washed, eyes without highlight, hard ink over light washes.
