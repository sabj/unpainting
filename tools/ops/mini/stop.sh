#!/bin/zsh -l
# stop.sh: stops everything the run started: no session starts, every running session and prepare is ended, every pod
# is deleted (the pods daemon is started for that if it is not running), scoring ends. The launchd jobs stay loaded
# (the progress page keeps showing what was done). Start again: go.sh.
H=${0:A:h}; CFG=$H/config.json
j() { /usr/bin/python3 -c "import json,sys; print(json.load(open('$CFG'))[sys.argv[1]])" $1; }
BASE=$HOME/$(j base); KEYS=$HOME/$(j keys); POOL=$BASE/pool
mkdir -p $POOL; touch $BASE/STOP $POOL/STOP-PODS
pid=$(cat $BASE/state/runner.pid 2>/dev/null)
if [[ -n $pid ]] && kill -0 $pid 2>/dev/null; then
  echo "told the runner (pid $pid) to stop; waiting for it"; for i in {1..90}; do kill -0 $pid 2>/dev/null || break; sleep 1; done
fi
# whatever is left: sessions, prepares and helpers the state names
/usr/bin/python3 - $BASE/state/run.json <<'P'
import json, os, signal, sys
try: st = json.load(open(sys.argv[1]))
except Exception: sys.exit(0)
pids = [s.get('pid') for w in st.get('waves', {}).values() for s in w['sessions'].values() if s.get('status') == 'running']
pids += [p.get('pid') for p in st.get('prepare', {}).values() if p.get('status') == 'running']
pids += [h.get('pid') for k, h in st.get('helpers', {}).items() if k != 'unpaint-pods']
for p in filter(None, pids):
    for target in (-p, p):
        try: os.kill(target, signal.SIGTERM)
        except Exception: pass
P
d=$(cat $POOL/pods.pid 2>/dev/null)
if [[ -n $d ]] && kill -0 $d 2>/dev/null; then echo "the pods daemon (pid $d) is deleting every pod"
elif [[ -s $POOL/pods.json ]] && /usr/bin/python3 -c "import json,sys; sys.exit(0 if json.load(open('$POOL/pods.json')).get('pods') else 1)"; then
  echo "pods are listed and no daemon runs: starting it to delete them"
  UNPAINTING_ENV_FILE=$KEYS/runpod.env UNPAINTING_SSH_KEY=$HOME/$(j sshKey) nohup $HOME/$(j python) $H/pods-batched.py $POOL >> $HOME/Library/Logs/unpaint-pods.log 2>&1 &
fi
echo "stopped. Check RunPod lists no unpaint-rp-* pod in a few minutes: tail $POOL/pods.log"
