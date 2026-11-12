import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkDesignedPaths, reportDesignedPaths } from './designed-paths-check.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'designed-paths-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (file, value) => fs.writeFileSync(path.join(dir, file), JSON.stringify(value));
  write('run-card.json', { args: ['--subjectmedium', 'pencil'], expandedArgs: ['--subjectmedium', 'pencil', '--washjoin', '1', '--huechroma', '30', '--lightfamilies', '1'], drawing: { medium: 'graphite' } });
  write('pipeline-plan.json', { plan: { washes: { colour: 'family' } } });
  fs.writeFileSync(path.join(dir, 'paint.log'), 'subject medium pencil: graphite drawing\nsmall marks: 0 small lights reserved, 12 small darks laid once, last\n');
  return { dir, write };
}
test('finished run reports all 23 rows with evidence and explicit remaining paths', t => {
  const { dir } = fixture(t), r = reportDesignedPaths(dir);
  assert.equal(r.ok, true); assert.equal(r.rows.length, 23);
  assert.match(r.text, /4\. small-marks-wash-join: RAN.*paint.log:2/);
  assert.match(r.text, /2\. sam-regions-as-shapes: DID NOT RUN.*not yet on/);
});
test('missing card, required log or expansion fails closed', t => {
  const { dir, write } = fixture(t);
  fs.writeFileSync(path.join(dir, 'paint.log'), 'subject medium pencil: graphite drawing\n');
  assert.equal(checkDesignedPaths(dir).ok, false);
  write('run-card.json', { args: ['--smallmarks', '1', '--washjoin', '1'] });
  assert.equal(checkDesignedPaths(dir).ok, false);
  fs.unlinkSync(path.join(dir, 'run-card.json'));
  assert.equal(checkDesignedPaths(dir).ok, false);
});
test('requested lanes need actual executed strokes, not merely a flag', t => {
  const { dir, write } = fixture(t);
  write('run-card.json', { args: ['--strokeplan', '1'], expandedArgs: ['--strokeplan', '1', '--washjoin', '1', '--huechroma', '30', '--lightfamilies', '1'] });
  assert.equal(checkDesignedPaths(dir).ok, false);
  write('designed-execution.json', { laneStrokes: 27, brushChoiceStrokes: 0 });
  assert.equal(checkDesignedPaths(dir).ok, true);
});
test('ink on a pencil subject fails the medium contract', t => {
  const { dir, write } = fixture(t);
  write('run-card.json', { args: ['--subjectmedium', 'pencil'], drawing: { medium: 'ink' } });
  assert.equal(checkDesignedPaths(dir).rows.find(r => r.row === 3).status, 'DID NOT RUN');
});
