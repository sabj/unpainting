// Execute recorded material events. Each visible point is rendered after deposition.
// A dip happens ONLY when the source tape has one. Complete paintings retain
// their native sheet resolution; only legacy tapes use scaled sampling.
import {pencilDraw} from '../media/graphite.js';
import {tapeStep} from './tape-sheet.js';
import {OPERATION_NAMES} from './operations.js';
import {createBrush,dip,stroke,strokeReach} from '../media/brush.js';
import {createPen,dipPen,penStroke} from '../media/pen.js';
import {applyResist,liftResist,setClip,blot} from '../media/sheet.js';
export const SHEET_FIELDS=['W','s','M','G','P','D','layers','ever','resist','resistStrength','resistFrom','clip','edge','steps','clock','touched','contactStrength'];
// Tool snapshots preserve depleted loads and the random generator, never a sheet reference.
const saveTool=t=>Object.fromEntries(Object.entries(t).filter(([k,v])=>k!=='sheet'&&(!k.startsWith('_')||['_onPaper','_strokeT0'].includes(k))&&typeof v!=='function'));
export async function runTape(tape,api,resume=null){
 const {w,h}=api.sheet(), scale=w/tape.w, unit=tape.scale||10;
 const brushes=new Map(),pens=new Map();let done=resume?.done||0;
 const scaled=(o,keys,mass=[])=>{o={...o};for(const key of keys)if(o[key]!=null)o[key]*=scale;for(const key of mass)if(o[key]!=null)o[key]*=scale*scale;return o;};
 const brush=id=>{if(!brushes.has(id))brushes.set(id,createBrush(scaled(tape.brushOpts[tape.brushes[id]??id],['radius','stiffness','streakLength'],['capacity','loadWater'])));return brushes.get(id);};
 const pen=id=>{if(!pens.has(id))pens.set(id,createPen(scaled(tape.penOpts[tape.pens[id]??id],['nib','flex','travel','reach','pad'],['reservoir','drop','feed'])));return pens.get(id);};
 if(resume){for(const [id,v]of resume.brushes){const b=brush(id),rs=b.rs;Object.assign(b,v);rs.s=v.rs.s;b.rs=rs;}for(const [id,v]of resume.pens){const p=pen(id);Object.assign(p,v);p.sheet=api.sheet();}if(resume.contactBrush!=null)api.sheet()._contactBrush=brushes.get(resume.contactBrush);}
 const field=(a,div=1)=>Float32Array.from({length:w*h},(_,i)=>a[Math.min(tape.h-1,Math.floor(Math.floor(i/w)/scale))*tape.w+Math.min(tape.w-1,Math.floor((i%w)/scale))]/div);
 const total=tape.strokeCount??tape.marks.filter(m=>m.k==='s'||m.k==='P'||m.k==='g').length;
 for(let index=resume?.index||0;index<tape.marks.length;index++){
  const m=tape.marks[index];
  if(!await api.ready(done))break;
  const operation=async(kind,fn,mask=null)=>api.operation?api.operation({kind,label:OPERATION_NAMES[kind],mask,index,done,total},fn):fn();
  if(m.k==='d'){await operation('dip',()=>dip(brush(m.b),{water:m.w,conc:m.c}));continue;}
  if(m.k==='D'){await operation('ink',()=>dipPen(pen(m.pen),m.ink,m.a));continue;}
  if(m.k==='g'){
   await operation('paint',()=>api.mutate(()=>pencilDraw(api.sheet(),[{points:m.points}],m.pigment,m.options)));
   done++;await api.progress(done,total);
   if(api.checkpoint)await api.checkpoint(done,()=>({index:index+1,done,contactBrush:[...brushes].find(([,tool])=>tool===api.sheet()._contactBrush)?.[0],brushes:[...brushes].map(([id,t])=>[id,saveTool(t)]),pens:[...pens].map(([id,t])=>[id,saveTool(t)])}));
   continue;
  }
  if(tape.version>=2&&(m.k==='s'||m.k==='P')){
   if(scale!==1)throw Error('A complete painting must replay at its native sheet resolution');
   const isPen=m.k==='P',tool=isPen?pen(m.pen):brush(m.b),pts=m.points??m.d.map(q=>({x:q[0]/unit,y:q[1]/unit,p:q[2]<0?1:q[2]/100,...(isPen?{v:q[3]<0?1:q[3]/100,dwell:q[4]/100,...(q[5]==null?{}:{nw:q[5]/100})}:q[3]>=0?{r:q[3]/unit}:{})}));
   await api.begin(tool,isPen,{mark:m,done,total,pigments:tape.pigments});
   // One call preserves carry, contact suppression, heading, RNG and lift.
   // Flow callbacks run at the recorded deposition samples, synchronously.
   const flows=new Map();for(const at of m.fl??[])flows.set(at,(flows.get(at)??0)+1);
   const between=at=>{for(let n=flows.get(at)??0;n>0;n--)tapeStep(tape,api.sheet());};
   const reach=flows.size?Math.max(w,h):isPen?tool.nib+tool.flex+tool.reach+tool.pad+6:strokeReach(tool,api.sheet().paper,Math.max(tool.radius,...pts.map(p=>p.r??tool.radius)));
   const contact=await api.touch(pts,reach,()=>{api.sheet().wetting=!!m.wt;
    if(isPen)penStroke(tool,api.sheet(),pts,{spacing:m.sp??.5,between});
    else stroke(tool,api.sheet(),pts,{spacing:m.sp??.7,upright:m.u===2?'sweep':!!m.u,lift:m.lf!==0,between});
    api.sheet().wetting=false;
   });
   if(pts.length)await api.present(pts.at(-1),isPen?tool.nib/2:pts.at(-1).r??tool.radius,done,0,contact);
   await api.end();done++;await api.progress(done,total);
   if(api.checkpoint)await api.checkpoint(done,()=>({index:index+1,done,contactBrush:[...brushes].find(([,tool])=>tool===api.sheet()._contactBrush)?.[0],brushes:[...brushes].map(([id,t])=>[id,saveTool(t)]),pens:[...pens].map(([id,t])=>[id,saveTool(t)])}));
   continue;
  }
  if(m.k==='s'||m.k==='P'){
   const isPen=m.k==='P',tool=isPen?pen(m.pen):brush(m.b), k=scale/(m.r||1);
   const pts=m.d.map(q=>({x:q[0]/unit*k,y:q[1]/unit*k,p:q[2]<0?1:q[2]/100,...(isPen?{v:q[3]<0?1:q[3]/100,dwell:q[4]/100,...(q[5]==null?{}:{nw:q[5]/100*k})}:q[3]>=0?{r:q[3]/unit*k}:{})}));
   await api.begin(tool,isPen,{mark:m,done,total,pigments:tape.pigments}); const reach=isPen?tool.nib+tool.flex+tool.reach+tool.pad+6:strokeReach(tool,api.sheet().paper,Math.max(tool.radius,...pts.map(p=>p.r??tool.radius)));
   if(pts.length===1){
    const contact=await api.touch(pts,reach,()=>{api.sheet().wetting=!!m.wt;if(isPen)penStroke(tool,api.sheet(),pts);else stroke(tool,api.sheet(),pts,{lift:false});});
    await api.present(pts[0],isPen?tool.nib/2:pts[0].r??tool.radius,done,0,contact);
   }
   // Subdivide long recorded segments so paint follows the moving instrument.
   for(let j=1;j<pts.length&&await api.ready(done);j++){
    const a=pts[j-1],b=pts[j],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2));let prev=a;
    for(let q=1;q<=n&&await api.ready(done);q++){
     const f=q/n,pt={...b,x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,p:a.p+(b.p-a.p)*f};
     if(a.r!=null&&b.r!=null)pt.r=a.r+(b.r-a.r)*f;
     const contact=await api.touch([prev,pt],reach,()=>{api.sheet().wetting=!!m.wt;if(isPen)penStroke(tool,api.sheet(),[prev,pt],{spacing:(m.sp??.5)*scale});else stroke(tool,api.sheet(),[prev,pt],{lift:false,spacing:Math.max(.2,(m.sp??.7)*scale),upright:m.u===2?'sweep':!!m.u});});
     await api.present(pt,isPen?(pt.nw??tool.nib+tool.flex*pt.p)/2:(pt.r??tool.radius),done,Math.hypot(pt.x-prev.x,pt.y-prev.y),contact);prev=pt;
    }
   }
   // Carry-on/cancellation must not jump to the recorded endpoint to lift.
   if(!await api.ready(done)){api.sheet().wetting=false;await api.end();break;}
   if(!isPen&&pts.length&&m.lf!==0){const pt=pts.at(-1),contact=await api.touch([pt],reach,()=>stroke(tool,api.sheet(),[pt],{lift:true}));await api.present(pt,pt.r??tool.radius,done,0,contact);}
   api.sheet().wetting=false;await api.end();done++;await api.progress(done,total);
   if(api.checkpoint)await api.checkpoint(done,()=>({index:index+1,done,contactBrush:[...brushes].find(([,tool])=>tool===api.sheet()._contactBrush)?.[0],brushes:[...brushes].map(([id,t])=>[id,saveTool(t)]),pens:[...pens].map(([id,t])=>[id,saveTool(t)])}));
  }else if(m.k==='f')await operation('flow',()=>api.flow(false));
  else if(m.k==='y')await operation('dry',()=>api.flow(true,m));
  else if(['r','R','c','b'].includes(m.k)){
   let mask=null;
   if(m.m)mask=Uint8Array.from(field(m.m));
   if(m.k==='c'&&m.r){const a=new Uint8Array(tape.w*tape.h);for(let j=0;j<m.r.length;j+=2)a.fill(1,m.r[j],m.r[j]+m.r[j+1]);mask=Uint8Array.from(field(a));}
   const kind=m.k==='r'?'mask':m.k==='R'?'unmask':m.k==='b'?'blot':mask?'clip':'unclip';
   await operation(kind,()=>api.mutate(()=>{
    const s=api.sheet();
    if(m.k==='r')applyResist(s,mask,m.s?field(m.s,100):null);
    else if(m.k==='R')liftResist(s);
    else if(m.k==='b')blot(s,mask,{strength:m.s,pigmentShare:m.p});
    else setClip(s,mask);
   }),mask??(m.k==='R'?api.sheet().resist:api.sheet().clip));
  }else if(m.k!=='m')throw new Error(`Unsupported recorded operation: ${m.k}`);
 }
 if(done===total&&api.finished)await api.finished(done,()=>({index:tape.marks.length,done,contactBrush:[...brushes].find(([,tool])=>tool===api.sheet()._contactBrush)?.[0],brushes:[...brushes].map(([id,t])=>[id,saveTool(t)]),pens:[...pens].map(([id,t])=>[id,saveTool(t)])}));
 await api.end();return done;
}
