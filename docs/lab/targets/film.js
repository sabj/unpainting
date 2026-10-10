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
