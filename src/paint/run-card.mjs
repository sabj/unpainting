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
  provenance = null,
  provenanceHistory = [],
  args = [],
  expandedArgs = null,
  subject = null,
  imageFile = null,
  planFile = null,
  drawingFile = null,
  drawingOrder = "first",
  drawingMedium = "graphite",
  subjectMedium = null,
  mediumDecision = null,
  graphitePool = null,
  code = null,
  segments = null,
  linework = null,
  gpu = null,
  dimensions = null,
  palette = null,
  phases = [],
  gouache = null,
  surface = null,
  coat = null,
  thinDarks = null,
  caption = null,
  seconds = 0,
  exitCode = 0,
} = {}) {
  const resolveOpt = p => (p ? path.resolve(root, p) : null);
  const targetPath = resolveOpt(imageFile);
  const planPath = resolveOpt(planFile);
  const rawLinePath = drawingFile ? path.resolve(root, linePaths(drawingFile).lines) : null;
  const lineJsonPath = rawLinePath && !fs.existsSync(rawLinePath) && fs.existsSync(rawLinePath + '.gz') ? rawLinePath + '.gz' : rawLinePath;
  const paintingPng = out ? path.join(out, "painting.png") : null;
  const paintingJpg = out ? path.join(out, "painting.jpg") : null;
  const paintingPath = paintingPng && fs.existsSync(paintingPng) ? paintingPng : paintingJpg;

  return {
    provenance,
    provenanceHistory,
    subject: subject || (targetPath ? path.basename(targetPath, path.extname(targetPath)) : null),
    codeSHA: code?.commit ?? null,
    dirtyTrackedFiles: code?.tracked?.length ?? 0,
    untrackedSourceFiles: code?.untracked?.length ?? 0,
    cleanTree: Boolean(code?.git && !code?.dirty),
    exit: exitCode ?? 0,
    seconds: Math.round(seconds),
    args,
    ...(expandedArgs ? { expandedArgs } : {}),
    targetSHA256: fileSha256(targetPath),
    planSHA256: fileSha256(planPath),
    linesSHA256: fileSha256(lineJsonPath),
    paintingSHA256: fileSha256(paintingPath),
    drawing: {
      order: drawingOrder,
      medium: drawingMedium,
      // --subjectmedium and, when it turned an ink drawing into graphite, what was asked for
      ...(subjectMedium ? { subjectMedium } : {}),
      // what decided ink on or off, with its evidence (src/paint/methods/medium-decision.mjs)
      ...(mediumDecision ? { mediumDecision } : {}),
      // the graphite drawing's lines, from the line model's pool (src/paint/methods/graphite-pool.mjs)
      ...(graphitePool ? { graphitePool } : {}),
      file: drawingFile || null,
      stage: linework ?? null,
    },
    segments: segments
      ? {
          backend: segments.backend,
          model: segments.model ?? null,
          device: segments.device ?? null,
          deviceChoice: segments.deviceChoice ?? null,
          regions: segments.regions,
          foreground: segments.foreground,
          cached: segments.cached,
        }
      : { backend: "off" },
    gpuBackend: gpu
      ? {
          backend: gpu.backend ?? null,
          fallback: typeof gpu.fallback === 'boolean' ? gpu.fallback : null,
          adapter: gpu.adapter ?? null,
          device: gpu.device ?? null,
        }
      : null,
    dimensions: dimensions
      ? {
          sourceWidth: dimensions.sourceWidth ?? null,
          sourceHeight: dimensions.sourceHeight ?? null,
          paintWidth: dimensions.paintWidth ?? null,
          paintHeight: dimensions.paintHeight ?? null,
          enlargement: dimensions.enlargement ?? null,
          // the sheet's cells across, the cells for each source pixel, and the most the run accepted (--sourcescale,
          // tools/plate/source-scale.mjs). paintWidth is the output's pixels, wider than the sheet with --inkres.
          sheetWidth: dimensions.sheetWidth ?? null,
          sourceScale: dimensions.sourceScale ?? null,
          sourceScaleAllowed: dimensions.sourceScaleAllowed ?? null,
        }
      : null,
    // the box paints painted with, and the paint guard's decision on a forced box (null when it did not run)
    palette,
    phases,
    // the final lights: the rule, what the planning data gave, and what was laid (tools/plate/gouache-plan.mjs)
    gouache,
    // surface marks: the judge, every region's label and what was laid (tools/plate/surface-plan.mjs)
    surface,
    // a coat's dry-brush texture: strokes planned and laid, and what they did to the sheet (tools/plate/coat-lay.mjs)
    coat,
    // thin dark lines laid over the dry washes, in paint with the rigger's point or in pencil: how many of each, why, and planned against painted step
    thinDarks,
    // what this output is, so its image can be labelled on the image: subject, code, mode, sizes, sheet and date
    caption,
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
