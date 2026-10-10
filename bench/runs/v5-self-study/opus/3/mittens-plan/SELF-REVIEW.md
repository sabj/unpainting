# Mittens V5 try 2: self-review (written before reading FEEDBACK.md)

Looked at: `bench/feedback/compare.png`, `previous-painting.png` (crops of the cat's head and the man's face beside the
target at the same scale), `stages.jpg`, `previous-plan/` and `previous-checkpoints.jsonl`.
Try 2 files: `region_w13_lay2_sep4_dk16` then `_dk20` from pass 32; `--paints rawsienna,sienna,ochre,sepia,ultramarine,paynes
--paperdelta 30`; 18 of 24 opening gestures drawn; 42 closing pieces.

## What works

- **White paper is back.** Background, the man's forehead and nose bridge, the cat's muzzle and much of the chest are bare
  paper. This was the main fault of try 1 and `--paperdelta 30` fixed it.
- **Landmarks and composition.** Both cat eyes, the nose and mouth, both ears; the man's brows, eyes, nose, mouth line and
  hairline sit where the target has them. Both gazes read.
- **Hair.** A blue-grey/mauve mass with paper flecks and a broken silhouette, darkest along the hairline. Right hue
  family and close in value. It is the best passage again.
- **Brows and the man's eyes** are firm and dark, on dry paper, without blur.

## What is wrong

1. **Posterised, hard-rimmed islands everywhere (the biggest fault now).** The cat, the cheeks, the jaw and the stubble
   are built from nested flat patches, each with a darker rim. It reads as a colour-separated print, not as "light
   washes". The target's washes are soft-edged, graded, and fade into paper with lost edges; mine have hard edges on
   every side of every patch. Visible from the 10% frame on.
2. **The cat is brown, not orange.** The target's patches are a clean warm orange (burnt sienna/raw sienna with a lot of
   paper showing through). Mine are a muddy brown, because sepia and ultramarine share every warm band, and the cat's
   irises are brown instead of pale green-yellow. The near eye has a thick dark-brown wedge above it.
3. **Too few fine lines.** The requested style is "fine lines and light washes", and the target has many fine graphite
   lines: whiskers (the most visible line work in the picture), ear contours, the cat's back contour, hair wisps, the
   man's jaw. In mine the whiskers show only as white negative gaps in the brown, and the drawn lines that do show are
   wrong ones: a dashed dark line down the man's left cheek against the cat and a long thin line down his right jaw.
4. **Catchlights are pasted-on square pixels.** 1.1 mm square reserves in pure white read as digital squares, worst in the
   man's eyes. The target's catchlights are small and soft, or carried by a pale iris.
5. **The lower face is blotchy.** Stubble and the shadow under the nose are dark separate blobs; the smile is a thin line
   lost among them. The target has a pale, broken grey-brown stubble with the lips readable.
6. **Heavy warm masses on the right of the cat.** The fur strip behind the man's cheek and the cat's shoulder are one dark
   brown block, heavier than the target's mid sienna with paper flecks.
7. The hair's holes are rimmed rings (each paper fleck has a darker edge), which makes it look stamped rather than broken
   by a dry brush.

## Where it went wrong

- **Plan level (the cause of 1, 2, 6):** `_lay2` with the full six-pigment palette meant every value band was mixed from
  all pigments, so the warm cat got sepia and blue in every pass; and each band painted the painter's own segmentation
  cells as separate flat fills, which dry with edge darkening. Nothing in the plan softened edges.
- **Opening drawing (3):** 6 of 24 gestures were dropped by the protected-light filter (eyes, nose); the whiskers were
  never in the opening; the cheek contour was kept and later reinforced.
- **Light band (pass 1-7):** the band was a greyish neutral, not warm, and every patch already had its final hard
  outline; the later passes nested inside these outlines.
- **Value-5 revision to `_dk20` at pass 32 and the touch-up rounds (about 4000 of 5009 strokes):** these deepened the
  hair as wanted but also the cat's shoulder strip and the stubble blobs.
- **Reserves (4):** the square catchlights were my choice.

## Scores

- Finished painting: **4.5 / 10.** Better than try 1 (paper, catchlights smaller, no black lineart), but still a
  posterised patchwork in brown rather than a light, fine-lined sketch in orange and grey.
- Process plausibility: **2.5 / 5.** The order is a painter's order (drawing, light band, mids, hair darks late), but
  the 10% frame already shows the whole final patch map at one pale value, and the later frames fill the same map
  darker: that is how a print is built up, not how a person paints.

---

## After reading FEEDBACK.md: agreement and disagreement

Judges (try 2): vision overall 4.0 and 4.0 (GLM, Qwen; Kimi failed on a spend cap, so no composite); composition/values
6 and 6, edges/detail 4 and 3, marks/texture 3 and 2; classic value 6.58, edge 8.35, marks 6.63. Progress judge 1.5,
2.5, 3.5, 3.5, 5.0 (mean 3.2; 10% and 25% mean 2.0); 0 of 2 found the order of work human. Tells: "a region arriving
finished while its neighbour is untouched" (5), "flat evenly-toned slabs" (3), "whole sheet at one faint value" (2),
"fine detail already present in the first 25%" (2).

My 4.5/10 sits close to the panel's 4.0. My process 2.5/5 is below their 3.2 mean, because I discount the 100% frame.

Agree:
- **Marks/texture is the weakest (2-3).** Same as my fault 1: posterised, rimmed islands are not light washes.
- **Edges/detail 3-4.** Hard rims on every patch, square catchlights, blotchy stubble. The eyes and brows themselves were
  firm.
- **"Arrives nearly formed at 10%" and "fine detail in the first 25%".** I agree, and the cause is in the stroke count:
  the two touch-up rounds made about 4000 of the 5009 strokes and came last. The 10% frame (stroke 500) was already
  past the light band and into the mids, with the full patch map laid. This is the main change for try 3 (`_tp0`).
- **"Flat evenly-toned slabs".** Agree: each touch-up glaze is one flat single-pigment layer over a whole planning
  shape.
- **"Speckled hair filling in late".** Partly. The hair does get its weight in the shadow band (ink-and-wash weights put
  58% there). Late darks are what a painter does. Speckle is a fair point for the 25-50% frames.

Disagree or discount:
- **100% at 5.0.** Same surface as the 75% frame (3.5). Noise, plus a finished picture looking like a painting.
- **"The cat fully formed while the man is a fading blob" as an order fault.** Both subjects get their light band in
  the same passes; the cat only reads further along because its sienna is saturated and the skin is near paper. I will
  not reorder by region. A visible opening drawing over both subjects should answer "line-then-wash".
- **Classic edge 8.35 and marks 6.63.** Pixel metrics that reward the hard patchwork. I accept a drop if the washes
  soften.
- **"Dark before light" (named once).** Not what the log shows: the hair darks came last. One mention, so I treat it as
  noise.
