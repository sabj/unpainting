// Estimate a region's pigment-thickness scale using K/S reflectance, at plan time.
// Retain one scalar per existing region. Average reflected light over its cells,
// never render its mean demand as though a varying region were a uniform slab.
// This predicts ideal mixed or pan-order layers; real brush contacts and drying
// still need separate delivery checks. No paint-time reference lookup is used.
import {layerRT} from '../../media/km.mjs';

const luma=rgb=>.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];

export function reflectedColour(mix,pigments,paperRGB,scale=1,mode='mixed'){
 const sum=mix.reduce((s,v)=>s+v,0);
 if(!(sum>0&&scale>0))return [...paperRGB];
 if(!['mixed','separate'].includes(mode))throw new RangeError('unknown optics layer model');
 return [0,1,2].map(c=>{
  let reflected=paperRGB[c]/255;
  if(mode==='mixed'){
   const K=mix.reduce((s,v,j)=>s+v*pigments[j].K[c],0)/sum;
   const S=mix.reduce((s,v,j)=>s+v*pigments[j].S[c],0)/sum;
   const [r,t]=layerRT(K,S,sum*scale);
   reflected=r+t*t*reflected/(1-r*reflected);
  }else for(let j=0;j<mix.length;j++)if(mix[j]>0){
   const [r,t]=layerRT(pigments[j].K[c],pigments[j].S[c],mix[j]*scale);
   reflected=r+t*t*reflected/(1-r*reflected);
  }
  return 255*reflected;
 });
}

export function mixtureDensity(mix,pigments,paperRGB,scale=1){
 return Math.max(0,-Math.log(Math.max(1e-12,luma(reflectedColour(mix,pigments,paperRGB,scale))/luma(paperRGB))));
}

export function fitPlanOptics({demand,rgb,labels,protect=null,pigments,paperRGB,k=pigments.length,mode='mixed'}){
 const groups=new Map(),paperLuma=luma(paperRGB);
 for(let i=0;i<labels.length;i++)if(!protect?.[i]){
  const id=labels[i];if(!groups.has(id))groups.set(id,{mixes:[],targetLight:0});
  const g=groups.get(id);g.mixes.push(Array.from({length:k},(_,j)=>demand[i*k+j]));
  g.targetLight+=.2126*rgb[i*3]+.7152*rgb[i*3+1]+.0722*rgb[i*3+2];
 }
 const factors=new Map(),report=[];
 for(const [id,g] of groups){
  const target=Math.max(0,-Math.log(Math.max(1e-12,g.targetLight/g.mixes.length/paperLuma)));
  const at=scale=>{
   let reflected=0;
   for(const mix of g.mixes)reflected+=luma(reflectedColour(mix,pigments,paperRGB,scale,mode));
   return Math.max(0,-Math.log(Math.max(1e-12,reflected/g.mixes.length/paperLuma)));
  };
  let lo=0,hi=1,got=at(hi),matched=true;
  for(let i=0;got<target&&i<32;i++){
   const next=at(hi*2);if(next<=got+1e-9){matched=false;break;}hi*=2;got=next;
  }
  if(got<target)matched=false;
  let factor=1;
  if(matched)for(let i=0;i<48;i++){
   factor=(lo+hi)/2;const density=at(factor);
   if(Math.abs(density-target)<1e-7)break;
   if(density<target)lo=factor;else hi=factor;
  }
  factors.set(id,factor);
  report.push({region:id,cells:g.mixes.length,factor,before:at(1),after:at(factor),target,matched,model:mode});
 }
 const fitted=demand.slice();
 for(let i=0;i<labels.length;i++)if(!protect?.[i])for(let j=0;j<k;j++)fitted[i*k+j]*=factors.get(labels[i])??1;
 return {demand:fitted,report};
}
