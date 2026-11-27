import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dryConservation, openFibreProof, proofArgs, PROOF_DRY } from './fibre-proof.mjs';
import { paintLandscape } from './fibre-landscape-plan.mjs';
import { paintBloom } from './fibre-bloom-plan.mjs';
import * as S from '../../src/media/sheet.mjs';
import * as B from '../../src/media/brush.mjs';
import { makePaper } from '../../src/media/paper.mjs';
import { physicalOf, physicsFields } from '../../src/media/pigment-physical.mjs';
import { BOX, physicalPigment } from '../../src/crop/box.mjs';
import { setStrict, resetChecks, continuedSummary } from '../../src/media/checks.mjs';

test('proof arguments require a bounded native grid, seed and distinct output', () => {
  assert.deepEqual(proofArgs(['.', 'out']).seed, 1);
  for (const argv of [[], ['.'], ['.', 'out', '1.1'], ['.', 'out', '1', '0'], ['.', 'out', '1', '0.001'], ['.', 'out', '1', 'Infinity'], ['.', 'out', '1', '0.26', 'cpu']]) assert.throws(() => proofArgs(argv));
});

test('a failed proof cannot reuse a successful directory and leave an old run card', async () => {
  const scratch = path.resolve(import.meta.dirname, '../../work/fibre-tests');
  fs.mkdirSync(scratch, { recursive: true });
  const out = fs.mkdtempSync(path.join(scratch, 'proof-'));
  try {
    fs.writeFileSync(path.join(out, 'run-card.json'), '{}');
    await assert.rejects(openFibreProof({ root: '.', out }), /must be empty/);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('dry accounting detects pigment loss, invented water and bad numbers; missing GPU evaporation remains unknown', () => {
  const initial = { water: 10, pig: [2, 1] }, final = { water: 1, pig: [2, 1] };
  assert.equal(dryConservation(initial, final, 9).waterError, 0);
  assert.equal(dryConservation(initial, final).waterError, null);
  for (const [end, evaporation] of [[{ ...final, pig: [1, 1] }, 9], [final, 8], [{ ...final, water: 11 }, null], [{ ...final, water: NaN }, null], [{ ...final, pig: [2, Infinity] }, null], [final, -1], [{ ...final, pig: [2] }, null]]) assert.throws(() => dryConservation(initial, end, evaporation));
});

test('the complete 40 mm landscape recipe reaches three dry bands, conserves both pigments and records its stages on the CPU reference', { timeout: 120000 }, () => {
  const mm = 1, w = 40;
  const pigments = [
    { K: [0.4625, 0.2934, 0.0496], S: [0.02, 0.02, 0.02], ...physicsFields(physicalOf('ultramarine')) },
    { K: [0.09, 0.28, 0.55], S: [0.03, 0.03, 0.03], ...physicsFields(physicalOf('sienna')) },
  ];
  const sheet = S.createSheet(makePaper(w, w, { seed: 9, mmPerCell: mm }), pigments);
  const O = { ...S.DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 }, frames = [], bands = [];
  resetChecks(); setStrict(true);
  try {
    const capture = name => frames.push(name);
    paintLandscape({ S, B, sheet, O, w, h: w, raw: fn => fn(), timed: fn => fn(), capture, dry: name => {
      const initial = S.totals(sheet), evaporation0 = sheet.evaporated ?? 0;
      const steps = S.dry(sheet, 200000, O, PROOF_DRY);
      assert.ok(steps < 200000 && sheet.M.every(v => v === 0));
      bands.push({ name, ...dryConservation(initial, S.totals(sheet), sheet.evaporated - evaporation0) });
      capture(name);
    } }, mm);
    assert.deepEqual(frames, ['sky', 'hill', 'drop', 'band-1-dried', 'band-2-dried', 'shadow', 'painting']);
    assert.equal(bands.length, 3);
    assert.ok(S.totals(sheet).pig.every(p => p > 1));
    assert.equal(continuedSummary().total, 0);
  } finally { resetChecks(); }
});

for (const seed of [1, 2, 3]) test(`native 40 mm bloom card seed ${seed}: actual shine-off, clean water only, a complete conservative dry`, { timeout: 120000 }, t => {
  const mm = 0.26, w = Math.round(50 / mm), pigment = physicalPigment(BOX.find(p => p.key === 'sienna'));
  const sheet = S.createSheet(makePaper(w, w, { seed, mmPerCell: mm, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: mm } }), [pigment]);
  const O = { ...S.DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, granFill: 0, slideCap: 1 }, snapshots = new Map();
  let conservation, drySteps;
  resetChecks(); setStrict(true);
  try {
    const capture = name => snapshots.set(name, S.totals(sheet));
    const preparation = paintBloom({ S, sheet, O, w, h: w, raw: fn => fn(), timed: fn => fn(), capture, dry: name => {
      const initial = S.totals(sheet), evaporation0 = sheet.evaporated ?? 0;
      drySteps = S.dry(sheet, 200000, O, PROOF_DRY);
      conservation = dryConservation(initial, S.totals(sheet), sheet.evaporated - evaporation0);
      capture(name);
    } }, mm);
    assert.ok(preparation.time > 0 && preparation.film <= O.film && preparation.film > O.wetEps && preparation.pores > 0.02);
    assert.ok(preparation.minFilm <= preparation.film && preparation.maxFilm >= preparation.film);
    assert.ok(preparation.wetFraction >= 0.99 && preparation.dampFraction >= 0.95, 'drop meets damp paint across its footprint');
    assert.equal(snapshots.get('clean-drop').pig[0], snapshots.get('shine-off').pig[0], 'the drop adds no pigment');
    assert.ok(snapshots.get('clean-drop').water > snapshots.get('shine-off').water + 100);
    assert.ok(drySteps < 200000 && sheet.M.every(v => v === 0));
    assert.equal(continuedSummary().total, 0);
    t.diagnostic(JSON.stringify({ seed, mm, w, preparation, drySteps, conservation }));
  } finally { resetChecks(); }
});
