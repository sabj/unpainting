// Sheet-space operation geometry shared by replay, hand tools, and their overlays.
import {applyResist, blot} from '../media/sheet.js';
export const OPERATION_NAMES = {
 mask: 'Masking the lights', unmask: 'Removing the mask', clip: 'Setting the passage boundary',
 unclip: 'Removing the passage boundary', dry: 'Drying the paper', dryer: 'Drying this area',
 lift: 'Lifting paint', blot: 'Blotting', water: 'Rewetting the paper',
 dip: 'Loading the brush', ink: 'Loading the pen', flow: 'Letting the wash settle'
};
export function footprint(w, h, a, b, radius) {
 const mask = new Uint8Array(w*h), dx=b.x-a.x, dy=b.y-a.y, d=dx*dx+dy*dy;
 for(let y=Math.max(0,Math.floor(Math.min(a.y,b.y)-radius));y<=Math.min(h-1,Math.ceil(Math.max(a.y,b.y)+radius));y++)
 for(let x=Math.max(0,Math.floor(Math.min(a.x,b.x)-radius));x<=Math.min(w-1,Math.ceil(Math.max(a.x,b.x)+radius));x++){
  const t=d?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/d)):0;
  if(Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<=radius)mask[y*w+x]=1;
 }
 return mask;
}
export function applyHandOperation(sheet, kind, mask) {
 if(kind==='mask') {
  // Extend the existing film without changing when it was first applied.
  if(!sheet.resist)applyResist(sheet,mask);
  else for(let i=0;i<sheet.n;i++)if(mask[i]){sheet.resist[i]=1;if(sheet.resistStrength)sheet.resistStrength[i]=1;}
 } else if(kind==='blot')blot(sheet,mask);
 else if(kind==='lift') {
  // A damp lifting tool removes mobile colour; staining/settled colour remains.
  blot(sheet,mask,{strength:.7,pigmentShare:.9});
  for(let i=0;i<sheet.n;i++)if(mask[i]&&!sheet.resist?.[i])for(let k=0;k<sheet.K;k++)sheet.P[k][i]*=.6;
 }
}
// Capture *changed cells*, not an idealized circular brush. This also catches dry
// contact, pen spreads, tuft lag, depleted tools, and clips without guessing.
export function watchContact(sheet, rect) {
 const [x,y,w,h]=rect, planes=[sheet.W,sheet.s,...sheet.G,...sheet.P,...sheet.D];
 const before=planes.map(a=>Float32Array.from({length:w*h},(_,j)=>a[(y+Math.floor(j/w))*sheet.w+x+j%w]));
 return ()=>{
  const mask=new Uint8Array(w*h);
  for(let j=0;j<mask.length;j++){const i=(y+Math.floor(j/w))*sheet.w+x+j%w;for(let k=0;k<planes.length;k++)if(planes[k][i]!==before[k][j]){mask[j]=1;break;}}
  return {x,y,w,h,mask};
 };
}
