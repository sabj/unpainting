// Pieces of the value plan the paint step and the study wash plan share: the value map of a density, a passage's technique
// from its intent, which drawn lines the pen keeps, soft-edge chains and the target's paper. The light-to-dark value plan
// these came from (light-to-dark.mjs, the per-cell "printing press") was removed in 0.4 and last exists at commit 49447027.
import {TECHNIQUES} from './lay.mjs';
import {normalizePassageMove} from '../techniques/passage-plan.mjs';
import {components} from '../../raster.js';

const VALUE_CAPS = Object.freeze([.16, .32, .50, .75, 1]);

const neighbors = (i,w,n) => [i%w?i-1:-1,i%w<w-1?i+1:-1,i>=w?i-w:-1,i+w<n?i+w:-1].filter(j=>j>=0);

export function targetValueMap(density) {
  if (!density.length || density.some(v=>!Number.isFinite(v)||v<0)) throw Error('finite nonnegative target density required');
  const a=Array.from(density).filter(v=>v>0).sort((a,b)=>a-b);
  const peak=a[Math.min(a.length-1,Math.floor(a.length*.97))]||1;
  const values=Float32Array.from(density,v=>Math.min(1,v/peak));
  const bands=Uint8Array.from(values,v=>v<=0?0:VALUE_CAPS.findIndex(t=>v<=t)+1||5);
  return {peak,values,bands};
}

export function valueTechnique(intent) {
  // An authored dry contact takes precedence over phase, calibration and style defaults.
  if(normalizePassageMove(intent.move)==='dry on dry')return {...TECHNIQUES['dry brush'],water:intent.load?.water??TECHNIQUES['dry brush'].water,valuePlan:intent};
  if(intent.calibratedPlan){
    const wet=intent.move==='wet on wet',shadow=intent.phase==='shadow';
    return {name:wet?'wet on wet':shadow?'glazed':'wet on dry',water:wet?.88:shadow?.58:.62,wetMix:wet?.85:shadow?.3:.55,bridge:wet?.98:shadow?.82:.78,bridgeSoft:wet?3:shadow?2.4:2.2,intoWet:wet,dryAfter:!wet,passes:1,valuePlan:intent};
  }
  if(intent.style){const wetMove=['wet on wet','dry on wet'].includes(intent.move);return {name:wetMove?intent.move:intent.phase==='shadow'?'glazed':'wet on dry',water:intent.load.water,wetMix:intent.wetMix,bridge:intent.bridge,bridgeSoft:intent.bridgeSoft,intoWet:wetMove,dryAfter:!wetMove,passes:1,valuePlan:intent};}
  const wet=intent.move==='wet on wet';return {name:wet?'wet on wet':intent.phase==='shadow'?'glazed':'wet on dry',water:intent.load.water,wetMix:wet?.85:.3,bridge:wet?.98:.82,bridgeSoft:wet?3:2.4,intoWet:wet,dryAfter:!wet,passes:1,valuePlan:intent};
}

// A drawing the plan wrote is drawn as written. The filter in valueInkVerdict is for lines the walker finds.

export const drawsWholeFile=({first=false,fine=false,graphiteFirst=false,drawingFile='',closingFile='',sourceInk=false}={})=>Boolean(sourceInk)||(first&&graphiteFirst&&!!drawingFile)||(!first&&!fine&&!!closingFile);

export function valueInkVerdict(g,{first,w,h,density,reserves=null}){
  const pts=g.points;if(!pts?.length)return 'no points';
  let length=0,contrast=0,count=0,protectedCount=0;
  for(let j=0;j<pts.length;j++){const p=pts[j],x=Math.max(0,Math.min(w-1,Math.round(p.x))),y=Math.max(0,Math.min(h-1,Math.round(p.y))),i=y*w+x;if(j)length+=Math.hypot(p.x-pts[j-1].x,p.y-pts[j-1].y);if(reserves?.[i])protectedCount++;for(const q of neighbors(i,w,w*h))contrast+=Math.abs(density[i]-density[q]);count+=neighbors(i,w,w*h).length;}
  if(protectedCount)return 'reserve';
  if(first)return g.outline||g.tier==='outline'||length/w>=.035?'kept':'short';
  return contrast/Math.max(1,count)>=.06?'kept':'low contrast';
}

export function selectValueInk(paths,{first,w,h,density,reserves=null,sourceInk=false}){
  // Pen contours naturally border paper lights. A wash reserve is not a reason
  // to delete the entire source line, and short marks carry faces and capitals.
  if(sourceInk)return paths.filter(g=>g.points?.length>=2);
  return paths.filter(g=>valueInkVerdict(g,{first,w,h,density,reserves})==='kept');
}

// Connected soft edge chains only; hard boundaries remain dry placement.
export function softBoundaryPaths(cells,w,n){
 const remaining=new Set(cells),paths=[];
 while(remaining.size){let i=remaining.values().next().value;const chain=[];while(remaining.has(i)){remaining.delete(i);chain.push({x:i%w+.5,y:Math.floor(i/w)+.5});const x=i%w,y=Math.floor(i/w),adj=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,j=yy*w+xx;if((dx||dy)&&xx>=0&&xx<w&&yy>=0&&j<n&&remaining.has(j))adj.push(j);}if(!adj.length)break;i=adj[0];}if(chain.length>=3)paths.push(chain);}
 return paths;
}

// The target's paper: the largest connected region among the brightest 4% of cells (luminance), its mean
// colour and mean density. Returns null when that region is under 1% of the sheet (no visible paper).
export function estimatePaper(rgb,w,h,density){
  const n=w*h,lum=Float32Array.from({length:n},(_,i)=>.2126*rgb[3*i]+.7152*rgb[3*i+1]+.0722*rgb[3*i+2]);
  const sorted=Float32Array.from(lum).sort(),cut=sorted[Math.floor(n*.96)]-6;
  const m=Uint8Array.from(lum,v=>v>=cut?1:0),c=components(m,w,h),size=new Uint32Array(c.count+1);
  for(let i=0;i<n;i++)if(c.labels[i])size[c.labels[i]]++;
  let best=0;for(let k=1;k<=c.count;k++)if(size[k]>size[best])best=k;
  if(!best||size[best]<n*.01)return null;
  const sum=[0,0,0];let ds=0;for(let i=0;i<n;i++)if(c.labels[i]===best){for(let q=0;q<3;q++)sum[q]+=rgb[3*i+q];ds+=density[i];}
  let edge=false;for(let i=0;i<n&&!edge;i++)if(c.labels[i]===best){const x=i%w,y=(i/w)|0;if(x===0||y===0||x===w-1||y===h-1)edge=true;}
  return {rgb:sum.map(v=>v/size[best]),density:ds/size[best],cells:size[best],touchesBorder:edge};
}
