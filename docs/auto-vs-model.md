# Auto vs a model's painting script

Auto is the code planner alone. It plans washes from prepared studies and never looks at the picture while painting. A model in the [benchmark](../bench/README.md) writes its own [painting script](painting-script.md) instead.

Full pipeline reference: [How it paints](how-it-paints.md).

## Prepared inputs

<img src="img/auto-vs-model-inputs.webp" width="100%" alt="The picture, the prepared pencil lines, three studies from broad to fine, and the named forms">

- **Drawing**: pencil lines traced and ordered from a line drawing of the picture.
- **Three studies**: flat-colour simplifications of the picture (1 broad shapes, 2 middle detail, 3 fine detail and accents).
- **Named forms**: segmented regions such as `cat face`, `left eye`, `chest fur`, `background foliage`.

## How Auto paints

### 0. Pencil lay-in

Auto draws a light pencil lay-in first to place the main forms.

### 1. Cut each study into flat shapes

<img src="img/auto-vs-model-auto-cut.webp" width="100%" alt="Study 1, the outline of every wash cut from it, and a close up of the head cut into many pieces">

- Each study's colours are clustered; each connected patch of one colour becomes a shape.
- Slivers join a neighbour; near-white shapes stay bare paper.
- A complex area such as the cat's head becomes many small pieces.

### 2. Order shapes into washes by stage

<img src="img/auto-vs-model-auto-stages.webp" width="100%" alt="Auto's washes by stage, with a key: dotted edge wet paper, dashed damp, solid dry">

- Light and large first: pale washes over the big forms (soft forms start with one pale wash into clean water).
- Darker shapes next, glazed over dry washes.
- Small dark accents last.

### 3. Fill each wash with brush lanes

<img src="img/auto-vs-model-auto-zoom.webp" width="60%" alt="One wash with its numbered strokes, each as wide as the brush">

- Black outline: the wash shape. Coloured bands: numbered brush strokes with arrows showing pull direction.
- Auto picks the widest brush that fits and sweeps parallel overlapping lanes across the shape.

### 4. Palette and mixes

<img src="img/auto-vs-model-auto-paints.webp" width="100%" alt="The paints Auto chose for this picture">

<img src="img/auto-vs-model-auto-mixes.webp" width="60%" alt="Four washes: the colour aimed for, the mix in parts of 10, and the colour as it dried">

- Auto picks a subset of paints from the 16-pigment box to cover the studies' colours.
- Each shape gets one target colour and one mix (in parts of 10).

### 5. Brushes

<img src="img/auto-vs-model-auto-brushes.webp" width="80%" alt="Auto's brushes, widths to scale, from a 38 mm wash brush down to a 3 mm round">

- Physical brush widths from a 38 mm wash brush down to a 1.2 mm rigger.

## How a model's script differs

| | Auto | Model script ([painting-script.md](painting-script.md)) |
|---|---|---|
| Shapes | Cut automatically from a study | Passages drawn in millimetres, following forms such as a stripe or an ear |
| Mixes | One per study shape, often many pigments | Named per passage with a swatch or dilution; usually fewer pigments |
| Strokes | Parallel lanes filling each shape | Custom stroke paths, marks and pressures, with clean water first for soft edges |
| Order | Fixed light-and-large to dark-and-small stages | Chosen by the model |
| Drawing | Automatic pencil lay-in (or ink on pen works) | Chosen by the model: pencil, pen or none; keep, drop, re-time or draw lines |
| Looks | None | Half-size test paintings (`./unpaint look`) within the 3.0-unit budget |
| Reasons | None | Written per passage |

See [a real passage from a model script](painting-script.md#a-real-passage), the [benchmark ladder](../bench/README.md#levels) and [scoring](../bench/docs/scoring.md).

Picture credit: Mittens is a photograph by Sam Jackson, modified with an image generator ([NOTICE](../NOTICE)).
