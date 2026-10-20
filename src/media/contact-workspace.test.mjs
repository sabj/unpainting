import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrush, dip, candidateContact, ContactWorkspace } from './brush.mjs';
import { makePaper } from './paper.mjs';
import { createSheet } from './sheet.mjs';

test('reused observation matches independent masks, halos and continuation over changing contacts', () => {
  const workspace = new ContactWorkspace();
  for (const [w, h] of [[96, 72], [96, 72], [64, 80]]) {
    const sheet = createSheet(makePaper(w, h, { seed: 9, fibres: 0 }), [{ K: [1, .5, .2], S: [.1, .1, .1], rho: .1, omega: .2, gamma: .1 }]);
    sheet.touched = Int32Array.from({ length: sheet.n }, (_, i) => i % 13 ? -1e9 : 7);
    sheet.clock = 9;
    sheet.clip = Uint8Array.from({ length: sheet.n }, (_, i) => i % 7 ? 1 : 0);
    for (const flat of [true, false]) for (const upright of [false, true, 'sweep']) for (const neighborRadius of [0, 1, 3, 5]) for (const lift of [false, true]) {
      const brush = createBrush({ flat, radius: 12, bristles: 19, seed: 4 });
      dip(brush, { water: .7, conc: [1] });
      sheet._contactBrush = brush;
      for (const path of [
        [{ x: -4, y: 1, r: 7, p: .2 }, { x: 38, y: 12, r: 12, p: 1 }, { x: w + 2, y: 25, r: 8, p: .3 }],
        [{ x: w - 20, y: h - 10 }, { x: w - 3, y: h + 3 }],
        [], [{ x: w + 200, y: h + 200 }, { x: w + 210, y: h + 210 }],
      ]) {
        const options = { upright, neighborRadius, lift };
        const before = sheet.touched.slice();
        const expected = candidateContact(brush, sheet, path, options);
        assert.deepEqual(candidateContact(brush, sheet, path, { ...options, workspace }), expected);
        assert.deepEqual(sheet.touched, before);
      }
    }
  }
});

// Parity with the copy the speed change removed: before it, candidateContact handed every brush's scratch sheet a copy of
// sheet.contactStrength; now only a tuft's gets one. A non-tuft (row) brush plans through strokeGpu, which never reads
// contact strength, so its candidate footprint must not depend on the live strengths at all, including during a
// same-brush continuation with recent stamps. Identical results for absent, zero, full and arbitrary strengths are the
// old behaviour (any copy) and the new (no copy). The live array is never written.
test('a non-tuft candidate footprint is independent of contact strength, as with the old copy', () => {
  const w = 72, h = 60;
  const sheet = createSheet(makePaper(w, h, { seed: 5, fibres: 0 }), [{ K: [1, .5, .2], S: [.1, .1, .1], rho: .1, omega: .2, gamma: .1 }]);
  sheet.touched = Int32Array.from({ length: sheet.n }, (_, i) => i % 5 ? -1e9 : 8);
  sheet.clock = 9;
  const strengths = [undefined, new Float32Array(sheet.n), new Float32Array(sheet.n).fill(1), Float32Array.from({ length: sheet.n }, (_, i) => (i * 37 % 101) / 50)];
  for (const flat of [true, false]) for (const lift of [false, true]) for (const neighborRadius of [0, 2]) {
    const brush = createBrush({ flat, radius: 9, bristles: 15, seed: 2 });
    dip(brush, { water: .9, conc: [1] });
    assert.notEqual(brush.model, 'tuft');
    const path = [{ x: 6, y: 8, p: .6 }, { x: 40, y: 30, p: 1 }, { x: 60, y: 22, p: .4 }];
    let expected = null;
    for (const s of strengths) {
      sheet.contactStrength = s?.slice();
      sheet._contactBrush = brush; // a continuation: recent stamps are the brush's own
      const live = sheet.contactStrength?.slice();
      const got = candidateContact(brush, sheet, path, { lift, neighborRadius });
      if (expected === null) expected = got; else assert.deepEqual(got, expected, `strengths ${s ? s[3] : 'absent'}`);
      assert.deepEqual(sheet.contactStrength, live);
    }
  }
});
