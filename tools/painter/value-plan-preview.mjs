import {createMarkPreview,markLoad} from './marks-only-preview.mjs';
import {loadPhysical,splitLoads} from '../../src/paint/methods/brushes.mjs';
import {shapedPlanePaths} from '../../src/paint/techniques/shaped-marks.mjs';
// CPU compiler evidence: physical wash path geometry and predicted band optics, NEVER a physics output.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';

import {brushedWashPaths} from '../../src/media/wash.mjs';
import {loadLines,hasLines} from '../../src/crop/lines.mjs';
import {selectValueInk} from '../../src/paint/methods/light-to-dark.mjs';
import {DEFAULT_SHEET_MM} from '../../src/media/sheet-size.mjs';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export async function writeValuePreview({plan,out,w,h,pigments,paperRGB,target,photo,subject='subject',name=subject,root,opening='',closing='',version='W4',variant='lighttodark',date,compilePaths=true,sheetMm=DEFAULT_SHEET_MM}){
 const t0=performance.now(),sha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),stamp=date??new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date()).replaceAll('-','');
 const label=`${subject}-art-compile-${variant}-${version}-${w}px-${sha.slice(0,7)}-${stamp}`;
 const K=pigments.length,n=w*h,paths=[],panels=[];
 const marks=createMarkPreview(w,h,pigments,paperRGB,plan.protectedCells);
 const targetHash=(await import('node:crypto')).createHash('sha256').update(fs.readFileSync(target)).digest('hex');
 const drawing=(file,first)=>file&&hasLines(file)?selectValueInk(loadLines(file,w,h,{keepOrder:true}),{first,w,h,sourceInk:plan.style?.structure==='ink',density:plan.value.values,reserves:plan.protectedCells,subject,styleSelection:plan.style?{style:plan.style.name,reason:plan.style.reason}:null,shaped:plan.instructions[0]?.shaped}):[];
 const open=drawing(opening,true),close=drawing(closing,false);
 let drawings=[];
 const panel=async(stage)=>{
  const rgb=marks.pixels(),lines=drawings.map(g=>`<polyline points="${g.points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#66594d" stroke-opacity="${plan.style&&plan.style.name!=='precise-watercolor'?plan.style.ink:.32}" stroke-width=".5"/>`).join('');

  const painted=await sharp(Buffer.from(rgb),{raw:{width:w,height:h,channels:3}}).composite([{input:Buffer.from(`<svg width="${w}" height="${h}">${lines}</svg>`)}]).png().toBuffer();
  const caption=[stage,`${subject} ${name} | photo: ${path.basename(photo||'unknown')} | target: ${path.basename(target)} @ ${targetHash.slice(0,7)}`,`marks-only preview | ${plan.style?.name??variant} | ${version} | ${w}px | code ${sha.slice(0,7)} | CPU | ${stamp} PT | ours`];
  // Wide captions under each panel retain exact required text at readable scale.
  const pw=Math.max(540,w),ph=Math.round(h*pw/w),cap=88;
  const text=Buffer.from(`<svg width="${pw}" height="${cap}"><rect width="100%" height="100%" fill="#202020"/>${caption.map((s,i)=>`<text x="8" y="${20+i*22}" font-size="${i===1?9:11}" font-family="Arial" fill="white">${esc(s)}</text>`).join('')}</svg>`);
  const stageImage=await sharp({create:{width:pw,height:ph+cap,channels:3,background:'#fff'}}).composite([{input:await sharp(painted).resize(pw,ph).toBuffer(),left:0,top:0},{input:text,left:0,top:ph}]).png().toBuffer();
  panels.push(stageImage);await sharp(stageImage).toFile(path.join(out,label+'-stage-'+String(panels.length-1)+'.png'));
 };
 await panel('0 reserve whites / catchlights; no opaque correction');drawings=open;await panel(`opening drawing: ${open.length} selected structure paths (CPU)`);
 for(let band=1;band<=5;band++){
  for(const L of plan.layers.filter(l=>l.value===band))for(const sh of L.shapes){
   const m=sh.mask,p=sh._strokePlan?.paths??(sh._valuePlan.shaped?shapedPlanePaths(m,w,h,{texture:sh._valuePlan.texture}):brushedWashPaths(m,w,h,{pad:1.5,minRadius:1,minLength:3})),load=markLoad(L,sh,K);
   const factors=sh._strokePlan?.factors;
   if(factors)for(let i=0;i<p.length;i++)marks.paint([p[i]],load.map(v=>v*factors[i]),{clip:m});
   else marks.paint(p,load,{clip:sh._valuePlan.shaped?m:undefined});
   if(compilePaths)paths.push({id:sh._valuePlan.id,valueBand:band,phase:sh._valuePlan.phase,regions:sh._valuePlan.regions,load,paths:p,...(factors?{factors}: {})});
  }
  await panel(`${band} ${band===1?'light wash':band<=3?'dry middle values':'LAST dry-base cross-region shadow glaze'}; value band ${band}/5`);
 }
 // The planned sheet without any ink: every compiled wash mark, no drawing overlay, no caption. Consumed by
 // tools/judge/ink-wash-consistency.mjs as the proposed wash.
 await sharp(Buffer.from(marks.pixels()),{raw:{width:w,height:h,channels:3}}).png().toFile(path.join(out,'planned-wash.png'));
 drawings=[...open,...close];await panel(`closing ink: ${close.length} selective paths; dry paint required`);
 const pw=Math.max(540,w),ph=Math.round(h*pw/w)+88,cols=4,head=54;
 const header=Buffer.from(`<svg width="${cols*pw}" height="${head}"><rect width="100%" height="100%" fill="#111"/><text x="10" y="20" fill="white" font-family="Arial" font-size="16">CPU compiled band progression; marks-only preview; no physics. No control column.</text><text x="10" y="42" fill="white" font-family="Arial" font-size="14">OWNER VERDICT: none recorded | marks-only preview / registered paths</text></svg>`);
 const board=path.join(out,label+'.png');await sharp({create:{width:cols*pw,height:head+2*ph,channels:3,background:'#333'}}).composite([{input:header,left:0,top:0},...panels.map((input,i)=>({input,left:i%cols*pw,top:head+Math.floor(i/cols)*ph}))]).png().toFile(board);
 const physicalMm=sheetMm,physical=loadPhysical({root,W2:w,H2:h,opt:(key,fallback)=>key==='sheetmm'?String(physicalMm):fallback,num:(key,fallback)=>key==='physical'?1:key==='sheetmm'?physicalMm:fallback});
 const loads=g=>g.paths.flatMap(ps=>splitLoads(ps,physical.loadCells(physical.pick(Math.max(...ps.map(p=>p.r))),plan.instructions.find(i=>i.id===g.id)?.texture?'dry brush':g.phase==='shadow'?'glazed':'wet on dry')));
 const counts=Array.from({length:5},(_,i)=>({band:i+1,strokes:paths.filter(p=>p.valueBand===i+1).reduce((s,g)=>s+g.paths.length,0),finiteLoadStrokes:paths.filter(p=>p.valueBand===i+1).reduce((s,g)=>s+loads(g).length,0),contacts:paths.filter(p=>p.valueBand===i+1).reduce((s,g)=>s+g.paths.reduce((a,ps)=>a+ps.reduce((v,p,j)=>v+(j?Math.ceil(Math.hypot(p.x-ps[j-1].x,p.y-ps[j-1].y)/.7):1),0),0),0)}));
 fs.writeFileSync(path.join(out,'value-mark-counts.json'),JSON.stringify({scope:'planned gestures, physical finite-load stroke calls, and 0.7-cell centerline contact stations; actual summed contact cells require GPU audit',bands:counts,total:counts.reduce((a,b)=>({strokes:a.strokes+b.strokes,contacts:a.contacts+b.contacts}),{strokes:0,contacts:0})},null,2));
 fs.writeFileSync(path.join(out,'value-shaped-paths.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h+40}"><rect width="100%" height="100%" fill="white"/><text x="4" y="18" font-size="10">${esc(label)} | planned centerlines; no physics</text><g transform="translate(0,40)">${paths.map(g=>g.paths.map(ps=>`<polyline points="${ps.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${['#a99','#d90','#a70','#369','#234'][g.valueBand-1]}" stroke-opacity=".4" stroke-width=".6"/>`).join('')).join('')}</g></svg>`);
 fs.writeFileSync(path.join(out,'value-compiled-paths.json'),JSON.stringify({stage:'CPU compile NOT physical execution',w,h,paths,opening:open,closing:close}));
 const settings={valueCaps:[.16,.32,.5,.75,1],geometry:plan.geometry,stage:'CPU marks-only preview',drawing:{opening:open.length,closing:close.length},targetSHA256:targetHash};
 fs.writeFileSync(path.join(out,'LABEL.json'),JSON.stringify({subject,photo:'art',layer:'compile',variant,version,width:w,source:sha,date:stamp,targetSHA256:targetHash},null,2));
 return {board,settings,seconds:(performance.now()-t0)/1000};
}
