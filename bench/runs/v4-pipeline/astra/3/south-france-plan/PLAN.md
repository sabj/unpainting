# South France: pen plus light wash

Independent V4 try 3. Target sf-crop.png, 304 x 249 source pixels; physical output 1216 x 996 on a 280 mm sheet. Planned 2026-10-09. Technique authority: .claude/skills/watercolor-technique/SKILL.md. The fixed painter remains unchanged.

## Reading and style

The focal point is the group of warm houses at the right, balanced by the foreground pine. Cypresses punctuate the upper village. This is a dense hillside, with no sky passage. Translate its opaque-looking reference detail into an urban sketch: black structural pen, broad transparent color planes, then one connected shadow glaze. Leave the stone lights open. Do not outline individual leaves.

Four-value thumbnail: paper and pale cream path/wall lights; light ochre roofs and yellow-green canopy tops; cool olive canopy interiors and violet-grey wall sides; a few near-dark cypress cores, branches, windows, and roof junctions. Values must accumulate in that order. The opening ink is the intentional exception, justified by the requested pen-first urban sketch.

Use urban-sketch throughout with the executor's ink-and-wash value floor. No rectangular style changes. Family boxes only describe overlapping target-derived shapes. The eight families preserve the reference's actual segmentation rather than imposing geometric paint boundaries. The global style gain is 0.8, and shadow gain 1.0 instead of 1.3. Paper is warm white, not the average yellow-green light in this densely painted reference. Pigments: ochre, raw sienna, burnt sienna, hansa yellow, ultramarine, cerulean, sepia and sap green. Black ink is explicitly declared; it does not supply painted dark masses.

## Regions and execution order

All first washes use wet on dry: a watery flowing load and light pigment on measured dry paper, joining adjacent strokes while the same passage remains open. The urban-sketch profile requests water 0.5. No dry-brush stippling. Fully dry before shadow glazing; use a controlled medium-water, medium-pigment load. The painter checks the entire contact footprint and neighbouring paper before each stroke, allowing overlap inside the current passage but requiring a dry base for the next glaze. No moisture reading is assumed from elapsed time.

| Family | Reference cue and resolution decision | Passage and edge decisions |
| --- | --- | --- |
| Upper village | Pale stone, little ochre roofs; walls 12–60 cells wide are washes; 1–3-cell seams are pen | Opening roof/corner gestures, light ochre wash, dry, restrained cool side-wall glaze. Crisp roof edges; lost lower edges into trees. |
| Near village | Largest roof and wall planes; 30–150-cell planes are washes, fine eaves and 2–8-cell windows are ink and wash | Most complete opening structure. Pale warm walls and roofs first; dry; linked cool shadows across eaves, side walls and vegetation at their feet; last dark window accents. Keep lit front faces broad. |
| Terraces | Broad cream-yellow bands interrupted by trees; wash question, with pen only at a few retaining-wall junctions | Watery ochre over dry paper, light pigment. Preserve light caps and path gaps. Irregular tree interruptions prevent a ruled horizontal band. |
| Cypresses | Narrow connected dark green bodies, typically 8–30 cells across, with slender contour lines | Light green foundation, dry, one coherent deeper green/blue glaze. A few long broken pen edges locate their vertical thrust. No filled black silhouettes. |
| Middle canopies | Broad olive crowns and connected cool cavities; crown groups 25–120 cells, individual leaves under 4 cells | Connected light green planes, then dry-paper grouped shadow glaze crossing adjoining crowns. Crisp selected foliage edges against stone; softer internal transitions. Individual leaves are omitted. |
| Foreground pine | Airy yellow-green crown, trunk and irregular spreading branches | Crown is a wash question; branches 1–4 cells are an ink-and-wash question. Draw trunk and major branching gestures first, transparent crown wash, dry, limited shadow glaze. Leave gaps between branches. |
| Lower garden | Winding pale paths between linked olive shrubs | Light warm ground and green shrub washes; dry; continuous shaded understory crossing shrubs and the ground where visible. A few closing branch accents. Paths remain pale painted planes or naturally reserved paper. |
| Distant hillside | Small cool subdued terrain planes behind the buildings | Light blue-grey/olive wash, controlled dry edges softened by low contrast. No individual foliage ink or added texture. |

Native cell size is 0.2303 mm; one reference pixel spans four native cells, or 0.921 mm. The minimum convincing watercolor body is about four cells (0.92 mm). Pen handles thinner structure. Intended broad brush diameter is roughly 4–10 mm (radius 9–22 cells), versus 25–150-cell major planes; support/radius is about 1.1–17. Narrow cypresses use the fitted brush point rather than that full belly. Actual fitted support and brush contact are checked in the executor's passage audit; these are planning estimates, not measured execution claims. No density change is requested.

## Lights, drawing, and glazes

No broad rectangular reserves: the target-derived near-paper mask protects naturally shaped bright path turns, stone caps, and roof glints. Lit facades and most roof planes are pale painted planes, not white holes. Leaf gaps are negative spaces in the fitted canopy geometry. No eyes or catchlights occur in this scene. If a light looks too stark at a stop, assess it against the pale local plane before changing the remaining wash.

The opening file has 86 connected structural lines: major village roof junctions and wall corners, terrace edges, cypress axes, and the pine's irregular branching. The closing file has 84 available selective paths: reference-supported thin dark eaves/recesses, plus a few small windows and branch junctions. The painter may further select these by value. Closing ink stays out of light interiors. Traced pixel stairs are simplified; line widths and pressure taper at endpoints. A 1.1 width gain replaces the base 2.0 gain, avoiding a heavy outline around light washes. Opening pressure 0.55, closing pressure 0.65, black-ink material. Check the actual opening drawing before washing.

Shadow glazes cross near-house side walls into their adjacent eaves and ground shadows, and cross neighbouring olive crowns into their shared understory. They follow connected reference shadow support rather than family box borders. The physical sequence splits these into pigments; it is still one dry-base shadow stage. No extra dark-first paint, wet charges, texture pass, hatching, leaf disks, or sky bands are requested.

## Checkpoints and failure criteria

1. Admission and compile: verify actual target, dimensions, pigment declaration, active drawing files, naturally shaped first-wash supports, and dry-paper technique. No unsupported straight seams. The fixed harness is the only render route; representative proof is the first physical passage, not a separate local render.
2. Before the first wash: the near-village roofline and pine must be identifiable from selective drawing. Check ink weight and placement at native output size.
3. After the light pigment stage: coherent pale color, plenty of luminosity, clearly separated stone and foliage. Judge this as a foundation, not as a finished dark reference. Reject scratches, fragmented crown interiors, or unexpected rectangular gaps.
4. Before closing: tree and building value shapes must read at thumbnail size, with hard focal edges and open lights. Avoid globally darkening to recover one weak window. Check that shadows join across regions.
5. Finish with selected closing ink only on fully dry paint. Judge value shapes, lights, edges, roof/window landmarks, purposeful marks, and a believable progression in that order. Do not optimize pixel error.

Initial changes from the fixed base: requested urban-sketch style, white paper, 0.8 wash strength, 1.0 dark gain, finer drawing, explicit foliage/stone palette and black ink, reference-specific opening and closing paths. These changes make the dense hillside read as a light pen sketch while preserving its main value shapes. Record any later revision below.

## Execution record

`bash bench/check.sh` ended ADMITTED. The compile reported 35 pigment passes, 1267 connected shapes, no unsupported first-wash axis edges, and the declared black-ink material. The actual ladder contains light-band and shadow-band passages, with 312 shadow shapes crossing regions.

`bash bench/paint.sh start` was issued at 16:13 PDT. Admission subsequently completed and the harness reported a cloud GPU run starting. Repeated waits returned the same startup state; a look request was refused because no stop had been reached. A continuous `finish` was requested, without changing any painting inputs. At 17:37 PDT the harness still reported startup, 14.3 of 85 working minutes used, zero looks, and zero revisions. No physical sheet or completed result was available to inspect. Thus admission is verified, but physical paper-state execution, appearance, progression, and completion remain unverified. No visual improvement or finished-painting claim is made.
