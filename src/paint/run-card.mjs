// Records every decision and input of a painter run in <out>/run-card.json:
// drawing stages, segment backend, line source, python and checkpoint versions,
// GPU backend, box palette and paint-guard decision, input and output SHA-256 hashes, code cleanliness, and the mid-painting checks the run continued past.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { linePaths } from "../crop/lines.mjs";
import { continuedSummary } from "../media/checks.mjs";

const fileSha256 = file => {
  if (!file || !fs.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
};

function buildRunCard({
  root,
  out,
  args = [],
  subject = null,
  imageFile = null,
  planFile = null,
  drawingFile = null,
  drawingOrder = "first",
  drawingMedium = "graphite",
  code = null,
  segments = null,
  linework = null,
  gpu = null,
  palette = null,
  phases = [],
  seconds = 0,
  exitCode = 0,
} = {}) {
  const resolveOpt = p => (p ? path.resolve(root, p) : null);
  const targetPath = resolveOpt(imageFile);
  const planPath = resolveOpt(planFile);
  const lineJsonPath = drawingFile ? path.resolve(root, linePaths(drawingFile).lines) : null;
  const paintingPng = out ? path.join(out, "painting.png") : null;
  const paintingJpg = out ? path.join(out, "painting.jpg") : null;
  const paintingPath = paintingPng && fs.existsSync(paintingPng) ? paintingPng : paintingJpg;

  return {
    subject: subject || (targetPath ? path.basename(targetPath, path.extname(targetPath)) : null),
    codeSHA: code?.commit ?? null,
    dirtyTrackedFiles: code?.tracked?.length ?? 0,
    untrackedSourceFiles: code?.untracked?.length ?? 0,
    cleanTree: Boolean(code?.git && !code?.dirty),
    exit: exitCode ?? 0,
    seconds: Math.round(seconds),
    args,
    targetSHA256: fileSha256(targetPath),
    planSHA256: fileSha256(planPath),
    linesSHA256: fileSha256(lineJsonPath),
    paintingSHA256: fileSha256(paintingPath),
    drawing: {
      order: drawingOrder,
      medium: drawingMedium,
      file: drawingFile || null,
      stage: linework ?? null,
    },
    segments: segments
      ? {
          backend: segments.backend,
          model: segments.model ?? null,
          regions: segments.regions,
          foreground: segments.foreground,
          cached: segments.cached,
        }
      : { backend: "off" },
    gpuBackend: gpu
      ? {
          backend: gpu.backend ?? null,
          adapter: gpu.adapter ?? null,
          device: gpu.device ?? null,
        }
      : null,
    // the box paints painted with, and the paint guard's decision on a forced box (null when it did not run)
    palette,
    phases,
    continuedChecks: continuedSummary(),
  };
}

export function writeRunCard(opts) {
  const card = buildRunCard(opts);
  if (opts?.out) {
    fs.writeFileSync(path.join(opts.out, "run-card.json"), JSON.stringify(card, null, 2) + "\n");
  }
  return card;
}
