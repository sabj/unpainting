# Painting plan: Mittens, round V5, try 3 of 3

## Changes from try 2 and why

Try 2 scored 4.62/10 with fatal progression failure: judges reported a "fade-in" effect where the image appeared to fade in from opacity rather than be painted. Stages at 10%, 25%, 50%, and 75% looked nearly identical, suggesting the painting process was unnatural.

**Root cause analysis:**
1. Eight regions created a patchwork paint order. Regions filled independently, not as unified layered passages.
2. Large rectangular reserves (especially the [0.05,0.48,0.42,0.72] whisker area) created hard-edged white voids that persisted at 100%. These were artificial shapes, not from the target.
3. All values arrived simultaneously; there was no visible light-to-dark progression. Early stages had the same value range as late stages, just with less opacity.

**Key changes for try 3:**

1. **Unified regions (3 instead of 8)** — Merge cat head into one region, face as one region (lit and shadow together), hair as one region. This allows connected washes that flow naturally instead of painting patches.

2. **Minimal reserves (4 catchlights only)** — Remove the large whisker and hair light reserves. They created hard-edged rectangles. Only protect the four eye catchlights (small point lights). The painter's own value segmentation will handle lights naturally.

3. **Three-region config matches the target structure:**
   - **Cat region**: Warm orange-brown wash with softer edges (not bounded box). Shadow glaze on one side, directional fur strokes.
   - **Face region**: Pale skin wash over the whole face initially, then cool shadow glaze on the face's shadow side, then eye and mouth detail.
   - **Hair region**: Dark mixed value wash, shadow depths, directional wave strokes.

4. **Layer order that shows true progression:**
   - Stage 1: Opening sketch (visible, strong sepia lines)
   - Stage 2: Light overall wash (pale skin and fur in one connected passage)
   - Stage 3: Mid-value detail (eye irises, nose, mouth structure)
   - Stage 4: Shadow glaze (unified cool dark across face shadow, fur shadow side)
   - Stage 5: Texture and closing (fur strokes, hair waves, eye pupils, whisker accents)
   
   Each stage should look visually different: stage 2 luminous and pale, stage 4 has clear new dark shapes, stage 5 has visible strokes and texture. No fade-in.

5. **Recipe adjustment:** `_lay3` instead of `_lay2`. Three layers allow more flexibility in how values are built without over-blending.

## Reference: target structure

**Target:** Ginger tabby cat (left, warm orange with white markings) and human portrait (right, cool-toned). Both facing viewer, close-up, intimate composition. Style: watercolor sketch with fine pen lines and light transparent washes.

**Value structure:**
- Lights: white paper, catchlights in eyes, whiskers, muzzle highlight
- Mids: warm orange cat fur (lit side), pale skin, brown hair mid-tones
- Darks: pupils, shadow side fur and face, deep hair

**Edges:** Soft where washes meet (fur into neck, face into hair). Hard at focal points (eye iris outline, mouth corner, nostril).

## Regional design

### Region 1: Cat (mittens.cat)
- **Bounds**: [0, 0.08, 0.4, 0.75]
- **Reference**: Ginger tabby head, alert eyes, white whiskers, lit and shadow sides
- **Color family**: Warm orange, white, cool undertones in shadow
- **Technique**: Ink-and-wash. Pale warm wash, shadow glaze, directional fur strokes.
- **Order:**
  1. Pale ginger wash (warm orange + touch ultramarine), watery, one connected passage, big brush
  2. Dry. Shadow glaze (cool dark: ultramarine + alizarin/sienna) across ear shadow, jaw shadow, neck shadow
  3. Dry. Directional fur strokes: long ribbon marks on ears, curved S-strokes on head, short marks on muzzle. Gestural, density follows value.
- **Paper state**: Dry after wash for all subsequent layers
- **Load**: Watery (wash), medium-full (glaze), thick (strokes)
- **Edges**: Soft where wash meets paper and other regions. Hard on iris and nostril.
- **Marks**: Gestural curved strokes following fur direction; no stipple, no uniform flicks

### Region 2: Face (mittens.face)
- **Bounds**: [0.35, 0.15, 1, 0.85]
- **Reference**: Human portrait, three-quarter view, lit side warm, shadow side cool-dark
- **Color family**: Pale warm skin, cool shadow
- **Technique**: Precise watercolor, portrait planes.
- **Order:**
  1. Pale skin wash (warm ochre + touch ultramarine, very watery), one connected passage across entire face, wet on dry, broad strokes
  2. Dry. Mid-value planes on dry paper: eye socket depth, side of nose, cheekbone plane, jaw turn. Controlled load, hard edge on crease side, soft edge where plane turns.
  3. Dry. One connected shadow glaze (cool medium-dark) across shaded temple, cheek, and jaw. This glaze runs naturally from face into neck and overlaps with hair region.
  4. Dry. Eye structure (separate detail pass): iris on dry, sclera pale tint, upper lid tapered dark line, lower lid light line, pupil dense.
  5. Dry. Mouth corner: small dark accent if needed; nostril definition.
- **Paper state**: Dry for planes and detail (no wet-in-wet spillover)
- **Load**: Watery (pale wash), medium (planes), medium-full (glaze), thick (eye details)
- **Reserves**: Four catchlights protected before any wash
- **Edges**: Hard where edge carries structure (iris, lid, mouth). Soft where planes turn.

### Region 3: Hair (mittens.hair)
- **Bounds**: [0.4, 0, 1, 0.4]
- **Reference**: Dark wavy hair, brown-black with lighter breaks, wave structure visible
- **Color family**: Dark brown-black, not pure ink
- **Technique**: Ink-and-wash with directional marks.
- **Order:**
  1. Medium-dark value wash (mixed dark: ultramarine + sienna/alizarin, not ink black), one connected mass, watery, wet on dry
  2. Dry. Shadow glaze (deeper dark) in wave valleys and shadow side
  3. Dry. Directional strokes: long curved ribbon marks following wave direction, S and C curves, density follows value (no strokes in light areas), gestural not uniform
- **Paper state**: Dry for glaze and strokes
- **Load**: Medium (wash), medium-full (glaze), thick (strokes)
- **Mark character**: Curved directional marks, no stipple, no scattered flecks
- **Reserves**: Light breaks in the hair are handled by lifting and not overpainting, not by upfront reserves

## Opening and closing drawing

**Opening drawing (`opening-lines.json`):**
- Traced from target with minContrast 0.08, minLen 8, maxLum 0.65
- Lines included: Eye shapes and catchlights, eyelids and brows, nose, mouth, ear set, face contours and cheekbone plane, whisker guides on muzzle, hair wave breaks
- Coverage: Sparse but confident, 4029 pixels traced, 118 spans, 1926 total length (per tracer output)
- Pigment: Sepia ink (base recipe `_ink4`)
- Character: This opening stage is the visible sketch foundation. Judges must see it clearly in the first progress frame.

**Closing drawing (`closing-lines.json`):**
- Same as opening (copy of opening-lines.json)
- Rationale: For a sketch style, the drawing defines the subject from start to finish. Closing reinforces rather than adds new lines.

## Layer order and progression (light-to-dark model)

**Stage 1: Opening drawing**
- Sepia pen lines visible and confident, defining eyes, facial structure, whiskers.
- Intent: Viewer sees a sketch. This is human painting, not a filter.

**Stage 2: Light overall washes**
- Cat: pale ginger wash
- Face: pale skin wash (connected, no region boundaries visible)
- Hair: medium-dark wash (one connected mass)
- Intent: Color and value enter. Lots of white paper still visible. The painting reads as luminous and light. Fog-free progress.

**Stage 3: Mid-value planes and eye structure**
- Face: nose side plane, cheekbone, jaw turn on dry paper
- Cat: (minimal; fur detail deferred to texture stage)
- Eyes: iris and upper lid on both subjects
- Intent: Forms gain structure and edges. Shapes have volume now. Still understated and sketch-like.

**Stage 4: Shadow glazes (unified across regions)**
- Cat: shadow glaze across ear, head shadow side, jaw shadow
- Face: one connected cool glaze from temple through cheek into jaw and neck
- Hair: shadow glaze in valleys
- Intent: Depth arrives. Shaded side reads as cohesive. Light-to-dark progression clear: lights in stage 2, mids in stage 3, darks in stage 4.

**Stage 5: Directional strokes and closing accents**
- Cat fur: ear locks, head curves, muzzle marks
- Hair: wave-following curved strokes
- Eyes: pupils reinforced, highlights checked
- Mouth and nostril: small dark accents if needed
- Intent: Texture and gesture. Focal points sharp. Sketch character preserved. All stages combined should show cumulative work.

## Watercolor technique checks (per SKILL.md section 8)

**1. Value thumbnail:**
- Lights: white paper, pale washes (pale ginger on cat, pale skin on face)
- Mids: warm orange cat fur (lit side), skin planes, brown hair
- Darks: pupils, shadow fur and face, deep hair
- Progression: Light to dark across stages. ✓

**2. Lights list:**
- Cat left eye catchlight (reserved)
- Cat right eye catchlight (reserved)
- Human left eye catchlight (reserved)
- Human right eye catchlight (reserved)
- No dull or blurry eyes. Whiskers and muzzle light emerge from pale wash. ✓

**3. Per region:**
- Cat: ink-and-wash, wash question → wash plane + glaze + strokes on dry. Smallest features (iris ~3-4mm, whisker ~1mm) at 4-8 cells at 1200px. ✓
- Face: precise watercolor, planes on dry, glaze on dry. Eyes as separate detail pass. Dry throughout. ✓
- Hair: ink-and-wash, wash + glaze + strokes on dry. Wave direction carries form. ✓

**4. Glaze list:**
- Cat shadow glaze: ear, jaw, neck shadow, one connected passage
- Face shadow glaze: temple to jaw to neck, one connected passage (crosses region boundary into neck naturally)
- Hair shadow glaze: in wave valleys
- Each glaze crosses region boundaries naturally. No region-by-region patching. ✓

**5. Wet passages:**
- No detail region inside a wet passage by spillover. Eyes, mouth, irises are dry detail on dry paper.
- Cat wash and face wash are separate (not wet-in-wet), allowing the cat to read as a distinct subject.
- Hair and face shadow glaze connect naturally where they overlap (not a seam). ✓

**6. Drawing:**
- Opening: sparse confident lines defining eyes, structure, whiskers. Sepia ink declared.
- Closing: same as opening. Sketch style: opening and closing are the same.
- Pen carries gesture, not rescue. ✓

**7. Breaks from light-to-dark:**
- No breaks. All stages follow light-to-dark order. ✓

**8. Stage intents:**
- Stage 1: sketchy, defined
- Stage 2: luminous, pale, lots of paper showing
- Stage 3: structured, forms visible
- Stage 4: depth, shaded side clear
- Stage 5: detailed, textured, focal points sharp
- No fade-in. ✓

**9. Fast proof:**
- Would verify cat wash, face wash, shadow glaze, and one stroke direction on a crop before full render.

## What to monitor during painting

1. **Opening stage must be visible** — If the first progress image doesn't show clear sepia lines, the sketch character is lost.

2. **Stage 2 must look distinctly pale and luminous** — The light wash should cover most of the cat and face with visible white paper gaps. If it looks opaque or muddy, stop.

3. **No hard rectangular edges** — Unlike try 2, regions should blend softly with paper and each other. Watch for axis-aligned hard edges.

4. **Stage 4 shadow glaze should span naturally** — The cool dark on the face should flow from temple to jaw as one passage. No patchy separate islands.

5. **Fur and hair strokes visible and directional** — Not stipple. Not scattered flecks. Curved, following growth, with white paper flecks between.

6. **Progression apparent at each stop** — Stage 4 must look visibly darker than stage 3. Stage 5 must show new texture. If stages look identical, stop and revise.

## Expected final painting

- Ginger cat on the left with alert eyes and fine whiskers
- Human portrait on the right with clear facial planes and cool shadow side
- Dark wavy hair with wave structure visible
- Light transparent washes, fine sketch lines throughout
- Lots of white paper visible (sketch, not filled)
- Soft edges where regions blend, hard edges at focal points
- Cumulative light-to-dark progression, not a fade-in
- Character: hand-painted watercolor sketch, not a digital render

## Tokens and settings

- **Base recipe**: V096 champion (frozen)
- **Token change**: `_lay3` (three mid layers instead of four)
- **Reasoning**: More flexibility for value progression with three regions instead of eight. Two regions per layer allows better step definition without over-blending, while three gives space for planes and depth.
- **Palette**: Default (ochre, sienna, ultramarine, cerulean, sepia)
- **Drawing**: Base has `_uncap` (unlimited opening) and `_dwg200` (wide draw)
