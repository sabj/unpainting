#!/usr/bin/env python3
"""render-pool-pods.py POOL_DIR [--cap N] [--hours H] [--helper render-batch.py]: the pods of the render pool
(tools/paint/render-pool.mjs). One pod a live session, never more than --cap (default 10, UNPAINT_POOL_CAP), none
when no session is live: it reads POOL_DIR/clients/<pid>.json (each command painting through the pool says how many
sessions it runs, and its commit), rents or deletes pods to match, gives each pod a checkout of every live commit, and
writes POOL_DIR/pods.json, which the sessions read to find a free pod. A pod whose place is claimed
(POOL_DIR/claims/pod-<name>.json) is never deleted under its painting. Every pod also deletes itself at its limit
(self-destruct.sh), so a crash of this process leaves nothing running past it.
  Stop: touch POOL_DIR/STOP-PODS (every pod is deleted and this ends). Log: POOL_DIR/pods.log.
The RunPod calls are the cloud helper's (render-batch.py, api.py: the key is read there and never printed).
Run it detached:  nohup python3 tools/cloud/render-pool-pods.py <pool dir> > /dev/null 2>&1 &"""
import argparse, importlib.util, json, os, shlex, subprocess, sys, threading, time
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("pool"); ap.add_argument("--cap", type=int, default=int(os.environ.get("UNPAINT_POOL_CAP", "10")))
ap.add_argument("--hours", type=float, default=8.0, help="no pod is rented after this many hours; the daemon then ends when none is left")
ap.add_argument("--limit-min", type=int, default=240, help="each pod deletes itself this many minutes after it is made")
ap.add_argument("--helper", default=str(Path(__file__).resolve().parent / "render-batch.py"))
A = ap.parse_args()
POOL = Path(A.pool).resolve(); POOL.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("UNPAINTING_RUNNING_FILE", str(POOL / "RUNNING.txt"))
spec = importlib.util.spec_from_file_location("rb", A.helper); rb = importlib.util.module_from_spec(spec); spec.loader.exec_module(rb)
REPO = Path(subprocess.run(["git", "-C", str(Path(__file__).resolve().parent), "rev-parse", "--path-format=absolute", "--git-common-dir"], capture_output=True, text=True, check=True).stdout.strip()).parent
PODS, LOG, STOP = POOL / "pods.json", POOL / "pods.log", POOL / "STOP-PODS"
LADDER = [("NVIDIA GeForce RTX 4090", "SECURE"), ("NVIDIA GeForce RTX 4090", "COMMUNITY"), ("NVIDIA RTX 4000 Ada Generation", "SECURE"), ("NVIDIA L40S", "SECURE")]
lock = threading.Lock()
st = {"pods": [], "adding": 0, "spentUSD": 0.0}


def log(*a):
    with open(LOG, "a") as f:
        f.write(time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a) + "\n")


def alive(pid):
    try:
        os.kill(pid, 0); return True
    except PermissionError:
        return True
    except OSError:
        return False


def live_clients():
    """[(pid, sessions, commit)] of the commands painting through the pool now."""
    out = []
    for f in sorted((POOL / "clients").glob("*.json")):
        try:
            c = json.loads(f.read_text())
        except Exception:
            continue
        if alive(int(c["pid"])):
            out.append((int(c["pid"]), int(c.get("sessions", 1)), c["commit"]))
    return out


def claimed(name):
    f = POOL / "claims" / f"pod-{name}.json"
    try:
        return alive(int(json.loads(f.read_text())["pid"]))
    except Exception:
        return False


def save():
    with lock:
        now = time.time()
        rows = [{k: p[k] for k in ("name", "id", "ip", "port", "rate", "created", "limit", "ready", "trees")} for p in st["pods"]]
        spent = st["spentUSD"] + sum(p["rate"] * (now - p["created"]) / 3600 for p in st["pods"])
        tmp = PODS.with_suffix(".tmp"); tmp.write_text(json.dumps({"updated": now, "pods": rows, "adding": st["adding"], "target": st.get("target", 0), "live": st.get("live", 0), "spentUSD": round(spent, 2)}, indent=1)); tmp.replace(PODS)


def tree_of(commit):
    """(full sha, a clean checkout of it on this Mac): work/cloud-trees/<8> of the repository, made on first use."""
    r = subprocess.run(["git", "-C", str(REPO), "rev-parse", "--verify", commit + "^{commit}"], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"commit {commit} is not in this Mac's repository")
    sha = r.stdout.strip(); t = REPO / "work/cloud-trees" / sha[:8]
    if not t.exists():
        r = subprocess.run(["git", "-C", str(REPO), "worktree", "add", "--detach", str(t), sha], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError("git worktree add: " + r.stderr.strip()[-200:])
    return sha, t


def bundle_of(sha, tree):
    b, s = POOL / "bundles" / f"{sha[:8]}.tgz", POOL / "bundles" / f"{sha[:8]}.code-state.json"
    with lock:
        if not b.exists():
            b.parent.mkdir(parents=True, exist_ok=True)
            state = rb.code_state(tree, s)
            if state["dirty"] or not state["commit"].startswith(sha[:8]):
                raise RuntimeError(f"{tree} is not a clean checkout of {sha[:8]}")
            rb.make_bundle(tree, [], str(b), s)
    return b


def ssh(pod, cmd, timeout=600, data=None):
    return subprocess.run(["ssh", "-p", str(pod["port"]), *rb.SSH, f"root@{pod['ip']}", cmd], input=data, capture_output=True, timeout=timeout)


def add_tree(pod, commit):
    """A second commit's checkout on a pod, beside its first: its code, the first's packages, Python and SAM checkpoint."""
    sha, tree = tree_of(commit)
    if sha[:8] in pod["trees"]:
        return
    with open(bundle_of(sha, tree), "rb") as f:
        r = subprocess.run(["ssh", "-p", str(pod["port"]), *rb.SSH, f"root@{pod['ip']}", "tar -xzf - -C /"], stdin=f, capture_output=True, timeout=1800)
    if r.returncode:
        raise RuntimeError("tree upload failed: " + r.stderr.decode()[-200:])
    b, t = shlex.quote(next(iter(pod["trees"].values()))), shlex.quote(str(tree))
    setup = f"""set -e
cd {t}
find tools src -name '*.mjs' -o -name '*.js' -o -name '*.sh' | xargs grep -l 'backend=metal' 2>/dev/null | xargs -r sed -i 's/backend=metal/backend=vulkan/g'
if cmp -s package-lock.json {b}/package-lock.json; then ln -sfn {b}/node_modules node_modules; else npm install --no-audit --no-fund >/dev/null 2>&1; fi
ln -sfn {b}/.venv-seg .venv-seg; ln -sfn {b}/.venv-lines .venv-lines
mkdir -p work; touch work/runs.jsonl; ln -sfn {b}/work/models work/models
[ "$(git -C {t} rev-parse HEAD)" = "{sha}" ] && node -e 'import("sharp").then(()=>console.log("tree ok"))'
"""
    r = ssh(pod, "bash -s", timeout=900, data=setup.encode())
    if b"tree ok" not in r.stdout:
        raise RuntimeError("tree setup failed: " + (r.stdout + r.stderr).decode()[-300:])
    with lock:
        pod["trees"][sha[:8]] = str(tree)
    log("tree", sha[:8], "on", pod["name"])


def add_pod(commit, n):
    name = f"unpaint-rp-{time.strftime('%H%M%S')}-{n}"; box = None
    try:
        sha, tree = tree_of(commit)
        cs = json.loads(bundle_of(sha, tree).with_name(f"{sha[:8]}.code-state.json").read_text())
        rb.SHA, rb.DIRTY, rb.HARD_LIMIT, rb.T0, rb.LADDER = cs["commit"], 0, A.limit_min, time.time(), LADDER
        box = rb.Box(name)
        class Args: image = rb.RP_IMAGE; min_ram = 48; min_vcpu = 12; per_pod = 1
        rb.provision(box, Args, str(bundle_of(sha, tree)), tree)
        pod = {"name": name, "id": box.id, "ip": box.ip, "port": box.port, "rate": box.rate, "created": time.time(), "limit": time.time() + A.limit_min * 60, "ready": False, "trees": {sha[:8]: str(tree)}}
        # the pool sends inputs with rsync; the pod image has none
        r = ssh(pod, "command -v rsync >/dev/null || (apt-get install -y -qq rsync >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq rsync >/dev/null)); command -v rsync && echo RSYNC", timeout=600)
        if b"RSYNC" not in r.stdout:
            raise RuntimeError("rsync could not be installed: " + (r.stdout + r.stderr).decode()[-200:])
        pod["ready"] = True
        with lock:
            st["pods"].append(pod)
        log("pod ready", name, box.id, f"${box.rate}/h", "commit", sha[:8])
    except BaseException as e:
        log("pod FAILED", name, type(e).__name__, str(e)[:300])
        try:
            if box is not None and getattr(box, "id", None): rb.delete_pod(box.id)
        except Exception as e2:
            log("could not delete", name, e2)
    finally:
        with lock:
            st["adding"] -= 1


def drop(pod, why):
    try:
        rb.delete_pod(pod["id"])
    except Exception as e:
        log("DELETE FAILED", pod["name"], e); return
    with lock:
        st["pods"] = [p for p in st["pods"] if p["id"] != pod["id"]]
        st["spentUSD"] += pod["rate"] * (time.time() - pod["created"]) / 3600
    log("pod deleted", pod["name"], why)


def main():
    (POOL / "pods.pid").write_text(str(os.getpid()))
    # pods an earlier run of this daemon left up are taken over, not forgotten
    try:
        was = json.loads(PODS.read_text()); st["pods"] = [p for p in was.get("pods", []) if p.get("ready") and time.time() < p["limit"]]; st["spentUSD"] = float(was.get("spentUSD") or 0) - sum(p["rate"] * (time.time() - p["created"]) / 3600 for p in st["pods"])
        if st["pods"]: log("took over", len(st["pods"]), "pods from pods.json")
    except Exception:
        pass
    t0, n = time.time(), 0
    log("pods daemon started, pid", os.getpid(), "cap", A.cap)
    while True:
        try:
            now = time.time()
            if STOP.exists():
                for p in list(st["pods"]): drop(p, "STOP-PODS")
                save(); log("stopped by STOP-PODS"); break
            clients = live_clients(); live = sum(c[1] for c in clients); commits = sorted({c[2] for c in clients})
            past = now - t0 > A.hours * 3600
            target = 0 if past else min(A.cap, live)
            st["target"], st["live"] = target, live
            for p in list(st["pods"]):  # a pod past its limit has deleted itself
                if now > p["limit"] + 60: drop(p, "past its limit")
            usable = [p for p in st["pods"] if p["limit"] - now > 45 * 60]
            for _ in range(max(0, target - len(usable) - st["adding"])):
                if not commits: break
                with lock: st["adding"] += 1
                n += 1; threading.Thread(target=add_pod, args=(commits[0], n), daemon=True).start()
                log("adding a pod: live sessions", live, "target", target, "have", len(usable))
            for p in [p for p in st["pods"] if p["ready"]]:
                for c in commits:
                    if c[:8] not in p["trees"]:
                        try: add_tree(p, c)
                        except Exception as e: log("tree FAILED", c[:8], "on", p["name"], str(e)[:200])
            # more pods than sessions, or near its limit: an idle pod goes (never one painting)
            extra = len(st["pods"]) - target
            for p in sorted(st["pods"], key=lambda p: p["created"]):
                if claimed(p["name"]): continue
                if p["limit"] - now <= 45 * 60: drop(p, "near its limit")
                elif extra > 0: drop(p, "more pods than live sessions"); extra -= 1
            save()
            if past and not st["pods"] and not st["adding"]:
                log("past its hours and no pod left: ending"); break
        except Exception as e:
            log("LOOP ERROR", repr(e)[:300])
        time.sleep(15)


if __name__ == "__main__":
    main()
