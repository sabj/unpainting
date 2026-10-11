// A separate overlay: paint exports remain paint; physical masks stay on the sheet
// whether or not the viewer chooses to display their tint.
export function createOperationsUI(sheet, send) {
 const canvas=document.createElement('canvas');canvas.id='operation-overlay';canvas.setAttribute('aria-hidden','true');sheet.append(canvas);
 const controls=document.createElement('div');controls.id='operation-controls';controls.className='toolbar';
 const toggle=document.createElement('input');toggle.type='checkbox';toggle.id='show-mask';toggle.checked=true;
 const label=document.createElement('label');label.append(toggle,' Show masks & boundaries');
 const remove=document.createElement('button');remove.type='button';remove.id='remove-mask';remove.textContent='Remove mask';remove.addEventListener('click',()=>send({type:'remove-mask'}));
 const boundary=document.createElement('button');boundary.type='button';boundary.id='remove-boundary';boundary.textContent='Remove boundary';boundary.addEventListener('click',()=>send({type:'remove-boundary'}));
 const status=document.createElement('span');status.id='mask-status';
 controls.append(label,remove,boundary,status);document.getElementById('replay-controls').after(controls);
 const timeline=document.createElement('ol');timeline.id='operation-timeline';timeline.setAttribute('aria-label','Painting operation timeline');controls.after(timeline);
 const tools=document.querySelector('[data-tool="dryer"]').parentElement;
 for(const [kind,text,title] of [['mask','Mask','Paint masking fluid'],['lift','Lift','Lift mobile paint with a damp tool; staining remains'],['blot','Blot','Blot wet paint with tissue']]){
  const b=document.createElement('button');b.type='button';b.dataset.tool=kind;b.textContent=text;b.title=title;b.setAttribute('aria-pressed','false');tools.append(b);
 }
 let masks={},operation=null,contact=null,w=0,h=0,playing=false;
 const g=canvas.getContext('2d'),backdrop=document.createElement('canvas'),bg=backdrop.getContext('2d'),layer=document.createElement('canvas');
 let backdropDirty=true;
 function tint(mask,colour,outline=false,box={x:0,y:0,w,h},ctx=g) {
  if(!mask)return;
  const image=g.createImageData(box.w,box.h);
  for(let i=0;i<mask.length;i++)if(mask[i]){
   const x=i%box.w,y=Math.floor(i/box.w);
   if(outline&&x>0&&x<box.w-1&&y>0&&y<box.h-1&&mask[i-1]&&mask[i+1]&&mask[i-box.w]&&mask[i+box.w])continue;
   image.data.set(colour,i*4);
  }
  // Draw via a small temporary canvas so successive overlays alpha-composite.
  if(layer.width!==box.w)layer.width=box.w;if(layer.height!==box.h)layer.height=box.h;layer.getContext('2d').putImageData(image,0,0);ctx.drawImage(layer,box.x,box.y);
 }
 function draw(){
  if(!w||!h)return;g.clearRect(0,0,w,h);
  if(backdropDirty){
   if(backdrop.width!==w)backdrop.width=w;if(backdrop.height!==h)backdrop.height=h;bg.clearRect(0,0,w,h);
  if(toggle.checked){tint(masks.resist,[129,159,177,115],false,undefined,bg);tint(masks.clip,[177,116,46,210],true,undefined,bg);}
  if(operation?.mask&&(toggle.checked||!['mask','unmask','clip','unclip'].includes(operation.kind))){const colour=['dry','dryer','clip','unclip'].includes(operation.kind)?[231,148,70,100]:operation.kind==='blot'||operation.kind==='lift'?[185,143,199,120]:[99,165,195,90];tint(operation.mask,colour,false,undefined,bg);
   const tool={dryer:'≈ Heat',dry:'≈ Drying',lift:'▱ Damp lifting tool',blot:'▧ Tissue',water:'◦ Clean water'}[operation.kind];
   if(tool){const i=operation.mask.indexOf(1);if(i>=0){const x=Math.min(w-110,Math.max(2,i%w)),y=Math.max(14,Math.floor(i/w));bg.font='10px sans-serif';bg.fillStyle='#faf6e9ee';bg.fillRect(x,y-12,108,16);bg.fillStyle='#544439';bg.fillText(tool,x+3,y);}}
  }
   backdropDirty=false;
  }
  g.drawImage(backdrop,0,0);
  if(contact&&document.getElementById('show-brush').checked){tint(contact.mask,[76,66,56,205],true,contact);}
 }
 toggle.addEventListener('change',()=>{backdropDirty=true;draw();});document.getElementById('show-brush').addEventListener('change',draw);
 function updateStatus(){
  const masked=masks.resist?.some(Boolean),clipped=Boolean(masks.clip);
  remove.disabled=playing||!masked;boundary.disabled=playing||!clipped;
  status.textContent=[masked?'Blue-grey: masking fluid remains':'',clipped?'Ochre line: allowed passage':''].filter(Boolean).join(' · ');
 }
 return {
  canvas,
  reset(width,height){w=width;h=height;canvas.width=w;canvas.height=h;masks={};operation=contact=null;backdropDirty=true;timeline.replaceChildren();updateStatus();draw();},
  playing(on){playing=on;updateStatus();},
  clear(){operation=contact=null;backdropDirty=true;draw();},
  stage(data){
   const last=timeline.lastElementChild;
   if(last?.dataset.label===data.label){last.textContent=data.label+(data.done!=null?` · after stroke ${data.done}`:'');return;}
   last?.removeAttribute('aria-current');const li=document.createElement('li');li.dataset.label=data.label;li.textContent=data.label+(data.done!=null?` · after stroke ${data.done}`:'');li.setAttribute('aria-current','step');timeline.append(li);
   if(timeline.children.length>200)timeline.firstElementChild.remove();timeline.scrollTop=timeline.scrollHeight;
  },
  frame(data){if(data.masks){masks=data.masks;backdropDirty=true;updateStatus();}if(data.operation!==undefined){operation=data.operation;backdropDirty=true;}contact=data.replayPoint?.contact??null;draw();}
 };
}
