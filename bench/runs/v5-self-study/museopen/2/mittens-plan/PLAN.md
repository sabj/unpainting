# Mittens – Watercolor Portrait Sketch Plan (V5 try 2)

## Reference Cues
- Left: orange/white tabby cat (Mittens) with vivid orange tabby markings, white chest/muzzle, green eyes, pink nose
- Right: person holding cat, warm skin tones, dark curly hair with blue-black variation, gentle expression
- Background: clean white paper vignette, no background wash – paper is the light
- Lighting: soft diffused daylight, light washes, fine ink lines define form (requested style: watercolor portrait sketch, fine lines and light washes)

## What Changed from Try 1 and Why (V5 try 2)
**Previous try failed on:** monochrome sepia palette (orange/green lost), faint broken ink (31 lines, weight 0.71), whole-sheet faint value (“faded in”), scalloped wash edges with round holes, values too light (dk11, lay3), blocky reserve holes, no brush texture.

**Changes:**
1. **Palette – forced saturated warm palette via --paints:** `ochre,sienna,hansa,ultramarine,rose,sapgreen,cerulean,sepia,rawsienna` – gives orange (ochre+sienna+hansa), green eyes (sapgreen+hansa), warm skin (ochre+rose+sienna), blue-black hair (ultramarine+sepia), pink nose (rose). Previous try relied on auto palette which picked desaturated lean set.
2. **Value richness – dk13 (1.3) + mg12 (1.2) + sg12 (1.2) + lay4:** Darkgain 1.1→1.3 for deeper darks (pupils, hair, nostrils), midgain 1.2 for richer mids, stylegain 1.2 for stronger washes, 4 mid layers instead of 3 for distinct value planes. Previous lay3_dk11 was too pale/uniform.
3. **Ink – re-traced with lower contrast (0.08 vs 0.12) → 92 lines vs 31, plus higher pressure:** Openingpressure 0.5 (was default 0.28), closingpressure 1.0 (was 0.35), drawwidthgain 2.5 (was 2.0), drawwidthmin 0.5. Makes fine lines for whiskers, fur direction, hair texture, facial features visible. Previous ink share 0.18 with 31 faint lines was invisible.
4. **Edges – _soft token (softarcs 8, softarclen 48, softmm 1.0):** Reduces scalloped wash edges and round holes that were prominent in try 1. Soft arcs blend wash boundaries.
5. **Brushwork – _sml30 (strokemm 30) + _wre15 (washreach 1.5) + acc3 + st40 + lit20:** Larger, more varied strokes (30mm vs default ~6mm), longer wash reach, accent share 0.3 for dark accents, shadowthresh 0.4 for better shadow separation, litlift 0.2 to keep lights luminous. Addresses flat uniform washes and lack of marks.
6. **Reserves – removed large rectangular reserves:** Previous 3 tiny reserves (5.6mm) created blocky white squares in eyes. Now rely on painter’s auto near-paper lights; no rectangular reserves to avoid unsupported axis-aligned seams. Paper whites for background/chest preserved automatically.
7. **Families – kept empty:** No families to avoid unsupported straight edges; painter’s own color/value segmentation handles cat vs person naturally. Tested small families but risk of seams outweighs benefit for this portrait.

**Critique points rejected:**
- Classic marks 9.55 (inflated – rewards paper-white, not actual marks) – will trade some paper-white for richer mids/hue.
- “Fine detail already present in first 25%” tell – mis-attribution; early stage was faint ghost, not detail. Not optimizing for it.
- Keeping lay3_dk11 – rejected; too light/uniform for this subject.

## Regions, Technique and Order (precise-watercolor)
- **Style:** precise-watercolor – light-to-dark progression, reserved lights, dry focal edges, fitted landmarks. Weights [0.16,0.44,0.12,0.182,0.098], water [0.62,0.48,0.22,0.45,0.45], brushes [flat, round12, pointed round, liner], moves [wet on dry, dry on dry, glazed].
- **Order:** reserve → sparse graphite → light wash → dry → shaped mid planes → dry → cross-region shadow glazes → dry → selective closing ink
- **Families:** [] – painter’s segmentation unlabelled, paints cat and person in same style but with distinct local colors via palettewide.
- **Reserves:** [] – no manual reserves; painter keeps near-paper target lights (background, cat white chest, eye catchlights) automatically.

## Moisture and Load
- Per-layer calibrated load (style default), water levels 0.62→0.45 across washes
- Wet on dry for crisp focal details (eyes, nose), glazed for skin, dry on dry for hair texture
- Darkgain 1.3, midgain 1.2, stylegain 1.2 – richer than try 1’s 1.1, but still light sketch (not heavy)
- Coldpress paper (cpp) for subtle tooth, texvariety 0.8 for varied texture

## Protected Lights
- Paper whites: background vignette, cat white chest/muzzle, eye catchlights – via painter’s auto near-paper preservation + litlift 0.2
- No manual reserves to avoid blocky holes; rely on value plan to keep lights

## Edges, Values, Drawing
- **Edges:** Crisp focal detail on eyes/nose/mouth, soften one turning edge (cheek), lost nonfocal edges (background, hair periphery). Soft arcs (8, 48, 1.0mm) reduce scalloped edges.
- **Values:** Light value ladder with 4 mids + dark accents; preserve paper for highlights, build form with transparent glazes; dark accents (pupils, nostrils, hair deep) via acc3 and dk13
- **Drawing:** 92 traced ink lines (vs 31 before) at .08 contrast, opening 0.5 pressure, closing 1.0 pressure, drawwidthgain 2.5 – fine sepia ink for whiskers, fur direction, hair texture, facial features. Both opening and closing use same traced lines (closingink4).

## What Would Show Failure
- Orange tabby still beige/grey (palette not reaching saturation) → need to increase paints saturation or stylegain
- Green eyes still pale (sapgreen not used) → check palettewide picks
- Ink still invisible (lines too faint) → increase pressure/drawwidth further
- Scalloped edges/round holes persist → increase softmm or minshapecells
- Whole-sheet faint value again → need more distinct value planes (lay4 should help) or families
- Blocky white holes → reserves too large (now removed, should not occur)
- Muddy skin (too many pigments mixed) → reduce palette or adjust shadowthresh
