// Planning only. Recover form-following hatch and fur locks as ordinary immutable pen paths.
// Fur uses the q-route's orientation-following idea, without its fitted dog coordinates or target-time reads.
import { gaussian } from '../../keyframes/density.mjs';
import { components } from '../../raster.js';
import { textureDirection, hatch } from '../../crop/hatch.mjs';

export function finishTexture({D,w,h}, {kind, bounds=[0,0,1,1], budget=100, spacing=5, minDensity=.18, reserveBelow=.12}={}) {
  if (!['hatch','fur'].includes(kind)) throw Error('finish texture kind: hatch or fur');
  if (!Array.isArray(bounds)||bounds.length!==4||bounds.some(v=>!Number.isFinite(v)||v<0||v>1)||bounds[0]>=bounds[2]||bounds[1]>=bounds[3]) throw Error('finish texture bounds: [x0,y0,x1,y1] fractions');
  if (!Number.isInteger(budget)||budget<0||budget>1000||!Number.isFinite(spacing)||spacing<2||spacing>30) throw Error('finish texture: budget 0..1000, spacing 2..30 cells');
  if (![minDensity,reserveBelow].every(v=>Number.isFinite(v)&&v>=0&&v<=2)) throw Error('finish texture density: 0..2');
  const need = Float32Array.from(D,(d,i)=>{
    const x=(i%w+.5)/w,y=(Math.floor(i/w)+.5)/h;
    return x>=bounds[0]&&x<bounds[2]&&y>=bounds[1]&&y<bounds[3]&&d>=reserveBelow?d:0;
  });
  const dir=textureDirection(D,w,h,kind==='fur'?3:2.5);
  return hatch(need,dir,w,h,{budget,minNeed:minDensity,minSpacing:spacing,maxSpacing:spacing*2,maxLength:kind==='fur'?70:48,maxTurn:kind==='fur'?1.8:1.2})
    .map(g=>({points:g.points.map(p=>[p.x,p.y]),widths:g.points.map(p=>p.w),weights:g.ink,weight:.6,role:kind==='fur'?'fur lock':'hatch',length:g.length}));
}

// V072 mass-glints recovery: isolated lights in a dark local surround, frozen before washes.
export function furLightReserves({D,w,h}, {bounds=[0,0,1,1], reach=2.5, drop=.55, dark=1, maxDensity=1.1, minCells=2}={}) {
  // Reuse the bounds validator without emitting any paths.
  finishTexture({D,w,h},{kind:'fur',bounds,budget:0});
  if (![reach,drop,dark,maxDensity].every(Number.isFinite)||reach<=0||reach>20||drop<0||dark<0||maxDensity<0||!Number.isInteger(minCells)||minCells<1) throw Error('invalid fur light-reserve settings');
  const B=gaussian(D,w,h,reach*Math.min(w,h)/540);
  const raw=Uint8Array.from(D,(d,i)=>{const x=(i%w+.5)/w,y=(Math.floor(i/w)+.5)/h;return +(x>=bounds[0]&&x<bounds[2]&&y>=bounds[1]&&y<bounds[3]&&B[i]>dark&&B[i]-d>drop&&d<maxDensity);});
  const {labels,areas}=components(raw,w,h);
  return raw.map((v,i)=>v&&areas[labels[i]]>=minCells?1:0);
}
