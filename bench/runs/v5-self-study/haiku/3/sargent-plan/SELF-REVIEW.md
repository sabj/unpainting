# Self-Review: Try 2

## What works
- Overall color palette and atmospheric quality in the final painting is good: warm creams, cool blues, orange-brown boat tones
- Value range captures the subject's essence (light sails, dark water)
- Finished painting composition roughly matches the target

## What is wrong
- **Progression is completely broken**: The stages strip shows uniform pale wash at 10%, 25%, 50% - the whole sheet fades in together like a digital dissolve, not a painter building local forms
- **No reserves visible**: White sails should be visible as bright untouched islands from 10% onward. Instead, there are no white reserves protecting the key lights
- **No local structure early**: At 10%, there's no evidence of where the boat, masts, sails or water are. Should see at least horizon and mast positions guiding the composition
- **Marks texture weak**: Progression judge called out "fine detail already present in the first 25%" isn't relevant here, but "speckle or dotted trails" suggests weak mark quality across stages
- **Opening drawing too minimal**: Horizon + two mast guides aren't enough to guide where the painter should treat regions differently. Sails need to be outlined so painter knows to preserve that area

## Where it went wrong
- **Stage 1-2 (10%, 25%)**: Painter created uniform pale wash everywhere instead of local light preservation. No reserves in config meant "protect near-paper value" was ignored in favor of uniform coverage
- **Progression logic**: Assumed painter's own light preservation would protect sails, but painter treated whole sheet as one undifferentiated mass

## Scores
- **Finished painting: 3/10** — decent color/values but lacks watercolor character, muddy mark quality, no luminous quality  
- **Progression: 1/5** — judges correctly identified this as "digital dissolve" (opacity fade) not a painting process

## Agreement/disagreement with judges
- **Agree**: "whole sheet at one faint value, as if faded in" — exactly right
- **Agree**: "fine detail already present in the first 25%" applies to the rigging marks if they show too clearly  
- **Agree**: "The sequence is a digital dissolve" — correct diagnosis
- **Disagree with implied solution**: Adding more passes (lay4) didn't fix the root cause, which is lack of explicit reserves and structure

## What to change for try 3

1. **Explicit reserves in config**: Create reserves for white sail canvas, water light patches, and pale sky area. These must be honored from the start, making them visible as bright islands in each stage.

2. **Stronger opening drawing**: Trace sail outlines and mast positions with clear, confident lines (weight 0.5-0.7). The painter needs clear guidance on where these structural elements live. No fine rigging detail, but sail shapes must be outlined.

3. **Regional families with per-region styles**: Define sky, sails, boat, and water as separate families with `atmospheric-wet` for sky, `precise-watercolor` for sails/boats/water. Forces local light-to-dark progression per region instead of uniform fade.

4. **Simpler, wetter sky**: Use the sky's atmospheric-wet style to get soft edges and luminosity, but keep it distinct from crisp sail area.

5. **Carefully planned layer sequence**: Opening lines that show structure → first light wash (sky and pale water, respecting reserves) → mid-tone builds per region → shadows as cross-boundary glazes → final accents. Each stage should show different areas in different states.

These changes address the core failure: replacing uniform global fade with per-region light-to-dark progression, anchored by explicit paper reserves.
