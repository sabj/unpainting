## How this try runs: fixed rounds

This is a short, fixed conversation. You have no shell, no tools and no files: you look at the pictures attached and
you write. No code reads a picture here, yours or the harness's: the subject, the drawing and the studies are for
your eyes. So write a wash as a shape and a way of laying it (`region` or `regions`, `kind`, `handling`): the painter
fills the shape with strokes itself. Stroke-by-stroke paths are for the few marks that need them.

1. **Now**: answer with your plan and painting script, as this brief asks (one JSON object).
2. **Looks**: the painter then lays your script for real on a small sheet (the same millimetres, half the cells
   across), dries it, and you are sent YOUR OWN SHEET as it dried, on the millimetre grid, with the plan in numbers.
   Nothing else comes back: no picture of the subject beside it and no measurement against the subject or a study.
   Compare by eye with the pictures you were given at the start; they stay in this conversation.
3. **After each look** you answer with ONE JSON object:
   - `{"edits": [...], "look": "whole"}` to change the script and see it again. `"look"` may be `"whole"`,
     `{"until": 2}` (stopped after stage 2 and dried there), `{"region": [x0, y0, x1, y1]}` (the passages that touch
     that box, in mm) or `{"region": "FORM NAME"}`.
   - `{"edits": [...], "done": true}` or `{"done": true}`: your script as it then stands is painted at full size,
     filmed, and that is your painting. When the edits you are sending are your last, say `"done": true` in that
     same answer: an answer that only says done afterwards is a round spent on nothing.
4. **Budget**: LOOKS_MOST look units for this try: enough for LOOKS_WHOLE looks of the whole script. A look of the whole script costs 0.3; stopped after a stage or cut
   to a region, its share; never under 0.05. The full-size final is not charged. How you paint (water, strokes, waits)
   is never charged. Each message tells you what is left. When too little is left for a look, the script as it
   stands is painted.
5. A script or an edit that cannot be read or compiled is returned to you once, free, with the reason. A second
   answer in a row that cannot be used ends the changes (with no script yet, it ends the try).

### Edits

`"edits"` is a list, applied in order to your present script; each message names the script by a short hash.

| edit | what it does |
|---|---|
| `{"op": "set", "id": "p03", "path": "paint.dilution", "value": "pale"}` | one field of a passage: `paint.pigments`, `paint.swatch`, `brush`, `paper`, `wait`, `into`, `edges`, `stage`, `region`, `regions`, `strokes`, `handling.direction`, `handling.load`, ... A `null` value removes the field |
| `{"op": "set", "ids": ["p03", "p04"], "path": "paint.dilution", "value": "pale"}` | the same field of several passages at once (`"ids": "*"`: of every passage) |
| `{"op": "set", "path": "palette", "value": [...]}` | without `id`: a field of the script itself (`palette`, `brushes.r8`, `lights`, `approach`) |
| `{"op": "add", "passage": {...}, "after": "p03"}` | a new passage, `after` or `before` a passage; at the end when neither is named |
| `{"op": "remove", "id": "p07"}` | a passage taken out |
| `{"op": "replace", "id": "p05", "passage": {...}}` | a passage written again, in its place |
| `{"op": "move", "id": "p09", "before": "p04"}` | the order changed |
| `{"op": "drawing", "medium": "pen", "ink": "waterproof", "lines": {...}}` | the drawing beside your script: `medium` (`pencil`, `pen`, `none`), the pen's `ink` (`waterproof`, `soluble`), and `lines` (`{"format": "lines-edit 1", "own": [{"points": [[x, y], ...], "medium": "pen", "widthMm": 0.4, "dark": 0.8, "when": "before"}]}`: lines of your own) |

Change what the look showed you needs changing and leave the rest. A whole new script (a JSON object with
`"passages"`) in place of `"edits"` is allowed, and is the exception.
