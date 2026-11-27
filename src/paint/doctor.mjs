// Pre-flight environment check (npm run doctor). Fails loudly if any required tool,
// model checkpoint, clean checkout or disk floor is missing before a run starts.
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { codeState } from "./code-state.mjs";
import { linePython } from "./methods/line-python.mjs";
import { resolveSegPython, resolveSamCheckpoint } from "../crop/segment-prep.mjs";

const SEG_PROBE = [
  "import json, sys",
  "v = {\"python\": sys.version.split()[0]}",
  "for mod, name in ((\"numpy\", \"numpy\"), (\"cv2\", \"opencv\"), (\"torch\", \"torch\"), (\"segment_anything\", \"segment_anything\")):",
  "    try: v[name] = getattr(__import__(mod), \"__version__\", \"installed\")",
  "    except Exception: v[name] = None",
  "print(json.dumps(v))",
  "sys.exit(0 if all(v[k] for k in (\"numpy\", \"opencv\", \"torch\", \"segment_anything\")) else 3)",
].join("\n");

const MIN_DISK_BYTES = 20 * 1024 ** 3;

// sketch-map.py uses HF_HOME and the default main revision. An empty cache, a
// missing weight or a broken download must not pass a release preflight.
function lineModelWeights(root) {
  const cache = path.join(root, "work/line-models/hf");
  const repo = path.join(cache, "hub/models--lllyasviel--Annotators");
  let revision = null;
  try {
    const ref = fs.readFileSync(path.join(repo, "refs/main"), "utf8").trim();
    if (/^[a-f0-9]{40}$/i.test(ref)) revision = ref;
  } catch { /* no cached main revision */ }
  const missing = ["sk_model.pth", "sk_model2.pth"].filter(name => {
    if (!revision) return true;
    try {
      const stat = fs.statSync(path.join(repo, "snapshots", revision, name));
      return !stat.isFile() || stat.size === 0;
    } catch { return true; }
  });
  return { cache, revision, missing, ready: missing.length === 0 };
}

function probeSegPython(python, run) {
  if (!python) return { ready: false, path: null, error: "no segmentation python found" };
  const r = run(python, ["-c", SEG_PROBE], { encoding: "utf8", timeout: 60000 });
  let v = {};
  try { v = JSON.parse(String(r.stdout ?? "").trim().split("\n").at(-1)); } catch { v = {}; }
  return {
    ready: !r.error && r.status === 0,
    path: python,
    python: v.python ?? null,
    numpy: v.numpy ?? null,
    opencv: v.opencv ?? null,
    torch: v.torch ?? null,
    segment_anything: v.segment_anything ?? null,
    ...(r.error || r.status !== 0 ? { error: r.error?.message ?? (String(r.stderr ?? "").trim().split("\n").at(-1) || `exit ${r.status}`) } : {}),
  };
}

export function runDoctor({
  root,
  env = process.env,
  exists = fs.existsSync,
  run = spawnSync,
  statfs = p => fs.statfsSync(p),
  state = null,
  segPythonPath = undefined,
  samCheckpointPath = undefined,
  strictModels = false,
} = {}) {
  const code = state ?? codeState(root);
  const gitOk = Boolean(code.git && !code.dirty);
  const lp = linePython({ env, root, exists, run, log: () => {}, warn: () => {} });
  const lineOk = Boolean(lp.ready && !lp.fallback && lp["scikit-image"]);
  let segPath = segPythonPath;
  if (segPath === undefined) {
    try { segPath = resolveSegPython({ env, root }); } catch { segPath = null; }
  }
  const seg = probeSegPython(segPath, run);
  let samPath = samCheckpointPath;
  if (samPath === undefined) {
    try { samPath = resolveSamCheckpoint({ env, root }); } catch { samPath = null; }
  }
  const samOk = Boolean(samPath && exists(samPath));
  const fsInfo = statfs(root);
  const freeBytes = Number(fsInfo.bavail) * Number(fsInfo.bsize);
  const freeGiB = +(freeBytes / 1024 ** 3).toFixed(2);
  const diskOk = freeBytes >= MIN_DISK_BYTES;

  // The ordinary painter accepts prepared drawings; release comparisons also
  // require the optional lineart tools and their already-cached weights (AGENTS.md).
  const models = strictModels ? { packages: lp.model, ...lineModelWeights(root) } : null;
  const warnings = [];
  const failures = [];
  if (!gitOk) failures.push(!code.git ? "git metadata missing" : `working tree is dirty (${code.tracked.length} tracked, ${code.untracked.length} untracked)`);
  if (!lineOk) failures.push(lp.fallback ? `line python fell back (${lp.fallback})` : !lp.ready ? `line python missing numpy/opencv (${lp.error ?? "not ready"})` : "line python missing scikit-image");
  if (!seg.ready) failures.push(`seg python not ready (${seg.error ?? "missing packages"})`);
  if (!samOk) failures.push("SAM checkpoint sam_vit_b_01ec64.pth missing");
  if (models && !models.packages) failures.push("lineart python missing torch or controlnet_aux");
  if (models && !models.ready) failures.push(`lineart weights missing or empty: ${models.missing.join(", ")} (work/line-models/hf; cached main revision required)`);
  if (!diskOk) failures.push(`free disk ${freeGiB} GiB is below 20 GiB floor`);

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    checks: {
      code: { ok: gitOk, commit: code.commit, dirty: code.dirty, tracked: code.tracked.length, untracked: code.untracked.length },
      linePython: { ok: lineOk, path: lp.path, from: lp.from, python: lp.python, numpy: lp.numpy, opencv: lp.opencv, scikitImage: lp["scikit-image"] },
      segPython: { ok: seg.ready, ...seg },
      samCheckpoint: { ok: samOk, path: samPath },
      ...(models ? { lineModels: { ok: models.packages && models.ready, ...models } } : {}),
      disk: { ok: diskOk, freeGiB, floorGiB: 20 },
    },
  };
}
