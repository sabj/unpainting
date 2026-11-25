#!/bin/zsh -l
# setup.sh (on the mini): makes the two checkouts and the launchd jobs of the unattended run. Starts no wave.
#   ops checkout   (config.json ops)   this branch, refs/heads/mini-ops of the mini's repository
#   bench checkout (config.json bench) the code the sessions paint with: config.json runRef (pushed by install.sh)
#   launchd: com.sabj.unpaint-waves (the runner; loaded, never started here: go.sh starts it),
#            com.sabj.unpaint-progress (the progress page, every minute), com.sabj.unpaint-web (serves it on localhost),
#            and Tailscale serve of that page to the tailnet only.
# Refuses while the runner is running.
set -e
H=${0:A:h}; CFG=$H/config.json
j() { /usr/bin/python3 -c "import json,sys; d=json.load(open('$CFG')); print(d[sys.argv[1]])" $1; }
REPO=$HOME/$(j repo); BENCH=$HOME/$(j bench); OPS=$HOME/$(j ops); BASE=$HOME/$(j base); REF=$(j runRef)
PORT=$(j progressPort); HTTPS=$(j progressHttpsPort); U=$(id -u); LA=$HOME/Library/LaunchAgents
pid=$(cat $BASE/state/runner.pid 2>/dev/null || true)
if [[ -n $pid ]] && kill -0 $pid 2>/dev/null; then echo "the runner is running (pid $pid): stop it first (stop.sh)"; exit 1; fi
mkdir -p $BASE/state $BASE/progress $BASE/pool $BASE/runs $HOME/Library/Logs
# the code to paint with: the ref as pushed (a tag, or the branch pushed as mini-run)
C=$(git -C $REPO rev-parse --verify -q "refs/tags/$REF^{commit}" || git -C $REPO rev-parse --verify "refs/heads/mini-run^{commit}")
if [[ -d $BENCH ]]; then git -C $BENCH checkout -q --detach $C; else git -C $REPO worktree add -q --detach $BENCH $C; fi
if cmp -s $BENCH/package-lock.json $REPO/package-lock.json && [[ -d $REPO/node_modules ]]; then ln -sfn $REPO/node_modules $BENCH/node_modules
else rm -f $BENCH/node_modules; (cd $BENCH && npm ci --no-audit --no-fund > $BASE/state/npm-ci.log 2>&1); fi
[[ -z $(git -C $BENCH status --porcelain) ]] || { echo "the bench checkout is not clean"; git -C $BENCH status --short | head; exit 1; }
echo "bench checkout: $BENCH at $(git -C $BENCH log --oneline -1)"
plist() {  # name, interval|keepalive|ondemand, command
  cat > $LA/com.sabj.$1.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>com.sabj.$1</string>
 <key>ProgramArguments</key><array><string>/bin/zsh</string><string>-l</string><string>-c</string><string>$3</string></array>
 <key>StandardOutPath</key><string>$HOME/Library/Logs/$1.log</string>
 <key>StandardErrorPath</key><string>$HOME/Library/Logs/$1.log</string>
 <key>WorkingDirectory</key><string>$OPS</string>
$(case $2 in interval) echo " <key>StartInterval</key><integer>60</integer><key>RunAtLoad</key><true/>";; keepalive) echo " <key>KeepAlive</key><true/><key>RunAtLoad</key><true/>";; ondemand) echo " <key>RunAtLoad</key><false/>";; esac)
</dict></plist>
EOF
  launchctl bootout gui/$U/com.sabj.$1 2>/dev/null || true
  launchctl bootstrap gui/$U $LA/com.sabj.$1.plist
}
plist unpaint-waves ondemand "exec node $H/wave.mjs run"
plist unpaint-progress interval "exec /usr/bin/python3 $H/progress.py"
plist unpaint-web keepalive "exec /usr/bin/python3 -m http.server $PORT --bind 127.0.0.1 --directory $BASE/progress"
tailscale serve --bg --https=$HTTPS http://127.0.0.1:$PORT >/dev/null
echo "launchd: com.sabj.unpaint-waves (loaded, not started), com.sabj.unpaint-progress, com.sabj.unpaint-web"
echo "progress page: https://$(tailscale status --self --json | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))'):$HTTPS/"
