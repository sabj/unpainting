# Self-Review: Hills V5, Try 2

## What I see in the previous painting

The finished painting and progression stages show a fundamentally broken execution, not a refinement failure:

- **Overall appearance**: Chaotic speckle, no coherent form, persistent white rectangles never painted, looks like an algorithmic dump, not human painting
- **At 10-25% strokes**: Already covered in noise/speckle, with pink/red artifacts. No clear path or form emerging. Should show sparse opening lines and a pale base wash instead
- **At 50% strokes**: Still chaotic, persistent white rectangle unmoved. Should show clear hill structure and path definition by this point
- **Progression**: No light-to-dark layering visible. Each stage looks like random speckle addition, not building form
- **Judges agree**: "flat evenly-toned slab washes with scalloped edges, speckle dumps, squiggle lines that ignore the subject, persistent masked white rectangle"

## Why try 2 was worse than try 1

Try 1 scored 4.21; try 2 scored 2.0. The strategy of addressing "scalloped edges" with the `_softs` token made things dramatically worse:

1. **Opening drawing problem**: The speckle dumps at 10% suggest the opening lines are not proper pen lines but scattered marks. Either:
   - The line tracing generated wrong paths (need to check the opening-lines.json)
   - The pen/ink medium settings produced speckle instead of lines
   - The planner is treating opening lines as a speckle pass instead of vector lines

2. **`_softs` token failure**: Intended to create soft arc edges, but instead created scalloped boundaries and prevented coherent wash formation
   
3. **Single unified region strategy**: Makes every wash overlap chaotically instead of creating coherent stages
   
4. **Reserved white rectangles**: Try 2 still has them (visible in the compare image), meaning reserves are not being respected or are being added back algorithmically

## What the target actually shows

Rolling hills with **two main paths** winding through green hillsides:
- **Lights**: Pale tan/cream paths (warm, lit, ~0.75-0.85 value) - not pure white, but warm-toned paper showing through thin wash
- **Midtones**: Yellow-green and medium green hills (0.45-0.65 value), lit from above
- **Shadows**: Very dark forest (0.10-0.30 value), cool blue-green and navy - clearly painted darks, not reserves
- **Spatial structure**: 
  - Bottom foreground: dark forest mass with hard edge against lit hillside above
  - Middle: Rolling hills with paths as positive shapes, edges organic not rectangular
  - Background: Softer, cooler, darker distant trees
- **Key observation**: The paths are integrated into the landscape through layering and value, not reserved white

## Root cause analysis

**Try 1 + Try 2 both failed because**:
1. Strategy of large reserves (try 1) or experimental soft-edge tokens (try 2) missed the core issue: this is a **layering problem**, not a reserve or edge-softness problem
2. The painter's opening drawing and first wash need to work correctly before any regional strategy can succeed
3. Tokens like `_softs` that aren't in the base recipe and weren't tested are creating worse artifacts than the base recipe itself
4. A "unified landscape" region doesn't work for a subject with clear distinct forms (forest, paths, hills)

## What needs to change for try 3

1. **Return to simpler token choices**: Use only tokens proven to work on similar subjects. Don't experiment with `_softs`, `_lf`, `_lit20` - they made things worse
   
2. **Fix the drawing layer**: 
   - Verify the opening-lines.json actually contains proper line paths, not speckle
   - Use the working example's approach: sparse, confident lines that describe the path curves and forest/hill edges
   - Closing ink should reinforce only at focal points
   
3. **Plan clear regions**:
   - **Region 1: Paths** (bounds tightly around the two visible paths)
   - **Region 2: Lit hills** (green hillsides receiving light)
   - **Region 3: Forest** (dark mass at bottom and shadow sides)
   - **Region 4: Sky** (tiny sliver at top, but include it)
   This gives the painter clear zones to paint region-by-region instead of chaotic unified wash
   
4. **Proper layering without experimental tokens**:
   - Base wash: pale yellow-green across lit hills and paths (wet-on-dry, big brush)
   - Dry
   - Mid layer: warm ochre on path areas (glazing to show paths are lit, warm planes)
   - Dry
   - Shadow: dark cool green on forest and shade sides (one glaze across forest and shadows)
   - Dry
   - Closing ink: sparse lines on path curves and forest/hill junctions
   
5. **Smaller, simpler reserves**:
   - One small reserve: the brightest path intersection or top-right path highlight
   - Size ~0.05 (of sheet width) across, not large rectangles
   - Allow the first pale wash to tone everything; paths emerge through layering

6. **Use base recipe tokens only**: 
   - No `_softs`, `_lf`, `_lit20` - these made try 2 worse
   - Maybe `_lay2` for fewer mid layers (worked in try 1 rationale, though try 1 still failed)
   - Maybe `_ink2` or `_ink3` for better closing lines (fewer, more controlled)

## Scores I'd assign

- **Try 2 finished painting**: 2/10 (judges correct - looks algorithmic, not painted, no coherent form)
- **Try 2 progression**: 2/5 (judges correct - speckle dumps and chaos, not light-to-dark)
- **Why so low**: Fundamental strategy error using untested soft-edge tokens + unified region + broken opening lines

## Where I disagree with the try 2 plan

The plan rationale for try 2 was: "remove reserves, use unified region, add soft-edge tokens to fix scalloped edges." But this was backwards:
- **Scalloped edges came from the base recipe**, not from reserves. Try 1 had reserves + scalloped edges; try 2 removed reserves + added softs token, and got scalloped edges + speckle
- **The real fix**: Use proven base tokens and proper region boundaries so the painter works with clear zones, not confused unified masses
- The plan intuition (larger softer unified wash) was right, but the execution (softs token) made it worse

## What I agree with from judge feedback

- "Flat evenly-toned slab washes": Correct, both tries show slab-like masses not organic surfaces
- "Scalloped edges": Correct, the boundary artifacts are prominent  
- "Speckle and squiggle lines": Correct for try 2, worse than try 1
- "Persistent white rectangle": Correct in both tries
- "Not human painting progression": Correct, both show regions/colors arriving chaotically

## What to test before painting

Before attempting try 3, I need to verify:
1. That the opening-lines.json will produce visible pen lines, not speckle
2. That the variant tokens don't include experimental ones that failed
3. That the regions are clear and don't overlap in confusing ways
4. That the base wash actually covers the landscape and tones the entire area
5. Run `bash bench/check.sh` successfully before touching the painter

