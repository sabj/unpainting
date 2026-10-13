// Preserve the material pen's physical caps and dry-contact audit on a finer ink sheet.
import { drawMaterial } from './material-profiles.mjs';
export function drawFineMaterial(fineInk, gestures, {w,h,edgeStrength,...options}) {
 const N=fineInk.N, fw=w*N, fh=h*N;
 const edge=edgeStrength&&Float32Array.from({length:fw*fh},(_,i)=>edgeStrength[Math.floor(Math.floor(i/fw)/N)*w+Math.floor(i%fw/N)]);
 const paths=gestures.map(g=>({...g,points:g.points.map(p=>({...p,x:(p.x+.5)*N-.5,y:(p.y+.5)*N-.5,...(p.nw==null?{}:{nw:p.nw*N}),...(p.v==null?{}:{v:p.v*N})}))}));
 fineInk.wet();
 const start=Date.now();
 const r=drawMaterial(fineInk.fine,paths,new Float32Array(1),fw,fh,{...options,mmPerCell:options.mmPerCell/N,edgeStrength:edge});
 fineInk.carry(); fineInk.stats.calls++;fineInk.stats.ms+=Date.now()-start;
 return r;
}
