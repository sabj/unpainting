import test from 'node:test';
import assert from 'node:assert/strict';
import { EpochCells } from './epoch-cells.mjs';

test('independent contact lifetimes and checkpoint-compatible membership', () => {
  const own = new EpochCells(8), pigment = new EpochCells(8);
  for (const i of [7, 2, 7, 40]) { own.add(i); pigment.add(i); }
  assert.deepEqual([...own], [7, 2, 40]);
  pigment.clear(); assert.equal(own.has(7), true); assert.equal(pigment.has(7), false);
  const saved = new Set(own), restored = new EpochCells(64, saved);
  assert.deepEqual([...restored], [...own]);
  own.clear(); assert.equal(restored.has(2), true); assert.equal(own.has(2), false);
  own.epoch = 0xffffffff; own.add(3); own.clear();
  assert.equal(own.has(3), false); own.add(3); assert.deepEqual([...own], [3]);
});

test('aware state round-trips the historical Set representation', async () => {
  const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
  const {writeState,readState}=await import('../../tools/aware/state-io.mjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'epoch-aware-'));
  try {
    const own=new EpochCells(40,[7,2,39]),pigment=new EpochCells(40,[3,7]);
    writeState(dir,{VALUE_OWN_CONTACT:new Set(own),VALUE_PIGMENT_CONTACT:new Set(pigment)});
    const state=readState(dir);
    const a=new EpochCells(40,state.VALUE_OWN_CONTACT),b=new EpochCells(40,state.VALUE_PIGMENT_CONTACT);
    assert.deepEqual([...a],[7,2,39]);assert.deepEqual([...b],[3,7]);
    b.clear();assert.equal(a.has(7),true);assert.equal(b.has(7),false);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
