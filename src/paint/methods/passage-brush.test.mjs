import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePassageBrush, passageBrushPaths, attachPlaneRamp, planeRampApplies} from './passage-brush.mjs';

test('Consult #9 Catch 3: attachPlaneRamp attaches PATH_RAMP to passageBrushPaths', () => {
  const w = 60, h = 30;
  const mask = new Uint8Array(w * h);
  for (let y = 5; y < 25; y++) for (let x = 5; x < 55; x++) mask[y * w + x] = 1;

  const brush = choosePassageBrush(mask, w, h, { mmPerCell: 0.3, phase: 'light' });
  assert.ok(brush && brush.paths.length >= 1, 'choosePassageBrush emitted paths');

  const SC = 2;
  const rawPaths = passageBrushPaths(brush, SC);
  assert.ok(rawPaths.length >= 1, 'passageBrushPaths emitted scaled paths');

  const rampMap = new WeakMap();
  const rampVec = {
    cx: 30, cy: 15,
    dx: 0, dy: 1, // vertical gradient
    minT: -10, maxT: 10,
    spanT: 20, delta: 0.25, amount: 0.5
  };

  attachPlaneRamp(rawPaths, rampVec, SC, rampMap);

  for (const ps of rawPaths) {
    const ramp = rampMap.get(ps);
    assert.ok(ramp, 'every path in rawPaths has PATH_RAMP attached');
    assert.ok(Number.isFinite(ramp.start), 'ramp.start is finite');
    assert.ok(Number.isFinite(ramp.end), 'ramp.end is finite');
    assert.ok(ramp.start >= 0.75 && ramp.start <= 1.25, `ramp.start ${ramp.start} within bounds`);
    assert.ok(ramp.end >= 0.75 && ramp.end <= 1.25, `ramp.end ${ramp.end} within bounds`);
  }
});

test('Consult #9 Catch 3: attachPlaneRamp handles reverse strokes with correct spatial endpoint values', () => {
  const rampMap = new WeakMap();
  const rampVec = {
    cx: 20, cy: 10,
    dx: 0, dy: 1, // vertical gradient: increases down
    minT: -5, maxT: 5,
    spanT: 10, delta: 0.25, amount: 0.5
  };

  // Top to bottom stroke (scaled by SC=2)
  const forward = [[{ x: 40, y: 10, r: 4 }, { x: 40, y: 30, r: 4 }]];
  // Bottom to top stroke (scaled by SC=2)
  const backward = [[{ x: 40, y: 30, r: 4 }, { x: 40, y: 10, r: 4 }]];

  attachPlaneRamp(forward, rampVec, 2, rampMap);
  attachPlaneRamp(backward, rampVec, 2, rampMap);

  const rFwd = rampMap.get(forward[0]);
  const rBwd = rampMap.get(backward[0]);

  // Forward goes from y=5 (top, u=-1) to y=15 (bottom, u=+1)
  assert.ok(Math.abs(rFwd.start - 0.75) < 1e-4, 'forward starts at 0.75');
  assert.ok(Math.abs(rFwd.end - 1.25) < 1e-4, 'forward ends at 1.25');

  // Backward starts at y=15 (bottom, u=+1) and ends at y=5 (top, u=-1)
  assert.ok(Math.abs(rBwd.start - 1.25) < 1e-4, 'backward starts at 1.25');
  assert.ok(Math.abs(rBwd.end - 0.75) < 1e-4, 'backward ends at 0.75');
});

test('a plane ramp applies to stroke plans and single sweeps, never across side-by-side lanes', () => {
  assert.equal(planeRampApplies({ strokePlan: true, pathCount: 5 }), true);
  assert.equal(planeRampApplies({ strokePlan: false, pathCount: 1 }), true);
  assert.equal(planeRampApplies({ strokePlan: false, pathCount: 5 }), false);
});
