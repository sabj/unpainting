#!/bin/zsh -l
# score-loop.sh: scores the run's finished paintings with the hosted judges (OpenRouter, panel open3, the parallel scorer
# of the bench checkout) every config.json scoreEveryMinutes, reusing earlier readings, while the runner lives, and once
# more after it ends. Each painting is linked under <base>/scores/links/<name> so names stay unique (as
# score-tonight.sh did): a session by its folder name, Auto as auto--<picture>. The OpenRouter key is read from
# ~/.config/unpainting/openrouter.env (made by the owner, mode 600) and passed only to the scorer; never printed.
# Started and kept alive by wave.mjs. Log: ~/Library/Logs/unpaint-score.log. Stop: stop.sh.
H=${0:A:h}; CFG=$H/config.json
j() { /usr/bin/python3 -c "import json,sys; print(json.load(open('$CFG'))[sys.argv[1]])" $1; }
BASE=$HOME/$(j base); BENCH=$HOME/$(j bench); PY=$HOME/$(j python); EVERY=$(j scoreEveryMinutes)
SUBJ=$HOME/$(j subjects); O=$BASE/scores; mkdir -p $O/links
KEYF=$HOME/$(j keys)/openrouter.env
[[ -r $KEYF ]] || { echo "$(date +%T) no OpenRouter key file ($KEYF): scoring waits for it"; }
last=0
while true; do
  runner=$(cat $BASE/state/runner.pid 2>/dev/null); alive=0; [[ -n $runner ]] && kill -0 $runner 2>/dev/null && alive=1
  if [[ -r $KEYF ]]; then
    n=$($PY - $BASE $O ${SUBJ:h}/prepared <<'P'
import json, os, sys
base, O, prep = sys.argv[1:4]; L = O + '/links'; runs = []
st = json.load(open(base + '/state/run.json')); commit = st['commit'][:8]
subjects = set()
for w in st['waves'].values():
    for s in w['sessions'].values():
        d = f"{base}/runs/{s['folder']}"
        if s['status'] in ('running', 'pending', 'waiting for prepare') or not os.path.exists(d + '/run.json'): continue
        link = f"{L}/{s['folder']}"
        if not os.path.islink(link): os.symlink(d, link)
        runs.append({'folder': os.path.relpath(link, O), 'subject': s['subject'], 'author': s['author'], 'level': s['level']}); subjects.add(s['subject'])
for sub in sorted(subjects):
    d = f"{prep}/{sub}/{commit}/painting"
    if not os.path.exists(d + '/run.json'): continue
    link = f"{L}/auto--{sub}"
    if not os.path.islink(link): os.symlink(d, link)
    runs.append({'folder': os.path.relpath(link, O), 'subject': sub, 'author': 'auto', 'level': 'Auto'})
json.dump({'about': 'The mini run: every finished painting, rebuilt by score-loop.sh.', 'commit': st['commit'], 'runs': runs}, open(O + '/manifest.json', 'w'), indent=1)
print(len(runs))
P
)
    if [[ ${n:-0} -gt 0 ]]; then
      echo "$(date +%T) scoring $n paintings"
      ( set -a; source $KEYF; set +a; cd $BENCH && JUDGE_ROUTE=openrouter JUDGE_PANEL=open3 BENCH_SCORE_PYTHON=$PY UNPAINT_SUBJECTS=$SUBJ \
        node bench/scripts/score04.mjs $O/manifest.json --out $O/hosted ) && echo "$(date +%T) scored" || echo "$(date +%T) scoring FAILED"
    fi
  fi
  [[ $alive == 0 && $last == 1 ]] && { echo "$(date +%T) the runner has ended: last pass done"; exit 0; }
  [[ $alive == 0 ]] && last=1
  [[ -f $BASE/STOP ]] && exit 0
  sleep $((EVERY * 60))
done
