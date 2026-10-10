import {shapedPlanePaths} from '../techniques/shaped-marks.mjs';
const KIT=[['rigger',1.2,'rigger'],['round4',3,'round'],['round8',5,'round'],['round12',7,'round'],['flat1in',25.4,'flat'],['mop',38,'mop']];
const pathLength=p=>p.reduce((v,q,i)=>v+(i?Math.hypot(q.x-p[i-1].x,q.y-p[i-1].y):0),0);
export function choosePassageBrush(mask,w,h,{mmPerCell,texture=false,referenceCue='',phase='mid'}={}){
 if(!(mmPerCell>0))throw Error('physical cell width required');
 const base=shapedPlanePaths(mask,w,h,{texture})[0];if(!base)return null;
 const span=2*Math.max(...base.map(p=>p.r))*mmPerCell;
 const detail=span<=7, [name,sizeMm,shape]=KIT.find(([,size])=>size>=span)??KIT.at(-1);
 const contact=detail?(span<=3?'point':'belly'):shape==='flat'?'side':'belly';
 const lanes=Math.ceil(span/sizeMm),radius=sizeMm/(2*mmPerCell),first=base[0],last=base.at(-1),angle=Math.atan2(last.y-first.y,last.x-first.x);
 const paths=Array.from({length:lanes},(_,j)=>base.map(p=>{const offset=(j-(lanes-1)/2)*2*p.r/lanes;return {...p,x:p.x-Math.sin(angle)*offset,y:p.y+Math.cos(angle)*offset,r:radius,p:texture?.35:contact==='point'?.65:.9};}));
 const directionSource='plane orientation';
 return {name,sizeMm,shape,contact,strokeCount:paths.length,meanLengthMm:paths.reduce((s,p)=>s+pathLength(p)*mmPerCell,0)/paths.length,directionSource,directionRadians:angle,
 reason:`${referenceCue} ${detail?'Small dry value shape: controlled round/liner, length follows the fitted feature.':'Connected value plane: broad contact and few long sweeps along its fitted major axis.'} ${phase==='shadow'?'Cross-region glaze retains the connected support.':''}`,
 paths,classification:detail?'detail':'plane',supportWidthMm:span};
}
export function passageBrushPaths(brush,scale=1){return brush.paths.map(ps=>ps.map(p=>({...p,x:p.x*scale,y:p.y*scale,r:p.r*scale})));}
