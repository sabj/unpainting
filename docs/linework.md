# Choosing linework

The line comes from one place: a prepared drawing file (`--drawingfile`). An image model draws a clean line drawing of the subject; `tools/seg/trace-drawing.py` traces it and `tools/seg/order-strokes.mjs` orders it as a hand draws ([tools/seg/README.md](../tools/seg/README.md)). The pen or pencil draws its lines as they are. The painter's own line extraction was removed in 0.4 ([Running the painter](running.md#removed-in-04)).

A drawing can combine three stages, all cut from the drawing file:

- `prep` places the hard geometry in light pencil.
- `prepInk` follows it in pen.
- `finishInk` restates chosen lines after the washes.

Omit any stage that has no job. Inspect the executed opening drawing before spending time on washes.

| Job | Tool | What to inspect |
|---|---|---|
| Place difficult proportions | `prep` pencil, then linked `prepInk` | Most pen lies over pencil, and some construction stays visible. Use less pencil for simple silhouettes. |
| Restate a few softened edges after washes | `finishInk` with `accent`; `architecture` for whole frames and sills | Selective reinforcement, not a second complete drawing. |
| Dark hair or curly coats | `scribble` method, only when the subject calls for it | Open lit edges and form-following marks. Dark surface value is still a paint job. |

A prepared drawing is already a selection. The default linked pen keeps it whole, with its coordinates and widths. Do not add artificial wobble to a master's marks.

A pen-only plan:

```json
{"drawing":{"stages":{"prepInk":true}}}
```

A sparse placement drawing under the complete prepared ink set:

```json
{"drawing":{"stages":{
  "prep":{"amount":0.35},
  "prepInk":{"from":"lines","amount":1,"deviate":0}
}}}
```

This recipe keeps short ink accents while pencil places the longer structures. Pencil is not needed when a source
already supplies placement. Use `from: "prep"` with explicit `keep` and `add` when the job is to select and interpret
the pencil drawing. That selection can omit short ink marks. After washes, a selective finish stage can use
`{"from":"prepInk","select":"both","restate":0.2}`.

The pencil share is measured by path length. Keep, add and finish restatement are shares of path counts. Prep ink from
the pencil makes small bounded deviations. Prep ink taken directly from the line set keeps its geometry. Zero shares
mean zero marks. Keep finish ink out of a drawing-only comparison, because its job shows only after the washes.

Use waterproof black ink for an opening drawing that must survive washes. Soluble sepia suits a brown ink drawing that
should soften. The flexible `drawing-ink` nib spans hairlines and emphatic outlines, and keeps prepared point widths.
Fine lines need enough native cells; upscaling an export does not recover them.

Judge the executed sheet at 100%, beside the source and the drawing. Record the commit, native size, seed, plan source, preparation, settings and guard
report on every comparison.

See [plan format](plan-format.md#value-plans-the-drawing-section) for the schema.

## Hand handling and pen dynamics

Gaps, tapers and width offsets are nominal at 1080 cells on a 152.4 mm sheet. They keep their physical size at other
densities.

- `--drawinghand 1` draws a prepared file as a hand would, without changing its selection. It is off by default.
  - Facing continuations are joined within one role, kind, object and region (`--drawjoingap 4`, `--drawjoincos .8`,
    `--drawjoinaim .7`).
  - Strokes are ordered from the last pen lift, and each presses in and lifts off (`--drawtaperin 3`,
    `--drawtaperout 5`, `--drawtaperstart .45`, `--drawtaperend .3`).
  - `--drawlit .04` to `.10` also breaks a contour where both its sides are light (`--drawlitreach 2`).
- `--penstarve 1` lets a gesture run down to its own refill threshold, for an intended dry tail.
- `--finishinkdamp 1` lets the closing pen draw on the paper's existing moisture; it adds no water. A finish line
  placed before the sheet dries can then feather.
- `--penreservoir` sets the nib's capacity: 250 in model units before cell scaling.
- A pen with no ink always dips first. Speed, pause, dip and refill controls on a gesture survive the conversion to
  the sheet. A finer ink sheet (`--inkres`) scales speed as it scales width, so a pause lasts as long.
- `--drawinglogic 3` lays each line with the pen's own pressure, speed and pauses (`shapePenLine` in
  `src/paint/methods/drawing-scribble.mjs`).

The audit and the material swatches are diagnostics, not a quality gate.
