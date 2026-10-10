// For buildings and their sky: paints each plane from a --architectureplan JSON of reference polygons with its own
// brush and move, then optional dry shadow glazes. Every stroke is logged to architecture-strokes.jsonl.
import fs from 'node:fs';
import {setWashSplat} from '../../../media/brush.mjs';
import {cloudTissuePressure,pressCloudTissue} from '../../tuned/architecture-clouds.mjs';
import path from 'node:path';
import {createSheet,layersOf,thickness as sheetThickness} from '../../../media/sheet.mjs';
import {attachGpu} from '../../../media/gpu/link.mjs';
import {renderLayers} from '../../../media/km.mjs';
import {strokeCells,measurePaper} from '../../methods/wetdry.mjs';
import {buildRegionPlan,passagePaths,curvedSkyPaths,waterMopPath,regionContactMode} from './architecture-plan.mjs';
import { DEFAULT_SHEET_MM } from '../../../media/sheet-size.mjs';
export const when='washes';
export const dryAfter=true;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sum=a=>a.reduce((s,v)=>s+v,0);
function loadPlan(ctx){const file=ctx.opt('architectureplan','');if(!file)throw Error('--architectureplan JSON is required');return JSON.parse(fs.readFileSync(path.resolve(ctx.root,file)));}
export function region(ctx){const mask=new Uint8Array(ctx.n).fill(1);mask.architecture=buildRegionPlan({w:ctx.w,h:ctx.h,px:ctx.px,spec:loadPlan(ctx)});return mask;}
function readBrush(b){if(b._pend)b._pend.link.settleBrush(b);return {water:b.resW+b.hairs.reduce((a,h)=>a+h.water,0),pigment:b.resP.map((v,k)=>v+b.hairs.reduce((a,h)=>a+h.pig[k],0)),radius:b.radius,load:b.load,bridge:b.bridge,wetMix:b.wetMix};}
const rgbOf=(px,cells)=>[0,1,2].map(k=>cells.reduce((s,i)=>s+px[3*i+k],0)/Math.max(1,cells.length));
export function fitReference(rgb,pigments,base){
 base=[base[0],base[1],base[2]];if(base.some(v=>!Number.isFinite(v)||v<=0))throw Error('Invalid paper RGB triplet');
 const K=pigments.length,cols=pigments.map(p=>p.K.map(v=>v/.55)),want=rgb.map((v,c)=>-Math.log(clamp(v/base[c],.025,1))),L=Math.max(.001,sum(cols.map(a=>sum(a.map(v=>v*v)))));
 let x=new Array(K).fill(0),goal=want.slice();
 for(let correction=0;correction<3;correction++){
  for(let it=0;it<160;it++){const residual=[0,1,2].map(c=>sum(cols.map((a,k)=>a[c]*x[k]))-goal[c]);x=x.map((v,k)=>Math.max(0,v-.9/L*sum(residual.map((r,c)=>r*cols[k][c]))));}
  const got=renderLayers([x.map(v=>Float32Array.of(v))],pigments,Uint8Array.from(base),1);
  const prediction=[0,1,2].map(c=>sum(cols.map((a,k)=>a[c]*x[k])));
  goal=prediction.map((v,c)=>v+want[c]+Math.log(clamp(got[c]/base[c],.025,1)));
 }
 return x;
}
function brushOptions(r,seed,flat,wetMix=.3){return {radius:r,flat,bristles:Math.max(16,Math.ceil(r*2.5)),capacity:100,belly:12,feed:.4,give:.9,free:.4,film:.25,bridge:.82,bridgeSoft:2.4,splay:.03,stiffness:8,wetMix,seed};}
function patchPaper(p,w,h){const out={w,h,n:w*h};for(const [k,a]of Object.entries(p)){if(ArrayBuffer.isView(a)&&a.length===p.n){const b=new a.constructor(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)b[y*w+x]=a[y*p.w+x];out[k]=b;}else if(!['w','h','n'].includes(k))out[k]=a;}return out;}
export function calibrateBrush(ctx,options,water,{wet=false}={}){
 const size=Math.max(32,Math.min(80,Math.ceil(options.radius*7))),w=Math.min(size,ctx.sheet.w),h=Math.min(size,ctx.sheet.h),n=w*h;
 const sheet=createSheet(patchPaper(ctx.sheet.paper,w,h),ctx.PIGS),O=ctx.O,mask=new Uint8Array(n).fill(1),r=options.radius;
 let paths=passagePaths(mask,w,h,r,[0,0,w-1,h-1]);if(options.connected)paths=curvedSkyPaths(mask,w,h,r);const carried=options.connected?ctx.createBrush(options):null;attachGpu(sheet,O,{mode:'on',log:()=>{}});
 try{
  if(wet){
    for(const points of paths){const b=carried??ctx.createBrush(options);ctx.dip(b,{water:1,conc:new Array(ctx.K).fill(0)});ctx.stroke(b,sheet,waterMopPath(points,r,{extendEnds:options.flat&&!options.connected}),{upright:options.flat?'sweep':true,lift:false,gpuBetween:true,between:k=>{if(k%12===0)ctx.step(sheet,O);}});if(options.connected)for(let t=0;t<3;t++)ctx.step(sheet,O);}
    for(let t=0;t<6;t++)ctx.step(sheet,O);
  }
  const starting=measurePaper(sheet,Array.from({length:n},(_,i)=>i));
  const conc=new Array(ctx.K).fill(0);conc[0]=.5;
  for(const points of paths){const b=carried??ctx.createBrush(options);ctx.dip(b,{water,conc});ctx.stroke(b,sheet,points,{upright:options.flat?'sweep':true,lift:!options.connected,gpuBetween:true,between:k=>{if(k%12===0)ctx.step(sheet,O);}});if(options.connected)for(let t=0;t<3;t++)ctx.step(sheet,O);}
  if(options.connected)for(let t=0;t<15;t++)ctx.step(sheet,O);
  ctx.dry(sheet,20000,O,{levelMax:140});
  const th=sheetThickness(sheet);let mass=0,c=0,covered=0;
  const margin=Math.min(Math.ceil(r),Math.floor(w/4),Math.floor(h/4));
  for(let y=margin;y<h-margin;y++)for(let x=margin;x<w-margin;x++){const v=th[0][y*w+x];mass+=v;c++;if(v>.005)covered++;}
  const gain=mass/Math.max(1,c)/.5;
  if(!Number.isFinite(gain)||gain<.002)throw Error(`Brush calibration failed: gain ${gain}`);
  return {gain,coverage:covered/c,cells:c,radius:r,water,startingPaper:starting,regime:wet?'wet on wet':'wet on dry',wetMix:options.wetMix,bridge:options.bridge,strokes:paths.length};
 }finally{sheet._gpu?.close();}
}
export async function paint(ctx){
 const {sheet,w,h,n,SC,W2,H2,N2,K,PIGS,O,createBrush,dip,stroke,step,dry,setClip,applyResist,liftResist,px,outDir,opt,num,stage,log}=ctx;
 const plan=ctx.region?.architecture??buildRegionPlan({w,h,px,spec:loadPlan(ctx)}),mmCell=num('sheetmm', DEFAULT_SHEET_MM)/W2;
 const up=mask=>Uint8Array.from({length:N2},(_,i)=>mask[Math.floor(Math.floor(i/W2)/SC)*w+Math.floor((i%W2)/SC)]);
 const journal=[],calibration=[],written=plan.regions.map(({mask,cells,...r})=>({...r,cells:cells.length,startingState:r.move==='wet on wet'?'deliberately prewetted':'dry at passage start; connected wet-edge continuations may touch mixed or wet paint',contact:regionContactMode(r,num('washsplat',0)>0)==='film'?'loaded aggregate film for coherent mop/flat planes; supported pressure and actual load; paper flow and granular drying active':'individual bristle contact',pigment:'reference-fit from production palette',protectedLights:r.reserve?'reference cloud cores':'earlier light planes',failureSigns:'starved contact, disconnected wash, lost lights, incorrect paper state'}));
 fs.writeFileSync(path.join(outDir,'architecture-plan.json'),JSON.stringify({reference:loadPlan(ctx).reference,physicalMmPerCell:mmCell,regions:written,palette:PIGS.map(p=>p.name)},null,2));
 const audit=path.join(outDir,'architecture-strokes.jsonl');fs.writeFileSync(audit,'');
 const record=e=>{journal.push(e);fs.appendFileSync(audit,JSON.stringify(e)+'\n');};
 const fitCache=new Map();const mixFor=rgb=>{const key=rgb.map(v=>Math.round(v/5)*5).join(',');if(!fitCache.has(key))fitCache.set(key,fitReference(rgb,PIGS,ctx.paperRGB));return fitCache.get(key);};
 let number=0, activeMask=null;
 const draw=(points,b,conc,water,move,id)=>{
  dip(b,{water,conc});const cells=strokeCells(sheet,points,b.radius),paper=measurePaper(sheet,cells),load=readBrush(b);
  const around=new Set(cells);for(const i of cells)for(const off of[-1,1,-sheet.w,sheet.w])if(i+off>=0&&i+off<sheet.n)around.add(i+off);
  const neighbors=measurePaper(sheet,[...around]), contactPaper=measurePaper(sheet,cells.filter(i=>!activeMask||activeMask[i]));
  if(!cells.length)return;
  if(load.water<=0||conc.some(v=>v>0)&&sum(load.pigment)<=0)throw Error(`${id}: empty actual brush`);
  if(move==='wet on wet'&&contactPaper.moistShare<.65)throw Error(`${id}: wet passage lost its connected moist footprint (${contactPaper.moistShare})`);
  if(move==='dry glaze'&&(!paper.dry||!neighbors.dry))throw Error(`${id}: intended crisp shadow touches damp paint`);
  const observedState=contactPaper.dry?'dry':contactPaper.moistShare>=.65?'wet':'mixed';
  const continuation=move==='wet on dry'&&!contactPaper.dry;
  record({stroke:++number,region:id,move:continuation?'wet-edge continuation':move,intendedPassage:move,observedState,continuation:continuation?'connected wash over earlier strokes in this reference plane':null,paper,contactPaper,neighbors,brush:load,requested:{water,conc}});
  stroke(b,sheet,points,{upright:b.flat?'sweep':true,lift:move!=='add water'&&id!=='connected-sky',gpuBetween:true,between:k=>{if(k%12===0)step(sheet,O);}});
 };
 if(plan.reserved.some(Boolean)){dry(sheet,20000,O,{levelMax:140});applyResist(sheet,up(plan.reserved));}
 const filmDefault=num('washsplat',0)>0,splatWater=num('splatwater',2);
 try {
 for(const r of [...plan.regions].sort((a,b)=>a.order-b.order)){
  const contactMode=regionContactMode(r,filmDefault);setWashSplat(contactMode==='film',{water:splatWater});
  const radius=Math.max(.9,r.brushMm/mmCell),options=brushOptions(radius,700+(r.order||0),r.flat,num('architecturewetmix',.3));
  options.connected=r.id==='connected-sky';
  const cal=calibrateBrush(ctx,options,r.water,{wet:r.move==='wet on wet'});calibration.push({region:r.id,contactMode,...cal});log(`architecture ${r.id}: radius ${radius.toFixed(2)}, gain ${cal.gain.toFixed(4)}, coverage ${(cal.coverage*100).toFixed(1)}%`);
  const mask=up(r.mask),bounds=r.bounds.map((v,k)=>k<2?Math.floor(v*SC):Math.min(k===2?W2-1:H2-1,Math.ceil((v+1)*SC)-1));
  let paths=passagePaths(mask,W2,H2,radius,bounds);if(options.connected)paths=curvedSkyPaths(mask,W2,H2,radius);const carried=options.connected?createBrush(options):null;activeMask=mask;setClip(sheet,mask);stage({step:r.id,technique:r.move,strokes:paths.length});
  dry(sheet,20000,O,{levelMax:140});
  const priorTop=sheet.layers.at(-1), older=ctx.thickness(sheet).map((a,k)=>Float32Array.from(a,(v,i)=>v-(priorTop?.[k][i]??0)-sheet.G[k][i]-sheet.D[k][i]-sheet.P[k][i]));
  if(r.move==='wet on wet'){
    // A clean mop wets connected paper around the future paint contact. The
    // fragmented pigment ownership mask is restored before any color is applied.
    const prewet=()=>{
      setClip(sheet,null);
      try{for(const points of paths){draw(waterMopPath(points,radius,{extendEnds:options.flat&&!options.connected}),carried??createBrush(options),new Array(K).fill(0),1,'add water',r.id);if(options.connected)for(let t=0;t<3;t++)step(sheet,O);}}
      finally{setClip(sheet,mask);}
      for(let t=0;t<6;t++)step(sheet,O);
    };
    prewet();
    const contacts=paths.map(points=>strokeCells(sheet,points,radius)).filter(c=>c.length),future=[...new Set(contacts.flat())];
    const coverage=pass=>{
      const state=measurePaper(sheet,future),minimumStrokeMoist=Math.min(1,...contacts.map(c=>measurePaper(sheet,c).moistShare));
      record({event:'prewet-future-contact',region:r.id,pass,state,minimumStrokeMoist});return state;
    };
    let state=coverage(1);
    if(options.connected){
      for(let pass=2;state.moistShare<.98&&pass<=3;pass++){prewet();state=coverage(pass);}
      if(state.moistShare<.98)throw Error(r.id+': initial future contact not connected wet ('+state.moistShare+')');
    }
  }
  for(const points of paths){
    const cells=strokeCells(sheet,points,radius);const planCells=[...new Set(cells.map(i=>Math.floor(Math.floor(i/W2)/SC)*w+Math.floor((i%W2)/SC)))].filter(i=>r.mask[i]);if(!planCells.length)continue;
    let rgb=rgbOf(px,planCells);if(r.shadow==='dry glaze')rgb=rgb.map((v,c)=>v+.22*(ctx.paperRGB[c]-v));
    const target=mixFor(rgb), on=new Array(K).fill(0);
    const feedbackPaper=measurePaper(sheet,cells); // existing regional refresh includes G, D and P
    if(sheet._gpu){
      if(num('architecturetoprect',1)!==0&&feedbackPaper.bounds){
        const [x0,y0,x1,y1]=feedbackPaper.bounds;
        sheet._gpu.syncTopRect(sheet,[x0,y0,x1-x0+1,y1-y0+1]);
      }else sheet._gpu.syncTop(sheet);
    } // exact same feedback cells; ordinary full top coherence remains available
    const top=sheet.layers.at(-1);
    for(const i of cells)for(let k=0;k<K;k++)on[k]+=(older[k][i]+(top?.[k][i]??0)+sheet.G[k][i]+sheet.D[k][i]+sheet.P[k][i])/Math.max(1,cells.length);
    const mix=target.map((v,k)=>Math.max(0,v-on[k])/cal.gain);
    record({event:'dose-feedback',region:r.id,targetMass:target,actualMass:on,charged:mix});
    if(sum(mix)<.001)continue;
    if(r.move==='wet on wet'){
      let state=measurePaper(sheet,cells);
      for(let retry=0;state.moistShare<.65&&retry<3;retry++){
        const before=state, mop={...options,flat:options.flat,radius:options.radius*1.4,bristles:Math.ceil(options.bristles*1.4)};
        setClip(sheet,null);
        try{draw(waterMopPath(points,radius,{extendEnds:options.flat&&!options.connected}),createBrush(mop),new Array(K).fill(0),1,'add water',r.id);}
        finally{setClip(sheet,mask);}
        for(let t=0;t<3;t++)step(sheet,O);
        state=measurePaper(sheet,cells);
        record({event:'rewet',region:r.id,retry:retry+1,before,after:state,clippedCells:cells.length});
      }
    }
    draw(points,carried??createBrush(options),mix,r.water,r.move,r.id);
    if(options.connected)for(let t=0;t<3;t++)step(sheet,O);
  }
  if(options.connected){
    for(let t=0;t<15;t++)step(sheet,O);
    const sourcePressure=cloudTissuePressure({px,w,h,mask:r.mask,sigma:Math.max(1,2/SC)});
    const pressure=Float32Array.from({length:N2},(_,i)=>sourcePressure[Math.floor(Math.floor(i/W2)/SC)*w+Math.floor((i%W2)/SC)]);
    const taken=pressCloudTissue({sheet,pressure,blot:ctx.blot,record:e=>record(e)});
    record({event:'physical-cloud-lift',water:taken.water,pigment:taken.pigment,presses:taken.presses.length});
    for(let t=0;t<40;t++)step(sheet,O);
  }
  dry(sheet,20000,O,{levelMax:140});
  if(r.shadow==='dry glaze'){
    const light=i=>.2126*px[i*3]+.7152*px[i*3+1]+.0722*px[i*3+2],values=r.cells.map(light).sort((a,b)=>a-b),threshold=values[Math.floor(values.length*.35)];
    const shadow=Uint8Array.from(r.mask,(v,i)=>v&&light(i)<=threshold?1:0),small=up(shadow),paths=passagePaths(small,W2,H2,radius,bounds);
    const th=ctx.thickness(sheet),candidates=paths.map(points=>{const cells=strokeCells(sheet,points,radius).filter(i=>small[i]);return {points,cells,light:cells.reduce((v,i)=>v+light(Math.floor(Math.floor(i/W2)/SC)*w+Math.floor((i%W2)/SC)),0)/Math.max(1,cells.length)};}).filter(p=>p.cells.length>2).sort((a,b)=>a.light-b.light),touched=new Set();let glazes=0;
    for(const candidate of candidates){
      if(glazes>=num('architectureglazes',32))break;
      const {points,cells}=candidate;if(cells.filter(i=>touched.has(i)).length>cells.length*.3)continue;
      const planCells=[...new Set(cells.map(i=>Math.floor(Math.floor(i/W2)/SC)*w+Math.floor((i%W2)/SC)))],target=mixFor(rgbOf(px,planCells)),on=new Array(K).fill(0);
      for(const i of cells)for(let k=0;k<K;k++)on[k]+=th[k][i];
      const mix=target.map((v,k)=>Math.max(0,v-on[k]/cells.length)/(cal.gain*.7));if(sum(mix)<.001)continue;
      // Each bounded accent is freshly loaded; previous accents and neighboring
      // underpaint are physically dried before another intended crisp overlap.
      dry(sheet,20000,O,{levelMax:140});setClip(sheet,small);draw(points,createBrush(options),mix,r.water,'dry glaze',r.id);
      for(const i of cells)touched.add(i);glazes++;
    }
    dry(sheet,20000,O,{levelMax:140});

  }
  setClip(sheet,null);ctx.snap();
 }
 if(plan.reserved.some(Boolean)){dry(sheet,20000,O,{levelMax:140});liftResist(sheet);}
 fs.writeFileSync(path.join(outDir,'architecture-calibration.json'),JSON.stringify(calibration,null,2));
 fs.writeFileSync(path.join(outDir,'architecture-summary.json'),JSON.stringify({strokes:number,regions:written.length,calibration,allMeasurementsFinite:journal.filter(e=>e.brush).every(e=>Number.isFinite(e.paper.waterMax)&&Number.isFinite(e.brush.water))},null,2));
 log(`architecture: ${number} audited instrument strokes, ${written.length} reference-led regions`);
 } finally {setWashSplat(filmDefault,{water:splatWater});}
}
