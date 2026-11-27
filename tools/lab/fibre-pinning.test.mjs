// Exercise the shipped Paint Lab media, including an actual dry, beside the CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cli from '../../src/media/sheet.mjs';
import * as lab from '../../demos/lab/media/sheet.js';
import { makePaper as cliPaper } from '../../src/media/paper.mjs';
import { makePaper as labPaper } from '../../demos/lab/media/paper.js';
import { BOX, physicalPigment } from '../../src/crop/box.mjs';

test('Paint Lab dries a fibre-pinned burnt-sienna bloom with the same pigment as the CLI', () => {
  const n = 40, mm = 0.26, pigment = physicalPigment(BOX.find(p => p.key === 'sienna'));
  const make = (api, paper) => {
    const s = api.createSheet(paper(n, n, { seed: 2, mmPerCell: mm }), [pigment]);
    for (let y = 4; y < n - 4; y++) for (let x = 4; x < n - 4; x++) {
      const i = y * n + x;
      api.deposit(s, i, 0.01, [0]); s.D[0][i] = 0.05;
      if (Math.hypot(x - 19.5, y - 19.5) < 4) s.W[i] = 0.2;
    }
    return s;
  };
  const a = make(cli, cliPaper), b = make(lab, labPaper), initial = cli.totals(a).pig[0];
  assert.deepEqual(a.paper.throat, b.paper.throat);
  for (const [api, s] of [[cli, a], [lab, b]]) {
    for (let t = 0; t < 300; t++) api.step(s, api.DEFAULTS);
    api.dry(s, 20000, api.DEFAULTS, { dt: 14, analyticTail: true });
    assert.ok(s.M.every(v => v === 0), 'the surface dried');
    assert.ok(Math.abs(api.totals(s).pig[0] / initial - 1) < 1e-5, 'drying kept the pigment');
    assert.ok(api.layersOf(s).length > 0, 'the bloom reached a dried layer');
  }
  assert.deepEqual(cli.layersOf(a), lab.layersOf(b));
});
