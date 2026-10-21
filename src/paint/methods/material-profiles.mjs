// Drawing materials (sepia ink, black ink, graphite) and the caps on how much each drawing stage lays.
import { strongestShare } from '../drawing-plan.mjs';
import { drawGestures, dryPenGate } from '../../media/draw.mjs';
import { pencilDraw } from './pencil-line.mjs';
const pigment = (name, K, omega = 60) => Object.freeze({name,K,S:[.02,.02,.02],rho:.05,omega,gamma:0});
const MATERIAL_PROFILES = Object.freeze({
 'sepia-ink': {pigment:pigment('sepia ink',[.396,.481,.619],1.4),rewets:true,widthMm:[.12,.45],pressureExponent:1.2,concentration:4,kind:'ink'},
 'black-ink': {pigment:pigment('black ink',[.62,.62,.62]),rewets:false,widthMm:[.1,.4],pressureExponent:1.3,concentration:4,kind:'ink'},
 // A flexible drawing nib spans hairlines through emphatic outlines. Explicit
 // measured widths remain bounded by this declared physical instrument range.
 'drawing-ink': {pigment:pigment('black ink',[.62,.62,.62]),rewets:false,widthMm:[.03,1.2],pressureExponent:1.3,concentration:4,kind:'ink'},
 'graphite-HB': {pigment:pigment('graphite HB',[.22,.22,.23]),rewets:false,widthMm:[.15,.45],pressureExponent:1.5,concentration:.6,kind:'graphite'},
 'graphite-2B': {pigment:pigment('graphite 2B',[.3,.3,.31]),rewets:false,widthMm:[.18,.6],pressureExponent:1.1,concentration:.85,kind:'graphite'},
});
for(const p of Object.values(MATERIAL_PROFILES)){p.paperResponse=p.kind==='ink'?'crisp on dry; capillary bleed on damp':'dry deposition on tooth; fixed under washes';p.registration='source drawing points in sheet coordinates; no added paths';Object.freeze(p);}
export function materialProfile(name){const p=MATERIAL_PROFILES[name];if(!p)throw Error(`No drawing material profile: ${name}`);return p;}
// The sparse caps on each drawing stage. Every subject gets the same caps; flags and the plan override them.
const DRAWING_CAPS=Object.freeze({opening:Object.freeze({lines:12,pressure:.3,minLengthMm:8}),closing:Object.freeze({lines:24,pressure:.4,edgeMin:.22})});
// An ink drawing already has a source/plan budget. Sparse construction-sketch caps
// must not discard its short descriptive marks. Explicit caps still win.
// Closing ink restates a few edges over the dried washes; at full pressure it outweighs the drawing under it. A plan
// or flag that asks for more (--closingpressure) still gets it.
export const CLOSING_PRESSURE_MAX=.6;
export function sourceDrawingCaps({medium,stage='opening',sourceInk=false,plannedDrawing=false}) {
 const sparse=DRAWING_CAPS[stage];
 if(plannedDrawing && stage==='opening' && materialProfile(medium).kind==='graphite') return {...sparse,lines:100000,minLengthMm:.5};
 return sourceInk && materialProfile(medium).kind==='ink'
  ? {...sparse,lines:100000,pressure:stage==='closing'?CLOSING_PRESSURE_MAX:.75,minLengthMm:0,edgeMin:0}
  : {...sparse};
}
// `widthFloorMm` (--inkwidthfloor): no contact narrower than this, and the nib's widest contact rises to it. Default 0.
export function prepareDrawing(gestures,{medium,stage='opening',mmPerCell,edgeStrength,w,h,state={used:0},caps,sourceInk=false,widthFloorMm=0}){
 const base=materialProfile(medium),cap={...sourceDrawingCaps({medium,stage,sourceInk}),...caps};
 const profile=widthFloorMm>0?{...base,widthMm:[Math.max(base.widthMm[0],widthFloorMm),Math.max(base.widthMm[1],widthFloorMm)]}:base;
 if(!cap||!['opening','closing'].includes(stage)||!(mmPerCell>0)||!Number.isFinite(cap.lines)||cap.lines<0||!Number.isFinite(cap.pressure)||cap.pressure<0||cap.pressure>1)throw Error('Invalid drawing stage/physical scale');
 const at=p=>edgeStrength?.[Math.max(0,Math.min(h-1,Math.round(p.y)))*w+Math.max(0,Math.min(w-1,Math.round(p.x)))];
 const out=[];
 // --drawshare (the plan's drawing.amount): the pen keeps only the strongest share of its candidate lines.
 const candidates=strongestShare(gestures,cap.share??1);
 const ordered=stage==='opening'?[...candidates].sort((a,b)=>Number(b.reviewedOrdinal!=null||b.focalFeature!=null)-Number(a.reviewedOrdinal!=null||a.focalFeature!=null)):candidates;
 for(const g of ordered){if(state.used>=cap.lines)break;if(!g.points||g.points.length<2)continue;
  let length=0;for(let i=1;i<g.points.length;i++)length+=Math.hypot(g.points[i].x-g.points[i-1].x,g.points[i].y-g.points[i-1].y)*mmPerCell;
  if(stage==='opening'&&length<cap.minLengthMm&&g.reviewedOrdinal==null&&g.focalFeature==null)continue;
  const runs=[];let run=[];
  for(const p of g.points){if(stage==='closing'&&cap.edgeMin>0&&(!(at(p)>=cap.edgeMin))){if(run.length>1)runs.push(run);run=[];continue;}const s=Math.min(cap.pressure,Math.max(0,p.s??p.weight??g.weight??cap.pressure));const width=profile.widthMm[0]+(profile.widthMm[1]-profile.widthMm[0])*s**profile.pressureExponent;const nw=p.nw==null?width/mmPerCell:Math.max(profile.widthMm[0]/mmPerCell,Math.min(profile.widthMm[1]/mmPerCell,p.nw));run.push({...p,s,p:s,nw});}
  if(run.length>1)runs.push(run);
  for(const points of runs){if(state.used>=cap.lines)break;out.push({...g,points,dip:g.dip??false,low:g.low??.25,material:medium,stage});state.used++;}
 }
 return out;
}
export function drawMaterial(sheet,gestures,want,w,h,{medium,stage='opening',mmPerCell=280/w,edgeStrength=want,state,caps,sourceInk=false,O,audit=[],dryInk=true,graphiteOptions={},widthFloorMm=0,...opts}){
 const profile=materialProfile(medium),k=sheet.pigments.findIndex(p=>p.name===profile.pigment.name);
 if(k<0)throw Error(`Sheet missing declared pigment ${profile.pigment.name}`);
 const selected=prepareDrawing(gestures,{medium,stage,mmPerCell,edgeStrength,w,h,state,caps,sourceInk,widthFloorMm});
 const dryGate=dryPenGate({O,audit});
 const gate=event=>{
  if(dryInk||profile.kind==='graphite')dryGate(event);
  else{
   const {sheet,pen,footprint}=event;sheet._gpu?.ensureFresh(sheet,footprint);
   const [x,y,bw,bh]=footprint;let water=0,pore=0;
   for(let yy=y;yy<y+bh;yy++)for(let xx=x;xx<x+bw;xx++){const i=yy*w+xx;water=Math.max(water,sheet.W[i]);pore=Math.max(pore,sheet.s[i]/Math.max(1e-9,sheet.paper.capacity[i]));}
   audit.push({index:event.index,technique:'finish ink on existing paper moisture',footprint,before:{water,pore},after:{water,pore},dried:false,instrument:{ink:pen.ink,capacity:pen.capacity,fill:pen.ink/pen.capacity,drop:pen.drop,concentration:Array.from(pen.conc)}});
  }
  const record=audit.at(-1);record.material=medium;record.stage=stage;record.registration={sourceOrdinal:event.gesture?.sourceOrdinal,reviewedOrdinal:event.gesture?.reviewedOrdinal,focalFeature:event.gesture?.focalFeature};record.contactWidthMm=event.gesture?.points.map(p=>p.nw*mmPerCell);const points=event.path??event.gesture?.points??[];record.pathLengthMm=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y)*mmPerCell,0);record.physicalPressure=event.path?.map(p=>p.p)??event.gesture?.points.map(p=>p.p);record.pressureShares=event.gesture?.points.map(p=>p.s);record.speeds=points.map(p=>p.v);record.dwellTime=points.reduce((s,p)=>s+(p.dwell??0),0);record.refillThreshold=opts.allowStarvation?(event.gesture?.low??.25):Math.max(event.gesture?.low??.25,Math.min(.9,event.pen.starve*1.2));if(profile.kind==='ink')opts.beforeStroke?.(event);
 };
 if(profile.kind==='graphite')return (opts.graphiteExecute??pencilDraw)(sheet,selected,k,{amount:profile.concentration,width:profile.widthMm[1]/mmPerCell,vary:.15,tooth:.4,pressureReference:1,usePointWidths:true,arcScale:mmPerCell/(152.4/1080),...graphiteOptions,beforeStroke:({cells,gesture})=>{if(!cells.length)return;let x0=w,y0=h,x1=0,y1=0;for(const i of cells){const x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}const x=Math.max(0,x0-3),y=Math.max(0,y0-3);gate({sheet,gesture,pen:{ink:1,capacity:1,conc:[graphiteOptions.amount??profile.concentration]},footprint:[x,y,Math.min(w-1,x1+3)-x+1,Math.min(h-1,y1+3)-y+1],index:audit.length});}});
 return drawGestures(sheet,selected,want,w,h,{...opts,O,ink:sheet.pigments.map((_,j)=>j===k?(opts.ink?.[k]??profile.concentration):0),peak:1,pen:{...opts.pen,nib:profile.widthMm[0]/mmPerCell,flex:(profile.widthMm[1]-profile.widthMm[0])/mmPerCell,drop:.1},beforeStroke:gate,afterStroke:({pen,reloads})=>{const record=audit.at(-1);record.inkAfter=pen.ink;record.reloadsWithinStroke=reloads;}});
}
