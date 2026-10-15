// Geometry of shaped plane marks, shared by planner and executor: one flat-brush gesture per plane, short texture marks
// and sky lanes. A physical contact clip retains concavities, recesses and reserved lights.
export function shapedPlanePaths(mask,w,h,{scale=1,texture=false,shortMm=0,shortPress=.3,lanesR=0,laneStep=1.5,flowDark=1,box=null,mmPerCell=0,maxBrushMm=38}={}) {
 // An authored per-passage tool choice is shared with every geometry consumer.
 if(mask.passageBrush)return mask.passageBrush.paths.map(ps=>ps.map(p=>({...p,x:p.x*scale,y:p.y*scale,r:p.r*scale}))); 
 // lanesR: a large sky plane is one wet passage of overlapping horizontal lanes (a graded band wash with a wide flat),
 // not one fitted diagonal gesture, whose straight sides leave wedges and streaks.
 if(lanesR>0&&!texture)return skyLanes(mask,w,h,lanesR,scale,laneStep);
 const x0=box?.x0??0,x1=box?.x1??w-1,y0=box?.y0??0,y1=box?.y1??h-1;
 let count=0,sx=0,sy=0,sxx=0,syy=0,sxy=0;
 for(let row=y0;row<=y1;row++)for(let i=row*w+x0,end=row*w+x1;i<=end;i++)if(mask[i]){const x=i%w+.5,y=Math.floor(i/w)+.5;count++;sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;}
 if(count<4)return [];
 const cx=sx/count,cy=sy/count,a=sxx/count-cx*cx,b=syy/count-cy*cy,c=sxy/count-cx*cy;
 const angle=.5*Math.atan2(2*c,a-b),dx=Math.cos(angle),dy=Math.sin(angle);
 // Dry-brush texture as short marks (stubble, rough stone): a small brush flicked along the
 // plane's long axis (the jaw line on a beard band), sparse on a jittered grid, light pressure.
 if(texture&&shortMm>0)return shortTextureMarks(mask,w,h,dx,dy,shortMm,scale,shortPress,flowDark);
 let lo=Infinity,hi=-Infinity;
 const bins=new Map();
 for(let row=y0;row<=y1;row++)for(let i=row*w+x0,end=row*w+x1;i<=end;i++)if(mask[i]){const x=i%w+.5-cx,y=Math.floor(i/w)+.5-cy,t=x*dx+y*dy,u=-x*dy+y*dx,j=Math.round(t),bin=bins.get(j)??[Infinity,-Infinity];bin[0]=Math.min(bin[0],u-.75);bin[1]=Math.max(bin[1],u+.75);bins.set(j,bin);lo=Math.min(lo,j);hi=Math.max(hi,j);}
 const points=[];
 for(let j=lo;j<=hi;j++){const bin=bins.get(j);if(!bin)continue;let sum=0,num=0;for(let q=j-3;q<=j+3;q++){const v=bins.get(q);if(v){sum+=(v[0]+v[1])/2;num++;}}const u=sum/num,r=Math.max(1,(bin[1]-bin[0])/2);points.push({x:(cx+dx*j-dy*u)*scale,y:(cy+dy*j+dx*u)*scale,r:r*scale,p:texture?.35:.9});}
 if(points.length<2)return [];
 // Split against the real mop width; changing native density must not change physical brush selection.
 const maxRadius=Math.max(...points.map(p=>p.r/scale));
 if(!texture&&mmPerCell>0&&maxBrushMm>0){
  const lanes=Math.ceil(2*maxRadius*mmPerCell/maxBrushMm);
  if(lanes>1)return Array.from({length:lanes},(_,k)=>points.map(p=>{
   const offset=(k-(lanes-1)/2)*2*p.r/lanes;
   return {...p,x:p.x-dy*offset,y:p.y+dx*offset,r:Math.min(maxBrushMm/(2*mmPerCell)*scale,p.r/lanes*1.18)};
  }));
 }
 return [points];
}

// Tiny same-value fragments join an adjacent plane only across a weak target edge.
// Hard window/face boundaries are never bridged; remaining fragments are omitted.
export function mergePlaneFragments(labels,w,h,rgb,minimum=144){
 const out=labels.slice(),seen=new Uint8Array(labels.length),queue=[];
 for(let s=0;s<labels.length;s++)if(!seen[s]){queue.length=0;queue.push(s);seen[s]=1;const votes=new Map();
  for(let p=0;p<queue.length;p++){const i=queue[p],x=i%w;for(const j of [x?i-1:-1,x<w-1?i+1:-1,i>=w?i-w:-1,i+w<labels.length?i+w:-1])if(j>=0){if(labels[j]===labels[s]){if(!seen[j]){seen[j]=1;queue.push(j);}}else if(rgb){const va=.2126*rgb[i*3]+.7152*rgb[i*3+1]+.0722*rgb[i*3+2],vb=.2126*rgb[j*3]+.7152*rgb[j*3+1]+.0722*rgb[j*3+2];if(Math.abs(va-vb)<12&&Math.max(...[0,1,2].map(q=>Math.abs(rgb[i*3+q]-rgb[j*3+q])))<24)votes.set(labels[j],(votes.get(labels[j])??0)+1);}}}
  if(queue.length<minimum&&votes.size){const winner=[...votes].sort((a,b)=>b[1]-a[1])[0][0];for(const i of queue)out[i]=winner;}
 }
 return out;
}

// texVariety v (0..1, 0 off): short marks vary in angle (tilt range .5 + 2v rad), length, pressure and spacing. A share
// .3v of grid points is skipped, so stubble and rough stone do not read as even parallel hatching.
let TEX_VARIETY=0;export function setTextureVariety(v){TEX_VARIETY=Math.max(0,Math.min(1,v||0));}
// texFlow: each short mark follows the local form contour, along the iso-lines of the reference's value smoothed over
// ~2 mm, with a small tilt. The field is planned before painting and holds directions only. Mark density over a shape
// is one number per shape (flowDark), not read from the target per mark.
let TEX_FLOW=null;export function setTextureFlow(f){TEX_FLOW=f;}
/** Unit tangents along the value contours of a smoothed luminance field; zero where it is flatter than minGrad. */
export function flowField(L,w,h,{minGrad=1.5,density=1}={}){
 const tx=new Float32Array(w*h),ty=new Float32Array(w*h);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,gx=L[i+1]-L[i-1],gy=L[i+w]-L[i-w],m=Math.hypot(gx,gy);if(m<minGrad)continue;tx[i]=-gy/m;ty[i]=gx/m;}
 return {w,h,tx,ty,density};
}
function flowDir(x,y,w,h,dx,dy){const F=TEX_FLOW;if(!F||F.w!==w||F.h!==h)return [dx,dy];const xi=Math.min(w-2,Math.max(1,Math.round(x))),yi=Math.min(h-2,Math.max(1,Math.round(y))),i=yi*w+xi;
 let tx=F.tx[i],ty=F.ty[i];if(!tx&&!ty)return [dx,dy];if(tx*dx+ty*dy<0){tx=-tx;ty=-ty;}return [tx,ty];}
function shortTextureMarks(mask,w,h,dx,dy,mmPerCell,scale,press=.3,flowDark=1){const v=TEX_VARIETY;
 const L=2.6/mmPerCell,sp=1.5/mmPerCell,r=Math.max(.6,.3/mmPerCell),out=[];
 const hash=(x,y)=>{let v=Math.sin(x*12.9898+y*78.233)*43758.5453;return v-Math.floor(v);};
 for(let gy=sp/2;gy<h;gy+=sp)for(let gx=sp/2;gx<w;gx+=sp){
  const x=gx+(hash(gx,gy)-.5)*sp*.8,y=gy+(hash(gy,gx)-.5)*sp*.8,i=Math.floor(y)*w+Math.floor(x);if(x<0||y<0||x>=w||y>=h||!mask[i])continue;if(v>0&&hash(gx+2,gy+3)<.3*v)continue;
  const [fx,fy]=flowDir(x,y,w,h,dx,dy);if(TEX_FLOW&&hash(gx+7,gy+11)>Math.min(1,TEX_FLOW.density*flowDark))continue;
  const tilt=(hash(gx+1,gy)-.5)*(TEX_FLOW?.3:(.5+2*v)),ux=fx*Math.cos(tilt)-fy*Math.sin(tilt),uy=fx*Math.sin(tilt)+fy*Math.cos(tilt),len=L*(v>0?.4+1.1*hash(gx,gy+1):.7+.6*hash(gx,gy+1)),pk=v>0?press*(.6+.8*hash(gx+5,gy+7)):press,n=Math.max(3,Math.ceil(len));
  const pts=[];for(let k=0;k<=n;k++){const t=k/n-.5;pts.push({x:(x+ux*len*t)*scale,y:(y+uy*len*t)*scale,r:r*scale*(k===0||k===n?.6:1),p:pk});}
  out.push(pts);}
 return out;
}

function skyLanes(mask,w,h,r,scale,laneStep=1.5){
 let y0=h,y1=-1;for(let i=0;i<mask.length;i++)if(mask[i]){const y=(i/w)|0;if(y<y0)y0=y;if(y>y1)y1=y;}
 const out=[],step=Math.max(1,laneStep*r);let dir=1;
 for(let y=y0+r*.6;y<=y1;y+=step){const row=Math.round(y);let x=0;const runs=[];
  while(x<w){while(x<w&&!mask[row*w+x])x++;const a=x;while(x<w&&mask[row*w+x])x++;if(x-a>=3)runs.push([a,x-1]);}
  // join runs separated by small gaps (cloud specks stay reserved by the contact clip)
  const joined=[];for(const q of runs){const last=joined.at(-1);if(last&&q[0]-last[1]<=2*r)last[1]=q[1];else joined.push([...q]);}
  for(const [a,b] of joined){const n=Math.max(2,Math.ceil((b-a)/Math.max(1,r*.5)));const pts=[];for(let k=0;k<=n;k++){const t=dir>0?k/n:1-k/n;pts.push({x:(a+(b-a)*t+.5)*scale,y:(y+.5)*scale,r:r*scale,p:.85});}out.push(pts);}
  dir=-dir;}
 return out;
}
