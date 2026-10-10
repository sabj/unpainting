# Plan: Trumbull, V5 try 2 (precise architectural watercolor)

Technique choices follow `.claude/skills/watercolor-technique/SKILL.md` (light to dark, a full dry between layers, shade
as glazes that cross region boundaries, detail on dry paper, ink only on structure). Where I break the default I say so.

## Reading the reference
A Gothic-revival sandstone college at three-quarter view in low afternoon sun. Value thumbnail, light to dark:
1. **Lights:** white cloud (top right and top left, a lighter band over the roofline), the sunlit gable face (squinted L* about
   73), the lit sides of the left tower and the lower right wing, pale quoins and string courses, the pavement strip.
2. **Pale sky:** soft blue, lightest toward the roofline.
3. **Mid values:** the warm ochre-tan stone that fills most of the sheet (coursed irregular blocks), the yellow-green street tree.
4. **Dark mid:** shaded side planes (the narrow shaded face beside the left tower, the shaded pier right of the gable, the
   left wing wall; L* 35 to 50, warm brown with a violet-grey cast, NOT black and NOT green), slate roofs.
5. **Darks:** window glass (navy), the navy street sign, traffic lights, door and arch recesses.
Focal point: the gable face with its two arched windows and the sign in front of it. Towers and far right wing are quieter.

## Regions, technique, order (one resolution question per region)
- **Sky** (family `trumbull.sky`, wet on dry; a named break from the skill's wet-in-wet sky): wash question. Broad pale blue
  washes on dry paper, clouds stay paper, the painter's own sky lanes and sky-blue split stay on from the base. Reason: here the
  sky is not one open sheet. It is a large patch top right plus slivers between the towers, roofs and clouds. The painter's
  wet-wash gate (a wet-in-wet stroke needs the whole footprint evenly moist) refused a sliver at the top left twice, so I do not
  ask for wet-in-wet. Cost: harder cloud edges and less soft blending in the sky.
- **Stone** (family `trumbull.stone`, wet on dry): wash question, then layers.
  1. One broad pale warm wash over the whole building block (the base recipe leaves window openings as paper in this wash and
     paints the glass later, as dark last accents). One connected passage.
  2. Dry. Four mid layers on dry paper. Each layer is a wide connected plane cut at a larger scale than one stone
     (`--layersmooth 5` mm, was 2): lit face, half-tone, shaded side. Hard but irregular edges. The coursing comes from
     the base's sparse stone-block glazes (ochre, raw sienna, burnt sienna), not from a blotch pattern.
  3. Dry. One shadow glaze across wall, window and roof edges on each shadow side (violet-leaning, now with burnt sienna in
     the box, so the glaze is brown-violet, not olive).
  4. Lit faces stay thin: `_lit20` with `--litl 72` makes the sunlit gable face keep its pale foundation with 20% fewer layers
     and no glaze, and `_lw` turns the cool share of its colour into yellow ochre so the lit face is one clean golden glaze with
     paper glowing through.
- **Foliage** (family `trumbull.foliage`, wet on dry): pale yellow-green mass first, darker sap green on the shaded side with
  light gaps; after the stone it overlaps. Distant and lower-left shrubs stay greyer and softer, no leaf detail.
- **Windows, arches, sign, slate:** ink-and-wash question. Dark glass is the last paint, on dry paper, hard edges; mullions,
  jambs and arch heads are restored with closing ink (they are 1 to 2 cells wide, too thin for a brush).

## Drawing (sepia ink, base `_sep8`)
- **Opening drawing** (18 lines, long single gestures, before any wash): the gable's slopes and corner pier, left tower edges and
  cornice, chimney edges and cornice, the small left gable, two roof edges, a few string-course bits. New this try: every line
  has a smooth hand wobble (about 0.5 px at 300 px, wavelength 16 px) with endpoints kept, so it reads as drawn, not ruled.
  Geometry is unchanged because the overlay on the target showed the lines sit on real edges.
- **Closing drawing** (110 short lines): windows only where they carry structure (lancets, the two arched windows, mullioned
  windows, lower arches, pole edges, sign blade). Lighter wobble (0.2 px). Nothing in the sky or over lit stone faces.

## Moisture and load
Everything is wet on dry, fully dry for each layer (paper state checked by the painter before each stroke): a medium-watery
load for planes, a lower-water load for the shadow glaze so edges stay crisp. Nothing wet touches a window. The compile preview
of this plan shows 91 pigment/region passes, all wet on dry, none wet on wet.

## Protected lights
Cloud lights are paper (the painter's own near-paper rule, plus one reserve on the brightest top-right cloud). No scattered
paper glints on the stone (`--litreserve 101`): the lit gable is kept light by `_lit20`, not by white flecks.

## Edges
Hard on roof lines, tower edges and window heads. Soft on one side only where a form turns (the tree, the sky toward the
horizon). Lost: the shaded pier into the shaded wall, the far stone into the sky haze. The diagonal wash-sweep streaks of
try 1 come from the painter's lane geometry; I have no safe setting for them (see "tried and took back").

## Values (what each stage should look like)
- After the first wash: one pale warm-grey block of the whole building, pale sky, no hard dark anywhere, cloud paper.
- After mid layers 1 to 4: lit gable face golden and light, the shaded sides already a mid brown (not paper), the planes read.
- After the shadow glaze: the building turns; shaded strips deepen to warm brown with a violet cast, slate roofs sit down.
- After last darks and closing ink: windows navy, sign, arches, recesses; structure restated; no ink in the sky.

## What would show failure
Shaded stone left as white paper until a late dark pass (the try-1 fault); olive or black shaded bands; blob camouflage
walls; white speckle on stone; diagonal wash streaks; cloud tiled in fragments; stray ruled lines; windows without mullions;
ink heavier than the paint under it.

## What I changed from try 1, and why
Try 1 painted the V096 base with no token or setting changes. This try changes the following, each from something I saw:
1. **`--recessmax 110`** (was the base's 150/105 rule). Shaded stone with a brightest channel under 105 was classed as a window
   recess, skipped every wash, and was painted nearly black at the very end. That is the "region arriving finished while its
   neighbour is untouched" and "texture arriving as a dump" tells, and the olive-black bands. With 110 only genuinely dark glass
   (brightest channel under 77, or blue under 110) is a recess; shaded stone is built by the layers and a glaze. Checked in the
   planned stages: the tower-side strip now has a mid wash at stage 2.
2. **`--layersmooth 5`** (was 2). Layers were cut from a value field smoothed over 2 mm, so every stone became a blob
   (camouflage, speckle, round holes, flat slabs). 5 mm makes the layers lit/half-tone/shade planes.
3. **`--paints` with burnt sienna added** (ochre, raw sienna, sienna, hansa, ultramarine, cerulean, sepia, sap green). Base
   `_pgreen` has no burnt sienna, so the shadow glaze was ultramarine plus raw sienna: olive. `_pbs` is not accepted as a token
   on its own, so I set the list directly.
4. **`_dk11`** (was `_dk13`): the target's shaded walls are mid brown, my darks were about twice too deep; windows still go dark
   through the recess path.
5. **`_lw` + `_lit20` + `--litl 72`**: the lit gable face as a thin golden glaze with paper glowing through (the default `litl`
   86 would catch only the brightest 15% of stone; measured lit gable face is L* 73).
6. **Sky family `baseMove` changed from "wet on wet" to "wet on dry"** (see Regions). No `_sk1`: I had added it for one graded
   wet sky passage, then dropped it because it adds a big wet passage I cannot check against the gate.
7. **`--litreserve 101`**: no paper glints on the lit stone. At 600 px the lit-stone rule reserved 918 cells as scattered paper
   glints; at this scale that is white speckle, which both the judges and I flagged.
8. **Hand wobble on both drawing files** (opening 0.55 px, closing 0.2 px at 300 px).

### What went wrong in the first two starts, and what I changed
Both starts were refused by the painter's wet-wash gate, after pass 1, with identical numbers: a small band-1 wet-in-wet sky
passage (`light/b1/p0/r4/s6`, 2646 cells, top-left sky beside the left tower, x 123 to 196, y 0 to 87 at 1200 px) found only
45% of its footprint moist where 70% is required.
- The first start also had `--recessclean 0` (windows washed over in the first wash), `--overlap 0.35` (fewer pale lane gaps)
  and paper glints. For the second start I took those three back, guessing they caused it. The identical numbers showed I was
  wrong: they were not the cause. Lesson: I changed three things on a guess and did not check against the gate.
- What the cause is: that sliver exists in the plain base recipe too (area 419 cells at 600 px, about the same shape), and it
  is wet-in-wet because my sky family asked for "wet on wet" (the planner makes a light wash wet-in-wet only when every region
  it touches has that baseMove). I do not know why it passed in try 1 (sheet state is different); I could not reproduce it.
- Fix: the sky family is wet on dry, so the plan has no wet-in-wet passage at all (checked in the compile preview).
- I did not switch the gate off (`--wetgate 0`). It is the paper-state check that stops a wet-in-wet stroke on half-dry
  paper, and the right answer to its refusal was to stop asking for that stroke.
- I lost two things by this: the `--recessclean 0` / `--overlap` ideas are not in this painting, and I saw only pass 1 before
  the refusal: a pale ochre block of the whole building mass with a ragged roofline and still some diagonal lane streaks. The
  streaks come from the painter's lane geometry and I have no safe setting for them.

## Critique points I rejected or discounted
- "Classic edge 9.45 / marks 7.21": pixel statistics that were high on a painting I judge blotchy; not tuned for.
- The numeric spread between judges (3.0 vs 2.0, a failed third judge, process 4.5 at 100% against 2 to 3 on the finished
  painting): too noisy to tune half points; I used only their direction and the named tells, and checked each tell against
  my own crops of the stage images.
- "Not a line-then-wash sequence": I keep the opening drawing; its fault was ruled, sparse lines, not the idea.
- "Whole sheet at one faint value": the first band of the ladder is always pale. I did not make it darker. I tried to make the
  first wash one connected block without window cut-outs, but the painter refused that plan (see "tried and took back"), so
  the first wash is the base recipe's again and I can only say what the later stages should do differently.
- The judges did not mention stray ink lines; I fixed them anyway.

## Plan for the stops
Look after the first wash, after mid layer 2, after the last mid layer, after the shadow glaze, before the closing drawing, and
at the end. If shaded stone or the tree goes wrong I revise pending passes only (darkgain, a reserve, the closing lines).
