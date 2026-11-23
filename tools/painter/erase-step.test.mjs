import test from 'node:test';
import assert from 'node:assert/strict';
import { eraseStep } from './erase-step.mjs';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet } from '../../src/media/sheet.mjs';
import { makePencil, gradePigment, layPencil } from '../../src/media/kit-graphite.mjs';

const paint = { K: [0.3, 0.3, 0.1], S: [0.02, 0.02, 0.02], rho: 0.05, omega: 1.4, gamma: 0.25 };
const setup = wait => {
  const sheet = createSheet(makePaper(80, 40, { seed: 3, scale: 1, toothScale: 0.2 }), [paint, gradePigment('HB')]);
  layPencil(sheet, makePencil({ grade: 'HB' }, 0.25), 1, [{ x: 5, y: 10, p: 1 }, { x: 75, y: 10, p: 1 }], { graphite: [1] });
  const e = { id: 'e1', widthMm: 5, wait, strokes: [{ points: [[5, 10, 1], [75, 10, 1]] }], instruction: { id: 'erase/s1/e1' } };
  const ctx = { sheet, layers: [{ value: 1, _erase: e }], GRAPHITE: true, GRAPHITE_AT: 1, frame: 0, laid: 3 };
  const lines = [], tape = [], shots = [], dried = [];
  const env = { dry: () => dried.push(1), O: {}, out: 'o', JSONL: { append: (_, l) => lines.push(JSON.parse(l)) }, shoot: async () => shots.push(ctx.STAGE), cellMm: 1, MARKTAPE: tape };
  return { sheet, ctx, env, lines, tape, shots, dried };
};

test('the paint step\'s erase: dried first, rubbed, and recorded in the commands, the tape, the sweep count and the film', async () => {
  const { ctx, env, lines, tape, shots, dried } = setup('dry');
  const got = await eraseStep(ctx, 0, env);
  assert.equal(dried.length, 1); assert.ok(got[0].graphiteShare > 0.7);
  assert.deepEqual(lines.map(l => l.kind), ['erase-base', 'erase']); assert.equal(lines[1].status, 'EXECUTED');
  assert.equal(tape.length, 1); assert.equal(tape[0].k, 'e'); assert.equal(ctx.laid, 4);
  assert.equal(shots.length, 1); assert.equal(shots[0].stage, 'erase');
});

test('an erase that does not wait is not dried for, and stops the painting on paper wet where it passes', async () => {
  const { sheet, ctx, env, dried, shots } = setup('none');
  sheet.W[10 * 80 + 40] = 0.2; sheet.M[10 * 80 + 40] = 1;
  await assert.rejects(() => eraseStep(ctx, 0, env), /erase e1, stroke 1: the sheet is wet where the eraser passes/);
  assert.equal(dried.length, 0); assert.equal(shots.length, 0);
});
