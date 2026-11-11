// The bundled area plan for the Mittens target (examples/plans/mittens-area.json) validates against its target and
// names each field the area plan offers a painter: wet sessions, hard/soft/lost edges, a charge, graded and
// variegated washes, a lift from damp paint, a softened pass and a dry brush pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateAreaDocument, rasterAreaPlan, sha256 } from './semantic-areas.mjs';

test('the Mittens area plan validates, rasters with every shared edge named, and uses every area-plan field', () => {
  const doc = JSON.parse(fs.readFileSync('examples/plans/mittens-area.json', 'utf8'));
  assert.equal(doc.target.sha256, sha256(doc.target.path));
  const plan = rasterAreaPlan(validateAreaDocument(doc, { targetSHA: doc.target.sha256, imageSHA: doc.target.sha256, sourceWidth: doc.target.width, sourceHeight: doc.target.height }), 120, 104);
  assert.equal(plan.diagnostics.unassignedCells, 0);
  const passes = doc.areas.flatMap(a => a.passes);
  assert.deepEqual(new Set(doc.edges.map(e => e.kind)), new Set(['hard', 'soft', 'lost']));
  assert.ok(passes.some(p => p.session) && passes.some(p => p.charge) && passes.some(p => p.soften) && passes.some(p => p.lights.mode === 'lift'));
  assert.deepEqual(new Set(passes.filter(p => p.wash).map(p => p.wash.kind)), new Set(['graded', 'variegated']));
  assert.ok(passes.some(p => p.move === 'dry brush'));
});
