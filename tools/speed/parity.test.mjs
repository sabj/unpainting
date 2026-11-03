import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const tool=new URL('./parity.mjs',import.meta.url).pathname;
test('frozen parity gate refuses changed inputs, pixels, adapters and baseline overwrite',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'frozen-parity-'));
 try {
  fs.mkdirSync(path.join(root,'tools'));fs.writeFileSync(path.join(root,'input'),'fixed');
  const script="import fs from 'node:fs';import path from 'node:path';const a=process.argv.slice(2),get=k=>a[a.lastIndexOf('--'+k)+1],out=get('out');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'painting.png'),process.env.PARITY_TEST_PIXEL??'fixed bytes');fs.writeFileSync(path.join(out,'backend.json'),JSON.stringify({backend:get('gpu')==='off'?'cpu':'gpu',adapterEvidence:{adapterInfo:{device:process.env.PARITY_TEST_ADAPTER??'fixed'}}}));if(process.env.PARITY_TEST_UNUSED){fs.writeFileSync(path.join(out,'unused-options.txt'),process.env.PARITY_TEST_UNUSED+'\\n');process.exitCode=3;}";
  fs.writeFileSync(path.join(root,'tools/paint-plate.mjs'),script);
  const manifest=path.join(root,'manifest.json'),baseline=path.join(root,'baseline.json');
  fs.writeFileSync(manifest,JSON.stringify({referenceCommit:'frozen',inputs:{input:createHash('sha256').update('fixed').digest('hex')},fixtures:[{id:'test',mode:'fast',args:[]}]}));
  let i=0;const run=(action,env={})=>spawnSync(process.execPath,[tool,action,root,path.join(root,'run'+i++),baseline,manifest],{encoding:'utf8',env:{...process.env,...env}});
  assert.equal(run('freeze').status,0);
  const original=fs.readFileSync(baseline,'utf8');
  assert.equal(run('check').status,0);
  assert.notEqual(run('freeze').status,0);
  assert.notEqual(run('check',{PARITY_TEST_PIXEL:'changed'}).status,0);
  assert.notEqual(run('check',{PARITY_TEST_ADAPTER:'changed'}).status,0);
  assert.notEqual(run('check',{PARITY_TEST_UNUSED:'--unexpected'}).status,0);
  fs.writeFileSync(path.join(root,'input'),'changed');
  assert.notEqual(run('check').status,0);
  assert.equal(fs.readFileSync(baseline,'utf8'),original);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
