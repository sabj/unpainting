#!/bin/bash
# The harness's admission check, exactly as `bash bench/paint.sh start` runs it. Usage (from the tree root): bash bench/check.sh
# 1) the refusals before any painting: prints the painter arguments your plan resolves to, the base tokens applied or
#    skipped, and "ok": true or the reasons it would refuse the painting;
# 2) the painter's planning step (value plan, no painting) at the full painting width, which catches plans the painter
#    cannot paint (for example straight reserve or region edges that no target edge supports).
# The last line is ADMITTED or REFUSED.
cd "$(dirname "$0")/.." || exit 2
exec node bench/check.mjs
