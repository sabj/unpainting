import test from "node:test";
import assert from "node:assert/strict";
import { choosePassageBrush } from "./passage-brush.mjs";

test("choosePassageBrush splits lanes cleanly across an obstacle without diagonal bridging", () => {
  const w = 60, h = 30, mask = new Uint8Array(w * h).fill(1);
  // Carve an obstacle hole (like a leg cutting vertically across the middle of the passage)
  for (let y = 0; y < 22; y++) for (let x = 24; x < 36; x++) mask[y * w + x] = 0;
  const b = choosePassageBrush(mask, w, h, { mmPerCell: 0.5 });
  assert.ok(b && b.paths.length >= 2);
  // Every path must stay parallel to the horizontal principal axis and never jump across the hole
  for (const p of b.paths) {
    for (let i = 1; i < p.length; i++) {
      const step = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      assert.ok(step <= 1.6 * b.sizeMm / (2 * 0.5), `unexpected jump ${step}`);
    }
  }
});
