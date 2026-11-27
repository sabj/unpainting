# How it paints

A painting needs the target image, a line drawing file and one or more studies. A study is a simplified version of the picture in flat colours. The painter lays the drawing and lets it dry. Then it lays the washes the studies describe, from light to dark. It saves the sheet as it goes.

This page lists, for each stage of painting, the files that do the work. A change to the pipeline must update this page (`tools/doc-paths.test.mjs` fails if this page names a file that does not exist).

![Trumbull College: photograph, target, and the painting building from blank paper](img/hero-trumbull.webp)

## From a script to a painting

This part walks through what the simulator does with a plan. The plan is either Auto's, worked out from the studies, or a model's [painting script](painting-script.md). Either way, the painter lays it one passage at a time. A passage is one wash or one group of marks.

### The paper

The sheet is a grid of small squares called cells. Each cell keeps track of the water on its surface, the water inside the paper's pores, and the pigment. Pigment can be floating in the water, settled on the paper or soaked into the pores (`src/media/sheet.mjs`).

The paper has a height map of curved fibres and fine grain, based on real cold-press paper (`src/media/paper.mjs`, `src/media/paper-relief.mjs`). The gaps between its fibres set the pressure needed for water to enter each cell (`src/media/fibre-throat.mjs`). It is also sized, which means dry paper resists water. So a stroke on dry paper stays where the brush went.

### The brush and its water

A brush is a row of bristles with a reservoir of paint and water in its belly (`src/media/brush.mjs`). Bristles stick together in clumps. Water and pigment are tracked separately. More pressure puts more of the brush on the paper. Paint passes from a bristle to a cell only when the liquid on the bristle reaches down to the paper's grain there.

A brush full of water lays a smooth film. A nearly dry brush catches only the high points of the grain and leaves broken colour. This is dry brush. Brush sizes are in `src/paint/brushes.json`.

Pressure brings the bristles onto the crests; liquid bridges more hollows as the tuft fills (`src/media/tuft-section.mjs`). Dry paper can pull paint from damp bristles even below their free-water threshold. A dip restores a finite supply at the requested concentration, with a small, smooth gradient across the tips (`src/media/brush-load-variance.mjs`). The supply falls as paint leaves the brush and is restored only by a dip.

### How a wash is laid

A wash is laid as parallel lanes (`src/paint/methods/sweep-fill.mjs`, `src/paint/methods/script-marks.mjs`). The brush sweeps across the shape, then comes back along the next lane. Each lane overlaps the one before it. Auto overlaps by 30% of the brush width. A model's script gets 30 to 55%.

A hand is never perfectly even, so each lane has a small tilt and bow, and the brush is recharged after a few lanes. The overlap lets the wet bead at the edge of one lane flow into the next. The wash then dries as one even layer, not as separate stripes.

### Wet and damp paper

How wet the paper is when the brush touches it changes the result.

- On dry paper, the paint keeps its shape and dries with a hard edge.
- On wet paper, the paint spreads and mixes with what is already there. This is wet into wet.
- On damp paper, the paint spreads a little. Damp paper is used to make an edge soft.

For wet into wet, the painter first lays clean water over the area with a clean brush. Then it checks that the paper is moist enough before it adds paint (`tools/painter/wet-bed-prep.mjs`). A script can also set `into`, which lays a passage into the one just before it while that one is still wet.

### Drying

Between passages the painter waits for the sheet to dry, unless the script says otherwise (`src/paint/methods/wetdry.mjs`). Drying is not a timer. The simulator measures the water on the surface and in the pores. It waits until the paper is dry enough, or wet enough, for the next passage.

A passage laid beside damp paint waits for its neighbour to lose its shine. The wait grows from the ordinary clock to steps of at most two seconds between measurements. As the measured surface water approaches the gloss limit, it slows again to preserve the original admission-time resolution.

Water evaporates faster at the edge of a wash. More water flows out from behind to replace it and carries pigment with it. So the edge dries darker. Where water runs back into a drying wash, it pushes pigment aside and leaves a backrun, the pale cauliflower shape painters know well. Its advancing water must cross the same fibre throats as the outer wash edge: a fibre edge holds it until the puddle supplies enough water head, while a path along the fibre needs less head (`src/media/backrun.mjs`). Water and pigment still move together, and the pigment piles up where the front stops.

Only the free water above the paper-held layer levels as a liquid film. A thin part of the film resists flow more than a deep part; the two sides of each cell face contribute their hydraulic resistances in series. As either side reaches shine-off, that connection closes continuously. A tiny rounding difference at shine-off therefore cannot open a channel carrying a finite amount of water and paint (`src/media/film-mobility.mjs`).

Fast drying can finish the last pore evaporation in place once the whole sheet has no surface film or wet surface cells, and the pores are below the threshold for wicking. It keeps the pigment in the same cells and phases as ordinary drying. Until then, the remaining water continues through the transport steps, even when the film is very thin.

An unwatched dry can accelerate its minimum wait after measuring a film below the connected-film floor, while preserving the full physical waiting time in steps of at most half a second. Only a measured sub-threshold trace permits fourteen-second chunks in the later kinetic tail; thicker films retain seven-second chunks. Both paths still subcycle water and pore transport and finish their implicit solves before applying flux. The GPU observes the first fast batch near the film's estimated evaporation time, then checks actual wetness and the whole-sheet pore gate before stopping.

After an initial measurement, a film entirely below the connected-film floor can complete the minimum levelling wait with kinetic steps of at most half a second. The wait still covers the same physical time before entering the usual drying tail. CPU and GPU use the same rule. Watched drying keeps its requested checkpoint times.

On the GPU, a previously quiet surface is checked again in each step before levelling. If water collects into a mobile film, that film levels in the same step. Fast drying uses the ordinary adaptive solver budget; it does not impose a shorter solve just because the wash is drying.

The GPU's parallel iteration budget controls how the solve runs, not when it may stop. A box still above the residual tolerance continues in one workgroup before its water and pigment move. The continuation uses the same matrix, tile preconditioner and sums as the parallel solve. Only converged boxes produce flux. A numerical breakdown or the 8,192-iteration safety ceiling reports an error on the next solver status read; it cannot be accepted as convergence. The next steps increase their parallel budget from the completed solve's actual iteration count.

Water and pigment transport follow the same rule: the parallel budget is a scheduling choice. A box finishes any remaining donor-limited rounds before backruns or drying. This lets quiet washes use fewer dispatches without changing their water, pigment or time step.


### Glazes

When a wash dries, it is fixed as its own layer. The next wash is laid over it as a glaze. The layers are combined with a simple optical model, so a thin blue over yellow looks different from blue and yellow mixed in the dish ([pigments and paper](pigments-and-paper.md)). New water lifts only a little of a dried layer. Staining paints lift less.

### Edges

A wash laid on dry paper has a hard edge on every side. Painters soften an edge by running a clean, damp brush along it while the wash is still wet. The painter does this too (`src/paint/techniques/soften-lift.mjs`). A script can ask for soft edges with `edges: lost`, or for hard ones with `found`. A script can also leave bare paper, called a light, by listing it in `lights`. The painter works round the light and never paints across it. Masking fluid does the same job and is rubbed off at the end.

### Granulation

Some pigments settle into the hollows of the paper as they dry. This makes a grainy texture. Ultramarine, cerulean and the earth colours do it. The staining paints such as phthalo blue dry smooth. A wetter or slower-drying wash granulates more. Landing on fibres follows particle settling and diffusion; collection in hollows takes time in a connected surface film. As that film recedes, loose grains move down slopes at a rate limited by their particle drag. Water held among the fibres cannot keep sliding or scouring the grains (`src/media/grain-water.mjs`). Paint Lab’s WebGPU shader uses the same settling, scour mobility, particle drag and slope-convergence limit as the painter and the Lab CPU sheet.

### Pen and pencil

A pencil drawing does not move when it gets wet. A pen drawing is ink from a dip pen. Pressure and speed change its width and darkness, and it runs low as the nib empties (`src/media/pen.mjs`). The pen's ink is either waterproof or soluble. Soluble ink can be moved by a wash laid over it. The pen and pencil are covered in [ink](ink.md).

### What the video records

The painter saves a frame of the sheet at set points as it works, such as the end of each pass and when the paper has dried. With `--video 1` it keeps all of them and makes an MP4 (`tools/speed/frame-policy.mjs`). `frames.json` says which stage each frame belongs to. A frame never loses paint unless paint was taken off on purpose (`src/paint/film-painted.mjs`).

### What it does not do yet

- Lifting paint back off dried paper is weak. New water lifts only a little. A blotting step exists in `src/media/sheet.mjs`, but no painting step uses it.
- Erasing works on pencil only.
- A wash lane is straight. A curved wash must be written as separate strokes.
- A passage cannot be soft on one side and hard on the other.
- A script cannot return to an earlier wash while it is still wet. Only the passage just before can be wet.

## Rules at every stage

- There are two modes, and their results are never compared or averaged. By default the painter looks at the subject once for each passage, at the scale of a shape. In strict mode (`--notargetlooks 1`) it never reads the target after planning.
- Nothing may be tuned to one picture. That bans a gain that hides an engine error, a constant fitted to one subject and anything tuned to raise a score. `npm test` fails on code that names a benchmark picture or a file called `tuned`, `fitted` or `per-subject` (`tools/guard/subject-scan.mjs`, `src/paint/overfit.test.mjs`).
- Looking and correcting at the scale of a brush or a shape is painting. Working pixel by pixel is copying. So is using so many strokes that they stop looking like brushwork. Hill climbing is copying too.
- The plan comes from the drawing file and the studies. The painter never pulls lines from the picture and never plans washes from it.
- Fail loudly. The run stops if a Python environment, SAM checkpoint, line file, study or GPU is missing. `npm run doctor` checks them (`tools/doctor.mjs`, `src/paint/doctor.mjs`). The run also stops, with the reason, if it is given an option that has been removed (`src/paint/removed-options.mjs`).

## Code stages

`tools/paint-plate.mjs` runs seven stages from `tools/plate/`. They share one `ctx` object and run in the order set by `tools/plate/load-order.mjs`. `src/paint/recipe.mjs` puts the default flags first on the command line. `--recipe none` turns that off.

| Stage | File | Does |
|---|---|---|
| 1 | `tools/plate/setup.mjs` | options, source image, target guard, source of the lines |
| 2 | `tools/plate/plan.mjs` | paints, drawing medium, wash plan from the studies |
| 3 | `tools/plate/sheet.mjs` | brushes, sheet, looks at shapes, marks, scrap swatches |
| 4 | `tools/plate/pen.mjs` | video frames, pen drawing plan |
| 5 | `tools/plate/drawing.mjs` | order of work, drawing steps |
| 6 | `tools/plate/paint.mjs` | paint loop |
| 7 | `tools/plate/finish.mjs` | masking removed, pencil rubbed out, closing pen, output files |

A choice about the painting belongs in the plan. A technique belongs in `src/paint/techniques/` or `src/paint/methods/`. The physics belongs in `src/media/`.

## 1. Planning

An image model draws a clean line drawing. `tools/seg/trace-drawing.py` traces it and `tools/seg/order-strokes.mjs` puts the lines in order. The result is `--drawingfile STEM` ([line files](plan-format.md#line-files)). Another image model simplifies the picture into flat studies (`--washplan STUDY.png[:MIN[:glaze]],...`). A model's [painting script](painting-script.md) can replace the plan from the studies (`--washplan script:FILE.json`). `--valueplan` sets the sheet, the drawing steps, the paints and the order (`src/paint/pipeline-plan.mjs`). Stroke plans run with `node tools/run-plan.mjs` ([plan format](plan-format.md)). The skills for agents are `.agents/skills/painting-planner/SKILL.md`, `.agents/skills/watercolor-technique/SKILL.md`.

## 2. Finding regions

Before painting, `src/crop/segment-prep.mjs` runs `tools/seg/segments.py` on the target to find its regions. The result is cached by the picture's SHA-256 hash. The run fails without SAM and its checkpoint.

## 3. Shapes from the studies

`src/paint/methods/study-washes.mjs` builds the wash plan from the studies without reading the picture. It scales each study to the sheet. The run stops if the shapes differ by more than 2%. It groups the study's colours. Each connected patch becomes a shape. Thin slivers join a neighbour. Near-white stays bare paper. The lightest and largest shapes go first, then darker shapes over dry washes, and the darkest accents last. A soft named part such as a face, fur, sky or water starts with one pale wash into clean water. Each later study adds only what is darker than the layers above it. The paints come from `src/crop/palette.mjs`, or from `--paints`.

## 4. Technique for each shape

| Technique | Code |
|---|---|
| Flat wash, wet on dry | `src/media/wash.mjs` |
| Wet on wet: clean water first, then pigment | `tools/painter/wet-bed-prep.mjs` |
| Glaze over dried, fixed paint; masking fluid (lifting and blotting are weak or unused) | `src/media/sheet.mjs` |
| Dry brush | `src/media/brush.mjs` |
| Softened edge | `src/paint/techniques/soften-lift.mjs` |
| Shaped marks | `src/paint/techniques/shaped-marks.mjs` |

Before a passage, the painter tests the loaded brush on a scrap of the same paper. That sets how much paint the brush carries (`src/paint/methods/scrap-swatch.mjs`).

## 5. Brush and strokes

Brushes: `src/media/brush.mjs`, with physical sizes in `src/paint/brushes.json`. Paths: `src/paint/methods/sweep-fill.mjs`, `wash-strokes.mjs`. A script's washes (`script-marks.mjs`) are laid in lanes. The lanes overlap by 30 to 55% of the brush width. They pivot and bow like a wrist and arm.

## 6. Wet physics and drying

The sheet is a grid of cells. Each cell tracks the water on the surface, the water in the paper's pores, and the pigment that is floating, settled or in the pores ([pigments and paper](pigments-and-paper.md)). Code: `src/media/sheet.mjs` (`sheet-kernel.mjs` on the CPU, `src/media/gpu/stepfull.wgsl` on the GPU) and `src/paint/methods/wetdry.mjs`. `--strict 1` stops the run if the physics breaks a rule. Otherwise `continued-checks.json` records it.

Before laying a stroke, contact prediction follows the same brush geometry and checks its footprint and neighboring paper. Row, tuft and section brushes reuse bounded observation buffers; a section's prediction evaluates each cell only until that cell has entered the footprint. The physical brush still evaluates every contact. When a CPU brush works against the GPU sheet, newly exposed window rectangles travel together in one readback, preserving cells already written on the CPU. Fast mode uploads disjoint row spans of actual writes while keeping the original logical stroke bounds and flow order (`src/media/gpu/cpu-demand-window.mjs`, `src/media/gpu/rect-transfer.mjs`, `src/media/cpu-stroke-dirty.mjs`). A tracked section stroke activates its brush pigments and the sheet's existing wet and top-layer pigments, including every pigment it can pick up; other CPU writers keep the all-pigment bound.

The fine drawing carries new ink or graphite to the painting through only the changed coarse cells. On a GPU sheet it reads their wet-recipient mask and that pigment's floating and deposited amounts, performs the same CPU addition and clamp, and writes only those pigment amounts back (`src/media/gpu/pigment-cells.mjs`). Water, other pigments, resist and dried layers stay resident. This partial read never certifies whole tiles as fresh.

![A real wash by Winslow Homer beside a simulated flat wash and graded wash on the default cold-press paper](img/paper-texture.webp)

## 7. Looking at the picture

In the default mode, each passage reads the target once as it is laid. It reads only the shape's average, and the paint is adjusted by how much darker the shape still needs to be (`src/paint/methods/shape-deficit.mjs`). In strict mode the paint is fixed during planning. `src/paint/step-backs.mjs` and `src/paint/painting-look.mjs` decide when a look is allowed. The target guard seals the target and its maps when painting starts (`tools/guard/no-target.mjs`, `tools/guard/seal-maps.mjs`; [honesty](honesty.md)).

## 8. Lines

A pen drawing goes down first and dries before the washes. A pencil drawing goes down in phases (`src/paint/methods/drawing-phases.mjs`). The first light lines go down before the first washes. Each other line goes on dry paper just before the wash that needs it. A model's script may time the lines itself. The lines come only from the drawing file (`src/paint/line-source.mjs`). Only their darkness is read from the target ([ink](ink.md)). The pen and pencil code is in `src/paint/methods/` (`drawing-*.mjs`, `ink-*.mjs`, `pencil-*.mjs`, `medium-decision.mjs`).

![A pen line that changes pressure and speed, fresh ink pulled with clean water, and ink drawn over a dried wash](img/technique-inking.webp)

## 9. Finish

After all the washes are dry, `tools/plate/finish.mjs` removes masking fluid, rubs out any pencil that is not kept, and draws the closing pen lines. It writes `painting.png`, `wash.jpg`, `ink.jpg`, `frames.json`, the stage frames, `run-card.json`, `target-guard.json`, `cheat-risk.json`, `marks.json` and `pipeline-plan.json`.

A finer final render can show wash edges between cell centres and the same paper's grain below the cell size (`src/media/subcell-grain.mjs`). It reconstructs the deposited pigment, conserving each layer's total; interior cells keep their own pigment and boundary cells share theirs locally. It does not rerun water flow or recover subject features absent from the simulation. Resizing a finished image alone adds no such detail.

The renderer sums contiguous pigment planes and records each pigment's support in the same read. Only that support and its interpolation ring are reconstructed. Layer contours are shared, and zero base sums skip neighbour calculations. The contour, grain weights and order of each cell's pigment additions are unchanged.

A tiny deposited core can fall between every pixel centre at a 2× export. If point sampling misses an occupied cell completely, the renderer integrates that same contour over the finite pixels. Horizontal integration is exact and vertical integration is adaptive; the usual pigment balance then preserves each paint’s deposited total. No pigment, contour or grain is invented. Uniform full and empty spans use exact constant fills.

The paper-field convolutions skip bounds checks for interior taps and share clamped row offsets (`src/media/gaussian-field.mjs`). Their kernel, tap order and precision are unchanged, so the sampled grain and final pigment bytes stay the same.

## 10. Judging

Scores never feed back to the painter: [honesty](honesty.md) for the guard, [judging](judging.md) for measurements, [scoring](../bench/docs/scoring.md) for the benchmark.
