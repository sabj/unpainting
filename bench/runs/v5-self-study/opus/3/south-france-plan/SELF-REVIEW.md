# Self-review of try 2 (SF, round V5)

## Part 1: my own judgement, written before reading FEEDBACK.md

(Composed from compare.png, stages.jpg and previous-painting.png before I opened FEEDBACK.md.)

### What works
- Palette: there's no pink this time. Terracotta roofs, olive greens and a cool blue-green for the distant hills are the
  right family.
- The two cypress groups (upper centre) and the dark side of the canopy read as darks in roughly the right places.
- The focal tower houses still sit on the right at the right size, with sienna roofs.

### What is wrong (in order of how much it costs the picture)
1. **Camouflage patchwork.** The whole sheet is thousands of blotches of almost the same olive value. The target is built
   from big rounded tree masses with a sunlit yellow-green side and a dark blue-green shadow side. In the painting no single
   tree reads, not even the big foreground pine, which is the second focal mass. The value structure is gone: one mid
   olive with dark specks.
2. **The pen doesn't read.** The task asked for an urban sketch, pen plus light wash. The ink is thin grey hairlines that
   disappear under the wash, so the drawing carries no structure. The houses especially have lost their edges, eaves
   and windows (the windows aren't visible at all).
3. **The washes aren't light.** An urban sketch keeps the wash pale and lets the paper breathe. Here the sheet is covered
   edge to edge in mid-value olive, and the lights that are left are random white holes (top left, centre) rather than
   the sunlit terraces and lit walls.
4. **Stark white rectangles** on the tower walls (the two reserves). They look like stickers, not lit walls.
5. **Horizontal lane tiling and streaks** in the ground (from the `_spl` lane-planner revisions), plus a diagonal pale
   stripe in the first ground passes.
6. The sunlit ochre terraces at top left, a key warm plane in the target, came out as white paper with peach scraps.

### When it went wrong
- Passes 1-6 (the 10% frame): a full-sheet peach ground with a long diagonal unpainted stripe. That isn't how a sketcher
  starts a first wash, and it already set up the patchwork.
- Passes 7-15: the lane-planner revisions added brick tiling.
- Passes 16-35: the shadow passes were laid as many small separate shapes (`--minshapecells 600` was still far too
  small), so the canopy broke up. The touch-up passes then darkened everything to one mid olive.
- The closing pen came last and was too thin to rescue anything. Using ink to rescue a weak wash is also the wrong fix
  in principle.

Process plausibility: the stages do go light to dark, which is good. But the 10% frame (a peach sheet with a diagonal
stripe) and the 25% frame (a yellow sheet with banding) don't look like a person painting, and the pen drawing is
invisible at 10%, so the sequence doesn't read as "pen first, then wash".

### My scores
- Finished painting: **2.5 / 10** (palette OK; structure and value design lost; patchwork; pen invisible).
- Process plausibility: **2 / 5**.

### What I wanted for try 3 before reading the critique
- Make the pen visible and make it carry the picture: a darker, wider opening drawing that stays visible through pale
  washes, then a selective closing pen at the focal houses and the pine.
- Much lighter and fewer washes, in bigger shapes (much higher minimum shape size), with paper left showing.
- No rectangular reserves on the walls. Let the painter's own near-paper light detection keep the lights.
- No lane planner, and fewer paints (fewer full-sheet passes).

## Part 2: the judges' critique (FEEDBACK.md), where I agree and disagree

Scores: composite 5.11; vision 3.0 (Kimi 3, GLM 4, Qwen 2); classic value 5.6, edge 9.2, marks 6.84. Progression:
1.5 / 1.5 / 2.0 / 3.0 / 4.0, mean 2.4; 0 of 2 judges found the order human.

Where I agree
- **Marks/texture 2.0, edges/detail 2.33.** Agreed. This is the patchwork plus the invisible pen. These are the biggest
  defects, and they match my items 1 and 2.
- **Early stages 1.5: "whole sheet at one faint value, as if faded in" and "flat evenly-toned slabs".** Agreed, and it
  is the same thing I saw: full-sheet ground passes in one pigment at a time make the sheet look like a filter fading
  in. A person sketching draws in pen first (visible at 10%) and then washes. The plan should give the 10% frame a
  visible pen drawing, and keep whole-sheet single-tone grounds as pale as possible.
- **"Texture arriving as a dump, everything sharpening at once late."** Agreed. The touch-up and dark passes put all the
  small marks in at the end. Bigger shapes and lighter darks help.
- **"Cut or scalloped wash edges, round holes".** Agreed. These are the white holes and the rectangles. The pen crowns
  were scalloped too (equal bumps, like cartoon clouds).

Where I disagree, or discount
- **Progression at 100% = 4.0.** Too generous. The finished sheet still looks generated (patchwork), so I won't treat the
  late stages as solved.
- **Classic edge 9.2 and marks 6.84.** These pixel-statistics scores reward high-frequency blotch. I won't chase them:
  the skill says never judge by pixel error. Losing some classic-marks score for bigger, calmer shapes is fine.
- **Composition/values 4.33.** If anything this is high. The value structure is mostly lost (one mid olive), and that's
  where I most want to improve: a light sheet with a few darks.
- **GLM's 4.0 overall.** Noisy (spread 1.0, scores 3 to 5). I weight Kimi's consistent 3.0 and my own reading more.
- The judge note asks for "pen-then-wash sketching order". I agree with the order, but I won't make the pen heavy to
  please it. Heavy ink over a blotchy wash is a known failure (subject-c, 10-06). The pen must be readable, and the wash must
  get calmer at the same time.
