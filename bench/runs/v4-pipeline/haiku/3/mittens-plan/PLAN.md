# Mittens Portrait Sketch – V4 Plan

## Value Thumbnail
- Lights: Cat's head (pale cream), person's face (warm peachy-white), eye highlights and white areas
- Mid-tones: Cat's ginger tabby stripes, person's face planes, skin warm ochres
- Focal point: Eyes (both cat and person), with sharp iris detail and strong catchlights
- Dark accents: Hair, shadows on cat face, eye pupils

Light-to-dark progression:
1. Reserve whites (catchlights, face highlights)
2. Pale skin wash on face, light cream on cat
3. Dry, mid-tone planes (face structure, tabby stripes)
4. Dry, shadow glaze on shaded side of face and cat
5. Final ink accents on eyes and features

## Lights List
- Cat's left eye catchlight: reserved, kept white
- Cat's right eye catchlight: reserved, kept white
- Person's eye highlights: reserved white area upper-left in each eye
- Person's face light plane: reserved as pale-painted plane
- Cat's ear tops and head sheen: reserved light area
- White paper showing in lighter strokes throughout

## Per-Region Analysis

### mittens.cat (Left region)
- **Reference cue**: Ginger tabby cat, alert expression, fine whisker lines, warm oranges and creams
- **Resolution question**: Ink-and-wash for fur detail. At this scale (0.195 mm/px on 234mm sheet = 0.259mm/cell), individual fur strokes need dry-brush directional marks over a value wash, with fine ink lines for whiskers
- **Smallest feature**: Whiskers (~2-3 cells), tabby stripes (~4-5 cells)
- **Move sequence**:
  1. Opening graphite/ink: sparse eye detail, nose, whisker suggestion lines only
  2. Pale cream wash (watery, big brush): whole head area on dry paper, leaving reserved lights
  3. Warm mid-tone wash (medium load): ear interior, jaw line, eye sockets on damp paper
  4. Dry. Fine directional dry-brush: tabby stripes following growth direction, short strokes on muzzle
  5. Dry. Closing ink: eye pupils, nostril, mouth corner, whisker emphasis
- **Paper state required**: 
  - Opening lines on dry paper
  - First wash: wet on dry, broad coverage
  - Mid-tones: dry on dry for stripe definition
  - Closing: dry paper for crisp ink lines
- **Water and pigment load**: 
  - Cream wash: watery, light wash (ochre + touch of ultramarine for gray)
  - Mid stripes: medium pigment, controlled for dry-brush effect
  - Closing ink: neutral black sepia for whiskers
- **Edge roles**: Hard edges on ear tips, eyes (iris edge), soft edges where head turns into background
- **Layer count**: 3 main passes (wash, mid-tone, ink)

### mittens.face (Right region)
- **Reference cue**: Young person, warm complexion, strong eye contact, dark wavy/curly hair, calm expression
- **Resolution question**: Wash + glaze for faces. Features like eyes, nose, mouth need precise placement and dry-paper definition; facial structure from layered glazes
- **Smallest feature**: Eye iris (~6-8 cells), mouth line (~5-6 cells)
- **Move sequence**:
  1. Opening graphite: sparse eye outline (iris, lid), nose bridge, mouth shape only – confident single strokes
  2. Pale skin wash (watery, medium brush): whole face and neck area on dry or barely-damp paper, no detail
  3. Dry. Mid-planes on dry paper: eye sockets, cheek shadow, nose side, under-lip shadow with one hard edge, one soft
  4. Dry. Iris detail (dark tint under upper lid), sclera pale, pupils set back
  5. Dry. One shadow glaze: warm ochre-brown across shaded side of face into neck and jaw
  6. Dry. Hair mass wash (darker, loaded): dark brown-black on dry paper, one connected shape
  7. Dry. Hair shadow passes: darker glazes, directional dry-brush strokes for texture
  8. Closing ink: light selective – pupil centers, lid line emphasis, mouth corner
- **Paper state required**:
  - Opening lines on dry paper, confident strokes
  - Skin wash: dry or barely damp for control
  - Mid-planes: dry paper for hard edges at eye sockets and cheekbones
  - Shadow glaze: dry paper (one glazed plane crossing forehead to neck)
  - Hair: dry paper, medium load for body
  - Closing: dry paper for selective ink only
- **Water and pigment load**:
  - Skin wash: watery, light tone (yellow ochre + touch of burnt sienna)
  - Mid-planes: medium pigment (raw sienna, ultramarine for shadows)
  - Shadow glaze: medium-light pigment, warm (burnt sienna + ultramarine)
  - Hair: medium-dark (ultramarine + burnt sienna)
  - Closing ink: sepia or black, very selective
- **Edge roles**: Eyes have hard iris edges, soft sclera edges; nose ridge soft on one side, hard on shadow side; mouth has soft edges except corner definition
- **Layer count**: 5-6 passes (wash, mid-planes, iris, shadow glaze, hair, closing)

## Glaze List
- Shadow glaze across shaded side of face: runs from forehead through cheek into neck and jaw, unifies the three regions
- Hair shadow glaze: across hair mass where curls turn, follows growth direction
- Cat shadow glaze (optional): if the face needs deepening on shadow side

## Wet Passages
- **Connected wet passages**: None – this sketch is kept precise with dry-paper dry-brush
  - Face is washed as one passage but the wash is broad and open
  - Cat head is separate wash, dry from face
- **Dry barriers**: Eyes, mouth, and nose areas kept dry next to all washes to preserve detail
- **Paper state between passages**: Full dry between each major stage – no re-wetting into previous passages

## Drawing
- **Opening paths**: Sparse, confident lines. Eye shapes (cat and person), nose bridge/tip, mouth curves, whisker suggestions on cat. Single strokes, no tight rendering. Should read like a painter's first lines before washing.
- **Closing ink**: Highly selective. Pupil centers, eyelid line emphasis (upper lid ribbon for cat and person), nostril, mouth corner. No under-eye creases. Light touch, letting the painted value do the work.
- **Ink pigment**: Neutral sepia (warm black) for pen lines to stay warm against skin tones

## Technique Breaks
- No break from standard. Light-to-dark layering throughout.
- Dry-paper detail (eyes, mouth, nose) isolated from any wet passages by reserve and paper drying.
- Ink kept light and selective at focal points only.

## Stage Intents

### After opening lines
- Confident eye placement (left and right for both cat and person)
- Nose, mouth, whiskers suggested but not filled in
- Ready for washing without dense linework

### After light washes (cat cream, face skin)
- Cat: pale cream tone showing head mass, ears visible
- Face: warm peachy tone showing face planes, eyes and mouth area defined by reserved white, not yet colored
- Checkpoint: lights are clear, areas to darken are obvious

### After mid-tone passes
- Cat: tabby stripes apparent, eye sockets have dimension, ear interior warmer
- Face: cheekbone and jaw structure visible, eye sockets defined, nose has shadow side
- Checkpoint: value range is clear, focal point (eyes) is precise

### After shadow glaze
- Face: integrated shading on shadow side, no hard boundaries between regions
- Hair: darker, more dimensional
- Cat: face unified by warm shadow side

### After closing ink
- Eyes sharp (pupils, iris edges), lids defined
- Mouth and nose have character
- Whiskers have crisp articulation
- Overall: reads as a watercolor sketch with fine lines and light washes, not detailed rendering

## Config Changes and Decisions

### Region and Reserve Strategy
- **Families**: Empty `[]` to let the painter's own color/value segmentation guide work assignment
  - Why: Rectangular regions with hard boundaries created unsupported axis-aligned seams that the painter refused. The cat and person overlap naturally in the image with no clear vertical dividing line.
- **Reserves**: Four small reserves targeting actual eye catchlights only
  - Cat left and right eye catchlights (0.09-0.135 × 0.12-0.165, 0.15-0.195 × 0.12-0.165)
  - Person left and right eye highlights (0.58-0.62 × 0.16-0.19, 0.67-0.71 × 0.16-0.19)
  - Why: Large reserves (e.g., "face light plane") also created unsupported seams. Kept only the essential highlights under 1-2 mm per side.

### Recipe Tokens
- `lay3` instead of lay4: sketch needs fewer mid-value passes, lighter overall feel
- `ink3` instead of ink4: light closing ink, not heavy (requires closingink-lines.json)
- `sep4` instead of sep8: fewer separation passes, more open feel
- `dk11` instead of dk13: slightly lighter darks to maintain sketch character
- These reduce visual weight while keeping precision for portraiture

## Paper States and Moves Summary
| Stage | Region | Move | Paper State | Load | Width |
|-------|--------|------|-------------|------|-------|
| Opening | Both | pen/graphite | dry | n/a | fine |
| Wash 1 | Cat | wet on dry | dry start, big brush | watery | medium |
| Wash 2 | Face | wet on dry | dry start, medium brush | watery | large |
| Dry | Both | wait | fully dry | – | – |
| Mid 1 | Cat | dry on dry | dry | medium | small |
| Mid 2 | Face | dry on dry | dry | medium | small |
| Dry | Both | wait | fully dry | – | – |
| Iris | Face | dry on dry | dry | medium | small |
| Glaze | Face + Cat | dry on dry | dry | light-medium | medium |
| Dry | Both | wait | fully dry | – | – |
| Hair | Face | dry on dry | dry | medium | medium |
| Closing | Both | pen over dry | dry | light | fine |

## Fast Proof
Before painting: test one eye at 1x scale (300px target) with opening + skin wash + iris + closing ink. Should show: white sclera with pale tint, iris under upper lid edge, dark pupil set back, light arc of catchlight. If blurry or merged, fix wash boundaries or iris placement before full paint.

---
*Plan prepared per watercolor technique reference, light-to-dark model, dry-paper detail isolation, and selective closing ink.*
