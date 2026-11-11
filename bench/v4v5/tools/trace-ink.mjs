// Trace the target's own pen lines as a drawing file (the pen follows the lines). The tracer is pen-trace.mjs, a link
// to the painter's src/crop/pen-trace.mjs (a planning workspace gets a full copy of it). The limits are derived per
// subject from its own value range, not taken from any plate: the subject's lightest value (paper, the 99th percentile
// of luminance) and darkest (the ink, the 0.1th percentile, so a few thin lines still count) span a nine-step value
// scale, the painter's usual one. A pixel is line if it is at least one step of that scale darker than both sides
// (a thin dark line, not a dark mass). On a subject whose drawing medium is pen (--medium, else frozen.json's medium)
// that is all; on any other it must also lie in the darker half of the scale, so pale painted texture is not traced.
// Lines are walked, joined and rounded as a pen draws them, kept when one side is a light shape (a contour), and drawn
// with one nib (the mark's own width) and one weight (its mean darkness), the same along the whole stroke; the painter's
// hand gives the pressure curve along it. Nothing is read point by point.
// The tracer's distances are millimetres on the sheet (pen-trace.mjs TRACE_MM), so it needs the sheet's width:
// --sheetmm, else the planning workspace's frozen.json (bench/frozen.json, its sheetmm), else the bench sheet, 280 mm.
// Nothing else is settable: whether a subject has pen lines is the declared medium's choice, not a contrast turned
// down until lines appear.
// node bench/tools/trace-ink.mjs target.png out.json [--sheetmm N] [--medium pen|pencil|none]
import fs from "node:fs";import path from "node:path";import sharp from "sharp";import {tracePen,luminance} from "./pen-trace.mjs";
const args=process.argv.slice(2);
const usage="usage: node bench/tools/trace-ink.mjs target.png out.json [--sheetmm N] [--medium pen|pencil|none] (the limits come from the subject's own value range and are not settable)";
const [tgt,out,...rest]=args,named={};
if(!tgt||!out||rest.length%2)throw new Error(usage);
for(let i=0;i<rest.length;i+=2){if(!["--sheetmm","--medium"].includes(rest[i]))throw new Error(usage);named[rest[i]]=rest[i+1];}
const frozenFile=path.join(path.dirname(new URL(import.meta.url).pathname),"..","frozen.json"),frozen=fs.existsSync(frozenFile)?JSON.parse(fs.readFileSync(frozenFile,"utf8")):{};
const sheetMm=Number(named["--sheetmm"]??frozen.sheetmm??280),medium=named["--medium"]??frozen.medium??"none";
if(!(sheetMm>0)||!["pen","pencil","none"].includes(medium))throw new Error(usage);
const {data,info}=await sharp(tgt).removeAlpha().raw().toBuffer({resolveWithObject:true});const W=info.width,H=info.height;
const t=tracePen(luminance(data,W,H),W,H,{pixelMm:sheetMm/W,pen:medium==="pen"}),minC=t.scale.step,maxLum=t.scale.mid;
const res=t.lines.map(l=>({points:l.points,length:l.length,weight:l.weight,strength:1,width:l.width,closed:false,role:"subject",object:"target-hard-line",kind:"line",group:"detail",selection:{method:"traced target thin dark line, one step of the subject's own nine-step value scale ("+minC.toFixed(3)+") darker than both sides, "+(medium==="pen"?"however pale (a pen subject)":"in its darker half (<= "+maxLum.toFixed(3)+")")+", with a lighter side (a contour, not inside a dark mass); walked through crossings, joined across the tracer's reach, split where it turns back; one nib and one weight per line"}}));
fs.writeFileSync(out,JSON.stringify({image:{w:W,h:H},lines:res,source:tgt,crop:[0,0,W,H],registration:"traced from the target crop itself"},null,1));
console.log("value range",t.scale.ink.toFixed(3),"..",t.scale.paper.toFixed(3),"step",minC.toFixed(3),"darkest half <=",maxLum.toFixed(3));console.log("line pixels",t.stats.linePixels,"spans",res.length,"inside dark masses",t.stats.inMass,"total length",res.reduce((a,l)=>a+l.length,0).toFixed(0));
