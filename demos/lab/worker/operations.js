// Sheet-space operation geometry shared by replay, hand tools, and their overlays.
import {applyResist, blot} from '../media/sheet.js';
export const OPERATION_NAMES = {
 mask: 'Masking the lights', unmask: 'Removing the mask', clip: 'Setting the passage boundary',
 unclip: 'Removing the passage boundary', dry: 'Drying the paper', dryer: 'Drying this area',
 lift: 'Lifting paint', blot: 'Blotting', water: 'Rewetting the paper',
 dip: 'Loading the brush', ink: 'Loading the pen', flow: 'Letting the wash settle'
};
export function footprintRect(w, h, a, b, radius) {
 const x=Math.max(0,Math.min(w-1,Math.floor(Math.min(a.x,b.x)-radius))), y=Math.max(0,Math.min(h-1,Math.floor(Math.min(a.y,b.y)-radius)));
 return [x,y,Math.max(0,Math.max(0,Math.min(w-1,Math.ceil(Math.max(a.x,b.x)+radius)))-x+1),Math.max(0,Math.max(0,Math.min(h-1,Math.ceil(Math.max(a.y,b.y)+radius)))-y+1)];
}
export function footprint(w, h, a, b, radius, rect = [0,0,w,h]) {
 const [x0,y0,rw,rh]=rect, mask=new Uint8Array(rw*rh), dx=b.x-a.x, dy=b.y-a.y, d=dx*dx+dy*dy;
 const bounds=footprintRect(w,h,a,b,radius);
 for(let y=Math.max(y0,bounds[1]);y<Math.min(y0+rh,bounds[1]+bounds[3]);y++)
 for(let x=Math.max(x0,bounds[0]);x<Math.min(x0+rw,bounds[0]+bounds[2]);x++){
  const t=d?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/d)):0;
  if(Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<=radius)mask[(y-y0)*rw+x-x0]=1;
 }
 return mask;
}
// Resist is a whole-sheet state transition; mobile paint edits transfer only their footprint.
export async function handToolOperation(sheet, kind, a, b, radius, phys = null, baseR = null) {
 const rect=footprintRect(sheet.w,sheet.h,a,b,radius), mask=footprint(sheet.w,sheet.h,a,b,radius,rect);
 if(!mask.some(Boolean))return {mask,rect};
 if(kind==='mask') {
  let changed=false;
  for(let j=0;j<mask.length;j++)if(mask[j]){const i=(rect[1]+Math.floor(j/rect[2]))*sheet.w+rect[0]+j%rect[2];if(!sheet.resist?.[i]||(sheet.resistStrength&&sheet.resistStrength[i]!==1)){changed=true;break;}}
  if(changed){
   if(phys)await phys.syncAll(sheet,baseR);
   applyHandOperation(sheet,kind,mask,rect);
   if(phys)phys.upload(sheet);
  }
 } else {
  if(phys)await phys.ensureFresh(sheet,rect);
  applyHandOperation(sheet,kind,mask,rect);
  if(phys)phys.up(sheet,rect);
 }
 phys?.finish?.invalidate(false);
 return {mask,rect};
}
export function applyHandOperation(sheet, kind, mask, rect = null) {
 const index=j=>rect?(rect[1]+Math.floor(j/rect[2]))*sheet.w+rect[0]+j%rect[2]:j;
 if(kind==='mask') {
  // Extend the existing film without changing when it was first applied.
  if(!sheet.resist){
   const full=rect?new Uint8Array(sheet.n):mask;
   if(rect)for(let j=0;j<mask.length;j++)if(mask[j])full[index(j)]=1;
   applyResist(sheet,full);
  }
  else for(let j=0;j<mask.length;j++)if(mask[j]){const i=index(j);sheet.resist[i]=1;if(sheet.resistStrength)sheet.resistStrength[i]=1;}
 } else if(kind==='blot')blot(sheet,mask,{rect});
 else if(kind==='lift') {
  // A damp lifting tool removes mobile colour; staining/settled colour remains.
  blot(sheet,mask,{strength:.7,pigmentShare:.9,rect});
  for(let j=0;j<mask.length;j++){const i=index(j);if(mask[j]&&!sheet.resist?.[i])for(let k=0;k<sheet.K;k++)sheet.P[k][i]*=.6;}
 }
}
// Capture *changed cells*, not an idealized circular brush. This also catches dry
// contact, pen spreads, tuft lag, depleted tools, and clips without guessing.
export function watchContact(sheet, rect) {
 const [x,y,w,h]=rect, planes=[sheet.W,sheet.s,...sheet.G,...sheet.P,...sheet.D];
 const before=planes.map(a=>{
  const copy=new Float32Array(w*h);
  for(let row=0;row<h;row++){const start=(y+row)*sheet.w+x;copy.set(a.subarray(start,start+w),row*w);}
  return copy;
 });
 return ()=>{
  const mask=new Uint8Array(w*h);
  for(let row=0;row<h;row++){
   const start=(y+row)*sheet.w+x,offset=row*w;
   for(let col=0;col<w;col++)for(let k=0;k<planes.length;k++)if(planes[k][start+col]!==before[k][offset+col]){mask[offset+col]=1;break;}
  }
  return {x,y,w,h,mask};
 };
}
