import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleChoice, gateChoice, stageFlags, validChoice } from './drawing-choice.mjs';

const soft = { edgeShare: 0.05, penLine: 0.004, perspective: { vanishingPoints: 0, share: 0 } };
const built = { edgeShare: 0.08, penLine: 0.01, perspective: { vanishingPoints: 3, share: 0.4 } };
const flat = { edgeShare: 0.001, penLine: 0, perspective: null };

test('the rule: pencil on almost every image, ink where the image is built or drawn', () => {
  assert.deepEqual(ruleChoice(soft).choice, { graphitePrep: 'light', inkPrep: 'none', inkFinish: 'ink' });
  assert.deepEqual(ruleChoice(built).choice, { graphitePrep: 'full', inkPrep: 'ink', inkFinish: 'ink' });
  assert.deepEqual(ruleChoice({ ...soft, penLine: 0.03 }).choice.inkPrep, 'ink');
  assert.deepEqual(ruleChoice(flat).choice, { graphitePrep: 'none', inkPrep: 'none', inkFinish: 'none' });
});

test('the gate: no pencil only when model and rule agree; the rule may refuse ink; a style fixes its stages', () => {
  const r = ruleChoice(soft);
  let g = gateChoice({ graphitePrep: 'none', inkPrep: 'ink', inkFinish: 'none' }, r);
  assert.deepEqual(g.final, { graphitePrep: 'light', inkPrep: 'none', inkFinish: 'none' });
  assert.match(g.verdicts.graphitePrep.why, /pencil kept/);
  assert.match(g.verdicts.inkPrep.why, /rule refused/);
  g = gateChoice({ graphitePrep: 'none', inkPrep: 'none', inkFinish: 'none' }, ruleChoice(flat));
  assert.deepEqual(g.final, { graphitePrep: 'none', inkPrep: 'none', inkFinish: 'none' });
  g = gateChoice(null, ruleChoice(built));
  assert.deepEqual(g.final, ruleChoice(built).choice);
  g = gateChoice({ graphitePrep: 'full', inkPrep: 'none', inkFinish: 'ink' }, r, { style: 'penwash' });
  assert.deepEqual(g.final, { graphitePrep: 'full', inkPrep: 'ink', inkFinish: 'none' });
});

test('flags: each stage in its own medium and amount, in any combination', () => {
  assert.deepEqual(stageFlags({ graphitePrep: 'light', inkPrep: 'none', inkFinish: 'none' }), ['--stages', 'prep', '--prepamount', '0.3', '--preppressure', '0.45']);
  assert.deepEqual(stageFlags({ graphitePrep: 'full', inkPrep: 'ink', inkFinish: 'ink' }).slice(0, 2), ['--stages', 'prep,prepink,finishink']);
  assert.deepEqual(stageFlags({ graphitePrep: 'light', inkPrep: 'ink', inkFinish: 'none' }, { style: 'penwash' }).slice(-6), ['--prepinkfrom', 'lines', '--prepinkamount', '1', '--prepinkdeviate', '0']);
  assert.deepEqual(stageFlags({ graphitePrep: 'none', inkPrep: 'none', inkFinish: 'ink' }), ['--stages', 'finishink']);
  assert.deepEqual(stageFlags({ graphitePrep: 'none', inkPrep: 'none', inkFinish: 'none' }), ['--drawing', 'none']);
  assert.throws(() => validChoice({ graphitePrep: 'heavy', inkPrep: 'none', inkFinish: 'none' }), /graphitePrep/);
});
