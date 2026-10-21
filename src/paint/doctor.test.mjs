import test from "node:test";
import assert from "node:assert/strict";
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
