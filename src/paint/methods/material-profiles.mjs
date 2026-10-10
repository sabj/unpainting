// Drawing materials (sepia ink, black ink, graphite) and the caps on how much each drawing stage lays.
import { strongestShare } from '../drawing-plan.mjs';
import { drawGestures, dryPenGate } from '../../media/draw.mjs';
import { pencilDraw } from './pencil-line.mjs';
import { TUNED_DRAWING_CAPS } from '../tuned/drawing-caps.mjs';
const pigment = (name, K, omega = 60) => Object.freeze({name,K,S:[.02,.02,.02],rho:.05,omega,gamma:0});
const MATERIAL_PROFILES = Object.freeze({
 'sepia-ink': {pigment:pigment('sepia ink',[.396,.481,.619],1.4),rewets:true,widthMm:[.12,.45],pressureExponent:1.2,concentration:4,kind:'ink'},
 'black-ink': {pigment:pigment('black ink',[.62,.62,.62]),rewets:false,widthMm:[.1,.4],pressureExponent:1.3,concentration:4,kind:'ink'},
 'graphite-HB': {pigment:pigment('graphite HB',[.22,.22,.23]),rewets:false,widthMm:[.15,.45],pressureExponent:1.5,concentration:.6,kind:'graphite'},
 'graphite-2B': {pigment:pigment('graphite 2B',[.3,.3,.31]),rewets:false,widthMm:[.18,.6],pressureExponent:1.1,concentration:.85,kind:'graphite'},
});
for(const p of Object.values(MATERIAL_PROFILES)){p.paperResponse=p.kind==='ink'?'crisp on dry; capillary bleed on damp':'dry deposition on tooth; fixed under washes';p.registration='source drawing points in sheet coordinates; no added paths';Object.freeze(p);}
export function materialProfile(name){const p=MATERIAL_PROFILES[name];if(!p)throw Error(`No drawing material profile: ${name}`);return p;}
const SUBJECT_CAPS=Object.freeze({default:{opening:{lines:12,pressure:.3,minLengthMm:8},closing:{lines:24,pressure:.4,edgeMin:.22}},...TUNED_DRAWING_CAPS});
export function prepareDrawing(gestures,{medium,stage='opening',subject='default',mmPerCell,edgeStrength,w,h,state={used:0},caps}){
 const profile=materialProfile(medium),cap={...(SUBJECT_CAPS[subject]??SUBJECT_CAPS.default)[stage],...caps};
 if(!cap||!['opening','closing'].includes(stage)||!(mmPerCell>0)||!Number.isFinite(cap.lines)||cap.lines<0||!Number.isFinite(cap.pressure)||cap.pressure<0||cap.pressure>1)throw Error('Invalid drawing stage/physical scale');
 const at=p=>edgeStrength?.[Math.max(0,Math.min(h-1,Math.round(p.y)))*w+Math.max(0,Math.min(w-1,Math.round(p.x)))];
 const out=[];
 // --drawshare (the plan's drawing.amount): the pen keeps only the strongest share of its candidate lines.
 const candidates=strongestShare(gestures,cap.share??1);
 const ordered=stage==='opening'?[...candidates].sort((a,b)=>Number(b.reviewedOrdinal!=null||b.focalFeature!=null)-Number(a.reviewedOrdinal!=null||a.focalFeature!=null)):candidates;
 for(const g of ordered){if(stage==='opening'&&(g.openingRole==='pale under-eye plane cue'||g.focalFeature?.includes('under-eye plane')))continue;if(state.used>=cap.lines)break;if(!g.points||g.points.length<2)continue;
  let length=0;for(let i=1;i<g.points.length;i++)length+=Math.hypot(g.points[i].x-g.points[i-1].x,g.points[i].y-g.points[i-1].y)*mmPerCell;
  if(stage==='opening'&&length<cap.minLengthMm&&g.reviewedOrdinal==null&&g.focalFeature==null)continue;
  const runs=[];let run=[];
  for(const p of g.points){if(stage==='closing'&&(!(at(p)>=cap.edgeMin))){if(run.length>1)runs.push(run);run=[];continue;}const s=Math.min(cap.pressure,Math.max(0,p.s??p.weight??g.weight??cap.pressure));const width=profile.widthMm[0]+(profile.widthMm[1]-profile.widthMm[0])*s**profile.pressureExponent;run.push({...p,s,p:s,nw:width/mmPerCell});}
  if(run.length>1)runs.push(run);
  for(const points of runs){if(state.used>=cap.lines)break;out.push({...g,points,dip:1,low:0,material:medium,stage});state.used++;}
 }
 return out;
}
export function drawMaterial(sheet,gestures,want,w,h,{medium,stage='opening',subject,mmPerCell=280/w,edgeStrength=want,state,caps,O,audit=[],...opts}){
 const profile=materialProfile(medium),k=sheet.pigments.findIndex(p=>p.name===profile.pigment.name);
 if(k<0)throw Error(`Sheet missing declared pigment ${profile.pigment.name}`);
 const selected=prepareDrawing(gestures,{medium,stage,subject,mmPerCell,edgeStrength,w,h,state,caps});
 const dryGate=dryPenGate({O,audit});
 const gate=event=>{dryGate(event);const record=audit.at(-1);record.material=medium;record.stage=stage;record.registration={sourceOrdinal:event.gesture?.sourceOrdinal,reviewedOrdinal:event.gesture?.reviewedOrdinal,focalFeature:event.gesture?.focalFeature};record.contactWidthMm=event.gesture?.points.map(p=>p.nw*mmPerCell);record.physicalPressure=event.path?.map(p=>p.p)??event.gesture?.points.map(p=>p.p);record.pressureShares=event.gesture?.points.map(p=>p.s);if(profile.kind==='ink')opts.beforeStroke?.(event);};
 if(profile.kind==='graphite')return (opts.graphiteExecute??pencilDraw)(sheet,selected,k,{amount:profile.concentration,width:profile.widthMm[1]/mmPerCell,vary:.15,tooth:.4,pressureReference:1,usePointWidths:true,beforeStroke:({cells,gesture})=>{if(!cells.length)return;let x0=w,y0=h,x1=0,y1=0;for(const i of cells){const x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}const x=Math.max(0,x0-3),y=Math.max(0,y0-3);gate({sheet,gesture,pen:{ink:1,capacity:1,conc:[profile.concentration]},footprint:[x,y,Math.min(w-1,x1+3)-x+1,Math.min(h-1,y1+3)-y+1],index:audit.length});}});
 return drawGestures(sheet,selected,want,w,h,{...opts,O,ink:sheet.pigments.map((_,j)=>j===k?profile.concentration:0),peak:1,pen:{...opts.pen,nib:profile.widthMm[0]/mmPerCell,flex:(profile.widthMm[1]-profile.widthMm[0])/mmPerCell,drop:.1},beforeStroke:gate});
}
