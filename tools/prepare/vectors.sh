#!/bin/zsh
# vectors.sh STEM DRAWING TARGET SHEETMM MEDIUM: a prepared drawing (a lay-in or an ink line, a picture) as vector strokes
# fitted for a sheet SHEETMM across: $UNPAINT_PREP/replay/vectors/STEM-lines.json and STEM-vectors.json (the painter's
# --drawingfile is the stem), the fit's measure in STEM-fit.json. DRAWING and TARGET are relative to the preparation
# folder; MEDIUM is pencil or ink. A drawing is fitted in millimetres of ITS sheet: another sheet width, another fit.
# Steps: trace (tools/seg/trace-drawing.py), order (order-strokes.mjs), vectors (ink-vectors.py), the playing order
# (form-order.mjs, with the picture's labels and, when UNPAINT_SEGMENTS holds one for the target, its object regions),
# then the fit's measure (vfit.py). A minute or two on one core. Files that exist are overwritten: give a new STEM
# (STEM-v2 ...) for a new version of a pinned drawing.
set -e
. ${0:A:h}/env.sh
ID=$1; D=$2; T=$3; MM=$4; MED=$5; O=$R/replay/vectors
[[ -n $ID && -n $MED && -f $R/$D && -f $R/$T ]] || { echo "usage: vectors.sh STEM DRAWING TARGET SHEETMM pencil|ink (paths in $R)" >&2; exit 2; }
mkdir -p $O; cd $REPO
$V tools/seg/trace-drawing.py $R/$D --target $R/$T --sheetmm $MM --medium $MED --out $O/$ID-traced > /dev/null
node tools/seg/order-strokes.mjs $O/$ID-traced-lines.json $O/$ID --sheetmm $MM --order growth --threshold 0 > /dev/null
$V tools/seg/ink-vectors.py $R/$D $O/$ID-lines.json --sheetmm $MM --out $O/$ID-vectors.json
# the playing order: construction, structure, detail, texture over the whole sheet (the laid ink is unchanged)
H=$(python3 -c "import json,sys;print((json.load(open(sys.argv[1])).get('targetSHA256') or '')[:16])" $O/$ID-vectors.json)
SEGDIR=${UNPAINT_SEGMENTS:-$REPO/work/segments/by-hash}
SEG=""; [[ -n $H && -d $SEGDIR ]] && SEG=$(find $SEGDIR -maxdepth 1 -name "$H-sam-*.png" ! -name "*-contours*" 2>/dev/null | head -1)
L=$ID; while [[ ! -f $R/labels/$L.json && $L == *-* ]]; do L=${L%-*}; done; [[ -f $R/labels/$L.json ]] || L=""
A=(); [[ -n $L ]] && A+=(--things $R/labels/$L.json); [[ -n $SEG ]] && A+=(--regions $SEG)
echo "order $ID: labels ${L:-none}, regions ${SEG:-none}" >&2
node tools/seg/form-order.mjs $O/$ID-vectors.json $O/$ID-vectors.json.tmp-$$ $A && mv $O/$ID-vectors.json.tmp-$$ $O/$ID-vectors.json
$V $HERE/vfit.py $R/$D $O/$ID-vectors.json > $O/$ID-fit.json
/bin/rm -f "${O:?}/${ID:?}-traced-ink.png" "${O:?}/${ID:?}-traced-skeleton.png"
echo "$ID $(cat $O/$ID-fit.json)"
