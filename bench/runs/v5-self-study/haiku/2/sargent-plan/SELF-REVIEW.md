# Self-review: White Ships (Sargent), Round V5, Try 1

## Looking at the painting

**What works:**
- Basic color structure roughly present: pale background, water darker than background
- Some value separation between boats and water exists
- No major color disasters (not muddy green or overly saturated)

**What is wrong:**
- **Critical: no human painting progression**. Judges noted "opacity fade-in of the target image, not a painting process." The whole sheet comes up uniformly at one faint value, like faded film, not like a person building forms light-to-dark.
- **Texture is garbage**: marks texture scored 1.33/5. Texture arrives as a dump at the end (speckle, dotted trails, stair-step fill). No purposeful gestural marks.
- **Detail too early**: Rigging line is crisp and dark at 10% of strokes, way before the water and background have value. This breaks watercolor sequence.
- **Flat evenly-toned slabs**: Forms are missing. Should be lit planes, shadow planes, edges. Instead: uniform faded zones.
- **Edge quality terrible** (2.33/5): no hard/soft edge distinction. All soft blur or all hard edge from the painted-at-once slab effect.

**When it went wrong:**
- **Immediately**: The plan had no explicit families or reserves in the config, despite mentioning them in words. Painter's own segmentation without structure → uniform fade effect.
- **Layer strategy weak**: Only 2 mid-layer passes (`_lay2`) is not enough to show proper progression. Everything compressed into too few passes.
- **Opening drawing had crisp rigging**: The graphite or early ink lines for rigging appeared dark and crisp at 10%, anchoring dark detail before background and water had value. This killed progression.
- **No light-to-dark order**: Each region should lighten from nothing to full value over its own passes. Instead all regions faded in together at the same rate.

## Self-scores

**Finished painting: 2/10** 
- Looks more like a filter fade than a painting
- Value and composition are roughly there but execution is completely wrong
- Judges at 2.0-3.0 overall (vision) seem fair; too harsh to score higher

**Progress/process plausibility: 1/5**
- Progression judge mean 2.3, but 1.75 for early stages (10%-25%)
- "Sequence is a simple opacity fade-in, not a painting process" is exactly right
- No human painter works this way

## Agreement/disagreement with judges

**I agree:**
- Texture is terrible (1.33 is maybe generous)
- Progression is completely wrong (the fade-in observation is spot-on)
- Edges are bad (2.33 is fair)
- The whole approach is fundamentally broken

**I partly agree:**
- "Flat evenly-toned slabs" — yes, but this came from using no explicit regions
- Value structure is roughly there (5.64 in classic scoring) but applied wrong

**I disagree with nothing here** — the judges nailed it. The problem is my plan structure, not minor execution issues.

## What needs to change

1. **Define explicit families** for major areas: sky/background, sails/boat, water. Must structure it so painter applies light washes to each region in sequence.
2. **Define reserves explicitly** in config.json for white sails, highlights — not just in the plan text.
3. **More mid-layer passes** — use `_lay4` or `_lay6` instead of `_lay2` to show proper progression.
4. **Keep opening drawing minimal and graphite-only** — no dark inked rigging at the start. Just basic structure.
5. **Separate wet and dry regions** — specify which regions stay dry so detail stays crisp.
6. **No painter's own segmentation** — give it explicit regions to work with.
