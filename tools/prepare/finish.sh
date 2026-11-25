#!/bin/zsh
# finish.sh ID: everything after the image model (studies.sh) for one picture, in order; about ten minutes, CPU and a
# little SAM. ID is the picture's id in register.py's table (its row must be there: source, provenance, note).
#   1 the lay-in: the seed that passes the drawing-fidelity check with the fewest invented marks, cleaned (choose_layin.py)
#   2 register (the record appears, seed and vectors pending)
#   3 fit the lay-in's vectors for the record's sheet (vectors.sh)
#   4 the study seed, by the one automatic rule (pick.py, seedchoice.py); no seed is picked by hand
#   5 tag every stroke of the drawing against the source: ink, graphite or dropped (tools/seg/tag-medium.py), as version -v2
#   6 AN INK PICTURE (the classifier measured ink, and its medium is not set to pencil by hand): its ink line too: the
#     e6 seed chosen and cleaned the same way, fitted as ID-std-ink and tagged with --picture ink. (Until 0.4 rc7 this
#     step was done by hand and was missing from the script: Prout's Laundresses needs it.)
#   7 the named forms (named_forms.py: the labels' boxes, SAM ViT-B; needs PAINTER_SAM_CHECKPOINT)
#   8 register again: everything pinned by its sha256
# Then rule.sh ID puts the picture on the standard sheet (its record ID-qs), which is what the benchmark runs.
set -e
. ${0:A:h}/env.sh
i=$1; [[ -n $i ]] || { echo "usage: finish.sh ID" >&2; exit 2; }
cd $R; O=replay/vectors; SRC=studio/img/$i.jpg
BY_HAND=(${=INK_BY_HAND:-ender-mountain-valley cezanne-bathers-bridge randal-resegone})
$V $HERE/choose_layin.py $i $SRC l1 | tail -1
python3 $HERE/register.py --repin-only $i | tail -1
MM=$(field $i "s['sheet']['widthMm']")
$HERE/vectors.sh $i-std-layin guides/$i-layin.png $SRC $MM pencil | tail -1
PICK_JSON=$R/segaudit/pick-$i.json $V $HERE/pick.py $i | grep -v Warn | tail -1
[[ -f segaudit/seed-choice.json ]] && cp segaudit/seed-choice.json segaudit/seed-choice.json.prev
python3 $HERE/seedchoice.py pick-$i.json
NAME=$(field $i "s['name']")   # the seed choice is kept under the subject's name, which is not always its id (white-ships-1488 is sargent-ships-large)
SD=$(python3 -c "import json,sys;print(json.load(open('segaudit/seed-choice.json'))[sys.argv[1]]['seed'])" $NAME); sf=-s$SD; [[ $SD == 42 ]] && sf=""
PIC=none; [[ ${BY_HAND[(Ie)$i]} == 0 ]] && grep -q '"measured_class": "ink"' classify/$i.json && PIC=ink
(cd $REPO && $V tools/seg/tag-medium.py $R/$O/$i-std-layin-vectors.json $R/$SRC --mode contour --picture $PIC --study $R/studies/$i-study-s3L8$sf.png --out $R/$O/$i-std-layin-v2-vectors.json) | grep -v Warn | tail -1
cp $O/$i-std-layin-lines.json $O/$i-std-layin-v2-lines.json
if [[ $PIC == ink ]]; then
  $V $HERE/choose_layin.py $i $SRC e6 ink | tail -1
  $HERE/vectors.sh $i-std-ink guides/$i-inkprep.png $SRC $MM ink | tail -1
  (cd $REPO && $V tools/seg/tag-medium.py $R/$O/$i-std-ink-vectors.json $R/$SRC --mode contour --picture ink --study $R/studies/$i-study-s3L8$sf.png --out $R/$O/$i-std-ink-v2-vectors.json) | grep -v Warn | tail -1
  cp $O/$i-std-ink-lines.json $O/$i-std-ink-v2-lines.json
fi
$V $HERE/named_forms.py $i | tail -1
python3 $HERE/register.py --repin-only $i | tail -1
