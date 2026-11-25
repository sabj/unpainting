import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { BENCH, readJson, writeJson, loadRuns } from "./lib.mjs";
import { benchmarkProfile } from "./profiles.mjs";
import { scorePython } from "./preflight.mjs";

async function makeTryFolder(root, cropPatch = {}) {
  const source = structuredClone(loadRuns().find(e => e.run.round === "V4" && e.run.crops.hills).run);
  const crop = source.crops.hills;
  Object.assign(source, {
    judgeVersion: "J2", judgeProfile: "J2-lite", judgeRoute: "together", complete: true,
    crops: { hills: { ...crop, score: null, progression: null, fullsize: null, ...cropPatch } }, unpainted: {},
    settings: { ...source.settings, crops: ["hills"], benchmarkProfile: "lite-v2", budget: benchmarkProfile("lite"), judgeProfile: "J2-lite", judgeRoute: "together" }
  });
  const dir = path.join(root, "try"), raw = path.join(root, "raw"), frames = path.join(raw, "out", "hills", "frames");
  fs.mkdirSync(frames, { recursive: true });
  fs.copyFileSync(path.join(BENCH, "v2", "targets", "hills.png"), path.join(raw, "out", "hills", "final.png"));
  for (const p of [10, 25, 50, 75, 100]) {
    await sharp(path.join(BENCH, "v2", "targets", "hills.png")).png().toFile(path.join(frames, `stage-${p}.png`));
  }
  writeJson(path.join(dir, "run.json"), source);
  return { dir, raw };
}

function makeMockPython(root) {
  const python = path.join(root, "python");
  fs.writeFileSync(python, `#!${process.execPath}
const fs = require("fs"), path = require("path");
const a = process.argv.slice(2), s = path.basename(a[0]);
if (s === "-c") process.exit(0);
if (process.env.TEST_LOG) fs.appendFileSync(process.env.TEST_LOG, s + "\\n");

if (s === "score_painting.py") {
  const j = ["moonshotai/Kimi-K3", "zai-org/GLM-5.3-Flash", "Qwen/Qwen3.5-9B"];
  console.log(JSON.stringify({
    complete: true, composite: 7.5, judgeVersion: "J2", judgeProfile: "J2-lite", judgeRoute: "together",
    judgeScores: Object.fromEntries(j.map(m => [m, 7.5])), callCounts: Object.fromEntries(j.map(m => [m, 1])),
    callsPerModel: 1, sampling: { judges: j, requiredValidCallsPerJudge: 1, requestedCallsPerJudge: 1 }
  }));
} else if (s === "progression.py") {
  const j = process.env.BENCH_PROG_JUDGES || "zai-org/GLM-5.3-Flash";
  console.log(JSON.stringify({
    judgesN: 1, judges: [j], stages: { 10: 4, 25: 4, 50: 4, 75: 4, 100: 4 },
    earlyMean: 4, mean: 4, humanOrderVotes: 1, judgeNotes: { [j]: "fixture" }
  }));
} else if (s === "copy_band.py") {
  console.log(JSON.stringify({ copyHF: 0.05 }));
} else if (s === "fullsize.py") {
  if (process.env.TEST_FULLSIZE_FAIL === "1") {
    process.stderr.write("Simulated fullsize failure\\n");
    process.exit(1);
  }
  const plateMmIdx = a.indexOf("--plate-mm");
  const plateMm = plateMmIdx >= 0 ? parseFloat(a[plateMmIdx + 1]) : 200.0;
  console.log(JSON.stringify({
    version: "fullsize-v1",
    plateMm,
    style: "loose ink and wash",
    complete: false,
    measures: {
      edges: { hard_share: 0.72, firm_share: 0.25, soft_share: 0.03 },
      fills: { flat_share: 0.12, posterisation: 0.08 },
      flecks: { white_per_cm2: 0.5 }
    }
  }));
} else {
  console.log(JSON.stringify({}));
}
`);
  fs.chmodSync(python, 0o755);
  return python;
}

test("score.mjs attaches crop.fullsize non-blockingly", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "score-fullsize-test-"));
  try {
    const { dir, raw } = await makeTryFolder(root);
    const python = makeMockPython(root);
    const log = path.join(root, "calls.log");

    const r = spawnSync(process.execPath, [
      path.join(BENCH, "scripts", "score.mjs"), dir, "--raw", raw, "--python", python, "--no-fullsize-vision"
    ], { encoding: "utf8", env: { ...process.env, TOGETHER_API_KEY: "mock-key", TEST_LOG: log } });

    assert.equal(r.status, 0, r.stderr);
    const saved = readJson(path.join(dir, "run.json"));
    assert.equal(saved.score.complete, true);
    assert.equal(saved.crops.hills.score.composite, 7.5);
    assert.ok(saved.crops.hills.fullsize, "crop.fullsize must be attached");
    assert.equal(saved.crops.hills.fullsize.version, "fullsize-v1");
    assert.equal(saved.crops.hills.fullsize.measures.edges.hard_share, 0.72);
    // the published try was painted 1224 px wide at 0.1291 mm a cell: its own sheet, not today's Hills subject (79.254 mm)
    assert.equal(saved.crops.hills.fullsize.plateMm, 158.02, "plate-mm is the sheet the try records");

    const calls = fs.readFileSync(log, "utf8");
    assert.ok(calls.includes("fullsize.py"), "fullsize.py must be called");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("score.mjs reads the sheet from subjects.json for a try that records none", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "score-fullsize-subject-"));
  try {
    const { dir, raw } = await makeTryFolder(root, { sheet: null });
    const r = spawnSync(process.execPath, [
      path.join(BENCH, "scripts", "score.mjs"), dir, "--raw", raw, "--python", makeMockPython(root), "--no-fullsize-vision"
    ], { encoding: "utf8", env: { ...process.env, TOGETHER_API_KEY: "mock-key" } });
    assert.equal(r.status, 0, r.stderr);
    const subject = readJson(path.join(BENCH, "v4v5", "subjects.json")).subjects.hills;
    assert.equal(readJson(path.join(dir, "run.json")).crops.hills.fullsize.plateMm, subject.sheetmm);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("score.mjs handles fullsize.py failure non-blockingly without failing the run", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "score-fullsize-fail-"));
  try {
    const { dir, raw } = await makeTryFolder(root);
    const python = makeMockPython(root);

    const r = spawnSync(process.execPath, [
      path.join(BENCH, "scripts", "score.mjs"), dir, "--raw", raw, "--python", python, "--no-fullsize-vision"
    ], { encoding: "utf8", env: { ...process.env, TOGETHER_API_KEY: "mock-key", TEST_FULLSIZE_FAIL: "1" } });

    assert.equal(r.status, 0, "run must not exit with error when fullsize.py fails: " + r.stderr);
    const saved = readJson(path.join(dir, "run.json"));
    assert.equal(saved.score.complete, true, "composite score must still be complete");
    assert.equal(saved.crops.hills.score.composite, 7.5);
    assert.ok(saved.crops.hills.fullsize, "crop.fullsize error record must be attached");
    assert.equal(saved.crops.hills.fullsize.complete, false);
    assert.ok(saved.crops.hills.fullsize.error, "error message must be preserved");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("score.mjs --no-fullsize flag skips fullsize evaluation", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "score-fullsize-skip-"));
  try {
    const { dir, raw } = await makeTryFolder(root);
    const python = makeMockPython(root);
    const log = path.join(root, "calls.log");

    const r = spawnSync(process.execPath, [
      path.join(BENCH, "scripts", "score.mjs"), dir, "--raw", raw, "--python", python, "--no-fullsize"
    ], { encoding: "utf8", env: { ...process.env, TOGETHER_API_KEY: "mock-key", TEST_LOG: log } });

    assert.equal(r.status, 0, r.stderr);
    const saved = readJson(path.join(dir, "run.json"));
    assert.equal(saved.score.complete, true);
    assert.equal(saved.crops.hills.fullsize, null);
    const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
    assert.ok(!calls.includes("fullsize.py"), "fullsize.py must not be called when --no-fullsize is passed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("score.mjs invokes real fullsize.py and attaches genuine craft measures", async t => {
  // The scorer's own interpreter: --python, else BENCH_SCORE_PYTHON, else python3 (preflight.mjs). Without the scorer's
  // packages the real measures cannot run here, and the test is reported as skipped, not passed.
  const realPy = scorePython(null);
  const probe = spawnSync(realPy, ["-c", "import numpy, scipy, skimage, PIL"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) return t.skip(`${realPy} lacks the packages in bench/scorer/requirements.txt; set BENCH_SCORE_PYTHON to an interpreter that has them`);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "score-fullsize-real-"));
  try {
    const { dir, raw } = await makeTryFolder(root);
    const python = path.join(root, "python");
    // Wrapper dispatch: forward fullsize.py, copy_band.py to real python, mock vision judges
    fs.writeFileSync(python, `#!${process.execPath}
const { execFileSync } = require("child_process"), path = require("path");
const a = process.argv.slice(2), s = path.basename(a[0]);
const realPy = ${JSON.stringify(realPy)};
if (s === "-c") {
  execFileSync(realPy, ["-c", a[1]], { stdio: "inherit" });
  process.exit(0);
}
if (s === "score_painting.py") {
  const j = ["moonshotai/Kimi-K3", "zai-org/GLM-5.3-Flash", "Qwen/Qwen3.5-9B"];
  console.log(JSON.stringify({
    complete: true, composite: 8.0, judgeVersion: "J2", judgeProfile: "J2-lite", judgeRoute: "together",
    judgeScores: Object.fromEntries(j.map(m => [m, 8.0])), callCounts: Object.fromEntries(j.map(m => [m, 1])),
    callsPerModel: 1, sampling: { judges: j, requiredValidCallsPerJudge: 1, requestedCallsPerJudge: 1 }
  }));
} else if (s === "progression.py") {
  const j = process.env.BENCH_PROG_JUDGES || "zai-org/GLM-5.3-Flash";
  console.log(JSON.stringify({
    judgesN: 1, judges: [j], stages: { 10: 4, 25: 4, 50: 4, 75: 4, 100: 4 },
    earlyMean: 4, mean: 4, humanOrderVotes: 1, judgeNotes: { [j]: "fixture" }
  }));
} else if (s === "copy_band.py" || s === "fullsize.py") {
  const out = execFileSync(realPy, a, { encoding: "utf8" });
  process.stdout.write(out);
} else {
  console.log(JSON.stringify({}));
}
`);
    fs.chmodSync(python, 0o755);

    const r = spawnSync(process.execPath, [
      path.join(BENCH, "scripts", "score.mjs"), dir, "--raw", raw, "--python", python, "--no-fullsize-vision"
    ], { encoding: "utf8", env: { ...process.env, TOGETHER_API_KEY: "mock-key" } });

    assert.equal(r.status, 0, r.stderr);
    const saved = readJson(path.join(dir, "run.json"));
    assert.equal(saved.score.complete, true);
    assert.ok(saved.crops.hills.fullsize, "crop.fullsize must be attached");
    assert.equal(saved.crops.hills.fullsize.version, "fullsize-v1");
    assert.ok(saved.crops.hills.fullsize.measures, "measures must be computed");
    assert.ok(typeof saved.crops.hills.fullsize.measures.edges.hard_share === "number");
    assert.ok(typeof saved.crops.hills.fullsize.measures.edges.soft_share === "number");
    assert.ok(typeof saved.crops.hills.fullsize.measures.fills.flat_share === "number");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
