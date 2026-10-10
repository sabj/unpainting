// Cirrus lifted out of a wet sky wash with clean tissue: per-pixel pressure from the reference, then graded presses.
import { gaussian } from '../../keyframes/density.mjs';

const smooth = (lo,hi,v) => {const t=Math.max(0,Math.min(1,(v-lo)/(hi-lo)));return t*t*(3-2*t);};

/** Tissue pressure 0..1 per pixel: bright neutral cirrus is lifted with clean tissue while the wash
 * still carries a removable film. Blue sky gets no contact; transition pixels get gradually lighter contact.
 */
export function cloudTissuePressure({px,w,h,mask=null,sigma=1.4}) {
  if(px.length!==w*h*3 || mask && mask.length!==w*h) throw Error('Cloud reference dimensions mismatch');
  if(!Number.isFinite(sigma)||sigma<0)throw Error('Cloud pressure sigma must be nonnegative');
  const raw=new Float32Array(w*h);
  for(let i=0;i<raw.length;i++){
    if(mask&&!mask[i])continue;
    const r=px[3*i],g=px[3*i+1],b=px[3*i+2],L=.2126*r+.7152*g+.0722*b;
    raw[i]=smooth(105,215,L)*smooth(.53,.90,r/Math.max(1,b));
  }
  const pressure=sigma?gaussian(raw,w,h,sigma):raw;
  for(let i=0;i<pressure.length;i++)pressure[i]=mask&&!mask[i]?0:Math.max(0,Math.min(1,pressure[i]));
  return pressure;
}

/** Six boolean tissue contacts: strong cores receive all presses, feathered edges fewer and gentler ones.
 * All six take 80% of a wet core's water and 82% of its film pigment, without flow between them.
 * Fractional masks must never be passed to sheet.blot.
 */
export function cloudTissuePresses(pressure) {
  for(const p of pressure)if(!Number.isFinite(p)||p<0||p>1)throw Error('Cloud pressure outside0..1');
  const weights=[1,1.2,1.4,1.6,1.8,2],total=9;
  return weights.map((weight,k)=>{
    const threshold=(k+.5)/6,mask=Uint8Array.from(pressure,p=>p>=threshold?1:0);
    return {level:k+1,threshold,mask,strength:1-Math.pow(.2,weight/total),pigmentShare:1-Math.pow(.18,weight/total)};
  });
}

/** Lays the presses through the supplied blot function, the only thing that changes the sheet.
 * The caller keeps its own flow, settling, grain and drying schedule.
 */
export function pressCloudTissue({sheet,pressure,blot,record=()=>{}}) {
  if(pressure.length!==sheet.n)throw Error('Cloud pressure must match physical sheet');
  const total={water:0,pigment:new Array(sheet.K).fill(0)},presses=[];
  for(const touch of cloudTissuePresses(pressure)){
    let cells=0,sum=0,min=1,max=0;
    for(let i=0;i<pressure.length;i++)if(touch.mask[i]){cells++;sum+=pressure[i];min=Math.min(min,pressure[i]);max=Math.max(max,pressure[i]);}
    if(!cells)continue;
    const taken=blot(sheet,touch.mask,{strength:touch.strength,pigmentShare:touch.pigmentShare});
    if(!Number.isFinite(taken.water)||taken.pigment.length!==sheet.K||taken.pigment.some(v=>!Number.isFinite(v)))throw Error('Nonfinite physical tissue removal');
    total.water+=taken.water;for(let k=0;k<sheet.K;k++)total.pigment[k]+=taken.pigment[k];
    const audit={event:'graded-cloud-tissue-contact',referenceCue:'bright neutral/warm cirrus against blue sky',technique:'lift wet film with clean tissue',instrument:'fresh tissue contact',level:touch.level,threshold:touch.threshold,cells,pressure:{min,max,mean:sum/cells},strength:touch.strength,pigmentShare:touch.pigmentShare,taken};
    presses.push(audit);record(audit);
  }
  return {...total,presses};
}
