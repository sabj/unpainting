#!/bin/zsh
# Score finished v0.2.1 Fable runs on Together, one at a time.
cd ~/unpainting-021
source ~/.unpaint-bench-keys.sh >/dev/null 2>&1
export PATH=$HOME/venvs/scorer/bin:$PATH
log=~/score021.log
for d in bench/runs/v1-naive/fable/{1,2} bench/runs/v2-skill/fable/{1,2} bench/runs/v3-informed/fable/{1,2,3} bench/work/profile-runs/full-v1/runs/v4-pipeline/fable/{1,2,3}; do
  echo "$(date '+%F %T') start $d" >> $log
  node bench/scripts/score.mjs $d >> $log 2>&1; rc=$?
  echo "$(date '+%F %T') exit $rc $d" >> $log
done
echo "$(date '+%F %T') score done" >> $log
