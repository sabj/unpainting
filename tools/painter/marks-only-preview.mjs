// Marks-only CPU approximation. No target or pigment-demand raster is accepted.
import {renderLayers} from '../../src/media/km.mjs';
export function createMarkPreview(w,h,pigments,paperRGB,reserves){
 const rgb=Float64Array.from({length:w*h*3},(_,i)=>paperRGB[i%3]);
 return {
  paint(paths,load,{clip}={}){
   const colour=renderLayers([load.map(v=>Float32Array.of(v))],pigments,Uint8Array.of(255,255,255),1,1);
   for(const points of paths){
    const coverage=new Float32Array(w*h);
    const dab=p=>{const r=Math.max(.25,p.r??1),pressure=p.p??1;
     for(let y=Math.max(0,Math.floor(p.y-r-1));y<Math.min(h,Math.ceil(p.y+r+1));y++)for(let x=Math.max(0,Math.floor(p.x-r-1));x<Math.min(w,Math.ceil(p.x+r+1));x++){
      const i=y*w+x;if(reserves?.[i]||(clip&&!clip[i]))continue;
      const a=Math.max(0,Math.min(1,r+.5-Math.hypot(x+.5-p.x,y+.5-p.y)))*pressure;
      coverage[i]=Math.max(coverage[i],a);
     }
    };
    for(let j=0;j<points.length;j++){const b=points[j],a=points[j-1]??b,steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*2));
     for(let s=0;s<=steps;s++){const t=s/steps;dab({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,r:(a.r??1)+((b.r??1)-(a.r??1))*t,p:(a.p??1)+((b.p??1)-(a.p??1))*t});}
    }
    // Transparent glaze, ordered by stroke; untouched paper remains exact.
    for(let i=0;i<w*h;i++)if(coverage[i])for(let c=0;c<3;c++)rgb[i*3+c]*=1-coverage[i]*(1-colour[c]/255);
   }
  },
  pixels(){return Uint8ClampedArray.from(rgb);}
 };
}
export function markLoad(layer,shape,k){
 if(shape.mix)return Array.from({length:k},(_,j)=>shape.mix[j]??0);
 return Array.from({length:k},(_,j)=>(shape.amount??layer.amount??0)*(layer.mixv?.[j]??(j===layer.pigment?1:0)));
}
