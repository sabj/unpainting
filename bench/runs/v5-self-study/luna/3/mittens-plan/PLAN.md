# Mittens portrait sketch — V5 try 3

## Reference and value read

The 300 × 259 reference is a loose, line-led watercolor on white paper. A cropped ginger-and-white cat fills the left side; a pale face and dark charcoal curls sit to the right. The background is unpainted. At thumbnail size I read four values: bare paper and near-white planes; pale ochre and warm skin wash; middle ginger markings, charcoal hair and facial turns; then a few dark eye, nose and mouth accents. The focal points are the four eyes. The central white muzzle, forehead and gap between the subjects remain open.

## Scale, lights and drawing

The 1200 × 1036 sheet is 234.107 mm wide, so one output cell is 0.195 mm and one target pixel spans about four cells (0.78 mm). A one-pixel whisker or eyelid is below a useful brush body; it is ink-and-wash. The 3–4 pixel eyes are 12–16 cells across, so their value planes can be painted, with the narrow lids and glints left to drawing and reserves. The broad cat markings, face planes and hair mass are wash questions.

The four eye glints are protected as small bare-paper reserves, now about 1.5 target pixels across instead of the oversized squares in try 2. The cat's blaze and muzzle, the person's forehead and lit cheek, and the sheet itself rely on the painter's near-paper preservation, not rectangular reserves. This avoids introducing block-shaped cutouts in broad white forms.

The opening drawing uses a light sepia ink load: four broken outer gestures plus the principal cat and human eye, nose and mouth landmarks. It establishes likeness without tracing every edge. The closing drawing is limited to seven selected cat-whisker and lower-face accents on dry paint; the opening already carries the main landmarks. Ink stays out of the white planes and never fills a dark mass. The 1.5 mm opening-line threshold admits the short eye and nose marks; pressure is 0.24. Line widths are expressed in target-pixel units: 0.4–0.6 px is about 0.31–0.47 mm, or 1.6–2.4 output cells.

## Region technique and order

| Region | Resolution and reference cue | Technique, paper state and load | Edges, lights and failure signs |
|---|---|---|---|
| Paper, white fur and lit skin | Wash question: these are broad value planes, not separate details. | Leave the sheet bare. Let automatic near-paper preservation hold the cat's blaze and muzzle and the face's forehead and lit cheek. | No global background wash. Failure is a veil over the sheet or filled white planes. |
| Cat head and shoulder | Wash for the broad warm markings; ink-and-wash for whiskers and the shortest fur accents. | Begin with a connected pale ochre/raw-sienna wash, watery to medium, wet on dry. Check the paper across the footprint and its neighbors before each stroke; let it dry fully. Add grouped ginger planes on dry paper with a medium load, preserving the blaze. Add only a few darker markings after those planes dry. | Mark boundaries follow the cheek, brow and ear shapes; leave one cheek turn softer and break the crop into paper. Failure is a field of equal orange flecks, a dark outline, or a muzzle that loses its paper shape. |
| Human hair | Wash for the connected mass; ink-and-wash for a few fine curl edges. | Lay pale cool grey-violet/sepia on dry paper as one loose mass. After it dries, build connected mid-dark curl groups on dry paper with medium load, varying their contact and retaining paper flecks. The limited cool palette mixes ultramarine and sepia rather than filling the hair with ink. | Keep the forehead edge legible and the outside edge irregular, not scalloped all around. Failure is a chain of separate round stamps, polygonal holes or a flat black cutout. |
| Human face | Wash for the forehead and cheek planes; ink-and-wash for eye rims, nostrils and mouth corners. | Use one very light warm wash on dry paper, with the eye openings barely tinted. Dry. Build brows, sockets and nose/cheek turns as small connected middle planes on dry paper. Dry again before a restrained shadow glaze on the shaded cheek and jaw. Keep the face dry while the adjacent hair mass is painted. | Hard edges belong under brows and at the nostrils; soften only a chosen cheek turn with clean water while that passage remains in a measured state that supports softening. Failure is blurred eyes, outlined cheek planes or a mouth submerged in one dark patch. |
| Eyes, nose, mouth and whiskers | Ink-and-wash: the eyelid and whisker lines are about one target pixel or four output cells wide. | Use the opening landmarks lightly, paint the iris and socket values on dry paper, then finish with selective closing sepia lines on dry paint. Keep the lower lids lighter than the upper lids. | Keep all four glints open and sclera pale, not paper-white. Failure is square glints, heavy full eye outlines, spurs or uniform whisker strokes. |

For every passage the executor checks measured paper state over the planned footprint and neighboring area before the stroke. Pale washes use a watery or medium load on dry paper; shaped middle planes use a controlled medium load on dry paper; detail lines use a fine, tapering load on dry paint. If the measured state is too wet for a crisp edge or too dry for the intended soft turn, the executor waits or chooses another passage. I do not assume a moisture reading.

The default light-to-dark order applies. No wet-in-wet break is needed: the sheet is mostly white, the eye details need dry edges, and the hair is a connected but separate dark form. I do not run a single shadow glaze across cat, hair and face because the reference keeps those forms distinct. The face shadow glaze crosses the cheek and jaw planes only; the cat's markings stay inside the cat.

## Changes after try 2

My pre-feedback review scored try 2 at 4.5/10 finished and 2.5/5 for process. I agree with the judges that the early sheet stays at one faint level, the middle progress stages are too similar, the edges become scalloped, and the closing drawing causes a large sudden sharpening. I disagree that one subject arrives finished while the other is untouched: both develop in parallel. I also do not think the whole run is literally a filter; actual marks accumulate, although the faint global start and the late line dump make it look that way. The judges' overall 3/10 is harsher than my own score, but their process diagnosis is persuasive.

I moved the key eye, nose and mouth marks into the opening drawing, while keeping whiskers and secondary contours for the close. The closing path set is smaller, and `_ink3` limits the requested drawing share. I removed `_efade`: the reference has broken edges, but the explicit 1.2 mm fade may have helped produce the scalloped wash boundary. I added a 120-cell minimum shape size to suppress tiny isolated paint fragments, increased mid-plane gain to 1.1, and reduced the middle ladder from four layers to three so the value changes read more clearly between stops. I retained the connected-domain setting, light-to-dark order, cool and warm pigments, and the near-paper behavior because those choices support the target. I reduced each glint reserve from about four target pixels to about 1.5 pixels to avoid the square highlights in try 2.

At the opening stop, the resolved passage list showed the broad first-pigment passages assigned dry-brush strokes. Before any wash was laid, I switched to `region_w15`, which selects a brush per passage, to give broad value shapes larger brushes while retaining finer choices for detail passages. This changes brush selection; the planned moves remain wet on dry or dry on dry as stated above and depend on the measured paper state. After seeing the dark band at pass 26, I reduced the still-unpainted closing drawing to seven whisker and lower-face paths; the opening already carries the key landmarks, and the smaller ending should avoid another abrupt sharpening burst.

## Checkpoint intents and failure checks

- **Opening:** broken silhouette gestures and recognizable eye/nose/mouth landmarks, in a light sepia line; no dense fur hatch.
- **First pale wash:** cat and skin planes emerge while white paper still dominates; the background and eye glints remain open.
- **Middle values:** tabby markings, face turns and a connected cool hair mass become visible, with fewer small isolated marks than try 2.
- **Last paint values:** the darkest curl valleys and facial accents strengthen without changing the whole sheet at once.
- **Closing:** seven restrained whisker and lower-face accents complete the sketch; the final drawing should refine an already legible painting rather than supply all its detail.

At each stop I will inspect value shapes first, then lights, landmarks, edge quality and mark character. I will revise only unpainted passages if a broad plane breaks into disconnected flecks, a reserve reads as a square, the eyes blur, or a large region remains uniformly faint through successive middle values.
