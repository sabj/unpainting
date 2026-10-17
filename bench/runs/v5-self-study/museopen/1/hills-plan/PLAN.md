# Hills - Loose Ink and Wash Plan

## Reference cues
- Rolling sunlit hills with winding pale sandy path cutting diagonally from upper left to lower right.
- Bright yellow-green meadows in sun, darker olive/forest greens in shadow and tree canopies.
- Scattered dark trees with dense foliage, casting soft shadows; distant wooded ridge at top.
- Light sandy path is the key light shape against greens; sky not visible, all land.

## Regions and technique
- **hills.distant** [0,0,1,0.32] - distant wooded ridge: wet in wet, soft merging of dark greens, one pale-to-mid wash, ink defines tree clumps.
- **hills.midslope** [0,0.28,1,0.68] - mid slope with upper path and scattered trees: wet on dry, broken greens, path reserved, ink for tree trunks/branches.
- **hills.foreground** [0,0.62,1,1] - sunlit meadow foreground with winding path: wet on dry, pale yellow-green wash, path highlights reserved, darker glazes for shadows and tufts.

All regions share ink-and-wash style: opening sepia ink establishes tree structure and path edges, then 3 mid layers of transparent washes (light to dark), closing ink reinforces dark accents.

## Moisture and load
- Opening ink on dry paper, crisp lines.
- First washes: moderate water (0.55), light pigment load, broad mop for meadows.
- Mid layers: progressively darker, still transparent, drying between glazes for distinct shadow shapes.
- Closing ink: dry, directional, on dry paper for tree texture.

## Protected lights
- Three small reserves for path highlights (upper, middle bend, lower) - kept out of every wash to preserve sandy paper.
- Painter's own near-paper lights preserve brightest meadow yellows.

## Edges and values
- Soft/lost edges between distant ridge and mid slope (wet in wet).
- Hard/broken edges for tree silhouettes against meadow (ink).
- Path edges: soft where path fades into grass, harder where cut by shadow.
- Value ladder: paper white (path) -> pale yellow-green (sunlit grass) -> mid olive -> dark forest green/brown (trees) -> sepia ink accents.

## What would show failure
- Path lost (overpainted with green), meadows too uniform or too dark, trees as flat blobs without ink structure, muddy greens from overmixing, hard rectangular seams from reserves.

## V5 changes
- First try, no prior feedback. Chose lay3 (3 mid layers vs base 4) for looser handling, darkgain 1.15 (slightly lighter than base 1.3) to keep meadows luminous. Added explicit earth/green palette via --paints.
