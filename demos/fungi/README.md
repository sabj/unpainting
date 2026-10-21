# Spore Studies

A buildless, one-page browser demo: pure JavaScript mushroom geometry painted with Unpainting materials. Four recognizable mushroom forms, 36 seeded traits, continuous morphing, endless evolution, and 2400 × 2000 PNG export. Code is covered by the repository's [MIT license](../../LICENSE). All imagery is generated locally; no external assets, fonts, APIs, or flower-library code are bundled.

## Run

From the repository root:

```sh
python3 -m http.server 8000 --directory demos
```

Open <http://localhost:8000/fungi/>. Serve `demos/`, not only this folder: the demo imports the browser media modules in `demos/lab/media/`, and **Open in Paint Lab** hands the plate to the lab at the site root (`demos/index.html?import=mushroom`). The old `/mushrooms/` path redirects here. `tools/lab/build-site.mjs` publishes this folder to GitHub Pages at `/fungi/` with no build step.

## Use

- Enter any text seed, or use the die to choose a random one. Enter commits a seed.
- Choose fly agaric, bolete, chanterelle, or morel. Seed variation stays inside the selected form.
- Set a destination seed. Drag the morph slider, play one transition, or choose **Keep growing** for a continuous chain.
- Set the pace between 3 and 20 seconds. Pause keeps the exact intermediate form.
- The URL stores both seeds, the form, blend, and pace. Copy it to reproduce a paused plate.
- Expand **The anatomy of a seed** to inspect all 36 live trait values.
- Save exports the current form at 2400 × 2000; export pauses motion first.

Animation is opt-in. With reduced motion enabled, **Morph once** moves straight to the next seed. **Keep growing** remains an explicit opt-in to continuous animation. Hidden tabs suspend painting and resume without a time jump.

## Geometry and paint

`generateGenome(seed, family)` maps text to 36 continuous values. `buildGeometry(genome)` returns plain arrays of points for the cap, stipe, and underside, plus analytical centerline functions. It does not depend on Canvas or the DOM. The renderer turns these into `Path2D` shapes. Stable point and detail correspondence avoids topology changes during morphs. Interpolation is smoothstep in time and linear in trait space; it never crosses between mushroom families.

`paintMaterialData()` uses the existing Unpainting `makePaper`, `createSheet`, `createBrush`, `dip`, `stroke`, `step`, `layersOf`, and `renderLayers` functions. Five broad passes lay pigment on paper; 24 transport steps form the wet wash. The resulting pigment field is rendered through the existing Kubelka–Munk optics into a small reusable material atlas. During motion, Canvas clips and maps that actual painted material onto the changing vectors, with continuous pigment mixtures, broad shading washes, reserved veil patches, fine contours, and directional details.

This is a real-time material approximation, **not a new full fluid solve of each mushroom silhouette on every frame**. The atlas uses umber's transport behavior; other pigments reuse that mass field with their own optics and optical microgranulation. Wetness and edge controls vary the live approximation. Grain is mapped to the forms; it is not a physically stationary full-sheet simulation. Higher-resolution PNG export rerenders the vectors, but does not increase the atlas's native physical resolution. This separation keeps the demo small and responsive while genuinely using Unpainting to paint the material over JS geometry.

The 36 traits cover cap width/height/roundness/curl/ripple/asymmetry/tilt; stem length/width/taper/bend/lean/bulb; ring position/drape; lamella density/curve/depth; surface detail density/size/irregularity; pigment load/warmth; stem wash; shadow; granulation; wetness; pooling; edge softness; wash variation; fibres; juvenile size/spacing/lean; earth flecks; and texture phase. Anatomical traits apply where the form supports them; morels have pits, boletes pores, and chanterelles folds rather than agaric gills.

### Painting plan

- [x] Target: original procedural natural-history study; warm paper; 1200 × 1000 preview coordinates, approximately 300 × 250 mm composition. Atlas: 144 × 144 cells at 0.4 mm/cell, stretched per surface (an acknowledged real-time approximation).
- [x] Passages: pale stipe, underside, ring where present, broad cap, then small surface accents. Light comes from upper left. Reserve pale veil remnants; preserve the pale morel ridge network.
- [x] Drawing: fine, sparse brown contours before each broad wash, treated as fixed waterproof lines. Fine gills/fibres and pit accents follow the broad masses as a deliberate finishing pass.
- [x] Wash: five connected broad flat-brush sweeps on the material sheet, radius 36 cells (14.4 mm), water load 0.8, pigment concentration 0.095–0.145. All five passes share a wet passage. 24 transport steps at dt 0.35; no claim of a dried or fixed material checkpoint.
- [x] Glazing: KM-based tonal washes and multiply-composited material, with retained paper lights. Preview surface shadows and edge pooling are approximations, not measured full-sheet moisture behavior.
- [x] Review: geometry and material determinism tests; inspect all four rendered forms, small-screen layout, transitions, and export in the browser.

## Form references

These are invented variations constrained by documented macroscopic features, not taxonomic identification plates. No reference images are copied.

- [Amanita muscaria group, Michael Kuo](https://www.mushroomexpert.com/amanita_muscaria_flavivolvata.html): cap veil patches, free pale gills, ring, bulb with veil remnants.
- [Boletus edulis group, Michael Kuo](https://www.mushroomexpert.com/boletus_edulis.html): convex brown cap, pore surface, stout reticulate stipe.
- [Cantharellus “cibarius”, Michael Kuo](https://www.mushroomexpert.com/cantharellus_cibarius.html): depressed yellow cap, fleshy central stipe, decurrent false gills; a group label acknowledges the modern species distinctions.
- [Morchella esculentoides, Michael Kuo](https://www.mushroomexpert.com/morchella_esculentoides.html): egg-shaped cap, irregular pits and pale ridges, direct cap attachment.

## Open source flower research

Reviewed 2026-10-18. These are candidates for a future flower study, not dependencies of this mushroom demo.

| Project | Representation | License checked | Relevance |
| --- | --- | --- | --- |
| [Nonflowers — Lingdong Huang](https://github.com/LingDong-/nonflowers) | JS polygons and pixel operations on Canvas | MIT | Closest aesthetic precedent: procedural botanical paintings in Gongbi style. Not an SVG library. |
| [VectorBloom](https://github.com/d-0-s-t/vector-bloom) | Configurable SVG in the DOM, Canvas render, SVG/JSON export | MIT | Closest ready-made vector flower library; exposes petal geometry and updates. |
| [ProcFlower](https://github.com/dattasid/ProcFlower) | TypeScript procedural wildflowers with SVG utilities | No license verified | Useful geometry reference; do not vendor without resolving its license. |
| [PSVG — Lingdong Huang](https://github.com/LingDong-/psvg) | Programmable SVG | Not audited for this demo | General procedural vector authoring, not a botanical shape collection. |

VectorBloom is the most direct fit for the same vector-to-Unpainting approach for flowers. Nonflowers is the stronger visual reference. Neither is needed for anatomically constrained mushroom geometry.

## Checks

```sh
node --test demos/fungi/mushrooms.test.mjs
npm test
npm run bench:test
```

The focused test covers exact seed endpoints, bounded traits, 840 adult/juvenile geometry samples, continuous point motion, family constraints, URL parsing, and actual Unpainting pigment deposition. Browser checks should include all four forms, both animation controls, changing input during motion, resuming a shared URL, mobile overflow, reduced motion, and PNG export.
