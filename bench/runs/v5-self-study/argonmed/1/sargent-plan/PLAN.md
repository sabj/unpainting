# Painting Plan — Ships (John Singer Sargent, *White Ships*, 1908 detail)

## 1. Visual Analysis of Target
The target image (`300x244`, painted at `1200x976` on a `280 mm` cold-press watercolor sheet) is a luminous marine watercolor detail by John Singer Sargent showing the sweeping curved bow of a white ship in cool blue-grey shadow against a sunlit white hull to the right:
- **Warm Cream Paper (`paperRGB: 221, 215, 199`)**: The brightest unpainted passages of Sargent's watercolor sheet on the sunlit right hull (`2.4%` connected highlight region) read at `221, 215, 199`. Declaring `--paperrgb 221,215,199` matches the physical sheet tone to the target's cream paper so that reserved highlights (`~8.6%` of the sheet) blend seamlessly without stark white cutouts.
- **Sunlit Right Hull (`sargent.sunlit-hull`, `x: 0.58–1.00, y: 0.00–0.67`)**: Warm paper-white planks crossed by soft, pale blue-grey horizontal shadow bands.
- **Shadowed Bow (`sargent.shadowed-bow`, `x: 0.00–0.64, y: 0.00–0.76`)**: A broad, curving architectural expanse of cool blue-grey washes following the flare of the hull.
- **Hawsepipe and Stem Rust (`sargent.hawsepipe-rust`, `x: 0.41–0.65, y: 0.00–0.52`)**: Crisp dark oval hawsehole (`x: 0.43–0.53, y: 0.19–0.36`) with warm orange-sienna rust and chain strokes cutting across the cool blue shadow.
- **Fenders and Diagonal Spar (`sargent.fenders-and-spar`, `x: 0.76–1.00, y: 0.12–0.98`)**: Two compact dark round fenders hanging near the upper right (`x: 0.78–0.99, y: 0.13–0.27`) above a golden-ochre/sienna diagonal spar (`x: 0.79–0.96, y: 0.23–0.98`).
- **Foreground Anchor and Waterline (`sargent.waterline`, `x: 0.00–1.00, y: 0.67–1.00`)**: A bright warm cream-ochre anchor fluke in the lower left (`x: 0.09–0.30, y: 0.71–0.92`), deep shadow under the bow flare (`x: 0.25–0.62, y: 0.76–0.98`), and horizontal turquoise/sap-green ripples on the lower right (`x: 0.64–1.00, y: 0.66–0.98`).

## 2. Style, Medium & Recipe Strategy ("Pure Watercolor, No Ink")
- **Pure Watercolor (`medium: "none"`, `lines: []`)**: Both `opening-lines.json` and `closing-lines.json` carry `"medium": "none"` with empty `lines: []` so zero pen or graphite lines are drawn. All edges, structure, and dark accents come purely from brushwork.
- **Palette Fit**: With `--paperrgb 221,215,199`, `--palettewide 1` fits four box pigments (`hansa yellow`, `phthalo blue`, `quinacridone rose`, `sap green`) plus the granulating sky-blue tube (`5` pigments total, `3.47` local dE00).
- **Variant Tokens (`region_w13_rg0_cg11_dp85_dg2_ms1200`)**:
  - `rg0` (`--groundglaze 0`): Disables the Trumbull pavement ground-glaze split at `y = 0.56` so the lower bow and water keep their natural middle-value layering.
  - `cg11` (`--coolgain 1.1`): Moderates the base recipe's `1.3x` cool boost to `1.1x` so the shadowed blue-grey bow remains luminous.
  - `dp85_dg2` (`--deepaccent 85 --deepgrow 2`): Restates the deepest darks (`max RGB < 85`: the hawsehole, hanging fenders, and dark waterline under the bow) in two dried shadow layers (bands 4 and 5).
  - `ms1200` (`--minshapecells 1200`): Scales the minimum wash shape floor to the `1200x976` resolution (`~75` pixels of the `300x244` target), merging tiny scan-grain fragments into coherent watercolor planes while preserving small dark accents in the shadow bands.
