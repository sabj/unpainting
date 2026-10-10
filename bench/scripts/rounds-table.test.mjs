import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { roundWinner, roundsTable } from './build-rounds-table.mjs';
import { BENCH, readJson } from './lib.mjs';
test('round winner excludes private subjects and other judge versions', () => {
  const model = (crop, indexed) => ({ name: 'Test', perCrop: { [crop]: { best: { indexed, image: 'painting.webp' } } } });
  const results = { crops: [{ key: 'sargent', distributed: true }, { key: 'private', distributed: false }], rounds: [
    { id: 'V1', judgeVersion: 'J1', models: [model('sargent', 50), model('private', 100)] },
    { id: 'V1', judgeVersion: 'J2', models: [model('sargent', 99)] },
  ] };
  assert.equal(roundWinner(results, 'V1').indexed, 50);
  assert.equal(roundWinner(results, 'V2'), undefined);
});
test('README round thumbnails regenerate from results', () => {
  const table = roundsTable(readJson(`${BENCH}/results/results.json`));
  assert.ok(fs.readFileSync(`${BENCH}/README.md`, 'utf8').includes(table));
  assert.equal((table.match(/width="96"/g) ?? []).length, 5);
});
