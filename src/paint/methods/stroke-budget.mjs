// --passmerge 1 and --strokebudget N: about as many brush strokes as a painter makes, a few hundred to two thousand,
// instead of one stroke per passage, since a pass of one colour at one value is laid as a few sweeps.

// --focusmap <png>: white is focus, any size; a passage's weight is 0.25 + focus, so the focus gets most strokes.
// Without a map the modulation's detail field (modulate.mjs) is used when there is one; otherwise the weight is flat.
export async function loadFocus({ opt, w, h, sharp, path, root }) {
  const f = opt('focusmap', '');
  if (!f) return null;
  const { data } = await sharp(path.resolve(root, f)).greyscale().resize(w, h, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  return Float32Array.from(data, v => v / 255);
}

const handling = sh => (sh.graded ? null : `${sh._wow ? 1 : 0}|${sh._opening ?? '-'}|${sh._tint ?? '-'}|${sh._flat ? 1 : 0}|${sh._detail ? 1 : 0}|${sh._mass ?? '-'}`);
const props = sh => { const t = sh.mix.reduce((a, v) => a + v, 0) || 1; return sh.mix.map(v => v / t); };

/**
 * --passmerge 1 (needs --brushfloor, whose clip holds the paint to each passage): one pass's passages with the same
 * handling and a mix within --mergetol (L1) laid as one, its mask the union, its charge the area-weighted mean.
 * Returns new shape objects; the originals are not changed.
 */
export function mergeShapes(shapes, { n, tol = 0.25, amt = 1.35, film = null }) {
  const out = [], groups = [];
  for (const sh of shapes) {
    const key = handling(sh);
    if (key === null || !sh.mix) { out.push(sh); continue; }
    const p = props(sh);
    // and at about the same strength (within a ratio of --mergeamt), so a pale passage and a darker one of the same mix
    // are not laid at their mean
    let g = groups.find(g => g.key === key && g.p.reduce((a, v, j) => a + Math.abs(v - p[j]), 0) < tol && Math.max(g.a / sh.amount, sh.amount / g.a) < amt);
    if (!g) { g = { key, p, a: sh.amount, members: [] }; groups.push(g); }
    g.members.push(sh);
  }
  for (const g of groups) {
    if (g.members.length === 1) { out.push(g.members[0]); continue; }
    const mask = new Uint8Array(n); let area = 0, amt = 0, fm = 0; const K = g.members[0].mix.length, mix = new Array(K).fill(0);
    for (const sh of g.members) {
      const m = sh.mask; let a = 0; for (let i = 0; i < n; i++) if (m[i]) { mask[i] = 1; a++; }
      area += a; amt += sh.amount * a; for (let j = 0; j < K; j++) mix[j] += sh.mix[j] * a;
      if (film) fm += film.get(sh) ?? 0;
    }
    if (!area) continue;
    const first = g.members[0];
    const merged = { mask, area, amount: amt / area, mix: mix.map(v => v / area), merged: g.members.length,
      _wow: first._wow, _opening: first._opening, _tint: first._tint, _flat: first._flat, _detail: first._detail, _mass: first._mass };
    if (film) film.set(merged, fm);
    out.push(merged);
  }
  return out;
}

/**
 * --strokebudget N: brush paths, dip to lift, shared out as --budgetsplit (washes, drags, dry brush, accents). Returns
 * each passage's share of the wash paths by area times focus, at least one, and counts for the other brushes.
 */
export function planBudget({ N, layers, focus, n, split = [0.6, 0.2, 0.08, 0.12] }) {
  if (!(N > 0)) return null;
  const wt = m => { if (!focus) { let a = 0; for (let i = 0; i < n; i++) a += m[i]; return a; } let a = 0; for (let i = 0; i < n; i++) if (m[i]) a += 0.25 + focus[i]; return a; };
  const shapeW = new WeakMap(); let total = 0;
  for (const L of layers) for (const sh of L.shapes) { const v = wt(sh.mask); shapeW.set(sh, v); total += v; }
  const wash = N * split[0];
  return {
    N, wash, drags: Math.round(N * split[1]), dry: Math.round(N * split[2]), accents: Math.round(N * split[3]),
    // a passage's share of the wash strokes, at least one
    target: sh => Math.max(1, Math.round(wash * (shapeW.get(sh) ?? 0) / Math.max(1e-9, total))),
  };
}


/** Whole-run allocation. Every value pass competes by painted area, never by
 * execution order. The largest-remainder allocation has an exact integer sum. */
export function allocateStrokes(weights, count) {
  if (!Number.isSafeInteger(count) || count < 0) throw Error('Invalid stroke budget');
  const total = weights.reduce((s,v)=>s+Math.max(0,v),0);
  if (!total) return weights.map(()=>0);
  const shares=weights.map(v=>count*Math.max(0,v)/total), out=shares.map(Math.floor);
  const order=shares.map((v,i)=>({i,f:v-out[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);
  for(let i=0,left=count-out.reduce((a,b)=>a+b,0);i<left;i++)out[order[i].i]++;
  return out;
}
export function completeBudget({N,layers,drawing=0}) {
  // Keep the pigment passes of one geometric passage together. Selecting just
  // its strongest channel turns neutral shadows into red/blue/green patches.
  const groups=new Map(), targets=new WeakMap();
  for(const layer of layers)for(const shape of layer.shapes){
    const mask=shape.mask;let hash=2166136261;
    for(let i=0;i<mask.length;i++)if(mask[i])hash=Math.imul(hash^i,16777619)>>>0;
    const key=layer.value+':'+shape.area+':'+hash;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(shape);targets.set(shape,0);
  }
  const ordered=[...groups.values()].map(shapes=>({shapes,weight:Math.sqrt(shapes[0].area)*shapes.reduce((v,s)=>v+s.amount,0)})).sort((a,b)=>b.weight-a.weight);
  let left=Math.max(0,N-drawing);const admitted=[];
  // First pay for the full colour of each selected passage, across every value.
  for(const g of ordered)if(g.shapes.length<=left){for(const s of g.shapes){targets.set(s,1);admitted.push(s);}left-=g.shapes.length;}
  const extra=allocateStrokes(admitted.map(s=>Math.sqrt(s.area)*Math.max(.01,s.amount)),left);
  admitted.forEach((s,i)=>targets.set(s,targets.get(s)+extra[i]));
  return {N,wash:N-drawing,drags:0,dry:0,accents:0,target:s=>targets.get(s)??0};
}
/** Broad parallel sweeps cover the entire passage. More budget means narrower
 * lanes, not a longer prefix of the same path list. The existing passage clip
 * holds the bead at its edge. No target pixels are read here. */
export function budgetPaths(mask,w,h,count) {
  if(!count)return [];
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(x1<0)return [];
  const horizontal=x1-x0>=y1-y0, lo=horizontal?y0:x0, hi=(horizontal?y1:x1)+1;
  const lanes=Math.min(count,hi-lo), width=(hi-lo)/lanes, paths=[];
  for(let j=0;j<lanes;j++){
    const a=lo+j*width,b=lo+(j+1)*width,mid=(a+b)/2-.5;
    let start=Infinity,end=-Infinity;
    for(let v=Math.floor(a);v<Math.ceil(b);v++)for(let u=horizontal?x0:y0;u<=(horizontal?x1:y1);u++)if(mask[horizontal?v*w+u:u*w+v]){start=Math.min(start,u);end=Math.max(end,u);}
    if(end<start)continue;
    const r=Math.max(.65,width*.58),point=u=>horizontal?{x:u,y:mid,r,p:1}:{x:mid,y:u,r,p:1};
    paths.push([point(start-r*.2),point(end+r*.2+.1)]);
  }
  return paths;
}

/** CLI defaults for an opt-in complete study. Explicit caller flags still win. */
export function strokeBudgetDefaults(N=0) {
 if(!Number.isSafeInteger(N)||N<0||(N>0&&N<25))throw Error('--strokebudget must be 0 (off) or an integer >= 25');
 if(!N)return {};
 return {maxvalues:Math.min(12,Math.max(3,Math.round(Math.sqrt(N)/5))),openinglines:Math.max(2,Math.floor(N*.08)),closinglines:0,drawshare:Math.min(1,Math.sqrt(N/2500)),penoutline:0,tex:0,drags:0,finish:0,midlayers:Math.min(4,Math.max(1,Math.round(Math.sqrt(N)/16))),touchpoints:0,shapedmarks:0,skylanes:0,drawing:'first'};
}
