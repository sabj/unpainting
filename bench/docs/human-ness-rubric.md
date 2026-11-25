# Human-ness rubric

The judge sees one snapshot at a time, with only its percentage complete. It
has no knowledge of the method. It first asks of the whole sequence: is this
the order and the kind of mark a person would use for this subject? Then it
scores each snapshot 1 to 5:

- 5: unmistakably a person's painting in progress. Drawn lines are continuous
  confident strokes. Washes have soft, irregular, wet edges. Marks are laid in
  a few places at a time and are whole when laid. Nothing is a flat
  placeholder. Nothing floats without its form.
- 4: convincing, with one small tell.
- 3: plausible, but a tell a viewer would notice.
- 2: mostly not: two or more of the tells below.
- 1: a finished image being uncovered by a filter, mask, wipe or dissolve.

Tells, each named by a letter so results can be tallied:
- (a) speckle or dotted trails where there should be drawn lines
- (b) cut or scalloped wash edges; round holes inside colour
- (c) flat evenly-toned slabs standing in for a form
- (d) a feature painted before its form (a tongue with no dog)
- (e) the whole sheet at one faint value, as if faded in
- (f) a region arriving finished in one step while its neighbour is untouched
- (g) a straight travelling front, a wipe
- (h) nothing changes between this snapshot and the previous one
- (i) lines that do not describe the subject: an outline of where paint will
  be, a horizon drawn as a contour, a drawing nobody would make of this thing
- (j) texture arriving as a dump: the picture sharpening everywhere at once
  late in the sequence, rather than being made mark by mark

For each snapshot the judge writes one JSON object:
`{"frame": "<file>", "pct": <n>, "score": <1-5>, "tells": ["a", "c"], "note": "<one sentence>"}`

The judge writes all objects as a JSON array to the output path it is given,
and nothing else. Scores are for the snapshot as a whole, at normal viewing
size; the judge may zoom to confirm a tell but must not score on zoom alone.
