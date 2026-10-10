import {createBrush,dip,stroke,candidateContact} from '../../src/media/brush.mjs';
import {makePaper} from '../../src/media/paper.mjs';
import {createSheet,thickness,coherent,dry,step} from '../../src/media/sheet.mjs';
import {measurePaper,measureBrush} from '../../src/paint/methods/wetdry.mjs';
import {semanticBrushObservation} from './semantic-brush-observation.mjs';
export function numericTuftEligible({shapeId,selected=[],detail=false,dry=false,semantic=false,radiusMm}){return selected.includes(shapeId)&&!detail&&!dry&&!semantic&&radiusMm>=14;}
export function calibrateNumericTuft({profile,points,water,passes,paperOptions,mmPerCell,pigments,physics,upright,strength=2.2,flowEvery=24}){
 if(profile.model!=='tuft'||profile.flat!==false||!points?.length||!(water>0)||!Number.isInteger(passes)||passes<1)throw Error('invalid numerical tuft calibration');
 const pad=Math.ceil(3*Math.max(profile.radius,...points.map(p=>p.r))+5),xs=points.map(p=>p.x),ys=points.map(p=>p.y),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.ceil(Math.max(...xs)-x0)+2*pad+1,h=Math.ceil(Math.max(...ys)-y0)+2*pad+1;
 const refs=points.map(p=>({...p,x:p.x-x0+pad,y:p.y-y0+pad})),sheet=createSheet(makePaper(w,h,paperOptions),pigments),brush=createBrush(profile),want=.3,options={upright,flowEvery,lift:true};
 dip(brush,{water,conc:pigments.map(()=>want*strength/pigments.length)});const contact=candidateContact(brush,sheet,refs,{...options,neighborRadius:3}),primary=contact.cells.filter(i=>contact.primaryMask[i]);
 if(!primary.length)throw Error('empty actual tuft reference contact');
 const paperBefore=measurePaper(sheet,[...contact.cells,...contact.neighborIndices]),brushBefore=measureBrush(brush),tipsBefore=semanticBrushObservation(brush);
 let steps=0;for(let i=0;i<passes;i++){dip(brush,{water,conc:pigments.map(()=>want*strength/pigments.length)});stroke(brush,sheet,refs,{...options,between:()=>{if(++steps%flowEvery===0)step(sheet,physics);}});}
 coherent(sheet);const mass=thickness(sheet).reduce((s,f)=>s+primary.reduce((v,i)=>v+f[i],0),0),plannedMass=want*primary.length,delivery=mass/plannedMass,gain=1/delivery;
 if(!Number.isFinite(gain)||delivery<=.02)throw Error('unsupported actual tuft reference delivery');
 const depositedWaterMass=sheet.W.reduce((s,v)=>s+v,0),absorbedWaterMass=sheet.s.reduce((s,v)=>s+v,0);const immediatePaper=measurePaper(sheet,[...contact.cells,...contact.neighborIndices]);dry(sheet,20000,physics,{levelMax:140,dt:14});coherent(sheet);
 return {kind:'actual CPU reference calibration of reached original numerical shaped load segment; not exact scene-state equivalence',profile,points:refs,originalPoints:points,water,passes,strength,flowEvery,steps,mmPerCell,paperOptions,paperBefore,immediatePaper,driedPaper:measurePaper(sheet,[...contact.cells,...contact.neighborIndices]),brushBefore,tipsBefore,brushAfter:measureBrush(brush),depositedWaterMass,absorbedWaterMass,waterPerPrimaryCell:depositedWaterMass/primary.length,primaryCells:primary.length,plannedMass,insideMass:mass,delivery,gain,limitations:'Fresh dry reference paper; actual scene prior pigment/water and clipping observed separately. Finite reservoir/contact change, not fixed delivered-mass guarantee.'};
}
