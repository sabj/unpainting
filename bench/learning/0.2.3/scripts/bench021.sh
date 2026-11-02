#!/bin/zsh
# Usage: bench021.sh <chain>   chain = fableA | fableB | queue
# All runs: release 0.2.1 (~/unpainting-021, branch bench/fable-021), six targets, Trumbull dropped.
cd ~/unpainting-021
source ~/.unpaint-bench-keys.sh >/dev/null 2>&1; unset ANTHROPIC_API_KEY
C=hills,south-france,sargent,mittens,h36a,h34a
chain=$1; log=~/bench021-$chain.log
run() { echo "$(date '+%F %T') start $*" >> $log; npm run -s bench:run -- --crops $C "$@" >> $log 2>&1; echo "$(date '+%F %T') exit $? $*" >> $log; }
case $chain in
  fableA) run --model fable --round V4 --profile full --tries 3
          run --model fable --round V1 --try 1; run --model fable --round V1 --try 2
          run --model fable --round V2 --try 1; run --model fable --round V2 --try 2
          run --model fable --round V3 --tries 3 ;;
  fableB) run --model fable --round V5 --profile full --tries 3 ;;
  queue)  until grep -q 'chain done' ~/bench021-fableA.log 2>/dev/null && grep -q 'chain done' ~/bench021-fableB.log 2>/dev/null; do sleep 120; done
          for m in haiku55 terra; do
            run --model $m --round V4 --profile full --tries 3; run --model $m --round V5 --profile full --tries 3
            run --model $m --round V1 --try 1; run --model $m --round V1 --try 2
            run --model $m --round V2 --try 1; run --model $m --round V2 --try 2
            run --model $m --round V3 --tries 3
          done ;;
esac
echo "$(date '+%F %T') chain done" >> $log
