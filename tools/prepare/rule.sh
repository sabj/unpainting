#!/bin/zsh
# rule.sh ID: put a prepared picture on the STANDARD SHEET (the one-area rule: a quarter sheet's area in the picture's
# proportions; tools/paint/sheet-rule.mjs). Its record under the rule is ID-qs, written by register.py for every
# benchmark picture (RULE_IDS); the earlier record ID is not touched. What is made here, because it is in millimetres
# of the sheet: the drawing's vectors, fitted again at the new width as replay/vectors/ID-qs-std-<layin|ink>, and tagged
# again (-v2). What carries over with its checksum: the source, the studies, the lay-in or ink picture, the labels,
# the seed. The named forms are in the source's pixels: the folder is copied to named-forms/ID-qs. Then everything is
# pinned (register.py) and the check is run for the picture.
# A picture whose rule sheet is the sheet it already had (Mittens close-up) keeps its fit: nothing is fitted.
# NOT repeated here, because no script made them: a drawing that was cleaned or re-versioned by hand. rule.sh fits and
# tags, says what the earlier drawing had, and stops before pinning: Guardi's collection marks removed by region, the
# -v3 ink fits of Rosewalk (h36) and Kasha portrait.
set -e
. ${0:A:h}/env.sh
i=$1; q=$i-qs; [[ -n $i ]] || { echo "usage: rule.sh ID (the earlier record's id)" >&2; exit 2; }
cd $R; O=replay/vectors
python3 $HERE/register.py --repin-only $q | tail -1
STEM=$(field $q "s['inputs']['drawingVectors']['stem']"); OLD=$(field $i "s['inputs']['drawingVectors']['stem']")
if [[ ${STEM:t} != $q-* ]]; then echo "$q: the rule gives this picture the sheet it already had; its fit $STEM stands"
else
  HAND=$(field $i "(s['inputs']['drawingVectors'].get('removed') or {}).get('why') or ''")
  [[ ${OLD:t} == *-v[3-9] ]] && HAND="its drawing is $OLD, a later version than the scripted -v2: what made it is not in this script"
  HOW=$(field $q "s['inputs']['drawingVectors']['how']"); KIND=layin; [[ $HOW == *" ink" ]] && KIND=ink
  echo "$q: $HOW"; ${=HOW/tools\/prepare\/vectors.sh/$HERE/vectors.sh} | tail -1
  SRC=$(field $q "s['source']['path']"); S3=$(field $q "s['inputs']['studies'][0]['path']")
  PIC=none; [[ $KIND == ink ]] && PIC=ink
  (cd $REPO && $V tools/seg/tag-medium.py $R/$O/$q-std-$KIND-vectors.json $R/$SRC --mode contour --picture $PIC --study $R/$S3 --out $R/$O/$q-std-$KIND-v2-vectors.json) | grep -v Warn | tail -1
  cp $O/$q-std-$KIND-lines.json $O/$q-std-$KIND-v2-lines.json
  if [[ -n $HAND ]]; then echo "$q: STOP. The earlier drawing had a step by hand that this refit does not repeat: $HAND. Repeat it on $O/$q-std-$KIND-v2, then: python3 tools/prepare/register.py --repin-only $q" >&2; exit 3; fi
fi
[[ -d named-forms/$i && ! -d named-forms/$q ]] && cp -R named-forms/$i named-forms/$q
python3 $HERE/register.py --repin-only $q | tail -1
(cd $REPO && UNPAINT_SUBJECTS=${SUBJECTS_JSON:-$R/SUBJECTS.json} node tools/paint/run-sets.mjs check extended | grep " $q") || true
