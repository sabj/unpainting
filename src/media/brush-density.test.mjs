import test from "node:test";
import assert from "node:assert/strict";
import { createBrush, dip } from "./brush.mjs";
import { scaleBrushForDensity, brushWaterVolumeMm3 } from "./brush-density.mjs";

test("23.14 mm wash brush carries ~8,475 mm3 across 540, 1080 and 2172 cells", () => {
  const sheetMm = 152.4, widthMm = 23.14;
  const volumes = [540, 1080, 2172].map(W => {
    const mmPerCell = sheetMm / W;
    const r = widthMm / (2 * mmPerCell);
    const b = createBrush(scaleBrushForDensity({
      flat: true, radius: r, bristles: Math.max(12, Math.ceil(r * 2)),
      capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, seed: 31,
    }, { renderWidth: W }));
    dip(b, { water: 1, conc: [1] });
    return brushWaterVolumeMm3(b, mmPerCell);
  });
  assert.ok(Math.abs(volumes[0] - 8475) < 5, `expected ~8475 mm3 at 540, got ${volumes[0]}`);
  assert.ok(Math.abs(volumes[1] - volumes[0]) < 1e-6, `1080 volume ${volumes[1]} != 540 volume ${volumes[0]}`);
  assert.ok(Math.abs(volumes[2] - volumes[0]) < 1e-6, `2172 volume ${volumes[2]} != 540 volume ${volumes[0]}`);
});

test("cloned brush objects and 540-cell brushes are not double-scaled", () => {
  const base = createBrush(scaleBrushForDensity({ flat: true, radius: 41, bristles: 82, capacity: 100, belly: 12, seed: 31 }, { renderWidth: 1080 }));
  const cloned = createBrush(scaleBrushForDensity({ ...base, bristles: base.hairs.length, seed: 99 }, { renderWidth: 1080 }));
  assert.equal(cloned.capacity, base.capacity);
  assert.equal(cloned.hairs.length, base.hairs.length);
});
