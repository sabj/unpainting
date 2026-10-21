// Preserve the material pen's physical caps and dry-contact audit on a finer ink sheet.
// Inking pipeline, stage: the pen on the fine sheet (--inkres N).
import { drawMaterial } from './material-profiles.mjs';

/** The planned gestures on the fine sheet: positions, contact widths and speeds N times as large, in fine cells. */
export function fineGestures(gestures, N) {
 return gestures.map(g=>({...g,points:g.points.map(p=>({...p,x:(p.x+.5)*N-.5,y:(p.y+.5)*N-.5,...(p.nw==null?{}:{nw:p.nw*N}),...(p.v==null?{}:{v:p.v*N})}))}));
}

/**
 * The pen's instrument settings on a sheet N times as fine: sizes (travel, reach) N times, volumes (reservoir, feed,
 * drop) N squared, as makeInkRes does, so a fine line is fed as a coarse one was. Defaults are the pen's own.
 */
export function finePen(pen={},N){
 return {...pen,travel:(pen.travel??1.5)*N,reach:(pen.reach??12)*N,reservoir:(pen.reservoir??250)*N*N,feed:(pen.feed??1.2)*N*N};
}

/** The nib's first drop: drawMaterial's .1, N squared on the fine sheet. */
export const fineDrop=N=>.1*N*N;

/** drawMaterial on a sheet N times as fine as the plan's grid (w x h); `edgeStrength` is on the plan's grid. */
export function drawOnFineSheet(sheet, N, gestures, {w,h,edgeStrength,...options}) {
 const fw=w*N, fh=h*N;
 const edge=edgeStrength&&Float32Array.from({length:fw*fh},(_,i)=>edgeStrength[Math.floor(Math.floor(i/fw)/N)*w+Math.floor(i%fw/N)]);
 return drawMaterial(sheet,fineGestures(gestures,N),new Float32Array(1),fw,fh,{...options,pen:finePen(options.pen,N),dropSize:fineDrop(N),drySheet:dryFootprint,mmPerCell:options.mmPerCell/N,edgeStrength:edge});
}

/**
 * Dry the fine sheet under the nib, and only there. The fine sheet has no water flow: wet ink in a cell is settled where it
 * lies, as the whole-sheet dry would settle it, but without that dry's full-sheet pass and its new full-size layer, which
 * a hand's run of neighbouring strokes would otherwise pay on every stroke. The sheet is fixed once, by settle().
 */
export function dryFootprint(sheet,max,o,opts,footprint){
 const [x0,y0,fw,fh]=footprint;
 for(let y=y0;y<y0+fh;y++)for(let x=x0;x<x0+fw;x++){
  const i=y*sheet.w+x;
  sheet.W[i]=0;sheet.s[i]=0;sheet.M[i]=0;
  for(let k=0;k<sheet.K;k++){sheet.D[k][i]+=sheet.G[k][i]+sheet.P[k][i];sheet.G[k][i]=0;sheet.P[k][i]=0;}
 }
 sheet.wetDirty=1;
 return 0;
}

export function drawFineMaterial(fineInk, gestures, options) {
 fineInk.wet();
 const start=Date.now();
 const r=drawOnFineSheet(fineInk.fine,fineInk.N,gestures,options);
 fineInk.carry(); fineInk.stats.calls++;fineInk.stats.ms+=Date.now()-start;
 return r;
}
