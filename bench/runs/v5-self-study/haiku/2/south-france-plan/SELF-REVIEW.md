# Self-review: Try 1 vs Try 2 plan

## What went wrong in Try 1

1. **Two large white rectangular reserves** (bounds [0.75,0.45,0.95,0.65] and [0.2,0.55,0.4,0.75]) created obvious artificial mask holes that persisted through all stages. Judges said "two rectangular mask holes...a stroke-by-stroke filter uncovering the target, not a hand painting."

2. **No visible pen linework early on.** Opening drawing had sparse lines (roofline, cypress outlines) that got lost under washes. Judges found "no pen linework" and "uniform scattered dabs with no pen linework, no light-to-dark or structure-first order."

3. **Flat uniform wash progression.** At 10-25% stages, the image was mostly faint orange/yellow scattered patches—looked like a digital fade-in, not a person painting. Judge said "the whole sheet at one faint value, as if faded in" and "marks accumulate as uniform scattered dabs."

4. **Urban sketch style misunderstood.** Style calls for pen + light wash (pen first defining structure, wash supporting it), but Try 1 was wash + scattered dabs (wash first, no structure).

5. **Score: 4.28 composite** (vision judges 1.0-2.0, progression judges 1.5-2.0). Progression judge verdict: "a stroke-by-stroke filter uncovering the target, not a hand painting."

## What Try 2 changes

1. **Removed all large rectangular reserves.** No artificial mask holes. Let painter protect its own paper whites.

2. **Comprehensive traced pen lines from target.** Full structural outline (58 hard-line traces from target) visible from the start. Rooflines, building edges, cypress profiles, main junctions all present.

3. **True light-to-dark progression.** Pale wash first (field, sky, trees as unified washes), dry, mid values on dry paper (fold planes, turning edges), dry, shadow glazes last (unified across boundaries), closing ink selective at focal points only.

4. **Urban sketch execution.** Pen structure first (opening), light wash supports it (mid-layers), darks and accents finish (closing ink). Not wash + dabs, but pen + wash as intended.

5. **Tokens: `_lay2 _ink2`** instead of default `_lay4 _ink4`. Two mid layers (not four) keeps the work light and sketch-like. Reduced ink keeps closing selective.

## Agree/disagree with judges

**Fully agree:**
- The two white rectangular holes are indefensible and must go.
- No visible pen structure early is a fundamental failure for urban sketch style.
- Progression looks like a filter, not a painting—the scattered-dabs problem must be fixed.
- Light-to-dark layering is absent and essential.

**Note on judge noise:**
Judges are noisy (they agree with a human expert in ~50% of comparisons) so low scores alone don't determine a fix. But the progression judge's description is precise and actionable: "filter uncovering the target, not a hand painting." That's a real failure.

## Path forward

Try 2 addresses all the key failures: no mask holes, full pen structure early, proper layering, reduced token count for sketch-like lightness. If pen visibility and light-to-dark progression work, this should show much better progression scores.
