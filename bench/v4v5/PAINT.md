bash bench/paint.sh <command>     (the painter runs on this machine; it stops at every passage boundary)

  start                 check your plan files (as bench/check.sh) and start painting them; answers at the first stop
                        (before the first wash)
  look                  at a stop: bench/looks/<n>-compare.jpg (target | your sheet so far) and <n>-sheet.jpg, the
                        stroke count and the passes still to come
  next                  paint the next pass, stop after it
  run <pass>            stop after pass <pass>          run closing   stop before the closing drawing
  finish                no more stops; answers when the painting is finished
  wait                  keep waiting for the painter (when an answer said "still painting")
  revise [then next|run <pass>|run closing|finish]
                        at a stop: check your edited plan files; the painter plans again from them and goes on from
                        where it is (what is painted stays; it continues with the next pass of the new ladder)
  status                where the painter is, and your time used of 85 minutes (waiting in paint.sh is not counted)
