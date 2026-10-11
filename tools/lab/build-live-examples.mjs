// Full budgeted paintings; Recording frames remain independent.
// node tools/lab/build-live-examples.mjs h36-250 h36-2500 ships-250 ships-2500
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
const root=path.resolve(import.meta.dirname,'../../docs/lab');
const runs=process.argv.slice(2);
if(runs.length!==4)throw Error('Supply h36-250 h36-2500 ships-250 ships-2500 run directories');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'examples/recorded.json')));
for(const [i,id]of ['h36-a','white-ships'].entries())for(const [j,budget]of [250,2500].entries()){
 const run=runs[i*2+j],file=path.join(run,'marks.json');
 const tape=JSON.parse(fs.existsSync(file)?fs.readFileSync(file):gunzipSync(fs.readFileSync(file+'.gz')));
 const audit=JSON.parse(fs.readFileSync(path.join(run,'stroke-budget.json')));
 const count=tape.marks.filter(m=>['s','P','g'].includes(m.k)).length;
 if(!audit.complete||audit.budget!==budget||tape.strokeBudget!==budget||count!==audit.strokes||count>budget||count<budget*.8)throw Error(`${id}/${budget}: incomplete or incorrectly budgeted run (${count})`);
 const rel=`examples/${id}/live-${budget}.json.gz`;
 fs.writeFileSync(path.join(root,rel),gzipSync(JSON.stringify({...tape,strokeCount:count,complete:true}),{level:9}));
 const ex=manifest.examples.find(e=>e.id===id);ex.live[budget]=rel;
 (ex.studies??={})[budget]={label:budget.toLocaleString('en-US')+'-stroke painting',strokes:count,width:tape.w,height:tape.h};
 console.log(id,budget,count);
}
fs.writeFileSync(path.join(root,'examples/recorded.json'),JSON.stringify(manifest,null,2)+'\n');
