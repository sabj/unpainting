// Recording: step saved sheet states without blending. Paths describe the displayed interval.
// The final saved image becomes dry paper that the shared media can paint over.
const loadImage = src => new Promise((resolve, reject) => {
  const img = new Image(); img.onload = async () => { try { await img.decode(); resolve(img); } catch(error) { reject(error); } }; img.onerror = () => reject(Error(`Could not load ${src}`)); img.src = src;
});
function placeOnSheet(aspect, W, H) {
  const w = Math.min(W * .94, H * .94 * aspect), h = w / aspect;
  return {x:(W-w)/2, y:(H-h)/2, w, h};
}
export function pointOnPath(xy, fraction) {
  let length = 0; const lengths = [];
  for (let i=2; i<xy.length; i+=2) { const d=Math.hypot(xy[i]-xy[i-2],xy[i+1]-xy[i-1]); lengths.push(d); length+=d; }
  let left = fraction*length;
  for(let j=0;j<lengths.length;j++) { const d=lengths[j]; if(left<=d) {const t=d?left/d:0;return [xy[j*2]+(xy[j*2+2]-xy[j*2])*t,xy[j*2+1]+(xy[j*2+3]-xy[j*2+1])*t];} left-=d; }
  return xy.slice(-2);
}
export async function playFilm(film, overlay, W, H, {progress, skipped, alive, paused=()=>false, speed=()=>1, brush=()=>true,seek=0}) {
  if(film.operations)return playNativeOperations(film,overlay,W,H,{progress,skipped,alive,paused,speed,seek});
  const [images,tape] = await Promise.all([Promise.all(film.frames.map(loadImage)), film.paths?fetch(film.paths).then(r=>{if(!r.ok)throw Error(`Stroke paths: ${r.status}`);return r.json();}):Promise.resolve({strokes:[]})]);
  const final=images.at(-1), box=placeOnSheet(film.aspect,W,H);
  if(!alive()) return {final,box};
  if(overlay.width!==W)overlay.width=W;if(overlay.height!==H)overlay.height=H;
  // Compose offscreen, then publish one complete opaque frame. Retain it between steps.
  const buffer=new OffscreenCanvas(W,H), g=buffer.getContext('2d'), visible=overlay.getContext('2d'), numbers=film.frameNumbers, end=numbers.at(-1);
  let previousFrame=-1, previousBrush=null;
  const draw=(p, showBrush=true)=>{
    const frame=p*end;let i=0;while(i<numbers.length-1&&numbers[i+1]<=frame)i++;
    const brushVisible=showBrush&&brush()&&p<1;
    if(i===previousFrame&&brushVisible===previousBrush)return;
    previousFrame=i;previousBrush=brushVisible;
    g.fillStyle='#fff';g.fillRect(0,0,W,H);g.drawImage(images[i],box.x,box.y,box.w,box.h);

    if(brushVisible){
      const paths=tape.strokes.filter(s=>s[0]===numbers[i]);
      if(paths.length){const at=paths.length-1,s=paths[Math.min(paths.length-1,Math.floor(at))],xy=pointOnPath(s.slice(3),1),scale=box.w/tape.w*tape.unit;
        g.beginPath();g.arc(box.x+xy[0]*scale,box.y+xy[1]*scale,Math.max(2,s[2]*scale),0,2*Math.PI);g.strokeStyle='white';g.lineWidth=3;g.stroke();g.strokeStyle='#863d2c';g.lineWidth=1;g.stroke();}
    }
    visible.drawImage(buffer,0,0);overlay.hidden=false;
  };
  let elapsed=seek*film.seconds*1000,last=0;
  await new Promise(resolve=>{const tick=now=>{
    if(!alive()){resolve();return;}
    if(skipped()){resolve();return;}
    if(last&&!paused()&&!document.hidden)elapsed+=Math.min(80,now-last)*speed();last=now;
    const p=Math.min(1,elapsed/(film.seconds*1000));draw(p);progress(p,1);
    if(p===1)resolve();else requestAnimationFrame(tick);
  };requestAnimationFrame(tick);});
  if(alive())draw(Math.min(1,elapsed/(film.seconds*1000)),false);
  return {final:overlay,box:{x:0,y:0,w:W,h:H}};
}
export function sheetPixels(final,box,W,H){
  const c=new OffscreenCanvas(W,H),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,H);g.drawImage(final,box.x,box.y,box.w,box.h);return g.getImageData(0,0,W,H).data;
}

/** Integer RGB replacement/XOR; the PNG transports bytes, never alpha-blended paint. */
export function applyNativeOperation(rgb,width,height,event,patch) {
 const r=event.rectangle;
 if(!r){if(event.file||patch?.length)throw Error('Unexpected native operation payload');return;}
 if(!['replace','xor'].includes(event.encoding)||![r.x,r.y,r.width,r.height].every(Number.isInteger)||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>width||r.y+r.height>height||patch.length!==r.width*r.height*3)throw Error('Invalid native operation rectangle');
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width*3;x++){const to=((r.y+y)*width+r.x)*3+x,from=y*r.width*3+x;rgb[to]=event.encoding==='xor'?rgb[to]^patch[from]:patch[from];}
}
const pixelHash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
async function playNativeOperations(film,overlay,W,H,{progress,skipped,alive,paused,speed,seek}) {
 const response=await fetch(film.operations);if(!response.ok)throw Error(`Native recording: ${response.status}`);
 const m=await response.json();if(m.kind!=='native-operation-recording'||m.complete!==true||!m.events?.length||!m.events[0].keyframe||!m.events.at(-1).keyframe)throw Error('Incomplete native operation recording');
 const width=m.width,height=m.height;if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Invalid native recording dimensions');
 const rgb=new Uint8Array(width*height*3),surface=new OffscreenCanvas(width,height),g=surface.getContext('2d',{willReadFrequently:true}),rgba=new Uint8ClampedArray(width*height*4);
 const box=placeOnSheet(width/height,W,H),visible=overlay.getContext('2d');overlay.width=W;overlay.height=H;
 const target=Math.min(m.events.length-1,Math.floor(seek*(m.events.length-1)));let begin=target;while(begin>0&&!m.events[begin].keyframe)begin--;
 let prior=null;
 for(let i=begin;i<m.events.length;i++){
  if(!alive())break;
  while(paused()&&alive()&&!skipped())await new Promise(r=>setTimeout(r,30));
  const e=m.events[i];if(e.index!==i)throw Error('Native operation order mismatch');
  if(i!==begin&&e.previousSHA256!==prior)throw Error('Native operation prior hash mismatch');
  let patch=null;
  if(e.file){const r=await fetch(new URL(e.file,film.operations));if(!r.ok)throw Error(`Native payload: ${r.status}`);const bytes=await r.arrayBuffer();if(await pixelHash(bytes)!==e.payloadSHA256)throw Error('Native payload hash mismatch');
   const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
   if(bitmap.width!==e.rectangle.width||bitmap.height!==e.rectangle.height)throw Error('Native payload dimensions mismatch');
   const tile=new OffscreenCanvas(bitmap.width,bitmap.height),tg=tile.getContext('2d',{willReadFrequently:true});tg.drawImage(bitmap,0,0);bitmap.close();const pixels=tg.getImageData(0,0,tile.width,tile.height).data;patch=new Uint8Array(tile.width*tile.height*3);for(let a=0,b=0;a<patch.length;a+=3,b+=4){patch[a]=pixels[b];patch[a+1]=pixels[b+1];patch[a+2]=pixels[b+2];}
  }
  applyNativeOperation(rgb,width,height,e,patch);prior=await pixelHash(rgb);if(prior!==e.pixelSHA256)throw Error('Native decoded pixel hash mismatch');
  if(i<target)continue;
  for(let a=0,b=0;a<rgb.length;a+=3,b+=4){rgba[b]=rgb[a];rgba[b+1]=rgb[a+1];rgba[b+2]=rgb[a+2];rgba[b+3]=255;}g.putImageData(new ImageData(rgba,width,height),0,0);
  visible.fillStyle='#fff';visible.fillRect(0,0,W,H);visible.drawImage(surface,box.x,box.y,box.w,box.h);overlay.hidden=false;progress(i+1,m.events.length);
  if(!skipped())await new Promise(r=>setTimeout(r,Math.max(0,100/Math.max(.01,speed()))));
 }
 return {final:surface,box};
}
