# Self-Review of Try 1 (Mittens, Round V5)

## Part 1: Independent Review (Before Reading `bench/feedback/FEEDBACK.md`)

### What Works
- **Overall Proportions and Silhouette**: Both the cat (Mittens) and the man are accurately placed, with clean bare-paper background separation and well-preserved large paper whites on the cat's chest bib, upper muzzle, and the man's forehead and nose bridge.
- **Value Anchor in the Man's Hair and Brows**: The dark Payne's-grey and lamp-black washes in the man's curly hair and arched eyebrows establish a strong dark value anchor that balances the composition.
- **General Light-to-Dark Progression**: Across the five progress frames (`stages.jpg`), values build progressively from pale washes in Stage 1 through mid-tones in Stages 2–3 to dark accents in Stages 4–5.

### What Is Wrong
1. **Topographic Contour-Map Ink Lines (`opening-lines.json` / `closingink4-lines.json`)**:
   - The traced ink lines (226 lines) follow luminance iso-contours around soft fur patches, cheek shadows, and hair curls. Instead of looking like a delicate structural sketch (ear edges, eye rims, nostrils, mouth line, whiskers, and loose hair strands), they look like squiggly map boundaries outlining wash islands.
2. **Harsh Rectangular Cutouts from Explicit Eye `reserves`**:
   - In `config.json`, explicit rectangular `reserves` in the cat's eyes (`[0.250, 0.215, 0.269, 0.245]` and `[0.066, 0.234, 0.079, 0.258]`) and the man's left eye (`[0.626, 0.725, 0.638, 0.742]`) punched sharp, axis-aligned white rectangles right through the cat's dark pupil/iris and the man's lower eyelid. Because the painter already preserves near-paper target lights automatically, these rectangular boxes created glaring geometric artifacts.
3. **Muted Ginger / Orange Color on the Cat**:
   - In `target.png`, the cat's forehead stripes, nose bridge, cheek stripes, and left shoulder patch have a warm, saturated ginger/burnt-sienna glow. In Try 1, the cat washes are overly pale, desaturated tan/ochre-brown, losing the warm orange-sienna character of the tabby markings.
4. **Stepped, Posterized Mid-Tones ("Paint-by-Numbers" Islands)**:
   - On the man's cheeks, nose shadow, and chin stubble, as well as the cat's fur transitions, the washes separate into discrete, hard-edged tonal islands (exacerbated by `_lad` and low edge softening) rather than soft, graded watercolor washes.
5. **Cat's Eyes and Whiskers Lack Delicacy**:
   - The cat's left eye is a muddy brown patch broken by a white rectangle; the right eye loses its rounded upper liner and pale green iris ring. The sweeping white whiskers across the cat's right cheek are replaced by dark contour squiggles.

### At Which Stage It Went Wrong
- **Stage 1 (`stages.jpg` frame 1)**: It went wrong immediately at the opening line and first-wash stage. The 226 traced opening ink lines cover the entire sheet with closed topographic contour loops over soft fur and hair, and the initial pale wash fills the whole cat and man silhouette uniformly like a flat stencil.
- **Stages 2–3 (`stages.jpg` frames 2–3)**: Mid-tone washes fill inside those contour loops in stepped, quantized value layers, reinforcing the mechanical "paint-by-numbers" appearance, while the rectangular eye reserves begin to stand out as sharp geometric cutouts.
- **Stages 4–5 (`stages.jpg` frames 4–5)**: Dark passes add needed contrast, but the closing ink (`_ink4`) re-strokes the same squiggly contour boundaries over the cat's fur and man's hair, locking in the contour-map look. No mid-paint revisions (`revisions: 0`) were made to correct course.

### Self-Assigned Scores (Try 1)
- **Finished Painting Score**: **6.2 / 10**
- **Plausibility of Painting Process Score**: **2.5 / 5**

## Part 2: Comparison with External Judges (`bench/feedback/FEEDBACK.md`)

### Summary of External Feedback
- **Finished Painting**: Composite **5.51 / 10** (`classic measures: 7.69` [value 6.86, edge 9.27, marks 6.93]; vision judge scores: `composition values: 5.33`, `edges detail: 3`, `marks texture: 2`).
- **Progression Judge**: Mean **2.2 / 5** (10%: 1, 25%: 2, 50%: 2, 75%: 2, 100%: 4; 10% & 25% mean: 1.5).
  - **Tells reported**: *"the whole sheet at one faint value, as if faded in (4)"*, *"fine detail already present in the first 25% (2)"*, *"texture arriving as a dump, everything sharpening at once late (2)"*, and *"Every panel already contains the complete composition at one uniformly faint value that simply darkens and sharpens toward the end — a global dissolve of a finished image rather than strokes accumulating region by region."*

### Where I Agree with the Judges (and Why)
1. **Low `marks texture` (2) and `edges detail` (3) on the finished painting**:
   - I strongly agree. Our 226 traced iso-contour lines (`opening-lines.json` and `closingink4-lines.json`) outlined wash blobs like a topographic map rather than structural features, and using `precise-watercolor` on every region with `_lad` produced hard-edged, posterized tonal islands. In addition, the rectangular `reserves` on the eyes created unnatural white geometric blocks right across the cat's pupils and the man's eye.
2. **"Fine detail already present in the first 25%" and "the whole sheet at one faint value, as if faded in" (10% score: 1/5, 25% score: 2/5)**:
   - I strongly agree with this diagnosis of the early stages (`stages.jpg` frames 1 and 2). Look at `previous-checkpoints.jsonl`:
     - Before pass 1, `opening-lines.json` drew 226 fine contour lines across the entire sheet (both cat and man).
     - By pass 31 (out of 44), only **787 strokes** had been painted, whereas passes 32–44 dumped **3,698 strokes** (82% of all 4,485 strokes!) in late dark/touch-up passes!
     - Because the progress frames are sampled at **10%, 25%, 50%, 75%, and 100% of total strokes** (i.e., ~448, ~1121, ~2242, ~3364, and 4485 strokes), the 10% frame (~448 strokes, around pass 20) already had ALL 226 fine opening lines plus all pale washes across the entire cat and man! That is why at 10% of strokes, the entire sheet was already covered at one faint value with fine detail everywhere!
3. **"Texture arriving as a dump, everything sharpening at once late"**:
   - I agree: because 82% of the stroke count occurred in the final passes (after pass 31, during darks/accents/touchups/re-wetting), the 25%, 50%, and 75% stroke frames all fell inside the late detail/touch-up dump rather than showing the big washes being laid in region by region.

### Where I Disagree with the Judges (and Why)
1. **"A global dissolve of a finished image" (1/5 at 10%) is partially a misreading of watercolor's light-to-dark glazing structure, amplified by stroke-count skew**:
   - The painter genuinely painted light-to-dark washes first, not a filter or alpha-dissolve of a finished image. However, the judge's perception is understandable because (a) our dense 226-line `opening-lines.json` pre-drew every small fur and curl contour across the entire canvas before stroke 1, and (b) late small-brush touch-up passes inflated the total stroke count to 4,485 so that 10% of strokes (stroke 448) fell *after* the entire light wash of both subjects was already complete.
2. **Classic Edge Score (9.27) Overstates Edge Quality**:
   - The classic edge metric gave 9.27 because the traced contour lines aligned tightly with target gradients, even though visually those iso-contour ink lines and rectangular eye cutouts hurt the watercolor aesthetic (as the vision judges rightly penalized with `edges detail: 3`). We should trust our visual inspection and the vision judges on edge quality rather than optimizing for dense iso-contour ink lines.
