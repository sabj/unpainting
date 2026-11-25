#!/bin/zsh
# studies.sh ID...: for each picture (its source at $UNPAINT_PREP/studio/img/ID.jpg), what the image model makes, at the
# three seeds 42, 7 and 11: the pencil lay-in (prompt l1) and the three colour studies (s3, s1, s4): 12 jobs, about four
# minutes each; a picture the classifier measured as ink (classify/ID.json) also gets its ink line (e6), 3 more. Then
# its thing labels (labels.py). Files that exist are skipped, so it can be run again. One model job at a time on the
# machine: a lock folder in the preparation folder. The log (guides/tools/study-model.log) is the generation record.
# Needs: UNPAINT_STUDY_PYTHON (a Python with mflux) and UNPAINT_STUDY_LORA (study_model.py); Ollama for the labels.
# INK_BY_HAND="id id": pictures whose drawing medium is set to pencil by hand (register.py MEDIUM_BY_HAND): no ink line.
set -e
. ${0:A:h}/env.sh
[[ -x $UNPAINT_STUDY_PYTHON ]] || { echo "UNPAINT_STUDY_PYTHON is not set to a Python with mflux" >&2; exit 2; }
[[ -f $UNPAINT_STUDY_LORA ]] || { echo "UNPAINT_STUDY_LORA is not set to the Lightning 8-step LoRA file" >&2; exit 2; }
cd $R; mkdir -p studies guides/tools labels
# one model job at a time: the lock is an empty folder holding the pid; a dead holder's lock is taken over
LOCK=$R/.one-model.lock
while ! mkdir $LOCK 2>/dev/null; do h=$(cat $LOCK/pid 2>/dev/null); [[ -n $h ]] && ! kill -0 $h 2>/dev/null && { /bin/rm -f "${LOCK:?}/pid"; rmdir "${LOCK:?}"; }; sleep 10; done
echo $$ > $LOCK/pid; trap '/bin/rm -f "${LOCK:?}/pid"; rmdir "${LOCK:?}"' EXIT INT TERM
BY_HAND=(${=INK_BY_HAND:-ender-mountain-valley cezanne-bathers-bridge randal-resegone})
for i in "$@"; do
  [[ -f studio/img/$i.jpg ]] || { echo "$i: no source at studio/img/$i.jpg" >&2; exit 2; }
  J=()
  for s in 42 7 11; do sf=""; [[ $s != 42 ]] && sf="-s$s"
    [[ -f guides/$i-layin-l1L8$sf.png ]] || J+=("studio/img/$i.jpg|guides/$i-layin-l1L8$sf.png|l1|1|$s")
    for p in s3 s1 s4; do [[ -f studies/$i-study-${p}L8$sf.png ]] || J+=("studio/img/$i.jpg|studies/$i-study-${p}L8$sf.png|$p|1|$s"); done
  done
  if [[ ${BY_HAND[(Ie)$i]} == 0 ]] && grep -q '"measured_class": "ink"' classify/$i.json; then
    for s in 42 7 11; do sf=""; [[ $s != 42 ]] && sf="-s$s"; [[ -f guides/$i-inkprep-e6L8$sf.png ]] || J+=("studio/img/$i.jpg|guides/$i-inkprep-e6L8$sf.png|e6|1|$s"); done
  fi
  (( ${#J} )) && $UNPAINT_STUDY_PYTHON $HERE/study_model.py $J | tee -a guides/tools/study-model.log
  [[ -f labels/$i.json ]] || $V $HERE/labels.py $i studio/img/$i.jpg
  echo "DONE $i $(date)"
done
