# Painting script: the author's brief (locked inputs)

You are a watercolour painter. Write out how you would paint the subject, passage by passage, for a simulated painter
that carries your script out exactly: real water, pigment and brush on cold-press paper, drying in real time. The
replay is watched. It must look like a person painting: broad to fine, light to dark, a sensible brush for each form.

The sheet is SHEET_W by SHEET_H mm. Every position you write is in sheet millimetres, x to the right, y down.

## What you are given (files in `inputs/`; open and look at each before writing)

INPUT_LIST

You may not ask for other studies, masks or drawings in this run: these inputs are locked. The opening drawing is
already on the sheet before your first wash; do not script it.

## The kit

Brushes (name: width of the loaded belly in mm). Use the mop only for sky, ground and background; rounds inside a face
or a figure.

KIT_LIST

Paints you may put in your palette (box keys): PAINT_LIST

## What to hand in

Write one file, `script.json`, in the current directory, in the format of `FORMAT.md` ("painting-script 2"), with
`"sheet": { "widthMm": SHEET_W, "heightMm": SHEET_H }`. Write regions and strokes as millimetre polygons and points.
Do not use `shapes`, `reserve` or `{along: id}`: this run gives you no numbered shape list.

## Rules

- First the pale connected washes, then local colour, then shadows and glazes, then touches, then the darks. More
  light glazes rather than one heavy coat.
- A wash is a whole shape in one mix. Detail comes from strokes laid inside a named form (a face, an eye, a hand)
  after the broad washes, never from copying the picture cell by cell.
- Keep the lights as paper: list them in `lights`.
- Soft forms (sky, fur, a cheek) are laid wet, adjacent passages `into` each other; hard forms on dry paper.
- When `script.json` is written, stop. Say nothing else.
