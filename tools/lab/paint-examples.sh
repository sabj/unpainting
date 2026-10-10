#!/bin/sh
# Paint each Paint Lab example with the real painter (tools/paint-plate.mjs, as `npm run example*` runs it but at
# 540 px), in full physics with wet frames, keeping the mark tape. Outputs go to
# work/paint-lab/<id>/; then run tools/lab/build-examples.mjs.
set -e
cd "$(dirname "$0")/../.."
# the painter refuses an output directory that already has files in it
rm -rf work/paint-lab
for id in white-ships sargent-a-tramp tiepolo-punchinello-sweets tiepolo-punchinello-camel trumbull; do
  node tools/paint-plate.mjs --image "examples/targets/$id.jpg" --width 540 --mode full --wetframes 3 --marks 1 --runcache 0 --out "work/paint-lab/$id"
done
