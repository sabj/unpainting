#!/usr/bin/env node
// Executed material controls at the study's physical sheet size. Runs on the GPU; docs/CLOUD.md covers renting one.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {makePaper} from '../../src/media/paper.mjs';
import {createSheet,layersOf,DEFAULTS} from '../../src/media/sheet.mjs';
import {attachGpu} from '../../src/media/gpu/link.mjs';
import {renderLayers} from '../../src/media/km.mjs';
import {createPen,dipPen,penStroke} from '../../src/media/pen.mjs';
import {drawMaterial,materialProfile} from '../../src/paint/methods/material-profiles.mjs';
import {createBrush,dip,stroke} from '../../src/media/brush.mjs';
import {splitLoadsFeathered} from '../../src/paint/methods/brushes.mjs';

const args=process.argv.slice(2),arg=(k,d)=>args.includes('--'+k)?args[args.lastIndexOf('--'+k)+1]:d;
const out=arg('out','work/ink-material-study'),w=Number(arg('width',1080)),h=Math.round(w*.85),mm=152.4/w;
if(![540,1080].includes(w))throw Error('study width is 540 or 1080');
fs.mkdirSync(out,{recursive:true});
const pigments=[materialProfile('drawing-ink').pigment,materialProfile('graphite-2B-side').pigment,{name:'wash blue',K:[.6,.3,.08],S:[.02,.02,.02],omega:1.4,rho:.05,gamma:0}];
const paper=makePaper(w,h,{seed:1,mmPerCell:mm,coldPress:{mmPerCell:mm,bumpMm:[.5,2],cover:2.2,swell:.3}}),sheet=createSheet(paper,pigments);
const backend=attachGpu(sheet,DEFAULTS,{mode:'on'}),rows=[];
const yFor=i=>(7+i*9)/mm;
const points=(y,{pressure=.5,speed=1.2,width=.35}={})=>Array.from({length:Math.ceil(95/mm)+1},(_,i)=>({x:10/mm+i,y,p:pressure,s:pressure,v:speed,nw:width/mm})).filter(p=>p.x<=105/mm);
// Paths run from 10 to 105 mm; explicit physical contact widths are resolution independent.
function observe(label,y,before={}){
 sheet._gpu?.syncAll(sheet);
 const cells=[];let mass=0,covered=0;
 for(let yy=Math.max(0,Math.floor(y-4/mm));yy<Math.min(h,Math.ceil(y+4/mm));yy++)for(let x=Math.floor(9/mm);x<Math.min(w,Math.ceil(107/mm));x++){
  const i=yy*w+x,d=sheet.D.reduce((s,a)=>s+a[i],0)+sheet.P.reduce((s,a)=>s+a[i],0);
  cells.push(d);mass+=d*mm*mm;if(d>.02)covered++;
 }
 const mean=cells.reduce((s,v)=>s+v,0)/cells.length,sd=Math.sqrt(cells.reduce((s,v)=>s+(v-mean)**2,0)/cells.length);
 rows.push({label,yMm:y*mm,massPerPhysicalArea:mass,coveredMm2:covered*mm*mm,depositCv:sd/(mean||1),...before});
}
function ink(label,i,{pressure=.5,speed=1.2,reservoir=5000,load=1,drop=.1,dwell=0,damp=0}={}){
 const y=yFor(i),pen=createPen({nib:.12/mm,flex:.28/mm,reservoir,feed:1.2,drop});
 const P=points(y,{pressure,speed,width:.12+.28*pressure});
 if(damp){sheet._gpu?.syncAll(sheet);for(let yy=Math.floor(y-4/mm);yy<Math.min(h,Math.ceil(y+4/mm));yy++)for(let x=5/mm|0;x<110/mm;x++){const j=yy*w+x;sheet.s[j]=sheet.paper.capacity[j]*damp;sheet.ever[j]=1;}sheet._gpu?.cpuWroteAll();}
 dipPen(pen,[12,0,0],load);
 if(dwell)P.splice(1,0,{...P[0],dwell});
 penStroke(pen,sheet,P);
 observe(label,y,{pressure,speed,dwell,damp,initialInk:reservoir*load,inkAfter:pen.ink,dropAfter:pen.drop});
}
ink('fast dry ink',0,{speed:3});ink('slow dry ink',1,{speed:.45});
ink('light pressure',2,{pressure:.15});ink('heavy pressure',3,{pressure:.8});
ink('post-dip drop and pause',4,{drop:2,dwell:3});ink('starving nib, no refill',5,{reservoir:15,load:.2});
ink('finish ink into damp paper',6,{damp:.45});
for(const [i,pressure] of [[7,.25],[8,.8]]){
 const y=yFor(i),P=points(y,{pressure,width:1.1});
 drawMaterial(sheet,[{points:P}],new Float32Array(sheet.n),w,h,{medium:'graphite-2B-side',mmPerCell:mm,caps:{lines:2,pressure,minLengthMm:0},O:DEFAULTS});
 observe(pressure<.5?'light dry graphite':'heavy dry graphite',y,{pressure});
}
for(const [i,fragmented] of [[9,true],[10,false]]){
 const y=yFor(i),P=points(y).map(p=>({...p,p:.5,r:1.5/mm}));
 const brush=createBrush({radius:1.5/mm,loadWater:1000,bristles:24,seed:1});
 const paths=fragmented?Array.from({length:12},(_,j)=>P.slice(Math.floor(j*(P.length-1)/12),Math.floor((j+1)*(P.length-1)/12)+1)):splitLoadsFeathered(P,35/mm,2/mm);
 for(const ps of paths){dip(brush,{water:.7,conc:[0,0,2]});stroke(brush,sheet,ps);}
 observe(fragmented?'12 short brush pieces':'connected brush passage with feathered reloads',y,{gestures:paths.length,totalLengthMm:paths.reduce((s,ps)=>s+ps.slice(1).reduce((d,p,j)=>d+Math.hypot(p.x-ps[j].x,p.y-ps[j].y)*mm,0),0)});
}
sheet._gpu?.syncAll(sheet);
const rgb=renderLayers(layersOf(sheet),pigments,Buffer.alloc(sheet.n*3,255),sheet.n);
await sharp(Buffer.from(rgb),{raw:{width:w,height:h,channels:3}}).png().toFile(path.join(out,'painting.png'));
fs.writeFileSync(path.join(out,'material-study.json'),JSON.stringify({backend,width:w,sheetWidthMm:152.4,mmPerCell:mm,rows,limitations:'Material controls are executed swatches, not evidence of artistic improvement. Sheen is a bounded flat-view deposition cue.'},null,2));
console.log(JSON.stringify({backend,width:w,rows}));
process.exit(0);
