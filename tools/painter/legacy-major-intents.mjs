// Registered semantic context for the existing numerical production route. No geometry synthesis or mask.
import {check} from '../../src/media/checks.mjs';
// A contact outside every declared family is painted under this record-only family and counted; --strict 1 stops.
export const UNCLASSIFIED_FAMILY=Object.freeze({id:'unclassified',referenceCue:null,material:null,lights:null});
export function validateLegacyIntent(p,{imageSHA,loadedContact}){
 if(p.version!==1||p.target.sha256!==imageSHA||p.coordinateSpace!=='normalized-target')throw Error('major target binding mismatch');
 if(p.loadedContact!==1||loadedContact!==1)throw Error('major connected-wash requires explicit loadedcontact1');
 if(!Array.isArray(p.families)||!p.families.length)throw Error('major families missing');
 const ids=new Set();for(const f of p.families){if(!f.id||ids.has(f.id)||!f.referenceCue||!f.material||!f.lights||!Array.isArray(f.bounds)||f.bounds.length!==4||f.bounds.some(v=>!Number.isFinite(v)||v<0||v>1)||f.bounds[0]>=f.bounds[2]||f.bounds[1]>=f.bounds[3])throw Error('invalid major family '+f.id);ids.add(f.id);}
 if(p.connectedSky){const q=p.connectedSky;if(!q.areaId||!q.passId||!q.referenceCue||!Array.isArray(q.passes)||q.passes.length<2||q.passes.some(v=>!Number.isInteger(v)||v<1)||new Set(q.passes).size!==q.passes.length||!Number.isFinite(q.minAreaFraction)||q.minAreaFraction<=0||q.minAreaFraction>1||!Number.isFinite(q.minOverlap)||q.minOverlap<=0||q.minOverlap>1)throw Error('invalid connected sky passage');}
 if(p.baseWash){const q=p.baseWash;if(q.move!=='wet on dry'||!Array.isArray(q.values)||!q.values.length||q.values.some(v=>!Number.isInteger(v)||v<1)||new Set(q.values).size!==q.values.length||!Number.isFinite(q.minAreaFraction)||q.minAreaFraction<=0||q.minAreaFraction>1||!q.referenceReason||!q.passId)throw Error('invalid major basewash');}
 if(p.dryDetailPreparation){const q=p.dryDetailPreparation;if(q.operation!=='ordinary-dry'||!Number.isInteger(q.maxSteps)||q.maxSteps<1||q.maxSteps>30000||!Number.isFinite(q.dt)||q.dt<=0||q.dt>2||!Number.isFinite(q.levelMax)||q.levelMax<=0)throw Error('invalid major ordinarydry preparation');}
 return p;
}
export function legacyIntentFamily(p,points,w,h){
 if(!points.length||w<=0||h<=0)throw Error('major geometry missing');
 const q=points[Math.floor(points.length/2)],x=q.x/w,y=q.y/h;if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('major nonfinite point');
 const found=p.families.find(f=>x>=f.bounds[0]&&x<=f.bounds[2]&&y>=f.bounds[1]&&y<=f.bounds[3])??p.families.find(f=>f.fallback===true);
 return found??(check('major unclassified contact',false,{x:+x.toFixed(4),y:+y.toFixed(4)}),UNCLASSIFIED_FAMILY);
}

export function prepareMajorDryBase({paint,technique,continuation=false,preparation,observe,dry,record}){
 const before=observe();record({status:'MATERIAL_BEFORE',paper:before,continuation});
 if(!paint||!(technique?.name==='dry brush'||technique?.baseWashDecision)||continuation||before.dry)return {paper:before,prepared:false,continuation};
 if(!preparation||preparation.operation!=='ordinary-dry')throw Error('major dry detail needs declared ordinarydry preparation');
 record({status:'ORDINARY_DRY_REQUESTED',paper:before,preparation});dry(preparation);const after=observe();record({status:'ORDINARY_DRY_OBSERVED',paper:after,preparation});
 // paper that did not dry is painted as it is and counted; --strict 1 stops
 check('major dry detail ordinarydry did not establish actual dry footprint',after.dry,{waterMax:after.waterMax,saturationMax:after.saturationMax});
 return {paper:after,prepared:true,continuation:false};
}
export function sameUnliftedMajorGesture(previous,{brush,points,options,shapeId}){
 if(!previous||previous.brush!==brush||previous.lift!==false||previous.shapeId!==shapeId||!points.length)return false;
 const q=points[0],p=previous.end;return q.x===p.x&&q.y===p.y;
}

// Explicit material override for broad fitted demand; does not create, split, or credit geometry.
export function chooseMajorBaseWash(plan,technique,{value,area,cells,semantic=false}){
 const q=plan?.baseWash;
 if(!q||semantic||!Number.isFinite(area)||!Number.isFinite(cells)||cells<=0||technique.name!=='dry brush'||!q.values.includes(value)||area/cells<q.minAreaFraction)return technique;
 return {...technique,name:'wet on dry',water:.62,wetMix:.55,bridge:.78,bridgeSoft:2.2,intoWet:false,dryAfter:true,passes:1,baseWashDecision:{passId:q.passId,referenceReason:q.referenceReason,inferredTechnique:technique.name,geometry:'original numerical fitted paths and demand retained',calibration:'stock wet on dry profile, same loaded-contact calibration route'}};
}

// Schedule existing target-fitted geometry as one variegated passage, never synthesize contacts.
export function connectedSkyBoundary(plan,{pass,nextPass,area,nextArea,cells,overlap}){
 const q=plan?.connectedSky;if(!q||!q.passes.includes(pass)||!q.passes.includes(nextPass))return null;
 if(![area,nextArea,cells,overlap].every(Number.isFinite)||cells<=0)throw Error('invalid connected sky scheduling fields');
 if(area/cells<q.minAreaFraction||nextArea/cells<q.minAreaFraction||overlap<q.minOverlap)return null;
 return {areaId:q.areaId,passId:q.passId,referenceCue:q.referenceCue,pass,nextPass,overlap,move:'connected variegated wet-edge continuation',idleSettleSteps:0,ordinaryDry:false,geometry:'original fitted demand and paths',load:'original unchanged profiles and finite loads'};
}
export function connectedSkyContact(plan,technique,{pass,area,cells}){
 const q=plan?.connectedSky;if(!q||!q.passes.includes(pass)||area/cells<q.minAreaFraction)return technique;
 return {...technique,connectedSkyDecision:{areaId:q.areaId,passId:q.passId,referenceCue:q.referenceCue,move:'dry start or observed wet-edge color continuation; no per-contact dry override',load:'original unchanged',geometry:'original fitted'}};
}
