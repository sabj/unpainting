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
