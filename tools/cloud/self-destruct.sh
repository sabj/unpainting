#!/bin/bash
# self-destruct.sh MINUTES: run ON a RunPod pod (render-batch.py pipes it to each pod after its setup). Arms a detached
# timer that deletes this pod, with the key RunPod puts in the pod, after MINUTES (0: now); arming again replaces the
# timer. The hard limit then holds with no machine outside the pod: a crash of the batch runner leaves nothing running.
min=${1:-180}
K=$(tr '\0' '\n' < /proc/1/environ | sed -n 's/^RUNPOD_API_KEY=//p'); ID=$(tr '\0' '\n' < /proc/1/environ | sed -n 's/^RUNPOD_POD_ID=//p')
[ -n "$K" ] && [ -n "$ID" ] || { echo "self-destruct: no pod key or id in the container environment"; exit 1; }
runpodctl config --apiKey "$K" >/dev/null 2>&1
[ -f /tmp/self-destruct.pid ] && kill "$(cat /tmp/self-destruct.pid)" 2>/dev/null
nohup setsid bash -c "sleep $((min * 60)); runpodctl remove pod $ID" > /tmp/self-destruct.log 2>&1 < /dev/null &
echo $! > /tmp/self-destruct.pid
echo "armed: pod $ID deletes itself at $(date -u -d "+$min min" +%H:%M) UTC"
