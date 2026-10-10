// Region plan and brush paths for the architecture passage. Regions are data (normalized polygons and colour
// filters from the reference spec); this planner never contains scene coordinates.
export function inPolygon(x,y,points) {
  let inside=false;
  for(let a=0,b=points.length-1;a<points.length;b=a++) {
    const p=points[a],q=points[b];
    if((p[1]>y)!==(q[1]>y)&&x<(q[0]-p[0])*(y-p[1])/(q[1]-p[1])+p[0])inside=!inside;
  }
  return inside;
}
const lum=(r,g,b)=>.2126*r+.7152*g+.0722*b;
export function matches(rgb,rule={}) {
  const [r,g,b]=rgb,L=lum(r,g,b);
  return (rule.minL===undefined||L>=rule.minL)&&(rule.maxL===undefined||L<=rule.maxL)&&
    (rule.minRG===undefined||r/Math.max(1,g)>=rule.minRG)&&(rule.maxRG===undefined||r/Math.max(1,g)<=rule.maxRG)&&
    (rule.minGB===undefined||g/Math.max(1,b)>=rule.minGB)&&(rule.maxGB===undefined||g/Math.max(1,b)<=rule.maxGB)&&
    (rule.minRB===undefined||r/Math.max(1,b)>=rule.minRB)&&(rule.maxRB===undefined||r/Math.max(1,b)<=rule.maxRB);
}
export function buildRegionPlan({w,h,px,spec}) {
  if(spec.version!==1||!spec.regions?.length)throw Error('Architecture plan version1 and regions required');
  const n=w*h,owner=new Int16Array(n).fill(-1),reserved=new Uint8Array(n);
  for(const [k,r]of spec.regions.entries()) {
    if(!r.id||!r.cue||!r.move||!r.brushMm||!r.polygon?.length)throw Error('Region needs id,cue,move,brushMm,polygon');
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const i=y*w+x;if(!inPolygon((x+.5)/w,(y+.5)/h,r.polygon))continue;
      const rgb=Array.from(px.slice(i*3,i*3+3));
      if(matches(rgb,r.filter))owner[i]=k;
    }
  }
  // A reference-read physical plane may span many pixel colors. Explicit
  // ownership beats broad color classifiers, but retains the target region's
  // reserves, technique and later shadow/ink treatment.
  const overrides=spec.ownershipOverrides??[];
  if(!Array.isArray(overrides))throw Error('ownershipOverrides must be an array');
  const overrideIds=new Set();
  for(const override of overrides){
    const k=spec.regions.findIndex(r=>r.id===override.region);
    if(!override.id||overrideIds.has(override.id)||!override.cue||k<0)
      throw Error('Ownership override needs unique id, cue and existing region');
    overrideIds.add(override.id);
    const polygon=override.polygon;
    if(!Array.isArray(polygon)||polygon.length<3||polygon.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1)))
      throw Error('Ownership override needs normalized finite polygon');
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)
      if(inPolygon((x+.5)/w,(y+.5)/h,polygon))owner[y*w+x]=k;
  }
  const regions=spec.regions.map((r,k)=>{
    const mask=new Uint8Array(n),cells=[];let x0=w,y0=h,x1=-1,y1=-1;
    for(let i=0;i<n;i++)if(owner[i]===k){const rgb=Array.from(px.slice(i*3,i*3+3));if(r.reserve&&matches(rgb,r.reserve)){reserved[i]=1;continue;}mask[i]=1;cells.push(i);const x=i%w,y=(i/w)|0;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    const planeOverrides=overrides.filter(o=>o.region===r.id);
    return {...r,...(planeOverrides.length?{ownershipOverrides:planeOverrides}:{}),mask,cells,bounds:[x0,y0,x1,y1]};
  }).filter(r=>r.cells.length);
  return {regions,reserved,owned:Uint8Array.from(owner,k=>k>=0?1:0)};
}
// One connected wet edge: alternating loaded sweeps overlap by the brush radius.
// Smaller architectural planes use the same path builder inside their actual mask.
export function passagePaths(mask,w,h,radius,bounds) {
  const [x0,y0,x1,y1]=bounds,out=[];let row=0;
  const gap=Math.max(1,radius*.95);
  for(let yy=y0;yy<=y1+.01;yy+=gap){const y=Math.min(y1,Math.round(yy));let x=x0;
    while(x<=x1){while(x<=x1&&!mask[y*w+x])x++;if(x>x1)break;const a=x;while(x<=x1&&mask[y*w+x])x++;let b=x-1;
      // Keep one loaded gesture across a narrow reserved gap; the physical clip
      // still protects the light. Avoid thousands of one-cell color fragments.
      while(x<=x1){let next=x;while(next<=x1&&!mask[y*w+next])next++;if(next>x1||next-b>2*radius)break;x=next;while(x<=x1&&mask[y*w+x])x++;b=x-1;}
      if(b-a<1){out.push([{x:a+.5,y:y+.5,p:.9},{x:b+1,y:y+.5,p:.9}]);continue;}
      const length=Math.max(radius*4,12);
      for(let left=a;left<=b;left+=length){const right=Math.min(b,left+length+radius*.5);const path=[{x:left+.5,y:y+.5,p:.9},{x:(left+right)/2+.5,y:y+.5,p:1},{x:right+.5,y:y+.5,p:.9}];out.push(row%2?path.reverse():path);}
    }row++;
  }
  return out;
}

// Curved wrist sweeps at two crossing angles, the same lanes as sky.mjs.
export function curvedSkyPaths(mask,w,h,radius){
const W2=w,H2=h,num=(_,fallback)=>fallback;
  const arcLanes = (M, Rad, angle, seed) => {
    let s = (seed * 7919 + 13) % 2147483647; if (s <= 0) s += 2147483646;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const ca = Math.cos(angle), sa = Math.sin(angle), nx = -sa, ny = ca;
    let lo = Infinity, hi = -Infinity, alo = Infinity, ahi = -Infinity;
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) if (M[y * W2 + x]) {
      const t = x * nx + y * ny, u = x * ca + y * sa;
      if (t < lo) lo = t; if (t > hi) hi = t; if (u < alo) alo = u; if (u > ahi) ahi = u;
    }
    if (!(hi >= lo)) return [];
    const gap = Math.max(2, num('skygap', 1.05) * Rad), stepLen = Math.max(2, Rad / 4), paths = [];
    let k = 0;
    for (let t = lo + gap * (0.25 + 0.5 * rnd()); t <= hi; t += gap * (0.82 + 0.36 * rnd()), k++) {
      const runs = []; let a = null, b = null;
      for (let u = alo; u <= ahi; u += 1) {
        const x = Math.round(t * nx + u * ca), y = Math.round(t * ny + u * sa);
        const inside = x >= 0 && y >= 0 && x < W2 && y < H2 && M[y * W2 + x];
        if (inside) { if (a === null) a = u; b = u; }
        else if (a !== null && u - b > 1.2 * Rad) { runs.push([a, b]); a = null; }
      }
      if (a !== null) runs.push([a, b]);
      const forward = k % 2 === 0;
      for (const [u0r, u1r] of (forward ? runs : runs.slice().reverse())) {
        // the ends: sometimes a little short of the shape, sometimes a little past it, never on the same line twice
        const jit = num('skyendjit', 0.55) * Rad;
        const u0 = u0r - jit * (rnd() - 0.45), u1 = u1r + jit * (rnd() - 0.45), len = u1 - u0;
        if (len < Rad * 0.7) continue;
        const bow = Rad * num('skyarc', 0.55) * (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd());
        const wob = Rad * num('skywob', 0.22), ph = rnd() * 6.283, ph2 = rnd() * 6.283;
        const pts = [];
        for (let d = 0; d <= len + 1e-6; d += stepLen) {
          const dd = Math.min(d, len), v = dd / len;
          const u = forward ? u0 + dd : u1 - dd;
          const off = bow * Math.sin(Math.PI * v) + wob * Math.sin(v * 4.2 + ph) + 0.6 * wob * Math.sin(v * 9.1 + ph2);
          const r = Math.max(0.3 * Rad, Rad * (0.42 + 0.58 * Math.sin(Math.PI * v) ** 0.5));
          pts.push({ x: t * nx + u * ca + off * nx, y: t * ny + u * sa + off * ny, r, p: 1 });
        }
        if (pts.length >= 2) paths.push(pts);
      }
    }
    return paths;
  };
const out=[];
for(const path of [...arcLanes(mask,radius,.24,71),...arcLanes(mask,radius,1.26,84)]){
  const total=path.reduce((sum,p,i)=>sum+(i?Math.hypot(p.x-path[i-1].x,p.y-path[i-1].y):0),0)||1;
  let run=0,chunk=[],distance=0;
  for(let i=0;i<path.length;i++){
    const p=path[i],d=i?Math.hypot(p.x-path[i-1].x,p.y-path[i-1].y):0;run+=d;distance+=d;
    const u=run/total,point={...p,p:Math.max(.18,Math.min(1,u/.06,(1-u)/.1))};
    if(distance>=radius&&chunk.length>1){out.push(chunk);chunk=[chunk.at(-1)];distance=0;}
    chunk.push(point);
  }
  if(chunk.length>1)out.push(chunk);
}
return out;
}

// Clean water reaches the entire future contact, including pressure-tapered ends.
export function waterMopPath(points,radius,{extendEnds=false}={}){
 const out=points.map(p=>({...p,r:Math.max(radius,p.r??radius)*1.4,p:1}));
 if(extendEnds&&out.length>1){
  const a=out[0],b=out.at(-1),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
  // A flat mop broadens across its heading. A short clean-water sweep must also
  // reach the longitudinal ends of the conservative future color contact.
  if(d>0&&d<2*radius){a.x-=radius*dx/d;a.y-=radius*dy/d;b.x+=radius*dx/d;b.y+=radius*dy/d;}
 }
 return out;
}

export function regionContactMode(region,filmDefault=false) {
 const mode=region.contactMode??(filmDefault?'film':'bristle');
 if(!['film','bristle'].includes(mode))throw Error('Unknown contactMode: '+mode);
 return mode;
}
