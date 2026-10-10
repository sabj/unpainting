# Self-review of try 1 (written BEFORE reading bench/feedback/FEEDBACK.md)

Looked at: `bench/targets/sargent-crop.png`, `bench/feedback/previous-painting.png`, `bench/feedback/stages.jpg`, and my
own previous plan files. Not yet opened: `FEEDBACK.md`.

## What works
- The big value layout is right: one blue hull in the middle, bare cream paper across the whole right half above the
  horizon, an orange-brown mast on the right, a sandy/orange anchor lower left, a dark waterline/foot at the bottom.
- Palette is close: greyed cerulean/ultramarine on the hull, burnt-sienna orange on the masts, turquoise at the sea
  bottom right. No ink, as asked. The paper on the right really stays paper (vignette into white).
- The dark blue arc on the hull's left edge echoes the target's darker saturated rim.
- Progress frames go light to dark in a believable order: 10% pale grey ground, 25% hull and sea planes, 50-75% rim,
  mast, darks, 100% accents. Nothing is painted back lighter.

## What is wrong
1. **Three hard white rectangles** (one on the hull near the mooring blob, one on the lower hull, one on the right
   mast/sea). They are my three rectangular reserves and they read as stuck-on white labels, not as paper swishes. The
   target's lights are curved, raggedy swishes, not boxes. This is the most obviously fake thing in the picture, and
   it was visible from the first progress frame on. Wrong decision at **planning** (reserves).
2. **A pale horizontal band with straight edges** across the lower hull (y about 0.62-0.78, x 0.2-0.65), with diagonal
   facets: a seam that no edge in the target supports. It splits the hull in two. Came in at the **mid-value / 25-50%**
   stage, from how the painter segmented the hull and my family bounds (hull family ends at y 0.95, foot at 0.6, a hard
   rectangular split).
3. **The hull is not one wash.** Instead of a luminous blue plane with white swishes I got a patchwork of grey
   islands and blue islands with dark rims around each (posterised, cut-out look). The upper-left hull (x 0.25-0.45,
   y 0.15-0.6) is blotchy grey and muddy, losing the clean blue. The target's hull is a smooth, transparent blue with
   a few darker arcs. Went wrong at the **first washes** (too many value classes, `_lay2` did not reduce the islands) and
   was never corrected: I made no looks and no revisions last time.
4. **Right half is cluttered.** Grey shards and dark fragments sit on what should be near-empty paper (the pale blue
   rigging strokes became many small grey fragments). The bollard (top right) is a grey blob with a brown centre rather
   than a dark disc with a ring. The right mast is too thick, too uniform and too saturated; the target's mast is thin,
   broken, with dotted marks.
5. **Edges all look the same**: every shape has the same thin dark outline halo. Sargent's picture has wet soft blues
   next to a few crisp dark accents. Nothing is soft, nothing is lost.
6. **Small accents are wrong in place**: the black mooring blob is greyish-brown and sits right, but the two orange
   dots below it are tiny; the dark foot is one big black smear rather than a few broken horizontal strokes.
7. The sea at lower right is patchy and washed out; the target has a clearer turquoise band under a crisp horizon line.

## Where it went wrong, by stage
- Planning: rectangular reserves, hand-drawn family rectangles that cut the hull at y 0.6.
- First wash (10-25%): over-segmented hull; seam band appears.
- 50-75%: dark rims pile up around each island, "poster" look is locked in.
- 100%: darks fine, but nothing fixes the white boxes. Not checked by me at all (no looks).

## My scores
- Finished painting: **4 / 10**. Layout and palette are right; the boxes, the seam, and the posterised patchwork
  would stop a human from calling it a Sargent watercolour.
- Plausibility of painting process: **3 / 5**. Light-to-dark order is credible, but the white boxes from frame one,
  hard-edged islands and the straight seam look like a machine, not a person.

---

# After reading bench/feedback/FEEDBACK.md

Judge results for try 1: composite 4.48; vision overall 2.0/10 from all three judges (composition/values 4.3, edges/detail
2.3, marks/texture 1.0); the classic measures were better (value 5.64, edge 8.85, marks 6.42). Progression judge: 1.0 at
10/25/50/75% and 1.5 at 100%; tells named: whole sheet at one faint value as if faded in (5), cut or scalloped wash
edges and round holes (4), flat evenly-toned slabs (4), speckle/dotted trails (1), and "persistent white rectangular mask
holes".

## Where I agree
- **White rectangular holes**: agree completely; they are my own three rectangular reserves (my point 1). The judges and
  I named the same defect independently, and it was in every stage. It is the cheapest and surest fix: no reserves.
- **Faded in at one faint value** (the biggest process tell): agree, and the cause is better explained than I had it.
  The planning log of my try-1 plan says `paper: auto sheet 252/251/248 from the largest bright region 221/215/199`,
  `whites: 0 cells`, `plan covers 99.2% of the sheet, leaving 0.8% as paper`. The painter decided the sheet is brighter
  than the target's own cream paper (the auto rule falls back to white when the bright region does not touch the
  border), so it planned a pale foundation wash over the cream paper too, i.e. over the whole sheet. That is exactly a
  veil that fades in.
- **Round holes / scalloped edges**: agree; I saw white dots with dark rims inside the hull. These are dry hollows inside
  a wash (the painter has `--holefill` / `--holerim` for them, which I did not use).
- **Flat slabs**: agree in part (the hull was a patchwork of flat grey and blue islands).

## Where I disagree or discount
- **Marks/texture 1.0 and edges/detail 2.3** are harsh given that the classic edge measure is 8.85 and my own reading is
  4/10 rather than 2/10. The three vision judges agree with each other (2.0, 2.0, 2.0), which says they see a clear
  problem, not that 2 is the exact score. I treat the exact number as noisy and the direction as reliable.
- **Progression 1.0 at all stages, including 100%**: the judge sees only a strip of five small thumbnails. My own review
  gave 3/5 because the order of work (pale ground, mid values, rim, darks, accents) runs light to dark. I discount the
  absolute level but accept the specific tells above, because I can see them in `stages.jpg` too. I do not accept that
  the order of work itself is non-human; the fault is the uniform veil and the white boxes.
- **Speckle/dotted trails (named once)**: one mention only, and the target itself has dotted orange marks on the mast and
  hull edge, so I change nothing for this.

## A cause neither critique names
The seam across the lower hull is `--groundglaze 1` (base token `_rg10`): it acts on cool-neutral cells below a fixed y
fraction (`groundFrom = .62` in `src/paint/experimental/light-to-dark.mjs`) and so cuts a straight horizontal edge at
y = 0.62. It was not my family rectangles, as I first guessed.
