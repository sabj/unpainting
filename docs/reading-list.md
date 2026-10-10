# Prior work and credits

The painter combines ideas from published work. It does not ship code from these projects except where [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) says so.

Planning strokes from a finished picture:

- Aaron Hertzmann, "[Painterly rendering with curved brush strokes of multiple sizes](https://doi.org/10.1145/280814.280951)", SIGGRAPH 1998.
- Aaron Hertzmann, "[Paint by Relaxation](https://mrl.cs.nyu.edu/publications/painterly-relaxation/)", Computer Graphics International 2001.
- Huang, Heng and Zhou, "[Learning to Paint with model-based deep reinforcement learning](https://doi.org/10.1109/ICCV.2019.00880)", ICCV 2019 ([code](https://github.com/hzwer/ICCV2019-LearningToPaint), MIT).
- Chen, Wang, Curless, Kemelmacher-Shlizerman and Seitz, "[Inverse Painting](https://doi.org/10.1145/3680528.3687574)", SIGGRAPH Asia 2024 ([code](https://github.com/ArmastusChen/inverse_painting)), and Li, Lin, Měch, Yumer and Ramanan, "[Photo-Sketching](https://doi.org/10.1109/WACV.2019.00154)", WACV 2019. Their staging ideas informed the experimental planners. No code or weights from them are included.

Finding regions and subjects (`tools/seg/`, which splits a target into the shapes a plan paints):

- Kirillov et al., "[Segment Anything](https://arxiv.org/abs/2304.02643)", ICCV 2023 (SAM ViT-B). Without its checkpoint, `segments.py` falls back to k-means color clusters.
- He, Gkioxari, Dollár and Girshick, "[Mask R-CNN](https://arxiv.org/abs/1703.06870)", ICCV 2017, with torchvision's COCO weights, for people and animals in a target.
- Qin et al., "[U²-Net: Going deeper with nested U-structure for salient object detection](https://arxiv.org/abs/2005.09007)", Pattern Recognition 2020, for the main subject's mask.

Finding lines in a picture (`tools/seg/`, which turns a target into candidate pen lines):

- Chan, Durand and Isola, "[Learning to generate line drawings that convey geometry and semantics](https://arxiv.org/abs/2203.12691)", CVPR 2022 (Informative Drawings), the line model in `lines.py`.

Paint, paper and brush physics:

- Curtis, Anderson, Seims, Fleischer and Salesin, "[Computer-Generated Watercolor](https://grail.cs.washington.edu/projects/watercolor/)", SIGGRAPH 1997. The water, pigment and paper layers behind `src/media/sheet.mjs`.
- P. Kubelka and F. Munk, 1931, and P. Kubelka, "[New contributions to the optics of intensely light-scattering materials, part II](https://doi.org/10.1364/JOSA.44.000330)", JOSA 1954. Pigment layers and glazes in `src/media/km.mjs`.
- Strassmann, "[Hairy brushes](https://doi.org/10.1145/15886.15911)", SIGGRAPH 1986, and Baxter, Scheib, Lin and Manocha, "[DAB](https://doi.org/10.1145/383259.383313)", SIGGRAPH 2001. The bristle brush in `src/media/brush.mjs`.
- Deegan et al., "[Capillary flow as the cause of ring stains from dried liquid drops](https://doi.org/10.1038/39827)", Nature 1997. Edge darkening as a wash dries.
- Chu and Tai, "[MoXi: Real-time ink dispersion in absorbent paper](https://doi.org/10.1145/1073204.1073221)", SIGGRAPH 2005. Water on damp paper runs along the fibres and is held up across them in `src/media/sheet.mjs`.
- Kim, Moon, Lee, Mahadevan and Kim, "[Hydrodynamics of writing with ink](https://doi.org/10.1103/PhysRevLett.107.264501)", Physical Review Letters 2011. The dip pen in `src/media/pen.mjs`: slow strokes are wide and dark, fast ones thin.
- [Sudo Aquarelle](https://sudoaquarelle.com/) by Lionel Mora. Its loaded-brush splats (soft round deposits of water and pigment), lit paper relief and paper grain inspired `--washsplat`, `--relief` and `--papergrain`. This repository reimplements those ideas, with a few of its constants, and contains none of its code.
- [Inkwash](https://github.com/johnowhitaker/inkwash) by Jonathan Whitaker. Its sharp ink core with a soft bleed informed the ink notes in the technique guide. `src/crop/inkwash.mjs` only shares the name.

Agent painting and process evaluation:

- "[Paint What You See: Benchmarking Dexterous Visual Tool Use in Multimodal Agents](https://arxiv.org/abs/2608.25417)", 2026. Agents paint toward a reference with tool calls; no physical paint simulation.
- "[Loomis Painter: Reconstructing the Painting Process](https://arxiv.org/abs/2511.17344)", 2025. Recovers the order a painting was made in.
- "[Local Brushstroke Quality Assessment via Vision-Language Feedback](https://arxiv.org/abs/2607.16330)", 2026. Scores individual brushstrokes.
- "[Hack-Verifiable Environments: Towards Evaluating Reward Hacking at Scale](https://arxiv.org/abs/2605.20744)", 2026. Measures reward hacking; see [honesty.md](honesty.md) for how this project guards against it.

Further reading: the [literature review in Part 1](https://samjackson.org/writing/whats-a-painting-anyway-part-1/#reference-literature-review).
