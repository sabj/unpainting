import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runDoctor } from "./doctor.mjs";

test("runDoctor passes when git, line python, seg python, SAM checkpoint and disk floor are healthy", () => {
  const report = runDoctor({
    root: "/repo",
    env: { PAINTER_LINES_PYTHON: "/venv/lines/bin/python" },
    segPythonPath: "/venv/seg/bin/python",
    samCheckpointPath: "/models/sam_vit_b_01ec64.pth",
    exists: () => true,
    state: { commit: "deadbeef1234", git: true, dirty: false, tracked: [], untracked: [], diffSha256: null },
    statfs: () => ({ bavail: 25 * 1024, bsize: 1024 ** 2 }),
    run: () => ({ status: 0, stdout: JSON.stringify({ python: "3.12.0", numpy: "2.0.2", opencv: "4.11.0", "scikit-image": "0.24.0", torch: "2.6.0", segment_anything: "1.0" }) }),
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.failures, []);
});

test("runDoctor fails loudly on dirty git, fallback python or low disk", () => {
  const report = runDoctor({
    root: "/repo",
    env: {},
    exists: () => false,
    state: { commit: "deadbeef1234", git: true, dirty: true, tracked: ["tools/paint-plate.mjs"], untracked: [], diffSha256: "abc" },
    statfs: () => ({ bavail: 10 * 1024, bsize: 1024 ** 2 }),
    run: () => ({ status: 3, stdout: "{}" }),
  });
  assert.equal(report.ok, false);
  assert.equal(report.failures.length >= 4, true);
});

test("strict doctor requires the lineart packages and both nonempty weights at the cached main revision", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-models-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, "work/line-models/hf/hub/models--lllyasviel--Annotators");
  const revision = "a".repeat(40), otherRevision = "b".repeat(40);
  const snapshot = path.join(repo, "snapshots", revision);
  const options = {
    root, strictModels: true,
    env: { PAINTER_LINES_PYTHON: "/venv/lines/bin/python" },
    segPythonPath: "/venv/seg/bin/python", samCheckpointPath: "/models/sam_vit_b_01ec64.pth",
    exists: () => true,
    state: { commit: "deadbeef1234", git: true, dirty: false, tracked: [], untracked: [] },
    statfs: () => ({ bavail: 25 * 1024, bsize: 1024 ** 2 }),
    run: () => ({ status: 0, stdout: JSON.stringify({ python: "3.12.0", numpy: "2.0.2", opencv: "4.11.0", "scikit-image": "0.24.0", torch: "2.6.0", segment_anything: "1.0", model: true }) }),
  };
  const check = () => runDoctor(options);
  assert.equal(runDoctor({ ...options, strictModels: false }).ok, true, "ordinary doctor accepts prepared drawings without lineart weights");
  assert.deepEqual(check().checks.lineModels.missing, ["sk_model.pth", "sk_model2.pth"]);
  fs.mkdirSync(path.join(repo, "refs"), { recursive: true });
  fs.mkdirSync(snapshot, { recursive: true });
  fs.writeFileSync(path.join(repo, "refs/main"), revision + "\n");
  assert.equal(check().ok, false, "a cache directory and a ref alone are insufficient");
  fs.writeFileSync(path.join(snapshot, "sk_model.pth"), "fine model fixture");
  fs.writeFileSync(path.join(snapshot, "sk_model2.pth"), "");
  assert.deepEqual(check().checks.lineModels.missing, ["sk_model2.pth"], "empty downloads do not pass");
  fs.unlinkSync(path.join(snapshot, "sk_model2.pth"));
  fs.symlinkSync(path.join(repo, "missing-blob"), path.join(snapshot, "sk_model2.pth"));
  assert.equal(check().ok, false, "a broken blob link does not pass");
  fs.writeFileSync(path.join(repo, "missing-blob"), "coarse model fixture");
  assert.equal(check().ok, true, "HF snapshot links to nonempty blobs pass");
  const noPackages = runDoctor({ ...options, run: () => ({ status: 0, stdout: JSON.stringify({ numpy: "2", opencv: "4", "scikit-image": "0.24", torch: "2", segment_anything: "1", model: false }) }) });
  assert.deepEqual(noPackages.failures, ["lineart python missing torch or controlnet_aux"]);
  fs.writeFileSync(path.join(repo, "refs/main"), otherRevision);
  assert.equal(check().ok, false, "weights from another revision cannot satisfy main");
  fs.writeFileSync(path.join(repo, "refs/main"), "../" + revision);
  assert.equal(check().checks.lineModels.revision, null, "the ref must name a snapshot, not a path");
});
