import test from 'node:test';
import assert from 'node:assert/strict';
import { commandDeposits } from './stroke-composition.mjs';
import { compactEntry } from '../src/paint/stroke-ledger.mjs';

test('shared IDs distinguish repeated paths and compact ledger retains them', () => {
  const geometry=[{x:1,y:2},{x:3,y:4}];
  const commands=[1,2].map(commandId=>({commandId,status:'EXECUTED',geometry,intent:'p'+commandId}));
  const byId=commandDeposits(commands);
  for(const c of commands)assert.equal(byId.get(c.commandId)[0],c);
  assert.equal(compactEntry({k:'s',cid:2,d:[[10,20],[30,40]],points:geometry}).cid,2);
  const legacy=commandDeposits([{status:'EXECUTED',geometry}]);
  assert.equal(legacy.get('10,20;30,40').length,1);
  assert.equal(commandDeposits([{status:'EXECUTED',pathKey:'10,20;30,40'}]).size,1);
});
