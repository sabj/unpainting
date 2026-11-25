import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingPolicy, LIGHT_FILM_FRAMES } from './recording.mjs';

test('medium is the default: native frames ride on the film frames, the film as asked', () => {
  const p = recordingPolicy();
  assert.equal(p.level, 'medium');
  assert.equal(p.everyOperation, false);
  assert.equal(p.onFilm, true);
  assert.equal(p.filmFrames(240), 240);
});

test('full records after every operation, light caps the film and records only the ends', () => {
  const full = recordingPolicy('full'), light = recordingPolicy('Light');
  assert.equal(full.everyOperation, true); assert.equal(full.onFilm, false); assert.equal(full.filmFrames(240), 240);
  assert.equal(light.everyOperation, false); assert.equal(light.onFilm, false);
  assert.equal(light.filmFrames(240), LIGHT_FILM_FRAMES); assert.equal(light.filmFrames(8), 8);
});

test('an unknown level stops the run', () => {
  assert.throws(() => recordingPolicy('every'), /--recording takes full, medium, light/);
});
