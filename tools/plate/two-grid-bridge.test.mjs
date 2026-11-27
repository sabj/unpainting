import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createSheet, step, dry, applyResist, liftResist, setClip, thicknessTotals, layersOf, DEFAULTS } from '../../src/media/sheet.mjs';
import { createBrush, dip, thirsty } from '../../src/media/brush.mjs';
import { measurePaper, measurePaperDry, measureBrush } from '../../src/paint/methods/wetdry.mjs';
import { getAuxGpuDevice, destroyAuxGpuDevice } from '../../src/media/gpu/aux-device.mjs';
import { assertDeviceHealthy } from '../../src/media/gpu/device-health.mjs';
import { parseTwoGrid, twoGridGeometry, createTwoGridPapers, attachTwoGridBridge } from './two-grid-bridge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ULTRA = { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], rho: 0.047, omega: 0.5, gamma: 0.85, floc: 0.3, name: 'Ultramarine' };
const SIENNA = { K: [0.22, 0.42, 0.65], S: [0.03, 0.02, 0.01], rho: 0.04, omega: 0.7, gamma: 0.5, floc: 0.1, name: 'Burnt Sienna' };
const O = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.001, granFill: 0, slideCap: 1 };

const close = (a, b, tol = 2e-4, msg = '') => {
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b} (diff ${Math.abs(a - b)})`);
};

test('parseTwoGrid and twoGridGeometry validate ratios and preserve exact mm extent', () => {
  assert.equal(parseTwoGrid(1), 1);
  assert.equal(parseTwoGrid(2), 2);
  assert.equal(parseTwoGrid(4), 4);
  assert.equal(parseTwoGrid(8), 8);
  assert.throws(() => parseTwoGrid(3), /--twogrid/);
  assert.throws(() => parseTwoGrid(0), /--twogrid/);

  const g2 = twoGridGeometry(1086, 1448, 280 / 1086, 2);
  assert.equal(g2.cw, 543); assert.equal(g2.ch, 724);
  assert.equal(g2.FW, 1086); assert.equal(g2.FH, 1448);
  assert.equal(g2.pigmentScale, 1);
  close(g2.fineMm * 2, g2.coarseMm, 1e-12);

  const g4 = twoGridGeometry(1086, 1448, 280 / 1086, 4);
  assert.equal(g4.cw, 543); assert.equal(g4.ch, 724);
  assert.equal(g4.FW, 2172); assert.equal(g4.FH, 2896);
  assert.equal(g4.pigmentScale, 2);
  close(g4.fineMm * 4, g4.coarseMm, 1e-12);

  const gOdd = twoGridGeometry(320, 427, 280 / 320, 4);
  assert.equal(gOdd.cw, 160); assert.equal(gOdd.ch, 214);
  assert.equal(gOdd.FW, 640); assert.equal(gOdd.FH, 856);
});

for (const N of [2, 4]) {
  test(`dual-purpose CPU vs Metal GPU parity, conservation, section/tuft/row brushes, between, and resist at N=${N}`, { timeout: 60000 }, async t => {
    const aux = await getAuxGpuDevice(process.env.GPU_REQUIRED === '1' ? 'on' : 'auto');
    if (!aux) { t.skip('no WebGPU adapter'); return; }

    const W2 = 32, H2 = 24, mm = 0.26;
    const paperOpts = { seed: 9, mmPerCell: mm, coldPress: { mmPerCell: mm }, cockle: { rmsMm: 0 } };
    const papersCpu = await createTwoGridPapers({ W2, H2, sheetMmPerCell: mm, N, paperOpts, auxDevice: null });
    const papersGpu = await createTwoGridPapers({ W2, H2, sheetMmPerCell: mm, N, paperOpts, auxDevice: aux.device });

    const runOne = async (papers, gpuMode) => {
      const sheet = createSheet(papers.hostPaper, [ULTRA, SIENNA]);
      const bridge = attachTwoGridBridge({
        sheet, coarsePaper: papers.coarsePaper, finePaper: papers.finePaper,
        pigments: [ULTRA, SIENNA], opts: O, geom: papers.geom, gpuMode,
      });
      try {
        // Reserve a small highlight with masking fluid
        const resist = new Uint8Array(W2 * H2);
        for (let y = 10; y < 14; y++) for (let x = 14; x < 18; x++) resist[y * W2 + x] = 1;
        applyResist(sheet, resist);

        // Clip mask covering main painting area
        const clip = new Uint8Array(W2 * H2);
        for (let y = 2; y < H2 - 2; y++) for (let x = 2; x < W2 - 2; x++) clip[y * W2 + x] = 1;
        setClip(sheet, clip);

        // 1. Section brush with in-stroke `between` flow
        const bSect = createBrush({ model: 'section', flat: true, radius: 4, bristles: 12, capacity: 100, belly: 12, feed: 0.4, free: 0.4, film: 0.25, wetMix: 0.5, seed: 11 });
        dip(bSect, { water: 0.8, conc: [0.5, 0] });
        const beforeSect = measureBrush(bSect).pigmentMass[0];
        let betweenCalls = 0;
        sheet._twoGridStroke(bSect, [{ x: 5, y: 12, p: 0.85 }, { x: 26, y: 12, p: 0.85 }], {
          upright: 'sweep',
          between: s => { if (s % 4 === 0) { betweenCalls++; step(sheet, O); } },
        });
        assert.ok(betweenCalls > 0, 'in-stroke between callback ran');
        const afterSect = measureBrush(bSect).pigmentMass[0];
        assert.ok(afterSect < beforeSect, 'section brush depleted pigment mass');

        // Paper wetness gate while wet (must read wet without triggering pigment corruption)
        const wetRead = measurePaper(sheet, [12 * W2 + 10, 12 * W2 + 20], true, { stats: 'full' });
        assert.equal(wetRead.dry, false, 'sheet reads wet after stroke');
        assert.ok(wetRead.waterMax > 0.01 && Number.isFinite(wetRead.waterP50));

        // 2. Row brush charging second pigment into wet wash
        const bRow = createBrush({ model: 'row', flat: false, radius: 3, bristles: 10, capacity: 10, belly: 4, wetMix: 0.6, seed: 23 });
        dip(bRow, { water: 0.7, conc: [0, 0.4] });
        sheet._twoGridStroke(bRow, [{ x: 8, y: 8, p: 0.8 }, { x: 22, y: 16, p: 0.8 }], { upright: false });

        // 3. Tuft brush touch
        const bTuft = createBrush({ model: 'tuft', flat: false, radius: 2.5, bristles: 10, capacity: 10, belly: 4, wetMix: 0.4, seed: 31 });
        dip(bTuft, { water: 0.6, conc: [0.3, 0.2] });
        sheet._twoGridStroke(bTuft, [{ x: 10, y: 16, p: 0.7 }, { x: 20, y: 8, p: 0.7 }], { upright: false });

        // Fast dry (drysteps schedule with analyticTail)
        const beforeDryTotals = [bridge.engine.totals(0), bridge.engine.totals(1)];
        const steps = dry(sheet, 20000, O, { levelMax: 60, dt: 14, analyticTail: true });
        assert.ok(steps > 0, 'dry ran physical steps');
        const afterDryTotals = [bridge.engine.totals(0), bridge.engine.totals(1)];
        close(afterDryTotals[0], beforeDryTotals[0], 5e-4, `N=${N} ${gpuMode} pigment 0 dry conservation`);
        close(afterDryTotals[1], beforeDryTotals[1], 5e-4, `N=${N} ${gpuMode} pigment 1 dry conservation`);

        const dryCheck = measurePaperDry(sheet);
        assert.equal(dryCheck.dry, true, 'sheet is dry after dry()');
        assert.equal(sheet.layers.length, 1, 'dried wash fixed as 1 layer');

        // Lift masking fluid: reserved cells must be clean white (zero pigment)
        liftResist(sheet);
        const layers = layersOf(sheet);
        for (let y = 10; y < 14; y++) for (let x = 14; x < 18; x++) {
          const i = y * W2 + x;
          for (const L of layers) {
            assert.equal(L[0][i], 0, `resisted cell (${x},${y}) pigment 0 must be 0 after liftResist`);
            assert.equal(L[1][i], 0, `resisted cell (${x},${y}) pigment 1 must be 0 after liftResist`);
          }
        }

        // Thirsty brush test on a second wet layer
        setClip(sheet, null);
        dip(bSect, { water: 0.7, conc: [0.25, 0] });
        sheet._twoGridStroke(bSect, [{ x: 6, y: 18, p: 0.8 }, { x: 24, y: 18, p: 0.8 }], { upright: 'sweep' });
        const th = thirsty(createBrush({ model: 'section', flat: true, radius: 3, bristles: 10, capacity: 100, belly: 12, seed: 41 }), { water: 0.1 });
        const thBefore = measureBrush(th).waterMass;
        sheet._twoGridStroke(th, [{ x: 6, y: 18, p: 0.8 }, { x: 24, y: 18, p: 0.8 }], { upright: 'sweep' });
        assert.ok(measureBrush(th).waterMass >= thBefore, 'thirsty brush lifts from wet film');
        dry(sheet, 20000, O, { levelMax: 60, dt: 14, analyticTail: true });
        assertDeviceHealthy(sheet);

        const totals = thicknessTotals(sheet);
        const rendered = await bridge.renderFinal({ auxDevice: gpuMode === 'on' ? aux.device : null, paperRGB: [248, 246, 240], shade: 0.04 });
        const stats = bridge.stats();
        return { totals, rendered, stats, backend: bridge.GPU_INFO.backend, fallback: bridge.GPU_INFO.fallback };
      } finally {
        bridge.close();
      }
    };

    const cpu = await runOne(papersCpu, 'off');
    const gpu = await runOne(papersGpu, 'on');

    assert.equal(cpu.backend, 'cpu');
    assert.equal(gpu.backend, 'gpu');
    assert.equal(gpu.fallback, false);
    assert.equal(gpu.rendered.coarse.length, W2 * H2 * 3);
    assert.equal(gpu.rendered.fine.length, W2 * papersGpu.geom.pigmentScale * H2 * papersGpu.geom.pigmentScale * 3);

    // CPU vs GPU pigment totals parity
    close(gpu.totals[0], cpu.totals[0], 0.02, `N=${N} CPU vs GPU pigment 0 total`);
    close(gpu.totals[1], cpu.totals[1], 0.02, `N=${N} CPU vs GPU pigment 1 total`);

    // CPU vs GPU rendered RGB parity
    let maxDiff = 0, meanDiff = 0;
    for (let i = 0; i < cpu.rendered.coarse.length; i++) {
      const d = Math.abs(cpu.rendered.coarse[i] - gpu.rendered.coarse[i]);
      if (d > maxDiff) maxDiff = d;
      meanDiff += d;
    }
    meanDiff /= cpu.rendered.coarse.length;
    assert.ok(meanDiff < 2.0, `N=${N} CPU vs GPU mean RGB diff too large: ${meanDiff.toFixed(3)} (max ${maxDiff})`);
  });
}

test('paint-plate.mjs runs end-to-end with --twogrid 2 and --twogrid 4 on CPU and Metal GPU with zero target reads', { timeout: 120000 }, async t => {
  const aux = await getAuxGpuDevice(process.env.GPU_REQUIRED === '1' ? 'on' : 'auto');
  if (!aux && process.env.GPU_REQUIRED === '1') assert.fail('GPU_REQUIRED=1 but no WebGPU adapter');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twogrids-plate-test-'));
  try {
    // Synthesize a tiny 80x60 reference image + matching 2-band block-in study (zero external data needed)
    const W = 80, H = 60;
    const refBuf = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      if (y < 28) { refBuf[o] = 170; refBuf[o + 1] = 205; refBuf[o + 2] = 235; }
      else if (x > 22 && x < 58 && y < 48) { refBuf[o] = 165; refBuf[o + 1] = 95; refBuf[o + 2] = 65; }
      else { refBuf[o] = 245; refBuf[o + 1] = 242; refBuf[o + 2] = 232; }
    }
    const imgPath = path.join(tmp, 'ref.png');
    const studyPath = path.join(tmp, 'study.png');
    await sharp(refBuf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(imgPath);
    await sharp(refBuf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(studyPath);

    const modes = aux ? [['off', 2], ['on', 2], ['on', 4]] : [['off', 2], ['off', 4]];
    const runs = {};
    for (const [gpu, N] of modes) {
      const outDir = path.join(tmp, `out-${gpu}-N${N}`);
      execFileSync(process.execPath, [
        path.join(ROOT, 'tools/paint-plate.mjs'),
        '--image', imgPath,
        '--washplan', studyPath,
        '--width', String(W),
        '--sheetmm', '40',
        '--drawing', 'none',
        '--segments', 'off',
        '--video', '0',
        '--frames', '4',
        '--runcache', '0',
        '--allowdirty', '1',
        '--gpu', gpu,
        '--twogrid', String(N),
        '--out', outDir,
      ], { cwd: ROOT, stdio: 'pipe', timeout: 90000 });

      const pngPath = path.join(outDir, 'painting.png');
      const jpgPath = path.join(outDir, 'painting.jpg');
      const backend = JSON.parse(fs.readFileSync(path.join(outDir, 'backend.json'), 'utf8'));
      const guard = JSON.parse(fs.readFileSync(path.join(outDir, 'target-guard.json'), 'utf8'));
      const card = JSON.parse(fs.readFileSync(path.join(outDir, 'run-card.json'), 'utf8'));

      assert.ok(fs.existsSync(pngPath), `painting.png written for gpu=${gpu} N=${N}`);
      assert.ok(fs.existsSync(jpgPath), `painting.jpg written for gpu=${gpu} N=${N}`);
      assert.equal(guard.violations, 0, `zero paint-time target reads for gpu=${gpu} N=${N}`);
      assert.equal(backend.backend, gpu === 'on' ? 'gpu' : 'cpu');
      assert.equal(backend.fallback, false);
      assert.equal(backend.twoGrid.N, N);
      assert.equal(card.exit, 0);

      const meta = await sharp(pngPath).metadata();
      assert.equal(meta.width, W);
      assert.equal(meta.height, H);
      if (N === 4) {
        const finePath = path.join(outDir, 'painting-fine.jpg');
        assert.ok(fs.existsSync(finePath), 'N=4 writes native 2x painting-fine.jpg');
        const fmeta = await sharp(finePath).metadata();
        assert.equal(fmeta.width, W * 2);
        assert.equal(fmeta.height, H * 2);
      }
      runs[`${gpu}-N${N}`] = await sharp(pngPath).removeAlpha().raw().toBuffer();
    }

    if (runs['off-N2'] && runs['on-N2']) {
      let sum = 0;
      for (let i = 0; i < runs['off-N2'].length; i++) sum += Math.abs(runs['off-N2'][i] - runs['on-N2'][i]);
      const mean = sum / runs['off-N2'].length;
      assert.ok(mean < 3.0, `end-to-end N=2 CPU vs GPU mean RGB diff too large: ${mean.toFixed(2)}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    destroyAuxGpuDevice();
  }
});
