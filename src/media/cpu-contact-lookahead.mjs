const box=(x,y,rx,ry,w,h)=>{
  const a=Math.max(0,Math.floor(x-rx)),b=Math.min(w-1,Math.ceil(x+rx)),c=Math.max(0,Math.floor(y-ry)),d=Math.min(h-1,Math.ceil(y+ry));
  return b>=a&&d>=c?[a,c,b-a+1,d-c+1]:null;
};
const add=(a,b)=>{
  if(!b)return a;if(!a)return b;
  const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]);
  return [x,y,Math.max(a[0]+a[2],b[0]+b[2])-x,Math.max(a[1]+a[3],b[1]+b[3])-y];
};
export const lookaheadCount=n=>Number.isInteger(n)&&n>0?Math.min(n,4096):0;

// Same path interpolation and raster bounds as strokeImpl. Reading future geometry advances no brush or sheet state.
export function brushContactLookahead(brush,path,{k,t,spacing,upright,hx,hy,count,w,h}){
  let bounds=null;
  for(let j=0;j<count&&k<path.length;){
    const a=path[k-1],b=path[k],seg=Math.hypot(b.x-a.x,b.y-a.y)||1e-6;
    if(t>seg){t-=seg;k++;continue;}
    const u=t/seg,p=(a.p??1)+((b.p??1)-(a.p??1))*u;
    const radius=a.r===undefined?brush.radius:a.r+((b.r??a.r)-a.r)*u;
    const half=brush.flat?radius*(.9+.1*p)*Math.sqrt(Math.min(1,p/.5)):radius*(.25+.75*p);
    const R=Math.ceil(half+1),thin=spacing*.5+1.1;
    const tx=upright?hx:(b.x-a.x)/seg,ty=upright?hy:(b.y-a.y)/seg;
    bounds=add(bounds,box(a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u,upright?Math.abs(ty)*R+Math.abs(tx)*thin:R,upright?Math.abs(tx)*R+Math.abs(ty)*thin:R,w,h));
    t+=spacing;j++;
  }
  return bounds;
}

function* penContacts(path,spacing){
  for(let k=0;k<path.length;k++){
    const a=path[k];
    if(a.dwell){for(let t=0;t<a.dwell;t++)yield {x:a.x,y:a.y,p:a.p??.5};continue;}
    const b=path[k+1];
    if(!b||b.dwell){if(path.length===1)yield {x:a.x,y:a.y,p:a.p??.5,nw:a.nw};continue;}
    const L=Math.hypot(b.x-a.x,b.y-a.y),m=Math.max(1,Math.ceil(L/spacing)),na=a.nw,nb=b.nw??na;
    for(let q=0;q<m;q++){const u=q/m;yield {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,p:(a.p??.5)+((b.p??.5)-(a.p??.5))*u,nw:na==null?undefined:na+(nb-na)*u};}
  }
}
export function penContactLookahead(pen,path,spacing,count,w,h){
  const iterator=penContacts(path,spacing),pending=[];
  // Drop can only decrease during a closed writer; callbacks may flow only.
  const dropR=pen.drop>0?Math.min(2,.6*Math.sqrt(pen.drop)):0;
  return ()=>{
    while(pending.length<count){const next=iterator.next();if(next.done)break;pending.push(next.value);}
    let bounds=null;
    for(const q of pending){const rc=(q.nw==null?(pen.nib+pen.flex*q.p)/2:q.nw/2)+dropR+pen.pad;
      const R=Math.max(Math.ceil(rc+1),Math.ceil(rc+pen.reach));bounds=add(bounds,box(q.x,q.y,R,R,w,h));}
    pending.shift();return bounds;
  };
}
