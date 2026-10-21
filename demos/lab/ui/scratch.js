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
 // Protect whole UI regions, including transparent panels and text, not just
 // the pointer's target: brush footprints and wet pigment can spread sideways.
 const occupied='button,a,input,select,textarea,summary,label,[role="dialog"],[popover],header,nav,footer,.panel,.sheet,.notes,.stage>*,#painting-picker,#target-figure';
 function protectedRects(){return [...document.querySelectorAll(occupied)].flatMap(el=>
  getComputedStyle(el).visibility==='hidden'?[]:[...el.getClientRects()]);}
 const blocked=(e,rects=protectedRects())=>rects.some(r=>e.clientX>=r.left-2&&e.clientX<=r.right+2&&e.clientY>=r.top-2&&e.clientY<=r.bottom+2);
 function mask(){if(!sheet)return;for(const r of protectedRects()){
  const x=Math.floor((r.left-2)*scale),y=Math.floor((r.top-2)*scale);
  g.clearRect(x,y,Math.ceil((r.right+2)*scale)-x,Math.ceil((r.bottom+2)*scale)-y);
 }}
 function reset(s){canvas.width=Math.ceil(innerWidth*scale);canvas.height=Math.ceil(innerHeight*scale);const dpi=s.scratchDpi*scale;sheet=createSheet({...makePaper(canvas.width,canvas.height,paperOptions(s.surface,dpi,17)),mmPerCell:25.4/dpi},PIGMENTS);}
 function draw(){if(!sheet)return;step(sheet,{dt:.3});const age=performance.now()-born,alpha=Math.max(0,1-Math.max(0,age-2000)/2200),im=g.createImageData(canvas.width,canvas.height);
  for(let i=0;i<sheet.n;i++){let mass=0;for(let k=0;k<sheet.K;k++)mass+=sheet.G[k][i]+sheet.D[k][i]+sheet.P[k][i];for(let c=0;c<3;c++)im.data[i*4+c]=colour[c];im.data[i*4+3]=255*(waterOnly?Math.min(.18,(sheet.W[i]+sheet.s[i])*.15):(1-Math.exp(-mass*3)))*alpha;}
  g.putImageData(im,0,0);mask();if(alpha>0||pointer!==null)timer=setTimeout(draw,60);else{sheet=null;g.clearRect(0,0,canvas.width,canvas.height);}
 }
 const point=e=>({x:e.clientX*scale,y:e.clientY*scale,p:e.pointerType==='pen'?e.pressure:settings().pressure,v:.6});
 document.getElementById('redip').addEventListener('click',()=>{signature=null;});
 document.addEventListener('touchstart',e=>{if(!blocked(e.touches[0]))e.preventDefault();},{passive:false});
 document.addEventListener('pointerdown',e=>{
  if(e.button!==0||blocked(e)||pointer!==null)return;
  const s=settings();if(!sheet)reset(s);waterOnly=s.tool==='water';colour=waterOnly?[120,160,190]:s.tool==='pen'?[72,45,31]:s.tool==='pencil'?[70,70,70]:s.colour;const conc=PIGMENTS.map(p=>(s.mixture?.[p.key]??(p.key===s.pigment?1:0))*s.amount);
  const nextSignature=JSON.stringify({...s,autoRedip:undefined,colour:undefined});
  if(signature!==nextSignature||!tool||(!tool.isPen&&needsRedip(tool,s.autoRedip!==false))){
   tool=s.tool==='pen'?createPen({reservoir:70,reach:4}):createBrush(handBrushOptions(s,{dpi:s.scratchDpi*scale,seed:17}));
   if(s.tool==='pen')dipPen(tool,PIGMENTS.map(p=>p.key==='walnut'?7:0));else dip(tool,{water:s.water,conc:s.tool==='water'?conc.map(()=>0):conc});
   signature=nextSignature;
  }
  tool.isPen=s.tool==='pen';pointer=e.pointerId;last=point(e);born=performance.now();clearTimeout(timer);draw();e.target.setPointerCapture?.(e.pointerId);e.preventDefault();
 },{passive:false});
 document.addEventListener('pointermove',e=>{if(e.pointerId!==pointer)return;if(blocked(e)){last=null;return;}const pt=point(e);if(!last){last=pt;return;}if(tool.isPen)penStroke(tool,sheet,[last,pt]);else stroke(tool,sheet,[last,pt],{lift:false});last=pt;born=performance.now();e.preventDefault();},{passive:false});
 for(const type of ['pointerup','pointercancel'])document.addEventListener(type,e=>{if(e.pointerId===pointer){if(!tool.isPen&&last)stroke(tool,sheet,[last],{lift:true});pointer=null;born=performance.now();}});
 // Re-mask immediately when scrolling or opening UI over fading paint.
 document.addEventListener('scroll',mask,true);
 new MutationObserver(mask).observe(document.body,{subtree:true,attributes:true,childList:true,characterData:true});
 addEventListener('resize',()=>{clearTimeout(timer);sheet=null;pointer=null;canvas.width=innerWidth*scale;canvas.height=innerHeight*scale;});
}
