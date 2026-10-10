import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const root = new URL('..', import.meta.url).pathname;
const run = (plan, out) => execFileSync(process.execPath, ['tools/run-plan.mjs', plan, '--out', out], { cwd: root, stdio: 'pipe' });

test('the example plan paints a wash that is darker at the top than at the bottom', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'run-plan-'));
  run('examples/plans/graded-wash.json', out);
  const { data, info } = await sharp(path.join(out, 'result.png')).greyscale().raw().toBuffer({ resolveWithObject: true });
  const band = (y0, y1) => {
    const v = [];
    for (let y = Math.floor(y0 * info.height); y < y1 * info.height; y++)
      for (let x = Math.floor(0.3 * info.width); x < 0.7 * info.width; x++) v.push(data[y * info.width + x]);
    return v.sort((a, b) => a - b)[v.length >> 1];
  };
  assert.ok(band(0.18, 0.25) < band(0.75, 0.8) - 5, 'top band should be darker than bottom band');
  assert.ok(band(0.18, 0.25) < 240, 'paint reached the sheet');
});

test('a plan naming a pigment outside its palette is rejected', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'examples/plans/graded-wash.json'), 'utf8'));
  plan.commands[1].load.concentration = { notapigment: 0.5 };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-plan-bad-'));
  const file = path.join(dir, 'bad.json');
  fs.writeFileSync(file, JSON.stringify(plan));
  assert.throws(() => run(file, dir), /not in the palette/);
});

for (const [mmPerCell, cellsAcross] of [[0.396875, 384], [0.625, 320]]) {
  test(`a ${cellsAcross * mmPerCell} mm sheet with fractional brush stiffness keeps finite physics`, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-plan-density-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const plan = JSON.parse(fs.readFileSync(path.join(root, 'examples/plans/graded-wash.json'), 'utf8'));
    plan.grid = { w: cellsAcross, h: 160, mmPerCell };
    const file = path.join(dir, 'plan.json'), out = path.join(dir, 'painted');
    fs.writeFileSync(file, JSON.stringify(plan));
    // The executor checks water and every pigment field before converting to
    // bytes; NaNs can otherwise silently become black pixels in a PNG.
    run(file, out);
    const { data } = await sharp(path.join(out, 'result.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.ok(data.some((v, i) => v < plan.paperRGB[i % 3] - 10), 'the brush deposited visible paint');
    assert.ok(data.every(v => v > 0), 'invalid physics did not become black pixels');
  });
}
