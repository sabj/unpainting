import test from "node:test";
import assert from "node:assert/strict";
import { sheetBufferFit } from "./stepfull.mjs";
const vulkan = { maxStorageBufferBindingSize: 2147483644, maxBufferSize: 1099511562240 };
test("3258-wide sheets fit Vulkan binding limits up to 9 pigments", () => {
  const n = 3258 * 4344;
  assert.equal(sheetBufferFit(n, 9, false, vulkan).over.length, 0);
  assert.deepEqual(sheetBufferFit(n, 10, false, vulkan).over.map(([k]) => k), ["OUT4"]);
  assert.equal(sheetBufferFit(2172 * 2896, 16, false, vulkan).over.length, 0);
});
