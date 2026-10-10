# Sources

A passage is a wash or group of marks with one job.

These sources support technique choices and material modeling. Test each technique against its reference image in the current simulator.

## Simulation papers

- Curtis, Anderson, Seims, Fleischer and Salesin, [*Computer-Generated Watercolor*](https://grail.cs.washington.edu/projects/watercolor/), SIGGRAPH 1997: water flow, paint laid down, water in paper pores, raised paper texture and glazing.
- Small, [*Simulating watercolor by modeling diffusion, pigment, and paper fibers*](https://doi.org/10.1117/12.44417), SPIE 1991.
- Van Laerhoven and Van Reeth, [*Real-time simulation of watery paint*](https://doi.org/10.1002/cav.95), 2005.
- Deegan et al., [*Capillary flow as the cause of ring stains from dried liquid drops*](https://doi.org/10.1038/39827), Nature 1997.
- Kubelka, [*New contributions to the optics of intensely light-scattering materials, part II*](https://doi.org/10.1364/JOSA.44.000330), JOSA 1954; Haase and Meyer, [*Modeling pigmented materials for realistic image synthesis*](https://doi.org/10.1145/146443.146452), 1992.
- Strassmann, [*Hairy Brushes*](https://doi.org/10.1145/15886.15911), SIGGRAPH 1986; Baxter, Scheib, Lin and Manocha, [*DAB*](https://doi.org/10.1145/383259.383313), SIGGRAPH 2001.

## Reference implementations

- [Sudo Aquarelle](https://sudoaquarelle.com/), Lionel Mora: water and pigment held in the brush, raised paper texture, mottled pigment texture and transparent dried layers. Technique inspiration; no code is included in these guides.
- [Inkwash](https://johnowhitaker.github.io/inkwash/about), Jonathan Whitaker, and its [source](https://github.com/johnowhitaker/inkwash): how ink meets the paper, spreads and sets.

## Technique references

| Decision | Supporting sources | Guide |
|---|---|---|
| Dry brush, flowing paint load and how the brush meets the paper | [Winsor & Newton demonstration](https://www.youtube.com/watch?v=72sGLG0fQPc); [Andy Griffiths's wet/dry techniques](https://www.solvingwatercolour.com/24-essential-watercolor-painting-techniques/) | [Brush-water continuum](brush-water-continuum.md); [dry detail](dry-detail-and-fast-studies.md) |
| Fur direction, value groups and selective masking | [Anna Mason](https://www.youtube.com/watch?v=Ql_dmqDH9k8); [Rebecca Rhodes's curly fur](https://www.youtube.com/watch?v=_hM0z6PO1XQ) and [nose study](https://www.youtube.com/watch?v=V-QyeyoWRjw); [Emily Olson](https://www.youtube.com/watch?v=ryzkAsjIi9E) | [Fur and masking](fur-value-masking.md); [value passages](fur-and-value-passages.md) |
| Connected foliage, branches and sky edges | [Paul Clark's trees](https://www.youtube.com/watch?v=ygV5PuvzjE4) and [skies](https://www.youtube.com/watch?v=ZDnlFOgd6Fk); [Oliver Pyle's trees](https://www.youtube.com/watch?v=wU6jjU-CwYs) and [skies](https://www.youtube.com/watch?v=pn5C1SSxucs); [Chris Jones's tree](https://chrisjonespaints.co.uk/tutorial-how-to-paint-a-watercolour-tree/) | [Trees and skies](trees-skies.md) |
| Architecture, drawing and shadow planes | [David Cox's treatise](https://www.gutenberg.org/cache/epub/65962/pg65962-images.html); [Harry Willson's *The Use of a Box of Colours*](https://www.gutenberg.org/ebooks/32681); [Paul Clark's village](https://www.youtube.com/watch?v=MVyxMQi7Z7U); [Toby Haseler's line and wash](https://www.youtube.com/watch?v=71lPMn5MwvU) | [Architecture studies](architecture-books.md) |
| Lifting, masking and paper choice | [Winsor & Newton on lifting](https://www.winsornewton.com/blogs/guides/how-to-lift-watercolour) and [paper](https://eu.winsornewton.com/blogs/guides/best-paper-for-watercolour); [Daniel Smith on masking](https://danielsmith.com/tutorials/watercolor-masking-fluid/) | [Execution and brush checks](whole-painting-and-calibrated-contact.md) |

Keep observed mark appearance, artist explanation and simulator adaptation distinct. Edited footage does not establish drying time, water ratio, pressure or stroke count. A final illustration alone does not establish its application order.
