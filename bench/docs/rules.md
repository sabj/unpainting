# Rules

The model paints the picture as a person with a brush and pen would, through the simulator. It looks at the picture. Its code never reads it. Scoring is in [scoring](scoring.md).

## Levels

Auto is the code's own planner working alone. Every score is measured against it. Every level is one fresh session, and it is never given another level's result. Each level adds one thing (`tools/paint/levels.mjs`).

| Level | What the model is given | How it works |
|---|---|---|
| L1 | The picture, the [script format](../../docs/painting-script.md) and painting tips. Nothing is prepared, so any line drawn is its own | Fixed conversation |
| L2 | L1 and the prepared inputs. These are the line drawing, three simplified colour versions of the picture (the studies), the named parts with their boxes, and the shapes traced from the studies, as a numbered picture and a list. The shapes may be wrong, and the model need not use them. Nothing from Auto | Fixed rounds |
| L3 | L2, plus Auto's plan as numbers to read, plus Auto's finished painting to improve on | Fixed rounds |
| L4 | The same as L3 | An open session with a shell and tools |

Comparing L4 with L3 shows the effect of tools alone. The five core pictures run every level. The other ten run Auto and L2.

## The same at every level

- The model hands in its own painting script. It cannot hand in planner settings, or choose the code's plan. A session that hands in no script counts as a failed painting.
- No score, verdict or critique is shown to it.
- The paper is a quarter sheet in area, in the picture's proportions. The simulator, the paint box, the brushes, the judges and the scoring never change.
- A choice that only risks a worse painting gets a warning and is not refused.

The model chooses the whole script. That includes the drawing medium (pencil, pen or none), the pen's ink (waterproof or soluble), any lines of its own, up to 14 paints, and whether to erase. From L2 it also chooses which prepared lines are drawn and when. They can go down before the washes, with a stage, after the washes, or not at all.

## Budget

Each try has 3.0 units for test paintings and 60 minutes on the clock (`--wallminutes 60`, as the benchmark launcher runs it).

- A test painting, also called a look, is the script painted for real at half size and dried. The whole sheet costs 0.3. A full-size painting would cost 1.0. A look that stops after a stage, or covers only a region, costs its share, and never less than 0.05.
- The full-size final painting is made after the model hands in, and costs nothing.
- How the model paints is never charged. Water, strokes, waits and drying are free.
- Two limits stop a run that has gone wrong. They are not budgets. A painting that needs more than ten times the water steps Auto needs for that picture is stopped and not scored. An open session is asked to hand in at 1,000 tool calls, and it cannot go back to an earlier choice more than 20 times.
- When the units or the clock run out, the script as it stands is painted. That is not a failure, unless no script ever worked.

## The fixed conversation (L1 to L3)

This is a back-and-forth conversation with no shell, tools or files (`tools/paint/rounds.mjs`).

- The brief, the level's data and the pictures are sent once. The model answers with its whole script.
- After each look it is sent its own dried sheet, on a millimetre grid, with the plan in numbers. It is never sent the picture beside it, or any measurement against the picture or a study.
- It answers with edits (`add`, `remove`, `replace`, `move`, `set`, `drawing`). Then it either asks for its next look (the whole sheet, one stopped at a stage, or a region) or says it is done.
- A script or edit that does not work is sent back once, free. If a second one in a row fails and there is no working script yet, the try ends. Otherwise the last working script is painted.
- At most 40 turns.

## The open session (L4)

The model works in a sandbox, in a fresh folder outside the repository. It has a shell, a fixed set of Python tools (numpy, pillow, scipy, scikit-image and opencv) and the painter's commands: `./unpaint plan` (checks the script, free), `look`, `show` and `status`. Every model gets the same tools and budget.

- It cannot read the repository, the picture list or other sessions. The network lets through only its own provider's hosts.
- Pictures are for looking at. They are the original, the three studies, Auto's painting, and each look's `beside.png` and `stages.png`. Only the model tool's own image viewer can read them. The sandbox refuses a script, `cat`, copy, link or move.
- The input pictures are put away when the model plans or looks. `./unpaint show` brings the original back for 0.05 of a unit. A study is free.
- A script may read the named parts, the drawing's lines, the traced shapes, Auto's plan, the numbers and plan from each look, `sheet.png` (its own dried sheet alone) and its own files.
- A tool whose sandbox cannot keep the pictures safe is not started. `npm run paint -- SUBJECT preflight --author KEY` checks a tool first.

## Disqualification & Eyes-Only Guard

When the OS sandbox holds the input pictures (`held: true`), every code attempt to read a picture's bytes is refused by the kernel (`EPERM`) so zero pixels leak: blocked attempts or scripts naming a picture are recorded in `guard` and flagged for review (`cheat.flagged = true`), while the session is still painted and scored normally (`tools/paint/eyes-only.mjs`). A try is hard-disqualified (recorded, kept, and nothing of it painted) only when code reads or names a picture in an unheld environment where target pixels could actually be read.

Cheating means hill climbing toward the original. That is changing strokes to reduce image error, fitting them pixel by pixel, or keeping a stroke only when it improves the match. Looking at the original, as a painter glances at a reference, is the task.

## Cheat risk

The cheat risk is a number from 0 to 1 kept beside the scores (`cheat-risk.json`, `tools/guard/cheat-risk.mjs`). It has three parts. Of the total, 0.45 comes from how little the stages look like a person's progress. Another 0.45 comes from how closely the fine detail matches the original, beyond what an honest painting would reach. The last 0.1 comes from the share of small strokes. Under 0.3 is low and 0.5 or more is high. A painting step that read the original is always high. A high number means a person should take a look. It never changes a score or excludes a try, because weak technique raises the same signals as copying.

## Screening

Every model on the list first paints two core pictures at L2. The top half by average combined score goes on to the rest, along with at least one model from each family ([run-sets.json](../run-sets.json) `rounds`; `node tools/paint/screening.mjs plan`).

## Recorded

Each run's `run.json` and `usage.json` hold the level, the budget, each look and its price, the tokens, cost, machine seconds, steps, tool use and refusals, the commit and the versions. A failed run is kept and scored as a failure. It is never dropped.
