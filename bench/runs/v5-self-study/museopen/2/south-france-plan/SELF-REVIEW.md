# SELF-REVIEW — France, round V5 try 1 (before reading FEEDBACK.md)

## What I see in target vs painting

Target: Provençal hill village, warm light, ochre stone walls and terracotta roofs on right, foreground luminous green tree lower-left, cypress spires, wooded hillside, pale distant hills/sky top. Style is watercolour with ink/pen — but requested style is urban sketch, pen plus light wash: so pen should carry structure, washes light and transparent, much white paper.

Previous painting (compare.png right):
- Overall colour is muted olive/grey-green, far from target's warm ochre, sienna, sap green, cerulean. The warm wall/roof hues are almost absent except faint peach on right houses.
- Values are compressed: mid-tones dominate, no deep darks except cypress blobs and some tree shadows. Highlights blown to white in large irregular patches (left side especially).
- Two stark white squares (reserves) sit in middle and mid-right — completely artificial, not in target.
- A pale diagonal band cuts from upper left to lower centre — looks like a stroke lane or wash seam.
- Pen/ink lines are nearly invisible: faint thin lines only visible on close inspection, not the confident pen of urban sketch. The foreground tree trunk/branches are barely hinted, not drawn.
- Foliage is flat mottled slabs, not layered washes with pen; architecture is vague.
- Edge detail is poor: no window/ roof edge definition.

## What works (little)
- General placement roughly correct: village cluster on right, foreground tree lower-left, cypress verticals centre-top. So segmentation roughly right.
- Some roof colour on right houses hints at terracotta, though pale.
- Paper texture preserved, not muddy.

## What is wrong
1. **Reserves as white squares** — most glaring artefact. They read as missing data, not paper lights.
2. **No pen structure** — urban sketch requires pen plus wash, but pen is absent/weak. Opening lines file had medium None (no drawing), so only closing ink (254 lines) was used, and even that is too faint/thin and filtered by edgeMin 0.
3. **Flat, desaturated washes** — olive slabs, no warm-cool contrast, no glazing depth. Foliage is one value, not varied sap green/ochre/ultramarine.
4. **Diagonal seam / wipe front** — visible in stages 10-50% as travelling front.
5. **Lost lights and darks** — sky/distant hills blown white, shadows not deep enough, value range truncated.
6. **Texture dump** — stages show sudden jump from pale wash (10%) to near-finished darks at 50%, then little change to 100% — not human layering.

## At which stage it went wrong
- **Planning stage**: Reserves defined as axis-aligned rectangles with no target edge support — guaranteed white squares. Families with large bounds but urban-sketch style (no wet-in-wet) plus lay2 (only 2 mid layers) limited value depth. Opening drawing disabled (medium None) removed the foundational pen that should have gone first.
- **Early washes (10-25%)**: Should have been pen first, then pale washes. Instead first washes were flat ochre slabs with diagonal lane, no pen to anchor them. So the "pen plus wash" order was inverted/broken.
- **Mid washes (25-50%)**: Dark foliage slabs added all at once, flat, without pen-guided shapes. This is where the jump to near-finished darks happens.
- **Closing (75-100%)**: Closing ink added too late and too faint to rescue structure; no progressive refinement, hence "no change" tell.

## Own scores (before reading judges)
- Finished painting: **3.5 / 10** — placement roughly right but colour, value, pen, and artefacts (white squares, diagonal) make it unconvincing as urban sketch; not close to target.
- Plausibility of process: **2 / 5** — looks like filtered uncovering, not human painting: flat slabs, square holes, diagonal wipe, pen missing early, texture dump late.

---
## After reading FEEDBACK.md — agreement / disagreement

### Judges' notes (summary)
- Composite 5.4/10, classic measures 8.13 but composition values 3.67, edges 2, marks 2, classic value 5.95, edge 8.94, marks 9.5. LLM judges 2,4,2. Progression mean 2.2/5, tells: straight travelling front/wipe (5), flat slabs (4), texture dump (3), cut/scalloped edges/round holes (2), region arriving finished (2), etc. Notes: filtered uncovering, dab-speckle, diagonal band, square hole, jump to darks at 50%, almost no change 75-100%.

### Where I agree
- **Square holes / reserves**: Judges flagged "persistent white square placeholders" and "round holes" — exactly my #1 issue. Agree fully; reserves must go.
- **Flat slabs / filtered uncovering**: Judges' "flat evenly-toned slabs standing in for a form" and "dab-speckle" matches my flat olive washes. Agree.
- **Straight travelling front / diagonal band**: Judges named it 5 times; I saw diagonal seam. Agree — likely a lane or wash reach artefact.
- **Texture dump / jump to darks**: Judges noted "everything sharpening at once late" and "jump to near-finished darks at 50%" — matches my mid-wash observation. Agree.
- **Low edges/marks scores (2/10)**: Consistent with missing pen. Agree.
- **Progression 2-2.5/5**: My own 2/5 aligns. Agree process is implausible.

### Where I disagree / nuance
- **Composite 5.4 vs my 3.5**: Judges' composite is higher than my own, likely because classic measures (8.13, edge 8.94, marks 9.5) are inflated by the painter's internal scorer that rewards paper texture/edge preservation even when image is wrong. I think 3.5 is fairer for fidelity to target; the classic measures are noisy here.
- **"Dark before light" tell (1)**: Judges list this once, but urban sketch should be pen (dark) before light wash — so dark-before-light is not necessarily wrong in this style. The issue is pen was too faint/absent, not order. I would not penalize dark-first if pen were confident.
- **"No change from previous snapshot" (1)**: Judges flag 75-100% stasis, but some stasis is normal at end (drying, small accents). The real problem is earlier jump, not end stasis alone. I agree stasis is a symptom, not the core fault.
- **External judges are noisy (per brief)**: With ~50% agreement and ±0.5 variation, I treat the 2 vs 4 LLM spread as noise; the consistent tells (squares, slabs, wipe) are the reliable signal, not the absolute composite.

### What I will change based on this
- Remove reserves entirely (or keep at most one tiny organic reserve if needed) — addresses squares and "unsupported axis seams" risk.
- Fix drawing: ensure opening-lines.json has medium ink/sepia with real traced lines, not None; keep closing lines too, with proper pressure/width.
- Increase lay layers from 2 to 3 or 4 for better value depth, and adjust darkgain slightly, to fix compressed values.
- Reduce flat-slab effect: use more varied palette, allow more wells, avoid noslane if it causes diagonal band — test with/without.
- Keep families but ensure they follow real edges or make them smaller to avoid long straight seams.

### What I will not change / reject
- I will not chase the high classic edge/marks scores (8.94/9.5) — they are misleading for this target; I will prioritize warm ochre/sienna hues and pen structure even if classic scorer dips.
- I will not accept "dark before light" as a flaw to fix by reordering — pen-first is correct for urban sketch; I will make pen visible instead.
