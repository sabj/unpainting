"""The batching rule of the pods on the mini's run, pure so a fake queue can test it (pods_policy_test.py).
Only finals (full-size paintings: a session's final, a picture's prepared Auto painting) rent a pod; a look never does.
  rent   when the finals with no place on a pod number at least MIN_BATCH, or the oldest has waited MAX_WAIT minutes;
         as many pods as they fill (SLOTS a pod), never above CAP pods, and none once DAY_USD is spent today
  delete a pod with no painting on it as soon as no final waits; and any idle pod near its limit
Every pod also deletes itself at its limit (the daemon's --limit-min, 180 min here)."""
import math

MARGIN_S = 45 * 60  # a pod with less time left takes no new job (render-pool.mjs POD_MARGIN_S)


def decide(waiting, oldest_s, pods, adding, now, spent_today, *, min_batch, max_wait_s, cap, day_usd, slots_new):
    """waiting: finals waiting for a place (not yet on a pod); oldest_s: how long the oldest has waited; pods:
    [{name, slots, limit, claimed, created}]; adding: pods being rented. Returns (pods to rent, [(name, why)] to delete, words)."""
    usable = [p for p in pods if p["limit"] - now > MARGIN_S]
    free = sum(max(0, p["slots"] - p["claimed"]) for p in usable) + adding * slots_new
    short = max(0, waiting - free)
    add = 0
    if short and (short >= min_batch or oldest_s >= max_wait_s):
        if spent_today >= day_usd:
            words_rent = f"not renting: ${spent_today:.2f} spent on pods today, the day's cap is ${day_usd}"
        else:
            add = min(math.ceil(short / slots_new), max(0, cap - len(pods) - adding))
            words_rent = f"renting {add} for {short} finals with no place"
    else:
        words_rent = f"{short} finals with no place; rent at {min_batch}, or once one has waited {max_wait_s // 60} min (oldest {oldest_s // 60:.0f} min)" if short else "no final without a place"
    go = []
    for p in sorted(pods, key=lambda p: p["created"]):
        if p["claimed"]:
            continue
        if p not in usable:
            go.append((p["name"], "near its limit, idle"))
        elif waiting == 0:
            go.append((p["name"], "idle, and no final waits"))
    words = f"finals waiting {waiting}, places free {free}, pods {len(pods)} (+{adding} being rented), spent today ${spent_today:.2f}: {words_rent}"
    return add, go, words


def spent_today(total, ledger, day):
    """(dollars spent on pods today, the ledger to keep): ledger {day, startTotal}; a new day starts from the total then."""
    if not ledger or ledger.get("day") != day:
        ledger = {"day": day, "startTotal": total}
    return max(0.0, total - ledger["startTotal"]), ledger
