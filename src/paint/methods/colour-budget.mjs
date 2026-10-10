// --colourbudget: conserve the division between glaze and dry detail.
// Changes pigment planning and brush charges only; KM and rendered pixels are untouched.
export function recoverWash(M, texture, K) {
  for (let i=0;i<texture.length;i++) for(let j=0;j<K;j++) {
    const q=i*K+j, back=M.Ad[q]*(1-Math.max(0,Math.min(1,texture[i])));
    M.Aw[q]+=back; M.Ad[q]-=back;
  }
}
export function remainingMix(target, held) {
  return Array.from(target,(v,j)=>Math.max(0,v-held[j]));
}

import { splitFirstWash } from './first-wash.mjs';
// splitFirstWash drops or tints value one after blockIn has booked all its pigments, and in a
// premixed puddle that can be its only visit. Keep the opening pale, but schedule its unpaid part
// as a later transparent glaze.
export function deferredFirstWash(layers, { subject, n, open, tint }) {
  const later=layers.filter(l=>l.value===1).map(l=>({...l,shapes:l.shapes.filter(s=>!s.graded).map(s=>({...s,mask:s.mask}))}));
  splitFirstWash(later,{subject,n,open:Math.max(0,1-open),tint:Math.max(0,1-tint)});
  for(const l of later){l.value=2;l.shapes=l.shapes.filter(s=>s._opening>0);for(const s of l.shapes){const f=s._opening;s.amount*=f;s.mix=s.mix.map(v=>v*f);delete s._opening;delete s._fwSoften;}}
  return later.filter(l=>l.shapes.length);
}
