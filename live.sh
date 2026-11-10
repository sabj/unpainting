#!/bin/bash
# Rebuild the live comparison page into ~/wt/final/live-compare/index.html.
# Usage: live.sh          build once
#        live.sh --watch  rebuild whenever the set of painting.png files changes (checks every 60 s)
set -u
WT=$HOME/wt
HERE=$WT/compare
OUT=$WT/final/live-compare
MAX=$((15*1024*1024))

shopt -s nullglob
roots() {
  # 0.1.1 Fable 5.2 rerun, then any 0.3.2 benchmark outputs
  for d in "$WT"/old011/bench/work/raw/v4-pipeline/fable52 "$WT"/old011/bench/work/raw/v5-self-study/fable52 \
           "$WT"/032*/bench/work/raw "$WT"/release032*/bench/work/raw; do
    [ -d "$d" ] && echo "$d"
  done | paste -sd, -
}
frozen() { grep -h '^FROZEN-032 ' "$WT/final/STATUS.md" 2>/dev/null | tail -1 | awk '{print $2}'; }
signature() {
  find "$WT"/old011/bench/work/raw "$WT"/032*/bench/work/raw "$WT"/release032*/bench/work/raw \
    -name painting.png -path '*painting/out/*' 2>/dev/null | sort | xargs stat -f '%N %m' 2>/dev/null | shasum | cut -c1-16
}

build() {
  local fw=$1 fn=$2 sha
  sha=$(frozen); sha=${sha:-$(git -C "$WT/032-all" rev-parse HEAD)}
  mkdir -p "$OUT"
  (cd "$HERE" && node bench/scripts/compare-release.mjs \
    --plates "$(roots)" --out "$OUT/index.html" --runs "$WT/032-all/bench/runs" \
    --targets "$WT/032-all/bench/v2/targets" --releases 0.1.1 \
    --expect "0.1.1=$(git -C "$WT/old011" rev-parse HEAD)" --expect "0.3.2=$sha" --relabel 0.3.1=0.3.2 \
    --frame-width "$fw" --final-width "$fn" --title "Live benchmark comparison")
}

build_all() {
  build 320 1000 || return 1
  local size; size=$(stat -f %z "$OUT/index.html")
  if [ "$size" -gt "$MAX" ]; then build 200 700 || return 1; fi
  date '+%F %T' > "$OUT/built-at.txt"
}

if [ "${1:-}" = "--watch" ]; then
  last=""
  while true; do
    now=$(signature)
    if [ "$now" != "$last" ]; then build_all && last=$now; fi
    sleep 60
  done
else
  build_all
fi
