// Serial native census. Reference source is a git archive, never this edited tree.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=process.cwd(), output=path.resolve(process.argv[2]??'work/census-030');
const manifest=JSON.parse(fs.readFileSync('src/media/parity/workloads.json'));
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const selected=process.argv[3]?.split(',');
for(const w of manifest.workloads.filter(w=>!selected||selected.includes(w.id))) for(const arm of ['profile','reference']) {
  const out=path.join(output,`${w.id}-${arm}`);
  if(fs.existsSync(out)||fs.existsSync(out+'.log'))throw Error(`Refusing to overwrite ${out}`);
  fs.mkdirSync(out,{recursive:true});
  const cwd=arm==='reference'?path.join(output,'reference'):root;
  for(const [file,hash] of Object.entries(manifest.inputs??{}))if(sha(path.join(cwd,file))!==hash)throw Error(`Frozen input changed: ${file}`);
  const args=['tools/paint-plate.mjs',...w.args,'--gpu','on','--allowdirty','1','--out',out,...(arm==='profile'?['--speedprofile','1','--speedcpu','1']:[])];
  const log=fs.openSync(out+'.log','w');
  console.log(`START ${w.id} ${arm} ${new Date().toISOString()}`);
  const start=performance.now();
  const result=spawnSync('/usr/bin/time',['-l',process.execPath,...args],{cwd,env:{...process.env,GPU_TIMESTAMP_STRIDE:process.env.GPU_TIMESTAMP_STRIDE??'1024',PAINTER_CENSUS:arm==='profile'?'1':'0'},stdio:['ignore',log,log]}); fs.closeSync(log);
  const record={id:w.id,arm,args,referenceCommit:manifest.referenceCommit,exit:result.status,signal:result.signal,wallSeconds:(performance.now()-start)/1000,paintingSHA256:fs.existsSync(path.join(out,'painting.png'))?sha(path.join(out,'painting.png')):null};
  fs.writeFileSync(path.join(out,'measurement.json'),JSON.stringify(record,null,2)); console.log(JSON.stringify(record));
  if(result.status!==0 && result.status!==3)process.exit(result.status??1);
  if(arm==='reference'){
    const before=JSON.parse(fs.readFileSync(path.join(output,`${w.id}-profile/measurement.json`)));
    if(record.paintingSHA256!==before.paintingSHA256)throw Error(`${w.id}: profile/reference hash mismatch; stop, do not bless`);
  }
}
