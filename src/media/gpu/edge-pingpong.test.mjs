import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { edgePingPong } from './edge-pingpong.mjs';

test('edgePingPong transforms actual stepfull.wgsl source without error', () => {
  const wgsl = fs.readFileSync(new URL('./stepfull.wgsl', import.meta.url), 'utf8');
  const transformed = edgePingPong(wgsl);
  assert.ok(transformed.length > 0);
  assert.ok(transformed.includes('eCur') && transformed.includes('eNxt'));
});

test('edgePingPong supports both var near and let near markers', () => {
  const mockVar = `  // edgeWidth + 1 passes of edgeNew\n  var near = 0.0;\n`;
  const transformedVar = edgePingPong(mockVar);
  assert.ok(transformedVar.includes('var near = 0.0;'));

  const mockLet = `  // edgeWidth + 1 passes of edgeNew\n  let near = 0.0;\n`;
  const transformedLet = edgePingPong(mockLet);
  assert.ok(transformedLet.includes('let near = 0.0;'));
});

test('edgePingPong throws on unrecognized edge kernel layout', () => {
  assert.throws(() => edgePingPong('invalid source layout'), /edge kernel layout not recognized/);
});
