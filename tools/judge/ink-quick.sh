#!/bin/bash
# Quick ink check: paints only the opening drawing (no washes, no judge) on a few pen-and-wash targets at small size,
# then measures the pen lines against the source with ink-lines-report.mjs. Meant for fast A/B of ink flags.
#   tools/judge/ink-quick.sh <label> [painter flags...]
#   e.g. tools/judge/ink-quick.sh wash --inkrecipe wash
# Writes work/ink-quick/<label>/<target>/ and prints one line per target: placement recall, precision and F1 against the
# source's pen lines, pen darkness at the source's lines (painted / source) and ink hue (painted / source).
# INK_QUICK_TARGETS (space-separated paths) and INK_QUICK_WIDTH (default 540) override the defaults.
set -euo pipefail
cd "$(dirname "$0")/../.."
label=${1:?usage: ink-quick.sh <label> [painter flags...]}; shift
width=${INK_QUICK_WIDTH:-540}
targets=${INK_QUICK_TARGETS:-"bench/ink-heavy/targets/guardi-colonnade.jpg bench/ink-heavy/targets/tiepolo-bacchus-ariadne.jpg demos/lab/examples/h36-a/h36-a.png"}
start=$(date +%s)
for t in $targets; do
  name=$(basename "$t" | sed 's/\.[a-z]*$//')
  out=work/ink-quick/$label/$name
  rm -rf "$out" "$out.log"; mkdir -p "$(dirname "$out")"
  node tools/paint-plate.mjs --image "$t" --width "$width" --mode fast --segments off --video 0 --frames 0 \
    --drawingonly 1 --allowunused 1 --allowdirty 1 "$@" --out "$out" > "$out.log" 2>&1 || { echo "$name: painter failed, see $out.log"; continue; }
  node tools/judge/ink-lines-report.mjs --image "$t" --run "$out" --out "$out/ink.json" --crops "$out/crop" > /dev/null 2>&1 || { echo "$name: report failed"; continue; }
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const g = (o, ...k) => k.reduce((a, b) => a?.[b], o);
    const pick = (...ks) => { for (const k of ks) { const v = g(r, ...k.split(".")); if (typeof v === "number") return v.toFixed(2); } return "-"; };
    const R = +pick("placement.recall"), P = +pick("placement.precision"), F = R + P > 0 ? 2 * R * P / (R + P) : 0;
    console.log(process.argv[2].padEnd(28), "recall", R.toFixed(2), " precision", P.toFixed(2), " F1", F.toFixed(2),
      " line dark", pick("darknessAtSourceLines.pen"), "/", pick("darknessAtSourceLines.source"), " hue", pick("pen.hue"), "/", pick("source.hue"));' "$out/ink.json" "$name"
done
echo "$label: $(( $(date +%s) - start )) s total, crops in work/ink-quick/$label/*/crop-crop1.jpg"
