# Plan: Trumbull, V5 try 3 (precise architectural watercolor)

Technique choices follow `.claude/skills/watercolor-technique/SKILL.md`: light to dark, a full dry between layers, shade
as glazes that cross region boundaries, detail on dry paper, ink only on structure. Where I break the default I say so.
Files: `config.json` (unchanged from try 2), `opening-lines.json` and `closing-lines.json` (unchanged), `variant.txt`,
`extra-args.json` (changed).

## Reading the reference
A Gothic-revival sandstone college seen three-quarter, low afternoon sun. Value thumbnail, light to dark:
1. **Lights:** white clouds (top right, thin ones top left and over the roofline), the sunlit gable face, the lit sides of
   the left tower and the right wing, pale limestone trim and string courses, the pavement strip.
2. **Pale sky:** soft blue, paler toward the roofline and at the left.
3. **Mid values:** the warm ochre-tan coursed stone that fills most of the sheet; the yellow-green street tree.
4. **Dark mid:** shaded side planes (the shaded face beside the left tower, the pier right of the gable, the left wing wall),
   warm brown with a violet-grey cast, and the slate roofs.
5. **Darks:** window glass (dark navy), the navy street sign, traffic lights, door and arch recesses.
Focal point: the gable with its two arched windows and the sign in front of it. Towers and the far right wing are quieter.

## Regions, technique, order (one resolution question per region)
- **Sky** (family `trumbull.sky`, wet on dry; kept from try 2): wash question. The sky is a patch top right plus slivers
  between towers and roofs, so a wet-in-wet pass would need the painter's moisture gate to pass on a sliver (it refused one
  in try 2, because the family said "wet on wet"). Cost: harder cloud edges. Change this try: only true paper-white cloud
  is kept as paper (`_cur`, below), and the sky is one layer (`_sk1`), so pale sky gets a continuous pale-blue wash with
  cloud-shaped holes, not paper with blue islands.
- **Stone** (family `trumbull.stone`, wet on dry): wash question, then layers.
  1. One broad pale warm wash over the whole building block, with no window cut-outs (`--recessclean 0`): windows are washed
     over and darkened later, as a painter does. One connected passage per colour.
  2. Dry. Three mid layers on dry paper (was four), each a wide connected plane (`--layersmooth 7` mm, was 5) with a
     larger minimum shape (`--minshapecells 300`, was the automatic 189), mid-tones 20% stronger (`--midgain 1.2`). Lit,
     half-tone, shaded side. The coursing comes from the base's sparse stone-block glazes (385 kept, ochre/sienna), which
     were the good part of try 2's gable.
  3. Dry. One shadow glaze across wall, window and roof edges on each shadow side (violet-leaning with burnt sienna).
  4. Lit faces stay thin: `_lit20` with `--litl 80` (was 72) keeps the sunlit faces' pale foundation with 20% fewer mid
     layers and no glaze, as one golden glaze (`_lw`) with paper glowing through. Threshold raised because 72 made so much
     of the right wing "lit" that it came out thin and white-speckled.
- **Foliage** (family `trumbull.foliage`, wet on dry): pale yellow-green mass, then sap green on the shaded side; after
  the stone. Lower-left shrubs stay grey and soft; no leaf detail.
- **Windows, arches, sign, slate:** ink-and-wash question. Dark glass is the last paint, on dry paper with hard edges.
  Mullions, jambs and arch heads are restored by closing ink (1 to 2 cells wide, too thin for a brush).

## Drawing
- **Opening drawing in pencil** (new: `--outlinemedium graphite`; was sepia ink). The 18 lines are the same long
  single gestures (gable slopes and corner, tower edges and cornices, chimney, roof edges); the painter keeps 8 to 12 of
  them. As graphite they read as a painter's construction lines under the wash and do not show as thin black wires
  through the finished wall, which my self-review found. The precise-watercolor style's own order starts with "sparse
  graphite".
- **Closing drawing** (110 short lines, sepia ink as in the base): windows where they carry structure (lancets, the two
  arched windows, mullions, lower arches, pole edges, sign blade). Nothing in the sky or on lit faces.

## Moisture and load
Everything wet on dry, fully dry for each layer (the painter checks paper state before each stroke); a medium-watery load
for planes, a lower-water load for the shadow glaze so edges stay crisp. Nothing wet touches a window. Wash lanes now
overlap more (`--overlap 0.35`, was .15) so the first washes do not leave pale diagonal gaps, which showed as a light
streak across the gable in try 2.

## Protected lights
Only true paper-white cloud is paper (`_cur`: paper is the sheet's white 252/251/248 with a 10-level tolerance, and the
"lightest tenth" rule that held the pale lavender sky as paper is off). Scattered paper glints on stone are off
(`--litreserve 101`); a larger minimum shape also removes tiny reserved whites, the confetti of try 2. Pale limestone trim
is kept light by the layers' value, not reserved.

## Edges
Hard on roof lines, tower edges and window heads. Soft on one side only where a form turns (the tree; the sky toward the
roofline). Lost: the shaded pier into the shaded wall, far stone into haze.

## Values (what each stage should look like)
- After the opening: a few soft pencil lines, nothing else.
- After the first wash: one pale warm block of the whole building (no window holes), pale sky with cloud holes, no dark.
- After mid layers 1 to 3: gable face golden, shaded sides already mid brown, planes read; the sky clearly blue.
- After the shadow glaze: shaded strips deepen to warm brown-violet, slate roofs sit down.
- After last darks and closing ink: windows navy, sign, arches, recesses; structure restated; no ink in the sky.

## What would show failure
Blob camouflage on the shaded stone; white confetti on the right wing; white cut-out sky; a pale diagonal streak; windows
that stay paper-white or bright blue; ink heavier than the paint; all detail arriving in the last 10% of strokes.

## What I changed from try 2, and why
Each from something I saw in my own review of the try-2 painting, or in the judges' named tells (SELF-REVIEW.md):
1. **`--recessclean 0`** (base 1). Tells: "fine detail already present in the first 25%" and "faded in at one faint value".
   With 1, every window is a hole in the first wash. Try 2 listed this idea as "refused by the painter", but I found the
   refusal came from the wet-in-wet sky family and not from this option; the sky has been wet on dry since.
2. **`_lay3`, `--layersmooth 7`, `--minshapecells 300`, `--midgain 1.2`.** Fault: mottled camouflage on the shaded stone,
   and a late dump of texture. Fewer, broader, stronger planes, so value builds in fewer, larger steps. I read the planner
   to find that layer planes shorter than 4x the minimum shape are dropped and that a small automatic minimum made the
   blobs; I did not set it higher than 300 because window glass panes are 300 to 700 cells at 1200 px and must survive.
3. **`_cur`, `_sk1`.** Fault: ragged white sky. `_cur` removes the "lightest tenth" paper rule; `_sk1` keeps the sky one
   layer. A compile preview at 600 px showed the pale sky now getting its own wash.
4. **`--outlinemedium graphite`** for the opening only. Fault: ruled black lines through the stone.
5. **`--overlap 0.35`.** Fault: pale diagonal streak.
6. **`--litl 80`** (was 72) and **`_lit20 _lw`** kept. Fault: white confetti on the right wing.
7. Kept from try 2: `_dk11` (shaded walls are mid brown, not twice as deep), burnt sienna in the box, `--recessmax 110`,
   `--litreserve 101`, the three families, the single reserve, both drawing files.

## Critique points I rejected or discounted
- "Classic edge 9.52 / marks 7.2": pixel statistics that rewarded a painting I and all three vision judges found blotchy.
- Judge spread (process 1.0 to 2.5, a half point on identical images): used only the named tells, each checked against
  `stages.jpg`, not the numbers.
- "A global dissolve or sharpen filter": wrong about the method (every mark is a logged stroke) but right about how the
  frames look; I treat it as a real tell, not as a false one.
- I tried a strong sky-first wash by giving the sky family the `ink-and-wash` style, and dropped it: the planner's colour
  segments put window glass, the sign and slate in the same cool segment as the sky, so they would have been flat-blue
  from the first wash. I kept the sky as wet on dry in the base style.
- Not changed, because I have no safe setting: the late stroke count of touch-up passes and closing lines.

## Plan for the stops
Look after the first wash, after mid layer 1, after the last mid layer, after the shadow glaze, before the closing drawing
and at the end. If shaded stone, the sky or the right wing goes wrong I revise pending passes only (darkgain, midgain,
the closing lines). What is on the paper cannot change, so the choices that need to be right are the opening drawing and
the first wash, and those were set above.
