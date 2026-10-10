import {registeredHumanSkin,returnExcludedSkinToWash,registeredFurPlan} from '../tuned/modulation-anatomy.mjs';
import { createHash } from 'node:crypto';
import { legacySkinCell, transferPaintOwnedResidual } from '../tuned/paint-owned-residual.mjs';
import { recoverWash, remainingMix } from './colour-budget.mjs';
import { needCells } from '../../media/sheet.mjs';
// --modulate 1: the base plan and marks kept, with washes scaled by 1 - pale x field in a detail field around the focus.
// What the scaling took out is laid late as dry brush along the form, so the lights stay open and form is built with
// strokes. The measured style (practice-style.mjs) sets pale and coverage; lights in the field get soft frisket.
//   --modpale, --modcover          override the style's strengths
//   --modreach 0.06                the detail field's blur, as a share of the short side
//   --modlight 0.12                source density under which a cell in the detail field is a light to reserve
import { focusMap } from './practice-plan.mjs';
import { measureStyle } from './practice-style.mjs';
import { shapeLights } from './practice-regions.mjs';
import { minFilter, maxFilter } from '../../raster.js';
import { orientationField, furMarks } from '../../crop/fur.mjs';

export async function planModulation(c) {
  const { A, K, w, h, n, SRC, px, image, gaussian, num, opt, log, path, fs, sharp, root } = c;
  if (num('modulate', 0) <= 0) return null;
  const style = await measureStyle({ SRC, w, h, n, px, gaussian, minFilter, maxFilter, log });
  const pale = opt('modpale', '') !== '' ? num('modpale', 0.5) : Math.min(0.75, 0.5 + 0.25 * style.dry);
  const cover = opt('modcover', '') !== '' ? num('modcover', 0.4) : Math.min(0.8, 0.3 + 0.5 * style.dry);
  const focus = await focusMap({ SRC, w, h, n, image, gaussian, num, log, path, fs, sharp, root, fg: null });
  const short = Math.min(w, h);
  // the detail field: the focal blobs blurred to about a head's size, normalised to 1 at their core
  const Fb = gaussian(Float32Array.from(focus.focal), w, h, Math.max(1, num('modreach', 0.06) * short));
  let top = 0; for (const v of Fb) top = Math.max(top, v);
  const field = Float32Array.from(Fb, v => Math.min(1, v / Math.max(1e-6, 0.6 * top)));
  const scale = Float32Array.from(field, v => 1 - pale * v);
  const Aw = new Float32Array(n * K), Ad = new Float32Array(n * K);
  for (let i = 0; i < n; i++) for (let j = 0; j < K; j++) { const a = A[i * K + j]; Aw[i * K + j] = a * scale[i]; Ad[i * K + j] = a - Aw[i * K + j]; }
  // Reserve only the textured budget that the dry brush can actually carry. Smooth local
  // colour still builds through transparent glazes, not through an absent detail pass.
  if (c.colourBudget) {
    const B = gaussian(SRC,w,h,2), tx=gaussian(Float32Array.from(SRC,(v,i)=>Math.abs(v-B[i])),w,h,1.5);
    recoverWash({Aw,Ad},Float32Array.from(tx,v=>Math.min(1,v/num('modtex',0.035))),K);
  }
  // the lights in the detail field, reserved soft
  const raw = Uint8Array.from({ length: n }, (_, i) => (field[i] > 0.25 && SRC[i] < num('modlight', 0.12) ? 1 : 0));
  const lights = shapeLights(raw, { w, h, n, gaussian, num });
  let paintOwnedTransfer=null,geometryAw=null,paintOwnedResidual=null,paintOwnedCheckpointBounds=null,paintOwnedFixtureCells=[];
  if(opt('modpaintplanes','')){
    const file=path.resolve(root,opt('modpaintplanes','')),doc=JSON.parse(fs.readFileSync(file));
    if(doc.checkpointBoundsNormalized){const b=doc.checkpointBoundsNormalized;if(!Array.isArray(b)||b.length!==4||b.some(v=>!Number.isFinite(v)||v<0||v>1)||b[0]>=b[2]||b[1]>=b[3])throw Error('paint-owned checkpoint bounds invalid');paintOwnedCheckpointBounds=b;}
    if(doc.diagnosticPointsNormalized){if(!Array.isArray(doc.diagnosticPointsNormalized)||doc.diagnosticPointsNormalized.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>=1)))throw Error('paint-owned diagnostic point invalid');paintOwnedFixtureCells=doc.diagnosticPointsNormalized.map(p=>Math.floor(p[1]*h)*w+Math.floor(p[0]*w));}
    const targetHash=createHash('sha256').update(fs.readFileSync(path.resolve(root,image))).digest('hex');
    if(doc.target?.sha256!==targetHash||doc.target.width/doc.target.height!==w/h)throw Error('paint-owned residual target registration mismatch');
    const B2=gaussian(SRC,w,h,2),texB=gaussian(Float32Array.from(SRC,(v,i)=>Math.abs(v-B2[i])),w,h,1.5);
    const authoredPlaneWash=doc.operation==='transfer-authored-plane-detail-residual-to-wash';
    const eligible=Uint8Array.from({length:n},(_,i)=>authoredPlaneWash?1:legacySkinCell(px[i*3]/255,px[i*3+1]/255,px[i*3+2]/255)&&texB[i]>=num('modtex',.035)?1:0);
    geometryAw=Float32Array.from(Aw);paintOwnedResidual=Float32Array.from(Ad);
    paintOwnedTransfer=transferPaintOwnedResidual({Aw,Ad,K,w,h,eligible,lights,doc});
    for(let i=0;i<n;i++)if(!paintOwnedTransfer.selected[i])for(let j=0;j<K;j++)paintOwnedResidual[i*K+j]=0;
    fs.writeFileSync(path.join(opt('out',''),'paint-owned-residual.json'),JSON.stringify({...paintOwnedTransfer,selected:undefined,input:file,targetHash,calibrationStatus:'unchanged legacy production calibration; allocation is not delivery'},null,2));
    await sharp(Buffer.from(Uint8Array.from(paintOwnedTransfer.selected,v=>v?255:0)),{raw:{width:w,height:h,channels:1}}).png().toFile(path.join(opt('out',''),'paint-owned-residual-support.png'));
  }
  let nl = 0, nf = 0; for (let i = 0; i < n; i++) { nl += lights[i]; if (field[i] > 0.25) nf++; }
  log(`modulate: style ink ${style.ink}, dry ${style.dry}, wet ${style.wet}; washes scaled to ${(100 * (1 - pale)).toFixed(0)}% at the core of a detail field over ${(100 * nf / n).toFixed(1)}% of the sheet, ${nl} light cells reserved there, dry-brush coverage ${cover.toFixed(2)}`);
  let anatomySkin=null,anatomyAudit=null,furPlan=null,filmLights=null,bodyMaterialTransfer=null;
  if(opt('modanatomy','')){
    if(geometryAw)throw Error('modanatomy cannot silently combine a different paint-owned allocation adapter');
    const file=path.resolve(root,opt('modanatomy','')),doc=JSON.parse(fs.readFileSync(file,'utf8'));
    const targetBytes=fs.readFileSync(path.resolve(root,image)),meta=await sharp(targetBytes).metadata();
    anatomySkin=registeredHumanSkin(doc,{sha256:createHash('sha256').update(targetBytes).digest('hex'),width:meta.width,height:meta.height,w,h,px});
    furPlan=registeredFurPlan(doc,w,h);if(furPlan){filmLights=Uint8Array.from(lights);for(let i=0;i<n;i++)if(furPlan.cat[i]){filmLights[i]=furPlan.film[i];lights[i]=furPlan.film[i]||furPlan.negative[i]?1:0;}const body=Uint8Array.from(furPlan.fur,v=>v?0:1);bodyMaterialTransfer=returnExcludedSkinToWash({Aw,Ad,K,skin:body,lights});}
    anatomyAudit={input:file,inputSHA256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),humanSkinCells:anatomySkin.reduce((a,b)=>a+b,0),bodyMaterialTransfer,...returnExcludedSkinToWash({Aw,Ad,K,skin:anatomySkin,lights}),referenceCue:doc.referenceCue,stageIntent:doc.stageIntent};
    log(`modulation anatomy: ${anatomyAudit.humanSkinCells} registered human skin cells; ${anatomyAudit.transferred.toFixed(6)} existing deferred pigment returned to wash`);
  }
  return { style, pale, cover, field, Aw, Ad, lights, focus, paintOwnedTransfer, geometryAw, paintOwnedResidual, paintOwnedCheckpointBounds, paintOwnedFixtureCells, anatomySkin, anatomyAudit, furPlan, filmLights };
}

// The soft reserve for the modulation's lights, joined to the painter's own resist and its soft strength.
export function joinResist(R0, S0, M, { w, h, n, distanceToZero }) {
  if (!M || !M.lights) return { R: R0, S: S0 };
  const R = new Uint8Array(n); for (let i = 0; i < n; i++) R[i] = (R0 && R0[i]) || M.lights[i] ? 1 : 0;
  const filmLights=M.filmLights??M.lights;for(let i=0;i<n;i++)if(M.furPlan?.cat[i])R[i]=filmLights[i]?1:0;
  const d = distanceToZero(filmLights, w, h);
  const S = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!R[i]) continue;
    if(M.furPlan?.cat[i]){S[i]=1;continue;}
    if (R0 && R0[i]) { S[i] = S0 ? S0[i] : 1; continue; }
    const t = Math.min(1, Math.max(0, (d[i] - 1) / 3)); S[i] = 0.15 + 0.85 * t * t * (3 - 2 * t);
  }
  return { R, S };
}

// The dry brush: short strokes with a wide, wet brush, only where the source has texture at the stroke's scale (hair,
// fur, cloth folds) and never on skin. Each is a pale mix of the local wash, charged no more than the paling took out
// there, so a stroke never ends darker than the plan.
//   --modtex 0.035                  the source's texture (density against its own blur at 2 cells) a cell needs
//   --modlen 0.025 --modgap 0.012   stroke length and spacing, shares of the short side
//   --modbrush 0.008                stroke radius, share of the short side; --modwater 0.5, --modstrength 0.8, --modpaler 0.7
// --drymark 1: the mark lands light, swells to its belly a third of the way along and lifts to a point, bends with the
// form, splays, and breaks up in streaks. At 0 it is a straight, flat-butted wedge that stipples into hard shapes.
// --drymarkcurl, --drymarkstreak, --drymarkbridge override the shape's defaults.
const dryMarkShape = num => (num('drymark', 0) > 0 ? { width: num('drymarkwidth', 0.6), length: num('drymarklen', 1.8), water: num('drymarkwater', 0.42) } : null);
export function dryMarkPath(m, { SC, rB, shape }) {
  if (!shape) return m.map(x => ({ x: (x.x + 0.5) * SC, y: (x.y + 0.5) * SC, r: rB, p: x.p != null ? x.p : 0.8 }));
  const last = Math.max(1, m.length - 1), r = rB * shape.width;
  return m.map((x, k) => {
    const s = Math.pow(Math.sin(Math.PI * Math.pow(k / last, 0.6)), 0.8);
    return { x: (x.x + 0.5) * SC, y: (x.y + 0.5) * SC, r: r * (0.3 + 0.7 * s), p: 0.22 + 0.73 * s };
  });
}
export function dryMarkBrush({ rB, shape, seed, len = 20, num = (_, d) => d }) {
  if (!shape) return { radius: rB, bristles: Math.max(12, Math.ceil(rB * 3)), capacity: 30, belly: 3, feed: 0.1, give: 0.7, free: 0.35, film: 0.22, splay: 0.05, stiffness: 6, wetMix: 0.2, bridge: 0.6, bridgeSoft: 1.3, streak: 0.4, seed };
  return { radius: rB * shape.width, bristles: Math.max(16, Math.ceil(rB * 3)), capacity: 22, belly: 2, feed: 0.05, give: 0.7, free: 0.45, film: 0.22,
    splay: num('drymarksplay', 0.12), stiffness: num('drymarkstiff', 20), fine: num('drymarkfine', 0.1), coarse: num('drymarkcoarse', 0.1), wetMix: 0.2, bridge: num('drymarkbridge', 0.88), bridgeSoft: 2.2,
    streak: num('drymarkstreak', 0.75), streakLength: Math.max(6, 0.5 * len), breakup: 2.2, seed };
}

export async function layDryBrush(M, c) {
  const { sheet, w, h, n, SC, W2, H2, K, SRC, px, gaussian, num, dip, createBrush, stroke, step, dry, O, CAL, UPRIGHT, SEED, expected, used, clock, shoot, setStage, log } = c;
  if (!M || !(M.cover > 0)) return;
  const short = Math.min(w, h), field = orientationField(SRC, w, h, gaussian, { sigma: 2.5 });
  if(M.furPlan)for(let i=0;i<n;i++)if(M.furPlan.fur[i]){const sx=M.furPlan.dx[i],sy=M.furPlan.dy[i],dot=field.dx[i]*sx+field.dy[i]*sy,sign=dot<0?-1:1;let x=.75*sx+.25*sign*field.dx[i],y=.75*sy+.25*sign*field.dy[i],len=Math.hypot(x,y)||1;field.dx[i]=x/len;field.dy[i]=y/len;}
  const B2 = gaussian(SRC, w, h, 2), tex = Float32Array.from(SRC, (v, i) => Math.abs(v - B2[i]));
  const texB = gaussian(tex, w, h, 1.5), tmin = num('modtex', 0.035);
  // skin: warm, moderately saturated, not dark; ginger fur is more saturated than skin and is left in
  const skin = new Uint8Array(n);
  if (px) for (let i = 0; i < n; i++) {
    const r = px[i * 3] / 255, g = px[i * 3 + 1] / 255, b = px[i * 3 + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx - mn < 1e-3) continue;
    const sat = (mx - mn) / (1 - Math.abs(2 * l - 1)), hue = mx === r ? (60 * ((g - b) / (mx - mn)) + 360) % 360 : mx === g ? 60 * ((b - r) / (mx - mn)) + 120 : 60 * ((r - g) / (mx - mn)) + 240;
    if (hue < 45 && sat > 0.12 && sat < 0.55 && l > 0.35 && r > g && g > b) skin[i] = 1;
  }
  const want = new Float32Array(n), dir = new Float32Array(n * K), paler = num('modpaler', 0.7);
  let nt = 0, ns = 0;
  for (let i = 0; i < n; i++) {
    if (M.lights[i] || texB[i] < tmin || (M.furPlan&&!M.furPlan.fur[i])) continue;
    if (!M.furPlan&&(M.anatomySkin??skin)[i]) { ns++; continue; }
    let tw = 0, td = 0; for (let j = 0; j < K; j++) { tw += M.Aw[i * K + j]; td += M.Ad[i * K + j]; }
    if (td < 0.02 || tw < 1e-4) continue;
    want[i] = td * paler; nt++;
    for (let j = 0; j < K; j++) dir[i * K + j] = M.Aw[i * K + j] / tw;   // the local wash's own colour
  }
  const SHAPE = dryMarkShape(num);
  const marks = furMarks(want, field, w, h, { length: Math.max(4, Math.round(num('modlen', 0.025) * short * (SHAPE ? SHAPE.length : 1))), spacing: Math.max(3, Math.round(num('modgap', 0.012) * short)), seed: 7707 + SEED, coverage: c.colourBudget ? 0.65 : Math.min(0.4, M.cover * 0.5), minWant: 0.03, curl: SHAPE ? num('drymarkcurl', 0.35) : 0, tip: 0.35 });
  // --strokebudget: the dry brush keeps its share of the strokes, the marks that want it most, laid once
  if (c.maxMarks > 0 && marks.length > c.maxMarks) marks.length = c.maxMarks;
  const rB = Math.max(1.2 * SC, num('modbrush', 0.008) * Math.min(W2, H2));
  const every = Math.max(24, Math.round(24 * Math.sqrt(Math.max(1, marks.length))));
  const shots = Math.max(1, Math.round(num('modframes', 4)));
  let st = 0, executedMarks = 0;
  const reachedCalibration=await c.calibrateDryMarks?.({marks,shape:SHAPE,rB,SC,SEED,num,UPRIGHT});
  const previousClip=sheet.clip;
  if(c.colourBudget) {
    const clip=new Uint8Array(W2*H2);
    for(let i=0;i<n;i++) if(SRC[i]>.08 && M.field[i]>.05 && !M.lights[i]) {
      const x=i%w,y=(i/w)|0;
      for(let dy=0;dy<SC;dy++)for(let dx=0;dx<SC;dx++)clip[(y*SC+dy)*W2+x*SC+dx]=previousClip ? previousClip[(y*SC+dy)*W2+x*SC+dx] : 1;
    }
    c.setClip(sheet,clip);
  }
  for (let round=0;round<(c.colourBudget && !(c.maxMarks > 0) ? 3 : 1);round++) {

  for (const [q, m] of marks.entries()) {
    const mid = m[m.length >> 1], ci = Math.min(n - 1, Math.max(0, Math.round(mid.y) * w + Math.round(mid.x)));
    const wv = m.reduce((a, x) => a + x.want, 0) / m.length;
    const pts = dryMarkPath(m, { SC, rB, shape: SHAPE });
    const b = createBrush(dryMarkBrush({ rB, shape: SHAPE, seed: 7801 + q + SEED, len: m.length * SC, num }));
    let mix=Array.from({length:K},(_,j)=>dir[ci*K+j]*wv);
    if(c.colourBudget) {
      const target=Array.from({length:K},(_,j)=>M.Aw[ci*K+j]+M.Ad[ci*K+j]);
      needCells(sheet, (ci % w) * SC, ((ci / w) | 0) * SC, SC, SC); // the cells it reads, current if the sheet is on the GPU
      const got=Array.from({length:K},(_,j)=>{let v=0;const x=ci%w,y=(ci/w)|0;for(let dy=0;dy<SC;dy++)for(let dx=0;dx<SC;dx++){const q=(y*SC+dy)*W2+x*SC+dx;v+=sheet.G[j][q]+sheet.D[j][q]+sheet.P[j][q];for(const layer of sheet.layers)v+=layer[j][q];}return v/(SC*SC);});
      mix=remainingMix(target,got).map(v=>v*0.65);
    }
    if(c.beforeGesture&&!c.beforeGesture({mid,brush:b,points:pts,water:SHAPE?SHAPE.water:num('modwater',.5)}))continue;
    dip(b, { water: SHAPE ? SHAPE.water : num('modwater', 0.5), conc: mix.map(v => v * num('strength', 2.2) * (reachedCalibration?reachedCalibration.gain(pts):CAL['wet on dry']??1) * num('modstrength', c.colourBudget ? 1.4 : 0.8)) });
    if(c.beforeDryContact&&c.beforeDryContact({brush:b,points:pts})===false)continue;
    clock('strokes', () => stroke(b, sheet, pts, { upright: UPRIGHT, between: () => { if (++st % every === 0) clock('flow', () => step(sheet, O)); } }));
    executedMarks++;
    for (const x of m) { const i = Math.round(x.y) * w + Math.round(x.x); if (i >= 0 && i < n) for (let j = 0; j < K; j++) expected[i * K + j] += dir[ci * K + j] * x.want * 0.5; }
    if (marks.length > shots && (q + 1) % Math.ceil(marks.length / shots) === 0) { setStage({ stage: 'paint', step: 'dry brush along the form', pigment: 'dry brush', laying: true }); await shoot(); }
  }
  clock('dry', () => dry(sheet, 20000, O, { levelMax: num('drylevel', 140), dt: num('drydt', 14) }));
  }
  if(c.colourBudget) c.setClip(sheet,previousClip);
  used['dry brush along the form'] = executedMarks;
  setStage({ stage: 'paint', step: 'dry brush along the form', pigment: 'dry brush' });
  await shoot();
  log(`modulate: ${executedMarks} dry-brush strokes of radius ${rB.toFixed(1)} on ${nt} textured cells (${ns} skin cells left out), pale mixes of the local wash`);
}
