import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareOutputDirectory } from './output-directory.mjs';

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'painter-output-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('new and pre-created empty destinations are usable', t => {
  const parent = temporary(t);
  const destination = path.join(parent, 'new', 'run');
  assert.equal(prepareOutputDirectory(destination), destination);
  assert.deepEqual(fs.readdirSync(destination), []);
  assert.equal(prepareOutputDirectory(destination), destination);
});

test('existing painting and nested frames survive a refused destination', t => {
  const destination = temporary(t);
  fs.writeFileSync(path.join(destination, 'painting.jpg'), 'saved painting');
  fs.mkdirSync(path.join(destination, 'frames'));
  fs.writeFileSync(path.join(destination, 'frames', 'f0001.png'), 'saved frame');
  assert.throws(() => prepareOutputDirectory(destination), /choose a fresh --out/);
  assert.equal(fs.readFileSync(path.join(destination, 'painting.jpg'), 'utf8'), 'saved painting');
  assert.equal(fs.readFileSync(path.join(destination, 'frames', 'f0001.png'), 'utf8'), 'saved frame');
});

test('file and symlink destinations are refused without changing their targets', t => {
  const parent = temporary(t);
  const existingFile = path.join(parent, 'existing');
  fs.writeFileSync(existingFile, 'keep');
  assert.throws(() => prepareOutputDirectory(existingFile), /real directory/);
  const target = path.join(parent, 'target');
  fs.mkdirSync(target);
  const link = path.join(parent, 'link');
  fs.symlinkSync(target, link, 'dir');
  assert.throws(() => prepareOutputDirectory(link), /real directory/);
  assert.equal(fs.readFileSync(existingFile, 'utf8'), 'keep');
  assert.deepEqual(fs.readdirSync(target), []);
});

test('actual CLI refuses reused output before reading the image or initializing paper', t => {
  const destination = temporary(t);
  const saved = path.join(destination, 'frames.json');
  fs.writeFileSync(saved, 'saved frame index');
  const cli = fileURLToPath(new URL('../../tools/paint-plate.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, '--out', destination, '--image', '/definitely-missing-painter-image.png'], {
    encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /choose a fresh --out directory/);
  assert.doesNotMatch(result.stdout, /paper:|brush:|gpu:/i);
  assert.equal(fs.readFileSync(saved, 'utf8'), 'saved frame index');
});
