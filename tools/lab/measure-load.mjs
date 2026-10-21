// Reproducible wet/dry hand-brush measurements on cold-press paper, before flow.
import {makePaper} from '../../src/media/paper.mjs';
import {createSheet} from '../../src/media/sheet.mjs';
import {createBrush,dip,stroke} from '../../src/media/brush.mjs';
import {handBrushOptions,brushWater} from '../../demos/lab/brush-load.js';
import {paperOptions} from '../../demos/lab/media/papers.js';
export const pigment={K:[.4,.6,.9],S:[.01,.01,.01],rho:.05,omega:1.4,gamma:.15};
export function measureLoad({dpi=60,water=3,tool='round',feed,seed=149}={}) {
 const options=handBrushOptions({tool,sizeMm:25,water},{dpi,seed});
 const b=createBrush({...options,...(feed===undefined?{}:{feed})});
 const length=Math.round(24*dpi),h=Math.ceil(b.radius*3+20),y=h/2;
 const s=createSheet({...makePaper(length+40,h,paperOptions('cold',dpi,7)),mmPerCell:25.4/dpi},[pigment]);
 dip(b,{water,conc:[.5]});const initial=brushWater(b),bands=[];
 const span=Math.max(10,Math.round(dpi/3));
 for(let x=20;x+span<=length+20;x+=span){
  const before=brushWater(b)/initial;
  // Small pointer segments exercise the same continuation path as both browser surfaces.
  for(let xx=x;xx<x+span;xx+=2)stroke(b,s,[{x:xx,y,p:.8},{x:Math.min(xx+2,x+span),y,p:.8}],{lift:false});
  let n=0,painted=0,mass=0;const rows=[];
  for(let yy=Math.ceil(y-b.radius*.65);yy<y+b.radius*.65;yy++){
   let row=0;for(let xx=x+2;xx<x+span-2;xx++){
    const i=yy*s.w+xx,m=s.G[0][i]+s.D[0][i]+s.P[0][i];n++;painted+=m>1e-5;mass+=m;row+=m;
   }rows.push(row);
  }
  const mean=rows.reduce((a,v)=>a+v,0)/rows.length;
  bands.push({before,left:brushWater(b)/initial,coverage:painted/n,mass:mass/n,
   laneCV:Math.sqrt(rows.reduce((a,v)=>a+(v-mean)**2,0)/rows.length)/(mean||1),
   dryHairs:b.hairs.filter(h=>h.water/(b.capacity*h.len)<b.free).length});
 }
 return {bands,remaining:brushWater(b)/initial};
}
if(import.meta.main)for(const dpi of [15,60,90])for(const water of [.15,1.5,3])for(const tool of ['round','flat']){
 const summarize=r=>{const loaded=r.bands.filter(b=>b.before<.8&&b.left>.15);return {
  coverage:Math.min(...loaded.map(b=>b.coverage)),laneCV:Math.max(...loaded.map(b=>b.laneCV)),
  dryHairs:Math.max(...loaded.map(b=>b.dryHairs)),firstGap:r.bands.find(b=>b.coverage<.95),remaining:r.remaining};};
 console.log(JSON.stringify({dpi,water,tool,before:summarize(measureLoad({dpi,water,tool,feed:.06})),after:summarize(measureLoad({dpi,water,tool}))}));
}
