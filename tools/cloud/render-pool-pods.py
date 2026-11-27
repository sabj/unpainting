#!/usr/bin/env python3
"""render-pool-pods.py POOL_DIR [--cap N] [--hours H] [--helper render-batch.py] [--dry-run]: the pods of the render
pool (tools/paint/render-pool.mjs). Pods paint the full-size paintings (finals, prepared Auto paintings) and the looks
this Mac and the mini have no place for. A pod paints several at once: its places (`slots` in pods.json) are what
its GPU type was measured to paint at once (SLOTS below, --per-pod to override). Pods are rented for the jobs that
want a pod's place: every painting waiting or on a pod, and every look that has waited over LOOK_WAIT_S; and one pod
is kept warm for every --warm-sessions sessions in flight (the live clients' sessions), so a look never waits for a
pod to be rented; none when there is no job and no session. Never more than --cap (default 10, UNPAINT_POOL_CAP).
It reads POOL_DIR/waiting/*.json, POOL_DIR/claims/pod-*.json and POOL_DIR/clients/*.json, rents or deletes pods to
match, gives each pod a checkout of every commit asked for (waiting jobs and live clients), and writes
POOL_DIR/pods.json, which the sessions read to find a free place. A pod with a place claimed
(POOL_DIR/claims/pod-<name>[-k].json) is never deleted under its painting. Every pod also deletes itself at its limit
(self-destruct.sh), so a crash of this process leaves nothing running past it.
  --dry-run: read the pool folder once, print what it would rent and delete and why, and end. Nothing is rented,
  deleted or written.
  Stop: touch POOL_DIR/STOP-PODS (every pod is deleted and this ends). Log: POOL_DIR/pods.log.
The RunPod calls are the cloud helper's (render-batch.py, api.py: the key is read there and never printed).
Run it detached:  nohup python3 tools/cloud/render-pool-pods.py <pool dir> > /dev/null 2>&1 &"""
import argparse, importlib.util, io, json, math, os, shlex, subprocess, sys, tarfile, threading, time
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("pool"); ap.add_argument("--cap", type=int, default=int(os.environ.get("UNPAINT_POOL_CAP", "10")))
ap.add_argument("--hours", type=float, default=8.0, help="no pod is rented after this many hours; the daemon then ends when none is left")
ap.add_argument("--limit-min", type=int, default=240, help="each pod deletes itself this many minutes after it is made")
ap.add_argument("--end-min", type=int, default=0, help="no pod lives past this many minutes after the daemon starts: a pod rented late gets the time left, not --limit-min (0: every pod gets --limit-min)")
ap.add_argument("--helper", default=str(Path(__file__).resolve().parent / "render-batch.py"))
ap.add_argument("--per-pod", type=int, default=int(os.environ.get("UNPAINT_POOL_PER_POD", "0")), help="the most paintings at once on every pod; 0 (default): by GPU type (SLOTS)")
ap.add_argument("--gb-a-painting", type=float, default=float(os.environ.get("UNPAINT_POOL_GB_A_PAINTING", "36")), help="memory one painting needs at its peak; a pod paints no more at once than its memory holds")
ap.add_argument("--warm-sessions", type=int, default=int(os.environ.get("UNPAINT_POOL_WARM_SESSIONS", "8")), help="one pod is kept warm for every this many sessions in flight; 0: pods only for waiting jobs")
ap.add_argument("--dry-run", action="store_true")
A = ap.parse_args()
POOL = Path(A.pool).resolve()
if not A.dry_run:
    POOL.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("UNPAINTING_RUNNING_FILE", str(POOL / "RUNNING.txt"))
    spec = importlib.util.spec_from_file_location("rb", A.helper); rb = importlib.util.module_from_spec(spec); spec.loader.exec_module(rb)
REPO = Path(subprocess.run(["git", "-C", str(Path(__file__).resolve().parent), "rev-parse", "--path-format=absolute", "--git-common-dir"], capture_output=True, text=True, check=True).stdout.strip()).parent
PODS, LOG, STOP = POOL / "pods.json", POOL / "pods.log", POOL / "STOP-PODS"
# the fastest type measured first (23 Nov: an RTX 5090 community host painted in 812 s against 1,264 on a 4090 secure, at $0.69 against $0.89 an hour); it is often not to be had, and the ladder goes on
LADDER = [("NVIDIA GeForce RTX 5090", "COMMUNITY"), ("NVIDIA GeForce RTX 4090", "SECURE"), ("NVIDIA GeForce RTX 4090", "COMMUNITY"), ("NVIDIA RTX 4000 Ada Generation", "SECURE"), ("NVIDIA L40S", "SECURE")]
# The most paintings at once on one pod, by GPU type. Three at once was the pods' setting until 22 Nov and the mini's
# measured one (RENDER-POOL.md); the painter keeps one or two CPU cores busy and leaves the GPU nearly idle (a look
# alone on an RTX 4090: GPU busy 6% of the time, 4.3 GB of its 24 GB). What runs out first is memory: a painting
# peaks at about 35 GB while it writes its finished sheet (measured resident, half-size look, 23 Nov), so a pod's
# places are also held to its memory (--gb-a-painting) and its cores (VCPU_A_PAINTING).
SLOTS = {"NVIDIA GeForce RTX 4090": 3, "NVIDIA GeForce RTX 5090": 3}
SLOTS_OTHER = 2
VCPU_A_PAINTING = 2.2
LOOK_WAIT_S = 30  # a look that has waited this long for this Mac and the mini wants a pod's place
lock = threading.Lock()
tree_lock = threading.Lock()
T_START = time.time()
shipping = set()  # the pods a checkout is being copied to now, one thread a pod
st = {"pods": [], "adding": 0, "spentUSD": 0.0}


def slots_of(gpu, ram_gb=None, vcpu=None):
    """Places on a pod. With its memory and cores measured they are what it holds: memory at --gb-a-painting each and
    cores at VCPU_A_PAINTING each (the painter keeps one to two and a half cores busy and leaves the GPU nearly idle,
    so the GPU type does not bound it). Unmeasured, the GPU type's setting (SLOTS). --per-pod, when given, is the most
    on any pod. At least one."""
    if ram_gb and vcpu: n = min(int(ram_gb // A.gb_a_painting), int(vcpu // VCPU_A_PAINTING))
    else:
        n = SLOTS.get(gpu, SLOTS_OTHER)
        if ram_gb: n = min(n, int(ram_gb // A.gb_a_painting))
        if vcpu: n = min(n, int(vcpu // VCPU_A_PAINTING))
    if A.per_pod > 0: n = min(n, A.per_pod)
    return max(1, n)


def size(jobs, sessions, pods, adding, now):
    """How many pods to rent and which to delete: pure, so --dry-run and the loop decide alike.
    jobs: paintings and looks that want a pod's place (those on one included). sessions: sessions in flight.
    pods: [{name, slots, limit, claimed}]. Returns (pods to add, [(name, why)] to delete, what is wanted in words)."""
    warm = math.ceil(sessions / A.warm_sessions) if A.warm_sessions > 0 else 0
    # only a pod with over 45 minutes left takes a new job, so only such pods are places; the jobs finishing on the
    # others need none. (Counted against every pod, a fresh pod was deleted as one too many while two old ones that
    # could take nothing made up the number, and more were rented for jobs that already had a place.)
    usable = [p for p in pods if p["limit"] - now > 45 * 60]
    jobs = max(0, jobs - sum(int(p["claimed"]) for p in pods if p not in usable))
    places = sum(p["slots"] for p in usable) + adding * slots_of(LADDER[0][0])
    add = 0
    while len(usable) + adding + add < A.cap and (places < jobs or len(usable) + adding + add < warm):
        add += 1; places += slots_of(LADDER[0][0])
    go, kept, room = [], len(usable), sum(p["slots"] for p in usable)
    for p in sorted(pods, key=lambda p: p["created"]):
        if p["claimed"]: continue
        if p not in usable: go.append((p["name"], "near its limit"))
        # a pod is not given back in its first 20 minutes: its setup was paid for and the jobs come in waves
        elif now - p["created"] > 20 * 60 and room - p["slots"] >= jobs and kept - 1 >= warm: go.append((p["name"], "more pods than the jobs and sessions need")); kept -= 1; room -= p["slots"]
    return add, go, f"jobs wanting a place on a pod that can take one {jobs}, sessions in flight {sessions} (warm pods {warm}), places up {sum(p['slots'] for p in usable)} on {len(usable)} pods, being set up {adding}"


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
        if c.get("only") is not None and "pod" not in c["only"]:
            continue
        if alive(int(c["pid"])):
            out.append((int(c["pid"]), int(c.get("sessions", 1)), c["commit"]))
    return out


def demand(now):
    """(jobs that want a pod's place: paintings waiting, looks waiting over LOOK_WAIT_S, every job on a pod; the commits waiting jobs need)."""
    n, commits = 0, {}
    for f in list((POOL / "waiting").glob("*.json")) + list((POOL / "claims").glob("pod-*.json")):
        try:
            w = json.loads(f.read_text())
        except Exception:
            continue
        if not alive(int(w["pid"])): continue
        # a waiting job whose command may not use a pod (UNPAINT_POOL_ONLY without "pod") wants none
        if f.parent.name == "waiting" and w.get("only") and "pod" not in w["only"]: continue
        if f.parent.name == "waiting" and w.get("commit"): commits[w["commit"]] = commits.get(w["commit"], 0) + 1
        if f.parent.name == "claims" or w.get("kind") == "painting" or now - float(w.get("since") or 0) / 1000 > LOOK_WAIT_S:
            n += 1
    return n, commits


def in_order(wanted, clients):
    """The commits the pods should hold, the one most jobs wait for first, then the live commands' own."""
    first = sorted(wanted, key=lambda c: (-wanted[c], c))
    return first + sorted({c[2] for c in clients} - set(first))


def claimed(name):
    """How many places of this pod are held by live jobs (pod-<name>.json, pod-<name>-<k>.json)."""
    held = 0
    for f in (POOL / "claims").glob(f"pod-{name}*.json"):
        if f.stem != f"pod-{name}" and not f.stem[len(name) + 5:].isdigit(): continue
        try:
            if alive(int(json.loads(f.read_text())["pid"])): held += 1
        except Exception:
            pass
    return held


def save():
    with lock:
        now = time.time()
        rows = [{k: p[k] for k in ("name", "id", "ip", "port", "rate", "created", "limit", "ready", "trees", "gpu", "slots", "ramGB", "vcpu")} for p in st["pods"]]
        spent = st["spentUSD"] + sum(p["rate"] * (now - p["created"]) / 3600 for p in st["pods"])
        tmp = PODS.with_suffix(".tmp"); tmp.write_text(json.dumps({"updated": now, "pods": rows, "adding": st["adding"], "target": st.get("target", 0), "live": st.get("live", 0), "spentUSD": round(spent, 2)}, indent=1)); tmp.replace(PODS)


def tree_of(commit):
    """(full sha, a clean checkout of it on this Mac): work/cloud-trees/<8> of the repository, made on first use."""
    r = subprocess.run(["git", "-C", str(REPO), "rev-parse", "--verify", commit + "^{commit}"], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"commit {commit} is not in this Mac's repository")
    sha = r.stdout.strip(); t = REPO / "work/cloud-trees" / sha[:8]
    # one at a time: several pods rented at once for a new commit each asked for its checkout, and git refused all
    # but one (23 Nov: three starts of this daemon lost every rental to that)
    with tree_lock:
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


def changed_since(base8, sha, tree):
    """(a tar.gz of the files of `sha` that differ from the pod's first checkout `base8`, with the new code state; the
    files gone since), or None when the two cannot be compared (the whole checkout is sent then). Paths as a bundle
    has them: under the checkout's own absolute path, the folders a bundle leaves out left out."""
    r = subprocess.run(["git", "-C", str(REPO), "diff", "--name-status", "--no-renames", base8, sha], capture_output=True, text=True)
    if r.returncode:
        return None
    skip = lambda rel: rel.split("/")[0] in rb.SKIP_TOP or (rel.split("/")[0].startswith(".") and "/" in rel)
    rows = [l.split("\t", 1) for l in r.stdout.splitlines() if l.strip()]
    keep = [rel for st_, rel in rows if st_ != "D" and not skip(rel)]; gone = [rel for st_, rel in rows if st_ == "D" and not skip(rel)]
    bundle_of(sha, tree)  # makes the code state file of this commit (and its whole bundle, kept for a new pod)
    pre, buf = str(tree).lstrip("/"), io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz", compresslevel=3) as tf:
        tf.add(POOL / "bundles" / f"{sha[:8]}.code-state.json", arcname=f"{pre}/code-state.shipped.json")
        for rel in keep:
            tf.add(tree / rel, arcname=f"{pre}/{rel}")
    return buf.getvalue(), gone


def add_tree(pod, commit):
    """A second commit's checkout on a pod, beside its first: its code, the first's packages, Python and SAM checkpoint."""
    sha, tree = tree_of(commit)
    if sha[:8] in pod["trees"]:
        return
    b, t = shlex.quote(next(iter(pod["trees"].values()))), shlex.quote(str(tree))
    part = changed_since(next(iter(pod["trees"])), sha, tree)
    if part is not None:
        # only what differs from the pod's first checkout is sent (kilobytes, seconds): the pod copies that checkout
        # beside itself and the changed files go over the copy. A whole checkout is 180 MB and took four to eight
        # minutes a pod, one pod at a time, while the jobs for that commit waited.
        data, gone = part
        made = ssh(pod, f"set -e; rm -rf {t}; mkdir -p {t}; rsync -a --exclude /node_modules --exclude /.venv-seg --exclude /.venv-lines --exclude /work --exclude /code-state.shipped.json {b}/ {t}/; echo COPIED", timeout=900)
        if b"COPIED" not in made.stdout:
            raise RuntimeError("tree copy failed: " + (made.stdout + made.stderr).decode()[-200:])
        r = subprocess.run(["ssh", "-p", str(pod["port"]), *rb.SSH, f"root@{pod['ip']}", "tar -xzf - -C /" + "".join(f" && rm -f {shlex.quote(str(tree / g))}" for g in gone)], input=data, capture_output=True, timeout=900)
    else:
        with open(bundle_of(sha, tree), "rb") as f:
            r = subprocess.run(["ssh", "-p", str(pod["port"]), *rb.SSH, f"root@{pod['ip']}", "tar -xzf - -C /"], stdin=f, capture_output=True, timeout=1800)
    if r.returncode:
        raise RuntimeError("tree upload failed: " + r.stderr.decode()[-200:])
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


def ship_trees(pod, commits):
    try:
        for c in commits:
            try: add_tree(pod, c); save()
            except Exception as e: log("tree FAILED", c[:8], "on", pod["name"], str(e)[:200])
    finally:
        shipping.discard(pod["name"])


def measure(pod):
    """What the pod really has (its container's memory and its own core allowance, not the host's core count: a
    16-core pod on a 128-core host reported 128; its GPU), and so how many it paints at once."""
    r = ssh(pod, "echo MEM=$(cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes); echo CPU=$( (awk '$1 != \"max\" { printf \"%d\", $1 / $2 }' /sys/fs/cgroup/cpu.max 2>/dev/null | grep .) || (q=$(cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us 2>/dev/null); p=$(cat /sys/fs/cgroup/cpu/cpu.cfs_period_us 2>/dev/null); [ \"${q:-0}\" -gt 0 ] && echo $((q / p))) || nproc); echo GPU=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)", timeout=60)
    said = dict(l.split("=", 1) for l in r.stdout.decode().splitlines() if "=" in l)
    gpu = said.get("GPU", "").strip()
    ram = int(said["MEM"]) / 1e9 if said.get("MEM", "").isdigit() and int(said["MEM"]) < 1e13 else None
    pod["gpu"] = pod.get("gpu") or (gpu if gpu.startswith("NVIDIA") else "NVIDIA " + gpu if gpu else None)
    pod["ramGB"], pod["vcpu"] = ram and round(ram), int(said["CPU"]) if said.get("CPU", "").isdigit() else None
    pod["slots"] = slots_of(pod["gpu"], ram, pod["vcpu"])


def add_pod(commit, n):
    name = f"unpaint-rp-{time.strftime('%H%M%S')}-{n}"; box = None
    try:
        sha, tree = tree_of(commit)
        cs = json.loads(bundle_of(sha, tree).with_name(f"{sha[:8]}.code-state.json").read_text())
        life = A.limit_min if not A.end_min else max(20, min(A.limit_min, int(A.end_min - (time.time() - T_START) / 60)))
        rb.SHA, rb.DIRTY, rb.HARD_LIMIT, rb.T0, rb.LADDER = cs["commit"], 0, life, time.time(), LADDER
        # memory for the widest pod first, then for two paintings, then what one needs: a big pod is not always in stock
        most = max(slots_of(g) for g, _ in LADDER)
        for k in sorted({most, min(most, 2), 1}, reverse=True):
            box = rb.Box(name)
            class Args: image = rb.RP_IMAGE; min_ram = max(48, math.ceil(A.gb_a_painting * k)); min_vcpu = max(12, VCPU_A_PAINTING * k * 2); per_pod = k
            try:
                rb.provision(box, Args, str(bundle_of(sha, tree)), tree); break
            except RuntimeError as e:
                if k == 1 or "no pod came up" not in str(e): raise
                log("no pod with", Args.min_ram, "GB:", name, "asks for less")
        pod = {"name": name, "id": box.id, "ip": box.ip, "port": box.port, "rate": box.rate, "created": time.time(), "limit": time.time() + life * 60, "ready": False, "trees": {sha[:8]: str(tree)}, "gpu": getattr(box, "gpu", None), "slots": 1}
        measure(pod)
        # the pool sends inputs with rsync; the pod image has none
        r = ssh(pod, "command -v rsync >/dev/null || (apt-get install -y -qq rsync >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq rsync >/dev/null)); command -v rsync && echo RSYNC", timeout=600)
        if b"RSYNC" not in r.stdout:
            raise RuntimeError("rsync could not be installed: " + (r.stdout + r.stderr).decode()[-200:])
        pod["ready"] = True
        with lock:
            st["pods"].append(pod)
        log("pod ready", name, box.id, f"${box.rate}/h", "commit", sha[:8], pod["gpu"], f"{pod['ramGB']} GB, {pod['vcpu']} cores: {pod['slots']} at once")
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


def dry_run():
    """What the daemon would do now, from the pool folder as it is: nothing is rented, deleted or written."""
    now = time.time()
    try: pods = [{"gpu": None, "slots": 1, **p} for p in json.loads(PODS.read_text()).get("pods", [])]
    except Exception: pods = []
    clients = live_clients(); live, wanted = demand(now)
    add, go, said = size(live, sum(c[1] for c in clients), [{**p, "claimed": claimed(p["name"])} for p in pods], 0, now)
    print("dry run:", said)
    for p in pods: print(f"  pod {p['name']} {p.get('gpu') or 'GPU type not recorded'}: {p['slots']} at once, {'a place claimed' if claimed(p['name']) else 'idle'}, {round((p['limit'] - now) / 60)} min left")
    print(f"  would rent {add} pod(s) ({LADDER[0][0]} first: {slots_of(LADDER[0][0])} at once) for commits {[c[:8] for c in in_order(wanted, clients)] or 'none'}")
    for name, why in go: print(f"  would delete {name}: {why}")


def main():
    if A.dry_run:
        return dry_run()
    (POOL / "pods.pid").write_text(str(os.getpid()))
    # pods an earlier run of this daemon left up are taken over, not forgotten
    try:
        was = json.loads(PODS.read_text()); st["pods"] = [{"gpu": None, "slots": 1, "ramGB": None, "vcpu": None, **p} for p in was.get("pods", []) if p.get("ready") and time.time() < p["limit"]]; st["spentUSD"] = float(was.get("spentUSD") or 0) - sum(p["rate"] * (time.time() - p["created"]) / 3600 for p in st["pods"])
        if st["pods"]: log("took over", len(st["pods"]), "pods from pods.json")
        for p in st["pods"]:  # a pod an earlier daemon rented without its measure is measured now
            if not p.get("ramGB"):
                try: measure(p); log("pod", p["name"], p["gpu"], f"{p['ramGB']} GB, {p['vcpu']} cores: {p['slots']} at once")
                except Exception as e: log("could not measure", p["name"], str(e)[:120])
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
            clients = live_clients(); live, wanted = demand(now); commits = in_order(wanted, clients)
            past = now - t0 > A.hours * 3600
            for p in list(st["pods"]):  # a pod past its limit has deleted itself
                if now > p["limit"] + 60: drop(p, "past its limit")
            add, go, said = size(0 if past else live, 0 if past else sum(c[1] for c in clients), [{**p, "claimed": claimed(p["name"])} for p in st["pods"]], st["adding"], now)
            st["target"], st["live"] = len(st["pods"]) + st["adding"] + add - len(go), live
            for _ in range(add):
                if not commits: break
                with lock: st["adding"] += 1
                n += 1; threading.Thread(target=add_pod, args=(commits[0], n), daemon=True).start()
                log("adding a pod:", said)
            # the pods are published before any checkout is copied and again after each one: a copy takes minutes, and
            # a pod that is ready for one commit is not kept from its jobs while another commit reaches every pod
            save()
            # each pod that can still take a job gets the commits it lacks in its own thread, the most waited-for first:
            # the loop goes on renting and publishing meanwhile, and no commit waits behind another pod's copies
            for p in [p for p in st["pods"] if p["ready"] and p["limit"] - now > 45 * 60 and p["name"] not in shipping]:
                lacks = [c for c in commits if c[:8] not in p["trees"]]
                if lacks:
                    shipping.add(p["name"]); threading.Thread(target=ship_trees, args=(p, lacks), daemon=True).start()
            # more pods than the jobs and sessions need, or near its limit: an idle pod goes (never one painting)
            for name, why in go:
                p = next((p for p in st["pods"] if p["name"] == name), None)
                if p and not claimed(name): drop(p, why)
            save()
            if past and not st["pods"] and not st["adding"]:
                log("past its hours and no pod left: ending"); break
        except Exception as e:
            log("LOOP ERROR", repr(e)[:300])
        time.sleep(15)


if __name__ == "__main__":
    main()
