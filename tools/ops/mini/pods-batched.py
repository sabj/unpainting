#!/usr/bin/env python3
"""pods-batched.py POOL_DIR [--dry-run]: the render pool's pods daemon (tools/cloud/render-pool-pods.py, unchanged) with
the mini run's batching rule (pods_policy.py) in place of its own sizing: only finals rent pods, in batches; an idle
pod goes as soon as no final waits; at most config.json pods.cap pods, none older than pods.maxAgeMinutes, and no
renting once pods.dayUSD is spent today (POOL_DIR/day-spend.json). The RunPod key is read by the daemon's helper from
UNPAINTING_ENV_FILE and never printed. Stop: touch POOL_DIR/STOP-PODS (every pod is deleted). Log: POOL_DIR/pods.log.
  --dry-run: read the pool folder once and print what it would rent and delete; nothing is rented or written."""
import importlib.util, json, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pods_policy  # noqa: E402

CFG = json.loads((HERE / "config.json").read_text())["pods"]
pool, rest = sys.argv[1], sys.argv[2:]
sys.argv = [str(HERE.parents[1] / "cloud" / "render-pool-pods.py"), pool, "--cap", str(CFG["cap"]), "--limit-min", str(CFG["maxAgeMinutes"]), "--warm-sessions", "0", "--hours", "72", *rest]
spec = importlib.util.spec_from_file_location("pods_daemon", sys.argv[0]); d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)
SLOTS_NEW = d.slots_of(d.LADDER[0][0])
seen = {"waiting": 0, "oldest": 0.0}


def demand(now):
    """(finals waiting for a place, the commits they need): looks are left out, they never rent a pod."""
    n, oldest, commits = 0, 0.0, {}
    for f in (d.POOL / "waiting").glob("*.json"):
        try: w = json.loads(f.read_text())
        except Exception: continue
        if w.get("kind") != "painting" or not d.alive(int(w["pid"])) or (w.get("only") and "pod" not in w["only"]): continue
        n += 1; oldest = max(oldest, now - float(w.get("since") or now * 1000) / 1000)
        if w.get("commit"): commits[w["commit"]] = commits.get(w["commit"], 0) + 1
    seen["waiting"], seen["oldest"] = n, oldest
    return n, commits


def spent_now(now):
    total = d.st["spentUSD"] + sum(p["rate"] * (now - p["created"]) / 3600 for p in d.st["pods"])
    f = d.POOL / "day-spend.json"
    try: ledger = json.loads(f.read_text())
    except Exception: ledger = None
    today, ledger = pods_policy.spent_today(total, ledger, time.strftime("%Y-%m-%d"))
    if not d.A.dry_run: f.write_text(json.dumps({**ledger, "spentToday": round(today, 2), "updated": now}))
    return today


def size(jobs, sessions, pods, adding, now):
    if d.A.dry_run:  # dry run: the pods.json spend, as the daemon would read it at start
        try: d.st["spentUSD"] = float(json.loads(d.PODS.read_text()).get("spentUSD") or 0) - sum(p["rate"] * (now - p["created"]) / 3600 for p in pods)
        except Exception: pass
        d.st["pods"] = pods
    return pods_policy.decide(seen["waiting"], seen["oldest"], pods, adding, now, spent_now(now), min_batch=CFG["minBatch"], max_wait_s=CFG["maxWaitMinutes"] * 60, cap=CFG["cap"], day_usd=CFG["dayUSD"], slots_new=SLOTS_NEW)


d.demand, d.size = demand, size
d.main()
