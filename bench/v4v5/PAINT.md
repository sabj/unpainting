> **Retired in 0.4.** This task ran on painter 0.2.x and 0.3.x. Its plans (styleSelection, recipe tokens, `example/`) ask for the light-to-dark value plan and options that 0.4 removed, so it cannot run on this trunk: `npm run bench:run` refuses V4 and V5. Check out tag `v0.3.2` to replay it. The next task is the draft in `bench/v6/`.

bash bench/paint.sh <command>     (the painter runs on this machine; it stops at every passage boundary)

  start                 check your plan files (as bench/check.sh) and start painting them; answers at the first stop
                        (before the first wash)
  look                  at a stop: bench/looks/<n>-sheet.jpg (your sheet so far) and, unless the run is strict,
                        <n>-compare.jpg (target | sheet), the stroke count and the passes still to come; three looks
                        while painting, one at the finished painting
  next                  paint the next pass, stop after it
  run <pass>            stop after pass <pass>          run closing   stop before the closing drawing
  finish                no more stops; answers when the painting is finished
  wait                  keep waiting for the painter (when an answer said "still painting")
  revise [then next|run <pass>|run closing|finish]
                        once after a look, at that stop: check your edited plan files; the painter plans again from them and goes on from
                        where it is (what is painted stays; it continues with the next pass of the new ladder)
  status                where the painter is, and your time used of 85 minutes (waiting in paint.sh is not counted)
