// Generated from src/media/drawing-materials.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// The drawing materials (sepia ink, black ink, graphite): their pigment, the widths their point lays, how width follows
// pressure and how strong a line is. The painter draws with them (src/paint/methods/material-profiles.mjs); Paint Lab's
// stroke bench gets a generated copy. DOM free.
const pigment = (name, K, omega = 60) => Object.freeze({name,K,S:[.02,.02,.02],rho:.05,omega,gamma:0});
export const MATERIAL_PROFILES = Object.freeze({
 'sepia-ink': {pigment:pigment('sepia ink',[.396,.481,.619],1.4),rewets:true,widthMm:[.12,.45],pressureExponent:1.2,concentration:4,kind:'ink'},
 'black-ink': {pigment:pigment('black ink',[.62,.62,.62]),rewets:false,widthMm:[.1,.4],pressureExponent:1.3,concentration:4,kind:'ink'},
 // A flexible drawing nib spans hairlines through emphatic outlines. Explicit
 // measured widths remain bounded by this declared physical instrument range.
 'drawing-ink': {pigment:pigment('black ink',[.62,.62,.62]),rewets:false,widthMm:[.03,1.2],pressureExponent:1.3,concentration:4,kind:'ink'},
 'graphite-HB': {pigment:pigment('graphite HB',[.22,.22,.23]),rewets:false,widthMm:[.15,.45],pressureExponent:1.5,concentration:.6,kind:'graphite'},
 'graphite-2B': {pigment:pigment('graphite 2B',[.3,.3,.31]),rewets:false,widthMm:[.18,.6],pressureExponent:1.1,concentration:.85,kind:'graphite'},
});
for(const p of Object.values(MATERIAL_PROFILES)){p.paperResponse=p.kind==='ink'?'crisp on dry; capillary bleed on damp':'dry deposition on tooth; fixed under washes';p.registration='source drawing points in sheet coordinates; no added paths';Object.freeze(p);}
