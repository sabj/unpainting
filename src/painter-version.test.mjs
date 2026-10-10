import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { release, commit, versionStamp, versionLine, PAINTER_VERSION, SIM_VERSION, PAINTER_RE, SIM_RE } from './painter-version.mjs';

test('the release is the package.json semver', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(release(), pkg.version);
  assert.match(release(), /^\d+\.\d+\.\d+/);
});

test('the painter is a V number and the sim a plain number', () => {
  assert.match(PAINTER_VERSION, PAINTER_RE);
  assert.match(SIM_VERSION, SIM_RE);
});

test('a release that is not semver fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: 'latest' }));
  assert.throws(() => release(dir), /must be semver/);
});

test('outside a git checkout the commit is null', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '1.2.3' }));
  assert.equal(commit(dir), null);
  assert.deepEqual(versionStamp(dir), { release: '1.2.3', painterVersion: PAINTER_VERSION, simVersion: SIM_VERSION, commit: null });
  assert.equal(versionLine(versionStamp(dir)), `painter ${PAINTER_VERSION} · sim ${SIM_VERSION} · release 1.2.3`);
});

test('inside this checkout the commit is a sha', () => {
  const c = commit();
  if (c !== null) assert.match(c, /^[0-9a-f]{40}(-dirty)?$/);
});
