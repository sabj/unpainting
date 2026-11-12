import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkDesignedPaths, reportDesignedPaths } from './designed-paths-check.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'designed-paths-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (file, value) => fs.writeFileSync(path.join(dir, file), JSON.stringify(file === 'run-card.json' ? { continuedChecks: { strict: true, total: 0, checks: {} }, ...value } : value));
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

test('an aborted run still writes all 23 results and fails its contract', t => {
  const { dir } = fixture(t);
  const aborted = path.join(dir, 'aborted');
  const report = reportDesignedPaths(aborted);
  assert.equal(report.ok, false);
  assert.equal(report.rows.length, 23);
  assert.ok(report.rows.every(r => r.status === 'DID NOT RUN'));
  assert.match(fs.readFileSync(path.join(aborted, 'designed-paths-check.txt'), 'utf8'), /run-card.json missing or invalid/);
});

test('dropping subjectmedium on a known paint or pencil subject cannot evade the required check', t => {
  const { dir, write } = fixture(t);
  write('run-card.json', { subject: 'MITTENS', args: ['--outlinemedium', 'ink'], expandedArgs: ['--washjoin','1','--huechroma','30','--lightfamilies','1'], drawing: { medium: 'ink' } });
  const report = checkDesignedPaths(dir), medium = report.rows.find(r => r.row === 3);
  assert.equal(medium.applicable, true);
  assert.equal(medium.status, 'DID NOT RUN');
  assert.equal(report.ok, false);
});

test('the registry medium scopes agree with the benchmark source declarations', () => {
  const registry = JSON.parse(fs.readFileSync(new URL('../bench/designed-paths.json', import.meta.url)));
  const subjects = JSON.parse(fs.readFileSync(new URL('../bench/v4v5/subjects.json', import.meta.url))).subjects;
  assert.deepEqual(registry.subjectMedia, Object.fromEntries(Object.entries(subjects).map(([id, spec]) => [id, spec.medium])));
});

test('required paper-state proof rejects diagnostic continuation, missing and malformed summaries', t => {
  const { dir } = fixture(t);
  const card = JSON.parse(fs.readFileSync(path.join(dir, 'run-card.json')));
  const get = () => checkDesignedPaths(dir).rows.find(r => r.row === 14);
  assert.equal(get().required, true);
  assert.equal(get().applicable, true);
  assert.equal(get().status, 'RAN');
  for (const summary of [undefined, null, {strict:false,total:0}, {strict:true,total:1}, {strict:'true',total:0}, {strict:true,total:'0'}, {strict:true,total:-1}]) {
    fs.writeFileSync(path.join(dir, 'run-card.json'), JSON.stringify({...card,continuedChecks:summary}));
    assert.equal(get().status, 'DID NOT RUN', JSON.stringify(summary));
    assert.equal(checkDesignedPaths(dir).ok, false);
  }
  fs.writeFileSync(path.join(dir, 'run-card.json'), JSON.stringify({...card,args:['--areaplan','area.json']}));
  assert.equal(get().applicable, true);
  assert.equal(get().status, 'RAN');
});

test('malformed paper-check switches fail before painting, including the legacy alias beside strict mode', t => {
  const { dir } = fixture(t);
  for (const flags of [['--strict','banana'], ['--strict','2'], ['--strict'], ['--strict','1','--wetgate','bad']]) {
    const out = path.join(dir, 'invalid-' + flags.join('_'));
    const result = spawnSync(process.execPath, ['tools/paint-plate.mjs','--out',out,...flags], {encoding:'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--(?:strict|wetgate) expects 0 or 1/);
    assert.equal(fs.existsSync(path.join(out,'painting.png')), false);
  }
});
