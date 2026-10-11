#!/usr/bin/env python3
"""render-batch.py TREE JOBS [options]: run one shell command per line of JOBS on cloud boxes, pull outputs back.

TREE  source tree on this machine (working tree, uncommitted files included). Bundled without work/ task/ node_modules/ .git/ data/refs/.
JOBS  text file, one command per line, run from the tree root on the box (blank lines and # lines skipped).
Options:
  --pods K          boxes to launch (default 4, cap 8, never more than jobs)
  --per-pod N       jobs run at once on one box (default 2)
  --input PATH      extra file or dir, relative to TREE, shipped with the bundle (repeatable)
  --provider P      runpod (default; falls back to archive), archive or runpod-only
  --hard-limit MIN  kill everything and delete all boxes after MIN minutes (default 45)
  --gpus LIST       override the GPU ladder (default order is LADDER in this file)
The tree is mirrored at the same absolute path on the box, so absolute paths inside recipes keep working.
Keys are read in-process by api.py and never printed.
"""
import argparse, atexit, io, json, os, queue, re, shlex, signal, subprocess, sys, tarfile, threading, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from api import rp, hc

KEY = os.environ.get("UNPAINTING_SSH_KEY", str(Path.home() / ".ssh/id_ed25519"))
SSH = ["-i", KEY, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "BatchMode=yes",
       "-o", "LogLevel=ERROR", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=20"]
RP_IMAGE = "runpod/base:0.6.2-cuda12.4.1"
IP_WAIT = 240
# fallback order per box: 4090 community, 4090 secure, then Vulkan-capable alternatives by price
LADDER = [("NVIDIA GeForce RTX 4090", "COMMUNITY"), ("NVIDIA GeForce RTX 4090", "SECURE"),
          ("NVIDIA L40S", "COMMUNITY"), ("NVIDIA L40S", "SECURE"),
          ("NVIDIA RTX 6000 Ada Generation", "COMMUNITY"), ("NVIDIA RTX 6000 Ada Generation", "SECURE"),
          ("NVIDIA A100 80GB PCIe", "COMMUNITY"), ("NVIDIA A100-SXM4-80GB", "SECURE"),
          ("NVIDIA H100 80GB HBM3", "COMMUNITY"), ("NVIDIA H100 80GB HBM3", "SECURE")]
HZ_TYPE = "cx43"
HZ_RATE = 0.03
NODE_URL = "https://nodejs.org/dist/v26.7.0/node-v26.7.0-linux-x64.tar.xz"
SKIP_TOP = {"work", "task", "node_modules", ".git", "refs", ".claude", ".agents"}
BATCH = time.strftime("%m%d%H%M%S") + f"-{os.getpid() % 1000:03d}"  # two batches started in one second stay apart
lock = threading.Lock()
boxes = {}  # name -> (provider, id)
results = []
T0 = time.time()
SHA, DIRTY = "0" * 40, 0


def log(*a):
    with lock:
        print(f"[{time.time()-T0:6.1f}s]", *a, flush=True)


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def make_bundle(tree, extra, path):
    """tar.gz whose members carry the tree's absolute path (minus leading /), extracted at / on the box."""
    pre = str(tree).lstrip("/")
    with tarfile.open(path, "w:gz") as tf:
        for e in sorted(tree.iterdir()):
            if e.name in SKIP_TOP or (e.name.startswith(".") and e.is_dir()):
                continue
            tf.add(e, arcname=f"{pre}/{e.name}", filter=lambda ti: None if ti.name.endswith((".DS_Store",)) else ti)
        for rel in extra:
            if os.path.isabs(rel):  # file outside the tree: ship at its absolute path
                tf.add(rel, arcname=rel.lstrip("/"))
            else:
                tf.add(tree / rel, arcname=f"{pre}/{rel}")
        pj = tree.parent / "package.json"
        if not (tree / "package.json").exists() and pj.exists():
            tf.add(pj, arcname=f"{pre.rsplit('/', 1)[0]}/package.json")
    return os.path.getsize(path)


SETUP = r"""set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq xz-utils curl git libatomic1 ffmpeg bc libegl1 libgl1 libvulkan1 vulkan-tools ca-certificates python3 python3-venv >/dev/null
if ! node -v 2>/dev/null | grep -q v26; then curl -fsSL %(node)s | tar -xJ -C /usr/local --strip-components=1; fi
mkdir -p %(tree)s/work; touch %(tree)s/work/runs.jsonl
export XDG_RUNTIME_DIR=/tmp;
cd %(tree)s
find tools src -name '*.mjs' -o -name '*.js' -o -name '*.sh' | xargs grep -l 'backend=metal' 2>/dev/null | xargs -r sed -i 's/backend=metal/backend=vulkan/g'
# compute-only NVIDIA images lack the Vulkan ICD: add the GL userspace that matches the installed driver
if command -v nvidia-smi >/dev/null && ! ls /usr/share/vulkan/icd.d/nvidia* /etc/vulkan/icd.d/nvidia* >/dev/null 2>&1; then
  GL=$(dpkg-query -W -f='${Package} ${Version} ${Status}\n' 'libnvidia-compute-*' 2>/dev/null | awk '/ installed$/ {sub("libnvidia-compute-", "libnvidia-gl-", $1); print $1 "=" $2; exit}')
  [ -n "$GL" ] && apt-get install -y -qq "$GL" >/dev/null
  ls /usr/share/vulkan/icd.d/nvidia* /etc/vulkan/icd.d/nvidia* >/dev/null 2>&1 || { echo "no NVIDIA Vulkan ICD after installing '$GL'"; exit 3; }
fi
PKG=$( [ -f package.json ] && pwd || dirname "$(pwd)" )
(cd "$PKG" && npm install --no-audit --no-fund >/dev/null 2>&1)
[ ! -f tools/cloud/setup-lines.sh ] || bash tools/cloud/setup-lines.sh
cat > /usr/local/bin/git <<'SHIM'
#!/bin/bash
case "$*" in
  *"rev-parse HEAD"*) echo %(sha)s ;;
  *"status --porcelain"*) [ "%(dirty)s" = 1 ] && echo " M tree" ; exit 0 ;;
  *) exec /usr/bin/git "$@" ;;
esac
SHIM
chmod +x /usr/local/bin/git
node -e 'import("sharp").then(()=>console.log("sharp ok"))'
"""


class Box:
    def __init__(self, name):
        self.name, self.provider, self.id, self.ip, self.port, self.rate, self.t0 = name, None, None, None, 22, 0.0, None

    def ssh(self, cmd, timeout=3600, stdin=None):
        return run(["ssh", "-p", str(self.port), *SSH, f"root@{self.ip}", cmd], timeout=timeout, stdin=stdin)

    # RunPod: walk the GPU ladder; every create and every wait is bounded, failures are logged and skipped
    def create_runpod(self):
        pub = Path(KEY + ".pub").read_text().strip()
        for gpu, cloud in LADDER:
            tag = f"{gpu.replace('NVIDIA ', '').replace('GeForce ', '')}/{cloud}"
            try:
                r = rp("POST", "/pods", {"name": self.name, "imageName": RP_IMAGE, "gpuTypeIds": [gpu], "gpuCount": 1,
                                         "cloudType": cloud, "containerDiskInGb": 30, "volumeInGb": 0, "ports": ["22/tcp"],
                                         "supportPublicIp": True, "env": {"PUBLIC_KEY": pub, "NVIDIA_DRIVER_CAPABILITIES": "all"}})
            except Exception as e:
                log(self.name, tag, "create error:", str(e)[:120])
                continue
            if not (isinstance(r, dict) and r.get("id")):
                log(self.name, tag, "create failed:", str(r)[:140])
                continue
            self.provider, self.id, self.t0, self.gpu = "runpod", r["id"], time.time(), gpu
            with lock:
                boxes[self.name] = ("runpod", self.id)
            self.rate = float(r.get("costPerHr") or r.get("adjustedCostPerHr") or 0.34)
            log(self.name, tag, f"created ${self.rate}/h, waiting for ssh port (max {IP_WAIT}s)")
            end = time.time() + IP_WAIT
            while time.time() < end:
                p = rp("GET", f"/pods/{self.id}")
                pm = (p.get("portMappings") or {}) if isinstance(p, dict) else {}
                if p.get("publicIp") and pm.get("22"):
                    self.ip, self.port = p["publicIp"], int(pm["22"])
                    self.rate = float(p.get("costPerHr") or self.rate)
                    return
                time.sleep(5)
            log(self.name, tag, f"no public ssh in {IP_WAIT}s, deleting and trying next")
            rp("DELETE", f"/pods/{self.id}")
            with lock:
                boxes.pop(self.name, None)
            self.id = None
        raise RuntimeError("no GPU pod available on the whole ladder")

    # archive
    def create_archive(self):
        for loc in ("fsn1", "nbg1", "hel1", "ash", "hil"):
            r = hc("POST", "/servers", {"name": self.name, "server_type": HZ_TYPE, "image": "ubuntu-24.04", "location": loc,
                                        "ssh_keys": [os.environ.get("HCLOUD_SSH_KEY", "painter-render")], "labels": {"purpose": "render-batch"}})
            if isinstance(r, dict) and "server" in r:
                break
            log(self.name, loc, "archive create failed:", str((r.get("error") if isinstance(r, dict) else r))[:120])
        else:
            raise RuntimeError("no archive location worked")
        self.provider, self.id, self.t0, self.rate = "archive", r["server"]["id"], time.time(), HZ_RATE
        with lock:
            boxes[self.name] = ("archive", self.id)
        for _ in range(60):
            s = hc("GET", f"/servers/{self.id}")["server"]
            if s["status"] == "running":
                self.ip = s["public_net"]["ipv4"]["ip"]
                return
            time.sleep(3)
        raise RuntimeError("server never running")

    def wait_ssh(self):
        for _ in range(60):
            if self.ssh("true", timeout=30).returncode == 0:
                return
            time.sleep(5)
        raise RuntimeError("ssh never came up")

    def delete(self):
        if not self.id:
            return
        delete_box(self.provider, self.id, self.name)
        with lock:
            boxes.pop(self.name, None)
        log(self.name, "deleted")


def delete_box(prov, bid, name):
    if prov == "runpod":
        rp("DELETE", f"/pods/{bid}")
    else:
        hc("DELETE", f"/servers/{bid}")


def delete_all():
    for name, (prov, bid) in list(boxes.items()):
        try:
            delete_box(prov, bid, name)
            boxes.pop(name, None)
            print("cleanup deleted", name, flush=True)
        except Exception as e:
            print("cleanup FAILED", name, e, flush=True)


def provision(box, args, bundle, tree):
    order = {"runpod": ["runpod", "archive"], "archive": ["archive"], "runpod-only": ["runpod"]}[args.provider]
    err = None
    for prov in order:
        try:
            {"runpod": box.create_runpod, "archive": box.create_archive}[prov]()
            box.wait_ssh()
            break
        except Exception as e:
            err = e
            log(box.name, prov, "unavailable:", e)
            box.delete()
            box.id = None
    else:
        raise RuntimeError(f"no provider worked: {err}")
    log(box.name, box.provider, box.ip, box.port, f"${box.rate}/h up")
    with open(bundle, "rb") as f:
        r = box.ssh("tar -xzf - -C /", stdin=f)
    if r.returncode:
        raise RuntimeError("bundle upload failed: " + r.stderr[-300:])
    r = box.ssh(SETUP % {"node": NODE_URL, "tree": shlex.quote(str(tree)), "sha": SHA, "dirty": DIRTY}, timeout=900)
    if r.returncode or "sharp ok" not in r.stdout:
        raise RuntimeError("setup failed: " + (r.stdout + r.stderr)[-500:])
    log(box.name, "setup done")


def run_job(box, idx, cmd, tree, outdir):
    mark = f"/tmp/mark.{idx}"
    t = time.time()
    r = box.ssh(f"touch {mark}; cd {shlex.quote(str(tree))} && unset DAWN_FLAGS; ({cmd}) ; echo __EXIT=$?", timeout=3600)
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
    row = {"idx": idx, "cmd": cmd, "box": box.name, "provider": box.provider, "exit": code, "wall_s": round(wall, 1),
           "cost_usd": round(cost, 5), "files_pulled": pulled}
    log(f"job {idx} exit={code} wall={wall:.1f}s files={pulled} ${cost:.4f}  {cmd}")
    with lock:
        results.append(row)


def worker(box, q, args, bundle, tree, outdir, ready):
    try:
        provision(box, args, bundle, tree)
    except Exception as e:
        log(box.name, "PROVISION FAILED:", e)
        box.delete()
        return
    ths = []

    def slot():
        while time.time() - T0 < args.hard_limit * 60:
            try:
                idx, cmd = q.get_nowait()
            except queue.Empty:
                return
            try:
                run_job(box, idx, cmd, tree, outdir)
            except Exception as e:
                log(f"job {idx} error: {e}")
                with lock:
                    results.append({"idx": idx, "cmd": cmd, "exit": 254, "error": str(e)})

    for _ in range(args.per_pod):
        t = threading.Thread(target=slot)
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
    ap.add_argument("--provider", default="runpod", choices=["runpod", "archive", "runpod-only"])
    ap.add_argument("--hard-limit", type=float, default=45)
    ap.add_argument("--gpus", default="", help="override ladder: 'GPU id:COMMUNITY|SECURE,...'")
    args = ap.parse_args()
    if args.gpus:
        global LADDER
        LADDER = [tuple(x.rsplit(":", 1)) for x in args.gpus.split(",")]
    tree = Path(args.tree).expanduser().resolve()
    jobs = [l.strip() for l in Path(args.jobs).expanduser().read_text().splitlines() if l.strip() and not l.startswith("#")]
    k = max(1, min(args.pods, 8, len(jobs)))
    global SHA, DIRTY
    g = run(["git", "-C", str(tree), "rev-parse", "HEAD"])
    if g.returncode == 0:  # pod git shim answers with the local HEAD so run records match local runs
        SHA = g.stdout.strip()
        DIRTY = 1 if run(["git", "-C", str(tree), "status", "--porcelain", "--untracked-files=normal"]).stdout.strip() else 0
    outdir = tree / "work/cloud-batches" / BATCH
    outdir.mkdir(parents=True, exist_ok=True)
    extra = sorted(set(args.input))
    bundle = outdir / "bundle.tgz"
    log(f"batch {BATCH}: {len(jobs)} jobs, {k} pods x {args.per_pod}, bundle {make_bundle(tree, extra, bundle)/1e6:.1f} MB, +{len(extra)} input files")
    atexit.register(delete_all)
    for s in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(s, lambda *_: (delete_all(), os._exit(130)))
    threading.Timer(args.hard_limit * 60 + 120, lambda: (print("HARD LIMIT: deleting boxes", flush=True), delete_all(), os._exit(124))).start()
    q = queue.Queue()
    for i, c in enumerate(jobs, 1):
        q.put((i, c))
    ths = []
    for n in range(k):
        b = Box(f"painter-rb-{BATCH}-{n+1}")
        t = threading.Thread(target=worker, args=(b, q, args, str(bundle), tree, outdir, None))
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
