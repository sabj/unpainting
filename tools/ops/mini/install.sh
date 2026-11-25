#!/bin/zsh
# install.sh (on the laptop): sends this branch and the code to paint with to the mini, and runs setup.sh there.
# Starts no wave. Run again after config.json runRef changes (e.g. to the rc8 tag).
set -e
H=${0:A:h}; R=$(git -C $H rev-parse --show-toplevel)
REF=$(/usr/bin/python3 -c "import json; print(json.load(open('$H/config.json'))['runRef'])")
REPO=$(/usr/bin/python3 -c "import json; print(json.load(open('$H/config.json'))['repo'])")
OPS=$(/usr/bin/python3 -c "import json; print(json.load(open('$H/config.json'))['ops'])")
git -C $R push -q -f mini:$REPO "$(git -C $H rev-parse HEAD):refs/heads/mini-ops"
if git -C $R rev-parse -q --verify "refs/tags/$REF" >/dev/null; then git -C $R push -q -f mini:$REPO "refs/tags/${REF}:refs/tags/${REF}"
else git -C $R push -q -f mini:$REPO "${REF}:refs/heads/mini-run"; ssh -o BatchMode=yes mini "git -C ~/$REPO tag -d $REF 2>/dev/null || true" >/dev/null; fi
ssh -o BatchMode=yes mini "cd ~/$REPO && if [ -d ~/$OPS ]; then git -C ~/$OPS checkout -q --detach mini-ops; else git worktree add -q --detach ~/$OPS mini-ops; fi && zsh -l ~/$OPS/tools/ops/mini/setup.sh"
