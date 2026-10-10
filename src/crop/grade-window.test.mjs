// gradeSmoothPassages blurs over each passage box, not the sheet; results must equal the whole-sheet version exactly.
// Reference: git show be6a1fb:src/crop/blockin.mjs > src/crop/blockin-ref.tmp.mjs (skipped without it).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gradeSmoothPassages, passage } from "./blockin.mjs";
import { gaussian } from "../keyframes/density.mjs";
const refFile = new URL("./blockin-ref.tmp.mjs", import.meta.url);
test("graded passages equal the whole-sheet blur", { skip: !fs.existsSync(refFile) }, async () => {
  const ref = await import(refFile.href);
  const w = 181, h = 137, n = w * h, k = 3;
  let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const A = Float32Array.from({ length: n * k }, () => rnd());
  const make = () => {
    const ids = new Int32Array(n).fill(-1), layers = [];
    const rect = (id, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ids[y * w + x] = id; return { x0, y0, x1, y1, area: (x1 - x0 + 1) * (y1 - y0 + 1) }; };
    const outerBox = rect(1, 0, 0, 120, 100), b2 = rect(2, 150, 90, 180, 136);
    const ids2 = new Int32Array(n).fill(-1);
    const r2 = (id, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ids2[y * w + x] = id; return { x0, y0, x1, y1, area: (x1 - x0 + 1) * (y1 - y0 + 1) }; };
    const inner = r2(3, 10, 5, 100, 90), inner2 = r2(4, 152, 92, 180, 136), lone = r2(5, 130, 10, 140, 20);
    const mix = [0.5, 0.3, 0.2];
    const sh = (I, id, box, amt) => Object.assign(passage(I, id, box, amt, box.area, w), { mix: mix.map(v => v * amt) });
    layers.push({ pigment: 0, mix, amount: 1, shapes: [sh(ids, 1, outerBox, 1), sh(ids, 2, b2, 0.7)] });
    layers.push({ pigment: 0, mix, amount: 1, shapes: [sh(ids2, 3, inner, 0.4), sh(ids2, 4, inner2, 0.3), sh(ids2, 5, lone, 0.2)] });
    return layers;
  };
  const opts = { soft: () => true, host: () => true, blur: gaussian, contain: 0.9 };
  const a = ref.gradeSmoothPassages(make(), A, k, w, h, opts), b = gradeSmoothPassages(make(), A, k, w, h, opts);
  assert.equal(a.length, b.length);
  let graded = 0;
  for (let l = 0; l < a.length; l++) {
    assert.deepEqual(a[l].mask, b[l].mask); assert.equal(a[l].amount, b[l].amount); assert.deepEqual(a[l].mix, b[l].mix);
    for (let q = 0; q < a[l].shapes.length; q++) {
      const x = a[l].shapes[q], y = b[l].shapes[q];
      assert.equal(x.amount, y.amount); assert.equal(x.merged, y.merged);
      if (x.graded) { graded++; assert.deepEqual(x.graded, y.graded); }
    }
  }
  assert.equal(graded, 2);
});
