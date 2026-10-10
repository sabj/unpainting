# Painting plan: Mittens, round V5, try 2 of 3

## Changes from try 1 and why

The previous attempt scored 4.57/10, with critical failures in marks (1.0) and progression (1.5-2.0). The progression judge reported a fade-in effect: "a single image fading in from low opacity to high opacity, rather than strokes being added progressively." Large white voids remained until the final stage, and the "fine lines and light washes" sketch style was lost.

**Key changes for try 2:**

1. **Stronger opening drawing** — Try 1's traced opening lines were too faint. Traced with lower minContrast (0.10 vs 0.12) and minLen (8 vs 10) to capture more fine line detail, especially whiskers and facial contours. The opening stage must be visibly sketchy.

2. **Subdivided regions** — Try 1 had large monolithic regions (full cat head, full human face) that avoided painting interior areas until late, creating awkward voids. Subdivided into lit and shadow sides to ensure more continuous painting progress.

3. **Simpler recipe (_lay2)** — Four mid layers (_lay4) allowed too much blending and created a diffuse fade. Two layers (_lay2) forces clearer value steps and should read more like a watercolor sketch with decisive layers.

4. **More reserves** — Added reserves for light catch on hair top and protected whisker areas more carefully to ensure fine lines survive the washes.

5. **Target style** — The target is "watercolor portrait sketch, fine lines and light washes." This means:
   - The opening drawing is part of the art, not a hidden guide.
   - Washes are light and transparent (watery, loose).
   - Directional marks (fur, hair, whiskers) are visible sketch-like strokes, not stippled texture.
   - The painting reads like a person's hand-drawn progress, not a reveal filter.

## Reference and composition

- **Subject**: Ginger tabby cat (left, warm orange) and human portrait (right, cool grays). Three-quarter view, close-up.
- **Style**: Watercolor portrait sketch, fine lines and light washes (not heavy washes, not blended smudging).
- **Key lights**: Cat eye catchlights, human eye catchlights, cheekbone highlight, whiskers on muzzle, light catch on hair top.

## Value structure and lights

**Reserved lights (bare paper or pale tint):**
- Cat left eye: bright catchlight in upper iris area
- Cat right eye: bright catchlight in upper iris area
- Human left eye: bright catchlight
- Human right eye: bright catchlight
- Cat muzzle whisker areas: bare paper (white lines on pale wash)
- Cheekbone highlight: pale tint, toned if needed
- Hair top light catch: pale area with light value

**Value progression:**
- Light: white paper, pale washes (cats ears, skin, hair top)
- Mid: ginger fur on lit side, skin planes, brown hair base
- Dark: iris pupils, shadow side of fur and face, deep hair valleys

## Regions and techniques

### Cat head (lit side): mittens.cat-head-lit
- **Bounds**: [0, 0.08, 0.35, 0.65]
- **Technique**: Ink-and-wash. Pale warm ginger wash, shadow glaze across, directional fur strokes last.
- **Moves**:
  1. Pale ginger wash (warm orange + touch ultramarine), watery, big brush, wet on dry
  2. Dry. Shadow glaze: cool dark (maroon + ultramarine) where fur turns away (ear underside, jaw shadow)
  3. Dry. Directional fur strokes: ear locks as ribbon-long marks, head top as curved S-shapes, muzzle area deferred to muzzle region
  4. Paper state: dry for strokes
- **Load**: watery for wash, medium for glaze, thick for strokes
- **Why**: Light-to-dark order; shadow glaze creates depth; directional marks carry sketch character

### Cat head (shadow side): mittens.cat-head-shadow
- **Bounds**: [0.2, 0.1, 0.45, 0.8]
- **Technique**: Ink-and-wash, shadow-dominant region.
- **Moves**:
  1. Mid value wash (darker ginger + cool undertone), connected to lit side
  2. Dry. Shadow glaze: deep cool-dark across shadow side
  3. Directional strokes following fur growth
  4. Paper state: dry throughout
- **Load**: medium for wash, medium-full for glaze, thick for strokes

### Cat eyes: mittens.cat-eyes
- **Bounds**: [0.08, 0.15, 0.32, 0.4]
- **Technique**: Precise watercolor, dry paper (per watercolor-technique section 4, failure 3T).
- **Reserves**: Both catchlights protected before wash.
- **Moves**:
  1. Pale amber eye wash (pale ultramarine + touch sienna), dry paper, avoiding catchlights
  2. Dry. Iris: target-sized disc under upper lid, amber-gold top, cool blue-grey bottom (no blurring)
  3. Dry. Upper lid: tapered dark ribbon, one hard edge on crease
  4. Sclera: pale tint, never bare white
  5. Lower lid: light line
  6. Pupil: dense dark with one highlight (the catchlight reserve)
- **Paper state**: Dry. No wet-in-wet spillover.
- **Why dry**: Eyes carry likeness; soft blurred eyes read as zombie (failure 3T); fine iris needs control

### Cat muzzle: mittens.cat-muzzle
- **Bounds**: [0.1, 0.45, 0.38, 0.7]
- **Technique**: Ink-and-wash with reserved whisker paths.
- **Moves**:
  1. Pale grey-cream wash (very watery: ultramarine + sienna + much water), wet on dry
  2. Dry. Nose: small dark spot with warm undertone
  3. Dry. Whisker strokes: long pen lines crossing the pale muzzle, gestural (not ruled), taper where thin
- **Load**: watery for wash, thick for pen strokes
- **Paper state**: dry for whisker strokes to hold fine weight
- **Reserves**: Whisker paths protected
- **Why**: Pale base keeps muzzle luminous; whiskers as bare paper or pale lines over wash; gestural, not ruled

### Human face (lit): mittens.human-face-lit
- **Bounds**: [0.42, 0.2, 0.88, 0.75]
- **Technique**: Precise watercolor, portrait planes.
- **Moves**:
  1. Pale skin wash (pale warm ochre + touch ultramarine, very watery), wet on dry, connected face area
  2. Dry. Mid planes on dry paper: cheekbone, side of nose, jaw turn. One hard edge, one soft edge per plane.
  3. Tone any too-bright cheekbone highlight with a pale glaze if needed
- **Load**: watery for wash, medium for planes
- **Paper state**: dry for mid-value detail
- **Edges**: Hard edge on crease side, soft where plane turns
- **Reserves**: Cheekbone highlight protected, eyes dry region

### Human face (shadow): mittens.human-face-shadow
- **Bounds**: [0.55, 0.15, 0.98, 0.8]
- **Technique**: Precise watercolor with unified shadow glaze.
- **Moves**:
  1. One connected shadow glaze across shaded side of face (from temple through cheek into jaw and neck), medium-dark value
  2. Dry. No additional layers in this region; shadow glaze carries form
- **Load**: medium-full for glaze
- **Paper state**: dry base
- **Why**: One glaze crossing lit and shadow regions unifies them; region-by-region fills make patchwork (failure documented, watercolor-technique p.8)

### Human eyes: mittens.human-eyes
- **Bounds**: [0.55, 0.25, 0.85, 0.45]
- **Technique**: Precise watercolor, dry detail. Same protocol as cat eyes.
- **Reserves**: Both catchlights protected.
- **Moves**: Pale eye wash, dry. Iris target-sized under upper lid. Upper lid tapered ribbon. Sclera pale tint. Lower lid light line. Pupil dense with one highlight retained.
- **Paper state**: dry

### Hair: mittens.hair
- **Bounds**: [0.48, 0.0, 0.98, 0.36]
- **Technique**: Ink-and-wash, dark mass with wave structure.
- **Moves**:
  1. Medium-dark value wash (dark brown-black: ultramarine + sienna, not ink black), watery, wet on dry, one connected mass
  2. Dry. Shadow glaze: deeper dark in wave valleys and shadow side
  3. Dry. Directional strokes: long ribbon strokes following wave direction, curved S and C shapes, density follows value (none in lights)
  4. Paper state: dry for strokes
- **Load**: medium for wash, medium-full for glaze, thick for strokes
- **Mark character**: Gestural curves, no uniform flicks, no stipple
- **Reserves**: Light catch on top protected

## Drawing strategy

### Opening lines
- **Source**: Traced from target with minContrast 0.10, minLen 8, maxLum 0.65. This captures more fine line detail than try 1.
- **Lines included**: Sparse but confident: eye shapes, lid and brow lines, nose and mouth, ear set, face contours, whisker definition on muzzle.
- **Coverage**: Sketch-like, enough to guide painting but not gridded or over-rendered.
- **Pigment**: Sepia ink (base recipe _ink4).
- **Weight**: Natural trace weights; opening stage must be visibly sketchy.
- **Why this order**: Opening drawing carries part of the art; it reads as a painter's first gestural marks, visible from stage 1.

### Closing lines
- **Use**: Same as opening (copy of opening-lines.json copied to closing-lines.json).
- **Why**: For a sketch style, opening and closing lines are the same; they carry the gesture throughout.
- **Selective reinforcement**: Closing pass may reinforce lines that faded if paint depth allows, but the drawing is the drawing.

## Layer order and progression

**Stage 1: Opening drawing**
- Opening pen lines visible and sketchy. This is the visual foundation; judges must see it in stage 1 image.
- Intent: The painting reads as a sketch from the start.

**Stage 2: First washes (cat fur, muzzle, hair)**
- Cat head lit side: pale ginger wash
- Cat muzzle: pale grey wash
- Hair: medium-dark value wash base
- Intent: Establish color and value hierarchy; light washes, paper showing through; painting still reads as luminous sketch.

**Stage 3: Mid-value detail layers (two passes: _lay2)**
- Cat eye irises, pupils, lids
- Human face: cheekbone, nose, jaw planes
- Human eyes: irises, pupils, lids
- Hair shadows and wave structure
- Intent: Forms gain definition; edges show planes; still understated and sketch-like.

**Stage 4: Shadow glazes (one per region group)**
- Cat fur: shadow glaze across head and ear shadow sides
- Human face: unified shadow glaze from temple to jaw
- Intent: Depth through value; unified shaded side; shadow travels across regions naturally.

**Stage 5: Directional strokes and texture**
- Cat fur: ear locks, head curves, muzzle marks (if room remains)
- Human hair: wave-following strokes, curved, gestural
- Intent: Stroke direction and density carry form; no fill, no uniform noise.

**Stage 6+: Accents and closing ink**
- Eye pupils reinforced if needed
- Mouth corner, nostril definition
- Selective whisker accents on muzzle
- Lid lines if paint edges are clear enough
- Intent: Focal points sharp; line carries structure, not rescue.

## Tokens and settings

- **Base recipe**: V096 champion (frozen)
- **Token change**: `_lay2` (two mid layers instead of four) — simpler, clearer progression
- **Reason**: Four layers allowed diffuse blending; two layers force clearer value steps and should read more like a decisive sketch
- **Palette**: Default (ochre, sienna, ultramarine, cerulean, sepia)
- **Drawing**: `_uncap` already in base (unlimited opening lines); base also has `_dwg200` (increased draw width)

## Failure signs and what to monitor

1. **Fade-in effect returning** — If stages 1-3 look identical, stop and revise. Opening drawing should be visible and strong from stage 1.

2. **White voids returning** — If large unpainted areas persist into stage 4, the regions may be too large. Watch for awkward rectangular gaps.

3. **Soft, blurred eyes** — If iris or pupil blurs, stop and revise. Eyes painted on dry paper with controlled contact. Do not rescue blurred eyes with ink (failure 3T).

4. **Whiskers invisible** — If whisker strokes vanish under the pale wash, they weren't reserved or weren't thick enough. Check opening drawing and stroke load.

5. **Hair texture as stipple** — If hair looks like speckled noise, the strokes are too short or scattered. Hair is curved directional marks, not scattered flecks.

6. **Patchy face** — If shadow glaze appears as separate islands instead of one unified passage, revise to paint it as one connected glaze.

7. **Over-blended overall** — If the painting reads as soft and fuzzy instead of sketchy with some white paper showing, the washes were too wet or too many. Stop and assess: is it a sketch or a blended portrait? It should be a sketch.

## Watercolor technique checks (section 8 of SKILL.md)

1. ✓ **Value thumbnail**: Lights (paper, pale washes), mids (ginger, skin, brown hair), darks (pupils, shadow fur, deep hair). Light-to-dark progression.

2. ✓ **Lights list**: Four eye catchlights (reserved), whiskers (reserved), cheekbone highlight (reserved), hair top light (reserved). No dull eyes.

3. ✓ **Per region**: Cat fur (wash, glaze, strokes on dry). Cat eyes (precise, dry). Muzzle (wash + whiskers). Face (planes on dry, glaze). Eyes (precise, dry). Hair (wash, glaze, strokes on dry). Smallest features (iris, lid, whisker) at 0.5–1 mm (2–4 cells at 1200px).

4. ✓ **Glaze list**: Cat shadow glaze (head and ear, one passage). Human shadow glaze (temple to jaw, one passage). Hair shadow in valleys. Each crosses region boundaries; no patching.

5. ✓ **Wet passages**: No detail region inside wet spill-over. Eyes and muzzle dry. No adjacent wet regions except intentional connections (lit and shadow face sides wash together).

6. ✓ **Drawing**: Opening sparse but defines eyes, face structure, whiskers. Closing reinforces the opening. Sepia ink declared.

7. ✓ **Breaks**: No breaks from light-to-dark (all stages follow order).

8. ✓ **Stage intents**: Stage 1 reads sketchy (drawing visible). Stage 2 reads light-filled (pale washes, paper showing). Stage 3 adds shape. Stage 4 adds depth. Stage 5 adds gesture. No fade-in.

## Expected painting behavior

- **Opening drawing stage**: Sepia pen lines visible, sparse and confident, defining eyes and facial structure.
- **Early washes**: Broad, light, watery. Lots of white paper showing. The sketch quality comes from seeing paper and hand-drawn lines together.
- **Mid values**: Shapes gain edges and planes. Painting still reads as luminous and understated.
- **Shadows**: One unified glaze per shadow side. Depth without heaviness.
- **Final stage**: Directional marks and selective accents. Focal points sharp. Sketch character preserved.

This progression should read like a person sketching and painting watercolor, not like a filter revealing or fading in a finished image.
