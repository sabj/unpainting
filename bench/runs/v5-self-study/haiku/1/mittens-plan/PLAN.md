# Painting plan: Mittens, round V5, try 1 of 3

## Reference and composition
- **Subject**: Ginger tabby cat and human portrait, three-quarter view composition on light watercolor paper
- **Style**: Watercolor portrait sketch with fine lines and light washes
- **Requested**: Emphasis on delicate line work and subtle value modeling
- **Reference cues**:
  - Cat: alert expression, warm ginger tabby fur with orange and cream undertones, bright direct gaze
  - Human: thoughtful expression, side-lit face revealing facial planes, dark wavy hair with light catch
  - Both: clear catchlights in eyes indicating luminous quality; soft muzzle/lower face areas

## Value structure and lights
- **Lights** (reserved, paper white and pale tint):
  - Catchlights in both cat eyes and both human eyes (critical for aliveness)
  - Whisker strokes on cat muzzle (white paper lines)
  - Light catching on human cheekbone (pale tint)
  - Top of human head catch in hair
  - Pale tint for cat muzzle (grey-cream undertone visible)

- **Mid values** (wash and mid-layer stages):
  - Ginger fur: pale warm orange wash transitioning to warmer tone on lit side, cooler on shadow
  - Human face: pale skin wash with warm undertone, stronger mid-tone on shadow side of face
  - Hair: medium dark brown-black wash for overall mass, shadow glazes for depth

- **Darks** (last stage, shadow glazes and accents):
  - Iris and pupil: deep value with upper lid shadow tapered ribbon
  - Hair shadows and depth strokes
  - Fur shadow side: cool maroon and blue-black mix, shadow glaze across head and ears
  - Mouth corner, nostril definition

## Regions and techniques

### Region 1: Cat head and body (mittens.cat-head)
- **Bounds**: [0, 0.05, 0.45, 0.85]
- **Technique**: Ink-and-wash per watercolor-technique section 4 (fur)
- **Moves**:
  1. Value wash: pale ginger (orange + sienna + touch ultramarine) wet on dry, single connected passage
  2. Dry. Shadow glaze: cool dark (maroon + ultramarine) across shadow side of head, ear, chest
  3. Dry. Directional strokes: ear locks as long ribbons, muzzle as short overlapping marks, head top as curved S-shapes following fur growth
  4. Density: standard 1200px captures fur direction; no raised density needed
- **Load**: watery for wash, medium for shadow glaze, thick for strokes
- **Paper state**: dry for all marks
- **Edge roles**: shadow glaze soft on turnaround side, hard on crease; fur strokes taper where they thin
- **Why this order**: light-to-dark; shadow glaze crosses regions (head to ear) for unity; ink strokes last for accent value control

### Region 2: Cat eyes (mittens.cat-eyes)
- **Bounds**: [0.08, 0.15, 0.32, 0.4]
- **Technique**: Precise watercolor, dry paper, controlled edges
- **Reserves**: Both catchlights (bright spots in pupil upper area) protected before wash
- **Moves**:
  1. Pale amber-green eye wash (pale ultramarine + touch sienna), dry paper, around reserved catchlights
  2. Dry. Iris: target-size disc tucked under upper lid, amber-gold at top (sienna + ochre), darker blue-grey bottom (ultramarine + touch sienna)
  3. Dry. Upper lid as tapered dark ribbon, thicker at outer corner, one hard edge on crease side, soft where it turns
  4. Sclera as pale tint, never bare white
  5. Lower lid as light line, not a crease
  6. Dry. Pupil: dense black with one tiny retained highlight from catchlight reserve
- **Paper state**: dry for all detail
- **Failure signs**: iris too large or too light; catchlights missing or yellowed with pigment; blur around iris
- **Why dry detail**: eyes carry likeness; soft blurred eyes read as "zombie" (documented failure 3T, watercolor-technique p.8); fine lines need firm contact and multiple layers

### Region 3: Cat muzzle (mittens.cat-muzzle)
- **Bounds**: [0.1, 0.45, 0.38, 0.7]
- **Technique**: Ink-and-wash, pale base with directional structure
- **Moves**:
  1. Pale muzzle wash (pale warm grey: ultramarine + sienna + much water), wet on dry, connected passage
  2. Dry. Light nosing glaze if shadows appear
  3. Dry. Whisker strokes: long pen/brush-pen lines crossing the pale muzzle, left paper white or toned with pale wash
- **Reserves**: Whisker paths protected as bare paper or tinted pale
- **Load**: watery for wash, thick for strokes
- **Paper state**: dry for strokes to hold fine weight
- **Mark character**: whiskers gestural, not ruled; taper where they thin
- **Why this order**: pale base prevents muzzle looking dark; whiskers over dry paint carry fine weight; no fill, no scribble

### Region 4: Human face (mittens.human-face)
- **Bounds**: [0.42, 0.15, 0.95, 0.8]
- **Technique**: Precise watercolor, portrait (watercolor-technique section 4)
- **Reserves**: Both eyes' catchlights (critical); cheekbone highlight
- **Moves**:
  1. Pale skin wash (pale warm ochre + ultramarine touch, very watery), wet on dry or evenly damp paper, connected face area, avoid eyes
  2. Dry. Mid planes on dry paper: cheekbone turn, under-nose, jaw turn, side of nose. One hard edge (crease side), one soft (turnover side)
  3. Dry. One connected shadow glaze across shaded side of face (around 60% face value) crossing from forehead through cheek into neck and jaw turn, creating unified shadow
  4. Tone reserved cheekbone highlight with pale glaze if too bright, soften one edge
- **Load**: watery for wash, medium for mid planes, medium-full for shadow glaze
- **Paper state**: dry except initial wash; dry paper for mid values and glaze for control
- **Edge roles**: mid-plane planes show facial structure; shadow glaze soft on center (where it meets lit side), harder at perimeter
- **Failure signs**: shadow glaze patches (separate passages); too much detail in pale areas; heavy ink before paint dries

### Region 5: Human eyes (mittens.human-eyes)
- **Bounds**: [0.55, 0.25, 0.85, 0.45]
- **Technique**: Precise watercolor, dry detail
- **Reserves**: Both catchlights protected before wash
- **Moves**: Same as cat eyes protocol; iris target-sized under upper lid, sclera pale tint, upper lid tapered ribbon, lower lid light line, pupil with one highlight retained
- **Load**: controlled, few strokes per layer
- **Paper state**: dry

### Region 6: Hair (mittens.hair)
- **Bounds**: [0.5, 0.02, 0.98, 0.35]
- **Technique**: Ink-and-wash, dark mass with directional structure
- **Moves**:
  1. Medium-dark value wash (dark brown-black: ultramarine + sienna + maroon, not ink black), wet on dry, connected mass preserving light catch at top
  2. Dry. Shadow glaze: deeper dark across shadow side and valley areas
  3. Dry. Directional strokes: long ribbon strokes following wave direction, density follows value (none in lights, heavier in shadow), gestural S and C curves for wave structure
  4. Last dark accents in valleys between locks, keeping paper flecks for texture
- **Load**: medium for value wash, medium-full for glaze, thick for strokes
- **Paper state**: dry for strokes
- **Mark character**: no uniform flicks, no ruled hatch, no stipple; gestural scribble OK if density follows value
- **Failure signs**: uniform noise; blurry base (raise load); filled dark mass (use washbase + glaze + selective strokes); strokes on wet paint (wait for dry)

## Drawing strategy

### Opening lines
- **Source**: Traced from target image (q-trace-ink)
- **Lines included**: Sparse structural lines including eye shapes, lid and brow lines, nose and mouth lines, ear set, face contours, whisker definition
- **Coverage**: Just enough for the eye paths to guide painting; no over-traced contour
- **Pigment**: Sepia ink (base recipe _ink4)
- **Weight**: Natural trace weights (mostly 2.8–3.3 px, ranging 0.63–0.85 weight)
- **Why sparse**: Painter starts from drawn structure, not gridded linework; opening drawing reads like painter's first gestural marks

### Closing lines
- **Selective toning**: Lid lines (pupil position and upper lid shape), nostril and mouth corner definition, selective whisker accents where paint left room
- **Pigment**: Sepia ink, same as opening
- **Where to avoid**: Lights (eye catchlight areas, cheekbone highlight), areas already given value by paint
- **Character**: Light and gestural; no under-eye creases, no fill, no ruled work
- **Why limited**: Heavy ink with heavy blur fails (documented 3T, section 7); ink rescues painting, not paint; fine lines over blurry wash are a failure (heavy ink over heavy blur)

## Layer order and passing

### Stage 1: Opening drawing
- Sparse pen lines open the composition, defining eyes, face structure, ear set, muzzle contours, whisker paths

### Stage 2: First pale wash (cat and human face)
- Ginger cat fur: pale warm orange wash, one connected passage
- Human face: pale skin wash, one connected passage
- Muzzle: pale grey wash
- **Paper state**: Keep eye detail regions dry or barely tinted; don't spill wash into eye areas
- **Intent**: Paper shows through, establishing light-filled base; no dark marks yet

### Stage 3: Second light wash (backgrounds and hair base)
- Human hair: medium-dark brown value wash, connected mass
- Ensures cat muzzle base is ready for shadow
- **Intent**: Establish value hierarchy; mid values present but painting still reads light

### Stage 4–5: Mid-value detail layers (2 passes: precise-watercolor recipe _lay2)
- Cat eye irises, upper lids, pupils
- Human face mid-planes (cheekbone turn, jaw turn, nose side, under-lip)
- Human eye irises, lids, pupils
- **Paper state**: Dry, controlled contact
- **Intent**: Shapes gain definition; edges show form (hard on creases, soft on turnover)

### Stage 6: Shadow glaze (one unified passage per region)
- Cat fur shadow: dark maroon-ultramarine glaze across head, ear, chest shadow side (one glaze crossing regions)
- Human face shadow: dark glaze from temple across cheek into neck and jaw (unified passage)
- Hair shadow: deeper value in wave valleys and shadow side
- **Paper state**: Dry base, glaze applied wet-on-dry
- **Intent**: Unifies shaded sides, creates depth through value, ties regions together

### Stage 7: Directional strokes and texture (fur and hair detail)
- Cat fur: ear locks as long ribbons, muzzle as short overlapping marks, head top as curved strokes
- Human hair: wavy strokes following direction, thicker in shadow, sparser in light
- **Paper state**: Dry
- **Intent**: Form emerges from stroke direction and density; no fill, no uniform texture

### Stage 8: Last accents and ink closes
- Pupil highlights confirmed
- Mouth corner, nostril definition
- Selective whisker accents where paint allows
- Lid line closure (if blur is minimal)
- **Intent**: Focal points sharp; form-carrying lines carry structure, not fill

## Tokens and recipe changes

- **Base recipe**: V096 champion (full token string provided by harness)
- **Tokens applied**:
  - `_lay2`: Two mid-value layers instead of four (finer value control, less muddy midtones, suits portrait's subtle modeling)
  - `_ink3`: Extended closing ink (more selective line detail, not compensating for blurry base)
- **Palette** (default Cerulean, Ultramarine, Sienna, Ochre, Sepia): Appropriate for ginger-cat and skin tones
- **Painter settings** (if any): None overridden; rely on base recipe's physical simulation and gentle target guard

## Failure signs and recovery
1. **Blurry eyes**: Fix the wash base (raise load, reduce water for firm contact); do not add ink to rescue. 
2. **Lost catchlights**: They are reserved; if toned too heavily, re-wet and lift while damp.
3. **Patchy face**: Check if shadow glaze crossed regions as one passage; if separate islands, re-paint as one glaze.
4. **Whiskers gone**: If fur strokes buried the whisker paths, revise to raise path visibility or thicken stroke
5. **Blended-away ears**: Fur on ears needs dry paper and directional strokes; no spill-over from wet-in-wet nearby.

## Changes from prior rounds
- **Round V5, try 1**: First attempt; no prior feedback.

## Watercolor technique checks (section 8 of SKILL.md)

1. ✓ **Value thumbnail**: Lights (white paper, pale washes), mid values (ginger fur, skin planes, brown hair base), darks (irises, hair shadow, fur shadow). Light-to-dark progression across layers.
2. ✓ **Lights list**: Both eye catchlights (reserved before wash); cheekbone highlight (toned if needed); muzzle pale tint; whisker strokes (paper white or pale). No eyes without catchlights.
3. ✓ **Per-region**: Each region (cat fur, cat eyes, muzzle, human face, eyes, hair) assigned wash, mid, or ink-and-wash question; smallest features (iris, lid) at 0.5–1mm (~2–4 cells at 1200px); dry paper for detail.
4. ✓ **Glaze list**: Cat fur shadow glaze (head, ear, chest, one passage). Human face shadow (temple to neck, one passage). Hair shadow in valleys. No region patched separately.
5. ✓ **Wet passages**: No detail region inside a wet passage by spill-over; eye areas kept dry; cat muzzle separate from face wash.
6. ✓ **Drawing**: Opening paths sparse but define eye position, facial structure, ear set. Closing ink selective, at focal points (eyes, mouth). Sepia ink declared.
7. ✓ **Breaks**: No breaks from light-to-dark (fur shadow glaze charged into wet fur is within design, not documented as exception).
8. ✓ **Stage intents**: Early washes read light-filled; mid stages add shape definition; shadow glazes unify shaded sides; ink closes focal points.

## Physical simulation check
- **Paper state tracking**: Plan specifies dry, wet, or damp before each mark; executor checks paper before stroke.
- **Load and moves**: Wash (watery load, big brush), mid (medium load, pointed round), glaze (medium-full load), strokes (thick, fine contact, dry brush).
- **Edge quality**: Hard edges on creases and defined form; soft on turnovers and shadow transitions; lost edges where value merges.
