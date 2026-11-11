// Trace the target's own hard dark pen lines as a drawing file (the pen follows the lines). The tracer is pen-trace.mjs,
// a link to the painter's src/crop/pen-trace.mjs (a planning workspace gets a full copy of it). The limits are derived
// per subject from its own value range, not taken from any plate: the subject's lightest value (paper, the 99th
// percentile of luminance) and darkest (the ink, the 0.1th percentile, so a few thin lines still count) span a nine-step
// value scale, the painter's usual one. A pixel is line if it is at least one step of that scale darker than both sides
// along x, y or a diagonal within 2-4 px (a thin dark line, not a dark mass), and it lies in the darker half of the
// scale (no lighter than its middle step). The mask is thinned and chained into polylines; spans shorter than MIN_LEN px
// are dropped (14 px, the value the harness's own example and dry planner always used). Each line is drawn with one nib
// and one pressure: its width and weight come from the line's mean darkness, the same along the whole stroke; the
// painter's hand gives the pressure curve along it (taper in and out). Nothing is read point by point.
// Nothing is settable: whether a subject has pen lines is the declared medium's choice, not a contrast turned
// down until lines appear.
// The tracer's distances are millimetres on the sheet (pen-trace.mjs TRACE_MM), so it needs the sheet's width: --sheetmm,
// else the planning workspace's frozen.json (bench/frozen.json, its sheetmm), else the bench sheet, 280 mm.
// node bench/tools/trace-ink.mjs target.png out.json [--sheetmm N]
import fs from "node:fs";import path from "node:path";import sharp from "sharp";import {tracePen,luminance} from "./pen-trace.mjs";
const args=process.argv.slice(2);
const usage="usage: node bench/tools/trace-ink.mjs target.png out.json [--sheetmm N] (the limits come from the subject's own value range and are not settable)";
if(!(args.length===2||(args.length===4&&args[2]==="--sheetmm")))throw new Error(usage);
const [tgt,out]=args;
const frozen=path.join(path.dirname(new URL(import.meta.url).pathname),"..","frozen.json");
const sheetMm=args.length===4?Number(args[3]):fs.existsSync(frozen)?Number(JSON.parse(fs.readFileSync(frozen,"utf8")).sheetmm):280;
if(!(sheetMm>0))throw new Error(usage);
const {data,info}=await sharp(tgt).removeAlpha().raw().toBuffer({resolveWithObject:true});const W=info.width,H=info.height;
const t=tracePen(luminance(data,W,H),W,H,{pixelMm:sheetMm/W}),minC=t.scale.step,maxLum=t.scale.mid;
const res=t.lines.map(l=>({points:l.points,length:l.length,weight:l.weight,strength:1,width:l.width,closed:false,role:"subject",object:"target-hard-line",kind:"line",group:"detail",selection:{method:"traced target thin dark line, one step of the subject's own nine-step value scale ("+minC.toFixed(3)+") darker than both sides, in its darker half (<= "+maxLum.toFixed(3)+"), with a lighter side (a contour, not inside a dark mass); walked through crossings, joined across the tracer's reach, split where it turns back; one nib and one weight per line"}}));
fs.writeFileSync(out,JSON.stringify({image:{w:W,h:H},lines:res,source:tgt,crop:[0,0,W,H],registration:"traced from the target crop itself"},null,1));
console.log("value range",t.scale.ink.toFixed(3),"..",t.scale.paper.toFixed(3),"step",minC.toFixed(3),"darkest half <=",maxLum.toFixed(3));console.log("line pixels",t.stats.linePixels,"spans",res.length,"inside dark masses",t.stats.inMass,"total length",res.reduce((a,l)=>a+l.length,0).toFixed(0));
