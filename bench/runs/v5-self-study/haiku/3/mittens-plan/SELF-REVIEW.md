# Self-review: Try 2 painting

## What worked

- The concept of ink-and-wash with directional marks for fur and hair was sound
- Eye structure and catchlight reserves were correct in principle
- The opening drawing tracing approach captured good line detail
- Value ranges (lights, mids, darks) were conceptually correct

## What failed

**Visual failures:**
1. **Hard-edged washes and patches** — The progression judge noted a "hard-edged white rectangle and flat orange slab" that persisted at 100%. These came from the reserves and region boundaries being too axis-aligned and too large (e.g., the whisker area reserve at [0.05,0.48,0.42,0.72] is a big rectangle that doesn't follow real edges in the target).

2. **Fade-in effect, not human painting** — The stages show no clear progression. Each stage (10%, 25%, 50%, 75%) looks nearly identical, suggesting the image is fading in rather than being painted. This is the opposite of light-to-dark layering: instead of lights appearing first and darkening, all values arrive together.

3. **Flat value modeling** — The feedback notes "flat evenly-toned slabs" and "texture arriving as a dump, everything sharpening at once late." The regions didn't layer properly; instead they all filled at once, then got darker and textured in the final stage.

4. **Disconnected washes** — Eight regions with hard boundaries created a patchwork instead of flowing passages. The cat head lit and shadow sides should blend together, not paint as separate patches.

## Why this happened

- **Too many small regions** — Eight families forced painting as patches rather than connected passages. Each region painted independently, not as a unified whole with soft transitions.

- **Oversized reserves** — The whisker area reserve was a large rectangle that the painter rendered as a hard white rectangle, not an organic shape. It blocked natural wash flow.

- **Recipe didn't support the intent** — `_lay2` (two mid layers) should have created clear steps, but the eight-region structure defeated it by layering region-by-region instead of globally.

- **Opening drawing insufficient** — The opening stage itself probably wasn't visually strong enough to carry the sketch character throughout.

## Disagreement with judges

I agree with the judges on all counts. The painting clearly reads as a filter rather than hand-painted. The progression is the core failure.

## Changes for try 3

1. **Drastically reduce regions** — From 8 to 3-4 large areas: cat (unified), face (lit and shadow as one wash initially), hair, background. Allow natural soft edges instead of boundaried regions.

2. **Remove large reserves** — Keep only actual catchlights (small point lights on eyes). Remove the whisker rectangle and hair light reserves. Let the painter's own understanding of lights work.

3. **Simpler, clearer layer order** — 
   - Stage 1: Opening sketch (visible, strong)
   - Stage 2: Light overall wash (cat + face as one warm pale passage)
   - Stage 3: Mid values on dry (eye irises, nose, mouth)
   - Stage 4: Shadow glaze (cool dark on face shadow side, fur shadow side)
   - Stage 5: Texture and accents (fur strokes, hair waves, eye pupils, whiskers)

4. **Verify wash connectivity** — Each stage must show visible new paint, not opacity shifts. Stage 1 should be sketchy. Stage 2 should be luminous with paper showing. Stages 3-5 should add visible new layers.

5. **Reconsider tokens** — `_lay2` was right in concept but the region structure broke it. Try `_lay3` for more flexibility, or keep `_lay2` but rely on the coarser regions to make it work. Also consider if any other tokens (sky handling, etc.) would help with soft edges.

## Self-score for try 2

- **Finished painting**: 2/10 — Fade-in effect is fatal. Marks and texture work (7.04) but overall is incoherent.
- **Painting process (plausibility)**: 1/5 — Judges were right. No human painter would produce a fade-in from opaque all at once.
