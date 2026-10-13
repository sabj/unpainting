import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestAspect, sketchPaths, SKETCH_PROMPTS, SKETCH_PROMPT_VERSION } from './sketch-target.mjs';

test('the image model is asked for the aspect ratio nearest the target', () => {
  assert.equal(nearestAspect(1536, 1024), '3:2');
  assert.equal(nearestAspect(817, 1024), '2:3');
  assert.equal(nearestAspect(300, 259), '1:1');
});

test('sketches are cached by the target bytes, not its name', () => {
  const a = sketchPaths('/c', Buffer.from('target')), b = sketchPaths('/c', Buffer.from('target'));
  assert.equal(a.png, b.png);
  assert.match(a.png, /^\/c\/[0-9a-f]{64}\.png$/);
  assert.notEqual(sketchPaths('/c', Buffer.from('other')).png, a.png);
});

test('one fixed prompt, with no subject in it', () => {
  const p = SKETCH_PROMPTS[SKETCH_PROMPT_VERSION];
  assert.ok(p.length > 200);
  for (const word of ['Flatiron', 'Yale', 'ship', 'cat', 'beach']) assert.ok(!p.includes(word), word);
});
