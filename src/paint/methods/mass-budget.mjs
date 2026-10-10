// --massbudget 1: neutral dark masses get their full wash budget, not a reduced wash
// plus a reserved texture budget. The normal passages still paint their internal forms.
// Their dense interior drawing is left to the paint, keeping isolated features outside.
import { cutStrokes } from '../techniques/dark-mass.mjs';
/** Broad dark connected regions; tiny eyes, whiskers and accents stay with the normal painter. */
export function coherentMasses(SRC, w, h, { gaussian, components, num, rgb = null }) {
  const scale = Math.min(w, h) / 540;
  const field = gaussian(SRC, w, h, Math.max(1, num('smoothmassradius', 3) * scale));
  const chroma = rgb ? gaussian(Float32Array.from(SRC, (_, i) =>
    (Math.max(rgb[3*i], rgb[3*i+1], rgb[3*i+2]) - Math.min(rgb[3*i], rgb[3*i+1], rgb[3*i+2])) / 255), w, h, Math.max(1, 3 * scale)) : null;
  const mask = Uint8Array.from(field, (v, i) => v >= num('smoothmassdensity', 0.65)
    && (!chroma || chroma[i] <= num('smoothmasschroma', 0.18)) ? 1 : 0);
  const { labels, areas, count } = components(mask, w, h);
  const min = Math.max(16, num('smoothmassmin', 1000) * scale * scale), masses = [];
  // Keep deliberate source lights rather than filling them with the blurred mass selector.
  const lights = components(Uint8Array.from(SRC, v => v < 0.25 ? 1 : 0), w, h);
  for (let id = 1; id <= count; id++) if (areas[id] >= min) {
    const owned = Uint8Array.from(labels, (v, i) => v === id
      && !(lights.labels[i] && lights.areas[lights.labels[i]] >= Math.max(4, 16*scale*scale)) ? 1 : 0);
    masses.push({ name: `painted mass ${id}`, mask: owned, whole: false });
  }
  return masses;
}


export function massBudget({ A, MOD, K, SRC, rgb, w, h, gaussian, components, num, log }) {
  if (num('massbudget', 0) <= 0 || !MOD) return null;
  const masses = coherentMasses(SRC, w, h, { gaussian, components, num, rgb });
  const owned = new Uint8Array(w*h);
  for (const m of masses) for (let i=0;i<owned.length;i++) if(m.mask[i]) owned[i]=1;
  let cells=0;
  for(let i=0;i<owned.length;i++) if(owned[i]) {
    cells++;
    for(let j=0;j<K;j++) { MOD.Aw[i*K+j]=A[i*K+j]; MOD.Ad[i*K+j]=0; }
  }
  log(`mass budget: ${masses.length} neutral dark masses, ${cells} cells receive full wash pigment; no duplicate texture budget`);
  const pad = num('masspenpad', 0) * Math.min(w,h) / 540;
  const penMask = pad > 0 ? Uint8Array.from(gaussian(Float32Array.from(owned),w,h,pad),v=>v>0.1?1:0) : owned;
  // `box` (paint-plate's maskBox of the same mask, inclusive rows and columns): only those are walked, the same cells counted
  const owns = (mask, box = null) => {
    let all=0,inside=0;
    if (box) { for (let y=box.y0;y<=box.y1;y++) { const r=y*w; for (let x=box.x0;x<=box.x1;x++) { const i=r+x; if(mask[i]){all++;inside+=owned[i];} } } }
    else for(let i=0;i<mask.length;i++)if(mask[i]){all++;inside+=owned[i];}
    return all>0 && inside/all>0.5;
  };
  return { owned, owns,
    skipCutIn: mask => { if(num('masscutin',1)>0)return false; let all=0,inside=0; for(let i=0;i<mask.length;i++)if(mask[i]){all++;inside+=owned[i];} return all>0 && inside/all>0.5; },
    cutPen: g => num('massink',0)>0 ? g : cutStrokes(g,penMask,w,h) };
}
