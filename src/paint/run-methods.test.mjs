import test from 'node:test';
import assert from 'node:assert/strict';
import { runMethods, describeMethods } from './run-methods.mjs';

test('a plate records its line source, its wash plan and no legacy route', () => {
  const m = runMethods({ lineSource: { source: 'prepared drawing', file: '/x/mini-order-lines.json' }, washPlan: '/s/a-study.png:150,/s/b.png:120:glaze' });
  assert.deepEqual(m, { lineSource: 'prepared drawing', lineFile: 'mini-order-lines.json', washPlan: 'block-in study', studies: ['a-study.png', 'b.png'], legacy: [] });
  assert.match(describeMethods(m), /line prepared drawing \(mini-order-lines.json\); washes block-in study \(a-study.png, b.png\); legacy routes: none/);
  assert.equal(runMethods({ drawingOnly: true }).washPlan, 'none (drawing only)');
  assert.equal(runMethods({ areaPlan: 'a.json' }).washPlan, 'area plan');
});
