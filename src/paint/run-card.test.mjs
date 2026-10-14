import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeRunCard } from "./run-card.mjs";
import { check, resetChecks } from "../media/checks.mjs";

test("writeRunCard records input hashes, segments, drawing stages, GPU backend and clean tree state", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "run-card-test-"));
  try {
    const img = path.join(tmp, "target.png");
    const plan = path.join(tmp, "plan.json");
    const paint = path.join(tmp, "painting.png");
    fs.writeFileSync(img, "target-bytes");
    fs.writeFileSync(plan, "{\"subject\":\"mittens\"}");
    fs.writeFileSync(paint, "painting-bytes");

    resetChecks();
    const log = console.log; console.log = () => {};
    try { check("bare-paper contact", false, { cells: 2 }); } finally { console.log = log; }
    const card = writeRunCard({
      root: tmp,
      out: tmp,
      args: ["--image", "target.png", "--valueplan", "plan.json"],
      subject: "mittens",
      imageFile: "target.png",
      planFile: "plan.json",
      drawingOrder: "first",
      drawingMedium: "ink",
      code: { commit: "abc12345", git: true, dirty: false, tracked: [], untracked: [] },
      segments: { backend: "sam", model: { backend: "sam", model: "vit_b" }, regions: 42, foreground: 18, cached: true },
      gpu: { backend: "gpu", adapter: "apple-m4", device: "Metal" },
      phases: ["load 0.2s", "paint 12.1s"],
      seconds: 12.3,
      exitCode: 0,
    });

    assert.equal(card.subject, "mittens");
    assert.equal(card.cleanTree, true);
    assert.equal(card.dirtyTrackedFiles, 0);
    assert.equal(card.segments.backend, "sam");
    assert.equal(card.segments.regions, 42);
    assert.equal(typeof card.targetSHA256, "string");
    assert.equal(typeof card.planSHA256, "string");
    assert.equal(typeof card.paintingSHA256, "string");
    assert.equal(fs.existsSync(path.join(tmp, "run-card.json")), true);
    assert.equal(card.continuedChecks.total, 1);
    assert.equal(card.continuedChecks.checks["bare-paper contact"].count, 1);
  } finally {
    resetChecks();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
