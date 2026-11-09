// Convert a region's observed mean value into the simulator's pigment-thickness units.
// The old linear fit uses K / .55, while a transparent layer crosses the pigment
// twice. Its pure-absorber limit is K / .5. Use the actual K/S law instead of a
// fitted compensation. Only one scalar per existing colour region is retained.
import {layerRT} from '../../media/km.mjs';

const luma=rgb=>.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];

export function mixtureDensity(mix,pigments,paperRGB,scale=1){
 const sum=mix.reduce((s,v)=>s+v,0);if(!(sum>0&&scale>0))return 0;
 const colour=[0,1,2].map(c=>{
  const K=mix.reduce((s,v,j)=>s+v*pigments[j].K[c],0)/sum;
  const S=mix.reduce((s,v,j)=>s+v*pigments[j].S[c],0)/sum;
  const [r,t]=layerRT(K,S,sum*scale),paper=paperRGB[c]/255;
  return 255*(r+t*t*paper/(1-r*paper));
 });
 return Math.max(0,-Math.log(Math.max(1e-12,luma(colour)/luma(paperRGB))));
}

export function fitPlanOptics({demand,rgb,labels,protect=null,pigments,paperRGB,k=pigments.length}){
 const groups=new Map();
 for(let i=0;i<labels.length;i++)if(!protect?.[i]){
  const id=labels[i];if(!groups.has(id))groups.set(id,{mix:new Array(k).fill(0),rgb:[0,0,0],cells:0});
  const g=groups.get(id);g.cells++;
  for(let j=0;j<k;j++)g.mix[j]+=demand[i*k+j];
  for(let c=0;c<3;c++)g.rgb[c]+=rgb[i*3+c];
 }
 const factors=new Map(),report=[];
 for(const [id,g] of groups){
  const mix=g.mix.map(v=>v/g.cells),mean=g.rgb.map(v=>v/g.cells);
  const target=Math.max(0,-Math.log(Math.max(1,luma(mean))/luma(paperRGB)));
  const at=scale=>mixtureDensity(mix,pigments,paperRGB,scale);
  let lo=0,hi=1,got=at(hi),matched=true;
  for(let i=0;got<target&&i<32;i++){
   const next=at(hi*2);if(next<=got+1e-9){matched=false;break;}hi*=2;got=next;
  }
  if(got<target)matched=false;
  let factor=1;
  if(matched){
   for(let i=0;i<48;i++){factor=(lo+hi)/2;const density=at(factor);if(Math.abs(density-target)<1e-7)break;if(density<target)lo=factor;else hi=factor;}
  }
  factors.set(id,factor);
  report.push({region:id,cells:g.cells,factor,before:at(1),after:at(factor),target,matched});
 }
 const fitted=demand.slice();
 for(let i=0;i<labels.length;i++)if(!protect?.[i])for(let j=0;j<k;j++)fitted[i*k+j]*=factors.get(labels[i])??1;
 return {demand:fitted,report};
}
