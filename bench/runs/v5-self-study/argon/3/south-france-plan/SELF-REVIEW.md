# Self-Review of Try 2 (`France`, Round V5, Try 3 of 3)

## Part 1: Independent Assessment Before Reading `bench/feedback/FEEDBACK.md`

### 1. Own Scores for Try 2
- **Finished Painting Score (0–10)**: **7.2 / 10**
- **Process Plausibility Score (1–5)**: **3.5 / 5**

### 2. What Works in Try 2
- **Complete elimination of the Try 1 diagonal unpainted trough**: Switching all 6 region styles to `"precise-watercolor"` under top-level `"urban-sketch"`, enabling `region_w15` (`choosePassageBrush`), and using `_spl9_sml220_lf` eliminated the `p.r = 500 px` single-sweep reservoir starvation from Try 1. Every passage across the hillside is properly wetted and pigmented.
- **Full 5-band light-to-dark tonal progression**: Restoring `mid/b2L0` and `mid/b2L1` (`_lay2_ls50`) bridged the sunlit cream ground and deep cypress/eave darks with two distinct middle-value olive and ochre wash layers (`stages.jpg` frames 2, 3, and 4 show a genuine progressive build from pale foundation washes to mid-value canopy masses to concentrated darks).
- **Luminous reserved paper lights (`_relonly` + `_ms450`)**: The sunlit upper-left stone terrace path (`x: 0.03–0.38, y: 0.05–0.46`) and central clearing remain bright, organic, and free of hard axis-aligned rectangular reserve seams.
- **Readable village massing and foreground tree armature**: The upper village skyline, the tall vertical cypress spires, the three clustered buildings on the right hillside, and the branching lower-left foreground tree trunk read clearly at first glance.

### 3. What Is Wrong and At Which Stage It Went Wrong
1. **Topological / Contour-Map Ink Outlines Around Soft Foliage and Distant Hills (Stage 1 Opening & Stage 5 Closing)**:
   - *Where it went wrong*: Already visible in Stage 1 (`opening-lines.json`) and reinforced in Stage 5 (`closing-lines.json`). Because our line generator traced `values` gradient ridges indiscriminately across the entire sheet, it wrapped wavy closed contour rings around soft olive foliage clumps (mid-left canopy, central tree crowns) and even drew black ink squiggles inside the distant atmospheric blue valley at top-right (`x: 0.82–1.00, y: 0.00–0.16`).
   - *Why it hurts*: In an urban sketch ("pen plus light wash"), pen work should define structural architecture (roofs, eaves, corners, masonry walls, stone terrace walls, window openings), tree trunks/branches, and crisp cypress silhouettes—not outline soft tonal transitions inside foliage masses like a topographic map.
2. **Dull, Over-Darkened Foreground Tree Crown & Muted Yellow-Green Chroma (Stages 3–4, `mid/b2L0..L1` & `shadow/b4`)**:
   - *Where it went wrong*: Between Stage 3 and Stage 4, the large foreground tree crown in the lower-left (`x: 0.08–0.33, y: 0.55–0.98`) and the sunlit tree crowns above it were covered by dark olive-umbrage mid and shadow washes. In the target, the lower-left foreground tree crown is a bright, sunlit warm chartreuse/yellow-green (`hansa yellow` + light `sap green`) through which dark branches show; in Try 2 it turned into a dark, heavy olive mass that reduces foreground depth and vibrancy.
3. **Under-Saturated Right-Side Terracotta Roofs vs. Heavy Slate Cast Shadow & Muddy Lower Facade (Stages 3–4)**:
   - *Where it went wrong*: On the right-hand building cluster (`x: 0.62–0.96, y: 0.32–0.80`), only the left-most small roof (`x: 0.65–0.74, y: 0.35–0.42`) received warm terracotta chroma; the square tower's roof (`x: 0.78–0.95, y: 0.33–0.39`) and the lower house's pitched roof (`x: 0.76–0.96, y: 0.50–0.58`) stayed too pale and beige in Stages 2–3. Meanwhile, in Stage 4, the shadow to the left of the lower house (`x: 0.72–0.82, y: 0.52–0.78`) pooled into a heavy blue-slate mass, and the lower house's sunlit wall (`x: 0.78–0.95, y: 0.58–0.78`) picked up muddy violet-grey patches while losing its crisp dark rectangular window openings.
4. **Stage 1 Sparse Wash Coverage & Stage 2 Horizontal Lane Striping (`stages.jpg` Frames 1–2)**:
   - *Where it went wrong*: At the 20% progress snapshot (Stage 1), all 385 opening lines had been drawn, plus only the first small ochre pass on the house walls, so Stage 1 looks almost entirely like bare paper with line work rather than an early wash stage. In Stage 2 (`light/b1`), `_spl9_sml220` (`9 mm` lane planning) left visible horizontal raster stripes across the pale green foundation wash.
5. **Over-Darkened Top-Right Distant Valley (`x: 0.82–1.00, y: 0.00–0.16`, Stages 3–5)**:
   - *Where it went wrong*: In Stages 3–4, `French ultramarine` applied too darkly in the upper-right corner, and Stage 5 added dark ink lines over the distant blue hills, destroying aerial perspective.

---

## Part 2: Comparison with `bench/feedback/FEEDBACK.md` (Where We Agree and Disagree)

### Summary of External Judge Scores (Try 2)
- **Finished Painting**: Composite **6.62 / 10** (`classic measures: 8.25` — `classic value: 6.43`, `classic edge: 8.95`, `classic marks: 9.37`; vision panel — `composition values: 6.67`, `edges detail: 4.67`, `marks texture: 4.33`; `Kimi-K3: 4`, `GLM-5.3-Flash: 5`, `Qwen3.5-9B: 6`).
- **Progression Judge**: Mean **3.2 / 5** (`10%: 4/5`, `25%: 3/5`, `50%: 2/5`, `75%: 2/5`, `100%: 5/5`; early mean `3.5`).
  - *Tells named*: `"the whole sheet at one faint value, as if faded in" (3)`, `"a feature painted before its form" (1)`, `"texture arriving as a dump, everything sharpening at once late" (1)`.
  - *Judge note*: `"The pen underdrawing and first wash read as human, but from 50% onward the whole sheet uniformly darkens and sharpens in place toward the target — a fade reveal rather than a painter finishing regions one by one."`

### Where We Agree with `FEEDBACK.md` (and Root-Cause Diagnosis)
1. **Agree on the 25%–75% "Fade-In" / Late Texture Dump Tell (`5203` Total Strokes Skewing the 10/25/50/75/100% Snapshots)**:
   - Our independent review noted that Stage 1 (`10%`) was almost entirely bare paper with 385 opening lines, Stage 2 (`25%`) was only a faint pale wash across the whole sheet, and Stages 3–5 (`50%`, `75%`, `100%`) darkened across the whole sheet before dumping closing ink at the end.
   - The Render Record in `FEEDBACK.md` reveals the exact quantitative mechanism: the finished run had **5,203 total brush strokes** because un-overridden base-recipe post-passes (`rec2x`, `cpp`, `leaf`, `vio`, `ink4`) appended thousands of late reconciliation, color-pass, leaf-dab, and duplicate closing-ink strokes *after* the main light-to-dark ladder.
   - Because `stages.jpg` samples at **10%, 25%, 50%, 75%, and 100% of total strokes**:
     - **10% (stroke ~520)** was still in the 385 opening lines + very first wash pass.
     - **25% (stroke ~1,300)** was still in the pale `light/b1` wash across the whole canvas — hence the judge's complaint: *"the whole sheet at one faint value, as if faded in"*.
     - **50% (stroke ~2,600) and 75% (stroke ~3,900)** sat inside global middle/reconcile/color passes that darken all regions simultaneously rather than building distinct regional focal masses.
     - **100% (stroke 5,203)** dumped both `closing-lines.json` and `_ink4` lines plus late leaf dabs right at the end — hence *"texture arriving as a dump, everything sharpening at once late"*.
2. **Agree on Low `edges detail` (4.67) and `marks texture` (4.33) in the Vision Panel**:
   - While algorithmic `classic edge` (8.95) and `classic marks` (9.37) scored very high, the vision judges penalized `edges detail` and `marks texture`. This matches our own diagnosis:
     - Our ink generator traced topological value-contour loops around soft green tree canopies and distant blue hills (`opening-lines.json` + `closing-lines.json` + `_ink4`), which looks synthetic/contour-mapped rather than authentic architectural urban-sketch pen work.
     - `_spl9_sml220` (`9 mm` lane planning) created subtle horizontal scanline striping in the pale washes and uniform medium-sized dabs in the middle foliage, while late post-passes (`rec2x`, `cpp`, `leaf`, `vio`) muddied the sunlit foreground tree crown and lower-right house facade.
3. **Agree on `classic value` (6.43) Room for Improvement**:
   - Matches our observation that the foreground lower-left tree crown (`x: 0.08–0.33, y: 0.55–0.98`) and sunlit olive canopies became too dark/dull compared to the bright yellow-green target, while the right-side tower and lower house roofs (`x: 0.76–0.96, y: 0.33–0.58`) lacked warm terracotta density and the top-right distant valley (`x: 0.82–1.00, y: 0.00–0.16`) was too dark.

### Where We Disagree with `FEEDBACK.md`
1. **Disagree that the 50%–75% Progression is a "Filter/Wipe Reveal" (`2/5` is Harsh)**:
   - Watercolor is inherently a transparent medium painted light-to-dark across the sheet (glazing midtones and darks over dried lighter washes after the paper dries), not an opaque oil painting finished corner-by-corner. Scoring 50% and 75% at `2/5` over-penalizes legitimate light-to-dark watercolour layering.
   - *However*, we can directly address what triggered the judge's perception by:
     1. **Cutting the stroke-bloating late global post-passes** (`_norec` to replace `rec2x`, `_nocpp` to replace `cpp`, `_noleaf` to replace `leaf`, `_novio` to replace `vio`, `_notp` to replace `tp2`/`tp1`) and keeping opening line count lean (~120–160 structural architectural/trunk lines instead of 385 contour loops) so that:
        - At **10% of strokes**, the opening architectural sketch AND a substantial portion of the warm foundation washes are already on the sheet.
        - At **25% of strokes**, the foundation washes (`light/b1`) are complete and early regional midtones (`mid/b2L0`) are underway.
        - At **50% and 75% of strokes**, specific regional families (`village_walls_and_roofs`, `sunlit_crown_greens`, `cypress_and_eave_darks`, `shaded_hillside_foliage`) step through distinct regional midtone and shadow passes rather than sitting in global `reconcile`/`colorpass` overpainting.
     2. **Differentiating regional styles/progression** so that not every region is painted with the exact same global stroke density at the exact same time, while keeping all washes free of unsupported straight seams.
2. **Disagree with `Kimi-K3`'s `4/10` Finished Score**:
   - The finished painting achieved `8.25` on classic measures (`8.95` edge, `9.37` marks) and `5/5` on the 100% stage progression check. `4/10` is an outlier low score from a noisy vision judge, though improving clean architectural pen work, sunlit yellow-green foliage chroma, and crisp building/roof planes will raise both the vision panel (`edges detail`, `marks texture`, `composition values`) and `classic value`.

