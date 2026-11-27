import {valueTechnique} from '../../src/paint/methods/value-shared.mjs';
import {instrumentKey,swatchTechnique,chargedFromOwnSwatch} from '../../src/paint/methods/instrument-cal.mjs';
import {isMarkPassage,representativeMarks,swatchDepth,pressedRadius} from '../../src/paint/methods/mark-swatch.mjs';
import {isDampPassage} from '../../src/paint/methods/damp-swatch.mjs';
import {scriptStrokePaths} from '../../src/paint/methods/script-stroke-paths.mjs';
import {sweptPath} from '../../src/paint/methods/zigzag-lanes.mjs';
import {sweepCover} from '../../src/media/wash.mjs';
import {inputHash} from '../../src/paint/run-cache.mjs';

export const swatchJob=job=>({...job,T:swatchTechnique(job.T),...(job.mark?{mark:{...job.mark,depth:swatchDepth(job.mark.depth)}}:{})});
export function planSwatchJobs(layers,{SC,W2,H2,w,sheetMm,cover=true,coverPower=1,markCount=3,dampShare=.5,splay=.03}) {
 const N2=W2*H2;
 const jobs=new Map(),planned=new Map(),add=job=>{job=swatchJob(job);jobs.set(inputHash(job),job);};
 for(const layer of layers)for(const sh of layer.shapes??[]){
  if(!sh._valuePlan)continue;
  const T=valueTechnique(sh._valuePlan);if(!chargedFromOwnSwatch(T,{instrumentOn:true,authored:false}))continue;
  planned.set(instrumentKey(T),T);add({kind:'wash',T});
  const damp=isDampPassage(sh,dampShare);
  if(damp)add({kind:'damp',T});
  if(!isMarkPassage(sh))continue;
  const paths=scriptStrokePaths(sh._valuePlan.strokes,{scale:SC,cellsPerMm:W2/sheetMm,splay});
  let mask=sh.mask;
  if(SC!==1){const coarse=mask;mask=new Uint8Array(N2);for(let y=0;y<H2;y++)for(let x=0;x<W2;x++)mask[y*W2+x]=coarse[((y/SC)|0)*w+((x/SC)|0)];}
  const coverPaths=paths.map(pts=>pts.map(q=>({...q,r:Math.max(0.5,pressedRadius(q.r,q.p))}))).map(sweptPath);
  const depth=sh._cover??(!cover?1:Math.pow(Math.max(1,sweepCover(coverPaths,mask,W2,H2)),coverPower));
  for(const mark of representativeMarks(sh._valuePlan.strokes,markCount)){
   add({kind:'mark',T,mark:{...mark,depth,damp:false}});
   if(damp)add({kind:'mark',T,mark:{...mark,depth,damp:true}});
  }
 }
 return {jobs,planned};
}
