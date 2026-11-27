import { createSheet } from './sheet.mjs';
import { stroke, strokeReach } from './brush.mjs';
import { invalidatePaperCertificate } from './paper-certificate.mjs';

// Paths, radii and brush reservoir masses use fine-cell units, exactly as for
// stroke() on a native fine sheet. Pigment shares the solver's actual planes.
// Only the contact's film/pore water increments are restricted to coarse cells;
// averaging pigment here would discard the very detail the split grid keeps.
export function strokeFine(F, brush, path, { clip = null, ...options } = {}) {
  if (F._gpuResident) throw new Error('two grids: sync resident GPU state before brush contact');
  if (F.L.steps) throw new Error('two grids: consume the coarse step before brush contact');
  if (options.between) throw new Error('two grids: in-stroke flow requires a coupled fine step');
  if (F.sheet.resist) throw new Error('two grids: fine brush masking-fluid exchange is not implemented');
  if (clip && clip.length !== F.fn) throw new Error('two grids: brush clip must use the fine grid');
  const s = F.sheet, N = F.N, nn = N*N;
  // A sheet without pigments allocates no duplicate palette. The two temporary
  // water allocations are released when the solver's existing scratch is bound.
  const view = F.contact ??= createSheet(F.paper, []);
  Object.assign(view, { pigments: s.pigments, K: F.K, G: F.G, P: F.P, D: F.D,
    layers: F.layers, W: F.wa, s: F.sa, wetting: s.wetting });
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,r=brush.radius;
  for(const q of path){x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y);r=Math.max(r,q.r??r);}
  const reach=strokeReach(brush,F.paper,r), blocks=[];
  const left=Math.max(0,Math.floor((x0-reach)/N)),top=Math.max(0,Math.floor((y0-reach)/N));
  const right=Math.min(s.w-1,Math.floor((x1+reach)/N)),bottom=Math.min(s.h-1,Math.floor((y1+reach)/N));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)blocks.push(y*s.w+x);
  F.prepareContact(blocks);
  view.clip=clip;
  if(!clip&&s.clip)view.clip=F.contactClip??=new Uint8Array(F.fn);
  for(const c of blocks){
    const partial=F.blockMaskCount[c]>0&&F.blockMaskCount[c]<nn;
    for(let a=0;a<nn;a++){
      const f=F.blockCells[c*nn+a];
      F.wb[f]=view.W[f];F.sb[f]=view.s[f];view.M[f]=s.M[c]&&(!partial||F.M[f])?1:0;view.ever[f]=s.ever[c];
      if(!clip&&s.clip)view.clip[f]=s.clip[c];
    }
  }
  try { return stroke(brush,view,path,options); }
  finally {
    let maskChanged=false,everChanged=false;
    for(const c of blocks){
      let wSum=0,ds=0,wetCount=0,everCount=0,ever=0;
      for(let a=0;a<nn;a++){
        const f=F.blockCells[c*nn+a];
        const m=view.M[f]||view.W[f]>0?1:0;
        if(F.M[f]!==m){F.M[f]=m;maskChanged=true;}
        if(m){
          wSum+=view.W[f];wetCount++;
          if(!F.ever[f]){F.ever[f]=1;everChanged=true;}
        }
        if(F.ever[f])everCount++;
        ds+=view.s[f]-F.sb[f];ever|=view.ever[f];
      }
      F.blockMaskCount[c]=wetCount;F.blockEverCount[c]=everCount;
      s.W[c]=wetCount>0?wSum/wetCount:0;s.s[c]+=ds/nn;s.M[c]=wetCount>0?1:0;s.ever[c]=ever;
    }
    if(maskChanged)F.maskVersion++;
    if(everChanged)F.everVersion++;
    s.wetDirty=1;invalidatePaperCertificate(s);
  }
}
