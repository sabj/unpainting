# South France — V5 try 2

2026-10-09. Fixed source `bench/targets/sf-crop.png`, 304 × 249 pixels; finished sheet 1216 × 996 native cells, 280 × 229.34 mm. Requested result: urban sketch, black pen plus light transparent wash. Frozen V096 executor, Fast drying, seed 0, gentle target guard. No code edits or independent physics renders.

## Reference and value design

The focal point is the stepped group of ochre houses on the right: terracotta roofs, lit golden walls, violet-brown side walls and tiny dark openings. A large branching yellow-green pine at lower left balances it. Olive crowns cover the intervening slope. The top-right blue is distant woodland, not sky.

Four value groups: pale cream/gold paths and sunlit wall faces; light green crowns and terracotta roofs; connected olive canopy undersides and muted violet wall sides; small deepest cypress cores, eaves, window recesses and branch junctions. Preserve this hierarchy at thumbnail scale. Paint the warm light planes rather than leaving perforated white holes. Fine pen carries the sub-brush architectural structure.

## What changes after try 1

The independent review and response to the judges are in `bench/SELF-REVIEW.md`. The prior composition survives, but the early segmented wash and dry horizontal lanes caused stripes and islands; later correction could not repair them. I accept the critique of early detail and global darkening. I reject the claim that nothing developed, the classic near-perfect edge score, and any response that merely adds more foliage detail.

Use the **precise-watercolor value scheduler** for this pen-and-light-wash interpretation. This is an explicit implementation choice: the urban-sketch profile plus its automatic ink-and-wash floor supplied essentially a base and shadow, with no middle-plane development. The new plan retains black opening and closing pen but gives paint a pale foundation, two restrained middle steps, and connected shadows. This is not a change of the intended sketch style. Every family uses the same scheduler; its bounds are descriptive, never painted rectangles.

`region_w15_lay2_dk9_mg8_ms300_cg10_dwg120_opp65`: passage-sized physical brushes replace the huge W13 fitted sweep; two middle layers replace four; middle gain .8 and dark gain .9 keep the wash light; minimum shape area 300 cells suppresses tiny paint fragments; cool gain 1 removes the base's extra cooling. Drawing width gain 1.2 and opening pressure .65 give the fewer structural lines a clearer presence. No horizontal lane token is introduced.

Use six pigments: yellow ochre, burnt sienna, hansa yellow, French ultramarine, sap green, sepia. Removing raw sienna and cerulean reduces redundant grey/turquoise mixtures; hansa/sap green carry foliage, ochre/sienna carry stone, ultramarine/earths carry muted shadows. Black ink is separately declared by `--inkprofile black-ink`.

Set paper to warm white 252/251/248, with `paperrel=0` and `paperlights=0`. This full-bleed reference's brightest tenth is mainly painted wall/path, not a paper sample. The default relative-paper rule was reserving large unintended holes. Keep only two small explicit glints, and the executor's truly near-white lights. Initially remove automatic touch-up rounds (`touchpoints=0`): try 1's late rounds supplied most strokes and fragmented the surface. Judge the planned painting before deciding whether any future correction is warranted.

## Drawing

Opening: 55 selected gestures inherited from the reviewed target-aligned prior drawing. Keep main roofs and wall turns, terrace direction, sparse cypress edges, main pine trunk and a few large branch forks. Remove all 15 little canopy contours and defer minor branches. The page should look incomplete, with emphasis at the right houses and lower-left trunk. No masonry hatch or leaf outlines.

Closing: 71 paths, including windows, selected eaves and wall junctions, branch connections and deferred small branches. This is sparse over the full sheet. No ink fill or all-over texture. Closing pressure .85 on measured dry paint. Typical source line widths .22–.48 pixels, approximately .24–.53 mm after the 1.2 gain. Inspect actual execution; authored widths are not a measured deposition claim. Closing need not execute every proposed line if the material selector finds inadequate support.

## Regions: technique, resolution, moisture and load

At native 1216 width, a cell is .2303 mm. One reference pixel is four cells or .921 mm. The minimum wash body is about four cells/.92 mm; individual leaves, roof tile lines and window jambs below that are omitted or drawn with pen. No invented fine reference detail and no density increase.

| Region and reference cue | Resolution and edge decision | Ordered technique and load |
| --- | --- | --- |
| Distant village: small warm buildings and slender cypresses | Wall planes 4–12 mm / 17–52 cells are wash; 1–2-cell junctions are pen. Quieter contrast than focal houses. | Opening sparse dry pen; pale watery ochre/sienna wash on dry sheet; dry; restrained mid roof/side planes; dry; connected side shadow. Only a few closing openings. |
| Far blue hill: cool woodland at upper right | 8–25 mm / 35–109-cell mass, wash question. No tree-by-tree detail or canopy pen. | One weak blue-green foundation, wet on dry and continuous across its own open edge; dry; broad muted middle plane; only its necessary shadow share. Do not mistake it for an open sky. |
| Olive slope: connected rounded crowns and warm paths | 3–12 mm / 13–52-cell crown groups are wash. Leaves below four cells omitted. Hard silhouette intervals and lost interior edges. | Pale hansa/ochre/sap-green foundation, watery flowing load on dry paper; dry; medium weak-to-medium pigment middle planes in two steps; dry; controlled olive shadow glaze across adjoining canopy undersides. Warm paths remain pale painted planes. |
| Focal houses: ochre faces, terracotta roofs, violet-brown sides | Planes 5–25 mm / 22–109 cells are wash. Openings 4–12 cells may carry paint; jambs and eaves are ink. Crisp architectural turns. | Opening pen; broad weak warm wash; dry; medium-load roof and side planes; dry; connected restrained shadow across adjacent wall sides, eaves and recesses; dry; selective closing pen. Never dry-brush wall interiors. |
| Foreground pine: yellow-green crown and branching trunk | Crown groups 5–20 mm / 22–87 cells are wash; slender branches 1–2 cells are ink. Broken crown edge, connected inner mass. | Sparse trunk/forks first; weak warm-green flowing wash; dry; middle crown planes; dry; coherent lower green shadows. Remaining branch gestures last, when the crown gives them context. No leaf disks. |
| Lower garden: olive shrubs and winding warm ground | 3–15 mm / 13–65-cell planes are wash; sparse branches are ink. Paths open between shrubs without arbitrary white gaps. | Pale warm path and green masses; dry; two restrained middle steps; dry; cross-crown/ground-turn shadows; a few dry pen junctions. No uniform foreground texture field. |

The W15 brush kit chooses contact by the actual passage span: 1.2 mm rigger, 3/5/7 mm rounds, 25.4 mm flat, 38 mm mop. Native radii are 2.6/6.5/10.9/15.2/55.2/82.5 cells. Broad foundation supports use the flat or mop; narrow planes use rounds; sub-four-cell details remain pen. The compile report supplies the actual support widths, radii and ratios. For a 5 mm round, a 5–12 mm crown group spans 22–52 cells, or 2–4.8 brush radii; wide merged passages require the larger tools. No extra dry-brush texture layer is chosen for this subject.

## Layer sequence and measured state

1. Protect two small glints. Opening black pen on a dry sheet.
2. Weak pale local-color foundation, pigment separated into the planned warm/green/cool passages. Water load .62, pale pigment demand; broad flowing contact. This stage establishes masses, not full foliage detail.
3. Dry fully. Two middle value steps, gain .8, a medium flowing brush load. The compiler retains .62 water for these non-texture identity-profile wash planes; pigment concentration is separate and restrained. The second step occupies the darker part of the simplified middle field.
4. Dry fully. Last connected shadows in two complementary allocations on the same support, dark gain .9, water .45 and medium pigment. These cross descriptive family boundaries: canopy into neighbouring crown/ground; shaded wall into adjacent eave and recess. Lit wall fronts are outside the shadow shape.
5. Dry and inspect. Closing fine black pen only where structure benefits. No automatic corrective round in the initial plan.

Every physical mark remains subject to the fixed executor's measured paper gate across the footprint and neighbours. Require dry paper before each new plane/glaze; only verified own-passage overlap may touch a still-open wet edge. If paper is wrong, the executor dries and remeasures. No disabled physics, wet-gate bypass, timer-as-reading or invented moisture observation. No wet-in-wet exception is needed for these compact sketch washes.

## Lights and acceptance checks

Bare paper: a 5.3 × 2.3 mm sun glint within the left terrace and a 5.6 × 1.8 mm roof-ridge glint on the foremost house. Both follow reference lights and stay below long-seam size. Broad lit walls, paths, canopy tops and roof ridges are pale painted planes toned in the foundation. There are no eyes or specular eye catchlights. No masking strips, lifting plan, opaque repair or rectangle-shaped style boundaries.

Before painting: require `bash bench/check.sh` to end ADMITTED. Inspect value-plan structure and physical brush support, not pixel error. Standalone crop physics is prohibited, so the opening/early wash stops are the technique proof available here.

Opening checkpoint: legible house cluster and tree gesture, mostly empty paper. Early wash checkpoint: broad pale warm and green areas, clear house lights, no diagonal empty wedge or repeated parallel bars. Mid checkpoint: tree crowns begin to group, roofs and side planes separate, still no dense leaf detail. Shadow checkpoint: coherent canopy undersides and cypress anchors; no islands of near-black. Pre-closing checkpoint: decide whether every proposed accent still serves a junction.

Accept artistic changes only by the skill's order: value shapes; retained/toned lights; purposeful hard, soft and lost edges; house/roof/tree landmarks; connected tapered marks; believable light-to-dark progression. Fail on stripes, rings, stipple, tiny all-over islands, universal blur, dark walls or ink used to conceal wash defects. Material execution, admission and artistic quality are separate verdicts. Stop after the finished painting.

## Admission and compiled proof

The direct local `bench/check.sh` passed its option check but waited for a shared slot; it was interrupted before planning completed. The identical admission check inside `bench/paint.sh start` subsequently completed its planning step and queued the painting for a cloud GPU. Its full-width `value-region-check.json` has no unsupported axis-aligned first-wash edges. The executable plan contains 72 pigment/region passes and 1,867 connected shapes: 553 light, 909 middle and 405 shadow allocations. Of the shadow allocations, 373 cross colour-region boundaries.

The largest light support is 983,816 native cells. It selects a 38 mm mop, radius 82.51 cells, and seven fitted strokes. Its area/perimeter support-width estimate is 84.04 cells (19.35 mm), ratio 1.018 to brush radius; this is a perforated connected canopy support, not a literal uniform-width strip. The large tool is deliberately tested at the first-wash checkpoint for coverage and seams. Smaller supports choose 3/5/7 mm rounds or a 25.4 mm flat. Black ink with neutral equal-channel absorption is confirmed in the material log. The frozen sky-blue token also retains its second granulating ultramarine tube; it does not add a new hue to the six-colour paint box.

## Cloud execution blocker

`bench/paint.sh start` was sent at 15:29 PDT. Admission eventually completed and the harness moved from GPU queue to GPU startup. Repeated supported `wait` calls never returned the opening checkpoint. A `look` request confirmed there was no stopped sheet available. A later `run closing` request and then `finish` also returned the same startup status, without confirming advancement or completion.

At 16:45 PDT, the final status still read “starting on a cloud GPU”; it reported 11.6 of 85 planning minutes used, zero looks and zero revisions. Thus this attempt has an admitted, submitted plan, but **no verified finished painting and no new sheet that could be visually judged**. No execution paper-state measurements or artistic improvement are claimed from the compile report. The required completed-render delivery remains blocked by cloud startup. The executable files retain the admitted plan; no speculative revisions were made during this delay.
