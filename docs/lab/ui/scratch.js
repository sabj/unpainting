// Disposable test paper, isolated from the painting and its history.
import {makePaper} from '../media/paper.js';
import {createSheet,step} from '../media/sheet.js';
import {createBrush,dip,stroke} from '../media/brush.js';
import {createPen,dipPen,penStroke} from '../media/pen.js';
import {PIGMENTS} from '../media/pigments.js';
import {paperOptions} from '../media/papers.js';
import {handBrushOptions,needsRedip} from '../brush-load.js';
export function setupScratch(canvas,settings){
 const g=canvas.getContext('2d');let pointer=null,last=null,tool=null,signature=null,sheet=null,born=0,timer=0,colour,waterOnly=false;
 const scale=.4;
 function reset(s){canvas.width=Math.ceil(innerWidth*scale);canvas.height=Math.ceil(innerHeight*scale);const dpi=s.scratchDpi*scale;sheet=createSheet({...makePaper(canvas.width,canvas.height,paperOptions(s.surface,dpi,17)),mmPerCell:25.4/dpi},PIGMENTS);}
 function draw(){if(!sheet)return;step(sheet,{dt:.3});const age=performance.now()-born,alpha=Math.max(0,1-Math.max(0,age-2000)/2200),im=g.createImageData(canvas.width,canvas.height);
  for(let i=0;i<sheet.n;i++){let mass=0;for(let k=0;k<sheet.K;k++)mass+=sheet.G[k][i]+sheet.D[k][i]+sheet.P[k][i];for(let c=0;c<3;c++)im.data[i*4+c]=colour[c];im.data[i*4+3]=255*(waterOnly?Math.min(.18,(sheet.W[i]+sheet.s[i])*.15):(1-Math.exp(-mass*3)))*alpha;}
  g.putImageData(im,0,0);if(alpha>0||pointer!==null)timer=setTimeout(draw,60);else{sheet=null;g.clearRect(0,0,canvas.width,canvas.height);}
 }
 const point=e=>({x:e.clientX*scale,y:e.clientY*scale,p:e.pointerType==='pen'?e.pressure:settings().pressure,v:.6});
 document.getElementById('redip').addEventListener('click',()=>{signature=null;});
 document.addEventListener('touchstart',e=>{if(!e.target.closest('button,a,input,select,textarea,summary,label,.sheet,.panel,#painting-picker,#target-figure'))e.preventDefault();},{passive:false});
 document.addEventListener('pointerdown',e=>{
  if(e.target.closest('button,a,input,select,textarea,summary,label,.sheet,.panel,#painting-picker,#target-figure')||pointer!==null)return;
  const s=settings();if(!sheet)reset(s);waterOnly=s.tool==='water';colour=waterOnly?[120,160,190]:s.tool==='pen'?[72,45,31]:s.tool==='pencil'?[70,70,70]:s.colour;const conc=PIGMENTS.map(p=>(s.mixture?.[p.key]??(p.key===s.pigment?1:0))*s.amount);
  const nextSignature=JSON.stringify({...s,autoRedip:undefined,colour:undefined});
  if(signature!==nextSignature||!tool||(!tool.isPen&&needsRedip(tool,s.autoRedip!==false))){
   tool=s.tool==='pen'?createPen({reservoir:70,reach:4}):createBrush(handBrushOptions(s,{dpi:s.scratchDpi*scale,seed:17}));
   if(s.tool==='pen')dipPen(tool,PIGMENTS.map(p=>p.key==='walnut'?7:0));else dip(tool,{water:s.water,conc:s.tool==='water'?conc.map(()=>0):conc});
   signature=nextSignature;
  }
  tool.isPen=s.tool==='pen';pointer=e.pointerId;last=point(e);born=performance.now();clearTimeout(timer);draw();e.target.setPointerCapture?.(e.pointerId);e.preventDefault();
 },{passive:false});
 document.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;const pt=point(e);if(tool.isPen)penStroke(tool,sheet,[last,pt]);else stroke(tool,sheet,[last,pt],{lift:false});last=pt;born=performance.now();e.preventDefault();},{passive:false});
 for(const type of ['pointerup','pointercancel'])document.addEventListener(type,e=>{if(e.pointerId===pointer){if(!tool.isPen)stroke(tool,sheet,[last],{lift:true});pointer=null;born=performance.now();}});
 addEventListener('resize',()=>{clearTimeout(timer);sheet=null;pointer=null;canvas.width=innerWidth*scale;canvas.height=innerHeight*scale;});
}
