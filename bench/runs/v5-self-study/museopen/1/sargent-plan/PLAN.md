# Ships — Sargent — Pure Watercolor Plan

## Reference cues
Sargent's Ships: central blue hull (ultramarine/cerulean) with warm orange stitching and dark anchor shadow, flanked by warm ochre/sienna masts and rigging. Upper sky is pale warm wash with soft blue. Lower water is turquoise/sap-green with ochre and dark hull reflection. No ink — all form from transparent washes.

## Regions and order
- **sargent.sky** [0,0,1,0.35] atmospheric-wet, wet on wet: pale graded sky, lifted lights, warm ochre masts. Painted first as light wash.
- **sargent.hull** [0.18,0.02,0.72,0.92] precise-watercolor, wet on dry: central hull mass, blue planes, orange detail, dark anchor recess. Shaped mid planes with dry crisp edges.
- **sargent.water** [0,0.68,1,1] precise-watercolor, wet on dry: lower water foreground, turquoise/sap-green washes, dark reflection glaze.

Moisture: sky wet (0.88) for soft gradation; hull/water dry (0.45) for crisp edges. Load calibrated per layer.

## Protected lights
Two small reserves: hull highlight/rigging sparkle [0.38,0.42,0.43,0.48] and sky paper [0.68,0.12,0.73,0.18]. Painter also keeps near-paper lights automatically. No large straight reserves — all small (<8% short side) to avoid unsupported axis seams.

## Edges and values
- Sky: graded soft/lost edges, cloud shapes retained via wet-on-wet.
- Hull: crisp focal detail, dry edges, cross-region shadow glazes for anchor dark.
- Water: dry brush texture, reflection glaze.
Value ladder: light wash → shaped mid planes → cross-region shadow glazes → dry accents. Dark gain 1.1 for anchor and hull shadow depth.

## Pigments
ochre, rawsienna, sienna, ultramarine, cerulean, sapgreen, sepia (plus sky granulating ultramarine via skyb). Warm/cool balance via cg13 and vio.

## What would show failure
- Sky banding or lost cloud edge → wet mix too low
- Hull blue reading as flat → missing warm underpainting/ground glaze
- Water as uniform wash → missing dry brush and reflection variety
- Ink lines visible → drawing not disabled (must stay pure watercolor)

## V5 changes
First try — no prior feedback. Base recipe kept (lay4, rec2x, sky3, etc.) with drawing disabled via --drawing none and empty line files for pure watercolor compliance. Added atmospheric-wet sky region for soft gradation.
