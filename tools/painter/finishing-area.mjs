import {BOX} from '../../src/crop/box.mjs';
import {validateAreaDocument,rasterAreaPlan,compileAreaLayers} from './semantic-areas.mjs';
// Appends one authored pass after numeric paint, before dry detail and ink; numeric layers are left unchanged.
export function bindFinishingArea(doc,context){
 if(doc.areas?.length!==1||doc.areas[0].passes?.length!==1)throw Error('finishing area requires exactly one area/pass');
 const pass=doc.areas[0].passes[0];
 const connected=pass.move==='wet-edge continuation'&&pass.wetness?.required==='dry-or-wet-edge'&&pass.wetness.maxSurfaceWater>0&&doc.finishingBase?.required==='dry'&&doc.finishingBase.operation==='ordinary-dry'&&doc.finishingBase.maxSteps===30000&&doc.finishingBase.dt===2&&pass.authoredGestures?.length>=1&&pass.authoredGestures.length<=4;
 if(pass.source!=='authored'||(!connected&&(pass.move!=='wet on dry'||pass.wetness?.required!=='dry'||pass.authoredGestures?.length!==1))||pass.lights?.mode!=='paint-owned'||doc.view)throw Error('finishing area requires one full-frame authored dry-base glaze; no film/rewet');
 const plan=rasterAreaPlan(validateAreaDocument(doc,{...context,minAreas:1,maxAreas:1}),context.w,context.h);
 return {plan,compiled:compileAreaLayers(plan,[],context.palette)};
}
export function appendFinishingLayers(base,compiled){
 if(!Array.isArray(base)||compiled?.layers?.length!==1)throw Error('finishing append requires original layer array and one compiled layer');
 return {start:base.length,layers:[...base,...compiled.layers]};
}

export function finishingPaletteKeys(palette){return palette.map(p=>{const box=BOX.find(q=>q.name===p.name);if(!box||p.key&&p.key!==box.key)throw Error('finishing palette must bind existing named BOX pans; recovered anonymous pigment unsupported');return {...p,key:box.key};});}
