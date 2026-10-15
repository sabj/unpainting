# Painting Plan — Ships (`sargent`)

## 1. Visual Analysis of the Target
`bench/plan/target.png` is a detail of John Singer Sargent's watercolor *Ships* (`300x244` target crop, painted at `1200x976` on a `280 mm` cold-press sheet). The requested style is **pure watercolor, no ink**.

Key visual features:
- **Paper & Lights:** The unpainted paper is a warm cream tone (`RGB ~ [219, 213, 197]`), occupying ~10.5% of the sheet in large, connected reserves: the sunlit sail/rigging planes in the upper right, the sunlit white hull planks and gunwale in the middle-right, vertical glints along the left mast, and a small reflection glint in the lower-right water.
- **Color Regions:**
  1. **Upper-Right Sail & Rigging (`sargent.upper-sail-light`):** Warm cream paper reserves bordered by pale yellow-ochre/cadmium-yellow and soft warm grey washes.
  2. **Central Hull (`sargent.central-hull`):** A sweeping blue-grey and cerulean slate hull across the upper-middle diagonal, accented by warm burnt-sienna/ochre rust and rivet patches and the dark hawsehole/anchor shadow on the upper-left hull.
  3. **Left Masts & Spars (`sargent.left-masts-rigging`):** Warm golden-ochre and sienna vertical/diagonal masts and rigging planes against pale warm washes.
  4. **Lower-Left Bow & Anchor (`sargent.lower-left-bow-anchor`):** Warm ochre anchor/timber shapes and cool grey-blue shadow washes curving toward the bottom-left.
  5. **Waterline Shadow (`sargent.waterline-shadow`):** Deep blue-black/slate shadow along the lower-center hull waterline.
  6. **Green Water & Reflections (`sargent.green-water-reflections`):** Turquoise, cerulean, and sap-green water planes with olive-amber reflections in the lower right.

## 2. Style & Drawing Strategy
- **Style:** `precise-watercolor` so that painted value planes carry all form across 5 value bands (`lay4` nested middle layers and `rec2x` two-pass deep recesses) with reliable dry-paper gates between layers.
- **No Ink (`--drawing none`):** Because the requested style is **pure watercolor, no ink**, `bench/plan/extra-args.json` sets `["--drawing", "none"]` to suppress both opening and closing pen/ink passes from the base recipe. All structure, linear rigging accents, and dark hawsehole/waterline shapes are carried purely by watercolor washes and dark pigment glazes.
- **Region Naming:** None of the region IDs or cues use the word `sky` or `cloud`, preventing the planner's sky heuristic from zeroing warm pigments or collapsing midtones on the upper-center blue-grey ship hull.

## 3. Palette, Paper & Recipe Choices (`bench/variant.txt`)
Variant: `region_w15_relonly_rg0_cg10_dk11_ms400_ls28`
- **`region_w15`:** Uses shaped value planes (`--shapedmarks 1`) with adaptive brush choice (`--brushchoice 1`).
- **`relonly`:** Uses `--paperbase source --paperrel 1` without `--paperrgb auto` (which would otherwise fall back to `[252, 251, 248]` bright white because the interior cream sail reserve does not touch the crop border). With the true warm cream paper (`[219, 213, 197]`), `widePalette` automatically fits the 4-pigment box palette: **hansa yellow, phthalo blue, quinacridone rose, and sap green** (plus the granulating phthalo blue tube), matching both the cool slate hull, warm ochre/sienna spars, and turquoise-green water.
- **`rg0` (`--groundglaze 0`):** Disables the Trumbull-specific rose-violet ground glaze on the bottom third of the sheet so the turquoise-green water in the lower right remains clean and true to the target.
- **`cg10` (`--coolgain 1.0`) & `dk11` (`--darkgain 1.1`):** Prevents over-darkening cool planes while giving shadow glazes just enough weight to reach the deep waterline and hawsehole darks, followed by `--touchpoints 2` (`tp2` from base) for shape-level deficit glazing.
- **`ms400` (`--minshapecells 400`) & `ls28` (`--layersmooth 2.8`):** Smooths middle-value layer boundaries to 2.8 mm and folds tiny speckle fragments (< 400 cells at 1200x976) into adjacent planes so washes read as cohesive watercolor brush passages.
