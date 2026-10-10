# Painting plan: White Ships (Sargent), Round V5, Try 1

## Reference cues and composition

Sargent's maritime watercolor: boats with white canvas/sails against a warm pale background, reflected in deep blue-green water. The composition emphasizes horizontal layering—sky/background, boats, and reflective water. Light comes from above-left, creating warm mid-tones in the background and bright white on sail canvas, with deep reflected shadows in the water.

Requested style: **pure watercolor, no ink** — transparent layers with soft edges, letting paper brightness carry light and form.

## Value structure (light to dark)

1. **Lights**: white sail canvas, pale cream background, paper whites
2. **Mid-tones**: warm tan-brown wooden structures, soft background gradations  
3. **Darks**: deep blue-green water; shadow planes on boat hulls

## Approach: Painter's own segmentation and light preservation

The painter's own value segmentation of the target will guide form and technique. No explicit family regions—this respects natural transitions in a watercolor and avoids rectangular seams. Painter keeps near-paper target lights on its own (no explicit reserves needed).

**Technique outline:**
- **First pass**: light washes establish pale ground with soft edges
- **Mid passes**: mid-tone values define boat structures, wooden forms, water color
- **Final passes**: shadow glazes unify areas and create atmospheric depth
- **All edges**: determined by paper state and brush contact, not region boundaries
- **No closing ink**: pure watercolor throughout

## Opening drawing

Minimal graphite pencil lines suggest basic boat horizon and mast positions. Lines are functional guides for planning, intended to barely show in final painting. Graphite fixes under washes and won't migrate.

## Recipe tokens

- **Base**: Champion V096 with base recipe
- **Tokens**: `region_w13_lay2_noslane`
  - `region_w13`: standard brush choice per passage
  - `_lay2`: two mid-layer passes (restrained layering preserves whites)
  - `_noslane`: no sky lanes; background is one soft wash

No extra-args needed.

## Failure signs to watch for

1. **Blurred form**: if boat structures lose edge definition, the washes are too wet or overlapped too much. Fix: ensure precise watercolor steps are on dry paper with controlled contact.
2. **Muddy colors**: if warm tones become dull or greenish, pigment is too concentrated or mixing incorrectly. Fix: lighter load, let paper show through.
3. **Lost whites**: if sail canvas merges into background, first pass was too dark or too large. Fix: painter keeps paper lights; ensure reserves are respected.
4. **Flat water**: if water reads as a single blue plane, reflections are missing or too faint. Fix: second pass adds darker accents and reflected light variations.
5. **Over-soft edges**: if all edges blur and the composition loses structure, too much wet-in-wet or merging. Fix: precise watercolor on dry paper for mid-tones maintains form.

## Checkpoint intents

- **After opening drawing**: sparse pencil guides visible; horizon and boat positions marked
- **After first wash (light pass)**: pale background and water established; soft gradations visible
- **After mid-layer passes**: mid-tones define boat structures and depth; white sails preserved
- **After shadow glazes**: water reads deep with reflected lights; overall composition unified
- **Final painting**: luminous watercolor with soft edges, clear value structure, no heavy ink

## What changed in this try

- First attempt; baseline plan using painter's own value segmentation (no explicit family regions) to avoid rectangular seaming issues
- Minimal opening pencil lines
- No reserves to avoid seam complications
- Pure watercolor approach (no closing ink) as requested
- Two-layer mid-pass strategy for clarity and luminosity

## Protected lights (reserves)

1. **Brightest sail canvas** (bounds [0.2, 0.22, 0.5, 0.45]): keep bare paper white
2. **Lightest water reflection** (bounds [0.35, 0.75, 0.65, 0.9]): pale paper tone, will tone slightly in mid-layer
3. **Pale accent on upper sails** (bounds [0.55, 0.25, 0.8, 0.4]): preserve brightness

## Drawing and ink approach

- **Opening drawing**: sparse graphite lines for basic boat structure and horizon—functional guides only, not visible in final painting
- **Closing drawing**: none (per "pure watercolor, no ink" directive)—form achieved entirely through watercolor value planes and edges

## Recipe tokens and settings

- **Base**: Champion V096 with base recipe applied
- **Tokens**: `region_w13_lay2_noslane`
  - `region_w13`: standard brush choice per passage
  - `_lay2`: two mid-layer passes (reduce noise, preserve whites through restrained layering)
  - `_noslane`: no sky lanes → background is one soft graded wash (atmospheric quality)
- **Extra args**: none (use standard base calibration)

## Wet-passage grouping

- **sargent.background**: one continuous wet passage (sky and background as single graded wash)
- **sargent.sails & sargent.structure**: kept dry next to background during first pass; painted on dry paper after
- **sargent.water**: first pass wet-in-wet (broad color merge), then second pass on dry paper (reflected accents)

## Failure signs to watch

1. **Blurry boat structures**: if architectural planes blur into background, the background's wet passage is too large or stays too wet. Fix: dry thoroughly before painting sails/structure, keep them on dry paper.
2. **Muddy water**: if blue-green becomes grayish or opaque, too much pigment in water wash. Fix: load lighter, let paper shine through; use reflected light reserves to keep luminosity.
3. **Lost white sails**: if sail canvas merges into background, reserves were not respected or background wash bled into sail area. Fix: ensure sails are painted on dry paper after background fully dries.
4. **Flat forms**: if wooden structures read as silhouettes with no volume, mid-tone planes are missing. Fix: apply controlled mid-value wash on dry paper to establish lit/shadow distinction.
5. **Over-merged sky**: if background becomes a single flat value, the grading is insufficient. Fix: charge a warmer mid-tone into the still-wet base while it has sheen, creating local variation.

## What changed in this try

- First attempt; baseline plan following light-to-dark watercolor layering and Sargent's atmospheric approach.
- Pure watercolor approach (no closing ink) to match requested style.
- Two-layer mid-pass strategy (`_lay2`) to reduce noise and preserve the paper's luminosity, critical for white sails and reflective water.

## Checkpoint intents

1. **After opening drawing**: sparse pencil guides visible; ready for wet wash
2. **After background wash**: soft pale-to-warm grading established; background fully dry before next stage
3. **After sails/structure mid-tone**: white canvas visible; wooden forms show planar depth through value
4. **After water first pass**: deep blue-green with soft edges; no hard lines
5. **After water second pass**: reflective lights readable; ripple texture subtle and soft
6. **Final**: complete painting with luminous whites, warm wooden tones, deep water; no heavy ink overlay
