import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backendWork, cellsOf, autoWaterSteps, guardStopOf, WATER_GUARD_TIMES } from './paint-work.mjs';
import { waterStepsMost, checkWaterSteps, waterGuardLine, WATER_GUARD_EXIT } from '../../src/media/gpu/water-guard.mjs';
import { readTranscript } from './session.mjs';

test('the work of a painting is read from its backend record: water steps, dryings, cell-steps', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'paint-work-')), plate = path.join(d, 'unit-look', 'plate'); fs.mkdirSync(plate, { recursive: true });
  assert.equal(backendWork(plate), null, 'no record (a look stopped at a stage writes none)');
  fs.writeFileSync(path.join(plate, 'backend.json'), JSON.stringify({ gpuStats: { steps: 4442, drys: 157, drySolverIterations: 3125 } }));
  assert.deepEqual(cellsOf(543, { widthMm: 280, heightMm: 210 }), [543, 407]);
  assert.deepEqual(backendWork(plate, [543, 407]), { waterSteps: 4442, dryings: 157, drySolverIterations: 3125, cellSteps: 4442 * 543 * 407, cellStepsFrom: 'water steps x 543 x 407 cells' });
  assert.equal(autoWaterSteps(d, { waterSteps: 900 }), 900, 'the prepared record first'); assert.equal(autoWaterSteps(d, {}), 4442, 'else the unit look\'s record');
  assert.throws(() => autoWaterSteps(path.join(d, 'none'), {}), /no water-step count .* prepare the subject again/);
  assert.equal(WATER_GUARD_TIMES, 10);
});

test('the water-step guard: no ceiling unless set; past it the painting stops with a plain line and exit 5, and the harness reads the stop back', () => {
  assert.equal(waterStepsMost({}), Infinity); assert.equal(waterStepsMost({ PAINTER_WATER_STEPS_MOST: '44420' }), 44420);
  assert.throws(() => waterStepsMost({ PAINTER_WATER_STEPS_MOST: 'lots' }), /a whole number of water steps/);
  const exits = [], err = console.error; console.error = () => {};
  try { assert.equal(checkWaterSteps(44420, 44420, c => exits.push(c)), false); assert.equal(checkWaterSteps(44421, 44420, c => exits.push(c)), true); } finally { console.error = err; }
  assert.deepEqual(exits, [WATER_GUARD_EXIT]); assert.equal(WATER_GUARD_EXIT, 5);
  const line = waterGuardLine(44421, 44420);
  assert.match(line, /stopped as resource management, recorded as a stop and never scored/);
  assert.equal(guardStopOf(`painter...\n${line}\n`), line); assert.equal(guardStopOf('Error: something else'), null);
});

test('the model\'s tokens are split into fresh input, cached input and output, as each command reports them', () => {
  const agy = [{ event: 'step_update', step_update: { step_type: 'agent_response', step_index: 1, usage: { input_tokens: 100, output_tokens: 10, thinking_tokens: 4, cache_read_tokens: 0, total_tokens: 110 } } }, { event: 'step_update', step_update: { step_type: 'agent_response', step_index: 2, usage: { input_tokens: 50, output_tokens: 5, thinking_tokens: 1, cache_read_tokens: 110, total_tokens: 55 } } }].map(x => JSON.stringify(x)).join('\n');
  const a = readTranscript('agy', agy);
  assert.equal(a.tokens, 165); assert.deepEqual((({ reported, freshIn, cachedIn, out, thinking }) => ({ reported, freshIn, cachedIn, out, thinking }))(a.tokenSplit), { reported: true, freshIn: 150, cachedIn: 110, out: 15, thinking: 5 });
  const c = readTranscript('claude', JSON.stringify({ type: 'result', result: 'done', usage: { input_tokens: 20, cache_creation_input_tokens: 300, cache_read_input_tokens: 5000, output_tokens: 70 } }));
  assert.deepEqual((({ freshIn, cacheWriteIn, cachedIn, out }) => ({ freshIn, cacheWriteIn, cachedIn, out }))(c.tokenSplit), { freshIn: 320, cacheWriteIn: 300, cachedIn: 5000, out: 70 });
  const x = readTranscript('codex', JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1000, cached_input_tokens: 600, output_tokens: 40 } }));
  assert.deepEqual((({ freshIn, cachedIn, out }) => ({ freshIn, cachedIn, out }))(x.tokenSplit), { freshIn: 400, cachedIn: 600, out: 40 });
  assert.deepEqual(readTranscript('agy', '').tokenSplit, { reported: false, note: 'the agy transcript reported no token split (fresh input, cached input, output)' });
});
