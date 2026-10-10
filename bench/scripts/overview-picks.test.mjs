// The overview picks: one best painting per model, public subjects only, best first, each image on disk; and the Ships row.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BENCH, RESULTS, PUBLIC_CROPS, readJson } from './lib.mjs';
import { bestPaintings, bestShips, labelLines, SHIPS_ROUNDS } from './overview-picks.mjs';

const R = readJson(path.join(RESULTS, 'results.json'));

test('one best painting per model, public subjects only, sorted by indexed score', () => {
  const picks = bestPaintings(R);
  const models = new Set(R.rounds.flatMap(r => (r.models ?? []).map(m => m.name)));
  assert.equal(picks.length, models.size);
  assert.equal(new Set(picks.map(p => p.model)).size, picks.length);
  for (const p of picks) {
    assert.ok(PUBLIC_CROPS.includes(p.crop), p.crop);
    assert.ok(fs.existsSync(path.join(BENCH, p.image)), p.image);
    assert.equal(labelLines(p).length, 2);
  }
  for (let i = 1; i < picks.length; i++) assert.ok(picks[i - 1].indexed >= picks[i].indexed);
});

test('a model\'s pick is its highest indexed painting in any round', () => {
  const synthetic = {
    crops: [{ key: 'hills', name: 'Hills', distributed: true }, { key: 'private', name: 'Private', distributed: false }],
    rounds: [
      { id: 'V1', models: [{ name: 'A', perCrop: { hills: { best: { indexed: 50, score: 4, image: 'a1.webp' } }, private: { best: { indexed: 99, score: 9, image: 'p.webp' } } } }] },
      { id: 'V2', models: [{ name: 'A', perCrop: { hills: { best: { indexed: 60, score: 5, image: 'a2.webp' } } } }, { name: 'B', perCrop: { hills: { best: { indexed: 70, score: 6, image: 'b.webp' } } } }] },
    ],
  };
  assert.deepEqual(bestPaintings(synthetic).map(p => [p.model, p.round, p.image]), [['B', 'V2', 'b.webp'], ['A', 'V2', 'a2.webp']]);
});

test('the Ships row takes each model\'s best Ships painting from V1 to V3 only', () => {
  const picks = bestShips(R);
  const models = new Set(R.rounds.filter(r => SHIPS_ROUNDS.includes(r.id)).flatMap(r => (r.models ?? []).map(m => m.name)));
  assert.equal(picks.length, models.size);
  for (const p of picks) {
    assert.equal(p.crop, 'sargent');
    assert.ok(SHIPS_ROUNDS.includes(p.round), p.round);
    assert.ok(fs.existsSync(path.join(BENCH, p.image)), p.image);
  }
  for (let i = 1; i < picks.length; i++) assert.ok(picks[i - 1].indexed >= picks[i].indexed);
});
