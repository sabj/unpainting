const KIT=[["rigger",1.2,"rigger"],["round4",3,"round"],["round8",5,"round"],["round12",7,"round"],["flat1in",25.4,"flat"],["mop",38,"mop"]];
const pathLength=p=>p.reduce((v,q,i)=>v+(i?Math.hypot(q.x-p[i-1].x,q.y-p[i-1].y):0),0);

export function choosePassageBrush(mask,w,h,{mmPerCell,texture=false,referenceCue="",phase="mid"}={}){
 if(!(mmPerCell>0))throw Error("physical cell width required");
 const cells=[];let sx=0,sy=0;
 for(let i=0;i<w*h;i++)if(mask[i]){const x=i%w+.5,y=Math.floor(i/w)+.5;cells.push({x,y});sx+=x;sy+=y;}
 if(!cells.length)return null;
 const cx=sx/cells.length,cy=sy/cells.length;
 let xx=0,yy=0,xy=0;
 for(const q of cells){const x=q.x-cx,y=q.y-cy;xx+=x*x;yy+=y*y;xy+=x*y;}
 const angle=.5*Math.atan2(2*xy,xx-yy),dx=Math.cos(angle),dy=Math.sin(angle);
 const halfCell=.5*(Math.abs(dx)+Math.abs(dy)),slices=new Map();
 let uMin=Infinity,uMax=-Infinity;
 for(const q of cells){
  const x=q.x-cx,y=q.y-cy;
  q.t=x*dx+y*dy;q.u=-x*dy+y*dx;
  uMin=Math.min(uMin,q.u-halfCell);uMax=Math.max(uMax,q.u+halfCell);
  const j=Math.floor(q.t),b=slices.get(j)??[Infinity,-Infinity,0];
  b[0]=Math.min(b[0],q.u-halfCell);b[1]=Math.max(b[1],q.u+halfCell);b[2]++;
  slices.set(j,b);
 }
 const svals=[...slices.values()],widths=svals.map(([a,b])=>b-a).sort((a,b)=>a-b);
 const span=widths[Math.max(0,Math.ceil(.9*widths.length)-1)]*mmPerCell;
 const detail=span<=7;
 // Check whether slices have internal holes/obstacles (span significantly wider than occupied cell count)
 const skeys=[...slices.keys()].sort((a,b)=>a-b);
 const holeSlices=svals.filter(([a,b,n])=>(b-a)>4&&n<.78*(b-a)).length;
 let stepJumps=0;
 for(let i=1;i<skeys.length;i++){
  if(skeys[i]!==skeys[i-1]+1)continue;
  const p=slices.get(skeys[i-1]),c=slices.get(skeys[i]);
  if(Math.abs(c[0]-p[0])>4||Math.abs(c[1]-p[1])>4)stepJumps++;
 }
 const hasObstacle=!detail&&(holeSlices>=2||stepJumps>=1);
 const targetMm=detail?span:hasObstacle?Math.max(3,.45*span):span;
 const [name,sizeMm,shape]=KIT.find(([,size])=>size>=targetMm)??KIT.at(-1);
 const contact=detail?(span<=3?"point":"belly"):shape==="flat"?"side":"belly";
 const radius=sizeMm/(2*mmPerCell),transverseSpan=uMax-uMin;
 const spacing=(hasObstacle?1.45:1.75)*radius;
 const laneCount=Math.max(1,Math.ceil(Math.max(0,transverseSpan-2*radius)/spacing)+1);
 const offsets=Array.from({length:laneCount},(_,j)=>laneCount===1?(uMin+uMax)/2:uMin+radius+j*(transverseSpan-2*radius)/(laneCount-1));
 const laneBand=laneCount===1?radius:Math.min(radius,.65*(transverseSpan/laneCount));
 const step=Math.max(1,Math.min(2,.35*radius)),gapMax=Math.max(2.5*step,2.5),pressure=texture?.35:contact==="point"?.65:.9;
 const paths=[];
 for(const u0 of offsets){
  const st=new Map();
  for(const q of cells){
   if(Math.abs(q.u-u0)>laneBand+halfCell)continue;
   const s=Math.round(q.t/step),e=st.get(s)??{n:0,u:0};
   e.n++;e.u+=q.u;st.set(s,e);
  }
  if(!st.size)continue;
  const keys=[...st.keys()].sort((a,b)=>a-b);
  let run=[];
  const flush=()=>{
   if(!run.length)return;
   const pts=run.map(s=>{
    const t=s*step,uu=detail&&laneCount===1&&!hasObstacle?st.get(s).u/st.get(s).n:u0;
    return {x:cx+dx*t-dy*uu,y:cy+dy*t+dx*uu,r:radius,p:pressure};
   });
   if(pts.length===1)pts.push({...pts[0],x:pts[0].x+dx*.5,y:pts[0].y+dy*.5});
   paths.push(pts);run=[];
  };
  for(const s of keys){
   if(run.length&&(s-run.at(-1))*step>gapMax)flush();
   run.push(s);
  }
  flush();
 }
 if(!paths.length)return null;
 return {name,sizeMm,shape,contact,strokeCount:paths.length,meanLengthMm:paths.reduce((s,p)=>s+pathLength(p)*mmPerCell,0)/paths.length,
 directionSource:"plane orientation",directionRadians:angle,
 reason:`${referenceCue} ${detail?"Small dry value shape: controlled round/liner, length follows the fitted feature.":"Connected value plane: broad contact and few long sweeps along its fitted major axis."} ${phase==="shadow"?"Cross-region glaze retains the connected support.":""}`,
 paths,classification:detail?"detail":"plane",supportWidthMm:span};
}
export function passageBrushPaths(brush,scale=1){return brush.paths.map(ps=>ps.map(p=>({...p,x:p.x*scale,y:p.y*scale,r:p.r*scale})));}
