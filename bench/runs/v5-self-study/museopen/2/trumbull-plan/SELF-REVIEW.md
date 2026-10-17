# Self-review before reading external feedback

## What works
- Likeness is strong: classic measures 8.39, classic edge 9.23, classic marks 9.68 suggest the stone colour, slate roofs and window recesses are close to target. Warm sunlit ochre on main gable vs cooler shadow on left return is readable. Sky is pale graded blue with soft cloud corridors, not banded. Street furniture and signage are present and legible.
- Value structure is broadly correct: light stone base → mid ochre → slate blue-grey → dark window recesses. Darkgain 1.3 gives sufficient punch for near-black arches.
- No admission failure: families cover the sheet, no unsupported seams, all passages have brush paths (0 dropped).

## What is wrong
- **Edges/detail and marks/texture are weak** (would score ~2-3/10): stone texture reads as dotted speckle, not irregular ashlar brushwork; gable coping and chimney edges are soft, not crisp focal detail; foliage is muddy, not lost edges.
- **Progression looks like a filter fade, not a human sequence**: at 10% the whole sheet is a uniform faint beige wash with every element (window mullions, street signs, traffic lights, even the dark window recesses as pale ghosts) already present. A human would reserve window openings and mullions as paper white, lay a broad light wash for stone, then build mid planes, then glaze shadows, then add dark recesses and selective ink. Here everything darkens in uniform steps.
- **Speckle/dotted trails instead of drawn lines**: stone-block texture (blk60/bmm40/birr) and high texvariety (tv8) produce dotted trails, not dry-brush or wash edges. Opening drawing is absent (medium none, 120 lines ignored), closing ink is dense (ink4, 509 lines, drawwant 1) so fine detail is already in washes.
- **Sky and foliage not differentiated**: sky family is precise-watercolor wet-on-dry, not atmospheric-wet, so cloud lights are not lifted but painted as pale wash; foliage is same wet-on-dry as stone, so it competes.

## At which stage it went wrong
- **Planning, before any paint**: 
  - Families include `Y1.whole-physical-fringe` (0.02,0.02,0.98,0.98) that overlaps everything; the painter's segmentation assigns many cells to this catch-all, causing a uniform first wash.
  - No reserves: brightest stone trim, window mullions and sidewalk are not protected, so they receive the first pale wash instead of staying paper white.
  - Drawing: opening-lines.json medium "none" (120 lines) and closingink4-lines.json medium "none" (509 lines) mean no graphite opening and no selective closing ink; the base recipe's _uncap (100000 lines) would draw everything if medium were not none, but with none the painter draws nothing, so all detail must come from washes → speckle.
  - Tokens: _lay4 (4 mid layers) creates 4 uniform light-to-dark steps → global fade; _blk60 (0.6 coverage) + _birr + _tv8 (0.8) → dense irregular blocks as speckle; _sep8 (scale 8) → very dark sepia ink that speckles; _ink4 (drawwant 1, closingedgemin 0) → dense closing ink that would be indiscriminate if drawn.
  - Style: sky is not atmospheric-wet, so no graded wet passage with lifted lights; all families are precise-watercolor wet-on-dry, so no wet-on-wet softness.

## Own scores
- Finished painting: **6/10** — good colour/value likeness, but architectural crispness, stone texture and foliage are weak; sky is okay but not luminous.
- Plausibly painted: **2/5** — early stages are unmistakably a fade-in (whole sheet at one faint value, fine detail at 10%), late texture dump; only the final frame approaches a painting.

---
## After reading bench/feedback/FEEDBACK.md

### Where I agree
- **Progression 1.2 mean, 1 at 10%/25%**: fully agree. The strip shows every element down to mullions and street signs at 10% as pale ghosts, then uniform darkening — the judge note "global fade-in of a completed image rather than a painter's sequence" is accurate. My 2/5 was generous; 1/5 for early stages is fair.
- **Tells**: "whole sheet at one faint value, as if faded in (4)" — yes, first wash is uniform beige over sky, stone, foliage. "fine detail already present in first 25% (3)" — yes, window bays and signage are there early. "speckle or dotted trails instead of drawn lines (3)" — yes, stone blocks read as speckle, not brush. "texture arriving as a dump, everything sharpening at once late (2)" — yes, stone texture and darks appear late as a dump.
- **Composite 6.03, classic measures 8.39 vs edges detail 2.67, marks texture 3**: agree. Likeness is high but detail/texture are low — matches my critique of soft gable edges and dotted stone.
- **Classic value 6.27 vs composition values 5.67**: value planes are okay but not precise; sky/stone/foliage values are somewhat merged.

### Where I disagree / nuance
- **Judge scores 4,4,3 (mean 3.67) vs composite 6.03**: the LLM judges are harsher than classic measures. I think the finished painting deserves ~6 for likeness, not 3-4; the judges may be penalising progression (which is a process score, not finished quality) or expecting more artistic interpretation. I will not chase their 3-4 by over-stylising; I will keep precise architectural watercolor and fix progression.
- **"Texture arriving as a dump"**: I agree texture is late, but the base recipe's 4 mid layers + 2 recess layers is intended to build gradually; the dump is due to high stone-block coverage (blk60) and high texvariety, not the layer count alone. Reducing coverage and variety will make texture arrive more gradually, but I will keep 2 mid layers (not 4) to avoid uniform steps.
- **External judges are noisy (agree ~50% with human expert, process judge ±0.5)**: I treat the 1.2 mean as directional, not precise. I will aim for a clearly human sequence (sparse graphite → light wash → mid planes → shadow glazes → selective ink) rather than optimising for their exact numbers.

### What I will change (and what I reject)
- **Change**: remove whole-physical-fringe family; keep 5 families (sky, slate-roofs, sun-main-gable, cool-main-return, foliage-street) with precise-watercolor, no region style cuts to avoid unsupported seams.
- **Change**: add 2 small reserves (cloud light, sidewalk) to keep paper whites early; keep them small (<8% short side) so no seam refusal.
- **Change**: proper drawing: sparse graphite opening (trace-ink .14/14, medium graphite, capped 36 lines) and selective closing ink (trace-ink .10/10, medium ink, drawwant .75, ~80-100 lines). This gives visible pencil at 10%, washes after, ink at end — human order.
- **Change**: variant tokens: _lay2 (2 mid layers, not 4) for broader early washes; _sep4 (scale 4, not 8) for less dark speckle; _blk40 (0.4, not 0.6) + _bka15 (0.15, not 0.2) + disable _birr via --stoneirregular 0 for less irregular speckle; _dk12 (1.2, not 1.3) + _tv6 (0.6, not 0.8) for softer darks/texture; _sfa8 for soft arcs; _ol36 to cap opening lines; _ink3 (drawwant .75) for selective closing; _dwg150 (1.5, not 2) for finer lines.
- **Change**: extra-args to disable irregular blocks, add litlift 0.2, edgewobble 0.5, strokemm 30, lanemm 6 for more visible brush lanes.
- **Keep**: base sky handling (_sky3, _skyb) and precise-watercolor style; Trumbull palette _pgreen; cold-press paper; violet shadow and ground glaze — these are correct for warm stone.
- **Reject**: making sky atmospheric-wet with a full-width horizontal cut (would be unsupported seam through gables); instead keep sky as precise-watercolor with sky tokens for softness. Reject adding many large reserves (would create unsupported seams and white patches where target is mid-value). Reject keeping _lay4/_blk60/_sep8/_birr/_tv8 — these cause the fade and speckle the judges named.
