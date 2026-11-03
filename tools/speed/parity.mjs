// Frozen same-backend PNG gate. Baseline creation is explicit and refuses overwrites.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const webgpuVersion=JSON.parse(fs.readFileSync(new URL('../../node_modules/webgpu/package.json',import.meta.url))).version;
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const [action, sourceArg, outArg, baselineArg, manifestArg] = process.argv.slice(2);
if (!['freeze','check'].includes(action) || !sourceArg || !outArg || !baselineArg) throw Error('Usage: parity.mjs freeze|check SOURCE_DIR NEW_OUTPUT_DIR BASELINE.json');
const source=path.resolve(sourceArg), out=path.resolve(outArg), baselineFile=path.resolve(baselineArg);
if (fs.existsSync(out)) throw Error('Output must be a new directory');
if(action==='freeze' && fs.existsSync(baselineFile))throw Error('Refusing to replace frozen hashes');
const manifestFile=manifestArg?path.resolve(manifestArg):new URL('../../src/media/parity/fixtures.json',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(manifestFile));
const expected=action==='check'?JSON.parse(fs.readFileSync(baselineFile)):null;
if(expected && (expected.node!==process.version || expected.arch!==process.arch || expected.platform!==process.platform || expected.webgpuVersion!==webgpuVersion || JSON.stringify(expected.encoders)!==JSON.stringify(sharp.versions)))throw Error('Node, platform, WebGPU or encoder versions changed; use the frozen environment');
if(expected && expected.manifestSHA256!==sha(manifestFile))throw Error('Fixture manifest changed');
for(const [file,hash] of Object.entries(manifest.inputs))if(sha(path.join(source,file))!==hash)throw Error(`Input changed: ${file}`);
fs.mkdirSync(out,{recursive:true});
const results={referenceCommit:manifest.referenceCommit,manifestSHA256:sha(manifestFile),node:process.version,platform:process.platform,arch:process.arch,encoders:sharp.versions,webgpuVersion,results:[]};
let failed=false;
for(const fixture of manifest.fixtures) for(const backend of (manifest.backends??['cpu','gpu'])) {
 const id=`${fixture.id}-${backend}`,dir=path.join(out,id),log=fs.openSync(dir+'.log','w');
 console.log(`START ${id}`);
 const args=[fixture.script??'tools/paint-plate.mjs',...fixture.args,'--gpu',backend==='cpu'?'off':'on','--allowdirty','1','--out',dir];
 const run=spawnSync(process.execPath,args,{cwd:source,env:{...process.env,PAINTER_CENSUS:'0'},stdio:['ignore',log,log]});fs.closeSync(log);
 const infoFile=path.join(dir,'backend.json'), info=fs.existsSync(infoFile)?JSON.parse(fs.readFileSync(infoFile)):null;
 const unusedFile=path.join(dir,'unused-options.txt'),unusedOptions=fs.existsSync(unusedFile)?fs.readFileSync(unusedFile,'utf8').trim().split('\n').filter(Boolean).sort():[];
 const acceptedExit=run.status===0||(run.status===3&&unusedOptions.length>0&&unusedOptions.every(k=>fixture.allowedUnusedOptions?.includes(k)));
 const result={id,unusedOptions,exit:run.status,backend:info?.backend,adapter:info?.adapterEvidence?.adapterInfo??null,mode:info?.nativePaintMode?.mode??fixture.mode,sha256:null,status:'failed'};
 if(acceptedExit&&fs.existsSync(path.join(dir,'painting.png'))&&info?.backend===backend&&result.mode===fixture.mode){
  result.sha256=sha(path.join(dir,'painting.png'));result.status='recorded';
  if(expected){const old=expected.results.find(r=>r.id===id);if(!old||old.exit!==result.exit||JSON.stringify(old.unusedOptions??[])!==JSON.stringify(unusedOptions)||old.sha256!==result.sha256||old.backend!==backend||JSON.stringify(old.adapter)!==JSON.stringify(result.adapter)||old.mode!==result.mode){result.status='mismatch';failed=true;}else result.status='passed';}
 }else {failed=true;const logText=fs.readFileSync(dir+'.log','utf8');if(backend==='gpu' && /no (?:suitable )?(?:gpu|adapter)|gpu.*unavailable|failed to (?:get|request).*adapter/i.test(logText))result.status='skipped';result.reason=result.status==='skipped'?'GPU unavailable: coverage skipped, gate incomplete.':'Render failed; inspect log.';}
 results.results.push(result);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(result));
 if(failed)throw Error('Parity mismatch or render failure; stop, do not change baseline');
}
if(failed)throw Error('Parity failed; baseline not changed');
if(action==='freeze')fs.writeFileSync(baselineFile,JSON.stringify(results,null,2),{flag:'wx'});
