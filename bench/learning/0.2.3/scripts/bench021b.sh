#!/bin/zsh
# Usage: bench021b.sh <chain>   chain = fableB2 | queue2 | swap
# Fixes bench021.sh: scorer venv on PATH (V5 scores between tries with python3 from PATH), real exit codes.
cd ~/unpainting-021
source ~/.unpaint-bench-keys.sh >/dev/null 2>&1; unset ANTHROPIC_API_KEY
export PATH=$HOME/venvs/scorer/bin:$PATH
C=hills,south-france,sargent,mittens,h36a,h34a
chain=$1; log=~/bench021-$chain.log
run() { echo "$(date '+%F %T') start $*" >> $log; npm run -s bench:run -- --crops $C "$@" >> $log 2>&1; local rc=$?; echo "$(date '+%F %T') exit $rc $*" >> $log; }
V5=bench/work/profile-runs/full-v1/runs/v5-self-study
case $chain in
  fableB2) echo "$(date '+%F %T') start score fable V5 try 1" >> $log
           node bench/scripts/score.mjs $V5/fable/1 >> $log 2>&1; echo "$(date '+%F %T') exit $? score" >> $log
           run --model fable --round V5 --profile full --tries 3 --from-try 2 ;;
  swap)    # wait for the old queue's Haiku V4 to end, stop it before its V5 gets far, start queue2
           until grep -q 'exit .* --model haiku55 --round V4' ~/bench021-queue.log 2>/dev/null; do sleep 10; done
           tmux kill-session -t b021-queue; sleep 2
           rm -rf $V5/haiku55
           echo "$(date '+%F %T') swapped old queue for queue2" >> $log
           tmux new-session -d -s b021-queue2 "zsh ~/bench021b.sh queue2" ;;
  queue2)  run --model haiku55 --round V5 --profile full --tries 3
           run --model haiku55 --round V1 --try 1; run --model haiku55 --round V1 --try 2
           run --model haiku55 --round V2 --try 1; run --model haiku55 --round V2 --try 2
           run --model haiku55 --round V3 --tries 3
           for m in terra; do
             run --model $m --round V4 --profile full --tries 3; run --model $m --round V5 --profile full --tries 3
             run --model $m --round V1 --try 1; run --model $m --round V1 --try 2
             run --model $m --round V2 --try 1; run --model $m --round V2 --try 2
             run --model $m --round V3 --tries 3
           done ;;
esac
echo "$(date '+%F %T') chain done" >> $log
