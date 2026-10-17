# Self-review — Ships (Sargent) — Try 1

## What I see in target vs previous painting (before reading FEEDBACK.md)

**Target:** Sargent Ships — pure watercolor. Central pale blue hull (ultramarine/cerulean) with warm orange stitching and dark anchor shadow at bottom, ochre/sienna masts and rigging left and right, pale warm sky with soft blue, lower water turquoise/sap-green with ochre and dark hull reflection. No ink — form from transparent layered washes, reserved lights, crisp dry edges on hull, soft graded sky, dry-brush water texture. Small warm dots (rivets) on hull.

**Previous painting (previous-painting.png / compare.png):**

What works:
- Overall composition and value structure is recognizable: central hull mass, anchor shape bottom-left, masts left/right, dark anchor shadow, sky vs water division. Classic likeness is decent — a viewer can tell it's the same subject.
- Palette is roughly correct: blue hull, ochre masts, darks in anchor shadow and upper hull, turquoise water hints. Warm/cool balance is attempted.
- Some reserved lights are kept (paper whites), and darks have some depth.
- No ink lines visible — pure watercolor compliance is met (drawing disabled).

What is wrong:
- **Flat evenly-toned slabs:** Hull, water and sky are rendered as large flat slabs of uniform tone, not modelled watercolor washes. Hull blue is a single flat slab with hard scalloped edges, not graded transparent layers. Water is patchy flat shapes.
- **White square artifact:** A stark white square mask in middle of hull (reserve [0.38,0.42,0.43,0.48]) persists through all stages — reads as a digital mask, not a reserved light. Also large white paper areas on right where sky/water should have wash.
- **Scalloped / cut wash edges, round holes:** Wash edges are cut with scalloped, puzzle-piece boundaries and round holes, especially around hull and anchor. Looks like segmentation artifacts, not brush edges.
- **Missing texture and edges:** Dry-brush texture, granulation, and crisp focal edges are absent. Hull stitching orange dots are smeared into flat wash. Anchor is blobby, not crisp. Rigging is broken into flat fragments.
- **Value and color:** Sky is too white / under-painted; water is too fragmented; hull highlight is lost to white square; darks are somewhat present but lack transparent depth.
- **Overall watercolor feel:** Reads as a posterized segmentation, not layered transparent washes. Marks texture and edges detail are weak.

At which stage it went wrong:
- **Stage 10% (stages.jpg second panel):** Already the whole sheet is present at one faint value — a global faded-in version of the final, including fine rigging and darks faintly visible. A human would start with a few broad light washes (sky, hull light), not the entire composition faintly. The white square mask is already present. This indicates the value ladder paints all pigments faintly at once (light-to-dark by value band, not by area), causing a fade-in tell.
- **Stage 25-50%:** Flat slabs simply saturate; scalloped edges and round holes appear as washes are built up as uniform slabs. No modelling or wet-on-wet gradation. Fine detail (anchor, rigging) is already present early, not added late.
- **Stage 75-100%:** Texture and darks arrive as a late dump — everything sharpens at once late, rather than accumulating as distinct washes and dry-brush. The progression never shows a human light-to-dark order (light wash → mid planes → darks → details).

Own scores (before external feedback):
- **Finished painting: 4 / 10** — Recognizable but heavily artifacted: flat slabs, white square mask, scalloped edges, missing watercolor texture and crisp edges. Color roughly correct but not convincing as watercolor.
- **Plausibly painted: 1.5 / 5** — At 10% and 25% it is unmistakably a filter/fade, not brushstrokes accumulating. White mask, flat slabs, and global fade are strong tells. Late texture dump is also unconvincing. Would not fool a viewer as a person's painting in progress.

---
## After reading bench/feedback/FEEDBACK.md — agreement and disagreement

I have now read FEEDBACK.md (composite 5.12/10, classic 7.23, composition values 5.33, edges detail 2.67, marks texture 2, classic value 5.9, classic edge 9.01, classic marks 6.78; judges 2,4,3; progression 1,1.5,1.5,1.5,5 mean 2.1, 10+25% mean 1.25; tells: whole sheet at one faint value (5), cut/scalloped edges round holes (3), flat slabs (3), fine detail early (2), texture dump late (1); notes: full composition faintly at 10% and merely saturates — global fade with persistent white mask square — rather than light-to-dark; uniform fade-in).

Where I agree:
- **Progression failure is the core issue:** I agree completely with the progression judge. My own review identified the same global fade at 10% and white mask square. The judge's note about "full composition including fine rigging and darks already present faintly at 10% and merely saturates" matches exactly what I saw in stages.jpg. Mean 1.25 at 10+25% is fair — I scored 1.5.
- **Tells are accurate:** Whole-sheet faint value (5/5 judges), scalloped edges/round holes (3), flat slabs (3), fine detail early (2) — all match my own observations. I also noted flat slabs and scalloped edges as primary artifacts.
- **Finished painting scores:** Composite 5.12 and classic 7.23 seem slightly generous to me (I gave 4/10), but classic edge 9.01 is puzzling — edges detail was 2.67, so edge quality is actually poor. I agree marks texture 2/10 is fair — texture is missing. Composition values 5.33 is fair — values are somewhat correct but flat. The external judges' 2,4,3 (mean 3) aligns with my 4.
- **White mask square:** Judges flagged persistent white mask square — I also flagged this as a digital artifact from the reserve. It is a clear tell and should be removed.

Where I disagree / nuance:
- **Classic edge 9.01 vs edges detail 2.67:** These contradict. I side with edges detail 2.67 — edges are scalloped and not crisp. The 9.01 classic edge may be measuring something else (maybe edge preservation vs target, not watercolor edge quality). I do not accept 9.01 as indicating good edges; the painting's edges are poor.
- **Composite 5.12 vs my 4:** External composite is a bit higher than my own, likely because classic measures (7.23) weight likeness heavily, while I weight watercolor plausibility and artifacts more. I agree the painting is recognizable, but the white square and flat slabs should penalize more. I would keep my 4, but I understand why an automated scorer gives 5.12.
- **Noise and variance:** The brief says external judges agree with human expert only ~50% in paired comparisons and process judge varies ~0.5 on identical images. So I do not over-fit to the exact numbers (e.g., 2 vs 4 vs 3). The direction is consistent: finished is mediocre, progression is failed. I will not chase the 9.01 edge score.
- **What to fix:** Judges' tells point to the painting method (value ladder with many passes causing global fade), not just to reserves or colors. I agree the fix is to change the painting method to a human-like staged process (practice mode: light wash → mid → darks → details), not just to tweak reserves or palette. Simply adjusting darkgain or paints will not fix the fade-in.

Why I will change what I change:
- I will switch to --practice 1 (loose mode) to get true light-to-dark accumulation, not a global fade. This directly addresses the 10% tell.
- I will remove the small square reserve that caused the white mask, and rely on the painter's own light-keeping plus practicesheen/practicelights for natural reserved lights.
- I will tune practice lights and washes to avoid scalloped edges and flat slabs (adjust practicelightmin, practicelightsoft, practicecolours, practicehalf, etc.).
- I will keep the palette but ensure it is used via practice's mixed darks and local colours, not via flat slabs.

Rejected critique points: None major — I accept the progression critique fully. I reject only the implied suggestion that tweaking the same ladder would suffice; the method itself must change.
