#!/bin/zsh -l
# go.sh WAVE...: starts the runner on the waves named, in order (go.sh 1 2 3; go.sh test). The only switch that starts
# paid work: sessions (models), prepares and finals (pods), scoring (OpenRouter). Checks first, starts nothing on a fault.
# Stop everything: stop.sh. Progress: the page setup.sh printed.
H=${0:A:h}; CFG=$H/config.json
j() { /usr/bin/python3 -c "import json,sys; print(json.load(open('$CFG'))[sys.argv[1]])" $1; }
BASE=$HOME/$(j base); BENCH=$HOME/$(j bench); KEYS=$HOME/$(j keys); U=$(id -u)
(( $# )) || { echo "usage: go.sh WAVE... (waves: $(/usr/bin/python3 -c "import json; print(' '.join(json.load(open('$H/waves.json'))['waves']))"))"; exit 2; }
fault=0; say() { echo "NOT STARTED: $*"; fault=1; }
pid=$(cat $BASE/state/runner.pid 2>/dev/null); [[ -n $pid ]] && kill -0 $pid 2>/dev/null && say "the runner is already running (pid $pid)"
for w in "$@"; do /usr/bin/python3 -c "import json,sys; sys.exit(0 if sys.argv[1] in json.load(open('$H/waves.json'))['waves'] else 1)" $w || say "no wave $w in waves.json"; done
local_only=$(/usr/bin/python3 -c "import json,sys; w=json.load(open('$H/waves.json'))['waves']; print(int(all(w[x].get('render')=='local' for x in sys.argv[1:] if x in w)))" "$@")
[[ $local_only == 1 || -r $KEYS/runpod.env ]] || say "no RunPod key file $KEYS/runpod.env (finals are painted on pods)"
[[ -r $KEYS/openrouter.env ]] || echo "note: no OpenRouter key file $KEYS/openrouter.env: paintings are not scored until it is there"
[[ -z $(git -C $BENCH status --porcelain) ]] || say "the bench checkout $BENCH has changes"
free=$(df -g $BASE | awk 'NR==2{print $4}'); [[ $free -ge $(j diskFloorGB) ]] || say "only $free GB free on the disk (floor $(j diskFloorGB) GB)"
(( fault )) && exit 1
rm -f $BASE/STOP $BASE/pool/STOP-PODS
echo "$*" > $BASE/GO
launchctl kickstart gui/$U/com.sabj.unpaint-waves || { echo "could not start com.sabj.unpaint-waves (run setup.sh)"; exit 1; }
echo "started waves $* at $(git -C $BENCH log --oneline -1 | cut -c1-60); log ~/Library/Logs/unpaint-waves.log; stop: $H/stop.sh"
