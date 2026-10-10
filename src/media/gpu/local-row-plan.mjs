import { sideReach, edgeTooth, varyPath } from '../brush.mjs';
// Conservative packed ROW plan bound on the local sheet. All source sample
// steps remain in the plan, including empty steps and their original flows.
export function localRowPlanBound(brush,sheet,path,{spacing=.7,upright=false,lift=true}={},limit=3900000) {
  path=varyPath(brush,path,sheet.paper,lift); // the path the stroke will lay (brush.mjs varyPath)
  const lanes=brush.hairs.length,K=sheet.K,sp=16+brush.clumps.length;
  let words=272+(lanes+2)*(4+K),steps=0,rowCandidates=0,emptySteps=0;
  const result=()=>({eligible:words<limit,words,steps,rowCandidates,emptySteps});
  if(!(spacing>0&&Number.isFinite(spacing))||!Number.isFinite(brush.carry)||brush.carry<0)return {eligible:false,words:Infinity,steps:0,rowCandidates:0,emptySteps:0};
  let hx=0,hy=1;
  if(upright==='sweep'&&path.length>1){const ex=path.at(-1).x-path[0].x,ey=path.at(-1).y-path[0].y,em=Math.hypot(ex,ey);if(em>1e-6){hx=ex/em;hy=ey/em;}}
  let t=brush.carry,k=1;
  while(k<path.length){
    const a=path[k-1],b=path[k],seg=Math.hypot(b.x-a.x,b.y-a.y)||1e-6;
    if(!Number.isFinite(seg))return {eligible:false,words:Infinity,steps,rowCandidates,emptySteps};
    if(t>seg){t-=seg;k++;continue;}
    const u=t/seg,x=a.x+(b.x-a.x)*u,y=a.y+(b.y-a.y)*u,p=(a.p??1)+((b.p??1)-(a.p??1))*u;
    const tx=upright?hx:(b.x-a.x)/seg,ty=upright?hy:(b.y-a.y)/seg,nx=-ty,ny=tx;
    const radius=a.r===undefined?brush.radius:a.r+((b.r??a.r)-a.r)*u;
    const half=brush.flat?radius*(.9+.1*p)*Math.sqrt(Math.min(1,p/.5)):radius*(.25+.75*p);
    if(!Number.isFinite(half)||half<0||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(brush.splay))return {eligible:false,words:Infinity,steps,rowCandidates,emptySteps};
    const R=Math.ceil(half*(1+sideReach(brush))+1+2*edgeTooth(brush,sheet.paper)),thin=spacing*.5+1.1,rx=upright?Math.abs(ty)*R+Math.abs(tx)*thin:R,ry=upright?Math.abs(tx)*R+Math.abs(ty)*thin:R;
    // along1 is in [0,1]; this contains both actual splayed sides without
    // reading grain, clip or mutable recent-contact stamps.
    const reachA=spacing*.5+.6,reachS=half*(1+sideReach(brush))+.5+2*edgeTooth(brush,sheet.paper);
    const X0=Math.max(0,Math.floor(x-rx)),X1=Math.min(sheet.w-1,Math.ceil(x+rx)),Y1=Math.min(sheet.h-1,Math.ceil(y+ry));
    let count=0;
    for(let yy=Math.max(0,Math.floor(y-ry));yy<=Y1;yy++){
      const dy=yy+.5-y;let lo=-Infinity,hi=Infinity;
      if(Math.abs(tx)>1e-6){const c=dy*ty,u1=(-reachA-c)/tx,u2=(reachA-c)/tx;lo=Math.max(lo,Math.min(u1,u2));hi=Math.min(hi,Math.max(u1,u2));}
      if(Math.abs(nx)>1e-6){const c=dy*ny,u1=(-reachS-c)/nx,u2=(reachS-c)/nx;lo=Math.max(lo,Math.min(u1,u2));hi=Math.min(hi,Math.max(u1,u2));}
      let xa=X0,xb=X1;if(lo>-Infinity)xa=Math.max(xa,Math.floor(lo+x-.5)-1);if(hi<Infinity)xb=Math.min(xb,Math.ceil(hi+x-.5)+1);
      count+=Math.max(0,xb-xa+1);
    }
    steps++;rowCandidates+=count;if(!count)emptySteps++;
    words+=sp+(brush.depositDepth?1+3*count:lanes+1+2*count);
    if(words>=limit)return result();
    t+=spacing;
  }
  if(lift&&path.length>0){const q=path.at(-1),r=Math.max(1.5,brush.radius*.35);if(!Number.isFinite(r))return {...result(),eligible:false,words:Infinity};words+=Math.max(0,Math.min(sheet.w-1,Math.ceil(q.x+r))-Math.max(0,Math.floor(q.x-r))+1)*Math.max(0,Math.min(sheet.h-1,Math.ceil(q.y+r))-Math.max(0,Math.floor(q.y-r))+1);}
  return result();
}
