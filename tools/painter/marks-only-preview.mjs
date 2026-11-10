// Marks-only CPU approximation. No target or pigment-demand raster is accepted.
import {renderLayers} from '../../src/media/km.mjs';
export function createMarkPreview(w,h,pigments,paperRGB,reserves){
 const rgb=Float64Array.from({length:w*h*3},(_,i)=>paperRGB[i%3]);
 const coverage=new Float32Array(w*h);
 return {
  paint(paths,load,{clip}={}){
   const colour=renderLayers([load.map(v=>Float32Array.of(v))],pigments,Uint8Array.of(255,255,255),1,1);
   for(const points of paths){
    let bx0=w,by0=h,bx1=-1,by1=-1;
    const dab=p=>{const r=Math.max(.25,p.r??1),pressure=p.p??1;
     if(pressure<=0)return;
     const rOut=r+.5,rOut2=rOut*rOut,rIn=Math.max(0,r-.5),rIn2=rIn*rIn;
     const y0=Math.max(0,Math.floor(p.y-rOut)),y1=Math.min(h,Math.ceil(p.y+rOut));
     for(let y=y0;y<y1;y++){
      const dy=y+.5-p.y,dy2=dy*dy;
      if(dy2>=rOut2)continue;
      const dxOut=Math.sqrt(rOut2-dy2);
      const x0=Math.max(0,Math.floor(p.x-dxOut)),x1=Math.min(w,Math.ceil(p.x+dxOut));
      if(x0<x1){if(x0<bx0)bx0=x0;if(x1-1>bx1)bx1=x1-1;if(y<by0)by0=y;if(y>by1)by1=y;}
      const row=y*w;
      for(let x=x0;x<x1;x++){
       const i=row+x;
       if(coverage[i]>=pressure||reserves?.[i]||(clip&&!clip[i]))continue;
       const dx=x+.5-p.x,d2=dx*dx+dy2;
       if(d2>=rOut2)continue;
       const a=(d2<=rIn2?1:rOut-Math.sqrt(d2))*pressure;
       if(a>coverage[i])coverage[i]=a;
      }
     }
    };
    let lastDab=null;
    const emitDab=pt=>{dab(pt);lastDab=pt;};
    for(let j=0;j<points.length;j++){
     const b=points[j];
     if(j===0){emitDab(b);continue;}
     const a=points[j-1],segLen=Math.hypot(b.x-a.x,b.y-a.y);
     const minR=Math.max(.25,Math.min(a.r??1,b.r??1)),stepPx=Math.max(.5,minR*.25);
     const distFromLast=Math.hypot(b.x-lastDab.x,b.y-lastDab.y),rDiff=Math.abs((b.r??1)-(lastDab.r??1));
     if(j<points.length-1&&distFromLast<stepPx&&rDiff<stepPx)continue;
     const steps=Math.max(1,Math.ceil(segLen/stepPx));
     for(let s=1;s<=steps;s++){const t=s/steps;emitDab({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,r:(a.r??1)+((b.r??1)-(a.r??1))*t,p:(a.p??1)+((b.p??1)-(a.p??1))*t});}
    }
    // Transparent glaze, ordered by stroke; untouched paper remains exact.
    for(let y=by0;y<=by1;y++)for(let x=bx0;x<=bx1;x++){
     const i=y*w+x,cov=coverage[i];
     if(cov){coverage[i]=0;for(let c=0;c<3;c++)rgb[i*3+c]*=1-cov*(1-colour[c]/255);}
    }
   }
  },
  pixels(){return Uint8ClampedArray.from(rgb);}
 };
}
export function markLoad(layer,shape,k){
 if(shape.mix)return Array.from({length:k},(_,j)=>shape.mix[j]??0);
 return Array.from({length:k},(_,j)=>(shape.amount??layer.amount??0)*(layer.mixv?.[j]??(j===layer.pigment?1:0)));
}
