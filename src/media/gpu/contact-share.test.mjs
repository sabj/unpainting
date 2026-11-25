// The GPU brush kernels copy the CPU soak's contact rule (sheet.mjs soak): dry paper's sizing holds a loaded brush's
// free liquid out of the pores at the moment of contact.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULTS } from '../sheet.mjs';
import { SIZING } from '../sizing.mjs';

test('the GPU soak holds back the same share of free liquid as the CPU soak', () => {
  const src = fs.readFileSync(new URL('./stepfull.wgsl', import.meta.url), 'utf8');
  const m = src.match(/const SOAK_SIZING: f32 = ([0-9.]+);/);
  assert.ok(m, 'SOAK_SIZING is declared');
  assert.equal(+m[1], SIZING);
  assert.equal(DEFAULTS.sizing, SIZING);
  assert.equal(src.match(/into = soakInto\(max\(0\.0, pcap - S\[i\]\), give, liquid, M\[i\] == 1u\)/g)?.length, 2, 'both soak sites use it');
  assert.ok(!/select\(1\.0, 0\.3, M\[i\] == 1u\)/.test(src), 'no soak site keeps the old contact rule');
});
