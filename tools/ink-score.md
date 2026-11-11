# Ink scorecard (offline)

Run only after painting, for developers and judges. Never call from a painter,
planner, or iterative painting loop, and never use scores to hill climb.

```
PAINTER_LINES_PYTHON=/path/to/.venv-lines/bin/python node tools/ink-score.mjs RUN TARGET --out OUTPUT --models /path/to/work/line-models/hf
```

Requires `painting.png`, `run-card.json`, and `marks.json` (or `.gz`, render
with `--marks 1`). Target bytes must match the run card. Output must be outside
RUN. Missing Python, weights or execution evidence fails loudly. Uses the repo
line-model environment and cached lllyasviel/Annotators weights, offline:
LineartDetector, then HED, then PiDiNet. The selected model and failures are saved.
Scores from different detectors should not be compared as the same protocol.

`ink.png` replays executed pen geometry with recorded contact widths on white.
It excludes graphite by recorded pen dips. It does not replay pigment depletion,
bleeding, paper texture or later wash occlusion. Planned stage-line files are not
accepted as evidence of executed strokes. Zero ink is a valid result.

The target is resized to the finished plate. Otsu thresholds the trained line map;
its skeleton is the reference. Precision is the length-weighted share of executed
pen centreline within 1 mm of the reference; recall is the share of reference
skeleton samples within 1 mm of executed paths. Length samples are at most 0.25
plate pixels apart; reference distance uses bilinear interpolation of the Euclidean
distance field. This is a raster measurement, with uncertainty of about one pixel.
Null means no denominator, not a perfect score.

Fragment share counts executed pen paths shorter than 5 mm. Tortuosity is path
length divided by endpoint distance; closed paths use a quarter-pixel denominator
and can be large for legitimate closed contours. Median and p90 include these.
Duplicate share is the length within 1 mm of a different path with undirected
tangents within 15 degrees; intentional hatching and overlapping passes can count.
Invented share is unmatched pen length. Invented-in-mass share additionally lies
inside target wash/shadow masses, defined by Otsu on luminance blurred at 5 mm.
This mass proxy cannot establish artistic intent. Report both shares.

Lengths are millimetres; densities use physical sheet area in cm² and normalize
to 100 cm². Pen and all-stroke counts per 100 cm² accompany every result. No human
stroke ceiling is claimed. The JPEG shows target, model map, pen layer and overlay
(hits green, unmatched pen red, missed reference blue). Overlay uses rendered pen
widths, while metrics use centrelines. `score.json` names strict/default mode.
No composite quality grade or release verdict is produced.
