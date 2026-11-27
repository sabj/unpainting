#!/usr/bin/env python3
"""render-batch.py TREE JOBS [options]: run one shell command per line of JOBS on rented RunPod GPU pods, pull outputs back.

TREE  source tree on this machine (working tree, uncommitted files included). Bundled without work/ task/ node_modules/ .git/.
JOBS  text file, one command per line, run from the tree root on the box (blank lines and # lines skipped).
Options:
  --pods K          pods to launch (default 4, cap 24, never more than jobs)
  --per-pod N       jobs run at once on one pod (default 2)
  --input PATH      extra file or dir shipped with the bundle (repeatable): relative to TREE, or absolute, which
                    lands at the same absolute path on the pod
  --subjects A,B    ship the subject list and the pinned inputs of these registered subjects (tools/cloud/subject-inputs.mjs)
                    at their own absolute paths, and point the jobs at that list (UNPAINT_SUBJECTS)
  --hard-limit MIN  kill everything and delete all pods after MIN minutes (default 45)
  --job-limit MIN   the longest one job may run (default: the hard limit)
  --follow          keep the pods up and take lines added to JOBS while the batch runs, until the file JOBS.done is
                    there and every line has run (or the hard limit); --pods is then not held to the jobs at the start
A file or folder a job line names by an absolute path under the home folder (a kept script, say) is shipped to the
pod at that path before the job starts.
  --gpus LIST       override the GPU ladder (default order is LADDER in this file)
  --image NAME      pod image (default RUNPOD_IMAGE, else RP_IMAGE in this file)
The tree is mirrored at the same absolute path on the pod, so absolute paths inside recipes keep working. It has no
.git there: the bundle carries code-state.shipped.json, the commit and uncommitted state of TREE when it was bundled,
and the painter records that as the code it painted with (src/paint/code-state.mjs).
Environment: RUNPOD_API_KEY (required), UNPAINTING_ENV_FILE, UNPAINTING_SSH_KEY, RUNPOD_IMAGE.
Keys are read in-process by api.py and never printed.
"""
import argparse, atexit, io, json, os, queue, re, shlex, signal, subprocess, sys, tarfile, threading, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from api import rp, rpgql

KEY = os.environ.get("UNPAINTING_SSH_KEY", str(Path.home() / ".ssh/id_ed25519"))
SSH = ["-i", KEY, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "BatchMode=yes",
       "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=20"]
RP_IMAGE = os.environ.get("RUNPOD_IMAGE", "runpod/base:0.6.2-cuda12.4.1")
IP_WAIT = 600  # a host that has to pull the image first reports RUNNING minutes before its ssh port exists
# fallback order per box: 4090 community, 4090 secure, then Vulkan-capable alternatives by price
LADDER = [("NVIDIA GeForce RTX 4090", "COMMUNITY"), ("NVIDIA GeForce RTX 4090", "SECURE"),
          ("NVIDIA L40S", "COMMUNITY"), ("NVIDIA L40S", "SECURE"),
          ("NVIDIA RTX 6000 Ada Generation", "COMMUNITY"), ("NVIDIA RTX 6000 Ada Generation", "SECURE"),
          ("NVIDIA A100 80GB PCIe", "COMMUNITY"), ("NVIDIA A100-SXM4-80GB", "SECURE"),
          ("NVIDIA H100 80GB HBM3", "COMMUNITY"), ("NVIDIA H100 80GB HBM3", "SECURE")]
NODE_URL = "https://nodejs.org/dist/v26.13.1/node-v26.13.1-linux-x64.tar.xz"
SKIP_TOP = {"work", "task", "node_modules", ".git", "refs", ".claude", ".agents"}
MAX_PODS = 24
HARD_LIMIT = 45.0
BATCH = time.strftime("%m%d%H%M%S") + f"-{os.getpid() % 1000:03d}"  # two batches started in one second stay apart
lock = threading.Lock()
closed = threading.Event()  # no more jobs will join the queue
boxes = {}  # name -> pod id
results = []
T0 = time.time()
SHA, DIRTY = "0" * 40, 0


def log(*a):
    with lock:
        print(f"[{time.time()-T0:6.1f}s]", *a, flush=True)


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def code_state(tree, path):
    """The tree's code state (commit, dirty, changed and untracked files) written to path; the pod copy has no .git."""
    r = run(["node", "--input-type=module", "-e",
             "import { codeState } from './src/paint/code-state.mjs'; console.log(JSON.stringify(codeState('.')));"], cwd=str(tree))
    state = json.loads(r.stdout) if r.returncode == 0 else {}
    if not state.get("commit"):
        raise SystemExit(f"{tree} has no git commit to record (node said: {r.stderr.strip()[-200:]}); a batch must say what code it paints with")
    Path(path).write_text(json.dumps(state, indent=1))
    return state


def subject_inputs(tree, subjects):
    """(registry path, absolute input paths) of the registered subjects, each pinned file checked against its sha256."""
    r = run(["node", str(Path(__file__).resolve().parent / "subject-inputs.mjs"), subjects], cwd=str(tree))
    if r.returncode:
        raise SystemExit("--subjects: " + (r.stderr.strip() or r.stdout.strip()))
    d = json.loads(r.stdout)
    return d["registry"], d["files"]


def make_bundle(tree, extra, path, state_file):
    """tar.gz whose members carry the tree's absolute path (minus leading /), extracted at / on the box."""
    pre = str(tree).lstrip("/")
    with tarfile.open(path, "w:gz", compresslevel=3) as tf:
        tf.add(state_file, arcname=f"{pre}/code-state.shipped.json")
        for e in sorted(tree.iterdir()):
            if e.name in SKIP_TOP or (e.name.startswith(".") and e.is_dir()):
                continue
            tf.add(e, arcname=f"{pre}/{e.name}", filter=lambda ti: None if ti.name.endswith((".DS_Store",)) else ti)
        for rel in extra:
            if os.path.isabs(rel):  # file outside the tree: ship at its absolute path (a link is followed)
                tf.add(os.path.realpath(rel), arcname=rel.lstrip("/"))
            else:
                tf.add(tree / rel, arcname=f"{pre}/{rel}")
        for own in ("setup-seg.sh",):  # an older release's tree has no such script: the pod copy gets this helper's
            if not (tree / "tools/cloud" / own).exists():
                tf.add(Path(__file__).resolve().parent / own, arcname=f"{pre}/tools/cloud/{own}")
        pj = tree.parent / "package.json"
        if not (tree / "package.json").exists() and pj.exists():
            tf.add(pj, arcname=f"{pre.rsplit('/', 1)[0]}/package.json")
    return os.path.getsize(path)


SETUP = r"""set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq xz-utils curl git libatomic1 ffmpeg bc libegl1 libgl1 libvulkan1 vulkan-tools ca-certificates python3 python3-venv >/dev/null
if ! node -v 2>/dev/null | grep -q v26.13; then curl -fsSL %(node)s | tar -xJ -C /usr/local --strip-components=1; fi
mkdir -p %(tree)s/work; touch %(tree)s/work/runs.jsonl
export XDG_RUNTIME_DIR=/tmp;
cd %(tree)s
find tools src -name '*.mjs' -o -name '*.js' -o -name '*.sh' | xargs grep -l 'backend=metal' 2>/dev/null | xargs -r sed -i 's/backend=metal/backend=vulkan/g'
has_nvidia_icd() {
  for icd in /usr/share/vulkan/icd.d/*nvidia*.json /etc/vulkan/icd.d/*nvidia*.json; do
    [ -f "$icd" ] && return 0
  done
  return 1
}
# compute-only NVIDIA images lack the Vulkan ICD: add the GL userspace that matches the installed driver
if command -v nvidia-smi >/dev/null && ! has_nvidia_icd; then
  GL=$(dpkg-query -W -f='${Package} ${Version} ${Status}\n' 'libnvidia-compute-*' 2>/dev/null | awk '/ installed$/ {sub("libnvidia-compute-", "libnvidia-gl-", $1); print $1 "=" $2; exit}')
  [ -n "$GL" ] && apt-get install -y -qq "$GL" >/dev/null
  has_nvidia_icd || { echo "no NVIDIA Vulkan ICD after installing '$GL'"; exit 3; }
fi
# the painter needs the NVIDIA card through Vulkan; a software device (llvmpipe) alone is not a GPU pod
if command -v nvidia-smi >/dev/null && ! vulkaninfo --summary 2>/dev/null | grep -qi 'deviceName.*nvidia'; then
  echo "Vulkan lists no NVIDIA device: $(vulkaninfo --summary 2>&1 | grep -i deviceName | tr '\n' ';')"; exit 4
fi
PKG=$( [ -f package.json ] && pwd || dirname "$(pwd)" )
(cd "$PKG" && npm install --no-audit --no-fund >/dev/null 2>&1)
[ ! -f tools/cloud/setup-lines.sh ] || bash tools/cloud/setup-lines.sh
[ ! -f tools/cloud/setup-seg.sh ] || bash tools/cloud/setup-seg.sh
cat > /usr/local/bin/git <<'SHIM'
#!/bin/bash
# Answers for a bundled tree (no .git) from the code state shipped with it, so run records carry the commit the tree
# was bundled from; several trees on one pod each answer for themselves. Anything else is real git.
dir=.; [ "$1" = "-C" ] && dir=$2
f="$dir/code-state.shipped.json"
if [ -f "$f" ] && [ ! -e "$dir/.git" ]; then
  commit=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["commit"])' "$f")
  dirty=$(python3 -c 'import json,sys;print(1 if json.load(open(sys.argv[1]))["dirty"] else 0)' "$f")
  case "$*" in
    *"rev-parse HEAD"*) echo "$commit"; exit 0 ;;
    *"status --porcelain"*) [ "$dirty" = 1 ] && echo " M tree"; exit 0 ;;
    *"ls-files --others"*|*"diff HEAD"*) [ "$dirty" = 0 ] && exit 0 ;;
  esac
fi
exec /usr/bin/git "$@"
SHIM
chmod +x /usr/local/bin/git
node -e 'import("sharp").then(()=>console.log("sharp ok"))'
"""


RUNNING_FILE = os.environ.get("UNPAINTING_RUNNING_FILE", "")


def note_running(pod_id, name=None):
    """Keep UNPAINTING_RUNNING_FILE, when it is set, as the list of this account's machines that are up: a line is
    added when a pod is created and taken out when it is deleted."""
    if not RUNNING_FILE:
        return
    with lock:
        f = Path(RUNNING_FILE)
        rows = [l for l in (f.read_text().splitlines() if f.exists() else []) if l.strip() and l.split()[1:2] != [pod_id]]
        if name:
            rows.append(f"runpod {pod_id} {name} created {time.strftime('%Y-%m-%d %H:%M:%S')} hard-limit-min {HARD_LIMIT:g}")
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("".join(r + "\n" for r in rows))


def delete_pod(pod_id):
    rp("DELETE", f"/pods/{pod_id}")
    note_running(pod_id)


def public_address(pod_id):
    """True or False as RunPod says the pod's host has a public address; None when it does not say (yet)."""
    try:
        r = rpgql('{ pod(input: {podId: "%s"}) { machine { supportPublicIp } } }' % pod_id)
        return (((r.get("data") or {}).get("pod") or {}).get("machine") or {}).get("supportPublicIp")
    except Exception:
        return None


class Box:
    def __init__(self, name):
        self.name, self.id, self.ip, self.port, self.rate, self.t0 = name, None, None, 22, 0.0, None
        self.shipped, self.lock = set(), threading.Lock()

    def ssh(self, cmd, timeout=3600, stdin=None):
        return run(["ssh", "-p", str(self.port), *SSH, f"root@{self.ip}", cmd], timeout=timeout, stdin=stdin)

    # RunPod REST v2: walk the GPU ladder; every create and every wait is bounded, failures are logged and skipped
    def create(self, image, min_ram, min_vcpu):
        pub = Path(KEY + ".pub").read_text().strip()
        for gpu, cloud in LADDER * 2:  # the whole ladder twice: a rung that failed once often has another host
            tag = f"{gpu.replace('NVIDIA ', '').replace('GeForce ', '')}/{cloud}"
            try:
                r = rp("POST", "/pods", {"name": self.name, "image": image, "cloud": cloud, "disk": 40, "ports": ["22/tcp"],
                                         "gpu": {"id": gpu, "count": 1, "minRamPerGpu": min_ram, "minVcpuCountPerGpu": min_vcpu},
                                         "env": {"PUBLIC_KEY": pub, "NVIDIA_DRIVER_CAPABILITIES": "all"}})
            except Exception as e:
                log(self.name, tag, "create error:", str(e)[:120])
                continue
            if not (isinstance(r, dict) and r.get("id") and r.get("status") in ("PROVISIONING", "STARTING", "RUNNING")):
                log(self.name, tag, "create failed:", str(r)[:200])
                continue
            self.id, self.t0, self.gpu = r["id"], time.time(), gpu
            note_running(self.id, self.name)
            with lock:
                boxes[self.name] = self.id
            self.rate = float(r.get("cost") or 0)
            g = r.get("gpu") or {}
            log(self.name, tag, f"created ${self.rate}/h, {g.get('vcpuCount')} vCPU, {g.get('memory')} GB, {r.get('dataCenterId')}; waiting for ssh port (max {IP_WAIT}s)")
            end, why = time.time() + IP_WAIT, f"no public ssh in {IP_WAIT}s"
            while time.time() < end:
                if public_address(self.id) is False:  # such a host never gets a direct ssh port
                    why = "the host has no public address"
                    break
                p = rp("GET", f"/pods/{self.id}")
                direct = ((p.get("ssh") or {}).get("direct") or {}) if isinstance(p, dict) else {}
                if isinstance(p, dict) and p.get("status") == "RUNNING":
                    if direct.get("host") and direct.get("port"):
                        self.ip, self.port = direct["host"], int(direct["port"])
                        self.rate = float(p.get("cost") or self.rate)
                        return
                time.sleep(5)
            log(self.name, tag, f"{why}, deleting and trying next")
            delete_pod(self.id)
            with lock:
                boxes.pop(self.name, None)
            self.id = None
        raise RuntimeError("no GPU pod available on the whole ladder")

    def wait_ssh(self):
        for _ in range(60):
            if self.ssh("true", timeout=30).returncode == 0:
                return
            time.sleep(5)
        raise RuntimeError("ssh never came up")

    def delete(self):
        if not self.id:
            return
        delete_pod(self.id)
        with lock:
            boxes.pop(self.name, None)
        log(self.name, "deleted")


def delete_all():
    for name, bid in list(boxes.items()):
        try:
            delete_pod(bid)
            boxes.pop(name, None)
            print("cleanup deleted", name, flush=True)
        except Exception as e:
            print("cleanup FAILED", name, e, flush=True)
    left_over()


def left_over():
    """Ask RunPod which of this batch's pods still exist, delete them again, and say so: nothing is left to a guess."""
    try:
        r = rp("GET", "/pods")
        mine = [p for p in (r.get("pods") or []) if str(p.get("name", "")).startswith(f"unpaint-rb-{BATCH}-") and p.get("status") != "TERMINATED"]
        for p in mine:
            print("STILL LISTED, deleting again:", p.get("name"), p.get("id"), p.get("status"), flush=True)
            delete_pod(p["id"])
        print(f"pods of batch {BATCH} still listed by RunPod: {len(mine)}", flush=True)
    except Exception as e:
        print("could NOT list pods to confirm the cleanup:", e, flush=True)


def provision(box, args, bundle, tree):
    try:
        box.create(args.image, args.min_ram or max(24, 16 * args.per_pod), args.min_vcpu or max(6, 4 * args.per_pod))
        box.wait_ssh()
    except Exception as e:
        box.delete()
        box.id = None
        raise RuntimeError(f"no pod came up: {e}")
    log(box.name, box.ip, box.port, f"${box.rate}/h up")
    with open(bundle, "rb") as f:
        r = box.ssh("tar -xzf - -C /", stdin=f)
    if r.returncode:
        raise RuntimeError("bundle upload failed: " + r.stderr[-300:])
    r = box.ssh(SETUP % {"node": NODE_URL, "tree": shlex.quote(str(tree)), "sha": SHA, "dirty": DIRTY}, timeout=1800)
    if r.returncode or "sharp ok" not in r.stdout:
        raise RuntimeError("setup failed: " + (r.stdout + r.stderr)[-1500:])
    # the pod deletes itself a little after the hard limit, whatever becomes of this process
    with open(Path(__file__).resolve().parent / "self-destruct.sh", "rb") as f:
        r = box.ssh(f"bash -s {max(15, int(HARD_LIMIT - (time.time() - T0) / 60) + 10)}", stdin=f, timeout=120)
    if "armed" not in r.stdout:
        raise RuntimeError("the pod's self-delete timer could not be armed: " + (r.stdout + r.stderr)[-300:])
    log(box.name, "setup done;", r.stdout.strip().splitlines()[-1])


def job_inputs(cmd, tree):
    """Files and folders a job line names by absolute path under the home folder, outside what the bundle carries."""
    home, found = str(Path.home()), []
    for m in re.finditer(r"/[^\s'\":,;]+", cmd):
        f = m.group(0).rstrip("/")
        inside = f == str(tree) or f.startswith(str(tree) + "/")
        if f.startswith(home + "/") and os.path.exists(f) and (not inside or f.startswith(str(tree / "work") + "/")) and f not in found:
            found.append(f)
    return found


def ship_inputs(box, cmd, tree):
    with box.lock:
        new = [f for f in job_inputs(cmd, tree) if f not in box.shipped]
        if not new:
            return
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz", compresslevel=3) as tf:
            for f in new:
                tf.add(os.path.realpath(f), arcname=f.lstrip("/"), filter=lambda ti: None if ti.name.endswith(".DS_Store") else ti)
        r = subprocess.run(["ssh", "-p", str(box.port), *SSH, f"root@{box.ip}", "tar -xzf - -C /"], input=buf.getvalue(), capture_output=True, timeout=1800)
        if r.returncode:
            raise RuntimeError("could not ship " + ", ".join(new) + ": " + r.stderr.decode()[-200:])
        box.shipped.update(new)
        log(box.name, f"shipped {len(new)} job inputs, {len(buf.getvalue())/1e6:.1f} MB")


def run_job(box, idx, cmd, tree, outdir, limit_s, env_line):
    ship_inputs(box, cmd, tree)
    mark = f"/tmp/mark.{idx}"
    t = time.time()
    r = box.ssh(f"touch {mark}; cd {shlex.quote(str(tree))} && unset DAWN_FLAGS; export XDG_RUNTIME_DIR=/tmp {env_line}; ({cmd}) ; echo __EXIT=$?", timeout=limit_s)
    wall = time.time() - t
    m = re.search(r"__EXIT=(\d+)", r.stdout)
    code = int(m.group(1)) if m else 255
    (outdir / f"job-{idx}.out").write_text(r.stdout + "\n--stderr--\n" + r.stderr)
    tarpath = outdir / f"job-{idx}.tgz"
    pulled = 0
    with open(tarpath, "wb") as f:
        p = subprocess.run(["ssh", "-p", str(box.port), *SSH, f"root@{box.ip}",
                            f"cd {shlex.quote(str(tree))} && find work -type f -newer {mark} ! -name runs.jsonl -print0 | tar --null -T - -czf -"],
                           stdout=f, stderr=subprocess.PIPE, timeout=1800)
    if p.returncode == 0 and tarpath.stat().st_size > 0:
        x = run(["tar", "-xzf", str(tarpath), "-C", str(tree)])
        pulled = len(run(["tar", "-tzf", str(tarpath)]).stdout.splitlines()) if x.returncode == 0 else 0
    tarpath.unlink(missing_ok=True)
    cost = wall / 3600 * box.rate
    row = {"idx": idx, "cmd": cmd, "box": box.name, "exit": code, "wall_s": round(wall, 1),
           "cost_usd": round(cost, 5), "files_pulled": pulled}
    log(f"job {idx} exit={code} wall={wall:.1f}s files={pulled} ${cost:.4f}  {cmd}")
    with lock:
        results.append(row)


def worker(box, q, args, bundle, tree, outdir, ready):
    for attempt in (1, 2, 3):  # a host that fails its setup (no Vulkan card, a dead mirror) is replaced
        try:
            provision(box, args, bundle, tree)
            break
        except Exception as e:
            log(box.name, f"PROVISION FAILED (try {attempt} of 3):", e)
            box.delete()
            box.id = None
            if attempt == 3:
                return
    with lock:
        ready.append(box.name)
    log(f"pods ready: {len(ready)}")
    ths = []

    def slot(n=0):
        time.sleep(15 * n)  # a pod's second and third places start later, so a short queue spreads over the pods
        while time.time() - T0 < args.hard_limit * 60:
            try:
                idx, cmd = q.get_nowait()
            except queue.Empty:
                if closed.is_set():
                    return
                time.sleep(3)
                continue
            try:
                run_job(box, idx, cmd, tree, outdir, int((args.job_limit or args.hard_limit) * 60), args.env_line)
            except Exception as e:
                log(f"job {idx} error: {e}")
                with lock:
                    results.append({"idx": idx, "cmd": cmd, "exit": 254, "error": str(e)})

    for n in range(args.per_pod):
        t = threading.Thread(target=slot, args=(n,))
        t.start()
        ths.append(t)
    for t in ths:
        t.join()
    box.delete()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tree")
    ap.add_argument("jobs")
    ap.add_argument("--pods", type=int, default=4)
    ap.add_argument("--per-pod", type=int, default=2)
    ap.add_argument("--input", action="append", default=[])
    ap.add_argument("--image", default=RP_IMAGE)
    ap.add_argument("--follow", action="store_true", help="take lines added to JOBS until JOBS.done exists")
    ap.add_argument("--subjects", default="", help="registered subjects whose pinned inputs ship with the bundle")
    ap.add_argument("--hard-limit", type=float, default=45)
    ap.add_argument("--job-limit", type=float, default=0, help="minutes one job may run (default: the hard limit)")
    ap.add_argument("--min-ram", type=int, default=0, help="least host RAM in GB (default 16 a job, at least 24)")
    ap.add_argument("--min-vcpu", type=int, default=0, help="least host vCPUs (default 4 a job, at least 6)")
    ap.add_argument("--gpus", default="", help="override ladder: 'GPU id:COMMUNITY|SECURE,...'")
    args = ap.parse_args()
    if args.gpus:
        global LADDER
        LADDER = [tuple(x.rsplit(":", 1)) for x in args.gpus.split(",")]
    global HARD_LIMIT
    HARD_LIMIT = args.hard_limit
    tree = Path(args.tree).expanduser().resolve()
    jobs_file = Path(args.jobs).expanduser()
    read_jobs = lambda: [l.strip() for l in jobs_file.read_text().splitlines() if l.strip() and not l.startswith("#")]
    jobs = read_jobs()
    k = max(1, min(args.pods, MAX_PODS, args.pods if args.follow else len(jobs)))
    global SHA, DIRTY
    g = run(["git", "-C", str(tree), "rev-parse", "HEAD"])
    if g.returncode == 0:  # pod git shim answers with the local HEAD so run records match local runs
        SHA = g.stdout.strip()
        DIRTY = 1 if run(["git", "-C", str(tree), "status", "--porcelain", "--untracked-files=normal"]).stdout.strip() else 0
    outdir = tree / "work/cloud-batches" / BATCH
    outdir.mkdir(parents=True, exist_ok=True)
    state = code_state(tree, outdir / "code-state.shipped.json")
    args.env_line = ""
    if args.subjects:
        registry, files = subject_inputs(tree, args.subjects)
        args.input += files
        args.env_line = "UNPAINT_SUBJECTS=" + shlex.quote(registry)
    extra = sorted(set(args.input))
    bundle = outdir / "bundle.tgz"
    log(f"batch {BATCH}: {len(jobs)} jobs, {k} pods x {args.per_pod}, code {state['commit'][:8]}{' plus uncommitted changes' if state['dirty'] else ', clean'}, "
        f"bundle {make_bundle(tree, extra, bundle, outdir / 'code-state.shipped.json')/1e6:.1f} MB, +{len(extra)} input files")
    atexit.register(delete_all)
    for s in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(s, lambda *_: (delete_all(), os._exit(130)))
    threading.Timer(args.hard_limit * 60 + 120, lambda: (print("HARD LIMIT: deleting pods", flush=True), delete_all(), os._exit(124))).start()
    q = queue.Queue()
    for i, c in enumerate(jobs, 1):
        q.put((i, c))
    if args.follow:  # lines added to the jobs file join the queue; JOBS.done closes it
        def feed():
            while not closed.is_set():
                time.sleep(5)
                done_now = Path(str(jobs_file) + ".done").exists()
                now = read_jobs()
                for i, c in enumerate(now[len(jobs):], len(jobs) + 1):
                    q.put((i, c))
                    log(f"job {i} queued: {c}")
                jobs.extend(now[len(jobs):])
                if done_now:
                    closed.set()
        threading.Thread(target=feed, daemon=True).start()
    else:
        closed.set()
    ready = []
    ths = []
    for n in range(k):
        b = Box(f"unpaint-rb-{BATCH}-{n+1}")
        t = threading.Thread(target=worker, args=(b, q, args, str(bundle), tree, outdir, ready))
        t.start()
        ths.append(t)
    for t in ths:
        t.join()
    bundle.unlink(missing_ok=True)
    delete_all()
    total = sum(r.get("cost_usd", 0) for r in results)
    (outdir / "summary.json").write_text(json.dumps({"batch": BATCH, "wall_s": round(time.time() - T0, 1), "jobs": sorted(results, key=lambda r: r["idx"])}, indent=1))
    done = {r["idx"] for r in results}
    log(f"batch wall {time.time()-T0:.0f}s, jobs done {len(done)}/{len(jobs)}, job-time cost ${total:.3f}; summary {outdir/'summary.json'}")
    os._exit(0 if len(done) == len(jobs) and all(r.get("exit") == 0 for r in results) else 1)


if __name__ == "__main__":
    main()
