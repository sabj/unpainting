# Third-party notices

This file lists third-party code in this repository, the dependencies it installs, the models some tools download, and the projects and data sources the code credits. Images and video are covered in [NOTICE](NOTICE).

## Code included

### EB Garamond (font)

- Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12)
- Licence: SIL Open Font License 1.1. The full text is in `demos/lab/fonts/OFL.txt`.
- Files: `demos/lab/fonts/eb-garamond-normal.woff2`, `demos/lab/fonts/eb-garamond-italic.woff2`, the typeface of Paint Lab (`demos/`).

## Dependencies

Installed by `npm install` (from `package.json`). None is redistributed in this repository.

| package | licence | note |
|---|---|---|
| sharp | Apache-2.0 | its prebuilt `@img/sharp-libvips-*` binary is LGPL-3.0-or-later, installed from npm, not redistributed here |
| webgpu | MIT | bundles Google's Dawn, BSD-3-Clause |
| @webgpu/types | BSD-3-Clause | |
| debug, ms, semver, detect-libc, @img/colour | MIT, ISC or Apache-2.0 | transitive |

`license-checker` on the installed tree: MIT 4, Apache-2.0 3, LGPL-3.0-or-later 1 (libvips), BSD-3-Clause 1, ISC 1. No GPL, AGPL or unknown licences.

Python, from `bench/scorer/requirements.txt`:

- numpy, scipy, scikit-image: BSD-3-Clause
- pillow: MIT-CMU (HPND)

Optional Python packages some tools import: opencv-python-headless (Apache-2.0; wheels bundle LGPL FFmpeg), torch and torchvision (BSD-3-Clause), segment-anything (Apache-2.0), onnxruntime (MIT), onnx (Apache-2.0). `playwright` (Apache-2.0) is used by one JavaScript tool.

## Models downloaded at run time

None of these is committed. Check each model's licence before redistributing its output commercially.

| model | used by | licence |
|---|---|---|
| Segment Anything ViT-B (Kirillov et al. 2023) | `tools/seg/segments.py`, `sam-points.py`, `subject-regions.py`, `select-drawing.py` | Apache-2.0 |
| torchvision keypointrcnn_resnet50_fpn, COCO weights | `tools/seg/face-mask.py` | BSD-3-Clause |
| U2-Net ONNX | `tools/seg/segment.py` | Apache-2.0 |
| Informative Drawings contour ONNX (Chan, Durand and Isola 2022) | `tools/seg/lines.py` | MIT |
| torchvision Mask R-CNN v2, COCO weights | `tools/seg/subject-regions.py` (via `pp/models.py`) | BSD-3-Clause |

## Ideas, constants and data credited in the code

These projects and sources informed the code. No code from them is included.

| source | licence | where credited | what was used |
|---|---|---|---|
| [Sudo Aquarelle](https://sudoaquarelle.com/) by Lionel Mora | none stated | `src/media/brush.mjs` (wash splats), `tools/paint-plate.mjs` (`--washsplat`, `--relief`, `--papergrain`), `src/media/km.mjs` (`--micro`) | ideas and a few constants: splat spacing and falloff, a lit paper relief, a paper grain amplitude; reimplemented in this project's own structure |
| [Inkwash](https://github.com/johnowhitaker/inkwash) by Jonathan Whitaker | MIT | `.agents/skills/watercolor-technique/references/SOURCES.md` | the idea of a sharp ink core with a soft bleed. `src/crop/inkwash.mjs` is unrelated and only shares the name |
| [pencil-rendering](https://github.com/kylemcdonald/pencil-rendering) by Kyle McDonald | none stated | `src/media/pencil.mjs` | the idea of a directional bite for graphite |
| Curtis et al. 1997, Figure 5 | paper | `src/crop/box.test.mjs` | Kubelka-Munk K and S values for several pigments |
| Bruce MacEvoy, [Guide to Watercolor Pigments](https://www.handprint.com/HP/WCL/waterfs.html), handprint.com | facts cited | `src/crop/box.mjs`, `src/crop/ciecam.mjs` | pigment masstones as CIECAM02 J, C, h, and mix recipes |
| CIECAM02 (CIE 159:2004; Moroney et al. 2002) | standard | `src/crop/ciecam.mjs` | colour appearance model constants |

## Papers the code implements or follows

- Curtis, Anderson, Seims, Fleischer and Salesin, "Computer-Generated Watercolor", SIGGRAPH 1997. Water, pigment and paper layers (`src/media/sheet.mjs`, `paper.mjs`), and Kubelka-Munk glazing (`src/media/km.mjs`).
- Kubelka and Munk, 1931; Kubelka, "New contributions to the optics of intensely light-scattering materials, part II", JOSA 1954. Haase and Meyer, "Modeling pigmented materials for realistic image synthesis", ACM TOG 1992.
- Deegan et al., "Capillary flow as the cause of ring stains from dried liquid drops", Nature 1997 (`src/media/sheet.mjs`, `wash.mjs`).
- Chu and Tai, "MoXi: Real-time ink dispersion in absorbent paper", SIGGRAPH 2005 (`src/media/sheet.mjs`).
- Kim, Moon, Lee, Mahadevan and Kim, "Hydrodynamics of Writing with Ink", Physical Review Letters 2011 (`src/media/pen.mjs`).
- Strassmann, "Hairy Brushes", SIGGRAPH 1986, and Baxter, Scheib, Lin and Manocha, "DAB", SIGGRAPH 2001 (`src/media/brush.mjs`, `src/media/gpu/web-brush.mjs`).
- Sousa and Buchanan, "Observational models of graphite pencil materials", Computer Graphics Forum 2000 (`src/media/pencil.mjs`).
- Chen et al., "Inverse Painting: Reconstructing the Painting Process", SIGGRAPH Asia 2024 (`src/paint/tuned/mass-plan.mjs`).
- Kirillov et al., "Segment Anything", ICCV 2023 (`tools/seg/`).
- Felzenszwalb and Huttenlocher, "Distance Transforms of Sampled Functions", 2012 (`src/eval/morph.mjs`).
- Ramer-Douglas-Peucker line simplification (`src/crop/simplify.mjs`, `src/util.js`), and Otsu's threshold (`src/eval/field.mjs`, `tools/seg/lines.py`).

The technique guide's own reading list is `.agents/skills/watercolor-technique/references/SOURCES.md`. The full literature review is in Part 1 of "What's a painting, anyway?": https://samjackson.org/writing/whats-a-painting-anyway-part-1/#reference-literature-review
