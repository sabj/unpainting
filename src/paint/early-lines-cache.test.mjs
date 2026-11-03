import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {cachedEarlyLines,planFileDigest} from './early-lines-cache.mjs';

test('early line cache restores generated artifacts and flags into a new output directory',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'early-lines-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  let calls=0;const cache={enabled:true,dir:path.join(dir,'cache'),log:()=>{}};
  const track={start(){},stop(){return [];},current(){},replay(){}};
  async function run(name,input='target-a') {
    const out=path.join(dir,name),argv=['--image','target.png','--out',out];
    const prepare=async()=>{calls++;fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'lines-source-ink-lines.json'),'exact bytes\n');argv.push('--drawingfile',path.join(out,'lines-source-ink'),'--inkprofile','drawing-ink');return {source:'source-ink',files:{opening:path.join(out,'lines-source-ink')}};};
    const record=await cachedEarlyLines({cache,code:'code',track,argv,out,inputs:{input},prepare});
    assert.equal(fs.readFileSync(path.join(out,'lines-source-ink-lines.json'),'utf8'),'exact bytes\n');
    assert.equal(argv[argv.indexOf('--drawingfile')+1],path.join(out,'lines-source-ink'));
    assert.equal(record.files.opening,path.join(out,'lines-source-ink'));
  }
  await run('cold');await run('warm');assert.equal(calls,1);
  await run('changed','target-b');assert.equal(calls,2);
});


test('generated drawing fingerprints ignore relocated output labels and retain geometry changes',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'line-fingerprint-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const write=(arm,x)=>{const out=path.join(dir,arm);fs.mkdirSync(out,{recursive:true});const file=path.join(out,'drawing-lines.json');fs.writeFileSync(file,JSON.stringify({source:out+'/stage-lines.json',lines:[[x,2],[3,4]]}));return {file,out};};
  const a=write('cold',1),b=write('warm',1);
  assert.equal(planFileDigest(a.file,a.out),planFileDigest(b.file,b.out));
  assert.notEqual(planFileDigest(a.file,dir+'/elsewhere'),planFileDigest(b.file,dir+'/elsewhere'),'external inputs keep exact bytes');
  const c=write('changed',2);assert.notEqual(planFileDigest(a.file,a.out),planFileDigest(c.file,c.out));
});
