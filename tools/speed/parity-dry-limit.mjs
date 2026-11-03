// Frozen dry-limit fixture, both continue and strict abort, independently per backend.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makePaper } from '../../src/media/paper.mjs';
import { createSheet, deposit, step, dry, thickness, DEFAULTS } from '../../src/media/sheet.mjs';
import { attachGpu, gpuStats } from '../../src/media/gpu/link.mjs';
import { resetChecks, setStrict, continuedSummary } from '../../src/media/checks.mjs';
import { renderLayers } from '../../src/media/km.mjs';
const args=process.argv.slice(2), opt=k=>args[args.lastIndexOf('--'+k)+1];
const out=opt('out'),mode=opt('gpu');fs.mkdirSync(out,{recursive:true});
const pigments=[{K:[.35,.49,.66],S:[.06,.025,.014],rho:.05,omega:1.4,gamma:.15}],n=32;
function setup(){
 const s=createSheet(makePaper(n,n,{seed:5}),pigments);
 for(let y=8;y<24;y++)for(let x=8;x<24;x++)deposit(s,y*n+x,.8,[.05]);
 const info=attachGpu(s,DEFAULTS,{mode});step(s);return {s,info};
}
resetChecks();const {s,info}=setup();
try {
 dry(s,5);
 const checks=continuedSummary();
 if(!checks.checks['Sheet is still wet after dry() limit'])throw Error('Dry limit did not execute');
 const pixels=renderLayers([thickness(s)],pigments,Buffer.alloc(n*n*3,250),n*n,1);
 await sharp(pixels,{raw:{width:n,height:n,channels:3}}).png().toFile(path.join(out,'painting.png'));
 fs.writeFileSync(path.join(out,'backend.json'),JSON.stringify({...info,gpuStats:gpuStats(s)},null,2));
 fs.writeFileSync(path.join(out,'continue.json'),JSON.stringify(checks,null,2));
}finally{s._gpu?.close();}
resetChecks();setStrict(true);const strict=setup();let aborted=false;
try{dry(strict.s,5);}catch(e){if(!/still wet|dry.*limit/i.test(e.message))throw e;aborted=true;}finally{strict.s._gpu?.close();resetChecks();}
if(!aborted)throw Error('Strict dry limit did not abort');
fs.writeFileSync(path.join(out,'strict.json'),JSON.stringify({aborted},null,2));
