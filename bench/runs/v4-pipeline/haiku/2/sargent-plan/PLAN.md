# Plan: White Ships (Sargent), round V4, try 2

## Value thumbnail and three main values

- **Light:** pale cream-yellow sky with soft warm glow
- **Mid:** blue-grey water, local colours of ships' orange-red hulls
- **Dark:** dark blue-green shadows in water, dark accents on ships and masts
- **Focal point:** white ships with orange-red hulls and gestural masts, centre of composition

## Value structure and reference cues

- **Three main values:** pale cream sky, mid blue-grey water, dark accents in ships and shadow reflections
- **Focal point:** white ships with orange-red hulls and masts, upper-centre to centre
- **Atmosphere:** soft transitions throughout, luminous sky fading to water
- **Paper strategy:** reserve white paper for ship hulls and water highlights; the entire sheet stays loose and atmospheric

## Regions and techniques

**Region 1: Sky (top ~40%)**
- Reference cue: pale, warm-toned sky with soft atmospheric haze
- Technique: atmospheric-wet (wet-in-wet)
- Move: wet paper, pale wash in one connected passage
- Protected lights: paper highlights for sky luminance
- Edge role: all soft, no hard boundaries
- Load: watery, sparse strokes, big brush
- Paper state: glossy wet throughout

**Region 2: Water (bottom ~60%)**
- Reference cue: blue-grey sea with broken lights, darker than sky, softer horizon line
- Technique: precise watercolor on dry paper after sky is set
- Move: wet on dry for control, with softer edges where water meets sky
- Protected lights: white paper for ship hulls and water glints
- Edge role: soft where horizon meets sky, harder edges for ship forms
- Load: medium concentration, controlled but loose
- Paper state: dry, allowing distinct water values to emerge

**Region 3: Ships and focal details (embedded within water, centre)**
- Reference cue: white hulls with orange-red accents, masts and rigging gestural
- Technique: dry paper, controlled load for definition
- Move: wet on dry, dry brush for mast lines and shadow details
- Protected lights: bare paper for hull whites and brightest glints
- Edge role: one hard edge on shadow side, one soft edge turning to water
- Load: medium to thick for ochre and red accents

## Lighting and reserved whites

- **Catchlights and sheens:** brightest water reflections and ship hull highlights (bare paper or very pale tint)
- **Sheen planes:** top of ship hulls catch light; water surface has scattered glints
- **Strategy:** reserve as bare paper in initial planning; minimal toning

## Layering sequence

1. **Opening drawing:** sparse pen lines establishing ship hull silhouettes, main masts, horizon line (see opening-lines.json)
2. **First wash (sky):** pale cream-yellow and blue-grey, wet in wet, one soft continuous passage
3. **Dry completely**
4. **Second wash (water):** mid blue-grey with darker accents, connecting to sky, preserving white reserves
5. **Dry**
6. **Shadow glaze:** one connected dark glaze across water where shadows and depth are needed
7. **Dry**
8. **Details:** ship hulls in warm ochre and orange-red, gestural mast lines, final water accents

## Water and pigment loads per pass

- **Sky wash:** watery (high water-to-pigment), sparse pigment loading, encourages merging
- **Water mid-layer:** medium water, enough pigment for mid-blue without muddying
- **Shadow glaze:** less water, more pigment concentration
- **Details:** medium load, controlled edge contact

## Failure prevention

- **Blur:** water region painted dry-on-dry keeps edges where needed; sky soft by design
- **Muddy water:** limit pigment mixing; allow paper texture to show through
- **Lost ships:** hull whites reserved as bare paper; orange-red accents show first before darks
- **Flat sky:** rely on paper texture and one soft passage, not layered banding
- **Weak atmosphere:** soft edges throughout; no hard lines except opening drawing

## Tokens and recipe changes

- `_lay2`: two mid layers instead of four (controls value steps to match this loose subject)
- `_noslane`: removes sky lane inference, keeps sky as one atmospheric wash
- Base recipe: `region_w13` (default region weights)

## Lights list (protected from every wash)

- **Bare paper whites:** sky luminance zone (painter's own detection)
- **Water highlights:** scattered glints on water surface (painter's own near-paper detection)
- **Ship hull highlights:** mainly reserved by painter's own segmentation; kept bright
- **Strategy:** mostly let the painter's own near-paper light detection work; no explicit text reserves due to axis-aligned seams risk

## Resolution decisions (per region)

- **Sky:** wash question - the pale haze reads as a value plane with soft edges
- **Water:** wash question - blue-grey value plane with edge definition where horizon meets sky
- **Ships (embedded in water):** wash + dry-brush - hulls and masts read as value planes with some gestural line texture on dry paper

## Wet passages

- **Sky region:** glossy wet paper throughout, one continuous passage, all soft edges
- **Water region:** dry paper throughout; painted after sky is completely dry
- **Boundary:** sharp transition at horizon where water begins (sky fully dried first)

## Closing drawing

**No closing ink or graphite.** This is pure watercolor, so closing-lines.json will be empty or contain no mark medium.

## Breaks from light-to-dark default and their reasoning

- **No breaking of the water into separate wet passages:** the water is loose and atmospheric, so even the shadow glaze stays soft; one passage per region is enough to maintain atmosphere
- **Gestural opening drawing only:** Sargent's pen work here is minimal - just enough to establish ship silhouettes, not detailed contours

## Stage intents (checkpoints)

1. **After opening drawing:** ship hull silhouettes visible, horizon line suggested, confident lines, minimal - should read like Sargent's sketchy approach
2. **After first sky wash (pass 1-3, light band):** pale, luminous sky with soft colour variations, warm tone in upper area, soft bloom around edges, no cloud detail needed - pure atmospheric haze
3. **After mid water base (pass 4-8):** sky and water clearly separated with soft horizon, water mid-tone blue-grey established, whites reserved in ship regions, no shadow definition yet - loose underpainting
4. **After shadow glaze (pass ~20-25):** depth and form emerging in water, shadows connecting across regions, soft edges maintained, water reads three-dimensional, ship shapes begin to suggest hulls
5. **Final painting:** warm ship hulls and red accents settle with their own value steps, masts gestural but legible, whole composition reads atmospheric and loose - resembles confident plein-air watercolor

**Failure signs to watch:**
- Blurry sky edges: indicates over-merging or too wet paper
- Muddy water: indicates over-mixing or too many pigment layers
- Lost ship shapes: indicates water washes covered reserved whites; need dry paper and controlled contact
- Flat composition: indicates not enough value separation between sky and water
- Noise or stipple: indicates brush density too high or paper tooth over-emphasized

## Deviations from default technique and why

- **Wet-in-wet sky instead of layered:** Sargent's sky in this piece shows soft atmospheric haze rather than distinct cloud shapes; one wet passage captures this better
- **No closing ink:** task specifies pure watercolor only
- **Gestural masts on dry paper:** masts are thin lines (below cell scale at output resolution); dry paper with controlled load prevents blur
- **Two layers instead of more:** subject is loose and atmospheric; more layers risk overworking

## Per-region detail summary

### Sky region (top 40%)
- **Reference cue:** pale, warm-toned luminous haze with atmospheric softness
- **Technique:** wash (value plane with soft edges)
- **Resolution:** smallest feature is the soft gradation; no individual marks needed
- **Move:** wet-in-wet throughout, one glossy-wet passage
- **Paper state before:** glossy wet throughout
- **Water load:** watery (high water-to-pigment ratio)
- **Pigment load:** sparse, encourages merging
- **Edge treatment:** all soft, no hard boundaries except opening drawing
- **Layer count:** 1-2 very pale transparent passes only

### Water region (bottom 60%)
- **Reference cue:** blue-grey sea surface with white ship hulls and water highlights, darker than sky, broken light patterns
- **Technique:** wash + dry-brush (value planes with some gestural marks on dry paper)
- **Resolution:** hulls and masts read as shapes and lines; water surface is continuous mid-tone with glazed shadows
- **Move:** wet on dry for main water; dry on dry for shadow detail and ship accents
- **Paper state before:** completely dry from sky
- **Water load:** medium (controlled water, not watery)
- **Pigment load:** medium to thick for mid-values, less for glaze passes
- **Edge treatment:** soft where horizon meets sky, harder edges where ship forms define against water
- **Layer count:** 2-3 mid-value passes, then 1-2 shadow glazes

## Opening drawing (opening-lines.json)

- **Format:** traced from target using q-trace-ink.mjs with conservative thresholds (minContrast=.12, minLen=10, maxLum=.62)
- **Content:** ship hull silhouettes, mast lines, horizon suggestion
- **Material:** sepia ink (default)
- **Weight and character:** sparse, confident strokes following Sargent's original gesture; should read like painter's initial structure lines, not detailed linework
- **Why traced:** extracted pen-stroke edges from the target image to preserve the original composition's key gestures

## Fast proof notes

- Technique is straightforward: one atmospheric sky wash, then two water mid-layers, then shadow glaze
- First 60 seconds should show sky as pale, soft, luminous area
- At 5-minute mark, water should be evident as blue-grey and clearly darker than sky
- By 15 minutes, ship shapes should be recognizable with their hull colours distinct
- No detail should appear blurry; atmospheric softness comes from technique choice, not blur

## Configuration details (V4 try 2)

- **Recipe tokens:** `region_w13_lay2_noslane` - two mid layers, no sky lanes
- **Variant:** precise-watercolor style with atmospheric-wet used implicitly for sky
- **Families:** empty (painter uses own segmentation)
- **Reserves:** empty (painter keeps its own near-paper whites)
- **Extra painter settings:** `--darkgain 1.1` (lightens darks slightly for atmospheric feel)
- **Drawing:** traced opening lines from target (sepia ink), no closing lines (pure watercolor)
- **Target:** 300x244 px source, scaled to 1200x976 px output on 280mm sheet

This plan prioritizes leaving room for the painter's own artistic choices in segmentation and color selection, while guiding it toward atmospheric watercolor through the token choices and opening gesture.
