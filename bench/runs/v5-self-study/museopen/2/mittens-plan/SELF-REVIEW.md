# Self-Review – Mittens V5 try 1 (before reading FEEDBACK.md)

## What works
- Composition and placement correct: orange tabby cat on left, person with dark curly hair on right, proportions and scale match target.
- Major value masses roughly in right place: white chest/paper preserved, dark hair mass present, cat tabby pattern located.
- Eye positions and general facial structure recognizable.
- Background kept as white paper vignette, no unwanted background washes.
- Light-to-dark intention attempted; overall image is recognizable as cat + person.

## What is wrong
- **Color/hue failure (most serious):** Target is warm saturated orange tabby (ochre/sienna), green eyes, warm skin, cool blue-black hair. Painting is near-monochrome sepia/beige – orange saturation lost, green eyes gone (pale beige), skin too pale/cool, hair flat brown-grey without blue-black depth or variation. Looks like single-pigment wash over whole sheet.
- **Ink lines missing:** Target has fine dark sketch lines for whiskers, fur direction, hair texture, facial features. Painting has extremely faint, broken sepia lines – whiskers invisible, hair texture lost, cat nose/mouth weak, eye outlines faint. Ink share too low.
- **Edges and detail:** Soft, scalloped wash edges with round holes, especially in cat fur and hair. No crisp focal edges on eyes/nose. Detail is blobby, not fine. White rectangular reserve holes visible as blocky squares in eyes.
- **Marks/texture:** Uniform flat washes, no varied brushwork, no dry-brush texture in hair or fur. Looks like filter, not brush strokes. No granular or directional marks.
- **Values too light:** Overall too pale, mid-values missing. Cat's orange markings ghostly, person's face lacks modeling, shadows under chin/cheek missing. Dark accents (pupils, nostrils, hair deep) too weak. Darkgain 1.1 too low.
- **Paper and washes:** Washes look like low-opacity overlay over whole sheet at one faint value, not transparent glazes building form. Classic “faded in” appearance.

## At which stage it went wrong
- **Before stroke 1 (planning):** Palette choice – painter auto-picked desaturated lean palette (likely ochre/sepia only) that cannot reach saturated orange or green. Style ink share 0.18 too low for “fine lines” requirement, and drawing caps filtered lines to 31 faint strokes. Reserves too large (5.6mm) creating blocky white holes.
- **Pass 1-2 (10-25%):** First light wash covered entire sheet at one faint value instead of selective placement. Stages show whole image fading in uniformly – this is the “faded in” tell. Should have started with localized light washes (cat fur only, or skin only) and visible graphite/ink. Value plan with lay3 (3 mid layers) gave too few distinct value steps, so early washes were undifferentiated.
- **Mid passes (50%):** Continued uniform layering without building distinct value planes or adding dark accents. Scalloped edges appeared from wash shape generation (small min shape cells, no soft arcs), not corrected. No family separation to break up uniform wash.
- **Closing:** Ink added too late and too faint to rescue detail; no dark punch in eyes/hair. Closing lines same 31 faint lines as opening, weight 0.71, insufficient.

## Own scores
- **Finished painting: 3.5 / 10** – Recognizable subject but fails on color, line, and watercolor character. Not close to target’s light wash + fine line sketch; hue and line are essential for this style.
- **How plausibly painted: 1.5 / 5** – Looks like a filter dissolving in, not a person painting. Whole-sheet faint value, round holes, no progressive construction. Early stages show ghost of final image, not incremental brushwork.

---
## After reading bench/feedback/FEEDBACK.md

### Where I agree
- **Composite 5.76, classic 8.19 vs edges 3 / marks 2.33:** Agree direction – gross composition/value okay but edges/detail and marks/texture are failures. My 3.5 is harsher than 5.76 but same direction; classic measures high because they reward paper-white preservation, not hue/line fidelity.
- **Progression 1.8 mean, 1.5 at 10/25%:** Strongly agree – my 1.5 matches. Tells “whole sheet at one faint value, as if faded in (6)” and “cut or scalloped wash edges, round holes (4)” exactly what I saw. Judge notes “single completed image fading in from low opacity” is accurate and robust.
- **Render record:** Base tokens applied include ink4, sep8, skyb etc but palette was lean and desaturated – explains monochrome. No passages dropped, 2381 strokes – many strokes but uniform, confirming wash shape issue not stroke count.

### Where I disagree / nuance
- **Classic marks 9.55 seems inflated:** Painting has almost no visible brush marks; 9.55 suggests classic scorer rewards paper-white preservation, not actual watercolor marks. I score marks much lower (2.33 from edges/detail is more honest). External judges noisy – half agree with human expert – so I discount classic marks.
- **Judge scores 3,3,4 (composite 5.76):** Generous; I see 3.5/10, they see ~5.76. Difference is they weight composition/value more than hue/line fidelity. For watercolor portrait sketch, hue (orange, green eyes) and fine lines are essential – I weight them higher.
- **“Fine detail already present in first 25% (1)” tell:** I did not see fine detail early – opposite, detail was missing throughout. Early stage had faint ghost of final image, not detail. This tell is mis-attribution; I will not optimize for it.
- **Process judge variance ±0.5:** With mean 1.8, even +0.5 is 2.3 – still “mostly not” human. So progression failure is robust, not noise. I accept the core critique.

### What I will change vs reject
- **Change:** Force saturated warm palette via --paints (ochre, sienna, hansa, ultramarine, rose, sepia, sapgreen, paynes) to get orange, green eyes, skin, blue-black hair; increase darkgain to 1.3 (dk13) and midlayers to 4 (lay4) for richer values; re-trace ink with lower contrast (0.08) to capture fine lines and increase visibility via extra-args; add soft arcs (_soft) and min shape cells (_ms80) to reduce scalloped edges/round holes; remove large reserves (rely on painter’s auto lights) or shrink to 1mm; keep precise-watercolor but ensure drawing not filtered; add subtle families or adjust wash parameters to get selective, not whole-sheet, washes.
- **Reject:** I reject optimizing for classic marks 9.55 – will trade some paper-white for richer mid-values and hue. I reject keeping lay3_dk11 – it made washes too light/uniform. I reject “no families” – will test small families for cat vs person to break up uniform wash, but keep them small to avoid unsupported seams. I reject large rectangular reserves – they create blocky holes.
