# Painting Plan — Trumbull College (`Y1`)

## 1. Reference Cues (`bench/plan/target.png`)
The 300×263 px reference crop (`bench/plan/target.png`, rendered at 1200×1052 px across a 280 mm×245.5 mm cold-press watercolor sheet) depicts the courtyard facade of Trumbull College in crisp sunlight:
- **Sky & Clouds (`y: 0.00–0.28`)**: Pale cerulean-ultramarine sky at upper-left (`lum ~0.72`) and upper-center, opening into luminous warm-white cloud banks (`lum 0.88–0.96`) at upper-right (`[0.937, 0.034]`) and around the right chimney (`[0.637, 0.148]`).
- **Central Sunlit Gothic Gable & Chimneys (`x: 0.33–0.63, y: 0.09–0.84`)**: Warm yellow-ochre and raw-sienna ashlar stonework catching direct sun (`lum 0.63–0.95`), flanked by two tall stone chimneys (`x: 0.08–0.18` and `x: 0.58–0.67`). Bright limestone window surrounds and stringcourses (`[0.427, 0.365]`, `[0.457, 0.529]`) frame deep gothic window openings.
- **Left Wing & Slate Roofs (`x: 0.00–0.34, y: 0.28–0.82`)**: Stepped mid-tone stone facade (`lum ~0.44`) under a cool grey-violet slate roof slope (`y: 0.28–0.42`), punctuated by dark arched casements and lower shrubbery.
- **Courtyard Tree, Right Wing & Banner (`x: 0.52–1.00, y: 0.36–0.86`)**: A sunlit sap-green/hansa-yellow deciduous tree (`x: 0.53–0.85, y: 0.38–0.82`) stands in front of the right courtyard wing; a deep ultramarine banner hangs on a lamppost left of the tree (`x: 0.38–0.43, y: 0.54–0.68`).
- **Foreground Steps, Sidewalk & Figures (`y: 0.82–1.00`)**: Warm sunlit paving and entrance steps with bright paper glints (`[0.567, 0.939]`), horizontal cast shadow bands, and small pedestrian figures at lower-left and lower-right.

## 2. Style Selection & Regional Technique Order
- **Master Style**: `precise-watercolor` (`subject: "Y1"`, `region_w13` layered onto the Trumbull architectural base recipe).
- **Palette (`pgreen`)**: Yellow Ochre, Raw Sienna, Hansa Yellow, Ultramarine, Cerulean, Sepia, and Sap Green (`--skyblue`, `--foliagerefit`, `--violetshadow`, `--shadowsplit`).
- **Execution Order**:
  1. **Opening Ink (`bench/plan/opening-lines.json`)**: Thin sepia/grey structural pen lines along primary roof ridges, gable profiles, and chimney edges (`first: true`), skipping interior window mullions, ground texture, and protected highlights.
  2. **Band 1 — First Light Washes (`load: 0.22–0.26`)**:
     - `sky-cloud-wash`: 3 horizontal wet-on-wet sky lanes (`--skylanes 3`) in dilute cerulean + ultramarine (`water: 0.88`, `wetMix: 0.85`), leaving bright cloud reserves untouched.
     - `sunlit-gable-first-wash` & `sunlit-chimneys-light`: Pale ochre + hansa yellow foundation wash across the sunlit stone planes, preserving limestone highlights.
  3. **Band 2 — Light-Mid Stone, Canopy & Paving Masses (`load: 0.40–0.45`)**:
     - `central-gable-warm-stone` & `right-courtyard-wing-stone`: Layered warm ochre/raw-sienna washes establishing the sunlit masonry planes while holding out gothic window recesses.
     - `courtyard-tree-canopy-light`: Sap green + hansa yellow + ochre refitted per foliage cluster (`--foliagerefit 1`).
     - `sunlit-steps-and-sidewalk`: Warm raw-sienna/ochre horizontal washes across the lower paving.
  4. **Band 3 — Mid-Tone Shaded Stone, Slate Roofs & Ashlar Texture (`load: 0.58–0.60`)**:
     - `left-wing-shaded-stone` & `slate-roof-slopes`: Cooler ochre/ultramarine/sepia glazes on the shaded left facade and angled slate roof planes.
     - Warm stone irregular block texture (`--blockvar 0.60`, `--blockmm 4.0`, `--blockaspect 2.0`, `--blockirregular 1`) dry-brushed over dry sunlit masonry (`maxExistingDryness: 0.08`).
     - `foliage-mid-canopy-and-shrubs`: Deeper sap-green/raw-sienna mid-tones in the tree crown and lower-left bushes.
  5. **Band 4 — Cast Shadows & Lower Masonry Glazes (`load: 0.72`)**:
     - `cast-shadows-and-lower-masonry`: Split cool violet (`ultramarine + raw sienna + sepia`, `--coolglaze 1.3`, `--violetshadow 1`) and warm earth shadow glazes (`--shadowsplit 1`) under roof eaves, behind the tree canopy, and across the foreground steps.
  6. **Band 5 — Crisp Gothic Window Recesses & Dark Accents (`load: 0.88`)**:
     - `gothic-windows-and-arch-recesses`: Reserved until the end (`isRecess`, `--recessgate 0.1`, `--recessdouble 1`, `--recessclose 1`) so dark sepia + ultramarine mixtures land with full pigment density (`--darkscale 1.3`) into the arched windows, doorway, and lamppost banner.
  7. **Closing Ink (`bench/plan/closingink4-lines.json`)**: Crisp sepia pen accents (`--drawinglast bench/plan/closingink4`, `--drawingcap 200`, `--thinpass 2`) reinforcing target-supported dark architectural edges, window tracery, and eaves after all washes have dried.

## 3. Moisture & Load Schedule
| Pass / Band | Surface Moisture | Brush Water / WetMix | Pigment Load | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| Opening Ink | Bone dry (`0.00`) | Pen nib (`0.26`) | `0.36` | Register structural gable, chimney, and roof contours |
| Band 1 (Sky) | Wet-on-wet (`intoWet: true`) | `water: 0.88`, `wetMix: 0.85` | `0.22` | Soft atmospheric sky lanes around cloud paper reserves |
| Band 1 (Stone) | Lightly damp | `water: 0.78`, `wetMix: 0.72` | `0.25–0.26` | Luminous warm stone under-wash |
| Band 2 (Masses) | Damp-dry (`drying: 0.28`) | `water: 0.68`, `wetMix: 0.62` | `0.40–0.45` | Build warm gable stone, sunlit tree crown, and walk |
| Band 3 (Mids/Tex)| Dry (`maxDryness: 0.08` for tex) | `water: 0.56`, `wetMix: 0.48` | `0.58–0.60` | Shaded left wall, slate roofs, and crisp ashlar stone grain |
| Band 4 (Shadows) | Dry prior wash (`drying: 0.35`) | `water: 0.50`, `wetMix: 0.40` | `0.72` | Transparent violet-earth cast shadows without lifting |
| Band 5 (Recesses)| Completely dry | `water: 0.34`, `wetMix: 0.22` | `0.88` | Crisp, high-density sepia/ultramarine window & arch darks |
| Closing Ink | Completely dry | Pen nib (`0.22`) | `0.52` | Final architectural definition on target-supported dark spans |

## 4. Protected Lights
- **Natural Luminance Reserve**: All target pixels with luminance $\ge 0.86$ are automatically held out of washes along their organic target contours (upper cloud deck, bright chimney rim, sunlit limestone trim, and sidewalk glints).
- **Explicit Focal Reserve Boxes (`reserves`, each $2.2\% \times 2.2\% \approx 6.2\text{ mm} \times 5.4\text{ mm}$)**:
  1. `[0.937, 0.034, 0.022, 0.022]` — Upper-right cloud crest (`meanL: 0.951`).
  2. `[0.637, 0.148, 0.024, 0.022]` — Bright cloud light beside right chimney (`meanL: 0.946`).
  3. `[0.427, 0.365, 0.022, 0.022]` — Upper-central gable limestone arch highlight (`meanL: 0.953`).
  4. `[0.457, 0.529, 0.022, 0.022]` — Mid-gable sunlit stone mullion highlight (`meanL: 0.920`).
  5. `[0.567, 0.939, 0.022, 0.022]` — Foreground sunlit step/paving highlight (`meanL: 0.937`).

## 5. Edge Control
- **Soft Edges**: Sky-to-cloud transitions (`baseMove: "wet on wet"`, `edge: "soft"`) and outer foliage crown boundaries (`edge: "soft"`).
- **Crisp Edges**: Gable rakes, chimney verticals, slate roof eaves, ashlar block texture, cast shadow boundaries, and gothic window recesses (`edge: "crisp"`).
- **Zero Unsupported Straight Seams**: All family regions use the unified `precise-watercolor` style without artificial style-box splits, and all explicit reserves are compact ($\le 2.4\%$ span) inside genuine high-luminance zones so no band-1 wash mask ever forms an unsupported horizontal or vertical seam.

## 6. Value Structure
- **Band 0 (Paper White, $L \ge 0.86$)**: Unpainted cold-press paper (~18% of plate) in clouds, limestone trim, and step glints.
- **Band 1 (Light, $L \approx 0.72–0.85$)**: Pale cerulean sky wash and warm hansa/ochre stone base.
- **Band 2 (Light-Mid, $L \approx 0.54–0.71$)**: Sunlit ochre/sienna central gable, right wing, bright sap-green tree crown, and sunlit sidewalk.
- **Band 3 (Mid, $L \approx 0.38–0.53$)**: Left shaded stone wall, slate roofs, ashlar block courses, and mid-canopy foliage.
- **Band 4 (Mid-Dark, $L \approx 0.22–0.37$)**: Cool violet/sepia eave shadows, lower foliage shadow planes, and step risers.
- **Band 5 (Dark Accents, $L < 0.22$)**: Deep sepia + ultramarine gothic window openings, doorway recess, and dark blue banner.

## 7. Failure Criteria (What Would Show Failure)
- **Lost Paper Lights**: Heavy washes overrunning the cloud deck or sunlit limestone trim (`reserveKept < 0.85`).
- **Unsupported Seams**: Any horizontal or vertical wash boundary $\ge 8\%$ of the short side across open sky or flat masonry (`unsupportedCount > 0`).
- **Washed-Out Windows or Muddy Stone**: Painting dark window recesses too early so subsequent warm stone washes bleed them out, or over-wetting Band 3 stone texture so ashlar blocks blur into mud.
- **Over-Inking Foliage**: Pen lines invading green tree foliage instead of remaining strictly on architectural stone, roof, and window structure.
