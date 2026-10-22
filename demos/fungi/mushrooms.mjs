// Spore Studies — MIT, copyright 2026 Sam Jackson.
// Geometry and variable-pressure ink remain vectors. A persistent Unpainting
// sheet receives each specimen passage; native flow, drying and glaze checkpoints
// supply the displayed painting, replay and PNG. No reused paint atlas is used.
// Art acceptance is separate from software tests: a fresh, uninformed reviewer
// sees only the finished artwork, never the UI, code, target or prior scores.
// Every tested form and held-out seed must score >=90/100 for plausibly being
// a real hand-drawn, hand-colored botanical plate. Failed plates remain failed;
// an average, cherry-picked seed or functional test cannot satisfy that gate.
import { makePaper, coldPressField } from '../lab/media/paper.js';
import { createSheet, step, fix, setClip, totals, layersOf, clipRuns } from '../lab/media/sheet.js';
import { createBrush, dip, stroke } from '../lab/media/brush.js';
import { layerRT, renderLayers, renderLayersCached } from '../lab/media/km.js';
import { BY_KEY } from '../lab/media/pigments.js';
import { createPen, dipPen, penStroke } from '../lab/media/pen.js';
import { createCursor } from '../lab/ui/cursor.js';

export const DRAW_DURATION_MS = 7800;

export const TRAITS = Object.freeze([
  'Cap span', 'Cap rise', 'Cap roundness', 'Margin curl', 'Margin ripple',
  'Asymmetry', 'Cap tilt', 'Stem length', 'Stem width', 'Stem taper',
  'Stem bend', 'Stem lean', 'Basal swelling', 'Ring height', 'Ring drape',
  'Lamella density', 'Lamella curve', 'Underside depth', 'Surface detail density',
  'Surface detail size', 'Surface irregularity', 'Pigment load', 'Pigment warmth',
  'Stem wash', 'Shadow glaze', 'Granulation', 'Wash wetness', 'Edge pooling',
  'Edge softness', 'Wash variation', 'Stem fibres', 'Young specimen size',
  'Specimen spacing', 'Young specimen lean', 'Earth flecks', 'Texture phase',
]);

export const FAMILIES = Object.freeze({
  amanita: { taxon: 'Amanitaceae', name: 'Amanitaceae', latin: 'Amanita muscaria', plate: 'I',
    note: 'A scarlet cap, scattered veil remnants, free gills & a skirted stem.',
    feature: 'Remnants of the universal veil', underside: 'Free, crowded lamellae',
    source: 'https://www.mushroomexpert.com/amanita_muscaria_flavivolvata.html',
    width: [150, 197], rise: [68, 123], length: [224, 307], stem: [17, 26] },
  bolete: { taxon: 'Boletaceae', name: 'Boletaceae', latin: 'Boletus edulis group', plate: 'II',
    note: 'A chestnut cushion, a sponge of fine pores & a stout, netted stem.',
    feature: 'A gently incurved cap margin', underside: 'Pores in place of gills',
    source: 'https://www.mushroomexpert.com/boletus_edulis.html',
    width: [148, 195], rise: [80, 126], length: [170, 232], stem: [32, 46] },
  chanterelle: { taxon: 'Cantharellaceae', name: 'Cantharellaceae', latin: 'Cantharellus cibarius group', plate: 'III',
    note: 'An ochre funnel, an undulating edge & blunt folds running down the stem.',
    feature: 'An irregular, shallowly depressed cap', underside: 'Forking, decurrent folds',
    source: 'https://www.mushroomexpert.com/cantharellus_cibarius.html',
    width: [126, 174], rise: [35, 58], length: [185, 255], stem: [19, 29] },
  morel: { taxon: 'Morchellaceae', name: 'Morchellaceae', latin: 'Morchella esculentoides group', plate: 'IV',
    note: 'An egg-shaped honeycomb of pits & ridges, joined to a pale, hollow stem.',
    feature: 'Irregular pits between pale ridges', underside: 'Cap attached directly to the stem',
    source: 'https://www.mushroomexpert.com/morchella_esculentoides.html',
    width: [65, 88], rise: [170, 225], length: [133, 179], stem: [24, 35] },
  parasol: {taxon:'Agaricaceae',name:'Parasol',latin:'Macrolepiota procera',plate:'V',note:'A broad umbonate cap, free gills, a double ring and a snakeskin stipe.',source:'https://www.mushroomexpert.com/macrolepiota_procera.html',width:[155,195],rise:[45,76],length:[275,330],stem:[12,19]},
  inkcap: {taxon:'Agaricaceae',name:'Shaggy inkcap',latin:'Coprinus comatus',plate:'VI',note:'Shaggy white cylinders open into bells with a dissolving black margin.',source:'https://www.mushroomexpert.com/coprinus_comatus.html',width:[62,94],rise:[145,192],length:[180,240],stem:[12,18]},
  oyster: {taxon:'Pleurotaceae',name:'Oyster cluster',latin:'Pleurotus ostreatus',plate:'VII',note:'Overlapping lateral fans, close decurrent gills and a shared woody attachment.',source:'https://www.mushroomexpert.com/pleurotus_ostreatus.html',width:[130,190],rise:[50,90],length:[110,145],stem:[16,22]},
  bracket: {taxon:'Polyporaceae',name:'Turkey tail',latin:'Trametes versicolor',plate:'VIII',note:'Thin, banded fans with pale growing margins, attached directly to wood.',source:'https://www.mushroomexpert.com/trametes_versicolor.html',width:[120,185],rise:[55,110],length:[110,130],stem:[16,22]},
  puffball: {taxon:'Agaricaceae',name:'Pear puffball',latin:'Lycoperdon perlatum',plate:'IX',note:'A continuous pear-shaped body with conical spines and a sterile base.',source:'https://www.mushroomexpert.com/lycoperdon_perlatum.html',width:[70,115],rise:[110,160],length:[110,160],stem:[25,40]},
  coral: {taxon:'Gomphaceae',name:'Coral fungus',latin:'Ramaria flava group',plate:'X',note:'Fleshy yellow branches fork repeatedly from a short, pale united trunk.',source:'https://ascomicet.es/espanol/mostra-bolet-e.php?codi=36',width:[130,190],rise:[100,150],length:[110,160],stem:[25,40]},
});

const FORM_TRAITS={
  parasol:[0,1,2,3,4,5,6,7,8,9,10,11,20,23,25,26,27,28,29,35],
  inkcap:[0,1,3,6,7,8,9,10,11,20,23,25,26,27,28,29,35],
  oyster:[0,1,5,6,10,20,21,25,26,27,28,29,35],
  bracket:[0,1,5,6,10,20,21,25,26,27,28,29,35],
  puffball:[0,1,6,19,20,23,25,26,27,28,29,35],
  coral:[0,1,5,8,20,21,25,26,27,28,29,35],
};
const FORM_LABELS={
  oyster:{0:'Shelf span',1:'Shelf depth',5:'Lateral attachment',6:'Shelf tilt',10:'Cluster offset'},
  bracket:{0:'Fan span',1:'Fan depth',5:'Lateral attachment',6:'Fan tilt',10:'Cluster offset'},
  puffball:{0:'Body width',1:'Body height',6:'Body lean',19:'Apical opening',23:'Body wash'},
  coral:{0:'Crown spread',1:'Branch length',5:'Fork angle',8:'Branch thickness'},
};

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const range = (bounds, t) => mix(bounds[0], bounds[1], t);
const frac = x => x - Math.floor(x);
const sample = (i, salt = 0) => frac(Math.sin(i * 127.1 + salt * 311.7) * 43758.5453);
const valueNoise=(x,y)=>{
  const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy);
  const at=(a,b)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^982451653;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
  return mix(mix(at(ix,iy),at(ix+1,iy),u),mix(at(ix,iy+1),at(ix+1,iy+1),u),v);
};
// Plate light comes from the upper left. 0 on the lit shoulder of a body's
// box, 1 on the lower-right turning edge. Texture density and line weight
// follow it, so marks gather where the form turns away from the light.
export function lightShade(x,y,box){
  const u=(x-(box.x+box.w/2))/(box.w/2||1),w=(y-(box.y+box.h/2))/(box.h/2||1);
  return clamp(.5+.32*u+.4*w);
}

// A type is a curated morphology recipe, not a palette or a random seed.
// These are descriptive art archetypes, not asserted biological species.
// Growth habit: how a species fruits on the ground, from field guides.
//   solitary   - one fruitbody, at most a distant second
//   scattered  - a few, well apart
//   gregarious - several on the same ground, not joined
//   caespitose - clustered, stems joined at a common base
//   imbricate  - overlapping shelves in tiers
//   troop      - many in a line, arc or fairy ring
// It sets how many specimens a seed gathers and how they stand on the plate.
export const GROWTH_HABITS=Object.freeze(['solitary','scattered','gregarious','caespitose','imbricate','troop']);
// Beta species, with sources (refs-lib/<species>/MEASUREMENTS.md "Cluster"
// notes, which cite the named photos, plus the field guides named here).
const BETA_GROWTH_HABITS=Object.freeze({
  // A. muscaria: 2-5 stems within 30 cm, families of stages, rings under birch (refs-lib ph04; MushroomExpert; Phillips, Mushrooms 2006).
  'amanita-1':'gregarious',
  // A. phalloides / rubescens: solitary or 2-3 within 1 m, rarely touching (refs-lib ph08; Phillips).
  'amanita-3':'scattered',
  // B. edulis: 1-3 together, gap 1-3 cap widths, sometimes arcs (refs-lib pi02; Kuo, MushroomExpert).
  'bolete-1':'scattered',
  // C. cibarius: scattered groups of 3-15 in arcs and lines, caps sometimes touching (refs-lib ph07, ph12; Kuo).
  'chanterelle-1':'gregarious',
  // M. esculenta: solitary or 2-4 in a patch within 30 cm (refs-lib ph06; Kuo, Morels 2005).
  'morel-1':'scattered',
  // M. procera: solitary or 2-5 in a loose arc within 2 m (refs-lib; Phillips).
  'parasol-1':'scattered',
  // C. comatus: very gregarious, groups of 3-30, lawn rows, mixed ages (refs-lib ph08, ph10, ph12; Kuo).
  'inkcap-1':'gregarious',
  // A. campestris: fairy rings and arcs of 20-40 caps in pasture (refs-lib pi03; Phillips).
  'agaric-1':'troop',
  // Armillaria mellea: dense tufts of 15-40, stems fused to one dark base (refs-lib ph01, pi03; Kuo).
  'agaric-4':'caespitose',
  // Hygrocybe: scattered individuals and small groups 10-50 cm apart, not tufted (refs-lib ph01; Boertmann, The genus Hygrocybe).
  'waxcap-1':'scattered',
  // L. torminosus: scattered or loose groups of 2-5 under birch (refs-lib pi02; Phillips).
  'milkcap-1':'scattered',
  // H. repandum: loose groups of 2-6 within 30 cm, arcs and rings (refs-lib ph04, ph06; Kuo).
  'hedgehog-1':'gregarious',
  // P. ostreatus: overlapping shelves in a column on wood (refs-lib pi01, ph11; Kuo).
  'oyster-1':'imbricate',
  // L. sulphureus: 4-5 stacked tiers on trunks and stumps (refs-lib ph06; Kuo).
  'bracket-6':'imbricate',
  // T. versicolor: rows and dense tiers of brackets on logs (refs-lib ph02, ph03; Kuo).
  'bracket-1':'imbricate',
  // H. erinaceus: usually a single fruitbody on a wound in a living tree (refs-lib; Kuo).
  'tooth-1':'solitary',
  // L. perlatum: groups of 3-20 on one patch of litter, heads close (refs-lib ph12, pi02; Kuo).
  'puffball-1':'gregarious',
  // G. triplex: 2-6 stars in a patch, 5-30 cm apart, mixed ages (refs-lib ph08; Sunhede, Geastraceae 1989).
  'earthstar-1':'gregarious',
  // P. impudicus: scattered, 1-6 at one wood-debris site, eggs among them (refs-lib ph03, ph07; Phillips).
  'stinkhorn-1':'scattered',
  // Ramaria: single fruitbodies; neighbours 20-100 cm apart (refs-lib ph02, ph06; Kuo).
  'coral-1':'solitary',
});
// Alpha types: from the recipe's name and drawn habit, by the same field-guide categories.
function growthHabitFor(grammar,variant,name){
  const id=`${grammar}-${variant+1}`;if(BETA_GROWTH_HABITS[id])return BETA_GROWTH_HABITS[id];
  if(['bracket','oyster'].includes(grammar))return 'imbricate';
  if(/clustered|tufted|cluster/i.test(name))return 'caespitose';
  if(grammar==='tooth')return /tiered|fan/i.test(name)?'imbricate':'solitary';
  const drawn=['pair','troop','solitary','cluster','pair'][variant];
  return drawn==='solitary'?'solitary':drawn==='troop'?(['agaric','bonnet','waxcap','earthstar','puffball'].includes(grammar)?'troop':'gregarious'):drawn==='cluster'?'caespitose':'scattered';
}
const TYPE_GROUPS = [
  ['amanita','Veiled agarics','amanita',['Warted bulb agaric','Striate sac agaric','Smooth skirt agaric','Flaky rooting agaric','Scaly booted agaric'],['warts','striated','smooth','flakes','scales']],
  ['bolete','Boletes','bolete',['Reticulate cushion bolete','Cracked rooting bolete','Ringed glandular bolete','Shaggy clavate bolete','Velvet slender bolete'],['reticulum','cracked','dots','shaggy','velvet']],
  ['chanterelle','Folded funnels','chanterelle',['Blunt-folded goblet','Ragged branching funnel','Veined shallow funnel','Ruffled clustered funnel','Fine-folded narrow funnel'],['folds','forked','veined','ruffled','striated']],
  ['morel','Pitted caps','morel',['Round honeycomb cap','Conical ribbed cap','Broad closed pitted cap','Broad labyrinth cap','Slender chambered cap'],['pitted','ribbed','pitted','labyrinth','chambered']],
  ['parasol','Parasols','parasol',['Broad tiled parasol','Rooting fibrous parasol','Flat tiled parasol','Shaggy tufted parasol','Slender shagreen parasol'],['scales','fibrils','tiles','shaggy','dots']],
  ['inkcap','Inkcaps','inkcap',['Cylindrical shaggy inkcap','Pleated bell inkcap','Broad dissolving inkcap','Clustered woolly inkcap','Slender fringed inkcap'],['shaggy','pleated','smooth','woolly','fringed']],
  ['oyster','Lateral shelves','oyster',['Overlapping smooth oyster','Deep fringed oyster','Deep-veined fan oyster','Tufted shaggy oyster','Narrow ribbed oyster'],['smooth','fringed','veined','shaggy','ribbed']],
  ['bracket','Bracket fungi','bracket',['Thin zoned bracket','Deep cracked bracket','Velvet rimmed bracket','Clustered scaly bracket','Ribbed tongue bracket'],['zoned','cracked','velvet','scales','ribbed']],
  ['puffball','Puffballs','puffball',['Pear spiny puffball','Tall mosaic puffball','Round smooth puffball','Clustered warted puffball','Tall netted puffball'],['spines','mosaic','smooth','warts','reticulum']],
  ['coral','Coral fungi','coral',['Broad five-stem coral','Open antler coral','Compact blunt coral','Dense seven-stem coral','Slender six-stem coral'],['crowned','antler','blunt','crested','comb']],
  ['agaric','Attached-gilled caps','amanita',['Convex fibrous fieldcap','Conical cracked fieldcap','Flat smooth fieldcap','Clustered scaly fieldcap','Slender striate fieldcap'],['fibrils','cracked','smooth','scales','striated']],
  ['bonnet','Bonnets','amanita',['Bell-shaped ribbed bonnet','Rooting pleated bonnet','Rounded silky bonnet','Tufted hairy bonnet','Needle-stem striate bonnet'],['ribbed','pleated','silky','hairy','striated']],
  ['waxcap','Waxy caps','amanita',['Convex waxy cap','Split-margin waxy cap','Broad distant-gilled waxcap','Twisted clustered waxcap','Acute fibrillose waxcap'],['smooth','split','velvet','twisted','fibrils']],
  ['milkcap','Depressed gilled caps','chanterelle',['Inrolled woolly milkcap','Zoned rooting milkcap','Shallow smooth brittlegill','Ragged clustered brittlegill','Cracked narrow milkcap'],['woolly','zoned','smooth','ragged','cracked']],
  ['hedgehog','Toothed caps','bolete',['Convex stout hedgehog','Scaly rooting toothcap','Smooth eccentric toothcap','Tufted ragged toothcap','Slender velvet toothcap'],['lobed','scales','smooth','ragged','velvet']],
  ['cup','Cups and ears','puffball',['Shallow ribbed cup','Split ear cup','Stalked smooth goblet','Clustered hairy cups','Deep fluted chalice'],['ribbed','split','smooth','hairy','fluted']],
  ['trumpet','Hollow trumpets','chanterelle',['Broad ragged trumpet','Twisted ribbed horn','Smooth deep trumpet','Ruffled trumpet cluster','Slender split horn'],['ragged','ribbed','smooth','ruffled','split']],
  ['earthstar','Earthstars','puffball',['Collared six-ray earthstar','Split nine-ray earthstar','Stalked smooth earthstar','Cracked warted earthstar','Curled netted earthstar'],['collared','split','smooth','warts','reticulum']],
  ['nest','Bird’s nests','puffball',['Fluted five-egg nest','Split shallow nest','Smooth stalked nest','Clustered shaggy nests','Deep ribbed two-egg nest'],['fluted','split','smooth','shaggy','ribbed']],
  ['club','Clubs and spindles','coral',['Blunt swollen club','Fork-tip spindle','Round-headed stalked club','Tufted wrinkled clubs','Needle-point club'],['blunt','forked','smooth','wrinkled','pointed']],
  ['jelly','Jelly lobes','puffball',['Broad folded jelly','Split ear jelly','Smooth cushion jelly','Brain-fold jelly cluster','Slender wrinkled jelly'],['folded','split','smooth','brain','wrinkled']],
  ['tooth','Hanging tooth fungi','coral',['Round cascading tooth tuft','Branched icicle fungus','Tiered short-tooth cushion','Dense shaggy tooth cluster','Long pendant tooth fan'],['cascading','branched','short','shaggy','pendant']],
  ['saddle','Saddles and lobed caps','morel',['Two-lobed fluted saddle','Rooting folded saddle','Three-lobed smooth saddle','Clustered chambered saddle','Narrow ribbed saddle'],['fluted','split','smooth','chambered','ribbed']],
  ['stinkhorn','Horns and veils','morel',['Pitted hooded horn','Lace-veiled egg horn','Smooth egg-based horn','Clustered netted horns','Slender ribbed horn'],['pitted','lace','smooth','netted','ribbed']],
];
const TYPE_PALETTES = {
  scarlet:{sienna:.28,alizarin:.56,hansa:.16},ochre:{ochre:.65,hansa:.22,sienna:.13},
  chestnut:{umber:.56,sienna:.3,ochre:.14},cream:{ochre:.24,umber:.22,paynes:.54},
  ash:{paynes:.65,umber:.25,ochre:.1},violet:{ultramarine:.38,alizarin:.4,umber:.22},
  rose:{rose:.58,ochre:.3,umber:.12},olive:{sapgreen:.42,ochre:.43,umber:.15},
  // Field-guide colours for the beta species models.
  ivory:{ochre:.4,hansa:.05,umber:.18,paynes:.12},honey:{ochre:.55,sienna:.25,umber:.2},buff:{ochre:.6,sienna:.22,umber:.18},
  salmon:{rose:.36,sienna:.28,ochre:.36},honeytan:{ochre:.52,umber:.33,sienna:.15},waxorange:{hansa:.42,sienna:.33,alizarin:.25},eggyolk:{ochre:.58,hansa:.34,sienna:.08},sacbrown:{umber:.45,ochre:.38,paynes:.17},parasolcream:{ochre:.5,umber:.32,paynes:.18},deathcap:{sapgreen:.38,ochre:.37,umber:.17,paynes:.08},gleba:{sapgreen:.3,umber:.5,paynes:.2},
  sulphur:{hansa:.6,ochre:.22,sienna:.18},
};
// Beta types follow their model species (BETA.md): A. phalloides olive-green,
// A. campestris white, Armillaria honey, L. torminosus salmon, Hydnum buff,
// Hericium and Lycoperdon white, Phallus with an olive-brown gleba.
const BETA_PALETTES=Object.freeze({'amanita-3':'deathcap','agaric-1':'ivory','agaric-4':'honey','milkcap-1':'salmon','hedgehog-1':'buff','tooth-1':'ivory','puffball-1':'ivory','stinkhorn-1':'gleba','morel-1':'honeytan','waxcap-1':'waxorange','chanterelle-1':'eggyolk','earthstar-1':'sacbrown','parasol-1':'parasolcream'});
const CLOSED_GRAMMARS=new Set(['morel','puffball','earthstar','nest','cup','jelly','club','coral','tooth','saddle','stinkhorn','trumpet']);
const CAP_SHAPES=['dome','conic','flat','lobed','umbonate'];
const STEM_FORMS=['bulbous','rooting','equal','clavate','slender'];
export const MUSHROOM_TYPES=Object.freeze(TYPE_GROUPS.flatMap(([grammar,group,family,names,surfaces])=>names.map((name,variant)=>Object.freeze({
  id:`${grammar}-${variant+1}`,name,group,grammar,family,variant,
  capShape:CAP_SHAPES[variant],stemForm:STEM_FORMS[variant],surface:surfaces[variant],
  margin:['entire','split','inrolled','ragged','striated'][variant],habit:['pair','troop','solitary','cluster','pair'][variant],growthHabit:growthHabitFor(grammar,variant,name),
  veil:grammar==='amanita'?['ring','sac','ring','none','boot'][variant]:grammar==='parasol'?'ring':grammar==='bolete'&&variant===2?'ring':'none',
  hymenium:['bolete','bracket'].includes(grammar)?'pores':grammar==='hedgehog'||grammar==='tooth'?'teeth':grammar==='chanterelle'?'folds':CLOSED_GRAMMARS.has(grammar)?'internal-or-upper':'gills',
  palette:BETA_PALETTES[`${grammar}-${variant+1}`]??(grammar==='amanita'&&variant===0?'scarlet':grammar==='waxcap'?['ochre','rose','olive','scarlet','violet'][variant]:['chanterelle','coral'].includes(grammar)?'ochre':['trumpet','inkcap'].includes(grammar)?'ash':['puffball','cup','nest','earthstar','tooth','club'].includes(grammar)?'cream':'chestnut'),
}))).concat([
  // Laetiporus sulphureus: overlapping sulphur-yellow fans in tiers on oak or
  // cherry stumps, wavy thick margins, pores beneath. Reuses the bracket plan.
  Object.freeze({id:'bracket-6',name:'Sulphur shelf (chicken of the woods)',group:'Bracket fungi',grammar:'bracket',family:'bracket',variant:3,
    capShape:'lobed',stemForm:'equal',surface:'velvet',margin:'ragged',habit:'cluster',growthHabit:'imbricate',veil:'none',hymenium:'pores',palette:'sulphur',form:'sulphur-shelf',substrate:'stump'}),
]));
const TYPES_BY_ID=new Map(MUSHROOM_TYPES.map(type=>[type.id,type]));
export function typeSignature(type){return [type.grammar,type.capShape,type.stemForm,type.surface,type.margin,type.habit,type.veil,type.hymenium].join('|');}
export function getMushroomType(id){const type=TYPES_BY_ID.get(id);if(!type)throw new RangeError('Unknown mushroom type');return type;}
export function compatibleHybrid(hostId,donorId){
  const host=getMushroomType(hostId),donor=getMushroomType(donorId);
  if(host.id===donor.id)return {ok:false,reason:'Choose two different parents.'};
  const bodyOnly=new Set(['forked','crowned','antler','blunt','crested','comb','split','twisted','lobed','collared','pointed','cascading','branched','short','pendant']);
  const modules=[];
  if(host.grammar!=='coral'&&!bodyOnly.has(donor.surface)&&host.surface!==donor.surface)modules.push('surface relief');
  if(host.grammar!=='bracket'&&!(host.grammar==='oyster'&&host.variant===2)&&!CLOSED_GRAMMARS.has(host.grammar)&&!CLOSED_GRAMMARS.has(donor.grammar)&&host.hymenium!==donor.hymenium)modules.push('gills / pores / teeth');
  // Any two different parents combine: proportions and palette always transfer.
  if(host.variant!==donor.variant||!modules.length)modules.push('proportions');return {ok:true,modules};
}
// Seeds spread each form's proportions over most of its species range
// (cap span, rise, roundness, margin, ripple, asymmetry, tilt, stipe length,
// width and taper); the variant centre keeps the species recognisable.
// Alpha (experimental) types keep their earlier narrow spread.
const SEED_TRAIT_SPREAD=Object.freeze([.5,.5,.42,.46,.5,.42,.36,.5,.4,.36]),ALPHA_TRAIT_SPREAD=Object.freeze(Array(10).fill(.22));
export function generateSpecimen(seed,typeId='amanita-1',donorId=null){
  const profile=getMushroomType(typeId),raw=generateGenome(seed,profile.family),v=raw.values.slice(),j=profile.variant;
  const centers=[[.72,.48,.35,.3,.2,.3,.45,.54,.8,.2],[.45,.86,.78,.5,.65,.66,.58,.8,.35,.65],[.92,.18,.25,.8,.12,.25,.35,.32,.65,.12],[.62,.54,.45,.66,.9,.8,.65,.45,.62,.4],[.34,.6,.7,.2,.35,.45,.48,.94,.15,.85]][j];
  const spread=SEED_COUNT_RANGE[typeId]?SEED_TRAIT_SPREAD:ALPHA_TRAIT_SPREAD;
  for(let i=0;i<10;i++)v[i]=clamp(centers[i]+(v[i]-.5)*spread[i],.015,.985);
  let phenotype={...profile},donor=null,inheritance=[];
  if(donorId){
    const compatibility=compatibleHybrid(typeId,donorId);if(!compatibility.ok)throw new RangeError(compatibility.reason);
    donor=getMushroomType(donorId);const dv=generateSpecimen(seed,donorId).values;
    // A chimera: each trait module comes whole from one parent, never an
    // average. The body plan is always the host's; the module choice is
    // fixed by the seed and the pair.
    const from=hybridModules(seed,profile,donor),sources={form:typeId};
    for(const trait of HYBRID_TRAITS){
      if(!from[trait])continue;
      const parent=from[trait]==='donor'?donor:profile;sources[trait]=parent.id;
      if(parent!==donor)continue;
      for(const i of HYBRID_VALUE_SETS[trait])v[i]=dv[i];
      if(trait==='hymenium'){phenotype.hymenium=donor.hymenium;inheritance.push('gills / pores / teeth');}
      if(trait==='surface'){phenotype.surface=donor.surface;phenotype.donorSurface=donor.surface;inheritance.push('surface relief');}
      if(trait==='colour'){phenotype.palette=donor.palette;inheritance.push('cap colour');}
      if(trait==='stem'){phenotype.veil=donor.veil;phenotype.stemForm=donor.stemForm;inheritance.push('stipe and veil');}
      if(trait==='capShape'){phenotype.capShape=donor.capShape;inheritance.push('cap shape');}
      if(trait==='habit'){phenotype.habit=donor.habit;inheritance.push('habit');}
    }
    phenotype.sources=Object.freeze(sources);
  }
  const genome={...raw,values:v,profileId:typeId,donorId:donorId||null,phenotype,title:donor?`${profile.name} × ${donor.name}`:profile.name,fictional:!!donor,inheritance};
  if(donor)genome.hybridLine=hybridLine(genome);
  return genome;
}
// Hybrid trait modules, most legible first. Each module carries its own
// genome values, so a donor cap shape keeps the donor's proportions too.
const HYBRID_TRAITS=Object.freeze(['hymenium','colour','surface','stem','capShape','habit']);
const HYBRID_VALUE_SETS=Object.freeze({habit:[31,32,33],capShape:[0,1,2,3,4,5,6],surface:[18,19,20],hymenium:[15,16,17],stem:[7,8,9,10,11,12,13,14,30],colour:[21,22,23,24]});
const HYBRID_BODY_ONLY=new Set(['forked','crowned','antler','blunt','crested','comb','split','twisted','lobed','collared','pointed','cascading','branched','short','pendant']);
export function hybridModules(seed,host,donor){
  const stalked=t=>!CLOSED_GRAMMARS.has(t.grammar)&&!['oyster','bracket'].includes(t.grammar);
  const available={
    hymenium:host.grammar!=='bracket'&&!(host.grammar==='oyster'&&host.variant===2)&&!CLOSED_GRAMMARS.has(host.grammar)&&!CLOSED_GRAMMARS.has(donor.grammar)&&host.hymenium!==donor.hymenium,
    colour:host.palette!==donor.palette,
    surface:host.grammar!=='coral'&&!HYBRID_BODY_ONLY.has(donor.surface)&&donor.surface!=='reticulum'&&(donor.surface!=='smooth'||['warts','scales','shaggy','spines','pitted','flakes','tiles'].includes(host.surface))&&host.surface!==donor.surface,
    habit:host.habit!==donor.habit,
    stem:stalked(host)&&stalked(donor)&&(host.veil!==donor.veil||host.stemForm!==donor.stemForm),
    capShape:stalked(host)&&stalked(donor)&&!['chanterelle','milkcap'].includes(host.grammar)&&host.capShape!==donor.capShape,
  };
  const list=HYBRID_TRAITS.filter(t=>available[t]),key=hashSeed(`hybrid:${seed}:${host.id}:${donor.id}`)%9973,from={};
  // A changed hymenium is always the donor's: it is the clearest sign.
  list.forEach((t,i)=>{from[t]=t==='hymenium'||sample(key,801+i)<.5?'donor':'host';});
  // At least two donor modules where two exist, and the host keeps at least
  // one module besides its body plan where three or more exist.
  for(const t of list){if(list.filter(x=>from[x]==='donor').length>=2)break;from[t]='donor';}
  if(list.length>=3&&!list.some(t=>from[t]==='host')){const t=[...list].reverse().find(x=>x!=='hymenium');from[t]='host';}
  return from;
}
const HYBRID_SURFACE_WORDS=Object.freeze({warts:'warts',scales:'scales',shaggy:'shaggy scales',pitted:'pits',reticulum:'net',fibrils:'fibrils',velvet:'velvet',zoned:'zones',spines:'spines',flakes:'flakes',tiles:'tiled scales',dots:'dots',woolly:'wool',cracked:'cracks',mosaic:'mosaic',netted:'net',labyrinth:'ridges',chambered:'chambers',ribbed:'ribs',pleated:'pleats',striated:'striations',fluted:'flutes',folds:'folds',veined:'veins',ruffled:'ruffles',hairy:'hairs',silky:'silk',wrinkled:'wrinkles',brain:'folds',lace:'lace',smooth:'smooth skin'});
const HYBRID_WORDS=Object.freeze({hymenium:{gills:'gills',pores:'pores',teeth:'spines',folds:'ridges'},stemVeil:{ring:'ring','double-ring':'double ring',sac:'volva',boot:'booted volva'},stemForm:{bulbous:'bulbous stipe',rooting:'rooting stipe',equal:'stipe',clavate:'club stipe',slender:'slender stipe'}});
// "form and warts of Amanita muscaria · cap colour and pores of Boletus edulis"
// The cap wash strength a type paints its own colour at, so an inherited
// colour arrives as that parent's colour rather than a pale tint of it.
const HYBRID_CAP_LOADS=new Map();
function hybridCapLoad(typeId){
  if(!HYBRID_CAP_LOADS.has(typeId)){const caps=buildStudy(generateSpecimen('cap-load',typeId)).washes.filter(w=>['cap','funnel-cap','puffball'].includes(w.role)&&!w.studyRole);
    HYBRID_CAP_LOADS.set(typeId,caps.length?caps.reduce((s,w)=>s+w.load,0)/caps.length*.85:.17);}
  return HYBRID_CAP_LOADS.get(typeId);
}
export function hybridLine(genome){
  const p=genome.phenotype,src=p?.sources;if(!src)return '';
  const word={form:CLOSED_GRAMMARS.has(p.grammar)?'body':'form',capShape:'cap shape',colour:'colour',surface:HYBRID_SURFACE_WORDS[p.surface]??`${p.surface} surface`,
    hymenium:HYBRID_WORDS.hymenium[p.hymenium]??p.hymenium,habit:{pair:'paired habit',troop:'scattered troop',solitary:'solitary habit',cluster:'clustered habit'}[p.habit]??'habit',stem:src.stem==='amanita-3'?'ring and volva':HYBRID_WORDS.stemVeil[p.veil]??HYBRID_WORDS.stemForm[p.stemForm]??'stipe'};
  const groups=[];
  for(const trait of ['form','capShape','colour','surface','hymenium','stem','habit']){
    const id=src[trait];if(!id)continue;const last=groups.at(-1);
    if(last?.id===id)last.words.push(word[trait]);else groups.push({id,words:[word[trait]]});
  }
  const and=w=>w.length<2?w[0]:`${w.slice(0,-1).join(', ')} and ${w.at(-1)}`;
  return groups.map(g=>`${and(g.words)} of ${ecologyRecord(TYPES_BY_ID.get(g.id)).analogue}`).join(' · ');
}


// Audited against actual ink and wash instructions at two trait extremes.
export const CATALOG_ACTIVE_TRAITS=Object.freeze({
  "amanita-1":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "amanita-2":[0,1,2,3,4,5,6,7,8,9,10,11,12,15,16,17,19,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "amanita-3":[0,1,2,3,4,5,6,7,8,10,11,13,14,15,16,17,20,21,22,23,24,25,26,27,28,29,30,34,35],
  "amanita-4":[0,1,2,3,4,5,6,7,8,9,10,11,12,15,16,17,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "amanita-5":[0,1,2,3,4,5,6,7,8,9,10,11,12,15,16,17,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "bolete-1":[0,1,2,3,4,5,6,7,8,9,10,11,12,17,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "bolete-2":[0,1,2,3,4,5,6,7,8,9,10,11,12,17,19,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "bolete-3":[0,1,2,3,4,5,6,7,8,10,11,13,14,17,20,21,22,23,24,25,26,27,28,29,30,34,35],
  "bolete-4":[0,1,2,3,4,5,6,7,8,9,10,11,12,17,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "bolete-5":[0,1,2,3,4,5,6,7,8,9,10,11,12,17,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "chanterelle-1":[0,1,2,3,4,5,6,7,8,9,10,11,19,20,21,22,24,25,26,27,28,29,30,31,32,33,34,35],
  "chanterelle-2":[0,1,2,3,4,5,6,7,8,9,10,11,19,20,21,22,24,25,26,27,28,29,30,33,34,35],
  "chanterelle-3":[0,1,2,3,4,5,6,7,8,10,11,19,20,21,22,24,25,26,27,28,29,30,34,35],
  "chanterelle-4":[0,1,2,3,4,5,6,7,8,9,10,11,19,20,21,22,24,25,26,27,28,29,30,33,34,35],
  "chanterelle-5":[0,1,2,3,4,5,6,7,8,9,10,11,19,20,21,22,24,25,26,27,28,29,30,31,32,33,34,35],
  "morel-1":[0,1,6,7,8,9,10,11,12,18,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "morel-2":[0,1,6,7,8,9,10,11,12,18,19,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "morel-3":[0,1,6,7,8,10,11,18,20,21,22,23,24,25,26,27,28,29,30,34,35],
  "morel-4":[0,1,6,7,8,9,10,11,12,18,19,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "morel-5":[0,1,6,7,8,9,10,11,12,18,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "parasol-1":[0,1,2,3,4,5,6,7,8,9,10,11,20,22,23,25,26,27,28,29,35],
  "parasol-2":[0,1,2,3,4,5,6,7,8,9,10,11,20,22,23,25,26,27,28,29,35],
  "parasol-3":[0,1,2,3,4,5,6,7,8,10,11,20,22,23,24,25,26,27,28,29,35],
  "parasol-4":[0,1,2,3,4,5,6,7,8,9,10,11,20,22,23,24,25,26,27,28,29,35],
  "parasol-5":[0,1,2,3,4,5,6,7,8,9,10,11,20,22,23,24,25,26,27,28,29,35],
  "inkcap-1":[0,1,3,6,7,8,9,10,11,20,22,23,25,26,27,28,29,35],
  "inkcap-2":[0,1,3,6,7,8,9,10,11,19,20,22,23,25,26,27,28,29,35],
  "inkcap-3":[0,1,3,6,7,8,10,11,20,22,23,25,26,27,28,29,35],
  "inkcap-4":[0,1,3,6,7,8,9,10,11,20,22,23,24,25,26,27,28,29,35],
  "inkcap-5":[0,1,3,6,7,8,9,10,11,20,22,23,25,26,27,28,29,35],
  "oyster-1":[0,1,5,6,10,20,21,22,25,26,27,28,29,35],
  "oyster-2":[0,1,5,6,10,20,21,22,25,26,27,28,29,35],
  "oyster-3":[0,1,5,6,10,19,20,21,22,25,26,27,28,29,35],
  "oyster-4":[0,1,5,6,10,20,21,22,24,25,26,27,28,29,35],
  "oyster-5":[0,1,5,6,10,19,20,21,22,25,26,27,28,29,35],
  "bracket-1":[0,1,5,6,10,20,22,25,26,27,28,29,35],
  "bracket-2":[0,1,5,6,10,19,20,22,25,26,27,28,29,35],
  "bracket-3":[0,1,5,6,10,20,22,25,26,27,28,29,35],
  "bracket-4":[0,1,5,6,10,20,22,24,25,26,27,28,29,35],
  "bracket-5":[0,1,5,6,10,19,20,22,25,26,27,28,29,35],
  "puffball-1":[0,1,6,19,20,22,23,25,26,27,28,29,35],
  "puffball-2":[0,1,6,19,20,22,23,25,26,27,28,29,35],
  "puffball-3":[0,1,6,20,22,23,25,26,27,28,29,35],
  "puffball-4":[0,1,6,19,20,22,23,24,25,26,27,28,29,35],
  "puffball-5":[0,1,6,19,20,22,23,25,26,27,28,29,35],
  "coral-1":[0,1,5,8,20,21,22,25,26,27,28,29,35],
  "coral-2":[0,1,5,8,20,21,22,25,26,27,28,29,35],
  "coral-3":[0,1,5,8,20,21,22,25,26,27,28,29,35],
  "coral-4":[0,1,5,8,20,21,22,25,26,27,28,29,35],
  "coral-5":[0,1,5,8,20,21,22,25,26,27,28,29,35],
  "agaric-1":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "agaric-2":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,19,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "agaric-3":[0,1,2,3,4,5,6,7,8,10,11,12,16,17,20,21,22,23,24,25,26,27,28,29,30,34,35],
  "agaric-4":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "agaric-5":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "bonnet-1":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "bonnet-2":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,19,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "bonnet-3":[0,1,2,3,4,5,6,7,8,10,11,12,16,17,20,21,22,23,24,25,26,27,28,29,30,34,35],
  "bonnet-4":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "bonnet-5":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "waxcap-1":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "waxcap-2":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "waxcap-3":[0,1,2,3,4,5,6,7,8,10,11,12,16,17,20,21,22,23,24,25,26,27,28,29,30,34,35],
  "waxcap-4":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "waxcap-5":[0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "milkcap-1":[0,1,2,3,4,5,6,7,8,9,10,11,20,21,22,24,25,26,27,28,29,30,31,32,33,34,35],
  "milkcap-2":[0,1,2,3,4,5,6,7,8,9,10,11,19,20,21,22,24,25,26,27,28,29,30,33,34,35],
  "milkcap-3":[0,1,2,3,4,5,6,7,8,10,11,20,21,22,24,25,26,27,28,29,30,34,35],
  "milkcap-4":[0,1,2,3,4,5,6,7,8,9,10,11,20,21,22,24,25,26,27,28,29,30,33,34,35],
  "milkcap-5":[0,1,2,3,4,5,6,7,8,9,10,11,19,20,21,22,24,25,26,27,28,29,30,31,32,33,34,35],
  "hedgehog-1":[0,1,2,3,4,5,6,7,8,9,10,11,12,17,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "hedgehog-2":[0,1,2,3,4,5,6,7,8,9,10,11,12,17,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "hedgehog-3":[0,1,2,3,4,5,6,7,8,10,11,17,20,21,22,23,24,25,26,27,28,29,30,34,35],
  "hedgehog-4":[0,1,2,3,4,5,6,7,8,9,10,11,12,17,20,21,22,23,24,25,26,27,28,29,30,33,34,35],
  "hedgehog-5":[0,1,2,3,4,5,6,7,8,9,10,11,12,17,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35],
  "cup-1":[0,1,5,6,20,22,25,26,27,28,29,35],
  "cup-2":[0,1,5,6,20,22,25,26,27,28,29,35],
  "cup-3":[0,1,5,6,20,22,25,26,27,28,29,35],
  "cup-4":[0,1,5,6,20,22,25,26,27,28,29,35],
  "cup-5":[0,1,5,6,20,22,25,26,27,28,29,35],
  "trumpet-1":[0,1,5,6,20,22,25,26,27,28,29,35],
  "trumpet-2":[0,1,5,6,20,22,25,26,27,28,29,35],
  "trumpet-3":[0,1,5,6,20,22,25,26,27,28,29,35],
  "trumpet-4":[0,1,5,6,20,22,25,26,27,28,29,35],
  "trumpet-5":[0,1,5,6,20,22,25,26,27,28,29,35],
  "earthstar-1":[0,5,6,20,22,25,26,27,28,29,35],
  "earthstar-2":[0,5,6,20,22,25,26,27,28,29,35],
  "earthstar-3":[0,5,6,20,22,25,26,27,28,29,35],
  "earthstar-4":[0,5,6,20,22,24,25,26,27,28,29,35],
  "earthstar-5":[0,5,6,19,20,22,25,26,27,28,29,35],
  "nest-1":[0,1,5,6,20,22,25,26,27,28,29,35],
  "nest-2":[0,1,5,6,20,22,25,26,27,28,29,35],
  "nest-3":[0,1,5,6,20,22,25,26,27,28,29,35],
  "nest-4":[0,1,5,6,20,22,25,26,27,28,29,35],
  "nest-5":[0,1,5,6,20,22,25,26,27,28,29,35],
  "club-1":[1,5,6,8,10,20,22,25,26,27,28,29,35],
  "club-2":[1,5,6,8,10,20,22,25,26,27,28,29,35],
  "club-3":[1,5,6,8,10,20,22,25,26,27,28,29,35],
  "club-4":[1,5,6,8,10,20,22,25,26,27,28,29,35],
  "club-5":[1,5,6,8,10,20,22,25,26,27,28,29,35],
  "jelly-1":[0,1,5,6,20,22,25,26,27,28,29,35],
  "jelly-2":[0,1,5,6,20,22,25,26,27,28,29,35],
  "jelly-3":[0,1,5,6,20,22,25,26,27,28,29,35],
  "jelly-4":[0,1,5,6,20,22,25,26,27,28,29,35],
  "jelly-5":[0,1,5,6,20,22,25,26,27,28,29,35],
  "tooth-1":[0,1,6,20,22,25,26,27,28,29,35],
  "tooth-2":[0,1,6,20,22,25,26,27,28,29,35],
  "tooth-3":[0,1,6,20,22,25,26,27,28,29,35],
  "tooth-4":[0,1,6,20,22,25,26,27,28,29,35],
  "tooth-5":[0,1,6,20,22,25,26,27,28,29,35],
  "saddle-1":[0,1,6,20,22,25,26,27,28,29,35],
  "saddle-2":[0,1,6,20,22,25,26,27,28,29,35],
  "saddle-3":[0,1,6,20,22,25,26,27,28,29,35],
  "saddle-4":[0,1,6,20,22,25,26,27,28,29,35],
  "saddle-5":[0,1,6,20,22,25,26,27,28,29,35],
  "stinkhorn-1":[1,5,6,8,20,22,24,25,26,27,28,29,35],
  "stinkhorn-2":[1,5,6,8,20,22,25,26,27,28,29,35],
  "stinkhorn-3":[1,5,6,8,20,22,25,26,27,28,29,35],
  "stinkhorn-4":[1,5,6,8,19,20,22,25,26,27,28,29,35],
  "stinkhorn-5":[1,5,6,8,19,20,22,25,26,27,28,29,35],
});
export function activeTraitsFor(genome){
  const active=CATALOG_ACTIVE_TRAITS[genome.profileId]??TRAITS.map((_,i)=>i);
  return genome.fictional?active.filter(i=>[0,1,6,20,22,25,26,27,28,29,35].includes(i)):active;
}

export function hashSeed(seed) {
  let h = 2166136261;
  for (const c of String(seed)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function generateGenome(seed, family = 'amanita') {
  if (!Object.hasOwn(FAMILIES, family)) throw new RangeError('Unknown mushroom form');
  let s = hashSeed(String(seed));
  const values = TRAITS.map(() => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
  return { seed: String(seed), family, values };
}

export function interpolateGenome(a, b, t) {
  if (a.family !== b.family || a.profileId!==b.profileId || a.donorId!==b.donorId) throw new RangeError('Morph within one mushroom form or hybrid recipe');
  if (!Number.isFinite(t)) throw new RangeError('Blend must be finite');
  t = clamp(t);
  return { ...a, seed: t === 0 ? a.seed : t === 1 ? b.seed : `${a.seed} → ${b.seed}`,
    family: a.family, values: t === 0 ? a.values.slice() : t === 1 ? b.values.slice() : a.values.map((v, i) => mix(v, b.values[i], t)) };
}

// A bounded procedural growth approximation, not a biological simulation.
// Three scales of correlated strain describe unequal tissue expansion. The
// coefficients come from the continuous genome, never the display seed string:
// changing a morph position therefore advects the same material coordinates.
export function growthField(genome,x,y,channel=0){
  const v=genome.values,sx=v[35]*19.7+v[20]*7.1+channel*11.37,
    sy=v[5]*13.3+v[29]*17.9+channel*5.73;
  let value=0,weight=1,total=0,frequency=1;
  for(let octave=0;octave<3;octave++){
    value+=(valueNoise(x*frequency+sx+octave*8.31,y*frequency+sy-octave*4.17)*2-1)*weight;
    total+=weight;weight*=.47;frequency*=2.03;
  }
  return value/total;
}

// Integrate a shared strain field through six short growth steps. Neighbouring
// sites move together; the envelope pins the lip and centreline boundaries.
// Fixed site identities preserve relief topology while seeds vary its layout.
export function growSurfacePoint(genome,u,t,channel=0){
  let point=[clamp(u,-1,1),clamp(t)];
  const maturity=genome.maturity??(.35+.55*genome.values[31]),dt=(.6+.4*maturity)/6;
  const velocity=([x,y])=>[
    .48*(1-x*x)*growthField(genome,x*1.6,y*2.1,channel),
    1.12*y*(1-y)*growthField(genome,x*1.6,y*2.1,channel+1),
  ];
  for(let step=0;step<6;step++){
    const a=velocity(point),b=velocity([point[0]+a[0]*dt*.5,point[1]+a[1]*dt*.5]);
    point=[point[0]+b[0]*dt,point[1]+b[1]*dt];
  }
  return point;
}

// One colony shares its grammar and pigment family; individuals inherit bounded
// continuous deviations. The index is fixed through a morph, so neither anatomy
// nor ornament pops when interpolating two parent seeds.
// Stage of the whole find from trait 31, piecewise linear so a morph moves
// smoothly: about 15% buttons, 25% young, 40% mature and 20% old finds.
export const findStageAge=x=>x<.15?mix(.24,.36,x/.15):x<.4?mix(.36,.52,(x-.15)/.25):x<.8?mix(.52,.72,(x-.4)/.4):mix(.72,.9,(x-.8)/.2);
export function individualGenome(genome,index,count=2){
  const base=genome.values,site=[sample(index,611)*2-1,sample(index,612)],
    exposure=growthField(genome,site[0],site[1],2),
    // Trait 31 is the stage of the whole find, from buttons to old caps;
    // members of one find spread around it with their own growth histories.
    spread=.24*growthField(genome,site[0],site[1],3)+.2*(sample(index,614)-.5)+.1*growthField(genome,site[1],site[0],7),
    raw=findStageAge(base[31])+(count===1?.06*growthField(genome,site[0],site[1],3):spread),
    // Soft limits keep every member's own age distinct near the extremes.
    age=.58+.36*Math.tanh((raw-.58)/.36);
  const vary=new Set([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,17,18,19,20,21,22,23,24,29,30,35]);
  const values=count===1?base.slice():base.map((value,k)=>{
    if(!vary.has(k))return value;
    const amplitude=[5,6,10,11,35].includes(k)?.34:[0,1,7,8,18].includes(k)?.22:.13;
    const incident=(sample(index,k+613)*2-1)*.24+exposure*.20
      +growthField(genome,site[0],site[1],k+5)*.56;
    return clamp(value+amplitude*incident,.015,.985);
  });
  // Related age responses: a button is small, tall and inrolled on a short
  // stem with dense veil remnants; an old cap is broad, flat, wavy at the
  // margin, longer-stemmed and faded. Each response stays within the
  // selected form's construction, and within .38 of the parent trait.
  if(!seedVaried(genome)){
    // Alpha types keep their earlier, gentler age response.
    if(count===1)return {...genome,individualIndex:0,maturity:age};
    values[0]=clamp(values[0]+(age-.65)*.22,.015,.985);values[1]=clamp(values[1]-(age-.65)*.18,.015,.985);values[7]=clamp(values[7]+(age-.65)*.12,.015,.985);
    return {...genome,seed:`${genome.seed}/${index+1}`,values,individualIndex:index,maturity:age};
  }
  const d=age-.6,old=Math.max(0,age-.72),bud=Math.max(0,.38-age);
  const respond=(k,delta)=>{values[k]=clamp(clamp(values[k]+delta,base[k]-.38,base[k]+.38),.015,.985);};
  respond(0,d*.42);respond(1,-d*.5);respond(2,-d*.26);respond(3,-d*.34);respond(4,old*1.1);
  respond(7,d*.36);respond(18,-d*.5+bud*.3);respond(21,-old*1.1+bud*.35);
  return count===1?{...genome,values,individualIndex:0,maturity:age}:{...genome,seed:`${genome.seed}/${index+1}`,values,individualIndex:index,maturity:age};
}

// Within-type variation: one seed is one botanist's find. The seed sets how
// many specimens were gathered, the stage of the find (trait 31: button to
// old) and, through each member's own growth history, cap opening, margin,
// stem stretch, wart density and colour fading. Everything below is derived
// from the continuous genome or fixed member indices, so morphs stay smooth.
export const GROWTH_STAGES=Object.freeze([['button',.22],['young',.38],['mature',.56],['old',.78]]);
export function growthStage(maturity){let name='button';for(const [stage,from] of GROWTH_STAGES)if(maturity>=from)name=stage;return name;}
// A drawn "young" slot stays young until the find is mature; an adult slot
// is drawn as a closed button only in a find of buttons.
// Beta types (and not hybrids) take the seeded find variation.
export const seedVaried=genome=>!!SEED_COUNT_RANGE[genome?.profileId]&&!genome?.donorId;
export const growthYoung=(slotYoung,maturity)=>slotYoung?maturity<.6:maturity<.3;
const growthSlotScale=(slotYoung,young)=>slotYoung===young?1:young?.62:1.45;
// Specimens per find, from refs-lib cluster notes for the beta species.
export const SEED_COUNT_RANGE=Object.freeze({'amanita-1':[1,3],'amanita-3':[1,3],'bolete-1':[1,3],'chanterelle-1':[2,4],'morel-1':[1,3],
  'parasol-1':[1,3],'inkcap-1':[2,4],'agaric-1':[1,3],'agaric-4':[3,5],'waxcap-1':[1,4],'milkcap-1':[1,3],'hedgehog-1':[1,3],
  'oyster-1':[2,4],'bracket-6':[3,5],'bracket-1':[2,4],'tooth-1':[1,2],'puffball-1':[1,4],'earthstar-1':[1,3],'stinkhorn-1':[1,2],'coral-1':[1,2]});
// About a third of finds keep the species' usual drawn count; the rest
// spread over its range. Hybrids and alpha types keep their drawn count.
// An extra member (beyond the drawn figures) is a different individual, not
// a scaled copy: another growth stage and the opposite bend and lean.
export function extraMemberGenome(genome,index){
  if(!seedVaried(genome))return genome;
  const values=genome.values.slice(),shift=index%2?-.34:.34;
  values[31]=clamp(values[31]+shift,.015,.985);values[10]=1-values[10];values[11]=1-values[11];values[6]=1-values[6];values[22]=clamp(values[22]-shift*.4,.015,.985);
  return {...genome,values};
}
// Open habits (scattered, gregarious) show at most this many members on a
// plate, so the dominant figure is never crowded.
export const OPEN_HABIT_MAX_MEMBERS=3;
export const OPEN_HABITS=Object.freeze(['scattered','gregarious']);
export const OPEN_HABIT_KEEP=Object.freeze(['morel']);
export function seedSpecimenCount(genome,drawn){
  drawn=Math.max(1,Math.min(5,Math.round(drawn||1)));
  const habit=genome?.phenotype?.growthHabit;if(!habit||genome.donorId)return drawn;
  const count=habitCount(habit,caNoise(7,hashSeed(`count:${genome.seed}`)));
  return OPEN_HABITS.includes(habit)?Math.min(OPEN_HABIT_MAX_MEMBERS,count):count;
}
// Members per find for each habit (at most 5, the plate's member limit).
export function habitCount(habit,u){
  if(habit==='solitary')return u<.82?1:2;
  if(habit==='scattered')return u<.12?1:u<.6?2:3;
  if(habit==='caespitose')return u<.55?3:4;
  return 3+Math.min(2,Math.floor(u*3));
}
// Which drawn figures a plate with fewer members keeps: always the largest
// (the dominant figure), then a seeded choice of the rest in drawn order.
const figureOwnerMemo=new WeakMap();
export function figureOwner(plan,count,n,index,seed=''){
  if(!plan||n>=count)return index%count;
  const key=`${count}:${n}:${seed}`,memo=figureOwnerMemo.get(plan)??{};
  if(!memo[key]){
    const marks=plan.bodies??plan.washes??[],area=Array.from({length:count},(_,i)=>{const pts=marks.filter(m=>m.individual===i&&m.shape?.length>2&&!/ground|habitat|shadow/.test(m.role??'')).flatMap(m=>m.shape);if(!pts.length)return 0;const b=bounds(pts);return b.w*b.h;});
    let main=0;for(let i=1;i<count;i++)if(area[i]>area[main])main=i;
    const salt=caNoise(11,hashSeed(`figures:${seed}`)),rest=Array.from({length:count},(_,i)=>i).filter(i=>i!==main).sort((a,b)=>frac(sample(a,71)+salt)-frac(sample(b,71)+salt));
    memo[key]=[main,...rest.slice(0,Math.max(0,n-1))].sort((a,b)=>a-b);figureOwnerMemo.set(plan,memo);
  }
  return memo[key][index]??index%count;
}
// Cap shade within each species' real colour range (refs-lib MEASUREMENTS
// colour tables): trait 22 runs from the first listed form to the second.
const SHADE_PALETTES=Object.freeze({
  'amanita-1':[{alizarin:.44,hansa:.3,sienna:.26},{alizarin:.68,sienna:.2,umber:.12}],
  'amanita-3':[{sapgreen:.28,hansa:.24,ochre:.48},{umber:.38,ochre:.34,paynes:.28}],
  'bolete-1':[{ochre:.46,sienna:.34,umber:.2},{umber:.62,sienna:.2,paynes:.18}],
  'chanterelle-1':[{hansa:.5,ochre:.44,sienna:.06},{ochre:.48,sienna:.34,hansa:.18}],
  'morel-1':[{ochre:.62,umber:.26,sienna:.12},{umber:.5,paynes:.34,ochre:.16}],
  'parasol-1':[{ochre:.46,umber:.26,paynes:.28},{ochre:.5,sienna:.24,umber:.26}],
  'inkcap-1':[{ochre:.3,umber:.2,paynes:.5},{ochre:.5,umber:.34,sienna:.16}],
  'agaric-1':[{ochre:.3,umber:.12,paynes:.18},{ochre:.46,umber:.32,sienna:.08,paynes:.14}],
  'agaric-4':[{ochre:.52,hansa:.3,sienna:.18},{umber:.42,sienna:.36,ochre:.22}],
  'waxcap-1':[{hansa:.6,ochre:.24,sienna:.16},{alizarin:.5,sienna:.32,hansa:.18}],
  'milkcap-1':[{rose:.42,ochre:.4,sienna:.18},{sienna:.42,ochre:.32,umber:.26}],
  'hedgehog-1':[{ochre:.66,hansa:.14,sienna:.2},{sienna:.4,umber:.38,ochre:.22}],
  'oyster-1':[{umber:.3,paynes:.48,ultramarine:.22},{ochre:.5,umber:.34,sienna:.16}],
  'bracket-6':[{hansa:.72,ochre:.2,sienna:.08},{sienna:.4,hansa:.42,alizarin:.18}],
  'tooth-1':[{ochre:.34,umber:.18,paynes:.48},{ochre:.52,sienna:.2,umber:.28}],
  'puffball-1':[{ochre:.3,umber:.2,paynes:.5},{ochre:.44,umber:.4,paynes:.16}],
  'earthstar-1':[{ochre:.5,umber:.34,paynes:.16},{umber:.46,sienna:.36,ochre:.18}],
  'stinkhorn-1':[{sapgreen:.4,umber:.34,paynes:.26},{ochre:.4,umber:.42,sapgreen:.18}],
  'coral-1':[{hansa:.5,ochre:.38,sienna:.12},{ochre:.5,sienna:.3,rose:.2}],
});
const mixPalette=(a,b,t)=>Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(k=>[k,mix(a[k]??0,b[k]??0,t)]));
const FADED_PALETTE=Object.freeze({ochre:.46,umber:.32,paynes:.22});
export function seedShadePalette(typeId,palette,values,maturity=.6){
  const alt=SHADE_PALETTES[typeId];if(!alt||!palette)return palette;
  const t=(values[22]-.5)*2,shaded=mixPalette(palette,alt[t<0?0:1],.8*Math.abs(t)**.8);
  // Old caps fade and brown as they dry.
  return maturity>.72?mixPalette(shaded,FADED_PALETTE,Math.min(.38,(maturity-.72)*1.7)):shaded;
}
export const seedShadeLoad=maturity=>maturity>.72?1-Math.min(.3,(maturity-.72)*1.3):maturity<.34?1.08:1;
// Occasional damage: a slug bite or a broken edge out of one cap margin.
// Trait 34 sets how much was eaten, so a bite grows from nothing in a morph.
const DAMAGE_GRAMMARS=new Set(['amanita','agaric','bonnet','waxcap','milkcap','hedgehog','bolete','parasol']);
const DAMAGE_CONTOURS=new Set(['cap-contour','stem-contour','cap-flesh','ring']);
export function specimenBites(plan,genome){
  const p=genome?.phenotype;if(!p||genome.donorId||!DAMAGE_GRAMMARS.has(p.grammar))return [];
  const v=genome.values,count=Math.max(1,plan.specimenCount||plan.individuals?.length||1),bites=[];
  for(let i=0;i<count;i++){
    const d=clamp((v[34]+.12*(sample(i,977)-.5)-.87)/.1);if(d<=0||bites.length)continue;
    const caps=(plan.washes??[]).filter(m=>m.individual===i&&m.role==='cap'&&m.shape?.length>8);if(!caps.length)continue;
    const shape=caps[0].shape,b=bounds(shape),side=sample(i,978)<.5?-1:1;
    const target=[b.x+b.w*(.5+side*(.3+.16*v[33])),b.y+b.h*(.08+.22*v[30])];
    let P=shape[0],best=Infinity;for(const q of shape){const dd=(q[0]-target[0])**2+(q[1]-target[1])**2;if(dd<best){best=dd;P=q;}}
    const c=[b.x+b.w/2,b.y+b.h*.62],nx=P[0]-c[0],ny=P[1]-c[1],nl=Math.hypot(nx,ny)||1,r=b.w*(.05+.07*d);
    bites.push({individual:i,center:[P[0]+nx/nl*r*.28,P[1]+ny/nl*r*.28],r,phase:v[35]*TAU+i,broken:sample(i,979)<.35});
  }
  return bites;
}
const biteRadius=(bite,a)=>bite.r*(1+.12*Math.sin(3*a+bite.phase)+.07*Math.sin(7*a-bite.phase)+(bite.broken?.22*Math.abs(Math.sin(2.5*a+bite.phase))-.11:0));
const biteInside=(bite,[x,y])=>{const dx=x-bite.center[0],dy=y-bite.center[1];return Math.hypot(dx,dy)<biteRadius(bite,Math.atan2(dy,dx));};
const biteProject=(bite,pt)=>{const dx=pt[0]-bite.center[0],dy=pt[1]-bite.center[1],a=Math.atan2(dy,dx),R=biteRadius(bite,a);return Math.hypot(dx,dy)<R?[bite.center[0]+Math.cos(a)*R,bite.center[1]+Math.sin(a)*R]:pt;};
function biteDensify(bite,points,closed){
  const out=[],n=points.length,near=q=>Math.hypot(q[0]-bite.center[0],q[1]-bite.center[1])<bite.r*1.7;
  for(let i=0;i<n;i++){
    const a=points[i];out.push(a);if(!closed&&i===n-1)break;
    const b=points[(i+1)%n];if(!near(a)&&!near(b))continue;
    const steps=Math.min(24,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.5));
    for(let k=1;k<steps;k++)out.push([mix(a[0],b[0],k/steps),mix(a[1],b[1],k/steps)]);
  }
  return out;
}
const biteTouches=(bite,points)=>points.some(q=>Math.hypot(q[0]-bite.center[0],q[1]-bite.center[1])<bite.r*1.4);
// The bitten member's own shapes lose the bite region (one replacement per
// shared array, so clips, reserves and exclusions keep pointing at the same
// outline); contours follow the new edge, interior marks stop at it.
export function applySpecimenDamage(plan,genome){
  // One find has at most one bite: an extra member's own study never adds one.
  if(Number.isInteger(genome?.individualIndex))return plan;
  const bites=specimenBites(plan,genome);if(!bites.length)return plan;
  for(const bite of bites){
    const own=new Set(),memo=new Map();
    for(const m of plan.washes)if(m.individual===bite.individual){if(m.shape)own.add(m.shape);for(const s of m.islands??[])own.add(s);}
    const swap=s=>{if(!s||!own.has(s))return s;if(!memo.has(s))memo.set(s,biteTouches(bite,s)?biteDensify(bite,s,true).map(q=>biteProject(bite,q)):s);return memo.get(s);};
    for(const m of plan.washes){if(m.shape)m.shape=swap(m.shape);if(m.islands)m.islands=m.islands.map(swap);if(m.reserves)m.reserves=m.reserves.map(swap);}
    const ink=[];
    for(const m of plan.ink){
      const mark={...m,...(m.clip?{clip:swap(m.clip)}:{}),...(m.exclude?{exclude:m.exclude.map(swap)}:{})};
      if(m.individual!==bite.individual||!m.points?.length||!biteTouches(bite,m.points)){ink.push(mark);continue;}
      if(DAMAGE_CONTOURS.has(m.role)){ink.push({...mark,points:biteDensify(bite,m.points,false).map(q=>biteProject(bite,q))});continue;}
      let run=[];for(const q of m.points){if(biteInside(bite,q)){if(run.length>1)ink.push({...mark,points:run});run=[];}else run.push(q);}
      if(run.length>1)ink.push({...mark,points:run});
    }
    plan.ink=ink;
  }
  plan.damage=bites.map(({individual,r,broken})=>({individual,r,kind:broken?'broken edge':'slug bite'}));
  return plan;
}

// Orthographic botanical camera. The cap is a surface of revolution with
// constrained growth asymmetry; rim, gills, horizon, marks and light all project
// through this same camera. World x/y span the cap; z is height above its rim.
export function capSurface3D(genome,{w,h,cx=0,cy=0,tilt=0,rimDepth,young=false}){
  const v=genome.values,profile=genome.phenotype,phase=v[35]*TAU;
  const elevation=-Math.asin(clamp(rimDepth/w,.045,.48)),ce=Math.cos(elevation),se=Math.sin(elevation);
  const depth=w*(.91+v[3]*.16),flesh=3.5+w*.028;
  // Sample strain once per organ, rather than re-evaluating fractal noise in
  // every camera/normal query. Bilinear sampling keeps the surface continuous.
  const strain=Array.from({length:9},(_,y)=>Array.from({length:9},(_,x)=>growthField(genome,x/4-1,y/4-1,21)));
  const strainAt=(x,y)=>{
    const sx=clamp((x+1)*4,0,8),sy=clamp((y+1)*4,0,8),ix=Math.min(7,Math.floor(sx)),iy=Math.min(7,Math.floor(sy));
    return mix(mix(strain[iy][ix],strain[iy][ix+1],sx-ix),mix(strain[iy+1][ix],strain[iy+1][ix+1],sx-ix),sy-iy);
  };
  const height=(x,y)=>{
    const xx=x/w,yy=y/depth,r=clamp(Math.hypot(xx,yy)),a=Math.atan2(yy,xx),q=Math.max(0,1-r*r);
    let body=Math.pow(q,.48+v[2]*.3);
    // Mature Amanita crowns spread unequally rather than retaining a single
    // hemispherical apex. Warp the interior radial growth only: the shared
    // living lip stays fixed, and projection, normals and pigment rails all
    // follow the same broad crown. Young buttons keep their rounded habit.
    if(genome.family==='amanita'&&!young){
      const crownR=clamp(r+( .14*Math.cos(phase)+.10*xx)*xx*q
        +.09*Math.sin(phase)*yy*q);
      const spread=Math.pow(Math.max(0,1-crownR**(2.7+v[2]*.6)),.62+v[2]*.18);
      body=mix(body,spread,.58);
    }
    if(profile?.capShape==='conic')body=Math.pow(1-r,.85);
    if(profile?.grammar==='waxcap'&&profile.variant===0)body=Math.pow(Math.max(0,1-r**1.45),.85);
    // The death cap (amanita-3) is convex, not flat (refs-lib).
    if(profile?.capShape==='flat'&&!(profile.grammar==='amanita'&&profile.variant===2))body=.48*Math.pow(q,.32);
    if(profile?.capShape==='umbonate')body=.65*Math.pow(q,.56)+.33*Math.exp(-r*r/.035)*q;
    // Hydnum repandum (hedgehog-1) has an irregular lobed cap (refs-lib).
    if(profile?.capShape==='lobed'||profile?.grammar==='hedgehog'&&profile.variant===0)body*=1+.14*Math.sin(a*4+phase)*r*r;
    if(genome.family==='parasol')body=(young?Math.pow(q,.45):body+.17*Math.exp(-r*r/.028)*q);
    if(genome.family==='inkcap')body=Math.pow(Math.max(0,1-r**3.5),.48);
    const growth=1+(v[5]-.5)*.28*xx+.075*Math.sin(a*3+phase)*r*r+.13*strainAt(xx,yy)*r*(1-r)
      +(genome.family==='amanita'?.045*Math.sin(a*2-phase*.7)*r*r+.025*Math.sin(a*5+phase*.6)*r**3:0);
    const margin=w*(.023+v[4]*.027)*(Math.sin(a*3+phase)*.6+Math.sin(a*5-phase)*.4)*yy*yy*r**3;
    // Broad unequal shoulders come from one growth field, shared by the
    // silhouette, surface lighting and wash coordinates. It vanishes at the
    // centre and lip rather than adding independent contour jitter.
    const shoulder=genome.family==='amanita'
      ? 1+(.22+.12*v[5])*Math.tanh(xx*3+yy*.9)*r*(1-r)
        -.22*Math.exp(-((xx-.30-v[5]*.22)**2/.14+(yy+.18)**2/.55))*r
      : 1;
    return h/ce*body*growth*shoulder+margin;
  };
  const project=([x,y,z])=>[cx+x,cy-y*se-z*ce+tilt*x/w];
  const point=(x,y)=>[x,y,height(x,y)];
  const rows=new Map();
  const row=u=>{
    if(rows.has(u))return rows.get(u);
    const x=clamp(u,-1,1)*w,span=depth*Math.sqrt(Math.max(0,1-u*u));
    let best=-span,bestY=Infinity;
    for(let i=0;i<=44;i++){const y=-span+i/44*span*2,py=project(point(x,y))[1];if(py<bestY){bestY=py;best=y;}}
    let lo=Math.max(-span,best-span/22),hi=Math.min(span,best+span/22);
    for(let j=0;j<12;j++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(project(point(x,a))[1]<project(point(x,b))[1])hi=b;else lo=a;}
    const horizon=(lo+hi)/2,result={x,frontY:-span,horizon,top:project(point(x,horizon)),front:project(point(x,-span))};rows.set(u,result);return result;
  };
  const sample=(u,q)=>{
    const r=row(u),target=mix(r.top[1],r.front[1],q);let lo=r.frontY,hi=r.horizon;
    for(let j=0;j<14;j++){const y=(lo+hi)/2;if(project(point(r.x,y))[1]>target)lo=y;else hi=y;}
    const y=(lo+hi)/2,x=r.x,e=.08,zx=(height(x+e,y)-height(x-e,y))/(2*e),zy=(height(x,y+e)-height(x,y-e))/(2*e),norm=Math.hypot(zx,zy,1),normal=[-zx/norm,-zy/norm,1/norm];
    return {world:point(x,y),point:project(point(x,y)),normal,zx,zy,light:clamp(normal[0]*-.43+normal[1]*-.48+normal[2]*.765),facing:clamp(-normal[1]*ce+normal[2]*se)};
  };
  const undersideHeight=(x,y)=>{
    const r=clamp(Math.hypot(x/w,y/depth));
    if(genome.family!=='amanita')return h*.36*Math.pow(1-r*r,.85)-flesh*Math.abs(y/depth)*r*r+height(x,y)*.035*r**3;
    // Carry the cap's actual growing margin into the lamellar attachment.
    // A separately perfect ellipse makes otherwise curved blades look ruled.
    const edge=r>1e-8?height(x/r,y/r):0;
    // The exposed cap context tapers at the living lip; a constant
    // full-depth wall made a pale manufactured band across the whole cap.
    // Keep the thicker context inward, and couple unequal lip thickness to
    // the same continuous growth phase used by its upper surface.
    const a=Math.atan2(y/depth,x/w),lip=1.4+1.1*(1+Math.sin(a*3+phase))+.5*(1+Math.sin(a*5-phase*.6));
    const context=mix(flesh,lip,r**5);
    return h*.30*Math.pow(1-r*r,.85)-context*Math.abs(y/depth)*r*r+edge*r**6;
  };
  const underside=(theta,r=1)=>{
    const x=Math.cos(theta)*w*r,y=Math.sin(theta)*depth*r,z=undersideHeight(x,y);
    return project([x,y,z]);
  };
  return {project,point,row,sample,underside,undersideHeight,elevation,depth,height};
}

/** Pure numerical geometry; points describe closed vector outlines in plate units. */
// Drawn proportions over the cap radius: cap rise, stipe length and mean
// stipe half-width, exported with each specimen's view.
// capSurface3D draws screen y = cy - y*sin(e) - z*cos(e) with -y nearest; the
// 3D chart draws -z*cos(p) + y*sin(p) with +y nearest. p = -e lands every point
// in the same place but shows the far side: the cap's top where the plate shows
// its gills. The same view, from the same side, is p = e.
const drawnPitch=g=>g.capSurface.elevation;
const drawnProportions=g=>({rise:g.h/g.w,stem:g.length/g.w,girth:[.15,.3,.45,.6,.75,.85].reduce((sum,t)=>sum+g.halfAt(t),0)/6/g.w});
export function buildGeometry(genome, young = false) {
  const v = genome.values, f = FAMILIES[genome.family], family = genome.family;
  const profile=genome.phenotype, grammar=profile?.grammar;
  // A. phalloides / rubescens (refs-lib): a convex cap 0.35-0.6 of its width
  // high, not a flat disc.
  // Hygrocybe (waxcap-1) is convex-conic (refs-lib).
  const silhouette=grammar==='amanita'&&profile?.variant===2?'dome':grammar==='hedgehog'&&profile?.variant===0?'lobed':grammar==='waxcap'&&profile?.variant===0?'convexconic':grammar==='chanterelle'&&profile?.variant===0?'lobed':profile?.capShape;
  // Morchella esculenta (refs-lib): head 1.07-1.09 cap widths tall on a stem
  // only 0.5-0.63 cap widths long.
  const dimensions=grammar==='morel'&&profile?.variant===0?[1,.83,.57,1]:grammar==='bonnet'?[.54,1.22,1.05,.4]:grammar==='waxcap'?[.69,1.1,.77,.61]:grammar==='agaric'?[.91,.83,.8,.78]:grammar==='milkcap'?[1.04,1.08,.74,1.28]:grammar==='hedgehog'?[1.03,.72,.79,.86]:[1,1,1,1];
  const w = dimensions[0]*range(f.width, v[0]) * (young ? (family === 'amanita' ? .56 : family === 'chanterelle' ? .68 : .82) : 1);
  const h = dimensions[1]*(family==='amanita'&&(!profile||grammar==='amanita')&&!young?1.24:1)*(young&&family==='amanita' ? w*(.76+.37*v[1]) : range(f.rise, v[1]) * (young ? (family === 'morel' ? .81 : 1.12) : 1));
  const length = dimensions[2]*range(f.length, v[7]) * (young ? (family === 'amanita' ? .53 : .84) : 1);
  const stemWidth = dimensions[3]*range(f.stem, v[8]);
  const bend = (v[10] - .5) * 48, lean = (v[11] - .5) * 38;
  const cx = bend * .55 + lean;
  const cy = -length;
  const tilt = (v[6] - .5) * 46;
  const phase = v[35] * TAU;
  const wave = u => ((valueNoise((u+1)*5.3+2,phase*.3+4)-.5)*1.5 + (valueNoise((u+1)*13.7+7,phase*.4+12)-.5)*.65) * (2+v[4]*5);
  const rimCenter=cy+(family==='amanita'&&young?10:0);
  const rimDepth=family==='amanita'?(young?9+v[17]*9:w*(grammar==='amanita'&&profile?.variant===2?.06+.05*v[17]:.115+.22*v[17])):family==='bolete'?w*(young?.13:.18+v[17]*.1):0;
  const capSurface=['amanita','bolete'].includes(family)?capSurface3D(genome,{w,h,cx,cy:rimCenter,tilt,rimDepth,young}):null;
  const projectUnderside=(theta,r=1)=>{
    if(capSurface)return capSurface.underside(theta,r);
    const swell=1+Math.sin(theta)**2*(.018*Math.sin(theta*3+phase)+.009*Math.sin(theta*7-phase))*r**3+(valueNoise(Math.cos(theta)*21+phase,Math.sin(theta)*17+11)-.5)*.014*r**5*Math.sin(theta)**2;
    const perspective=1+.09*Math.sin(theta)*r;
    const u=Math.cos(theta)*r*swell/perspective,s=Math.sin(theta)*r*swell/perspective;
    const recess=rimDepth*(.63*Math.pow(1-r,1.45)+.10*Math.sin(Math.PI*r));
    return[cx+w*Math.cos(theta)*r*(1-.085*(1-r)),rimCenter+tilt*u+rimDepth*s-recess-(2+v[16]*5)*Math.sin(Math.PI*r)+wave(u)*Math.abs(s)*(.45+v[3]*.3)+w*(.012+.015*v[4])*(Math.sin(theta*3+phase)*.6+Math.sin(theta*5-phase)*.4)*Math.sin(theta)**2*r**3];
  };
  const top = [], lower = [], underside = [], gillRim=[];
  const capPoint = u => {
    if(capSurface)return capSurface.row(u).top;
    const crownU=family==='amanita'?u+(v[5]-.5)*.46*(1-u*u):u;
    const arch = Math.pow(Math.max(0, 1 - crownU * crownU), .48 + v[2] * .3);
    let y = rimCenter - h * arch;
    if(silhouette==='conic')y=rimCenter-h*Math.pow(1-Math.abs(crownU),.85);
    if(silhouette==='convexconic')y=rimCenter-h*Math.pow(Math.max(0,1-Math.abs(crownU)**1.45),.85);
    if(silhouette==='flat')y=rimCenter-h*.48*Math.pow(Math.max(0,1-crownU*crownU),.32);
    if(silhouette==='umbonate')y=rimCenter-h*.65*arch-h*.33*Math.exp(-crownU*crownU/.035);
    if(silhouette==='lobed')y=rimCenter-h*arch*(1+.16*Math.sin(crownU*8+phase));
    if (family === 'chanterelle') y = cy - h * arch * (young ? .73 : .82) + wave(u)*arch*1.7 + Math.sin(u*8+phase)*h*.14*arch;
    if (family === 'morel') y = cy - h * arch;
    let py=y + u * tilt + wave(u) * arch * (family==='amanita'?1.05:.65) + (v[5] - .5) * 24 * u * arch;
    if(family==='amanita')py=Math.min(py,projectUnderside(-Math.acos(clamp(u,-1,1)))[1]-(12+v[2]*8)*arch);
    return [cx + u * w, py];
  };
  for (let i = 0; i <= 80; i++) top.push(capPoint(-1 + i / 40));
  // Morchella esculenta (Argon): the silhouette is crenulated, ridges standing
  // out and pits falling in, not a smooth ellipse.
  if(grammar==='morel'&&profile?.variant===0)for(let i=0;i<=80;i++){const u=-1+i/40,[x,y]=top[i],dx=x-cx,dy=y-(cy-h*.45),d=Math.hypot(dx,dy)||1,bump=(Math.abs(Math.sin(u*Math.PI*6.5+phase))**.6-.55)*w*.045;top[i]=[x+dx/d*bump,y+dy/d*bump];}
  for (let i = 80; i >= 0; i--) {
    const u = -1 + i / 40, arch = Math.sqrt(Math.max(0, 1 - u * u));
    let y = cy + arch * (6+v[3]*11) + wave(u) * arch * .4;
    if (family === 'chanterelle') y = cy + arch*h*(.4+v[3]*.2) + wave(u)*arch*1.6 + Math.sin(u*8+phase)*h*.1*arch;
    if (family === 'morel') y = cy + arch * 12;
    const edge=capSurface?projectUnderside(-Math.acos(u)):[cx+u*w,y+u*tilt];
    gillRim.push(edge);
    lower.push(capSurface?capSurface.row(u).front:[edge[0],edge[1]]);
    underside.push(capSurface?projectUnderside(Math.acos(u)):[cx + u * w, cy + u * tilt + arch * (young ? 9 + v[17] * 9 : 34 + v[17] * 17)]);
  }
  const centerAt = t => Math.sin(t * Math.PI * .5) * bend * .55 + lean * t;
  const halfAt = t => {
    let width = stemWidth * (1 - v[9] * .32 * t);
    const bulb = Math.exp(-(((t - .12) / .19) ** 2)) * v[12];
    if (family === 'amanita') width *= 1 + ((!profile||grammar==='amanita'&&profile.variant===0)?.12:(.75 + v[12] * .5)) * Math.exp(-(((t - .08) / .11) ** 2));
    if(family==='amanita')width*=1+.23*t**12;
    if (family === 'bolete') width *= 1 + .66 * Math.sin(t * Math.PI) + .25 * bulb;
    if (family === 'chanterelle') width *= .58 + .36 * t + 1.7 * t ** 8;
    if (family === 'morel') width *= 1 + .2 * bulb;
    // Clavate morel stipe: narrow under the cap, swelling 25-40% toward the base.
    if(grammar==='morel'&&profile?.variant===0)width*=.85+.4*(1-t)**1.6;
    if(profile){
      const form=profile.stemForm;
      if(form==='rooting')width*=.36+.64*Math.sin(Math.min(1,t*2)*Math.PI*.5);
      if(form==='equal')width=stemWidth*(1+.035*Math.sin(t*13+phase));
      if(form==='clavate')width*=1.35-.55*t;
      if(form==='slender')width*=.65;
      if(grammar!=='amanita'&&family==='amanita')width/=(1+(.75+v[12]*.5)*Math.exp(-(((t-.08)/.11)**2)));
    }
    // Broad growth changes the shaft, while the cap attachment radius stays
    // exact. All contours, fibres, veil roots and wash rails share this taper.
    if(family==='amanita')width*=1+(.30+.22*v[9])*Math.exp(-((((t-.27)/.25))**2))*(1-t)
      -(.16+.13*v[10])*Math.sin(Math.PI*t)**2*t;
    width *= 1 + .025 * Math.sin(t * 18 + phase) + .014 * Math.sin(t * 43 - phase);
    if(family==='amanita'||family==='bolete')width*=.65+.35*Math.sqrt(Math.min(1,t/.055));
    return width;
  };
  // A circular free margin in world space has unequal normalized radii on
  // the elliptical cap. Keep the actual stipe radius plus a tissue clearance,
  // rather than using one screen-space radial offset for every blade.
  const freeGillRoot=(theta,clearance)=> (halfAt(1)+clearance)/Math.hypot(w*Math.cos(theta),(capSurface?.depth??w)*Math.sin(theta));
  const stem = [];
  const collarRadius=halfAt(1)/w,collarCenter=capSurface?projectUnderside(0,collarRadius)[1]-(family==='amanita'?6:0):rimCenter;
  // Keep the growing shoulder inside the actual projected cap context.
  // The underside alone is below the front cuticle and cannot hide a cut top.
  const shoulderY=u=>{
    if(family!=='amanita'||!capSurface)return collarCenter;
    const x=u*halfAt(1),y=-halfAt(1)*Math.sqrt(Math.max(0,1-u*u));
    const projected=capSurface.project([x,y,capSurface.undersideHeight(x,y)+6])[1];
    const f=(x/w+1)*40,i=Math.min(79,Math.max(0,Math.floor(f))),q=f-i;
    const crown=mix(top[i][1],top[i+1][1],q),lip=mix(lower[80-i][1],lower[79-i][1],q);
    return clamp(projected,crown+4,lip-4);
  };
  const stemYAt=(t,u=0)=>-length*t+(capSurface?(collarCenter-cy)*t**8:0)
    +(family==='amanita'?(shoulderY(u)-collarCenter)*t**12:0)
    +.18*halfAt(t)*(1-Math.sqrt(Math.max(0,1-u*u)))*(family==='amanita'?1-t**12:1);
  const sideCount=family==='amanita'?46:50;
  for (const side of [-1, 1]) {
    for (let j = 0; j <= sideCount; j++) {
      const t = side < 0 ? j / sideCount : 1 - j / sideCount;
      stem.push([centerAt(t) + side * halfAt(t) + Math.sin(t * 31 + phase) * .7*(1-t),
        (family==='amanita'?stemYAt(t,side):-length*t+(capSurface?(collarCenter-cy)*t**8:0))+(1-t)**15*(3+3*side)]);
    }
    if(family==='amanita'&&side===-1)for(let j=1;j<=8;j++){
      const u=-1+j/9*2;stem.push([cx+u*halfAt(1),stemYAt(1,u)]);
    }
  }
  for (let i = 1; i <= 9; i++) {
    const angle = i / 9 * Math.PI;
    stem.push([Math.cos(angle) * halfAt(0), 6 * (1 - i / 9) + Math.sin(angle) * halfAt(0) * .2]);
  }
  const cap = family === 'morel' ? Array.from({ length: 162 }, (_, i) => {
    const angle = i / 161 * TAU;
    const profileWidth=!profile?1:profile.variant===1?.62+.38*(1-Math.cos(angle))/2:profile.variant===2?1.06:profile.variant===3?1+.12*Math.sin(angle*3+phase):.85+.15*Math.cos(angle);
    return [cx + Math.sin(angle) * w * profileWidth * (.86 - .12 * Math.cos(angle))*(1+.018*Math.sin(angle*7+phase)+.012*Math.sin(angle*13-phase)),
      cy - h * .48 - Math.cos(angle) * h * .52 + Math.sin(angle) * tilt * .3];
  }) : [...top, ...lower];
  let underShape=[...gillRim.slice().reverse(), ...underside];
  if(family==='chanterelle'){
    const right=lower[0],left=lower[80],t=.71,y=-length*t;
    underShape=[...lower.slice().reverse(),...curve(right,[right[0]-w*.12,right[1]+36],[centerAt(t)+halfAt(t)+4,y-28],[centerAt(t)+halfAt(t),y],30),...stem.slice(66),...stem.slice(0,36),...curve([centerAt(t)-halfAt(t),y],[centerAt(t)-halfAt(t)-4,y-28],[left[0]+w*.12,left[1]+36],left,30)];
  }
  return { family, w, h, length, stemWidth, cx, cy, tilt, phase,
    cap, underside: underShape,
    top, lower, gillRim, flesh:[...lower,...gillRim.slice().reverse()], stem, centerAt, halfAt, capPoint,projectUnderside,rimDepth,rimCenter,collarRadius,capSurface,stemYAt,freeGillRoot };
}

function polygon(points) {
  const path = new Path2D();
  points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y));
  path.closePath();
  return path;
}

function ellipse(x, y, rx, ry, angle = 0) {
  const p = new Path2D(); p.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), angle, 0, TAU); return p;
}

// A loop, not Math.min(...spread): a field plate with its habitat holds
// hundreds of thousands of points, which overflows a Worker's stack
// when spread as arguments (the plate=1 + background=1 hang).
function bounds(points) {
  let x=Infinity,y=Infinity,r=-Infinity,b=-Infinity;
  for(const p of points){if(p[0]<x)x=p[0];if(p[1]<y)y=p[1];if(p[0]>r)r=p[0];if(p[1]>b)b=p[1];}
  return points.length?{x,y,w:r-x,h:b-y}:{x:Infinity,y:Infinity,w:-Infinity,h:-Infinity};
}

function newCanvas(w, h) {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/** Actual Unpainting brush, water transport, granulation, and optical compositing.
 * Bake once, then map the painted material over the live vector surfaces.
 * A broad wash receives a wetter charge after settling. This is a transported
 * wet-wash snapshot, not a claim that the sheet has dried completely.
 */
export function paintMaterialData(size = 144) {
  const paper = makePaper(size, size, { seed: 42, fibres: .4, tooth: .7, mmPerCell: .4 });
  const pigment = BY_KEY.umber;
  const sheet = createSheet(paper, [pigment]);
  const brush = createBrush({ radius: size * .3, bristles: 80, capacity: 170,
    flat: false, wetness: .93, splay: .12, variety: 1, seed: 14, grainShift: 2 });
  // Cross broad wet round-brush passages, then connect their left-middle
  // gap with a shallow sweep. Two diverging strokes left a diagonal reserve
  // that repeated on every cap; the later wetter charge did not cause it.
  for (let j = 0; j < 3; j++) {
    dip(brush, { water: .8, conc: [.085 + .035 * Math.sin(j * 2.4)] });
    const angle=[.18,-.58,.05][j],dx=Math.cos(angle),dy=Math.sin(angle),offset=j===2?0:(j-1)*size*.17;
    stroke(brush, sheet, Array.from({length:9},(_,i)=>{const t=i/8,d=(t-.5)*size*1.8,bow=Math.sin(t*Math.PI)*(j===2?.02:j%2?.14:-.14)*size;return{x:size*.5+dx*d-dy*(offset+bow),y:size*.5+dy*d+dx*(offset+bow),p:.8+Math.sin(t*Math.PI)*.18};}), { spacing: 2 });
  }
  // A richer charge is touched into the still-shiny wash along one shoulder.
  // It diffuses into the first passage; this is native transported pigment.
  dip(brush,{water:.63,conc:[.31]});
  stroke(brush,sheet,[{x:size*.79,y:size*.03,p:.45},{x:size*.88,y:size*.24,p:.72},{x:size*.94,y:size*.55,p:.38}],{spacing:2});
  for (let i = 0; i < 24; i++) step(sheet, { dt: .6, gran: 2, evap:.002, edgeEvap:.009, flowIters: 1 });
  const wetter=createBrush({radius:size*.13,bristles:48,capacity:55,flat:false,wetness:.98,splay:.18,variety:1,seed:94});
  dip(wetter,{water:.95,conc:[.008]});
  stroke(wetter,sheet,[{x:size*.31,y:size*.47,p:.7},{x:size*.43,y:size*.4,p:.8},{x:size*.58,y:size*.5,p:.45}],{spacing:2});
  for (let i = 0; i < 32; i++) step(sheet, { dt:.7, gran:2.3, evap:.002, edgeEvap:.009, flowIters:1 });
  const layers = layersOf(sheet), white = new Uint8Array(size * size * 3).fill(255);
  const rgb = renderLayers(layers, [pigment], white, size * size, 1,
    null, { t: Float32Array.from(paper.height, h => 1 - 2 * h), amp: [.5] });
  return { rgb, size, layers, paper };
}

function createMaterials() {
  const data = paintMaterialData(), { size, layers, paper } = data;
  const materials = {};
  const density=new Float32Array(size*size);let sum=0;
  for(const layer of layers)for(let i=0;i<density.length;i++)density[i]+=layer[0][i];
  for(const n of density)sum+=n;
  const mean=sum/density.length||1;
  // Transport provides the broad pigment mass. Its native paper grain must
  // not be stretched into conspicuous horizontal flecks on a wide cap.
  const smoothDensity=new Float32Array(density.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let total=0,weight=0;
    for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){
      const w=(6-Math.abs(dx))*(6-Math.abs(dy));total+=density[clamp(y+dy,0,size-1)*size+clamp(x+dx,0,size-1)]*w;weight+=w;
    }
    smoothDensity[y*size+x]=total/weight/mean;
  }
  const blooms=Float32Array.from(smoothDensity,m=>clamp(m*.45));
  materials.field={size,density:smoothDensity,height:paper.height,blooms};
  const white = new Uint8Array(size * size * 3).fill(255);
  for (const key of ['umber', 'ochre', 'sienna', 'alizarin', 'hansa', 'sapgreen', 'walnut']) {
    const rgb = renderLayers(layers, [BY_KEY[key]], white, size * size, 1.8, null,
      { t: Float32Array.from(paper.height, h => 1 - 2 * h), amp: [BY_KEY[key].gamma * .65] });
    const c = newCanvas(size, size), ctx = c.getContext('2d'), pixels = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      pixels.data[i * 4] = rgb[i * 3]; pixels.data[i * 4 + 1] = rgb[i * 3 + 1];
      pixels.data[i * 4 + 2] = rgb[i * 3 + 2]; pixels.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0); materials[key] = c;
  }
  const grain = newCanvas(size, size), grainCtx = grain.getContext('2d'), grainPixels = grainCtx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // The simulated paper's high fibres leave broken, pale contact in a wash.
    grainPixels.data[i * 4] = 249; grainPixels.data[i * 4 + 1] = 246; grainPixels.data[i * 4 + 2] = 237;
    grainPixels.data[i * 4 + 3] = Math.round(clamp((paper.height[i] - .25) * 1.15 + sample(i, 17) * .07) * 255);
  }
  grainCtx.putImageData(grainPixels, 0, 0); materials.grain = grain;
  const granules=newCanvas(size,size),gc=granules.getContext('2d'),gp=gc.createImageData(size,size);
  for(let i=0;i<size*size;i++){
    gp.data[i*4]=gp.data[i*4+1]=gp.data[i*4+2]=255;
    gp.data[i*4+3]=Math.round(255*clamp((.58-paper.height[i])*1.5)*(sample(i,47)<.48?1:.15));
  }
  gc.putImageData(gp,0,0);materials.granules=granules;
  return materials;
}

// KM pigment mixing, rather than interpolating display RGB swatches.
function pigmentColor(weights, thickness, alpha = 1) {
  const entries = Object.entries(weights), sum = entries.reduce((s, [, w]) => s + w, 0);
  const rgb = [0, 1, 2].map(c => {
    let K = 0, S = 0;
    for (const [key, amount] of entries) { K += BY_KEY[key].K[c] * amount / sum; S += BY_KEY[key].S[c] * amount / sum; }
    const [r, t] = layerRT(K, S, thickness);
    return Math.round(255 * clamp(r + t * t / (1 - r)));
  });
  return `rgba(${rgb.join(',')},${alpha})`;
}

// A 240 × 200 mm sheet at every resolution. Appearance and native pigment
// transport share the cold-press field, physical scale, seed and material version.
export const COLD_PRESS_STYLE=Object.freeze({bumpMm:Object.freeze([.65,1.65]),cover:2.2,swell:.07,swellMm:Object.freeze([2.8,4.2]),pits:.30});
export function coldPressStyleField(width,height){return coldPressField(width,height,240/width,301,COLD_PRESS_STYLE);}
let paperAppearanceField=null;
// The appearance sheet samples the same physical cold-press field as the
// native paper (coldPressField places bumps in sheet-relative positions, so a
// finer grid is the same sheet), at output resolution: 0.2 mm a pixel.
export const PAPER_SIZE=Object.freeze({width:1200,height:1000});
export function paperAppearance(){return paperAppearanceField??=coldPressStyleField(PAPER_SIZE.width,PAPER_SIZE.height);}
export function inkToothContact(height){return .62+.38*smooth(clamp((height-.16)/.5));}
function makeInkContactTexture(){
  const {width,height}=PAPER_SIZE,c=newCanvas(width,height),ctx=c.getContext('2d'),img=ctx.createImageData(width,height),field=paperAppearance();
  for(let i=0;i<field.length;i++){img.data[i*4]=48;img.data[i*4+1]=37;img.data[i*4+2]=28;img.data[i*4+3]=Math.round(255*inkToothContact(field[i]));}
  ctx.putImageData(img,0,0);return c;
}

// Unbleached cold-press rag paper, sized by hand. The tooth is lit from the
// upper left like the specimens, so its domes and pits read at normal viewing
// size; sizing soaks in unevenly, so the sheet tone drifts over several
// centimetres (cloudy formation), and the deckle zone ages a little warmer.
export const PAPER_TONE=Object.freeze({base:Object.freeze([243,235,217]),cloud:4.6,formation:2.6,deckle:8,tooth:5,relief:6,fibre:2.6});
export function paperToneAt(x,y,width=600,height=500){
  const s=600/width,px=x*s,py=y*s;
  const cloud=valueNoise(px/150+3.1,py/150+7.7)*.62+valueNoise(px/62+11.3,py/62+2.9)*.38-.5;
  const formation=valueNoise(px/19+5.2,py/23+1.4)-.5;
  const edge=Math.min(px,600-px,(py*600/500),(500-py)*600/500)/600;
  const deckle=Math.exp(-edge/.045)*(.7+.3*valueNoise(px/40,py/40+9));
  return {cloud,formation,deckle};
}
// Raking-light relief of the tooth: slope toward the upper-left light.
export function paperRelief(field,x,y,width=PAPER_SIZE.width,height=PAPER_SIZE.height){
  const at=(xx,yy)=>field[clamp(yy,0,height-1)*width+clamp(xx,0,width-1)];
  return (at(x-1,y-1)+at(x-2,y-2)-at(x+1,y+1)-at(x+2,y+2))*.5;
}
// Sheets differ as period stock does: warm cream rag, bright white, toned
// buff with foxing, and a pale blue-grey sugar paper. One sheet per plate,
// chosen from its seed. Tooth, sizing clouds and deckle toning come from the
// one cold-press height field; only the stock colour, edge toning and foxing
// vary. Foxing is a few irregular rust spots, clustered, never a pattern.
export const PAPER_SHEETS=Object.freeze([
  Object.freeze({id:'cream',base:Object.freeze([243,235,217]),weight:.34,deckle:1,foxing:0,laid:true}),
  Object.freeze({id:'white',base:Object.freeze([248,246,238]),weight:.2,deckle:.7,foxing:0}),
  Object.freeze({id:'toned',base:Object.freeze([237,226,199]),weight:.3,deckle:1.7,foxing:14,laid:true}),
  Object.freeze({id:'blue-grey',base:Object.freeze([222,226,223]),weight:.16,deckle:.9,foxing:3}),
]);
// The plate's sheet follows its source specimen, so a morph keeps its paper.
export function plateSheetSeed(value){return value?.morph?.a?.seed??value?.genome?.seed??'';}
export function paperSheetFor(seed){
  // FNV alone barely moves the high bits for neighbouring seeds; finish it.
  let h=hashSeed(`sheet:${seed??''}`);h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);h^=h>>>16;
  let t=(h>>>0)/4294967296;
  for(const sheet of PAPER_SHEETS){if(t<sheet.weight)return sheet;t-=sheet.weight;}
  return PAPER_SHEETS[0];
}
let paperNeutral=null;
function paperNeutralField(){
  if(paperNeutral)return paperNeutral;
  const {width,height}=PAPER_SIZE,field=paperAppearance(),tooth=new Float32Array(field.length),tone=new Float32Array(field.length),deck=new Float32Array(field.length);
  for (let i = 0; i < field.length; i++) {
    const x=i%width,y=Math.floor(i/width),relief=paperRelief(field,x,y);
    // Pressing and sizing vary over the sheet, so the tooth reads strongly in
    // some patches and is half-flattened in others; never one even emboss.
    const {cloud,formation,deckle}=paperToneAt(x,y,width,height),press=.35+1.3*valueNoise(x/85+2.3,y/70+6.1)*valueNoise(x/31+8.8,y/37+.7)+.25*valueNoise(x/9+1.1,y/11+3.3);
    tooth[i]=((field[i]-.45)*PAPER_TONE.tooth+relief*PAPER_TONE.relief)*press;
    tone[i]=cloud*PAPER_TONE.cloud*2+formation*PAPER_TONE.formation;deck[i]=deckle*PAPER_TONE.deckle;
  }
  // Felted fibre: many short strands, each a shade lighter or darker, lying
  // mostly along a slowly drifting direction with wide scatter. The grain
  // is elongated and oriented like formed pulp, not isotropic pixel noise.
  for(let k=0;k<26000;k++){
    let x=sample(k,503)*width,y=sample(k,509)*height;const dir=.6+1.4*valueNoise(x/320+4.2,y/320+1.7)+(sample(k,521)-.5)*1.6,len=3+sample(k,523)*9,dx=Math.cos(dir)*.7,dy=Math.sin(dir)*.7,tint=(sample(k,541)-.45)*2*PAPER_TONE.fibre;
    for(let t=0;t<len;t+=.7){x+=dx;y+=dy;const xi=Math.round(x),yi=Math.round(y);if(xi<0||yi<0||xi>=width||yi>=height)break;tooth[yi*width+xi]+=tint*Math.sin(Math.PI*t/len);}
  }
  // Loose rag fibres lie in the sheet: short curved strands, mostly a shade
  // lighter, some darker, unevenly spread; seen up close, not as a pattern.
  for(let k=0;k<2600;k++){
    let x=sample(k,401)*width,y=sample(k,409)*height,a=sample(k,419)*Math.PI;const len=5+sample(k,421)**2*22,bend=(sample(k,431)-.5)*.18,tint=(sample(k,433)<.72?1:-1)*(1.2+sample(k,439)*2.6)*(.4+1.2*valueNoise(x/140,y/140+3));
    for(let t=0;t<len;t+=.8){a+=bend;x+=Math.cos(a)*.8;y+=Math.sin(a)*.8;const xi=Math.round(x),yi=Math.round(y);if(xi<0||yi<0||xi>=width||yi>=height)break;tooth[yi*width+xi]+=tint*Math.sin(Math.PI*t/len);}
  }
  return paperNeutral={tooth,tone,deck};
}
function makePaperTexture(sheet=PAPER_SHEETS[0],seed='') {
  const {width,height}=PAPER_SIZE,c = newCanvas(width, height), ctx = c.getContext('2d'), img = ctx.createImageData(width, height);
  const {tooth,tone:cloudTone,deck}=paperNeutralField(),[r0,g0,b0]=sheet.base,fox=new Float32Array(sheet.foxing?width*height:0);
  if(sheet.foxing){
    const h=hashSeed(`fox:${seed}`),clusterX=sample(h%997,3)*width,clusterY=sample(h%991,5)*height;
    for(let k=0;k<sheet.foxing;k++){
      const near=sample(k+h%613,7)<.6,cx=near?clusterX+(sample(k,11)-.5)*260:sample(k+h%409,13)*width,cy=near?clusterY+(sample(k,17)-.5)*200:sample(k+h%401,19)*height;
      const r=1.5+sample(k,23)**2*5.5,strength=.35+.65*sample(k,29),x0=Math.max(0,Math.floor(cx-r*2)),x1=Math.min(width-1,Math.ceil(cx+r*2)),y0=Math.max(0,Math.floor(cy-r*2)),y1=Math.min(height-1,Math.ceil(cy+r*2));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=Math.hypot(x-cx,y-cy)/(r*(.75+.5*valueNoise(x/2.3+k,y/2.3)));if(d<1)fox[y*width+x]=Math.max(fox[y*width+x],strength*(1-d*d));}
    }
  }
  for (let i = 0; i < tooth.length; i++) {
    // Darker sizing and age toning are also warmer: blue drops faster than red.
    // Laid paper: the mould's fine wires leave close horizontal laid lines
    // and its chain wires faint vertical lines about 25 mm apart; both are
    // slightly irregular, as hand-made moulds are.
    let laid=0;if(sheet.laid){const x=i%width,y=Math.floor(i/width),chain=Math.abs(((x+3*Math.sin(y/90)+(sample(Math.floor(x/125),71)-.5)*14)%125+125)%125-62.5);laid=.9*Math.sin((y+1.5*Math.sin(x/70))*TAU/5.2)*(.6+.4*valueNoise(x/60,y/60))+(chain<2.2?-2.2*(1-chain/2.2):0);}
    const tone=cloudTone[i]-deck[i]*sheet.deckle+laid,f=fox.length?fox[i]:0;
    img.data[i * 4] = r0 + tooth[i] + tone*.8 - f*14; img.data[i * 4 + 1] = g0 + tooth[i] + tone - f*26;
    img.data[i * 4 + 2] = b0 + tooth[i]*1.05 + tone*1.35 - f*40; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}

const MORPHOLOGY = Object.freeze({
  amanita: { underside: 'free-gills', ring: true, capAttachment: 'central' },
  bolete: { underside: 'pores', ring: false, capAttachment: 'central' },
  chanterelle: { underside: 'decurrent-folds', ring: false, capAttachment: 'central' },
  morel: { underside: 'pits', ring: false, capAttachment: 'direct' },
});
const HABITATS = Object.freeze({
  amanita: { id: 'conifer-duff', substrate: 'soil', trees: ['pine', 'spruce'], groundCover: ['needles', 'moss'] },
  bolete: { id: 'mixed-woodland', substrate: 'soil', trees: ['oak', 'spruce'], groundCover: ['leaves', 'moss'] },
  chanterelle: { id: 'hardwood-floor', substrate: 'soil', trees: ['oak', 'beech'], groundCover: ['leaves', 'moss'] },
  morel: { id: 'spring-hardwoods', substrate: 'soil', trees: ['elm', 'ash'], groundCover: ['leaves', 'spring-grass'] },
});
const curve = (a,b,c,d,n=24) => Array.from({length:n+1},(_,i)=>{
  const t=i/n,u=1-t; return [0,1].map(k=>u*u*u*a[k]+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*d[k]);
});
const pathLength = points => points.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
function penGestures(ink,mark){
  if(!['cap-contour','stem-contour','branch','ring'].includes(mark.role)||mark.points.length<15){ink.push(mark);return;}
  // A contour takes several contacts of the nib. Each contact loads, flexes
  // and lifts separately; short overlaps replace one mechanically even sweep.
  let start=0,gesture=0;
  while(start<mark.points.length-1){
    const count=7+Math.floor(sample(gesture,207)*10),end=Math.min(mark.points.length-1,start+count);
    ink.push({...mark,points:mark.points.slice(start,end+1),width:mark.width,opacity:mark.opacity*(.88+sample(gesture,209)*.12),phase:mark.phase+gesture*1.73});
    start=end;gesture++;
  }
}

// A fixed Voronoi topology gives irregular connected pit walls while every seed
// can deform the entire network continuously. No cell pops during interpolation.
// Voronoi pits over the front of the head, cols across and rows down.
const moreCells=(cols,rows)=>{
  const sites=Array.from({length:cols*rows},(_,i)=>[(i%cols+.15+sample(i,95)*.7+(Math.floor(i/cols)%2)*.25)/cols*2-1,(Math.floor(i/cols)+.12+sample(i,96)*.76)/rows]);
  return sites.map((site,index)=>{
    let cell=[[-1,0],[1,0],[1,1],[-1,1]];
    for(let j=0;j<sites.length;j++)if(j!==index){
      const q=sites[j],nx=q[0]-site[0],ny=q[1]-site[1],d=(q[0]**2+q[1]**2-site[0]**2-site[1]**2)/2,next=[];
      for(let k=0;k<cell.length;k++){
        const a=cell[k],b=cell[(k+1)%cell.length],fa=a[0]*nx+a[1]*ny-d,fb=b[0]*nx+b[1]*ny-d;
        if(fa<=0)next.push(a);
        if((fa<=0)!==(fb<=0)){const t=fa/(fa-fb);next.push([mix(a[0],b[0],t),mix(a[1],b[1],t)]);}
      }cell=next;
    }return cell;
  });
};
const MOREL_CELLS=moreCells(6,8);
// Morchella esculenta (refs-lib): 9-12 pits across the head, 5-7 sided. The
// projection widens central cells, so the grid is denser than the target.
const MOREL_CELLS_FINE=moreCells(15,15);
const roundedLoop=points=>points.flatMap((p,i)=>{
  const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
  const rounding=.1+sample(i,201)*.12;
  const a=[mix(p[0],prev[0],rounding),mix(p[1],prev[1],rounding)],b=[mix(p[0],next[0],rounding),mix(p[1],next[1],rounding)];
  return Array.from({length:7},(_,j)=>{const t=j/6,u=1-t;return[u*u*a[0]+2*u*t*p[0]+t*t*b[0],u*u*a[1]+2*u*t*p[1]+t*t*b[1]];});
});

// Separate growth constructions: shelves share a woody attachment; puffballs
// are a single body; coral forks from a united trunk. These are numerical paths,
// not alternate colors applied to an agaric template.
const SKETCH_ROLES=new Set(['cap-contour','stem-contour','ring','veil','branch','folds','flutes','teeth','peridioles','pores','margin-split','root']);
function buildVarietyStudy(genome,sketch=false) {
  // views[i]: the camera each drawn specimen is seen with, in the 3D body's
  // convention (pitch above the rim plane, positive from above; roll: the
  // drawing's lean), so a turnable 3D body can start from its drawing's view.
  const family=genome.family,profile=genome.phenotype,ink=[],washes=[],individuals=[],views=[];
  let v=genome.values,phase=v[35]*TAU,individualIndex=0;
  const useIndividual=(index,count)=>{const local=individualGenome(genome,index,count);individuals[index]=local;individualIndex=index;v=local.values;phase=v[35]*TAU;return local;};
  const S=(i,salt=0)=>clamp(sample(i,salt+individualIndex*179)+(v[20]-.5)*.08*Math.sin(i+phase),.001,.999);
  const addInk=(points,role='fibres',width=.65,opacity=.55,clip=null,exclude=[])=>{
    if(sketch){if(SKETCH_ROLES.has(role))ink.push({points,role,width,opacity,clip,exclude,individual:individualIndex});return;}
    const shaped=points.map((p,i)=>{const q=points[Math.max(0,i-1)],r=points[Math.min(points.length-1,i+1)],dx=r[0]-q[0],dy=r[1]-q[1],d=Math.hypot(dx,dy)||1,t=i/(points.length-1),n=Math.sin(t*Math.PI)*(.12+.24*v[20])*Math.sin(t*12+phase+ink.length);return[p[0]-dy/d*n,p[1]+dx/d*n];});
    penGestures(ink,{points:shaped,role,width,opacity,phase:phase+ink.length*.71,clip,exclude,individual:individualIndex});
  };
  const addWash=(shape,palette,load,role='cap',reserves=[],islands=null)=>{
    if(sketch){const mark={shape,role,reserves,islands,individual:individualIndex};washes.push(mark);return mark;}
    const b=bounds(shape),points=curve([b.x-2,b.y+b.h*.65],[b.x+b.w*.3,b.y+b.h*.25],[b.x+b.w*.7,b.y+b.h*.65],[b.x+b.w+2,b.y+b.h*.35],18);
    const mark={shape,points,width:b.h*2.2+8,palette,load,role,reserves,phase,individual:individualIndex,granulation:v[25],wetness:v[26],pooling:v[27],softness:v[28],variation:v[29]};
    if(islands)mark.islands=islands;washes.push(mark);return mark;
  };
  const frame=(x,y,s=1,a=0)=>p=>[x+s*(p[0]*Math.cos(a)-p[1]*Math.sin(a)),y+s*(p[0]*Math.sin(a)+p[1]*Math.cos(a))];
  const oval=(x,y,rx,ry,n=64)=>Array.from({length:n},(_,i)=>[x+Math.cos(i/n*TAU)*rx,y+Math.sin(i/n*TAU)*ry]);
  const rectangle=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  const soil=(x,y,w=80)=>{
    const shape=Array.from({length:48},(_,i)=>{const a=i/48*TAU,r=.83+.1*Math.sin(a*7+phase)+.07*Math.cos(a*17);return[x+Math.cos(a)*w*r,y+Math.sin(a)*12*r];});
    addWash(shape,{umber:.6,ochre:.3,sapgreen:.1},.045,'ground');
    for(let i=0;i<110;i++){const xx=x+(S(i,30)-.5)*w*1.8,yy=y+(S(i,31)-.5)*15,span=1+S(i,32)*7;addInk(curve([xx,yy],[xx+span*.3,yy-2],[xx+span*.6,yy+1],[xx+span,yy-1],4),'habitat',.5+S(i,33),.25+S(i,34)*.45);}
  };
  let specimenCount=2,substrate='soil',morphology;
  if(family==='parasol'||family==='inkcap'){
    const count=profile?[2,3,1,4,2][profile.variant]:family==='inkcap'?3:2;specimenCount=count;
    const specimens=Array.from({length:count},(_,i)=>{
      const local=useIndividual(i,count),young=family==='parasol'&&seedVaried(genome)?growthYoung(count>1&&i===0,local.maturity):count>1&&i===0,g=buildGeometry(local,young);
      if(family==='inkcap'){
        g.w*=i===0?.63:i===2?.86:1.05;g.h*=i===0?1.02:i===2?.91:.86;
        g.top=Array.from({length:81},(_,j)=>{const u=j/40-1;return[g.cx+u*g.w,g.cy-g.h*Math.pow(Math.max(0,1-Math.abs(u)**3.5),.48)+u*g.tilt];});
        g.lower=Array.from({length:81},(_,j)=>{const u=1-j/40;return[g.cx+u*g.w,g.cy+Math.sqrt(Math.max(0,1-u*u))*(8+v[3]*9)+Math.sin(u*27+phase)*3+u*g.tilt];});
      }else{
        if(young){
          g.w*=.52;g.h*=2.1;
          g.top=Array.from({length:81},(_,j)=>{const u=j/40-1;return[g.cx+u*g.w,g.cy-g.h*Math.pow(Math.max(0,1-u*u),.45)+u*g.tilt];});
          g.lower=Array.from({length:81},(_,j)=>{const u=1-j/40;return[g.cx+u*g.w,g.cy+Math.sqrt(Math.max(0,1-u*u))*11+u*g.tilt];});
        }
        g.top=g.top.map(([x,y],j)=>[x,y-(young?5:17)*Math.exp(-((j/40-1)**2/.028))]);
      }
      g.capSurface=capSurface3D(local,{w:g.w,h:g.h,cx:g.cx,cy:g.cy,tilt:g.tilt,rimDepth:young?12:28,young});
      g.top=Array.from({length:81},(_,j)=>g.capSurface.row(j/40-1).top);
      g.lower=Array.from({length:81},(_,j)=>g.capSurface.row(1-j/40).front);
      g.cap=[...g.top,...g.lower];
      const scale=profile?(count===1?1.55:count===2?(young?1.05:1.4):count===3?[.82,1.12,.82][i]:[.72,1.05,.83,.65][i]):family==='inkcap'?[.94,1.34,.98][i]:young?1.1:1.35;
      const roll=young?-.16:(v[6]-.5)*.12+(i===2?.17:0);views[i]={pitch:drawnPitch(g),roll,...drawnProportions(g)};
      const tr=frame(profile?(count===1?610:count===2?[315,762][i]:count===3?[265,610,952][i]:[200,490,775,1010][i]):family==='inkcap'?[300,640,892][i]:young?315:762,790,scale,roll);
      return {g,tr,cap:g.cap.map(tr),stem:g.stem.map(tr),young};
    });
    for(let index=0;index<count;index++){
      useIndividual(index,count);
      const {g,tr,cap,stem,young}=specimens[index],later=specimens.slice(index+1).flatMap(s=>[s.cap,s.stem]);
      const unitInkStart=ink.length,unitWashStart=washes.length;
      const line=(pts,role='fibres',width=.55,opacity=.5,clip=stem,extra=[])=>addInk(pts.map(tr),role,width,opacity,clip,[...later,...extra]);
      if(sketch){
        addWash(stem,null,0,'stem',[...later,cap]);addWash(cap,null,0,'cap',later);
        line(g.stem.slice(0,50),'stem-contour',1,.7,null,[cap]);line(g.stem.slice(52),'stem-contour',1,.7,null,[cap]);
        line(g.top,'cap-contour',1,.7,null);line(g.lower,'cap-contour',1,.7,null);
        continue;
      }
      addWash(stem,{ochre:.2,umber:.3,walnut:.5},.045+v[23]*.04,'stem', [...later,cap]);
      line(g.stem.slice(0,50),'stem-contour',1.05,.7,null,[cap]);line(g.stem.slice(52),'stem-contour',1.35,.8,null,[cap]);
      for(let i=0;i<180;i++){
        const u=2*S(i+index*53,7)-1,t0=S(i,8)*.95,t1=Math.min(.99,t0+.06+S(i,9)*.23);
        const pts=Array.from({length:12},(_,j)=>{const t=mix(t0,t1,j/11);return[g.centerAt(t)+u*g.halfAt(t),-g.length*t];});
        line(pts,'fibres',.35+Math.abs(u)*.35,.2+Math.abs(u)*.28,stem,[cap]);
      }
      const under=Array.from({length:129},(_,i)=>g.capSurface.underside(i/128*TAU)).map(tr);
      addWash(under,{umber:.4,walnut:.4,ochre:.2},family==='inkcap'?.22:.04,'underside',[...later,stem,cap]);
      for(let i=0;i<105;i++){
        const a=(i+.1+S(i,11)*.7)/105*TAU,r=i%3===0?.13:i%3===1?.45:.7,bend=(S(i,10)-.5)*.12;
        line(Array.from({length:22},(_,j)=>{const radius=mix(r,1,j/21);return g.capSurface.underside(a+Math.sin(radius*Math.PI)*bend,radius);}), 'gills',family==='inkcap'?1.05:.58,family==='inkcap'?.78:.57,under,[stem,cap]);
      }
      line(g.top,'cap-contour',1.1,.7,null);line(g.lower,'cap-contour',1.3,.8,null);
      const capPalette=family==='inkcap'?{umber:.4,walnut:.35,ochre:.25}:{ochre:.55,umber:.3,sienna:.15};
      const capWash=addWash(cap,capPalette,family==='inkcap'?.075:.13,'cap',later);
      capWash.surface={kind:'cap',ring:null,rails:Array.from({length:41},(_,i)=>{const row=g.capSurface.row(i/20-1);return[row.top.map((x,k)=>x),row.front].map(tr);}),lighting:Array.from({length:21},(_,i)=>Array.from({length:17},(_,j)=>g.capSurface.sample(i/10-1,j/16).light))};
      const scales=[];
      // Coprinus comatus (refs-lib): 8-14 horizontal rows of recurved shingles.
      const shingles=family==='inkcap'&&profile?.grammar==='inkcap'&&profile.variant===0;
      // Macrolepiota procera (refs-lib): chocolate tiles (#5e4737) in concentric
      // rings, larger toward the margin, on a cream cap.
      const tiles=family==='parasol'&&profile?.grammar==='parasol'&&profile.variant===0,tileRows=7,tileRow=i=>{let r=0,k=i;while(r<tileRows-1&&k>=8+r*3){k-=8+r*3;r++;}return [r,k,8+r*3];};
      for(let i=0;i<(shingles?110:family==='inkcap'?95:tiles?140:150);i++){
        const [tr0,tk,tn]=tiles?tileRow(i):[0,0,1];if(tiles&&tk>=tn)continue;
        const row=Math.floor(i/10),u=tiles?clamp(((tk+.5+(tr0%2)*.5+(S(i,15)-.5)*.35)/tn*2-1)*.94,-.96,.96):shingles?clamp(((i%10+(row%2)*.5+(S(i,15)-.5)*.3)/10*2-1)*.92,-.96,.96):(S(i+index*23,15)*2-1)*.96,j=clamp((u+1)*40,0,79),yTop=mix(g.top[Math.floor(j)][1],g.top[Math.floor(j)+1][1],j%1),j2=(1-u)*40,yBottom=mix(g.lower[Math.min(79,Math.floor(j2))][1],g.lower[Math.min(80,Math.floor(j2)+1)][1],j2%1);
        const t=tiles?.12+tr0*.12+(S(i,16)-.5)*.03:shingles?.05+row*.083+(S(i,16)-.5)*.02:.035+S(i,16)*.91,x=g.cx+u*g.w,y=mix(yTop,yBottom,t),rw=tiles?(4+9*t)*(.85+.3*S(i,17)):(family==='inkcap'?3:1.4)+S(i,17)*(family==='inkcap'?7:4)*(family==='parasol'?.6+t:1),rh=tiles?rw*.55:family==='inkcap'?5+S(i,18)*11:1.5+S(i,18)*3;
        const angle=family==='inkcap'?-u*.22:Math.atan2(t*.6+.2,u)-Math.PI*.5,ca=Math.cos(angle),sa=Math.sin(angle);
        const shape=Array.from({length:17},(_,j)=>{
          const a=j/16*TAU,r=.65+.21*Math.sin(a*3+i*1.8)+.18*Math.sin(a*7+phase+i),xx=Math.cos(a)*rw*r,yy=Math.sin(a)*rh*r+(family==='inkcap'?Math.max(0,Math.sin(a))*rh*.5:0);
          return[x+xx*ca-yy*sa,y+xx*sa+yy*ca];
        });
        line(shape.slice(0,9),'scales',family==='inkcap'?.55:.4,.28+S(i,19)*.3,cap);
        if(family==='parasol')scales.push(shape.map(tr));
        else{
          // Lifted white scales have one dark, torn underside, not a V symbol.
          const shadow=[...shape.slice(1,8),...shape.slice(1,8).reverse().map(([xx,yy])=>[xx+.3,yy+1+S(i,22)*1.8])];
          scales.push(shadow.map(tr));
          // Coprinus scales are recurved: each lifted tip curls back outwards.
          if(family==='inkcap')line(curve([x-rw*.1,y+rh*.3],[x+rw*.15,y+rh*1.05],[x+rw*.6,y+rh*1.1],[x+rw*.62,y+rh*.55],7),'scales',.55,.4+S(i,23)*.25,cap);
          for(let k=0;k<3;k++)line(curve([x-rw*.5+k*rw*.5,y],[x-rw*.4+k*rw*.4,y+rh*.2],[x-rw*.35+k*rw*.35,y+rh*.4],[x-rw*.2+k*rw*.2,y+rh*.6],5),'scales',.3,.18,cap);
        }
      }
      if(family==='parasol')scales.push(oval(g.cx,g.cy-g.h-(tiles?6:8),g.w*(tiles?.11:.08),tiles?7:5,35).map(tr));
      // Shaggy inkcap shingles have tan tips (#816a5b).
      if(scales.length)addWash(cap,shingles?{umber:.5,ochre:.3,paynes:.2}:family==='inkcap'?{paynes:.6,umber:.4}:tiles?{umber:.6,walnut:.3,paynes:.1}:{umber:.55,walnut:.35,sienna:.1},family==='inkcap'?.19:tiles?.46:.28,'scales',later,scales);
      if(family==='inkcap'){
        // Coprinus comatus (refs-lib): the blackening margin melts upward in
        // uneven tongues and drips (#2b2a28), not a level dark band.
        const fringe=[...g.lower,...g.lower.slice().reverse().map(([x,y],i)=>[x,y-2-(.24+.46*Math.sin(i*.4+phase)**2+.3*Math.sin(i*1.3+2)**2+(shingles&&!young?.6*Math.max(0,Math.sin(i*.23+phase*2))**3:0))*(young?4:shingles?22:15)])].map(tr);
        if(shingles&&!young)for(let i=0;i<16;i++){const p=g.lower[Math.floor(4+i/15*72)],len=4+S(i,24)*10;line(curve([p[0],p[1]-1],[p[0]+.6,p[1]+len*.4],[p[0]-.4,p[1]+len*.8],[p[0]+.3,p[1]+len],6),'scales',1.3+S(i,25)*.8,.8,null);}
        addWash(fringe,{paynes:.72,walnut:.28},.85,'ink-margin',later);
        for(let i=0;i<65;i++){const p=g.lower[Math.floor(i/64*80)];line(curve([p[0],p[1]-7],[p[0]-1,p[1]-3],[p[0]+1,p[1]+2],[p[0]+S(i,20)*2,p[1]+(young?2:5)+S(i,21)*5],6),'scales',1.2,.85,null);}
      }else{
        const t=.66,c=g.centerAt(t),y=-g.length*t,w=g.halfAt(t);
        const ring=[...curve([c-w,y-4],[c-w*1.3,y+8],[c-w*1.5,y+9],[c-w*1.65,y+13],10),...curve([c-w*1.65,y+13],[c,y+21],[c+w*1.5,y+18],[c+w*1.7,y+8],16),...curve([c+w*1.7,y+8],[c+w,y+3],[c+w,y-3],[c-w,y-4],10)];
        const ringOnPaper=ring.map(tr);
        // A hybrid that inherited a ringless stipe carries no parasol ring.
        const hasRing=!profile||['ring','double-ring'].includes(profile.veil);
        if(hasRing){
        for(const mark of ink.slice(unitInkStart))if(mark.role==='fibres'||mark.role==='stem-contour')mark.exclude.push(ringOnPaper);
        for(const mark of washes.slice(unitWashStart))if(mark.role==='stem')mark.reserves.push(ringOnPaper);
        addWash(ringOnPaper,{paynes:.4,umber:.3,ochre:.3},.1,'veil-shadow',later);
        line(ring.slice(0,26),'ring',.8,.67,null);line(ring.slice(27),'ring',.45,.4,null);
        // Macrolepiota's ring is double: a thick collar with a second free edge below.
        line(ring.slice(0,26).map(([x,y],i)=>[x,y+3.2+Math.sin(i*.6+phase)*.8]),'ring',.6,.55,null);
        for(let i=0;i<11;i++){
          const u=-.95+i/10*1.9;line(curve([c+u*w,y-2],[c+u*w*1.1,y+3],[c+u*w*1.4,y+7],[c+u*w*1.6,y+12+Math.cos(u)*5],10),'ring',.35,.4,ringOnPaper);
        }
        }
        const stipeScales=[];
        for(let i=0;i<110;i++){
          const t=.02+S(i,70)*.61,u=Math.sin((S(i,71)*2-1)*1.45)*.96,x=g.centerAt(t)+u*g.halfAt(t),y=-g.length*t,r=(1.2+S(i,72)*3.6)*Math.sqrt(1-u*u);
          const scar=curve([x-r,y],[x-r*.3,y+1.2],[x+r*.6,y+2.5],[x+r,y+.7],6);
          line(scar,'reticulum',.55,.48,stem,hasRing?[cap,ringOnPaper]:[cap]);
          stipeScales.push([...scar,...scar.slice().reverse().map(([xx,yy])=>[xx,yy+1.5+S(i,73)*2])].map(tr));
        }
        addWash(stem,{umber:.7,walnut:.3},.18,'reticulum', [...later,cap,...(hasRing?[ringOnPaper]:[])],stipeScales);
      }
      const foot=tr([0,7]);soil(foot[0],foot[1],g.stemWidth*2.5);
    }
    morphology={underside:'free-gills',ring:family==='parasol',capAttachment:'central'};
  }else if(family==='oyster'||family==='bracket'){
    substrate='decaying hardwood';specimenCount=profile?[3,2,1,5,4][profile.variant]:5;
    const positions=[[690,440,.88,-.2],[615,548,1.12,-.12],[755,620,.95,.45],[561,696,1.09,-.36],[688,769,.7,.27]];
    const shelves=positions.slice(0,specimenCount).map(([x,y,s,a],index)=>{
      useIndividual(index,specimenCount);
      const w=(145+v[0]*48)*s*(profile?.variant===4?.68:1),h=(90+v[1]*35)*s*(profile?.variant===1?1.55:profile?.variant===4?1.45:1)*[.69,1.13,.62,1.19,.72][index],tr=frame(x+(v[10]-.5)*30,y,1,a+(v[6]-.5)*.17),origin=[(v[5]-.5)*35,h*.14];
      const rim=Array.from({length:100},(_,i)=>{const theta=-1.69+i/99*3.38,r=1+.05*Math.sin(theta*5+phase+index)+.025*Math.sin(theta*13-index);return[Math.sin(theta)*w*r,-Math.cos(theta)*h*r-h*.16];});
      const local=[...rim,...curve(rim.at(-1),[w*.55,h*.36],[origin[0]+18,origin[1]+12],origin,16),...curve(origin,[origin[0]-18,origin[1]+12],[-w*.6,h*.35],rim[0],16)];
      return {w,h,tr,origin,rim,local,shape:local.map(tr),index};
    });
    const woodAt=t=>[650+50*Math.sin(t*Math.PI)+(t-.5)*50+(v[10]-.5)*30,380+t*445];
    const woodWidth=t=>32+Math.sin(t*9+phase)*8+Math.sin(t*22)*3;
    const woodSide=side=>Array.from({length:81},(_,i)=>{const t=i/80,p=woodAt(t);return[p[0]+side*woodWidth(t)+Math.sin(t*82+side)*3,p[1]];});
    const leftWood=woodSide(-1),rightWood=woodSide(1),bottom=Array.from({length:13},(_,i)=>{const u=i/12,p=woodAt(1);return[mix(leftWood.at(-1)[0],rightWood.at(-1)[0],u),p[1]+Math.sin(u*35+phase)*7];});
    const wood=[...leftWood,...bottom,...rightWood.reverse()];
    const necks=family==='oyster'?shelves.map(s=>{
      const end=s.tr(s.origin),attach=woodAt(clamp((end[1]-380)/445)),dx=end[0]-attach[0],dy=end[1]-attach[1],len=Math.hypot(dx,dy)||1,n=[-dy/len,dx/len],a=[attach[0]+n[0]*13,attach[1]+n[1]*13],b=[end[0]+n[0]*10,end[1]+n[1]*10],c=[end[0]-n[0]*10,end[1]-n[1]*10],d=[attach[0]-n[0]*13,attach[1]-n[1]*13];
      return {shape:[...curve(a,[mix(a[0],b[0],.3),mix(a[1],b[1],.3)-6],[mix(a[0],b[0],.7),mix(a[1],b[1],.7)-4],b,12),...curve(c,[mix(c[0],d[0],.3),mix(c[1],d[1],.3)+3],[mix(c[0],d[0],.7),mix(c[1],d[1],.7)+2],d,12)],attach,end,index:s.index};
    }):[];
    const woodOcclusion=[...shelves.map(s=>s.shape),...necks.map(n=>n.shape)];
    if(sketch){
      addWash(wood,null,0,'wood',woodOcclusion);
      for(const neck of necks){useIndividual(neck.index,specimenCount);addWash(neck.shape,null,0,'stem',shelves.map(s=>s.shape));addInk(neck.shape,'stem-contour',1,.6,null,shelves.map(s=>s.shape));}
      for(const s of shelves){useIndividual(s.index,specimenCount);const later=shelves.slice(s.index+1).map(t=>t.shape);addWash(s.shape,null,0,'cap',later);addInk([...s.shape,s.shape[0]],'cap-contour',1,.7,null,later);}
      return {ink,washes,specimenCount,individuals,views,morphology:{underside:family==='oyster'?'decurrent-gills':'pores',ring:false,capAttachment:'lateral'},habitat:{substrate}};
    }
    addWash(wood,{umber:.55,walnut:.35,ochre:.1},.16,'wood',woodOcclusion);
    addInk(leftWood,'habitat',1.4,.65,null,woodOcclusion);addInk(rightWood,'habitat',1.8,.75,null,woodOcclusion);addInk(bottom,'habitat',1.5,.75,null,woodOcclusion);
    const fissures=[];
    for(let i=0;i<180;i++){
      const t0=S(i,40)*.97,t1=Math.min(1,t0+.03+S(i,41)*.22),lane=(S(i,42)*2-1)*.95;
      const line=Array.from({length:16},(_,j)=>{const t=mix(t0,t1,j/15),p=woodAt(t);return[p[0]+lane*woodWidth(t)+Math.sin(t*41+i)*2,p[1]];});
      addInk(line,'habitat',.6+S(i,43)*1.2,.3+S(i,44)*.45,wood,woodOcclusion);
      if(i<8)fissures.push([...line,...line.slice().reverse().map(([x,y])=>[x+2+S(i,45)*4,y])]);
    }
    addWash(wood,{umber:.4,walnut:.6},.36,'bark-fissures',woodOcclusion,fissures);
    for(const neck of necks){
      useIndividual(neck.index,specimenCount);
      const cover=shelves.map(s=>s.shape);addWash(neck.shape,{ochre:.3,umber:.3,paynes:.4},.1,'stem',cover);
      addInk(neck.shape,'stem-contour',.9,.55,null,cover);
      for(let i=0;i<9;i++){const d=i-4;addInk(curve([neck.attach[0],neck.attach[1]+d*2],[mix(neck.attach[0],neck.end[0],.3),neck.attach[1]+d*2-2],[mix(neck.attach[0],neck.end[0],.7),neck.end[1]+d*2-2],[neck.end[0],neck.end[1]+d*2],12),'fibres',.45,.4,neck.shape,cover);}
    }
    for(const s of shelves){
      useIndividual(s.index,specimenCount);
      const {w,h,tr,origin,rim,shape,index}=s,later=shelves.slice(index+1).map(t=>t.shape);
      addInk([...shape,shape[0]],'cap-contour',1.15,.7,null,later);
      const light=family==='oyster'&&index%2===1;
      addWash(shape,family==='oyster'?{umber:.5,walnut:.32,ochre:.18}:{umber:.5,ochre:.25,walnut:.25},light?.07:family==='bracket'?.065:.18+v[21]*.1,light?'underside':'cap',later);
      if(family==='oyster'){
        if(light){
          for(let i=0;i<130;i++){
            const pos=(i+.1+S(i+index*31,42)*.8)/131*99,k=Math.min(98,Math.floor(pos)),edge=[mix(rim[k][0],rim[k+1][0],pos-k),mix(rim[k][1],rim[k+1][1],pos-k)],r=i%4===0?.45+S(i,43)*.3:i%3===0?.22+S(i,49)*.2:.015+S(i,48)*.08;
            const bend=(S(i,41)-.5)*6;
            const p=curve([mix(origin[0],edge[0],r),mix(origin[1],edge[1],r)],[mix(origin[0],edge[0],.35)+bend,mix(origin[1],edge[1],.35)+9],[mix(origin[0],edge[0],.77)+bend,mix(origin[1],edge[1],.77)+6],edge,15).map(tr);
            addInk(p,'gills',.3+S(i,44)*.4,.27+S(i,45)*.3,shape,later);
          }
        }else for(let i=0;i<155;i++){
          const a=S(i,46)*99,k=Math.min(98,Math.floor(a)),p=rim[k],r=.72+S(i,47)*.26,q=[mix(origin[0],p[0],r),mix(origin[1],p[1],r)];
          addInk(curve(q,[q[0]+2,q[1]-2],[mix(q[0],p[0],.7),mix(q[1],p[1],.7)],p,7).map(tr),'fibres',.4,.25+S(i,48)*.28,shape,later);
        }
        const border=[...rim,...rim.slice().reverse().map(p=>[mix(p[0],origin[0],.012),mix(p[1],origin[1],.012)-.6])].map(tr);
        addWash(border,{umber:.35,paynes:.45,ochre:.2},light?.09:.1,'margin',later);
      }else{
        const palettes=[{paynes:.6,umber:.4},{sienna:.4,umber:.5,ochre:.1},{ochre:.6,umber:.4},{walnut:.48,paynes:.42,umber:.1},{umber:.5,sienna:.25,ochre:.25},{ochre:.4,paynes:.4,walnut:.2}],groups=Array.from({length:6},()=>[]);
        const edges=[.12,.21,.24,.32,.43,.45,.55,.61,.7,.79,.82,.92,.97];
        for(let band=0;band<12;band++){
          const lo=edges[band],hi=edges[band+1]-.002;
          const arc=r=>rim.map((p,i)=>{const rr=r+.015*Math.sin(i*.17+phase+band*.18)+.009*Math.sin(i*.59+band*.14+index);return[mix(origin[0],p[0],rr),mix(origin[1],p[1],rr)];});
          const bandShape=[...arc(lo),...arc(hi).reverse()].map(tr);
          groups[band%6].push(bandShape);
          addInk(arc(hi).slice(5+band,60+band*2).map(tr),'bands',.3,.19,shape,later);
        }
        groups.forEach((islands,i)=>addWash(shape,palettes[i],.08+S(i+index*17,51)*.3,'growth-band',later,islands));
        // The shelf has depth: a thick pale growing margin and, beneath its
        // lower edge, a band of pore surface with tube mouths.
        const lower=[...curve(rim.at(-1),[w*.55,h*.36],[origin[0]+18,origin[1]+12],origin,16),...curve(origin,[origin[0]-18,origin[1]+12],[-w*.6,h*.35],rim[0],16)],th=h*.14;
        const poreBand=[...lower,...lower.slice().reverse().map(([x,y],q)=>[x,y+th*Math.sin(Math.PI*(1-q/(lower.length-1)))**.4])].map(tr);
        addInk(lower.map(([x,y],q)=>[x,y+th*Math.sin(Math.PI*q/(lower.length-1))**.4]).map(tr),'cap-contour',.9,.6,null,later);
        for(let i=0;i<70;i++){const q=Math.floor(S(i+index*13,54)*(lower.length-1)),[x,y]=lower[q],d=th*Math.sin(Math.PI*q/(lower.length-1))**.4*S(i,55);addInk([[x,y+d],[x+.6,y+d+.5]].map(tr),'pores',.7,.5,poreBand,later);}
        addInk(rim.slice(4,96).map(([x,y])=>[x*.985,y*.985+1]).map(tr),'cap-flesh',.5,.35,shape,later);
        for(let i=0;i<180;i++){
          const p=rim[Math.min(99,Math.floor(S(i,52)*100))],r=.3+S(i,53)*.65,q=[mix(origin[0],p[0],r),mix(origin[1],p[1],r)],e=[mix(origin[0],p[0],r+.025),mix(origin[1],p[1],r+.025)];
          addInk([q,e].map(tr),'fibres',.45,.3,shape,later);
        }
      }
    }
    morphology={underside:family==='oyster'?'decurrent-gills':'pores',ring:false,capAttachment:'lateral'};
  }else if(family==='puffball'){
    specimenCount=profile?[2,3,1,4,2][profile.variant]:3;
    for(let specimen=0;specimen<specimenCount;specimen++){
      useIndividual(specimen,specimenCount);
      const ss=specimenCount===1?2.25:specimenCount===2?[1.05,2.0][specimen]:specimenCount===4?[.7,1.45,1.05,.7][specimen]:[.9,1.95,1.05][specimen],
        w=(78+v[0]*30)*ss*(profile?.variant===2?1.24:1),h=(150+v[1]*50)*ss*(profile?.variant===4?1.25:1),tr=frame(specimenCount===1?610:specimenCount===2?[330,780][specimen]:specimenCount===4?[205,490,790,1010][specimen]:[285,660,970][specimen],800,1,[-.15,.02,.17,.23][specimen]+(v[6]-.5)*.1);
      // Lycoperdon perlatum: a round head narrowing into a stalk-like sterile
      // base, broadest high up, like an inverted pear.
      const pear=profile?.variant===0;
      const local=pear?[...curve([0,0],[-w*.36,1],[-w*.28,-h*.2],[-w*.36,-h*.4],22),...curve([-w*.36,-h*.4],[-w*1.18,-h*.52],[-w*1.02,-h],[0,-h],28),...curve([0,-h],[w*1.0,-h],[w*1.2,-h*.52],[w*.38,-h*.4],28),...curve([w*.38,-h*.4],[w*.3,-h*.2],[w*.38,1],[0,0],22)]
        :[...curve([0,0],[-w*.5,2],[-w*.3,-h*.2],[-w*.64,-h*.35],22),...curve([-w*.64,-h*.35],[-w*1.35,-h*.61],[-w*.9,-h],[0,-h],28),...curve([0,-h],[w*.85,-h],[w*1.35,-h*.61],[w*.65,-h*.35],28),...curve([w*.65,-h*.35],[w*.25,-h*.15],[w*.45,0],[0,0],22)];
      const shape=local.map(([x,y],i)=>{const a=local[Math.max(0,i-1)],b=local[Math.min(local.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy)||1,jitter=(Math.sin(i*1.31+phase)+.42*Math.sin(i*2.7+specimen))*w*.006;return tr([x-dy/n*jitter,y+dx/n*jitter]);});
      if(sketch){addWash(shape,null,0,'puffball');addInk(shape,'cap-contour',1,.7);continue;}
      addWash(shape,{ochre:.4,umber:.35,paynes:.25},.17+v[23]*.06,'puffball');
      addInk(shape.slice(0,45),'cap-contour',1,.6);addInk(shape.slice(50),'cap-contour',1.2,.75);
      const spineShadows=[];
      for(let i=0;i<440;i++){
        const t=(pear?.45:.34)+S(i+specimen*21,57)*(pear?.53:.64),u=(S(i,58)*2-1)*.98,x=u*w*(pear?Math.min(1,.45+1.1*(t-.4)):1),y=-h*t,r=(.75+S(i,59)**2*2.1)*(specimen===1?1.3:1);
        if(i%4===0){
          const scar=oval(x,y,r*.65,r*.42,12);addInk(scar.slice(1,8).map(tr),'spines',.3,.19+Math.abs(u)*.3,shape);
        }else{
          // Project each conical wart along the body's surface normal. Central
          // warts are foreshortened; marginal ones lean out over the silhouette.
          const nx=u,ny=(.66-t)*3.2,len=r*(1.8+S(i,60)*1.1),tip=[x+nx*len,y+ny*len],base=[x+r,y+r*.3],foot=[x-r*.65,y+r*.55];
          const shadow=curve(tip,[mix(tip[0],base[0],.35)+r*.18,mix(tip[1],base[1],.35)],[base[0],base[1]-r*.2],base,7);
          addInk(curve(foot,[foot[0]-r*.1,foot[1]-r*.35],[tip[0]-r*.3,tip[1]+r*.1],tip,7).map(tr),'spines',.27,.13+Math.abs(u)*.12,shape);
          addInk(shadow.map(tr),'spines',.35+S(i,63)*.22,.27+Math.abs(u)*.24,shape);
          spineShadows.push([...shadow,...curve(base,[x+r*.8,y+r*.8],[x+r*.2,y+r*.9],foot,5)].map(tr));
        }
      }
      addWash(shape,{paynes:.35,umber:.4,ochre:.25},.14,'spine-shadows',[],spineShadows);
      for(let i=0;i<80;i++){
        const u=(S(i,61)*2-1)*(pear?.32:.8),t=S(i,62)*(pear?.42:.32);addInk(curve([u*w,-h*t],[u*w*.8,-h*t+6],[u*w*.7,-h*t+12],[u*w*.6,-h*t+18],8).map(tr),pear?'surface-relief':'fibres',pear?.4:.45,.3,shape);
      }
      if(specimen===1){
        const pore=Array.from({length:25},(_,i)=>{const a=i/24*TAU,r=1+.12*Math.sin(a*5+phase);return tr([Math.cos(a)*(5+v[19]*3)*r,-h+9+Math.sin(a)*3*r]);});
        addWash(oval(0,-h+12,17,9,32).map(tr),{umber:.65,ochre:.35},.06,'apical-tissue');addWash(pore,{walnut:.6,umber:.4},.7,'aperture');addInk(pore.slice(0,16),'pores',.8,.68);
      }
      const base=tr([0,5]);soil(base[0],base[1],w*.5);
    }
    morphology={underside:'internal-spores',ring:false,capAttachment:'continuous-body'};
  }else if(family==='coral'){
    specimenCount=profile?[2,3,1,3,2][profile.variant]:2;
    for(let specimen=0;specimen<specimenCount;specimen++){
      useIndividual(specimen,specimenCount);
      const coralScale=specimenCount===1?1.45:specimenCount===3?[.7,1.0,.67][specimen]:specimen?1.28:.82,coralX=specimenCount===1?600:specimenCount===3?[250,610,960][specimen]:specimen?757:306,tr=frame(coralX,795,coralScale,specimen?.04:-.15),segments=[];
      const branch=(start,angle,length,width,depth,id)=>{
        // Terminal twigs differ in length, lean and bend, like grown tips.
        if(!depth){length*=.62+S(id+specimen*199,61)*.66;angle+=(S(id+specimen*199,62)-.5)*.28;}
        const end=[start[0]+Math.sin(angle)*length,start[1]-Math.cos(angle)*length],middle=[mix(start[0],end[0],.5)+(Math.sin(id+phase)*.08+(S(id+specimen*199,63)-.5)*.14)*length,mix(start[1],end[1],.5)];
        const points=curve(start,[mix(start[0],middle[0],.6),mix(start[1],middle[1],.6)],middle,end,sketch?3:14),left=[],right=[];
        for(let j=0;j<points.length;j++){const p=points[j],a=points[Math.max(0,j-1)],b=points[Math.min(points.length-1,j+1)],dx=b[0]-a[0],dy=b[1]-a[1],norm=Math.hypot(dx,dy)||1,t=j/(points.length-1),r=width*(1-t*.4);left.push([p[0]-dy/norm*r,p[1]+dx/norm*r]);right.push([p[0]+dy/norm*r,p[1]-dx/norm*r]);}
        // Tip outline: blunt, pointed or lopsided per twig, never one stamp.
        const reach=depth?.65:.35+S(id+specimen*199,64)*.95,lean=depth?0:(S(id+specimen*199,65)-.5)*.6;
        const tip=curve(left.at(-1),[end[0]+Math.sin(angle)*width*reach-Math.cos(angle)*width*(.4+lean),end[1]-Math.cos(angle)*width*reach-Math.sin(angle)*width*(.4+lean)],[end[0]+Math.sin(angle)*width*reach+Math.cos(angle)*width*(.4-lean),end[1]-Math.cos(angle)*width*reach+Math.sin(angle)*width*(.4-lean)],right.at(-1),sketch?2:7);
        const shape=[...left,...tip,...right.reverse()].map(tr);
        if(sketch){
          // Terminal twigs are subpixel at preview scale. Keep every fork and
          // endpoint, but trace their centerline instead of two tiny contours.
          washes.push({shape,role:'coral',individual:individualIndex});
          if(depth<2&&width<24)addInk(points.map(tr),'branch',1,.65);
          else{addInk(left.map(tr),'branch',1,.65);addInk(right.map(tr),'branch',1,.65);if(!depth)addInk(tip.map(tr),'branch',1,.65);}
        }else segments.push({points:points.map(tr),left:left.map(tr),right:right.map(tr),tip:tip.map(tr),shape,width,depth,id,start:tr(start),end:tr(end)});
        if(depth>0){
          const spread=.13+S(id+specimen*199,66)*.23+v[5]*.12;
          branch(end,angle*.72-spread,length*(.59+S(id+specimen*199,67)*.19),width*.68,depth-1,id*2+1);
          branch(end,angle*.72+spread,length*(.56+S(id+specimen*199,68)*.23),width*.67,depth-1,id*2+2);
        }
      };
      branch([0,8],0,40,31,0,801);
      const roots=profile?[5,3,4,7,6][profile.variant]:5,levels=profile?[4,3,3,4,3][profile.variant]:4;
      for(let root=0;root<roots;root++)branch([(root-(roots-1)/2)*10,-20],(root-(roots-1)/2)*(.24+v[0]*.13),65+v[1]*22+S(root+specimen*199,69)*27,15+v[8]*5,levels,root*57+1);
      if(sketch)continue;
      const all=segments.flatMap(s=>s.shape),b=bounds(all),region=rectangle(b.x,b.y,b.w,b.h);
      const coralWash=addWash(region,seedShadePalette(genome.profileId,{hansa:.35,ochre:.5,sienna:.15},v,individuals[specimen]?.maturity),.18+v[21]*.1,'coral',[],segments.map(s=>s.shape));
      coralWash.volumes=segments.map(s=>({start:s.start,end:s.end,radius:s.width*coralScale}));
      for(let j=0;j<segments.length;j++){
        const s=segments[j],occlusion=segments.slice(j+1).map(t=>t.shape);
        addInk(s.left.slice(2),'branch',.7,.55,null,occlusion);addInk(s.right.slice(0,-2),'branch',.95,.7,null,occlusion);
        if(!s.depth)addInk(s.tip,'branch',.6,.5,null,occlusion);
        for(let k=0;k<4;k++){const offset=(k/3-.5)*s.width;addInk(s.points.map(([x,y],i)=>[x+offset*(1-i/s.points.length*.4),y]),'fibres',.4,.23,s.shape,occlusion);}
      }
      soil(coralX,802,70*coralScale);
    }
    morphology={underside:'external-hymenium',ring:false,capAttachment:'branching-body'};
  }
  return {ink,washes,morphology,specimenCount,individuals,views,habitat:{id:substrate==='soil'?'woodland-soil':'hardwood-attachment',substrate,trees:substrate==='soil'?['oak','beech']:['beech','poplar'],groundCover:substrate==='soil'?['leaves','humus']:['bark']}};
}

// Painting plan: 300 × 250 mm warm paper, four plate units/mm. Fixed dry ink
// precedes transparent connected washes. Cap lights and veil tissue are reserves;
// a narrow shadow glaze models the stipe. Checkpoints: ink .64, first wash .82,
// completed plate 1. Each path is frozen before playback; no per-frame randomness.
function buildLegacyStudy(genome,sketch=false) {
  if(!['amanita','bolete','chanterelle','morel'].includes(genome.family))return buildVarietyStudy(genome,sketch);
  const family=genome.family, profile=genome.phenotype, ink=[], washes=[],individuals=[],views=[];let v=genome.values,individualIndex=0;
  const habitat=structuredClone(HABITATS[family]);
  if(!habitat) throw new RangeError('Unknown mushroom family');
  let phase=v[35]*TAU;
  const hand=(points,role,width=1,opacity=.65,clip=null,exclude=[])=>{
    if(sketch){ink.push({points,role,width,opacity,clip,exclude,individual:individualIndex});return;}
    const total=pathLength(points); let at=0;
    const shaped=points.map((p,i)=>{
      if(i)at+=Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]);
      const t=total?at/total:0,b=points[Math.max(0,i-1)],a=points[Math.min(points.length-1,i+1)];
      const dx=a[0]-b[0],dy=a[1]-b[1],n=Math.hypot(dx,dy)||1;
      const drift=Math.sin(t*Math.PI)*((.14+.28*v[20])*Math.sin(t*TAU*1.7+phase+ink.length*.7)+(.14+.25*v[20])*(valueNoise(t*23+2,phase+ink.length*.13)-.5));
      return [p[0]-dy/n*drift,p[1]+dx/n*drift];
    });
    // Keep a loaded dark nib, but give structural edges the same fine scale
    // as the drawing within them. Pressure still distinguishes the shadow edge.
    const edgeScale=['cap-contour','stem-contour'].includes(role)?.72:role==='ring'?.80:1;
    penGestures(ink,{points:shaped,role,width:width*edgeScale,opacity,phase:phase+ink.length*.71,clip,exclude,individual:individualIndex});
  };
  const wash=(shape,points,width,palette,load,role,reserves=[])=>washes.push({shape,points,width,palette,load,role,reserves,phase,individual:individualIndex,granulation:v[25],wetness:v[26],pooling:v[27],softness:v[28],variation:v[29]});
  const detailSample=sample;
  const studyUnits=!profile?[[true,335-v[32]*28,.98+v[31]*.12],[false,752,1.65]]:profile.habit==='solitary'?[[false,610,1.65]]:profile.habit==='troop'?[[true,240,.85],[false,620,1.25],[true,980,.83]]:profile.habit==='cluster'?[[false,710,1.15],[false,530,1.45],[true,335,.83],[true,850,.78]]:[[true,335-v[32]*28,.98+v[31]*.12],[false,752,1.65]];
  for(const [unitIndex,[slotYoung,unitX,slotScale]] of studyUnits.entries()) {
    const local=individualGenome(genome,unitIndex,studyUnits.length);individuals.push(local);individualIndex=unitIndex;v=local.values;phase=v[35]*TAU;
    const young=seedVaried(genome)?growthYoung(slotYoung,local.maturity):slotYoung,unitScale=slotScale*growthSlotScale(slotYoung,young);
    const sample=(i,salt=0)=>detailSample(i,salt+unitIndex*179+(young?173:0));
    const g=buildGeometry(local,young),scale=unitScale;
    const rotation=young?-.19+v[33]*.12:.025+(v[6]-.5)*.19;
    views[unitIndex]={pitch:g.capSurface?drawnPitch(g):null,roll:rotation,...(g.capSurface?drawnProportions(g):{})};
    const ox=unitX,oy=profile?.habit==='cluster'?740+unitIndex*28:young?779:783;
    const transform=([x,y])=>[ox+scale*(x*Math.cos(rotation)-y*Math.sin(rotation)),oy+scale*(x*Math.sin(rotation)+y*Math.cos(rotation))];
    const transformed=new Map();
    const shapeOnPaper=shape=>{if(!transformed.has(shape))transformed.set(shape,shape.map(transform));return transformed.get(shape);};
    const outline=(points,role,width=1,opacity=.65,clip=null,exclude=[])=>hand(points.map(transform),role,width*scale,opacity,clip?shapeOnPaper(clip):null,exclude.map(shapeOnPaper));
    const surface=(shape,points,width,palette,load,role,reserves=[])=>wash(shapeOnPaper(shape),points.map(transform),width*scale,palette,load,role,reserves.map(shapeOnPaper));
    const capPalette=profile?{...TYPE_PALETTES[profile.palette]}:family==='amanita'?{sienna:.28,alizarin:.56,hansa:.16}:family==='bolete'?{sienna:.28,umber:.57,ochre:.15}:family==='chanterelle'?{ochre:.52,hansa:.38,sienna:.1}:{ochre:.51,umber:.45,sienna:.04};
    const stemPalette=family==='chanterelle'?{ochre:.6,hansa:.3,sienna:.1}:{ochre:.18,umber:.23,walnut:.59};
    if(capPalette.sienna)capPalette.sienna*=.6+v[22]*.8;
    const ringT=young&&family==='amanita'?.96:.72+v[13]*.07,rx=g.centerAt(ringT),ry=g.stemYAt(ringT),rw=g.halfAt(ringT),drop=young?5+v[14]*6:19+v[14]*20;
    const ringHem=u=>{
      const fold=Math.exp(-((((u+.40+.12*Math.sin(phase))/.32))**2)),turn=Math.exp(-((((u-.55)/.22))**2));
      return[rx+u*rw*(1.38+.30*Math.sin(u*2.4+phase))+(1-u*u)*rw*.16*Math.sin(phase),
        ry+drop*(.43+.38*fold+.22*turn+.26*Math.abs(u)) +Math.cos(u*1.55)*3+u*(v[14]-.3)*17];
    };
    // One hanging sheet defines side walls, hem and crease trajectories. Its
    // outward flare grows continuously from the neck; independent Bezier side
    // controls formerly overshot the hem and made a small reversed hook.
    const ringSurface=(u,t)=>{
      const hem=ringHem(u),root=[rx+u*rw*.83,ry-drop*(1.1-(1-u*u)*.12)+u*drop*.05];
      const flare=t*t*(3-2*t);
      return[mix(root[0],hem[0],flare),mix(root[1],hem[1],t)
        +Math.sin(Math.PI*t)*drop*.10*Math.sin(u*3+phase)];
    };
    const skirt=(family==='amanita'&&!profile||profile&&['ring','double-ring'].includes(profile.veil))?[
      ...Array.from({length:18},(_,i)=>ringSurface(-1,i/17)),
      ...Array.from({length:29},(_,i)=>ringSurface(-1+i/14,1)),
      ...Array.from({length:18},(_,i)=>ringSurface(1,1-i/17)),
      // The upper edge recedes down the front of the stipe: its original
      // fibres and pale wash continue into the veil instead of ending at a seam.
      ...Array.from({length:25},(_,i)=>{const u=1-i/12;return[rx+u*rw*.83,ry-drop*(1.1-(1-u*u)*.12)+u*drop*.05];})]:null;
    // A torn volva encloses the swollen base with its own curved walls. It is
    // not the stem's bulb outline duplicated, which made an onion-shaped stack.
    const basalT=young?.27:.30,basalX=g.centerAt(basalT),basalY=g.stemYAt(basalT),basalW=g.halfAt(basalT)*(1.18+v[12]*.15);
    const cupHeight=-basalY+7,cupCenter=q=>mix(basalX,0,q)+Math.sin(q*Math.PI)*(3+v[10]*5);
    const cupWidth=q=>basalW*(1.02+.08*Math.sin(Math.PI*q)-.37*q**3)*(1+.025*Math.sin(q*12+phase));
    const cupY=(q,u=0)=>basalY+cupHeight*q+(Math.sqrt(Math.max(0,1-u*u))*17+u*(v[12]-.35)*13)*(1-q)**3;
    const cupOpening=(u,front)=>[basalX+u*cupWidth(0),basalY+u*(v[12]-.35)*13
      +(front?17:-12)*Math.sqrt(Math.max(0,1-u*u))
      -(front?6:3)*Math.exp(-(((u+.48+.10*Math.sin(phase))/.20)**2))
      -(front?3.5:5)*Math.exp(-(((u-.63)/.15)**2))];
    const basalCup=family==='amanita'&&(!profile||profile.grammar==='amanita'&&profile.variant===0)?[
      ...Array.from({length:41},(_,i)=>{const q=i/40;return[cupCenter(q)-cupWidth(q),cupY(q,-1)];}),
      ...curve([cupCenter(1)-cupWidth(1),cupY(1)],[cupCenter(1)-cupWidth(1)*.6,cupY(1)+10],[cupCenter(1)+cupWidth(1)*.6,cupY(1)+8],[cupCenter(1)+cupWidth(1),cupY(1)],10),
      ...Array.from({length:41},(_,i)=>{const q=1-i/40;return[cupCenter(q)+cupWidth(q),cupY(q,1)];}),
      ...Array.from({length:25},(_,i)=>{const u=1-i/12;return cupOpening(u,true);})]:null;
    // The pale front context lies in front of the neck. Reserve it before
    // applying transparent stipe pigment; a later flesh wash cannot cover ink.
    const occluders=[g.cap,...(family==='amanita'?[g.flesh]:[]),...(skirt?[skirt]:[]),...(basalCup?[basalCup]:[])];
    if(sketch){
      const body=(shape,role)=>washes.push({shape:shapeOnPaper(shape),role,individual:individualIndex});
      body(g.stem,'stem');body(g.underside,'underside');body(g.cap,'cap');
      outline(g.stem,'stem-contour',1,.6,null,occluders);
      outline(g.cap,'cap-contour',1,.7);outline(g.underside,'cap-contour',.8,.5,null,[g.stem,g.cap]);
      if(skirt){body(skirt,'veil');outline(skirt,'ring',.8,.6);}
      if(basalCup){body(basalCup,'puffball');outline(basalCup,'veil',.8,.6);}
      continue;
    }
    const topY=u=>{const f=(u+1)*40,i=Math.min(79,Math.floor(f));return mix(g.top[i][1],g.top[i+1][1],f-i);};
    const rimY=u=>{const f=(1-u)*40,i=Math.min(79,Math.floor(f));return mix(g.lower[i][1],g.lower[i+1][1],f-i);};
    const floorY=u=>family==='amanita'?g.projectUnderside(Math.acos(clamp(u,-1,1)))[1]:g.cy+u*g.tilt+Math.sqrt(Math.max(0,1-u*u))*(young?9+v[17]*9:33+v[17]*29);
    const capRails=Array.from({length:41},(_,i)=>{const u=i/20-1;return[transform([g.cx+u*g.w,topY(u)]),transform([g.cx+u*g.w,rimY(u)])];});
    const stemRails=Array.from({length:37},(_,i)=>{const t=1-i/36,y=g.stemYAt(t)-(family==='amanita'?(g.rimDepth*.85+8)*t**16:0);
      return[transform([g.centerAt(t)-g.halfAt(t),y]),transform([g.centerAt(t)+g.halfAt(t),y])];});
    const capLighting=g.capSurface?Array.from({length:21},(_,i)=>Array.from({length:17},(_,j)=>g.capSurface.sample(i/10-1,j/16).light)):null;
    // Follow actual world-space meridians so native grain compresses around
    // the crown instead of stretching linearly from silhouette to lip.
    // Both cap passages share this mesh; other surfaces retain their rails.
    const capMesh=g.capSurface?Array.from({length:41},(_,i)=>{
      const u=i/20-1,row=g.capSurface.row(u);
      return Array.from({length:13},(_,j)=>transform(g.capSurface.project(
        g.capSurface.point(row.x,mix(row.horizon,row.frontY,j/12)))));
    }):null;
    const attachSurface=(kind,rails)=>{washes.at(-1).surface={kind,rails,mesh:kind==='cap'?capMesh:null,ring:skirt?1-ringT:null,lighting:kind==='cap'?capLighting:null};};
    // Stems are not cylinders: broken longitudinal bundles curve over the swollen
    // base, with progressively denser cross hatching on the shaded right flank.
    outline(g.stem.slice(0,family==='chanterelle'?36:family==='amanita'?47:50),'stem-contour',1.15,.62,null,occluders);
    outline(g.stem.slice(family==='chanterelle'?66:family==='amanita'?55:52,111),'stem-contour',1.65,.85,null,occluders);
    // The nib travels along the flesh in loose bundles. Each bundle has its
    // own starting height and lift; only the turning flanks receive long lines.
    // This gives connected form hatching instead of evenly scattered scratches.
    for(let i=0;i<146;i++) {
      const side=i<53?-1:1,u=side*(.43+.55*sample(i,3)),t0=.004+sample(i,4)*.90;
      const reach=(.025+sample(i,5)*(.055+.12*v[30]))*(.6+.4*Math.abs(u));
      const t1=Math.min(family==='chanterelle'?.7:.997,t0+reach);
      const pts=Array.from({length:25},(_,j)=>{const t=mix(Math.min(t0,t1-.002),t1,j/24),lane=u+(1-Math.abs(u))*.1*Math.sin(t*11+i);return[g.centerAt(t)+g.halfAt(t)*lane+Math.sin(t*27+i)*.17,g.stemYAt(t,lane)];});
      outline(pts,'fibres',.28+sample(i,6)*.38,.28+Math.abs(u)*.27,g.stem,occluders);
    }
    if(family==='amanita')for(let i=0;i<38;i++){
      const u=-.93+i/37*1.86,t0=.82+sample(i,151)*.13,t1=.987+sample(i,152)*.012;
      const pts=Array.from({length:17},(_,j)=>{const t=mix(t0,t1,j/16),lane=u+Math.sin((t-.82)*7+i)*.018;return[g.centerAt(t)+g.halfAt(t)*lane,g.stemYAt(t,lane)];});
      outline(pts,'fibres',.24+sample(i,153)*.24,.19+.21*Math.abs(u),g.stem,occluders);
    }
    // Short, lighter grain breaks up the open flesh without covering its light.
    for(let i=0;i<140;i++){
      const t=.008+sample(i,108)*.97,u=(sample(i,109)*2-1)*.99,x=g.centerAt(t)+g.halfAt(t)*u,y=g.stemYAt(t,u);
      const shade=.10+.32*Math.abs(u)**3+.15*Math.max(0,u),r=.14+sample(i,110)*.45;
      outline(curve([x-r,y],[x-r*.3,y-.4],[x+r*.4,y+.3],[x+r,y+.5],3),'fibres',.3+sample(i,111)*.3,shade,g.stem,occluders);
    }
    for(let i=0;i<62;i++) {
      const t=.01+sample(i,9)*.23,u=(sample(i,10)*2-1)*.98,w=g.halfAt(t);
      const pts=Array.from({length:14},(_,j)=>{const tt=t+j/13*(.025+sample(i,112)*.07);return[g.centerAt(tt)+g.halfAt(tt)*u,g.stemYAt(tt,u)];});
      outline(pts,'fibres',.3+sample(i,113)*.38,.24+Math.abs(u)*.26,g.stem,occluders);
    }
    const stemAxis=Array.from({length:28},(_,i)=>{const t=i/27;return[g.centerAt(t)+g.halfAt(t)*.18,g.stemYAt(t,.18)];});
    const pigmentOccluders=occluders.filter(shape=>shape!==skirt);
    if(family!=='chanterelle'){surface(g.stem,stemAxis,g.stemWidth*3.5,stemPalette,.045+v[23]*.06,'stem',pigmentOccluders);attachSurface('stem',stemRails);}
    surface(g.stem,stemAxis,g.stemWidth*6,{paynes:.45,umber:.35,ochre:.2},.14+v[24]*.12,'stem-shadow',pigmentOccluders);attachSurface('stem',stemRails);
    // Separate contours at light and shadow sides; tiny incidents in the margin
    // belong to the same surface coordinates as all internal marks.
    // The stipe disappears into the recessed cap; no exposed elliptical cut end.
    if(family==='morel') {
      outline(g.cap.slice(2,74),'cap-contour',1,.65);
      outline(g.cap.slice(82,160),'cap-contour',1.65,.85);
    } else {
      outline(g.top.slice(1,32),'cap-contour',.95,.65);
      outline(g.top.slice(35,80),'cap-contour',1.35,.78);
      outline(g.lower.slice(0,81),'cap-contour',1.45,.86);
      if(family!=='chanterelle')outline(g.underside.slice(82),'cap-contour',.68,.45,null,[g.stem]);
      for(let i=0;i<65;i++) {
        const u=-.98+i/64*1.96,x=g.cx+u*g.w,y=rimY(u),len=3+sample(i,14)*7;
        outline(curve([x-u*len*.3,y-len],[x-u*2,y-len*.65],[x,y-2],[x,y+.4],7),'fibres',.43,.28,g.cap);
      }
    }
    if(basalCup){
      // The same elliptical mouth owns both contacts. The rear lip is hidden
      // by the stipe; the front wall reserves its ink and washes above.
      const rearRim=Array.from({length:49},(_,i)=>cupOpening(-1+i/24,false));
      const innerRim=[...rearRim,...Array.from({length:49},(_,i)=>cupOpening(1-i/24,true))];
      outline(rearRim,'veil',.58,.46,null,[g.stem]);
      surface(innerRim,rearRim,basalW*.55,{umber:.45,walnut:.35,paynes:.2},.13,'stem-shadow',[g.stem,basalCup]);
      // The lit left tissue loses contact partway down; the heavier right
      // wall turns into the base instead of enclosing a symmetric onion.
      outline(basalCup.slice(0,13),'veil',.58,.43);outline(basalCup.slice(28,43),'veil',.48,.34);
      outline(basalCup.slice(43,92),'veil',.91,.68);
      outline(basalCup.slice(92,99),'veil',.48,.36);outline(basalCup.slice(106,114),'veil',.55,.46);
      // Closely laid tapered strokes curve down the cup's turning wall; its
      // central lit flesh stays open, with a few interrupted tissue creases.
      for(let i=0;i<98;i++){
        const side=i<18?-1:1,u=side*(.68+.30*sample(i,211)),t=.08+sample(i,212)*.78,span=.04+sample(i,213)*.16;
        const pts=Array.from({length:17},(_,j)=>{const q=clamp(t+j/16*span),lane=u+(1-Math.abs(u))*.10*Math.sin(q*5+i);return[cupCenter(q)+lane*cupWidth(q),cupY(q,lane)];});
        outline(pts,'fibres',.24+sample(i,214)*.30,.18+Math.abs(u)*.26,basalCup);
      }
      for(let i=0;i<22;i++){
        const q=.12+sample(i,215)*.8,u=(sample(i,216)*2-1)*.8,p=[cupCenter(q)+u*cupWidth(q),cupY(q,u)];
        outline(curve(p,[p[0]+.2,p[1]+1],[p[0]-.2,p[1]+2.5],[p[0]+.4,p[1]+3.7],5),'fibres',.35,.19,basalCup);
      }
      const cupRails=Array.from({length:37},(_,i)=>{const q=i/36;return[transform([cupCenter(q)-cupWidth(q),cupY(q,-1)]),transform([cupCenter(q)+cupWidth(q),cupY(q,1)])];});
      surface(basalCup,curve([basalX,basalY],[basalX+3,basalY+cupHeight*.3],[-3,0],[0,8]),basalW*4,{ochre:.35,umber:.42,walnut:.23},.105,'stem');
      washes.at(-1).surface={kind:'stem',rails:cupRails,ring:null,openTop:true};
      surface(basalCup,curve([basalX,basalY],[basalX+3,basalY+cupHeight*.3],[-3,0],[0,8]),basalW*4,{ochre:.25,umber:.5,paynes:.25},.23,'stem-shadow');
      washes.at(-1).surface={kind:'stem',rails:cupRails,ring:null,openTop:true};
    }
    const reserves=[],pitShapes=[],pitCrescents=[],foldShadows=[],veilShadows=[],gillFaces=[];
    if(family==='amanita') {
      // Hanging partial veil: fluted edge, a folded lip and tapered pleats, with
      // stem detail and pigment reserved behind the tissue.
      if(skirt){
      outline(skirt.slice(7,26),'ring',.57,.48);outline(skirt.slice(29,35),'ring',.46,.38);
      outline(skirt.slice(38,46),'ring',.70,.58);outline(skirt.slice(49,59),'ring',.60,.50);
      for(let i=0;i<9;i++) {
        // Unequal broad folds converge into attached tissue; reserve the lit
        // centre rather than drawing a regular comb across the entire veil.
        const u=-.96+(i+(sample(i,84)-.5)*.62)/8*1.92,[ex,ey]=ringHem(u);
        const fold=Array.from({length:19},(_,j)=>ringSurface(u,j/18));
        const from=clamp(1-Math.abs(u))*(11+sample(i,89)*3),shortFold=Array.from({length:19},(_,j)=>{const at=from+(18-from)*j/18,k=Math.min(17,Math.floor(at));return fold[k].map((x,c)=>mix(x,fold[k+1][c],at-k));});
        outline(shortFold,'ring',.22+sample(i,17)*.36,(.12+sample(i,86)*.18)*(.28+.72*Math.abs(u)),skirt);
        if(i%3===0||u>.35){
          const shadow=fold.slice(9).map(([x,y],j)=>[x+(1-j/9)*(.7+sample(i,87)*1.2),y+.3]);
          outline(shadow,'ring',.24,.36,skirt);
        }
        for(let k=0;k<(Math.abs(u)>.55?2:0);k++){
          const dx=(k-.5)*1.1,reach=2.5+sample(i*3+k,88)*4;
          outline(curve([ex+dx,ey],[ex+dx-u*.3,ey-reach*.3],[ex+dx-u*.5,ey-reach*.7],[ex+dx-u*.8,ey-reach],7),'ring',.27,.46,skirt);
        }
      }
      surface(skirt,curve([rx-rw*1.4,ry+drop*.4],[rx-rw*.3,ry+drop*.7],[rx+rw*.8,ry+drop*.4],[rx+rw*1.6,ry+drop*.8]),drop*2,{paynes:.4,umber:.3,ochre:.3},.065,'veil-shadow');
      washes.at(-1).fadeTop=.48;
      // Pale front tissue turns into the darker hanging side folds. Attenuate
      // native pigment rather than covering the stipe light with white paint.
      washes.at(-1).veilTurn=.34+.12*v[13];
      }
      if(!basalCup&&(!profile||profile.grammar==='amanita'))for(let band=0;band<3;band++) {
        const t=.12+band*.045,c=g.centerAt(t),w=g.halfAt(t),y=-g.length*t;
        const pts=Array.from({length:35},(_,i)=>{const u=-.98+i/34*1.96;return[c+u*w,y+Math.sqrt(1-u*u)*6+Math.sin(u*8+phase+band)*1.4+Math.sin(u*17+band)*.6];});
        outline(pts.slice(2,12),'veil',1.1,.65,g.stem);outline(pts.slice(16,23),'veil',.8,.54,g.stem);outline(pts.slice(27,33),'veil',.7,.48,g.stem);
        for(let i=0;i<9;i++){const u=-.93+(i+sample(i+band*19,2)*.4)/8*1.86,x=c+u*w,r=1+sample(i+band*19,13)*2;outline(curve([x-r,y+2],[x-r*.4,y+3],[x+r*.6,y+3.5],[x+r,y+1],6),'veil',.48,.34,g.stem);}
      }
      if(!profile||profile.surface==='warts')for(let i=0;i<51;i++) {
        if(profile&&sample(i,83)>.4+.85*v[18])continue;
        // Broken veil is left in uneven patches as the cap expands. Project
        // irregular fragments onto the dome, rather than concentric spot rings.
        const [u,t]=growSurfacePoint(local,(sample(i,21)*2-1)*.91,.08+sample(i,22)*.83,21),ty=topY(u),by=rimY(u),x=g.cx+u*g.w;
        const y=mix(ty,by,t),r=(.8+v[19]*1.9+sample(i,20)**2.2*9)*(.55+.45*Math.sqrt(1-u*u))*(.5+.5*clamp((v[18]+.35-sample(i,81))*5));
        const du=.006,dy=(mix(topY(clamp(u+du,-.99,.99)),rimY(clamp(u+du,-.99,.99)),t)-mix(topY(clamp(u-du,-.99,.99)),rimY(clamp(u-du,-.99,.99)),t))/(2*du*g.w),tn=Math.hypot(1,dy);
        const tx=1/tn,tySlope=dy/tn,nx=-tySlope,ny=tx,flatten=(.22+.67*Math.sin(t*Math.PI*.5))*(.5+.5*Math.sqrt(1-u*u));
        const capSite=g.capSurface?.sample(u,t);
        const patch=Array.from({length:21},(_,j)=>{const a=j/20*TAU,rad=r*clamp(.69+.24*Math.sin(a*2+i*1.8)+.23*Math.cos(a*3+phase+i*.7)+.16*Math.sin(a*7+i*1.31),.2,1.15),xx=Math.cos(a)*rad*(1-.36*Math.abs(u)),yy=Math.sin(a)*rad*flatten-Math.max(0,-Math.sin(a))**3*r*.14;
          if(capSite){const wx=clamp(capSite.world[0]+Math.cos(a)*rad/Math.hypot(1,capSite.zx),-g.w,g.w),span=g.capSurface.depth*Math.sqrt(Math.max(0,1-(wx/g.w)**2)),wy=clamp(capSite.world[1]+Math.sin(a)*rad/Math.hypot(1,capSite.zy),-span,span),world=g.capSurface.point(wx,wy);world[2]+=.3+rad*.09;return g.capSurface.project(world);}
          return[x+tx*xx+nx*yy,y+tySlope*xx+ny*yy];});
        reserves.push(patch);
        veilShadows.push([...patch.slice(0,11),...patch.slice(0,11).reverse().map(([xx,yy],j)=>[xx+.8+r*.08,yy+.6+Math.sin(j/10*Math.PI)*r*.19])]);
        outline(patch.slice(0,11),'veil',.58,.52,g.cap);
        outline(patch.slice(13,20),'veil',.3,.22,g.cap);
        for(let k=0;k<4;k++){const xx=x-r*.65+k*r*.37,yy=y+r*.24+Math.sin(k*.7+i)*r*.14;outline(curve([xx-.4,yy],[xx,yy+.3],[xx+.8,yy+.7],[xx+1.5,yy+1],4),'veil',.38,.33,g.cap);}
      }
      outline(g.gillRim.slice(1,80),'cap-flesh',.48,.48);
      surface(g.flesh,g.lower.slice().reverse(),18,{ochre:.46,umber:.32,walnut:.22},.07,'flesh');
      const bladeCount=156,blades=[];
      for(let i=0;i<bladeCount;i++) {
        // Crowded free blades alternate with unequal short gills. Each blade
        // has a hanging edge and a curved attachment, not two parallel spokes.
        const a=(i+.12+sample(i,82)*.76)/bladeCount*TAU,angle=a+.032*Math.sin(a*3+phase)+.016*Math.sin(a*7-phase*.3);
        const kind=sample(i,119);
        // A shared growth field curves adjacent lamellae together. Independent
        // angular noise made a ruled fan with accidental line crossings.
        const bend=.30*Math.sin(angle+phase*.35)+.10*Math.sin(angle*2-phase*.4);
        const thetaAt=r=>angle+bend*Math.sin(Math.PI*r)*(1-.32*r);
        const clearance=4+v[16]*5;
        let inner=g.freeGillRoot(angle,clearance);
        // Account for the common blade curvature at the free root itself.
        for(let j=0;j<6;j++)inner=g.freeGillRoot(thetaAt(inner),clearance);
        const start=kind<.52?inner:kind<.83?Math.max(inner,.30+sample(i,116)*.24):Math.max(inner,.61+sample(i,117)*.20);
        // Attach to the actual lower cap context. The free inner end rounds
        // upward as faceDepth tapers to zero; lifting the attachment itself
        // buries its roof above the context and disconnects the visible tissue.
        const gillAt=r=>g.projectUnderside(thetaAt(r),r);

        const opacity=(.43+sample(i,25)*.26)*(.62+.38*clamp((v[15]+.3-sample(i,83))*5));
        // The free inner end rounds upward into the context. Thickness grows
        // along the blade, then narrows into the cap margin. Project vertical
        // depth through the same camera as the cap rather than adding a screen
        // offset whose width falsely depends on the blade's compass direction.
        const faceDepth=r=>{
          const t=clamp((r-start)/(1-start));
          // Depth belongs to the cap meridian, not the length of each blade.
          // Short intercalary gills inherit the same outer tissue profile as
          // their long neighbours instead of repeating a miniature fan wedge.
          const meridian=Math.pow(Math.max(0,Math.sin(Math.PI*r)),.72);
          const shoulder=1-Math.exp(-t*(15+5*Math.cos(angle+phase)));
          const margin=1-Math.exp(-(1-r)*(24+7*Math.sin(angle*2-phase)));
          const growth=.82+.20*Math.sin(angle*3+phase*.4)+.10*Math.cos(angle*5-phase*.7);
          return (9+v[16]*7)*meridian*shoulder*margin*growth;
        };
        // The context is the upper attachment. Tissue hangs down from it:
        // positive world z projects upward, so the free edge subtracts depth.
        const attachmentAt=gillAt;
        // A blade is a pliant sheet rooted in the context. Its lower edge
        // leans tangentially with the shared growth field, making overlapping
        // faces instead of vertically extruded radial dividers. The lean
        // vanishes at the free root and margin, preserving stem clearance.
        const bladeWorld=r=>{
          const theta=thetaAt(r),d=faceDepth(r);
          const lean=d*(.36*Math.sin(theta+phase*.35)+.18*Math.sin(theta*2-phase*.4));
          const x=Math.cos(theta)*g.w*r,y=Math.sin(theta)*g.capSurface.depth*r;
          return [x-Math.sin(theta)*lean,y+Math.cos(theta)*lean,g.capSurface.undersideHeight(x,y)-d];
        };
        const hangingAt=r=>g.capSurface.project(bladeWorld(r));
        const pts=Array.from({length:30},(_,j)=>hangingAt(mix(start,1,j/29)));
        const faceAt=attachmentAt;
        const back=Array.from({length:30},(_,j)=>faceAt(mix(start,1,j/29)));
        const face=[...pts,...back.slice().reverse()],near=Math.sin(angle)<-.12;
        gillFaces.push(face);
        const bladeOccluders=near?[g.cap,g.flesh]:[g.stem,g.cap,g.flesh];
        const firstInk=ink.length;
        // Separate loaded contacts taper and lift along a long free edge.
        // Stagger the lifts among blades instead of making concentric dashes.
        const cutA=7+Math.floor(sample(i,127)*6),cutB=19+Math.floor(sample(i,128)*5);
        // A projected blade face loses its contour as it turns edge-on.
        // Measure normal separation, not compass rank: neighbouring blades
        // share broad readable sectors while their lit tissue edges disappear.
        const contacts=[pts.slice(0,cutA+1),pts.slice(cutA+1,cutB+1),pts.slice(cutB+1)];
        for(const contact of contacts){
          const j=Math.min(28,Math.max(1,pts.indexOf(contact[Math.floor(contact.length/2)])));
          const tangent=[pts[j+1][0]-pts[j-1][0],pts[j+1][1]-pts[j-1][1]];
          const length=Math.hypot(...tangent)||1;
          const normalWidth=Math.abs(tangent[0]*(back[j][1]-pts[j][1])-tangent[1]*(back[j][0]-pts[j][0]))/length;
          const facing=clamp(normalWidth/5),shadow=clamp(.5+.5*Math.cos(angle+.65));
          const contactLoad=(.32+.68*facing)*(.42+.58*shadow);
          outline(contact,'gills',(.26+sample(i,26)*.2)*(.7+.3*facing),Math.min(1,opacity*1.05*contactLoad),g.underside,bladeOccluders);
        }
        // Keep the attachment quiet. Broken local contacts describe a fleshy
        // face; dark full-length pairs would make the underside look ruled.
        // Root contacts belong to recessed sectors, not every attachment.
        // Quiet outer attachments let neighbouring faces merge into tissue.
        const sectorShade=clamp(.5+.5*Math.cos(angle+.65));
        if(sectorShade>.48){
          const rootEnd=5+Math.floor(sample(i,122)*5);
          outline(back.slice(1,rootEnd),'lamella-shadow',.18+sample(i,122)*.12,opacity*.42*sectorShade,g.underside,bladeOccluders);
        }
        // Ink follows the longitudinal grain of the blade. Cross-blade
        // ticks made regular ladders through the entire underside. Retain
        // only a few unequal recess contacts, reserving the lit tissue face.
        const recess=clamp(.5+.5*Math.cos(angle+.65));
        for(let k=0;k<3;k++){
          if(sample(i*19+k,126)>.22+.62*recess)continue;
          const from=mix(start,1,.12+sample(i*19+k,123)*.55);
          const to=Math.min(.97,from+.10+sample(i*19+k,124)*.19);
          const grain=.28+.42*sample(i*19+k,125);
          const contact=Array.from({length:9},(_,j)=>{
            const r=mix(from,to,j/8),p=hangingAt(r),b=faceAt(r);
            return [mix(p[0],b[0],grain),mix(p[1],b[1],grain)];
          });
          outline(contact,'lamella-shadow',.17+.10*recess,.13+.15*recess,face,bladeOccluders);
        }
        // Camera depth lives on each projected tissue triangle. A whole-blade
        // rank cannot describe crossings between a short and a full lamella.
        const vertices=pts.map((p,j)=>{
          const r=mix(start,1,j/29),theta=thetaAt(r);
          const x=Math.cos(theta)*g.w*r,y=Math.sin(theta)*g.capSurface.depth*r;
          const world=bladeWorld(r),ce=Math.cos(g.capSurface.elevation),se=Math.sin(g.capSurface.elevation);
          const depth=world[1]*ce-world[2]*se;
          const attachmentDepth=y*ce-g.capSurface.undersideHeight(x,y)*se;
          return {front:[...transform(p),depth],back:[...transform(back[j]),attachmentDepth]};
        });
        // Evaluate charges using the original meridian vertices, before
        // depthTriangle omits degenerate root/margin triangles. Compacted
        // triangle offsets cannot recover those original vertex indices.
        const chargeAt=(j,edge)=>{
          const r=mix(start,1,j/29),root=Math.pow(1-r,.65);
          const turn=.5+.5*Math.cos(thetaAt(r)+.65);
          return edge ? .08+.13*turn*root : .14+(.28+.58*turn)*root;
        };
        const triangles=[];
        for(let j=1;j<vertices.length;j++){
          const a=vertices[j-1],b=vertices[j];
          // Share vertex charges so neither triangle's diagonal becomes a seam.
          for(const [verts,charge] of [
            [[a.front,b.front,b.back],[chargeAt(j-1,true),chargeAt(j,true),chargeAt(j,false)]],
            [[a.front,b.back,a.back],[chargeAt(j-1,true),chargeAt(j,false),chargeAt(j-1,false)]]]){
            const triangle=depthTriangle(verts);
            if(triangle){triangle.pigment=charge;triangles.push(triangle);}
          }
        }
        const paperFace=shapeOnPaper(face);lamellarSurfaces.set(paperFace,triangles);
        blades.push({face,paperFace,triangles,pigment:.22+.78*recess,box:bounds(face),firstInk,lastInk:ink.length});
      }
      // Each lamella is a tissue face. A nearer face reserves the farther
      // blade's ink before transparent washes, rather than crossing through it.
      for(const blade of blades){
        const b=blade.box,nearer=blades.filter(other=>{
          if(other===blade)return false;
          const q=other.box;return b.x<=q.x+q.w&&b.x+b.w>=q.x&&b.y<=q.y+q.h&&b.y+b.h>=q.y;
        }).map(other=>other.paperFace);
        for(let j=blade.firstInk;j<blade.lastInk;j++){
          ink[j].hiddenBy=nearer;lamellarSurfaces.set(ink[j],lamellarSurfaces.get(blade.paperFace));
        }
      }
      // The gill fan as an engraver draws it: crowded lamellae radiating in
      // perspective from a free collar round the stipe, with graded
      // lamellulae, irregular spacing, the odd fork, and darker recesses.
      for(let i=0,n=120;i<n;i++){
        const kind=sample(i,241),a=(i+.5+(sample(i,242)-.5)*.9)/n*TAU,start=kind<.4?.14+sample(i,243)*.04:kind<.7?.36+sample(i,244)*.2:.6+sample(i,245)*.22;
        const pts=Array.from({length:14},(_,j)=>g.projectUnderside(a+.05*Math.sin(j/13*Math.PI+i),mix(start,.995,j/13)));
        const near=Math.sin(a)<-.12,recess=clamp(.5+.5*Math.cos(a+.65));
        outline(pts,'gills',.3+.22*sample(i,246)+.12*recess,.3+.32*recess+(kind<.4?.1:0),g.underside,near?[g.cap,g.flesh]:[g.stem,g.cap,g.flesh]);
        if(sample(i,247)<.1){const q=pts[9];const tip=g.projectUnderside(a+.6/n*TAU,.995);outline(curve(q,[mix(q[0],tip[0],.4),mix(q[1],tip[1],.4)],[mix(q[0],tip[0],.8),mix(q[1],tip[1],.8)],tip,8),'gills',.3,.36,g.underside,near?[g.cap,g.flesh]:[g.stem,g.cap,g.flesh]);}
      }
      if(gillFaces.length){
        surface(g.underside,curve([g.cx-g.w,g.cy],[g.cx-g.w*.3,g.cy+g.rimDepth],[g.cx+g.w*.3,g.cy+g.rimDepth],[g.cx+g.w,g.cy]),g.rimDepth*3+g.h,{ochre:.24,umber:.38,paynes:.38},.20,'gill-face',[g.stem,g.cap,g.flesh]);
        washes.at(-1).islands=gillFaces.map(shapeOnPaper);
        washes.at(-1).depthFaces=blades.map(blade=>({triangles:blade.triangles,pigment:blade.pigment}));
      }
    } else if(family==='bolete') {
      if(skirt){outline(skirt,'ring',1.1,.65);surface(skirt,curve([rx-rw*1.4,ry+drop*.4],[rx-rw*.3,ry+drop*.7],[rx+rw*.8,ry+drop*.4],[rx+rw*1.6,ry+drop*.8]),drop*2,{paynes:.4,umber:.3,ochre:.3},.1,'veil-shadow');}
      for(let i=0;i<420;i++) {
        const k=.09+sample(i,32)*.8,u=(sample(i,31)*2-1)*.985,x=g.cx+u*g.w,y=mix(rimY(u),floorY(u),k),r=(.9+sample(i,33)*1.1)*(.55+.9*k);
        outline(curve([x-r,y],[x-r*.8,y+r],[x+r,y+r],[x+r*.65,y-.3],6),'pores',.55,.44+sample(i,34)*.25,g.underside,[g.stem,g.cap]);
      }
      // Connected, elongated meshes compress towards the sides of a round stipe.
      for(let row=0;row<11;row++)for(let col=0;col<8;col++) {
        const t=.52+row*.039,u=Math.sin((-1+col/7*2)*1.4)*.9,x=g.centerAt(t)+u*g.halfAt(t),y=-g.length*t;
        const w=(3+sample(row*8+col,37)*2.5)*Math.sqrt(1-u*u),h=7+sample(row*8+col,38)*5;
        outline(curve([x-w,y+h],[x-w*.3,y+h*.4],[x+w*.1,y],[x+w,y-h*.55],10),'reticulum',.55,.42,g.stem,[g.cap]);
        outline([[x-w,y+h],[x+w*.7,y+h*1.35],[x+w*2,y+h*.5]],'reticulum',.45,.33,g.stem,[g.cap]);
      }
    } else if(family==='chanterelle') {
      outline(g.underside.slice(82,110),'stem-contour',1.1,.62,null,[g.cap]);
      outline(g.underside.slice(-29),'stem-contour',.8,.45,null,[g.cap]);
      // Blunt, branching ridges descend to different heights on the stipe.
      // Broad paired edges retain a pale crest; they are not knife-thin gills.
      for(let i=0;i<18;i++) {
        const u=-.96+(i+(sample(i,85)-.5)*.55)/17*1.92,ex=g.cx+u*g.w,ey=rimY(u)+2;
        const t=.59+sample(i,87)*.22+Math.abs(u)*.04,sx=g.centerAt(t)+u*g.halfAt(t)*.84,sy=-g.length*t;
        const pts=curve([sx,sy],[sx+u*2,sy-25],[mix(sx,ex,.78),ey+28],[ex,ey],28);
        const ridgeShadow=points=>{
          const side=points.map(([x,y],j)=>{const t=j/(points.length-1),radius=.3+2.3*Math.sin(t*Math.PI);return[[x+1.1,y+.6],[x+1.1+radius,y+.6]];});
          foldShadows.push([...side.map(p=>p[0]),...side.map(p=>p[1]).reverse()]);
        };
        ridgeShadow(pts);
        outline(pts,'folds',.62+sample(i,41)*.4,.24+Math.abs(u)*.1,g.underside,[g.cap]);
        outline(pts.map(([x,y],j)=>[x-2.8*Math.sin(j/28*Math.PI),y-.5]),'folds',.42,.16,g.underside,[g.cap]);
        const junction=pts[13],branchX=ex+(i%2?1:-1)*(7+sample(i,89)*7),branchY=rimY(clamp((branchX-g.cx)/g.w,-.99,.99))+2;
        const branch=curve(junction,[junction[0]+u*6,junction[1]-12],[branchX-u*8,branchY+14],[branchX,branchY],16);
        ridgeShadow(branch);outline(branch,'folds',.55,.25,g.underside,[g.cap]);
        if(i%3===1){const q=pts[19];outline(curve(q,[q[0]+5,q[1]+2],[q[0]+8,q[1]-2],[q[0]+10,q[1]-5],8),'folds',.6,.24,g.underside,[g.cap]);}
      }
    } else {
      const fine=profile?.grammar==='morel'&&profile.variant===0,cells=fine?MOREL_CELLS_FINE:MOREL_CELLS;
      for(let index=0;index<cells.length;index++) {
        const cell=cells[index],centerUV=[0,1].map(k=>cell.reduce((s,p)=>s+p[k],0)/cell.length);
        const inset=.018+sample(index,91)*.085;
        const pit=roundedLoop(cell.map(p=>[mix(p[0],centerUV[0],inset),mix(p[1],centerUV[1],inset)])).map(([u,t])=>{
          // Warp the connected network in surface coordinates, then project it
          // onto the egg. Curvature compresses pits at the silhouette naturally.
          [u,t]=growSurfacePoint(local,u,t,93);
          t=.001+clamp(t)*.998;const a=1-2*t,angle=Math.acos(a)*(u<0?-1:1),arc=Math.sqrt(Math.max(.001,1-a*a));
          const span=g.w*arc*(.86-.12*a)*(1+.018*Math.sin(angle*7+phase)+.012*Math.sin(angle*13-phase));
          return[g.cx+Math.sin(u*Math.PI/2)*span,g.cy-g.h+t*g.h*1.04+u*arc*g.tilt*.3];
        });
        const center=[0,1].map(k=>pit.reduce((s,p)=>s+p[k],0)/pit.length);
        // Morchella (Argon): texture stays inside the cap. A pit reaching past
        // the silhouette is not drawn; each pit carries a crescent of shadow
        // under its upper-left wall, so pale ridges read between dark hollows.
        if(fine){const inCap=p=>{let c=false;for(let i=0,j=g.cap.length-1;i<g.cap.length;j=i++){const a=g.cap[i],b=g.cap[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
          if(pit.filter(inCap).length<pit.length*.9)continue;
          const pb=bounds(pit);pitCrescents.push(pit.map(([x,y])=>[center[0]+(x-center[0])*.82-pb.w*.06,center[1]+(y-center[1])*.55-pb.h*.2]));}
        pitShapes.push(pit);
        outline(pit.slice(0,Math.ceil(pit.length*.62)),'pits',.65,.46,g.cap);
        outline([...pit.slice(Math.ceil(pit.length*.68)),pit[0]],'pits',.4,.24,g.cap);
        const box=bounds(pit);
        for(let k=0;k<(fine?3:9);k++) {
          const x=box.x+box.w*(fine?.2+k*.3:.07+k*.105),crossings=[];
          for(let j=0;j<pit.length;j++) {
            const a=pit[j],b=pit[(j+1)%pit.length];
            if((a[0]<=x&&b[0]>x)||(b[0]<=x&&a[0]>x))crossings.push(mix(a[1],b[1],(x-a[0])/(b[0]-a[0])));
          }
          const top=crossings.length?Math.min(...crossings):center[1],bottom=crossings.length?Math.max(...crossings):center[1];
          const depth=(bottom-top)*(.2+.37*sample(index*7+k,43));
          outline(curve([x,top+.6],[x-1.4,top+depth*.3],[x-2,top+depth*.8],[x-.4,top+depth],8),'pits',.5+sample(k,44)*.35,.34+v[18]*.3,pit);
        }
      }
    }
    if(family==='amanita'||family==='bolete'){
      // The incurved margin shows its flesh as a thin band inside the rim, and
      // the rim casts a shadow over the gills or tubes just behind it.
      const rimPath=Array.from({length:41},(_,i)=>{const u=-.97+i/40*1.94;return[g.cx+u*g.w,rimY(u)];});
      outline(rimPath.slice(2,39).map(([x,y],i)=>[x,y-2.2-1.2*Math.sin(i/36*Math.PI)]),'cap-contour',.55,.42,g.cap);
      for(let i=0;i<70;i++){const u=-.95+(i+sample(i,236)*.8)/70*1.9,x=g.cx+u*g.w,y=rimY(u),len=(3+sample(i,237)*4)*(.6+.4*Math.sqrt(1-u*u)),sh=clamp(.5+.5*u);outline([[x,y+.6],[x+.2,y+len*.5],[x-.1,y+len]],'lamella-shadow',.3+.25*sh,.2+.35*sh,g.underside,[g.stem]);}
      if(family==='bolete'){
        // Tubes seen edge-on at the cut margin, then pores that enlarge and
        // open towards the eye, and a dark recess where tubes meet the stipe.
        const front=u=>floorY(u);outline(Array.from({length:37},(_,i)=>{const u=-.96+i/36*1.92;return[g.cx+u*g.w,front(u)-4-1.5*Math.sqrt(1-u*u)];}),'pores',.45,.4,g.underside,[g.stem,g.cap]);
        for(let i=0;i<110;i++){const u=-.96+(i+sample(i,231)*.7)/110*1.92,x=g.cx+u*g.w,y=front(u),len=(3.5+sample(i,232)*2.5)*(.5+.5*Math.sqrt(1-u*u));outline([[x,y-len],[x+.25,y-len*.5],[x+.1,y-.3]],'pores',.3+sample(i,233)*.25,.32+.3*clamp(.5+u*.6),g.underside,[g.stem,g.cap]);}
        const topT=.97,sx=g.centerAt(topT),sw=g.halfAt(topT),sy=g.stemYAt(topT);
        for(let i=0;i<24;i++){const u=-1.6+i/23*3.2,x=sx+u*sw,y=sy+2+Math.abs(u)*1.5;outline([[x,y],[x+.4,y+3+sample(i,238)*3]],'pores',.4,.45,g.underside,[g.stem]);}
      }
    }
    if(family!=='morel') {
      for(let i=0;i<(family==='amanita'?0:190);i++){
        const u=(sample(i,101)*2-1)*.98,t0=.015+Math.pow(sample(i,102),.35)*.96,t1=Math.min(.995,t0+.009+sample(i,103)*.055);
        const pts=Array.from({length:9},(_,j)=>{const t=mix(t0,t1,j/8),uu=clamp(u+(t-t0)*u*.4,-.99,.99);return[g.cx+uu*g.w,mix(topY(uu),rimY(uu),t)];});
        outline(pts,'fibres',.27+sample(i,104)*.25,.08+Math.abs(u)*.23+t0*.1,g.cap,reserves);
      }
      const path=Array.from({length:30},(_,i)=>{const u=-.98+i/29*1.96;return[g.cx+u*g.w,mix(rimY(u),floorY(u),.6)];});
      surface(g.underside,family==='chanterelle'?curve([0,1],[g.cx,-g.length*.4],[g.cx,-g.length*.8],[g.cx,g.cy-10]):path,family==='chanterelle'?g.w*2.3:family==='amanita'?g.rimDepth*2.4:70,family==='bolete'?{ochre:.55,hansa:.15,sapgreen:.2,umber:.1}:family==='amanita'?{paynes:.4,umber:.25,ochre:.35}:stemPalette,(family==='chanterelle'?.25:family==='amanita'?.055:family==='bolete'?.16:.035)+v[24]*.04,family==='chanterelle'?'folded-body':'underside',family==='chanterelle'?[]:[g.stem]);
      if(family==='amanita'){
        washes.at(-1).load=.13+v[24]*.09;
        attachSurface('underside',Array.from({length:41},(_,i)=>{const u=i/20-1;return[transform(g.projectUnderside(-Math.acos(clamp(u,-1,1)))),transform(g.projectUnderside(Math.acos(clamp(u,-1,1))))];}));
      }
      if(foldShadows.length){
        surface(g.underside,curve([0,1],[g.cx,-g.length*.4],[g.cx,-g.length*.8],[g.cx,g.cy-10]),g.w*2.3,{ochre:.45,umber:.4,walnut:.15},.12+v[24]*.08,'fold-shadow',[g.cap]);
        washes.at(-1).islands=foldShadows.map(shapeOnPaper);
      }
    }
    if(family==='amanita')for(let bundle=0;bundle<43;bundle++){
      const u=(sample(bundle,201)*2-1)*.96,t=.06+sample(bundle,202)*.83;
      for(let stroke=0;stroke<6;stroke++){
        const uu=clamp(u+(stroke-2.5)*.006,-.985,.985);
        const site=g.capSurface.sample(uu,t),[x,y]=site.world;
        const radius=Math.hypot(x/g.w,y/g.capSurface.depth),angle=Math.atan2(y/g.capSurface.depth,x/g.w);
        // Short oblique contacts turn around the dome instead of falling in
        // screen-space columns. The turning shadow carries most of the ink;
        // pale crown contacts fade continuously, without seed-dependent culling.
        const shade=clamp((.77-site.light)*2.5),contact=Math.max(0,...reserves.map(p=>{
          const b=bounds(p),d=Math.hypot((site.point[0]-b.x-b.w*.5)/g.w,(site.point[1]-b.y-b.h*.5)/g.h);
          return Math.exp(-d*d/.004);
        }));
        const reach=(2+sample(bundle*6+stroke,203)*6)*(.5+.5*shade);
        const pts=Array.from({length:15},(_,j)=>{
          const q=j/14,a=angle+reach/g.w*q*(.8+.2*Math.sin(q*Math.PI)),r=Math.min(.997,radius+reach/g.w*q*.25);
          return g.capSurface.project(g.capSurface.point(Math.cos(a)*g.w*r,Math.sin(a)*g.capSurface.depth*r));
        });
        outline(pts,'fibres',.22+sample(stroke+bundle*6,204)*.18,.025+shade*.30+contact*.12,g.cap,reserves);
      }
    }
    const capBox=bounds(g.cap),axis=family==='morel'?curve([g.cx,g.cy-g.h*.96],[g.cx-4,g.cy-g.h*.7],[g.cx+5,g.cy-g.h*.2],[g.cx,g.cy+4]):curve([g.cx-g.w*.98,g.cy-7],[g.cx-g.w*.5,g.cy-g.h*.63],[g.cx+g.w*.45,g.cy-g.h*.63],[g.cx+g.w*.98,g.cy+g.tilt]);
    // Boletus edulis (refs-lib): a chestnut cap (#9d644a), not pale peach;
    // Cantharellus cibarius an egg-yellow one (#d3ac4d to #e3a92b), not cream.
    surface(g.cap,axis,family==='morel'?g.w*2.3:capBox.h*1.9,capPalette,(family==='amanita'?(young?.72:.82):family==='morel'?.17:profile?.grammar==='bolete'&&profile.variant===0?.34:profile?.grammar==='chanterelle'&&profile.variant===0?.38:.16)+v[21]*(family==='morel'?.04:.16),family==='chanterelle'?'funnel-cap':'cap',reserves);
    washes.at(-1).species=family;if(family!=='morel'&&family!=='chanterelle')attachSurface('cap',capRails);
    if(!sketch&&profile?.grammar==='milkcap'&&profile.variant===0){
      // Lactarius torminosus (refs-lib): 4-6 darker concentric zones, strongest
      // at the margin, and a woolly white-pink fringe hanging from the rolled rim.
      const band=f=>Array.from({length:41},(_,i)=>{const j=i*2,a=g.top[j],b=g.lower[80-j];return [mix(a[0],b[0],f),mix(a[1],b[1],f)];});
      const zones=[];
      for(let z=0;z<5;z++){const f=.5+z*.1,inner=band(f),outer=band(Math.min(.985,f+.035+.012*z));zones.push([...inner,...outer.slice().reverse()]);outline(inner.slice(3,38),'cap-fibres',.45,.22+.05*z,g.cap);}
      surface(g.cap,axis,capBox.h*1.6,{rose:.5,sienna:.32,umber:.18},.16,'zone-glaze');washes.at(-1).islands=zones.map(shapeOnPaper);
      for(let i=0;i<220;i++){const j=Math.floor(2+i/219*76),p=g.lower[j],len=6+sample(i,451)*10,dx=(sample(i,452)-.5)*6;
        outline(curve([p[0],p[1]-2],[p[0]+dx*.3,p[1]+len*.35],[p[0]+dx*.7,p[1]+len*.7],[p[0]+dx,p[1]+len],5),'fibres',.34+sample(i,453)*.22,.3+sample(i,454)*.25);}
    }
    if(family!=='morel'&&family!=='chanterelle'){
      surface(g.cap,axis,capBox.h*2,{...capPalette,umber:(capPalette.umber??0)+.28},family==='amanita'?.22:.10,'cap-turn',reserves);
      attachSurface('cap',capRails);washes.at(-1).softness=.82;
    }
    if(family==='amanita'&&reserves.length>1){
      // Fly agaric warts are white pyramids (cream #e8dcc4, shade #8a7a5c), not yellow smudges.
      surface(g.cap,axis,capBox.h*2.1,profile?.grammar==='amanita'&&profile.variant===0?{ochre:.42,umber:.36,paynes:.22}:{ochre:.65,umber:.25,paynes:.1},profile?.grammar==='amanita'&&profile.variant===0?.07:.18,'veil-light');
      washes.at(-1).islands=reserves.map(shapeOnPaper);
      surface(g.cap,axis,capBox.h*2.1,{umber:.5,paynes:.3,sienna:.2},.24,'veil-cast-shadow',reserves);
      washes.at(-1).islands=veilShadows.map(shapeOnPaper);
    }
    if(pitShapes.length){
      surface(g.cap,axis,g.w*2.4,{umber:.6,walnut:.22,ochre:.18},(pitCrescents.length?.14:.24)+v[24]*.12,'pit-shadow');
      washes.at(-1).islands=pitShapes.map(shapeOnPaper);
    }
    if(pitCrescents.length){
      surface(g.cap,axis,g.w*2.4,{umber:.55,walnut:.3,paynes:.15},.3+v[24]*.1,'pit-shadow');
      washes.at(-1).islands=pitCrescents.map(shapeOnPaper);
    }
    // Broken earth, fine root hairs and bits of leaf litter form two small bases,
    // rather than a graphic polygon of ground crossing behind the specimens.
    for(let i=0;i<95;i++) {
      const a=sample(i,61)*TAU,r=Math.sqrt(sample(i,62)),x=Math.cos(a)*r*(young?47:64),y=10+Math.sin(a)*r*11,angle=sample(i,69)*TAU,span=2+sample(i,63)*8,dx=Math.cos(angle)*span,dy=Math.sin(angle)*span*.5;
      outline(curve([x,y],[x+dx*.25,y+dy*.3-1],[x+dx*.65,y+dy*.8+.7],[x+dx,y+dy],6),'habitat',.4+sample(i,64)*.9,(.2+sample(i,65)*.45)*(.3+.7*v[34]));
    }
    for(let i=0;i<8;i++) {
      const x=(sample(i,66)-.5)*g.stemWidth*2,y=5+sample(i,67)*5;
      outline(curve([x,y],[x-3,y+8],[x+7,y+9],[x+4,y+18+sample(i,68)*10],10),'habitat',.6,.4);
    }
    const earth=Array.from({length:49},(_,i)=>{const a=i/48*TAU,r=1+Math.sin(a*5+phase)*.13+Math.sin(a*13)*.09;return[Math.cos(a)*(young?49:68)*r,10+Math.sin(a)*11*r];});
    surface(earth,curve([-70,12],[-35,18],[30,7],[70,13]),26,{umber:.6,ochre:.25,sapgreen:.15},.06,'ground');
  }
  const section=!sketch&&profile?.grammar==='amanita'&&profile.variant!==2?sectionStudy(individuals.at(-1)??genome):null;
  if(section){ink.push(...section.ink);washes.push(...section.washes);}
  return {ink,washes,habitat,morphology:{...MORPHOLOGY[family]},specimenCount:studyUnits.length,individuals,views,annotations:section?[section.annotation]:[]};
}

// A longitudinal cut uses the same specimen dimensions as the standing body.
// The cuticle, cap context, lamellae and stipe remain separate tissue passages.
function sectionStudy(genome){
  const v=genome.values,g=buildGeometry(genome),ink=[],washes=[],phase=v[35]*TAU;
  const angle=-.48+(v[6]-.5)*.14,scale=.72,ox=279,oy=481;
  const tr=([x,y])=>[ox+scale*(x*Math.cos(angle)-y*Math.sin(angle)),oy+scale*(x*Math.sin(angle)+y*Math.cos(angle))];
  const mapped=new Map(),shape=s=>{if(!mapped.has(s))mapped.set(s,s.map(tr));return mapped.get(s);};
  const line=(pts,width=.5,opacity=.4,clip=null,exclude=[])=>penGestures(ink,{points:pts.map(tr),width,opacity,role:'section',clip:clip?shape(clip):null,exclude:exclude.map(shape),phase:phase+ink.length*.57});
  const wash=(s,palette,load,role='section-flesh',reserves=[])=>{
    const world=shape(s),b=bounds(world),mark={shape:world,points:[[b.x-2,b.y+b.h*.5],[b.x+b.w+2,b.y+b.h*.5]],width:b.h*2+8,palette,load,role,reserves:reserves.map(shape),phase,granulation:v[25],wetness:v[26],pooling:v[27]*.6,softness:v[28],variation:v[29]};washes.push(mark);return mark;
  };
  const sectionTop=Array.from({length:81},(_,i)=>{const u=i/40-1;return[g.cx+u*g.w,g.cy-g.capSurface.height(u*g.w,0)];});
  const sectionLower=Array.from({length:81},(_,i)=>{const u=1-i/40;return[g.cx+u*g.w,g.cy-g.capSurface.undersideHeight(u*g.w,0)];});
  g.top=sectionTop;g.lower=sectionLower;g.cap=[...sectionTop,...sectionLower];
  // A cut through the centre has no camera elevation. Carry the stipe up
  // into that same tissue section instead of reusing the projected neck height.
  const joinY=g.cy-g.capSurface.height(0,0)*.64;
  const neckCorrection=joinY-g.stemYAt(1);
  g.stem=g.stem.map(([x,y],i)=>{
    const t=i<=46?i/46:i<=54?1:i<=101?1-(i-55)/46:0;
    return[x,y+neckCorrection*t**8];
  });
  const cutStemY=(t,u)=>g.stemYAt(t,u)+neckCorrection*t**8;
  // A meridian cut exposes two lateral lamellar sectors, separated from
  // the stem by the free inner blade ends. Stem and cap context are continuous.
  const free=(g.halfAt(1)+7+v[16]*6)/g.w;
  const cutLower=u=>[g.cx+u*g.w,g.cy-g.capSurface.undersideHeight(u*g.w,0)];
  const cutEdge=(u,side)=>{const p=cutLower(u),r=Math.abs(u),t=clamp((r-free)/(1-free));return[p[0],p[1]+(9+v[17]*13)*Math.sin(Math.PI*t)**.55*(.8+.2*r)];};
  const sectors=[-1,1].map(side=>{
    const roof=Array.from({length:41},(_,i)=>cutLower(side*mix(free,1,i/40)));
    const edge=Array.from({length:41},(_,i)=>cutEdge(side*mix(free,1,i/40),side));
    return{side,roof,edge,shape:[...roof,...edge.slice().reverse()]};
  });
  const cuticle=[...g.top,...g.top.slice().reverse().map(([x,y],i)=>[x,y+(1.8+v[3]*1.5)*Math.sin(i/80*Math.PI)])];
  line(g.stem.slice(1,47),.72,.55,null,[g.cap]);line(g.stem.slice(55,103),.9,.65,null,[g.cap]);
  line(g.top,.72,.62);
  for(const sector of sectors){
    line(sector.roof.slice(2),.36,.27);line(sector.edge,.56,.43);
    for(let i=0;i<38;i++){
      const t=(i+.25+sample(i+sector.side*11,220)*.48)/38,u=sector.side*mix(free+.008,.986,t),upper=cutLower(u),lower=cutEdge(u,sector.side);
      // Unequal shallow cuts describe the blade tissue, with quiet roots.
      const lean=sector.side*(.6+sample(i,222)*1.2);
      line(curve([upper[0],upper[1]+.8],[upper[0]+lean*.4,mix(upper[1],lower[1],.35)],[lower[0]+lean,lower[1]-1],lower,6),.23+sample(i,221)*.23,.23+sample(i,222)*.18,sector.shape);
    }
  }
  for(let side of [-1,1])for(let i=0;i<57;i++){
    const t=.035+sample(i+side*7,223)*.91,tt=Math.min(.99,t+.025+sample(i,224)*.08),u=side*(.58+sample(i,225)*.38);
    line(Array.from({length:9},(_,j)=>{const q=mix(t,tt,j/8);return[g.centerAt(q)+g.halfAt(q)*u,cutStemY(q,u)];}),.27+sample(i,226)*.24,.22+Math.abs(u)*.13,g.stem,[g.cap]);
  }
  for(let i=0;i<58;i++){
    // Context fibres belong to the cut meridian, not the camera-facing
    // crown envelope. Follow a short, inward-curving portion of its thickness.
    const u=(sample(i,227)*2-1)*.98;
    const start=.12+sample(i,228)*.19,end=start+.22+sample(i,229)*.27;
    line(Array.from({length:9},(_,j)=>{
      const t=mix(start,end,j/8),q=u*(1-.035*t);
      const top=g.cy-g.capSurface.height(q*g.w,0);
      const lower=g.cy-g.capSurface.undersideHeight(q*g.w,0);
      return[g.cx+q*g.w,mix(top,lower,t)];
    }),.28,.27,g.cap);
  }
  wash(g.stem,{ochre:.23,umber:.3,walnut:.47},.06,'stem',[g.cap]);
  wash(g.cap,{ochre:.52,walnut:.34,umber:.14},.055);
  const sb=bounds(sectors.flatMap(sector=>sector.shape));
  const sectionGillWash=wash([[sb.x,sb.y],[sb.x+sb.w,sb.y],[sb.x+sb.w,sb.y+sb.h],[sb.x,sb.y+sb.h]],{umber:.35,ochre:.36,paynes:.29},.13,'section-gills');
  sectionGillWash.islands=sectors.map(sector=>shape(sector.shape));
  wash(cuticle,genome.phenotype?TYPE_PALETTES[genome.phenotype.palette]:TYPE_PALETTES.scarlet,.72,'section-cuticle');
  return{ink,washes,annotation:{text:'Longitudinal section',x:232,y:519}};
}

// Specimen composition.
//
// Composition contract (with stochastic_structure_audit):
//   composition = {version:1,id,members:[{id,x,y,scale,rotation,maturity}],plate}
// Capture createFieldPlateRecipe ONCE when composing a plate/morph pair; carry
// composition.plate through the pair. Never hash an interpolated genome.seed.
// composeFieldPlateStudy fits the complete main study into plate.adultBox,
// preserving native material meshes and transforming affine depth planes.
// Capture sourceBox from both endpoint plans once; do not refit each frame.
// Invoke buildFieldPlateAdjuncts from BOTH full and sketch planners; sketch uses
// returned bodies and ink, full uses washes and ink. Remove the old implicit
// Amanita section when this opt-in composition is active to avoid duplication.
//
// Drawing plan: 300 x 250 mm paper, four plate units/mm; dry set ink first
// (0.08-0.18 mm, tapered contacts), then connected pale flesh washes, thin
// cuticle wash and a localized hymenium glaze. Reserve exposed flesh/cavities.
// Native brush/water controls remain existing wash-record controls, not a new
// paint engine. Each broad part gets one passage, rather than hundreds of dabs.
// Checkpoints still required on integration: executed ink, first pale wash,
// dried context, localized glaze, final plate. No visual acceptance claimed.
//
// Planner / technique checklist for the native painting:
// [x] Read target: anatomical studies, reserved light flesh, spare warm paper.
// [x] Record paper/style/size: ink-and-wash, 300 x 250 mm, existing native density.
// [x] Group passages: cut tissue, cuticle, hymenium, detail, illustrative deposit.
// [x] Choose set ink; give local marks contact widths and fixed stroke budgets.
// [x] Order drawing, drying, pale washes, localized glazes, sparse accents.
// [x] Preview/check geometry and reserves numerically before native physics.
// [ ] Inspect executed drawing; selected paths are not evidence of deposition.
// [ ] Paint broad washes; inspect moisture across marks and adjacent passages.
// [ ] Save drawing/first-wash/dried-glaze/final checkpoints and review visually.
// [ ] Fix the earliest failed stage before adding more texture or detail.
//
// Anatomy sources (accessed 2026-10-19; the archetypes remain artistic):
// https://canbr.org/fungi/spore-prints.html -- deposited spores need not match
// gill color; coral can leave an irregular deposit, not a radial cap print.
// https://www.mushroomexpert.com/morchella_esculentoides.html -- connected hollow
// cap/stipe, with possible basal chambers; no false solid mushroom cut.
// https://www.mushroomexpert.com/lycoperdon_perlatum.html -- enclosed gleba and
// sterile base, not gills. Immature pale tissue is used here without age flips.
// https://www.mushroomexpert.com/boletus_edulis.html -- a pore/tube layer, not gills.

const FIELD_PLATE_CAPS = new Set(['amanita','agaric','bonnet','waxcap','milkcap','hedgehog','bolete','chanterelle','parasol','inkcap']);
const FIELD_PLATE_LATERAL = new Set(['oyster','bracket']);
// Below the plate title and its footer line, clear of every figure caption.
const FIELD_PLATE_FOOTER_Y = 963;
const FIELD_PLATE_NEUTRAL = Object.freeze({umber:.38,paynes:.42,ochre:.20});
const FIELD_PLATE_FLESH = Object.freeze({ochre:.38,walnut:.44,umber:.18});

function fieldPlateKind(genome){
  const grammar=genome.phenotype?.grammar??genome.family;
  return FIELD_PLATE_CAPS.has(grammar)?'cap':FIELD_PLATE_LATERAL.has(grammar)?'lateral':
    ['morel','puffball','coral','tooth','earthstar','stinkhorn'].includes(grammar)?grammar:'unsupported';
}
function fieldPlateHymenium(genome){
  return genome.phenotype?.hymenium??({bolete:'pores',bracket:'pores',chanterelle:'folds'}[genome.family]??'gills');
}

function fieldPlatePairKey(pair,composition){
  const identity=g=>[g.seed,g.profileId,g.donorId,g.family,g.values];
  return hashSeed(JSON.stringify([identity(pair.a),identity(pair.b),composition.id,composition.members])).toString(36);
}
function fieldPlateBounds(plan){
  const points=[...(plan.ink??[]).filter(m=>m.role!=='section').flatMap(m=>m.points??[]),
    ...(plan.bodies??plan.washes??[]).filter(m=>!m.role?.startsWith('section-')).flatMap(m=>m.shape??[])];
  return points.length?bounds(points):null;
}
export function createFieldPlateRecipe(genome,{composition=null,morph=null,seed=genome.seed,endpointPlans=[],pairKey='standalone'}={}){
  const a=morph?.a??genome,b=morph?.b??genome,eligible=g=>['cap','lateral'].includes(fieldPlateKind(g));
  const boxes=endpointPlans.map(fieldPlateBounds).filter(Boolean);
  const raw=boxes.length?bounds(boxes.flatMap(b=>[[b.x,b.y],[b.x+b.w,b.y+b.h]])):{x:30,y:80,w:1140,h:760};
  const pad=Math.max(8,Math.max(raw.w,raw.h)*.04),sourceBox=Object.freeze({x:raw.x-pad,y:raw.y-pad,w:raw.w+pad*2,h:raw.h+pad*2});
  const seedKey=hashSeed(`field-plate:${seed}`),q=n=>sample(seedKey%65521,n),showDeposit=eligible(a)&&eligible(b);
  // Blocking: the habit group takes the largest box; supporting figures get
  // square-ish slots of their own, each with a caption line beneath it. Slot
  // count follows what is actually drawn: implicit pairs keep the source
  // form's comparison studies, so a cap or lateral source always shows its
  // spore deposit in a third slot.
  const aspect=sourceBox.w/sourceBox.h,gutter=30,caption=30;
  const content={x:56,y:64,w:1088,h:782},layoutDeposit=eligible(a)||showDeposit,slotCount=layoutDeposit?3:2;
  // Figures read in order: 2 section, 3 underside, 4 deposit, 5 microscopy.
  // The section gets the widest slot; the microscopy panel is narrow.
  const showMicro=fieldPlateKind(a)!=='unsupported',weights=[1.3,1.08,...(layoutDeposit?[1]:[]),...(showMicro?[.85]:[])],n=weights.length;
  const wide=aspect>=1.4,mirrored=!wide&&q(616)<.25;
  let adultBox,slots;
  if(wide){
    const stripHeight=clamp(content.h*(.32+(q(612)-.5)*.04),200,282),mainHeight=content.h-stripHeight-caption*2-gutter;
    const scale=Math.min(content.w/sourceBox.w,mainHeight/sourceBox.h),w=sourceBox.w*scale,h=sourceBox.h*scale;
    const totalHeight=h+caption+gutter+stripHeight+caption,y=content.y+(content.h-totalHeight)*.5;
    adultBox={x:content.x+(content.w-w)*.5,y,w,h};
    const sum=weights.reduce((s,x)=>s+x,0),avail=content.w-gutter*(n-1),widths=weights.map(x=>Math.min(avail*x/sum,stripHeight*1.75*x));
    const extra=content.w-widths.reduce((s,x)=>s+x,0),space=Math.max(gutter,extra/(n+1));let sx=content.x+(extra-space*(n-1))*.5;
    slots=widths.map(sw=>{const slot={x:sx,y:y+h+caption+gutter,w:sw,h:stripHeight};sx+=sw+space;return slot;});
  }else{
    // Habit beside two columns: the section full height at the habit's own
    // scale, then underside, deposit and microscopy stacked, clear of the
    // plate numeral in the upper corner.
    const side=content.w*.44,colA=(side-gutter)*.52,colB=side-gutter-colA;
    const mainWidth=content.w-gutter-side,scale=Math.min(mainWidth/sourceBox.w,(content.h-caption)/sourceBox.h);
    const w=sourceBox.w*scale,h=sourceBox.h*scale,groupWidth=w+gutter+side,x=content.x+(content.w-groupWidth)*.5,y=content.y+(content.h-h-caption)*.5;
    adultBox={x:mirrored?x+side+gutter:x,y,w,h};
    const sx=mirrored?x:x+w+gutter,top=content.y+46,rest=weights.slice(1).map((k,i)=>i===n-2&&showMicro?.85:1),hs=rest.reduce((s,k)=>s+k,0);
    const unit=(content.y+content.h-top-(gutter+caption)*(rest.length-1)-caption)/hs;let sy=top;
    slots=[{x:mirrored?sx+colB+gutter:sx,y:content.y+20,w:colA,h:content.h-caption-40},
      ...rest.map(k=>{const slot={x:mirrored?sx:sx+colA+gutter,y:sy,w:colB,h:unit*k};sy+=unit*k+gutter+caption;return slot;})];
  }
  const cutBox=slots[0],detailBox=slots[1],depositBox=layoutDeposit?slots[2]:detailBox,microBox=showMicro?slots[n-1]:null;
  return Object.freeze({version:2,id:`field-plate:${seedKey}:${pairKey}`,pairKey,phase:q(611)*TAU,
    memberId:composition?.members?.slice().sort((left,right)=>(right.maturity??0)-(left.maturity??0)||left.id.localeCompare(right.id))[0]?.id??'specimen-0',sourceBox,
    adultBox:Object.freeze(adultBox),cutBox:Object.freeze(cutBox),detailBox:Object.freeze(detailBox),depositBox:Object.freeze(depositBox),microBox:microBox&&Object.freeze(microBox),
    blocking:wide?'habit-above':'habit-beside',mirrored,showDeposit,
    supported:(eligible(a)&&eligible(b))||(fieldPlateKind(a)===fieldPlateKind(b)&&fieldPlateKind(a)!=='unsupported'),
    counts:Object.freeze({detail:88,deposit:112}),footer:'Artistic field studies, not an identification guide',
  });
}
function fieldPlateRecipeAt(recipe,t){
  const from=recipe?.transitionFrom;if(!from)return recipe;
  if(t<=0)return from;if(t>=1)return {...recipe,transitionFrom:null};
  const box=(a,b)=>Object.fromEntries(['x','y','w','h'].map(k=>[k,mix(a[k],b[k],t)]));
  return {...recipe,...Object.fromEntries(['sourceBox','adultBox','cutBox','detailBox','depositBox','microBox'].filter(k=>from[k]&&recipe[k]).map(k=>[k,box(from[k],recipe[k])])),transitionFrom:null};
}

// Local records are shared by ink and native wash; no raster icon or SVG fill.
function fieldPlateRecorder(genome,recipe,slot){
  const ink=[],washes=[],v=genome.values;let serial=0;
  const tag=id=>`adjunct:${slot}:${id}`;
  const line=(id,points,width=.45,opacity=.45,clip=null,exclude=[])=>{
    ink.push({points,width,opacity,clip,exclude,role:'section',fieldPlateId:tag(id),
      studyRole:slot,memberId:recipe.memberId,phase:recipe.phase+serial++*.71});
  };
  const wash=(id,shape,palette,load,reserves=[],islands=null)=>{
    const b=bounds(shape),mark={shape,points:[[b.x-2,b.y+b.h*.5],[b.x+b.w+2,b.y+b.h*.5]],
      width:b.h*2+8,palette,load,role:`section-${id}`,reserves,islands,
      fieldPlateId:tag(id),studyRole:slot,memberId:recipe.memberId,phase:recipe.phase,
      granulation:v[25],wetness:v[26],pooling:v[27]*.45,softness:v[28],variation:v[29]};
    washes.push(mark);return mark;
  };
  return {ink,washes,line,wash};
}

// A meridian uses real cap context from the existing surface model, not the
// camera-facing underside ellipse. Tubes, folds and blade tissue are different.
function fieldPlateCapCut(genome,recipe){
  const out=fieldPlateRecorder(genome,recipe,'longitudinal-cut'),{line,wash}=out;
  const g=buildGeometry(genome),v=genome.values,grammar=genome.phenotype?.grammar??genome.family;
  const hymenium=fieldPlateHymenium(genome),free=['amanita','parasol'].includes(grammar);
  const row=u=>{
    const x=g.cx+u*g.w;
    if(g.capSurface)return {top:[x,g.cy-g.capSurface.height(u*g.w,0)],roof:[x,g.cy-g.capSurface.undersideHeight(u*g.w,0)]};
    const i=clamp(Math.round((u+1)*40),0,80),p=g.top[i];
    // Non-3D cap families retain their existing observed profile; a thin
    // connected context follows it rather than adding a new generic dome.
    return {top:[...p],roof:[p[0],p[1]+(7+v[17]*13)*Math.max(.08,1-u*u)**.35]};
  };
  const top=Array.from({length:81},(_,i)=>row(i/40-1).top),roof=Array.from({length:81},(_,i)=>row(i/40-1).roof);
  const context=[...top,...roof.slice().reverse()],join=row(0).roof[1]-3;
  const stemPoint=(t,u)=>[g.centerAt(t)+g.halfAt(t)*u,g.stemYAt(t,u)+(join-g.stemYAt(1,0))*t**8];
  const left=Array.from({length:65},(_,i)=>stemPoint(i/64,-1)),right=Array.from({length:65},(_,i)=>stemPoint(i/64,1));
  const stem=[...left,...right.slice().reverse()];
  line('stipe-left',left,.55,.49,null,[context]);line('stipe-right',right,.68,.61,null,[context]);line('cap-cut-edge',top,.62,.58);
  wash('stipe-flesh',stem,FIELD_PLATE_FLESH,.045,[context]);wash('cap-context',context,FIELD_PLATE_FLESH,.05);
  const cuticle=[...top,...top.slice().reverse().map(([x,y])=>[x,y+1.8])];
  wash('cuticle',cuticle,TYPE_PALETTES[genome.phenotype?.palette]??TYPE_PALETTES.chestnut,.20);
  const start=clamp((g.halfAt(1)+(free?7:0))/g.w,.04,.43),sectors=[];
  for(const side of [-1,1]){
    const upper=Array.from({length:41},(_,i)=>row(side*mix(start,1,i/40)).roof);
    const lower=upper.map(([x,y],i)=>[x,y+(hymenium==='pores'?12+v[17]*13:6+v[17]*11)*Math.sin(Math.PI*i/40)**.45]);
    const region=[...upper,...lower.slice().reverse()];sectors.push(region);
    line(`hymenium-edge-${side}`,lower,.47,.46);
    for(let i=0;i<34;i++){
      const t=(i+.35+sample(i,619)*.25)/34,u=side*mix(start+.008,.987,t),a=row(u).roof;
      const depth=(hymenium==='pores'?12+v[17]*13:6+v[17]*11)*Math.sin(Math.PI*t)**.45;
      const x=a[0],y=a[1],lean=hymenium==='folds'?side*depth*.3:side*.7;
      const p=hymenium==='teeth'?[[x-1.1,y],[x+.3,y+depth],[x+1.3,y]]:
        curve([x,y+.5],[x+lean*.3,y+depth*.3],[x+lean,y+depth*.8],[x+lean,y+depth],6);
      line(`hymenium-${side}-${i}`,p,hymenium==='folds'?.8:.33,.28+sample(i,620)*.13,region);
    }
  }
  const b=bounds(sectors.flat());wash('hymenium',[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]],FIELD_PLATE_NEUTRAL,.085,[],sectors);
  for(let i=0;i<34;i++){
    const side=i%2?1:-1,t=.05+sample(i,621)*.82,u=side*(.66+sample(i,622)*.28);
    line(`stipe-fibre-${i}`,Array.from({length:9},(_,j)=>stemPoint(t+j/8*.08,u)),.27,.24,stem,[context]);
  }
  return {...out,title:'Longitudinal cut'};
}

function fieldPlateBodyCut(genome,recipe){
  const out=fieldPlateRecorder(genome,recipe,'longitudinal-cut'),{line,wash}=out,v=genome.values,kind=fieldPlateKind(genome);
  const oval=(cx,cy,rx,ry,n=80)=>Array.from({length:n},(_,i)=>[cx+Math.cos(i/n*TAU)*rx,cy+Math.sin(i/n*TAU)*ry]);
  if(kind==='morel'){
    const g=buildGeometry(genome),w=g.w,h=g.h,l=g.length??(-g.cy),s=g.stemWidth;
    const contour=(inset=0)=>{
      const ww=w-inset,ss=Math.max(4,s-inset*.5),top=-l-h+inset;
      const crown=Array.from({length:65},(_,i)=>{const a=Math.PI+i/64*Math.PI;return[Math.cos(a)*ww, -l+Math.sin(a)*(h-inset)];});
      return [[-ss,-inset],[-ss,-l+inset],[-ww,-l],...crown,[ww,-l],[ss,-l+inset],[ss,-inset]];
    };
    const shell=contour(),cavity=contour(7+v[8]*5);
    line('outer-wall',[...shell,shell[0]],.61,.58);line('inner-wall',[...cavity,cavity[0]],.4,.35);
    wash('cut-wall',shell,FIELD_PLATE_FLESH,.065,[cavity]);
    // A broad, very pale cavity edge glaze; leave the central lumen as paper.
    for(let i=0;i<23;i++){
      const a=Math.PI+(i+.4)/23*Math.PI,p=[Math.cos(a)*(w-2),-l+Math.sin(a)*(h-2)];
      line(`wall-cut-${i}`,[p,[p[0]*.91,p[1]+3+sample(i,625)*3]],.35,.28,shell,[cavity]);
    }
    return {...out,title:'Longitudinal cut · hollow body'};
  }
  if(kind==='puffball'){
    const w=87+v[0]*29,h=205+v[1]*57;
    const body=Array.from({length:101},(_,i)=>{const a=i/100*TAU,r=1+.025*Math.sin(a*3+recipe.phase);return[Math.cos(a)*w*r*(.73+.27*(1-Math.sin(a))*.5),-h*.5+Math.sin(a)*h*.5*r];});
    const base=curve([-w*.48,-h*.23],[-w*.19,-h*.28],[w*.17,-h*.20],[w*.48,-h*.24],24);
    line('peridium',[...body,body[0]],.63,.56);line('sterile-base-boundary',base,.36,.31,body);
    wash('enclosed-flesh',body,FIELD_PLATE_FLESH,.045);
    // A pale immature tissue cut: no empty cap-shaped cavity, no hidden gills,
    // no mature powder color inferred from the exterior palette.
    const core=oval(0,-h*.59,w*.56,h*.25);
    wash('gleba-shadow',core,FIELD_PLATE_NEUTRAL,.025);
    for(let i=0;i<42;i++){
      const a=sample(i,627)*TAU,r=Math.sqrt(sample(i,628)),x=Math.cos(a)*w*.55*r,y=-h*.57+Math.sin(a)*h*.26*r;
      line(`tissue-${i}`,curve([x,y],[x+.8,y-1],[x+2,y-.4],[x+2.7,y+.4],4),.25,.18,body);
    }
    return {...out,title:'Longitudinal cut · enclosed tissue'};
  }
  if(kind==='coral'){
    const w=35+v[8]*14,h=178+v[1]*35,spread=58+v[5]*31;
    const body=[[-w*.38,0],[-w*.52,-h*.43],[-spread-w*.30,-h*.93],[-spread+w*.08,-h],[-w*.13,-h*.59],[0,-h*.70],[spread-w*.08,-h],[spread+w*.30,-h*.94],[w*.52,-h*.43],[w*.38,0]];
    line('branch-cut-edge',[...body,body[0]],.62,.55);wash('branch-flesh',body,FIELD_PLATE_FLESH,.052);
    for(let i=0;i<18;i++){
      const u=(i/17-.5)*w*.53,side=i%2?1:-1;
      line(`branch-fibre-${i}`,curve([u,-8],[u,-h*.35],[side*spread*.55,-h*.72],[side*spread,-h*.94],22),.29,.24,body);
    }
    return {...out,title:'Branch cut · solid context'};
  }
  if(kind==='lateral'){
    const w=175+v[0]*45,rise=30+v[1]*37,depth=7+v[17]*16;
    const top=curve([-w*.8,0],[-w*.2,-rise*1.5],[w*.6,-rise],[w,0],64);
    const roof=top.map(([x,y],i)=>[x,y+depth*Math.sin(Math.PI*i/64)**.35]);
    const tissue=[...top,...roof.slice().reverse()];line('shelf-upper',top,.62,.57);line('shelf-lower',roof,.48,.43);
    wash('shelf-context',tissue,FIELD_PLATE_FLESH,.06);
    const pore=fieldPlateHymenium(genome)==='pores';
    for(let i=0;i<38;i++){
      const t=(i+.4)/38,k=Math.min(63,Math.floor(t*64)),p=roof[k],d=(pore?8:13)*Math.sin(Math.PI*t);
      line(`shelf-hymenium-${i}`,[[p[0],p[1]],[p[0]+(pore?0:-d*.4),p[1]+d]],.35,.36);
    }
    return {...out,title:pore?'Shelf section · tube layer':'Shelf section · gill tissue'};
  }
  return {...out,title:'No section for this form'};
}

function fieldPlateSurfaceStudy(genome,recipe,deposit=false){
  const slot=deposit?'spore-deposit':'hymenium-detail',out=fieldPlateRecorder(genome,recipe,slot),{line,wash}=out;
  const kind=fieldPlateKind(genome),hymenium=fieldPlateHymenium(genome),v=genome.values;
  const count=deposit?recipe.counts.deposit:recipe.counts.detail;
  const oval=(x,y,rx,ry,n=24)=>Array.from({length:n},(_,i)=>[x+Math.cos(i/n*TAU)*rx,y+Math.sin(i/n*TAU)*ry]);
  if(kind==='coral'||kind==='puffball'){
    const cut=fieldPlateBodyCut(genome,recipe);
    return {...cut,ink:cut.ink.map(m=>({...m,fieldPlateId:m.fieldPlateId.replace('longitudinal-cut',slot),studyRole:slot})),
      washes:cut.washes.map(m=>({...m,fieldPlateId:m.fieldPlateId.replace('longitudinal-cut',slot),studyRole:slot})),
      title:kind==='coral'?'Branch tissue detail':'Enclosed tissue detail'};
  }
  if(kind==='morel'){
    const outer=oval(0,0,100,76);line('surface-boundary',outer,.45,.3);
    wash('pit-context',outer,FIELD_PLATE_FLESH,.04);
    for(const [i,cell] of MOREL_CELLS.entries()){
      const p=cell.map(([x,y])=>[x*96,(y-.5)*145]);line(`pit-wall-${i}`,[...p,p[0]],.48,.42,outer);
    }
    return {...out,title:'Pit and ridge detail'};
  }
  const lateral=kind==='lateral',phase=v[35]*TAU,capShape=genome.phenotype?.capShape;
  const rim=Array.from({length:97},(_,i)=>{
    const a=i/96*TAU;
    // Shape variation follows the same cap traits as the standing body. The
    // seed fixes samples; changing the traits moves the same perimeter points.
    const r=1+(.012+v[4]*.045)*Math.sin(a*3+phase)+(.008+v[20]*.018)*Math.sin(a*7-phase)
      +(capShape==='lobed'?.055*Math.sin(a*5+phase):0)+(v[5]-.5)*.08*Math.cos(a);
    return[Math.cos(a)*100*r+(lateral?12*Math.cos(a*2):0),Math.sin(a)*(lateral?72:100)*r];
  });
  const hub=[lateral?-77:(v[5]-.5)*15,lateral?7:0],hole=oval(hub[0],hub[1],lateral?8:13,lateral?6:10);
  if(!deposit){line('rim',rim,.54,.48);line('attachment',hole,.38,.33);wash('underside-context',rim,FIELD_PLATE_FLESH,.04,[hole]);}
  const islands=[];
  for(let i=0;i<count;i++){
    const theta=(i+.18+sample(i,631)*.48)/count*TAU;
    if(hymenium==='pores'||hymenium==='teeth'){
      // Area-distributed points represent pores/deposition; never radial spokes.
      const a=i*2.399963229728653,r=.17+.79*Math.sqrt((i+.5)/count),x=Math.cos(a)*95*r,y=Math.sin(a)*(lateral?68:95)*r;
      const p=oval(x,y,deposit?1.9:1.4,deposit?1.4:1.05,10);
      if(deposit)islands.push(p);else line(`pore-${i}`,p,.34,.3+sample(i,632)*.13,rim,[hole]);
    }else{
      const edge=rim[Math.min(95,Math.floor(theta/TAU*96))],short=i%4===0?.48:i%4===1?.29:.13;
      const a=[mix(hub[0],edge[0],short),mix(hub[1],edge[1],short)],bend=(sample(i,633)-.5)*5;
      const p=curve(a,[mix(a[0],edge[0],.32)+bend,mix(a[1],edge[1],.32)],
        [mix(a[0],edge[0],.75)+bend,mix(a[1],edge[1],.77)],edge,18);
      if(deposit){
        const dx=edge[0]-a[0],dy=edge[1]-a[1],n=Math.hypot(dx,dy)||1,w=.28+sample(i,634)*.34;
        islands.push([...p.map(([x,y])=>[x-dy/n*w,y+dx/n*w]),...p.slice().reverse().map(([x,y])=>[x+dy/n*w,y-dx/n*w])]);
      }else line(`lamella-${i}`,p,hymenium==='folds'?.88:.41,.28+sample(i,635)*.16,rim,[hole]);
    }
  }
  if(deposit)wash('deposit-tone',rim,FIELD_PLATE_NEUTRAL,.068,[hole],islands);
  return {...out,title:deposit?'Spore print':hymenium==='pores'?'Pore surface detail':hymenium==='teeth'?'Toothed surface detail':hymenium==='folds'?'Folded underside detail':'Underside detail'};
}

// This transform is deliberately limited to the NEW plain section records.
// It must not be applied to adult geometry with native material meshes.
function fieldPlatePlace(plan,box,maxArea=Infinity,maxScale=Infinity){
  const all=[...plan.ink.map(m=>m.points),...plan.washes.map(m=>m.shape)].flat();
  if(!all.length)return plan;
  const b=bounds(all),scale=Math.min(box.w/Math.max(1,b.w),box.h/Math.max(1,b.h),Math.sqrt(maxArea/Math.max(1,b.w*b.h)),maxScale),memo=new Map();
  const map=points=>{
    if(!points)return points;
    if(!memo.has(points))memo.set(points,points.map(([x,y])=>[box.x+box.w*.5+(x-b.x-b.w*.5)*scale,box.y+box.h*.5+(y-b.y-b.h*.5)*scale]));
    return memo.get(points);
  };
  return {...plan,placedBounds:{x:box.x+(box.w-b.w*scale)*.5,y:box.y+(box.h-b.h*scale)*.5,w:b.w*scale,h:b.h*scale},ink:plan.ink.map(m=>({...m,points:map(m.points),width:m.width*scale,clip:map(m.clip),exclude:m.exclude?.map(map)})),
    washes:plan.washes.map(m=>({...m,shape:map(m.shape),points:map(m.points),width:m.width*scale,reserves:m.reserves?.map(map),islands:m.islands?.map(map)}))};
}

// Connected sections use precisely the same intrinsic chart as the whole body.
// A section is the x/z meridian: no projected camera ellipse is substituted.
function fieldPlateConnectedCut(genome,recipe,p,chart){
  const out=fieldPlateRecorder(genome,recipe,'longitudinal-cut'),{line,wash}=out;
  const paper=q=>[q[0],-q[2]],left=Array.from({length:41},(_,i)=>paper(chart.upper(Math.PI,1-i/40))),right=Array.from({length:41},(_,i)=>paper(chart.upper(0,i/40)));
  const center=[(left.at(-1)[0]+right[0][0])*.5,-p.height-p.thickness-p.dome-p.crest];
  const top=[...left,center,...right],roofLeft=Array.from({length:41},(_,i)=>paper(chart.lower(Math.PI,1-i/40))),roofRight=Array.from({length:41},(_,i)=>paper(chart.lower(0,i/40)));
  const roof=[...roofLeft,...roofRight],context=[...top,...roof.slice().reverse()];
  const stemLeft=Array.from({length:65},(_,i)=>paper(chart.stem(Math.PI,i/64))),stemRight=Array.from({length:65},(_,i)=>paper(chart.stem(0,i/64))),stem=[...stemLeft,...stemRight.slice().reverse()];
  line('stipe-left',stemLeft,.55,.48,null,[context]);line('stipe-right',stemRight,.65,.58,null,[context]);line('cap-cut-edge',top,.60,.55);
  wash('stipe-flesh',stem,FIELD_PLATE_FLESH,.045,[context]);wash('cap-context',context,FIELD_PLATE_FLESH,.045);
  wash('cuticle',[...top,...top.slice().reverse().map(([x,y])=>[x,y+1.5])],genome.fieldPlatePalette??TYPE_PALETTES[genome.phenotype?.palette]??TYPE_PALETTES.chestnut,.14);
  const sectors=[];
  for(const side of [-1,1]){
    const theta=side<0?Math.PI:0,start=.035+.035*p.ring;
    const upper=Array.from({length:41},(_,i)=>paper(chart.lower(theta,mix(start,1,i/40))));
    const lower=upper.map(([x,y],i)=>[x,y+(6+14*p.pores+5*p.teeth+3*p.fold)*Math.sin(Math.PI*i/40)**.45]);
    const sector=[...upper,...lower.slice().reverse()];sectors.push(sector);line(`hymenium-edge-${side}`,lower,.42,.42);
    for(let i=0;i<34;i++){
      const s=(i+.38)/34,q=paper(chart.lower(theta,mix(start,1,s))),d=(6+14*p.pores+5*p.teeth+3*p.fold)*Math.sin(Math.PI*s)**.45;
      const mark=Array.from({length:7},(_,j)=>{const u=j/6;return [q[0]+side*d*.25*p.fold*u+Math.sin(u*Math.PI)*p.teeth*1.2,q[1]+d*u];});
      line(`hymenium-${side}-${i}`,mark,.33+.38*p.fold,.33,sector);
    }
  }
  const b=bounds(sectors.flat());wash('hymenium',[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]],FIELD_PLATE_NEUTRAL,.065,[],sectors);
  for(let i=0;i<26;i++){
    const side=i%2?1:-1,theta=side<0?Math.PI:0,t=.035+sample(i,621)*.82;
    line(`stipe-fibre-${i}`,Array.from({length:9},(_,j)=>{const q=paper(chart.stem(theta,t+j/8*.10));q[0]-=side*(2+sample(i,622)*2);return q;}),.26,.22,stem,[context]);
  }
  return {...out,title:'Longitudinal cut'};
}
function fieldPlateConnectedSurface(genome,recipe,p,chart,deposit=false){
  const out=fieldPlateRecorder(genome,recipe,deposit?'spore-deposit':'hymenium-detail'),{line,wash}=out;
  const flat=q=>[q[0],q[1]],rim=Array.from({length:97},(_,i)=>flat(chart.lower(i/96*TAU,1))),hole=Array.from({length:49},(_,i)=>flat(chart.lower(i/48*TAU,0)));
  const count=deposit?recipe.counts.deposit:recipe.counts.detail,islands=[];
  if(!deposit){line('rim',rim,.54,.44);line('attachment',hole,.36,.30);wash('underside-context',rim,FIELD_PLATE_FLESH,.035,[hole]);}
  for(let i=0;i<count;i++){
    const theta=(i+.18+sample(i,631)*.48)/count*TAU,short=i%4===0?.48:i%4===1?.29:.045;
    const a=i*2.399963229728653,r=.12+.82*Math.sqrt((i+.5)/count),q=flat(chart.lower(a,r));
    // A persistent sampled stroke changes its intrinsic form from blade/fold
    // to pore loop. The transition is a fictional continuous surface study.
    const pts=Array.from({length:19},(_,j)=>{
      const t=j/18,s=mix(short,1,t),fork=(i%3===0?1:0)*p.fold*Math.max(0,s-.55)*.11;
      const g=flat(chart.lower(theta+fork+(sample(i,633)-.5)*.015*Math.sin(t*Math.PI),s));
      const pore=[q[0]+Math.cos(t*TAU)*p.radius*.014,q[1]+Math.sin(t*TAU)*p.radius*.011*p.capDepth];
      const tooth=[q[0]+Math.sin(t*TAU)*p.radius*.010*(.3+.7*Math.sin(t*Math.PI)),q[1]+(1-Math.cos(t*TAU))*p.radius*.022];
      return [mix(mix(g[0],pore[0],p.pores),tooth[0],p.teeth),mix(mix(g[1],pore[1],p.pores),tooth[1],p.teeth)];
    });
    if(deposit){
      const w=.30+sample(i,634)*.27;
      islands.push([...pts.map(([x,y],j)=>{const a=pts[Math.max(0,j-1)],b=pts[Math.min(18,j+1)],d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return[x-(b[1]-a[1])/d*w,y+(b[0]-a[0])/d*w];}),...pts.slice().reverse().map(([x,y],k)=>{const j=18-k,a=pts[Math.max(0,j-1)],b=pts[Math.min(18,j+1)],d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return[x+(b[1]-a[1])/d*w,y-(b[0]-a[0])/d*w];})]);
    }else line(`surface-${i}`,pts,.38+.36*p.fold,.29+sample(i,635)*.13,rim,[hole]);
  }
  if(deposit)wash('deposit-tone',rim,FIELD_PLATE_NEUTRAL,.06,[hole],islands);
  return {...out,title:deposit?'Spore print':'Underside detail'};
}

// Field-study anatomy (plate=1). Every supporting figure is drawn from the
// habit's own dominant specimen: the same individual genome, cap profile,
// stem taper, bend and member stretch, so the section matches the habit.
// Figures: 2 a true median longitudinal section, 3 the underside seen
// obliquely from below, 4 a spore print with the cap outline, 5 spores and
// a basidium drawn small. Ink first, then pale connected washes, then local
// glazes; all marks are native wash and pen records (no raster icons).
const FIELD_ANATOMY_DEFAULT=Object.freeze({ctx:.32,attach:'adnate',gap:0,gill:.16,stem:'stuffed',ring:false,base:'none',gills:'pale',flesh:'white',spore:'white',spores:'ellipsoid',sporeSize:1,tiers:2,forks:0,latex:false,umbo:false,surface:null,margin:null});
export function fieldPlateAnatomy(genome){
  const p=genome.phenotype??{},grammar=p.grammar??genome.family,variant=p.variant??0,veil=p.veil??'none';
  const by={
    amanita:{ctx:.36,attach:'free',gap:.05,gill:.15,stem:'stuffed',ring:veil==='ring'||veil==='boot',base:veil==='sac'||veil==='boot'||variant===2?'volva':'bulb',spores:'globose',surface:p.surface==='warts'?'warts':null},
    parasol:{ctx:.1,umbo:true,attach:'free',gap:.11,gill:.12,stem:'hollow',ring:'double',base:'bulb',spores:'pore',sporeSize:1.45,surface:'scales'},
    inkcap:{ctx:.06,attach:'free',gap:.03,gill:.42,stem:'hollow',ring:'low',gills:'ink',spore:'black',spores:'pore',sporeSize:1.15,surface:'shaggy'},
    agaric:variant===3?{ctx:.3,attach:'decurrent',gill:.14,stem:'stuffed',spore:'white',gills:'pale',surface:'scales-fine'}:{ctx:.32,attach:'adnate',gill:.17,stem:'stuffed',gills:'brown',spore:'brown',sporeSize:1.1},
    waxcap:{ctx:.28,attach:'adnate',gill:.22,stem:'hollow',flesh:'cap',gills:'cap',tiers:1,distant:true},
    milkcap:{ctx:.38,attach:'decurrent',gill:.12,stem:'chambered',latex:true,spore:'cream',spores:'warted',forks:.18,margin:'woolly',tiers:3},
    hedgehog:{ctx:.44,attach:'teeth',gill:.12,stem:'solid',gills:'teeth',spores:'globose',flesh:'cream'},
    bolete:{ctx:.42,attach:'tubes',gill:.27,stem:'solid',gills:'tubes',spore:'olive',spores:'fusiform',sporeSize:1.35},
    bonnet:{ctx:.12,attach:'adnexed',gill:.3,stem:'hollow',spores:'ellipsoid'},
    chanterelle:{ctx:.4,attach:'decurrent',gill:.06,stem:'solid',flesh:'cap',gills:'cap',spore:'ochre',tiers:0,forks:.5},
    puffball:{spore:'olive',spores:'warted',sporeSize:.7,attach:'none'},earthstar:{spore:'brown',spores:'warted',sporeSize:.75,attach:'none'},
    coral:{spore:'ochre',spores:'warted',attach:'none'},morel:{spore:'ochre',spores:'ellipsoid',sporeSize:1.6,attach:'none'},
    stinkhorn:{spore:'olive',spores:'ellipsoid',sporeSize:.6,attach:'none'},tooth:{spores:'globose',sporeSize:.8,attach:'teeth'},
    bracket:{spores:'ellipsoid',attach:'tubes'},oyster:{spore:'white',spores:'ellipsoid',sporeSize:1.2},
  };
  const own={grammar,variant,...FIELD_ANATOMY_DEFAULT,...(by[grammar]??{})},src=p.sources;
  if(!src)return own;
  // A hybrid is sectioned through what it inherited: the donor's hymenium
  // (with its spores), the donor's veil and stipe base, the donor's cap relief.
  const of=id=>{const t=TYPES_BY_ID.get(id);return t?fieldPlateAnatomy({...genome,phenotype:{...t}}):own;};
  const out={...own};
  if(src.hymenium&&src.hymenium!==src.form){const d=of(src.hymenium);for(const k of ['attach','gap','gill','gills','spore','spores','sporeSize','tiers','forks','distant','latex'])out[k]=d[k];
    if(out.attach==='free'&&own.attach!=='free')out.gap=.05;}
  if(src.stem&&src.stem!==src.form){const d=of(src.stem);out.ring=d.ring;out.base=d.base;out.stem=d.stem;}
  if(src.surface&&src.surface!==src.form)out.surface=of(src.surface).surface??({warts:'warts',scales:'scales',tiles:'scales',shaggy:'shaggy'}[p.surface]??null);
  if(src.colour&&src.colour!==src.form&&own.flesh==='cap')out.flesh='white';
  return out;
}
const FIELD_FLESH_WHITE=Object.freeze({ochre:.46,umber:.2,paynes:.34});
const FIELD_GILL_TONES=Object.freeze({pale:[{ochre:.36,umber:.22,paynes:.42},.075],brown:[{umber:.56,sienna:.3,paynes:.14},.13],
  tubes:[{ochre:.42,sapgreen:.3,hansa:.28},.12],teeth:[{ochre:.62,sienna:.24,umber:.14},.09],ink:[{rose:.34,ochre:.3,paynes:.36},.06]});
const FIELD_SPORE_TONES=Object.freeze({white:{palette:{ochre:.5,umber:.22,paynes:.28},load:.11},cream:{palette:{ochre:.66,hansa:.2,umber:.14},load:.12},
  brown:{palette:{umber:.56,paynes:.2,ochre:.24},load:.17},black:{palette:{paynes:.6,indigo:.25,umber:.15},load:.26},
  olive:{palette:{umber:.46,sapgreen:.34,ochre:.2},load:.17},ochre:{palette:{ochre:.6,sienna:.22,rose:.18},load:.11}});
const FIELD_SHADE=Object.freeze({paynes:.48,umber:.32,ochre:.2});
const fieldCapPalette=genome=>genome.fieldPlatePalette??TYPE_PALETTES[genome.phenotype?.palette]??TYPE_PALETTES.chestnut;
const fpOffset=(pts,d)=>pts.map((p,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy)||1;return[p[0]-dy/n*d,p[1]+dx/n*d];});
const fpOval=(cx,cy,rx,ry,n=40,rot=0,wob=null)=>Array.from({length:n},(_,i)=>{const a=i/n*TAU,k=wob?1+wob(a):1,x=Math.cos(a)*rx*k,y=Math.sin(a)*ry*k;return[cx+x*Math.cos(rot)-y*Math.sin(rot),cy+x*Math.sin(rot)+y*Math.cos(rot)];});
const fpBox=pts=>{const b=bounds(pts);return [[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]];};

// The dominant adult of the habit study (buildStudy's largest mature unit),
// with the member stretch the plate blocking gave it.
export function fieldPlateSpecimen(genome,recipe,composition=null){
  const habit=genome.phenotype?.habit??'pair';
  const [index,count,unitScale]=habit==='solitary'?[0,1,1.65]:habit==='troop'?[1,3,1.25]:habit==='cluster'?[1,4,1.45]:[1,2,1.65];
  const local=count>1?individualGenome(genome,index,count):genome,g=buildGeometry(local);
  const anchor=composition?.implicitAnchors?.[index]??null,stretch=clamp(anchor?.stretch??1,.8,1.25);
  const n=g.top.length-1,a=g.top[0],b=g.top[n];
  const heights=g.top.map(([,y],i)=>mix(a[1],b[1],i/n)-y);
  const H=u=>{const f=(clamp(u,-1,1)+1)*n/2,i=Math.min(n-1,Math.floor(f));return mix(heights[i],heights[i+1],f-i);};
  return {local,g,unitScale,stretch,H,Hs:Math.max(8,...heights.map(Math.abs)),R:g.w*stretch,values:local.values};
}

// Shared cap anatomy in section coordinates (foot at 0, y down).
function fieldCapFrame(spec,A){
  const {g,Hs,R}=spec,L=g.length,yM=-L,cx=g.cx,mt=Math.max(1.6,R*.022);
  // A parasol keeps its raised umbo in section, solid flesh under it.
  const H=u=>spec.H(u)+(A.umbo?Hs*.2*Math.exp(-u*u/.012):0);
  const th=u=>{const s=Math.abs(u);const t=mt+Hs*A.ctx*Math.pow(Math.max(0,1-s**1.7),.8)+(A.umbo?Hs*.32*Math.exp(-u*u/.02):0);return H(u)>0?Math.min(t,H(u)*.94+mt):t;};
  const top=u=>[cx+u*R,yM-H(u)],roof=u=>[cx+u*R,yM-H(u)+th(u)];
  const stemHalf=t=>{let w=g.halfAt(clamp(t))*spec.stretch;if(A.base==='bulb'&&A.grammar==='parasol')w*=1+.55*Math.exp(-(((t-.05)/.09)**2));return w;};
  const sTop=stemHalf(spec.g.family==='chanterelle'?.86:1),s0=A.attach==='free'?Math.min(.5,sTop/R+A.gap):Math.min(.45,sTop/R+.004);
  const Dmax=A.gill*R;
  const D=s=>{const q=clamp((s-s0)/(1-s0));
    if(A.attach==='free')return Dmax*Math.pow(Math.max(0,Math.sin(Math.PI*q)),.5)*(1-.25*q);
    if(A.attach==='tubes')return Dmax*Math.pow(Math.max(0,1-q**5),.5)*(.4+.6*smooth(Math.min(1,q/.14)));
    if(A.attach==='adnexed')return Dmax*Math.pow(Math.max(0,Math.sin(Math.PI*(.18+.82*q))),.5);
    return Dmax*Math.pow(Math.max(0,1-q**2.3),.55);
  };
  const roof0=roof(0)[1];
  const axis=y=>{const t=-y/L;return t<=1?g.centerAt(Math.max(0,t)):cx;};
  return {L,yM,cx,mt,th,top,roof,stemHalf,sTop,s0,Dmax,D,roof0,axis,R,Hs,H};
}
function fieldRoofNormal(F,u){const e=.004,a=F.roof(u-e),b=F.roof(u+e),dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy)||1;return[-dy/n,dx/n];}

function fieldCapSection(genome,recipe,spec,A){
  const out=fieldPlateRecorder(genome,recipe,'longitudinal-cut'),{line,wash}=out,v=spec.values,F=fieldCapFrame(spec,A),{R,cx,yM,mt,roof0}=F;
  const capPal=fieldCapPalette(genome),fleshPal=A.flesh==='cap'?capPal:A.flesh==='cream'?{ochre:.6,umber:.18,paynes:.22}:FIELD_FLESH_WHITE;
  const us=Array.from({length:97},(_,i)=>i/48-1),top=us.map(F.top),roofLine=us.map(F.roof);
  const context=[...top,...roofLine.slice().reverse()];
  const ct=Math.max(2.2,F.Hs*.06),cuticle=[...top,...fpOffset(top,-ct).reverse()];
  // Stem: from the foot into the cap context, same taper and bend as the habit.
  // A tall, slender specimen is cut off below the cap, as plates draw a cap
  // section: the stipe ends in a broken cut, so the cap anatomy reads larger.
  const width=2*R,height=-roof0+F.Hs,keep=Math.max(.32*F.L,1.12*width-(height-F.L)),cropped=height>1.6*width&&keep<F.L*.9,yB=cropped?-(F.L-keep):0;
  // The stipe is one tissue with the cap flesh: its sides sweep out in a
  // fillet and meet the underside of the context, with no seam across.
  const yJ=F.roof(F.sTop/R)[1],fil=4+R*.035;
  const half=y=>{const t=-y/F.L;let w=F.stemHalf(Math.min(1,t));const d=Math.max(0,y-yJ);w+=fil*Math.exp(-d/(5+R*.03));return w;};
  const uj=Math.min(F.s0-.01,half(yJ)/R),K=56,stemY=k=>mix(yB,F.roof(uj)[1],k/K);
  const left=Array.from({length:K+1},(_,k)=>{const y=stemY(k);return[F.axis(y)-half(y),y];}),right=Array.from({length:K+1},(_,k)=>{const y=stemY(k);return[F.axis(y)+half(y),y];});
  const w0=half(yB),foot=cropped?Array.from({length:9},(_,i)=>{const x=F.axis(yB)+mix(w0,-w0,i/8);return[x,yB+(i%2?1.6:-.4)*(.6+.6*sample(i,656))];}):Array.from({length:9},(_,i)=>{const a=i/8*Math.PI;return[F.axis(0)+Math.cos(a)*w0,Math.sin(a)*w0*.3];});
  const stem=[...left,...right.slice().reverse(),...foot];
  const roofSpan=(a,b,n=16)=>Array.from({length:n+1},(_,i)=>F.roof(mix(a,b,i/n)));
  const flesh=[...top,...roofSpan(1,uj,40),...right.slice().reverse(),...foot,...left,...roofSpan(-uj,-1,40)];
  line('stipe-left',left,.6,.55);line('stipe-right',right,.72,.62);line('stipe-foot',foot,.62,.5);
  for(const side of [-1,1])line(`context-under-${side}`,roofSpan(side*uj,side*F.s0,8),.4,.45);
  line('cap-cut-edge',top,.7,.66);
  // Gill (tube/tooth) layer, both halves of the meridian.
  const panels=[],edges=[];
  const gillPal=A.gills==='cap'?[capPal,.06]:FIELD_GILL_TONES[A.gills]??FIELD_GILL_TONES.pale;
  for(const side of [-1,1]){
    const n=40,ss=Array.from({length:n+1},(_,i)=>mix(F.s0,1,i/n));
    const rootPts=ss.map(s=>F.roof(side*s)),edge=ss.map((s,i)=>{const r=rootPts[i],nn=fieldRoofNormal(F,side*s),d=F.D(s);let p=[r[0]+nn[0]*d,r[1]+nn[1]*d];
      if(A.attach==='free'&&side*(p[0]-cx)<F.sTop+R*A.gap*.6)p=[cx+side*(F.sTop+R*A.gap*.6),p[1]];return p;});
    if(A.attach==='teeth'){
      for(let k=0;k<15;k++){
        const s=mix(F.s0+.03,.97,(k+.3+sample(k+side*17,640)*.4)/15),r=F.roof(side*s),len=F.Dmax*(.55+.45*Math.sin(Math.PI*clamp((s-F.s0)/(1-F.s0))))*(.85+.3*sample(k,641)),wd=R*.016*(.8+.4*sample(k,642));
        const tip=[r[0]+side*len*.12,r[1]+len],tooth=[[r[0]-wd,r[1]-.5],tip,[r[0]+wd,r[1]-.5]];panels.push(tooth);
        line(`tooth-${side}-${k}`,[tooth[0],tooth[1]],.36,.5);line(`tooth-b-${side}-${k}`,[tooth[1],tooth[2]],.3,.35);
      }
      continue;
    }
    const panel=[...rootPts,...edge.slice().reverse()];panels.push(panel);edges.push(edge);
    line(`hymenium-edge-${side}`,edge,.5,.52);line(`hymenium-root-${side}`,rootPts,.32,.3,null,[]);
    if(A.attach==='tubes'){
      for(let i=0;i<34;i++){const j=Math.round((i+.5)/34*n),a=rootPts[j],b=edge[j];line(`tube-${side}-${i}`,[[mix(a[0],b[0],.04),mix(a[1],b[1],.04)],[mix(a[0],b[0],.97),mix(a[1],b[1],.97)]],.24,.24+.1*sample(i,643),panel);}
    }else{
      // Individual blades behind the cut, each in profile: the next full gill
      // and the lamellulae between, short ones starting nearer the margin.
      const blades=A.distant?[[F.s0+.02,.86,.5],[.5+.06*sample(side,658),.62,.42]]:[[F.s0+.015,.9,.42],[.36+.05*sample(side,658),.74,.36],[.58+.05*sample(side+2,658),.56,.34],[.76+.04*sample(side+4,658),.4,.3],[F.s0+.03,.8,.3]];
      for(const [k,[start,fac,wt]] of blades.entries()){
        const sb=ss.filter(s=>s>=start),rb=sb.map(s=>F.roof(side*s)),eb=sb.map((s,i)=>{const r=rb[i],nn=fieldRoofNormal(F,side*s),d=F.D(s)*fac*smooth(Math.min(1,(s-start)/.07+.15))*(1+.05*Math.sin(s*29+k*3+side));return[r[0]+nn[0]*d,r[1]+nn[1]*d];});
        if(eb.length<3)continue;line(`blade-${side}-${k}`,eb,A.distant?wt+.12:wt,A.distant?.55:.42+.1*sample(k+side,660),panel);
        out.blades=(out.blades??[]).concat([[...rb,...eb.slice().reverse()]]);
      }
      // Thick waxy gills keep a light, glossy band along each blade.
      if(A.distant){const a=ss.slice(4,34).map((s,i)=>{const r=rootPts[i+4],e=edge[i+4];return[mix(r[0],e[0],.44),mix(r[1],e[1],.44)];}),b=ss.slice(4,34).map((s,i)=>{const r=rootPts[i+4],e=edge[i+4];return[mix(r[0],e[0],.54),mix(r[1],e[1],.54)];});out.gloss=(out.gloss??[]).concat([[...a,...b.reverse()]]);}
    }
    if(A.attach==='decurrent'){
      // Decurrent folds continue down the stipe flank.
      const run=Array.from({length:14},(_,k)=>{const y=roof0+F.th(0)*.1+k*(F.L*.012+2);return y;}),d0=F.D(F.s0)*.7;
      const outer=run.map((y,k)=>[F.axis(y)+side*(half(y)+d0*(1-k/13)**1.4),y]),inner=run.map(y=>[F.axis(y)+side*half(y),y]);
      const strip=[...inner,...outer.slice().reverse()];panels.push(strip);line(`decurrent-${side}`,outer,.4,.42);
    }
  }
  // Stem interior: hollow, chambered, stuffed or solid flesh.
  const cavities=[];
  const cavity=(y0,y1,f)=>{const n=26,l=[],r=[];for(let i=0;i<=n;i++){const y=mix(y0,y1,i/n),w=half(y)*f*Math.pow(Math.max(0,Math.sin(Math.PI*i/n)),.35);l.push([F.axis(y)-w,y]);r.push([F.axis(y)+w,y]);}return[...l,...r.reverse()];};
  if(A.stem==='hollow'){const c=cavity(cropped?yB+1:-F.L*(A.grammar==='parasol'?.16:.1),roof0+F.th(0)*(A.grammar==='inkcap'?.05:.2),A.grammar==='parasol'?.5:.42);cavities.push(c);}
  if(A.stem==='chambered')for(let k=0;k<3;k++){const y0=-F.L*(.18+k*.26);if(y0>yB-4)continue;const y1=y0-F.L*(.16+.06*sample(k,644));cavities.push(cavity(y0,y1,.42+.1*sample(k,645)));}
  for(const [i,c] of cavities.entries()){line(`cavity-${i}`,[...c,c[0]],.4,.46);}
  if(A.grammar==='inkcap'&&cavities[0]){const c=cavities[0],b=bounds(c);line('cavity-thread',Array.from({length:12},(_,i)=>[b.x+b.w/2+Math.sin(i*.9+v[35]*6)*b.w*.08,mix(b.y+b.h*.06,b.y+b.h*.94,i/11)]),.25,.3);}
  let pith=null;
  if(A.stem==='stuffed'){pith=cavity(cropped?yB+1:-F.L*.12,roof0+F.th(0)*.15,.38);
    for(let i=0;i<16;i++){const y=mix(-F.L*.16,roof0+F.th(0)*.1,(i+.5)/16),x=F.axis(y)+(sample(i,646)-.5)*half(y)*.5;line(`pith-${i}`,curve([x,y],[x+2,y-3],[x-1.5,y-6],[x+1,y-9],5),.22,.18,pith);}}
  // Hyphal fibres run up the stipe and fan out through the cap flesh.
  for(let i=0;i<34;i++){
    const side=i%2?1:-1,f=.25+.65*sample(i,647),y0=mix(yB,yJ,.08+.6*sample(i,648)),uEnd=.3+.62*sample(i,649),g=.35+.4*sample(i,670);
    const mid=u=>{const a=F.top(u),b=F.roof(u);return[a[0],mix(a[1],b[1],g)];},end=mid(side*uEnd),turn=mid(side*(uj+.06));
    line(`stipe-fibre-${i}`,curve([F.axis(y0)+side*half(y0)*f,y0],[F.axis(yJ)+side*half(yJ)*f*.8,mix(y0,yJ,.8)],[turn[0],turn[1]+(yJ-turn[1])*.3],end,18),.28,.32,flesh,[...cavities,cuticle]);
  }
  for(let i=0;i<12;i++){
    // Context fibres follow the cap flesh from the crown toward the margin.
    const u=(sample(i,650)*2-1)*.9,f=.25+.5*sample(i,651),u2=u+(u<0?-1:1)*(.08+.1*sample(i,652));
    const p=uu=>{const a=F.top(uu),b=F.roof(uu);return[a[0],mix(a[1],b[1],f)];};line(`context-fibre-${i}`,[p(u),p((u+u2)/2),p(u2)],.24,.26,context);
  }
  // Ring, bulb and volva in section.
  if(A.ring){
    const tr=A.ring==='low'?.24:.72+v[13]*.07,y=-F.L*tr,x=F.axis(y),w=half(y);if(y<yB-8)
    for(const side of [-1,1]){
      const e=x+side*w;let skirt;
      if(A.ring==='double'){const o=w*.7+4;skirt=[[e+side*.8,y-13],[e+side*o*.5,y-14],[e+side*o,y-9],[e+side*o*.65,y-4],[e+side*o*.55,y+6],[e+side*o*.9,y+12],[e+side*o*.45,y+15],[e+side*.8,y+14]];line(`ring-gap-${side}`,[[e+side*.8,y-13],[e+side*.8,y+14]],.24,.4);}
      else{const a=curve([e,y],[e+side*(w*.5+4),y+3],[e+side*(w*.7+6),y+9],[e+side*(w*.6+5),y+17],8);skirt=[...a,...fpOffset(a,side*1.8).reverse()];}
      line(`ring-${side}`,[...skirt,skirt[0]],.42,.5);out.ringShapes=(out.ringShapes??[]).concat([skirt]);
    }
  }
  if(A.base==='volva'&&!cropped){
    for(const side of [-1,1]){
      const pts=Array.from({length:14},(_,k)=>{const t=k/13*.24,y=-F.L*t;return[F.axis(y)+side*(half(y)+3+2.5*Math.sin(k*.7)+(k>10?(k-10)*1.6:0)),y+2];});
      const sac=[...pts,...fpOffset(pts,side*-1.9).reverse()];line(`volva-${side}`,pts,.5,.5);line(`volva-inner-${side}`,fpOffset(pts,side*-1.9),.3,.35);out.ringShapes=(out.ringShapes??[]).concat([sac]);
    }
    line('volva-base',Array.from({length:11},(_,i)=>{const a=i/10*Math.PI;return[F.axis(0)+Math.cos(a)*(w0+4),2+Math.sin(a)*w0*.32];}),.5,.5);
  }
  if(A.base==='bulb'&&A.grammar==='amanita'&&!cropped){
    for(const side of [-1,1])for(let k=0;k<4;k++){const y=-F.L*(.05+k*.045),x=F.axis(y)+side*half(y);line(`bulb-wart-${side}-${k}`,curve([x,y-1.5],[x+side*2.5,y-1],[x+side*2.6,y+1],[x,y+1.8],5),.38,.45);}
  }
  // Cap surface ornament seen in profile.
  if(A.surface){
    const n=A.surface==='warts'?9:A.surface==='scales'?13:A.surface==='shaggy'?11:8;
    for(let k=0;k<n;k++){
      const u=-.92+1.84*(k+.5+.3*(sample(k,653)-.5))/n,p=F.top(u),nn=fieldRoofNormal(F,u),side=u<0?-1:1,sz=(A.surface==='warts'?R*.035:R*.03)*(.8+.4*sample(k,654));
      if(A.surface==='warts'){const s=[[p[0]-sz*.6,p[1]+.5],[p[0]-sz*.15,p[1]-sz*.8],[p[0]+sz*.25,p[1]-sz*.75],[p[0]+sz*.6,p[1]+.5]];line(`wart-${k}`,s,.38,.5);out.warts=(out.warts??[]).concat([s]);}
      else{const s=curve([p[0]-side*sz*.4,p[1]+.3],[p[0],p[1]-sz*.5],[p[0]+side*sz*.6,p[1]-sz*.4],[p[0]+side*sz*.9,p[1]+sz*.1],5);line(`scale-${k}`,s,.36,.5);}
    }
  }
  if(A.margin==='woolly')for(const side of [-1,1])for(let k=0;k<7;k++){const p=F.top(side*(.97-k*.012)),a=side*(.2+k*.15);line(`margin-wool-${side}-${k}`,[p,[p[0]+side*(3+sample(k,655)*3),p[1]+3+k*.6]],.25,.35);}
  // Washes: pale flesh first, then cuticle and gill layer, then local glazes.
  const ringShapes=out.ringShapes??[];
  wash('flesh',flesh,fleshPal,A.flesh==='white'?.085:.065,[cuticle,...cavities,...(pith?[pith]:[])]);
  if(pith)wash('stipe-pith',pith,fleshPal,.016,cavities);
  if(cavities.length){const c=cavities.flat();wash('stipe-cavity',fpBox(c),FIELD_SHADE,.08,[],cavities);}
  wash('cuticle',cuticle,capPal,genome.phenotype?.palette==='cream'?.1:.28);
  if(A.grammar==='amanita'&&genome.phenotype?.palette==='scarlet')wash('subcuticle',[...fpOffset(top,-ct),...fpOffset(top,-ct*2.6).reverse()],{hansa:.6,ochre:.4},.05);
  if(out.warts)wash('warts',fpBox(out.warts.flat()),{ochre:.4,umber:.2,paynes:.4},.03,[],out.warts);
  if(ringShapes.length)wash('veil',fpBox(ringShapes.flat()),{ochre:.5,umber:.2,paynes:.3},.03,[],ringShapes);
  if(panels.length){const pb=panels.flat();wash('hymenium',fpBox(pb),gillPal[0],Math.max(.1,gillPal[1]*1.3),out.gloss??[],panels);}
  // Stacked blades darken where they overlap: a dry glaze, so edges stay.
  if(out.blades?.length)wash('gill-blades',fpBox(out.blades.flat()),gillPal[0],Math.max(.07,gillPal[1]),out.gloss??[],out.blades);
  if(A.gills==='ink'&&edges.length){
    // Ripening gills blacken from the margin inward.
    const black=edges.map(e=>{const k=Math.floor(e.length*.55),seg=e.slice(k);return[...seg,...seg.slice().reverse().map(([x,y])=>[x+(x<cx?8:-8),y-14])];});
    wash('hymenium-black',fpBox(black.flat()),{paynes:.62,indigo:.22,umber:.16},.22,[],black.map((b,i)=>b));
  }
  if(A.attach==='tubes'){const under=[...roofLine.slice(20,77),...fpOffset(roofLine.slice(20,77),-mt*1.6).reverse()];wash('flesh-yellow',under,{hansa:.55,ochre:.45},.04);}
  // Soft shadow glaze along the stipe cortex and under the gill attachment.
  for(const side of [-1,1]){const band=Array.from({length:20},(_,k)=>{const y=mix(cropped?yB:-F.L*.04,roof0+4,k/19);return[F.axis(y)+side*half(y),y];});
    wash(`cortex-${side}`,[...band,...band.slice().reverse().map(([x,y])=>[x-side*half(y)*(side>0?.32:.18),y])],FIELD_SHADE,side>0?.035:.02,cavities);}
  if(A.latex)for(let k=0;k<5;k++){const s=mix(F.s0+.05,.8,k/4),side=k%2?1:-1,p=F.roof(side*s),drop=fpOval(p[0],p[1]+2.5,1.6,2.1,12);line(`latex-${k}`,[...drop,drop[0]],.3,.5);}
  return {...out,title:'Longitudinal cut'};
}

// The underside seen obliquely from below: gills (with lamellulae and
// forks), tubes and pores, or teeth, on the concave hymenophore, with the
// stipe cut short and the cap margin and crown rising beyond the far rim.
const FIELD_VIEW=Object.freeze({s:.6,c:.8});
function fieldCapUnderside(genome,recipe,spec,A){
  const out=fieldPlateRecorder(genome,recipe,'hymenium-detail'),{line,wash}=out,v=spec.values,F=fieldCapFrame(spec,A),{R,mt}=F;
  // Deep caps are seen more nearly from below, so the far wall stays inside the rim.
  const sv=Math.min(.9,FIELD_VIEW.s+.4*clamp(F.Hs/R-.3,0,1)),cv=Math.sqrt(1-sv*sv);
  const capPal=fieldCapPalette(genome),gillPal=A.gills==='cap'?[capPal,.06]:FIELD_GILL_TONES[A.gills]??FIELD_GILL_TONES.pale;
  const hr=s=>{const a=F.yM-F.roof(s)[1],b=F.yM-F.roof(-s)[1];return(a+b)/2;},ht=s=>(F.H(s)+F.H(-s))/2;
  const P=(s,th,h)=>[Math.cos(th)*s*R,Math.sin(th)*s*R*sv-h*cv];
  const wob=th=>1+(.012+v[4]*.03)*Math.sin(th*3+v[35]*TAU)+(.008+v[20]*.012)*Math.sin(th*7-v[35]*TAU);
  const rim=Array.from({length:97},(_,i)=>{const th=i/96*TAU;return P(wob(th),th,0);}),rimLow=Array.from({length:97},(_,i)=>{const th=i/96*TAU;return P(wob(th)*.985,th,-mt);});
  // Crown beyond the far rim: upper envelope of the cap's top surface.
  const bins=48,env=new Array(bins+1).fill(Infinity);
  for(let i=0;i<=20;i++)for(let j=0;j<72;j++){const s=i/20,th=j/72*TAU,p=P(s*wob(th),th,ht(s));const b=Math.round((p[0]/R+1)/2*bins);if(b>=0&&b<=bins)env[b]=Math.min(env[b],p[1]);}
  const farRim=x=>-Math.sqrt(Math.max(0,1-(x/R)**2))*R*sv;
  const crownTop=[],crownBase=[];for(let b=0;b<=bins;b++){const x=(b/bins*2-1)*R*.995;crownTop.push([x,Math.min(env[b],farRim(x))]);crownBase.push([x,farRim(x)]);}
  const crownLift=Math.max(...crownTop.map((p,i)=>crownBase[i][1]-p[1]));
  // The stipe, broken off a short way below the gills: a cylinder at the
  // habit's own stipe diameter ending in a torn, fibrous break.
  const stumpR=F.stemHalf(.94),stub=R*.38,h0=hr(F.s0)*.6,tear=a=>1+.1*Math.sin(a*5+v[35]*9)+.07*(sample(Math.round(a*4)+3,671)-.5)*2;
  const cutEnd=Array.from({length:36},(_,i)=>{const a=i/36*TAU,r=stumpR*tear(a),dy=(sample(i,672)-.5)*stumpR*.16;return[Math.cos(a)*r,stub*cv+Math.sin(a)*r*sv+dy];});
  const stump=[...Array.from({length:13},(_,i)=>{const a=Math.PI+i/12*Math.PI;return[Math.cos(a)*stumpR,-h0*cv+Math.sin(a)*stumpR*sv];}),
    ...cutEnd.filter(([,y],i)=>i<=18).map(p=>p).reverse().reverse()];
  line('rim',rim,.6,.6);line('rim-low',rimLow.slice(48),.38,.4);
  if(crownLift>1.5){line('crown',crownTop,.62,.6);}
  line('stump-left',[[-stumpR,-h0*cv],[cutEnd[18][0],cutEnd[18][1]]],.55,.55);line('stump-right',[[stumpR,-h0*cv],cutEnd[0]],.68,.6);line('stump-cut',[...cutEnd,cutEnd[0]],.5,.6);
  for(let i=0;i<9;i++){const x=(i/8*2-1)*stumpR*.86,y1=stub*cv+Math.sqrt(Math.max(0,1-(x/stumpR)**2))*stumpR*sv;line(`stump-fibre-${i}`,[[x,-h0*cv+stumpR*sv*.6],[x*(1+.04*sample(i,673)),y1-1.5]],.22,.26);}
  for(let i=0;i<10;i++){const a=(i+.5)/10*Math.PI,p=cutEnd[Math.round(a/TAU*36)%36];line(`torn-${i}`,[p,[p[0]+Math.cos(a)*1.5,p[1]+2+3*sample(i,674)]],.24,.4);}
  const islands=[],shadeIslands=[];
  const sMin=A.attach==='free'?F.s0:F.s0+.01;
  if(A.attach==='tubes'){
    const n=560;
    for(let i=0;i<n;i++){
      const a=i*2.399963229728653+(sample(i,660)-.5)*.3,s=mix(sMin+.03,.95,Math.sqrt((i+.5)/n)),hp=hr(s)-F.D(s),rr=R*(.015+.011*(1-s))*(.8+.4*sample(i,661));
      const c=P(s,a,hp),poly=Array.from({length:7},(_,k)=>{const q=k/7*TAU+sample(i,662)*2;const f=.75+.35*sample(i*7+k,663);return[c[0]+Math.cos(q)*rr*f,c[1]+Math.sin(q)*rr*f*sv];});
      line(`pore-${i}`,[...poly,poly[0]],.26,.3+.12*sample(i,664),null,[stump]);islands.push(poly);
    }
  }else if(A.attach==='teeth'){
    const n=230;
    for(let i=0;i<n;i++){
      const a=i*2.399963229728653+(sample(i,665)-.5)*.3,s=mix(sMin+.03,.96,Math.sqrt((i+.5)/n)),len=F.Dmax*(.5+.5*Math.sin(Math.PI*clamp((s-F.s0)/(1-F.s0))))*(.8+.4*sample(i,666));
      const base=P(s,a,hr(s)),tip=P(s*1.02,a,hr(s)-len),wd=R*.013*(.8+.4*sample(i,667)),dx=tip[0]-base[0],dy=tip[1]-base[1],d=Math.hypot(dx,dy)||1;
      const tooth=[[base[0]-dy/d*wd,base[1]+dx/d*wd],tip,[base[0]+dy/d*wd,base[1]-dx/d*wd]];
      line(`tooth-${i}`,[tooth[0],tooth[1]],.3,.38,null,[stump]);islands.push(tooth);
    }
  }else{
    // Full gills, then lamellulae in tiers; a few fork near the margin.
    const full=Math.round(A.distant?16+v[15]*10:30+v[15]*26),tiers=A.tiers,curveK=(v[16]-.5)*.35;
    const gills=[];for(let j=0;j<full;j++){const th=(j+(sample(j,668)-.5)*.32)/full*TAU;gills.push({th,start:sMin,tier:0,j});
      if(tiers>=1)gills.push({th:th+TAU/full*(.5+(sample(j,669)-.5)*.2),start:.48+.1*sample(j,670),tier:1,j});
      if(tiers>=2){gills.push({th:th+TAU/full*(.25+(sample(j,671)-.5)*.1),start:.74+.08*sample(j,672),tier:2,j});gills.push({th:th+TAU/full*(.75+(sample(j,673)-.5)*.1),start:.76+.08*sample(j,674),tier:2,j});}}
    for(const [k,gl] of gills.entries()){
      const n=14,ss=Array.from({length:n+1},(_,i)=>mix(gl.start,.985,i/n)),thAt=s=>gl.th+curveK*(s-gl.start)*Math.sin(gl.th*2)+.012*Math.sin(s*23+k)*(sample(k,679)-.3);
      const D=s=>gl.tier?F.D(s)*smooth(Math.min(1,(s-gl.start)/.08)):F.D(s);
      const wav=s=>1+.006*Math.sin(s*(14+6*sample(k,661))+k*1.3),edge=ss.map(s=>P(s*wob(thAt(s))*wav(s),thAt(s),hr(s)-D(s)*(.85+.3*sample(k,662)))),root=ss.map(s=>P(s*wob(thAt(s)),thAt(s),hr(s)));
      {const w=(gl.tier?.24:.32)+.2*sample(k,677),o=(gl.tier?.22:.32)+.26*sample(k,678),cut=sample(k,663)<.16?3+Math.floor(sample(k,664)*7):-1;if(cut<0)line(`gill-${k}`,edge,w,o,null,[stump]);else{line(`gill-${k}`,edge.slice(0,cut+1),w,o,null,[stump]);line(`gill-${k}-b`,edge.slice(cut+2),w,o*.8,null,[stump]);}}
      if(Math.sin(gl.th)>.15&&!gl.tier)line(`gill-root-${k}`,root,.22,.2,null,[stump]);
      const sliver=[...root,...edge.slice().reverse()];
      (Math.cos(gl.th)>0?shadeIslands:islands).push(sliver);
      if(A.forks&&!gl.tier&&sample(gl.j,675)<A.forks){const s0=.55+.2*sample(gl.j,676),fork=Array.from({length:7},(_,i)=>{const s=mix(s0,.985,i/6),th=thAt(s)+TAU/full*.32*(i/6);return P(s*wob(th),th,hr(s)-D(s));});line(`fork-${k}`,fork,.32,.4,null,[stump]);}
    }
  }
  const inner=A.stem==='hollow'||A.stem==='chambered'?Array.from({length:20},(_,i)=>{const a=i/20*TAU,r=stumpR*.46*(1+.18*Math.sin(a*3+v[35]*7));return[Math.cos(a)*r,stub*cv+Math.sin(a)*r*sv];}):null;
  if(inner)line('stump-inner',[...inner,inner[0]],.32,.5);
  // Washes.
  const lowerHalf=rimLow.slice(48),disc=rimLow;
  wash('underside',disc,gillPal[0],gillPal[1]*.85,[stump]);
  if(islands.length)wash('hymenophore-detail',fpBox(islands.flat()),A.attach==='tubes'?{umber:.4,sapgreen:.35,ochre:.25}:gillPal[0],A.attach==='tubes'?.06:gillPal[1]*.7,[stump],islands);
  if(shadeIslands.length)wash('gill-shade',fpBox(shadeIslands.flat()),{...FIELD_SHADE},.05,[stump],shadeIslands);
  wash('rim-band',[...rim.slice(48),...lowerHalf.slice().reverse()],capPal,.08);
  if(crownLift>1.5)wash('crown',[...crownTop,...crownBase.slice().reverse()],capPal,.16);
  wash('stump',stump,A.flesh==='cap'?capPal:FIELD_FLESH_WHITE,.1,[cutEnd]);
  wash('stump-cut',cutEnd,A.flesh==='cap'?capPal:FIELD_FLESH_WHITE,.06,inner&&A.stem==='hollow'?[inner]:[]);
  if(inner&&A.stem==='hollow')wash('stump-cavity',inner,FIELD_SHADE,.07);
  // Shadow glaze on the side turned from the light and under the stipe.
  const shade=[...Array.from({length:25},(_,i)=>{const th=-Math.PI*.15+i/24*Math.PI*.95;return P(.97,th,-mt);}),...Array.from({length:13},(_,i)=>{const th=Math.PI*.8-i/12*Math.PI*.95;return P(.45,th,hr(.45));})];
  wash('underside-shade',shade,FIELD_SHADE,.035,[stump]);
  return {...out,title:A.attach==='tubes'?'Pore surface detail':A.attach==='teeth'?'Toothed surface detail':'Underside detail'};
}

// A spore print taken under the same cap: the deposit, densest between the
// gills, inside a faint pencilled cap outline.
function fieldCapDeposit(genome,recipe,spec,A){
  const out=fieldPlateRecorder(genome,recipe,'spore-deposit'),{line,wash}=out,v=spec.values,F=fieldCapFrame(spec,A),{R}=F;
  const tone=FIELD_SPORE_TONES[A.spore]??FIELD_SPORE_TONES.white,ph=v[35]*TAU,salt=hashSeed(String(genome.seed))%997;
  const wob=th=>1+(.012+v[4]*.03)*Math.sin(th*3+ph)+(.008+v[20]*.012)*Math.sin(th*7-ph);
  const full=A.attach==='tubes'||A.attach==='teeth'?0:Math.round(A.distant?16+v[15]*10:30+v[15]*26);
  const ring=(f,n=144)=>Array.from({length:n},(_,i)=>{const th=i/n*TAU;return[Math.cos(th)*R*f*wob(th)*(1+.015*(sample(i+salt,680)-.5)),Math.sin(th)*R*f*wob(th)];});
  // The cap was laid gills down with the stipe cut away: its scar stays
  // almost clean, a little off centre, not a punched hole.
  const sc=[(v[5]-.5)*R*.05,(v[6]-.5)*R*.04],scarR=F.sTop*.95,scar=fpOval(sc[0],sc[1],scarR,scarR*.93,22,v[35]*3,a=>.08*Math.sin(a*3+ph)+.05*Math.sin(a*5-ph));
  const capLine=Array.from({length:97},(_,i)=>{const th=i/96*TAU;return[Math.cos(th)*R*1.01*wob(th),Math.sin(th)*R*1.01*wob(th)];});
  // The cap seen from above, pencilled lightly and broken where the pencil lifted.
  for(let k=0;k<5;k++){const a=k*19+Math.floor(sample(k+salt,681)*4),b=Math.min(96,a+16+Math.floor(sample(k+salt,682)*3));line(`cap-outline-${k}`,capLine.slice(a,b+1),.32,.38);}
  line('stipe-scar',[...scar.slice(0,15)],.3,.3);
  wash('deposit-halo',ring(.99),tone.palette,tone.load*.25);
  wash('deposit',ring(.93),tone.palette,tone.load*(full?.45:.95));
  if(full){
    // Spores fall between the gills: a radial deposit of fine lines, each
    // tapering toward the scar, the short gills starting further out.
    const n=full*(A.tiers>=1?2:1)*(A.tiers>=2?2:1),lines=[];
    for(let j=0;j<n;j++){
      if(sample(j+salt,692)<.08)continue;
      const tier=A.tiers>=2?(j%4===0?0:j%2===0?1:2):A.tiers>=1?(j%2?1:0):0;
      const th=(j+.5+(sample(j+salt,693)-.5)*.35)/n*TAU,r0=tier===0?scarR*1.15+R*.02*sample(j,694):R*(tier===1?.45:.7)+R*.06*sample(j,694),r1=R*(.86+.08*sample(j+salt,695))*wob(th);
      const w0=.7,w1=(1.3+1.1*sample(j+salt,696))*(A.distant?1.6:1),nx=-Math.sin(th),ny=Math.cos(th),bend=(sample(j,697)-.5)*.04;
      const pts=[];for(let k=0;k<=6;k++){const t=k/6,r=mix(r0,r1,t),a=th+bend*t*t,w=mix(w0,w1,Math.sqrt(t));pts.push([Math.cos(a)*r+sc[0]*(1-t)-Math.sin(a)*w,Math.sin(a)*r+sc[1]*(1-t)+Math.cos(a)*w]);}
      for(let k=6;k>=0;k--){const t=k/6,r=mix(r0,r1,t),a=th+bend*t*t,w=mix(w0,w1,Math.sqrt(t));pts.push([Math.cos(a)*r+sc[0]*(1-t)+Math.sin(a)*w,Math.sin(a)*r+sc[1]*(1-t)-Math.cos(a)*w]);}
      lines.push(pts);
    }
    // Laid as a later, dry pass so the lines keep their edges.
    wash('spore-lines',fpBox(lines.flat()),tone.palette,tone.load*1.5,[],lines);
  }else{
    // Pores leave an even dust, densest in a broad ring.
    const mott=Array.from({length:46},(_,i)=>{const a=i*2.399963229728653+salt,r=R*mix(.3,.85,Math.sqrt((i+.5)/46));return fpOval(Math.cos(a)*r,Math.sin(a)*r,R*(.05+.03*sample(i+salt,698)),R*.04,10,a);});
    wash('deposit-mottle',fpBox(mott.flat()),tone.palette,tone.load*.7,[],mott);
  }
  return {...out,title:'Spore print'};
}

// Closed and lateral bodies: sections and surface details drawn from the
// same genome traits as the habit. Units match the habit's plan units.
const fpProfile=(hw,Ht,n=48,t0=0,t1=1,inset=0)=>{const l=[],r=[];for(let i=0;i<=n;i++){const t=mix(t0,t1,i/n),w=Math.max(0,hw(t)-inset);l.push([-w,-t*Ht]);r.push([w,-t*Ht]);}return[...l,...r.reverse()];};
const fpBand=(a,b)=>[...a,...b.slice().reverse()];
function fieldBodyTone(genome){return fieldCapPalette(genome);}

function fieldPuffballSection(genome,recipe,spec){
  const out=fieldPlateRecorder(genome,recipe,'longitudinal-cut'),{line,wash}=out,v=spec.values,W=spec.g.w*spec.stretch*.9,Ht=W*(1.9+.45*v[1]);
  const hw=t=>W*(.4+.6*smooth(clamp((t-.02)/.55)))*(t>.6?Math.sqrt(Math.max(0,1-((t-.6)/.4)**2)):1)*(t<.05?.55+.45*Math.sqrt(t/.05):1);
  const body=fpProfile(hw,Ht,56),inner=fpProfile(hw,Ht,56,0,.985,3),gleba=fpProfile(hw,Ht,40,.37,.985,3.4),sub=fpProfile(hw,Ht,24,.04,.37,3.4);
  line('peridium',[...body,body[0]],.7,.62);line('endoperidium',[...inner,inner[0]],.3,.3);
  line('diaphragm',Array.from({length:13},(_,i)=>{const s=i/12*2-1,t=.37+.02*(1-s*s);return[s*(hw(t)-3.4),-t*Ht];}),.38,.42);
  const spines=[];
  for(const side of [-1,1])for(let k=0;k<16;k++){const t=.3+.66*(k+.5+.3*(sample(k+side*9,700)-.5))/16,e=.01,p=[side*hw(t),-t*Ht],q=[side*hw(t+e),-(t+e)*Ht],dx=q[0]-p[0],dy=q[1]-p[1],n=Math.hypot(dx,dy)||1,nx=side*Math.abs(dy)/n,ny=-Math.abs(dx)/n*(t>.6?1:.3);
    const len=2.5+2.5*sample(k,701),s=[[p[0]-dx/n*1.6,p[1]-dy/n*1.6],[p[0]+nx*len,p[1]+ny*len],[p[0]+dx/n*1.6,p[1]+dy/n*1.6]];spines.push(s);line(`spine-${side}-${k}`,s,.32,.5);}
  const cells=[];for(let i=0;i<34;i++){const t=mix(.07,.34,sample(i,702)),x=(sample(i,703)*2-1)*(hw(t)-7),c=fpOval(x,-t*Ht,2+2.5*sample(i,704),1.5+1.6*sample(i,705),10,sample(i,706)*3);cells.push(c);line(`chamber-${i}`,[...c,c[0]],.24,.32,sub);}
  for(let i=0;i<70;i++){const t=mix(.4,.95,sample(i,707)),x=(sample(i,708)*2-1)*(hw(t)-6),y=-t*Ht;line(`gleba-${i}`,[[x,y],[x+.8,y-.6],[x+1.5,y+.2]],.22,.25,gleba);}
  const tone=fieldBodyTone(genome);
  wash('peridium',body,tone,.1,[inner]);wash('gleba',gleba,{ochre:.48,sapgreen:.14,umber:.38},.07);wash('subgleba',sub,FIELD_FLESH_WHITE,.045);
  wash('chambers',fpBox(cells.flat()),FIELD_SHADE,.05,[],cells);wash('spines',fpBox(spines.flat()),tone,.2,[],spines);
  return {...out,title:'Longitudinal cut · gleba and sterile base'};
}
function fieldPuffballDetail(genome,recipe,spec){
  const out=fieldPlateRecorder(genome,recipe,'hymenium-detail'),{line,wash}=out,tone=fieldBodyTone(genome);
  const rx=110,ry=62,patch=fpOval(0,0,rx,ry,64,0,a=>.03*Math.sin(a*5+spec.values[35]*6));line('patch-edge',[...patch,patch[0]],.32,.3);
  const spines=[],warts=[];
  for(let i=0;i<38;i++){const a=i*2.399963229728653,r=Math.sqrt((i+.5)/38)*.88,x=Math.cos(a)*rx*r,y=Math.sin(a)*ry*r,b=4.2+1.8*sample(i,710),h=9+5*sample(i,711)*(1-r*.4);
    const s=[[x-b,y],[x-b*.2,y-h*.8],[x+.6,y-h],[x+b,y]];spines.push(s);line(`spine-${i}`,s,.36,.55);line(`spine-base-${i}`,Array.from({length:7},(_,k)=>[x+Math.cos(k/6*Math.PI)*b,y+Math.sin(k/6*Math.PI)*b*.45]),.24,.3);
    for(let k=0;k<7;k++){const q=k/7*TAU+sample(i,712),wx=x+Math.cos(q)*b*1.9,wy=y+Math.sin(q)*b*1.0,wt=fpOval(wx,wy,1.1,.8,8);warts.push(wt);line(`wart-${i}-${k}`,[...wt,wt[0]],.2,.35);}}
  for(let i=0;i<12;i++){const a=i*1.7+1,r=.3+.55*sample(i,713),sc=fpOval(Math.cos(a)*rx*r,Math.sin(a)*ry*r,3.5,1.8,14);line(`scar-${i}`,[...sc,sc[0]],.24,.35);}
  wash('surface',patch,tone,.07);wash('spines',fpBox(spines.flat()),tone,.22,[],spines);wash('warts',fpBox(warts.flat()),tone,.16,[],warts);
  wash('surface-shade',[...Array.from({length:20},(_,i)=>{const a=-.4+i/19*1.9;return[Math.cos(a)*rx,Math.sin(a)*ry];}),[rx*.2,ry*.2]],FIELD_SHADE,.035);
  return {...out,title:'Spines and warts'};
}

// Coral: a dichotomous tree of tapering branches traced as one contour.
function fieldCoralTree(v,levels,W,H,spread,salt=0){
  const node=(p0,dir,len,w0,depth,k)=>{const w1=w0*(depth?.78:.72),p1=[p0[0]+Math.sin(dir)*len,p0[1]-Math.cos(dir)*len];
    const kids=depth<levels?[-1,1].map(s=>node(p1,dir+s*spread*(.75+.5*sample(k*2+(s>0),720+salt)),len*(.74+.12*sample(k,721+salt)),w1*.86,depth+1,k*2+(s>0?1:0))):[];
    return {p0,p1,dir,w0,w1,kids};};
  return node([0,0],(v[5]-.5)*.12,H*.32,W*.22,0,1);
}
function fieldCoralContour(n){
  const nx=Math.cos(n.dir),ny=Math.sin(n.dir),L=(p,w)=>[p[0]-nx*w,p[1]-ny*w],Rr=(p,w)=>[p[0]+nx*w,p[1]+ny*w];
  const pts=[L(n.p0,n.w0)];
  if(n.kids.length){pts.push(...fieldCoralContour(n.kids[0]));pts.push([n.p1[0],n.p1[1]-n.w1*.2]);pts.push(...fieldCoralContour(n.kids[1]));}
  else{pts.push(L(n.p1,n.w1));for(let i=1;i<6;i++){const a=Math.PI+i/6*Math.PI;pts.push([n.p1[0]+Math.cos(a+n.dir)*n.w1,n.p1[1]+Math.sin(a+n.dir)*n.w1]);}pts.push(Rr(n.p1,n.w1));}
  pts.push(Rr(n.p0,n.w0));return pts;
}
const fieldCoralNodes=n=>[n,...n.kids.flatMap(fieldCoralNodes)];
function fieldCoralSection(genome,recipe,spec,detail=false){
  const out=fieldPlateRecorder(genome,recipe,detail?'hymenium-detail':'longitudinal-cut'),{line,wash}=out,v=spec.values,tone=fieldBodyTone(genome);
  const W=detail?120:120+v[0]*60,H=detail?150:160+v[1]*60,tree=fieldCoralTree(v,detail?2:3,W,H,.3+v[5]*.25,detail?9:0),contour=fieldCoralContour(tree);
  line('branch-contour',[...contour,contour[0]],.62,.58);
  const nodes=fieldCoralNodes(tree),tips=nodes.filter(n=>!n.kids.length);
  const tipCaps=tips.map(n=>fpOval(n.p1[0],n.p1[1],n.w1*1.15,n.w1*1.15,14));
  if(detail){wash('branches',contour,tone,.16);wash('branch-shade',fpBox(contour),FIELD_SHADE,.05,[],nodes.map(n=>[[n.p0[0]+Math.cos(n.dir)*n.w0*.1,n.p0[1]+Math.sin(n.dir)*n.w0*.1],[n.p1[0]+Math.cos(n.dir)*n.w1*.1,n.p1[1]+Math.sin(n.dir)*n.w1*.1],[n.p1[0]+Math.cos(n.dir)*n.w1,n.p1[1]+Math.sin(n.dir)*n.w1],[n.p0[0]+Math.cos(n.dir)*n.w0,n.p0[1]+Math.sin(n.dir)*n.w0]]));wash('tips',fpBox(tipCaps.flat()),{ochre:.5,hansa:.3,sienna:.2},.12,[],tipCaps);}
  else{wash('branch-flesh',contour,FIELD_FLESH_WHITE,.055);wash('rind',fpBox(contour),tone,.14,[],[fpBand(fpOffset(contour,0),fpOffset(contour,-2.2))]);wash('tips',fpBox(tipCaps.flat()),tone,.12,[],tipCaps);}
  return {...out,title:detail?'Branch tips':'Branch cut · solid context'};
}

function fieldMorelSection(genome,recipe,spec){
  const out=fieldPlateRecorder(genome,recipe,'longitudinal-cut'),{line,wash}=out,v=spec.values,g=spec.g,W=g.w*spec.stretch,h=g.h,L=g.length,s=g.stemWidth,tone=fieldBodyTone(genome);
  const capT=L/(L+h),Ht=L+h;
  const hw=t=>{if(t<capT)return s*(1+.25*Math.exp(-(((t-.06)/.08)**2))+.15*t);const u=(t-capT)/(1-capT);return Math.max(s*.9*(1-u*3),W*Math.sqrt(Math.max(0,Math.sin(Math.PI*Math.min(1,.12+.88*u))))*(1-.12*u));};
  // Pits notch the cap wall; ridges stand proud between them.
  const pit=t=>t>capT+.02&&t<.985?3+5*Math.max(0,Math.sin((t-capT)/(1-capT)*Math.PI*8+v[35]*5)):0;
  const outer=fpProfile(t=>hw(t)+(t>capT?2.4-pit(t):0),Ht,72),wall=t=>t<capT?s*.42:4.5+v[8]*2;
  const cavity=fpProfile(t=>Math.max(0,hw(t)-wall(t)),Ht,60,.07,.975);
  line('outer-wall',[...outer,outer[0]],.66,.6);line('cavity',[...cavity,cavity[0]],.42,.45);
  for(let i=0;i<20;i++){const side=i%2?1:-1,t=mix(.08,capT-.02,(i+.5)/20);line(`stem-grain-${i}`,[[side*(hw(t)-wall(t)*.4),-t*Ht],[side*(hw(t)-wall(t)*.5),-(t+.04)*Ht]],.24,.3,outer);}
  wash('wall',outer,FIELD_FLESH_WHITE,.06,[cavity]);wash('cavity',cavity,FIELD_SHADE,.045);
  const capBand=fpBand(fpProfile(t=>hw(t)+2.4-pit(t),Ht,40,capT,.99).slice(0,41),fpProfile(t=>hw(t)-1.5,Ht,40,capT,.99).slice(0,41));
  const capBandR=capBand.map(([x,y])=>[-x,y]);wash('pits',fpBox(capBand.concat(capBandR)),tone,.22,[],[capBand,capBandR]);
  return {...out,title:'Longitudinal cut · hollow body'};
}
function fieldMorelDetail(genome,recipe,spec){
  const out=fieldPlateRecorder(genome,recipe,'hymenium-detail'),{line,wash}=out,tone=fieldBodyTone(genome);
  const outer=fpOval(0,0,100,76,64);line('surface-boundary',[...outer,outer[0]],.4,.3);
  const pits=[];
  for(const [i,cell] of MOREL_CELLS.entries()){const p=cell.map(([x,y])=>[x*96,(y-.5)*145]),c=p.reduce((a,q)=>[a[0]+q[0]/p.length,a[1]+q[1]/p.length],[0,0]);
    if((c[0]/100)**2+(c[1]/76)**2>.72)continue;const inner=p.map(([x,y])=>[mix(c[0],x,.74),mix(c[1],y,.74)]);pits.push(inner);line(`ridge-${i}`,[...p,p[0]],.44,.4,outer);line(`pit-${i}`,[...inner,inner[0]],.26,.3,outer);}
  wash('ridges',outer,{ochre:.6,umber:.25,paynes:.15},.06);wash('pits',fpBox(pits.flat()),tone,.24,[],pits);
  return {...out,title:'Pit and ridge detail'};
}

function fieldLateralSection(genome,recipe,spec){
  const out=fieldPlateRecorder(genome,recipe,'longitudinal-cut'),{line,wash}=out,v=spec.values,tone=fieldBodyTone(genome);
  const gl=fieldPlateHymenium(genome)!=='pores',w=175+v[0]*45,rise=26+v[1]*30,ctx=(gl?10:6)+v[17]*5,tube=(gl?11:3)+v[17]*3;
  const top=curve([0,-6],[w*.3,-rise*1.3],[w*.75,-rise*.7],[w,0],48),under=top.map(([x,y],i)=>{const t=i/48;return[x,y+(ctx+tube)*Math.pow(Math.max(0,Math.sin(Math.PI*.5*(1-t))),.6)+1];});
  const mid=top.map(([x,y],i)=>[mix(x,under[i][0],.62),mix(y,under[i][1],.62)]);
  const wood=[[-34,-30],[2,-34],[4,26],[-34,30]];
  line('upper',top,.62,.6);line('lower',under,.5,.5);line('tube-line',mid,.3,.3);line('wood',[...wood,wood[0]],.5,.45);
  for(let i=0;i<9;i++)line(`grain-${i}`,[[-32,-28+i*6.5],[0,-30+i*6.8]],.25,.28);
  const gilled=fieldPlateHymenium(genome)!=='pores';
  for(let i=0;i<36;i++){const k=Math.round(i/36*46),a=mid[k],b=under[k];line(`tube-${i}`,[a,b],.2,gilled?.16:.28);}
  for(let i=0;i<8;i++){const k=Math.round(4+i*5.2),p=top[k];line(`zone-${i}`,[[p[0],p[1]],[p[0]+2,p[1]-2.2]],.3,.45);}
  wash('context',fpBand(top,mid),FIELD_FLESH_WHITE,.05);wash('tubes',fpBand(mid,under),{ochre:.42,umber:.3,paynes:.28},.07);
  wash('cuticle',fpBand(top,fpOffset(top,-1.8)),tone,.24);wash('wood',wood,{umber:.6,walnut:.3,paynes:.1},.12);
  return {...out,title:'Shelf section · tube layer'};
}
function fieldLateralDetail(genome,recipe,spec,deposit=false){
  const out=fieldPlateRecorder(genome,recipe,deposit?'spore-deposit':'hymenium-detail'),{line,wash}=out,v=spec.values,tone=fieldBodyTone(genome);
  const fan=Array.from({length:61},(_,i)=>{const a=-Math.PI*.95+i/60*Math.PI*.9,r=100*(1+.05*Math.sin(a*5+v[35]*6));return[Math.cos(a+Math.PI*.5)*r*1.15,-Math.sin(a+Math.PI*.5)*r*.75];});
  const shape=[[0,0],...fan.map(([x,y])=>[x,y+40])];
  if(deposit){
    const t=FIELD_SPORE_TONES.white,inner=shape.map(([x,y])=>[x*.93,(y-20)*.93+20]);line('outline',[...shape.slice(1),shape[1]].filter((_,i)=>i%7<5),.3,.35);
    wash('deposit',inner,t.palette,t.load);const ridges=Array.from({length:40},(_,j)=>{const a=-Math.PI*.9+(j+.5)/40*Math.PI*.8,r0=10+20*sample(j,734),r1=80+12*sample(j,735),c=Math.cos(a+Math.PI*.5),s=-Math.sin(a+Math.PI*.5),w=.8+.7*sample(j,736);return[[c*r0*1.1-s*.4,s*r0*.7+40],[c*r1*1.1-s*w,s*r1*.7+40],[c*r1*1.1+s*w,s*r1*.7+40],[c*r0*1.1+s*.4,s*r0*.7+40]];});
    wash('spore-ridges',fpBox(ridges.flat()),t.palette,t.load*1.2,[],ridges);
    return {...out,title:'Spore print'};
  }
  line('margin',shape.slice(1),.55,.55);line('attachment',[shape[1],shape[0],shape.at(-1)],.45,.45);
  if(fieldPlateHymenium(genome)!=='pores'){
    const gills=[];for(let j=0;j<70;j++){const a=-Math.PI*.95+(j+.5+(sample(j,733)-.5)*.4)/70*Math.PI*.9,start=j%2?.45:j%4===2?.7:.06;
      const pts=Array.from({length:12},(_,k)=>{const r=mix(start,.97,k/11)*100;return[Math.cos(a+Math.PI*.5)*r*1.15,-Math.sin(a+Math.PI*.5)*r*.75+40];});line(`gill-${j}`,pts,j%2?.26:.36,j%2?.3:.42);
      if(!(j%2))gills.push([...pts,...pts.slice().reverse().map(([x,y])=>[x+1.2,y+.8])]);}
    wash('gill-surface',shape,{ochre:.38,umber:.22,paynes:.4},.06);wash('gill-shade',fpBox(gills.flat()),FIELD_SHADE,.06,[],gills);
    return {...out,title:'Underside detail'};
  }
  const pores=[];for(let i=0;i<420;i++){const a=-Math.PI*.95+sample(i,730)*Math.PI*.9,r=Math.sqrt(.03+.97*sample(i,731))*.9,x=Math.cos(a+Math.PI*.5)*100*r*1.15,y=-Math.sin(a+Math.PI*.5)*100*r*.75+40;
    const p=Array.from({length:6},(_,k)=>{const q=k/6*TAU+sample(i,732);return[x+Math.cos(q)*1.6,y+Math.sin(q)*1.2];});pores.push(p);line(`pore-${i}`,[...p,p[0]],.2,.3);}
  wash('pore-surface',shape,{ochre:.4,umber:.25,paynes:.35},.05);wash('pores',fpBox(pores.flat()),FIELD_SHADE,.06,[],pores);
  wash('margin',fpBand(shape.slice(1),fpOffset(shape.slice(1),-5)),{ochre:.6,umber:.2,paynes:.2},.04);
  return {...out,title:'Pore surface detail'};
}

function fieldEarthstarSection(genome,recipe,spec,detail=false){
  const out=fieldPlateRecorder(genome,recipe,detail?'hymenium-detail':'longitudinal-cut'),{line,wash}=out,v=spec.values,tone=fieldBodyTone(genome);
  if(detail){
    const sac=fpOval(0,0,80,58,64),cone=[[-24,-46],[0,-82],[24,-46]];line('sac',[...sac,sac[0]],.55,.55);line('peristome',cone,.5,.55);
    for(let i=0;i<22;i++){const t=(i+.5)/22,x=mix(-22,22,t),y=-46-Math.sin(Math.PI*t)*3;line(`fibril-${i}`,[[x,y],[x*.08,-80]],.22,.35);}
    const zone=fpOval(0,-44,34,10,32);line('zone',[...zone,zone[0]],.3,.35);
    for(let i=0;i<40;i++){const a=sample(i,740)*TAU,r=.3+.6*sample(i,741),x=Math.cos(a)*80*r,y=Math.sin(a)*58*r;line(`grain-${i}`,[[x,y],[x+1,y+.6]],.22,.3,sac);}
    wash('sac',sac,{umber:.5,paynes:.25,ochre:.25},.1);wash('peristome',cone,{ochre:.5,umber:.3,paynes:.2},.06);wash('zone',zone,{ochre:.6,umber:.2,paynes:.2},.04);
    wash('sac-shade',[...Array.from({length:20},(_,i)=>{const a=-.3+i/19*1.9;return[Math.cos(a)*80,Math.sin(a)*58];})],FIELD_SHADE,.05);
    return {...out,title:'Peristome detail'};
  }
  const span=150+v[0]*40,R=span*.3,cy=-R-14;
  const ray=side=>{const top=curve([side*R*.5,-12],[side*span*.45,-16],[side*span*.85,-8],[side*span,10],22),bot=top.map(([x,y],i)=>[x,y+6*(1-i/22)+1.5]);return{top,bot};};
  const sac=fpOval(0,cy,R,R*.92,48),glebaS=fpOval(0,cy,R-3,R*.92-3,48),col=[[-4,cy+R*.75],[-5,cy-R*.1],[0,cy-R*.35],[5,cy-R*.1],[4,cy+R*.75]];
  const collar=curve([-R*1.05,-8],[-R*.7,4],[R*.7,4],[R*1.05,-8],20),cone=[[-R*.25,cy-R*.86],[0,cy-R*1.18],[R*.25,cy-R*.86]];
  for(const side of [-1,1]){const r=ray(side);line(`ray-top-${side}`,r.top,.55,.55);line(`ray-bot-${side}`,r.bot,.45,.45);wash(`ray-${side}`,fpBand(r.top,r.bot),{ochre:.5,umber:.35,sienna:.15},.12);}
  line('sac',[...sac,sac[0]],.6,.6);line('columella',col,.32,.4);line('collar',collar,.45,.45);line('peristome',cone,.45,.5);
  for(let i=0;i<60;i++){const a=sample(i,742)*TAU,r=sample(i,743)**.5*(R-6),x=Math.cos(a)*r,y=cy+Math.sin(a)*r*.9;line(`gleba-${i}`,[[x,y],[x+1.2,y-.4]],.22,.3,glebaS,[col]);}
  wash('gleba',glebaS,{umber:.6,paynes:.25,sienna:.15},.16,[col]);wash('endoperidium',fpBand(sac,glebaS),tone,.12);wash('columella',col,FIELD_FLESH_WHITE,.04);
  wash('collar',fpBand(collar,fpOffset(collar,3)),{ochre:.55,umber:.3,paynes:.15},.08);
  return {...out,title:'Longitudinal cut · spore sac and rays'};
}

function fieldStinkhornSection(genome,recipe,spec,detail=false){
  const out=fieldPlateRecorder(genome,recipe,detail?'hymenium-detail':'longitudinal-cut'),{line,wash}=out,v=spec.values;
  if(detail){
    // The 'egg' cut through: volva skin, jelly layer, folded receptacle, gleba.
    const R=70,Ht=95,egg=fpOval(0,-Ht*.5,R,Ht*.55,64),jelly=fpOval(0,-Ht*.5,R-5,Ht*.55-5,64),inner=fpOval(0,-Ht*.47,R-15,Ht*.55-17,64);
    const stem=[[-11,-6],[-12,-Ht*.82],[12,-Ht*.82],[11,-6]],hollow=[[-5,-10],[-5,-Ht*.78],[5,-Ht*.78],[5,-10]],cap=curve([-R*.62,-Ht*.3],[-R*.6,-Ht*1.0],[R*.6,-Ht*1.0],[R*.62,-Ht*.3],28);
    const capIn=cap.map(([x,y])=>[x*.82,y+(y+Ht*.6)*.05+4]);
    line('volva',[...egg,egg[0]],.6,.6);line('jelly',[...jelly,jelly[0]],.32,.35);line('inner',[...inner,inner[0]],.38,.42);
    line('receptacle',[...stem,stem[0]],.42,.48);line('stem-hollow',[...hollow,hollow[0]],.3,.35);line('cap-outer',cap,.42,.5);line('cap-inner',capIn,.32,.4);
    for(let i=0;i<14;i++){const y=-Ht*(.1+.05*i);line(`chamber-${i}`,[[-11,y],[-5,y-2]],.22,.3);line(`chamber-r-${i}`,[[11,y],[5,y-2]],.22,.3);}
    const glebaBand=fpBand(cap,capIn);
    wash('volva-skin',fpBand(egg,jelly),{ochre:.45,umber:.25,paynes:.3},.06);wash('jelly',fpBand(jelly,inner),{sapgreen:.35,ochre:.4,umber:.25},.06);
    wash('gleba',glebaBand,{sapgreen:.35,umber:.45,paynes:.2},.2);wash('receptacle',stem,FIELD_FLESH_WHITE,.04,[hollow]);wash('core',inner,FIELD_FLESH_WHITE,.03,[glebaBand,stem]);
    return {...out,title:'Egg in section'};
  }
  const g=spec.g,L=Math.max(150,(g.length||180))*1.1,s=Math.max(12,g.stemWidth||16),capH=L*.28,capW=s*1.9;
  const stemL=Array.from({length:30},(_,i)=>{const t=i/29;return[-s*(1+.12*Math.sin(t*9))*(1-.15*t),-t*L];}),stemR=stemL.map(([x,y])=>[-x,y]).reverse();
  const hollowW=s*.45,hollow=[[-hollowW,-L*.08],[-hollowW,-L*.98],[hollowW,-L*.98],[hollowW,-L*.08]];
  const cap=curve([-capW,-L+capH*.9],[-capW*1.1,-L-capH*.3],[capW*1.1,-L-capH*.3],[capW,-L+capH*.9],26),capIn=cap.map(([x,y])=>[x*.8,y+3]);
  const volva=curve([-s*2.2,-L*.2],[-s*2.6,6],[s*2.6,6],[s*2.2,-L*.2],24);
  const stem=[...stemL,...stemR];line('stem-left',stemL,.55,.55);line('stem-right',stemR,.62,.6);line('hollow',[...hollow,hollow[0]],.32,.35);
  line('cap',cap,.55,.58);line('cap-inner',capIn,.35,.4);line('volva',volva,.55,.55);line('volva-inner',fpOffset(volva,2.5),.3,.35);
  const ring=fpOval(0,-L-capH*.12,s*.45,s*.2,16);line('apex-ring',[...ring,ring[0]],.35,.45);
  const cells=[];for(let i=0;i<26;i++){const side=i%2?1:-1,t=.1+.8*(i+.5)/26,c=fpOval(side*(s*.72),-t*L,s*.18,s*.13,10);cells.push(c);line(`cell-${i}`,[...c,c[0]],.22,.3);}
  const pits=[];for(let i=0;i<16;i++){const k=Math.round((i+.5)/16*26),p=cap[k],q=capIn[k],c=fpOval((p[0]+q[0])/2,(p[1]+q[1])/2,2.2,2.6,10);pits.push(c);}
  wash('receptacle',stem,FIELD_FLESH_WHITE,.05,[hollow]);wash('cells',fpBox(cells.flat()),FIELD_SHADE,.05,[],cells);
  wash('gleba',fpBand(cap,capIn),{sapgreen:.35,umber:.45,paynes:.2},.22,pits);wash('volva',fpBand(volva,fpOffset(volva,2.5)),{ochre:.45,umber:.25,paynes:.3},.08);
  return {...out,title:'Longitudinal cut · hollow receptacle'};
}

function fieldToothSection(genome,recipe,spec,detail=false){
  const out=fieldPlateRecorder(genome,recipe,detail?'hymenium-detail':'longitudinal-cut'),{line,wash}=out,v=spec.values,tone=fieldBodyTone(genome);
  const W=detail?70:110+v[0]*40,Hb=detail?24:55+v[1]*20;
  const body=detail?curve([-W,-Hb*.2],[-W*.7,-Hb*1.4],[W*.7,-Hb*1.4],[W,-Hb*.2],30):curve([-W,0],[-W*.95,-Hb*1.5],[W*.95,-Hb*1.5],[W,0],34);
  const base=detail?[[W,-Hb*.2],[-W,-Hb*.2]]:Array.from({length:13},(_,i)=>{const x=mix(W,-W,i/12);return[x,6*Math.sin(i*1.3+v[35]*5)+8*Math.sin(Math.PI*i/12)];});
  const shape=[...body,...base];line('body',body,.6,.58);
  const spines=[];const n=detail?11:26;
  for(let i=0;i<n;i++){const x=mix(-W*.92,W*.92,(i+.5)/n)+(sample(i,750)-.5)*4,y0=detail?-Hb*.2:6*Math.sin(((W-x)/(2*W))*12*1.3/1+v[35]*5)*0+8*Math.sin(Math.PI*(W-x)/(2*W))-1,len=(detail?110:60)*(.6+.4*sample(i,751)),w=detail?3.2:2;
    const s=[[x-w,y0],[x+(sample(i,752)-.5)*4,y0+len],[x+w,y0]];spines.push(s);line(`spine-${i}`,[s[0],s[1]],.3,.45);line(`spine-b-${i}`,[s[1],s[2]],.24,.3);}
  if(!detail)for(let i=0;i<14;i++){const a=sample(i,753)*TAU,r=sample(i,754)**.5;line(`flesh-${i}`,[[Math.cos(a)*W*.6*r,-Hb*.6+Math.sin(a)*Hb*.5*r],[Math.cos(a)*W*.6*r+2,-Hb*.6+Math.sin(a)*Hb*.5*r-1]],.22,.25,shape);}
  wash('flesh',shape,detail?tone:FIELD_FLESH_WHITE,detail?.08:.05);wash('spines',fpBox(spines.flat()),tone,.12,[],spines);
  wash('spine-shade',fpBox(spines.flat()),FIELD_SHADE,.04,[],spines.map(s=>[s[1],s[2],[(s[0][0]+s[2][0])/2,s[0][1]]]));
  return {...out,title:detail?'Spines':'Longitudinal cut · solid base and spines'};
}

function fieldBodyFigures(genome,recipe,spec,kind){
  const grammar=genome.phenotype?.grammar??genome.family;
  if(kind==='puffball')return [fieldPuffballSection(genome,recipe,spec),fieldPuffballDetail(genome,recipe,spec)];
  if(kind==='coral')return [fieldCoralSection(genome,recipe,spec),fieldCoralSection(genome,recipe,spec,true)];
  if(kind==='morel')return [fieldMorelSection(genome,recipe,spec),fieldMorelDetail(genome,recipe,spec)];
  if(kind==='lateral')return [fieldLateralSection(genome,recipe,spec),fieldLateralDetail(genome,recipe,spec)];
  if(kind==='earthstar')return [fieldEarthstarSection(genome,recipe,spec),fieldEarthstarSection(genome,recipe,spec,true)];
  if(kind==='stinkhorn')return [fieldStinkhornSection(genome,recipe,spec),fieldStinkhornSection(genome,recipe,spec,true)];
  if(kind==='tooth')return [fieldToothSection(genome,recipe,spec),fieldToothSection(genome,recipe,spec,true)];
  return null;
}

// Spores, a basidium (or asci) and one cystidium, drawn small as under the
// microscope; shape follows the type's anatomy table.
function fieldMicroscopy(genome,recipe,A){
  const out=fieldPlateRecorder(genome,recipe,'microscopy'),{line,wash}=out,v=genome.values;
  const tone=FIELD_SPORE_TONES[A.spore]??FIELD_SPORE_TONES.white,pal=tone.card?{ochre:.5,umber:.2,paynes:.3}:tone.palette,load=tone.card?.04:Math.min(.16,tone.load*.8);
  const size=11*(A.sporeSize??1),shapes=[];
  const spore=(x,y,rot,k)=>{
    const kind=k%5===3&&A.spores!=='fusiform'?'globose':A.spores,s=size*(.72+.5*sample(k+hashSeed(String(genome.seed))%97,690));
    let pts;
    if(kind==='globose'||kind==='warted')pts=fpOval(x,y,s*.5,s*.46,22,rot);
    else if(kind==='fusiform')pts=Array.from({length:24},(_,i)=>{const a=i/24*TAU,r=Math.pow(Math.abs(Math.sin(a)),.8);return[x+Math.cos(rot)*Math.cos(a)*s*.75-Math.sin(rot)*Math.sin(a)*s*.2*(.5+.5*r),y+Math.sin(rot)*Math.cos(a)*s*.75+Math.cos(rot)*Math.sin(a)*s*.2*(.5+.5*r)];});
    else pts=fpOval(x,y,s*.55,s*.34,22,rot,a=>.08*Math.max(0,Math.sin(a))*(sample(k,696)-.2));
    line(`spore-${k}`,[...pts,pts[0]],.34,.6);shapes.push(pts);
    const ax=x-Math.cos(rot)*s*.55,ay=y-Math.sin(rot)*s*.55;line(`apiculus-${k}`,[[ax,ay],[ax-Math.cos(rot+.6)*1.6,ay-Math.sin(rot+.6)*1.6]],.3,.5);
    if(kind==='pore'){const px=x+Math.cos(rot)*s*.52,py=y+Math.sin(rot)*s*.52;line(`germ-pore-${k}`,[[px-Math.sin(rot)*1.6,py+Math.cos(rot)*1.6],[px+Math.sin(rot)*1.6,py-Math.cos(rot)*1.6]],.3,.5);line(`wall-${k}`,fpOffset([...pts,pts[0]],.7),.2,.3);}
    if(kind==='warted')for(let w=0;w<7;w++){const a=w/7*TAU+k,q=[x+Math.cos(a)*s*.32,y+Math.sin(a)*s*.3];line(`wart-${k}-${w}`,[q,[q[0]+.5,q[1]+.4]],.4,.55);}
    if(kind!=='globose'&&kind!=='warted')line(`guttule-${k}`,fpOval(x+Math.cos(rot)*s*.08,y+Math.sin(rot)*s*.08,s*.13,s*.13,10).concat([[x+Math.cos(rot)*s*.08+s*.13,y+Math.sin(rot)*s*.08]]),.2,.3);
  };
  // Spores lie as they fell on the slide: loose ones at any angle, and a
  // few still touching in small clumps. Layout is seeded per specimen.
  const salt=hashSeed(String(genome.seed))%997,spots=[];
  for(let k=0;k<7;k++)spots.push([(sample(k+salt,697)-.5)*34,(sample(k+salt,698)-.5)*30,sample(k+salt,691)*TAU]);
  for(let c=0;c<2;c++){const cx0=(sample(c+salt,699)-.5)*30,cy0=(sample(c+salt,700)-.5)*26,a0=sample(c+salt,701)*TAU,count=2+(sample(c+salt,702)<.5?1:0);
    for(let j=0;j<count;j++){const a=a0+j*2.1;spots.push([cx0+Math.cos(a)*4.6*(j?1:0),cy0+Math.sin(a)*4.6*(j?1:0),a0+j*(.5+sample(j+c,703))]);}}
  // Keep loose spores apart so each reads as one cell.
  const placed=[];for(const [x,y,r] of spots){if(placed.some(([px,py,,cl])=>!cl&&Math.hypot(px-x,py-y)<6.5)&&placed.length<7)continue;placed.push([x,y,r,placed.length>=7]);}
  placed.forEach(([x,y,r],k)=>spore(x*size/8,y*size/8,r,k));
  // A short scale line under the spores, as microscope figures carry.
  const sy=24*size/8;line('scale-bar',[[-8*size/8,sy],[12*size/8,sy]],.3,.5);line('scale-tick-a',[[-8*size/8,sy-1.6],[-8*size/8,sy+1.6]],.28,.5);line('scale-tick-b',[[12*size/8,sy-1.6],[12*size/8,sy+1.6]],.28,.5);
  // Basidium with four sterigmata, each bearing a spore.
  const bx=40*size/8,by=30,bh=34,bw=8;
  const club=[...curve([bx-2.2,by],[bx-2.5,by-bh*.45],[bx-bw*.6,by-bh*.75],[bx-bw*.5,by-bh],10),...curve([bx+bw*.5,by-bh],[bx+bw*.6,by-bh*.75],[bx+2.5,by-bh*.45],[bx+2.2,by],10)];
  line('basidium',club,.36,.55);
  for(let k=0;k<4;k++){const sx=bx+(k-1.5)*bw*.32,st=[[sx,by-bh+1],[sx+(k-1.5)*1.2,by-bh-6]];line(`sterigma-${k}`,st,.28,.5);
    const sp=fpOval(st[1][0]+(k-1.5)*.8,st[1][1]-size*.3,size*.26,size*.36,14,(k-1.5)*.3);line(`basidiospore-${k}`,[...sp,sp[0]],.28,.5);shapes.push(sp);}
  line('basidium-septum',[[bx-2.3,by],[bx+2.3,by]],.3,.45);
  // A cystidium for gilled types.
  wash('spores',fpBox(shapes.flat()),pal,load,[],shapes);
  wash('basidium',club,{ochre:.4,umber:.2,paynes:.4},.02);
  return {...out,title:'Spores and basidium'};
}

// Sheet captions show the bare figure number; the words stay in the data.
export const fieldFigureLabel=note=>{const n=/^\s*(\d+)\./.exec(note?.text??'');return n?`${n[1]}.`:note?.text??'';};
export function buildFieldPlateAdjuncts(genome,recipe,{sketch=false,composition=null,morph=null,connected=null}={}){
  recipe=recipe??composition?.plate;
  if(!recipe)throw new TypeError('Capture and pass a field-plate recipe; do not derive it per morph frame');
  if(!recipe.supported)return {ink:[],washes:[],bodies:[],annotations:[],fieldPlate:recipe,supported:false};
  if(morph){
    const t=clamp(morph.t),a=TYPE_PALETTES[morph.a.phenotype?.palette]??TYPE_PALETTES.chestnut,b=TYPE_PALETTES[morph.b.phenotype?.palette]??TYPE_PALETTES.chestnut;
    const fieldPlatePalette=t===0?{...a}:t===1?{...b}:Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(k=>[k,mix(a[k]??0,b[k]??0,t)]));
    genome={...(t===1?morph.b:morph.a),fieldPlatePalette,values:t===0?morph.a.values:t===1?morph.b.values:morph.a.values.map((x,i)=>mix(x,morph.b.values[i],t))};
  }
  let cut,detail,deposit,micro,spec=null;
  if(connected){
    const index=Math.max(0,connected.pair.composition.members.findIndex(m=>m.id===recipe.memberId)),p=connectedDimensionsAt(connected.pair,connected.t)[index];
    const chart=caMemberChart(p,connected.pair.composition.members[index],connected.pair.view,{chartOnly:true}).chart;
    cut=fieldPlateConnectedCut(genome,recipe,p,chart);detail=fieldPlateConnectedSurface(genome,recipe,p,chart);
    if(recipe.showDeposit)deposit=fieldPlateConnectedSurface(genome,recipe,p,chart,true);
  }else{
    if(morph&&((morph.a.phenotype?.grammar??morph.a.family)!==(morph.b.phenotype?.grammar??morph.b.family)))throw new TypeError('Cross-form field studies require the connected anatomy chart');
    if(fieldPlateKind(genome)==='cap'){
      spec=fieldPlateSpecimen(genome,recipe,composition);const A=fieldPlateAnatomy(genome);
      cut=fieldCapSection(genome,recipe,spec,A);detail=fieldCapUnderside(genome,recipe,spec,A);
      if(recipe.showDeposit)deposit=fieldCapDeposit(genome,recipe,spec,A);
    }else{
      const kind=fieldPlateKind(genome);spec=fieldPlateSpecimen(genome,recipe,composition);
      const figures=kind==='cap'?null:fieldBodyFigures(genome,recipe,spec,kind);
      if(figures){[cut,detail]=figures;if(recipe.showDeposit&&kind==='lateral')deposit=fieldLateralDetail(genome,recipe,spec,true);}
      else{cut=kind==='cap'?fieldPlateCapCut(genome,recipe):fieldPlateBodyCut(genome,recipe);
        detail=fieldPlateSurfaceStudy(genome,recipe);if(recipe.showDeposit)deposit=fieldPlateSurfaceStudy(genome,recipe,true);}
    }
    cut.title=`Schematic · ${cut.title}`;
  }
  if(recipe.microBox)micro=fieldMicroscopy(genome,recipe,fieldPlateAnatomy(genome));
  const mainArea=recipe.adultBox.w*recipe.adultBox.h,fit=Math.min(recipe.adultBox.w/recipe.sourceBox.w,recipe.adultBox.h/recipe.sourceBox.h);
  // Supporting figures are drawn no larger than the habit specimen itself.
  const life=fit*(spec?spec.unitScale:1.5);
  const slots=[[cut,recipe.cutBox,.5],[detail,recipe.detailBox,.3],[deposit,recipe.depositBox,.22],[micro,recipe.microBox,.22]];
  const parts=[],ids=[];
  slots.forEach(([plan,box,area],i)=>{if(plan&&box){parts.push(fieldPlatePlace(plan,box,mainArea*area,i===3?Infinity:life));ids.push(i);}});
  const ink=parts.flatMap(p=>p.ink),bodies=parts.flatMap(p=>p.washes);
  const annotations=parts.map((p,i)=>({text:`${i+2}. ${p.title.replace(' · illustrative tone','')}`,x:p.placedBounds.x+p.placedBounds.w*.5,y:p.placedBounds.y+p.placedBounds.h+21,fieldPlateId:`adjunct:label:${ids[i]}`}));
  annotations.unshift({text:'1. Habit study',x:recipe.adultBox.x+recipe.adultBox.w*.5,y:recipe.adultBox.y+recipe.adultBox.h+28,fieldPlateId:'adjunct:habit-label'});
  annotations.push({text:recipe.footer,x:600,y:FIELD_PLATE_FOOTER_Y,fieldPlateId:'adjunct:reference-note'});
  return {ink,washes:sketch?[]:bodies,bodies,annotations,fieldPlate:recipe,supported:true};
}

// Uniformly fit a complete study, retaining native material/occlusion data.
// Shared arrays and WeakMap surface associations remain shared after the map.
export function transformFieldPlateMain(plan,recipe,{inkWidthScale=null,linear=null}={}){
  const box=recipe.adultBox,b=recipe.sourceBox;
  // linear {a,b,c,d,ox,oy,tx,ty}: p -> M (p - o) + t. Otherwise a uniform fit.
  let scale=Math.min(box.w/b.w,box.h/b.h),tx=box.x+box.w*.5-(b.x+b.w*.5)*scale,ty=box.y+box.h*.5-(b.y+b.h*.5)*scale,M=[scale,0,0,scale];
  if(linear){M=[linear.a,linear.b,linear.c,linear.d];scale=Math.sqrt(Math.abs(M[0]*M[3]-M[1]*M[2]));tx=linear.tx-(M[0]*linear.ox+M[1]*linear.oy);ty=linear.ty-(M[2]*linear.ox+M[3]*linear.oy);}
  const det=M[0]*M[3]-M[1]*M[2],inv=[M[3]/det,-M[1]/det,-M[2]/det,M[0]/det];
  const memo=new Map(),triangleMemo=new Map(),point=p=>[M[0]*p[0]+M[1]*p[1]+tx,M[2]*p[0]+M[3]*p[1]+ty,...p.slice(2)];
  // A depth plane q = p0 x + p1 y + p2 expressed in the mapped coordinates.
  const affine=p=>{if(!p)return p;const n0=p[0]*inv[0]+p[1]*inv[2],n1=p[0]*inv[1]+p[1]*inv[3];return [n0,n1,p[2]-(n0*tx+n1*ty)];};
  const path=ps=>{
    if(!ps)return ps;if(memo.has(ps))return memo.get(ps);
    const result=ps.map(point);memo.set(ps,result);
    if(ps.cameraDepth)result.cameraDepth=affine(ps.cameraDepth);
    if(lamellarSurfaces.has(ps))lamellarSurfaces.set(result,lamellarSurfaces.get(ps).map(triangle));
    return result;
  };
  const triangle=t=>{
    if(triangleMemo.has(t))return triangleMemo.get(t);
    const out={...t};triangleMemo.set(t,out);out.poly=path(t.poly);out.wa=affine(t.wa);out.wb=affine(t.wb);out.depth=affine(t.depth);return out;
  };
  const mark=m=>{
    const out={...m};for(const key of ['points','shape','clip','basePoints'])if(m[key])out[key]=path(m[key]);
    for(const key of ['exclude','hiddenBy','islands','reserves'])if(m[key])out[key]=m[key].map(path);
    if(Number.isFinite(m.width))out.width=m.width*scale;if(Number.isFinite(m.baseWidth))out.baseWidth=m.baseWidth*scale;
    if(m.surface)out.surface={...m.surface,rails:m.surface.rails?.map(path),mesh:m.surface.mesh?.map(path)};
    if(m.volumes)out.volumes=m.volumes.map(v=>({...v,start:point(v.start),end:point(v.end),radius:v.radius*scale}));
    if(m.depthFaces)out.depthFaces=m.depthFaces.map(face=>({...face,triangles:face.triangles.map(triangle)}));
    if(lamellarSurfaces.has(m))lamellarSurfaces.set(out,lamellarSurfaces.get(m).map(triangle));
    return out;
  };
  // Page enlargement may keep pen weight lighter than the geometry scale;
  // only freshly mapped ink records receive that width.
  const inkMark=m=>{const out=mark(m);if(inkWidthScale!=null){if(Number.isFinite(m.width))out.width=m.width*inkWidthScale;if(Number.isFinite(m.baseWidth))out.baseWidth=m.baseWidth*inkWidthScale;}return out;};
  return {...plan,ink:(plan.ink??[]).map(inkMark),washes:(plan.washes??[]).map(m=>mark(m)),bodies:plan.bodies?.map(mark),surfacePassages:plan.surfacePassages?.map(mark),surfaceFaces:plan.surfaceFaces?.map(mark),
    annotations:(plan.annotations??[]).map(a=>{const q=point([a.x,a.y]);return {...a,x:q[0],y:q[1]};}),fieldPlateTransform:{scale,tx,ty}};
}
export function composeFieldPlateStudy(plan,genome,recipe,options={}){
  if(!recipe?.supported)return plan;
  // Remove the legacy full-only Amanita cut before fitting the whole main group.
  const legacy=(plan.annotations??[]).some(a=>a.text==='Longitudinal section');
  const oldWash=m=>m.role?.startsWith('section-')||(legacy&&m.role==='stem'&&!Number.isInteger(m.individual));
  const base={...plan,ink:plan.ink.filter(m=>m.role!=='section'),washes:(plan.washes??[]).filter(m=>!oldWash(m)),bodies:plan.bodies?.filter(m=>!oldWash(m)),annotations:(plan.annotations??[]).filter(a=>a.text!=='Longitudinal section')};
  const main=transformFieldPlateMain(base,recipe),adjuncts=buildFieldPlateAdjuncts(genome,recipe,options);
  const habit=fieldPlateBounds(main),label=adjuncts.annotations.find(a=>a.fieldPlateId==='adjunct:habit-label');
  if(habit&&label){label.x=habit.x+habit.w*.5;label.y=habit.y+habit.h+21;}
  return {...main,ink:[...main.ink,...adjuncts.ink],washes:[...main.washes,...adjuncts.washes],bodies:[...(main.bodies??main.washes),...adjuncts.bodies],annotations:[...main.annotations,...adjuncts.annotations],fieldPlate:recipe};
}

// Integration tests must cover fixed IDs/counts at 0,.001,.25,.5,.75,.999,1;
// full/sketch adjunct geometry equality; a fixed sourceBox across all frames;
// transformed native rails/mesh/volumes and affine depths; no radial deposit
// for puffball/coral; URL plate=1 and checked state; native ink/wash inspection.
// Required repo checks after integration: npm test and npm run bench:test.

// Integration adapter. The source/target planners remain raw; one captured
// composition supplies all main/adjunct plans in the UI and native worker.
export function withFieldPlatePair(pair,enabled=true,{composition=null,connected=null,requireCaptured=false}={}){
  if(!enabled)return pair;
  composition=composition??pair.composition??createSpecimenComposition(pair.a);
  const adjunctB=pair.supportedMotion===false?pair.a:pair.b;
  connected??=pair.connectedAnatomy?pair:pair.sourceConnected??null;
  if(connected){connected={...connected,view:pair.view??connected.view,shapeModifiers:pair.shapeModifiers??connected.shapeModifiers};}
  const pairKey=fieldPlatePairKey(pair,composition),carriedPlate=composition.plate;
  let plate=carriedPlate?.version===2&&carriedPlate.pairKey===pairKey?carriedPlate:null;
  if(requireCaptured&&!plate)throw new TypeError('Native field study requires the matching captured plate');
  if(!plate){
    const chart=pair.connectedAnatomy?pair:pair.sourceConnected;
    const capturePlans=pair.supportedMotion===false?[pair.source,pair.source]:[pair.source,pair.target];
    if(chart){
      const actual={...chart,view:pair.view??chart.view,shapeModifiers:pair.shapeModifiers??chart.shapeModifiers};
      for(const t of pair.connectedAnatomy?[0,.25,.5,.75,1]:[0])capturePlans.push(buildConnectedAnatomy(actual,t,{inkOnly:true}));
    }
    plate=createFieldPlateRecipe(pair.a,{composition,morph:{a:pair.a,b:adjunctB},seed:composition.id,endpointPlans:capturePlans,pairKey});
    if(carriedPlate?.version===2)plate=Object.freeze({...plate,transitionFrom:fieldPlateRecipeAt(carriedPlate,1)});
  }
  const carried={...composition,plate};if(connected)connected.composition=carried;
  return {...pair,composition:carried,fieldPlate:plate,fieldPlateConnected:connected};
}
function buildFieldPlatePairPlan(pair,t,{sketch=false,scene='plain',inkOnly=false,interactive=false}={}){
  const recipe=fieldPlateRecipeAt(pair.fieldPlate,t);if(!recipe?.supported)return null;
  const genome=morphGenome(pair,t),connected=pair.fieldPlateConnected?{pair:{...pair.fieldPlateConnected,view:pair.view??pair.fieldPlateConnected.view,shapeModifiers:pair.shapeModifiers??pair.fieldPlateConnected.shapeModifiers},t}:null;
  // The owning builder selects and preserves the main family construction.
  // Enabling field studies must never replace every cap form with one chart.
  const plan=sketch?rawMorphSketch(pair,t,{rawFieldPlate:true,inkOnly,interactive}):rawMorphStudy(pair,t,{scene,rawFieldPlate:true});
  return composeFieldPlateStudy({...plan,composition:pair.composition},genome,recipe,{sketch,composition:pair.composition,morph:{a:pair.a,b:pair.supportedMotion===false?pair.a:pair.b,t},connected});
}

// Nine additional body plans. Each profile fixes all branch, ray, tooth and
// peridiole counts; the seed deforms their continuous measurements only.
// Passage order: set dry ink; connected pale body washes; recessed surfaces;
// local shadow glazes. No generated image or per-frame random geometry.
function buildNovelStudy(genome,sketch=false) {
  const profile=genome.phenotype,grammar=profile?.grammar;
  if(!['cup','trumpet','earthstar','nest','club','jelly','tooth','saddle','stinkhorn'].includes(grammar))return null;
  const j=profile.variant,ink=[],washes=[],individuals=[],views=[];let v=genome.values,phase=v[35]*Math.PI*2,individualIndex=0;
  const TA=Math.PI*2,M=(a,b,t)=>a+(b-a)*t;
  const N=(i,s=0)=>Math.max(.001,Math.min(.999,sample(i,s+individualIndex*179)+(v[20]-.5)*.09*Math.sin(i*.73+phase)));
  const B=(a,b,c,d,n=23)=>Array.from({length:n},(_,i)=>{const t=i/(n-1),u=1-t;return[u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]];});
  const A=(x,y,rx,ry,a=0,b=TA,n=65)=>Array.from({length:n},(_,i)=>{const q=M(a,b,i/(n-1));return[x+rx*Math.cos(q),y+ry*Math.sin(q)];});
  const bb=p=>({x:Math.min(...p.map(q=>q[0])),y:Math.min(...p.map(q=>q[1])),w:Math.max(...p.map(q=>q[0]))-Math.min(...p.map(q=>q[0])),h:Math.max(...p.map(q=>q[1]))-Math.min(...p.map(q=>q[1]))});
  const cream={ochre:.28,umber:.27,walnut:.45},brown={umber:.52,ochre:.27,walnut:.21},dark={umber:.45,walnut:.4,paynes:.15};
  const basePal=seedShadePalette(genome.profileId,TYPE_PALETTES[profile.palette]??brown,v);
  const unitCount=profile.habit==='solitary'?1:profile.habit==='troop'||profile.habit==='cluster'?3:2;
  const compact=grammar==='earthstar'||grammar==='nest',shallowCup=grammar==='cup'&&[0,2,3].includes(j),baseY=compact?675:shallowCup?730:790;
  const placements=unitCount===1?[[610,baseY,compact?1.83:1.48,.025]]:unitCount===3?[[285,baseY-7,compact?.95:.77,-.13],[615,baseY+5,compact?1.4:1.13,.025],[932,baseY-3,compact?.87:.7,.14]]:[[315,baseY,compact?1.02:shallowCup?.9:.8,-.11],[790,baseY+4,compact?1.62:shallowCup?1.45:1.3,.025]];
  const wood=['jelly','tooth'].includes(grammar),soilObjects=[];
  let morphology={underside:'upper-hymenium',ring:false,capAttachment:'continuous-body'};
  const addWorldInk=(points,role,width,opacity,clip=null,exclude=[])=>{
    if(points.length<2)return;
    if(sketch){if(SKETCH_ROLES.has(role))ink.push({points,role,width,opacity,clip,exclude,individual:individualIndex});return;}
    const k=ink.length,shaped=points.map((p,i)=>{const q=points[Math.max(0,i-1)],r=points[Math.min(points.length-1,i+1)],dx=r[0]-q[0],dy=r[1]-q[1],d=Math.hypot(dx,dy)||1,t=i/(points.length-1),noise=Math.sin(t*Math.PI)*(.08+.17*v[20])*Math.sin(t*11+phase+k*.71);return[p[0]-dy/d*noise,p[1]+dx/d*noise];});
    penGestures(ink,{points:shaped,role,width,opacity,clip,exclude,phase:phase+k*.71,individual:individualIndex});
  };
  const addWorldWash=(shape,palette,load,role='folded-body',reserves=[],islands=null)=>{
    if(sketch){const mark={shape,role,reserves,islands,individual:individualIndex};washes.push(mark);return mark;}
    const b=bb(shape),mark={shape,points:B([b.x-3,b.y+b.h*.65],[b.x+b.w*.31,b.y+b.h*.25],[b.x+b.w*.7,b.y+b.h*.65],[b.x+b.w+3,b.y+b.h*.4],18),width:Math.max(4,b.h*2.2+8),palette,load,role,reserves,phase,individual:individualIndex,granulation:v[25],wetness:v[26],pooling:v[27],softness:v[28],variation:v[29]};
    if(islands)mark.islands=islands;washes.push(mark);return mark;
  };
  for(let specimen=0;specimen<unitCount;specimen++){
    const local=individualGenome(genome,specimen,unitCount);individuals.push(local);individualIndex=specimen;v=local.values;phase=v[35]*TAU;
    const [ox,oy,scale,lean]=placements[specimen],angle=lean+(v[6]-.5)*.065;
    // Earthstar rays are drawn as a ring foreshortened to 0.29 of its width.
    views[specimen]={pitch:grammar==='earthstar'?Math.asin(.29):null,roll:angle};
    const tr=([x,y])=>[ox+scale*(x*Math.cos(angle)-y*Math.sin(angle)),oy+scale*(x*Math.sin(angle)+y*Math.cos(angle))];
    const line=(p,role='fibres',width=.7,opacity=.55,clip=null,exclude=[])=>addWorldInk(p.map(tr),role,width*scale,opacity,clip?.map(tr),exclude.map(s=>s.map(tr)));
    const wash=(shape,palette=basePal,load=.14,role='folded-body',reserves=[],islands=null)=>addWorldWash(shape.map(tr),palette,load,role,reserves.map(s=>s.map(tr)),islands?.map(s=>s.map(tr)));
    const w=(100+v[0]*52)*(.85+v[2]*.3)*(specimen===0&&unitCount>1?.88:1),h=(240+v[1]*62)*(.84+v[3]*.32),warp=(v[5]-.5)*12;
    let decorationShape=null;
    const unitInkStart=ink.length,unitWashStart=washes.length;
    // Surface ornament is confined to the body receiving it. A donor never
    // replaces attachment, growth habit or the primary body's topology.
    const donorSurface=shape=>{
      if(sketch||!profile.donorSurface)return;
      const named={smooth:'smooth',velvet:'nap',silky:'fibres',warts:'warts',spines:'spines',pitted:'pits',chambered:'pits',labyrinth:'pits',scales:'scales',flakes:'scales',tiles:'scales',shaggy:'fibres',woolly:'fibres',hairy:'fibres',fibrils:'fibres',fringed:'fibres',ragged:'fibres',striated:'ribs',ribbed:'ribs',pleated:'ribs',fluted:'ribs',reticulum:'net',netted:'net',veined:'net',lace:'net',mosaic:'cracks',cracked:'cracks',folds:'folds',folded:'folds',brain:'folds',wrinkled:'folds',ruffled:'folds',zoned:'zones',dots:'dots'};
      const category=named[profile.donorSurface];
      if(!category)throw new RangeError('This donor feature changes body topology and cannot be transferred as surface relief.');
      const box=bb(shape),worldShape=shape.map(tr),isTarget=clip=>clip&&clip.length===worldShape.length&&clip.every((p,k)=>Math.abs(p[0]-worldShape[k][0])<1e-8&&Math.abs(p[1]-worldShape[k][1])<1e-8);
      // Remove old superficial marks before transferring a surface. Structural
      // cup folds, teeth, spores, attachment and outlines remain intact.
      const reliefRoles=new Set(['warts','pits','ribs','ray-cracks','reticulum','surface-relief','chambers']);
      if(['cup','trumpet','nest','jelly'].includes(grammar))reliefRoles.add('folds');
      for(let k=ink.length-1;k>=unitInkStart;k--)if(isTarget(ink[k].clip)&&(reliefRoles.has(ink[k].role)||['smooth','nap'].includes(category)&&ink[k].role==='fibres'))ink.splice(k,1);
      if(category==='smooth'){
        if(grammar==='jelly')for(let k=washes.length-1;k>=unitWashStart;k--)if(washes[k].role==='jelly-fold-shadow')washes.splice(k,1);
        return;
      }
      const islands=[];
      const count=['ribs','folds','zones'].includes(category)?category==='zones'?9:22:category==='nap'?135:68;
      for(let k=0;k<count;k++){
        const x=box.x+box.w*(.07+N(k,501)*.86),y=box.y+box.h*(.1+N(k,502)*.8),r=1.7+N(k,503)*3.5,normal=(x-(box.x+box.w/2))/(box.w/2||1);
        if(category==='ribs'||category==='folds'){
          const u=(k+.4+N(k,504)*.2)/count,xx=box.x+box.w*u;
          line(B([xx,box.y+box.h*.04],[xx+normal*box.w*.07,box.y+box.h*.3],[xx-normal*box.w*.08,box.y+box.h*.68],[xx-normal*box.w*.16,box.y+box.h*.98],27),'surface-ribs',category==='folds'?.75:.46,.25+N(k,505)*.2,shape);
        }else if(category==='zones'){
          const yy=box.y+box.h*(k+1)/(count+1);line(B([box.x,yy],[box.x+box.w*.3,yy+box.h*.05],[box.x+box.w*.7,yy-box.h*.025],[box.x+box.w,yy+box.h*.02],30),'surface-zones',.6,.3,shape);
        }else if(category==='net'||category==='cracks'){
          const col=k%8,row=Math.floor(k/8),xx=box.x+box.w*(col+.12+N(k,506)*.26)/8,yy=box.y+box.h*(row+.2+N(k,507)*.3)/9,dx=box.w/8,dy=box.h/9;
          const p=category==='net'?[[xx,yy],[xx+dx*.55,yy-dy*.42],[xx+dx,yy+dy*.22],[xx+dx*.42,yy+dy*.8],[xx,yy]]:[[xx,yy],[xx+dx*.6,yy+dy*.2],[xx+dx,yy-dy*.25],[xx+dx*.6,yy+dy*.2],[xx+dx*.57,yy+dy*.82]];
          line(p,category==='net'?'surface-reticulum':'surface-cracks',.48,.34,shape);
        }else if(category==='pits'){
          const pit=A(x,y,r*1.4,r*(1.2+N(k,508)),0,TA,17).map(([px,py],q)=>[px+Math.sin(q*.81+k)*r*.17,py+Math.cos(q*.71+k)*r*.13]);
          line(pit.slice(0,12),'surface-pits',.5,.42,shape);islands.push(pit);
        }else if(category==='warts'||category==='spines'){
          const tip=[x+normal*r,y-r*(category==='spines'?2.4:1.1)],left=[x-r,y+r*.2],right=[x+r,y+r*.4];line(B(left,[x-r*.6,y-r*.6],[tip[0]-.4,tip[1]],tip,7),'surface-warts',.38,.29,shape);line(B(tip,[tip[0]+r*.2,tip[1]+r*.5],[x+r,y],right,7),'surface-warts',.52,.45,shape);islands.push([tip,right,[x+r*.3,y+r*.8]]);
        }else if(category==='scales'){
          const flap=[...B([x-r*1.3,y-r*.5],[x-r*.5,y-r],[x+r*.6,y-r*.8],[x+r*1.4,y-r*.4],8),...B([x+r*1.4,y-r*.4],[x+r,y+r*.5],[x+r*.3,y+r*1.2],[x-r*1.3,y-r*.5],9)];line(flap.slice(6),'surface-scales',.52,.4,shape);islands.push(flap);
        }else if(category==='fibres'||category==='nap'){
          const length=category==='nap'?2.5:r*3.5;line(B([x,y],[x+normal*2,y-length*.25],[x+normal*3+1,y-length*.7],[x+normal*4,y-length],9),'surface-fibres',category==='nap'?.3:.4,category==='nap'?.2:.34,shape);
        }else line(B([x,y],[x+r*.35,y-r*.2],[x+r*.6,y+r*.2],[x+r*.7,y+.5],5),'surface-dots',.48,.35,shape);
      }
      if(islands.length)wash(shape,dark,category==='pits'?.17:.07,'surface-relief-shadow',[],islands);
    };
    if(grammar==='cup'||grammar==='nest'||grammar==='trumpet'){
      const isNest=grammar==='nest',isTrumpet=grammar==='trumpet';
      const width=w*(isNest?.9:isTrumpet?[1.18,.66,.9,1.1,.55][j]:[1.18,.65,.78,.87,.72][j]);
      const tall=isTrumpet?h*1.04:isNest?h*.49:h*[.48,.84,.72,.6,.87][j];
      const stalk=!isTrumpet&&(j===2||j===4)?tall*.26:0,cy=-tall,depth=width*(isTrumpet?.34:isNest?.32:j===1?.4:.3);
      const rim=(a,r=1)=>{const wave=1+.025*Math.sin(a*5+phase)+.017*Math.sin(a*9-phase);let x=Math.cos(a)*width*r*wave,y=cy+Math.sin(a)*depth*r+Math.cos(a)*warp;
        if(j===1){x+=Math.sin(a)*width*.15;y+=Math.cos(a*2)*width*.08;}if(j===3)y+=Math.sin(a*5)*width*.055;if(j===4)y+=Math.sin(a*7)*width*.02;return[x,y];};
      const mouth=Array.from({length:97},(_,i)=>rim(i/96*TA));
      const left=rim(Math.PI),right=rim(0),bottom=[warp*.5,-stalk];
      const exterior=[...B(left,[-width*.85,cy+tall*.38],[-width*(isTrumpet?.17:.45),-stalk-10],[bottom[0]-width*(isTrumpet?.08:.15),bottom[1]],25),...B([bottom[0]-width*(isTrumpet?.08:.15),bottom[1]],[width*.12,-stalk+8],[width*(isTrumpet?.18:.45),-stalk-10],right,25),...Array.from({length:49},(_,i)=>rim(-i/48*Math.PI))];
      if(stalk){const stem=[...B([-width*.13,-stalk-6],[-width*.12,-stalk*.5],[-width*.08,-8],[-width*.2,0],20),...B([-width*.2,0],[0,8],[width*.19,2],[width*.19,0],9),...B([width*.19,0],[width*.1,-10],[width*.1,-stalk*.5],[width*.13,-stalk-6],20)];wash(stem,cream,.07,'stem',[exterior]);line(stem,'stem-contour',.85,.6,null,[exterior]);}
      const exteriorPalette=isTrumpet?{paynes:.56,umber:.28,walnut:.16}:isNest?brown:basePal;
      wash(exterior,exteriorPalette,isTrumpet?.22:.15,'folded-body');line(exterior.slice(0,49),'cap-contour',1,.7);
      const eggs=[];
      if(isNest){const count=[5,3,4,6,2][j];for(let k=0;k<count;k++){const a=k/count*TA+.24,rad=k===count-1&&count%2?.12:.48;eggs.push(A(Math.cos(a)*width*rad+warp*.2,cy+Math.sin(a)*depth*rad+depth*.19,width*(j===4?.19:.135),depth*.18,0,TA,27));}}
      wash(mouth,isTrumpet?dark:isNest?{umber:.68,walnut:.32}:basePal,isTrumpet?.49:isNest?.32:.26,'cavity',eggs).cavity=j;
      line(mouth.slice(48),'cap-contour',.64,.5);line(mouth.slice(0,49),'cap-contour',1.12,.72);
      if(!isNest){const bottomCavity=A(warp*.2,cy+depth*.1,width*.36,depth*.34,0,TA,55);wash(bottomCavity,isTrumpet?dark:basePal,isTrumpet?.11:.065,'cavity').cavity=specimen;}
      const ribs=isNest?[22,9,4,17,30][j]:isTrumpet?[16,27,6,22,19][j]:[19,8,4,12,28][j];
      for(let k=0;k<ribs;k++){
        const a=(k+.3+N(k,520)*.4)/ribs*Math.PI,p=rim(a),q=[bottom[0]+Math.cos(a)*width*.09,bottom[1]-2];
        line(B(p,[p[0]*.82,p[1]+tall*.2],[q[0]*1.6,q[1]-tall*.31],q,19),'folds',.45+N(k,521)*.35,.23+Math.sin(a)*.2,exterior,[mouth]);
        if(!isNest&&j!==2){const start=rim(a+Math.PI,.96),end=[start[0]*.32,cy+depth*.21];line(B(start,[start[0]*.83,cy-depth*.1],[start[0]*.52,cy+depth*.14],end,17),'folds',.45,.24,mouth);}
      }
      if(isNest){
        const eggCloud=eggs.flat(),box=bb(eggCloud),region=[[box.x,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h],[box.x,box.y+box.h]];
        wash(region,{ochre:.28,walnut:.72},.09,'peridioles',[],eggs);
        for(const egg of eggs){line(egg.slice(0,23),'peridioles',.72,.66);line(egg.slice(1,13).map(([x,y])=>[x,y+1.3]),'peridioles',.4,.36);}
      }
      if(j===1||j===4){const a=j===1?4.1:5.4,p=rim(a),cut=B(p,[p[0]*.94,p[1]+tall*.12],[p[0]*.85,p[1]+tall*.13],[p[0]*.78,p[1]+tall*.2],17);line(cut,'margin-split',.9,.64,exterior);}
      if(!sketch&&j===3)for(let k=0;k<90;k++){const p=rim((k+.25)/90*TA),dy=4+N(k,523)*8;line(B(p,[p[0]+2,p[1]-dy*.4],[p[0]+5,p[1]-dy*.6],[p[0]+3,p[1]-dy],6),'fibres',.45,.4,null,[mouth]);}
      decorationShape=exterior;morphology={underside:isNest?'peridioles':isTrumpet?'hollow-inner-surface':'upper-cup-surface',ring:false,capAttachment:stalk?'central':'continuous-body'};
    }else if(grammar==='earthstar'){
      const rayCount=[6,9,7,8,10][j],R=w*1.37,inner=w*.45,baseY=-29,rayShapes=[],curl=Math.max(0,.46-local.maturity)*150,aged=clamp((local.maturity-.7)*3);
      for(let k=0;k<rayCount;k++){
        // Geastrum (refs-lib): thick fleshy rays, base 0.12-0.15 of the span.
        const a=k/rayCount*TA+.2,half=Math.PI/rayCount*(j===0?1.05:.8),tipR=R*(.87+N(k,530)*.17),project=(ang,r,y=0)=>[Math.cos(ang)*r,baseY+Math.sin(ang)*r*.29+y];
        const a0=project(a-half,inner),a1=project(a+half,inner),tip=project(a,tipR*(1-curl/420),(j===4?-28:0)-curl*(.6+.4*Math.abs(Math.sin(a))));
        const ray=[...B(a0,project(a-half*.7,inner*1.6),project(a-.18,tipR*.85),tip,17),...B(tip,project(a+.18,tipR*.79),project(a+half*.7,inner*1.6),a1,17)];rayShapes.push(ray);
      }
      const all=rayShapes.flat(),box=bb(all),region=[[box.x,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h],[box.x,box.y+box.h]];
      const rayWash=wash(region,mixPalette({umber:.4,ochre:.4,walnut:.2},{umber:.42,sienna:.42,walnut:.16},aged),.18*(1+.3*aged),'folded-body',[],rayShapes);
      const stemHeight=j===2?45:12,bodyR=w*[.55,.46,.42,.58,.45][j],bodyCy=baseY-stemHeight-bodyR*.78;
      views[specimen]={...views[specimen],rays:R*.955/bodyR};
      const ball=A(warp*.4,bodyCy,bodyR,bodyR*.9,0,TA,97).map(([x,y],i)=>[x+Math.sin(i*.38+phase)*1.5,y+Math.sin(i*.41-phase)*.9]);
      rayWash.reserves.push(ball.map(tr));
      if(j===2){const neck=[[-15,baseY],[-11,bodyCy+bodyR*.8],[12,bodyCy+bodyR*.8],[16,baseY]];wash(neck,cream,.085,'stem');line(neck,'stem-contour',.8,.6,null,[ball]);}
      for(let k=0;k<rayCount;k++){
        line(rayShapes[k],'cap-contour',1,.72,null,[ball]);const a=(k/rayCount)*TA+.2,start=[Math.cos(a)*inner,baseY+Math.sin(a)*inner*.29],tip=rayShapes[k][16];
        line(B(start,[M(start[0],tip[0],.45),M(start[1],tip[1],.45)-6],[M(start[0],tip[0],.7),M(start[1],tip[1],.7)-5],tip,21),'folds',.6,.45,null,[ball]);
        if(j===1||j===3)for(let q=0;q<4;q++){const t=.3+q*.13,p=[M(start[0],tip[0],t),M(start[1],tip[1],t)];line([[p[0]-4,p[1]-2],p,[p[0]+3,p[1]+5]],'ray-cracks',.6,.45,null,[ball]);}
      }
      if(j===0){const collar=A(0,baseY-14,bodyR*1.2,bodyR*.32,0,TA,73).map(([x,y],i)=>[x,y+Math.sin(i/72*TA*13)*3]);wash(collar,cream,.12,'collar',[ball]);line(collar,'veil',.8,.6,null,[ball]);}
      wash(ball,cream,.15,'puffball');line(ball.slice(0,39),'cap-contour',.95,.65);line(ball.slice(45),'cap-contour',.8,.5);
      const pore=A(warp*.4+3,bodyCy-bodyR*.83,bodyR*.11,bodyR*.048,0,TA,29);wash(pore,dark,.75,'aperture');line(pore,'pores',.8,.76);
      for(let k=0;k<86;k++){
        const a=N(k,532)*TA,r=Math.sqrt(N(k,533))*.9,x=warp*.4+Math.cos(a)*bodyR*r,y=bodyCy+Math.sin(a)*bodyR*.9*r;
        if(j===3)line([[x-2,y+1],[x,y-3],[x+2,y+1]],'warts',.5,.4,ball);
        else if(j===4)line([[x-4,y-2],[x+1,y+2],[x+4,y-2]],'reticulum',.43,.37,ball);
        else line(B([x,y],[x+1,y+.5],[x+1.5,y+1],[x+2,y+1],4),'fibres',.42,.23,ball);
      }
      decorationShape=ball;morphology={underside:'enclosed-spore-sac',ring:false,capAttachment:'ray-bearing-peridium'};
    }else if(grammar==='club'){
      const stalks=j===3?4:j===1?2:1,allShapes=[];
      for(let k=0;k<stalks;k++){
        const bias=(k-(stalks-1)/2)*(j===3?29:34),height=h*(.84+N(k+specimen*13,541)*.22),topX=bias+warp+(v[10]-.5)*24,headW=[34,18,39,22,14][j]*(.8+v[8]*.4),headY=-height;
        let shape;
        if(j===1){shape=[...B([bias-7,0],[bias-12,-height*.35],[topX-headW,-height*.61],[topX-headW*1.1,headY+7],24),...B([topX-headW*1.1,headY+7],[topX-headW*1.1,headY-12],[topX-headW*.2,headY-13],[topX-headW*.12,headY+8],14),...B([topX-headW*.12,headY+8],[topX+headW*.1,headY+23],[topX+headW*.2,headY+14],[topX+headW*.35,headY+4],11),...B([topX+headW*.35,headY+4],[topX+headW*.8,headY-18],[topX+headW*1.5,headY-11],[topX+headW*1.2,headY+10],14),...B([topX+headW*1.2,headY+10],[topX+headW,-height*.58],[bias+12,-height*.35],[bias+7,0],24)];}
        else if(j===2){const stem=[...B([bias-8,0],[bias-9,-height*.4],[topX-9,headY+headW],[topX-9,headY+headW*.2],28),...B([topX+9,headY+headW*.2],[topX+9,headY+headW],[bias+9,-height*.4],[bias+8,0],28)];const head=A(topX,headY+headW*.5,headW,headW*1.25,0,TA,81);wash(stem,cream,.09,'stem',[head]);line(stem,'stem-contour',.95,.66,null,[head]);shape=head;}
        else {const top=[topX,headY-(j===4?headW*.9:0)],round=j===4?.1:.85;shape=[...B([bias-8,0],[bias-headW*.35,-height*.4],[topX-headW,headY+height*.2],[topX-headW,headY+headW*round],26),...B([topX-headW,headY+headW*round],[topX-headW,headY-headW*.45],top,top,15),...B(top,[topX+headW*.75,headY-headW*.4],[topX+headW,headY+headW*round],[topX+headW,headY+headW*round],15),...B([topX+headW,headY+headW*round],[topX+headW,-height*.58],[bias+headW*.35,-height*.4],[bias+8,0],26)];}
        allShapes.push(shape);wash(shape,j===0?{ochre:.5,hansa:.35,umber:.15}:basePal,.15,'stem');line(shape,'stem-contour',.9,.65);
        for(let q=0;!sketch&&q<36;q++){const u=(N(q+k*41,543)*2-1)*.85,t=.14+N(q,544)*.75,x=M(bias,topX,t)+u*headW*(.25+.75*t),y=-height*t;line(B([x,y],[x+u*2,y-7],[x+u*3,y-15],[x+u*2,y-26],9),'fibres',.4,.2+Math.abs(u)*.22,shape);}
        if(j===3)for(let q=0;q<11;q++){const y=-height*(.35+q*.05),center=M(bias,topX,-y/height);line(B([center-headW*.65,y],[center-headW*.2,y-5],[center+headW*.2,y+5],[center+headW*.65,y-1],9),'folds',.5,.32,shape);}
      }
      decorationShape=allShapes[allShapes.length-1];morphology={underside:'external-club-surface',ring:false,capAttachment:j===1?'forked-body':'continuous-body'};
    }else if(grammar==='jelly'){
      const width=w*[1.05,.7,1.05,1.14,.62][j],height=h*[.6,.8,.49,.73,.83][j],lobes=[7,3,1,11,6][j];
      const body=Array.from({length:145},(_,q)=>{const a=q/144*TA,r=(1+(j===2?.025:.12)*Math.sin(a*lobes+.7)+.045*Math.sin(a*3-phase))*(1-(j===1?.43*Math.exp(-((a-5.15)**2/.012)):0));return[Math.cos(a)*width*r+Math.sin(a)*warp,-height*.51+Math.sin(a)*height*.5*r];});
      wash(body,j===1?{sienna:.38,umber:.44,rose:.18}:basePal,.19,'folded-body');line(body.slice(0,60),'cap-contour',.85,.57);line(body.slice(64),'cap-contour',1.1,.68);
      const grooves=[],foldCount=[13,5,3,25,17][j];
      for(let q=0;q<foldCount;q++){
        const t=(q+.5)/foldCount,a=t*TA,r=.35+N(q,551)*.5,root=[Math.cos(a)*width*r,-height*.5+Math.sin(a)*height*.44*r],end=[root[0]*.18+warp,-height*.48+Math.sin(a*2)*height*.12];
        const p=B(root,[root[0]*.72+Math.sin(a)*12,root[1]-height*.1],[end[0]+Math.cos(a)*17,end[1]+height*.04],end,24);line(p,'folds',.8,.43,body);
        const other=p.slice().reverse().map(([x,y],k)=>[x+2.5*Math.sin(k/(p.length-1)*Math.PI),y+1]);grooves.push([...p,...other]);
      }
      wash(body,{umber:.5,sienna:.35,walnut:.15},.18,'jelly-fold-shadow',[],grooves);
      if(j===1){const inner=B([-width*.7,-height*.36],[-width*.65,-height*.79],[width*.57,-height*.83],[width*.63,-height*.36],49);line(inner,'folds',1.1,.67,body);}
      decorationShape=body;morphology={underside:'folded-jelly-surface',ring:false,capAttachment:'lateral'};
    }else if(grammar==='tooth'){
      const tufts=j===1?4:j===2?2:j===3?4:j===4?1:3,all=[],teeth=[],cores=[],spineGrow=j===0?clamp(.3+1.25*local.maturity,.45,1.3):1;
      for(let k=0;k<tufts;k++){
        const x=j===1?(k-1.5)*45:(k-(tufts-1)/2)*w*.36,y=-h*.8+(j===0?k*(14+v[5]*34):j===2?k*45:j===3?(k%2)*38:k*9),rx=w*(j===4?.92:j===2?.77:j===0?.42+.2*v[2]:.51),ry=j===4?58:42;
        const core=A(x,y,rx,ry,0,TA,65).map(([px,py],q)=>[px+Math.sin(q*.37+phase)*2.5,py+Math.cos(q*.49)*2]);cores.push(core);all.push(core);
        if(j===1){const branch=[...B([-11,-14],[-10,-h*.34],[x-13,y+80],[x-9,y+17],21),...B([x+9,y+17],[x+13,y+80],[10,-h*.34],[11,-14],21)];all.push(branch);line(branch,'branch',1,.62,null,cores);}
        const count=j===4?97:j===2?59:j===0?72:47;
        for(let q=0;q<count;q++){
          const u=(q+.3+N(q+k*59,560)*.4)/count*2-1,start=[x+u*rx*.98,y+ry*Math.sqrt(Math.max(0,1-u*u))*.35],len=(j===2?27:j===4?133:j===3?98:j===0?104:79)*(1-.4*Math.abs(u))*(.7+N(q,561)*.5)*spineGrow,lean=(N(q,562)-.5)*8,thickness=1.5+N(q,563)*2.5;
          const center=B(start,[start[0]+lean,start[1]+len*.3],[start[0]+lean*1.3,start[1]+len*.74],[start[0]+lean*.7,start[1]+len],17),left=center.map(([px,py],z)=>[px-thickness*(1-z/16),py]),right=center.slice().reverse().map(([px,py],z)=>[px+thickness*z/16,py]);
          teeth.push([...left,...right]);all.push(teeth.at(-1));
          line(q%3===0?center:left,'teeth',q%3===0?.48:.34,.22+N(q,564)*.27);
          if(q%4===0)line(right.slice(0,11),'teeth',.45,.45);
        }
      }
      const cloud=all.flat(),b=bb(cloud),region=[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]];
      wash(region,seedShadePalette(genome.profileId,cream,v,local.maturity),.12*seedShadeLoad(local.maturity),'folded-body',[],all);
      for(const core of cores)line(core.slice(33,63),'cap-contour',.75,.48);
      // Short brush contact under the shoulder models the roots of the teeth.
      wash(region,{umber:.31,ochre:.28,walnut:.41},.065,'tooth-root-shadow',teeth,cores);
      const support=[...B([-39,11],[-48,-h*.3],[-w*.62,-h*.57],[-w*.46,-h*.94],26),...B([-w*.46,-h*.94],[-w*.34,-h*.98],[-w*.14,-h*.95],[-w*.09,-h*.9],12),...B([-w*.09,-h*.9],[-w*.17,-h*.53],[24,-h*.3],[31,10],26)];
      wash(support,{umber:.55,walnut:.35,ochre:.1},.2,'bark',all);line(support,'habitat',1.35,.67,null,all);
      for(let q=0;!sketch&&q<13;q++){const u=q/12,p=B([M(-36,28,u),8],[M(-45,20,u),-h*.3],[M(-w*.59,-w*.17,u),-h*.56],[M(-w*.44,-w*.11,u),-h*.9],34);line(p,'habitat',.4+N(q,567)*.5,.26+N(q,568)*.25,support,all);}
      decorationShape=cores.at(-1);morphology={underside:'pendent-teeth',ring:false,capAttachment:j===1?'branched-lateral':'lateral'};
    }else if(grammar==='saddle'){
      const height=h*.75,width=w*[.94,.82,1.08,.9,.56][j],top=-height;
      const stem=[...B([-20,1],[-28,-height*.3],[-19,-height*.76],[-24,top-10],29),...B([25,top-10],[20,-height*.65],[35,-height*.3],[23,2],29)];
      const cap=j===2?[...B([-width,top],[-width*1.3,top-65],[-width*.5,top-108],[-width*.35,top-59],22),...B([-width*.35,top-59],[-width*.2,top-119],[width*.29,top-124],[width*.42,top-65],22),...B([width*.42,top-65],[width*.92,top-105],[width*1.3,top-40],[width,top],22),...B([width,top],[width*.5,top+30],[-width*.12,top-18],[-width,top],30)]:[...B([-width,top+10],[-width*1.3,top-20],[-width*.6,top-130],[-width*.18,top-45],29),...B([-width*.18,top-45],[width*.12,top+4],[width*.32,top-130],[width*.81,top-72],28),...B([width*.81,top-72],[width*1.3,top-30],[width,top+36],[width*.55,top+17],23),...B([width*.55,top+17],[width*.17,top-1],[-width*.35,top+48],[-width,top+10],29)];
      wash(stem,cream,.11,'stem',[cap]);line(stem,'stem-contour',1,.65,null,[cap]);
      const fluteCount=[7,9,3,11,13][j];
      for(let q=0;q<fluteCount;q++){const u=q/(fluteCount-1)*2-1,p=B([u*22,2],[u*34,-height*.31],[u*20,-height*.73],[u*23,top-9],32);line(p,'flutes',.6+Math.abs(u)*.4,.24+Math.abs(u)*.25,stem,[cap]);}
      wash(cap,basePal,.19,'folded-body');line(cap,'cap-contour',1,.74);
      const crease=B([-width*.88,top+8],[-width*.55,top+24],[-width*.15,top-74],[width*.05,top-39],32),crease2=B([width*.03,top-40],[width*.25,top-12],[width*.59,top+32],[width*.98,top-7],32);
      line(crease,'folds',1.3,.76,cap);line(crease2,'folds',1,.69,cap);
      const shadows=[...crease,...crease.slice().reverse().map(([x,y],q)=>[x,y+10*Math.sin(q/(crease.length-1)*Math.PI)])],shade2=[...crease2,...crease2.slice().reverse().map(([x,y],q)=>[x,y+8*Math.sin(q/(crease2.length-1)*Math.PI)])];
      wash(cap,dark,.14,'saddle-fold-shadow',[],[shadows,shade2]);
      if(j===1)line(B([-12,0],[-16,12],[-8,24],[-13,32],17),'root',.8,.55);
      if(j===3)for(let q=0;q<12;q++){const x=(N(q,570)*2-1)*width*.8,y=top-18-N(q,571)*54;line(A(x,y,7+N(q,572)*8,4+N(q,573)*5,0,Math.PI*1.5,17),'chambers',.6,.36,cap);}
      decorationShape=cap;morphology={underside:'folded-upper-hymenium',ring:false,capAttachment:'lobed-cap-on-fluted-stem'};
    }else if(grammar==='stinkhorn'){
      // Phallus impudicus (refs-lib): the stipe is 2.6-3.2 cap widths tall and
      // 0.7-0.77 of the cap width, so the head is a narrow thimble on a stout
      // white stipe, not a wide hood on a pole.
      const height=h*(j===4?1.2:1),radius=j===0?height/(7.2+2.6*v[8]):[24,22,28,22,15][j]*(.8+v[8]*.4),topX=warp*1.5+(j===0?(v[10]-.5)*height*.16:0),top=-height;
      const stem=[...B([-radius,2],[-radius*1.2,-height*.26],[topX-radius,top+height*.16],[topX-radius*.8,top-14],34),...B([topX-radius*.8,top-14],[topX-radius*.7,top-33],[topX+radius*.7,top-33],[topX+radius*.8,top-14],17),...B([topX+radius*.8,top-14],[topX+radius,top+height*.16],[radius*1.2,-height*.26],[radius,2],34)];
      // The volva cup is 1.0-1.2 stipe widths across.
      const egg=A(0,-14,radius*(j===0?1.2:1.7),radius*(j===0?1.0:1.3),0,TA,73),eggUpper=egg.slice(37).map(([x,y],q)=>[x,y+Math.sin(q*.85)*3]);
      wash(stem,cream,.09,'stem',[egg]);line(stem,'stem-contour',.95,.68,null,[egg]);
      const hoodW=radius*[1.4,2.1,1.18,1.9,1.2][j],hoodH=j===0?Math.max(70,hoodW*2.3-27):j===2?45:j===4?79:90,hood=[...B([topX-hoodW,top+27],[topX-hoodW*1.1,top-hoodH*.2],[topX-hoodW*.7,top-hoodH],[topX,top-hoodH],31),...B([topX,top-hoodH],[topX+hoodW*.7,top-hoodH],[topX+hoodW*1.05,top-hoodH*.2],[topX+hoodW,top+27],31),...B([topX+hoodW,top+27],[topX+hoodW*.3,top+40],[topX-hoodW*.3,top+29],[topX-hoodW,top+27],22)];
      // Slimed Phallus head: dark olive gleba (#2a4233 to #7d7554).
      wash(hood,j===0?seedShadePalette(genome.profileId,{sapgreen:.42,paynes:.28,umber:.3},v,local.maturity):{umber:.45,sapgreen:.3,ochre:.25},j===2?.23:j===0?.46*seedShadeLoad(local.maturity):.4,'folded-body');line(hood,'cap-contour',1.1,.78);
      if(j===0){
        // Phallus impudicus: a reticulate head, ridges forming polygonal cells
        // filled with dark olive gleba, and a white perforate ring at the apex.
        // Fine honeycomb: pits 0.04-0.08 of the head, so 9 rows of 10 cells.
        const rows=9,cols=10,node=(c,r)=>{const u=caClamp(((c+(r%2)*.5)/cols)*2-1+(N(c*13+r,594)-.5)*.12,-.96,.96),t=r/(rows-1);return[topX+u*hoodW*(.62+.38*Math.sin(Math.PI*(.15+.85*t)))*.96,top-hoodH*.88+t*hoodH*.98+(N(c*7+r,595)-.5)*5];};
        const cells=[];
        for(let r=0;r<rows;r++)for(let c=0;c<=cols;c++){
          const a=node(c,r);
          if(!sketch&&c<cols){const z=node(c+1,r),bow=(N(c+r*9,596)-.5)*4;line(B(a,[M(a[0],z[0],.33),M(a[1],z[1],.33)+bow],[M(a[0],z[0],.66),M(a[1],z[1],.66)-bow],z,7),'pits',.5+N(c+r*9,597)*.3,.5+N(c+r*9,598)*.25,hood);}
          if(!sketch&&r<rows-1){const z=node(c,r+1),bow=(N(c*5+r,599)-.5)*4;line(B(a,[M(a[0],z[0],.33)+bow,M(a[1],z[1],.33)],[M(a[0],z[0],.66)-bow,M(a[1],z[1],.66)],z,7),'pits',.5+N(c*5+r,600)*.3,.5+N(c*5+r,601)*.25,hood);}
          if(c<cols&&r<rows-1){const q=[node(c,r),node(c+1,r),node(c+1,r+1),node(c,r+1)],m=[(q[0][0]+q[2][0])/2,(q[0][1]+q[2][1])/2];cells.push(q.map(([x,y])=>[M(x,m[0],.2),M(y,m[1],.2)]));}
        }
        if(!sketch)wash(hood,{sapgreen:.35,umber:.45,paynes:.2},.32,'pit-shadow',[],cells);
        const apex=A(topX,top-hoodH+4,hoodW*.2,4,0,TA,19);line(apex,'veil',.7,.6,null);
      }else if(j===3){for(let q=0;!sketch&&q<84;q++){const x=topX+(N(q,580)*2-1)*hoodW*.9,y=top-hoodH*.84+N(q,581)*hoodH*.98,rx=3+N(q,582)*4,ry=4+N(q,583)*5;
        // Gleba chambers: each pit is one hand-drawn lip, open on a varying
        // side, with a wobbling radius; never a closed repeated ellipse.
        const a0=N(q,588)*TA,sweep=Math.PI*(.7+N(q,589)*.75),pts=A(x,y,rx*(.8+N(q,590)*.5),ry,a0,a0+sweep,11).map(([px,py],k)=>[px+(valueNoise(q*1.37,k*.61)-.5)*rx*.55,py+(valueNoise(k*.53+7,q*1.19)-.5)*ry*.5]);
        line(pts,'pits',.32+N(q,591)*.4,.3+N(q,592)*.3,hood);}}
      else if(j===4)for(let q=0;q<15;q++){const u=(q+.5)/15*2-1;line(B([topX+u*hoodW*.7,top-hoodH*.9],[topX+u*hoodW*.95,top-hoodH*.4],[topX+u*hoodW*.98,top],[topX+u*hoodW,top+25],20),'ribs',.65,.51,hood);}
      for(let q=0;!sketch&&q<94;q++){const t=N(q,584)*.91,u=N(q,585)*2-1,x=M(0,topX,t)+u*radius,y=-height*t;const a0=Math.PI*(.1+N(q,588)*.9),sweep=Math.PI*(.5+N(q,589)*.8);line(A(x,y,1+N(q,586)*1.4,1.6+N(q,587)*2.6,a0,a0+sweep,6),'stipe-pores',.28+N(q,590)*.3,.16+Math.abs(u)*.18,stem,[hood,egg]);}
      if(j===1||j===3){
        const skirtH=height*(j===1?.7:.5),skirtW=radius*(j===1?4.5:3.3),neckY=top+22;
        const skirt=[...B([topX-radius,neckY],[topX-radius*1.7,neckY+skirtH*.4],[-skirtW,neckY+skirtH*.85],[-skirtW,neckY+skirtH],29),...B([-skirtW,neckY+skirtH],[-skirtW*.4,neckY+skirtH+9],[skirtW*.5,neckY+skirtH-5],[skirtW,neckY+skirtH],27),...B([skirtW,neckY+skirtH],[skirtW,neckY+skirtH*.85],[topX+radius*1.7,neckY+skirtH*.4],[topX+radius,neckY],29)];
        // Two families of curving lattice strands leave actual paper holes.
        const netShapes=[];
        for(let q=-8;q<=8;q++)for(const dir of [-1,1]){
          const path=Array.from({length:35},(_,i)=>{const t=i/34,width=M(radius,skirtW,t**.8),u=q/8+dir*(t-.5)*.7;return[M(topX,0,t)+u*width,neckY+t*skirtH];});
          const ribbon=[...path,...path.slice().reverse().map(([x,y])=>[x+1.6,y+.8])];netShapes.push(ribbon);line(path,'veil',.65,.41,skirt,[hood]);
        }
        wash(skirt,cream,.1,'lace-veil',[hood],netShapes);line(skirt.slice(29,56),'veil',.6,.5);
      }
      wash(egg,cream,.095,'puffball');line(egg.slice(0,37),'veil',.95,.68);line(eggUpper,'veil',.9,.64);
      const slit=B([-radius*1.4,-radius*.7],[-radius*.7,-radius*.8],[radius*.4,-radius*.15],[radius*1.5,-radius*.65],28);line(slit,'veil',.65,.5,egg);
      decorationShape=hood;morphology={underside:'gleba-bearing-head',ring:false,capAttachment:'egg-based-stipe'};
    }
    if(decorationShape)donorSurface(decorationShape);
    soilObjects.push({ox,oy,scale,wood});
  }
  // Marks meet the living bases; a shallow connected shadow anchors each study.
  for(let n=0;!sketch&&n<soilObjects.length;n++){
    const {ox,oy,scale,wood}=soilObjects[n],span=(grammar==='earthstar'?175:wood?115:72)*scale;
    const patch=A(ox,oy+5,span,12*scale,0,TA,59).map(([x,y],i)=>[x,y+Math.sin(i*.9+phase)*2]);
    addWorldWash(patch,wood?brown:{umber:.54,ochre:.32,sapgreen:.14},wood?.105:.055,'ground');
    for(let q=0;q<78;q++){
      const x=ox+(N(q+n*89,590)*2-1)*span,y=oy+3+(N(q,591)*2-1)*10,len=2+N(q,592)*8;
      addWorldInk(B([x,y],[x+len*.3,y-1.5],[x+len*.6,y+1],[x+len,y-1],5),'habitat',.4+N(q,593)*.65,.2+N(q,594)*.4);
    }
    if(wood)for(let q=0;q<9;q++){const y=oy+(q-4)*2;addWorldInk(B([ox-span,y],[ox-span*.4,y-4],[ox+span*.4,y+4],[ox+span,y-1],21),'habitat',.7,.35);}
  }
  return {ink,washes,morphology,specimenCount:unitCount,individuals,views,habitat:{id:wood?'hardwood-attachment':'woodland-soil',substrate:wood?'decaying hardwood':'soil',trees:wood?['beech','oak']:['oak','beech'],groundCover:wood?['bark']:['humus','leaves']}};
}

// Catalog recipes share primitives, but transfer actual anatomy rather than colors.
function decorateCatalog(study,genome,sketch=false){
  const p=genome.phenotype,v=genome.values,phase=v[35]*TAU;
  const typeId=`${p.grammar}-${p.variant+1}`;
  // A hybrid's species details follow the parent that supplied each module.
  const src=p.sources??{},hymType=src.hymenium??typeId,stemType=src.stem??typeId,surfType=src.surface??typeId,colourType=src.colour??typeId,hymGrammar=TYPES_BY_ID.get(hymType)?.grammar??p.grammar;
  let detailGenome=genome,detailIndividual=null,inheritedRelief=false;
  const selectIndividual=mark=>{
    detailIndividual=mark.individual;
    detailGenome=study.individuals?.[detailIndividual]??genome;
  };
  const add=(points,role,width=.65,opacity=.45,clip=null,exclude=[])=>{
    if(role==='surface-relief'&&surfType!==typeId&&inheritedRelief){width*=1.6;opacity=Math.min(1,opacity*1.5);}
    const mark={points,role,width,opacity,clip,exclude,individual:detailIndividual,phase:detailGenome.values[35]*TAU+study.ink.length*.63};
    if(sketch)study.ink.push(mark);else penGestures(study.ink,mark);
  };
  const wash=(shape,palette,load,role,islands=null,reserves=[])=>{
    if(sketch){const mark={shape,role,islands,reserves,individual:detailIndividual};study.washes.push(mark);return mark;}
    const v=detailGenome.values,phase=v[35]*TAU;
    const b=bounds(shape),points=curve([b.x-2,b.y+b.h*.5],[b.x+b.w*.3,b.y+b.h*.25],[b.x+b.w*.7,b.y+b.h*.7],[b.x+b.w+2,b.y+b.h*.5],20);
    const mark={shape,points,width:b.h*2.4+8,palette,load,role,islands,reserves,phase,individual:detailIndividual,granulation:v[25],wetness:v[26],pooling:v[27],softness:v[28],variation:v[29]};study.washes.push(mark);return mark;
  };
  // Carry grown sites through the cap's existing surface projection. A fallback
  // remains for body grammars without a surface mesh; no new veins are added.
  const projectSite=(mark,u,t)=>{
    const surface=mark.surface;
    if(surface?.kind==='cap'){
      const rails=surface.rails,n=rails.length-1,q=clamp((u+1)*.5)*n,i=Math.min(n-1,Math.floor(q));
      const rowAt=index=>{
        if(!surface.mesh)return rails[index][0].map((v,k)=>mix(v,rails[index][1][k],t));
        const row=surface.mesh[index],r=clamp(t)*(row.length-1),j=Math.min(row.length-2,Math.floor(r));
        return row[j].map((v,k)=>mix(v,row[j+1][k],r-j));
      };
      const a=rowAt(i),b=rowAt(i+1);return a.map((v,k)=>mix(v,b[k],q-i));
    }
    const b=bounds(mark.shape);return[b.x+(u+1)*.5*b.w,b.y+t*b.h];
  };
  const oval=(x,y,rx,ry,n=25)=>Array.from({length:n},(_,i)=>{const a=i/(n-1)*TAU;return[x+Math.cos(a)*rx,y+Math.sin(a)*ry];});
  // Replace inherited surface marks where a recipe explicitly changes the tissue.
  if(p.family==='morel'&&!['pitted','chambered','labyrinth','ribbed'].includes(p.surface)){study.ink=study.ink.filter(m=>m.role!=='pits');study.washes=study.washes.filter(m=>m.role!=='pit-shadow');}
  if(p.family==='puffball'&&p.surface!=='spines'){
    study.ink=study.ink.filter(m=>m.role!=='spines');study.washes=study.washes.filter(m=>m.role!=='spine-shadows');
  }
  if(['parasol','inkcap'].includes(p.family)&&!['scales','shaggy','tiles'].includes(p.surface)){
    study.ink=study.ink.filter(m=>m.role!=='scales');study.washes=study.washes.filter(m=>m.role!=='scales');
  }
  if(p.family==='bracket'&&p.surface!=='zoned'){
    study.ink=study.ink.filter(m=>m.role!=='bands');study.washes=study.washes.filter(m=>m.role!=='growth-band');
  }
  const surfaceMarks=sketch?[]:study.washes.filter(m=>['cap','funnel-cap','puffball'].includes(m.role));inheritedRelief=true;
  const sourceSurface={amanita:'warts',parasol:'scales',inkcap:'shaggy',bracket:'zoned',puffball:'spines',morel:'pitted'}[p.grammar];
  for(const mark of surfaceMarks){
    selectIndividual(mark);
    const local=study.individuals?.[mark.individual],v=local?.values??genome.values,phase=v[35]*TAU;
    const stage=local?.maturity??.6;mark.palette=seedShadePalette(colourType,{...TYPE_PALETTES[p.palette]},v,stage);mark.load*=(.79+v[21]*.42)*seedShadeLoad(stage);
    // An inherited cap colour arrives at full strength, not as a tint.
    if(colourType!==typeId)mark.load=Math.max(mark.load,hybridCapLoad(colourType));
    // Scarlet optical weathering belongs only to a scarlet cap.
    if(p.palette!=='scarlet')delete mark.species;
    const b=bounds(mark.shape),cx=b.x+b.w*.5,cy=b.y+b.h*.46;
    if(p.surface===sourceSurface||p.surface==='smooth')continue;
    const shadows=[],reserve=[];
    const relief=['scales','shaggy','flakes','tiles','warts','woolly','spines','pitted','chambered','dots','mosaic','netted','reticulum','cracked','labyrinth'].includes(p.surface);
    const net=['mosaic','netted','reticulum','cracked','labyrinth'].includes(p.surface);
    const ridged=['pleated','ribbed','striated','fluted','folds','forked','veined','zoned','ruffled'].includes(p.surface);
    if(net){
      // A connected warped mesh, projected into the cap plane, rather than isolated crack symbols.
      const rows=9,cols=13,node=(r,c)=>{
        const u=c/(cols-1),t=r/(rows-1),j=sample(r*cols+c,301+p.variant),k=sample(r*cols+c,302);
        const site=growSurfacePoint(detailGenome,(u+(j-.5)*.12)*2-1,t+(k-.5)*.13,301);
        return projectSite(mark,...site);
      };
      // Hand-drawn areolae: only some walls are inked, so cells merge into
      // patches of unequal size; walls are bowed, broken and start late or
      // stop short, and they gather and darken on the shaded, marginal side.
      const salt=(mark.individual??0)*37+p.variant*11;
      const wall=(a,z,id)=>{
        const mid=[(a[0]+z[0])/2,(a[1]+z[1])/2],shade=lightShade(mid[0],mid[1],b);
        if(sample(id,341+salt)>.18+.82*shade*shade)return;
        const dx=z[0]-a[0],dy=z[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
        const bow=(sample(id,342+salt)-.5)*len*.32,kink=(sample(id,343+salt)-.5)*len*.22;
        const path=curve(a,[mix(a[0],z[0],.33)+nx*(bow+kink),mix(a[1],z[1],.33)+ny*(bow+kink)],[mix(a[0],z[0],.66)+nx*(bow-kink*.6),mix(a[1],z[1],.66)+ny*(bow-kink*.6)],z,10);
        const from=Math.floor(sample(id,344+salt)*3),to=10-Math.floor(sample(id,345+salt)*3),width=(.26+v[19]*.3)*(.7+.75*shade),opacity=.14+.38*shade;
        if(sample(id,346+salt)<.3&&to-from>5){const gap=from+2+Math.floor(sample(id,347+salt)*(to-from-4));add(path.slice(from,gap),'surface-relief',width,opacity,mark.shape,mark.reserves);add(path.slice(gap+1,to+1),'surface-relief',width*.8,opacity*.85,mark.shape,mark.reserves);}
        else add(path.slice(from,to+1),'surface-relief',width,opacity,mark.shape,mark.reserves);
      };
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const a=node(r,c);
        if(c<cols-1)wall(a,node(r,c+1),r*cols+c);
        if(r<rows-1)wall(a,node(r+1,c),500+r*cols+c);
      }
    }else if(ridged){
      for(let i=0;i<65;i++){
        const u=(i+.2+sample(i,304)*.6)/65,theta=u*Math.PI,xx=b.x+b.w*u;
        const start=[mix(cx,xx,.16),b.y+b.h*.16],end=[xx,b.y+b.h*(.78+.18*Math.sin(theta))];
        const pts=curve(start,[mix(cx,xx,.4),b.y+b.h*.33],[xx+(valueNoise(i*.09,phase)-.5)*8,b.y+b.h*.65],end,22);
        add(pts,'surface-relief',.35+v[19]*.45,.19+Math.abs(u-.5)*.3,mark.shape,mark.reserves);
      }
    }else{
      const count=relief?115:190;
      for(let i=0;i<count;i++){
        const salt=(mark.individual??0)*179,site=growSurfacePoint(detailGenome,(.03+sample(i,310+p.variant+salt)*.94)*2-1,.03+sample(i,311+salt)*.94,310),
          u=(site[0]+1)*.5,t=site[1],[x,y]=projectSite(mark,...site);
        const rx=(1.2+sample(i,312)*3.7)*(b.w/350)*(.5+.5*Math.sin(u*Math.PI)),ry=(1.2+sample(i,313)*3.5)*(b.h/180);
        const angle=Math.atan2(y-b.y,x-cx)*.35,dx=Math.sin(angle)*rx*.4;
        if(relief){
          const tooth=p.surface==='spines'||p.surface==='shaggy';
          const loop=Array.from({length:19},(_,j)=>{const a=j/18*TAU,r=1+.17*Math.sin(a*3+i)+.1*Math.sin(a*7+phase);return[x+Math.cos(a)*rx*r+dx*Math.sin(a),y+Math.sin(a)*ry*r-(tooth?Math.max(0,-Math.sin(a))**5*ry*2:0)];});
          const low=loop.slice(0,10),shade=lightShade(x,y,b);
          // Only the shaded lower lip of each wart or pit is inked, and only
          // where the light falls off; lit ones are left to the wash alone.
          if(sample(i,317+salt)<.22+.78*shade){
            const from=1+Math.floor(sample(i,318)*3),to=7+Math.floor(sample(i,319)*3);
            add(low.slice(from,to+1),'surface-relief',.22+.42*shade,.16+.38*shade,mark.shape,mark.reserves);
            if(shade>.62&&sample(i,320)<.35)add(loop.slice(13,17),'surface-relief',.22,.12,mark.shape,mark.reserves);
          }
          shadows.push([...low,...low.slice().reverse().map(([a,b])=>[a+.5,b+1.4])]);
          if(['warts','flakes','spines','shaggy'].includes(p.surface))reserve.push(loop);
        }else{
          const reach=(p.surface==='velvet'?2:7)+sample(i,314)*(p.surface==='velvet'?4:21),slope=(x-cx)/b.w*.8,shade=lightShade(x,y,b);
          if(sample(i,316+salt)>.2+.8*shade)continue;
          add(curve([x,y],[x-slope*reach*.3,y-reach*.3],[x-slope*reach*.7+1,y-reach*.7],[x-slope*reach,y-reach],10),'surface-relief',(.2+sample(i,315)*.25)*(.7+.6*shade),(.1+Math.abs(u-.5)*.25)*(.6+.8*shade),mark.shape,mark.reserves);
        }
      }
    }
    if(reserve.length)mark.reserves=[...(mark.reserves??[]),...reserve];
    if(shadows.length)wash(mark.shape,{umber:.48,paynes:.22,ochre:.3},(.11+v[24]*.07)*(surfType!==typeId?2:1),'relief-shadow',shadows,mark.reserves);
  }
  inheritedRelief=false;
  // A compatible donor changes the actual hymenium, keeping the host attachment.
  // Bonnet, waxcap and fieldcap forms also receive their characteristic gill spacing.
  const needsHymenium=!sketch&&(genome.inheritance?.includes('gills / pores / teeth')||['bonnet','waxcap','agaric','milkcap','hedgehog'].includes(p.grammar));
  if(needsHymenium){
    const templates=study.ink.filter(m=>['gills','pores','folds'].includes(m.role));
    const regions=[];for(const t of templates)if(t.clip&&!regions.some(r=>r.clip===t.clip))regions.push(t);
    study.ink=study.ink.filter(m=>!['gills','pores','folds','lamella-shadow'].includes(m.role));
    study.washes=study.washes.filter(m=>m.role!=='fold-shadow');
    for(const region of regions){
      selectIndividual(region);
      const b=bounds(region.clip),cx=b.x+b.w*.5,cy=b.y+b.h*.15;
      const count=p.hymenium==='teeth'?(hymType==='hedgehog-1'?420:185):p.hymenium==='pores'?310:hymGrammar==='waxcap'?38:p.hymenium==='folds'?26:104;
      for(let i=0;i<count;i++){
        if(p.hymenium==='teeth'||p.hymenium==='pores'){
          // Hydnum repandum (refs-lib): conical spines on a staggered grid,
          // spacing 0.034 and length 0.03-0.04 of the cap width.
          const hydnum=hymType==='hedgehog-1'&&p.hymenium==='teeth',sp=b.w*.034,cols=Math.max(1,Math.floor(b.w/sp)),gr=Math.floor(i/cols),gc=i%cols;
          const x=hydnum?b.x+(gc+.5+(gr%2)*.5+(sample(i,330)-.5)*.3)*sp:b.x+sample(i,330)*b.w,y=hydnum?b.y+(gr+.3)*sp*1.25+(sample(i,331)-.5)*sp*.2:b.y+sample(i,331)*b.h;
          if(hydnum){if(y>b.y+b.h)continue;const len=b.w*(.03+.012*sample(i,332))*2,w=len*.17;add([[x-w,y],[x-w*.35,y+len*.6],[x+(sample(i,334)-.5)*w*.4,y+len],[x+w*.35,y+len*.6],[x+w,y]],'teeth',.5,.5,region.clip,region.exclude);continue;}
          if(p.hymenium==='teeth'){
            const len=(3+sample(i,332)*12)*(b.w/(hymType==='hedgehog-1'?110:500)),w=(hymType==='hedgehog-1'?1:.7)+sample(i,333)*1.4;
            add(curve([x-w,y],[x-w*.5,y+len*.55],[x+.2,y+len],[x+w,y],12),'teeth',.5,.53,region.clip,region.exclude);
          }else{const k=hymType!==typeId?1.8:1;add(oval(x,y,(.9+sample(i,332))*k,(.65+sample(i,333))*k,9).slice(1,8),'pores',.4*(k>1?1.3:1),.45*(k>1?1.25:1),region.clip,region.exclude);}
        }else{
          const kind=sample(i,336),a=(i+.5+(sample(i,334)-.5)*1.1)/count*Math.PI,r=kind<.45?.06:kind<.7?.22+sample(i,337)*.2:.45+sample(i,338)*.3;
          const edge=[cx+Math.cos(a)*b.w*.5,b.y+b.h*(.2+.8*Math.sin(a))],bend=(valueNoise(i*.11,phase)-.5)*b.w*.04;
          const start=[mix(cx,edge[0],r),mix(cy,edge[1],r)];
          const blade=curve(start,[mix(cx,edge[0],.4)+bend,mix(cy,edge[1],.38)],[mix(cx,edge[0],.77)+bend,mix(cy,edge[1],.8)],edge,24);
          add(blade,p.hymenium==='folds'?'folds':'gills',p.hymenium==='folds'?1.25:.6,.48+sample(i,335)*.2,region.clip,region.exclude);
          // An occasional gill forks near the margin.
          if(p.hymenium!=='folds'&&sample(i,339)<.12){const q=blade[15],tip=[edge[0]+Math.sin(a)*b.w*.02,edge[1]+2];add(curve(q,[mix(q[0],tip[0],.4),mix(q[1],tip[1],.35)],[mix(q[0],tip[0],.8),mix(q[1],tip[1],.8)],tip,10),'gills',.45,.42,region.clip,region.exclude);}
        }
      }
    }
  }
  // An inherited hymenium keeps the donor's own colour, so it reads at once.
  if(!sketch&&hymType!==typeId){
    const tone=p.hymenium==='pores'?{ochre:.42,sapgreen:.3,hansa:.28}:p.hymenium==='teeth'?{ochre:.62,sienna:.24,umber:.14}:p.hymenium==='folds'?{...TYPE_PALETTES[TYPES_BY_ID.get(hymType)?.palette]??TYPE_PALETTES.ochre}:{ochre:.4,umber:.25,paynes:.35};
    for(const m of study.washes.filter(m=>m.role==='underside'||m.role==='gill-face')){m.palette={...tone};m.load=Math.max(m.load,p.hymenium==='gills'?.1:.16);}
  }
  study.morphology={...study.morphology,grammar:p.grammar,surface:p.surface,capShape:p.capShape,stemForm:p.stemForm,hymenium:p.hymenium,ring:['ring','double-ring'].includes(p.veil)};
  // Beta species details (field-guide features).
  if(!sketch&&BETA_PALETTES[colourType]){
    // The species colour reaches every body passage; pale species stay pale.
    const pale=['ivory'].includes(p.palette);
    for(const m of study.washes.filter(m=>['cap','funnel-cap','puffball','folded-body'].includes(m.role))){m.palette={...TYPE_PALETTES[p.palette]};if(pale)m.load*=.32;}
  }
  if(!sketch){
    // Lactarius: pale crowded gills under the salmon cap.
    if(hymType==='milkcap-1')for(const m of study.washes.filter(m=>['underside','folded-body','fold-shadow'].includes(m.role))){m.palette={ochre:.55,rose:.15,umber:.3};m.load=Math.min(m.load,.08);}
    // Agaricus campestris: gills pink to chocolate under a white cap.
    if(hymType==='agaric-1')for(const m of study.washes.filter(m=>m.role==='underside'||m.role==='gill-face')){m.palette={rose:.42,umber:.42,sienna:.16};m.load=Math.max(m.load,.16);}
    // Phallus: white spongy stipe and a pale egg-white volva.
    if(typeId==='stinkhorn-1')for(const m of study.washes.filter(m=>/stem|stalk|egg|volva/.test(m.role))){m.palette={ochre:.5,umber:.2,paynes:.3};m.load=Math.min(m.load,.06);}
    // Hydnum: pale spines hang densely from the whole underside.
    if(hymType==='hedgehog-1')for(const m of study.washes.filter(m=>m.role==='underside')){m.palette={ochre:.6,sienna:.25,umber:.15};m.load=Math.max(m.load,.12);}
    // Hygrocybe (refs-lib): only 40-60 thick, waxy yellow gills, not dense
    // hairlines: fine underside strokes go, half the gills stay, drawn heavier.
    if(hymType==='waxcap-1'){
      const under=new Set(study.washes.filter(m=>m.role==='underside'||m.role==='gill-face').map(m=>m.shape));
      let n=0;study.ink=study.ink.filter(m=>!(m.role==='fibres'&&under.has(m.clip))&&!(m.role==='gills'&&n++%2===1));
      for(const m of study.ink)if(m.role==='gills'){m.width*=2.1;m.opacity=Math.min(1,m.opacity*1.15);}
      for(const m of study.washes.filter(m=>m.role==='underside'||m.role==='gill-face')){m.palette={hansa:.45,ochre:.42,sienna:.13};m.load=Math.max(m.load,.16);}
    }
    if(stemType==='waxcap-1')for(const m of study.washes.filter(m=>m.role==='stem')){m.palette={hansa:.42,ochre:.45,sienna:.13};m.load=Math.max(m.load,.08);}
    // Amanita muscaria (refs-lib): 2-4 shaggy concentric scale rings over the
    // lower 15-25% of the stem, above the bulb.
    // Only each specimen's stipe wash (its first), not the bulb's.
    if(stemType==='amanita-1')for(const m of study.washes.filter((m,i,all)=>m.role==='stem'&&Number.isInteger(m.individual)&&all.findIndex(o=>o.role==='stem'&&o.individual===m.individual)===i)){
      selectIndividual(m);const b=bounds(m.shape);
      for(let k=0;k<3;k++){const y=b.y+b.h*(.62+.07*k),near=m.shape.filter(q=>Math.abs(q[1]-y)<b.h*.025),xs=near.length>1?near.map(q=>q[0]):[b.x,b.x+b.w],x0=Math.min(...xs),x1=Math.max(...xs),sw=x1-x0;
        const ring=curve([x0-sw*.04,y],[mix(x0,x1,.3),y+sw*.16],[mix(x0,x1,.7),y+sw*.16],[x1+sw*.04,y],16);add(ring,'ring',.75,.6,null,[]);
        for(let i=0;i<9;i++){const q=ring[1+Math.floor(i/8*14)],len=sw*(.05+.06*sample(i+k*17+(m.individual??0)*31,441));add([q,[q[0]+(sample(i+k*7,442)-.5)*len*.6,q[1]+len]],'ring',.45,.5,null,[]);}}
    }
    // Argon (global point 3) for morel-1: fine
    // outer contours (about half the width, lighter) and denser interior
    // form hatching that follows each body's own shape.
    if(typeId==='morel-1'){
      for(const m of study.ink)if(/^(cap-contour|stem-contour)$/.test(m.role)){m.width*=.55;m.opacity*=.8;}
      for(const m of study.washes.filter(m=>['cap','funnel-cap','stem'].includes(m.role)&&Number.isInteger(m.individual)&&!(m.islands?.length>1))){
        selectIndividual(m);const b=bounds(m.shape),stem=m.role==='stem',n=stem?22:34;
        for(let k=0;k<n;k++){const f=(k+.5)/n,salt=(m.individual??0)*53+k;
          const pts=stem?curve([b.x+b.w*(.55+.4*f),b.y+b.h*.05],[b.x+b.w*(.57+.38*f),b.y+b.h*.35],[b.x+b.w*(.56+.39*f),b.y+b.h*.7],[b.x+b.w*(.55+.4*f),b.y+b.h*.97],10)
            :curve([b.x+b.w*.04,b.y+b.h*f],[b.x+b.w*.35,b.y+b.h*(f-.05*Math.sin(f*3))],[b.x+b.w*.65,b.y+b.h*(f-.05*Math.sin(f*3))],[b.x+b.w*.96,b.y+b.h*(f+.02)],12);
          const keep=stem?1:.55+.45*f;add(pts.slice(Math.floor(sample(salt,481)*3),pts.length-Math.floor(sample(salt,482)*3)),'cap-fibres',.3+.1*sample(salt,483),(.16+.16*f)*keep,m.shape,m.reserves);}
      }
    }
    // Morchella (Argon): the cap rim overhangs the stipe insertion and casts a
    // crisp arched shadow across the top of the stipe.
    if(typeId==='morel-1')for(const m of study.washes.filter((m,i,all)=>m.role==='stem'&&Number.isInteger(m.individual)&&all.findIndex(o=>o.role==='stem'&&o.individual===m.individual)===i)){
      selectIndividual(m);const b=bounds(m.shape),top=b.y+2,near=m.shape.filter(q=>Math.abs(q[1]-top-6)<8),xs=near.length>1?near.map(q=>q[0]):[b.x,b.x+b.w],x0=Math.min(...xs),x1=Math.max(...xs),d=(x1-x0)*.16;
      const shade=[...curve([x0,top],[mix(x0,x1,.3),top+d*1.2],[mix(x0,x1,.7),top+d*1.2],[x1,top],14),...curve([x1,top+d*.4],[mix(x0,x1,.7),top+d*2],[mix(x0,x1,.3),top+d*2],[x0,top+d*.4],14)];
      wash(shade,{umber:.55,paynes:.3,walnut:.15},.26,'stem-shadow',null,m.reserves);
      add(curve([x0-d,top-1],[mix(x0,x1,.3),top+d*.9],[mix(x0,x1,.7),top+d*.9],[x1+d,top-1],14),'cap-contour',.5,.5,null,[]);
    }
    // Cantharellus (refs-lib): blunt, thick forked ridges rather than thin lines.
    if(hymType==='chanterelle-1')for(const m of study.ink)if(m.role==='folds'){m.width*=1.9;m.opacity=Math.min(1,m.opacity*1.2);}
  }
  // Armillaria: dark erect hairy scales crowd the disc, and a cottony ring
  // hangs high on each stipe.
  if(!sketch&&(surfType==='agaric-4'||stemType==='agaric-4')){
    if(surfType==='agaric-4')for(const m of study.washes.filter(m=>m.role==='cap'&&Number.isInteger(m.individual))){
      selectIndividual(m);const b=bounds(m.shape),salt=(m.individual??0)*311;
      for(let i=0;i<90;i++){const site=[(sample(i+salt,421)*2-1)*.8,.12+.7*sample(i+salt,422)**1.3],q=projectSite(m,...site),r=(3.5+6*sample(i+salt,423))*(b.w/300),k=1-site[1];
        for(let h=0;h<3;h++){const a=-Math.PI/2+(h-1)*.55+(sample(i*3+h+salt,424)-.5)*.4;add([[q[0],q[1]],[q[0]+Math.cos(a)*r*.6,q[1]+Math.sin(a)*r],[q[0]+Math.cos(a)*r,q[1]+Math.sin(a)*r*1.5]],'surface-relief',.5+.4*k,.45+.4*k,m.shape,m.reserves);}}
    }
    if(stemType==='agaric-4')for(const m of study.washes.filter(m=>m.role==='stem'&&Number.isInteger(m.individual))){
      selectIndividual(m);const b=bounds(m.shape),y=b.y+b.h*.3,near=m.shape.filter(q=>Math.abs(q[1]-y)<b.h*.04),xs=near.length>1?near.map(q=>q[0]):[b.x,b.x+b.w],sw=Math.max(...xs)-Math.min(...xs),x0=Math.min(...xs)-sw*.18,x1=Math.max(...xs)+sw*.18;
      const ring=curve([x0,y],[mix(x0,x1,.3),y+sw*.3],[mix(x0,x1,.7),y+sw*.3],[x1,y],18);
      add(ring,'ring',.9,.62,null,m.reserves);
      for(let i=0;i<14;i++){const q=ring[1+Math.floor(i/13*16)],len=(3+5*sample(i+(m.individual??0)*31,425))*(sw/40);add(curve(q,[q[0]-.5,q[1]+len*.35],[q[0]+.6,q[1]+len*.7],[q[0]+(sample(i,426)-.5)*2,q[1]+len],6),'ring',.4,.45,null,m.reserves);}
    }
  }
  // An inherited stipe brings its own veil: the host's ring goes when the
  // donor has none, and a ringed donor hangs a skirt on a ringless host.
  if(stemType!==typeId){
    const ringed=['ring','double-ring'].includes(p.veil);
    if(!ringed){
      const dropInk=m=>['ring','veil'].includes(m.role),dropWash=m=>/^veil-(shadow|light|cast-shadow)$/.test(m.role??'');
      const gone=new Set([...study.ink.filter(dropInk).flatMap(m=>[m.points,m.clip]),...study.washes.filter(dropWash).flatMap(m=>[m.shape,...(m.islands??[])])].filter(Boolean));
      study.ink=study.ink.filter(m=>!dropInk(m)).map(m=>m.exclude?.some(s=>gone.has(s))?{...m,exclude:m.exclude.filter(s=>!gone.has(s))}:m);
      study.washes=study.washes.filter(m=>!dropWash(m)).map(m=>m.reserves?.some(s=>gone.has(s))?{...m,reserves:m.reserves.filter(s=>!gone.has(s))}:m);
    }
    else if(!study.ink.some(m=>m.role==='ring'||m.role==='veil'))for(const m of study.washes.filter((m,i,all)=>m.role==='stem'&&Number.isInteger(m.individual)&&all.findIndex(o=>o.role==='stem'&&o.individual===m.individual)===i)){
      selectIndividual(m);const b=bounds(m.shape),y=b.y+b.h*.22,near=m.shape.filter(q=>Math.abs(q[1]-y)<b.h*.04),xs=near.length>1?near.map(q=>q[0]):[b.x,b.x+b.w],sw=Math.max(...xs)-Math.min(...xs),x0=Math.min(...xs)-sw*.28,x1=Math.max(...xs)+sw*.28;
      const skirt=curve([x0,y],[mix(x0,x1,.3),y+sw*.42],[mix(x0,x1,.7),y+sw*.42],[x1,y],18);
      add(skirt,'ring',.95,.65,null,m.reserves);add(curve([x0,y],[mix(x0,x1,.3),y-sw*.12],[mix(x0,x1,.7),y-sw*.12],[x1,y],18),'ring',.6,.5,null,m.reserves);
      for(let i=0;i<12;i++){const q=skirt[1+Math.floor(i/11*16)];add([[q[0],q[1]-sw*.18],[q[0]+(sample(i+(m.individual??0)*13,427)-.5)*2,q[1]-1]],'ring',.35,.4,null,m.reserves);}
      if(!sketch)wash([...skirt,...curve([x1,y],[mix(x0,x1,.7),y-sw*.12],[mix(x0,x1,.3),y-sw*.12],[x0,y],18)],{ochre:.35,umber:.2,paynes:.45},.05,'veil-shadow');
    }
  }
  // Sac and boot universal veils (and the death cap's sac) surround the base.
  // The death cap's volva (refs-lib): a loose white sac about twice the stipe
  // width and 20-30% of its height, with a torn, lobed rim; its front wall
  // hides the stipe base.
  if(['sac','boot'].includes(p.veil)||stemType==='amanita-3')for(const m of study.washes.filter(m=>m.role==='stem')){
    selectIndividual(m);
    const death=stemType==='amanita-3',b=bounds(m.shape),cx=b.x+b.w*.5,y=death?b.y+b.h-25:b.y+b.h*.9,r=b.w*(death?.76:.55),hgt=death?b.h*.22:54,top=y+29-hgt;
    const lobes=death?3:1,rim=Array.from({length:25},(_,i)=>{const t=i/24,x=mix(cx-r,cx+r,t);return [x,top+(death?hgt*.12*Math.abs(Math.sin(t*Math.PI*lobes+sample(m.individual??0,431)*2))-hgt*.06:(t*(1-t))*-8+5)];});
    const sack=death?[...curve([cx-r,top],[cx-r*1.12,top+hgt*.55],[cx-r*.7,y+31],[cx,y+29],18),...curve([cx,y+29],[cx+r*.8,y+30],[cx+r*1.15,top+hgt*.5],[cx+r,top],18),...rim.slice().reverse()]
      :[...curve([cx-r,y-25],[cx-r*1.2,y+8],[cx-r*.6,y+31],[cx,y+29],18),...curve([cx,y+29],[cx+r*.8,y+28],[cx+r*1.2,y+4],[cx+r,y-20],18)];
    if(death)for(const k of study.ink)if(k.individual===m.individual&&/stem|fibres|stipe|ring|relief/.test(k.role??''))k.exclude=[...(k.exclude??[]),sack];
    const inkFrom=study.ink.length;add(death?sack:sack,'veil',1,death?.78:.65,null,m.reserves);
    // The cup's own outline is always drawn, and its front wall hides the stipe's pigment.
    if(death){for(let k=inkFrom;k<study.ink.length;k++)study.ink[k].nativeSelected=true;m.reserves=[...(m.reserves??[]),sack];}
    add(death?rim:curve([cx-r,y-25],[cx-r*.3,y-12],[cx+r*.5,y-5],[cx+r,y-20],18),'veil',.8,.55,null,m.reserves);
    wash(sack,death?{ochre:.35,umber:.25,paynes:.4}:{ochre:.3,umber:.3,paynes:.4},death?.07:.06,'veil-shadow');
    // The cup's mouth: the stipe goes down into shadow inside the torn rim.
    if(death){const mouth=[...rim,...rim.slice().reverse().map(([x,yy],i)=>[x,yy+hgt*(.16+.08*Math.sin(i*.7))])];wash(mouth,{umber:.4,paynes:.45,sienna:.15},.09,'veil-shadow');
      for(let k=0;k<4;k++){const x=mix(cx-r*.7,cx+r*.7,(k+.5)/4)+(sample(k+(m.individual??0)*7,433)-.5)*r*.2;add(curve([x,top+hgt*.3],[x-2,top+hgt*.55],[x+1,top+hgt*.75],[x-1,y+24],8),'veil',.45,.4,sack,m.reserves);}}
  }
  // Form hatching: strokes run parallel to each body's own silhouette on the
  // side turned from the light, in broken, pressure-varying contacts with a
  // different seed per member; stipple marks the turn into shadow.
  if(!sketch){
    const bodies=study.washes.filter(m=>Number.isInteger(m.individual)&&['cap','funnel-cap','stem','puffball','folded-body','coral'].includes(m.role)&&m.shape?.length>8);
    const front=i=>[...new Set(study.washes.filter(m=>Number.isInteger(m.individual)&&m.individual>i&&['cap','funnel-cap','stem','puffball','folded-body','coral','underside','veil'].includes(m.role)).map(m=>m.shape))];
    for(const [n,mark] of bodies.entries()){
      selectIndividual(mark);
      const b=bounds(mark.shape),c=[b.x+b.w*.45,b.y+b.h*.45],salt=(mark.individual??0)*977+n*131+p.variant*17,sv=detailGenome.values;
      const exclude=[...(mark.reserves??[]),...front(mark.individual)],shape=mark.shape,N=shape.length;
      const dark=q=>clamp(((q[0]-c[0])/(b.w/2||1))*.75+((q[1]-c[1])/(b.h/2||1))*.45);
      // Edge hatching: a fixed set of short strokes laid in from the
      // silhouette, curving with the form; on the shadowed side they are long
      // and dark, on the lit side they fade to nothing (fixed count, so morphs
      // keep one stroke topology).
      const size=Math.max(b.w,b.h),K=mark.role==='stem'?36:54;
      for(let k=0;k<K;k++){
        const id=k*7+salt,j=Math.floor((k+sample(id,403))/K*N)%N,q=shape[j],d=dark(q);
        const prev=shape[(j-1+N)%N],next=shape[(j+1)%N],tx=next[0]-prev[0],ty=next[1]-prev[1],tl=Math.hypot(tx,ty)||1;
        let nx=c[0]-q[0],ny=c[1]-q[1];const nl=Math.hypot(nx,ny)||1;nx/=nl;ny/=nl;
        const on=clamp((d-.38)/.3),len=size*(.02+.08*d)*(.6+.8*sample(id,404)),bend=(sample(id,405)-.5)*len*.5,start=[q[0]+nx*1.2,q[1]+ny*1.2];
        const end=[start[0]+nx*len+tx/tl*bend,start[1]+ny*len+ty/tl*bend];
        add(curve(start,[mix(start[0],end[0],.35)+tx/tl*bend*.3,mix(start[1],end[1],.35)+ty/tl*bend*.3],[mix(start[0],end[0],.7)+tx/tl*bend*.6,mix(start[1],end[1],.7)+ty/tl*bend*.6],end,6),'surface-relief',(.35+.35*sample(id,401))*(.7+.6*d),(.3+.35*d)*on+.002,shape,exclude);
      }
      // The shadowed silhouette restated with a loaded, swelling nib: fixed
      // contacts round the outline, heavy where dark and vanishing where lit.
      for(let k=0,M=10;k<M;k++){const from=Math.floor(k/M*N),to=Math.min(N,Math.floor((k+1)/M*N)+1),seg=shape.slice(from,to),mid=seg[seg.length>>1],d=dark(mid),on=clamp((d-.45)/.25);
        add(seg.map(([x,y],i)=>[x+(sample(i+k*97+salt,412)-.5)*.5,y+(sample(i+k*89+salt,413)-.5)*.5]),'surface-relief',(.8+.7*d)*(.8+.4*sample(k+salt,410)),(.55+.3*d)*on+.002,null,exclude);}
      for(let i=0;i<70;i++){const a=(sample(i+salt,407)-.5)*2.6,r=.55+.4*Math.sqrt(sample(i+salt,408));const ang=.55+a,q=[c[0]+Math.cos(ang)*b.w*.5*r,c[1]+Math.sin(ang)*b.h*.5*r],on=clamp((dark(q)-.45)/.2);add([q,[q[0]+.7,q[1]+.5]],'surface-relief',.8+.5*sample(i+salt,409),(.5+.35*dark(q))*on+.002,shape,exclude);}
    }
  }
  // Pigment warmth is applied after inherited palettes, so the displayed gene remains active.
  if(!sketch)for(const mark of study.washes)if(mark.role!=='ground'){mark.palette={...mark.palette,ochre:(mark.palette.ochre??0)+.025+v[22]*.18};}
  return study;
}

// Optional habitat vignette in the manner of a botanical field drawing. Pass
// the specimen's closed silhouettes (no ground marks) as foregroundShapes and
// its basal rings as supportShapes. Background ink excludes the specimen and
// every background wash reserves it; merge background marks before specimen
// marks. Marks returned under `front` (litter lying in front of a foot, grass
// and moss at the stem base) go after the specimen, whose ink must exclude and
// whose washes must reserve front.shapes (see mergeHabitatLayers).
// The ground is a plane in perspective under a brush-edged earth wash that
// fades out on open paper. Elements are real subjects at about a quarter to
// a third of the fungus height, chosen from the type's ecology record
// (substrate, host trees, season); farther ones are smaller and paler.
// Grounding is a soil, moss or grass patch at each foot with a dark contact
// core; no cast-shadow silhouettes are drawn.
export function buildBackgroundStudy(genome,scene='plain',foregroundShapes=[],{supportShapes=foregroundShapes,substrate=null,view=null}={}) {
  if(!['plain','leaf-litter','moss-bank','fallen-log','woodland'].includes(scene))throw new RangeError('Unknown background scene');
  if(scene==='plain')return {ink:[],washes:[],scene};
  const v=genome.values,phase=v[35]*Math.PI*2,TA=Math.PI*2;
  const floorPoints=supportShapes.flat().filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
  const footY=floorPoints.length?floorPoints.reduce((bottom,p)=>Math.max(bottom,p[1]),-Infinity):822;
  let groundY=Math.max(640,Math.min(842,footY+4));
  let contacts=[];
  // One basal ring per member keeps each member's own contact, even on a
  // tiered or receding colony; whole-body masks fall back to three contacts.
  const localSupports=supportShapes!==foregroundShapes&&supportShapes.length<=5
    ?supportShapes.map(shape=>shape.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]))):[];
  if(localSupports.length&&localSupports.every(shape=>shape.length>=3)){
    for(const shape of localSupports){
      const bottom=Math.max(...shape.map(p=>p[1])),left=Math.min(...shape.map(p=>p[0])),right=Math.max(...shape.map(p=>p[0]));
      let mass=0,xx=0,yy=0;
      for(const p of shape){const w=Math.exp(Math.max(-80,(p[1]-bottom)/9));mass+=w;xx+=p[0]*w;yy+=p[1]*w;}
      contacts.push({x:xx/mass,y:yy/mass+3,width:Math.max(18,Math.min(64,(right-left)*.58+6))});
    }
  }else{
    const support=floorPoints.map(p=>({p,w:Math.exp(Math.max(-80,(p[1]-footY)/24))})).sort((a,b)=>a.p[0]-b.p[0]);
    const supportMass=support.reduce((sum,a)=>sum+a.w,0);
    for(const fraction of [.16,.50,.84]){
      let x=600,sum=0,previous=support[0]?.p[0]??600;
      for(const item of support){const next=sum+item.w;if(next>=fraction*supportMass){x=previous+(item.p[0]-previous)*(fraction*supportMass-sum)/Math.max(1e-12,item.w);break;}sum=next;previous=item.p[0];}
      let mass=0,yy=0,xx=0,spread=0;
      for(const p of floorPoints){const w=Math.exp(Math.max(-80,(p[1]-footY)/9-((p[0]-x)/35)**2));mass+=w;yy+=p[1]*w;xx+=p[0]*w;spread+=(p[0]-x)**2*w;}
      contacts.push({x:mass?xx/mass:x,y:mass?yy/mass+3:groundY-2,width:mass?Math.max(18,Math.min(48,Math.sqrt(spread/mass)+14)):32});
    }
  }
  // Wood carrying a colony owns the ground contact: the plane lies at the
  // log or stump base and the specimens' feet are on the bark.
  const onWood=!!substrate?.contacts?.length;
  if(onWood){groundY=Math.max(640,Math.min(842,substrate.y));contacts=substrate.contacts.map(c=>({...c}));}
  const habitat=habitatFor(genome),cover=scene==='leaf-litter'?'litter':scene==='moss-bank'?'moss':habitat.ground;
  const yMax=groundY+44,{ink,washes,front,line:rawLine,wash,index}=habitatMarks(v,foregroundShapes,{yMax});
  // H: discrete choices fixed by the growth plan (stable through a morph);
  // J: continuous seed variation from the genome values.
  const typeHash=caHash(`${genome.phenotype?.grammar??genome.family}:${genome.phenotype?.variant??0}:${scene}`);
  const H=(i,s=0)=>caNoise(i*31+s,typeHash),J=(i,s=0)=>.5+.5*Math.sin(v[(i+s)%30]*TA*1.7+i*1.31+s*.77+phase*.4);
  // Specimen size sets the scale of the setting (elements ~25-35% of height).
  const boxes=index.boxes,heights=contacts.map(c=>{let top=c.y;for(const b of boxes){if(b.x+b.w<c.x-c.width*2||b.x>c.x+c.width*2||b.y>c.y)continue;top=Math.min(top,b.y);}return Math.max(40,c.y-top);});
  const hMean=heights.reduce((a,b)=>a+b,0)/heights.length,S=clamp(hMean*.3,48,135);
  const maxX=Math.max(...contacts.map(c=>c.x+c.width)),minX=Math.min(...contacts.map(c=>c.x-c.width));
  let spanL=minX,spanR=maxX;for(const b of boxes)if(b.y+b.h>groundY-420){spanL=Math.min(spanL,b.x);spanR=Math.max(spanR,b.x+b.w);}
  spanL=Math.max(40,spanL);spanR=Math.min(1160,spanR);
  const pitch=clamp(view?.pitch??HABIT_CAMERA.pitch,-.12,.85),fore=clamp(Math.sin(Math.max(.1,pitch))/Math.sin(HABIT_CAMERA.pitch),.6,1.8),flat=.33*fore;
  const backY=Math.min(...contacts.map(c=>c.y))-Math.max(130,hMean*.6)*fore,frontY=groundY+38;
  const cx=(spanL+spanR)/2,halfW=clamp((spanR-spanL)/2+S*.9+80,300,560);
  const sAt=y=>clamp((y-backY)/(frontY-backY),0,1),sizeAt=s=>.55+.6*s,inkAt=s=>.68+.52*s;
  const buckets={back:{},fore:{}},holes=[];let inFront=false;
  const bucket=(name,shape)=>{const b=buckets[inFront?'fore':'back'];(b[name]??=[]).push(shape);};
  const line=(points,role,width,opacity,clip=null,extra=[])=>rawLine(points.map(([x,y])=>[clamp(x,1,1199),clamp(y,1,yMax)]),role,width,opacity,clip,extra,{inFront});
  const surfaces=[];
  const register=(shape,from)=>{
    const list=inFront?front.ink:ink,own=list.slice(from),b=index.box(shape);
    for(const prior of surfaces){if(prior.front!==inFront)continue;if(b.x>prior.box.x+prior.box.w||b.x+b.w<prior.box.x||b.y>prior.box.y+prior.box.h||b.y+b.h<prior.box.y)continue;for(const mark of prior.marks)mark.exclude.push(shape);}
    surfaces.push({shape,marks:own,box:b,front:inFront});
  };
  const el=habitatElements({line,register,bucket,J,H,flat,inkAt,TA,inkLength:()=>(inFront?front.ink:ink).length,hole:shape=>holes.push(shape)});
  // Host trees supply the leaf species; conifers supply needles and cones.
  const broad=habitat.hosts.map(BROADLEAF_OF).filter(Boolean),pine=habitat.hosts.includes('pine')||habitat.hosts.includes('larch'),spruce=habitat.hosts.includes('spruce')||habitat.hosts.includes('yew');
  const leafKinds=broad.length?broad:['oak','beech'];
  const season=habitat.season,decayBase={autumn:.12,summer:.45,spring:.6,winter:.72}[season]??.3;
  const leafAt=(x,y,size,id,s,detail)=>{const kind=leafKinds[id%leafKinds.length],a=(H(id,19)<.5?-1:1)*(Math.PI/2+(J(id,20)-.5)*1.3),decay=clamp(decayBase+(H(id,21)-.5)*.5,0,1);
    if(kind==='sycamore')return el.palmate(x,y,size*.62,a,id,s,{detail});if(kind==='ash'||kind==='elder')return el.compound(x,y,size*1.3,a,kind,id,s);return el.leaf(x,y,size,a,kind,id,s,{detail,curl:.15+.5*H(id,22),decay});};
  // Recipes (counts fixed per cover; placement varies with the seed).
  const conifer=pine||spruce,mast=leafKinds.includes('oak')?'acorn':leafKinds.includes('beech')?'beech':null;
  const R={
    litter:[['leaf',6],['twig',1],['mast',mast?2:0],['hypnum',1],['stone',2],['crumbs',5],['soil',10],['needle',conifer?10:0],['cone',conifer?1:0]],
    conifer:[['needle',30],['cone',2],['twig',1],['hypnum',1],['poly',1],['leaf',broad.length?2:0],['stone',2],['crumbs',4],['soil',10]],
    moss:[['poly',3],['hypnum',3],['leaf',2],['twig',1],['stone',1],['crumbs',3],['soil',6],['needle',conifer?8:0]],
    grass:[['tuft',12],['clover',3],['plantain',1],['crumbs',3],['soil',6]],
    lawn:[['lawn',14],['clover',4],['plantain',1],['crumbs',2],['soil',5]],
    verge:[['tuft',11],['plantain',2],['clover',1],['leaf',1],['stone',2],['crumbs',3],['soil',6]],
    burnt:[['char',5],['needle',10],['poly',1],['cone',1],['stone',2],['crumbs',6],['soil',14]],
    dung:[['tuft',8],['clover',1],['crumbs',3],['soil',6]],
    chips:[['chip',12],['leaf',2],['twig',1],['crumbs',3],['soil',6]],
    sand:[['marram',6],['ripple',10],['stone',2],['needle',pine?4:0],['cone',pine?1:0]],
    buried:[['leaf',5],['twig',1],['hypnum',1],['stone',1],['crumbs',4],['soil',8]],
    larva:[['poly',2],['hypnum',2],['leaf',2],['crumbs',3],['soil',6]],
    cones:[['needle',26],['cone',3],['hypnum',1],['crumbs',3],['soil',8]],
  }[cover]??[['leaf',6],['soil',10]];
  // Sites cluster round the feet (elements overlap the specimens' bases)
  // and thin out toward the vignette edge.
  const items=[];
  R.forEach(([kind,count],k)=>{for(let i=0;i<count;i++){
    const id=100*(k+1)+i,c=contacts[Math.floor(H(id,1)*contacts.length)],near=H(id,2)<.55&&!['soil','ripple','lawn','needle'].includes(kind);
    let x,y;
    if(near){const a=H(id,3)*TA,r=c.width*.8+S*(.3+1.4*H(id,4));x=c.x+Math.cos(a)*r+(J(id,5)-.5)*S*.3;y=c.y+Math.sin(a)*r*flat*1.3+(J(id,6)-.5)*S*.1;}
    else{const rho=Math.pow(H(id,7),.75),th=H(id,8)*TA;x=cx+rho*Math.cos(th)*halfW*.92+(J(id,9)-.5)*S*.4;y=L((backY+frontY)/2,0,0)+rho*Math.sin(th)*(frontY-backY)*.46+(J(id,10)-.5)*S*.12;}
    const reach={leaf:.75,twig:.25,mast:.2,hypnum:.25,poly:.1,stone:.15,crumbs:.15,cone:.3,clover:.2,plantain:.4,char:.3,chip:.3,larva:.2}[kind]??.08;{const my=(backY+frontY)/2,ry=(frontY-backY)/2,ex=(x-cx)/halfW,ey=(y-my)/ry,e=Math.hypot(ex,ey);if(e>.88){x=cx+ex/e*.88*halfW;y=my+ey/e*.88*ry;}}
    y=clamp(y,backY+12,Math.min(frontY-6,yMax-S*reach*sizeAt(1)));x=clamp(x,50,1150);items.push({kind,id,x,y,s:sAt(y)});}});
  function L(a,b,t){return a+(b-a)*t;}
  items.sort((a,b)=>a.s-b.s||a.x-b.x);
  const isFront=(x,y)=>!onWood&&contacts.some(c=>Math.abs(x-c.x)<c.width*.9+S*.25&&y>c.y-2&&y<c.y+S*.4);
  for(const it of items){
    const sz=sizeAt(it.s),fr=isFront(it.x,it.y)&&['leaf','stone','crumbs','hypnum','needle','clover','tuft','lawn'].includes(it.kind);inFront=fr;
    const id=it.id,x=it.x,y=it.y,s=it.s,detail=s>.3&&!fr;
    if(it.kind==='leaf')leafAt(x,y,S*(1.05+.6*H(id,11))*sz,id,s,detail);
    else if(it.kind==='twig')el.twig(x,y,S*(1.6+.8*H(id,12))*sz,(J(id,13)-.5)*1.4,id,s);
    else if(it.kind==='mast'){if(mast==='acorn')el.acorn(x,y,S*.22*sz,(J(id,14)-.5)*3,id,s);else el.beechMast(x,y,S*.3*sz,id,s);}
    else if(it.kind==='hypnum')el.hypnum(x,y,S*(.7+.4*H(id,15))*sz,id,s);
    else if(it.kind==='poly')el.polytrichum(x,y,S*(.45+.3*H(id,16))*sz,id,s);
    else if(it.kind==='stone')el.stone(x,y,S*(.1+.12*H(id,17))*sz,id,s);
    else if(it.kind==='crumbs')el.crumbs(x,y,S*.3*sz,id,s);
    else if(it.kind==='soil')el.soilStroke(x-S*.2*sz,y,S*(.25+.35*H(id,18))*sz,s);
    else if(it.kind==='needle')el.needles(x,y,S*(.46+.2*H(id,19))*sz,J(id,23)*TA,id,s,{pair:pine||!spruce});
    else if(it.kind==='cone')el.cone(x,y,S*(.4+.15*H(id,24))*sz,(J(id,25)-.5)*2.6,id,s,{spruce:spruce&&!pine});
    else if(it.kind==='tuft')el.grassTuft(x,y,S*(.9+.6*H(id,26))*sz,id,s,{heads:cover!=='lawn'&&season!=='spring'});
    else if(it.kind==='lawn')el.grassTuft(x,y,S*(.35+.2*H(id,27))*sz,id,s,{heads:false,rolled:true});
    else if(it.kind==='clover')el.clover(x,y,S*(.14+.06*H(id,28))*sz,id,s);
    else if(it.kind==='plantain')el.plantain(x,y,S*(.5+.2*H(id,29))*sz,id,s);
    else if(it.kind==='char')el.charStick(x,y,S*(.9+.6*H(id,30))*sz,(J(id,31)-.5)*2,id,s);
    else if(it.kind==='chip')el.chip(x,y,S*(.3+.2*H(id,32))*sz,J(id,33)*TA,id,s);
    else if(it.kind==='marram')el.marram(x,y,S*(1.2+.6*H(id,34))*sz,id,s);
    else if(it.kind==='ripple')el.ripple(x,y,S*(1+.8*H(id,35))*sz,s);
  }
  inFront=false;
  // Ground objects at the feet: dung pat, buried branch, larva, cone.
  const c0=contacts[0];
  if(cover==='dung'&&!onWood){const w=Math.min(320,(maxX-minX)/2+S*.9);el.dungPat((minX+maxX)/2,groundY-3,clamp(w,90,230),7,sAt(groundY));}
  if(cover==='buried')el.buriedBranch(c0.x+S*.2,c0.y+4,S*2.2,(J(3,40)-.5)*.6,9,sAt(c0.y));
  if(cover==='larva'){inFront=true;el.larva(c0.x+c0.width*.2,c0.y+4,S*.55,11,sAt(c0.y));inFront=false;}
  if(cover==='cones'){inFront=true;el.cone(c0.x+c0.width*.5,c0.y+3,S*.42,.3,13,sAt(c0.y),{spruce:false});inFront=false;}
  // Optional fallen-log scene for ground species: a weathered log behind.
  if(scene==='fallen-log'&&!onWood){
    const comp={id:`bg-log-${typeHash}`,members:[],substrate:{kind:'log',start:[-520,-300],end:[380,-330],radius:58,bend:(v[6]-.5)*40,phase,anchor:[clamp(cx,470,730),groundY+4],scale:.66}};
    const logLayer=buildHabitSubstrate(comp,genome,foregroundShapes);
    for(const mark of logLayer.ink){mark.role=mark.role.replace(/^habitat/,'background');mark.opacity*=.75;mark.points=mark.points.map(([x,y])=>[clamp(x,1,1199),clamp(y,1,yMax)]);ink.push(mark);}
    for(const mark of logLayer.washes.filter(m=>/wood-wash|wood-shadow/.test(m.role))){mark.role=mark.role.replace(/^habitat/,'background');mark.load=Math.min(.1,mark.load*.85);washes.push(mark);}
  }
  // Stem bases emerge from the substrate: grass, moss or a needle lies in
  // front of each foot and overlaps the stipe base.
  if(!onWood)for(const [id,c] of contacts.entries()){
    inFront=true;const s=sAt(c.y),k0=500+id*10;
    if(['grass','verge','dung','sand'].includes(cover))el.grassTuft(c.x+(J(k0,1)-.5)*c.width*.6,c.y+3,S*.55,k0,s,{heads:false});
    else if(cover==='lawn')el.grassTuft(c.x,c.y+3,S*.3,k0,s,{heads:false,rolled:true});
    else if(['moss','larva','litter','buried'].includes(cover))el.hypnum(c.x+(J(k0,2)-.5)*c.width*.4,c.y+3,Math.max(c.width*1.1,S*.45),k0,s);
    else if(cover==='burnt'||cover==='chips')el.crumbs(c.x,c.y+3,c.width*1.4,k0,s);
    else el.needles(c.x-c.width*.6,c.y+3,S*.35,.15+(J(k0,3)-.5),k0,s,{pair:pine||!spruce});
  }
  inFront=false;
  for(const group of Object.values(buckets.fore))front.shapes.push(...group);
  // Earth: a brush-edged ground wash (dry-brush streaks at its rim), a
  // darker band toward the edge, and a soil/moss patch under each foot with
  // a dark contact core.
  const ragged=(rx,ry,ox,oy,salt,teeth=.1)=>Array.from({length:121},(_,k)=>{
    const t=k/120*TA,r=1+.08*Math.sin(3*t+phase+salt)+.05*Math.sin(5*t-phase*.6+salt)+teeth*Math.abs(Math.sin(t*9+salt))**2-teeth*.5*Math.abs(Math.sin(t*14+salt*.7))**4;
    return [clamp(ox+Math.cos(t)*rx*r*(.8+.2*(Math.sin(t)+1)/2),2,1198),clamp(oy+Math.sin(t)*ry*r,1,yMax)];});
  const midY=(backY+frontY)/2,ry=(frontY-backY)/2+8,outer=ragged(halfW,ry,cx,midY,1,.07),inner=ragged(halfW*.7,ry*.66,cx,midY+ry*.12,2.3,.04);
  const streaks=[];for(let k=0;k<12;k++){const t=(H(k,60)<.5?Math.PI*(1.2+.6*H(k,66)):Math.PI*(.2+.6*H(k,66))),e=[cx+Math.cos(t)*halfW*(.9+.1*H(k,61)),midY+Math.sin(t)*ry*(.9+.08*H(k,62))],len=S*(1.2+1.2*H(k,63)),h=4+5*H(k,64),tilt=-Math.cos(t)/Math.sin(t)*ry/halfW*.5;
    const lens=[...[0,1,2,3,4].map(j=>{const u=j/4;return [e[0]+(u-.5)*len,e[1]-h*Math.sin(Math.PI*u)+tilt*(u-.5)*len];}),...[3,2,1].map(j=>{const u=j/4;return [e[0]+(u-.5)*len,e[1]+h*Math.sin(Math.PI*u)+tilt*(u-.5)*len];})];
    streaks.push(lens.map(([x,y])=>[clamp(x,2,1198),clamp(y,1,yMax)]));}
  const ground=HABITAT_GROUND_PIGMENTS[cover]??HABITAT_GROUND_PIGMENTS.litter;
  // Earth in three nested, progressively smaller washes: each edge is a
  // small step in value, so the pigment-grid edge of any one mask stays low
  // in contrast and the patch reads as darkening toward the specimens.
  const mid=ragged(halfW*.84,ry*.82,cx,midY+ry*.05,1.7,.06);
  wash([outer,...streaks],ground,.045,'background-ground-wash',{soft:true});
  wash([mid],ground,.04,'background-ground-mid',{soft:true});
  wash([inner],{...ground,umber:(ground.umber??0)+.1},.045,'background-ground-band',{soft:true});
  const clods=contacts.map((c,id)=>Array.from({length:31},(_,k)=>{const a=k/30*TA,r=1+.18*Math.sin(a*3+id+phase)+.08*Math.sin(a*7);return [c.x+Math.cos(a)*(c.width*1.25+S*.25)*r,clamp(c.y+2+Math.sin(a)*(c.width*.35+S*.12)*r,1,yMax)];}));
  wash(clods,cover==='grass'||cover==='lawn'||cover==='verge'?HABITAT_PIGMENTS.grass:cover==='moss'?HABITAT_PIGMENTS.green:{umber:.5,walnut:.3,ochre:.2},.09,'background-ground-clod',{soft:true});
  const back=buckets.back,leafPalette={autumn:{ochre:.45,sienna:.3,umber:.25},summer:{umber:.5,ochre:.35,walnut:.15},spring:{umber:.45,walnut:.3,ochre:.25},winter:{walnut:.45,umber:.45,paynes:.1}}[season]??HABITAT_PIGMENTS.leaf;
  wash([...(back.leaves??[]),...(back.needles??[])],cover==='conifer'||cover==='cones'||cover==='burnt'?HABITAT_PIGMENTS.needle:leafPalette,.1,'background-leaf-wash',{extra:[...(back.backs??[]),...holes]});
  wash(back.backs??[],HABITAT_PIGMENTS.pale,.07,'background-leaf-back',{extra:holes});
  wash(back.greens??[],['grass','lawn','verge','dung','sand'].includes(cover)?HABITAT_PIGMENTS.grass:HABITAT_PIGMENTS.green,.1,'background-green-wash');
  wash([...(back.darks??[]),...(back.char??[]),...(back.dung??[])],cover==='burnt'?HABITAT_PIGMENTS.char:cover==='dung'?HABITAT_PIGMENTS.dung:HABITAT_PIGMENTS.dark,cover==='dung'?.1:cover==='burnt'?.09:.055,'background-dark-wash');
  wash(back.stones??[],{paynes:.4,umber:.35,ochre:.25},.08,'background-stone-wash');
  const cores=contacts.map((c,id)=>Array.from({length:41},(_,k)=>{const a=k/40*TA,r=1+.08*Math.sin(a*3+id);return[c.x+Math.cos(a)*c.width*.9*r,c.y+Math.sin(a)*(3+c.width*.05)*r];}));
  wash(cores,HABITAT_PIGMENTS.dark,.1,'background-contact-shadow');
  const f=buckets.fore;
  wash(f.greens??[],['grass','lawn','verge','dung','sand'].includes(cover)?HABITAT_PIGMENTS.grass:HABITAT_PIGMENTS.green,.1,'background-front-green',{inFront:true});
  wash([...(f.leaves??[]),...(f.needles??[]),...(f.darks??[]),...(f.backs??[]),...(f.stones??[])],cover==='conifer'||cover==='cones'?HABITAT_PIGMENTS.needle:leafPalette,.095,'background-front-litter',{inFront:true,extra:holes});
  return {ink,washes,front,scene,ground:{y:groundY,contacts,cover,backY,frontY,ecology:habitat}};
}


export const BACKGROUND_SCENES=Object.freeze(['plain','leaf-litter','moss-bank','fallen-log','woodland']);
// Habitat choices: Auto (the default) picks the scene that suits the type's
// ecology record; the others are fixed scenes. 'plain' is the background off.
export const HABITAT_CHOICES=Object.freeze(['auto','woodland','leaf-litter','moss-bank','fallen-log']);
export function autoHabitatScene(typeId){
  const type=TYPES_BY_ID.get(typeId),kind=type?habitatFor({profileId:typeId,phenotype:type}).kind:'litter';
  if(WOOD_SUBSTRATES.has(kind))return 'fallen-log';
  if(kind==='moss')return 'moss-bank';
  return 'woodland';
}
export function resolveHabitat(choice,typeId){return choice==='auto'?autoHabitatScene(typeId):choice;}
const lamellarSurfaces=new WeakMap();
// The same body constructors stop before microscopic detail, surface normals,
// pigment meshes and transport. Motion never invokes the full study planner.
export function buildSketch(genome){
  const novel=new Set(['cup','trumpet','earthstar','nest','club','jelly','tooth','saddle','stinkhorn']);
  const plan=genome.phenotype&&novel.has(genome.phenotype.grammar)?buildNovelStudy(genome,true):buildLegacyStudy(genome,true);
  if(genome.phenotype){decorateCatalog(plan,genome,true);applySpecimenDamage(plan,genome);}
  if(genome.phenotype?.habit==='cluster'&&['amanita','bolete','chanterelle','morel'].includes(genome.family)){
    const bodies=plan.individuals.map((_,i)=>[...new Set(plan.washes.filter(m=>m.individual===i).map(m=>m.shape))]);
    for(const mark of plan.ink)if(Number.isInteger(mark.individual))mark.exclude=[...(mark.exclude??[]),...bodies.slice(mark.individual+1).flat()];
  }
  return {ink:plan.ink,bodies:plan.washes,washes:[],individuals:plan.individuals,views:plan.views??[],specimenCount:plan.specimenCount,morphology:plan.morphology};
}

// Connected cap morphology is a procedural geometric construction, not fungal development.
const correspondenceRole=role=>({
  'cap-contour':'crown','stem-contour':'support',ring:'veil',veil:'veil',
  folds:'fold',flutes:'fold',root:'root',branch:'branch',teeth:'teeth',
  cap:'crown','folded-body':'crown',puffball:'crown',stem:'support',
  coral:'branch',wood:'substrate',bark:'substrate',underside:'underside',
})[role]??role;
// Connected anatomy chart: procedural morphology, not developmental biology.
// All chart paths are reconstructed from intrinsic dimensions, never paired with
// unrelated endpoint strokes. Composition is a separate, carried identity.
const CA_TAU=Math.PI*2;
const caMix=(a,b,t)=>a+(b-a)*t;
const caClamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const caSmooth=t=>t*t*(3-2*t);
const caHash=text=>{let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const caNoise=(i,seed)=>{let h=Math.imul((seed+i*374761393)|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;};
const caLength=points=>points.reduce((sum,p,i)=>i?sum+Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]):sum,0);
const caClose=points=>[...points,[...points[0]]];
const caBox=points=>{let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;for(const p of points){x=Math.min(x,p[0]);y=Math.min(y,p[1]);right=Math.max(right,p[0]);bottom=Math.max(bottom,p[1]);}return {x,y,w:right-x,h:bottom-y};};

// ---------------------------------------------------------------------------
// Habitat ecology, gregarious habit placement and substrate wood.
// Field-drawing convention (Wellcome watercolours, Sowerby, Price): a habitat
// vignette under the habit group that fades out on open paper, never a full
// scene. All geometry is vector and deterministic; native washes paint it.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Ecology record for every catalog type. The catalog forms are art
// archetypes; each is given the habitat of the real taxon it most resembles
// (the analogue), so it grows from the right substrate with the right trees.
// Sources: R. Phillips, Mushrooms (Macmillan 2006); P. Sterry & B. Hughes,
// Collins Complete Guide to British Mushrooms & Toadstools (2009);
// G. Kibby, Mushrooms and Toadstools of Britain & Europe (2017-2020);
// M. Kuo, MushroomExpert.com species pages; First Nature (first-nature.com)
// species pages; for Ganoderma, Fistulina and Laetiporus host ranges also
// P. Roberts & S. Evans, The Book of Fungi (2011).
// Substrates: litter (broadleaf leaf litter), conifer (needle litter), moss,
// grass (pasture), lawn, verge, burnt, dung, chips (wood chips), sand,
// buried (buried wood), larva (insect larva in moss), cones (buried cones),
// stump, log, branch (fallen twigs or branches), trunk (base of a tree).
// [analogue, substrate, hosts, season, fairy ring]
// ---------------------------------------------------------------------------
const ECOLOGY_TABLE=Object.freeze({
  amanita:[['Amanita muscaria','litter',['birch','spruce'],'autumn'],['Amanita vaginata','litter',['birch','oak'],'summer'],['Amanita citrina','litter',['beech','oak'],'autumn'],['Amanita rubescens','litter',['oak','pine'],'summer'],['Amanita pantherina','litter',['beech','oak'],'autumn']],
  bolete:[['Boletus edulis','litter',['oak','beech','spruce'],'autumn'],['Xerocomellus chrysenteron','litter',['oak','beech'],'autumn'],['Suillus luteus','conifer',['pine'],'autumn'],['Leccinum scabrum','moss',['birch'],'autumn'],['Xerocomus subtomentosus','litter',['oak','birch'],'summer']],
  chanterelle:[['Cantharellus cibarius','moss',['oak','beech'],'summer'],['Craterellus tubaeformis','moss',['spruce','pine'],'autumn'],['Cantharellus pallens','litter',['beech'],'summer'],['Cantharellus cibarius','moss',['birch','oak'],'autumn'],['Pseudocraterellus undulatus','litter',['beech','hazel'],'autumn']],
  morel:[['Morchella esculenta','litter',['ash','elm'],'spring'],['Morchella elata','burnt',['pine','spruce'],'spring'],['Morchella esculenta','grass',['apple'],'spring'],['Gyromitra esculenta','conifer',['pine'],'spring'],['Morchella importuna','chips',['pine'],'spring']],
  parasol:[['Macrolepiota procera','verge',['oak'],'autumn'],['Chlorophyllum rhacodes','conifer',['spruce'],'autumn'],['Macrolepiota procera','grass',[],'summer'],['Chlorophyllum rhacodes','chips',['elder'],'autumn'],['Macrolepiota mastoidea','grass',['hazel'],'autumn']],
  inkcap:[['Coprinus comatus','verge',[],'autumn'],['Parasola plicatilis','lawn',[],'summer'],['Coprinopsis atramentaria','buried',['elm'],'autumn'],['Coprinellus micaceus','stump',['beech'],'spring'],['Coprinopsis radiata','dung',[],'summer']],
  oyster:[['Pleurotus ostreatus','log',['beech'],'winter'],['Pleurotus pulmonarius','log',['beech'],'summer'],['Pleurotus cornucopiae','stump',['elm'],'summer'],['Pleurotus ostreatus','log',['poplar'],'autumn'],['Pleurotus dryinus','trunk',['oak'],'autumn']],
  bracket:[['Trametes versicolor','log',['oak'],'winter'],['Ganoderma applanatum','trunk',['beech'],'autumn'],['Trametes hirsuta','branch',['beech'],'winter'],['Polyporus squamosus','stump',['sycamore','elm'],'spring'],['Fistulina hepatica','trunk',['oak'],'autumn']],
  puffball:[['Lycoperdon perlatum','litter',['beech','oak'],'autumn'],['Lycoperdon excipuliforme','grass',[],'autumn'],['Bovista plumbea','lawn',[],'summer'],['Lycoperdon pyriforme','stump',['beech'],'autumn'],['Calvatia utriformis','sand',[],'autumn']],
  coral:[['Ramaria flava','litter',['beech'],'autumn'],['Clavulina coralloides','moss',['oak','beech'],'autumn'],['Ramaria botrytis','litter',['beech','oak'],'autumn'],['Ramaria stricta','buried',['beech'],'autumn'],['Clavulina cristata','conifer',['spruce'],'autumn']],
  agaric:[['Agaricus campestris','grass',[],'autumn',true],['Inocybe rimosa','litter',['oak','birch'],'autumn'],['Agrocybe pediades','lawn',[],'summer'],['Armillaria mellea','stump',['oak'],'autumn'],['Marasmius oreades','lawn',[],'summer',true]],
  bonnet:[['Mycena galericulata','stump',['oak'],'autumn'],['Hymenopellis radicata','buried',['beech'],'summer'],['Mycena pura','litter',['beech','oak'],'autumn'],['Flammulina velutipes','stump',['elm','ash'],'winter'],['Mycena sanguinolenta','conifer',['spruce'],'autumn']],
  waxcap:[['Hygrocybe chlorophana','grass',[],'autumn'],['Hygrocybe conica','grass',[],'autumn',true],['Cuphophyllus pratensis','grass',[],'autumn'],['Gliophorus psittacinus','grass',[],'autumn'],['Hygrocybe punicea','grass',[],'autumn']],
  milkcap:[['Lactarius torminosus','moss',['birch'],'autumn'],['Lactarius deliciosus','conifer',['pine'],'autumn'],['Russula ochroleuca','litter',['oak','spruce'],'autumn'],['Russula fellea','litter',['beech'],'autumn'],['Russula virescens','litter',['beech','oak'],'summer']],
  hedgehog:[['Hydnum repandum','moss',['beech','spruce'],'autumn'],['Sarcodon imbricatus','conifer',['spruce'],'autumn'],['Hydnum rufescens','moss',['oak','beech'],'autumn'],['Hydnellum peckii','moss',['pine'],'autumn'],['Auriscalpium vulgare','cones',['pine'],'autumn']],
  cup:[['Peziza badia','burnt',['pine'],'autumn'],['Otidea onotica','litter',['beech','oak'],'autumn'],['Sarcoscypha austriaca','branch',['hazel','elder'],'winter'],['Scutellinia scutellata','log',['beech'],'summer'],['Helvella acetabulum','litter',['beech'],'spring']],
  trumpet:[['Craterellus cornucopioides','litter',['beech','oak'],'autumn'],['Craterellus lutescens','moss',['pine'],'autumn'],['Craterellus cornucopioides','litter',['beech'],'autumn'],['Craterellus cornucopioides','litter',['oak','hazel'],'autumn'],['Pseudocraterellus undulatus','litter',['beech'],'autumn']],
  earthstar:[['Geastrum triplex','litter',['beech'],'autumn'],['Geastrum fimbriatum','conifer',['spruce'],'autumn'],['Geastrum pectinatum','conifer',['pine'],'autumn'],['Astraeus hygrometricus','sand',['pine'],'autumn'],['Geastrum rufescens','conifer',['pine'],'autumn']],
  nest:[['Cyathus striatus','branch',['oak'],'autumn'],['Crucibulum laeve','branch',['hazel'],'autumn'],['Cyathus olla','chips',[],'autumn'],['Cyathus striatus','branch',['beech'],'autumn'],['Nidularia deformis','log',['beech'],'autumn']],
  club:[['Clavariadelphus pistillaris','litter',['beech'],'autumn'],['Clavulinopsis corniculata','grass',[],'autumn'],['Cordyceps militaris','larva',['oak'],'autumn'],['Clavaria fragilis','grass',[],'autumn'],['Macrotyphula fistulosa','litter',['beech','birch'],'autumn']],
  jelly:[['Tremella mesenterica','branch',['oak'],'winter'],['Auricularia auricula-judae','branch',['elder'],'winter'],['Exidia nigricans','branch',['oak'],'winter'],['Tremella foliacea','branch',['birch'],'autumn'],['Calocera viscosa','stump',['spruce'],'autumn']],
  tooth:[['Hericium erinaceus','trunk',['beech'],'autumn'],['Hericium coralloides','log',['beech'],'autumn'],['Hericium cirrhatum','stump',['beech'],'autumn'],['Hericium coralloides','log',['beech'],'autumn'],['Hericium erinaceus','trunk',['oak'],'autumn']],
  saddle:[['Helvella crispa','litter',['beech','oak'],'autumn'],['Helvella lacunosa','burnt',['pine'],'autumn'],['Gyromitra infula','log',['spruce'],'autumn'],['Helvella lacunosa','litter',['oak'],'autumn'],['Helvella elastica','moss',['beech'],'autumn']],
  stinkhorn:[['Phallus impudicus','litter',['beech','oak'],'summer'],['Phallus indusiatus','chips',[],'summer'],['Mutinus caninus','litter',['oak'],'autumn'],['Clathrus ruber','chips',[],'autumn'],['Mutinus ravenelii','chips',[],'summer']],
});
const ECOLOGY_EXTRA=Object.freeze({'bracket-6':['Laetiporus sulphureus','stump',['oak','cherry'],'summer']});
const WOOD_SUBSTRATES=new Set(['log','stump','branch','trunk']);
const CONIFERS=new Set(['pine','spruce','larch','yew']);
export const HABITAT_KINDS=Object.freeze(['litter','conifer','moss','grass','lawn','verge','burnt','dung','chips','sand','buried','larva','cones','stump','log','branch','trunk']);
function ecologyRecord(type){
  const raw=ECOLOGY_EXTRA[type?.id]??ECOLOGY_TABLE[type?.grammar]?.[Math.abs(Math.round(type?.variant??0))%5]??['Unidentified','litter',['oak'],'autumn'];
  // fairyRing: the species grows in rings on grass. Not the stem ring (veil).
  const [analogue,substrate,hosts,season,fairyRing=false]=raw;return {analogue,substrate,hosts:[...hosts],season,fairyRing};
}
export function ecologyFor(typeId){return ecologyRecord(TYPES_BY_ID.get(typeId));}
// Wikipedia page per type: [taxon, rank, en.wikipedia page]. Beta types and
// clear analogues link the model species; generic archetypes link the genus of
// their ecology analogue. Every page was fetched on 2026-10-20 (HTTP 200 after
// redirects, not a disambiguation page, summary describes a fungus); a 'genus'
// entry with '(fungus)' in the page is the disambiguated genus page.
const WIKIPEDIA_BASE='https://en.wikipedia.org/wiki/';
export const TAXON_LINKS=Object.freeze({
  'amanita-1':['Amanita muscaria','species','Amanita_muscaria'], 'amanita-2':['Amanita vaginata','species','Amanita_vaginata'], 'amanita-3':['Amanita phalloides','species','Amanita_phalloides'], 'amanita-4':['Amanita','genus','Amanita'],
  'amanita-5':['Amanita','genus','Amanita'], 'bolete-1':['Boletus edulis','species','Boletus_edulis'], 'bolete-2':['Xerocomellus','genus','Xerocomellus'], 'bolete-3':['Suillus luteus','species','Suillus_luteus'],
  'bolete-4':['Leccinum scabrum','species','Leccinum_scabrum'], 'bolete-5':['Xerocomus','genus','Xerocomus'], 'chanterelle-1':['Cantharellus cibarius','species','Cantharellus_cibarius'], 'chanterelle-2':['Craterellus','genus','Craterellus'],
  'chanterelle-3':['Cantharellus','genus','Cantharellus'], 'chanterelle-4':['Cantharellus','genus','Cantharellus'], 'chanterelle-5':['Pseudocraterellus','genus','Pseudocraterellus'], 'morel-1':['Morchella esculenta','species','Morchella_esculenta'],
  'morel-2':['Morchella','genus','Morchella'], 'morel-3':['Morchella','genus','Morchella'], 'morel-4':['Gyromitra esculenta','species','Gyromitra_esculenta'], 'morel-5':['Morchella','genus','Morchella'],
  'parasol-1':['Macrolepiota procera','species','Macrolepiota_procera'], 'parasol-2':['Chlorophyllum','genus','Chlorophyllum'], 'parasol-3':['Macrolepiota','genus','Macrolepiota'], 'parasol-4':['Chlorophyllum rhacodes','species','Shaggy_parasol'],
  'parasol-5':['Macrolepiota','genus','Macrolepiota'], 'inkcap-1':['Coprinus comatus','species','Coprinus_comatus'], 'inkcap-2':['Parasola plicatilis','species','Parasola_plicatilis'], 'inkcap-3':['Coprinopsis','genus','Coprinopsis'],
  'inkcap-4':['Coprinellus','genus','Coprinellus'], 'inkcap-5':['Coprinopsis','genus','Coprinopsis'], 'oyster-1':['Pleurotus ostreatus','species','Pleurotus_ostreatus'], 'oyster-2':['Pleurotus','genus','Pleurotus'],
  'oyster-3':['Pleurotus','genus','Pleurotus'], 'oyster-4':['Pleurotus','genus','Pleurotus'], 'oyster-5':['Pleurotus','genus','Pleurotus'], 'bracket-1':['Trametes versicolor','species','Trametes_versicolor'],
  'bracket-2':['Ganoderma applanatum','species','Ganoderma_applanatum'], 'bracket-3':['Trametes','genus','Trametes'], 'bracket-4':['Cerioporus squamosus','species','Cerioporus_squamosus'], 'bracket-5':['Fistulina hepatica','species','Fistulina_hepatica'],
  'puffball-1':['Lycoperdon perlatum','species','Lycoperdon_perlatum'], 'puffball-2':['Lycoperdon excipuliforme','species','Lycoperdon_excipuliforme'], 'puffball-3':['Bovista','genus','Bovista'], 'puffball-4':['Lycoperdon','genus','Lycoperdon'],
  'puffball-5':['Calvatia','genus','Calvatia'], 'coral-1':['Ramaria','genus','Ramaria'], 'coral-2':['Clavulina','genus','Clavulina'], 'coral-3':['Ramaria','genus','Ramaria'],
  'coral-4':['Ramaria','genus','Ramaria'], 'coral-5':['Clavulina','genus','Clavulina'], 'agaric-1':['Agaricus campestris','species','Agaricus_campestris'], 'agaric-2':['Inocybe rimosa','species','Inocybe_rimosa'],
  'agaric-3':['Agrocybe','genus','Agrocybe'], 'agaric-4':['Armillaria','genus','Armillaria'], 'agaric-5':['Marasmius','genus','Marasmius'], 'bonnet-1':['Mycena','genus','Mycena'],
  'bonnet-2':['Hymenopellis radicata','species','Hymenopellis_radicata'], 'bonnet-3':['Mycena','genus','Mycena'], 'bonnet-4':['Flammulina velutipes','species','Flammulina_velutipes'], 'bonnet-5':['Mycena','genus','Mycena'],
  'waxcap-1':['Hygrocybe','genus','Hygrocybe'], 'waxcap-2':['Hygrocybe conica','species','Hygrocybe_conica'], 'waxcap-3':['Cuphophyllus','genus','Cuphophyllus'], 'waxcap-4':['Gliophorus','genus','Gliophorus'],
  'waxcap-5':['Hygrocybe','genus','Hygrocybe'], 'milkcap-1':['Lactarius torminosus','species','Lactarius_torminosus'], 'milkcap-2':['Lactarius deliciosus','species','Lactarius_deliciosus'], 'milkcap-3':['Russula','genus','Russula'],
  'milkcap-4':['Russula','genus','Russula'], 'milkcap-5':['Russula','genus','Russula'], 'hedgehog-1':['Hydnum repandum','species','Hydnum_repandum'], 'hedgehog-2':['Sarcodon imbricatus','species','Sarcodon_imbricatus'],
  'hedgehog-3':['Hydnum','genus','Hydnum'], 'hedgehog-4':['Hydnellum','genus','Hydnellum'], 'hedgehog-5':['Auriscalpium vulgare','species','Auriscalpium_vulgare'], 'cup-1':['Peziza','genus','Peziza'],
  'cup-2':['Otidea','genus','Otidea'], 'cup-3':['Sarcoscypha','genus','Sarcoscypha'], 'cup-4':['Scutellinia','genus','Scutellinia'], 'cup-5':['Helvella','genus','Helvella'],
  'trumpet-1':['Craterellus cornucopioides','species','Craterellus_cornucopioides'], 'trumpet-2':['Craterellus','genus','Craterellus'], 'trumpet-3':['Craterellus','genus','Craterellus'], 'trumpet-4':['Craterellus','genus','Craterellus'],
  'trumpet-5':['Pseudocraterellus','genus','Pseudocraterellus'], 'earthstar-1':['Geastrum triplex','species','Geastrum_triplex'], 'earthstar-2':['Geastrum','genus','Geastrum'], 'earthstar-3':['Geastrum','genus','Geastrum'],
  'earthstar-4':['Astraeus','genus','Astraeus_(fungus)'], 'earthstar-5':['Geastrum','genus','Geastrum'], 'nest-1':['Cyathus striatus','species','Cyathus_striatus'], 'nest-2':['Crucibulum','genus','Crucibulum_(fungus)'],
  'nest-3':['Cyathus','genus','Cyathus'], 'nest-4':['Cyathus','genus','Cyathus'], 'nest-5':['Nidularia','genus','Nidularia'], 'club-1':['Clavariadelphus pistillaris','species','Clavariadelphus_pistillaris'],
  'club-2':['Clavulinopsis','genus','Clavulinopsis'], 'club-3':['Cordyceps','genus','Cordyceps'], 'club-4':['Clavaria','genus','Clavaria'], 'club-5':['Macrotyphula','genus','Macrotyphula'],
  'jelly-1':['Tremella','genus','Tremella'], 'jelly-2':['Auricularia auricula-judae','species','Auricularia_auricula-judae'], 'jelly-3':['Exidia','genus','Exidia'], 'jelly-4':['Tremella','genus','Tremella'],
  'jelly-5':['Calocera','genus','Calocera'], 'tooth-1':['Hericium erinaceus','species','Hericium_erinaceus'], 'tooth-2':['Hericium coralloides','species','Hericium_coralloides'], 'tooth-3':['Hericium','genus','Hericium'],
  'tooth-4':['Hericium','genus','Hericium'], 'tooth-5':['Hericium','genus','Hericium'], 'saddle-1':['Helvella crispa','species','Helvella_crispa'], 'saddle-2':['Helvella','genus','Helvella'],
  'saddle-3':['Gyromitra','genus','Gyromitra'], 'saddle-4':['Helvella','genus','Helvella'], 'saddle-5':['Helvella','genus','Helvella'], 'stinkhorn-1':['Phallus impudicus','species','Phallus_impudicus'],
  'stinkhorn-2':['Phallus indusiatus','species','Phallus_indusiatus'], 'stinkhorn-3':['Mutinus','genus','Mutinus'], 'stinkhorn-4':['Clathrus','genus','Clathrus'], 'stinkhorn-5':['Mutinus','genus','Mutinus'],
  'bracket-6':['Laetiporus sulphureus','species','Laetiporus_sulphureus'],
});
export function taxonLink(typeId){
  const raw=TAXON_LINKS[typeId];if(!raw)return null;const [taxon,rank,page]=raw;
  return {taxon,rank,href:WIKIPEDIA_BASE+page,label:rank==='genus'?`${taxon} (genus)`:taxon};
}
// What the line under the title says for a genome: one link for a type, both
// parents for a hybrid ("Hybrid of X × Y"), and "A → B" mid-morph.
export function specimenLinkParts(genome){
  if(!genome)return null;
  const morph=!!genome.correspondence,ids=morph?[genome.sourceProfileId,genome.targetProfileId]:[genome.profileId,genome.donorId].filter(Boolean);
  const links=ids.map(taxonLink);if(!links.length||links.some(link=>!link))return null;
  const unique=links.filter((link,i)=>links.findIndex(other=>other.href===link.href)===i);
  if(unique.length===1)return {kind:'single',prefix:'',joiner:'',links:unique,suffix:' on Wikipedia ↗'};
  return morph?{kind:'morph',prefix:'',joiner:' → ',links:unique,suffix:' on Wikipedia ↗'}
    :{kind:'hybrid',prefix:'Hybrid of ',joiner:' × ',links:unique,suffix:' on Wikipedia ↗'};
}
// Ground cover under wood follows the hosts: needles under conifers, leaves
// under broadleaves, with moss on the wood itself.
function groundCoverFor(record){
  const s=record.substrate;
  if(WOOD_SUBSTRATES.has(s))return record.hosts.length&&record.hosts.every(h=>CONIFERS.has(h))?'conifer':'litter';
  return s;
}
export function habitatFor(genome){
  const ph=genome?.phenotype??{},host=TYPES_BY_ID.get(genome?.profileId)??TYPES_BY_ID.get(ph.id)??ph,record=ecologyRecord(host);
  // A fictional hybrid grows where its body-plan parent grows; trees and
  // leaves come from both parents.
  const donor=genome?.donorId?ecologyRecord(TYPES_BY_ID.get(genome.donorId)):null;
  const hosts=[...new Set([...record.hosts,...(donor?.hosts??[])])];
  const kind=ph.substrate??record.substrate,wood=WOOD_SUBSTRATES.has(kind);
  return {kind,wood,ground:groundCoverFor({...record,substrate:kind,hosts}),hosts,season:record.season,analogue:record.analogue,fairyRing:record.fairyRing,
    hybrid:donor?{donor:donor.analogue,blend:`substrate of ${record.analogue}; trees of both parents`}:null};
}
// A readable record of one specimen, for the debug panel and Copy JSON.
export function specimenRecord(genome){
  const ph=genome?.phenotype??{},h=habitatFor(genome),active=new Set(activeTraitsFor(genome)),traits={shape:{},painting:{}};
  for(const [i,name] of TRAITS.entries())if(active.has(i))(i>=21&&i<=29?traits.painting:traits.shape)[name]=Math.round(genome.values[i]*1000)/1000;
  return {type:genome.profileId,seed:genome.seed,title:genome.title,fictional:!!genome.fictional,donor:genome.donorId??null,
    phenotype:{group:ph.group,family:ph.family??genome.family,capShape:ph.capShape,stemForm:ph.stemForm,surface:ph.surface,margin:ph.margin,habit:ph.habit,veil:ph.veil,hymenium:ph.hymenium,palette:ph.palette},
    ecology:{analogue:h.analogue,substrate:h.kind,hosts:h.hosts,season:h.season,fairyRing:!!h.fairyRing},traits};
}
export function ecologyLabel(genome){
  const h=habitatFor(genome),where={litter:'broadleaf leaf litter',conifer:'conifer needle litter',moss:'moss',grass:'pasture grass',lawn:'lawn',verge:'grass verge',burnt:'burnt ground',dung:'dung',chips:'wood chips',sand:'sand dunes',buried:'buried wood',larva:'buried insect larva',cones:'buried pine cones',stump:'stump',log:'fallen log',branch:'fallen branch',trunk:'base of a living trunk'}[h.kind]??h.kind;
  return `Habitat: ${h.analogue} · ${where}${h.hosts.length?` · ${h.hosts.join(', ')}`:''} · ${h.season}${h.fairyRing?' · fairy ring':''}${genome.phenotype?.growthHabit&&!genome.donorId?` · ${genome.phenotype.growthHabit}`:''}${h.hybrid?` · hybrid (${h.hybrid.blend})`:''}`;
}

// One fixed design camera (the default view) places a colony on its shared
// substrate. Members turn in place under orbit; their attachment points and
// the wood stay where this camera put them.
export const HABIT_CAMERA=Object.freeze({yaw:.12,pitch:.36});
const HABIT_FOCAL=2600; // the 3D charts' pinhole focal length (CA_FOCAL)
export function habitProjector({anchor=[600,800],scale=.75}={}){
  const cy=Math.cos(HABIT_CAMERA.yaw),sy=Math.sin(HABIT_CAMERA.yaw),cp=Math.cos(HABIT_CAMERA.pitch),sp=Math.sin(HABIT_CAMERA.pitch);
  return ([X,Y,Z])=>{const x0=X*cy-Y*sy,da=X*sy+Y*cy,y0=-Z*cp+da*sp,depth=-da*cp-Z*sp,k=HABIT_FOCAL/(HABIT_FOCAL+depth);return [anchor[0]+scale*x0*k,anchor[1]+scale*y0*k,depth*scale,k];};
}
// Unit vector toward the design camera and the specimens' light (upper left,
// behind): cast shadows fall right and slightly toward the viewer.
const HABIT_TOWARD_CAMERA=[Math.sin(HABIT_CAMERA.yaw)*Math.cos(HABIT_CAMERA.pitch),Math.cos(HABIT_CAMERA.yaw)*Math.cos(HABIT_CAMERA.pitch),Math.sin(HABIT_CAMERA.pitch)];
const HABIT_LIGHT=(()=>{const l=[-.48,-.24,.843],n=Math.hypot(...l);return l.map(x=>x/n);})();
// Screen direction of a cast shadow on the ground (unit), from the light.
export const HABIT_SHADOW_DIRECTION=(()=>{const P=habitProjector({anchor:[0,0],scale:1}),a=P([0,0,0]),b=P([-HABIT_LIGHT[0]*100,-HABIT_LIGHT[1]*100,0]),d=Math.hypot(b[0]-a[0],b[1]-a[1]);return [(b[0]-a[0])/d,(b[1]-a[1])/d];})();

// Gregarious and caespitose growth. Returns null for a plain solitary/pair
// habit on the ground, which keeps the catalog's open plate layout.
function habitArrangement(genome,count){
  const ph=genome?.phenotype;if(!ph)return null;
  const g=ph.grammar,h=habitatFor(genome);
  // Brackets, oysters and hanging tooth fungi leave the wood sideways as
  // shelves; other lignicolous forms stand on top of it.
  if(g==='bracket'||g==='oyster'||g==='tooth'&&h.wood)return {mode:'shelf',kind:h.wood?h.kind:'log',grammar:g,form:ph.form};
  if(h.wood)return {mode:'perch',kind:h.kind==='trunk'?'stump':h.kind,grammar:g,tuft:ph.habit==='cluster'||count>=3};
  if(count<2)return null;
  if(h.fairyRing||ph.habit==='troop'&&['grass','lawn'].includes(h.kind))return {mode:'ring',kind:h.kind,grammar:g};
  if(ph.habit==='cluster')return {mode:'clump',kind:h.kind,grammar:g};
  return null;
}
function habitColonySize(genome,count){
  const ph=genome?.phenotype??{},g=ph.grammar;
  if(g==='oyster')return Math.max(count,4);
  if(g==='tooth'&&[0,4].includes(ph.variant??0))return 1;
  if(g==='bracket'&&ph.form==='sulphur-shelf')return Math.max(count,4);
  if(g==='bracket'&&(ph.variant??0)===0)return Math.max(count,4);
  if(ph.habit==='cluster'&&habitatFor(genome).wood)return 5;
  return count;
}
function habitLayout(genome,count,hash){
  const plan=habitArrangement(genome,count);if(!plan)return null;
  const R=i=>caNoise(i,hash),n=count,members=[],toward=(u,v)=>{const d=Math.hypot(u,v)||1;return [u/d,v/d];};
  let substrate,anchor,scale;
  const place=(i,base,outward,{size=1,maturity=1,rotation=0,attached=false,fan=0,mirror=false,inset=0,pitch=0}={})=>({base,outward,size,maturity,rotation,attached,fan,mirror,inset,pitch,i});
  const slots=[];
  if(plan.mode==='shelf'||plan.mode==='perch'){
    const kind=plan.kind;
    if(kind==='stump'||kind==='trunk'){
      // A trunk is the base of a living tree: taller, wider, uncut.
      const trunk=kind==='trunk',radius=(trunk?150:plan.mode==='shelf'?150:165)+R(1)*(trunk?30:40),height=trunk?430:plan.mode==='shelf'?280+R(2)*90:150+R(2)*70;
      substrate={kind:'stump',trunk,center:[0,0],radius,height,tilt:(R(3)-.5)*.16,phase:R(4)*CA_TAU};
      scale=plan.mode==='shelf'?.82:.76;anchor=[590+(R(5)-.5)*60,plan.mode==='shelf'?826:832];
      for(let i=0;i<n;i++){
        const f=n===1?.5:i/(n-1);
        if(plan.mode==='shelf'){
          // Shelves leave the bark at the stump's flanks and are seen in
          // profile. Oysters fan from one shared base on one flank; brackets
          // and sulphur shelves stack in tiers alternating between flanks.
          const shared=plan.grammar==='oyster',sideLeft=shared?true:(i%2===0)!==(R(19)<.5),aL=Math.atan2(Math.sin(HABIT_CAMERA.yaw),-Math.cos(HABIT_CAMERA.yaw)),aR=Math.atan2(-Math.sin(HABIT_CAMERA.yaw),Math.cos(HABIT_CAMERA.yaw));
          // Hericium hangs as one mass on the face of the trunk, seen side-on.
          const tooth=plan.grammar==='tooth',aF=Math.PI/2-HABIT_CAMERA.yaw,forward=shared?.3:.15+.45*R(20+i),a=tooth?aF+(n>1?(f-.5)*1.4:0)+(R(20+i)-.5)*.2:sideLeft?aL-forward:aR+forward;
          // Oysters: one base, caps stacked in an imbricate fan, each a little
          // higher and smaller. Brackets: tiers alternating between flanks.
          const zTop=substrate.trunk?.5:1,z=tooth?height*(.6+.12*f):shared?height*zTop*(.3+.15*i)+(R(10+i)-.5)*6:height*zTop*(.22+.62*(n===1?.6:1-f))+(R(10+i)-.5)*30;
          const u=[Math.cos(a),Math.sin(a)],inset=tooth?-60:shared?0:46;
          // One eye level for the whole colony: tiers above it are seen from
          // below (pores, gills), tiers below it from above (zoned tops).
          const eye=height*zTop*.45,seen=tooth?.02:shared?HABIT_CAMERA.pitch:clamp(.34-.9*(z-eye)/(height*zTop),-.32,.36);
          slots.push(place(i,[u[0]*(radius-inset),u[1]*(radius-inset),z],u,{size:tooth?1.25+R(30+i)*.1:shared?.86-.09*i:(plan.form==='sulphur-shelf'?.78:.68)+.2*(1-f)*(n>1?1:0)+R(30+i)*.1,maturity:shared?1-.1*i:1-.4*f*(n>1?1:0),attached:true,inset,pitch:seen-HABIT_CAMERA.pitch,
            fan:tooth?0:shared?(f-.5)*1.3-.45:(sideLeft?-1:1)*(.42+.2*R(33+i)),mirror:!tooth&&!sideLeft}));
        }else{
          // Tufts converge on the cut top; a fused base joins their stems.
          const a=R(40+i)*CA_TAU,r=(plan.tuft?28:radius*.42)*Math.sqrt(R(41+i)),o=[Math.cos(a)*r,Math.sin(a)*r];
          slots.push(place(i,[o[0],o[1],height+(substrate.tilt*Math.cos(a))*radius*.1],[0,1],{size:.78+R(42+i)*.35,maturity:.55+.45*R(43+i),rotation:plan.tuft?(o[0]/18)*.22+(f-.5)*.5:(R(44+i)-.5)*.08,attached:true}));
        }
      }
    }else{
      const branch=kind==='branch',radius=branch?28+R(1)*10:76+R(1)*22,shelf=plan.mode==='shelf',length=branch?380+150*n:shelf?420+110*n:560+120*n;
      // Shelf logs recede from the viewer so their left flank faces the
      // plate and the near cut end shows its rings; perches lie across.
      substrate=shelf?{kind,start:[-30+(R(3)-.5)*60,length*.34],end:[length*.25+(R(4)-.5)*60,-length*.66],radius,bend:(R(5)-.5)*40,phase:R(6)*CA_TAU}
        :{kind,start:[-length*.55,(R(3)-.5)*70],end:[length*.45,(R(4)-.5)*90-30],radius,bend:(R(5)-.5)*60,phase:R(6)*CA_TAU};
      scale=branch?.8:shelf?.86:.74;anchor=shelf?[720+(R(8)-.5)*40,760]:[600+(R(8)-.5)*40,branch?800:795];
      const axis=t=>[mix(substrate.start[0],substrate.end[0],t),mix(substrate.start[1],substrate.end[1],t)+substrate.bend*Math.sin(Math.PI*t)];
      for(let i=0;i<n;i++){
        const f=n===1?.5:i/(n-1);
        let t,beta,u;
        if(plan.mode==='shelf'){
          // Oysters share one base and fan; turkey tails run along the flank.
          const shared=plan.grammar==='oyster'||plan.form==='sulphur-shelf',d=toward(substrate.end[0]-substrate.start[0],substrate.end[1]-substrate.start[1]);
          // An imbricate oyster fan: tiers climb the flank and step along it.
          t=shared?.24+.07*i+(R(50+i)-.5)*.03:.08+.8*f+(R(50+i)-.5)*.04;
          beta=Math.PI-(shared?.02+.3*i:.15+R(51+i)*.45);
          u=[d[1],-d[0]];
        }else{
          t=plan.tuft?.5+(R(50+i)-.5)*.1:.2+.6*f+(R(50+i)-.5)*.06;beta=1.25+(R(51+i)-.5)*.2;u=[0,1];
        }
        const c=axis(t),r=radius*(1-.14*t),d=toward(substrate.end[0]-substrate.start[0],substrate.end[1]-substrate.start[1]),n1=[-d[1],d[0]];
        const shared=shelf&&(plan.grammar==='oyster'||plan.form==='sulphur-shelf'),inset=plan.grammar==='tooth'?-60:shelf?(plan.grammar==='oyster'?0:shared?24:40):8;
        const base=[c[0]+n1[0]*Math.cos(beta)*(r-inset),c[1]+n1[1]*Math.cos(beta)*(r-inset),r+Math.sin(beta)*(r-inset)];
        slots.push(place(i,base,u,{size:shared?.9-.08*i:(shelf?.66+.22*(1-f):.8)+R(53+i)*.12,maturity:shelf?(shared?1-.1*i:1-.4*f):.6+.4*R(54+i),inset:shelf?inset:0,pitch:shelf&&plan.grammar!=='oyster'?(i%2?-.46:-.12)-(shared?.06*i:0):0,
          rotation:plan.mode==='perch'&&plan.tuft?(f-.5)*.55:(R(55+i)-.5)*.06,attached:true,fan:shelf?(shared?(f-.5)*1.3-.7:-.75-.25*R(56+i)):0}));
      }
    }
  }else if(plan.mode==='clump'){
    substrate=null;scale=.8;anchor=[620+(R(5)-.5)*60,806];
    for(let i=0;i<n;i++){
      const f=n===1?.5:i/(n-1),a=R(60+i)*CA_TAU,r=12+30*Math.sqrt(R(61+i)),o=[(f-.5)*70+Math.cos(a)*r*.5,Math.sin(a)*r];
      slots.push(place(i,[o[0],o[1],0],[0,1],{size:.72+R(62+i)*.4,maturity:.5+.5*R(63+i),rotation:(f-.5)*.62+(R(64+i)-.5)*.1}));
    }
  }else{
    // A fairy-ring arc: members recede along a circle on open grass.
    substrate=null;scale=.78;anchor=[600,800];
    const ring=300+R(70)*70,centre=[(R(71)-.5)*120,-ring*.8];
    for(let i=0;i<n;i++){
      const f=n===1?.5:i/(n-1),a=Math.PI*(.18+.64*f)+(R(72+i)-.5)*.08,p=[centre[0]+Math.cos(a)*ring*1.15,centre[1]+Math.sin(a)*ring];
      slots.push(place(i,[p[0],p[1],0],[0,1],{size:.75+R(73+i)*.3,maturity:.55+.45*R(74+i),rotation:(R(75+i)-.5)*.08}));
    }
  }
  const P=habitProjector({anchor,scale});
  for(const slot of slots){
    const [x,y,depth,k]=P(slot.base),face=Math.atan2(-slot.outward[1],-slot.outward[0]),yaw=slot.attached&&plan.mode==='shelf'?face+slot.fan+(R(80+slot.i)-.5)*.2:(R(80+slot.i)-.5)*.6;
    // Bark plane in member coordinates: the member's -x axis is turned by
    // (yaw - face) from the outward normal; points deeper than the bark
    // surface (inset, in member units) are inside the wood.
    const turn=yaw-face,barkClip=slot.inset?[Math.cos(turn),-Math.sin(turn),-(slot.inset/slot.size)+3]:null;
    members.push({id:`specimen-${slot.i}`,x,y,scale:scale*k*slot.size,rotation:slot.rotation,maturity:clamp(slot.maturity,.35,1),yaw,depth,...(slot.pitch?{pitch:slot.pitch}:{}),...(barkClip?{barkClip}:{}),...(slot.attached?{attached:true}:{}),...(slot.mirror?{mirror:true}:{}),world:slot.base});
  }
  return {members,habit:{mode:plan.mode,kind:plan.kind,anchor,scale,tuft:!!plan.tuft},substrate:substrate?{...substrate,anchor,scale}:null};
}

// Exact foreground occlusion for setting marks. Dense connected meshes are
// binned once; each mark carries only the masks that touch its footprint.
function habitatMaskIndex(masks){
  const box=p=>{let x=Infinity,y=Infinity,r=-Infinity,b=-Infinity;for(const q of p){x=Math.min(x,q[0]);y=Math.min(y,q[1]);r=Math.max(r,q[0]);b=Math.max(b,q[1]);}return {x,y,w:r-x,h:b-y};};
  const dense=masks.length>128,boxes=dense?masks.map(box):[],bins=new Map(),cell=64;
  const visit=(b,f)=>{for(let y=Math.floor(b.y/cell);y<=Math.floor((b.y+b.h)/cell);y++)for(let x=Math.floor(b.x/cell);x<=Math.floor((b.x+b.w)/cell);x++)f(`${x}:${y}`);};
  if(dense)boxes.forEach((b,i)=>visit(b,key=>{if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);}));
  const masksFor=(regions,padding=0)=>{
    if(!dense)return masks;
    const found=new Set();for(const region of regions){const local=box(region),b={x:local.x-padding,y:local.y-padding,w:local.w+padding*2,h:local.h+padding*2};
      visit(b,key=>{for(const i of bins.get(key)??[]){const a=boxes[i];if(a.x<=b.x+b.w&&a.x+a.w>=b.x&&a.y<=b.y+b.h&&a.y+a.h>=b.y)found.add(i);}});}
    return [...found].sort((a,b)=>a-b).map(i=>masks[i]);
  };
  return {masksFor,box,boxes:dense?boxes:masks.map(box)};
}
function habitatConvexHull(points){
  const p=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lower=[],upper=[];
  for(const q of p){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),q)<=0)lower.pop();lower.push(q);}
  for(const q of p.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),q)<=0)upper.pop();upper.push(q);}
  return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
// Shared mark factory for the wood substrate and the habitat vignette.
function habitatMarks(v,masks,{yMax=Infinity}={}){
  const phase=v[35]*Math.PI*2,index=habitatMaskIndex(masks),ink=[],washes=[],front={ink:[],washes:[],shapes:[]};
  const line=(points,role,width=.55,opacity=.36,clip=null,extra=[],{inFront=false}={})=>{
    const mark={points,role,width,opacity,phase:phase+(ink.length+front.ink.length)*.79,clip,exclude:inFront?[...extra]:[...index.masksFor([points],Math.max(8,width*8)),...extra]};
    (inFront?front.ink:ink).push(mark);return mark;
  };
  const wash=(islands,palette,load,role,{extra=[],inFront=false,soft=false,path=null,width=null}={})=>{
    if(!islands.length)return null;
    const b=index.box(islands.flat()),mark={shape:[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]],
      points:path??Array.from({length:17},(_,i)=>{const t=i/16;return [clamp(b.x-2+(b.w+4)*t,0,1200),Math.min(yMax,b.y+b.h*(.5+.16*Math.sin(t*Math.PI*2+phase)))];}),
      width:width??Math.max(4,b.h*2.2+6),palette,load:Math.min(.1,load),role,islands,reserves:inFront?[...extra]:[...index.masksFor(islands,2),...extra],
      phase,granulation:soft?v[25]*.4:v[25],wetness:soft?.92:v[26],pooling:v[27]*(soft?.15:.35),softness:soft?1:.7+v[28]*.25,variation:v[29]};
    (inFront?front.washes:washes).push(mark);return mark;
  };
  return {ink,washes,front,line,wash,index,phase};
}
const HABITAT_PIGMENTS=Object.freeze({
  bark:{umber:.46,walnut:.4,ochre:.14},barkShadow:{umber:.42,walnut:.48,paynes:.1},cut:{ochre:.55,umber:.3,sienna:.15},
  leaf:{ochre:.42,umber:.45,sienna:.13},pale:{ochre:.34,umber:.23,walnut:.43},green:{sapgreen:.49,ochre:.37,umber:.14},
  grass:{sapgreen:.58,ochre:.32,umber:.1},dark:{umber:.42,walnut:.48,paynes:.1},char:{paynes:.5,umber:.3,walnut:.2},
  dung:{umber:.5,walnut:.3,ochre:.2},needle:{sienna:.38,umber:.42,ochre:.2},
});
const HABITAT_GROUND_PIGMENTS=Object.freeze({
  litter:{umber:.46,ochre:.36,sienna:.18},conifer:{sienna:.34,umber:.46,ochre:.2},moss:{sapgreen:.42,ochre:.4,umber:.18},
  grass:{sapgreen:.5,ochre:.38,umber:.12},lawn:{sapgreen:.55,ochre:.33,umber:.12},verge:{sapgreen:.42,ochre:.4,umber:.18},burnt:{paynes:.42,umber:.38,walnut:.2},dung:{sapgreen:.35,ochre:.4,umber:.25},
  chips:{ochre:.45,umber:.4,sienna:.15},sand:{ochre:.6,umber:.25,paynes:.15},buried:{umber:.46,ochre:.36,sienna:.18},larva:{sapgreen:.42,ochre:.4,umber:.18},cones:{sienna:.34,umber:.46,ochre:.2},
});

// Wood that carries a lignicolous colony: a stump, log or fallen branch drawn
// from the design camera as a real cylinder (silhouette generators, visible
// cut face with growth rings, bark furrows following the surface, a shadowed
// side away from the light and a cast shadow on the ground). The wood belongs
// to the specimen plate: it is drawn with or without the background.
export function buildHabitSubstrate(composition,genome,masks=[]){
  const s=composition?.substrate;if(!s||!WOOD_SUBSTRATES.has(s.kind))return null;
  // The wood belongs to the composition, not to either morph endpoint, so
  // a promoted pair keeps exactly the same log or stump.
  const seed=caHash(composition.id),v=Array.from({length:36},(_,i)=>caNoise(i+900,seed)),{ink,washes,front,line,wash}=habitatMarks(v,masks),P=habitProjector(s),Q=(i,k=0)=>caNoise(i*7+k,seed);
  const xy=p=>{const q=P(p);return [q[0],q[1],q[2]];},flat2=list=>list.map(poly=>poly.map(p=>[p[0],p[1]])),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const bodies=[],shadows=[],cut=[],cast=[],moss=[],lichens=[];let groundY,contacts=[];
  // Foliose lichen rosette on bark: lobed margin and an inner growth ring.
  const lichen=(c,r,i,clip)=>{const ros=Array.from({length:25},(_,j)=>{const a=j/24*CA_TAU,q=1+.22*Math.abs(Math.sin(a*3.5+i))**.6;return [c[0]+Math.cos(a)*r*q,c[1]+Math.sin(a)*r*q*.7,c[2]];});lichens.push(ros);line(ros,'habitat-lichen',.36,.4,clip);
    line(ros.map(([x,y,d])=>[c[0]+(x-c[0])*.5,c[1]+(y-c[1])*.5,d]).slice(2,22),'habitat-lichen',.26,.32,clip);};
  const bark=(pts,i,w=.45,o=.34,clip=null)=>line(pts,'habitat-bark',w*(.45+1.0*Q(i,1)),o*(.7+.5*Q(i,2)),clip);
  // A moss shoot: three or four short leafy rays rising from one foot.
  const mossShoot=(x,y,d,h,i)=>{for(let r=0;r<3+(i%2);r++){const a=-Math.PI/2+(r-1.2)*.45+(Q(i*5+r,60)-.5)*.3,len=h*(.6+.5*Q(i*5+r,61));line([[x,y,d],[x+Math.cos(a)*len*.5,y+Math.sin(a)*len*.55,d],[x+Math.cos(a)*len+1.2,y+Math.sin(a)*len,d]],'habitat-moss',.32,.4);}};
  if(s.kind==='stump'){
    const [cx,cyw]=s.center,Hs=s.height,ph=s.phase,N=72;
    const rad=(a,z)=>s.radius*(1+.05*Math.sin(3*a+ph)+.03*Math.sin(7*a-ph))*(1+.3*Math.exp(-z/(Hs*.13))*(.55+.45*Math.sin(5*a+ph)));
    const topZ=a=>Hs+s.tilt*Math.cos(a-ph)*s.radius+3*Math.sin(9*a+ph);
    const surf=(a,z)=>[cx+Math.cos(a)*rad(a,z),cyw+Math.sin(a)*rad(a,z),z];
    const angles=Array.from({length:N},(_,i)=>i/N*CA_TAU),levels=12;
    const ring=z=>angles.map(a=>xy(surf(a,typeof z==='function'?z(a):z)));
    const bottom=ring(0),top=angles.map(a=>xy(surf(a,topZ(a))));
    const extreme=(pts,sign)=>pts.reduce((best,p,i)=>sign*p[0]>sign*pts[best][0]?i:best,0);
    const side=sign=>Array.from({length:levels+1},(_,j)=>{const z=j/levels*Hs*(s.trunk?.86:.995),pts=ring(z);return pts[extreme(pts,sign)];});
    const left=side(-1),right=side(1);
    const arc=(pts,from,to,pick)=>{const a=[],b=[];for(let i=from;;i=(i+1)%pts.length){a.push(pts[i]);if(i===to)break;}for(let i=from;;i=(i-1+pts.length)%pts.length){b.push(pts[i]);if(i===to)break;}
      const mean=q=>q.reduce((s,p)=>s+p[1],0)/q.length;return pick(mean(a),mean(b))?a:b;};
    const topBack=arc(top,extreme(top,-1),extreme(top,1),(a,b)=>a<b),bottomFront=arc(bottom,extreme(bottom,1),extreme(bottom,-1),(a,b)=>a>b);
    // A living trunk leaves the vignette upward: its wash ends in a ragged,
    // dry-brush top instead of a cut rim.
    const raggedTop=s.trunk?Array.from({length:25},(_,j)=>{const u=j/24,p=[mix(left.at(-1)[0],right.at(-1)[0],u),mix(left.at(-1)[1],right.at(-1)[1],u)];return [p[0],p[1]+5*Math.sin(j*.7+Q(1,40)*6)+3*Q(j,40),p[2]];}):null;
    const body=[...left,...(s.trunk?raggedTop:topBack.slice(1,-1)),...right.slice().reverse(),...bottomFront.slice(1,-1)];
    bodies.push(body);if(!s.trunk)cut.push(top);
    // Cut face: rim, cambium just inside the bark, eccentric annual rings,
    // radial checks. A living trunk has no cut face; it leaves the vignette.
    const topFront=arc(top,extreme(top,-1),extreme(top,1),(a,b)=>a>b);
    const pith=[(Q(1)-.5)*s.radius*.3,(Q(2)-.5)*s.radius*.3];
    if(!s.trunk){line(topFront,'habitat-cut-wood',.9,.55);line(topBack,'habitat-cut-wood',.6,.38);
    line(angles.map(a=>xy([cx+Math.cos(a)*rad(a,Hs)*.92,cyw+Math.sin(a)*rad(a,Hs)*.92,topZ(a)])),'habitat-cambium',.5,.42,top);
    for(let r=0;r<7;r++){const k=.18+r*.14,a0=Q(r,3)*CA_TAU,span=CA_TAU*(.55+.35*Q(r,4)),pts=Array.from({length:30},(_,j)=>{const a=a0+span*j/29;return xy([cx+pith[0]+Math.cos(a)*rad(a,Hs)*k,cyw+pith[1]+Math.sin(a)*rad(a,Hs)*k*.98,topZ(a)]);});line(pts,'habitat-growth-ring',.5,.5,top);}
    for(let c=0;c<4;c++){const a=Q(c,5)*CA_TAU,pts=Array.from({length:8},(_,j)=>{const k=.12+.75*j/7;return xy([cx+pith[0]+Math.cos(a+.06*Math.sin(j))*rad(a,Hs)*k,cyw+pith[1]+Math.sin(a)*rad(a,Hs)*k,topZ(a)]);});line(pts,'habitat-check',.42,.36,top);}}
    // Silhouette generators drawn in two or three hand contacts each.
    for(const [pts,w] of [[left,1.05],[right,1.2]])for(let k=0;k<3;k++){const a=Math.floor(k*pts.length/3),b=Math.min(pts.length,Math.floor((k+1)*pts.length/3)+1);line(caSmoothProjectedCurve(pts.slice(a,b),3),'habitat-wood-edge',w*(s.trunk&&k===2?.6:1),s.trunk&&k===2?.3:.52);}
    line(caSmoothProjectedCurve(bottomFront,1),'habitat-wood-edge',.75,.36);
    // Bark furrows follow the surface on the visible half; denser at the
    // turning sides, with breaks where plates of bark meet.
    for(let q=0;q<18;q++){
      const a=Math.PI/2-HABIT_CAMERA.yaw+(Q(q,6)-.5)*Math.PI*1.05,n=[Math.cos(a),Math.sin(a),0];if(dot(n,HABIT_TOWARD_CAMERA)<.08)continue;
      const z0=Hs*.03+Q(q,7)*Hs*.35,z1=Math.min(s.trunk?Hs*.8:topZ(a)-6,z0+Hs*(.35+.5*Q(q,8)));
      const pts=Array.from({length:14},(_,j)=>{const z=mix(z0,z1,j/13),w=a+.025*Math.sin(z*.05+q);return xy(surf(w,z));});
      bark(pts,q,.5,.36,body);
    }
    // Plates of bark: short cross cracks between neighbouring furrows.
    for(let q=0;q<8;q++){const a=Math.PI/2-HABIT_CAMERA.yaw+(Q(q,30)-.5)*Math.PI*.95,z=Hs*(.06+.8*Q(q,31))*(s.trunk?.9:1);if(dot([Math.cos(a),Math.sin(a),0],HABIT_TOWARD_CAMERA)<.15||z>topZ(a)-10)continue;bark([0,1,2,3].map(j=>xy(surf(a+(j-1.5)*.05,z+(j%2?2:-1)))),q+60,.4,.32,body);}
    for(let q=0;q<3;q++){const a=Math.PI/2-HABIT_CAMERA.yaw+(Q(q,32)-.5)*1.6,z=Hs*(.15+.5*Q(q,33));lichen(xy(surf(a,z)),(10+10*Q(q,34))*s.scale,q,body);}
    // Shadowed side away from the light; a dark contact line at the ground.
    const shade=angles.filter(a=>dot([Math.cos(a),Math.sin(a),0],HABIT_LIGHT)<-.05&&dot([Math.cos(a),Math.sin(a),0],HABIT_TOWARD_CAMERA)>-.1);
    if(shade.length>2){const sorted=shade.slice().sort((a,b)=>a-b);shadows.push([...sorted.map(a=>xy(surf(a,2))),...sorted.slice().reverse().map(a=>xy(surf(a,s.trunk?Hs*.8:topZ(a)-4)))]);}
    cast.push([...bottomFront,...bottomFront.slice().reverse().map(([x,y,d])=>[x,y+5,d])]);
    // Roots and moss where the stump enters the ground.
    for(let r=0;r<4;r++){const a=Math.PI/2+(Q(r,9)-.5)*2.4,p=surf(a,Hs*.04),out=[Math.cos(a),Math.sin(a)],pts=[0,1,2,3,4,5,6].map(j=>{const t=j/6;return xy([p[0]+out[0]*s.radius*.55*t,p[1]+out[1]*s.radius*.55*t,Hs*.04*(1-t)**2]);});line(pts,'habitat-root',.7,.4);}
    for(let m=0;m<3;m++){const a=Math.PI/2+(Q(m,10)-.5)*2,c=xy(surf(a,Hs*(.02+.05*Q(m,11)))),w=22+Q(m,12)*20,blob=Array.from({length:21},(_,j)=>{const t=j/20*CA_TAU;return [c[0]+Math.cos(t)*w,c[1]-6+Math.sin(t)*w*.32*(t<Math.PI?1:.6)];});moss.push(blob);
      for(let k=0;k<5;k++){const x=c[0]+(Q(m*9+k,13)-.5)*w*1.6,y=c[1]-3+(Q(m*9+k,14)-.5)*6,h=6+Q(m*9+k,15)*7;mossShoot(x,y,c[2],h,m*9+k);}}
    var bermLine=bottomFront.slice().sort((p,q)=>p[0]-q[0]);
    groundY=Math.max(...bottomFront.map(p=>p[1]));
    contacts=[{x:(Math.min(...bottom.map(p=>p[0]))+Math.max(...bottom.map(p=>p[0])))/2,y:groundY-2,width:(Math.max(...bottom.map(p=>p[0]))-Math.min(...bottom.map(p=>p[0])))*.55}];
  }else{
    // Log or fallen branch: a tapered, slightly bent cylinder lying on the ground.
    const M=28,K=36,axis=t=>[mix(s.start[0],s.end[0],t),mix(s.start[1],s.end[1],t)+s.bend*Math.sin(Math.PI*t)];
    const dir=(()=>{const a=axis(0),b=axis(1),d=Math.hypot(b[0]-a[0],b[1]-a[1]);return [(b[0]-a[0])/d,(b[1]-a[1])/d];})(),n1=[-dir[1],dir[0]];
    const radius=t=>s.radius*(1-.14*t)*(1+.05*Math.sin(t*17+s.phase)+.03*Math.sin(t*41));
    const normal=b=>[n1[0]*Math.cos(b),n1[1]*Math.cos(b),Math.sin(b)];
    const surf=(t,b,inset=0)=>{const c=axis(t),r=radius(t)-inset,n=normal(b);return [c[0]+n[0]*r,c[1]+n[1]*r,radius(t)+n[2]*r];};
    const betas=Array.from({length:K},(_,i)=>i/K*CA_TAU);
    const sil=Array.from({length:M+1},(_,j)=>{const t=j/M,c=xy([...axis(t),radius(t)]),a=xy([...axis(Math.max(0,t-.02)),radius(t)]),b=xy([...axis(Math.min(1,t+.02)),radius(t)]),d=Math.hypot(b[0]-a[0],b[1]-a[1])||1,np=[-(b[1]-a[1])/d,(b[0]-a[0])/d];
      let lo=null,hi=null;for(const be of betas){const p=xy(surf(t,be)),o=(p[0]-c[0])*np[0]+(p[1]-c[1])*np[1];if(!lo||o<lo.o)lo={o,p,be};if(!hi||o>hi.o)hi={o,p,be};}return {lo,hi};});
    const upper=sil.map(q=>q.lo.p[1]<q.hi.p[1]?q.lo.p:q.hi.p),lower=sil.map(q=>q.lo.p[1]<q.hi.p[1]?q.hi.p:q.lo.p);
    const endRing=t=>betas.map(b=>xy(surf(t,b)));
    const ends=[0,1].map(t=>{const ringPts=endRing(t),out=t?dir:[-dir[0],-dir[1]],visible=out[0]*HABIT_TOWARD_CAMERA[0]+out[1]*HABIT_TOWARD_CAMERA[1]>0;return {t,ringPts,visible};});
    const body=[...upper,...lower.slice().reverse()];bodies.push(body);
    for(const end of ends)if(end.visible){
      cut.push(end.ringPts);line([...end.ringPts,end.ringPts[0]],'habitat-cut-wood',.85,.5);
      const c=xy([...axis(end.t),radius(end.t)]),pith=[(Q(3)-.5)*.25,(Q(4)-.5)*.25];
      line(betas.map(b=>xy(surf(end.t,b,radius(end.t)*.08))),'habitat-cambium',.45,.4,end.ringPts);
      for(let r=0;r<(s.kind==='branch'?3:6);r++){const k=.16+r*.14,a0=Q(r,16)*CA_TAU,span=CA_TAU*(.5+.4*Q(r,17)),pts=Array.from({length:26},(_,j)=>{const b=a0+span*j/25,p=xy(surf(end.t,b,radius(end.t)*(1-k)));return [p[0]+pith[0]*radius(end.t)*s.scale,p[1]+pith[1]*radius(end.t)*s.scale,p[2]];});line(pts,'habitat-growth-ring',.48,.5,end.ringPts);}
      for(let k=0;k<3;k++){const b=Q(k,18)*CA_TAU,pts=[0,1,2,3,4].map(j=>xy(surf(end.t,b+.05*j,radius(end.t)*(.85-.18*j))));line(pts,'habitat-check',.4,.34,end.ringPts);}
    }else{
      // The far end is broken: splinters stand out of the silhouette.
      const sgn=end.t?1:-1,jag=end.ringPts.map((p,j)=>{const b=betas[j],n=normal(b),reach=(4+14*Q(j,19)*(j%2?1:.3))*s.scale;return {p:xy([...(()=>{const q=surf(end.t,b);return [q[0]+dir[0]*sgn*reach,q[1]+dir[1]*sgn*reach,q[2]];})()]),v:dot(n,HABIT_TOWARD_CAMERA)};}).filter(q=>q.v>-.2).map(q=>q.p);
      if(jag.length>2)line(jag,'habitat-broken-end',.6,.45);
    }
    for(const [pts,w] of [[upper,1.05],[lower,1.2]])for(let k=0;k<3;k++){const a=Math.floor(k*pts.length/3),b=Math.min(pts.length,Math.floor((k+1)*pts.length/3)+1);line(caSmoothProjectedCurve(pts.slice(a,b),2),'habitat-wood-edge',w*(s.kind==='branch'?.8:1),.52);}
    // Furrows run along the log on its visible side; a few cross cracks.
    const furrows=s.kind==='branch'?10:18;
    for(let q=0;q<furrows;q++){
      const b=-.9+Q(q,20)*2.6,n=normal(b);if(dot(n,HABIT_TOWARD_CAMERA)<.1)continue;
      const t0=.03+Q(q,21)*.6,t1=Math.min(.97,t0+.12+.35*Q(q,22));
      bark(Array.from({length:16},(_,j)=>{const t=mix(t0,t1,j/15);return xy(surf(t,b+.05*Math.sin(t*23+q)));}),q,.48,.34,body);
    }
    for(let q=0;q<(s.kind==='branch'?3:7);q++){const t=.08+Q(q,23)*.84,b0=-.5+Q(q,24)*.4;bark([0,1,2,3,4,5].map(j=>xy(surf(t+.004*j,b0+j*.17))),q+40,.42,.3,body);}
    for(let q=0;q<(s.kind==='branch'?1:3);q++){const t=.15+.6*Q(q,35),b=.5+.6*Q(q,36);lichen(xy(surf(t,b)),(9+9*Q(q,37))*s.scale,q+10,body);}
    // Underside in shadow (away from light), a dark contact line below.
    const shadeB=betas.filter(b=>dot(normal(b),HABIT_LIGHT)<-.1&&dot(normal(b),HABIT_TOWARD_CAMERA)>-.05).sort((a,b)=>a-b);
    if(shadeB.length>1){const b0=shadeB[0],b1=shadeB.at(-1);shadows.push([...Array.from({length:M+1},(_,j)=>xy(surf(j/M,b0))),...Array.from({length:M+1},(_,j)=>xy(surf(1-j/M,b1)))]);}
    cast.push([...lower,...lower.slice().reverse().map(([x,y,d])=>[x,y+5,d])]);
    for(let m=0;m<(s.kind==='branch'?2:4);m++){const t=.12+Q(m,25)*.76,c=xy(surf(t,1.35)),w=(18+Q(m,26)*24)*s.scale/.72,blob=Array.from({length:21},(_,j)=>{const a=j/20*CA_TAU;return [c[0]+Math.cos(a)*w,c[1]+Math.sin(a)*w*.3];});moss.push(blob);
      for(let k=0;k<4;k++){const x=c[0]+(Q(m*9+k,27)-.5)*w*1.6,y=c[1]+(Q(m*9+k,28)-.5)*5,h=5+Q(m*9+k,29)*7;mossShoot(x,y,c[2],h,m*9+k+40);}}
    var bermLine=lower.slice().sort((p,q)=>p[0]-q[0]);
    // More moss along the top of a lying log.
    for(let m=0;m<(s.kind==='branch'?2:4);m++){const t=.08+.84*Q(m,41),c=xy(surf(t,1.5)),w=(26+Q(m,42)*30)*s.scale/.72,blob=Array.from({length:21},(_,j)=>{const a=j/20*CA_TAU;return [c[0]+Math.cos(a)*w,c[1]+Math.sin(a)*w*.32];});moss.push(blob);
      for(let k=0;k<6;k++){const x=c[0]+(Q(m*11+k,43)-.5)*w*1.7,y=c[1]+(Q(m*11+k,44)-.5)*w*.25,h=(6+Q(m*11+k,45)*8)*s.scale/.72;mossShoot(x,y,c[2],h,m*11+k+80);}}
    groundY=Math.max(...lower.map(p=>p[1]));
    contacts=[.2,.5,.8].map(t=>{const c=axis(t),p=xy([c[0],c[1]+radius(t)*.3,0]);return {x:p[0],y:p[1],width:radius(t)*s.scale*1.6};});
  }
  // Half-buried: a berm of leaf litter and soil laps over the foot of the
  // wood, in front of it, so the wood sits in the ground rather than on it.
  if(bermLine?.length>3&&!composition.behind){
    const h=(s.kind==='branch'?.45:.32)*s.radius*s.scale,top=bermLine.map(([x,y],j)=>[x,y-h*(.6+.25*Math.sin(j*.32+Q(1,50)*6)+.15*Math.sin(j*.71+Q(2,50)*6))]),bottom=bermLine.map(([x,y])=>[x,y+6]).reverse();
    const berm=[...top,...bottom];front.shapes.push(berm);
    wash([berm],{umber:.5,ochre:.32,sienna:.18},.09,'habitat-berm',{inFront:true});
    line(caSmoothProjectedCurve(top.map(([x,y])=>[x,y]),2),'habitat-berm-edge',.6,.5,null,[],{inFront:true});
    for(let k=0;k<Math.max(4,Math.round(top.length/3));k++){const c=top[Math.floor(Q(k,51)*top.length)],len=(10+12*Q(k,52))*s.scale/.72,a=(Q(k,53)-.5)*2.4,lf=Array.from({length:13},(_,j)=>{const t=j/12*CA_TAU;return [c[0]+Math.cos(t)*len*.5*Math.cos(a)-Math.sin(t)*len*.2*Math.sin(a),c[1]+3+(Math.cos(t)*len*.5*Math.sin(a)+Math.sin(t)*len*.2*Math.cos(a))*.55];});
      line(lf,'habitat-berm-leaf',.42,.5,null,[],{inFront:true});line([lf[0],lf[6]],'habitat-berm-leaf',.28,.36,lf,[],{inFront:true});}
  }
  // Fused common base of a caespitose tuft: stems converge into one lump.
  const tuft=composition.habit?.tuft&&composition.members.length>1&&composition.members.every(m=>m.attached);
  if(tuft){
    const pts=composition.members.flatMap(m=>Array.from({length:16},(_,j)=>{const a=j/16*CA_TAU,r=18*m.scale;return [m.x+Math.cos(a)*r,m.y+Math.sin(a)*r*.45-r*.25];}));
    const hull=habitatConvexHull(pts),b=hull.reduce((acc,p)=>({l:Math.min(acc.l,p[0]),r:Math.max(acc.r,p[0]),t:Math.min(acc.t,p[1]),bo:Math.max(acc.bo,p[1])}),{l:Infinity,r:-Infinity,t:Infinity,bo:-Infinity});
    const cx=(b.l+b.r)/2,lump=hull.map(([x,y])=>[x,y+(y-b.t)*.35+4*Math.exp(-((((x-cx)/(b.r-b.l+1))*3)**2))]);
    front.shapes.push(lump);wash([lump],{ochre:.38,umber:.42,sienna:.2},.085,'habitat-fused-base',{inFront:true});
    const lowerEdge=lump.filter(p=>p[1]>b.t+(b.bo-b.t)*.3).sort((p,q)=>p[0]-q[0]);
    if(lowerEdge.length>2)line(caSmoothProjectedCurve(lowerEdge,1),'habitat-fused-base-edge',.8,.5,null,[],{inFront:true});
    for(let k=0;k<5;k++){const x=mix(b.l,b.r,(k+.5)/5),pts=[[x,b.t+4],[x+(k-2)*1.5,(b.t+b.bo)/2],[x+(k-2)*2.5,b.bo-2]];line(pts,'habitat-fused-base-fibre',.32,.3,lump,[],{inFront:true});}
  }
  const B2=flat2(bodies),C2=flat2(cut);
  // The bark wash runs under attached shelves (they are glazed over it), so
  // no unpainted slit opens where a shelf leaves the bark.
  {const bark=wash(B2,{umber:.48,walnut:.42,ochre:.1},.1,'habitat-wood-wash',{extra:C2});if(bark&&composition.members.some(m=>m.barkClip&&m.barkClip[2]<0))bark.reserves=[...C2];}
  wash(C2,HABITAT_PIGMENTS.cut,.08,'habitat-cut-face');
  // Wood standing behind a catalog drawing keeps to four passages.
  if(!composition.behind)wash(flat2(moss),HABITAT_PIGMENTS.green,.095,'habitat-wood-moss');
  wash(flat2(shadows),HABITAT_PIGMENTS.barkShadow,.1,'habitat-wood-shadow',{extra:C2});
  if(!composition.behind)wash(flat2(lichens),{sapgreen:.22,paynes:.33,ochre:.45},.06,'habitat-lichen');
  wash(flat2(cast),HABITAT_PIGMENTS.dark,.09,'habitat-wood-contact-shadow');
  return {ink,washes,front,ground:{y:groundY,contacts,kind:s.kind},masks:[...B2,...C2]};
}
// Botanical habitat elements, drawn ink-first like the specimens. Each
// drawer takes a ground position (x, y), a size in plate units and a depth
// s (0 back, 1 front) that thins and pales its line; it registers every
// closed surface so nearer elements hide the ink of farther ones.
const LEAF_FORMS=Object.freeze({
  // width, widest point (exponent), margin, teeth, depth, veins, base, tip
  oak:{w:.34,a:.72,margin:'lobed',teeth:5,depth:.4,veins:5,base:'auricle',tip:'round'},
  beech:{w:.3,a:1,margin:'wavy',teeth:7,depth:.03,veins:7,base:'round',tip:'acute'},
  birch:{w:.36,a:1.45,margin:'dserrate',teeth:20,depth:.05,veins:6,base:'truncate',tip:'acuminate'},
  hazel:{w:.44,a:1.15,margin:'dserrate',teeth:24,depth:.04,veins:6,base:'cordate',tip:'cusp'},
  elm:{w:.3,a:1.1,margin:'dserrate',teeth:22,depth:.05,veins:10,base:'asym',tip:'acuminate'},
  ash:{w:.13,a:1,margin:'serrate',teeth:12,depth:.04,veins:6,base:'cuneate',tip:'acuminate'},
  elder:{w:.15,a:1,margin:'serrate',teeth:16,depth:.04,veins:6,base:'cuneate',tip:'acuminate'},
  poplar:{w:.46,a:1.6,margin:'crenate',teeth:14,depth:.035,veins:5,base:'truncate',tip:'acuminate'},
  apple:{w:.3,a:1.1,margin:'serrate',teeth:24,depth:.025,veins:7,base:'round',tip:'acute'},
  cherry:{w:.27,a:1.05,margin:'serrate',teeth:30,depth:.025,veins:9,base:'cuneate',tip:'acuminate'},
});
const BROADLEAF_OF=host=>({oak:'oak',beech:'beech',birch:'birch',hazel:'hazel',elm:'elm',ash:'ash',elder:'elder',poplar:'poplar',apple:'apple',cherry:'cherry',sycamore:'sycamore'})[host]??null;
function habitatElements(ctx){
  const {line,register,bucket,J,H,flat,inkAt,TA}=ctx,L=(a,b,t)=>a+(b-a)*t;
  const B=(a,b,c,d,n=19)=>Array.from({length:n},(_,i)=>{const t=i/(n-1),u=1-t;return[u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]];});
  const at=(p,t)=>{const a=Math.max(0,Math.min(p.length-1,t*(p.length-1))),i=Math.floor(a),j=Math.min(p.length-1,i+1);return[L(p[i][0],p[j][0],a-i),L(p[i][1],p[j][1],a-i)];};
  const ribbon=(points,r0,r1=r0*.2)=>{const left=[],right=[];for(let i=0;i<points.length;i++){const t=i/(points.length-1),a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],d=Math.hypot(b[0]-a[0],b[1]-a[1])||1,nx=-(b[1]-a[1])/d,ny=(b[0]-a[0])/d,r=L(r0,r1,t);left.push([points[i][0]+nx*r,points[i][1]+ny*r]);right.push([points[i][0]-nx*r,points[i][1]-ny*r]);}return {left,right,shape:[...left,...right.slice().reverse()]};};
  // Ground-plane frame: in-plane rotation, then foreshortening of the plane;
  // `lift` tilts the element out of the ground (a curled or propped leaf).
  const plane=(x,y,angle,lift=0)=>p=>{const c=Math.cos(angle),s=Math.sin(angle),u=p[0]*c-p[1]*s,v=p[0]*s+p[1]*c;return [x+u,y+v*L(flat,1,lift)-(p[2]??0)];};
  const leafOutline=(form,len,id)=>{
    // Half-width along the midrib (t: 0 base, 1 tip), margin and base shape.
    const f=LEAF_FORMS[form],w=f.w*len,profile=t=>Math.sin(Math.PI*Math.pow(Math.max(1e-4,t),f.a))**(f.tip==='acuminate'?1.25:f.tip==='round'?.55:.85);
    const margin=(t,side)=>{
      const k=f.teeth,u=t*k+(side>0?.15:0);
      if(f.margin==='lobed')return 1-f.depth*(1-Math.abs(Math.sin(Math.PI*u))**.55)*Math.min(1,t*6)*Math.min(1,(1-t)*5);
      if(f.margin==='wavy')return 1+f.depth*Math.sin(TA*u);
      if(f.margin==='crenate')return 1-f.depth+f.depth*2*Math.abs(Math.sin(Math.PI*u));
      const saw=u-Math.floor(u),tooth=(saw<.8?saw/.8:(1-saw)/.2);
      return 1-f.depth+f.depth*tooth*(f.margin==='dserrate'?(.6+.4*Math.abs(Math.sin(Math.PI*u/2))):1);
    };
    const base=(t,side)=>f.base==='cordate'?1+.25*Math.exp(-(((t-.08)/.05)**2)):f.base==='auricle'?1+.35*Math.exp(-(((t-.05)/.035)**2)):f.base==='asym'&&side>0?L(.55,1,Math.min(1,t*5)):f.base==='truncate'?1+.15*Math.exp(-(((t-.12)/.08)**2)):1;
    const half=(t,side)=>w*profile(t)*margin(t,side)*base(t,side);
    return {f,half,len};
  };
  // A fallen simple leaf: two halves on one bent midrib; the curled half is
  // foreshortened; decay brings holes, a broken margin and skeleton veins.
  const leaf=(x,y,len,angle,form,id,s,{detail=true,curl=.3,decay=0}={})=>{
    const g=leafOutline(form,len,id),{f}=g,first=ctx.inkLength(),o=inkAt(s);
    const bend=(J(id,1)-.5)*len*.25,twist=(J(id,2)-.5)*2*curl,lift=.3+.35*J(id,3)*Math.min(1,curl*2);
    const mid=t=>[bend*Math.sin(t*Math.PI),-len*t,lift*len*.25*Math.sin(Math.PI*t)];
    const tr=plane(x,y,angle,lift);
    const edge=side=>Array.from({length:61},(_,k)=>{const t=k/60,m=mid(t),h=g.half(t,side)*(side>0?L(1,.55,Math.max(0,twist)):L(1,.55,Math.max(0,-twist)));return tr([m[0]+side*h,m[1]+side*h*.12*(J(id,4)-.5),m[2]+(side*twist>0?h*.35:0)]);});
    const left=edge(-1),right=edge(1),shape=[...left,...right.slice().reverse()],mids=Array.from({length:31},(_,k)=>tr(mid(k/30)));
    bucket(decay>.55?'backs':'leaves',shape);
    // Margin: decay breaks it into separate contacts.
    const gaps=decay>.4?3:1;for(const [pts,wd] of [[left,.55],[right,.42]])for(let k=0;k<gaps;k++){const a=Math.floor(k*60/gaps)+(k?2:1),b=Math.floor((k+1)*60/gaps)-(k<gaps-1?2:0);line(pts.slice(a,b),'background-leaf-edge',wd*o+.12,.52*o);}
    line(mids,'background-leaf-midrib',.5*o,.5*o).species=form;
    const petiole=[tr([0,len*.02,0]),tr([bend*.1,len*.12,0]),tr([bend*.2+len*.03,len*.17,0])];line(petiole,'background-leaf-petiole',.6*o,.5*o);
    if(detail){
      const n=f.veins;
      for(let i=0;i<n;i++)for(const side of [-1,1]){
        const t0=.08+.8*i/n+(side>0?.02:0),t1=Math.min(.97,t0+(f.margin==='lobed'?.07:.11)),m=mid(t0),e=mid(t1),h=g.half(t1,side)*.93;
        const end=[e[0]+side*h,e[1],e[2]],vein=B(tr(m),tr([L(m[0],end[0],.35),L(m[1],end[1],.2),m[2]]),tr([L(m[0],end[0],.75),L(m[1],end[1],.75),m[2]]),tr(end),9);
        const mark=line(vein,'background-leaf-vein',.3*o,.34*o,shape);mark.branchOrder=2;
        if(i%2===1){const b=at(mark.points,.55),tip=tr([L(m[0],end[0],.7)+side*len*.04,L(m[1],end[1],.7)-len*.05,m[2]]);const child=line(B(b,[L(b[0],tip[0],.3),L(b[1],tip[1],.3)],[L(b[0],tip[0],.7),L(b[1],tip[1],.7)],tip,6),'background-leaf-veinlet',.2*o,.24*o,shape);child.branchOrder=3;child.points[0]=at(mark.points,.55);}
      }
      // Insect holes and decay patches (reserved from the leaf wash).
      const holes=Math.round(decay*3+(H(id,5)<.35?1:0));
      for(let k=0;k<holes;k++){const t=.25+.5*H(id,6+k),side=H(id,9+k)<.5?-1:1,m=mid(t),r=len*(.025+.04*H(id,12+k)),c=[m[0]+side*g.half(t,side)*.5,m[1],m[2]];
        const hole=Array.from({length:11},(_,j)=>{const a=j/10*TA,q=1+.3*Math.sin(a*3+k);return tr([c[0]+Math.cos(a)*r*q,c[1]+Math.sin(a)*r*q*1.3,c[2]]);});ctx.hole(hole);line(hole,'background-leaf-hole',.3*o,.4*o,shape);}
    }
    // The curled half throws a thin shadow on the leaf under it.
    const sideEdge=twist>0?right:left;ctx.bucket('shadows',[...sideEdge.slice(10,50),...sideEdge.slice(10,50).reverse().map(([a,b])=>[a+1.6,b+2.2])]);
    register(shape,first);return shape;
  };
  // Sycamore/maple: palmate, five toothed lobes, radial main veins.
  const palmate=(x,y,len,angle,id,s,{detail=true}={})=>{
    const first=ctx.inkLength(),o=inkAt(s),tr=plane(x,y,angle,.15*J(id,1)),lobes=[0,.78,-.78,1.55,-1.55],reach=[1,.86,.86,.52,.52];
    const r=th=>{let v=.18;for(let k=0;k<5;k++){const d=th-lobes[k];v=Math.max(v,reach[k]*Math.exp(-((d/.3)**2))*(1+.06*Math.sin(th*31+id)));}return v*len;};
    const shape=Array.from({length:121},(_,k)=>{const th=-2.3+4.6*k/120,q=r(th);return tr([Math.sin(th)*q,-Math.cos(th)*q,0]);});
    bucket('leaves',shape);line(shape.slice(0,60),'background-leaf-edge',.55*o+.1,.5*o);line(shape.slice(60),'background-leaf-edge',.42*o+.1,.42*o);
    for(let k=0;k<5;k++){const v=[0,.25,.55,.8,.95].map(t=>tr([Math.sin(lobes[k])*reach[k]*len*t,-Math.cos(lobes[k])*reach[k]*len*t,0]));const m=line(v,'background-leaf-vein',.36*o,.4*o,shape);m.branchOrder=2;}
    line([tr([0,0,0]),tr([len*.05,len*.25,0]),tr([len*.08,len*.45,0])],'background-leaf-petiole',.6*o,.48*o);register(shape,first);return shape;
  };
  // Ash/elder: a fallen compound leaf, rachis with paired leaflets, some lost.
  const compound=(x,y,len,angle,form,id,s)=>{
    const o=inkAt(s),tr=plane(x,y,angle,0),pairs=form==='elder'?2:4,rach=B([0,0],[len*.05,-len*.3],[-len*.05,-len*.65],[len*.02,-len],18).map(p=>tr([p[0],p[1],0]));
    line(rach,'background-rachis',.5*o+.1,.48*o);
    for(let k=0;k<pairs;k++)for(const side of [-1,1]){if(H(id*7+k,side>0?3:4)<.18)continue;const t=.22+.2*k,p=at(rach,t),a=angle+side*(1.15+.15*J(id+k,5));leaf(p[0],p[1],len*(.36-.02*k),a,form,id*11+k*2+(side>0),s,{detail:false,curl:.15});}
    const tip=rach.at(-1);leaf(tip[0],tip[1],len*.34,angle,form,id*11+40,s,{detail:false,curl:.1});
  };
  // Grass: culms with a sheath, a blade bending away at the node; some carry
  // a seedhead (panicle of spikelets). Far tufts are single strokes.
  const grassTuft=(x,y,h,id,s,{heads=true,rolled=false}={})=>{
    const o=inkAt(s),n=4+Math.round(3*H(id,1)),crown=[];
    for(let k=0;k<n;k++){
      const u=k/(n-1)-.5,lean=u*.9+(J(id+k,2)-.5)*.5,hh=h*(.55+.45*J(id+k,3)),node=[x+u*h*.08,y-hh*(.22+.12*J(id+k,4))];
      const sheath=[[x+u*3,y],[L(x+u*3,node[0],.5),L(y,node[1],.5)],node];line(sheath,'background-grass-sheath',.5*o+.1,.5*o);
      const tip=[node[0]+lean*hh*.75,node[1]-hh*(.55+.25*J(id+k,5))],ctrl=[node[0]+lean*hh*.15,node[1]-hh*.45];
      const blade=B(node,ctrl,[L(ctrl[0],tip[0],.6),L(ctrl[1],tip[1],.4)],tip,12);
      if(s>.35&&!rolled){const r=ribbon(blade,Math.max(.9,h*.022),.2);line([...r.left,...r.right.slice().reverse()],'background-grass-blade',.38*o+.08,.46*o);bucket('greens',r.shape);}
      else{line(blade,'background-grass-blade',.42*o+.06,.44*o);bucket('greens',ribbon(blade,1.1,.2).shape);}
      if(heads&&k%3===1&&H(id+k,6)<.7){
        const stalk=B(node,[node[0]+lean*hh*.1,node[1]-hh*.6],[node[0]+lean*hh*.25,node[1]-hh*1.05],[node[0]+lean*hh*.32,node[1]-hh*1.25],12);line(stalk,'background-grass-culm',.36*o,.4*o);
        const top=stalk.at(-1),panicle=[];for(let j=0;j<7;j++){const t=j/6,c=[L(stalk[8][0],top[0],t),L(stalk[8][1],top[1],t)],side=j%2?1:-1,len=hh*.09*(1-.5*t);panicle.push(c,[c[0]+side*len,c[1]-len*.6],c);}line(panicle,'background-grass-seedhead',.32*o,.42*o);
      }
      crown.push(node);
    }
  };
  const clover=(x,y,r,id,s)=>{const o=inkAt(s),first=ctx.inkLength();let all=[];for(let k=0;k<3;k++){const a=-Math.PI/2+(k-1)*2.15+(J(id,1)-.5)*.3,tr=plane(x,y,a+Math.PI/2,.2);const lf=Array.from({length:17},(_,j)=>{const t=j/16*TA,q=1-.35*Math.exp(-(Math.min(t,TA-t)**2)/.15);return tr([Math.cos(t)*r*.45*q+r*.55,Math.sin(t)*r*.42*q,0]);});
    bucket('greens',lf);line(lf,'background-clover',.38*o,.44*o);line([tr([r*.35,-r*.12,0]),tr([r*.55,0,0]),tr([r*.35,r*.12,0])],'background-clover-mark',.25*o,.3*o,lf);all=all.concat(lf);}
    line([[x,y],[x+1,y+r*1.6]],'background-clover',.32*o,.36*o);register(habitatConvexHull(all),first);};
  const plantain=(x,y,len,id,s)=>{const o=inkAt(s);for(let k=0;k<4;k++){const a=(k/4)*TA+J(id,1),tr=plane(x,y,a,.1);const lf=Array.from({length:25},(_,j)=>{const t=j/24*TA,u=(Math.cos(t)+1)/2;return tr([Math.sin(t)*len*.13*Math.sin(Math.PI*u),-len*u,0]);});bucket('greens',lf);line(lf,'background-plantain',.4*o,.42*o);for(const d of [-.05,.05])line([tr([0,-len*.08,0]),tr([d*len,-len*.5,0]),tr([d*len*.4,-len*.92,0])],'background-plantain-rib',.24*o,.3*o,lf);}};
  // Polytrichum: upright shoots ending in star rosettes, in a cushion.
  const polytrichum=(x,y,w,id,s)=>{
    const o=inkAt(s),n=8+Math.round(5*H(id,1)),first=ctx.inkLength(),tips=[];
    for(let k=0;k<n;k++){const u=k/(n-1)-.5,b=[x+u*w*1.6+(J(id+k,2)-.5)*w*.2,y+(J(id+k,3)-.5)*w*.12],h=w*(.5+.4*Math.cos(u*2.6)*J(id+k,4)+.2),lean=u*.4,top=[b[0]+lean*h*.3,b[1]-h];
      line([b,[L(b[0],top[0],.5)+1,L(b[1],top[1],.5)],top],'background-moss-stem',.34*o+.06,.42*o);
      const leaves=[];for(let j=0;j<4;j++){const p=[L(b[0],top[0],.25+.18*j),L(b[1],top[1],.25+.18*j)],side=j%2?1:-1;leaves.push(p,[p[0]+side*w*.07,p[1]-w*.05],p);}line(leaves,'background-moss-leaf',.26*o,.34*o);
      const star=[];const m=6;for(let j=0;j<m;j++){const a=j/m*TA+J(id+k,5),len=w*(.12+.05*H(id+k,j));star.push(top,[top[0]+Math.cos(a)*len,top[1]+Math.sin(a)*len*.45-w*.02]);}star.push(top);line(star,'background-moss-star',.32*o+.04,.46*o);tips.push(top);
      if(k===2&&H(id,7)<.6){const seta=[top,[top[0]+2,top[1]-w*.5],[top[0]+4,top[1]-w*.9]],cap=seta.at(-1);line(seta,'background-moss-seta',.28*o,.36*o);line([cap,[cap[0]+w*.05,cap[1]-2],[cap[0]+w*.09,cap[1]+3],[cap[0]+w*.03,cap[1]+4],cap],'background-moss-capsule',.5*o,.46*o);}}
    const body=habitatConvexHull([...tips.map(([a,b])=>[a,b-4]),[x-w*.85,y+3],[x+w*.85,y+3]]);bucket('greens',body);register(body,first);
  };
  // Hypnum: a flat mat of feathery, pinnately branched creeping shoots.
  const hypnum=(x,y,w,id,s)=>{
    const o=inkAt(s),n=5+Math.round(3*H(id,1)),first=ctx.inkLength(),pts=[];
    for(let k=0;k<n;k++){const a=(J(id+k,2)-.5)*1.2+(k%2?Math.PI:0),c=[x+(J(id+k,3)-.5)*w*.9,y+(J(id+k,4)-.5)*w*flat*.6],len=w*(.5+.3*H(id+k,5)),d=[Math.cos(a),Math.sin(a)*flat*1.6];
      const axis=B([c[0]-d[0]*len/2,c[1]-d[1]*len/2],[c[0]-d[0]*len/6,c[1]-d[1]*len/6-w*.05],[c[0]+d[0]*len/6,c[1]+d[1]*len/6-w*.04],[c[0]+d[0]*len/2,c[1]+d[1]*len/2],14);
      line(axis,'background-moss-stem',.32*o+.05,.42*o);
      for(const side of [-1,1]){const fern=[];for(let j=1;j<12;j++){if(H(id*37+k*13+j,side>0?70:71)<.3)continue;const p=axis[j],q=axis[j+1],dx=q[0]-p[0],dy=q[1]-p[1],dl=Math.hypot(dx,dy)||1,r=w*(.035+.06*H(id+k*5+j,72))*Math.sin(Math.PI*j/12),bendIn=.5+.6*H(id+j,73),tip=[p[0]+(-dy/dl*side+dx/dl*bendIn)*r,p[1]+(dx/dl*side+dy/dl*bendIn)*r*.6];fern.push(p,[L(p[0],tip[0],.55)+dx/dl*r*.15,L(p[1],tip[1],.55)],tip,p);}if(fern.length>2)line(fern,'background-moss-pinnae',.22*o,.3*o);}
      pts.push(...axis);}
    const mat=habitatConvexHull(pts.map(([a,b])=>[a,b])).map(([a,b])=>[a,b]);bucket('greens',mat);register(mat,first);
  };
  // Pine needles fall in fascicles of two held by a papery sheath; spruce
  // needles fall singly. Cones: pine ovoid with rhombic scales, spruce long.
  const needles=(x,y,len,angle,id,s,{pair=true}={})=>{const o=inkAt(s),spread=pair?.12+.22*J(id,1):0,d=a=>[Math.cos(a)*len,Math.sin(a)*len*flat*1.4],a1=d(angle-spread),a2=d(angle+spread);
    if(pair){line([[x+a1[0],y+a1[1]],[x+a1[0]*.5,y+a1[1]*.5+.4],[x,y],[x+a2[0]*.5,y+a2[1]*.5-.4],[x+a2[0],y+a2[1]]],'background-needle',.36*o+.08,.5*o);line([[x,y],[x-Math.cos(angle)*len*.08,y-Math.sin(angle)*len*.08*flat]],'background-needle-sheath',.9*o,.55*o);}
    else line([[x,y],[x+a1[0]*.5,y+a1[1]*.5+.3],[x+a1[0],y+a1[1]]],'background-needle',.4*o+.06,.48*o);
    bucket('needles',[[x,y],[x+a1[0],y+a1[1]],[x+a2[0],y+a2[1]+1.4],[x,y+1.6]]);};
  const cone=(x,y,len,angle,id,s,{spruce=false}={})=>{
    const first=ctx.inkLength(),o=inkAt(s),tr=plane(x,y,angle,.35),rw=len*(spruce?.2:.33),outline=Array.from({length:41},(_,k)=>{const t=k/40*TA,q=1+.07*Math.sin(t*9+id);return tr([Math.cos(t)*len*.5*q,Math.sin(t)*rw*q*(Math.cos(t)>0?.82:1),0]);});
    bucket('leaves',outline);line(outline.slice(0,22),'background-cone',.62*o+.1,.55*o);line(outline.slice(20),'background-cone',.45*o+.08,.42*o);
    const rows=spruce?7:5;for(let k=1;k<rows;k++){const u=-.5+k/rows,half=Math.sqrt(Math.max(0,1-(2*u)**2)),arc=Array.from({length:9},(_,j)=>{const v=(j/8-.5)*2*half;return tr([u*len+(spruce?len*.05:len*.08)*Math.cos(v*1.5),v*rw*.95,0]);});line(arc,'background-cone-scale',.34*o,.36*o,outline);}
    if(!spruce)for(let k=1;k<4;k++){const u=-.35+k*.18,arc=Array.from({length:7},(_,j)=>tr([u*len+(j/6-.5)*len*.35,(j/6-.5)*rw*1.4,0]));line(arc,'background-cone-scale',.28*o,.3*o,outline);}
    line([tr([len*.5,0,0]),tr([len*.62,len*.03,0])],'background-cone-stalk',.7*o,.5*o);
    ctx.bucket('shadows',outline.slice(10,30));register(outline,first);};
  // Twig with bark: lenticel dashes, a bud at a node, a split broken end.
  const twig=(x,y,len,angle,id,s)=>{
    const first=ctx.inkLength(),o=inkAt(s),d=[Math.cos(angle),Math.sin(angle)*flat*1.6],a=[x-d[0]*len/2,y-d[1]*len/2],b=[x+d[0]*len/2,y+d[1]*len/2];
    const p=B(a,[L(a[0],b[0],.33),L(a[1],b[1],.33)-len*.03*J(id,1)],[L(a[0],b[0],.66),L(a[1],b[1],.66)+len*.03*J(id,2)],b,22),r0=len*.022+1;
    const r=ribbon(p,r0,r0*.6);bucket('darks',r.shape);line(r.left,'background-twig',.6*o+.15,.62*o);line(r.right,'background-twig',.5*o+.12,.52*o);
    for(let k=0;k<6;k++){const c=at(p,.1+.14*k+.04*H(id,k)),dl=r0*.7;line([[c[0]-dl,c[1]-.4],[c[0]+dl,c[1]+.3]],'background-lenticel',.3*o,.42*o,r.shape);}
    const node=at(p,.42),side=H(id,7)<.5?1:-1,shoot=B(node,[node[0]+len*.08,node[1]+side*len*.05*flat*3],[node[0]+len*.16,node[1]+side*len*.09*flat*3],[node[0]+len*.22,node[1]+side*len*.12*flat*3],9);
    const rs=ribbon(shoot,r0*.55,r0*.3);bucket('darks',rs.shape);line([...rs.left,...rs.right.slice().reverse()],'background-twig',.38*o,.42*o);
    const bud=shoot.at(-1);line([[bud[0]-1,bud[1]+1.5],[bud[0]+r0*1.6,bud[1]],[bud[0]-1,bud[1]-1.5]],'background-bud',.55*o,.5*o);
    const end=p.at(-1),split=[];for(let k=0;k<6;k++)split.push([end[0]+d[0]*(k%2?r0*1.8:r0*.4)+(k/5-.5)*r0*.4,end[1]+(k/5-.5)*2*r0]);line(split,'background-broken-end',.42*o,.48*o);
    register(r.shape,first);};
  // Mast: an acorn in its scaled cup, or an open four-valved beech husk.
  const acorn=(x,y,len,angle,id,s)=>{const first=ctx.inkLength(),o=inkAt(s),tr=plane(x,y,angle,.4);
    const nut=Array.from({length:25},(_,k)=>{const t=k/24*TA;return tr([Math.cos(t)*len*.5,Math.sin(t)*len*.28,0]);}),cup=Array.from({length:15},(_,k)=>{const t=Math.PI/2+k/14*Math.PI;return tr([-len*.28+Math.cos(t)*len*.24,Math.sin(t)*len*.33,0]);});
    bucket('leaves',nut);bucket('backs',cup);line(nut.slice(0,14),'background-acorn',.55*o,.55*o);line(nut.slice(13),'background-acorn',.42*o,.42*o);line(cup,'background-acorn-cup',.55*o,.55*o);
    const scales=[];for(let k=0;k<6;k++){const c=at(cup,(k+.5)/6);scales.push(c,[c[0]+len*.05,c[1]+len*.02]);}line(scales,'background-acorn-scale',.3*o,.38*o,cup);line([tr([len*.5,0,0]),tr([len*.56,0,0])],'background-acorn',.7*o,.5*o);register(nut,first);};
  const beechMast=(x,y,len,id,s)=>{const first=ctx.inkLength(),o=inkAt(s),tr=plane(x,y,J(id,1)*TA,.3),all=[];
    for(let k=0;k<4;k++){const a=k/4*TA+.4,valve=Array.from({length:13},(_,j)=>{const t=j/12,w=Math.sin(Math.PI*t)*len*.16;return tr([Math.cos(a)*len*.5*t-Math.sin(a)*w*(j<7?1:-1),Math.sin(a)*len*.5*t+Math.cos(a)*w*(j<7?1:-1),0]);});all.push(...valve);line(valve,'background-beech-husk',.45*o,.5*o);
      const bristles=[];for(let j=2;j<11;j+=2){const p=valve[j];bristles.push(p,[p[0]+Math.cos(a+1.2)*len*.06,p[1]+Math.sin(a+1.2)*len*.04],p);}line(bristles,'background-beech-bristle',.22*o,.32*o);}
    const hull=habitatConvexHull(all);bucket('leaves',hull);
    for(let k=0;k<2;k++){const c=tr([(k?.2:-.15)*len,(k?.18:.3)*len,0]),tri=[[c[0],c[1]-len*.12],[c[0]+len*.1,c[1]+len*.06],[c[0]-len*.1,c[1]+len*.06],[c[0],c[1]-len*.12]];line(tri,'background-beech-nut',.45*o,.5*o);bucket('backs',tri);}
    register(hull,first);};
  const stone=(x,y,r,id,s)=>{const first=ctx.inkLength(),o=inkAt(s),shape=Array.from({length:23},(_,k)=>{const t=k/22*TA,q=1+.16*Math.sin(t*3+id)+.07*Math.sin(t*7+id*2);return [x+Math.cos(t)*r*q,y+Math.sin(t)*r*q*.62-(Math.sin(t)<0?r*.25*Math.abs(Math.sin(t)):0)];});
    bucket('stones',shape);line(shape.slice(10,23),'background-stone',.55*o+.08,.5*o);line(shape.slice(0,9),'background-stone',.32*o,.3*o);
    const hatch=[];for(let k=0;k<4;k++){const t=.12+k*.08,p=shape[Math.round(t*22)];hatch.push(p,[p[0]-r*.25,p[1]-r*.12],p);}line(hatch,'background-stone-shade',.24*o,.32*o,shape);ctx.bucket('shadows',shape.slice(1,10));register(shape,first);};
  const crumbs=(x,y,w,id,s)=>{const o=inkAt(s);for(let k=0;k<3;k++){const c=[x+(J(id+k,1)-.5)*w,y+(J(id+k,2)-.5)*w*flat],r=1.2+2.4*H(id+k,3),loop=Array.from({length:8},(_,j)=>{const a=j/7*TA;return [c[0]+Math.cos(a)*r*(1+.3*Math.sin(a*2+k)),c[1]+Math.sin(a)*r*.6];});line(loop,'background-soil-crumb',.32*o,.42*o);bucket('stones',loop);}};
  const soilStroke=(x,y,len,s)=>{const o=inkAt(s);line(B([x,y],[x+len*.3,y-1.1],[x+len*.7,y+.5],[x+len,y-.3],6),'background-soil',.42*o+.05,.3*o);};
  const charStick=(x,y,len,angle,id,s)=>{const first=ctx.inkLength(),o=inkAt(s),d=[Math.cos(angle),Math.sin(angle)*flat*1.5],a=[x-d[0]*len/2,y-d[1]*len/2],b=[x+d[0]*len/2,y+d[1]*len/2],p=B(a,[L(a[0],b[0],.3),L(a[1],b[1],.3)-2],[L(a[0],b[0],.7),L(a[1],b[1],.7)+1],b,13),r=ribbon(p,len*.04+1.5,len*.03+1);
    bucket('char',r.shape);line(r.left,'background-char',.75*o+.1,.6*o);line(r.right,'background-char',.5*o,.45*o);const checks=[];for(let k=0;k<5;k++){const c=at(p,.12+k*.18),q=at(p,.12+k*.18+.02);checks.push([c[0],c[1]-r0(len)],[q[0],q[1]+r0(len)]);}for(let k=0;k<checks.length;k+=2)line([checks[k],checks[k+1]],'background-char-check',.38*o,.45*o,r.shape);register(r.shape,first);};
  const r0=len=>len*.035+1.2;
  const chip=(x,y,len,angle,id,s)=>{const first=ctx.inkLength(),o=inkAt(s),tr=plane(x,y,angle,.1),shape=[[-.5,-.2],[.35,-.28],[.5,.05],[.2,.3],[-.45,.22]].map(([a,b])=>tr([a*len*(1+.2*H(id,1)),b*len*(1+.3*H(id,2)),0]));shape.push(shape[0]);
    bucket('backs',shape);line(shape,'background-chip',.48*o,.48*o);for(let k=0;k<2;k++)line([tr([-.4*len,(-.1+.15*k)*len,0]),tr([.4*len,(-.12+.15*k)*len,0])],'background-chip-grain',.24*o,.3*o,shape);register(shape,first);};
  const marram=(x,y,h,id,s)=>{const o=inkAt(s);for(let k=0;k<5;k++){const u=k/4-.5,tip=[x+u*h*.7,y-h*(.7+.3*J(id+k,1))],p=B([x+u*3,y],[x+u*5,y-h*.4],[tip[0]-u*h*.1,tip[1]+h*.2],tip,10);line(p,'background-marram',.42*o+.06,.46*o);bucket('greens',ribbon(p,1.1,.3).shape);}};
  const ripple=(x,y,w,s)=>{const o=inkAt(s);line(B([x-w/2,y],[x-w/6,y-2],[x+w/6,y+1.5],[x+w/2,y-1],12),'background-sand-ripple',.32*o,.3*o);};
  const larva=(x,y,len,id,s)=>{const first=ctx.inkLength(),o=inkAt(s),p=B([x-len/2,y+2],[x-len/5,y-len*.12],[x+len/5,y+len*.1],[x+len/2,y-1],14),r=ribbon(p,len*.12,len*.09);bucket('backs',r.shape);line(r.left,'background-larva',.5*o,.5*o);line(r.right,'background-larva',.4*o,.42*o);for(let k=1;k<7;k++){const a=r.left[k*2],b=r.right[k*2];line([a,[L(a[0],b[0],.5)+1,L(a[1],b[1],.5)],b],'background-larva-segment',.28*o,.36*o,r.shape);}register(r.shape,first);};
  // A cow pat: a low mound with a lumpy rim, concentric slump folds, a
  // crazed dry crust, straw fibres and grass pushing through.
  const dungPat=(cx,cy,w,id,s)=>{const o=inkAt(s),pat=Array.from({length:61},(_,k)=>{const t=k/60*TA,r=1+.09*Math.sin(t*4+id)+.06*Math.sin(t*11)+.04*Math.abs(Math.sin(t*17+id));return [cx+Math.cos(t)*w*r,cy+Math.sin(t)*w*flat*.75*r-(Math.sin(t)<0?w*.16*Math.abs(Math.sin(t)):0)];});
    for(const k of [.72,.45]){const fold=pat.slice(4,30).map(([x,y])=>[cx+(x-cx)*k,cy-w*.05*(1-k)*3+(y-cy)*k]);line(fold,'background-dung-fold',.42*o,.42*o,pat);}
    bucket('dung',pat);line(pat.slice(0,22),'background-dung-edge',.75*o,.55*o);line(pat.slice(21),'background-dung-edge',.5*o,.4*o);
    for(let k=0;k<4;k++){const c=[cx+(H(id+k,1)-.5)*w*1.1,cy-w*.06+(H(id+k,2)-.5)*w*flat*.6];line([[c[0]-w*.12,c[1]],[c[0],c[1]-w*.02],[c[0]+w*.1,c[1]+w*.01]],'background-dung-crack',.4*o,.4*o,pat);}
    for(let k=0;k<6;k++){const c=[cx+(H(id+k,3)-.5)*w*1.4,cy+(H(id+k,4)-.5)*w*flat],a=H(id+k,5)*TA,l=w*.25;line([[c[0],c[1]],[c[0]+Math.cos(a)*l,c[1]+Math.sin(a)*l*flat]],'background-straw',.35*o,.42*o);}
    return pat;};
  const buriedBranch=(x,y,len,angle,id,s)=>{const first=ctx.inkLength(),o=inkAt(s),d=[Math.cos(angle),Math.sin(angle)*flat],p=B([x-d[0]*len/2,y-d[1]*len/2],[x-d[0]*len/6,y-len*.03],[x+d[0]*len/6,y-len*.02],[x+d[0]*len/2,y+d[1]*len/2],18),r=ribbon(p,len*.05,len*.035);
    const top=r.left;bucket('darks',[...top,...p.slice().reverse()]);line(top,'background-buried-wood',.55*o,.5*o);for(let k=0;k<5;k++){const a=at(top,.1+.18*k),b=at(p,.15+.18*k);line([a,b],'background-bark-furrow',.3*o,.36*o);}line(p,'background-soil-line',.4*o,.4*o);register([...top,...p.slice().reverse()],first);};
  return {leaf,palmate,compound,grassTuft,clover,plantain,polytrichum,hypnum,needles,cone,twig,acorn,beechMast,stone,crumbs,soilStroke,charStick,chip,marram,ripple,larva,dungPat,buriedBranch};
}

// Merge a setting into a plan: setting ink/washes go first (behind); front
// marks follow the specimen, whose ink excludes and washes reserve them.
export function mergeHabitatLayers(plan,layers){
  const front={ink:[],washes:[],shapes:[]},ink=[],washes=[];
  const inkShield=[];
  for(const layer of layers){if(!layer)continue;ink.push(...layer.ink);washes.push(...layer.washes);if(layer.front){front.ink.push(...layer.front.ink);front.washes.push(...layer.front.washes);front.shapes.push(...layer.front.shapes);if(!layer.front.inkShielded)inkShield.push(...layer.front.shapes);}}
  const shield=front.shapes;
  const specimenInk=inkShield.length?plan.ink.map(mark=>({...mark,exclude:[...(mark.exclude??[]),...inkShield]})):plan.ink;
  const specimenWashes=shield.length?plan.washes.map(mark=>({...mark,reserves:[...(mark.reserves??[]),...shield]})):plan.washes;
  const habitatSetting=plan.habitatSetting||layers.some(Boolean)||!!plan.substrateWood;
  return {...plan,habitatSetting,ink:[...ink,...specimenInk,...front.ink],washes:[...washes,...specimenWashes,...front.washes]};
}

export const CONNECTED_CAP_GRAMMARS=Object.freeze(['oyster','chanterelle','amanita','bolete','parasol','inkcap','agaric','bonnet','waxcap','milkcap','hedgehog','bracket']);
// Every catalog growth plan has a genuine 3D body: one closed revolved
// stipe/cap mesh plus optional closed parts (annular rings, volvas, earthstar
// rays, coral branch tubes, nest eggs). Surface relief is drawn on the 3D
// surfaces themselves, so it turns, foreshortens and hides with the body.
export const CONNECTED_BODY_GRAMMARS=Object.freeze(['amanita','bolete','chanterelle','morel','parasol','inkcap','oyster','bracket','puffball','coral','agaric','bonnet','waxcap','milkcap','hedgehog','cup','trumpet','earthstar','nest','club','jelly','tooth','saddle','stinkhorn']);
const CA_BODY_DEFAULTS=Object.freeze({gills:1,domePow:1,bowl:0,lobes:0,lobeDepth:0,lobeLift:0,crestWidth:.065,radialRings:5,
  branches:0,branchLength:0,eggs:0,toothLength:0,volva:0,ringT:.8,rays:0,rayRadius:0,rayCurl:0,
  warts:0,scales:0,striae:0,pits:0,zones:0,veins:0,fringe:0,cracks:0,net:0,wrinkles:0,stemRibs:0});
const CA_SURFACE_DECOR=Object.freeze({warts:{warts:1},flakes:{warts:.7,scales:.3},dots:{warts:.45},scales:{scales:1},shaggy:{scales:1.4},tiles:{scales:.9},
  woolly:{scales:.6,fringe:.8},fibrils:{striae:.6},striated:{striae:1},pleated:{striae:1.4},ribbed:{striae:1},fluted:{striae:.8,stemRibs:1},cracked:{cracks:1},
  reticulum:{net:1},mosaic:{cracks:1.3},spines:{warts:.55},pitted:{pits:1},labyrinth:{pits:1.3},chambered:{pits:.8},netted:{pits:1},lace:{pits:.6,net:1},
  zoned:{zones:1},veined:{veins:1},fringed:{fringe:1},ragged:{fringe:.8},hairy:{fringe:.6,scales:.3},wrinkled:{wrinkles:1},folded:{wrinkles:1},
  brain:{wrinkles:1.4},twisted:{striae:.5},split:{fringe:.3},silky:{striae:.3},velvet:{},smooth:{},collared:{},crested:{},comb:{},antler:{},crowned:{},blunt:{},
  forked:{veins:.6},ruffled:{fringe:.5},folds:{},lobed:{},cascading:{},branched:{},short:{},pendant:{},pointed:{}});
const CA_CLOSED=new Set(['morel','puffball','earthstar','nest','cup','jelly','club','coral','tooth','saddle','stinkhorn','trumpet']);
function caBodyPlan(p,genome,v,variant,m){
  const g=p.grammar,grow=.82+.18*m,pick=list=>list[variant%list.length];
  if(g==='morel'){const stem=26+v[8]*14;Object.assign(p,{radius:(stem*1.6+16+v[0]*26)*pick([1.05,.86,1.25,1.15,.8])*grow,height:(150+v[7]*70)*grow,stemRadius:stem,rimLift:-(52+v[3]*40),dome:(115+v[1]*90)*pick([.9,1.25,.85,.95,1.2]),domePow:pick([.7,1,.7,.75,1.05]),thickness:6,capDepth:.94,tiltX:(v[6]-.5)*.1,tiltY:(v[6]-.5)*.1,ripple:2,decurrent:0,marginCurl:0,crest:0,radialRings:9,gills:0,pits:1,bulb:.25});}
  if(g==='puffball'){const r=(80+v[0]*48)*pick([.9,.85,1.1,.8,.85])*grow,lift=r*.62;Object.assign(p,{radius:r,height:pick([48,30,8,14,34])+v[7]*22,stemRadius:r*pick([.6,.62,.68,.6,.64]),rimLift:lift,bowl:1,dome:lift+r*pick([1.05,1.35,.88,.95,1.3]),domePow:.5,thickness:2,capDepth:1,tiltX:(v[6]-.5)*.08,tiltY:(v[6]-.5)*.08,bend:0,lean:0,ripple:1.5,decurrent:0,marginCurl:0,crest:0,crestWidth:.065,radialRings:10,gills:0,bulb:variant===0?.3:0});}
  if(g==='earthstar'){const r=(42+v[0]*20)*grow,lift=r*.6;Object.assign(p,{radius:r,height:variant===2?44+v[7]*20:16,stemRadius:r*.5,rimLift:lift,bowl:1,dome:lift+r*.98,domePow:.5,thickness:2,capDepth:1,tiltX:0,tiltY:0,bend:0,lean:0,ripple:1,decurrent:0,marginCurl:0,crest:0,radialRings:10,gills:0,
    rays:pick([6,9,5,7,8]),rayRadius:(150+v[0]*55)*grow,rayCurl:pick([10,24,4,14,34])+v[3]*14,lobeDepth:.78});}
  if(g==='cup'){const r=(78+v[0]*58)*pick([1.15,.9,.75,.8,.85])*grow;Object.assign(p,{radius:r,height:variant===2?80+v[7]*55:8+v[7]*10,stemRadius:pick([16,12,9,13,14])+v[8]*7,rimLift:r*pick([.42,.55,.62,.6,1.05]),dome:0,fold:0,thickness:5,capDepth:1,tiltX:(v[6]-.5)*.15,tiltY:(v[6]-.5)*.15,bend:variant===2?(v[10]-.5)*25:0,lean:0,ripple:3+v[4]*5,decurrent:0,marginCurl:0,crest:0,gills:0,radialRings:7,
    eccentricity:variant===1?.42:0,lobes:variant===1?1:0,lobeDepth:variant===1?.45:0});}
  if(g==='trumpet'){Object.assign(p,{radius:(70+v[0]*45)*pick([1.15,.85,1,1,.7])*grow,height:(150+v[7]*80)*grow,stemRadius:11+v[8]*7,rimLift:120+v[1]*80,dome:0,fold:.65,thickness:4,capDepth:1,ripple:6+v[4]*12,decurrent:.6,marginCurl:0,crest:0,gills:0,radialRings:7,lobes:variant===4?1:0,lobeDepth:variant===4?.3:0});}
  if(g==='nest'){Object.assign(p,{radius:(66+v[0]*26)*grow,height:variant===2?34:6,stemRadius:13,rimLift:62+v[1]*30,dome:0,fold:.2,thickness:3,capDepth:1,tiltX:(v[6]-.5)*.12,tiltY:(v[6]-.5)*.12,bend:0,lean:0,ripple:2,decurrent:0,marginCurl:0,crest:0,gills:0,radialRings:6,eggs:pick([5,3,4,4,2])});}
  if(g==='club'){const stem=(15+v[8]*10)*pick([1.25,.9,.8,1,.7]);Object.assign(p,{radius:stem*pick([1.55,1.35,1.9,1.4,1.12])+13,height:(110+v[7]*80)*grow,stemRadius:stem,rimLift:-(55+v[3]*45)*pick([1,1,.4,1,1.3]),dome:(85+v[1]*70)*pick([1,1.15,.55,1,1.6]),domePow:pick([.7,1,.55,.8,1.2]),thickness:5,capDepth:.95,ripple:1.5,decurrent:0,marginCurl:0,crest:0,gills:0,radialRings:8,lobes:variant===1?2:0,lobeLift:variant===1?22:0});}
  if(g==='jelly'){Object.assign(p,{radius:(85+v[0]*50)*pick([1.1,.9,.85,1,.7])*grow,height:14+v[7]*12,stemRadius:16,rimLift:8+v[3]*14,dome:22+v[1]*22,domePow:.8,thickness:10,capDepth:pick([.9,.7,1,.95,.6]),ripple:12+v[4]*18,lobes:pick([4,2,0,5,3]),lobeDepth:.22,lobeLift:16+v[1]*14,decurrent:0,marginCurl:0,crest:0,gills:0,radialRings:6});}
  if(g==='saddle'){Object.assign(p,{radius:(58+v[0]*30)*grow,height:(150+v[7]*70)*grow,stemRadius:15+v[8]*10,rimLift:-(40+v[3]*30),dome:28+v[1]*24,thickness:5,capDepth:.92,lobes:pick([2,2,3,2,2]),lobeDepth:.14,lobeLift:34+v[1]*20,ripple:4,decurrent:0,marginCurl:0,crest:0,gills:0,radialRings:8,stemRibs:pick([1,.6,0,.8,1])});}
  // Phallus impudicus (stinkhorn-1): a narrow thimble about 1.4 stipe radii wide.
  if(g==='stinkhorn'){const stem=18+v[8]*9;Object.assign(p,{radius:variant===0?stem*1.4:stem*1.25+14,height:(210+v[7]*90)*grow,stemRadius:stem,rimLift:-(62+v[3]*30),dome:58+v[1]*24,domePow:.9,thickness:5,capDepth:1,ripple:1.5,decurrent:0,marginCurl:0,crest:0,gills:0,radialRings:8,bulb:0,volva:1,pits:variant===2?0:1,net:variant===1?1:0});}
  if(g==='coral'){const stem=(24+v[8]*12)*pick([1.15,.9,1.2,1.25,.85]);Object.assign(p,{radius:stem+15,height:(70+v[7]*45)*grow,stemRadius:stem,rimLift:-4,dome:16,domePow:.7,thickness:4,capDepth:1,ripple:1,decurrent:0,marginCurl:0,crest:0,gills:0,radialRings:4,branches:pick([5,4,4,7,6]),branchLength:(105+v[0]*55)*pick([1,1.25,.7,.95,1.15])*grow});}
  if(g==='tooth'){Object.assign(p,{radius:(85+v[0]*42)*pick([1,.9,1.15,1,1.05])*grow,height:24,stemRadius:26,rimLift:-18,dome:(55+v[1]*32)*pick([1.1,.8,.6,1,.9]),domePow:.7,thickness:5,capDepth:.92,ripple:5,decurrent:0,marginCurl:0,crest:0,gills:0,teeth:1,toothLength:pick([42,30,14,32,72])+v[3]*14,radialRings:8});}
  if(g==='hedgehog')p.toothLength=12+v[3]*8;
  // Veil, hymenium and relief come from the phenotype, so a hybrid's donor
  // module is real 3D geometry on the host body rather than a pasted texture.
  const ph=genome.phenotype??{},veil=ph.veil??'none',hy=ph.hymenium;
  if(veil==='ring')p.ring=1;else if(g==='amanita'){p.ring=0;if(veil==='sac')p.volva=1;else if(veil==='boot')p.volva=.6;}
  // The death cap (amanita-3) has both a skirt and a white sac volva.
  if(g==='amanita'&&variant===2)p.volva=1;
  if(g==='amanita'&&veil!=='none')p.bulb=Math.max(p.bulb,.6);
  if(hy==='pores')Object.assign(p,{pores:1,teeth:0,gills:0});
  else if(hy==='teeth')Object.assign(p,{teeth:1,pores:0,gills:0,toothLength:p.toothLength||14});
  else if(hy==='gills'||hy==='folds')Object.assign(p,{gills:1,pores:0,teeth:0});
  else p.gills=0;
  const decor=CA_SURFACE_DECOR[ph.surface]??{};
  for(const [key,value] of Object.entries(decor))p[key]=Math.max(p[key],value);
  if(CA_CLOSED.has(g)&&p.net&&g!=='stinkhorn'){p.pits=Math.max(p.pits,p.net);p.net=0;}
  if(g==='morel')p.pits=Math.max(p.pits,.7);
}
// Mycological anatomy for the 3D bodies. All values are numeric so a morph can
// interpolate them; the strings that choose them come from the type recipe.
const CA_CAPPED=new Set(['amanita','agaric','bonnet','waxcap','inkcap','parasol','milkcap','bolete','hedgehog']);
const CA_VIEW_PITCH=Object.freeze({morel:.1,club:.12,stinkhorn:.1,saddle:.12,coral:.16,puffball:.14,tooth:.16,earthstar:.42,cup:.5,nest:.55,bracket:.32,oyster:-.14,jelly:.36,trumpet:.12,chanterelle:.08});
// Stipitate caps are seen from a little below the rim, as on a botanical
// plate, so the gills, pores or teeth under the cap are in view; brackets,
// tooth tufts and open forms are seen from above, as the default plate shows them.
const CA_UNDER_CAP_PITCH=-.3;
export function defaultViewPitch(typeId){return CA_VIEW_PITCH[TYPES_BY_ID.get(typeId)?.grammar]??CA_UNDER_CAP_PITCH;}
// The camera's default (.36) maps to the family's plate angle; the drag range
// (-.12..85) still reaches from below the cap to nearly straight down.
const caBodyPitch=(pitch,genome)=>{const home=CA_VIEW_PITCH[genome?.phenotype?.grammar]??CA_UNDER_CAP_PITCH;return caClamp(pitch>=.36?home+(pitch-.36)*(1.2-home)/.49:home+(pitch-.36)*(home+.6)/.48,-.6,1.2);};
const CA_ANATOMY_DEFAULTS=Object.freeze({inroll:0,cone:0,tubes:0,overhang:0,gillFree:0,stemClub:0,stemRoot:0,apexFlare:0,bulbRings:0,skirtDrop:0,skirtWidth:0,
  snake:0,inkMargin:0,pear:0,rimGap:12,bulbAt:0,bulbWidth:0,radialPow:1,waist:0,head:0,headMargin:0,hatch:1,wartReserve:0,pitRows:0,pitDepth:0,leanY:0,attach:0,spines:0,stemPores:0,zoneRidges:0,umbo:0,lamellulae:1,coralLevels:0,logRadius:0,pleats:0});
function caCapProfile(p,ph,open){
  const R=p.radius,shape=ph.capShape??'dome',closed=1-open;
  const [drop,dome,pow,cone,umbo]={dome:[.24,.34,.55,0,0],conic:[.34,.5,.8,.6,0],flat:[.1,.13,.65,0,0],lobed:[.17,.24,.6,0,0],umbonate:[.13,.12,.7,0,.1]}[shape]??[.22,.3,.6,0,0];
  // A young cap is closed and convex with an incurved margin; an adult expands.
  Object.assign(p,{rimLift:-R*(drop+.2*closed),dome:R*(dome+.12*closed),domePow:pow,cone,crest:R*umbo,crestWidth:.035,umbo:umbo>0?1:0,
    thickness:Math.max(4,R*.075),inroll:ph.margin==='inrolled'?1:.3+.5*closed,marginCurl:0,decurrent:0,ripple:Math.min(p.ripple,shape==='lobed'?7:2.5),fold:0,tiltY:p.tiltY*.6});
  if(shape==='lobed')Object.assign(p,{lobes:5,lobeDepth:.06});
  if(ph.margin==='striated')p.striae=Math.max(p.striae,.7);
  if(ph.margin==='ragged')p.fringe=Math.max(p.fringe,.45);
  const sf=ph.stemForm??'equal';
  Object.assign(p,{stemClub:sf==='clavate'?.55:0,stemRoot:sf==='rooting'?.55:0,bulb:sf==='bulbous'?Math.max(p.bulb,.65):p.bulb*.4,apexFlare:.16});
  if(sf==='slender')p.stemRadius*=.78;
}
// A body fitted to its catalog drawing takes the drawn cap rise, stipe
// length and girth and earthstar ray reach (over the cap radius), within limits, so the turned body has the
// drawing's proportions and its first reprojected frames fit the drawing.
function caDrawnProportions(p,drawn){
  if(!drawn)return;
  if(Number.isFinite(drawn.widen)&&drawn.widen!==1){if(p.coralLevels)p.coralSpread=drawn.widen;else{p.radius*=drawn.widen;if(p.rayRadius)p.rayRadius*=drawn.widen;}}
  if(Number.isFinite(drawn.rays)&&p.rays>0)p.rayRadius=caClamp(drawn.rays*p.radius,p.rayRadius*.7,p.rayRadius*1.4);
  if(p.head>0||p.bowl)return;
  const below=Math.min(0,p.rimLift),cap=p.thickness+p.dome-below;
  if(Number.isFinite(drawn.rise)&&cap>1){const want=caClamp(drawn.rise*p.radius,cap*.6,cap*1.8);p.dome=Math.max(0,want-p.thickness+below);}
  const stem=p.height+below;
  if(Number.isFinite(drawn.stem)&&stem>1){const want=caClamp(drawn.stem*p.radius,stem*.7,stem*1.5);p.height+=want-stem;}
  if(Number.isFinite(drawn.girth)&&drawn.girth>0){
    const {stem:at}=caMemberChart(p,{id:'girth',x:0,y:0,scale:1,rotation:0},{yaw:0,pitch:0},{chartOnly:true}).chart;
    const mean=[.15,.3,.45,.6,.75,.85].reduce((sum,t)=>sum+(at(0,t)[0]-at(Math.PI,t)[0])/2,0)/6;
    if(mean>.5)p.stemRadius*=caClamp(drawn.girth*p.radius/mean,.6,1.5);
  }
}
function caAnatomy(p,genome,variant,m,s){
  const g=p.grammar,ph=genome.phenotype??{},n=i=>caNoise(i,s),open=caClamp((m-.3)/.7),R=()=>p.radius;
  Object.assign(p,CA_ANATOMY_DEFAULTS);
  // Members are unequal: each one leans and tilts a little on its own axis.
  p.lean+=(n(41)-.5)*18;p.bend+=(n(43)-.5)*14;
  if(CA_CAPPED.has(g)){caCapProfile(p,ph,open);p.gillFree=['amanita','parasol','inkcap'].includes(g)?1:g==='agaric'||g==='bonnet'?.35:0;}
  if(g==='amanita'){
    p.thickness=R()*.09;p.stemRadius=Math.max(p.stemRadius,R()*.13);
    if(ph.surface==='warts'){Object.assign(p,{warts:1.35,wartReserve:1,bulbRings:1,bulb:.95,bulbAt:.1,bulbWidth:.095,stemClub:0,rimLift:-R()*(.17+.2*(1-open)),dome:R()*(.3+.14*(1-open)),domePow:.5});}
    if(ph.veil==='ring')Object.assign(p,{ring:1,ringT:.8,skirtDrop:R()*.17,skirtWidth:p.stemRadius*.75+6});
    if(ph.veil==='sac')Object.assign(p,{volva:1,bulb:.25,ring:0,striae:Math.max(p.striae,1)});
    if(ph.veil==='boot')Object.assign(p,{volva:.6,bulb:.35});
  }
  if(g==='bolete'){
    // Cushion cap over a thick tube layer that is depressed around the stipe.
    Object.assign(p,{rimLift:-R()*(.06+.12*(1-open)),dome:R()*(.46+.1*(1-open)),domePow:.6,thickness:R()*.12,tubes:R()*.12,overhang:.05,inroll:.2,gillFree:0,
      stemRadius:Math.max(p.stemRadius,R()*.25),stemClub:variant===3?1.1:.85,bulb:variant===0?.35:0,stemRoot:variant===1?.35:0,apexFlare:.05,crest:0});
    if(ph.surface==='reticulum'||variant===0)p.net=1;
    if(ph.veil==='ring')Object.assign(p,{ring:1,ringT:.78,skirtDrop:R()*.07,skirtWidth:p.stemRadius*.45+5});
  }
  if(g==='parasol'){
    Object.assign(p,{rimLift:-R()*(.07+.3*(1-open)),dome:R()*(.12+.3*(1-open)),domePow:.75,crest:R()*.1,crestWidth:.03,umbo:1,snake:1,bulb:.7,ring:1,ringT:.72,skirtDrop:9,skirtWidth:p.stemRadius*.9+7,scales:Math.max(p.scales,1)});
  }
  if(g==='inkcap'){
    // A tall closed bell whose margin deliquesces black with age.
    p.radius*=.72;Object.assign(p,{rimLift:-R()*(2.1-.7*open),dome:R()*.55,domePow:.45,cone:0,radialPow:.4,inroll:0,inkMargin:open,thickness:R()*.05});
  }
  if(g==='bonnet')Object.assign(p,{cone:.5,rimLift:-R()*.42,dome:R()*.5,striae:Math.max(p.striae,.8),inroll:0});
  if(g==='waxcap')Object.assign(p,{thickness:R()*.06,lamellulae:.5});
  if(g==='milkcap')Object.assign(p,{rimLift:R()*.08,dome:-R()*.05,domePow:1,crest:0,inroll:1,decurrent:.22});
  if(g==='hedgehog')Object.assign(p,{teeth:Math.max(p.teeth,1),inroll:.6});
  if(g==='morel'){
    // A hollow head of ridges and deep pits, attached to the stipe at its base.
    Object.assign(p,{pitRows:Math.round(5+2*n(51))+(variant===4?2:0),pitDepth:Math.min(13,p.radius*.13),radialRings:26,stemClub:.35,bulb:.2,apexFlare:0,hatch:.6,cone:variant===1?.5:.1,head:1});
  }
  if(g==='stinkhorn'){
    Object.assign(p,{pitRows:5,pitDepth:Math.min(7,p.radius*.12),radialRings:22,stemPores:1,crest:4,crestWidth:.01,hatch:.6,head:1,headMargin:.8,cone:.1});
    if(!p.pits)p.pitDepth=0;
  }
  if(g==='puffball'){
    // Pear-shaped head over a pleated sterile base, ornamented with spines.
    const pear=['spines','reticulum'].includes(ph.surface)||variant===1;
    // One closed head that narrows into the sterile base: no stalk plugged in.
    Object.assign(p,{head:1,headMargin:0,bowl:0,pear:pear?1:.3,dome:p.radius*(pear?.9:.8),rimLift:-p.radius*(pear?.42:.3),thickness:2,domePow:.5,crest:0,radialRings:18,
      stemRoot:pear?.5:.3,stemRadius:p.radius*(pear?.26:.4),apexFlare:0,height:p.radius*(pear?.72+.15*n(63):.36),pleats:pear?1:.5,spines:['spines','warts'].includes(ph.surface)?1:0,warts:0,hatch:.7,bulb:0});
  }
  if(g==='club')Object.assign(p,{head:1,cone:variant===4?.6:0});
  if(g==='earthstar')Object.assign(p,{crest:10,crestWidth:.012,hatch:.6});
  if(g==='coral')Object.assign(p,{stemRadius:p.stemRadius*.7,coralLevels:3,height:p.height*.32,radius:p.stemRadius*1.02+5,dome:14,domePow:.6,thickness:3,rimLift:-12,head:1,rimGap:2,apexFlare:0,radius:p.stemRadius*.84,hatch:.25,stemClub:0,branchLength:p.branchLength*1.05});
  if(g==='bracket'){
    // A perennial shelf on its wood: attached along its back edge, zoned above.
    const L=Math.max(30,p.radius*.42);
    Object.assign(p,{logRadius:L,logLength:2.4,logTurn:.16,height:L*1.18,stemRadius:Math.min(26,L*.35),attach:-Math.PI/2,leanY:-L*.72,lean:0,bend:0,tiltX:0,tiltY:.04,rimLift:-p.radius*.08,dome:p.radius*.12,domePow:.75,
      thickness:p.radius*.09,zoneRidges:['zoned','ribbed','velvet'].includes(ph.surface)?1:.5,zones:Math.max(p.zones,1),hatch:.6,radialRings:24});
  }
  if(g==='oyster'){
    // A lateral fan on a short eccentric stipe from the side of a log, its
    // decurrent gills turned towards the eye and its margin wavy and inrolled.
    const L=Math.max(26,p.radius*.3);
    Object.assign(p,{logRadius:L,logLength:1.1,logTurn:Math.PI/2,logShift:-L*.2,leanY:0,height:L*1.25,stemRadius:Math.max(12,L*.38),bend:0,lean:p.radius*.18,
      attach:Math.PI+(n(61)-.5)*.5,eccentricity:.78,tiltY:.48+(genome.values[6]-.5)*.12,tiltX:.16+(n(62)-.5)*.1,dome:p.radius*.14,rimLift:-p.radius*.05,
      inroll:1,ripple:9+genome.values[4]*6,lobes:3,lobeDepth:.07,decurrent:.6,hatch:.6,zones:0});
  }
  if(g==='cup'||g==='nest')p.hatch=.5;
}
// Species colour comes from the type recipe and genome, per anatomical part.
const CA_SATURATION=Object.freeze({scarlet:.85,ochre:.5,chestnut:.5,cream:.1,ash:.1,violet:.42,rose:.5,olive:.45});
export function caColourPlan(genome){
  const ph=genome.phenotype??{},g=ph.grammar,key=ph.palette??'chestnut',pal=TYPE_PALETTES[key]??TYPE_PALETTES.chestnut,v=genome.values,sat=(CA_SATURATION[key]??.4)*(.9+.2*v[21]);
  const white={ochre:.35,umber:.15,paynes:.5},buff={ochre:.55,umber:.3,sienna:.15},dark={umber:.55,paynes:.3,sienna:.15};
  const plan={cap:{palette:pal,load:sat},underside:{palette:white,load:.035},stem:{palette:buff,load:.05},veil:{palette:white,load:.02},
    wood:{palette:{umber:.5,paynes:.32,ochre:.18},load:.2},rays:{palette:buff,load:.16},egg:{palette:{paynes:.45,umber:.4,ochre:.15},load:.3},
    'pit-shadow':{palette:dark,load:.32},'zone-glaze':{palette:{...pal,umber:(pal.umber??0)+.3},load:sat*.45},'margin-accent':{palette:{paynes:.7,umber:.3},load:.5},'gill-shadow':{palette:{umber:.5,paynes:.35,sienna:.15},load:.12},'umbo-accent':{palette:{umber:.6,sienna:.3,paynes:.1},load:.35}};
  if(['agaric','bonnet','waxcap','milkcap'].includes(g))plan.underside={palette:g==='waxcap'?pal:{umber:.55,sienna:.3,ochre:.15},load:g==='waxcap'?sat*.45:.12};
  if(g==='bolete'||ph.hymenium==='pores'&&g!=='bracket')Object.assign(plan,{underside:{palette:{hansa:.42,ochre:.38,sapgreen:.2},load:.3},stem:{palette:{ochre:.55,sienna:.25,umber:.2},load:.11}});
  if(['chanterelle','trumpet','coral','club','cup','nest','jelly','saddle','tooth','hedgehog'].includes(g))plan.underside={palette:pal,load:sat*.55};
  if(g==='club')Object.assign(plan,{cap:{palette:TYPE_PALETTES.ochre,load:.36},underside:{palette:TYPE_PALETTES.ochre,load:.3}});
  if(['chanterelle','coral','club'].includes(g))plan.stem={palette:g==='club'?TYPE_PALETTES.ochre:pal,load:g==='club'?.2:sat*.6};
  if(g==='inkcap')Object.assign(plan,{cap:{palette:{ochre:.5,umber:.3,paynes:.2},load:.05},underside:{palette:{paynes:.6,umber:.4},load:.28}});
  if(g==='parasol')Object.assign(plan,{cap:{palette:buff,load:.1},stem:{palette:buff,load:.06}});
  if(g==='morel')Object.assign(plan,{cap:{palette:{ochre:.5,umber:.38,sienna:.12},load:.24},'pit-shadow':{palette:dark,load:.2},stem:{palette:white,load:.04}});
  if(g==='stinkhorn')Object.assign(plan,{cap:{palette:{sapgreen:.32,umber:.48,paynes:.2},load:.55},stem:{palette:white,load:.025},veil:{palette:{rose:.3,ochre:.35,paynes:.35},load:.06},'pit-shadow':{palette:{paynes:.6,umber:.4},load:.5}});
  if(g==='puffball')Object.assign(plan,{cap:{palette:buff,load:.07},underside:{palette:buff,load:.07},stem:{palette:buff,load:.06}});
  if(g==='earthstar')Object.assign(plan,{underside:{palette:{umber:.45,paynes:.3,ochre:.25},load:.22},cap:{palette:{umber:.45,paynes:.3,ochre:.25},load:.22},rays:{palette:{ochre:.45,umber:.3,sienna:.25},load:.2}});
  if(g==='bracket')Object.assign(plan,{cap:{palette:key==='chestnut'?{umber:.45,sienna:.4,ochre:.15}:pal,load:Math.max(.38,sat)},underside:{palette:white,load:.05}});
  if(g==='cup'||g==='nest')Object.assign(plan,{cap:{palette:{umber:.45,sienna:.35,ochre:.2},load:.3},underside:{palette:buff,load:.1}});
  if(g==='oyster')Object.assign(plan,{cap:{palette:{umber:.45,paynes:.3,ochre:.25},load:.22},underside:{palette:white,load:.04},stem:{palette:white,load:.04}});
  return plan;
}
export const CONNECTED_ANATOMY_MEASURES=Object.freeze([
 ['radius','Cap radius','units'],['capDepth','Cap depth',''],['rimLift','Funnel rise','units'],
 ['height','Stem length','units'],['stemWidth','Stem width','units'],['eccentricity','Stem offset',''],
 ['ridgeWidth','Ridge width','units'],['decurrent','Gill run-down',''],['bend','Stem bend','units'],
]);
export function createSpecimenComposition(genome,{count=null,id=null,habit:colony=false}={}){
  const hash=caHash(genome.seed),habit=genome.phenotype?.habit??'pair';
  count??=({solitary:1,pair:2,troop:3,cluster:4})[habit]??2;
  count=Math.max(1,Math.min(5,Math.round(count)));
  // Colony layouts on a shared substrate belong to the habitat view only.
  const gregarious=colony?habitLayout(genome,count,hash):null;
  if(gregarious)return {version:1,id:id??`composition-${hash.toString(36)}-${count}`,members:gregarious.members,habit:gregarious.habit,...(gregarious.substrate?{substrate:gregarious.substrate}:{})};
  // Fixed slots are independent of endpoint recipe. The adult remains on the
  // right, with related smaller members to its left; no member is born at t>0.
  const layouts={1:[[745,786,1.35,0,1]],2:[[375,800,.82,-.13,.62],[785,790,1.32,.035,1]],
    3:[[285,796,.72,-.12,.52],[570,805,.94,.03,.76],[900,790,1.15,.08,1]],
    4:[[260,745,.65,-.10,.5],[490,720,.82,-.04,.68],[745,790,1.1,.045,1],[960,810,.69,.12,.58]],
    5:[[230,710,.56,-.12,.45],[440,710,.7,-.06,.6],[660,750,1.05,.025,1],[880,785,.79,.08,.74],[1040,810,.53,.14,.5]]};
  // Imbricate oyster shelves (drawn as charts at their slots) stack in tiers
  // above the largest, nearest shelf, each smaller and stepping aside.
  if(count>1&&genome.phenotype?.growthHabit==='imbricate'&&genome.phenotype?.grammar==='oyster'&&!genome.donorId)
    layouts[count]=Array.from({length:count},(_,i)=>{const k=count-1-i,side=(k%2?-1:1)*(caNoise(k+71,hash)<.5?-1:1);return [700+side*(70+60*caNoise(k+72,hash))*Math.min(k,2),800-k*52,1.3*(1-.1*k),side*.05,k?.62+.08*(count-k):1];});
  return {version:1,id:id??`composition-${hash.toString(36)}-${count}`,members:layouts[count].map(([x,y,scale,rotation,maturity],i)=>({
    id:`specimen-${i}`,x:x+(caNoise(i+5,hash)-.5)*(count===1?14:46),y:y+(caNoise(i+16,hash)-.5)*(count===1?10:24),
    scale:maturity===1?scale:scale*(.86+.24*caNoise(i+38,hash)),rotation:rotation+(caNoise(i+27,hash)-.5)*.09,maturity:maturity===1?maturity:clamp(maturity+(caNoise(i+49,hash)-.5)*.3,.35,.95),
  }))};
}
export function validateSpecimenComposition(composition){
  if(composition?.version!==1||!composition.id||!Array.isArray(composition.members)||composition.members.length<1||composition.members.length>5)throw new RangeError('Invalid specimen composition');
  const ids=new Set();for(const member of composition.members){if(typeof member.id!=='string'||ids.has(member.id)||!['x','y','scale','rotation','maturity'].every(k=>Number.isFinite(member[k]))||member.scale<=0)throw new RangeError('Invalid composition member');ids.add(member.id);}
  return composition;
}
export function connectedAnatomyDimensions(genome,member,{body3d=false,habit=false}={}){
  const v=genome.values,grammar=genome.phenotype?.grammar??genome.family,variant=genome.phenotype?.variant??0;
  if(!CONNECTED_BODY_GRAMMARS.includes(grammar))throw new RangeError(`No connected cap chart for ${grammar}`);
  const m=member?.maturity??1,s=caHash(`${genome.seed}:${member?.id??'specimen-0'}`),related=(caNoise(3,s)-.5)*.12;
  const p={grammar,radius:(135+v[0]*65)*(0.88+.12*m+related),height:(185+v[7]*110)*(.76+.24*m),stemRadius:14+v[8]*16,
    eccentricity:0,rimLift:5+v[3]*12,dome:60+v[1]*70,thickness:5+v[17]*4,capDepth:.72,
    tiltX:(v[6]-.5)*.28,tiltY:.04+(v[6]-.5)*.24,bend:(v[10]-.5)*35,lean:(v[11]-.5)*35,
    ripple:2+v[4]*5,phase:v[35]*CA_TAU,fold:0,pores:0,teeth:0,ring:0,bulb:0,
    decurrent:.08,marginCurl:v[3]*8,crest:variant===1?14:0,ribCurve:(v[16]-.5)*.45,ribSpread:v[15],edgeAsym:(v[5]-.5)*.055,
    ...CA_BODY_DEFAULTS};
  if(grammar==='oyster')Object.assign(p,{radius:130+v[0]*46,height:62+v[7]*40,stemRadius:16+v[8]*8,eccentricity:.72+v[5]*.16,rimLift:11+v[1]*10,dome:18+v[1]*16,capDepth:.82,tiltY:.87+(v[6]-.5)*.4,tiltX:-.15,lean:18,bend:14,decurrent:.45,ripple:4+v[4]*4,thickness:8});
  if(grammar==='chanterelle')Object.assign(p,{radius:124+v[0]*56,height:188+v[7]*72,stemRadius:18+v[8]*14,rimLift:62+v[1]*38,dome:0,fold:1,decurrent:.57,tiltY:.10,capDepth:.80,ripple:7+v[4]*10,thickness:7});
  if(grammar==='milkcap')Object.assign(p,{rimLift:30+v[1]*30,dome:5,stemRadius:24+v[8]*14,decurrent:.31,thickness:12});
  if(grammar==='bolete')Object.assign(p,{pores:1,height:170+v[7]*65,stemRadius:30+v[8]*22,dome:72+v[1]*58,thickness:17+v[17]*9,bulb:.35,decurrent:0});
  if(grammar==='hedgehog')Object.assign(p,{teeth:1,dome:35+v[1]*35,thickness:11,decurrent:.12,ripple:6});
  if(grammar==='parasol')Object.assign(p,{radius:160+v[0]*50,height:280+v[7]*75,stemRadius:10+v[8]*7,dome:28+v[1]*33,ring:1,crest:24,thickness:4});
  if(grammar==='amanita')Object.assign(p,{ring:1,bulb:.8,thickness:8,decurrent:0});
  if(grammar==='bonnet')Object.assign(p,{radius:80+v[0]*45,height:230+v[7]*90,stemRadius:5+v[8]*5,dome:105+v[1]*50,thickness:3});
  if(grammar==='inkcap')Object.assign(p,{radius:65+v[0]*45,height:210+v[7]*85,stemRadius:9+v[8]*7,dome:135+v[1]*70,thickness:3,ripple:4});
  if(grammar==='waxcap')Object.assign(p,{radius:92+v[0]*55,stemRadius:11+v[8]*9,dome:45+v[1]*60,fold:.3,thickness:6});
  if(grammar==='bracket')Object.assign(p,{radius:150+v[0]*42,height:40+v[7]*25,stemRadius:24,eccentricity:.87,rimLift:6,dome:12,thickness:7,capDepth:.70,tiltY:.3,pores:1,ripple:4});
  if(body3d||!CONNECTED_CAP_GRAMMARS.includes(grammar))caBodyPlan(p,genome,v,variant,m);
  // The turned 3D body carries the full per-family anatomy; the legacy
  // connected chart (oyster/chanterelle morphs) keeps its own proportions.
  if(body3d){p.body3d=1;caAnatomy(p,genome,variant,m,s);caDrawnProportions(p,member?.drawn);}
  if(genome.phenotype?.form==='sulphur-shelf')Object.assign(p,{radius:(165+v[0]*50)*(.85+.15*m),height:26+v[7]*16,stemRadius:30,eccentricity:.82,rimLift:14+v[3]*10,dome:20+v[1]*16,thickness:16+v[17]*8,capDepth:.66,tiltY:.22,ripple:9+v[4]*7,lobes:3+variant%2,lobeDepth:.1,marginCurl:6});
  // A shelf attached to bark has no free stipe: brackets sit flush on the
  // wood, oysters keep a short lateral stem. A shelf on the far flank is the
  // mirror image of one on the near flank, so both show the same face.
  // On a shared substrate the member's own log (anatomy) is replaced by the
  // colony's wood.
  if(habit&&member?.attached){p.attached=1;p.logRadius=0;
    // Brackets on bark are thick hoof-to-shelf forms with a rounded, zoned
    // upper surface, a pore surface beneath and a broad attachment; oysters
    // are overlapping fans with short lateral stems and gills beneath.
    // Thickness follows the taxon: thick sulphur shelves and Ganoderma
    // hooves, thin leathery turkey-tail fans. Shelves tilt their upper
    // surface toward the viewer, so its zones read and the margin shows.
    const hoof=genome.phenotype?.form==='sulphur-shelf'?26:variant===1?32:6;
    if(grammar==='bracket')Object.assign(p,{height:8+v[7]*4,thickness:hoof>6?Math.max(p.thickness,hoof+v[17]*6):8+v[17]*3,dome:hoof>6?Math.max(p.dome,hoof*.9+v[1]*12):6+v[1]*6,rimLift:-4,tiltY:-.28,eccentricity:Math.min(p.eccentricity,.8),zones:Math.max(p.zones,1),pores:1,gills:0,ripple:hoof>6?Math.max(p.ripple,5):9+v[4]*5,marginCurl:4});
    // Oysters keep the anatomy plan's own cap, gill side and lateral stem
    // (paired judging preferred it); the colony only places them on wood.
    // Hericium: a rounded mass with a short attachment, hung with long
    // icicle spines that cascade below it.
    if(grammar==='tooth')Object.assign(p,{height:10,dome:12+v[1]*8,rimLift:-70-v[3]*20,toothLength:118+v[3]*44,capDepth:.92,ripple:3,teeth:0});
    if(member.mirror)p.tiltY=-p.tiltY;}

  // Variation is coherent within a member, shared across all of its surfaces.
  p.radius*=.94+caNoise(6,s)*.12;p.height*=.95+caNoise(9,s)*.10;p.tiltX+=(caNoise(12,s)-.5)*.08;
  p.ridgeWidth=.4+5*p.fold;
  return p;
}
export function interpolateConnectedAnatomy(a,b,t){
  if(!Number.isFinite(t))throw new RangeError('Blend must be finite');t=caClamp(t);if(t===0)return {...a};if(t===1)return {...b};const result={grammar:'fictional-connected-intermediate'};
  for(const key of Object.keys(a))if(typeof a[key]==='number')result[key]=caMix(a[key],b[key],t);
  return result;
}
// Attachment to wood (flush shelves, bark clipping, tilted tiers) belongs to
// the resting colony; morph and comparison pairs keep free-standing members.
const habitFree=member=>{if(!member?.attached&&!member?.barkClip&&!member?.pitch&&!member?.yaw)return member;const {attached,mirror,barkClip,pitch,yaw,...free}=member;return free;};
export function createConnectedAnatomyPair(a,b,composition=createSpecimenComposition(a),{view={yaw:.12,pitch:.36},shapeModifiers={capDepth:1,stemBend:0},body3d=!!view?.body3d,habit=false}={}){
  validateSpecimenComposition(composition);
  const member=m=>habit?m:habitFree(m);
  return {a,b,composition,habit,anatomyA:composition.members.map(m=>connectedAnatomyDimensions(a,member(m),{body3d,habit})),anatomyB:composition.members.map(m=>connectedAnatomyDimensions(b,member(m),{body3d,habit})),connectedAnatomy:true,view:{...view},shapeModifiers:{...shapeModifiers}};
}
const caChartTopologies=new Map();
// A body's world geometry (mesh and ink in member coordinates) does not
// depend on the camera, so a drag re-projects it instead of rebuilding it.
// Keyed by the member's full parameters; drag frames only (ink, interactive).
const caWorldCache=new Map(),CA_WORLD_CACHE_LIMIT=24;
export function clearOrbitWorldCache(){caWorldCache.clear();}
function caProjectCachedWorld(w,p,slot,project){
  const vertices=w.worldVertices.map(project);
  const faces=w.faces.map(({indices,role})=>{const ps=indices.map(i=>vertices[i]);return {indices,role,individual:slot.id,projected:ps,visible:ps.reduce((sum,q,i)=>{const r=ps[(i+1)%ps.length];return sum+q[0]*r[1]-r[0]*q[1];},0)>0};});
  const silhouette=[];
  for(const edge of w.edges.values())if(edge.faces.filter(i=>faces[i].visible).length===1&&edge.faces.some(i=>!faces[i].visible))silhouette.push([edge.a,edge.b]);
  const chains=caJoinEdges(silhouette,vertices.map((q,i)=>[...q,...w.worldVertices[i]])),paths=[];
  chains.forEach((points,i)=>{const smooth=caSmoothProjectedCurve(points,2);paths.push({id:`${slot.id}:silhouette:${i}`,points:smooth.map(q=>q.slice(0,3)),world:smooth.map(q=>q.slice(3)),role:'cap-contour',width:p.body3d?(p.coralLevels?1.1:1.6):1.3,opacity:p.body3d?.9:.82,hand:`${slot.id}:silhouette`});});
  for(const d of w.paths)paths.push({id:d.id,points:d.world.map(project),...d});
  return {vertices,worldVertices:w.worldVertices,faces,paths,slot,reserves:w.reserves,details:w.details,chart:{lower:w.lower,upper:w.upper,stem:w.stem,project}};
}
const CA_FOCAL=2600;
const caSub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const caCross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
const caUnit=u=>{const n=Math.hypot(...u)||1;return u.map(x=>x/n);};
function caOrient(indices,inside,world){
  const w=indices.map(i=>world[i]);let normal=caCross(caSub(w[1],w[0]),caSub(w[2],w[0]));
  if(Math.hypot(...normal)<1e-9&&w.length>3)normal=caCross(caSub(w[2],w[0]),caSub(w[3],w[0]));
  const center=w.reduce((sum,q)=>sum.map((v,k)=>v+q[k]/w.length),[0,0,0]),out=caSub(center,inside);
  return normal[0]*out[0]+normal[1]*out[1]+normal[2]*out[2]<0?[...indices].reverse():indices;
}
// A closed tube around a 3D centreline (branches, eggs), capped at both ends.
function caTubePart(center,radiusAt,M,S,role){
  return {signature:`tube${M}x${S}`,build(vertex){
    const rings=[],centers=[],faces=[];
    for(let j=0;j<=M;j++){
      const t=j/M,c=center(t),tangent=caUnit(caSub(center(Math.min(1,t+.02)),center(Math.max(0,t-.02))));
      const helper=Math.abs(tangent[2])>.9?[1,0,0]:[0,0,1],n1=caUnit(caCross(tangent,helper)),n2=caCross(tangent,n1),r=Math.max(.6,radiusAt(t));
      centers.push(c);rings.push(Array.from({length:S},(_,i)=>{const a=i/S*CA_TAU;return vertex(c.map((v,k)=>v+r*(Math.cos(a)*n1[k]+Math.sin(a)*n2[k])));}));
    }
    const start=vertex(center(0)),end=vertex(center(1));
    for(let i=0;i<S;i++){const k=(i+1)%S;
      faces.push({indices:[start,rings[0][k],rings[0][i]],role,inside:center(.08)});
      faces.push({indices:[end,rings[M][i],rings[M][k]],role,inside:center(.92)});
      for(let j=0;j<M;j++)faces.push({indices:[rings[j][i],rings[j][k],rings[j+1][k],rings[j+1][i]],role,inside:centers[j].map((v,c)=>(v+centers[j+1][c])/2)});
    }
    return faces;
  }};
}
// A closed thin sheet of revolution: annulus, skirt, volva cup or star rays.
function caSheetPart(top,bottom,A,S,role,ink=[]){
  return {signature:`sheet${A}x${S}`,ink,build(vertex){
    const T=Array.from({length:A+1},(_,j)=>Array.from({length:S},(_,i)=>vertex(top(i/S*CA_TAU,j/A))));
    const B=Array.from({length:A+1},(_,j)=>Array.from({length:S},(_,i)=>vertex(bottom(i/S*CA_TAU,j/A)))),faces=[];
    const mid=(theta,s)=>top(theta,s).map((v,k)=>(v+bottom(theta,s)[k])/2);
    for(let i=0;i<S;i++){const k=(i+1)%S,theta=(i+.5)/S*CA_TAU;
      for(let j=0;j<A;j++){const s=(j+.5)/A;
        faces.push({indices:[T[j][i],T[j][k],T[j+1][k],T[j+1][i]],role,inside:bottom(theta,s)});
        faces.push({indices:[B[j][i],B[j][k],B[j+1][k],B[j+1][i]],role,inside:top(theta,s)});
      }
      faces.push({indices:[T[0][i],T[0][k],B[0][k],B[0][i]],role,inside:mid(theta,.5/A)});
      faces.push({indices:[T[A][i],T[A][k],B[A][k],B[A][i]],role,inside:mid(theta,1-.5/A)});
    }
    return faces;
  }};
}
const caAdd=(a,b,k=1)=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k];
// Rotate unit vector d away from itself by angle a, towards azimuth phi.
function caTurn(d,a,phi){
  const helper=Math.abs(d[2])>.9?[1,0,0]:[0,0,1],n1=caUnit(caCross(d,helper)),n2=caCross(d,n1),side=n1.map((v,k)=>v*Math.cos(phi)+n2[k]*Math.sin(phi));
  return caUnit(d.map((v,k)=>v*Math.cos(a)+side[k]*Math.sin(a)));
}
function caBodyParts(p,{upper,radius,bend,interactive}){
  const parts=[],S=interactive?24:48,tAt=z=>caClamp(z/p.height),axisAt=t=>[bend(t),p.leanY*(1-t)];
  const axis=(r,theta,t,z)=>{const c=axisAt(t);return [Math.cos(theta)*r+c[0],Math.sin(theta)*r*p.capDepth+c[1],z];};
  // Pull a sheet point towards the stipe axis, giving a membrane its thickness.
  const inward=(q,d)=>{const c=axisAt(tAt(q[2])),dx=q[0]-c[0],dy=(q[1]-c[1])/p.capDepth,r=Math.hypot(dx,dy)||1,k=Math.max(0,r-d)/r;return [c[0]+dx*k,c[1]+dy*k*p.capDepth,q[2]];};
  if(p.ring>0&&p.height>60){
    // Partial veil: a skirt whose inner edge is buried in the stipe surface. It
    // lifts into a short lip, then hangs from the stipe with a wavy, torn hem.
    const t0=p.ringT,z0=p.height*t0,rs=radius(t0),w=p.skirtWidth||p.stemRadius*.85+7,drop=p.skirtDrop||w*1.15;
    const prof=s=>{const lip=Math.min(1,s/.3),hang=Math.max(0,(s-.25)/.75);return [rs*.88+w*(.62*Math.sin(lip*Math.PI/2)+.38*hang),z0+w*.2*Math.sin(Math.PI*lip)-drop*hang**1.15];};
    const top=(theta,s)=>{const [r,z]=prof(s),hem=s**3*(1.8*Math.sin(7*theta+p.phase)+1.1*Math.sin(13*theta-p.phase));return axis(r+hem*.4,theta,tAt(z),z+hem);};
    const bottom=(theta,s)=>{const q=inward(top(theta,s),2.4);q[2]-=1.2*(1-s);return q;};
    const count=interactive?10:24,striae=Array.from({length:count},(_,i)=>{const theta=(i+.35*Math.sin(i*2.7))/count*CA_TAU+p.phase;return {id:`ring-stria-${i}`,world:Array.from({length:8},(_,j)=>top(theta,caMix(.32,.96,j/7))),role:'cap-fibres',width:.26};});
    parts.push(caSheetPart(top,bottom,interactive?3:5,S,'veil',[{id:'ring-edge',world:Array.from({length:S+1},(_,i)=>top(i/S*CA_TAU,1)),role:'ring',width:.62},{id:'ring-lip',world:Array.from({length:S+1},(_,i)=>top(i/S*CA_TAU,.26)),role:'ring',width:.4},...striae]));
  }
  if(p.volva>0){
    // Universal veil: a membranous sac around the stipe base, free at the top
    // and torn into lobes (or a tight boot); the stinkhorn's is the hatched egg.
    const egg=p.grammar==='stinkhorn',boot=p.volva<.8&&!egg,rb=radius(.06);
    const hz=egg?p.height*.24:boot?p.height*.11+6:p.height*.15+10,rimR=egg?rb*1.45+4:boot?radius(.12)*1.1+3:radius(.14)*1.35+7;
    const tear=theta=>1-(egg?.2:.3)*Math.abs(Math.sin((egg?1.5:2)*theta+p.phase))**3;
    const top=(theta,s)=>{const r=egg?caMix(rb*.7,rimR,Math.sin(s*Math.PI*.6)**.5):caMix(rb*.8,rimR,Math.sin(s*Math.PI/2)**(boot?.45:.75));return axis(r,theta,.04,-1.5+hz*s*tear(theta));};
    const bottom=(theta,s)=>inward(top(theta,s),2.6);
    const wrinkles=Array.from({length:interactive?6:12},(_,i)=>{const theta=(i+.4*Math.sin(i*1.9))/(interactive?6:12)*CA_TAU+p.phase*.3;return {id:`volva-wrinkle-${i}`,world:Array.from({length:7},(_,j)=>top(theta+.05*Math.sin(j+i),caMix(.15,.9,j/6))),role:'cap-fibres',width:.3};});
    parts.push(caSheetPart(top,bottom,interactive?2:5,S,'veil',[{id:'volva-rim',world:Array.from({length:S+1},(_,i)=>top(i/S*CA_TAU,1)),role:'ring',width:.6},...wrinkles]));
  }
  if(p.rays>0){
    const n=Math.round(p.rays),r0=p.stemRadius*.92,z0=p.height*.55,star=theta=>1-p.lobeDepth*(1-Math.abs(Math.cos(n*(theta-p.phase)/2))**1.4);
    const top=(theta,s)=>{const r=caMix(r0,p.rayRadius*star(theta),s);return axis(r,theta,0,z0+8*Math.sin(Math.PI*s)-p.rayCurl*s**3);};
    const bottom=(theta,s)=>{const q=top(theta,s);q[2]-=4*(1-.7*s)+1;return q;};
    const ink=Array.from({length:n},(_,i)=>{const theta=p.phase+i/n*CA_TAU;return {id:`ray-midrib-${i}`,world:Array.from({length:12},(_,j)=>{const q=top(theta,.05+j/11*.9);q[2]+=.8;return q;}),role:'cap-fibres',width:.4};});
    // The fleshy inner layer of each ray cracks away from the papery outer one.
    for(let i=0;i<n;i++){const theta=p.phase+(i+.5)/n*CA_TAU;ink.push({id:`ray-layer-${i}`,world:Array.from({length:14},(_,j)=>{const a=theta+(j/13-.5)*CA_TAU/n*.86,q=top(a,.42+.12*Math.sin(j/13*Math.PI));q[2]+=.9;return q;}),role:'cap-fibres',width:.32});}
    parts.push(caSheetPart(top,bottom,interactive?4:6,interactive?48:96,'rays',ink));
  }
  if(p.branches>0){
    // Coral: repeated unequal dichotomies, each branch curving upwards and
    // narrowing, ending in short blunt or forked tips of differing length.
    const n=Math.round(p.branches)+(p.coralLevels?2:0),L=p.branchLength,levels=interactive?2:Math.max(2,Math.round(p.coralLevels||2)),seed=Math.floor(p.phase*1e5),rnd=i=>caNoise(i,seed);let id=0;
    // coralSpread opens the fan (a wider, lower candelabra) when the drawing is wider.
    const spread=p.coralSpread??1;
    const grow=(start,dir,len,r,level)=>{
      const k=id++,rise=caUnit([dir[0],dir[1],dir[2]+(.3+.25*rnd(k*7+1))/spread]),end=caAdd(start,rise,len),ctrl=caAdd(start,dir,len*.55),wob=(rnd(k*7+2)-.5)*len*.08;
      const center=t=>start.map((v,c)=>(1-t)**2*v+2*(1-t)*t*ctrl[c]+t*t*end[c]+(c<2?wob*Math.sin(Math.PI*t)*(c?1:-1):0)),tip=level>=levels;
      // Radius narrows along the branch and closes in a rounded, blunt end.
      const radiusAt=t=>r*(1-(tip?.5:.32)*t)*Math.sqrt(Math.max(.04,1-t**(tip?5:12)));
      parts.push(caTubePart(center,radiusAt,interactive?3:5,interactive?6:(level>1?7:10),'stem'));
      if(tip)return;
      // Daughter branches leave from inside the parent's end, so joins are smooth.
      const fork=center(.84),d=caUnit(caSub(center(.9),center(.78))),forks=rnd(k*7+3)<.2?3:2,phi=rnd(k*7+4)*CA_TAU;
      for(let f=0;f<forks;f++){const a=(.3+.32*rnd(k*7+5+f))*Math.min(1.6,spread),child=caTurn(d,a,phi+f*CA_TAU/forks);grow(fork,child,len*(.55+.4*rnd(k*7+9+f)),radiusAt(.84)*(.72+.1*rnd(k*7+11+f)),level+1);}
    };
    for(let b=0;b<n;b++){
      const theta=p.phase+b/n*CA_TAU+.35*Math.sin(b*2.1),t0=.6+.35*rnd(b+200),out=[Math.cos(theta),Math.sin(theta)*p.capDepth];
      const start=[bend(t0)+out[0]*p.stemRadius*.3,out[1]*p.stemRadius*.3,p.height*t0],tilt=Math.min(1.35,(.25+.45*rnd(b+220))*spread);
      grow(start,caUnit([out[0]*Math.sin(tilt),out[1]*Math.sin(tilt),Math.cos(tilt)]),L*(.42+.16*rnd(b+240)),p.stemRadius*(.4+.1*rnd(b+260)),0);
    }
  }
  if(p.logRadius>0){
    // The wood: a log the shelf or oyster grows from. The stipe stub runs from
    // inside the log to the cap. The log is set back by its own slant, so no
    // part of it passes through the shelf in front.
    const logR=p.logRadius,L=p.radius*(p.logLength||2.4),turn=(p.logTurn??.16)+.08*Math.sin(p.phase),dir=[Math.cos(turn),Math.sin(turn)],z0=logR*.9,x0=bend(0)+(p.logShift??0);
    const y0=p.leanY-(p.logTurn>1?0:L*.5*Math.abs(dir[1]));
    // The log lies at an angle to the view so one sawn end shows; it tapers
    // and wavers along its length like a real fallen branch.
    const axisAt3=t=>[x0+(t-.5)*L*dir[0],y0+(t-.5)*L*dir[1]+3*Math.sin(t*4+p.phase),z0-logR*.12*(t-.5)+4*Math.sin(t*3+p.phase)],rAt=t=>logR*(1.08-.22*t)*(1-.05*Math.sin(t*9+p.phase));
    const log=caTubePart(axisAt3,rAt,interactive?5:9,interactive?12:20,'wood');
    const ring=(t,a,r)=>{const c=axisAt3(t),n=[-dir[1],dir[0]];return [c[0]+n[0]*Math.cos(a)*r,c[1]+n[1]*Math.cos(a)*r,c[2]+Math.sin(a)*r];};
    const furrows=Array.from({length:interactive?7:16},(_,i)=>{const a=i/(interactive?7:16)*CA_TAU+.3*Math.sin(i*1.7);return {id:`bark-${i}`,world:Array.from({length:14},(_,j)=>{const t=caMix(.03,.97,j/13);return ring(t,a+.08*Math.sin(j*1.3+i),rAt(t)+.8);}),role:'cap-fibres',width:.42};});
    const rings=[0,1].flatMap(end=>[.3,.55,.8].map((f,i)=>({id:`log-ring-${end}-${i}`,world:Array.from({length:25},(_,j)=>{const a=j/24*CA_TAU,t=end?1.004:-.004;return ring(t,a,rAt(caClamp(t))*f*(1+.04*Math.sin(3*a+i)));}),role:'cap-fibres',width:.3})));
    parts.push({...log,ink:[...furrows,...rings]});
  }
  if(p.eggs>0){
    const n=Math.round(p.eggs),M=interactive?4:6,T=interactive?8:10,er=Math.max(6,p.radius*.17);
    for(let e=0;e<n;e++){
      const theta=p.phase+e/n*CA_TAU,base=upper(theta,n===1?0:.42),dir=[Math.cos(theta+1.2),Math.sin(theta+1.2)*p.capDepth];
      const c=[base[0],base[1],base[2]+er*.75];
      parts.push(caTubePart(t=>[c[0]+dir[0]*er*1.25*(t-.5)*2,c[1]+dir[1]*er*1.25*(t-.5)*2,c[2]+er*.2*(t-.5)],t=>er*Math.sqrt(Math.max(.02,Math.sin(Math.PI*t))),M,T,'egg'));
    }
  }
  return parts;
}
// Honeycomb of ridges and pits on a head (morel, stinkhorn). Pit columns are
// staggered and jittered; each ridge position is shared by both its pits.
function caPitGrid(p){
  const K=2*Math.round(5+2.5*Math.min(1.4,p.pits||1)),rows=Math.max(3,Math.round(p.pitRows||6)),s0=.07,s1=.97,ph=p.phase,mod=i=>((i%K)+K)%K;
  const colEdge=(i,v)=>i+.2*Math.sin(1.7*v+2.3*mod(i)+ph);
  const rowEdge=(c,j)=>j+mod(c)%2*.5+.2*Math.sin(2.9*j+1.3*mod(c)+ph*1.7);
  const locate=(theta,s)=>{
    const u=((theta/CA_TAU)%1+1)%1*K,v=(s-s0)/(s1-s0)*rows;
    let c=Math.floor(u);if(u<colEdge(c,v))c--;else if(u>colEdge(c+1,v))c++;
    const left=colEdge(c,v),right=colEdge(c+1,v);
    let j=Math.floor(v-mod(c)%2*.5);if(v<rowEdge(c,j))j--;else if(v>rowEdge(c,j+1))j++;
    const a=rowEdge(c,j),b=rowEdge(c,j+1);
    return {c,j,u,v,edge:Math.min((u-left)/Math.max(.2,right-left),(right-u)/Math.max(.2,right-left),(v-a)/Math.max(.2,b-a),(b-v)/Math.max(.2,b-a))};
  };
  // Pit floor depth: zero on the ridges, deepest inside; none above or below the head.
  const depth=(theta,s)=>{const q=locate(theta,s),fade=caSmooth(caClamp(q.v/.6))*caSmooth(caClamp((rows-q.v)/.4));return fade*caSmooth(caClamp((q.edge-.05)/.24));};
  return {K,rows,colEdge,rowEdge,locate,depth,theta:u=>u/K*CA_TAU,s:v=>caMix(s0,s1,v/rows)};
}
// Relief and hymenium marks live on the 3D surfaces, so they turn, foreshorten
// and are occluded exactly like the body that carries them.
// Marks for members attached to wood (colony habit only).
// Hericium: spines of uneven length hang from the whole mass, the longest
// from beneath, short ones draping over the top, each slightly curved and
// tapering, so the body reads as one cascading mass rather than a cap over
// a ruled fringe. Brackets: a pore band under the margin.
function caAttachedMarks(p,{lower,upper,interactive,path,paths}){
  const seed=Math.floor(p.phase*1e6+7)>>>0,rnd=i=>caNoise(i,seed);
  if(p.grammar==='tooth'){
    const n=interactive?70:150;
    for(let i=0;i<n;i++){
      const top=i%2===0,theta=rnd(i)*CA_TAU,s=top?.1+.88*rnd(i+300):.1+.88*Math.sqrt(rnd(i+300)),base=top?upper(theta,s):lower(theta,s);
      const len=p.toothLength*(top?.3+.45*rnd(i+600):.45+.55*rnd(i+600)),sway=(rnd(i+900)-.5)*len*.18,out=[Math.cos(theta),Math.sin(theta)];
      const pts=[0,.35,.7,1].map(t=>[base[0]+out[0]*sway*t*t+out[0]*(top?len*.12*t:0),base[1]+out[1]*sway*t*t,base[2]-len*t-(top?0:2)]);
      path(`spine-${i}`,pts,'teeth',.42+.25*rnd(i+1200));paths.at(-1).taper=.75;
    }
  }
  if(p.grammar==='bracket'&&p.pores){
    for(let i=0,n=interactive?20:44;i<n;i++){const theta=Math.PI*(.25+1.5*i/n)+.03*rnd(i),s=.88+.08*rnd(i+50),c=lower(theta,s);
      path(`pore-band-${i}`,[0,1,2,3,4,5,6].map(j=>{const a=j/6*CA_TAU;return [c[0]+Math.cos(a)*2.2,c[1]+Math.sin(a)*2.2,c[2]-.8];}),'cap-fibres',.28);}
  }
}
function caSurfaceMarks(p,{lower,upper,stem,rim,collarRadius,interactive,path,reserve,detail,pit}){
  const seed=Math.floor(p.phase*1e6)>>>0,rnd=i=>caNoise(i,seed),dens=interactive?.5:1,golden=2.39996323,scale=Math.max(.5,Math.min(1.6,p.radius/140));
  const span=theta=>Math.max(10,rim(theta)-collarRadius),around=(theta,s)=>Math.max(8,caMix(collarRadius,rim(theta),s));
  const loop=(surf,theta,s,size,count=7)=>Array.from({length:count+1},(_,j)=>{const a=j/count*CA_TAU;return surf(theta+Math.cos(a)*size/around(theta,s),caClamp(s+Math.sin(a)*size/span(theta),0,1));});
  const lifted=(surf,d)=>(theta,s)=>{const q=surf(theta,s);q[2]+=d;return q;};
  const top=lifted(upper,.6),under=lifted(lower,-.6),shade=Math.atan2(.24,.48);
  // Universal-veil warts: irregular raised fragments, larger and crowded on the disc.
  if(p.warts>0)for(let i=0,n=Math.round(52*p.warts*dens);i<n;i++){
    const s=.04+.9*Math.sqrt(rnd(i)),theta=i*golden+p.phase,size=(1.2+7.5*rnd(i+400)**2)*(1.25-.55*s)*Math.min(1.4,p.warts+.3)*scale,k=12,raise=lifted(upper,.6+size*.3);
    const stretch=.7+.6*rnd(i+410),turn=rnd(i+420)*Math.PI;
    const pts=Array.from({length:k},(_,j)=>{const a=j/k*CA_TAU,w=1+.18*Math.sin(3*a+i)+.1*Math.sin(5*a+i*2)+.08*(rnd(i*7+j+900)-.5),x=Math.cos(a)*w*stretch,y=Math.sin(a)*w,rr=size;return raise(theta+(x*Math.cos(turn)-y*Math.sin(turn))*rr/around(theta,s),caClamp(s+(x*Math.sin(turn)+y*Math.cos(turn))*rr/span(theta),0,1));});
    pts.push([...pts[0]]);
    // A soft pyramid: only the side away from the light is outlined, with a
    // short shadow stroke under it; small flecks get no outline at all.
    if(size>2.6*scale)path(`wart-${i}`,pts.slice(3,10),'cap-fibres',.36+.1*rnd(i+430));
    if(p.wartReserve)reserve('cap',pts);
  }
  if(p.scales>0)for(let i=0,n=Math.round(70*p.scales*dens);i<n;i++){const s=.15+.82*Math.sqrt(rnd(i+50)),theta=i*golden*1.03+p.phase,d=6*scale/around(theta,s),ds=8*scale/span(theta);path(`scale-${i}`,[top(theta-d,s),top(theta,Math.min(1,s+ds)),top(theta+d,s)],'cap-fibres',.42);}
  if(p.striae>0)for(let i=0,n=Math.round(36*Math.min(1.5,p.striae)*(interactive?.6:1));i<n;i++){const theta=(i+.3*rnd(i+90))/n*CA_TAU+p.phase,s0=.55+.2*rnd(i+120);path(`stria-${i}`,Array.from({length:10},(_,j)=>top(theta,caMix(s0,.995,j/9))),'cap-fibres',.3);}
  if(p.zones>0){
    // Concentric growth zones: ridge crests in ink, alternate bands glazed darker.
    const Z=p.grammar==='bracket'?7:3,zs=k=>caMix(.16,.97,(k+.5)/Z);
    for(let z=0;z<Z;z++)path(`zone-${z}`,Array.from({length:65},(_,j)=>top(j/64*CA_TAU,zs(z)+.015*Math.sin(j/64*CA_TAU*5+z))),'cap-fibres',.36);
    if(p.grammar==='bracket')for(let z=0;z<Z-1;z+=2)for(let seg=0,segs=16;seg<segs;seg++){const a=seg/segs*CA_TAU,b=(seg+1)/segs*CA_TAU,sa=zs(z)+.02,sb=zs(z+1)-.02;
      detail('zone-glaze',[...Array.from({length:5},(_,j)=>upper(caMix(a,b,j/4),sa)),...Array.from({length:5},(_,j)=>upper(caMix(b,a,j/4),sb))]);}
  }
  if(p.veins>0)for(let i=0,n=Math.round(16*p.veins);i<n;i++){const theta=i/n*CA_TAU+p.phase;path(`vein-${i}`,Array.from({length:12},(_,j)=>{const s=caMix(.3,.97,j/11);return top(theta+.06*Math.sin(s*7+i),s);}),'cap-fibres',.36);}
  if(p.fringe>0)for(let i=0,n=Math.round(64*p.fringe*dens);i<n;i++){const theta=i/n*CA_TAU+.02*rnd(i+300),a=upper(theta,.985),b=lower(theta,1),out=caUnit([b[0]-stem(theta,1)[0],b[1]-stem(theta,1)[1],0]),len=4+5*rnd(i+330);path(`fringe-${i}`,[a,[b[0]+out[0]*len,b[1]+out[1]*len,b[2]-len*.6]],'cap-fibres',.36);}
  if(p.cracks>0)for(let i=0,n=Math.round(40*p.cracks*dens);i<n;i++){const s=.2+.75*Math.sqrt(rnd(i+500)),theta=i*golden*.97+p.phase,d=7/around(theta,s),ds=6/span(theta);path(`crack-${i}`,[top(theta-d,s),top(theta-d*.2,s+ds*(rnd(i+530)-.5)*2),top(theta+d,s+ds*.4)],'cap-fibres',.36);}
  if(pit){
    // Morel honeycomb: continuous ridges, staggered cross-ribs and shaded pits.
    const {K,rows,colEdge,rowEdge}=pit,at=(u,v,d=.8)=>lifted(upper,d)(pit.theta(u),pit.s(caClamp(v,0,rows)));
    for(let c=0;c<K;c++){
      // Each ridge is a lit crest between two edges, so it reads as raised.
      for(const [e,du] of [['a',-.07],['b',.07]])path(`pit-rib-${c}-${e}`,Array.from({length:4*rows+1},(_,j)=>at(colEdge(c,j/4)+du,j/4)),e==='a'?'cap-contour':'cap-fibres',e==='a'?.5:.32);
      for(let j=-1;j<=rows;j++){
        const v0=Math.max(0,rowEdge(c,j)),v1=Math.min(rows,rowEdge(c,j+1));
        if(rowEdge(c,j)>0&&rowEdge(c,j)<rows)path(`pit-rung-${c}-${j}`,Array.from({length:5},(_,k)=>{const v=rowEdge(c,j);return at(caMix(colEdge(c,v),colEdge(c+1,v),k/4),v+.06*Math.sin(k*2.1+c));}),'cap-contour',.46);
        if(v1-v0<.35)continue;
        const side=(v,f)=>caMix(colEdge(c,v),colEdge(c+1,v),f),vm=(v0+v1)/2,uc=side(vm,.5),ru=(colEdge(c+1,vm)-colEdge(c,vm))*.34,rv=(v1-v0)*.36,cell=[];
        // An irregular oval pit floor inside its walls of ridge.
        for(let k=0;k<14;k++){const a=k/14*CA_TAU,w=1+.12*Math.sin(3*a+c*1.7+j)+.06*Math.sin(5*a+j);cell.push([uc+Math.cos(a)*ru*w,vm+Math.sin(a)*rv*w]);}
        detail('pit-shadow',cell.map(([u,v])=>at(u,v,.3)));
        // The upper rim of each pit is in shadow under its ridge: a firm arc,
        // then close hatching that fills the pit floor with crisp dark ink.
        path(`pit-rim-${c}-${j}`,[...cell.slice(7,14),cell[0]].map(([u,v])=>at(u,v,.5)),'cap-contour',.42);
        for(let h=0,hn=interactive?2:5;h<hn;h++){const f=caMix(-.8,.55,h/(hn-1)),half=Math.sqrt(Math.max(0,1-f*f))*.85,v=vm+rv*f;path(`pit-shade-${c}-${j}-${h}`,Array.from({length:4},(_,k)=>at(uc+ru*half*caMix(-1,1,k/3),v,.4)),'cap-fibres',.34);}
      }
    }
  }
  if(p.wrinkles>0)for(let w=0,n=Math.round(9*p.wrinkles);w<n;w++){const s=caMix(.2,.92,(w+.5)/n);path(`wrinkle-${w}`,Array.from({length:49},(_,j)=>{const theta=j/48*CA_TAU*.8+w*1.3+p.phase;return top(theta,caClamp(s+.06*Math.sin(theta*4+w),0,1));}),'cap-fibres',.4);}
  if(p.net>0){const count=interactive?12:26;for(let i=0;i<2*count;i++){const dir=i<count?1:-1,start=(i%count)/count*CA_TAU;path(`net-${i}`,Array.from({length:12},(_,j)=>{const t=caMix(.42,.93,j/11);return stem(start+dir*(t-.42)*2.4,t);}),'cap-fibres',.28);}}
  if(p.pores>0)for(let r=0,rows=interactive?3:7;r<rows;r++){const s=caMix(.18,.92,r/(rows-1||1)),cols=Math.round((interactive?22:52)*(.55+.45*s));for(let c=0;c<cols;c++){const q=r*101+c,theta=(c+(r%2)*.5+.6*(rnd(q+1500)-.5))/cols*CA_TAU;path(`pore-${r}-${c}`,loop(under,theta,caClamp(s+.05*(rnd(q+1600)-.5),.1,.97),1.4+1.8*rnd(q+1700),5),'cap-fibres',.24+.12*rnd(q+1800));}}
  if(p.teeth>0&&p.toothLength>0)for(let i=0,n=Math.round((p.grammar==='tooth'?170:90)*dens);i<n;i++){const s=.18+.8*Math.sqrt(rnd(i+700)),theta=i*golden+p.phase,a=lower(theta,s),len=p.toothLength*(.55+.45*rnd(i+730));path(`tooth-${i}`,[a,[a[0]*.995,a[1]*.995,a[2]-len*.55],[a[0]*.985,a[1]*.985,a[2]-len]],'teeth',.5);}
  if(p.spines>0){
    // Pyramidal spines: a small base ring and a short point standing off the skin.
    const c=[stem(0,1)[0],0,(upper(0,0)[2]+lower(0,.6)[2])/2];
    for(let i=0,n=Math.round(90*dens);i<n;i++){const s=.04+.8*Math.sqrt(rnd(i+800)),theta=i*golden+p.phase,b=top(theta,s),out=caUnit(caSub(b,c)),len=(3+4*rnd(i+830))*scale;
      path(`spine-${i}`,[caAdd(b,out,-.4),caAdd(caAdd(b,out,len),[Math.cos(theta),Math.sin(theta),0],len*.25)],'cap-contour',.42);
      if(i%2===0)path(`spine-base-${i}`,loop(top,theta,s,len*.45,5),'cap-fibres',.26);}
  }
  if(p.umbo>0)detail('umbo-accent',Array.from({length:13},(_,j)=>upper(j/12*CA_TAU,.13+.02*Math.sin(j*1.7))));
  if(p.inkMargin>.3){
    // Deliquescing margin: the gill edges blacken and the rim turns to ink.
    for(let seg=0,segs=24;seg<segs;seg++){const a=seg/segs*CA_TAU,b=(seg+1)/segs*CA_TAU;detail('margin-accent',[...Array.from({length:4},(_,j)=>upper(caMix(a,b,j/3),.82+.04*Math.sin(seg*1.3+j))),...Array.from({length:4},(_,j)=>upper(caMix(b,a,j/3),1))]);}
    for(let i=0,n=Math.round(48*dens);i<n;i++){const theta=i/n*CA_TAU+.03*rnd(i+950),a=upper(theta,.995);path(`ink-drip-${i}`,[a,[a[0],a[1],a[2]-3-5*rnd(i+960)]],'cap-contour',.5);}
  }
  if(p.grammar==='earthstar'||p.grammar==='puffball'){
    path('apex-mouth',loop(top,p.phase,.03,p.grammar==='earthstar'?7:4,9),'cap-contour',.45);
    if(p.grammar==='earthstar')for(let i=0;i<14;i++){const theta=i/14*CA_TAU+p.phase;path(`peristome-${i}`,Array.from({length:5},(_,j)=>top(theta,caMix(.005,.075,j/4))),'cap-fibres',.3);}
  }
  // Hatching across the form on the side turned from the light: short arcs that
  // follow the cap's parallels and the stipe's girth, as in an engraved plate.
  if(p.hatch>0){
    const rows=Math.round((interactive?3:10)*p.hatch);
    for(let k=0;k<rows;k++){const s=caMix(.5,.96,k/Math.max(1,rows-1)),w=(.3+.3*s)*(.75+.5*rnd(k+1000)),c=shade+.3*Math.sin(k*1.9+p.phase);const slope=(rnd(k+1010)-.5)*.12;path(`cap-hatch-${k}`,Array.from({length:9},(_,j)=>top(c+w*(j/8*2-1),caClamp(s+slope*(j/8-.5),0,1))),'cap-fibres',.36+.2*rnd(k+1020));}
    const srows=Math.round((interactive?3:10)*Math.max(.5,p.hatch)*(p.net||p.pleats||p.snake?.5:1));
    for(let k=0;k<srows;k++){const t=caMix(.12,.96,k/Math.max(1,srows-1)),w=(t>.8?.9:.45)*(.8+.4*rnd(k+1100)),c=shade+.2*Math.sin(k*2.3);const slope=(rnd(k+1110)-.5)*.05;path(`stem-hatch-${k}`,Array.from({length:9},(_,j)=>stem(c+w*(j/8*2-1),caClamp(t+slope*(j/8-.5),0,1))),'cap-fibres',.34+.2*rnd(k+1120));}
  }
  // Cross-hatching in the deepest shadow: a second set of strokes across the first.
  if(p.hatch>0&&!interactive)for(let k=0;k<Math.round(6*p.hatch);k++){const t=caMix(.15,.9,k/Math.max(1,Math.round(6*p.hatch)-1)),c=shade+.15*Math.sin(k*1.7);path(`stem-cross-${k}`,Array.from({length:6},(_,j)=>stem(c+(j/5-.5)*.5,caClamp(t+(j/5-.5)*.09,0,1))),'cap-fibres',.3+.15*rnd(k+1150));}
  if(p.hatch>0&&!interactive)for(let k=0;k<Math.round(6*p.hatch);k++){const s=caMix(.6,.97,k/Math.max(1,Math.round(6*p.hatch)-1)),c=shade+.2*Math.cos(k*1.3);path(`cap-cross-${k}`,Array.from({length:6},(_,j)=>top(c+(j/5-.5)*.4,caClamp(s+(j/5-.5)*.16,0,1))),'cap-fibres',.3+.15*rnd(k+1050));}
  // Stipple where the form turns into shadow, denser towards the dark side.
  if(p.hatch>0&&!interactive)for(let i=0,n=Math.round(220*p.hatch);i<n;i++){
    const onStem=i%3===0,a=shade+(rnd(i+1400)-.5)*2.2*Math.sqrt(rnd(i+1410)),q=onStem?stem(a,caMix(.05,.95,rnd(i+1420))):top(a,caMix(.35,.98,rnd(i+1430)));
    path(`stipple-${i}`,[q,[q[0]+.7,q[1],q[2]+.5]],'cap-fibres',.8+.5*rnd(i+1440));}
  if(p.snake>0){
    // Snakeskin bands on the parasol stipe below its ring.
    const bands=interactive?4:8;for(let b=0;b<bands;b++){const t=caMix(.07,p.ringT-.06,b/(bands-1));path(`snake-${b}`,Array.from({length:37},(_,j)=>stem(j/36*CA_TAU,t+.014*(j%2?1:-1))),'cap-fibres',.34);}
  }
  if(p.bulbRings>0)for(let k=0;k<3;k++){const t=(p.bulbAt||.075)*(.75+.42*k);path(`bulb-ring-${k}`,Array.from({length:65},(_,j)=>{const theta=j/64*CA_TAU;return stem(theta,t+.012*Math.abs(Math.sin(9*theta+k*1.3+p.phase)));}),'ring',.42);}
  if(p.stemPores>0)for(let i=0,n=Math.round(70*dens);i<n;i++){const t=.12+.8*rnd(i+1200),theta=i*golden,q=(a,dt)=>stem(theta+a,t+dt),r=2.4/Math.max(4,p.stemRadius);path(`stem-pore-${i}`,Array.from({length:6},(_,j)=>q(Math.cos(j/5*CA_TAU)*r,Math.sin(j/5*CA_TAU)*.008)),'cap-fibres',.26);}
  if(p.pleats>0)for(let i=0,n=Math.round(18*p.pleats);i<n;i++){const theta=(i+.4*rnd(i+1300))/n*CA_TAU;path(`pleat-${i}`,Array.from({length:10},(_,j)=>{const t=caMix(.05,.95,j/9);return stem(theta+.05*Math.sin(t*7+i),t);}),'cap-fibres',.3);}
}
function caMemberChart(p,slot,view={yaw:.12,pitch:.36},{chartOnly=false,inkOnly=false,interactive=false,meshOnly=false}={}){
  const radial=Math.max(3,Math.round(p.radialRings??5)),N=interactive?48:96,R=interactive?Math.max(3,Math.round(radial*.6)):radial,H=p.body3d?(interactive?8:20):(interactive?5:8);
  const bend=t=>p.bend*Math.sin(t*Math.PI*.72)+p.lean*t;
  // Stipe profile: taper, club, rooting base, basal bulb and apical flare; the
  // foot is rounded under a bulb or club. radius(1) is the collar radius.
  const stemShape=t=>{
    const r=1+.18*(1-t)+(p.stemClub??0)*6.75*(t+.04)*(1-t)**2-(p.stemRoot??0)*.55*(1-t)**2.5+p.bulb*Math.exp(-(((t-(p.bulbAt||.075))/(p.bulbWidth||.08))**2))+(p.apexFlare??0)*caSmooth(caClamp((t-.86)/.14))+.65*p.fold*caSmooth(caClamp((t-.65)/.35));
    const foot=caClamp(p.bulb+(p.stemClub??0));return r*caMix(caMix(.72,.5,foot),1,Math.sin(Math.PI/2*caClamp(t/caMix(.05,(p.bulbAt||.075)*1.05,foot)))**.8);
  };
  // The legacy connected chart (oyster and chanterelle plates) keeps its own stipe and cap.
  const collarRadius=p.body3d?p.stemRadius*stemShape(1):p.stemRadius*(1+.65*p.fold);
  const radius=p.body3d?t=>p.stemRadius*stemShape(t):t=>p.stemRadius*(1+.22*(1-t)+p.bulb*Math.exp(-(((t-.08)/.19)**2))+.65*p.fold*caSmooth(caClamp((t-.65)/.35)));
  const lobeCount=Math.round(p.lobes??0),lobeShape=theta=>lobeCount>=1?Math.abs(Math.cos(lobeCount*(theta-p.phase*.15)/2))**.7:1;
  const attach=p.attach??0;
  const rim=(theta)=>{
    const low=1+(.026+p.edgeAsym)*Math.sin(2*theta+p.phase)+.018*Math.sin(5*theta-p.phase*.7)+.008*Math.sin(9*theta+p.phase*1.3);
    const lobed=lobeCount>=1&&p.lobeDepth?1-p.lobeDepth*(1-lobeShape(theta)):1;
    return Math.max(collarRadius+(p.rimGap??12),p.radius*(1-p.eccentricity*Math.cos(theta-attach))*low*lobed);
  };
  const lift=s=>p.bowl?caMix(s**caMix(1.7,.85,p.fold),1-Math.sqrt(Math.max(0,1-s*s)),p.bowl):s**caMix(1.7,.85,p.fold);
  const inroll=p.inroll??0,tubes=p.tubes??0;
  // Hymenophore surface: from the stipe apex out to the margin. Gill caps slope
  // down to an incurved margin; a bolete's tube layer bulges below the flesh.
  const tubeAt=s=>tubes?tubes*Math.sin(Math.PI*Math.min(1,s/.96))**.55:0;
  const capLower=(theta,s)=>{
    const curl=inroll*caSmooth(caClamp((s-.78)/.22)),rr=caMix(collarRadius,rim(theta),(p.radialPow??1)===1?s:s**p.radialPow)*(1-.07*curl)*(1-(p.waist??0)*caSmooth(caClamp((s-.55)/.45))),x=Math.cos(theta)*rr,y=Math.sin(theta)*rr*p.capDepth;
    const ruffled=p.ripple*(.70*Math.sin(3*theta+p.phase)+.38*Math.sin(5*theta-p.phase*.77)+.14*Math.sin(9*theta+p.phase*.4))*s**3;
    const saddle=p.lobeLift?p.lobeLift*Math.cos(Math.max(2,lobeCount)*(theta-p.phase*.15))*s*s:0;
    return [x+bend(1),y,p.height+p.rimLift*lift(s)+p.tiltX*x+p.tiltY*y+ruffled+saddle-p.marginCurl*Math.sin(Math.PI*s)*.12-tubeAt(s)+curl*p.radius*.045];
  };
  const pit=p.pitDepth>0?caPitGrid(p):null;
  // Fertile heads (morel, stinkhorn, club) are one closed ovoid or bell, its
  // margin fused to the stipe or hanging free; the stipe apex lies inside it.
  const headTop=p.height+p.thickness+p.dome+p.crest,headBase=p.height+p.rimLift;
  const headPhi=Math.PI-Math.asin(caClamp(p.headMargin>0?p.headMargin:collarRadius*1.06/Math.max(1,p.radius*(1-(p.pear??0)*.6)),.05,.98));
  const headA=(headTop-headBase)/(1-Math.cos(headPhi)),headC=headTop-headA;
  const headPoint=(theta,rr,z)=>{const x=Math.cos(theta)*rr,y=Math.sin(theta)*rr*p.capDepth;return [x+bend(1),y,z+p.tiltX*x+p.tiltY*y];};
  const headShape=phi=>(1-(p.cone??0)*.45*(1+Math.cos(phi))/2)*(1-(p.pear??0)*.62*((1-Math.cos(phi))/2)**1.4);
  const headLower=(theta,s)=>{const rr=caMix(collarRadius,rim(theta)*Math.sin(headPhi)*headShape(headPhi)*.97,s);return headPoint(theta,rr,caMix(p.height,headBase,s));};
  const headUpper=(theta,s)=>{
    const phi=s*headPhi,shape=headShape(phi);
    const rr=Math.max(0,rim(theta)*Math.sin(phi)*shape-(pit?p.pitDepth*pit.depth(theta,s):0));
    return headPoint(theta,rr,headC+headA*Math.cos(phi)+p.ripple*.5*Math.sin(3*theta+p.phase)*Math.sin(phi));
  };
  // Cap surface: flesh over the hymenophore, profiled as dome, cone or umbo; the
  // rim overhangs the hymenophore, and pitted heads are recessed between ridges.
  const capUpper=(theta,s)=>{
    const point=capLower(theta,s),dome=p.domePow===1?1-s*s:Math.max(0,1-s*s)**p.domePow,cover=p.cone?caMix(dome,1-s**1.15,p.cone):dome;
    point[2]+=p.thickness*(1-.30*s*s)+p.dome*cover+p.crest*Math.exp(-s*s/p.crestWidth)+tubeAt(s)-p.rimLift*(lift(s)-s*s)*(1-s)**2;
    // Concentric growth ridges of a perennial shelf, crests on the zone lines.
    if(p.zoneRidges>0&&s>.16&&s<.97)point[2]+=p.zoneRidges*p.radius*.014*(.5+.5*Math.cos(CA_TAU*((s-.16)/.81*7-.5)))*Math.sin(Math.PI*(s-.16)/.81);
    // The cap closes over the stipe apex: its surface starts on the axis, so a
    // dome or head is rounded at the top instead of cut flat at collar width.
    const rr=Math.max(1e-6,Math.hypot(point[0]-bend(1),point[1]/p.capDepth));
    const out=(p.overhang??0)*s**3+inroll*.05*caSmooth(caClamp((s-.7)/.3))-(pit?p.pitDepth*pit.depth(theta,s):0)/Math.max(8,rr)-collarRadius*(1-s)/rr;
    if(out){point[0]+=(point[0]-bend(1))*out;point[1]+=point[1]*out;}
    return point;
  };
  const chartUpper=(theta,s)=>{const point=capLower(theta,s),cover=p.domePow===1?1-s*s:Math.max(0,1-s*s)**p.domePow;point[2]+=p.thickness*(1-.30*s)+p.dome*cover+p.crest*Math.exp(-s*s/p.crestWidth);return point;};
  const lower=p.head>0?headLower:capLower,upper=p.head>0?headUpper:p.body3d?capUpper:chartUpper;
  const stem=(theta,t)=>{
    const rr=radius(t)*(1+(p.stemRibs?.07*p.stemRibs*Math.cos(8*theta+p.phase)*Math.sin(Math.PI*t):0)),x=Math.cos(theta)*rr,y=Math.sin(theta)*rr*p.capDepth;
    return [x+bend(t),y+(p.leanY??0)*(1-t),p.height*t+t**5*(p.tiltX*Math.cos(theta)*collarRadius+p.tiltY*Math.sin(theta)*collarRadius*p.capDepth)];
  };
  // Shared camera: yaw about the member's vertical axis, pitch about the
  // horizontal axis, then a mild pinhole perspective about the basal ring.
  // slot.viewPitch: the member's own drawn elevation, an offset on the camera.
  // slot.yaw/slot.pitch turn a colony member on its attachment; slot.barkClip
  // hides the part of an attached shelf that lies inside the wood (local
  // beyond the bark plane [nx, ny, c] in member coordinates), so the shelf
  // leaves the bark along a broad chord.
  const memberYaw=view.yaw+(slot.yaw??0),memberPitch=caClamp(view.pitch+(slot.viewPitch??0),-.6,1.2)+(slot.pitch??0),bark=Array.isArray(slot.barkClip)&&slot.barkClip.every(Number.isFinite)?slot.barkClip:null,inWood=q=>!!bark&&q[0]*bark[0]+q[1]*bark[1]>bark[2]+1e-6,cy=Math.cos(memberYaw),sy=Math.sin(memberYaw),cp=Math.cos(memberPitch),sp=Math.sin(memberPitch),ca=Math.cos(slot.rotation),sa=Math.sin(slot.rotation);
  // A plate member's stretch and lean (memberLinear) act about its foot.
  const stretch=slot.stretch??1,shear=Math.tan(slot.lean??0);
  const project=p3=>{
    const x0=p3[0]*cy-p3[1]*sy,depthAxis=p3[0]*sy+p3[1]*cy,y0=-p3[2]*cp+depthAxis*sp,depth=-depthAxis*cp-p3[2]*sp,k=p.body3d?CA_FOCAL/(CA_FOCAL+depth):1,x=x0*k,y=y0*k;
    const lx=x*ca-y*sa,ly=x*sa+y*ca;
    return [slot.x+slot.scale*(lx*stretch-ly*shear)*(slot.fitX??1),slot.y+slot.scale*ly*(slot.fitY??1),depth*slot.scale+(slot.depth??0)];
  };
  if(chartOnly)return {chart:{lower,upper,stem,project}};
  const worldKey=inkOnly&&interactive&&!meshOnly?`${N}:${R}:${H}:${slot.id}:${JSON.stringify(slot.barkClip??null)}:${JSON.stringify(p)}`:null,cachedWorld=worldKey?caWorldCache.get(worldKey):null;
  if(cachedWorld)return caProjectCachedWorld(cachedWorld,p,slot,project);
  const parts=p.body3d?caBodyParts(p,{lower,upper,stem,radius,bend,interactive}):[];
  const key=`${N}:${R}:${H}|${parts.map(part=>part.signature).join(',')}`,caChartTopology=caChartTopologies.get(key),vertices=[],worldVertices=[],faces=[],paths=[],edges=caChartTopology?.edges??new Map();
  // Tissue inside the wood is pressed onto the bark plane: boundary faces
  // then end exactly on the plane (a smooth attachment line), and faces
  // wholly inside are dropped.
  const pressed=new Set();
  const vertex=(point)=>{if(bark&&inWood(point)){const d=point[0]*bark[0]+point[1]*bark[1]-bark[2];point=[point[0]-bark[0]*d,point[1]-bark[1]*d,point[2]];pressed.add(worldVertices.length);}worldVertices.push(point);vertices.push(project(point));return vertices.length-1;};
  const face=(indices,role)=>faces.push({indices,role,individual:slot.id});
  const stemT=j=>p.body3d?.6*(.5-.5*Math.cos(Math.PI*j/H))+.4*(j/H)**2:j/H,stemRings=Array.from({length:H+1},(_,j)=>Array.from({length:N},(_,i)=>vertex(stem(i/N*CA_TAU,stemT(j)))));
  const lowerRings=[stemRings[H],...Array.from({length:R},(_,j)=>Array.from({length:N},(_,i)=>vertex(lower(i/N*CA_TAU,(j+1)/R))))];
  const upperRings=Array.from({length:R+1},(_,j)=>Array.from({length:N},(_,i)=>vertex(upper(i/N*CA_TAU,j/R))));
  const topCenter=vertex(p.body3d?upperRings[0].reduce((sum,i)=>sum.map((v,k)=>v+worldVertices[i][k]/N),[0,0,0]):[bend(1),0,p.height+p.thickness+p.dome+p.crest]);
  const baseCenter=vertex([bend(0),p.leanY??0,0]);
  const partFaces=parts.map(part=>part.build(vertex));
  if(caChartTopology)for(const item of caChartTopology.faces)face(item.indices,item.role);
  else{
    for(let i=0;i<N;i++){
      const k=(i+1)%N;face([topCenter,upperRings[0][i],upperRings[0][k]],'cap');face([baseCenter,stemRings[0][k],stemRings[0][i]],'stem');
      for(let j=0;j<H;j++)face([stemRings[j][i],stemRings[j][k],stemRings[j+1][k],stemRings[j+1][i]],'stem');
      for(let j=0;j<R;j++){
        face([lowerRings[j][i],lowerRings[j][k],lowerRings[j+1][k],lowerRings[j+1][i]],'underside');
        face([upperRings[j][i],upperRings[j+1][i],upperRings[j+1][k],upperRings[j][k]],'cap');
      }
      face([lowerRings[R][i],lowerRings[R][k],upperRings[R][k],upperRings[R][i]],'margin');
    }
    // Closed parts are oriented once from their own interior reference points.
    for(const list of partFaces)for(const {indices,role,inside} of list)face(caOrient(indices,inside,worldVertices),role);
  }
  for(let f=0;f<faces.length;f++){
    const item=faces[f],ps=item.indices.map(i=>vertices[i]);item.projected=ps;
    if(!inkOnly){
      const [a,b,c]=item.indices.map(i=>worldVertices[i]),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],norm=Math.hypot(...normal)||1;
      item.normal=normal.map(n=>n/norm);item.light=caClamp(.37+.63*Math.max(0,(-.48*normal[0]-.24*normal[1]+.843*normal[2])/norm));
    }
    item.visible=ps.reduce((sum,p,i)=>{const q=ps[(i+1)%ps.length];return sum+p[0]*q[1]-q[0]*p[1];},0)>0;
    if(!caChartTopology)item.indices.forEach((a,i)=>{const b=item.indices[(i+1)%item.indices.length],key=a<b?`${a}:${b}`:`${b}:${a}`;if(!edges.has(key))edges.set(key,{a,b,faces:[]});edges.get(key).faces.push(f);});
  }
  if(!caChartTopology)caChartTopologies.set(key,{faces:faces.map(({indices,role})=>({indices,role})),edges});
  // The mesh's unique silhouette is a connected body surface. All contact rings
  // are shared vertex IDs, not coincident independently reconstructed outlines.
  const silhouette=[];
  for(const edge of edges.values())if(edge.faces.filter(i=>faces[i].visible).length===1&&edge.faces.some(i=>!faces[i].visible))silhouette.push([edge.a,edge.b]);
  // Each chain point carries its world position, so the hand model anchors
  // its wander and pen lifts to the body rather than to the screen.
  const chains=caJoinEdges(silhouette,vertices.map((q,i)=>[...q,...worldVertices[i]]));
  if(meshOnly)return {vertices,worldVertices,faces,slot,chains:chains.map(chain=>chain.map(q=>q.slice(0,3))),chart:{project}};
  chains.forEach((points,i)=>{const smooth=caSmoothProjectedCurve(points,2);paths.push({id:`${slot.id}:silhouette:${i}`,points:smooth.map(q=>q.slice(0,3)),world:smooth.map(q=>q.slice(3)),role:'cap-contour',width:p.body3d?(p.coralLevels?1.1:1.6):1.3,opacity:p.body3d?.9:.82,hand:`${slot.id}:silhouette`});});
  const path=(id,world,role,width=.55)=>{
    if(!bark){paths.push({id:`${slot.id}:${id}`,points:world.map(project),world,role,width,opacity:p.body3d?.78:.6});return;}
    // Keep only the runs outside the wood.
    let run=[],part=0;const flush=()=>{if(run.length>1)paths.push({id:`${slot.id}:${id}${part?`:${part}`:''}`,points:run.map(project),world:run,role,width,opacity:p.body3d?.78:.6});if(run.length)part++;run=[];};
    for(const q of world){if(!inWood(q))run.push(q);else flush();}flush();
  };
  if(!p.bowl&&!(p.attached&&p.grammar==='tooth')&&!(p.head>0&&!(p.headMargin>0)&&p.body3d))path('rim',Array.from({length:97},(_,i)=>lower(i/96*CA_TAU,1)),'cap-contour',.78);
  const reserves=[],details=[],detail=(role,world)=>details.push({role,world});
  // Primary lamellae stay attached and curve with the cap's intrinsic strain.
  // Short lamellulae become paired/forking blunt folds. Their lower ends have
  // different insertion heights; no shared horizontal "cuff" is introduced.
  const P=24;
  const gillSeed=Math.floor(p.phase*1e4),baseAngle=i=>((i+.45)/P+.008*Math.sin(i/P*CA_TAU*3+p.phase)+.003*Math.sin(i/P*CA_TAU*7-p.phase)+(p.body3d?.28*(caNoise(i,gillSeed)-.5)/P:0))*CA_TAU;
  const curveAngle=(base,s)=>base+(p.ribCurve+.065*Math.sin(3*base+p.phase))*Math.sin(Math.PI*s)*(.30+.70*s)+.025*Math.sin(2*CA_TAU*s+base+p.phase)*s*(1-s);
  for(let i=0;i<(p.gills>0?P:0);i++){
    const base=baseAngle(i),variation=.5+.5*Math.sin(i*2.381+p.phase),start=1-p.decurrent*(.50+.47*variation),primary=[];
    // Long smooth runs down a twisting/flaring stipe, with tapered pressure.
    if(p.decurrent>.02||!(p.gillFree>0)){
      for(let j=0;j<=8;j++){
        const t=caMix(start,1,j/8),theta=base+.07*Math.sin(Math.PI*(1-t))*Math.sin(base+p.phase);
        primary.push(stem(theta,t));
      }
      for(let j=1;j<=22;j++)primary.push(lower(curveAngle(base,j/22),j/22));
    // Free gills stop short of the stipe, leaving a narrow collar of bare flesh.
    }else for(let j=0;j<=30;j++){const s=caMix(.035+.06*p.gillFree,1,j/30);primary.push(lower(curveAngle(base,s),s));}
    path(`primary-ridge-${i}`,primary,'folds',(.29+.20*p.fold)*(i%3===0?1.35:1));
    paths.at(-1).taper=.40;paths.at(-1).anatomy='primary-decurrent';
    for(let lane=0;lane<2;lane++){
      if((i+lane)%3!==0)continue;
      const startS=lane===0?.22+.16*variation:.43+.16*(1-variation),world=[];
      for(let j=0;j<=22;j++){
        const s=caMix(startS,1,j/22),gillOffset=(lane===0?-.34:.34)*CA_TAU/P;
        const pairedOffset=(lane===0?-1:1)*p.ridgeWidth*.5/caMix(collarRadius,p.radius,s);
        const fork=lane===1?caSmooth(caClamp((s-startS)/(1-startS)))*CA_TAU/P*.34:0;
        // A fork begins on its parent ridge. A paired edge diverges gradually,
        // so it describes a blunt relief instead of a parallel stripe.
        const foldOffset=(pairedOffset+fork)*caSmooth(caClamp((s-startS)/.18));
        const theta=curveAngle(base,s)+caMix(gillOffset,foldOffset,p.fold);
        world.push(lower(theta,s));
      }
      path(`secondary-ridge-${i}-${lane}`,world,'folds',.31+.22*p.fold);
      paths.at(-1).taper=.32;paths.at(-1).anatomy=lane?'fork-or-lamellula':'ridge-edge-or-lamellula';
    }
  }
  // Lamellulae: shorter gills of graded lengths between the primaries, so the
  // underside reads as crowded lamellae seen edge-on, not as a few stripes.
  if(p.gills>0&&p.lamellulae>0)for(let i=0;i<P;i++){
    const tiers=interactive?[.5]:p.lamellulae<1?[.5]:[.25,.5,.75];
    for(const [k,f] of tiers.entries()){
      const theta0=baseAngle(i)+(f+.12*(caNoise(i*3+k+50,gillSeed)-.5))*CA_TAU/P,s0=(f===.5?.18:.4)+.42*caNoise(i*3+k,gillSeed),n=12;
      path(`lamellula-${i}-${k}`,Array.from({length:n+1},(_,j)=>{const s=caMix(s0,1,j/n);return lower(curveAngle(theta0,s),s);}),'lamellae',(p.body3d?.38:.24)*caClamp(1-1.2*p.fold,.05,1));
      paths.at(-1).taper=.4;
    }
  }
  if(p.body3d&&p.gills>0&&p.fold<.5){
    // Occasional forks near the margin and darkened gill edges along it.
    for(let i=0;i<P;i+=3){const b=baseAngle(i),from=.55+.2*caNoise(i+90,gillSeed);path(`gill-fork-${i}`,Array.from({length:9},(_,j)=>{const s=caMix(from,1,j/8);return lower(curveAngle(b,s)+caSmooth(j/8)*CA_TAU/P*.4,s);}),'lamellae',.28);}
    path('gill-edge',Array.from({length:97},(_,i)=>{const q=lower(i/96*CA_TAU,.975);q[2]-=.8;return q;}),'cap-contour',.7);
    for(let seg=0,segs=24;seg<segs;seg++){const a=seg/segs*CA_TAU,b=(seg+1)/segs*CA_TAU;detail('gill-shadow',[...Array.from({length:4},(_,j)=>lower(caMix(a,b,j/3),.04)),...Array.from({length:4},(_,j)=>lower(caMix(b,a,j/3),.42))]);}
  }
  // Fibres have varied insertion points and follow the same bowed stipe.
  for(let i=0;i<12;i++){
    const start=.025+.16*(.5+.5*Math.sin(i*2.13+p.phase)),end=.58+.30*(.5+.5*Math.sin(i*1.31-p.phase));
    path(`stipe-fibre-${i}`,Array.from({length:20},(_,j)=>{const t=caMix(start,end,j/19);return stem((i+.37)/12*CA_TAU+.055*Math.sin(t*Math.PI+i),t);}), p.body3d?'cap-fibres':'fibres',p.body3d?.38:.23);
    paths.at(-1).taper=.5;
  }
  if(!p.body3d)for(let i=0;i<14;i++){
    const angle=(i+.28+.15*Math.sin(i*3.1+p.phase))/14*CA_TAU,start=.22+.26*(.5+.5*Math.sin(i*1.7+p.phase));
    path(`crown-form-${i}`,Array.from({length:22},(_,j)=>{const s=caMix(start,.98,j/21);return upper(curveAngle(angle,s)*.97+.03*angle,s);}), 'cap-fibres',.20);
    paths.at(-1).taper=.48;
  }
  if(p.body3d)caSurfaceMarks(p,{lower,upper,stem,rim,collarRadius,interactive,path,pit,reserve:(role,world)=>reserves.push({role,world}),detail});
  if(p.attached)caAttachedMarks(p,{lower,upper,interactive,path,paths});
  for(const part of parts)for(const mark of part.ink??[])path(mark.id,mark.world,mark.role,mark.width);
  if(worldKey){
    caWorldCache.set(worldKey,{worldVertices,faces:faces.map(({indices,role})=>({indices,role})),edges,paths:paths.slice(chains.length).map(({points,...d})=>d),reserves,details,lower,upper,stem});
    if(caWorldCache.size>CA_WORLD_CACHE_LIMIT)caWorldCache.delete(caWorldCache.keys().next().value);
  }
  if(inkOnly)return {vertices,worldVertices,faces,paths,slot,reserves,details,chart:{lower,upper,stem,project}};
  const shadowAngle=role=>{
    let x=0,y=0;
    for(const face of faces)if(face.visible&&face.role===role){
      const center=face.indices.reduce((sum,i)=>sum.map((v,k)=>v+worldVertices[i][k]/face.indices.length),[0,0,0]);
      const theta=Math.atan2(center[1]/p.capDepth,center[0]-bend(role==='cap'?1:caClamp(center[2]/p.height)));
      const area=caPolygonArea(face.projected),weight=area*(.03+(1-face.light)**2);
      x+=Math.cos(theta)*weight;y+=Math.sin(theta)*weight;
    }
    return Math.atan2(y,x);
  };
  const capShadow=shadowAngle('cap'),stemShadow=shadowAngle('stem');
  const shadowPaths={
    cap:Array.from({length:22},(_,j)=>{const theta=capShadow+caMix(-.65,.65,j/21),s=.66+.17*Math.sin(j/21*Math.PI);return project(upper(theta,s));}),
    stem:Array.from({length:22},(_,j)=>project(stem(stemShadow,.08+j/21*.86))),
  };
  const basePaths={stem:Array.from({length:24},(_,j)=>{const t=.035+j/23*.94;return project([bend(t),0,p.height*t]);}),cap:Array.from({length:33},(_,j)=>{const u=-.95+j/32*1.9;return project(upper(u<0?Math.PI:0,Math.abs(u)));}),underside:Array.from({length:33},(_,j)=>{const u=-.95+j/32*1.9;return project(lower(u<0?Math.PI:0,Math.abs(u)));})};
  return {vertices,worldVertices,faces,paths,slot,shadowPaths,basePaths,reserves,details,chart:{lower,upper,stem,project},mesh:{rings:N,radial:R,vertical:H,vertices:vertices.length,faces:faces.length,closed:[...edges.values()].every(edge=>edge.faces.length===2)}};
}
function caSmoothProjectedCurve(points,steps=2){
  if(points.length<4)return points;
  const closed=Math.hypot(...points[0].map((v,k)=>v-points.at(-1)[k]))<1e-8,source=closed?points.slice(0,-1):points,n=source.length,result=[];
  const at=i=>source[closed?(i%n+n)%n:Math.max(0,Math.min(n-1,i))];
  for(let i=0;i<(closed?n:n-1);i++)for(let j=0;j<steps;j++){
    const t=j/steps,t2=t*t,t3=t2*t,a=at(i-1),b=at(i),c=at(i+1),d=at(i+2);
    result.push(b.map((_,k)=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)));
  }
  result.push(closed?[...result[0]]:[...source.at(-1)]);return result;
}
// Smooth value noise on a 3D lattice. Hand-drawn wander is sampled at world
// positions on the body, so strokes turn with it instead of boiling on screen.
function caNoise3(x,y,z,seed){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),fx=caSmooth(x-xi),fy=caSmooth(y-yi),fz=caSmooth(z-zi);
  const h=(a,b,c)=>caNoise(Math.imul(a,73856093)^Math.imul(b,19349663)^Math.imul(c,83492791),seed);
  const lerp2=(c)=>caMix(caMix(h(xi,yi,c),h(xi+1,yi,c),fx),caMix(h(xi,yi+1,c),h(xi+1,yi+1,c),fx),fy);
  return caMix(lerp2(zi),lerp2(zi+1),fz);
}
const CA_CONTOUR_ROLES=new Set(['cap-contour','stem-contour','ring']);
// The 2D plates' hand: lateral wander along each line, contours laid down as
// several overlapping nib contacts with lifts, small overshoots and an
// occasional break, and a lighter restatement of part of the outline. Every
// random choice is keyed to the mark's world points, so orbiting is stable.
function caHandInk(mark,visibility,p){
  const step=visibility.step?visibility.step*1.5:4,world=mark.world??mark.points.map(()=>[0,0,0]),contour=CA_CONTOUR_ROLES.has(mark.role);
  if(contour&&visibility.visibleContour)visibility={...visibility,visible:visibility.visibleContour};
  const pts=mark.points.map((q,i)=>[q[0],q[1],q[2]??0,...(world[i]??[0,0,0])]),fragments=[];let current=[];
  const flush=()=>{if(current.length>1)fragments.push(current);current=[];};
  for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/step));
    for(let j=0;j<count;j++){const q=a.map((v,k)=>v+(b[k]-v)*j/count);if(visibility.visible(q))current.push(q);else flush();}}
  if(pts.length&&visibility.visible(pts.at(-1)))current.push(pts.at(-1));flush();
  const seed=caHash(mark.hand??mark.id),wander=(p?.handWander??1)*(contour?.6:.32),lam=contour?34:20;
  const field=(q,scale,salt)=>caNoise3(q[3]/scale,q[4]/scale,q[5]/scale,seed+salt);
  const drift=(f,salt,amp)=>f.map((q,i)=>{const a=f[Math.max(0,i-1)],b=f[Math.min(f.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1,d=amp*(2*(field(q,lam,salt)-.5)+.7*(field(q,lam*.33,salt+5)-.5));return [q[0]-dy/l*d,q[1]+dx/l*d,...q.slice(2)];});
  const strokes=[];
  for(const f of fragments){
    const shaped=drift(f,0,wander);
    // The drag preview keeps the same body-anchored wander in one stroke per run.
    if(!contour||shaped.length<6||visibility.step){strokes.push({points:shaped.map(q=>q.slice(0,2))});continue;}
    // Pen contacts break where a body-anchored noise band changes value.
    const band=q=>Math.floor(field(q,90,13)*4);let start=0;
    for(let i=1;i<=shaped.length;i++){
      if(i<shaped.length&&!(band(shaped[i])!==band(shaped[start])&&i-start>=10)&&i-start<80)continue;
      let piece=shaped.slice(Math.max(0,start-2),i);const q0=piece[0],key=field(q0,9,17);
      if(piece.length>14&&field(q0,23,29)<.08)piece=piece.slice(0,-Math.max(1,Math.round(6/step)));
      const points=piece.map(q=>q.slice(0,2));
      if(points.length>2){const over=(a,b,len)=>{const dx=a[0]-b[0],dy=a[1]-b[1],l=Math.hypot(dx,dy)||1;return [a[0]+dx/l*len,a[1]+dy/l*len];};
        if(key>.45)points.push(over(points.at(-1),points.at(-2),1+2.2*key));if(key<.35)points.unshift(over(points[0],points[1],1+2*(1-key)));}
      // Heavier on the side turned from the light, thinner and lighter where lit.
      const mid=piece[piece.length>>1],c=p?.centroid??[0,0,mid[5]],out=caUnit([mid[3]-c[0],mid[4]-c[1],(mid[5]-c[2])*.5]),shade=caClamp(-(out[0]*-.48+out[1]*-.24+out[2]*.843)+.35);
      strokes.push({points,width:mark.width*(.6+.5*field(q0,17,31))*(.75+.9*shade),opacity:Math.min(1,mark.opacity*(.9+.25*shade)*(.88+.12*key)),phase:(p?.phase??0)+key*11.3});
      start=i;
    }
    // A lighter second pass restates part of the outline, slightly off-line.
    if(mark.role==='cap-contour'){const second=drift(f,3,wander*1.6);let run=[];
      const end=()=>{if(run.length>=5)strokes.push({points:run,width:mark.width*.5,opacity:mark.opacity*.5,phase:(p?.phase??0)+3.1,restate:true});run=[];};
      for(const q of second){if(field(q,64,41)>.52)run.push(q.slice(0,2));else end();}end();}
  }
  return strokes.filter(s=>s.points.length>1);
}
function caJoinEdges(edges,vertices){
  const links=new Map();edges.forEach(([a,b],i)=>{if(!links.has(a))links.set(a,[]);if(!links.has(b))links.set(b,[]);links.get(a).push(i);links.get(b).push(i);});
  const seen=new Set(),chains=[];
  for(let seed=0;seed<edges.length;seed++)if(!seen.has(seed)){
    const chain=[],start=edges[seed][0];let current=start,edge=seed;
    while(!seen.has(edge)){seen.add(edge);chain.push(vertices[current]);const [a,b]=edges[edge];current=current===a?b:a;const next=links.get(current).find(i=>!seen.has(i));if(next===undefined){chain.push(vertices[current]);break;}edge=next;}
    if(chain.length>1)chains.push(chain);
  }
  return chains;
}
// Interactive visibility only. All samples and depth come from the actual
// projected chart; the settled planner retains exact triangle-plane tests.
export function connectedPreviewVisibility(members,{step=5}={}){
  if(!Number.isFinite(step)||step<2||step>20)throw new RangeError('Interactive depth spacing must be 2–20 pixels');
  const width=Math.ceil(1200/step),height=Math.ceil(1000/step),depth=new Float32Array(width*height);depth.fill(Infinity);
  const triangle=(a,b,c)=>{
    const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-6)return;
    const ua=(b[1]-c[1])/den,ub=(c[0]-b[0])/den,uc=-ua*c[0]-ub*c[1],va=(c[1]-a[1])/den,vb=(a[0]-c[0])/den,vc=-va*c[0]-vb*c[1];
    const dx=ua*(a[2]-c[2])+va*(b[2]-c[2]),dy=ub*(a[2]-c[2])+vb*(b[2]-c[2]),z0=uc*(a[2]-c[2])+vc*(b[2]-c[2])+c[2];
    const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])/step)),x1=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0])/step)),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])/step)),y1=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])/step));
    for(let y=y0;y<=y1;y++){const py=(y+.5)*step;for(let x=x0;x<=x1;x++){const px=(x+.5)*step,u=ua*px+ub*py+uc,v=va*px+vb*py+vc;if(u>=0&&v>=0&&u+v<=1){const i=y*width+x,z=dx*px+dy*py+z0;if(z<depth[i])depth[i]=z;}}}
  };
  for(const member of members)for(const face of member.faces)if(face.visible)for(let i=1;i<face.projected.length-1;i++)triangle(face.projected[0],face.projected[i],face.projected[i+1]);
  const visible=p=>{const x=Math.floor(p[0]/step),y=Math.floor(p[1]/step);return x>=0&&y>=0&&x<width&&y<height&&p[2]<=depth[y*width+x]+step*1.75;};
  const fragments=points=>{const result=[];let current=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/(step*1.5)));for(let j=0;j<count;j++){const t=j/count,p=a.map((v,k)=>v+(b[k]-v)*t);if(visible(p))current.push(p.slice(0,2));else if(current.length){if(current.length>1)result.push(current);current=[];}}}if(visible(points.at(-1)))current.push(points.at(-1).slice(0,2));if(current.length>1)result.push(current);return result;};
  // Contours lie on the body's own grazing edge, where a coarse cell's
  // nearest depth runs well ahead of the line: test them against the
  // farthest surface in the 3 x 3 cells around them (paper counts as clear),
  // so an outline stays whole and is still hidden behind a nearer body.
  const visibleContour=p=>{
    const x=Math.floor(p[0]/step),y=Math.floor(p[1]/step);if(x<0||y<0||x>=width||y>=height)return false;
    let far=-Infinity;
    for(let j=Math.max(0,y-1);j<=Math.min(height-1,y+1);j++)for(let i=Math.max(0,x-1);i<=Math.min(width-1,x+1);i++){const z=depth[j*width+i];if(z===Infinity)return true;if(z>far)far=z;}
    return p[2]<=far+step*1.75;
  };
  return {visible,visibleContour,fragments,cells:depth.length,step};
}

function caVisibility(members){
  // Bin exact projected triangle planes. Analytic line samples are tested at
  // their own position, avoiding pixel-neighbour depth staircases and holes.
  const size=16,W=75,H=63,bins=new Array(W*H);
  const triangle=(a,b,c)=>{
    const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-6)return;
    const ua=(b[1]-c[1])/den,ub=(c[0]-b[0])/den,uc=-ua*c[0]-ub*c[1];
    const va=(c[1]-a[1])/den,vb=(a[0]-c[0])/den,vc=-va*c[0]-vb*c[1];
    const dzA=a[2]-c[2],dzB=b[2]-c[2],plane=[ua*dzA+va*dzB,ub*dzA+vb*dzB,uc*dzA+vc*dzB+c[2]],item={ua,ub,uc,va,vb,vc,plane};
    const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])/size)),x1=Math.min(W-1,Math.floor(Math.max(a[0],b[0],c[0])/size));
    const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])/size)),y1=Math.min(H-1,Math.floor(Math.max(a[1],b[1],c[1])/size));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)(bins[y*W+x]??=[]).push(item);
  };
  for(const member of members)for(const face of member.faces)if(face.visible)for(let i=1;i<face.projected.length-1;i++)triangle(face.projected[0],face.projected[i],face.projected[i+1]);
  const visible=p=>{
    const x=Math.floor(p[0]/size),y=Math.floor(p[1]/size);if(x<0||x>=W||y<0||y>=H)return false;
    for(const tri of bins[y*W+x]??[]){
      const u=tri.ua*p[0]+tri.ub*p[1]+tri.uc,v=tri.va*p[0]+tri.vb*p[1]+tri.vc;
      if(u>=-.0001&&v>=-.0001&&u+v<=1.0001&&p[2]>tri.plane[0]*p[0]+tri.plane[1]*p[1]+tri.plane[2]+3.5)return false;
    }
    return true;
  };
  const fragments=points=>{
    const result=[];let current=[];
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4));
      for(let j=0;j<count;j++){
        const p=a.map((v,k)=>caMix(v,b[k],j/count));
        if(visible(p))current.push(p.slice(0,2));else if(current.length){if(current.length>1)result.push(current);current=[];}
      }
    }
    if(visible(points.at(-1)))current.push(points.at(-1).slice(0,2));if(current.length>1)result.push(current);return result;
  };
  return {visible,fragments};
}
export function connectedDimensionsAt(pair,t){
  if(!Number.isFinite(t))throw new RangeError('Blend must be finite');t=caClamp(t);
  const capDepth=caClamp(pair.shapeModifiers?.capDepth??1,.45,1.7),stemBend=caClamp(pair.shapeModifiers?.stemBend??0,-70,70);
  if(![capDepth,stemBend].every(Number.isFinite))throw new RangeError('Non-finite 3D parameter');
  return pair.anatomyA.map((a,i)=>{const p=interpolateConnectedAnatomy(a,pair.anatomyB[i],t);return {...p,capDepth:p.capDepth*capDepth,bend:p.bend+stemBend};});
}
export function connectedIntrinsicValues(pair,t){
  const index=pair.composition.members.reduce((best,m,i,all)=>m.maturity>all[best].maturity?i:best,0),p=connectedDimensionsAt(pair,t)[index];
  return {...p,stemWidth:p.stemRadius*2,memberId:pair.composition.members[index].id};
}
// The camera a body is drawn with; the reprojection mesh uses the same one.
const caBodyView=(pair,dimensions,view,t)=>dimensions[0]?.body3d?{...view,pitch:caBodyPitch(view.pitch,t<.5?pair.a:pair.b)}:view;
export function buildConnectedAnatomySurface(pair,t,{inkOnly=false,interactive=false}={}){
  const view={yaw:caClamp(pair.view?.yaw??.12,-Math.PI,Math.PI),pitch:caClamp(pair.view?.pitch??.36,-.25,1.2)};
  if(![view.yaw,view.pitch].every(Number.isFinite))throw new RangeError('Non-finite 3D parameter');
  const dimensions=connectedDimensionsAt(pair,t);
  // A 3D body is seen at its family's plate angle: stipitate caps near eye level
  // (gills in view), open cups and shelves from above. The camera pitch is an
  // offset from that, so the default view and every orbit stay continuous.
  const bodyView=caBodyView(pair,dimensions,view,t);
  return {dimensions,view,members:dimensions.map((p,i)=>caMemberChart(p,pair.habit?pair.composition.members[i]:habitFree(pair.composition.members[i]),bodyView,{inkOnly,interactive:inkOnly&&interactive}))};
}
export function buildConnectedAnatomy(pair,t,{inkOnly=false,interactive=false}={}){
  if(!Number.isFinite(t))throw new RangeError('Blend must be finite');t=caClamp(t);
  const {dimensions,members}=buildConnectedAnatomySurface(pair,t,{inkOnly,interactive}),visibility=inkOnly&&interactive?connectedPreviewVisibility(members):caVisibility(members),ink=[],bodies=[],surfaceFaces=[],surfacePassages=[],detailPassages=[];
  for(let individual=0;individual<members.length;individual++){
    const member=members[individual];
    const centroid=member.worldVertices.reduce((sum,q)=>sum.map((v,k)=>v+q[k]/member.worldVertices.length),[0,0,0]);
    for(const mark of member.paths){const {world,hand,...base}=mark;for(const [part,{restate,...stroke}] of caHandInk(mark,visibility,{...dimensions[individual],centroid}).entries())ink.push({...base,id:`${restate?mark.id.replace(':silhouette:',':restatement:'):mark.id}:visible-${part}`,individual,memberId:member.slot.id,phase:dimensions[individual].phase,...stroke});}
    if(inkOnly)continue;
    // Painter can mask one passage per material region with these small islands.
    // Visibility is geometric, so transparent paint does not show rear surfaces.
    const byRole=new Map();for(const face of member.faces)if(face.visible){
      const role=face.role==='margin'?'cap':face.role;if(!byRole.has(role))byRole.set(role,[]);
      byRole.get(role).push(face.projected.map(p=>p.slice(0,2)));
      surfaceFaces.push({points:face.projected.map(p=>p.slice(0,2)),depth:face.projected.reduce((sum,p)=>sum+p[2],0)/face.projected.length,light:face.light,role,individual});
    }
    for(const role of ['cap','stem']){const points=member.shadowPaths[role].map(p=>p.slice(0,2));surfacePassages.push({role:role==='cap'?'cap-glaze':'stem-shadow',individual,memberId:member.slot.id,points,width:dimensions[individual][role==='cap'?'radius':'stemRadius']*member.slot.scale*(role==='cap'?.42:1.15)});}
    // Raised veil warts stay white paper inside the cap wash, but only where the
    // whole wart is in view; a hidden wart must not punch through nearer tissue.
    const seen=world=>{const pts=world.map(member.chart.project);return pts.every(q=>visibility.visible(q))?pts.map(q=>q.slice(0,2)):null;};
    const reserved=new Map();for(const {role,world} of member.reserves??[]){const pts=seen(world);if(pts){if(!reserved.has(role))reserved.set(role,[]);reserved.get(role).push(pts);}}
    const mostly=world=>{const pts=world.map(member.chart.project);return pts.filter(q=>visibility.visible(q)).length>=.8*pts.length?pts.map(q=>q.slice(0,2)):null;};
    const details=new Map();for(const {role,world} of member.details??[]){const pts=mostly(world);if(pts){if(!details.has(role))details.set(role,[]);details.get(role).push(pts);}}
    for(const [role,islands] of details)detailPassages.push({role,individual,memberId:member.slot.id,islands});
    for(const [role,islands] of byRole){const box=caBox(islands.flat());bodies.push({role,individual,memberId:member.slot.id,islands,basePoints:member.basePaths[role]?.map(p=>p.slice(0,2)),baseWidth:dimensions[individual][role==='stem'?'stemRadius':'radius']*member.slot.scale*(role==='stem'?2.6:.92),shape:[[box.x,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h],[box.x,box.y+box.h]],reserves:reserved.get(role)??[]});}
  }
  // Substrate wood shares the design camera and the members' depth offsets,
  // so its lines are hidden by nearer shelves exactly like member lines.
  // It belongs to the resting colony (orbit rest pair); fictional morph
  // frames and field-study pairs keep their established geometry.
  const habitat=pair.orbitRest&&pair.composition?.substrate?buildHabitSubstrate(pair.composition,pair.a,[]):null;
  if(habitat){
    const wood=[];for(const mark of habitat.ink)for(const [part,points] of visibility.fragments(mark.points).entries())wood.push({...mark,id:`habitat:${wood.length}:${part}`,points,exclude:[]});
    const shield=habitat.front.shapes,members=shield.length?ink.map(mark=>({...mark,exclude:[...(mark.exclude??[]),...shield]})):ink.slice();
    ink.length=0;ink.push(...wood,...members,...habitat.front.ink);
  }
  return {ink,bodies,washes:[],surfaceFaces,surfacePassages,detailPassages,
    // Basal rings are the support geometry even when a tilted cap projects
    // below its stipe. Pass these separately from paint/occlusion polygons.
    supportShapes:inkOnly?[]:members.map(member=>Array.from({length:49},(_,i)=>member.chart.project(member.chart.stem(i/48*CA_TAU,0)).slice(0,2))),individuals:dimensions,specimenCount:members.length,composition:pair.composition,
    morphology:{grammar:t===0?pair.a.phenotype.grammar:t===1?pair.b.phenotype.grammar:'fictional-connected-intermediate'},fictional:t>0&&t<1,connectedAnatomy:true,
    dimensions,diagnostics:inkOnly?[]:members.map(member=>({memberId:member.slot.id,...member.mesh,unclippedPaths:member.paths.length,fullPathMin:Math.min(...member.paths.filter(mark=>mark.role==='folds').map(mark=>caLength(mark.points))),sharedContactError:Math.max(...Array.from({length:member.mesh.rings},(_,i)=>{const theta=i/member.mesh.rings*CA_TAU,a=member.chart.lower(theta,0),b=member.chart.stem(theta,1);return Math.hypot(...a.map((v,k)=>v-b[k]));}))}))};
}
// Native material adapter. The worker must consume this plan at both endpoints
// as well as intermediate values; returning to a legacy endpoint constructor
// would reintroduce the rejected geometry/detail jump.
function caClipHalfPlane(points,a,b,c){
  if(!points.length)return [];const result=[];let before=points.at(-1),dBefore=a*before[0]+b*before[1]+c;
  for(const point of points){const d=a*point[0]+b*point[1]+c;
    if((d>=0)!==(dBefore>=0)){const t=dBefore/(dBefore-d);result.push([caMix(before[0],point[0],t),caMix(before[1],point[1],t)]);}
    if(d>=0)result.push(point);before=point;dBefore=d;
  }return result;
}
const caPolygonArea=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))*.5;
function caSubtractConvex(points,occluder){
  const outside=[];let inside=points;
  for(let i=0;i<occluder.length&&inside.length>2;i++){
    const p=occluder[i],q=occluder[(i+1)%occluder.length],a=p[1]-q[1],b=q[0]-p[0],c=-a*p[0]-b*p[1];
    const piece=caClipHalfPlane(inside,-a,-b,-c);if(piece.length>2&&caPolygonArea(piece)>.005)outside.push(piece);
    inside=caClipHalfPlane(inside,a,b,c);
  }
  return inside.length<3||caPolygonArea(inside)<.005?[points]:outside;
}
// Exact projected depth clipping runs only for a settled paint plan. This
// removes nearer tissue from wash masks rather than relying on opaque paint.
export function resolveConnectedWashRegions(surface){
  const size=32,W=38,H=32,bins=Array.from({length:W*H},()=>[]),triangles=[];
  surface.members.forEach((member,individual)=>{for(const face of member.faces)if(face.visible)for(let j=1;j<face.projected.length-1;j++){
    const p=[face.projected[0],face.projected[j],face.projected[j+1]],[[ax,ay,az],[bx,by,bz],[cx,cy,cz]]=p;
    const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<.001)continue;
    const ua=(by-cy)/den,ub=(cx-bx)/den,uc=-ua*cx-ub*cy,va=(cy-ay)/den,vb=(ax-cx)/den,vc=-va*cx-vb*cy;
    const plane=[ua*(az-cz)+va*(bz-cz),ub*(az-cz)+vb*(bz-cz),uc*(az-cz)+vc*(bz-cz)+cz],points=p.map(p=>p.slice(0,2)),box=caBox(points);
    const item={id:triangles.length,points,plane,box,individual,role:face.role==='margin'?'cap':face.role};triangles.push(item);
    const x0=Math.max(0,Math.floor(box.x/size)),x1=Math.min(W-1,Math.floor((box.x+box.w)/size)),y0=Math.max(0,Math.floor(box.y/size)),y1=Math.min(H-1,Math.floor((box.y+box.h)/size));
    item.cells=[];for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const key=y*W+x;bins[key].push(item);item.cells.push(key);}
  }});
  const groups=new Map();
  for(const triangle of triangles){
    let pieces=[triangle.points];const candidates=new Set(triangle.cells.flatMap(key=>bins[key]));
    for(const other of candidates){
      if(!pieces.length)break;if(other===triangle||other.individual===triangle.individual&&other.role===triangle.role)continue;
      if(other.box.x>=triangle.box.x+triangle.box.w||other.box.x+other.box.w<=triangle.box.x||other.box.y>=triangle.box.y+triangle.box.h||other.box.y+other.box.h<=triangle.box.y)continue;
      const closer=caClipHalfPlane(other.points,triangle.plane[0]-other.plane[0],triangle.plane[1]-other.plane[1],triangle.plane[2]-other.plane[2]-.01);
      if(closer.length>2&&caPolygonArea(closer)>.005)pieces=pieces.flatMap(piece=>caSubtractConvex(piece,closer));
    }
    const key=`${triangle.individual}:${triangle.role}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(...pieces);
  }
  return groups;
}
// Colour per anatomical part (cap cuticle, gills or pores, stipe, veil, wood)
// comes from each endpoint's type recipe; a morph mixes the two plans.
function caCovers(points,width,islands){
  const half=width*.5,near=q=>{let best=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy||1,u=caClamp(((q[0]-a[0])*dx+(q[1]-a[1])*dy)/l);best=Math.min(best,Math.hypot(a[0]+dx*u-q[0],a[1]+dy*u-q[1]));}return best;};
  for(const island of islands)for(const q of island)if(near(q)>half*.85)return false;return true;
}
function caMixColour(planA,planB,role,t){
  const a=planA[role]??planA.cap,b=planB[role]??planB.cap,keys=[...new Set([...Object.keys(a.palette),...Object.keys(b.palette)])];
  return {palette:Object.fromEntries(keys.map(key=>[key,caMix(a.palette[key]??0,b.palette[key]??0,t)])),load:caMix(a.load,b.load,t)};
}
export function buildConnectedAnatomyPaintPlan(pair,t,{paletteA={ochre:.55,umber:.45},paletteB={ochre:.75,sienna:.25}}={}){
  const sketch=buildConnectedAnatomy(pair,t),regions=resolveConnectedWashRegions(buildConnectedAnatomySurface(pair,t)),a=pair.a.values,b=pair.b.values,v=a.map((x,i)=>caMix(x,b[i],t));
  const palette=Object.fromEntries([...new Set([...Object.keys(paletteA),...Object.keys(paletteB)])].map(key=>[key,caMix(paletteA[key]??0,paletteB[key]??0,t)]));
  const body3d=!!sketch.dimensions[0]?.body3d,planA=caColourPlan(pair.a),planB=caColourPlan(pair.b);
  // Cantharellus cibarius (refs-lib): egg-yellow throughout, the stipe only
  // a little paler than the cap, not a cream cap on a grey stem.
  const eggOf=g=>g?.profileId==='chanterelle-1'&&!g.donorId?1:0,egg=caMix(eggOf(pair.a),eggOf(pair.b),t);
  const flatColour=role=>({palette:role==='stem'?{ochre:.34,umber:.28,paynes:.38}:palette,load:((role==='stem'?.045:role==='underside'?.065:.10)+v[21]*.08)*(pair.orbitRest&&role==='cap'?1.6:1)});
  const eggColour=(role,c)=>egg?{palette:role==='stem'?Object.fromEntries([...new Set([...Object.keys(c.palette),...Object.keys(palette)])].map(k=>[k,caMix(c.palette[k]??0,(palette[k]??0)*.9,egg)])):c.palette,load:c.load*(1+egg*(role==='cap'?.9:role==='underside'?.8:1.2))}:c;
  const colour=role=>body3d?caMixColour(planA,planB,role,t):eggColour(role,flatColour(role));
  const darker=(palette,extra)=>Object.fromEntries(Object.entries({...palette,...Object.fromEntries(Object.entries(extra).map(([k,x])=>[k,(palette[k]??0)+x]))}));
  const washes=sketch.bodies.filter(body=>(regions.get(`${body.individual}:${body.role}`)??[]).length).map(body=>{
    const box=caBox(body.islands.flat()),p=sketch.dimensions[body.individual],{palette,load}=colour(body.role);
    // The brush follows the form's axis when that reaches every visible facet;
    // branching or tall bodies (coral, heads, sacs) get a wash across the box.
    const reach=body.basePoints&&caCovers(body.basePoints,body.baseWidth,body.islands);
    return {...body,islands:regions.get(`${body.individual}:${body.role}`)??[],points:reach||!body3d&&body.basePoints?body.basePoints:[[box.x-2,box.y+box.h*.5],[box.x+box.w+2,box.y+box.h*.5]],width:reach||!body3d&&body.basePoints?body.baseWidth:body3d?box.h*1.15+8:box.h*2+8,
      palette,load:body3d?load*(.92+.16*v[21]):load,phase:p.phase,
      granulation:v[25],wetness:v[26],pooling:v[27],softness:v[28],variation:v[29]};
  });
  for(const passage of sketch.surfacePassages){
    const role=passage.role==='stem-shadow'?'stem':'cap',body=sketch.bodies.find(body=>body.individual===passage.individual&&body.role===role),part=colour(role);
    if(body&&(regions.get(`${body.individual}:${body.role}`)??[]).length)washes.push({...body,...passage,islands:regions.get(`${body.individual}:${body.role}`)??[],palette:body3d?darker(part.palette,role==='stem'?{umber:.2,paynes:.15}:{umber:.25}):{...palette,umber:(palette.umber??0)+.25},load:role==='stem'?.045:body3d?Math.max(.065,part.load*.22):.065,
      phase:sketch.dimensions[passage.individual].phase,granulation:v[25],wetness:caClamp(v[26]*.65),pooling:v[27],softness:v[28],variation:v[29]});
  }
  // Anatomical glazes: pit floors, growth zones, an umbo, a deliquescing margin.
  for(const passage of sketch.detailPassages??[]){
    const box=caBox(passage.islands.flat()),{palette,load}=colour(passage.role);
    // Pit floors are crisp, dark and edge-pooled; zones and glazes stay soft.
    const crisp=passage.role==='pit-shadow';
    washes.push({role:passage.role,individual:passage.individual,memberId:passage.memberId,islands:passage.islands,reserves:[],shape:[[box.x,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h],[box.x,box.y+box.h]],
      points:[[box.x-2,box.y+box.h*.5],[box.x+box.w+2,box.y+box.h*.5]],width:box.h*2.2+8,palette,load,phase:sketch.dimensions[passage.individual].phase,
      granulation:crisp?.15:v[25],wetness:crisp?.12:caClamp(v[26]*.6),pooling:crisp?.9:v[27],softness:crisp?.05:v[28],variation:v[29]});
  }
  return {...sketch,washes,scene:'plain',annotations:t>0&&t<1?[{text:'FICTIONAL CONNECTED FORM',x:600,y:876}]:[]};
}

export const CONNECTED_MORPH_GRAMMARS=Object.freeze(['oyster','chanterelle']);
// A resting specimen (blend at an endpoint) is always drawn from its genuine
// 3D body, so direct orbit works for every catalog type and every hybrid.
// frame: the page frame of the catalog drawing this body replaces, so the
// turned body is framed exactly like the drawing it was fitted to.
const caOwnFrames=new WeakMap();
export function createOrbitRestPair(genome,composition=createSpecimenComposition(genome),options={},{frame=null,scene='plain'}={}){
  const {pageFrame:_carried,...bare}=composition;
  const pair={...createConnectedAnatomyPair(genome,genome,bare,{...options,body3d:true,habit:true}),sameRecipe:true,supportedMotion:true,orbitRest:true};
  // A body that fits its own page is framed once, at the default camera, and
  // that frame is kept for every turn: no per-frame refit and no zoom pumping.
  let held=frame??_carried?.a;
  if(bare.ownFrame){const cached=caOwnFrames.get(composition)??{};held=cached[scene];
    if(!held){const ref={...createConnectedAnatomyPair(genome,genome,bare,{view:{yaw:.12,pitch:.36,body3d:true},body3d:true}),sameRecipe:true,supportedMotion:true,orbitRest:true};held=fitPageFrame(pageEndpointBounds(ref,0,scene));caOwnFrames.set(composition,{...cached,[scene]:held});}}
  if(held)pair.composition={...bare,pageFrame:Object.freeze({version:1,key:pageFrameKey(pair,scene),scene,aId:pageEndpointId(pair,0,scene),bId:pageEndpointId(pair,1,scene),a:held,b:held})};
  return pair;
}
// Place each turnable body where the catalog drawing put that specimen, at a
// matching size, so the switch from drawing to 3D body keeps the layout.
function caBodyExtent(p){
  const {worldVertices}=caMemberChart(p,{id:'extent',x:0,y:0,scale:1,rotation:0},{yaw:0,pitch:0},{inkOnly:true,interactive:true});
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity,z0=Infinity,z1=-Infinity;
  for(const [x,y,z] of worldVertices){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);z0=Math.min(z0,z);z1=Math.max(z1,z);}
  return {tall:Math.max(1,z1-Math.min(0,z0)),wide:Math.max(1,x1-x0,(y1-y0)*.85)};
}
// Projected extent of a body at the default orbit camera, foot at the origin
// and unit scale: box width, height, centre x and bottom y.
function caDefaultExtent(p,view,genome){
  const camera={yaw:DEFAULT_ORBIT_VIEW.yaw,pitch:caBodyPitch(DEFAULT_ORBIT_VIEW.pitch,genome)};
  const {vertices,faces}=caMemberChart(p,{id:'extent',x:0,y:0,scale:1,...view},camera,{inkOnly:true,interactive:true});
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const [x,y] of vertices){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  return {w:Math.max(1,x1-x0),h:Math.max(1,y1-y0),cx:(x0+x1)/2,bottom:y1,outline:faces.filter(f=>f.visible).map(f=>f.indices.map(i=>vertices[i]))};
}
// Overlap (intersection over union) of two sets of plate polygons on a 4 px grid.
function caOutlineAgreement(a,b){
  const pts=[...a,...b].flat(),box=implicitBoxOf([pts]);if(!Number.isFinite(box.x))return 0;
  const g={x:box.x-4,y:box.y-4,step:4,width:Math.ceil(box.w/4)+3,height:Math.ceil(box.h/4)+3},A=new Uint8Array(g.width*g.height),B=new Uint8Array(A.length);
  for(const poly of a)implicitFillPolygon(A,poly,g);for(const poly of b)implicitFillPolygon(B,poly,g);
  let i=0,u=0;for(let k=0;k<A.length;k++){i+=A[k]&B[k];u+=A[k]|B[k];}return u?i/u:0;
}
export function orbitRestComposition(genome,composition=null,{habit=false}={}){
  // Follow the plate: its member count, anchors and the figure it drew for
  // each member (implicitEndpointMember). A pair prepared at a turned view
  // carries the native roots of 3D endpoints instead of a blocked layout; the
  // default plate is then rebuilt as the page would draw it. Connected charts
  // (oyster, chanterelle) are drawn at their own slots, so their roots stand.
  const sketch=buildSketch(genome),drawnCount=Math.max(1,Math.min(5,sketch.specimenCount||1)),cache=new WeakMap();
  // A gregarious colony (opt-in habitat) keeps its own placement on its
  // shared substrate; oyster fans, turkey-tail rows, sulphur tiers and
  // honey-fungus tufts are drawn with enough members to read as a colony.
  if(habit){const base=createSpecimenComposition(genome,{count:drawnCount,habit});if(base.habit){const want=habitColonySize(genome,drawnCount);const colony=want===drawnCount?base:createSpecimenComposition(genome,{count:want,habit:true});return {...colony,id:`${colony.id}-habit`};}}
  const chartPlate=['oyster','chanterelle'].includes(genome.phenotype?.grammar)&&!genome.donorId;
  const usable=composition?.implicitAnchors?.length>=1&&composition.implicitAnchors.length<=5&&composition.members?.length===composition.implicitAnchors.length;
  const blocked=usable&&(chartPlate||composition.implicitAnchors.some(a=>a&&'stretch' in a));
  const count=usable?composition.implicitAnchors.length:drawnCount,base=createSpecimenComposition(genome,{count}),ownFrame=usable&&!blocked;
  let plate=blocked?composition:null,ends=null;
  try{if(!plate)plate=implicitAnchoredComposition(genome,{...base,id:composition?.id??base.id},{},cache).composition;ends=plate.members.map((slot,i)=>implicitEndpointMember(genome,i,plate,cache,{}));}catch{plate=null;ends=null;}
  const extra=new Map(),figure=i=>{
    if(i<drawnCount)return {sketch,owner:figureOwner(sketch,drawnCount,count,i,genome.seed)};
    if(!extra.has(i))extra.set(i,buildSketch(individualGenome(genome,i,count)));
    return {sketch:extra.get(i),owner:i%drawnCount};
  };
  const members=base.members.map((member,i)=>{
    const end=ends?.[i];if(!end)return member;
    // The drawn figure on the plate: the endpoint outline at its slot.
    const at=end.slot,drawnOutline=end.polygons.map(poly=>poly.map(([x,y])=>[at.x+x,at.y+y])),box=implicitBoxOf(drawnOutline);
    if(!Number.isFinite(box.x)||box.h<4)return member;
    const {sketch,owner}=figure(i),single=Math.max(1,sketch.specimenCount||1)===1;
    // The body takes its drawing's view and proportions: the drawn elevation
    // as an offset from the family plate pitch, the drawn lean, and the drawn
    // cap rise, stipe length and girth.
    const drawn=chartPlate?null:sketch.views?.[single?0:owner],viewPitch=Number.isFinite(drawn?.pitch)?drawn.pitch-caBodyPitch(DEFAULT_ORBIT_VIEW.pitch,genome):0;
    const shaped={...member,...(drawn&&(Number.isFinite(drawn.rise)||Number.isFinite(drawn.rays))?{drawn:Object.fromEntries(['rise','stem','girth','rays'].filter(k=>Number.isFinite(drawn[k])).map(k=>[k,drawn[k]]))}:{})};
    const p=connectedAnatomyDimensions(genome,shaped,{body3d:true});
    // The plate stretched and sheared each drawn figure about its foot
    // (memberLinear); the body's projection takes the same map.
    const stretch=!end.chart&&Number.isFinite(at.stretch)?at.stretch:1,lean=!end.chart&&Number.isFinite(at.lean)?at.lean:0;
    const view={rotation:Number.isFinite(drawn?.roll)?drawn.roll:0,...(viewPitch?{viewPitch}:{}),...(stretch!==1?{stretch}:{}),...(lean?{lean}:{})};
    // Fit the body as the plate shows it at the default camera: height sets
    // the scale, a remaining width difference widens or narrows the cap (and
    // earthstar rays), and the projected box's bottom centre is placed on the
    // drawn box's bottom centre, so the two outlines register.
    let body=shaped,ext=caDefaultExtent(p,view,genome);
    // A coral's fan opens further than a cap can widen.
    const [lo,hi]=p.coralLevels?[.7,2.2]:[.75,1.33];
    for(let pass=0;pass<(p.coralLevels?4:2);pass++){
      const widen=caClamp((box.w/box.h)/(ext.w/ext.h),lo,hi)*(body.drawn?.widen??1);
      body={...shaped,drawn:{...(shaped.drawn??{}),widen:caClamp(widen,lo,hi)}};
      ext=caDefaultExtent(connectedAnatomyDimensions(genome,body,{body3d:true}),view,genome);
    }
    const foot=[box.x+box.w*.5,box.y+box.h],scale=caClamp(box.h/ext.h,.2,3);
    const fitted={...body,x:foot[0]-scale*ext.cx,y:foot[1]-scale*ext.bottom,scale,...view};
    // A body with parts the drawing does not show (a shelf's log) can agree
    // better by outline when its whole extent stands in the drawn box: keep
    // whichever outline overlaps the drawing more.
    const plainExt=caDefaultExtent(p,view,genome),plainScale=caClamp(Math.min(box.h/plainExt.h,box.w/plainExt.w),.2,3);
    const plain={...shaped,x:foot[0]-plainScale*plainExt.cx,y:foot[1]-plainScale*plainExt.bottom,scale:plainScale,...view};
    const placed=(e,m)=>e.outline.map(poly=>poly.map(v=>[m.x+m.scale*v[0],m.y+m.scale*v[1]]));
    const [chosen,chosenExt]=caOutlineAgreement(placed(plainExt,plain),drawnOutline)>caOutlineAgreement(placed(ext,fitted),drawnOutline)+.02?[plain,plainExt]:[fitted,ext];
    // Register exactly: at the default camera the body's projected box is the
    // drawn figure's box, so the first frame of a drag (and the plate painted
    // after it) keeps the figure's size and place. The factors act about the
    // foot in screen space and hold at every yaw.
    const fitX=caClamp(box.w/(chosen.scale*chosenExt.w),.4,2.5),fitY=caClamp(box.h/(chosen.scale*chosenExt.h),.4,2.5);
    return {...chosen,x:foot[0]-chosen.scale*fitX*chosenExt.cx,y:foot[1]-chosen.scale*fitY*chosenExt.bottom,fitX,fitY};
  });
  return {...base,id:`${base.id}-catalog-fit`,members,catalogFit:true,...(ownFrame?{ownFrame:true}:{})};
}
export function orbitRestStudy(genome,composition,{view,shapeModifiers,scene='plain'}={}){
  const pair=createOrbitRestPair(genome,composition,{view,shapeModifiers},{scene});
  return framePagePlan(connectedPlateStudy(pair,0,{scene}),pair,0,scene);
}
// The untouched default view keeps the rich catalog drawing (base-0 path).
// Any camera or shape change switches the plate to the turnable 3D body.
export const DEFAULT_ORBIT_VIEW=Object.freeze({yaw:.12,pitch:.36,capDepth:1,stemBend:0});
// Colonies that grow from a shared substrate (wood growers, tufts, clumps,
// fairy rings) rest on their 3D colony even at the default view: the 2D
// catalog drawing has no shared substrate or attachment to show.
// One switch: colonies (shelf, perch, clump, ring habits) rest on their 3D
// colony at the default view instead of the 2D catalog drawing. The page reads
// ?colony=0|1; the Worker never needs it (the rest pair carries its own layout).
// Off by default: paired judging scored the catalog drawings above the 3D
// colonies; ?colony=1 with the background on shows the colony at rest.
export let HABIT_COLONY_AT_REST=false;
export function setHabitColonyAtRest(on){HABIT_COLONY_AT_REST=!!on;}
const habitRestMemo=new WeakMap();
// Only lignicolous shelves (brackets, oysters) rest on their 3D colony. Paired
// judging scored the 2D catalog drawings higher for tufts, clumps, rings and
// Hericium; those keep the drawing at rest, with their wood drawn under it.
const HABIT_REST_GRAMMARS=new Set(['bracket','oyster']);
export function habitRestPreferred(genome,scene='plain'){
  if(!HABIT_COLONY_AT_REST||scene==='plain'||!genome?.phenotype||!HABIT_REST_GRAMMARS.has(genome.phenotype.grammar))return false;
  if(!habitRestMemo.has(genome)){let ok=false;try{const count=Math.max(1,Math.min(5,buildSketch(genome).specimenCount||1));ok=!!habitArrangement(genome,count);}catch{ok=false;}habitRestMemo.set(genome,ok);}
  return habitRestMemo.get(genome);
}
export function isDefaultOrbitView(state){return ['yaw','pitch','capDepth','stemBend'].every(key=>Math.abs((state[key]??DEFAULT_ORBIT_VIEW[key])-DEFAULT_ORBIT_VIEW[key])<1e-9);}
export function orbitViewOptions(state){const options=connectedViewOptions(state);return isDefaultOrbitView(state)?options:{...options,view:{...options.view,body3d:true}};}
export function connectedViewOptions(state){
  return {view:{yaw:state.yaw??.12,pitch:state.pitch??.36},shapeModifiers:{capDepth:state.capDepth??1,stemBend:state.stemBend??0}};
}
// Orbit reprojection. The finished painting rides on the turning 3D mesh.
// When a plate finishes painting, each mesh vertex records where it landed on
// the painted bitmap (plate units). While the camera turns, every front-facing
// triangle is drawn from that bitmap with its own affine map, far to near.
// Faces hidden when the plate was painted borrow the mirrored visible side of
// the body, or else a flat tone of their own part. Paper and background stay
// fixed; only the bodies turn. Ink silhouettes of the current view go on top.
export const REPROJECTION_PREVIEW=Object.freeze({width:1200,height:1000});
// How a turning 3D body is shown while dragging: 'lines' draws the mesh as
// clean pen work at device resolution; 'reproject' texture-maps the last
// painting onto the mesh (kept behind this switch, off by default).
export const ORBIT_DRAG_DISPLAY='lines';
// Pen weights for the drag drawing, by mark role: contours, features, hatching.
export const ORBIT_LINES=Object.freeze({contour:Object.freeze({width:1.55,alpha:.86}),feature:Object.freeze({width:.95,alpha:.62}),hatch:Object.freeze({width:.6,alpha:.38}),ink:'#3d3127'});
export function orbitLineClass(role){
  if(/contour|silhouette|ring|veil|rim/.test(role??''))return 'contour';
  if(/fibre|fiber|hatch|stipple|shadow|scale|wart|pit|crack/.test(role??''))return 'hatch';
  return 'feature';
}
export const REPROJECTION=Object.freeze({idStep:2,dilate:7,seam:.6,maxStretch:12,inkWidth:1.15,inkAlpha:.74,paperDistance:21,revealInkEnd:.22,revealWashSpan:.6,fadeMs:320});
export function reprojectionKey(pair,t,scene='plain'){
  const side=g=>[g?.seed??null,g?.profileId??null,g?.donorId??null],c=pair.composition??{};
  return JSON.stringify([side(pair.a),side(pair.b),c.id??null,c.members??null,pair.shapeModifiers??null,clamp(t),scene,pageFrameAt(pagePairFrame(pair,scene),clamp(t)),!!pair.orbitRest]);
}
// The mesh of a 3D pair at any camera, in plate units after the page frame.
// Topology depends only on the body, so vertex and face indices match across views.
export function orbitMeshAt(pair,t,{scene='plain',view=pair.view}={}){
  const v={yaw:caClamp(view?.yaw??.12,-Math.PI,Math.PI),pitch:caClamp(view?.pitch??.36,-.25,1.2)};
  if(![v.yaw,v.pitch,t].every(Number.isFinite))throw new RangeError('Non-finite reprojection view');
  const f=pageFrameAt(pagePairFrame(pair,scene),clamp(t));
  const dimensions=connectedDimensionsAt(pair,caClamp(t)),bodyView=caBodyView(pair,dimensions,v,caClamp(t));
  const members=dimensions.map((p,i)=>caMemberChart(p,pair.composition.members[i],bodyView,{inkOnly:true,interactive:true,meshOnly:true}));
  return {view:v,frame:{scale:f.scale,tx:f.tx,ty:f.ty},members};
}
function reprojectionSpans(tris){const spans=[];for(let i=0;i<tris.length;i++){const last=spans.at(-1);if(last&&tris[last[0]].m===tris[i].m&&tris[last[0]].f===tris[i].f)last[1]++;else spans.push([i,1]);}return spans;}
function reprojectionTriangles(mesh){
  const tris=[];
  mesh.members.forEach((member,m)=>member.faces.forEach((face,f)=>{const ix=face.indices;for(let i=1;i<ix.length-1;i++)tris.push({m,f,a:ix[0],b:ix[i],c:ix[i+1],role:face.role==='margin'?'cap':face.role});}));
  return tris;
}
// Painter's ID buffer at the captured view: the triangle that owns each cell.
function reprojectionIdBuffer(mesh,tris,step){
  const W=Math.ceil(1200/step),H=Math.ceil(1000/step),depth=new Float32Array(W*H).fill(Infinity),id=new Int32Array(W*H).fill(-1),owned=new Uint32Array(tris.length),covered=new Uint32Array(tris.length);
  const {scale:s,tx,ty}=mesh.frame,page=v=>[(v[0]*s+tx)/step,(v[1]*s+ty)/step,v[2]];
  tris.forEach((tri,index)=>{
    if(!mesh.members[tri.m].faces[tri.f].visible)return;
    const vs=mesh.members[tri.m].vertices,a=page(vs[tri.a]),b=page(vs[tri.b]),c=page(vs[tri.c]);
    const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)return;
    const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(W-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(H-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    for(let y=y0;y<=y1;y++){const py=y+.5;for(let x=x0;x<=x1;x++){
      const px=x+.5,u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den,w=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den;
      if(u<0||w<0||u+w>1)continue;const i=y*W+x,z=u*a[2]+w*b[2]+(1-u-w)*c[2];covered[index]++;
      if(z<depth[i]){depth[i]=z;id[i]=index;}
    }}
  });
  for(const index of id)if(index>=0)owned[index]++;
  const at=(x,y)=>{const cx=Math.floor(x/step),cy=Math.floor(y/step);return cx>=0&&cy>=0&&cx<W&&cy<H?cy*W+cx:-1;};
  return {W,H,step,depth,id,owned,covered,at};
}
// Capture geometry: for every triangle, where to sample the painted bitmap
// (plate units), or nothing when no painted surface stands for it.
const REPROJECTION_DONORS=Object.freeze(['mirror',Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,3*Math.PI/4,-3*Math.PI/4,Math.PI]);
export function orbitReprojectionRegistration(mesh,{step=REPROJECTION.idStep,warp=null}={}){
  const tris=reprojectionTriangles(mesh),buffer=reprojectionIdBuffer(mesh,tris,step),{scale:s,tx,ty}=mesh.frame;
  const page=v=>[v[0]*s+tx,v[1]*s+ty],texel=(tri,v)=>warp?warp(tri.m,tri.role,page(v)):page(v),uv=new Float32Array(tris.length*6).fill(NaN),source=new Uint8Array(tris.length),light=new Float32Array(tris.length);
  const tol=step*1.75*Math.max(...mesh.members.map(m=>Math.abs(m.slot.scale)||1));
  const visibleAt=(x,y,z)=>{const i=buffer.at(x,y);return i>=0&&z<=buffer.depth[i]+tol;};
  // A revolved body reflected through the plane of its axis that faces the
  // camera maps a hidden back face onto the matching visible front face.
  const d=[Math.sin(mesh.view.yaw),Math.cos(mesh.view.yaw)];
  const axes=mesh.members.map(member=>{let x=0,y=0;for(const w of member.worldVertices){x+=w[0];y+=w[1];}const n=member.worldVertices.length||1;return [x/n,y/n];});
  tris.forEach((tri,i)=>{
    const member=mesh.members[tri.m],W=[tri.a,tri.b,tri.c].map(j=>member.worldVertices[j]);
    const u=W[1].map((v,k)=>v-W[0][k]),v=W[2].map((v,k)=>v-W[0][k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],norm=Math.hypot(...n)||1;
    light[i]=caClamp(.37+.63*Math.max(0,(-.48*n[0]-.24*n[1]+.843*n[2])/norm));
    const front=member.faces[tri.f].visible,P=[tri.a,tri.b,tri.c].map(j=>member.vertices[j]);
    const own=buffer.covered[i]?buffer.owned[i]/buffer.covered[i]>=.4:(()=>{const c=page([0,1].map(k=>(P[0][k]+P[1][k]+P[2][k])/3));return visibleAt(c[0],c[1],(P[0][2]+P[1][2]+P[2][2])/3);})();
    if(front&&own){P.forEach((p,k)=>uv.set(texel(tri,p),i*6+k*2));source[i]=1;return;}
    // Mirror first; failing that, the nearest turn about the axis that lands
    // on visible tissue of the same part (revolved bodies map onto themselves).
    const axis=axes[tri.m];
    for(const move of REPROJECTION_DONORS){
      const donor=W.map(w=>{const x=w[0]-axis[0],y=w[1]-axis[1];if(move==='mirror'){const dot=x*d[0]+y*d[1];return member.chart.project([w[0]-2*dot*d[0],w[1]-2*dot*d[1],w[2]]);}const ca=Math.cos(move),sa=Math.sin(move);return member.chart.project([axis[0]+x*ca-y*sa,axis[1]+x*sa+y*ca,w[2]]);});
      const c=page([0,1].map(k=>(donor[0][k]+donor[1][k]+donor[2][k])/3)),cell=buffer.at(c[0],c[1]),owner=cell>=0?buffer.id[cell]:-1;
      if(owner<0||tris[owner].m!==tri.m||tris[owner].role!==tri.role||!visibleAt(c[0],c[1],(donor[0][2]+donor[1][2]+donor[2][2])/3))continue;
      donor.forEach((p,k)=>uv.set(texel(tri,p),i*6+k*2));source[i]=2;break;
    }
  });
  return {tris,spans:reprojectionSpans(tris),uv,source,light,fill:new Array(tris.length).fill('#b8a68a'),view:{...mesh.view},frame:{...mesh.frame},triangleCount:tris.length,captured:source.reduce((n,x)=>n+(x===1),0),mirrored:source.reduce((n,x)=>n+(x===2),0)};
}
// The rich catalog drawing is not the 3D body: register each body part's
// projected box at the drawn view onto the box of the matching drawn part
// (cap marks, stem contour, else the whole drawn individual), so the first
// frames of a turn carry the drawing's own cap, stem and colour.
const REPROJECTION_STEM_INK=new Set(['stem-contour']),REPROJECTION_CAP_INK=new Set(['cap-contour','cap-flesh','gills','scales','lamella-shadow','pores','teeth']);
export function drawingRegistrationWarp(mesh,plan){
  if(!plan)return null;
  const boxes=new Map(),grow=(key,x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;const b=boxes.get(key)??[Infinity,Infinity,-Infinity,-Infinity];b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);boxes.set(key,b);};
  for(const mark of plan.ink??[]){if(!Number.isInteger(mark.individual))continue;const group=REPROJECTION_STEM_INK.has(mark.role)?'stem':REPROJECTION_CAP_INK.has(mark.role)?'cap':null;for(const p of mark.points??[]){grow(`d:${mark.individual}:all`,p[0],p[1]);if(group)grow(`d:${mark.individual}:${group}`,p[0],p[1]);}}
  for(const body of plan.bodies??[])if(Number.isInteger(body.individual))for(const island of body.islands??[])for(const p of island)grow(`d:${body.individual}:all`,p[0],p[1]);
  const {scale:s,tx,ty}=mesh.frame,groupOf=role=>role==='stem'?'stem':role==='cap'||role==='underside'?'cap':null;
  mesh.members.forEach((member,m)=>{for(const face of member.faces)if(face.visible){const group=groupOf(face.role==='margin'?'cap':face.role);for(const v of face.projected){const x=v[0]*s+tx,y=v[1]*s+ty;grow(`m:${m}:all`,x,y);if(group)grow(`m:${m}:${group}`,x,y);}}});
  const usable=b=>b&&b[2]-b[0]>2&&b[3]-b[1]>2;
  return (m,role,p)=>{
    const group=groupOf(role);let from=group&&boxes.get(`m:${m}:${group}`),to=group&&boxes.get(`d:${m}:${group}`);
    if(!usable(from)||!usable(to)){from=boxes.get(`m:${m}:all`);to=boxes.get(`d:${m}:all`);}
    if(!usable(from)||!usable(to))return p;
    return [to[0]+(p[0]-from[0])*(to[2]-to[0])/(from[2]-from[0]),to[1]+(p[1]-from[1])*(to[3]-to[1])/(from[3]-from[1])];
  };
}
// Tones from the painting itself: sample(x,y) and paper(x,y) return RGB at a
// plate point. A sample that is just paper is not painted surface; that
// triangle takes its part's mean tone instead of a bare-paper texture.
export function orbitReprojectionTones(registration,sample,paper,{paperDistance=REPROJECTION.paperDistance,paperTest=true}={}){
  const {tris,uv,source,light}=registration,sums=new Map(),add=(key,rgb,w)=>{const e=sums.get(key)??[0,0,0,0];for(let k=0;k<3;k++)e[k]+=rgb[k]*w;e[3]+=w;sums.set(key,e);};
  const nextSource=new Uint8Array(source);
  tris.forEach((tri,i)=>{
    if(!source[i])return;
    const x=(uv[i*6]+uv[i*6+2]+uv[i*6+4])/3,y=(uv[i*6+1]+uv[i*6+3]+uv[i*6+5])/3,rgb=sample(x,y),bare=paper(x,y);
    if(!rgb||!bare){nextSource[i]=0;return;}
    if(paperTest&&Math.abs(rgb[0]-bare[0])+Math.abs(rgb[1]-bare[1])+Math.abs(rgb[2]-bare[2])<paperDistance){nextSource[i]=0;return;}
    if(source[i]!==1)return;
    const area=Math.abs((uv[i*6+2]-uv[i*6])*(uv[i*6+5]-uv[i*6+1])-(uv[i*6+4]-uv[i*6])*(uv[i*6+3]-uv[i*6+1]))/2+.05;
    add(`${tri.m}:${tri.role}`,rgb,area);add(`${tri.m}`,rgb,area);add('all',rgb,area);
  });
  const mean=key=>{const e=sums.get(key);return e&&e[3]>0?e.slice(0,3).map(v=>v/e[3]):null;};
  const fill=tris.map((tri,i)=>{
    const base=mean(`${tri.m}:${tri.role}`)??mean(`${tri.m}`)??mean('all')??[184,166,138],shade=.82+.26*light[i];
    return `rgb(${base.map(v=>Math.round(caClamp(v*shade,0,255))).join(',')})`;
  });
  return {...registration,source:nextSource,fill,tones:Object.fromEntries([...sums.keys()].map(key=>[key,mean(key)]))};
}
// The affine map taking source triangle (u,v) to destination (x,y), as the
// six setTransform arguments, or null when the source is degenerate.
export function triangleAffine(u0,v0,u1,v1,u2,v2,x0,y0,x1,y1,x2,y2){
  const det=(u1-u0)*(v2-v0)-(u2-u0)*(v1-v0);if(!(Math.abs(det)>1e-9))return null;
  const a=((x1-x0)*(v2-v0)-(x2-x0)*(v1-v0))/det,c=((x2-x0)*(u1-u0)-(x1-x0)*(u2-u0))/det;
  const b=((y1-y0)*(v2-v0)-(y2-y0)*(v1-v0))/det,d=((y2-y0)*(u1-u0)-(y1-y0)*(u2-u0))/det;
  return [a,b,c,d,x0-a*u0-c*v0,y0-b*u0-d*v0];
}
// Draw one reprojected frame. background and texture are full-plate images
// (any resolution); width × height is the target raster.
export function drawOrbitReprojection(ctx,registration,mesh,{width,height,texture,background,ink=true}){
  const kx=width/1200,ky=height/1000,{scale:s,tx,ty}=mesh.frame,{tris,uv,source,fill}=registration,tsx=texture.width/1200,tsy=texture.height/1000,seam=REPROJECTION.seam;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='low';
  const clock=()=>globalThis.performance?.now?.()??0,t0=clock();ctx.drawImage(background,0,0,width,height);const t1=clock();
  // One clip and one image draw per mesh face when its captured triangles
  // share a source; a face's own affine is exact at three corners and close
  // at the fourth. Other faces go triangle by triangle.
  const spans=registration.spans??reprojectionSpans(tris),order=[];
  for(const [first,count] of spans){const tri=tris[first],member=mesh.members[tri.m];if(!member?.faces[tri.f]?.visible)continue;const ix=member.faces[tri.f].indices;let z=0;for(const j of ix)z+=member.vertices[j][2];order.push([first,count,z/ix.length]);}
  order.sort((p,q)=>q[2]-p[2]);
  let textured=0,filled=0;
  const affineOf=(i,P)=>{
    if(!source[i])return null;
    const U=[0,1,2].map(k=>[uv[i*6+k*2]*tsx,uv[i*6+k*2+1]*tsy]),map=triangleAffine(U[0][0],U[0][1],U[1][0],U[1][1],U[2][0],U[2][1],P[0][0],P[0][1],P[1][0],P[1][1],P[2][0],P[2][1]);
    return map&&Math.abs(map[0]*map[3]-map[1]*map[2])*tsx*tsy/(kx*ky)<=REPROJECTION.maxStretch?map:null;
  };
  const outline=points=>{let cx=0,cy=0;for(const p of points){cx+=p[0];cy+=p[1];}cx/=points.length;cy/=points.length;ctx.beginPath();points.forEach(([x,y],k)=>{const r=Math.hypot(x-cx,y-cy)||1,ex=x+(x-cx)*seam/r,ey=y+(y-cy)*seam/r;if(k)ctx.lineTo(ex,ey);else ctx.moveTo(ex,ey);});ctx.closePath();};
  const at=(m,j)=>{const v=mesh.members[m].vertices[j];return [(v[0]*s+tx)*kx,(v[1]*s+ty)*ky];};
  // Only the texels a face can reach are handed to drawImage (its uv box plus
  // a margin), which keeps each clipped draw small for a software rasterizer.
  const texels=(first,count,map)=>{
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(let i=first;i<first+count;i++)for(let k=0;k<3;k++){const x=uv[i*6+k*2]*tsx,y=uv[i*6+k*2+1]*tsy;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
    const margin=3+Math.max(Math.hypot(map[0],map[1]),Math.hypot(map[2],map[3]))**-1*2;
    x0=Math.max(0,Math.floor(x0-margin));y0=Math.max(0,Math.floor(y0-margin));x1=Math.min(texture.width,Math.ceil(x1+margin));y1=Math.min(texture.height,Math.ceil(y1+margin));
    if(x1>x0&&y1>y0)ctx.drawImage(texture,x0,y0,x1-x0,y1-y0,x0,y0,x1-x0,y1-y0);
  };
  for(const [first,count] of order){
    const tri=tris[first],face=mesh.members[tri.m].faces[tri.f];
    let shared=true;for(let i=first;i<first+count;i++)if(source[i]!==1){shared=false;break;}
    const firstMap=shared?affineOf(first,[at(tri.m,tri.a),at(tri.m,tri.b),at(tri.m,tri.c)]):null;
    if(firstMap){outline(face.indices.map(j=>at(tri.m,j)));ctx.save();ctx.clip();ctx.setTransform(...firstMap);texels(first,count,firstMap);ctx.restore();textured+=count;continue;}
    for(let i=first;i<first+count;i++){
      const t=tris[i],P=[at(t.m,t.a),at(t.m,t.b),at(t.m,t.c)],map=affineOf(i,P);outline(P);
      if(map){ctx.save();ctx.clip();ctx.setTransform(...map);texels(i,1,map);ctx.restore();textured++;}
      else{ctx.fillStyle=fill[i];ctx.fill();filled++;}
    }
  }
  let inkSegments=0;const t2=clock();
  if(ink){
    const visibility=connectedPreviewVisibility(mesh.members);
    ctx.setTransform(kx*s,0,0,ky*s,kx*tx,ky*ty);ctx.globalAlpha=REPROJECTION.inkAlpha;ctx.strokeStyle='#3d3127';ctx.lineWidth=REPROJECTION.inkWidth/s;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    for(const member of mesh.members)for(const chain of member.chains)for(const part of visibility.fragments(chain)){ctx.moveTo(part[0][0],part[0][1]);for(let k=1;k<part.length;k++)ctx.lineTo(part[k][0],part[k][1]);inkSegments+=part.length-1;}
    ctx.stroke();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
  }
  return {textured,filled,inkSegments,faces:order.length,backgroundMs:t1-t0,surfaceMs:t2-t1,inkMs:clock()-t2};
}
// Everything except the bodies stays put while they turn: the painting with
// the captured bodies' footprint (mesh, drawing bodies and their ink, dilated)
// returned to bare paper.
export function reprojectionFootprint(mesh,plan=null){
  const {scale:s,tx,ty}=mesh.frame,polygons=[],strokes=[];
  // A drawing's own bodies and ink mark what was painted; the 3D mesh at the
  // drawn view can overrun them (into the caption) and is not used then.
  if(!plan)for(const member of mesh.members)for(const face of member.faces)if(face.visible)polygons.push(face.projected.map(v=>[v[0]*s+tx,v[1]*s+ty]));
  for(const body of plan?.bodies??[])if(body.studyRole!=='spore-deposit')for(const island of body.islands??[body.shape])if(island?.length>2)polygons.push(island);
  for(const mark of plan?.ink??[])if(Number.isInteger(mark.individual)&&mark.points?.length>1)strokes.push(mark.points);
  return {polygons,strokes};
}
export function paintReprojectionBackground(ctx,{painted,paper,footprint,width,height,dilate=REPROJECTION.dilate}){
  const k=width/1200,ky=height/1000;
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,width,height);ctx.drawImage(painted,0,0,width,height);
  ctx.setTransform(k,0,0,ky,0,0);ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';ctx.strokeStyle='#000';ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=dilate*2;
  ctx.beginPath();for(const poly of footprint.polygons){ctx.moveTo(poly[0][0],poly[0][1]);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i][0],poly[i][1]);ctx.closePath();}
  ctx.fill('nonzero');ctx.stroke();
  ctx.beginPath();for(const line of footprint.strokes){ctx.moveTo(line[0][0],line[0][1]);for(let i=1;i<line.length;i++)ctx.lineTo(line[i][0],line[i][1]);}ctx.stroke();
  ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='destination-over';ctx.drawImage(paper,0,0,width,height);ctx.globalCompositeOperation='source-over';
}
// Release: the native repaint of the new view arrives over the reprojected
// image of that same view. Native ink lands on it at full weight; as the
// washes advance the reprojection recedes; the final frame is native only.
export function revealWeight(progress,complete=false){
  if(complete||!Number.isFinite(progress))return 0;
  if(progress<=REPROJECTION.revealInkEnd)return 1;
  return clamp(1-(progress-REPROJECTION.revealInkEnd)/REPROJECTION.revealWashSpan);
}
export function composeReveal(ctx,frame,base,weight,{width,height}){
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';
  ctx.drawImage(frame,0,0,width,height);
  if(weight>0){ctx.globalCompositeOperation='darken';ctx.globalAlpha=clamp(weight);ctx.drawImage(base,0,0,width,height);}
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
}
function connectedPlateStudy(pair,t,{scene='plain'}={}){
  const plan=buildConnectedAnatomyPaintPlan(pair,t,{paletteA:TYPE_PALETTES[pair.a.phenotype.palette],paletteB:TYPE_PALETTES[pair.b.phenotype.palette]});
  // Wood under a lignicolous colony is part of the specimen plate; the
  // habitat vignette is optional and lies behind both.
  const genome=morphGenome(pair,t),masks=plan.bodies.flatMap(body=>body.islands),wood=pair.orbitRest?buildHabitSubstrate(pair.composition,genome,masks):null;
  // The wood's ink (and a tuft's fused base) is already in the anatomy ink,
  // depth-tested against the members; add its washes here.
  const woodPaint=wood?{ink:[],washes:wood.washes,front:{ink:[],washes:wood.front.washes,shapes:wood.front.shapes,inkShielded:true}}:
    // A free-standing chart (the oyster's rest drawing) gets its wood behind
    // it in the habitat view.
    scene!=='plain'&&!pair.orbitRest&&(t===0||t===1)?buildStudySubstrate(genome,{},masks):null;
  const behind=!wood&&woodPaint?woodPaint:null,background=scene!=='plain'?buildBackgroundStudy(genome,scene,wood?[...masks,...wood.masks]:behind?[...masks,...behind.masks]:masks,{supportShapes:plan.supportShapes,substrate:wood?.ground,view:pair.view}):null;
  return {...mergeHabitatLayers(plan,[background,woodPaint]),scene};
}
// Prototype: 2D signed-distance transport of procedural body and ink.
// No raster paint, alpha blend, unmatched-part collapse or biological claim.
const implicitBoxOf=paths=>{let x=Infinity,y=Infinity,r=-Infinity,b=-Infinity;for(const path of paths)for(const p of path){x=Math.min(x,p[0]);y=Math.min(y,p[1]);r=Math.max(r,p[0]);b=Math.max(b,p[1]);}return {x,y,w:r-x,h:b-y};};
const implicitIgnored=/ground|habitat|bark|wood|section|cap-turn|cap-glaze|stem-shadow|fissure/;
function implicitEndpointMember(genome,index,composition,cache,options={}){
  // Every endpoint is its own 3D body, so a resting plate and the first
  // morph frame share one drawing and one placement.
  const chart=options.view?.body3d?CONNECTED_BODY_GRAMMARS.includes(genome.phenotype?.grammar):['oyster','chanterelle'].includes(genome.phenotype?.grammar)&&!genome.donorId;
  let entry=cache.get(genome);
  if(!entry){
    if(chart){const pair=createConnectedAnatomyPair(genome,genome,composition,options);const full=buildConnectedAnatomyPaintPlan(pair,0,{paletteA:seedShadePalette(genome.profileId,TYPE_PALETTES[genome.phenotype.palette],genome.values),paletteB:seedShadePalette(genome.profileId,TYPE_PALETTES[genome.phenotype.palette],genome.values)});entry={sketch:full,full,slots:typeof connectedCompositionAt==='function'?connectedCompositionAt(pair,0):pair.composition.members};}
    else entry={sketch:buildSketch(genome),full:buildStudy(genome)};
    cache.set(genome,entry);
  }
  let {sketch,full}=entry,count=Math.max(1,full.specimenCount||1);
  if(index>=count){genome=extraMemberGenome(individualGenome(genome,index,composition.members.length),index);sketch=buildSketch(genome);full=buildStudy(genome);}
  const owner=figureOwner(sketch,count,composition.members.length,index,genome.seed),owned=mark=>mark.individual===owner||count===1&&!Number.isInteger(mark.individual);
  let bodies=(full.washes??sketch.bodies).filter(mark=>owned(mark)&&!implicitIgnored.test(mark.role??''));
  if(!bodies.length)bodies=(full.washes??sketch.bodies).filter(mark=>!implicitIgnored.test(mark.role??''));
  const raw=bodies.flatMap(mark=>mark.islands??[mark.shape]).filter(p=>p?.length>2),box=implicitBoxOf(raw);
  if(!Number.isFinite(box.x))throw new Error(`Missing endpoint body: ${genome.profileId}/${owner}`);
  const slot=entry.slots?.[index]??composition.members[index],root=chart?[slot.x,slot.y]:[box.x+box.w*.5,box.y+box.h],scale=chart?1:(composition.implicitAnchors?slot.scale:1);
  const L=memberLinear(chart?null:composition.implicitAnchors?slot:null,scale);
  const point=p=>{const x=p[0]-root[0],y=p[1]-root[1];return[L.a*x+L.b*y,L.c*x+L.d*y];};
  const polygons=raw.map(path=>path.map(point));
  const ink=nativeInkSelection(full.ink).filter(mark=>owned(mark)&&!implicitIgnored.test(mark.role??'')&&mark.points?.length>1).map(mark=>({nativeSelected:true,role:mark.role,opacity:mark.opacity,phase:mark.phase,points:mark.points.map(point),width:Math.max(.1,(mark.width??.6)*scale)}));
  if(!ink.length)for(const poly of polygons)ink.push({points:[...poly,poly[0]],width:.5,opacity:.7,phase:0});
  const foreign=new Set(full.washes.filter(mark=>Number.isInteger(mark.individual)&&mark.individual!==owner).flatMap(mark=>[mark.shape,...(mark.islands??[])]));
  const retain=mark=>{const copy={...mark};for(const key of ['exclude','hiddenBy','reserves'])if(mark[key])copy[key]=mark[key].filter(shape=>!foreign.has(shape));return copy;};
  const exterior=/ground|habitat|bark|wood|section/;const nativePlan={...full,ink:full.ink.filter(mark=>owned(mark)&&!exterior.test(mark.role??'')).map(retain),washes:full.washes.filter(mark=>owned(mark)&&!exterior.test(mark.role??'')).map(retain),annotations:[]};
  return {polygons,ink,box:implicitBoxOf(polygons),slot,nativeRoot:root,localScale:scale,nativePlan,profileId:genome.profileId,seed:genome.seed,chart};
}
function implicitGridFor(a,b,step=3){
  const box=implicitBoxOf([...a.polygons,...b.polygons]),pad=step*24,x=Math.floor((box.x-pad)/step)*step,y=Math.floor((box.y-pad)/step)*step;
  const width=Math.ceil((box.x+box.w+pad-x)/step)+1,height=Math.ceil((box.y+box.h+pad-y)/step)+1;
  if(width*height>260000)throw new RangeError('Member field exceeds bounded grid');
  return {x,y,step,width,height,cells:width*height};
}
function implicitFillPolygon(mask,poly,g){
 const pts=poly.map(([x,y])=>[(x-g.x)/g.step,(y-g.y)/g.step]);
 const min=Math.max(0,Math.ceil(Math.min(...pts.map(p=>p[1])))),max=Math.min(g.height-1,Math.floor(Math.max(...pts.map(p=>p[1]))));
 for(let y=min;y<=max;y++){
  const cuts=[];for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[j],b=pts[i];if((a[1]>y)!==(b[1]>y))cuts.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
  cuts.sort((a,b)=>a-b);for(let k=0;k+1<cuts.length;k+=2){const start=Math.max(0,Math.ceil(cuts[k])),end=Math.min(g.width-1,Math.floor(cuts[k+1]));for(let x=start;x<=end;x++)mask[y*g.width+x]=1;}
 }
}
function implicitNearestField(mask,g,invert=false){
 const {width:w,height:h,cells:n}=g,dist=new Float32Array(n),nearest=new Int32Array(n),tmp=new Float32Array(n),tmpNear=new Int32Array(n);
 const length=Math.max(w,h),f=new Float64Array(length),z=new Float64Array(length+1),v=new Int32Array(length),d=new Float64Array(length),arg=new Int32Array(length),INF=1e12;
 const transform=size=>{let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;for(let q=1;q<size;q++){let s;do{const p=v[k];s=((f[q]+q*q)-(f[p]+p*p))/(2*(q-p));if(s<=z[k])k--;else break;}while(k>=0);if(k<0){k=0;v[0]=q;z[0]=-Infinity;z[1]=Infinity;}else{k++;v[k]=q;z[k]=s;z[k+1]=Infinity;}}k=0;for(let q=0;q<size;q++){while(z[k+1]<q)k++;const p=v[k];d[q]=(q-p)*(q-p)+f[p];arg[q]=p;}};
 for(let y=0;y<h;y++){for(let x=0;x<w;x++)f[x]=(!!mask[y*w+x]!==invert)?0:INF;transform(w);for(let x=0;x<w;x++){tmp[y*w+x]=d[x];tmpNear[y*w+x]=y*w+arg[x];}}
 for(let x=0;x<w;x++){for(let y=0;y<h;y++)f[y]=tmp[y*w+x];transform(h);for(let y=0;y<h;y++){dist[y*w+x]=Math.sqrt(d[y])*g.step;nearest[y*w+x]=tmpNear[arg[y]*w+x];}}
 return {dist,nearest};
}
function implicitEndpointFields(endpoint,g){
 const mask=new Uint8Array(g.cells);for(const p of endpoint.polygons){implicitFillPolygon(mask,p,g);
  // Conservative boundary coverage retains thin coral branches even when no
  // grid centre lies inside their narrow tube. The maximum envelope is one cell.
  for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/(g.step*.4)));for(let j=0;j<=steps;j++){const t=j/steps,x=Math.round((mix(a[0],b[0],t)-g.x)/g.step),y=Math.round((mix(a[1],b[1],t)-g.y)/g.step);if(x>=0&&y>=0&&x<g.width&&y<g.height)mask[y*g.width+x]=1;}}
 }
 const inside=implicitNearestField(mask,g),outside=implicitNearestField(mask,g,true),body=new Float32Array(g.cells);let bodyArea=0,softBodyArea=0;
 for(let i=0;i<g.cells;i++){body[i]=mask[i]?-outside.dist[i]:inside.dist[i];bodyArea+=mask[i];softBodyArea+=clamp(.5-body[i]/(2*g.step));}
 if(!bodyArea)throw new Error(`Empty signed-distance endpoint: ${endpoint.profileId}`);
 return {body,bodyArea,softBodyArea,nearest:inside.nearest};
}
// Morph preview wash. A cheap, deterministic stand-in for the native wash:
// the endpoint's own wash marks (shapes, palettes, loads, reserves) layered
// through Kubelka–Munk reflectance with a soft light model. It only colours
// the moving preview; the settled plate always comes from native physics.
const PREVIEW_WASH_LEVELS=48,PREVIEW_WASH_MAX=2.2,PREVIEW_WASH_GAIN=.42,previewLutCache=new Map();
// Coloured morph preview wash. Re-enabled: each sampled frame now owns its
// wash field (it aliased a scratch buffer before, the ghost-wash bug).
export const PREVIEW_FIELD_WASH=true;
export function previewWashLut(palette){
  const key=JSON.stringify(palette??null);let lut=previewLutCache.get(key);if(lut)return lut;
  const entries=Object.entries(palette??{}).filter(([k,w])=>BY_KEY[k]&&w>0),sum=entries.reduce((n,[,w])=>n+w,0);
  lut=new Float32Array(PREVIEW_WASH_LEVELS*3).fill(1);
  if(sum>0)for(let c=0;c<3;c++){
    let K=0,S=0;for(const [k,w] of entries){K+=BY_KEY[k].K[c]*w/sum;S+=BY_KEY[k].S[c]*w/sum;}
    for(let j=0;j<PREVIEW_WASH_LEVELS;j++){const [r,t]=layerRT(K,S,j/(PREVIEW_WASH_LEVELS-1)*PREVIEW_WASH_MAX);lut[j*3+c]=clamp(r+t*t/(1-r));}
  }
  if(previewLutCache.size>256)previewLutCache.delete(previewLutCache.keys().next().value);
  previewLutCache.set(key,lut);return lut;
}
// Pigment amount at (u,v) of a wash bounding box, calibrated against the
// mean colour of settled native plates.
export function previewWashAmount(mark,u,v){
  // Native passages lay each region in fairly evenly and let glazes carry
  // the form, so one soft light model serves every role; glaze and shadow
  // passages darken the lower and right side as they do on the plate.
  const nx=(u-.5)*1.7,ny=(v-.5)*1.4,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny)),light=clamp(-.45*nx-.65*ny+.6*nz),role=mark.role??'';
  let model=.62+.55*(1-light);
  if(/glaze|shadow|turn/.test(role))model=.25+1.1*clamp(u*.6+v*.7-.25);
  return clamp((mark.load??.3)*model*PREVIEW_WASH_GAIN,0,PREVIEW_WASH_MAX);
}
const previewWashSkip=/ground|habitat|bark|wood|section/;
// Per-cell wash colour of one endpoint member on its morph grid (RGB bytes).
// Cells outside the body take their nearest body colour, so a moving
// contour never samples bare paper and colour is carried with the form.
function implicitEndpointColour(endpoint,g,fields){
  const rgb=new Float32Array(g.cells*3).fill(1),washes=endpoint.nativePlan?.washes??[];
  const root=endpoint.nativeRoot,scale=endpoint.localScale,point=p=>[(p[0]-root[0])*scale,(p[1]-root[1])*scale];
  const shapeMask=new Uint8Array(g.cells),islandMask=new Uint8Array(g.cells),reserveMask=new Uint8Array(g.cells);
  for(const mark of washes){
    if(!mark.palette||!(mark.shape?.length>2)||previewWashSkip.test(mark.role??''))continue;
    const shape=mark.shape.map(point),box=implicitBoxOf([shape]);if(!(box.w>0&&box.h>0))continue;
    const x0=clamp(Math.floor((box.x-g.x)/g.step),0,g.width-1),x1=clamp(Math.ceil((box.x+box.w-g.x)/g.step),0,g.width-1);
    const y0=clamp(Math.floor((box.y-g.y)/g.step),0,g.height-1),y1=clamp(Math.ceil((box.y+box.h-g.y)/g.step),0,g.height-1);
    for(let y=y0;y<=y1;y++){shapeMask.fill(0,y*g.width+x0,y*g.width+x1+1);islandMask.fill(0,y*g.width+x0,y*g.width+x1+1);reserveMask.fill(0,y*g.width+x0,y*g.width+x1+1);}
    implicitFillPolygon(shapeMask,shape,g);
    const islands=mark.islands?.filter(p=>p?.length>2);if(islands?.length)for(const island of islands)implicitFillPolygon(islandMask,island.map(point),g);
    for(const reserve of (mark.reserves??[]).slice(0,600))if(reserve?.length>2)implicitFillPolygon(reserveMask,reserve.map(point),g);
    const lut=previewWashLut(mark.palette);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const i=y*g.width+x;if(!shapeMask[i]||islands?.length&&!islandMask[i]||reserveMask[i])continue;
      const px=g.x+x*g.step,py=g.y+y*g.step,u=clamp((px-box.x)/box.w),v=clamp((py-box.y)/box.h);
      const amount=previewWashAmount(mark,u,v)*(.84+.32*valueNoise(px*.045+(mark.phase??0),py*.045));
      const j=Math.round(clamp(amount/PREVIEW_WASH_MAX)*(PREVIEW_WASH_LEVELS-1))*3;
      rgb[i*3]*=lut[j];rgb[i*3+1]*=lut[j+1];rgb[i*3+2]*=lut[j+2];
    }
  }
  const full=new Float32Array(g.cells*3);
  for(let i=0;i<g.cells;i++){const k=(fields.body[i]>0?fields.nearest[i]:i)*3;full[i*3]=rgb[k];full[i*3+1]=rgb[k+1];full[i*3+2]=rgb[k+2];}
  // Two separable box passes soften mesh-facet steps the way wet pigment does.
  const tmp=new Float32Array(full.length),{width:w,height:h}=g;
  for(let pass=0;pass<2;pass++){
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){const i=y*w+x;tmp[i*3+c]=(full[(y*w+Math.max(0,x-1))*3+c]+full[i*3+c]+full[(y*w+Math.min(w-1,x+1))*3+c])/3;}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){const i=y*w+x;full[i*3+c]=(tmp[(Math.max(0,y-1)*w+x)*3+c]+tmp[i*3+c]+tmp[(Math.min(h-1,y+1)*w+x)*3+c])/3;}
  }
  const out=new Uint8Array(g.cells*3);for(let i=0;i<out.length;i++)out[i]=Math.round(full[i]*255);
  return out;
}
// Constant-area offset prevents a whole member vanishing at a distant topology
// transition. Only the zero contour moves; opacity is never interpolated.
function implicitMixField(a,b,t,targetCount,out,band){
 let lo=Infinity,hi=-Infinity;for(let i=0;i<out.length;i++){const v=t===0?a[i]:t===1?b[i]:mix(a[i],b[i],t);out[i]=v;lo=Math.min(lo,v);hi=Math.max(hi,v);}
 if(t===0||t===1)return 0;
 lo-=band;hi+=band;let offset=0;
 for(let pass=0;pass<16;pass++){
  let area=0,derivative=0;for(const v of out){const q=.5+(offset-v)/(2*band);area+=clamp(q);if(q>0&&q<1)derivative+=1/(2*band);}
  const error=targetCount-area;if(Math.abs(error)<Math.max(.00001,targetCount*1e-7))return offset;
  if(error>0)lo=offset;else hi=offset;
  const next=derivative?offset+error/derivative:(lo+hi)*.5;offset=next>lo&&next<hi?next:(lo+hi)*.5;
 }
 return offset;
}
export function fieldContours(values,g,offset=0){
 const w=g.width,h=g.height,horizontal=(w-1)*h,coords=new Map(),next=new Map(),valuesAt=(x,y)=>values[y*w+x]-offset;
 const edge=(x,y,k,vs)=>{
  const ids=[y*(w-1)+x,horizontal+y*w+x+1,(y+1)*(w-1)+x,horizontal+y*w+x],id=ids[k];if(coords.has(id))return id;
  const corners=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],ends=[[0,1],[1,2],[3,2],[0,3]][k],[i,j]=ends,a=vs[i],b=vs[j],t=clamp(a/(a-b||1e-12)),p=corners[i],q=corners[j];
  coords.set(id,[g.x+mix(p[0],q[0],t)*g.step,g.y+mix(p[1],q[1],t)*g.step]);return id;
 };
 const table={1:[[0,3]],2:[[1,0]],3:[[1,3]],4:[[2,1]],6:[[2,0]],7:[[2,3]],8:[[3,2]],9:[[0,2]],11:[[1,2]],12:[[3,1]],13:[[0,1]],14:[[3,0]]};
 for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){
  const vs=[valuesAt(x,y),valuesAt(x+1,y),valuesAt(x+1,y+1),valuesAt(x,y+1)],code=vs.reduce((n,v,i)=>n|(v<0?1<<i:0),0);if(code===0||code===15)continue;
  const center=vs.reduce((a,b)=>a+b,0)*.25,segments=code===5?(center<0?[[0,1],[2,3]]:[[0,3],[2,1]]):code===10?(center<0?[[3,0],[1,2]]:[[1,0],[3,2]]):table[code];
  for(const [a,b] of segments)next.set(edge(x,y,a,vs),edge(x,y,b,vs));
 }
 const seen=new Set(),paths=[];for(const start of next.keys())if(!seen.has(start)){const points=[];let at=start;while(!seen.has(at)&&next.has(at)){seen.add(at);points.push(coords.get(at));at=next.get(at);}if(at===start&&points.length>=3){points.push(points[0]);paths.push(points);}}
 return paths;
}
function implicitInkCategory(role=''){
 if(/contour|outline|rim/.test(role))return 'boundary';
 if(/gill|fold|ridge|rib|lamella/.test(role))return 'hymenium';
 if(/stem|stipe|fibre|branch/.test(role))return 'support';
 return 'surface';
}
function implicitSampledStroke(mark,parameters){
 const pts=mark.points,cumulative=[0];for(let i=1;i<pts.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));const length=cumulative.at(-1)||1;
 if(!parameters)return cumulative.map(x=>x/length);
 let k=1;return parameters.map(u=>{const d=u*length;while(k<cumulative.length-1&&cumulative[k]<d)k++;const t=clamp((d-cumulative[k-1])/(cumulative[k]-cumulative[k-1]||1));return [mix(pts[k-1][0],pts[k][0],t),mix(pts[k-1][1],pts[k][1],t)];});
}
// Normalised descriptor of a stroke inside its endpoint member: centroid in
// the member box, length relative to the box diagonal, and a principal axis.
function implicitStrokeDescriptor(mark,box){
 let x=0,y=0,len=0;const pts=mark.points;for(const p of pts){x+=p[0];y+=p[1];}x/=pts.length;y/=pts.length;
 for(let i=1;i<pts.length;i++)len+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
 const dx=pts.at(-1)[0]-pts[0][0],dy=pts.at(-1)[1]-pts[0][1],d=Math.hypot(dx,dy)||1,diag=Math.hypot(box.w,box.h)||1;
 return {x:(x-box.x)/(box.w||1),y:(y-box.y)/(box.h||1),length:len/diag,ax:dx/d,ay:dy/d};
}
// Within one category, shape and direction matter; a stroke borrowed from
// another category is matched by position, so it travels the least.
function implicitStrokeDistance(p,q,borrowed=false){
 const along=Math.abs(p.ax*q.ax+p.ay*q.ay),position=Math.hypot(p.x-q.x,p.y-q.y);
 if(borrowed)return position+.03*Math.abs(Math.log((p.length+.004)/(q.length+.004)));
 return position+.35*Math.abs(Math.log((p.length+.004)/(q.length+.004)))+.12*(1-along);
}
// Correspondence by nearest normalised position within one ink category:
// every stroke of B takes its nearest stroke of A and every unclaimed stroke
// of A takes its nearest stroke of B. Strokes stay near their counterparts,
// so marks travel short, form-following paths instead of crossing the body.
function implicitCreateInkTransport(a,b){
 const groups=endpoint=>{const out=new Map();for(const mark of endpoint.ink){const role=implicitInkCategory(mark.role);if(!out.has(role))out.set(role,[]);out.get(role).push(mark);}return out;};
 const ga=groups(a),gb=groups(b),tracks=[],idsA=new Map(a.ink.map((m,i)=>[m,i])),idsB=new Map(b.ink.map((m,i)=>[m,i]));
 const fallback=groups=>groups.get('surface')??[...groups.values()].flat();
 const descA=new Map(a.ink.map(m=>[m,implicitStrokeDescriptor(m,a.box)])),descB=new Map(b.ink.map(m=>[m,implicitStrokeDescriptor(m,b.box)]));
 const nearest=(from,descFrom,list,descList,borrowed)=>{let best=list[0],score=Infinity;for(const other of list){const d=implicitStrokeDistance(descFrom.get(from),descList.get(other),borrowed);if(d<score){score=d;best=other;}}return best;};
 const link=(ma,mb,role)=>{
   let pointsB=mb.points;const pa=ma.points,pb=mb.points,direct=Math.hypot(pa[0][0]-pb[0][0],pa[0][1]-pb[0][1])+Math.hypot(pa.at(-1)[0]-pb.at(-1)[0],pa.at(-1)[1]-pb.at(-1)[1]),reverse=Math.hypot(pa[0][0]-pb.at(-1)[0],pa[0][1]-pb.at(-1)[1])+Math.hypot(pa.at(-1)[0]-pb[0][0],pa.at(-1)[1]-pb[0][1]);
   const closed=p=>Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<.01,area=p=>p.reduce((n,q,i)=>{const r=p[(i+1)%p.length];return n+q[0]*r[1]-r[0]*q[1];},0);if(closed(pa)&&closed(pb)?area(pa)*area(pb)<0:reverse<direct)pointsB=[...pb].reverse();const bmark={...mb,points:pointsB,original:mb};
   const parameters=[...new Set([...implicitSampledStroke(ma),...implicitSampledStroke(bmark)])].sort((x,y)=>x-y);
   tracks.push({a:ma,b:bmark,sourceId:idsA.get(ma),targetId:idsB.get(mb),pointsA:implicitSampledStroke(ma,parameters),pointsB:implicitSampledStroke(bmark,parameters),role,extent:Math.max(descA.get(ma).length,descB.get(mb).length)});
 };
 for(const role of new Set([...ga.keys(),...gb.keys()])){
  const aa=ga.get(role)??fallback(ga),bb=gb.get(role)??fallback(gb),claimed=new Set();
  // Only strokes native to this category claim a partner; borrowed fallback
  // strokes are already carried by their own category.
  const borrowed=!ga.has(role)||!gb.has(role);
  if(gb.has(role))for(const mb of bb){const ma=nearest(mb,descB,aa,descA,borrowed);claimed.add(ma);link(ma,mb,role);}
  if(ga.has(role))for(const ma of aa)if(!claimed.has(ma))link(ma,nearest(ma,descA,bb,descB,borrowed),role);
 }
 const countA=new Map(),countB=new Map();for(const track of tracks){countA.set(track.a,(countA.get(track.a)||0)+1);const key=track.b.original;countB.set(key,(countB.get(key)||0)+1);}for(const track of tracks){track.budgetA=1/countA.get(track.a);track.budgetB=1/countB.get(track.b.original);delete track.b.original;}return tracks;
}

// Historical plate blocking. A fungus plate shows one species as a deliberate
// group: the mature habit figure dominant at the centre, the younger and older
// figures set close beside it, touching or partly overlapping, the ones drawn
// behind standing a little higher on the sheet and the ones in front a little
// lower. Seeded by the composition, so a layout is stable through morphs and
// promotion (it is stored as implicitAnchors).
export const PLATE_BLOCKING=Object.freeze({x:600,baseline:800,overlap:Object.freeze([-.12,.32]),behind:Object.freeze([.06,.26]),front:Object.freeze([.03,.14]),scaleJitter:.12,mainScale:1,stretch:Object.freeze([.86,1.16]),lean:.17});
// Each member is its own specimen: a little wider or narrower and leaning a
// few degrees about its foot (a shear, so stems stay straight and the foot
// stays put). Local y is negative above the foot.
export function memberLinear(slot,scale){
  const s=scale??1,stretch=slot?.stretch??1,lean=slot?.lean??0;
  return {a:s*stretch,b:-s*Math.tan(lean),c:0,d:s};
}
export function plateBlockingAnchors(endpoints,composition,habit=null,grammar=null){
  if(habit&&endpoints.length>1)return habitBlockingAnchors(endpoints,composition,habit,grammar);
  if(habit)return habitGrow(endpoints.map((e,i)=>({x:PLATE_BLOCKING.x,y:PLATE_BLOCKING.baseline,scale:PLATE_BLOCKING.mainScale,rotation:e.slot?.rotation??0})),endpoints[0].box.h);
  const B=PLATE_BLOCKING,n=endpoints.length,hash=caHash(composition.id??'plate'),r=k=>caNoise(k,hash);
  const rotation=i=>endpoints[i].slot?.rotation??0;
  if(n<2)return endpoints.map((_,i)=>({x:B.x,y:B.baseline,scale:B.mainScale,rotation:rotation(i)}));
  // The dominant figure is the largest drawn body, whatever its slot.
  const area=e=>e.box.w*e.box.h;
  let main=0;for(let i=1;i<n;i++)if(area(endpoints[i])>area(endpoints[main]))main=i;
  const scale=endpoints.map((_,i)=>i===main?B.mainScale:1+(r(i+3)-.5)*2*B.scaleJitter);
  const stretch=endpoints.map((_,i)=>mix(B.stretch[0],B.stretch[1],r(i+61))),lean=endpoints.map((_,i)=>(r(i+67)-.5)*2*B.lean*(i===main?.5:1));
  const anchors=new Array(n),mainBox=endpoints[main].box;
  anchors[main]={x:B.x,y:B.baseline,scale:scale[main],rotation:rotation(main),stretch:stretch[main],lean:lean[main]};
  let left=B.x+mainBox.x*scale[main]*stretch[main],right=B.x+(mainBox.x+mainBox.w)*scale[main]*stretch[main],side=r(41)<.5?-1:1;
  const others=endpoints.map((_,i)=>i).filter(i=>i!==main).sort((i,j)=>area(endpoints[j])-area(endpoints[i])||i-j);
  for(const i of others){
    const box=endpoints[i].box,s=scale[i]*stretch[i],w=box.w*s,ov=mix(B.overlap[0],B.overlap[1],r(i+11))*Math.min(w,mainBox.w*scale[main]);
    const x=side<0?left-(box.x+box.w)*s+ov:right-box.x*s-ov;
    const tall=mainBox.h*scale[main],behind=i<main,lift=tall*(behind?-mix(B.behind[0],B.behind[1],r(i+19)):mix(B.front[0],B.front[1],r(i+23)));
    anchors[i]={x,y:B.baseline+lift,scale:scale[i],rotation:rotation(i),stretch:stretch[i],lean:lean[i]};
    if(side<0)left=Math.min(left,x+box.x*s);else right=Math.max(right,x+(box.x+box.w)*s);
    side=-side;
  }
  return anchors;
}
// Habit blocking. The dominant figure keeps its full size at the centre;
// other members recede in depth (smaller, higher on the sheet) rather than
// everything shrinking to fit. Members drawn earlier stand behind the main
// figure and later ones in front, so front members stay small and to the side.
// A last fit pulls members in until the group is no wider than the page
// allows, so the main figure still fills most of the plate height.
export const HABIT_BLOCKING=Object.freeze({maxAspect:1.5,minMainShare:.68,minMainHeight:330});
function habitGrow(anchors,H){const B=PLATE_BLOCKING,g=clamp(HABIT_BLOCKING.minMainHeight/Math.max(1,H),1,2.2);if(g===1)return anchors;
  return anchors.map(a=>({...a,x:B.x+(a.x-B.x)*g,y:B.baseline+(a.y-B.baseline)*g,scale:a.scale*g}));}
function habitBlockingAnchors(endpoints,composition,habit,grammar=null){
  const B=PLATE_BLOCKING,n=endpoints.length,hash=caHash(composition.id??'plate'),r=k=>caNoise(k,hash);
  const rotation=i=>endpoints[i].slot?.rotation??0,area=e=>e.box.w*e.box.h;
  let main=0;for(let i=1;i<n;i++)if(area(endpoints[i])>area(endpoints[main]))main=i;
  const M=endpoints[main].box,H=M.h,W=M.w,anchors=new Array(n);
  anchors[main]={x:B.x,y:B.baseline,scale:1,rotation:rotation(main),stretch:mix(.94,1.08,r(61)),lean:(r(67)-.5)*.1};
  const others=endpoints.map((_,i)=>i).filter(i=>i!==main);
  let side=r(41)<.5?-1:1;const ext={'-1':B.x+M.x*anchors[main].stretch,'1':B.x+(M.x+M.w)*anchors[main].stretch};
  others.forEach((i,k)=>{
    const box=endpoints[i].box,front=i>main,u=r(i+11),v=r(i+19),w=r(i+23);
    // Depth: 0 beside the main figure, 1 far behind it.
    let depth={solitary:.9,scattered:.3+.4*u,gregarious:.2+.55*(k+1)/others.length+.12*(u-.5),caespitose:.12+.2*u,imbricate:.3,troop:.25+.6*(k+1)/others.length}[habit]??.4;
    if(front)depth=Math.min(depth,.25);
    const target=H*(habit==='caespitose'?.68+.16*v-.12*depth:front?.42+.14*v:(.74-.36*depth)*(.88+.18*v));
    const fit=Math.min(1.15,(.92*H)/Math.max(1,box.h));
    let s=Math.min(fit,target/Math.max(1,box.h));
    if(habit==='solitary')s=Math.min(fit,.42+.1*v);
    const stretch=mix(B.stretch[0],B.stretch[1],r(i+61));let lean=(r(i+67)-.5)*2*B.lean,x,y;
    const edge=sd=>ext[sd],wPx=box.w*s*stretch;
    const outside=(sd,gap)=>sd<0?edge(sd)-(box.x+box.w)*s*stretch-gap:edge(sd)-box.x*s*stretch+gap;
    if(habit==='caespitose'){
      // One fused base: feet converge on the main foot, caps fan outward.
      // Feet overlap at the common base; stems splay so each cap clears the main one.
      x=B.x+side*W*(.1+.05*Math.floor(k/2))*(.8+.4*u);y=B.baseline-H*(.01+.04*depth);lean=side*(.3+.12*w+.06*Math.floor(k/2));
    }else if(habit==='imbricate'){
      // Shelves stack in tiers above and below the main one, stepping aside.
      const tier=(k%2?1:-1)*Math.ceil((k+1)/2);s=Math.min(fit,(.92-.12*Math.abs(tier))*(.9+.15*v));
      x=B.x+side*W*(.12+.14*u);y=B.baseline+tier*H*.58;lean=(r(i+67)-.5)*.1;
    }else if(habit==='solitary'){
      x=outside(side,W*(.25+.2*u));y=B.baseline-H*(.3+.12*v);
    }else if(habit==='scattered'){
      x=outside(side,W*(.06+.22*u));y=B.baseline-H*(front?-.04:.06+.22*depth);
    }else if(habit==='troop'){
      // An arc receding from the main figure: each further member steps out and back.
      const step=Math.ceil((k+1)/2);x=outside(side,-wPx*(.25-.12*step)+W*.08*(step-1));y=B.baseline-H*(front?-.03:.08+.2*depth);
    }else{
      // Gregarious: on the same ground, overlapping the main figure in depth.
      x=outside(side,-wPx*(front?.08:.1+.22*u));y=B.baseline-H*(front?-.05:.05+.24*depth);
    }
    anchors[i]={x,y,scale:s,rotation:rotation(i),stretch,lean};
    ext[side]=side<0?Math.min(ext[side],x+box.x*s*stretch):Math.max(ext[side],x+(box.x+box.w)*s*stretch);
    side=-side;
  });
  // Fit: pull members toward the centre (and down) until the group fits.
  const bounds=()=>{let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;endpoints.forEach((e,i)=>{const a=anchors[i],sx=a.scale*(a.stretch??1),b=e.box;
    x0=Math.min(x0,a.x+b.x*sx-Math.max(0,-Math.tan(a.lean??0))*b.h*a.scale);x1=Math.max(x1,a.x+(b.x+b.w)*sx+Math.max(0,Math.tan(a.lean??0))*b.h*a.scale);
    y0=Math.min(y0,a.y+b.y*a.scale);y1=Math.max(y1,a.y+(b.y+b.h)*a.scale);});return {w:x1-x0,h:y1-y0};};
  const C=HABIT_BLOCKING;
  for(let pass=0;pass<12;pass++){
    const g=bounds(),wide=g.w>C.maxAspect*g.h,tall=H*anchors[main].scale<C.minMainShare*g.h;
    if(!wide&&!tall)break;
    for(const i of others){const a=anchors[i];if(wide)a.x=B.x+(a.x-B.x)*(i>main?.94:.88);if(tall)a.y=B.baseline+(a.y-B.baseline)*.85;}
  }
  return habitGrow(anchors,H);
}
// Member anchors a field morph records on its composition: endpoint A's
// blocked plate layout (native roots for 3D charts). Exported so the page can
// predict a settled plate's identity before the Worker prepares it.
// Scattered and gregarious finds: each other member is moved sideways, away
// from the dominant figure, until its drawn outline (at its final slot, lean
// included) clears the main figure's box with a small gap. The page frame then
// fits the wider group. Returns new x per member, or null when nothing moved.
export const OPEN_HABIT_GAP=14;
function clearMainFigure(endpoints,members){
  const box=i=>{const at=members[i],L=memberLinear(at,at.scale),pts=endpoints[i].polygons.flat();if(!pts.length)return null;
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const p of pts){const x=at.x+L.a*p[0]+L.b*p[1],y=at.y+L.d*p[1];if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}return {x0,x1,y0,y1};};
  const boxes=members.map((_,i)=>box(i));if(boxes.some(b=>!b))return null;
  let main=0;for(let i=1;i<boxes.length;i++){const a=boxes[i],b=boxes[main];if((a.x1-a.x0)*(a.y1-a.y0)>(b.x1-b.x0)*(b.y1-b.y0))main=i;}
  const M=boxes[main],cx=(M.x0+M.x1)/2,xs=members.map(m=>m.x);let moved=false,left=M.x0,right=M.x1;
  // Nearest members first, so each one clears the main figure and the ones already placed.
  const order=members.map((_,i)=>i).filter(i=>i!==main).sort((i,j)=>Math.abs((boxes[i].x0+boxes[i].x1)/2-cx)-Math.abs((boxes[j].x0+boxes[j].x1)/2-cx));
  for(const i of order){
    const b=boxes[i],toRight=(b.x0+b.x1)/2>=cx,shift=toRight?Math.max(0,right+OPEN_HABIT_GAP-b.x0):Math.min(0,left-OPEN_HABIT_GAP-b.x1);
    if(shift){xs[i]+=shift;moved=true;}
    if(toRight)right=Math.max(right,b.x1+shift);else left=Math.min(left,b.x0+shift);
  }
  return moved?xs:null;
}
export function implicitAnchoredComposition(a,composition,options={},cache=new WeakMap()){
 let endpointsA=composition.members.map((slot,i)=>implicitEndpointMember(a,i,composition,cache,options));
 // blocking:false keeps native roots: a seed morph starts from the constructor
 // plate and lands on the destination's constructor layout.
 if(options.blocking!==false&&!composition.implicitAnchors&&!endpointsA.some(e=>e.chart)){
  const anchors=plateBlockingAnchors(endpointsA,composition,a.donorId?null:a.phenotype?.growthHabit,a.phenotype?.grammar);
  composition={...composition,implicitAnchors:anchors,members:composition.members.map((m,i)=>({...m,...anchors[i]}))};
  endpointsA=composition.members.map((slot,i)=>implicitEndpointMember(a,i,composition,cache,options));
  const habit=a.donorId?null:a.phenotype?.growthHabit;
  if(OPEN_HABITS.includes(habit)&&!OPEN_HABIT_KEEP.includes(a.phenotype?.grammar)&&endpointsA.length>1){
   const cleared=clearMainFigure(endpointsA,composition.members);
   if(cleared){composition={...composition,implicitAnchors:composition.implicitAnchors.map((k,i)=>({...k,x:cleared[i]})),members:composition.members.map((m,i)=>({...m,x:cleared[i]}))};
    endpointsA=composition.members.map((slot,i)=>implicitEndpointMember(a,i,composition,cache,options));}
  }
 }
 if(!composition.implicitAnchors){
  composition={...composition,implicitAnchors:endpointsA.map(e=>({x:e.nativeRoot[0],y:e.nativeRoot[1],scale:e.localScale===1&&!(['oyster','chanterelle'].includes(a.phenotype?.grammar)||e.chart)?1:e.slot.scale,rotation:e.slot.rotation})),members:composition.members.map((m,i)=>({...m,x:endpointsA[i].nativeRoot[0],y:endpointsA[i].nativeRoot[1],scale:endpointsA[i].localScale===1&&!(['oyster','chanterelle'].includes(a.phenotype?.grammar)||endpointsA[i].chart)?1:m.scale}))};
 }
 return {composition,endpointsA};
}
// nativeTargets: each B member keeps its own native placement (seed morphs,
// whose destination plate is drawn by its constructor, not at A's anchors).
export function createImplicitMorph(a,b,composition=createSpecimenComposition(a),{step=3,nativeTargets=false,...options}={}){
 const start=performance.now(),cache=new WeakMap(),anchored=implicitAnchoredComposition(a,composition,{...options,blocking:!nativeTargets},cache),endpointsA=anchored.endpointsA;
 composition=anchored.composition;
 const members=composition.members.map((slot,i)=>{
  const ea={...endpointsA[i],slot},nb=implicitEndpointMember(b,i,composition,cache,options),eb=nativeTargets&&!nb.chart?{...nb,slot:{...nb.slot,x:nb.nativeRoot[0],y:nb.nativeRoot[1]}}:nb,grid=implicitGridFor(ea,eb,step),fa=implicitEndpointFields(ea,grid),fb=implicitEndpointFields(eb,grid);
  const colourA=implicitEndpointColour(ea,grid,fa),colourB=implicitEndpointColour(eb,grid,fb);delete fa.nearest;delete fb.nearest;
  return {tracks:implicitCreateInkTransport(ea,eb),slot,grid,a:fa,b:fb,colourA,colourB,body:new Float32Array(grid.cells),endpointA:ea,endpointB:eb};
 });
 return {a,b,composition,members,implicitMorph:true,preparationMs:performance.now()-start,fieldStep:step};
}
export function implicitEndpointPlan(pair,t){
 const which=t===1?'endpointB':'endpointA',parts=pair.members.map((member,i)=>{
  const e=member[which],slot=e.slot,scale=e.localScale;
  if(!e.nativePlan)throw new Error('Native endpoint plans must be prepared in the painting Worker');
  const L=memberLinear(e.chart?null:pair.composition.implicitAnchors?slot:null,scale);
  const plan=transformFieldPlateMain(e.nativePlan,{sourceBox:{x:e.nativeRoot[0],y:e.nativeRoot[1],w:1,h:1},adultBox:{x:slot.x,y:slot.y,w:scale,h:scale}},{linear:{...L,ox:e.nativeRoot[0],oy:e.nativeRoot[1],tx:slot.x,ty:slot.y}});
  const owned=marks=>marks.map(mark=>({...mark,individual:i,memberId:member.slot.id}));
  return {...plan,ink:owned(plan.ink),washes:owned(plan.washes)};
 });
 // Figures set close together overlap: a member drawn later stands in front,
 // so earlier members reserve its body from their washes and stop their ink
 // at its silhouette.
 const fronts=parts.map(part=>part.washes.filter(mark=>mark.load>0&&!implicitIgnored.test(mark.role??'')&&!/shadow|glaze|turn|scales|reticulum|relief|spore|accent|pit/.test(mark.role??'')).flatMap(mark=>mark.islands?.length?mark.islands:[mark.shape]).filter(poly=>poly?.length>2));
 const occluded=parts.map((part,i)=>{
  const later=fronts.slice(i+1).flat();if(!later.length)return part;
  return {...part,washes:part.washes.map(mark=>({...mark,reserves:[...(mark.reserves??[]),...later]})),ink:part.ink.map(mark=>({...mark,exclude:[...(mark.exclude??[]),...later]}))};
 });
 return {ink:occluded.flatMap(p=>p.ink),washes:occluded.flatMap(p=>p.washes),bodies:occluded.flatMap(p=>p.washes),annotations:[],specimenCount:parts.length,individuals:pair.composition.members,implicitMorph:true,composition:pair.composition};
}
export function serializableImplicitMorph(pair){
 return {...pair,members:pair.members.map(member=>({...member,endpointA:{...member.endpointA,nativePlan:undefined},endpointB:{...member.endpointB,nativePlan:undefined}}))};
}
// Weight of the field silhouette: zero at both endpoints, where the native
// contours are exact, and full through the fictional middle of the morph.
// Contour strokes longer than this fraction of the member diagonal are
// silhouette-like; shorter closed marks (warts, scales, pits) keep full ink.
const IMPLICIT_SILHOUETTE_EXTENT=.12;
export const implicitOutlineWeight=t=>smooth(clamp(Math.min(t,1-t)/.18));
function implicitSmoothLoop(loop){
 let pts=loop.slice(0,-1);
 for(let pass=0;pass<2;pass++){const out=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];out.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}pts=out;}
 return [...pts,pts[0]];
}
export function sampleImplicitMorph(pair,t){
 if(!Number.isFinite(t))throw new RangeError('Blend must be finite');t=clamp(t);const ink=[],bodies=[],diagnostics=[];
 for(let i=0;i<pair.members.length;i++){
  const m=pair.members[i],bodyOffset=implicitMixField(m.a.body,m.b.body,t,mix(m.a.softBodyArea,m.b.softBodyArea,t),m.body,m.grid.step);
  const position={x:mix(m.endpointA.slot.x,m.endpointB.slot.x,t),y:mix(m.endpointA.slot.y,m.endpointB.slot.y,t)};
  const move=paths=>paths.map(path=>path.map(p=>[p[0]+position.x,p[1]+position.y]));
  const regions=move(fieldContours(m.body,m.grid,bodyOffset)),box=implicitBoxOf(regions),shape=[[box.x,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h],[box.x,box.y+box.h]];
  if(!regions.length)throw new Error(`Morph emptied ${pair.a.profileId}->${pair.b.profileId} member ${i} at ${t}`);
  // The preview wash owns a copy of this frame's field. m.body is a scratch
  // buffer reused by the next sample; aliasing it let a cached t=0 frame draw
  // the destination's body (the "ghost" wash of a different mushroom).
  const wash=m.colourA&&m.colourB?{grid:m.grid,field:Float32Array.from(m.body),offset:bodyOffset,a:m.colourA,b:m.colourB,t,x:position.x,y:position.y}:null;
  bodies.push({shape,islands:regions,individual:i,memberId:m.slot.id,role:'folded-body',previewWash:wash});
  if(t===0||t===1){const endpoint=t===0?m.endpointA:m.endpointB;for(const mark of endpoint.ink)ink.push({...mark,points:mark.points.map(p=>[p[0]+position.x,p[1]+position.y]),clipRegions:regions,individual:i,memberId:m.slot.id});}
  else {
  // Split strokes overlap at an endpoint and separate in between; keep
  // each separated copy legible instead of a faint fraction of its source.
  const spread=smooth(clamp(Math.min(t,1-t)*6)),outline=implicitOutlineWeight(t);
  // The transported body carries one clean silhouette; borrowed contour
  // strokes recede toward it instead of tangling across the moving form.
  if(outline>0)for(const loop of regions)if(loop.length>8)ink.push({nativeSelected:true,points:implicitSmoothLoop(loop),clipRegions:null,individual:i,memberId:m.slot.id,role:'cap-contour',width:mix(.95,1.15,outline),opacity:.62*outline,phase:i*.73+.4,morphSilhouette:true});
  for(const track of m.tracks){const points=track.pointsA.map((p,k)=>[mix(p[0],track.pointsB[k][0],t)+position.x,mix(p[1],track.pointsB[k][1],t)+position.y]);const recede=track.role==='boundary'&&track.extent>IMPLICIT_SILHOUETTE_EXTENT?1-.78*outline:1;ink.push({nativeSelected:true,points,clipRegions:regions,individual:i,memberId:m.slot.id,role:track.a.role??track.b.role,width:mix(track.a.width,track.b.width,t),opacity:recede*mix(1-Math.pow(1-(track.a.opacity??.6),mix(track.budgetA,Math.sqrt(track.budgetA),spread)),1-Math.pow(1-(track.b.opacity??.6),mix(track.budgetB,Math.sqrt(track.budgetB),spread)),t),phase:mix(track.a.phase??0,track.b.phase??0,t)});}

  }
  let occupied=0;for(const v of m.body)if(v<bodyOffset)occupied++;diagnostics.push({memberId:m.slot.id,cells:m.grid.cells,area:occupied*m.grid.step*m.grid.step,targetArea:mix(m.a.bodyArea,m.b.bodyArea,t)*m.grid.step*m.grid.step,bodyOffset,bodyLoops:regions.length,inkTracks:m.tracks.length});
 }
 return {ink,bodies,washes:[],specimenCount:pair.members.length,individuals:pair.members.map(m=>m.slot),composition:pair.composition,implicitMorph:true,fictional:t>0&&t<1,diagnostics,fieldStep:pair.fieldStep};
}

export function prepareImplicitPair(pair){
 captureImplicitComparisons(pair);
 if(!pair.implicitData){pair.implicitData=createImplicitMorph(pair.a,pair.b,pair.composition,{view:pair.view,shapeModifiers:pair.shapeModifiers});pair.composition=pair.implicitData.composition;}
 syncImplicitPlateIdentity(pair);
 return pair.implicitData;
}
// Capturing native member anchors changes placement identity, not the page fit.
// Keep the captured descriptor geometry while sealing its native Worker key.
function syncImplicitPlateIdentity(pair){
 if(!pair.fieldPlate)return;
 const pairKey=fieldPlatePairKey(pair,pair.composition);
 if(pair.fieldPlate.pairKey===pairKey)return;
 const plate=Object.freeze({...pair.fieldPlate,pairKey});
 pair.fieldPlate=plate;pair.composition={...pair.composition,plate};
 if(pair.implicitData)pair.implicitData.composition=pair.composition;
}
// Unsupported anatomy transitions retain source drawings as comparison studies.
// These vectors keep their original labels; only their named page slots move.
function captureImplicitComparisons(pair){
 if(!pair.fieldPlate)return null;
 if(pair.composition.comparisonStudies)return pair.composition.comparisonStudies;
 const recipe=fieldPlateRecipeAt(pair.fieldPlate,0),kind=fieldPlateKind(pair.a);
 if(kind==='unsupported')return null;
 const sourceRecipe={...recipe,supported:true,showDeposit:kind==='cap'||kind==='lateral'};
 // A fresh plate draws the specimen's own anatomy; a plate promoted from a
 // chart morph keeps the chart's studies so the arrival stays exact.
 const chartForm=['oyster','chanterelle'].includes(pair.a.phenotype?.grammar??pair.a.family);
 const connected=pair.sourceConnected&&(!chartForm||pair.fieldPlate.transitionFrom)?{pair:pair.sourceConnected,t:0}:null;
 const plan=buildFieldPlateAdjuncts(pair.a,sourceRecipe,{composition:pair.composition,connected});
 const snapshot={version:1,sourceProfileId:pair.a.profileId,sourceSeed:pair.a.seed,recipe:sourceRecipe,
  ink:plan.ink,washes:plan.washes,bodies:plan.bodies,annotations:plan.annotations};
 pair.composition={...pair.composition,comparisonStudies:snapshot};
 if(pair.implicitData)pair.implicitData.composition=pair.composition;
 return snapshot;
}
function remapImplicitComparisons(snapshot,recipe,{sketch=false}={}){
 const parts=[],slots=[['longitudinal-cut','cutBox'],['hymenium-detail','detailBox'],['spore-deposit','depositBox'],['microscopy','microBox']];
 for(let i=0;i<slots.length;i++){
  const [role,box]=slots[i],ink=snapshot.ink.filter(m=>m.studyRole===role),washes=snapshot.washes.filter(m=>m.studyRole===role);
  if(!ink.length&&!washes.length)continue;
  const annotations=snapshot.annotations.filter(a=>a.fieldPlateId===`adjunct:label:${i}`);
  const plan={ink,washes,bodies:washes,annotations};
  const source=snapshot.recipe[box],target=recipe[box];if(!source||!target)continue;
  parts.push(['x','y','w','h'].every(k=>source[k]===target[k])?plan:transformFieldPlateMain(plan,{sourceBox:source,adultBox:target}));
 }
 const notes=snapshot.annotations.filter(a=>!a.fieldPlateId.startsWith('adjunct:label:')).map(sourceNote=>{const a={...sourceNote};
  if(a.fieldPlateId!=='adjunct:habit-label')return a;
  const source=snapshot.recipe.adultBox,target=recipe.adultBox;
  if(['x','y','w','h'].every(k=>source[k]===target[k]))return a;
  return transformFieldPlateMain({ink:[],washes:[],annotations:[a]},{sourceBox:source,adultBox:target}).annotations[0];
 });
 return {ink:parts.flatMap(p=>p.ink),washes:sketch?[]:parts.flatMap(p=>p.washes),bodies:parts.flatMap(p=>p.bodies),annotations:[notes[0],...parts.flatMap(p=>p.annotations),...notes.slice(1)].filter(Boolean)};
}
function fitImplicitPlate(plan,pair,t,{sketch=false}={}){
 if(!pair.fieldPlate)return plan;
 const recipe=fieldPlateRecipeAt(pair.fieldPlate,t),snapshot=captureImplicitComparisons(pair);
 const fitted=transformFieldPlateMain(plan,recipe);
 for(let i=0;i<fitted.ink.length;i++)if(plan.ink[i].clipRegions)fitted.ink[i].clipRegions=fitted.bodies.find(body=>body.individual===fitted.ink[i].individual)?.islands;
 if(!snapshot)return {...fitted,fieldPlate:recipe};
 const adjuncts=remapImplicitComparisons(snapshot,recipe,{sketch});
 const habit=fieldPlateBounds(fitted),label=adjuncts.annotations.find(a=>a.fieldPlateId==='adjunct:habit-label');
 if(habit&&label){label.x=habit.x+habit.w*.5;label.y=habit.y+habit.h+21;}
 return {...fitted,ink:[...fitted.ink,...adjuncts.ink],washes:[...(fitted.washes??[]),...adjuncts.washes],bodies:[...fitted.bodies,...adjuncts.bodies],annotations:[...(fitted.annotations??[]),...adjuncts.annotations],fieldPlate:recipe,comparisonStudies:true};
}

function implicitPaintStudy(pair,t,{scene='plain'}={}){
 let data=prepareImplicitPair(pair);const genome=morphGenome(pair,t),v=genome.values;
 if((t===0||t===1)&&!data.members[0][t===0?'endpointA':'endpointB'].nativePlan)data=createImplicitMorph(pair.a,pair.b,pair.composition,{view:pair.view,shapeModifiers:pair.shapeModifiers});
 let plan;
 if(t===0||t===1)plan=implicitEndpointPlan(data,t);
 else{
  plan=sampleImplicitMorph(data,t);
  const a=TYPE_PALETTES[pair.a.phenotype.palette],b=TYPE_PALETTES[pair.b.phenotype.palette],palette=Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].map(k=>[k,mix(a[k]??0,b[k]??0,t)]));
  plan.washes=plan.bodies.map((body,i)=>{const box=bounds(body.shape);return {...body,points:[[box.x+box.w*.5,box.y],[box.x+box.w*.5,box.y+box.h]],width:box.w*1.7,palette,load:.08+v[21]*.1,phase:v[35]*TAU,granulation:v[25],wetness:v[26],pooling:v[27],softness:v[28],variation:v[29],reserves:plan.bodies.slice(i+1).flatMap(other=>other.islands)};});
  plan.ink=plan.ink.map(mark=>({...mark,exclude:plan.bodies.slice(mark.individual+1).flatMap(other=>other.islands)}));
 }
 // An endpoint drawing stands on its substrate wood (the endpoint plan
 // drops the drawing's own habitat marks); fictional field frames carry no
 // wood. The optional habitat vignette lies behind either.
 const masks=plan.bodies.flatMap(body=>body.islands??[body.shape]),wood=scene!=='plain'&&(t===0||t===1)?buildStudySubstrate(genome,{},masks):null;
 if(wood)plan=mergeHabitatLayers(plan,[wood]);
 if(scene!=='plain')plan=mergeHabitatLayers(plan,[buildBackgroundStudy(genome,scene,wood?[...masks,...wood.masks]:masks,{view:pair.view})]);
 return fitImplicitPlate({...plan,scene,annotations:[],fictional:t>0&&t<1},pair,t);
}
export function decodeCompositionAnchors(value){
 if(!value)return null;try{const items=typeof value==='string'?JSON.parse(value):value;if(!Array.isArray(items)||items.length<1||items.length>5)return null;if(!items.every(p=>['x','y','scale','rotation'].every(k=>Number.isFinite(p[k]))&&Math.abs(p.x)<4000&&Math.abs(p.y)<4000&&p.scale>.05&&p.scale<4&&Math.abs(p.rotation)<7))return null;return items.map(p=>({x:p.x,y:p.y,scale:p.scale,rotation:p.rotation,...(Number.isFinite(p.stretch)&&p.stretch>.5&&p.stretch<2?{stretch:p.stretch}:{}),...(Number.isFinite(p.lean)&&Math.abs(p.lean)<1?{lean:p.lean}:{})}));}catch{return null;}
}
export function applyCompositionAnchors(composition,anchors){
 anchors=decodeCompositionAnchors(anchors);if(!anchors||anchors.length!==composition.members.length)return composition;
 return {...composition,implicitAnchors:anchors,members:composition.members.map((m,i)=>({...m,...anchors[i]}))};
}
// One bounded preparation job. New recipes supersede queued callbacks and
// terminate obsolete work; pointer movement only changes the eventual blend.
export class MorphPreparation {
 constructor(createWorker){this.createWorker=createWorker;this.revision=0;this.worker=null;this.key=null;this.cached=null;this.pending=null;}
 cancel(){this.revision++;this.worker?.terminate();this.worker=null;this.pending=null;this.key=null;}
 prepare(key,payload,ready,error){
  if(this.cached?.key===key){ready(this.cached.data);return;}
  if(this.pending&&this.key===key){this.pending={ready,error};return;}
  this.cancel();const revision=this.revision;this.key=key;this.pending={ready,error};
  try{
   const worker=this.worker=this.createWorker();
   worker.onmessage=event=>{if(revision!==this.revision||worker!==this.worker)return;const callbacks=this.pending;if(event.data.error){this.cancel();callbacks.error(new Error(event.data.error));return;}if(event.data.kind!=='implicit-ready')return;this.cached={key,data:event.data.data};this.worker=null;this.pending=null;worker.terminate();callbacks.ready(this.cached.data);};
   worker.onerror=event=>{event.preventDefault?.();if(revision!==this.revision)return;const callbacks=this.pending;this.cancel();callbacks.error(new Error(event.message||'Shape preparation failed'));};
   worker.postMessage({...payload,kind:'implicit-prepare',revision});
  }catch(cause){const callbacks=this.pending;this.cancel();callbacks?.error(cause);}
 }
}

export function createMorphPair(a,b,options={}){
  let source=buildSketch(a),target=buildSketch(b);const sameRecipe=a.profileId===b.profileId&&a.donorId===b.donorId&&a.family===b.family;
  const composition=options.composition??createSpecimenComposition(a,{count:source.specimenCount});
  const isChart=g=>CONNECTED_MORPH_GRAMMARS.includes(g.phenotype?.grammar)&&!g.donorId;
  if(isChart(a)&&isChart(b)){
    const pair=createConnectedAnatomyPair(a,b,composition,options);pair.sameRecipe=sameRecipe;pair.supportedMotion=true;
    pair.source=buildConnectedAnatomy(pair,0);pair.target=buildConnectedAnatomy(pair,1);return pair;
  }
  const sourceConnected=isChart(a)?createConnectedAnatomyPair(a,a,composition,options):null,targetConnected=isChart(b)?createConnectedAnatomyPair(b,b,composition,options):null;
  if(sourceConnected)source=buildConnectedAnatomy(sourceConnected,0);if(targetConnected)target=buildConnectedAnatomy(targetConnected,1);
  const pair={a,b,source,target,sameRecipe,composition,view:options.view,shapeModifiers:options.shapeModifiers,sourceConnected,targetConnected,implicitMorph:!sameRecipe||!!composition.implicitAnchors,supportedMotion:true};
  // Seeds of one recipe keep the native constructor for settled paintings;
  // their moving preview uses the same body field as unlike recipes, so the
  // first and last frames are the endpoint plates' own drawings.
  pair.previewField=!pair.implicitMorph;
  // The general body field is prepared outside the interactive frame loop.
  if(!sameRecipe)return pair;
  return pair;
}
export function morphGenome(pair,t){
  if(!Number.isFinite(t))throw new RangeError('Blend must be finite');t=clamp(t);
  if(t===0)return pair.a;if(t===1)return pair.b;
  if(pair.sameRecipe)return interpolateGenome(pair.a,pair.b,t);
  return {...pair.a,seed:`${pair.a.seed} → ${pair.b.seed}`,values:pair.a.values.map((v,i)=>mix(v,pair.b.values[i],t)),
    title:`${pair.a.title} → ${pair.b.title}`,fictional:true,correspondence:true,sourceProfileId:pair.a.profileId,targetProfileId:pair.b.profileId};
}
function rawMorphSketch(pair,t,{rawFieldPlate=false,inkOnly=false,interactive=false}={}){
  if(pair.implicitMorph)return fitImplicitPlate(sampleImplicitMorph(prepareImplicitPair(pair),t),pair,t,{sketch:true});
  if(!rawFieldPlate&&pair.fieldPlate?.supported){const plan=buildFieldPlatePairPlan(pair,t,{sketch:true,inkOnly,interactive});if(plan)return plan;}
  if(!Number.isFinite(t))throw new RangeError('Blend must be finite');t=clamp(t);
  if(pair.connectedAnatomy)return buildConnectedAnatomy(pair,t,{inkOnly,interactive});
  if(t===0)return pair.sourceConnected?buildConnectedAnatomy({...pair.sourceConnected,view:pair.view??pair.sourceConnected.view,shapeModifiers:pair.shapeModifiers??pair.sourceConnected.shapeModifiers},0,{inkOnly,interactive}):pair.source;
  if(t===1)return pair.targetConnected?buildConnectedAnatomy({...pair.targetConnected,view:pair.view??pair.targetConnected.view,shapeModifiers:pair.shapeModifiers??pair.targetConnected.shapeModifiers},1,{inkOnly,interactive}):pair.target;
  if(pair.supportedMotion===false)throw new RangeError('This pair has no connected anatomy model');
  if(pair.sameRecipe)return buildSketch(morphGenome(pair,t));
  throw new RangeError('This pair has no connected anatomy model');
}
// Page frame. Builders draw in fixed 1200 × 1000 slots, so a single oyster or
// a low colony can leave most of the sheet empty. Each endpoint drawing, with
// its ground, sections and optional setting, is fitted once into the plate's
// drawing area; intermediate blends interpolate the two fits, and the caption
// sits against the actual drawn bounds. The captured frame travels on the
// composition, so promotion, the native Worker and repaint reuse the exact page
// transform. Field studies keep their own plate layout and are never refitted.
export const PAGE_FRAME=Object.freeze({x:60,y:40,w:1080,h:830,footer:954,captionGap:46,footerGap:26,noteGap:20,maxScale:2.2,pad:.02,lift:.42,captionTop:905,shadowGap:22});
// Settled plates throw a cast shadow below each foot (nativeGroundingWashes:
// at most ~0.06 of the specimen height plus the contact pool). The caption
// sits below that shadow, not below the bare drawing.
export function pageShadowClearance(drawnHeight){const F=PAGE_FRAME,shadow=clamp(drawnHeight*.07,18,56);return Math.max(0,shadow+F.shadowGap-F.captionGap);}
const PAGE_FRAME_VIEWS=Object.freeze([[-.9,-.12],[.9,-.12],[-.9,.85],[.9,.85]]);
const PAGE_STUDY_BOUNDS=new Map();
function finitePointBounds(points){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const p of points){if(!p||!Number.isFinite(p[0])||!Number.isFinite(p[1]))continue;if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}
  return Number.isFinite(x0)?{x:x0,y:y0,w:x1-x0,h:y1-y0}:null;
}
// Ink centerlines plus every wash, body and ground footprint actually drawn.
export function planDrawingBounds(plan){
  const points=[];
  for(const mark of plan?.ink??[])if(mark.points)for(const p of mark.points)points.push(p);
  for(const key of ['washes','bodies'])for(const mark of plan?.[key]??[])if(mark.shape)for(const p of mark.shape)points.push(p);
  return finitePointBounds(points);
}
function unionBounds(boxes){
  const valid=boxes.filter(b=>b&&b.w>=0&&b.h>=0);
  return valid.length?finitePointBounds(valid.flatMap(b=>[[b.x,b.y],[b.x+b.w,b.y+b.h]])):null;
}
function pageGenomeId(genome){return [genome.seed,genome.profileId,genome.donorId,genome.family,genome.values];}
// Standalone studies are the costliest endpoint; keep a few recent bounds.
function pageStudyBounds(genome,scene){
  const key=JSON.stringify([...pageGenomeId(genome),scene]);
  if(PAGE_STUDY_BOUNDS.has(key))return PAGE_STUDY_BOUNDS.get(key);
  const box=planDrawingBounds(buildStudy(genome,{scene}));
  PAGE_STUDY_BOUNDS.set(key,box);if(PAGE_STUDY_BOUNDS.size>8)PAGE_STUDY_BOUNDS.delete(PAGE_STUDY_BOUNDS.keys().next().value);
  return box;
}
// A connected 3D chart endpoint is the same drawing whether it belongs to a
// chart pair or a fictional field pair, so its bounds come from the standalone
// chart: every camera extreme in ink, plus the painted plate at this view.
function pageChartBounds(genome,pair,scene){
  const c=pair.composition,key=JSON.stringify(['chart',...pageGenomeId(genome),c?.id??null,c?.members??null,pair.view??null,pair.shapeModifiers??null,scene]);
  if(PAGE_STUDY_BOUNDS.has(key))return PAGE_STUDY_BOUNDS.get(key);
  const chart=createConnectedAnatomyPair(genome,genome,c??createSpecimenComposition(genome),{view:pair.view,shapeModifiers:pair.shapeModifiers});
  const boxes=PAGE_FRAME_VIEWS.map(([yaw,pitch])=>planDrawingBounds(buildConnectedAnatomy({...chart,view:{yaw,pitch}},0,{inkOnly:true})));
  boxes.push(planDrawingBounds(connectedPlateStudy(chart,0,{scene})));
  const box=unionBounds(boxes);
  PAGE_STUDY_BOUNDS.set(key,box);if(PAGE_STUDY_BOUNDS.size>8)PAGE_STUDY_BOUNDS.delete(PAGE_STUDY_BOUNDS.keys().next().value);
  return box;
}
const pageChartGenome=genome=>CONNECTED_MORPH_GRAMMARS.includes(genome.phenotype?.grammar)&&!genome.donorId;
// What an endpoint can show: preview and painted geometry plus ground,
// sections and the optional setting.
function pageEndpointBounds(pair,side,scene){
  const genome=side?pair.b:pair.a;
  // A turned 3D rest body (and a 3D colony with its wood) is framed from what
  // it actually draws: body3d parts, perspective and substrate included.
  if(pair.orbitRest)return planDrawingBounds(connectedPlateStudy(pair,side,{scene}));
  if(pageChartGenome(genome))return pageChartBounds(genome,pair,scene);
  const sketch=rawMorphSketch(pair,side),boxes=[planDrawingBounds(sketch)];
  if(pair.implicitMorph){
    if(scene!=='plain')boxes.push(planDrawingBounds(buildBackgroundStudy(genome,scene,(sketch.bodies??[]).flatMap(body=>body.islands??[body.shape]))));
  }else boxes.push(pageStudyBounds(genome,scene));
  return unionBounds(boxes);
}
// Uniform fit with historical-plate margins: centred across, lifted slightly
// above the optical centre with room for the title and footer below.
export function fitPageFrame(box){
  const F=PAGE_FRAME;
  if(!box||!(box.w>0)||!(box.h>0))return Object.freeze({scale:1,tx:0,ty:0});
  const pad=Math.max(10,Math.max(box.w,box.h)*F.pad),w=box.w+pad*2,h=box.h+pad*2;
  const fitScale=Math.min(F.maxScale,F.w/w,F.h/h),clearance=pageShadowClearance(box.h*fitScale),scale=Math.min(fitScale,(F.footer-F.y-F.captionGap-F.footerGap-clearance)/h),block=h*scale+F.captionGap+F.footerGap+clearance;
  const top=F.y+Math.max(0,F.footer-F.y-block)*F.lift;
  return Object.freeze({scale,tx:F.x+(F.w-w*scale)*.5-(box.x-pad)*scale,ty:top-(box.y-pad)*scale});
}
function pageEndpointId(pair,side,scene){
  const c=pair.composition??{};
  return hashSeed(JSON.stringify([pageGenomeId(side?pair.b:pair.a),c.id??null,c.members??null,c.implicitAnchors??null,pair.shapeModifiers??null,scene])).toString(36);
}
function pageFrameKey(pair,scene){
  return `${pageEndpointId(pair,0,scene)}:${pageEndpointId(pair,1,scene)}:${pair.implicitMorph?'field':pair.connectedAnatomy?'chart':'study'}`;
}
// Capture once per pair and scene. A promoted pair starts from the carried
// destination fit when its source is that same drawn endpoint.
export function pagePairFrame(pair,scene='plain'){
  const key=pageFrameKey(pair,scene),carried=pair.composition?.pageFrame;
  if(carried?.version===1&&carried.key===key)return carried;
  const aId=pageEndpointId(pair,0,scene),bId=pageEndpointId(pair,1,scene);
  const a=carried?.version===1&&carried.bId===aId?carried.b:fitPageFrame(pageEndpointBounds(pair,0,scene));
  const b=pair.supportedMotion===false?a:fitPageFrame(pageEndpointBounds(pair,1,scene));
  const frame=Object.freeze({version:1,key,scene,aId,bId,a,b});
  pair.composition={...(pair.composition??{}),pageFrame:frame};
  if(pair.implicitData)pair.implicitData.composition=pair.composition;
  return frame;
}
export function pageFrameAt(frame,t){
  if(t<=0)return frame.a;if(t>=1)return frame.b;
  return {scale:mix(frame.a.scale,frame.b.scale,t),tx:mix(frame.a.tx,frame.b.tx,t),ty:mix(frame.a.ty,frame.b.ty,t)};
}
export function applyPageFrame(plan,frame){
  const s=frame.scale,F=PAGE_FRAME;
  const fitted=transformFieldPlateMain(plan,{sourceBox:{x:0,y:0,w:1200,h:1000},adultBox:{x:frame.tx,y:frame.ty,w:1200*s,h:1000*s}},{inkWidthScale:s>1?Math.sqrt(s):s});
  const {fieldPlateTransform,...framed}=fitted;
  for(let i=0;i<framed.ink.length;i++)if(plan.ink[i].clipRegions)framed.ink[i].clipRegions=framed.bodies?.find(body=>body.individual===framed.ink[i].individual)?.islands;
  const drawn=planDrawingBounds(framed),bottom=drawn?drawn.y+drawn.h:F.y+F.h;
  const title=Math.min(F.footer-F.footerGap,Math.max(F.captionTop,bottom+F.captionGap+pageShadowClearance(drawn?drawn.h:0))),pageCaption=Object.freeze({x:600,title,footer:title+F.footerGap});
  const annotations=framed.annotations.map((note,i)=>/^FICTIONAL /.test(plan.annotations[i]?.text??'')?{...note,x:600,y:pageCaption.footer+F.noteGap}:note);
  return {...framed,annotations,pageFrame:{scale:s,tx:frame.tx,ty:frame.ty},pageCaption};
}
function framePagePlan(plan,pair,t,scene){
  if(!plan||plan.fieldPlate||plan.fieldPlateTransform)return plan;
  return applyPageFrame(plan,pageFrameAt(pagePairFrame(pair,scene),clamp(t)));
}
export function buildMorphSketch(pair,t,options={}){
  const plan=rawMorphSketch(pair,t,options);
  return options.rawFieldPlate?plan:framePagePlan(plan,pair,t,options.scene??'plain');
}
export function buildMorphStudy(pair,t,options={}){
  const plan=rawMorphStudy(pair,t,options);
  return options.rawFieldPlate?plan:framePagePlan(plan,pair,t,options.scene??'plain');
}
export const ANATOMY_MEASURES=Object.freeze([
  ['span','Width','px'],['height','Height','px'],['crownSpan','Cap width','px'],
  ['supportLength','Stem lines','px'],['branchLength','Branch lines','px'],
  ['foldLength','Fold lines','px'],['pathLength','All lines','px'],['paths','Line count',''],['points','Point count',''],
]);
export function measureSketch(plan){
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,crownLeft=Infinity,crownRight=-Infinity;
  const result={span:0,height:0,crownSpan:0,supportLength:0,branchLength:0,foldLength:0,pathLength:0,paths:0,points:0};
  for(const mark of plan.ink){
    const length=pathLength(mark.points);if(length<1e-8)continue;result.paths++;result.points+=mark.points.length;result.pathLength+=length;
    const role=correspondenceRole(mark.role);if(role==='support')result.supportLength+=length;if(role==='branch')result.branchLength+=length;if(role==='fold')result.foldLength+=length;
    for(const [x,y] of mark.points){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);if(role==='crown'){crownLeft=Math.min(crownLeft,x);crownRight=Math.max(crownRight,x);}}
  }
  result.span=Number.isFinite(left)?right-left:0;result.height=Number.isFinite(top)?bottom-top:0;result.crownSpan=Number.isFinite(crownLeft)?crownRight-crownLeft:0;
  return result;
}
function rawMorphStudy(pair,t,{scene='plain',rawFieldPlate=false}={}){
  if(pair.implicitMorph)return implicitPaintStudy(pair,clamp(t),{scene});
  if(!rawFieldPlate&&pair.fieldPlate?.supported){const plan=buildFieldPlatePairPlan(pair,t,{scene});if(plan)return plan;}
  const genome=morphGenome(pair,t);
  if(pair.connectedAnatomy)return connectedPlateStudy(pair,t,{scene});
  if(t<=0&&pair.sourceConnected)return connectedPlateStudy({...pair.sourceConnected,view:pair.view??pair.sourceConnected.view,shapeModifiers:pair.shapeModifiers??pair.sourceConnected.shapeModifiers},0,{scene});
  if(t>=1&&pair.targetConnected)return connectedPlateStudy({...pair.targetConnected,view:pair.view??pair.targetConnected.view,shapeModifiers:pair.shapeModifiers??pair.targetConnected.shapeModifiers},1,{scene});
  if(pair.supportedMotion===false&&t>0&&t<1)throw new RangeError('This pair has no connected anatomy model');
  if(t<=0||t>=1||pair.sameRecipe)return buildStudy(genome,{scene});
  const sketch=rawMorphSketch(pair,t,{rawFieldPlate}),v=genome.values,phase=v[35]*TAU;
  const ink=sketch.ink.map((mark,i)=>({...mark,phase:phase+i*.71})),washes=[];
  const paletteA=TYPE_PALETTES[pair.a.phenotype.palette]??{ochre:.6,umber:.4},paletteB=TYPE_PALETTES[pair.b.phenotype.palette]??{ochre:.6,umber:.4};
  const palette=Object.fromEntries([...new Set([...Object.keys(paletteA),...Object.keys(paletteB)])].map(key=>[key,mix(paletteA[key]??0,paletteB[key]??0,t)]));
  // Bounded native passages: hundreds of coral segments share one union per
  // role/member. This maps material to the bridge regions, not a fixed family.
  const groups=new Map();for(const body of sketch.bodies){
    const box=bounds(body.shape);if(box.w*box.h<.01)continue;
    const key=`${body.individual}:${body.role}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(body);
  }
  for(const bodies of groups.values()){
    const all=bodies.flatMap(mark=>mark.shape),box=bounds(all),shape=[[box.x,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h],[box.x,box.y+box.h]];
    washes.push({shape,islands:bodies.map(mark=>mark.shape),reserves:bodies.flatMap(mark=>mark.reserves??[]),
      points:[[box.x-2,box.y+box.h/2],[box.x+box.w+2,box.y+box.h/2]],width:box.h*2+8,
      role:'folded-body',individual:bodies[0].individual,palette,load:.08+v[21]*.12,phase,
      granulation:v[25],wetness:v[26],pooling:v[27],softness:v[28],variation:v[29]});
  }
  const background=scene!=='plain'?buildBackgroundStudy(genome,scene,sketch.bodies.map(body=>body.shape)):null;
  return {...mergeHabitatLayers({...sketch,ink,washes},[background]),scene,annotations:[{text:'FICTIONAL GEOMETRIC INTERMEDIATE',x:600,y:876}]};
}
export function buildStudy(genome,{scene='plain'}={}){
  const novel=new Set(['cup','trumpet','earthstar','nest','club','jelly','tooth','saddle','stinkhorn']);
  const study=genome.phenotype&&novel.has(genome.phenotype.grammar)?buildNovelStudy(genome):buildLegacyStudy(genome);
  if(genome.phenotype){decorateCatalog(study,genome);applySpecimenDamage(study,genome);}
  if(genome.phenotype?.habit==='cluster'&&['amanita','bolete','chanterelle','morel'].includes(genome.family)){
    const bodies=Array.from({length:study.specimenCount},(_,i)=>[...new Set(study.washes.filter(m=>m.individual===i&&!['ground','pit-shadow','cap-turn','cap-glaze','stem-shadow','flesh'].includes(m.role)).map(m=>m.shape))]);
    for(const mark of study.ink){if(Number.isInteger(mark.individual))mark.exclude=[...(mark.exclude??[]),...bodies.slice(mark.individual+1).flat()];}
    for(const mark of study.washes){if(Number.isInteger(mark.individual))mark.reserves=[...(mark.reserves??[]),...bodies.slice(mark.individual+1).flat()];}
  }
  // A lignicolous species drawn without wood of its own stands on its
  // substrate (a low stump or a fallen log or branch) under the drawing.
  const masks=[...new Set(study.washes.filter(m=>!['ground','bark-fissures'].includes(m.role)).flatMap(m=>m.islands??[m.shape]))];
  const wood=scene!=='plain'?buildStudySubstrate(genome,study,masks):null;
  if(wood){const merged=mergeHabitatLayers(study,[wood]);study.ink=merged.ink;study.washes=merged.washes;study.habitatSetting=true;}
  if(scene!=='plain'){
    const background=buildBackgroundStudy(genome,scene,wood?[...masks,...wood.masks]:masks),merged=mergeHabitatLayers(study,[background]);
    study.ink=merged.ink;study.washes=merged.washes;study.scene=scene;study.habitatSetting=true;
  }
  return study;
}
function buildStudySubstrate(genome,study,masks){
  const h=habitatFor(genome);
  if(!h.wood||!genome.phenotype||/hardwood/.test(study.habitat?.substrate??'')||genome.phenotype.grammar==='tooth')return null;
  // The catalog drawing spreads its members over the ground, so the wood
  // stands just behind them: Armillaria and Flammulina tufts at the foot of
  // a stump, jelly ears and nests in front of a fallen branch.
  let top=Infinity,bottom=-Infinity,l=Infinity,r=-Infinity;
  for(const m of masks)for(const p of m){if(p[1]>bottom)bottom=p[1];if(p[1]<top)top=p[1];if(p[0]<l)l=p[0];if(p[0]>r)r=p[0];}
  if(!Number.isFinite(bottom))return null;
  const Hg=Math.max(80,bottom-top),span=Math.max(160,r-l),cx=(l+r)/2,cp=Math.cos(HABIT_CAMERA.pitch),seed=caHash(`${genome.profileId??genome.phenotype.grammar}:${genome.seed}`);
  let substrate;
  if(h.kind==='stump'||h.kind==='trunk'){
    const R=150,scale=clamp(span*.24/R,.25,1.6),H=Math.max(Hg*.42,span*.22)/(scale*cp);
    substrate={kind:'stump',center:[0,0],radius:R,height:H,tilt:(caNoise(4,seed)-.5)*.1,phase:caNoise(1,seed)*CA_TAU,anchor:[cx+(caNoise(5,seed)-.5)*span*.2,bottom-Hg*.1],scale};
  }else{
    const branch=h.kind==='branch',scale=.8,rad=(branch?.06:.11)*Hg/scale,L=span*1.15/scale;
    substrate={kind:branch?'branch':'log',start:[-L/2,0],end:[L/2,-L*.05],radius:rad,bend:(caNoise(2,seed)-.5)*30,phase:caNoise(3,seed)*CA_TAU,anchor:[cx,bottom-Hg*.08],scale};
  }
  const layer=buildHabitSubstrate({id:`study-wood-${seed.toString(36)}`,members:[],substrate,behind:true},genome,masks);
  if(!layer)return null;
  const flat=list=>list.map(m=>({...m,points:m.points.map(p=>[p[0],p[1]]),clip:m.clip?m.clip.map(p=>[p[0],p[1]]):m.clip}));
  return {...layer,ink:flat(layer.ink),front:{...layer.front,ink:flat(layer.front.ink)}};
}

// Resolve tissue occlusion on vector centerlines once per study. This avoids
// hundreds of repeated canvas clip stacks while keeping overlapping masks solid.
// Affine camera depth on a projected triangle, with barycentric coordinates
// for finding the owner surface despite the ink's subpixel hand displacement.
function depthTriangle(vertices){
  const [a,b,c]=vertices,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if(Math.abs(den)<1e-8)return null;
  const wa=[(b[1]-c[1])/den,(c[0]-b[0])/den,0],wb=[(c[1]-a[1])/den,(a[0]-c[0])/den,0];
  wa[2]=1-wa[0]*a[0]-wa[1]*a[1];wb[2]=1-wb[0]*b[0]-wb[1]*b[1];
  const depth=[wa[0]*(a[2]-c[2])+wb[0]*(b[2]-c[2]),wa[1]*(a[2]-c[2])+wb[1]*(b[2]-c[2]),c[2]+wa[2]*(a[2]-c[2])+wb[2]*(b[2]-c[2])];
  const poly=vertices.map(p=>p.slice(0,2));poly.cameraDepth=depth;
  return {poly,wa,wb,depth};
}
// One fixed sheet-resolution coverage field per passage, discarded with its
// study. Resolve camera ownership before applying transparent native pigment:
// overlapping blades must not accumulate several unrelated shadow charges.
export function lamellarCoverage(faces,box,{diagnostics=false}={}){
  const x=Math.max(0,Math.floor(box.x)),y=Math.max(0,Math.floor(box.y));
  const width=Math.max(1,Math.min(1200,Math.ceil(box.x+box.w))-x);
  const height=Math.max(1,Math.min(1000,Math.ceil(box.y+box.h))-y);
  const depths=new Float32Array(width*height);depths.fill(Infinity);
  const alpha=new Uint8ClampedArray(width*height);
  // Allocate ownership evidence only on request, never for normal painting.
  // Projected samples count triangle hits (shared edges may count twice);
  // visiblePixels counts nearest owners before the passage reserves are cut.
  const owners=diagnostics?new Int32Array(width*height).fill(-1):null;
  const projectedSamples=diagnostics?new Uint32Array(faces.length):null;
  for(let faceIndex=0;faceIndex<faces.length;faceIndex++){
    const face=faces[faceIndex];
    for(const triangle of face.triangles){
      const b=bounds(triangle.poly),left=Math.max(x,Math.floor(b.x)),right=Math.min(x+width,Math.ceil(b.x+b.w));
      const top=Math.max(y,Math.floor(b.y)),bottom=Math.min(y+height,Math.ceil(b.y+b.h));
      for(let py=top;py<bottom;py++)for(let px=left;px<right;px++){
        const point=[px+.5,py+.5],a=affineAt(triangle.wa,point),bary=affineAt(triangle.wb,point);
        if(Math.min(a,bary,1-a-bary)<-1e-7)continue;
        if(diagnostics)projectedSamples[faceIndex]++;
        const index=(py-y)*width+px-x,depth=affineAt(triangle.depth,point);
        if(depth<depths[index]){
          depths[index]=depth;
          if(diagnostics)owners[index]=faceIndex;
          const charge=triangle.pigment;
          const local=charge?a*charge[0]+bary*charge[1]+(1-a-bary)*charge[2]:1;
          alpha[index]=Math.round(255*clamp(face.pigment*local));
        }
      }
    }
  }
  if(diagnostics){
    const visiblePixels=new Uint32Array(faces.length);
    for(const owner of owners)if(owner>=0)visiblePixels[owner]++;
    return {x,y,width,height,alpha,owners,depths,projectedSamples,visiblePixels};
  }
  return {x,y,width,height,alpha};
}
const affineAt=(a,p)=>a[0]*p[0]+a[1]*p[1]+a[2];
function surfaceDepthAt(triangles,p){
  let best=null,score=-Infinity;
  for(const triangle of triangles){
    const a=affineAt(triangle.wa,p),b=affineAt(triangle.wb,p),margin=Math.min(a,b,1-a-b);
    if(margin>score){score=margin;best=triangle;}
    if(margin>=-1e-7)break;
  }
  return best?affineAt(best.depth,p):Infinity;
}
const visibilityEntries=new WeakMap();
function visibilityEntry(poly){
  let entry=visibilityEntries.get(poly);
  if(!entry){
    const box=bounds(poly),edges=poly.map((a,i)=>{const b=poly[(i+1)%poly.length];return {a,dx:b[0]-a[0],dy:b[1]-a[1],minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])};});
    entry={poly,box,edges};visibilityEntries.set(poly,entry);
  }
  return entry;
}
// Index occluding tissue faces, not owner-depth lookup. The exact bbox and
// ray tests still decide visibility; the grid only avoids visiting remote
// triangles for each short fibre. Keep source order for identical cut sorting.
const visibilityMeshes=new WeakMap();
function visibilityMeshCandidates(poly,footprint){
  let mesh=visibilityMeshes.get(poly);
  if(!mesh){
    const box=visibilityEntry(poly).box,n=12,cells=Array.from({length:n*n},()=>[]);
    const cellX=x=>clamp(Math.floor((x-box.x)/(box.w||1)*n),0,n-1);
    const cellY=y=>clamp(Math.floor((y-box.y)/(box.h||1)*n),0,n-1);
    const items=lamellarSurfaces.get(poly).map((triangle,index)=>({entry:visibilityEntry(triangle.poly),index}));
    for(const item of items){
      const q=item.entry.box;
      for(let y=cellY(q.y);y<=cellY(q.y+q.h);y++)for(let x=cellX(q.x);x<=cellX(q.x+q.w);x++)cells[y*n+x].push(item);
    }
    mesh={n,cells,cellX,cellY};visibilityMeshes.set(poly,mesh);
  }
  const selected=new Set();
  for(let y=mesh.cellY(footprint.y);y<=mesh.cellY(footprint.y+footprint.h);y++)for(let x=mesh.cellX(footprint.x);x<=mesh.cellX(footprint.x+footprint.w);x++)for(const item of mesh.cells[y*mesh.n+x])selected.add(item);
  return [...selected].sort((a,b)=>a.index-b.index).map(item=>item.entry);
}
export function visiblePathFragments(points, shapes, depthSurface=null) {
  if(points.length<2)return [];
  const footprint=bounds(points),overlaps=q=>footprint.x<=q.x+q.w&&footprint.x+footprint.w>=q.x&&footprint.y<=q.y+q.h&&footprint.y+footprint.h>=q.y;
  // Cull at face level before expanding its depth mesh. Most short hatch
  // strokes meet only a few of the sheet's thousands of tissue triangles.
  const entries=[];
  for(const poly of shapes){
    const entry=visibilityEntry(poly);if(!overlaps(entry.box))continue;
    if(depthSurface&&lamellarSurfaces.has(poly)){
      for(const e of visibilityMeshCandidates(poly,footprint))if(overlaps(e.box))entries.push(e);
    }else entries.push(entry);
  }
  const contains=(poly,p)=>{
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  };
  const ownerEntries=depthSurface?.map(triangle=>visibilityEntry(triangle.poly));
  const fragments=[];let current=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],cuts=[0,1];
    const minX=Math.min(a[0],b[0]),maxX=Math.max(a[0],b[0]),minY=Math.min(a[1],b[1]),maxY=Math.max(a[1],b[1]);
    const candidates=entries.filter(({box:q})=>minX<=q.x+q.w&&maxX>=q.x&&minY<=q.y+q.h&&maxY>=q.y);
    for(const {edges} of candidates)for(const edge of edges){
      if(minX>edge.maxX||maxX<edge.minX||minY>edge.maxY||maxY<edge.minY)continue;
      const c=edge.a,ex=edge.dx,ey=edge.dy,cross=dx*ey-dy*ex;
      if(Math.abs(cross)<1e-10)continue;
      const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/cross,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/cross;
      if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
    }
    // Include each owner triangle boundary so both depth fields are affine
    // over every resulting interval, including a depth-order reversal.
    if(ownerEntries)for(const {edges,box:q} of ownerEntries){
      if(minX>q.x+q.w||maxX<q.x||minY>q.y+q.h||maxY<q.y)continue;
      for(const edge of edges){
        const c=edge.a,ex=edge.dx,ey=edge.dy,cross=dx*ey-dy*ex;
        if(Math.abs(cross)<1e-10)continue;
        const t=((c[0]-a[0])*ey-(c[1]-a[1])*ex)/cross,u=((c[0]-a[0])*dy-(c[1]-a[1])*dx)/cross;
        if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);
      }
    }
    cuts.sort((x,y)=>x-y);
    if(depthSurface){
      const extra=[];
      for(let j=1;j<cuts.length;j++){
        const lo=cuts[j-1],hi=cuts[j];if(hi-lo<1e-9)continue;
        const at=t=>[a[0]+dx*t,a[1]+dy*t],mid=at((lo+hi)/2),lp=at(lo),hp=at(hi);
        const active=candidates.filter(({poly,box:q})=>poly.cameraDepth&&mid[0]>=q.x&&mid[0]<=q.x+q.w&&mid[1]>=q.y&&mid[1]<=q.y+q.h&&contains(poly,mid));
        if(!active.length)continue;
        const ownerLo=surfaceDepthAt(depthSurface,lp),ownerHi=surfaceDepthAt(depthSurface,hp);
        for(const {poly} of active){
          const dl=affineAt(poly.cameraDepth,lp)-ownerLo,dh=affineAt(poly.cameraDepth,hp)-ownerHi;
          if(dl*dh<0)extra.push(lo+(hi-lo)*dl/(dl-dh));
        }
      }
      cuts.push(...extra);cuts.sort((x,y)=>x-y);
    }
    for(let j=1;j<cuts.length;j++){
      const lo=cuts[j-1],hi=cuts[j];if(hi-lo<1e-9)continue;
      const at=t=>[a[0]+dx*t,a[1]+dy*t];
      const p=at((lo+hi)/2);let ownerDepth;
      if(candidates.some(({poly,box:q})=>p[0]>=q.x&&p[0]<=q.x+q.w&&p[1]>=q.y&&p[1]<=q.y+q.h&&contains(poly,p)&&(!depthSurface||!poly.cameraDepth||affineAt(poly.cameraDepth,p)<(ownerDepth??=surfaceDepthAt(depthSurface,p))-1e-6))){
        if(current.length>1)fragments.push(current);current=[];
      }else{
        if(!current.length)current.push(at(lo));current.push(at(hi));
      }
    }
  }
  if(current.length>1)fragments.push(current);
  return fragments;
}

export function partialPath(points,progress) {
  if(progress<=0)return [];
  if(progress>=1)return points;
  let left=pathLength(points)*progress;const out=[points[0]];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(left>=d){out.push(b);left-=d;}else{out.push([mix(a[0],b[0],left/d),mix(a[1],b[1],left/d)]);break;}
  }
  return out;
}

// A pressure response and a real dry-ink contact field are cached once. The live
// centerlines remain vectors; flex, lift and paper contact are evaluated in JS.
export function penPressure(t, phase=0) {
  return .07+.93*smooth(clamp(t/.10))*smooth(clamp((1-t)/.17))*(.58+.42*valueNoise(phase+t*2.4,phase*.3+4));
}
// Custom nib approximation: correlated hand pressure, slightly more contact at
// a start/slow turn, and rare short dry contacts on an outer cap. It never moves
// a centerline or opens a structural junction; this is not full native pen flow.
export function inkContactProfile(mark,t,length,full,turn=0){
  const phase=mark.phase??0,pressure=penPressure(t,phase)*(.66+.54*valueNoise(phase*1.7+length/24,phase*.31+5));
  let dry=1;
  if(mark.role==='cap-contour'&&full>60&&sample(phase,521)<.28&&t>.15&&t<.85){
    const center=.24+.52*sample(phase,523),half=Math.min(.035,3.5/full),distance=Math.abs(t-center)/half;
    if(distance<1)dry=.16+.84*smooth(distance);
  }
  const dwell=.13*Math.exp(-length/3)+.18*Math.sqrt(clamp(turn));
  return {pressure:pressure*dry,dry,dwell};
}

// A field-drawing hand, evaluated when a mark is inked. Each mark keeps its
// identity and centreline order; only how the nib travels along it changes:
// low-frequency wander and a slight bow keyed to the mark's own arc length,
// long contours laid as several pen gestures that overshoot or stop short at
// the joins, a width that swells where the hand slows on a turn and thins on
// a quick straight, tapered entries and exits with the odd resting blob, a
// part-restatement beside some outlines, and hatching laid as quick flicks
// with a hooked return. Plate units (1200 per sheet); every choice is seeded
// from the mark, so a plate, its zoom detail and a prepared plate agree.
export const HAND_LINE=Object.freeze({
  step:1.6,wobble:Object.freeze({contour:.7,hatch:.32,texture:.16}),wobbleScale:36,drift:1.1,bow:.009,bowMax:2.2,
  gesture:Object.freeze([40,92]),overshoot:Object.freeze([1.2,4]),gap:Object.freeze([.7,2.4]),join:Object.freeze([.4,1.2]),
  slow:Object.freeze([.62,1.45]),slowRadius:34,entry:5,blob:.16,blobSize:1.05,
  restate:.45,restateOffset:Object.freeze([.8,1.7]),restateWidth:.5,
  hook:.62,hookAngle:Object.freeze([.6,1.5]),hatchShift:1.1,flickMax:44,litLift:.36,minHalf:.045,
});
const HAND_CONTOUR_ROLES=new Set(['cap-contour','stem-contour','ring','veil','branch','folds','margin-split','section','root','bend','ribs','coral','folded-body','cavity','rim']);
const HAND_HATCH=/fibre|hatch|shadow|relief|habitat|crack|zones|bands|flesh|ground/;
export function handLineKind(role=''){if(HAND_CONTOUR_ROLES.has(role))return 'contour';if(HAND_HATCH.test(role))return 'hatch';return 'texture';}
const handRoleSalt=role=>{let h=0;for(let i=0;i<role.length;i++)h=(h*31+role.charCodeAt(i))%9973;return h;};
function handArc(points){const s=[0];for(let i=1;i<points.length;i++)s.push(s[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));return s;}
function handNormal(points,i){const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy)||1;return [-dy/n,dx/n,dx/n,dy/n];}
// Corners are kept; long segments gain intermediate points so wander and
// pressure can vary along them.
function handDensify(points,step){
  const out=[points[0]];
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d<1e-6)continue;const n=Math.min(80,Math.floor(d/step));for(let k=1;k<=n;k++){const t=k/(n+1);out.push([mix(a[0],b[0],t),mix(a[1],b[1],t)]);}out.push(b);}
  return out;
}
// How slowly the hand moves here: 0 on a straight run, 1 on a tight turn.
function handSlowness(points,s,radius){
  const n=points.length,raw=new Float32Array(n),out=new Float32Array(n),m=Math.max(1,Math.round(7/HAND_LINE.step));
  for(let i=0;i<n;i++){
    const a=points[Math.max(0,i-m)],p=points[i],b=points[Math.min(n-1,i+m)],u=[p[0]-a[0],p[1]-a[1]],v=[b[0]-p[0],b[1]-p[1]],lu=Math.hypot(...u),lv=Math.hypot(...v);
    if(lu<1e-6||lv<1e-6)continue;
    const turn=Math.acos(clamp((u[0]*v[0]+u[1]*v[1])/(lu*lv),-1,1));raw[i]=Math.pow(clamp(turn/((lu+lv)/2)*radius),.8);
  }
  // A hand slows over a stretch of a turn, not at each kink of the line.
  for(let i=0;i<n;i++){let sum=0,count=0;for(let k=Math.max(0,i-m);k<=Math.min(n-1,i+m);k++){sum+=raw[k];count++;}out[i]=sum/count;}
  return out;
}
function handWander(points,s,amp,seed,salt,bow=0){
  const L=s.at(-1)||1,ox=17.3*sample(seed,salt),oy=3+29*sample(seed,salt+1);
  return points.map((p,i)=>{const [nx,ny]=handNormal(points,i),t=s[i]/L,d=amp*(2*valueNoise(s[i]/HAND_LINE.wobbleScale+ox,oy)-1+.45*(2*valueNoise(s[i]/(HAND_LINE.wobbleScale*.3)+ox,oy+11)-1)+HAND_LINE.drift*(2*valueNoise(s[i]/(HAND_LINE.wobbleScale*4)+ox*.7,oy+23)-1))+bow*4*t*(1-t);return [p[0]+nx*d,p[1]+ny*d];});
}
// The tangent carried on past an end: an overshoot, or (negative) a stop short.
function handExtend(points,s,amount,atEnd){
  if(points.length<2||Math.abs(amount)<1e-3)return {points,s};
  if(amount<0){
    const L=s.at(-1),cut=Math.min(-amount,L*.3);
    if(atEnd){const keep=points.filter((_,i)=>s[i]<=L-cut);return keep.length>1?{points:keep,s:s.slice(0,keep.length)}:{points,s};}
    const first=s.findIndex(v=>v>=cut);if(first<0||points.length-first<2)return {points,s};
    return {points:points.slice(first),s:s.slice(first).map(v=>v-s[first])};
  }
  const [a,b]=atEnd?[points.at(-2),points.at(-1)]:[points[1],points[0]],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1,q=[b[0]+dx/l*amount,b[1]+dy/l*amount];
  return atEnd?{points:[...points,q],s:[...s,s.at(-1)+amount]}:{points:[q,...points],s:[0,...s.map(v=>v+amount)]};
}
// Contours often arrive as consecutive pieces (nib contacts, visible runs).
// A hand carries one gesture across them: link each piece whose start lies on
// the end of another of the same role and body, heading the same way. The
// links live beside the marks (no mark is copied or changed); a linked end
// neither tapers nor lifts, and wander and gesture cuts run on chain length.
const HAND_CHAIN=new WeakMap();
export function handChainMarks(marks){
  const ends=new Map(),cell=16,key=(x,y)=>`${Math.floor(x/cell)},${Math.floor(y/cell)}`,info=new Map();
  const tangent=(p,fromEnd)=>{const n=p.length,a=fromEnd?p[n-1]:p[0];let b=a;for(let k=1;k<n;k++){b=fromEnd?p[n-1-k]:p[k];if(Math.hypot(b[0]-a[0],b[1]-a[1])>=3)break;}const dx=fromEnd?a[0]-b[0]:b[0]-a[0],dy=fromEnd?a[1]-b[1]:b[1]-a[1],l=Math.hypot(dx,dy)||1;return [dx/l,dy/l];};
  for(const mark of marks){
    if(handLineKind(mark.role??'')!=='contour'||mark.restate||!mark.points||mark.points.length<2)continue;
    const p=mark.points,e=p.at(-1),k=key(e[0],e[1]);info.set(mark,{length:pathLength(p),out:tangent(p,true),in:tangent(p,false)});
    if(!ends.has(k))ends.set(k,[]);ends.get(k).push(mark);
  }
  const next=new Map(),prev=new Map(),near=(a,s)=>{
    // Distance from a start point to the last 16 units of a's line.
    const p=a.points;let best=Infinity,run=0;
    for(let i=p.length-1;i>0&&run<16;i--){const u=p[i-1],v=p[i],dx=v[0]-u[0],dy=v[1]-u[1],l2=dx*dx+dy*dy||1e-9,t=clamp(((s[0]-u[0])*dx+(s[1]-u[1])*dy)/l2);best=Math.min(best,Math.hypot(u[0]+dx*t-s[0],u[1]+dy*t-s[1]));run+=Math.sqrt(l2);}
    return best;
  };
  const pairs=[];
  for(const [b,ib] of info){
    const s=b.points[0],cx=Math.floor(s[0]/cell),cy=Math.floor(s[1]/cell);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const a of ends.get(`${cx+dx},${cy+dy}`)??[]){
      if(a===b||a.role!==b.role||a.individual!==b.individual)continue;
      const ia=info.get(a),d=near(a,s),align=ia.out[0]*ib.in[0]+ia.out[1]*ib.in[1];
      if(d<2.2&&align>.75)pairs.push([d-align,a,b]);
    }
  }
  pairs.sort((x,y)=>x[0]-y[0]);
  for(const [,a,b] of pairs)if(!next.has(a)&&!prev.has(b)){next.set(a,b);prev.set(b,a);}
  // Walk each chain from its head; closed loops start anywhere once.
  const seen=new Set(),walk=head=>{let at=head,offset=0;const seed=sample(info.get(head).length*.37+head.points.length,47);while(at&&!seen.has(at)){seen.add(at);HAND_CHAIN.set(at,{in:prev.has(at)&&at!==head,out:next.has(at)&&next.get(at)!==head,offset,seed});offset+=info.get(at).length;at=next.get(at);}};
  for(const mark of info.keys())if(!prev.has(mark))walk(mark);
  for(const mark of info.keys())if(!seen.has(mark))walk(mark);
  return marks;
}
// One mark becomes a list of nib strokes: {points, half, arc, order, blobs}.
// arc/order are lengths along the original mark, so a partly drawn mark shows
// its strokes in drawing order.
export function handInkStrokes(mark,chain=HAND_CHAIN.get(mark)??null){
  const raw=mark.points;if(!raw||raw.length<2)return [];
  const kind=handLineKind(mark.role??''),phase=mark.phase??0,H=HAND_LINE;
  const seed=phase*7.13+raw.length*.731+handRoleSalt(mark.role??'')*.0917+Math.floor(raw[0][0])*.0137+Math.floor(raw[0][1])*.0291;
  const R=salt=>sample(seed,salt),linkIn=!!chain?.in,linkOut=!!chain?.out,offset=chain?.offset??0,wseed=chain?chain.seed*101.3:seed;
  let pts=handDensify(raw,H.step),s=handArc(pts);const L=s.at(-1);
  if(L<1.2||pts.length<2)return [{points:raw,half:raw.map(()=>.025+(mark.width??.6)*.25),arc:handArc(raw),order:0,blobs:[],restate:false,hook:false}];
  const hatchFlick=kind==='hatch'&&L<H.flickMax;
  // Uneven hatching: each flick lands a little off its slot and short of it.
  if(hatchFlick&&L>2.5){
    const shift=(R(3)*2-1)*H.hatchShift*Math.min(1,L/10),[nx,ny]=handNormal(pts,pts.length>>1),trimA=R(4)*.14*L,trimB=R(5)*.1*L;
    let i0=0,i1=pts.length-1;while(i0<i1-1&&s[i0+1]<=trimA)i0++;while(i1>i0+1&&s[i1-1]>=L-trimB)i1--;
    pts=pts.slice(i0,i1+1).map(p=>[p[0]+nx*shift,p[1]+ny*shift]);s=handArc(pts);
  }
  const amp=chain?H.wobble[kind]:Math.min(H.wobble[kind],(s.at(-1)||1)*.035),bow=kind==='texture'||chain?0:clamp(L*H.bow,0,H.bowMax)*(R(6)*2-1);
  const line=handWander(pts,s.map(v=>v+offset),amp,wseed,7,bow),ls=handArc(line),LL=ls.at(-1)||1;
  // Long contours: cut into gestures where the hand would shift its grip.
  // Cut positions run along the chain, so they ignore where pieces meet.
  const cuts=[];
  if(kind==='contour'&&!mark.restate){
    const r=k=>chain?sample(chain.seed*31.7,20+k):R(20+k);let at=0;
    for(let k=0;k<400&&at<offset+LL;k++){at+=mix(H.gesture[0],H.gesture[1],r(k));const local=at-offset;if(local<=H.gesture[0]*.35)continue;if(LL-local<H.gesture[0]*.35)break;cuts.push(local);}
  }
  const edges=[0,...cuts,LL],strokes=[];
  for(let g=0;g<edges.length-1;g++){
    const a=edges[g],b=edges[g+1],idx=[];for(let i=0;i<line.length;i++)if(ls[i]>=a-1e-6&&ls[i]<=b+1e-6)idx.push(i);
    if(idx.length<2)continue;
    const joinIn=g===0&&linkIn,joinOut=g===edges.length-2&&linkOut;
    let piece=idx.map(i=>line[i]),ps=idx.map(i=>ls[i]-a);
    // A join: the earlier gesture runs on past the point or stops short of
    // it; the next starts a hair to one side and settles onto the line.
    if(g>0){const j=(R(40+g)*2-1)*mix(H.join[0],H.join[1],R(41+g)),settle=8;piece=piece.map((p,i)=>{const [nx,ny]=handNormal(piece,i),w=j*(1-smooth(clamp(ps[i]/settle)));return [p[0]+nx*w,p[1]+ny*w];});}
    const endRoll=R(50+g),startRoll=R(60+g),closed=edges.length===2&&!chain&&Math.hypot(raw[0][0]-raw.at(-1)[0],raw[0][1]-raw.at(-1)[1])<1.5;
    const endScale=kind==='contour'?1:kind==='texture'?.35:.6;
    let ext={points:piece,s:ps};
    if(!hatchFlick){
      const end=joinOut?0:endRoll<.5?mix(H.overshoot[0],H.overshoot[1],R(51+g)):endRoll<.75?-mix(H.gap[0],H.gap[1],R(52+g)):0;
      const start=joinIn?0:startRoll<.3?.5*mix(H.overshoot[0],H.overshoot[1],R(61+g)):startRoll<.55?-.6*mix(H.gap[0],H.gap[1],R(62+g)):0;
      ext=handExtend(ext.points,ext.s,end*endScale*(closed?.5:1),true);ext=handExtend(ext.points,ext.s,start*endScale*(closed?.5:1),false);
    }
    strokes.push(handNibStroke(mark,ext.points,ext.s,{kind,seed,g,flick:hatchFlick,order:a,gestureLength:b-a,joinIn,joinOut,offset:offset+a,chainSeed:chain?.seed??null}));
  }
  // A lighter second line laid beside part of a long outline.
  if(kind==='contour'&&!mark.restate&&LL>30&&(mark.role==='cap-contour'||mark.role==='stem-contour'||mark.role==='ring')&&R(80)<H.restate){
    const t0=R(81)*.5,t1=Math.min(1,t0+.3+R(82)*.3),idx=[];for(let i=0;i<line.length;i++)if(ls[i]>=t0*LL&&ls[i]<=t1*LL)idx.push(i);
    if(idx.length>3){
      const mid=line[idx[idx.length>>1]],[nx,ny]=handNormal(line,idx[idx.length>>1]);let side=R(83)<.5?-1:1;
      if(mark.lightBox){const B=mark.lightBox;side=Math.sign(nx*(mid[0]-(B.x+B.w/2))+ny*(mid[1]-(B.y+B.h/2)))||1;}
      const off=side*mix(H.restateOffset[0],H.restateOffset[1],R(84)),sub=idx.map(i=>line[i]),ss=handArc(sub);
      const moved=handWander(sub,ss,H.wobble.contour*1.4,seed,90,0).map((p,i)=>{const [mx,my]=handNormal(sub,i),e=smooth(clamp(Math.min(ss[i],ss.at(-1)-ss[i])/6));return [p[0]+mx*off*(.35+.65*e),p[1]+my*off*(.35+.65*e)];});
      strokes.push(handNibStroke({...mark,width:(mark.width??.6)*H.restateWidth},moved,handArc(moved),{kind,seed:seed+3.1,g:9,flick:false,order:LL+1,gestureLength:ss.at(-1),noBlob:true,restate:true}));
    }
  }
  return strokes;
}
// Half-widths along one nib stroke, plus any ink blob where the nib rested.
function handNibStroke(mark,points,s,{kind,seed,g,flick,order,gestureLength,noBlob=false,restate=false,joinIn=false,joinOut=false,offset=0,chainSeed=null}){
  const H=HAND_LINE,L=s.at(-1)||1,phase=(mark.phase??0)+g*1.73,contactMark={role:mark.role,phase},slow=handSlowness(points,s,H.slowRadius);
  const range=kind==='contour'?H.slow:kind==='hatch'?[.8,1.2]:[.86,1.14],press=.86+.28*sample(seed,70+g),half=new Float32Array(points.length);
  const entry=Math.min(H.entry,L*.25),exit=Math.min(12,L*.35);
  let hookPts=null;
  for(let i=0;i<points.length;i++){
    const [,,tx,ty]=handNormal(points,i);let t=s[i]/L;
    let pressure,dwell;
    if(flick){
      // A flick: struck firmly, released at once to a hairline.
      pressure=(.4+.6*smooth(clamp(t/.12)))*(.13+.87*Math.pow(1-smooth(clamp((t-.22)/.78)),1.25))*(.75+.4*valueNoise(phase*1.7+s[i]/9,phase*.31+5));dwell=0;
    }else{
      // A linked end carries straight on: hold the pressure plateau there.
      if(joinIn)t=Math.max(t,.3);if(joinOut)t=Math.min(t,.7);
      const c=inkContactProfile(contactMark,t,joinIn?s[i]+20:s[i],L,slow[i]*.25);pressure=c.pressure;dwell=c.dwell;
      // A short entry where the nib settles, longer release at the exit.
      pressure*=(joinIn?1:.3+.7*smooth(clamp(s[i]/entry)))*(joinOut?1:.14+.86*smooth(clamp((L-s[i])/exit)));
    }
    let nib=.025+(mark.width??.6)*(Math.pow(pressure,1.1)*(.55+.45*Math.abs(tx*.62-ty*.78))*(1+dwell)+.035*dwell);
    nib*=press*mix(range[0],range[1],slow[i])*(.86+.28*valueNoise((offset+s[i])/2.2+3,phase*.31));
    // Lost-and-found contour: heavy on the shadow flank, thin on the lit
    // shoulder, and lifted clean off the paper in places in the light.
    if(mark.lightBox){const lit=lightShade(points[i][0],points[i][1],mark.lightBox),lift=mix(1,smooth(clamp((valueNoise((offset+s[i])/28+(chainSeed??seed)*.01,7.7)-.3)/.12)),smooth(clamp((H.litLift-lit)/.12)));nib*=(.45+1.25*lit)*lift;}
    half[i]=Math.min(nib,.04+(mark.width??.6)*1.15);
  }
  // The pen comes back for the next flick: a small hook at the release.
  if(flick&&L>3&&sample(seed,71)<H.hook){
    const [,,tx,ty]=handNormal(points,points.length-1),turn=(sample(seed,72)<.5?-1:1)*mix(H.hookAngle[0],H.hookAngle[1],sample(seed,73)),len=clamp(L*.16,.8,3.2),n=4;
    hookPts=[];let x=points.at(-1)[0],y=points.at(-1)[1],ang=Math.atan2(ty,tx);
    for(let k=1;k<=n;k++){ang+=turn/n;x+=Math.cos(ang)*len/n;y+=Math.sin(ang)*len/n;hookPts.push([x,y]);}
  }
  let pts=points,halves=Array.from(half);
  if(hookPts){const h=halves.at(-1);pts=[...points,...hookPts];halves=[...halves,...hookPts.map((_,k)=>Math.max(h,HAND_LINE.minHalf*1.1)*(1-k*.12))];}
  const blobs=[];
  if(!noBlob&&!flick&&L>8&&kind==='contour'){
    const peak=Math.max(...halves);
    // The nib rests a moment before moving, or at a slow stop.
    if(!joinIn&&sample(seed,74+g)<H.blob){const [,,tx,ty]=handNormal(pts,0);blobs.push({x:pts[0][0]+tx*peak*1.3,y:pts[0][1]+ty*peak*1.3,r:peak*H.blobSize*(.8+.3*sample(seed,75+g)),tx,ty});}
    if(!joinOut&&slow.at(-1)>.35&&sample(seed,76+g)<.25){const [,,tx,ty]=handNormal(pts,pts.length-1);blobs.push({x:pts.at(-1)[0]-tx*peak*1.6,y:pts.at(-1)[1]-ty*peak*1.6,r:peak*H.blobSize*.8,tx,ty});}
  }
  return {points:pts,half:halves,restate,hook:!!hookPts,arc:[...s,...(hookPts?hookPts.map((_,k)=>L+k+1):[])].map(v=>order+v*(gestureLength/(L||1))),order,blobs};
}
// Ribbon outlines for the strokes, cut at arc length `upto` along the mark.
// Runs thinner than the nib's minimum are lifts; every outline is wound the
// same way so overlapping strokes in one batched path never cancel.
export function handStrokeOutlines(strokes,upto=Infinity){
  const out=[];
  const wound=poly=>{let a=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];a+=p[0]*q[1]-q[0]*p[1];}return a<0?poly.reverse():poly;};
  for(const stroke of strokes){
    if(stroke.order>upto)continue;
    let left=[],right=[];const flush=()=>{if(left.length>1)out.push(wound([...left,...right.reverse()]));left=[];right=[];};
    const {points,half,arc}=stroke,minHalf=Math.min(HAND_LINE.minHalf,.3*Math.max(...half));
    for(let i=0;i<points.length;i++){
      if(arc[i]>upto)break;
      if(half[i]<minHalf){flush();continue;}
      const [nx,ny]=handNormal(points,i),h=half[i];left.push([points[i][0]+nx*h,points[i][1]+ny*h]);right.push([points[i][0]-nx*h,points[i][1]-ny*h]);
    }
    flush();
    for(const blob of stroke.blobs)if(stroke.order<=upto){const poly=[];for(let k=0;k<12;k++){const a=k/12*TAU,u=Math.cos(a)*blob.r*1.6,v=Math.sin(a)*blob.r*.82;poly.push([blob.x+u*blob.tx-v*blob.ty,blob.y+u*blob.ty+v*blob.tx]);}out.push(wound(poly));}
  }
  return out;
}
export function paintInkData(size=64) {
  const paper=makePaper(size,size,{seed:77,fibres:.8,tooth:.8,mmPerCell:.06});
  const sheet=createSheet(paper,[BY_KEY.walnut]);
  const pen=createPen({nib:10,flex:10,reservoir:2400,wick:.08,feed:1.8,drop:0,starve:.06,patchy:.38,reach:2});
  for(let j=0;j<10;j++) {
    dipPen(pen,[.9]);
    penStroke(pen,sheet,[{x:-4,y:-4+j*8,p:.6,v:2},{x:size/2,y:-3+j*8,p:.8,v:1.3},{x:size+4,y:-4+j*8,p:.55,v:2}],{spacing:1.5});
  }
  return {size,layers:layersOf(sheet),paper};
}
function inkTexture() {
  const {size,layers}=paintInkData(),c=newCanvas(size,size),ctx=c.getContext('2d'),pixels=ctx.createImageData(size,size);
  const mass=new Float32Array(size*size);
  for(const layer of layers)for(let i=0;i<mass.length;i++)mass[i]+=layer[0][i];
  let mean=0;for(const value of mass)mean+=value;mean/=mass.length;
  for(let i=0;i<mass.length;i++) {
    pixels.data[i*4]=44;pixels.data[i*4+1]=36;pixels.data[i*4+2]=27;
    pixels.data[i*4+3]=Math.round(255*(.18+.82*(1-Math.exp(-mass[i]/(mean||1)*2.8))));
  }
  ctx.putImageData(pixels,0,0);return c;
}

const PREVIEW_INK='rgb(44,36,27)',PREVIEW_SPARSE_INK=new Set(['fibres','habitat','spines','lamella-shadow']);
// Which coloured preview a morph pair gets: 'field' for the transported body
// field between unlike recipes, 'study' for the native constructor between
// seeds of one recipe, null where the existing ink-only sketch still applies.
// Morph playback draws every frame, the last (blend 1) included, as the
// coloured preview; the landing keeps that frame until the new plate's
// painting crossfades over it. Otherwise a plate at rest is sketched in ink.
export function playbackColouring({playing=false,sketchPlaying=false}={}){return playing&&sketchPlaying?true:null;}
export function morphPreviewKind(pair){
  if(!pair||pair.orbitRest||pair.connectedAnatomy)return null;
  if(pair.implicitMorph)return pair.fieldPlate?null:'field';
  if(pair.fieldPlate?.supported||pair.sourceConnected||pair.targetConnected)return null;
  return pair.previewField?'field':null;
}
// Preview-only body field of a same-recipe pair. The page prepares it in a
// Worker; a synchronous build is the fallback (tests, frame cache Worker).
export function morphPreviewData(pair){
  pair.previewData??=createImplicitMorph(pair.a,pair.b,pair.composition,{view:pair.view,shapeModifiers:pair.shapeModifiers,nativeTargets:true});
  return pair.previewData;
}
export class Painter {
  constructor(canvas,{paper=null}={}) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');
    if(!this.ctx)throw new Error('Canvas 2D unavailable');
    this.paper=paper??makePaperTexture();this.sheetKey=paper?null:'cream:';this.materials=null;this.inkPaper=makeInkContactTexture();this.inkPattern='#30251c';
    this.paintLayer=null;this.surfaceLayer=null;this.frames=0;this.lastRenderMs=0;
    this.lamellarMasks=new WeakMap();this.granuleCache=new Map();this.paths=new WeakMap();this.cutouts=new WeakMap();this.shapeBounds=new WeakMap();this.textureCache=new Map();this.visibleInk=new WeakMap();
  }
  // One sheet per plate: rebuild the paper raster when the plate seed picks
  // a different stock or foxing.
  useSheet(seed){const sheet=PLATE_PASSES.value?paperSheetFor(seed):PAPER_SHEETS[0],key=`${sheet.id}:${sheet.foxing?seed:''}`;if(this.sheetKey===key)return false;this.paper=makePaperTexture(sheet,seed);this.sheetKey=key;return true;}
  path(shape) { let p=this.paths.get(shape);if(!p){p=polygon(shape);this.paths.set(shape,p);}return p; }
  regionPath(regions){this.regionPaths??=new WeakMap();let path=this.regionPaths.get(regions);if(!path){path=new Path2D();for(const shape of regions)path.addPath(this.path(shape));this.regionPaths.set(regions,path);}return path;}
  sketch(genome,{morph=null,blend=0,scene='plain',coloured=null,interactive=false}={}){
    // The coloured field preview belongs to a moving morph; a resting plate
    // (blend 0 or 1) is sketched in ink so its native painting streams live.
    const moving=coloured??(blend>0&&blend<1);
    if(morph&&moving&&morphPreviewKind(morph))return this.morphPreview(morph,blend,{scene});
    this.previewColoured=false;
    if(morph?.orbitRest&&ORBIT_DRAG_DISPLAY==='lines')return this.orbitLines(morph,{scene});
    const started=performance.now(),plan=morph?buildMorphSketch(morph,blend,{inkOnly:true,interactive:true,scene}):buildSketch(genome);
    this.lastPreviewGeometryMs=performance.now()-started;
    // Construction lines are stroked at the device resolution; while shapes
    // move or a drag holds, they are capped at the 1200 px sheet so hi-DPI
    // frames stay inside the frame budget.
    const cap=moving||interactive?1:Infinity,lw=Math.max(1,Math.min(1200*cap,this.canvas.width||600)),lh=Math.max(1,Math.min(1000*cap,this.canvas.height||500));
    if(!this.sketchLayer||Number.isFinite(this.sketchLayer.width)&&(this.sketchLayer.width!==lw||this.sketchLayer.height!==lh))this.sketchLayer=newCanvas(lw,lh);
    const layer=this.sketchLayer,c=layer.getContext('2d');
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.clearRect(0,0,lw,lh);c.drawImage(this.paper,0,0,lw,lh);c.scale(lw/1200,lh/1000);
    // The neutral spore deposit is pigment, so preview its existing islands
    // rather than inventing pen spokes or hiding it while the form moves.
    for(const body of plan.bodies??[])if(body.studyRole==='spore-deposit'){
      c.save();c.fillStyle='rgba(81,72,58,.16)';c.beginPath();
      for(const island of body.islands??[]){if(!island.length)continue;c.moveTo(...island[0]);for(const point of island.slice(1))c.lineTo(...point);c.closePath();}
      c.fill();c.restore();
    }
    if(plan.implicitMorph){
      for(const body of plan.bodies.filter(body=>Number.isInteger(body.individual))){c.save();c.clip(this.regionPath(body.islands));this.outside(c,plan.bodies.slice(body.individual+1).flatMap(other=>other.islands??[]),bounds(body.shape));for(const mark of plan.ink){if(mark.individual!==body.individual)continue;c.globalAlpha=clamp(mark.opacity??.6);c.strokeStyle='#554737';c.lineWidth=Math.max(.18,mark.width*.95);c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(...mark.points[0]);for(let i=1;i<mark.points.length;i++)c.lineTo(...mark.points[i]);c.stroke();}c.restore();}
    }
    c.strokeStyle='#65594a';c.lineCap='round';c.lineJoin='round';
    // One lightweight construction path, including disconnected subpaths.
    // Dense corals contain thousands of short branches: per-mark stroke calls
    // and exact clip stacks are much costlier than their geometry. Variable
    // pressure and full visibility remain part of the settled ink rendering.
    c.globalAlpha=.70;c.lineWidth=1.25;c.beginPath();
    for(let index=0;index<plan.ink.length;index++){if(plan.implicitMorph&&!plan.ink[index].fieldPlateId)continue;
      const mark=plan.ink[index];if(mark.points.length<2||mark.role==='teeth'&&index%3)continue;
      c.moveTo(...mark.points[0]);const stride=plan.correspondence?1:Math.max(1,Math.ceil(mark.points.length/48));
      for(let i=stride;i<mark.points.length;i+=stride)c.lineTo(...mark.points[i]);
      c.lineTo(...mark.points.at(-1));
    }
    c.stroke();
    if(plan.fieldPlate){c.globalAlpha=.65;c.fillStyle='#51483a';c.textAlign='center';c.font='italic 13px Georgia, serif';for(const note of plan.annotations??[])c.fillText(fieldFigureLabel(note),note.x,note.y);}
    const target=this.ctx;target.setTransform(1,0,0,1,0,0);target.globalAlpha=1;target.globalCompositeOperation='source-over';target.filter='none';
    target.clearRect(0,0,this.canvas.width,this.canvas.height);target.drawImage(layer,0,0,this.canvas.width,this.canvas.height);
    this.previewPlan=plan;this.previewFrames=(this.previewFrames??0)+1;this.lastPreviewMs=performance.now()-started;this.lastPreviewDrawMs=this.lastPreviewMs-this.lastPreviewGeometryMs;
    return plan;
  }
  // A coloured morph frame in the plate's visual language: paper, a fast
  // per-region wash under the ink, then ink at the plate's own resolution.
  // Every frame is drawn from geometry alone, so playback and scrubbing agree.
  morphPreview(morph,blend,{scene='plain'}={}){
    const started=performance.now(),t=clamp(blend);
    const plan=morph.implicitMorph?buildMorphSketch(morph,t,{inkOnly:true,interactive:true,scene}):framePagePlan(sampleImplicitMorph(morphPreviewData(morph),t),morph,t,scene);
    this.lastPreviewGeometryMs=performance.now()-started;
    const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';
    // Paper is resampled once per canvas size, then copied 1:1 each frame.
    const W=this.canvas.width,H=this.canvas.height;
    if(this.previewPaper?.width!==W||this.previewPaper?.height!==H||this.previewPaperSource!==this.paper){this.previewPaper=newCanvas(W,H);this.previewPaper.getContext('2d').drawImage(this.paper,0,0,W,H);this.previewPaperSource=this.paper;}
    c.clearRect(0,0,W,H);c.drawImage(this.previewPaper,0,0);
    c.setTransform(W/1200,0,0,H/1000,0,0);
    // Coloured preview wash disabled: it fell out of register with the ink (ghost washes).
    if(PREVIEW_FIELD_WASH)this.previewFieldWash(c,plan);
    this.previewInk(c,plan);
    if(plan.fieldPlate){c.globalAlpha=.65;c.fillStyle='#51483a';c.textAlign='center';c.font='italic 13px Georgia, serif';for(const note of plan.annotations??[])c.fillText(fieldFigureLabel(note),note.x,note.y);c.globalAlpha=1;}
    c.setTransform(1,0,0,1,0,0);
    this.previewPlan=plan;this.previewColoured=true;this.previewFrames=(this.previewFrames??0)+1;this.lastPreviewMs=performance.now()-started;this.lastPreviewDrawMs=this.lastPreviewMs-this.lastPreviewGeometryMs;
    return plan;
  }
  // A turning 3D body as clean pen work: hidden-line-removed contours, the
  // visible gill/pore/feature lines and light form hatching, stroked directly
  // at device resolution every frame (three batched paths, no textures).
  orbitLines(morph,{scene='plain'}={}){
    const started=performance.now(),plan=buildMorphSketch(morph,0,{inkOnly:true,interactive:true,scene});
    this.lastPreviewGeometryMs=performance.now()-started;
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height,kx=w/1200,ky=h/1000;
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';
    c.imageSmoothingEnabled=true;c.drawImage(this.paper,0,0,w,h);
    c.setTransform(kx,0,0,ky,0,0);c.strokeStyle=ORBIT_LINES.ink;c.lineCap='round';c.lineJoin='round';
    const groups={contour:new Path2D(),feature:new Path2D(),hatch:new Path2D()};
    for(const mark of plan.ink){const points=mark.points;if(!points||points.length<2)continue;
      const path=groups[orbitLineClass(mark.role)];path.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)path.lineTo(points[i][0],points[i][1]);}
    for(const name of ['hatch','feature','contour']){const pen=ORBIT_LINES[name];c.globalAlpha=pen.alpha;c.lineWidth=pen.width;c.stroke(groups[name]);}
    c.globalAlpha=1;c.setTransform(1,0,0,1,0,0);
    this.previewPlan=plan;this.previewFrames=(this.previewFrames??0)+1;this.lastPreviewMs=performance.now()-started;this.lastPreviewDrawMs=this.lastPreviewMs-this.lastPreviewGeometryMs;
    return plan;
  }
  previewFieldWash(c,plan){
    this.washRasters??=new Map();
    for(const body of plan.bodies??[]){
      const w=body.previewWash;if(!w||!Number.isInteger(body.individual))continue;
      const g=w.grid,key=`${g.width}x${g.height}`;let r=this.washRasters.get(key);
      if(!r){const canvas=newCanvas(g.width,g.height),ctx=canvas.getContext('2d');r={canvas,ctx,image:ctx.createImageData(g.width,g.height)};if(this.washRasters.size>8)this.washRasters.clear();this.washRasters.set(key,r);}
      const d=r.image.data,band=1.1*g.step,pool=2.6*g.step,t=w.t,a=w.a,b=w.b,field=w.field,offset=w.offset,clipped=Array.isArray(body.islands)&&body.islands.length>0;
      // Colour runs a little past the field edge; the body's own vector
      // outline clips it at device resolution, so the wash edge is as crisp
      // as the ink instead of a magnified grid.
      for(let i=0;i<g.cells;i++){
        const f=field[i]-offset,cov=clipped?(f<3*band?1:0):clamp(.5-f/(2*band)),o=i*4;if(cov<=0){d[o+3]=0;continue;}
        // Pigment gathers slightly at the wet edge of the moving region.
        const dark=1-.14*(f<0?Math.exp(f/pool):1),k=i*3;
        d[o]=(a[k]+(b[k]-a[k])*t)*dark;d[o+1]=(a[k+1]+(b[k+1]-a[k+1])*t)*dark;d[o+2]=(a[k+2]+(b[k+2]-a[k+2])*t)*dark;d[o+3]=cov*255;
      }
      r.ctx.putImageData(r.image,0,0);
      c.save();this.outside(c,plan.bodies.slice(body.individual+1).flatMap(other=>other.islands??[]),bounds(body.shape));
      if(clipped)c.clip(this.regionPath(body.islands));
      // The wash field lives in the unframed member space; follow the page fit.
      const frame=plan.pageFrame;if(frame)c.transform(frame.scale,0,0,frame.scale,frame.tx,frame.ty);
      c.globalCompositeOperation='multiply';c.imageSmoothingEnabled=true;
      c.drawImage(r.canvas,g.x+w.x-g.step/2,g.y+w.y-g.step/2,g.width*g.step,g.height*g.step);c.restore();
    }
  }
  // Batched vector ink. Clip and occlusion are set once per group (one per
  // member for a field morph); inside it, one stroke per opacity/width bucket.
  previewInk(c,plan){
    this.inkShapeIds??=new WeakMap();this.inkShapeCount??=0;
    const id=shape=>{if(!shape)return 0;let n=this.inkShapeIds.get(shape);if(!n){n=++this.inkShapeCount;this.inkShapeIds.set(shape,n);}return n;};
    const memberExclude=new Map(),excludeFor=mark=>{
      if(!plan.implicitMorph||!Number.isInteger(mark.individual))return mark.exclude??[];
      if(!memberExclude.has(mark.individual))memberExclude.set(mark.individual,(plan.bodies??[]).slice(mark.individual+1).flatMap(other=>other.islands??[]));
      return memberExclude.get(mark.individual);
    };
    const groups=new Map();
    for(let index=0;index<plan.ink.length;index++){
      const mark=plan.ink[index],pts=mark.points;if(!pts||pts.length<2)continue;
      if(PREVIEW_SPARSE_INK.has(mark.role)&&index%2)continue;
      const strong=['cap-contour','stem-contour','ring'].includes(mark.role),alpha=Math.round(clamp((mark.opacity??.6)*(strong?1.6:1.5))*16)/16;if(alpha<=0)continue;
      const width=Math.max(.3,Math.round((mark.width??.6)*1.1*5)/5),exclude=excludeFor(mark);
      const groupKey=`${id(mark.clip)}:${id(mark.clipRegions)}:${plan.implicitMorph?'m'+mark.individual:exclude.map(id).join(',')}`;
      let group=groups.get(groupKey);if(!group){group={clip:mark.clip,clipRegions:mark.clipRegions,exclude,batches:new Map(),x:Infinity,y:Infinity,r:-Infinity,b:-Infinity};groups.set(groupKey,group);}
      const key=`${alpha}:${width}`;let batch=group.batches.get(key);if(!batch){batch={path:new Path2D(),alpha,width};group.batches.set(key,batch);}
      const stride=Math.max(1,Math.floor(pts.length/96));batch.path.moveTo(pts[0][0],pts[0][1]);
      for(let i=stride;i<pts.length;i+=stride)batch.path.lineTo(pts[i][0],pts[i][1]);
      batch.path.lineTo(pts.at(-1)[0],pts.at(-1)[1]);
      if(group.exclude.length)for(let i=0;i<pts.length;i+=stride){const p=pts[i];if(p[0]<group.x)group.x=p[0];if(p[0]>group.r)group.r=p[0];if(p[1]<group.y)group.y=p[1];if(p[1]>group.b)group.b=p[1];}
    }
    c.strokeStyle=PREVIEW_INK;c.lineCap='round';c.lineJoin='round';
    for(const group of groups.values()){
      c.save();if(group.clip)c.clip(this.path(group.clip));if(group.clipRegions)c.clip(this.regionPath(group.clipRegions));
      if(group.exclude.length)this.outside(c,group.exclude,{x:group.x-2,y:group.y-2,w:group.r-group.x+4,h:group.b-group.y+4});
      for(const batch of group.batches.values()){c.globalAlpha=batch.alpha;c.lineWidth=batch.width;c.stroke(batch.path);}
      c.restore();
    }
    c.globalAlpha=1;
  }
  outside(c,shapes,region){
    // Subtract each occluder separately. A single even-odd path would turn
    // overlapping shelves or veil fragments into accidental transparent holes.
    for(const shape of shapes??[]){
      let b=this.shapeBounds.get(shape);if(!b){b=bounds(shape);this.shapeBounds.set(shape,b);}
      if(b.x>region.x+region.w||b.x+b.w<region.x||b.y>region.y+region.h||b.y+b.h<region.y)continue;
      let p=this.cutouts.get(shape);if(!p){p=new Path2D();p.rect(0,0,1200,1000);p.addPath(this.path(shape));this.cutouts.set(shape,p);}
      c.clip(p,'evenodd');
    }
  }
  inkStroke(mark,progress,batches=null) {
    if(mark.hiddenBy?.length){
      let fragments=this.visibleInk.get(mark);
      if(!fragments){fragments=visiblePathFragments(mark.points,mark.hiddenBy,lamellarSurfaces.get(mark)).map(points=>({...mark,points,hiddenBy:null}));for(const f of fragments)f.visibleLength=pathLength(f.points);this.visibleInk.set(mark,fragments);}
      let budget=fragments.reduce((sum,f)=>sum+f.visibleLength,0)*progress;
      for(const fragment of fragments){if(budget<=0)break;this.inkStroke(fragment,clamp(budget/(fragment.visibleLength||1)),batches);budget-=fragment.visibleLength;}
      return;
    }
    const c=this.ctx;if(!mark.points||mark.points.length<2||progress<=0)return;
    // The hand's strokes are fixed per mark; progress only says how far along
    // the mark the pen has reached.
    this.handStrokes??=new WeakMap();let strokes=this.handStrokes.get(mark);
    if(!strokes){strokes=handInkStrokes(mark);this.handStrokes.set(mark,strokes);}
    const outlines=handStrokeOutlines(strokes,progress>=1?Infinity:pathLength(mark.points)*progress);if(!outlines.length)return;
    const ribbon=new Path2D();for(const outline of outlines)ribbon.addPath(polygon(outline));
    const box=bounds(outlines.flat()),footprint={x:box.x-1,y:box.y-1,w:box.w+2,h:box.h+2},alpha=Math.min(1,mark.opacity*(['cap-contour','stem-contour','ring'].includes(mark.role)?1.6:1.5));
    if(batches){
      const shapeId=shape=>{if(!shape)return 0;let id=this.inkShapeIds.get(shape);if(!id){id=++this.inkShapeCount;this.inkShapeIds.set(shape,id);}return id;};
      const opacity=mark.nativeSelected?alpha:Math.round(alpha*24)/24,key=[shapeId(mark.clip),shapeId(mark.clipRegions),...(mark.exclude??[]).map(shapeId),opacity].join(':');
      let batch=batches.get(key);if(!batch){batch={path:new Path2D(),clip:mark.clip,clipRegions:mark.clipRegions,exclude:mark.exclude,opacity,footprint};batches.set(key,batch);}
      // Occlusion only matters where this batch deposits ink. Retain a one
      // unit antialias fringe; remote coral branches need no canvas clips.
      else {const b=batch.footprint,x=Math.min(b.x,footprint.x),y=Math.min(b.y,footprint.y);batch.footprint={x,y,w:Math.max(b.x+b.w,footprint.x+footprint.w)-x,h:Math.max(b.y+b.h,footprint.y+footprint.h)-y};}
      batch.path.addPath(ribbon);return;
    }
    c.save();if(mark.clip)c.clip(this.path(mark.clip));if(mark.clipRegions)c.clip(this.regionPath(mark.clipRegions));
    this.outside(c,mark.exclude,footprint);
    c.globalAlpha=alpha;c.fillStyle=this.inkPattern??=c.createPattern(this.inkPaper,'repeat');c.fill(ribbon);c.restore();
  }
  washTexture(mark) {
    // Optical mixtures use the transported Unpainting atlas, including paper
    // tooth and deposited pigment. This cache is bounded while seeds evolve.
    const isStipe=!mark.surface&&(mark.role==='stem'||mark.role==='stem-shadow');
    const shapeBox=isStipe?bounds(mark.shape):null;
    const profile=isStipe?Array.from({length:36},(_,row)=>{
      const yy=shapeBox.y+shapeBox.h*(row+.5)/36,crossings=[];
      for(let i=0;i<mark.shape.length;i++){const a=mark.shape[i],b=mark.shape[(i+1)%mark.shape.length];if((a[1]<=yy&&b[1]>yy)||(b[1]<=yy&&a[1]>yy))crossings.push((mix(a[0],b[0],(yy-a[1])/(b[1]-a[1]))-shapeBox.x)/(shapeBox.w||1));}
      return crossings.length?[Math.min(...crossings),Math.max(...crossings)]:[0,1];
    }):null;
    // Evaluate and identify the same exact inputs. Rounded keys paired with
    // unrounded sampling made a plate depend on the preceding morph frame.
    const key=JSON.stringify([mark.palette,mark.load,mark.role,mark.species,mark.phase,mark.cavity??null,mark.granulation,mark.variation,mark.wetness,profile,mark.volumes??null,mark.volumes?bounds(mark.shape):null,mark.surface?.kind,mark.surface?.ring,mark.surface?.openTop,mark.surface?.lighting]);
    if(this.textureCache.has(key))return this.textureCache.get(key);
    const {size,density,height,blooms}=this.materials.field,patch=newCanvas(size,size),p=patch.getContext('2d'),pixels=p.createImageData(size,size);
    let coralField;
    if(mark.volumes){
      coralField=new Float32Array(size*size).fill(.1);const box=bounds(mark.shape);
      // Model the united body on one continuous field. Transparent per-branch
      // overlays would expose crossings and introduce rectangular paint seams.
      for(const volume of mark.volumes){
        const [ax,ay]=volume.start,[bx,by]=volume.end,dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy),r=volume.radius;
        const minX=Math.max(0,Math.floor((Math.min(ax,bx)-r-box.x)/box.w*size)),maxX=Math.min(size-1,Math.ceil((Math.max(ax,bx)+r-box.x)/box.w*size));
        const minY=Math.max(0,Math.floor((Math.min(ay,by)-r-box.y)/box.h*size)),maxY=Math.min(size-1,Math.ceil((Math.max(ay,by)+r-box.y)/box.h*size));
        for(let yy=minY;yy<=maxY;yy++)for(let xx=minX;xx<=maxX;xx++){
          const px=box.x+xx/(size-1)*box.w,py=box.y+yy/(size-1)*box.h,t=clamp(((px-ax)*dx+(py-ay)*dy)/(length*length||1)),radius=r*(1-t*.4),cx=mix(ax,bx,t),cy=mix(ay,by,t),distance=Math.hypot(px-cx,py-cy);
          if(distance>radius)continue;
          const side=clamp(((px-cx)*(-dy)+(py-cy)*dx)/(length*radius||1),-1,1),round=Math.sqrt(Math.max(0,1-(distance/radius)**2));
          const value=.035+(1-round)*.75+clamp(side+.16)*1.15+(1-t)*.1,blend=smooth(clamp(t/.13));
          coralField[yy*size+xx]=mix(coralField[yy*size+xx],value,blend);
        }
      }
    }
    const entries=Object.entries(mark.palette),sum=entries.reduce((n,[,w])=>n+w,0);
    const K=[0,0,0],S=[0,0,0];
    for(let c=0;c<3;c++)for(const [pigment,weight] of entries){K[c]+=BY_KEY[pigment].K[c]*weight/sum;S[c]+=BY_KEY[pigment].S[c]*weight/sum;}
    // The native brush/transport mass field supplies pigment density. Resolve
    // each pixel through Kubelka–Munk, rather than a gradient or RGB overlay.
    const lut=new Uint8Array(256*3);
    for(let j=0;j<256;j++)for(let c=0;c<3;c++){
      const [r,t]=layerRT(K[c],S[c],j/255*2);lut[j*3+c]=Math.round(255*clamp(r+t*t/(1-r)));
    }
    // A scarlet cap weathers toward warm ochre at the margin. Mix pigments in
    // optical space, across the wet field, without painting a crisp color ring.
    let scarlet;
    if(mark.species==='amanita'&&mark.role==='cap'){
      scarlet=new Uint8Array(24*256*3);
      for(let shade=0;shade<24;shade++)for(let j=0;j<256;j++)for(let c=0;c<3;c++){
        const warm=shade/23*.61,k=mix(K[c],BY_KEY.ochre.K[c]*.63+BY_KEY.hansa.K[c]*.37,warm),s=mix(S[c],BY_KEY.ochre.S[c]*.63+BY_KEY.hansa.S[c]*.37,warm);
        const [r,t]=layerRT(k,s,j/255*2);scarlet[(shade*256+j)*3+c]=Math.round(255*clamp(r+t*t/(1-r)));
      }
    }
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=y*size+x,u=x/(size-1),v=y/(size-1);
      const nx=(u-.5)*1.7,ny=(v-.5)*1.4,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
      const light=clamp(-.45*nx-.65*ny+.6*nz);
      let model=.35+1.35*(1-light);
      if(mark.role==='cap')model=.65+.7*(1-light);
      if(mark.role==='cap-turn'||mark.role==='cap-glaze')model=.48+v*.5+valueNoise(u*4,v*3+mark.phase*.2)*.23;
      const rowAt=v*35,ra=profile?.[Math.floor(rowAt)],rb=profile?.[Math.min(35,Math.ceil(rowAt))];
      const row=ra?[mix(ra[0],rb[0],rowAt%1),mix(ra[1],rb[1],rowAt%1)]:null,roundU=row?clamp((u-row[0])/(row[1]-row[0]||1)):u;
      if(mark.role==='stem')model=.06+Math.pow(roundU,2)*.9;
      if(mark.role==='stem-shadow'){const side=clamp((roundU-.26)/.74);model=.02+side*side*(3-2*side)*1.2+.55*Math.exp(-v/.07);}
      if(mark.role==='puffball')model=.06+Math.pow(1-nz,1.2)*.7+Math.max(0,nx*.8+ny*.5)*1.6;
      if(mark.role==='coral')model=coralField[i];
      if(mark.role==='folded-body')model=.65+u*.55+v*.2;
      if(mark.role==='funnel-cap')model=.5+.75*Math.exp(-((u-.52)**2/.09+(v-.32)**2/.19))+u*.35;
      if(mark.role==='cavity'){
        const overhang=Math.exp(-((v-.11-u*.09)**2/.026))*(1-u*.45);
        const wall=Math.exp(-((u-.13-v*.1)**2/.02))*(1-v*.65);
        model=.45+overhang*(.9+sample(mark.cavity,74)*.8)+wall*.7+(1-v)*.35;
      }
      if(mark.surface?.kind==='cap'){
        const sx=u*2-1,arc=Math.sqrt(Math.max(0,1-sx*sx)),angle=v*Math.PI*.5;
        const lighting=mark.surface.lighting,lu=u*20,lv=v*16,li=Math.min(19,Math.floor(lu)),lj=Math.min(15,Math.floor(lv));
        const illumination=lighting?mix(mix(lighting[li][lj],lighting[li+1][lj],lu-li),mix(lighting[li][lj+1],lighting[li+1][lj+1],lu-li),lv-lj):clamp(-sx*.48+arc*Math.cos(angle)*.62+arc*Math.sin(angle)*.61);
        const turn=smooth(clamp((v-.67)/.33));
        model=mark.role==='cap-turn'?.05+Math.pow(1-illumination,1.3)*1.4+turn*.55:.38+(1-illumination)*1.38;
      }
      if(mark.surface?.kind==='underside'){
        const recess=Math.exp(-((u-.5)**2/.034+(v-.35)**2/.055));
        model=.18+(1-v)*.28+recess*.95;
      }
      if(mark.surface?.kind==='stem'){
        const sx=u*2-1,round=Math.sqrt(Math.max(0,1-sx*sx)),illumination=clamp(-sx*.55+round*.83);
        const contact=(mark.surface.openTop?0:.55*Math.exp(-v/.055))+(mark.surface.ring===null?0:.65*Math.exp(-(((v-mark.surface.ring-.065)/.04)**2)));
        model=mark.role==='stem-shadow'?.02+Math.pow(1-illumination,1.6)*1.35+contact:.12+Math.pow(1-illumination,1.1)*.85;
      }
      const source=mark.role==='cavity'?((y+mark.cavity*19)%size)*size+(x+mark.cavity*31)%size:i;
      // A broad brush passage follows the rounded cap, rather than stretching
      // the same rectangular transported reserve over every specimen. Rotate
      // its sampling continuously with the inherited phase; bilinear sampling
      // keeps both the pigment mass and seed interpolation continuous.
      let deposited=density[source],bloom=blooms[source];
      if(mark.surface?.kind==='cap'){
        const longitude=Math.asin(clamp(u*2-1,-1,1)),latitude=v*Math.PI*.5;
        const px=longitude/Math.PI,py=(latitude/Math.PI-.25)*1.6;
        const angle=.45*Math.sin(mark.phase),ca=Math.cos(angle),sa=Math.sin(angle);
        const tx=clamp(.5+px*ca-py*sa,.001,.999)*(size-1),ty=clamp(.5+px*sa+py*ca,.001,.999)*(size-1);
        const ix=Math.floor(tx),iy=Math.floor(ty),fx=tx-ix,fy=ty-iy;
        const sampleField=field=>mix(mix(field[iy*size+ix],field[iy*size+ix+1],fx),mix(field[(iy+1)*size+ix],field[(iy+1)*size+ix+1],fx),fy);
        deposited=sampleField(density);bloom=sampleField(blooms);
      }
      const transport=Math.max(.02,deposited),settled=(.25+Math.pow(transport,.85+mark.wetness*.45)*(.66+mark.variation*.34));
      const native=settled*(.48+bloom*(.68+mark.variation*.35));
      const amount=mark.load*model*native;
      const j=Math.round(clamp(amount/2)*255)*3;
      const warm=scarlet?Math.round(clamp((v*v*.65-.10))*23):0,colors=scarlet??lut,offset=warm*256*3+j;
      pixels.data[i*4]=colors[offset];pixels.data[i*4+1]=colors[offset+1];pixels.data[i*4+2]=colors[offset+2];pixels.data[i*4+3]=255;
    }
    p.putImageData(pixels,0,0);
    if(this.textureCache.size>48)this.textureCache.delete(this.textureCache.keys().next().value);
    this.textureCache.set(key,patch);return patch;
  }
  surfaceTexture(mark,box){
    const layer=this.surfaceLayer,c=layer.getContext('2d'),texture=this.washTexture(mark),size=texture.width;
    c.clearRect(0,0,1200,1000);
    const rails=mark.surface.rails,n=rails.length-1,stem=mark.surface.kind==='stem';
    const triangle=(src,dst)=>{
      const [a,b,d]=src,[p,q,r]=dst,dx1=b[0]-a[0],dy1=b[1]-a[1],dx2=d[0]-a[0],dy2=d[1]-a[1],det=dx1*dy2-dy1*dx2;
      if(Math.abs(det)<1e-8)return;
      const aa=((q[0]-p[0])*dy2-(r[0]-p[0])*dy1)/det,cc=((r[0]-p[0])*dx1-(q[0]-p[0])*dx2)/det;
      const bb=((q[1]-p[1])*dy2-(r[1]-p[1])*dy1)/det,dd=((r[1]-p[1])*dx1-(q[1]-p[1])*dx2)/det;
      // Shared edges overlap by a fraction of a pixel to avoid raster seams.
      const cx=(p[0]+q[0]+r[0])/3,cy=(p[1]+q[1]+r[1])/3;
      c.save();c.beginPath();for(let j=0;j<3;j++){const pt=dst[j],dx=pt[0]-cx,dy=pt[1]-cy,len=Math.hypot(dx,dy)||1,x=pt[0]+dx/len*.45,y=pt[1]+dy/len*.45;j?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();c.clip();
      c.setTransform(aa,bb,cc,dd,p[0]-aa*a[0]-cc*a[1],p[1]-bb*a[0]-dd*a[1]);c.drawImage(texture,0,0);c.restore();
    };
    if(mark.surface.mesh){
      const mesh=mark.surface.mesh,bands=mesh[0].length-1;
      for(let i=0;i<n;i++)for(let j=0;j<bands;j++){
        const x=i/n*size,xx=(i+1)/n*size,y=j/bands*size,yy=(j+1)/bands*size;
        triangle([[x,y],[xx,y],[x,yy]],[mesh[i][j],mesh[i+1][j],mesh[i][j+1]]);
        triangle([[xx,y],[xx,yy],[x,yy]],[mesh[i+1][j],mesh[i+1][j+1],mesh[i][j+1]]);
      }
    }else for(let i=0;i<n;i++){
      const t0=i/n*size,t1=(i+1)/n*size,a=rails[i][0],b=rails[i+1][0],d=rails[i][1],e=rails[i+1][1];
      const sa=stem?[0,t0]:[t0,0],sb=stem?[0,t1]:[t1,0],sd=stem?[size,t0]:[t0,size],se=stem?[size,t1]:[t1,size];
      triangle([sa,sb,sd],[a,b,d]);triangle([sb,se,sd],[b,e,d]);
    }
    return layer;
  }
  washStroke(mark,progress) {
    const c=this.paintLayer.getContext('2d'),pts=partialPath(mark.points,progress),box=bounds(mark.shape);
    if(pts.length<2)return;
    const crop={x:Math.floor(box.x)-3,y:Math.floor(box.y)-3,w:Math.ceil(box.w)+6,h:Math.ceil(box.h)+6};
    if(this.lastPaintCrop){const last=this.lastPaintCrop;c.clearRect(last.x,last.y,last.w,last.h);}
    c.clearRect(crop.x,crop.y,crop.w,crop.h);c.save();c.clip(this.path(mark.shape));
    if(mark.islands){const islands=new Path2D();for(const island of mark.islands)islands.addPath(this.path(island));c.clip(islands);}
    this.outside(c,mark.reserves,box);
    c.lineWidth=mark.width;c.lineCap='round';c.lineJoin='round';c.strokeStyle='#000';
    c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();
    c.globalCompositeOperation='source-in';
    if(mark.surface)c.drawImage(this.surfaceTexture(mark,box),0,0);
    else c.drawImage(this.washTexture(mark),box.x,box.y,Math.max(1,box.w),Math.max(1,box.h));
    if(mark.role==='pit-shadow'){
      c.globalCompositeOperation='source-atop';
      for(let i=0;i<mark.islands.length;i++){
        const island=mark.islands[i],b=bounds(island);c.save();c.clip(this.path(island));
        // Each depression has its own recessed value mass, resolved through the
        // native deposited pigment field. Eight cached variants avoid per-frame
        // fluid solves without turning the entire cap into a flat mosaic.
        c.drawImage(this.washTexture({...mark,role:'cavity',cavity:i%8}),b.x,b.y,Math.max(1,b.w),Math.max(1,b.h));
        c.restore();
      }
    }
    // Native paper contact remains at a fixed physical scale across every
    // specimen, independent of the aspect ratio of the broad pigment passage.
    c.globalCompositeOperation='source-atop';c.globalAlpha=.32+mark.granulation*.28;
    c.fillStyle=this.grainPattern??=c.createPattern(this.materials.grain,'repeat');c.fillRect(box.x,box.y,box.w,box.h);c.globalAlpha=1;
    // Fine sediment is resolved at sheet scale, never stretched with the cap.
    const granuleKey=JSON.stringify([mark.palette,Math.round(mark.load*20)]);
    let granule=this.granuleCache.get(granuleKey);
    if(!granule){
      const tile=newCanvas(144,144),tc=tile.getContext('2d');tc.fillStyle=pigmentColor(mark.palette,mark.load*2.8);tc.fillRect(0,0,144,144);
      tc.globalCompositeOperation='destination-in';tc.drawImage(this.materials.granules,0,0);
      granule=c.createPattern(tile,'repeat');if(this.granuleCache.size>48)this.granuleCache.delete(this.granuleCache.keys().next().value);this.granuleCache.set(granuleKey,granule);
    }
    c.globalAlpha=.16+mark.granulation*.3;c.fillStyle=granule;c.fillRect(box.x,box.y,box.w,box.h);c.globalAlpha=1;
    // Pigment gathers unevenly at the pinned wet perimeter. A fixed dash
    // pattern reads as printed decoration, so each short contact has its own
    // width and loading, coupled to this passage's water and pooling traits.
    c.globalCompositeOperation='source-atop';c.lineCap='round';c.lineJoin='round';
    const poolEdge=(shape,reserve=false)=>{
      let start=0,contact=0;
      while(start<shape.length-1){
        const end=Math.min(shape.length-1,start+4+Math.floor(sample(contact,301)*8));
        const wet=clamp(sample(contact,302)+Math.sin(mark.phase+contact*.37)*.15),load=mark.load*(1.3+wet*2.1);
        c.strokeStyle=pigmentColor(mark.palette,load,(reserve?.035:.07)+wet*mark.pooling*(reserve?.16:.35));
        c.lineWidth=(reserve?.6:1)+(reserve?1:2.8)*wet*(.3+mark.wetness*.7);
        c.beginPath();for(let j=start;j<=end;j++)j===start?c.moveTo(...shape[j]):c.lineTo(...shape[j]);c.stroke();
        start=end+1+Math.floor(sample(contact,303)*4);contact++;
      }
    };
    poolEdge(mark.shape);
    for(let i=0;i<(mark.reserves?.length??0);i++)if(i%3===0)poolEdge(mark.reserves[i],true);
    // A softly lost upper veil wash joins the continuous stipe pigment.
    // Attenuate deposited paint, including sediment and pinned-edge pigment,
    // instead of painting a pale stripe over the dry drawing.
    if(mark.fadeTop){
      const fade=c.createLinearGradient(0,box.y,0,box.y+box.h*mark.fadeTop);
      fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(1,'rgba(0,0,0,1)');
      c.globalCompositeOperation='destination-in';c.fillStyle=fade;c.fillRect(box.x,box.y,box.w,box.h);
    }
    if(mark.veilTurn){
      const turn=c.createLinearGradient(box.x,0,box.x+box.w,0);
      turn.addColorStop(0,'rgba(0,0,0,.95)');
      turn.addColorStop(mark.veilTurn,'rgba(0,0,0,.24)');
      turn.addColorStop(Math.min(.84,mark.veilTurn+.27),'rgba(0,0,0,.4)');
      turn.addColorStop(1,'rgba(0,0,0,1)');
      c.globalCompositeOperation='destination-in';c.fillStyle=turn;c.fillRect(box.x,box.y,box.w,box.h);
    }
    if(mark.depthFaces){
      let mask=this.lamellarMasks.get(mark);
      if(!mask){
        const coverage=lamellarCoverage(mark.depthFaces,box),canvas=newCanvas(coverage.width,coverage.height),ctx=canvas.getContext('2d');
        const pixels=ctx.createImageData(coverage.width,coverage.height);
        for(let i=0;i<coverage.alpha.length;i++)pixels.data[i*4+3]=coverage.alpha[i];
        ctx.putImageData(pixels,0,0);mask={canvas,x:coverage.x,y:coverage.y};this.lamellarMasks.set(mark,mask);
      }
      c.globalCompositeOperation='destination-in';c.drawImage(mask.canvas,mask.x,mask.y);
    }
    c.restore();
    this.lastPaintCrop=crop;
    this.ctx.save();this.ctx.globalCompositeOperation='multiply';
    // The brush edge may cross the dry pen by a fraction of a millimeter. Ink
    // remains fixed and crisp; pigment is allowed a narrow, soft wet boundary.
    this.ctx.filter=`blur(${((.22+mark.softness*.4)*this.canvas.width/1200).toFixed(2)}px)`;
    this.ctx.drawImage(this.paintLayer,crop.x,crop.y,crop.w,crop.h,crop.x,crop.y,crop.w,crop.h);this.ctx.restore();
  }
  draw(genome,{stage=1,moving=false,scene='plain',study=null}={}) {
    if(stage>.64)throw new Error('Finished paintings must use the native Worker pipeline');
    this.previewPlan=null;
    const started=performance.now(),c=this.ctx,key=JSON.stringify([genome.family,genome.profileId,genome.donorId,genome.values,scene]);
    if(study||key!==this.planKey){this.plan=study??buildStudy(genome,{scene});this.planKey=key;this.paths=new WeakMap();this.inkShapeIds=new WeakMap();this.inkShapeCount=0;this.weights=this.plan.ink.map(s=>Math.max(6,pathLength(s.points)));this.totalWeight=this.weights.reduce((a,b)=>a+b,0);}
    c.setTransform(this.canvas.width/1200,0,0,this.canvas.height/1000,0,0);
    c.clearRect(0,0,1200,1000);c.drawImage(this.paper,0,0,1200,1000);
    const inkEnd=.64,inkProgress=clamp(stage/inkEnd),washProgress=clamp((stage-inkEnd)/(1-inkEnd));
    let budget=inkProgress*this.totalWeight;const inkBatches=new Map();
    for(let i=0;i<this.plan.ink.length&&budget>0;i++){
      const mark=this.plan.ink[i];
      // Preserve every structural line during motion. Subpixel surface texture
      // is sampled more sparsely and restored on the settled, complete plate.
      if(!moving||!['fibres','habitat','spines','lamella-shadow'].includes(mark.role)||i%2===0)this.inkStroke(mark,clamp(budget/this.weights[i]),inkBatches);
      budget-=this.weights[i];
    }
    for(const batch of inkBatches.values()){
      c.save();if(batch.clip)c.clip(this.path(batch.clip));if(batch.clipRegions)c.clip(this.regionPath(batch.clipRegions));this.outside(c,batch.exclude,batch.footprint);
      c.globalAlpha=batch.opacity;c.fillStyle=this.inkPattern??=c.createPattern(this.inkPaper,'repeat');c.fill(batch.path);c.restore();
    }
    for(let i=0;i<this.plan.washes.length;i++){const p=clamp(washProgress*this.plan.washes.length-i);if(p>0)this.washStroke(this.plan.washes[i],p);}
    if(stage>=1){
      for(const note of this.plan.annotations??[])if(note.fieldPlateId!=='adjunct:reference-note'){c.fillStyle='rgba(61,56,43,.63)';c.textAlign='center';c.font='italic 13px Georgia, serif';c.fillText(fieldFigureLabel(note),note.x,note.y);}
      drawPlateCaption(c,this.plan.pageCaption,genome,plateNoteText(this.plan,genome.fictional?'FICTIONAL HYBRID · PROCEDURAL FIELD STUDY':'PROCEDURAL FIELD STUDY'));
    }
    this.frames++;this.lastRenderMs=performance.now()-started;
    this.stage=stage;this.phase=stage>=1?'Complete':stage<inkEnd?'Ink':'Watercolor';
  }
}

// One persistent native sheet; live previews never stand in for final optics.
// Moving-preview cadence of the settle Worker. Each checkpoint samples, mixes
// and transfers a full device-pixel frame, so at the 512-cell wash grid this
// is ~9 fps rather than 15: the same physics, ~30% fewer frames to move.
export const NATIVE_CHECKPOINT_MS=110;
// Wash stages stream at the settled plate's own quality (vector-edge resolve,
// cubic upsample, paper settling, labels): fewer frames, each one final-grade,
// so the finished plate does not snap into focus.
export const NATIVE_FULL_FRAME_MS=700;
// With the parallel composer, wash frames stream at about this interval.
export const NATIVE_COMPOSED_FRAME_MS=400;
// Presentation pacing of the settle stream (ink reveal, brush deposits). It
// only spaces frames in time; the transported pigment and final pixels do not
// depend on it. Shortened from 1500/750 ms to pay for the 512-cell wash grid,
// form glazes and cast shadows while keeping a full settle under ~8 s.
export const NATIVE_PACING=Object.freeze({inkMs:1100,depositMs:450,turnedInkMs:250});
// The settle stream's pacing. After a turn the drawing's lines are already on
// screen, so the repaint lays its ink almost at once and its washes unpaced.
export function settlePacing({turned=false}={}){return turned?{inkMs:NATIVE_PACING.turnedInkMs,depositMs:0}:{inkMs:NATIVE_PACING.inkMs,depositMs:NATIVE_PACING.depositMs};}
export const NATIVE_PAINT_LIMITS=Object.freeze({width:512,maxCells:218624,maxChannels:14,maxCheckpoints:12,cacheBytes:24*1024*1024,maxSteps:5000,maxMs:30000});
export const NATIVE_TRANSPORT=Object.freeze({dt:.6,flowIters:1,evap:.01,paperDry:.006,edgeEvap:.009,gran:2});

// Existing coral branch tubes retain their projected anatomy. Selected broad
// flank strokes add native pigment on the lower/right side, after the pale wash.
// This is a 2.5D paint plan, not a new camera or post-render lighting operation.
export function nativeCoralGlazes(washes,{maxMarks=12}={}){
  const sources=washes.filter(m=>m.role==='coral'&&m.volumes?.length&&m.shape?.length&&m.palette);
  if(!sources.length)return [];
  const quota=Math.max(1,Math.floor(maxMarks/sources.length)),marks=[];
  for(const source of sources){
    const islands=source.islands??[],boxes=islands.map(bounds);
    const candidates=source.volumes.map((volume,index)=>({volume,index,length:Math.hypot(volume.end[0]-volume.start[0],volume.end[1]-volume.start[1])}))
      .filter(q=>q.volume.radius>=6&&q.length>=15)
      .sort((a,b)=>b.length*b.volume.radius-a.length*a.volume.radius||a.index-b.index).slice(0,quota);
    // Restore authored back-to-front order after selecting the largest tubes.
    candidates.sort((a,b)=>a.index-b.index);
    for(const {volume,index,length} of candidates){
      if(marks.length>=maxMarks)break;
      const {start,end,radius}=volume,dx=(end[0]-start[0])/length,dy=(end[1]-start[1])/length;
      let nx=-dy,ny=dx;if(nx+ny<0){nx=-nx;ny=-ny;}
      const points=Array.from({length:11},(_,i)=>{
        const t=.07+i/10*.85,offset=radius*(1-.4*t)*(.25+.15*Math.sin(Math.PI*t));
        return [mix(start[0],end[0],t)+nx*offset,mix(start[1],end[1],t)+ny*offset];
      });
      const shape=islands[index]??source.shape,b=boxes[index]??bounds(shape);
      const nearer=islands.filter((_,j)=>j>index&&boxes[j].x<b.x+b.w&&boxes[j].x+boxes[j].w>b.x&&boxes[j].y<b.y+b.h&&boxes[j].y+boxes[j].h>b.y);
      marks.push({...source,role:'coral-shadow',shape,islands:islands[index]?[islands[index]]:source.islands,
        reserves:[...(source.reserves??[]),...nearer],points,width:radius*.70,
        palette:{...source.palette,umber:(source.palette.umber??0)+.35,sienna:(source.palette.sienna??0)+.15},
        load:.085+(source.load??.2)*.12,wetness:clamp((source.wetness??.6)*.75),
        softness:Math.max(.6,source.softness??.5),granulation:(source.granulation??.5)*.45,
        volumes:undefined,nativeTubeIndex:index});
    }
  }
  return marks;
}

// Grounding. A field drawing sets each specimen on its support with two
// separate native passages: a pale cast-shadow glaze thrown away from the
// upper-left light along the ground plane, and a small darker contact accent
// tucked under the base. Both are real brush marks with reserves for every
// body, so the shadow sits behind the specimen and dries with its own edge.
const GROUND_EXCLUDED=/^background|ground|habitat|shadow|turn|glaze|section|spore|deposit|scales|reticulum|warts|cuticle|accent|fissure|pit/;
// Grounding in pen, as many period plates do it: under each foot a few
// broken, roughly horizontal hatch strokes on the shadow side, their number,
// length, spacing and weight different for every specimen. Many sheets carry
// nothing more than this and a dark touch where the stem meets the ground.
export function nativeGroundHatching(study){
  // A plate with a habitat setting or substrate wood is already grounded:
  // its feet stand in drawn litter, grass or moss, or on bark.
  if(study.habitatSetting)return [];
  const feet=nativeSpecimenFeet(study),ink=[];
  for(const f of feet){
    const {cx,y,half,box,seed,all}=f,count=3+Math.floor(valueNoise(seed,1.1)*4.99),reach=Math.max(half*2.2,Math.min(box.w*.5,box.h*.4));
    for(let k=0;k<count;k++){
      const yy=y+1.5+k*(2.6+1.8*valueNoise(seed+k,2.2)),lead=half*(.3+.9*valueNoise(seed+k,3.3)),len=reach*(.35+.75*valueNoise(seed+k,4.4))*(1-k*.08);
      const x0=cx-half*(.9-.5*valueNoise(seed+k,5.5))-(k%2?lead*.3:0),x1=Math.max(x0+6,cx+lead+len);
      const pieces=valueNoise(seed+k,6.6)<.45?2:1;
      for(let q=0;q<pieces;q++){
        const a=q?mix(x0,x1,.55+.1*valueNoise(seed+k,7.7)):x0,b=pieces===2&&!q?mix(x0,x1,.48):x1,n=8;
        const points=Array.from({length:n+1},(_,i)=>{const t=i/n,x=mix(a,b,t);return[x,yy+(valueNoise(x*.05+seed,k*.9)-.5)*1.6+t*(valueNoise(seed+k,8.8)-.5)*3];});
        ink.push({points,role:'ground-hatch',width:.45+.35*valueNoise(seed+k*1.3,9.9),opacity:.38+.32*(1-k/count),phase:seed+k*1.7+q,clip:null,exclude:all,individual:f.individual,nativeSelected:true});
      }
    }
  }
  return ink;
}
export function nativeSpecimenFeet(study){
  const bodies=new Map(),all=[];
  for(const mark of study.washes??[]){
    if(mark.studyRole&&!/habit/.test(mark.studyRole))continue;
    if(!mark.shape?.length||!mark.palette||GROUND_EXCLUDED.test(mark.role??''))continue;
    const polys=(mark.islands?.length?mark.islands:[mark.shape]).filter(p=>p?.length>2);
    const key=Number.isInteger(mark.individual)?mark.individual:-1;
    if(!bodies.has(key))bodies.set(key,{polys:[]});
    bodies.get(key).polys.push(...polys);all.push(...polys);
  }
  const feet=[];
  for(const [key,{polys}] of [...bodies.entries()].sort((a,b)=>a[0]-b[0])){
    const points=polys.flat().filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));if(points.length<3)continue;
    const box=bounds(points);if(box.w<8||box.h<8)continue;
    const foot=points.filter(p=>p[1]>box.y+box.h*.94),left=Math.min(...foot.map(p=>p[0])),right=Math.max(...foot.map(p=>p[0]));
    feet.push({individual:key<0?undefined:key,cx:(left+right)/2,y:box.y+box.h,half:Math.max(5,(right-left)/2),box,seed:key*7.31+box.x*.013,all});
  }
  return feet;
}
export const GROUND_STYLE=Object.freeze({wash:false,hatch:true});
export function nativeGroundingWashes(study){
  const bodies=new Map(),all=[];
  for(const mark of study.washes??[]){
    if(mark.studyRole&&!/habit/.test(mark.studyRole))continue;
    if(!mark.shape?.length||!mark.palette||GROUND_EXCLUDED.test(mark.role??''))continue;
    const polys=(mark.islands?.length?mark.islands:[mark.shape]).filter(p=>p?.length>2);
    const key=Number.isInteger(mark.individual)?mark.individual:-1;
    if(!bodies.has(key))bodies.set(key,{polys:[],mark});
    bodies.get(key).polys.push(...polys);all.push(...polys);
  }
  const out=[],scene=study.scene&&study.scene!=='plain';
  for(const [key,{polys,mark}] of [...bodies.entries()].sort((a,b)=>a[0]-b[0])){
    const points=polys.flat().filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));if(points.length<3)continue;
    const box=bounds(points);if(box.w<8||box.h<8)continue;
    const foot=points.filter(p=>p[1]>box.y+box.h*.94);
    const left=Math.min(...foot.map(p=>p[0])),right=Math.max(...foot.map(p=>p[0]));
    const half=Math.max(5,(right-left)/2),cx=(left+right)/2,y=box.y+box.h,seed=key*7.31+box.x*.013;
    // Throw length grows with specimen height (a low sun from upper left).
    const reach=Math.max(half*2.2,Math.min(box.w*.62,box.h*.55)),ry=Math.max(4,Math.min(16,reach*.13));
    const blob=(x0,x1,yc,h,salt)=>Array.from({length:48},(_,i)=>{
      const a=i/48*TAU,wobble=1+.2*(valueNoise(Math.cos(a)*1.9+salt,Math.sin(a)*1.9+seed)-.5)*2+.07*Math.sin(a*3+salt+seed)+.05*Math.sin(a*7+salt*2.3);
      const cxx=(x0+x1)/2,rx=(x1-x0)/2,lower=Math.sin(a)>0?1.05:.75;
      return[cxx+Math.cos(a)*rx*wobble,yc+Math.sin(a)*h*wobble*lower];
    });
    const base={individual:key<0?undefined:key,phase:mark.phase??0,granulation:.55,wetness:.55,pooling:.75,softness:.35,variation:.5,reserves:all};
    // The ground is a few dragged strokes of earth colour under the foot, not
    // a projected silhouette: a ragged patch whose edges break where a drier
    // brush skips, its extent and lean different for every specimen.
    const lean=.15+.45*valueNoise(seed,2.7),spread=half*(1.4+.8*valueNoise(seed+3.3,.4))+reach*(.15+.3*lean);
    const pool=blob(cx-spread*(.7-lean*.3),cx+spread*(1+lean*.5),y+ry*.05,ry*(.65+.4*valueNoise(seed+8.1,1.9)),1.3),cb=bounds(pool);
    const strokes=Array.from({length:2+Math.floor(valueNoise(seed+.7,4.4)*2.99)},(_,k)=>{const yy=cb.y+cb.h*(.3+.22*k+.08*(valueNoise(seed+k,5.5)-.5)),x0=cb.x+cb.w*.06*valueNoise(seed+k,6.1),x1=cb.x+cb.w*(1-.18*valueNoise(seed+k,7.7)*(k===2?2:1));return Array.from({length:6},(_,i)=>{const t=i/5;return[mix(x0,x1,t),yy+(valueNoise(seed*1.7+t*3,k)-.5)*cb.h*.25];});});
    if(GROUND_STYLE.wash)out.push({...base,role:'ground-shadow',shape:pool,points:strokes[0],groundStrokes:strokes,width:cb.h*1.1+6,
      palette:{umber:.48+.12*valueNoise(seed,9.9),ochre:.3,paynes:.12+.16*valueNoise(seed+2,9.1)},load:(scene?.07:.1)*(.7+.6*valueNoise(seed+5.5,3.3)),softness:.45,wetness:.35+.25*valueNoise(seed+1.1,8.8),variation:.9});
    const contactRy=Math.max(2.2,Math.min(6,half*.28)),contact=blob(cx-half*1.15,cx+half*1.45,y+contactRy*.35,contactRy,4.1),kb=bounds(contact);
    out.push({...base,role:'contact-cast-shadow',shape:contact,points:[[kb.x-1,kb.y+kb.h*.5],[kb.x+kb.w+1,kb.y+kb.h*.5]],width:kb.h*2.2+4,
      palette:{umber:.5,paynes:.38,walnut:.12},load:.24,softness:.2,granulation:.4});
  }
  return out;
}

// Form modelling. A painter models each body with one shadow glaze laid
// along the contour that turns away from the upper-left light, after the
// first wash has dried. The silhouette clips its outer edge hard; its inner
// edge is left to native flow.
const FORM_BODIES=/^(cap|funnel-cap|puffball|stem|folded-body|margin)$/;
function polygonArea(poly){let a=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)a+=(poly[j][0]+poly[i][0])*(poly[j][1]-poly[i][1]);return Math.abs(a)/2;}
export function nativeShadowContour(poly,radius,dir=[.8,.6]){
  // Faceted 3D-chart islands (triangles, quads) carry their own surface
  // shadow passages; a contour needs a real outline.
  const n=poly.length;if(n<6)return {points:[],rim:[]};
  // Outward edge normals (from the polygon's winding), smoothed over a few
  // vertices; the shadow side faces away from the upper-left light.
  let signed=0;for(let i=0,j=n-1;i<n;j=i++)signed+=(poly[j][0]-poly[i][0])*(poly[j][1]+poly[i][1]);
  const turn=signed>0?1:-1,box=bounds(poly),reach=Math.min(box.w,box.h)*.35,k=Math.max(1,Math.round(n/40));
  const normals=poly.map((_,i)=>{const a=poly[(i-k+n)%n],b=poly[(i+k)%n],tx=b[0]-a[0],ty=b[1]-a[1],d=Math.hypot(tx,ty)||1;return[turn*ty/d,-turn*tx/d];});
  const score=normals.map(([nx,ny])=>nx*dir[0]+ny*dir[1]);
  let best=null;
  for(let start=0;start<n;start++){
    if(score[start]<=.08||score[(start+n-1)%n]>.08)continue;
    let len=0;while(len<n&&score[(start+len)%n]>.08)len++;
    if(!best||len>best.len)best={start,len};
  }
  if(!best&&score.every(v=>v>.08))best={start:0,len:n};
  if(!best||best.len<4)return {points:[],rim:[]};
  const stride=Math.max(1,Math.ceil(best.len/28)),points=[],rim=[];
  for(let q=0;q<best.len;q+=stride){
    const index=(best.start+q)%n,p=poly[index],[nx,ny]=normals[index],inset=Math.min(radius*.55,reach);
    points.push([p[0]-nx*inset,p[1]-ny*inset]);rim.push({x:p[0],y:p[1],nx:-nx,ny:-ny,max:reach});
  }
  return {points,rim};
}
// The longest run of outline whose outward normal faces `dir`, inset along
// the inward normal. Used for value accents that hug one side of a form.
export function nativeEdgeRun(poly,{dir=[.8,.6],threshold=.5,inset=0,maxPoints=24,normals:withNormals=false}={}){
  const n=poly?.length??0;if(n<6)return [];
  let signed=0;for(let i=0,j=n-1;i<n;j=i++)signed+=(poly[j][0]-poly[i][0])*(poly[j][1]+poly[i][1]);
  const turn=signed>0?1:-1,k=Math.max(1,Math.round(n/40));
  const normals=poly.map((_,i)=>{const a=poly[(i-k+n)%n],b=poly[(i+k)%n],tx=b[0]-a[0],ty=b[1]-a[1],d=Math.hypot(tx,ty)||1;return[turn*ty/d,-turn*tx/d];});
  const score=normals.map(([nx,ny])=>nx*dir[0]+ny*dir[1]);
  let best=null;
  for(let start=0;start<n;start++){
    if(score[start]<=threshold||score[(start+n-1)%n]>threshold)continue;
    let len=0;while(len<n&&score[(start+len)%n]>threshold)len++;
    if(!best||len>best.len)best={start,len};
  }
  if(!best||best.len<3)return [];
  const stride=Math.max(1,Math.ceil(best.len/maxPoints)),out=[];
  for(let q=0;q<best.len;q+=stride){const i=(best.start+q)%n,[nx,ny]=normals[i];out.push(withNormals?{x:poly[i][0],y:poly[i][1],nx,ny}:[poly[i][0]-nx*inset,poly[i][1]-ny*inset]);}
  return out;
}
// Value structure. Historical plates go from paper white on the lit shoulder
// to near-black in the occlusions. After the pale body wash and the graded
// shadow glaze, three dark passages are planned from the outline normals
// (light from the upper left):
// - a deep accent tight along the darkest flank of every body, in a shadow
//   colour (local colour dulled with umber and Payne's grey; red caps turn
//   crimson-brown);
// (the gill cavity under the rim is a graded glaze, see nativeFormGlazes);
// - on a stem, the shadow the cap throws across its top and the dark foot.
export const VALUE_ACCENTS=Object.freeze({form:1.25,cavity:1.1,capShadow:.7,foot:1.1,minForm:12,minStem:40});
export function nativeShadowPalette(palette={}){
  const sum=Object.values(palette).reduce((a,b)=>a+b,0)||1,out={};
  for(const [k,v] of Object.entries(palette))out[k]=v/sum*.4;
  out.umber=(out.umber??0)+.36;out.paynes=(out.paynes??0)+.24;
  if(palette.alizarin)out.alizarin=(out.alizarin??0)+.18;
  return out;
}
const CAVITY_PALETTE=Object.freeze({umber:.42,paynes:.4,walnut:.18});
// A body painted as many facets (a turned 3D chart, a coral clump) has no
// single outline to model along. Rasterize its facets, soften the mask one
// cell and trace the union silhouette, so the same glazes and accents follow
// the body's real edge while the facets still clip the paint.
const outlineCache=new WeakMap();
export function nativeIslandsOutline(islands,step=2.5){
  if(outlineCache.has(islands))return outlineCache.get(islands);
  const pts=islands.flat(),box=bounds(pts),pad=step*3,g={x:box.x-pad,y:box.y-pad,step,width:Math.ceil((box.w+pad*2)/step)+1,height:Math.ceil((box.h+pad*2)/step)+1};
  let outline=null;
  if(g.width*g.height<=400000){
    const mask=new Uint8Array(g.width*g.height);for(const poly of islands)if(poly?.length>2)implicitFillPolygon(mask,poly,g);
    const values=new Float32Array(mask.length);
    for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){let sum=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=g.width||yy>=g.height)continue;sum+=mask[yy*g.width+xx];n++;}values[y*g.width+x]=.5-sum/n;}
    const paths=fieldContours(values,g,0).map(p=>p.slice(0,-1)).filter(p=>p.length>5);
    if(paths.length){const main=paths.reduce((a,b)=>polygonArea(b)>polygonArea(a)?b:a);const stride=Math.max(1,Math.ceil(main.length/160));outline=main.filter((_,i)=>i%stride===0);}
  }
  outlineCache.set(islands,outline);return outline;
}
const FACETED=24;
function modelPieces(mark,minArea){
  const islands=mark.islands?.length?mark.islands:[mark.shape];
  if(mark.islands?.length>FACETED){const outline=nativeIslandsOutline(mark.islands);return outline&&polygonArea(outline)>minArea?[outline]:[];}
  return islands.filter(poly=>poly?.length>5&&polygonArea(poly)>minArea);
}
export function nativeValueAccents(washes){
  const out=[],A=VALUE_ACCENTS,tallest=new Map();
  for(const mark of washes)if(mark.role==='stem'&&mark.shape?.length&&!mark.studyRole){const h=bounds(mark.shape).h,key=mark.individual??-1;if(!(tallest.get(key)?.h>=h))tallest.set(key,{mark,h});}
  // Narrow accents settle in the passage's own drying; they do not need a
  // transport step between their reloads (batchedFlow).
  // A short run (a corner of the outline) would leave a blot, not a shadow.
  const add=(mark,role,points,radius,palette,load,extra={})=>{if(points.length<6||pathLength(points)<radius*5)return;out.push({...mark,role,points,width:radius*2,palette,load,islands:undefined,surface:undefined,volumes:undefined,softness:.75,wetness:.85,granulation:(mark.granulation??.5)*.6,batchedFlow:true,...extra});};
  for(const mark of washes){
    if(!mark.palette||!(mark.load>0)||mark.studyRole&&!/habit/.test(mark.studyRole))continue;
    const role=mark.role??'',faceted=mark.islands?.length>FACETED,pieces=modelPieces(mark,300);
    for(const poly of pieces){
      const box=bounds(poly),small=Math.min(box.w,box.h),shape=faceted?mark.shape:pieces.length>1?mark.shape:poly,islands=faceted?mark.islands:pieces.length>1?pieces:undefined;
      if(FORM_BODIES.test(role)&&role!=='underside'&&small>=A.minForm){
        const r=clamp(small*.12,2.5,14);
        add(mark,'form-accent',nativeEdgeRun(poly,{dir:[.7,.72],threshold:.55,inset:r*.12}),r,nativeShadowPalette(mark.palette),A.form,{shape,islands});
      }
      if(role==='stem'&&box.h>=A.minStem&&tallest.get(mark.individual??-1)?.mark===mark){
        const top=clamp(box.w*.32,2,12),foot=clamp(box.w*.12,1.5,6);
        add(mark,'stem-cap-shadow',nativeEdgeRun(poly,{dir:[0,-1],threshold:.6,inset:top*.6}),top,CAVITY_PALETTE,A.capShadow,{shape,islands});
        add(mark,'stem-foot-accent',nativeEdgeRun(poly,{dir:[.35,.94],threshold:.6,inset:foot*.2}),foot,nativeShadowPalette(mark.palette),A.foot,{shape,islands});
      }
    }
  }
  return out;
}
// Hue travels along the form: the first, lit wash of a red cap leans to a
// warm orange-scarlet, so the crimson-brown shadow glaze reads as a turn of
// colour as well as of value.
// A brushed wash never lands exactly on the pen line: it stops a hair short
// in places and creeps over in others. Each body wash's own outline is
// displaced along its normal by a slow, seeded wobble (about ±1.5 px), so
// paint and ink are not vector-registered.
export const HAND_EDGE=Object.freeze({amplitude:1.5,wavelength:.11});
export function nativeHandEdges(washes){
  const moved=new Map();
  const wobble=(poly,salt)=>{
    if(moved.has(poly))return moved.get(poly);
    const n=poly.length,c=poly.reduce((q,p)=>[q[0]+p[0]/n,q[1]+p[1]/n],[0,0]);
    const out=poly.map((p,i)=>{const dx=p[0]-c[0],dy=p[1]-c[1],d=Math.hypot(dx,dy)||1,k=(valueNoise(i*HAND_EDGE.wavelength+salt,salt*.37)-.5)*2*HAND_EDGE.amplitude;return[p[0]+dx/d*k,p[1]+dy/d*k];});
    moved.set(poly,out);return out;
  };
  return washes.map((mark,index)=>{
    if(!/^(cap|funnel-cap|puffball|stem|underside|folded-body|margin)$/.test(mark.role??'')||mark.studyRole||mark.islands?.length>FACETED)return mark;
    const salt=(mark.phase??0)*1.7+index*.61;
    return mark.islands?.length?{...mark,islands:mark.islands.map(poly=>poly?.length>5?wobble(poly,salt):poly)}:mark.shape?.length>5?{...mark,shape:wobble(mark.shape,salt)}:mark;
  });
}
export function nativeWarmLights(washes){
  return washes.map(mark=>/^(cap|funnel-cap|puffball)$/.test(mark.role??'')&&mark.palette?.alizarin&&!mark.studyRole?{...mark,palette:{...mark.palette,hansa:(mark.palette.hansa??0)+.14}}:mark);
}
export function nativeFormGlazes(washes){
  const glazes=[];
  for(const mark of washes){
    const underside=mark.role==='underside';
    if(!(FORM_BODIES.test(mark.role??'')||underside)||!mark.palette||!(mark.load>0)||mark.studyRole&&!/habit/.test(mark.studyRole))continue;
    const sum=Object.values(mark.palette).reduce((a,b)=>a+b,0)||1;
    // The underside is shaded from above by the cap rim: its glaze runs along
    // the edge under the rim, in the cool dark of the gill cavity.
    const palette=underside?{...CAVITY_PALETTE}:{...mark.palette,umber:(mark.palette.umber??0)+.3*sum,paynes:(mark.palette.paynes??0)+.12*sum};
    // A body split into pieces (plate layouts, overlapping members) keeps
    // all of its pieces as the glaze mask, so a glaze traced along one piece
    // flows on across the seam instead of stopping at a straight cut.
    const faceted=mark.islands?.length>FACETED,pieces=faceted?modelPieces(mark,400):(mark.islands?.length?mark.islands:[mark.shape]).filter(poly=>poly?.length>2);
    if(underside&&(faceted||!PLATE_PASSES.value))continue;
    if(underside){
      // The visible underside starts at the cap's lower edge, which shades
      // it: run the glaze along that edge, pushed down into the gills.
      const capMark=washes.find(w=>/^(cap|funnel-cap)$/.test(w.role??'')&&w.individual===mark.individual&&!w.studyRole),cap=capMark?(capMark.islands?.length>FACETED?nativeIslandsOutline(capMark.islands):capMark.shape):null,ub=bounds(faceted?pieces[0]??mark.shape:mark.shape);
      const edge=cap?nativeEdgeRun(cap,{dir:[0,1],threshold:.5,maxPoints:28,normals:true}).filter(q=>q.x>=ub.x&&q.x<=ub.x+ub.w&&q.y>=ub.y-4&&q.y<=ub.y+ub.h):[];
      if(edge.length>=4){
        // Start the band a little inside the cap: the cap reserve, not the brush,
        // then draws the glaze's top edge, exactly along the rim.
        const radius=clamp(ub.h*.3,3,22),rim=edge.map(q=>({x:q.x-q.nx*radius*.15,y:q.y-q.ny*radius*.15,nx:q.nx,ny:q.ny,max:ub.h*.6}));
        glazes.push({...mark,role:'form-shadow',batchedFlow:true,surface:undefined,volumes:undefined,reserves:[...(mark.reserves??[]),cap],points:rim.map(q=>[q.x+q.nx*radius*.55,q.y+q.ny*radius*.55]),formRim:rim,width:radius*2,palette,
          load:VALUE_ACCENTS.cavity,softness:Math.max(.4,(mark.softness??.5)*.8),pooling:.95,wetness:clamp((mark.wetness??.6)*.8)});
      }
      continue;
    }
    for(const poly of pieces){
      if(polygonArea(poly)<400)continue;
      const box=bounds(poly),radius=underside?clamp(box.h*.32,3,24):clamp(Math.min(box.w,box.h)*.17,3,24),{points,rim}=nativeShadowContour(poly,radius,underside?[.25,-.97]:undefined);
      if(points.length<3)continue;
      glazes.push({...mark,role:'form-shadow',batchedFlow:true,shape:pieces.length>1?mark.shape:poly,islands:pieces.length>1?pieces:undefined,surface:undefined,volumes:undefined,depthFaces:mark.depthFaces,points,formRim:rim,width:radius*2,palette,
        load:underside?VALUE_ACCENTS.cavity:Math.min(.26,mark.load*1.1+.03),softness:Math.max(.4,(mark.softness??.5)*.8),pooling:.95,wetness:clamp((mark.wetness??.6)*.8)});
    }
  }
  return glazes;
}
// A confident outline is heavier where the form turns from the light. Each
// contour carries the box of the body it bounds; the nib width follows
// lightShade along the line (lit shoulder thin, shadow flank heavy).
const CONTOUR_ROLES=new Set(['cap-contour','stem-contour','ring','veil','branch','folds']);
export function nativeInkLighting(marks,washes){
  const boxes=new Map();
  for(const mark of washes){
    if(!mark.shape?.length||GROUND_EXCLUDED.test(mark.role??'')||mark.studyRole&&!/habit/.test(mark.studyRole))continue;
    const key=Number.isInteger(mark.individual)?mark.individual:-1,b=bounds((mark.islands?.length?mark.islands:[mark.shape]).flat()),o=boxes.get(key);
    boxes.set(key,o?{x:Math.min(o.x,b.x),y:Math.min(o.y,b.y),w:Math.max(o.x+o.w,b.x+b.w)-Math.min(o.x,b.x),h:Math.max(o.y+o.h,b.y+b.h)-Math.min(o.y,b.y)}:b);
  }
  return marks.map(mark=>{
    if(!CONTOUR_ROLES.has(mark.role)||/^background/.test(mark.role??''))return mark;
    const box=boxes.get(Number.isInteger(mark.individual)?mark.individual:-1);
    return box?{...mark,lightBox:box}:mark;
  });
}
const TEXTURE_ROLES=new Set(['pits','pores','stipe-pores','reticulum','scales','teeth','spines','peridioles','chambers','warts']);
export function nativeTextureSelection(marks){
  const boxes=new WeakMap(),boxOf=shape=>{let b=boxes.get(shape);if(!b){b=bounds(Array.isArray(shape[0]?.[0])?shape.flat():shape);boxes.set(shape,b);}return b;};
  return marks.flatMap((mark,i)=>{
    if(!TEXTURE_ROLES.has(mark.role)||!mark.points?.length)return [mark];
    const owner=mark.clip??mark.clipRegions;if(!owner?.length)return [mark];
    const box=boxOf(owner),mid=mark.points[Math.floor(mark.points.length/2)],shade=lightShade(mid[0],mid[1],box);
    if(sample(i,(mark.phase??0)+71)>.3+.7*shade)return [];
    return [{...mark,opacity:(mark.opacity??.5)*(.6+.55*shade),width:(mark.width??.6)*(.75+.45*shade)}];
  });
}

// Value range. Historical plates carry a full light-to-dark range: a pale
// first wash with reserved lights, then a markedly darker glaze on the turning
// side and dark accents. These scale the authored brush charge per passage.
// Plate passes that can be judged separately. VALUE: dark accents, gill
// cavity glaze, warm lights, heavier body charge and per-seed paper stocks.
export const PLATE_PASSES=Object.freeze({value:false});
export const NATIVE_WASH_TUNING=Object.freeze({body:PLATE_PASSES.value?1.3:1.0,broad:PLATE_PASSES.value?1.45:1.3,form:2.6,glaze:2.3,accent:2.1,washGran:Object.freeze([.16,.5]),glazeGran:Object.freeze([.1,.4]),edgeEvap:Object.freeze([.008,.03])});
export function nativeLoadScale(role='',kind='wash'){
  const t=NATIVE_WASH_TUNING;
  if(/cap-turn|cap-glaze|stem-shadow/.test(role))return t.form;
  if(kind==='wash')return /^(cap|funnel-cap)$/.test(role)?t.body:t.broad;
  return kind==='accent'?t.accent:t.glaze;
}

// Background washes painted as the flat ground pass, and how long it settles.
export const NATIVE_FLAT_GROUND=/^background-/;
export const NATIVE_FLAT_SETTLE=Object.freeze({steps:8,dt:.6});
// Dry a flat pass where it lies: water goes, suspended pigment settles.
function dryInPlace(sheet){
  for(let i=0;i<sheet.n;i++){sheet.W[i]=0;sheet.s[i]=0;sheet.M[i]=0;for(let k=0;k<sheet.K;k++){sheet.D[k][i]+=sheet.G[k][i]+sheet.P[k][i];sheet.G[k][i]=0;sheet.P[k][i]=0;}}
  sheet.wetDirty=1;
}
export function planNativePassages(study){
  // The habitat setting's ground and litter washes (background on) go down
  // first as one flat pass: brushed, briefly settled, then dried in place,
  // with no wet-in-wet flow over the whole page. Plates without a background
  // have no such marks, so their passages are unchanged.
  const groups=[{id:'Ground wash',kind:'wash',flat:true,marks:[]},{id:'Pale wash',kind:'wash',marks:[]},{id:'Shadow glaze',kind:'glaze',marks:[]},{id:'Pigment accents',kind:'accent',marks:[]}];
  for(const mark of [...(study.washes??[]),...nativeCoralGlazes(study.washes??[])]){
    if(!mark.points?.length||!mark.shape?.length||!mark.palette||!(mark.load>0))continue;
    const role=mark.role??'',q=/fissure|cast-shadow|pit-shadow|cuticle|spore|accent/.test(role)?2:/shadow|turn|underside|gill|glaze/.test(role)?1:0;
    groups[q===0&&NATIVE_FLAT_GROUND.test(role)?0:q+1].marks.push(mark);
  }
  return groups.filter(g=>g.marks.length);
}

export function nativePalette(passages){
  const keys=[...new Set(passages.flatMap(p=>p.marks.flatMap(m=>Object.keys(m.palette))))].sort();
  if(keys.length>NATIVE_PAINT_LIMITS.maxChannels||keys.some(k=>!BY_KEY[k]))throw new RangeError('Unsupported native pigment palette');
  return keys;
}

// A layered paint stack generally has different front/back reflectance. Keeping
// both preserves the exact KM composition over crisp custom ink at output size.
export function nativeOpticalFields(layers,pigments,n,opticalScale=1){
  const R=new Float32Array(n*3),B=new Float32Array(n*3),T=new Float32Array(n*3).fill(1);
  for(const layer of layers)for(let i=0;i<n;i++){
    let mass=0;for(let k=0;k<pigments.length;k++)mass+=layer[k][i];if(mass<=1e-7)continue;
    for(let c=0;c<3;c++){
      let K=0,S=0;for(let k=0;k<pigments.length;k++){const f=layer[k][i]/mass;K+=pigments[k].K[c]*f;S+=pigments[k].S[c]*f;}
      const [r,t]=layerRT(K,S,mass*opticalScale),q=i*3+c,oldR=R[q],oldT=T[q],d=1-r*oldR;
      R[q]=r+t*t*oldR/d;B[q]+=oldT*oldT*r/d;T[q]=t*oldT/d;
    }
  }
  return {R,B,T};
}

export function nativeOverInk(R,B,T,ink){const base=ink/255;return Math.round(255*clamp(R+T*T*base/(1-B*base)));}

// Model value by placing real loaded strokes on charted form, before transport.
// The silhouette, reserves and occluding anatomy still own deposition coverage.
function nativeChartPoint(row,t){
  let left=pathLength(row)*clamp(t);for(let i=1;i<row.length;i++){const a=row[i-1],b=row[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(left<=d)return[mix(a[0],b[0],left/(d||1)),mix(a[1],b[1],left/(d||1))];left-=d;}return row.at(-1);
}

export function nativeBrushPath(mark){
  const rails=mark.surface?.rails,mesh=mark.surface?.mesh;
  if(rails?.length>1&&mark.role==='stem-shadow'){
    return rails.map(([a,b],i)=>{const t=i/(rails.length-1),side=.85+.025*Math.sin(t*Math.PI);return{x:mix(a[0],b[0],side),y:mix(a[1],b[1],side),r:Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1])*(.27+.055*Math.sin(t*Math.PI))),p:.52+.35*Math.sin(t*Math.PI*.85)};});
  }
  if(rails?.length>1&&/cap-turn|cap-glaze/.test(mark.role)){
    return rails.map(([a,b],i)=>{
      const u=i/(rails.length-1),row=mesh?.[i],light=mark.surface.lighting;
      // Follow the actual cap's broad turning mass, rather than a fixed lower
      // strip. Hand pressure and contact width charge the dimmer side more.
      let sum=0,moment=0,dark=0;
      if(light){const x=u*(light.length-1),j=Math.min(light.length-2,Math.floor(x));for(let k=1;k<light[j].length-1;k++){
        const v=k/(light[j].length-1),illumination=mix(light[j][k],light[j+1][k],x-j),shade=Math.max(0,.85-illumination),weight=(.008+shade*shade)*Math.sin(v*Math.PI);
        sum+=weight;moment+=v*weight;dark+=shade;
      }}
      const shade=light?clamp(dark/(light[0].length-2)*2.4):u,t=sum?moment/sum:.45+.25*u;
      let point=[mix(a[0],b[0],t),mix(a[1],b[1],t)];if(row)point=nativeChartPoint(row,t);
      return {x:point[0],y:point[1],r:Math.max(2,Math.hypot(b[0]-a[0],b[1]-a[1])*(.22+.30*shade)),p:.18+.72*shade};
    });
  }
  return mark.points.map(([x,y])=>({x,y,r:mark.width/2}));
}

// Value accents swell toward the shadow side (right) and thin toward the lit
// side, so the darks grade across the form instead of lying as an even band.
function nativeAccentPath(mark){
  const pts=mark.points,xs=pts.map(p=>p[0]),x0=Math.min(...xs),x1=Math.max(...xs),n=Math.max(1,pts.length-1);
  return pts.map(([x,y],i)=>{const side=x1>x0?(x-x0)/(x1-x0):.5,e=Math.sin(Math.PI*i/n),shade=.35+.65*side;return{x,y,r:mark.width/2*(.3+.7*shade)*(.45+.55*Math.sqrt(e)),p:(.25+.7*shade)*(.35+.65*e)};});
}
export function nativeBrushGestures(mark){
  // One continuous dip: a recharge on a narrow dark line leaves a dash at
  // every reload. The fading charge reads as the stroke running out.
  // One continuous dip: a recharge on a narrow dark line leaves a dash at
  // every reload. The fading charge reads as the stroke running out.
  // A narrow damp pass ahead of the charge lets the accent's inner edge
  // bleed a little instead of stopping on the native cell grid.
  if(/form-accent|stem-cap-shadow|stem-foot-accent/.test(mark.role)){const path=nativeAccentPath(mark);return [{load:0,prewet:true,flat:false,depositDepth:.6,water:.5,wetMix:.85,path:path.map(q=>({...q,r:q.r*1.6,p:.6}))},{load:1,flat:false,depositDepth:.6,wetMix:.85,path}];}
  // A coral flank shadow fades in and out along its branch, so it never ends
  // on the branch segment's straight cut as a pasted band.
  if(mark.role==='coral-shadow'){const n=Math.max(1,mark.points.length-1);return [{load:1,flat:false,path:mark.points.map(([x,y],i)=>{const e=Math.sin(Math.PI*i/n);return{x,y,r:mark.width/2*(.25+.75*Math.pow(e,.7)),p:.15+.75*e};})}];}
  if(mark.groundStrokes)return mark.groundStrokes.map((stroke,k)=>({load:k?.8:1,flat:k===1,water:.42+.08*k,path:stroke.map(([x,y],i,a)=>{const t=i/Math.max(1,a.length-1);return{x,y,r:mark.width/2*(.7+.3*Math.sin(Math.PI*t)),p:.35+.5*Math.sin(Math.PI*t)};})}));
  if(/ground-shadow|contact-cast-shadow/.test(mark.role))return nativeReloadedPath(nativeBrushPath(mark)).map(path=>({load:1,flat:false,path}));
  if(mark.role==='cap')return [{load:1,path:mark.points.map(([x,y],i)=>{const t=i/Math.max(1,mark.points.length-1);return{x,y,r:mark.width/2,p:.45+.35*t+.1*Math.sin(Math.PI*t)};})}];
  const path=nativeBrushPath(mark);
  if(mark.role==='form-shadow'){
    // Clear water first beyond the inner edge, then a broad pale charge and a
    // narrower richer one hugging the contour, all into the same wet passage:
    // the glaze keeps a hard edge at the silhouette and melts toward the lit
    // side. Both ends taper so the shadow fades round the form.
    // Graded by bands: successively richer, narrower charges nearer the
    // contour, so native flow merges the steps into a gradient.
    const rim=mark.formRim?.length>2?mark.formRim:path.map(q=>({x:q.x,y:q.y,nx:0,ny:0,max:0})),n=Math.max(1,rim.length-1),depth=mark.width;
    // The painter's hand: the shadow's inner edge wanders and its weight
    // swells and thins along the form, differently on every body.
    const salt=(mark.phase??0)*3.1+rim.length*.37+(rim[0]?.x??0)*.011,wander=i=>(valueNoise(i*.33+salt,salt*.7)-.5)*2;
    const band=(offset,radius)=>rim.map((q,i)=>{const e=Math.pow(Math.sin(Math.PI*i/n),1.4),inset=Math.min(offset*depth*(1+.38*wander(i)),q.max);return{x:q.x+q.nx*inset,y:q.y+q.ny*inset,r:Math.max(1,radius*depth*(.2+.8*e)*(1+.3*wander(i+17))),p:(.12+.78*e)*(.8+.2*wander(i+31))};});
    // A finite brush reservoir runs dry along a long, wide contour, so the
    // painter reloads: each charge is laid as overlapping strokes of a few
    // brush widths, each from its own dip.
    const reload=(gesture,points)=>{const out=[],span=Math.max(5,Math.round(10*16/Math.max(16,points[0].r+points[Math.floor(n/2)].r)));for(let i=0;i<n;i+=span-1)out.push({...gesture,path:points.slice(i,Math.min(points.length,i+span))});return out.filter(g=>g.path.length>1);};
    // A round brush: a flat one leaves square stamps at each stroke end.
    // Damp, not flooded, paper under the glaze: the charge spreads a little
    // and dries to a hard, slightly pooled edge, as a laid shadow does,
    // instead of melting into an airbrushed gradient.
    return [...reload({load:0,prewet:true,flat:false,depositDepth:.6,water:.62,wetMix:.85},band(.5,.6).map(q=>({...q,p:.7}))),
      ...reload({load:.38,flat:false,depositDepth:.6,water:.8,wetMix:.85},band(.55,.4)),
      ...reload({load:.75,flat:false,depositDepth:.6,water:.72,wetMix:.8},band(.2,.22))];
  }
  if(/^(cap-turn|cap-glaze|stem-shadow)$/.test(mark.role)&&(mark.surface?.rails?.length>1||mark.points.length>=12)){
    // A dry-paper .25 film largely filters straight into .32-.40 pore capacity.
    // Wet the wider shadow first, then charge a metered loaded brush into it.
    // The softer edge is transported pigment, not an optical feather or mask.
    return [{load:0,prewet:true,depositDepth:.7,water:.80,wetMix:.8,path:path.map(q=>({...q,r:q.r*1.5,p:.7}))},
      {load:.62,depositDepth:.7,water:.75,wetMix:.8,path}];
  }
  return nativeReloadedPath(path).map(part=>({load:1,path:part}));
}
// A wide wash brush holds a finite bead. Rather than let one dip run dry
// halfway across a cap (which leaves a straight cutoff), the painter
// recharges every few brush widths and overlaps the previous stroke.
export function nativeReloadedPath(path,widths=3){
  if(path.length<3)return [path];
  const radius=path.reduce((a,q)=>a+(q.r??1),0)/path.length,limit=Math.max(24,radius*2*widths),parts=[];
  let start=0,length=0;
  for(let i=1;i<path.length;i++){
    length+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);
    if(length>=limit&&i<path.length-1){parts.push(path.slice(start,i+1));start=Math.max(start+1,i-1);length=0;for(let k=start+1;k<=i;k++)length+=Math.hypot(path[k].x-path[k-1].x,path[k].y-path[k-1].y);}
  }
  parts.push(path.slice(start));
  return parts.filter(part=>part.length>1);
}

// A wash wider than a brush is laid as a painter lays it: overlapping
// brush-wide passes across the shape, top to bottom, each turning back the
// way the last one came, so the bead is carried down the wash. A pass keeps
// the gesture's load, water and pressure; it is trimmed to the shape's box.
export const WASH_PASSES=Object.freeze({maxRadius:60,overlap:.35});
export function nativeWashPasses(gestures,mark=null,{maxRadius=WASH_PASSES.maxRadius,overlap=WASH_PASSES.overlap}={}){
  const shape=Array.isArray(mark?.shape)&&mark.shape.length>2?bounds(mark.shape):null,out=[];
  for(const gesture of gestures){
    const path=gesture.path??[],R=Math.max(0,...path.map(q=>q.r??1));
    if(!(R>maxRadius)||path.length<2){out.push(gesture);continue;}
    const step=2*maxRadius*(1-overlap),n=1+Math.ceil((2*R-2*maxRadius)/step);
    const normals=path.map((q,i)=>{const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1;return {x:-dy/l,y:dx/l};});
    const passes=[];
    for(let k=0;k<n;k++){
      const u=n>1?-1+2*k/(n-1):0;
      let pass=path.map((q,i)=>{const r=Math.min(q.r??1,maxRadius),off=u*Math.max(0,(q.r??1)-r);return {...q,x:q.x+normals[i].x*off,y:q.y+normals[i].y*off,r};});
      if(shape){
        const touches=q=>q.x+q.r>=shape.x&&q.x-q.r<=shape.x+shape.w&&q.y+q.r>=shape.y&&q.y-q.r<=shape.y+shape.h;
        const first=pass.findIndex(touches),last=pass.findLastIndex(touches);
        pass=first<0?[]:pass.slice(Math.max(0,first-1),Math.min(pass.length,last+2));
      }
      if(pass.length>1)passes.push(pass);
    }
    const meanY=pass=>pass.reduce((sum,q)=>sum+q.y,0)/pass.length;
    passes.sort((a,b)=>meanY(a)-meanY(b));
    passes.forEach((pass,k)=>out.push({...gesture,path:k%2?[...pass].reverse():pass,pass:k,passes:passes.length}));
  }
  return out;
}
// The brush's whole travel over a plan's passes, in plate units.
export function nativeWashTravel(passages){
  let total=0;
  for(const passage of passages)for(const mark of passage.marks)for(const gesture of nativeWashPasses(nativeBrushGestures(mark),mark))total+=pathLength((gesture.path??[]).map(q=>[q.x,q.y]));
  return total;
}
// Contiguous subpaths share the endpoint. stroke(lift:false) retains its carry,
// heading, stroke key, contact stamps and finite reservoir; only the last lifts.
export function nativeStrokeSegments(points,maxLength=12){
  if(points.length<2)return [];
  const parts=[];let part=[points[0]],length=0;
  for(let i=1;i<points.length;i++){
    let a=part.at(-1),b=points[i],distance=Math.hypot(b.x-a.x,b.y-a.y);
    while(distance+length>maxLength&&distance>1e-8){
      const t=(maxLength-length)/distance,q={x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),p:mix(a.p??1,b.p??1,t),r:mix(a.r??1,b.r??1,t)};
      part.push(q);parts.push(part);part=[q];a=q;distance=Math.hypot(b.x-a.x,b.y-a.y);length=0;
    }
    part.push(b);length+=distance;
  }
  if(part.length>1)parts.push(part);return parts;
}

const nativeYield=()=>new Promise(resolve=>{
  const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};channel.port2.postMessage(0);
});

// Area-average real pigment thickness for live preview optics only. Fixed and
// wet mass stay at full native density for transport and exact final rendering.
export function nativePreviewLayers(layers,w,h,factor=2){
  const width=Math.ceil(w/factor),height=Math.ceil(h/factor),n=width*height;
  return {width,height,n,layers:layers.map(layer=>layer.map(plane=>{
    const out=new Float32Array(n);for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      let sum=0,count=0;for(let dy=0;dy<factor&&y*factor+dy<h;dy++)for(let dx=0;dx<factor&&x*factor+dx<w;dx++){sum+=plane[(y*factor+dy)*w+x*factor+dx];count++;}out[y*width+x]=sum/count;
    }return out;
  }))};
}

// Sample actual native state directly, reusing small output buffers. The latest
// fixed layer remains live because native rewetting may lift it; only older
// layers are cached. Explicit material-layer version changes invalidate caches.
export function nativePreviewSheet(sheet,factor=4,cache={}){
  const {w,h,K}=sheet,width=Math.ceil(w/factor),height=Math.ceil(h/factor),n=width*height;
  if(cache.w!==w||cache.h!==h||cache.K!==K||cache.factor!==factor){
    Object.assign(cache,{w,h,K,factor,fixed:new WeakMap(),wet:Array.from({length:K},()=>new Float32Array(n))});
  }
  const sample=(plane,out,g=null,d=null,p=null)=>{
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      let sum=0,count=0;
      for(let dy=0;dy<factor&&y*factor+dy<h;dy++)for(let dx=0;dx<factor&&x*factor+dx<w;dx++){
        const i=(y*factor+dy)*w+x*factor+dx;
        // Match layersOf's Float32 top-plane rounding before area averaging.
        sum+=plane?plane[i]:Math.fround(g[i]+d[i]+p[i]);count++;
      }
      out[y*width+x]=sum/count;
    }
  };
  const layers=sheet.layers.map((layer,index)=>{
    const version=layer._cacheVersion??0;let record=cache.fixed.get(layer);
    if(!record){record={planes:Array.from({length:K},()=>new Float32Array(n)),frozen:false,version};cache.fixed.set(layer,record);}
    if(!record.frozen||record.version!==version){
      for(let k=0;k<K;k++)sample(layer[k],record.planes[k]);
      record.planes._cacheVersion=(record.planes._cacheVersion??0)+1;record.version=version;
      record.frozen=index<sheet.layers.length-1;
    }
    return record.planes;
  });
  for(let k=0;k<K;k++)sample(null,cache.wet[k],sheet.G[k],sheet.D[k],sheet.P[k]);
  layers.push(cache.wet);return {width,height,n,layers};
}

export const NATIVE_PAPER_VERSION='cold-press-coherent-wash-20261019-2';
export function nativePaperOptions(width){
  const mmPerCell=240/width;
  return {seed:301,fibres:.18,tooth:.82,fibreLength:6,mmPerCell,cmin:.32,cmax:.40,coldPress:{mmPerCell,...COLD_PRESS_STYLE}};
}
export function makeNativePaper(width,height){
  const paper=makePaper(width,height,nativePaperOptions(width));
  paper.materialVersion=NATIVE_PAPER_VERSION;return paper;
}

// The sheet width a plate's passages are painted at: the requested width,
// bounded by the cell budget and by the number of pigment channels.
export function nativeSheetWidth(width,keys,limits=NATIVE_PAINT_LIMITS){
  return Math.min(width,Math.floor(Math.sqrt(limits.maxCells*1.2)),Math.floor(600*Math.sqrt(8/Math.max(8,keys.length))));
}
// One passage's transport: granulation, pooling and softness of its marks.
export function nativePassageTransport(passage){
  const mean=key=>passage.marks.reduce((sum,m)=>sum+clamp(m[key]??.5),0)/passage.marks.length;
  return {...NATIVE_TRANSPORT,gran:passage.kind==='wash'?NATIVE_WASH_TUNING.washGran[0]+mean('granulation')*NATIVE_WASH_TUNING.washGran[1]:NATIVE_WASH_TUNING.glazeGran[0]+mean('granulation')*NATIVE_WASH_TUNING.glazeGran[1],edgeEvap:NATIVE_WASH_TUNING.edgeEvap[0]+mean('pooling')*NATIVE_WASH_TUNING.edgeEvap[1],capRate:.025+mean('softness')*.055,spill:passage.kind==='wash'?.2+mean('softness')*.2:.35+mean('softness')*.35};
}
// One gesture's brush, load and sheet-space path. `strokes` is the count of
// gestures already laid on the sheet; it seeds the brush and pressure jitter.
export function nativeGestureMaterial(passage,mark,gesture,{keys,scale,seed,strokes}){
  const path=gesture.path,radius=Math.max(.65,...path.map(q=>q.r*scale)),variation=clamp(mark.variation??.5);
  const brush={radius,bristles:Math.max(16,Math.ceil(radius*2)),depositDepth:gesture.depositDepth??0,capacity:100,belly:12,feed:.4,give:.9,free:.4,film:.25,wetness:.93,variety:variation,flat:gesture.flat??false,splay:.015+variation*.025,stiffness:8,wetMix:gesture.wetMix??(passage.kind==='wash'?.7:.3),bridge:passage.kind==='wash'?1:.94,bridgeSoft:passage.kind==='wash'?3:3.4,seed:seed+strokes*17};
  const wet=clamp(mark.wetness??.6),conc=keys.map(k=>Math.max(0,(mark.palette[k]??0)*mark.load*gesture.load*nativeLoadScale(mark.role,passage.kind)));
  const water=gesture.water??(passage.kind==='wash'?.6+.16*wet:.52+.18*wet);
  const points=path.map((q,i,arr)=>({x:q.x*scale,y:q.y*scale,r:q.r*scale,p:clamp((q.p??(.65+.25*Math.sin(Math.PI*i/Math.max(1,arr.length-1))))+(sample(i,seed+strokes)-.5)*variation*.18)}));
  return {brush,water,conc,points};
}

// Paint playback (the Paint button): the plate is painted at an artist's
// pace and streamed as it goes, ink lines growing from the nib and washes
// spreading under the brush, with the Paint Lab's own brush, nib and pencil
// cursor drawn from the real tool state. Load, Random, prepared plates and
// morph landings keep the fast path. The finished plate is the same bytes.
export const PLAYBACK=Object.freeze({frameMs:33,fullFrameMs:350,refreshMs:1000,ink:Object.freeze({perUnitMs:.4,minMs:4000,maxMs:6500}),wash:Object.freeze({mmPerS:450,minMs:12000,maxMs:20000}),liftMs:40,lagMs:750,plateMm:240,inkColour:'#2b241d'});
// Ink by its drawn length; washes by the brush's travel in millimetres at a
// steady hand speed, held between the bounds so a plate plays in 20 to 40 s.
export function nativePlaybackPacing({inkLength=0,washMm=0}={}){
  const P=PLAYBACK;
  return {inkMs:Math.round(clamp(inkLength*P.ink.perUnitMs,P.ink.minMs,P.ink.maxMs)),washMs:Math.round(clamp(washMm/P.wash.mmPerS*1000,P.wash.minMs,P.wash.maxMs))};
}
// A tap on the plate finishes a live painting at full speed (the worker's
// 'native-skip' message); the bytes are those of the paced painting.
const nativePlaybackSkip={on:false};
// Paint Lab's cursor works in sheet pixels and millimetres; the plate is
// 1200 units across a sheet PLAYBACK.plateMm wide.
export const PLAYBACK_CURSOR=Object.freeze({w:1200,dpi:1200/(PLAYBACK.plateMm/25.4)});
// Paint Lab's brush is 10 mm by default; a wider wash brush keeps its true
// footprint but the preview fades with its size, so it never hides the wash.
export function paintCursorOpacity(sizeMm){return clamp(Math.sqrt(12/Math.max(12,Number(sizeMm)||0)),.35,1);}
export function nativeToolFor({phase,role=''}={}){
  if(phase==='ink')return /pencil|graphite|construction|guide|cap-outline/.test(role)?'pencil':'pen';
  return 'round';
}
// A pigment mix as one display colour: the palette swatches weighted by load.
export function pigmentSwatch(palette){
  let r=0,g=0,b=0,w=0;
  for(const [key,amount] of Object.entries(palette??{})){const hex=BY_KEY[key]?.swatch;if(!hex||!(amount>0))continue;const n=parseInt(hex.slice(1),16);r+=(n>>16&255)*amount;g+=(n>>8&255)*amount;b+=(n&255)*amount;w+=amount;}
  if(!w)return PLAYBACK.inkColour;
  const h=v=>Math.round(v/w).toString(16).padStart(2,'0');return `#${h(r)}${h(g)}${h(b)}`;
}
// The nominal size that Paint Lab's pen (nib) or pencil (point) turns into a
// mark of this width in millimetres (the inverse of its nibMm / pointMm).
export function cursorSizeForWidthMm(tool,mm){
  const MM=25.4,REF=60;
  const size=tool==='pencil'?((mm/MM*REF)/2-.5)/(REF*.05)*2*MM:((mm/MM*REF)-.6)/(REF*.08)*2*MM;
  return Math.max(0,size);
}
// Cursor state for an ink mark drawn to fraction f: where the nib is, its
// heading and the mark's width, in Paint Lab's cursor terms.
export function nativeInkCursor(mark,f){
  const pts=mark?.points;if(!pts?.length)return null;
  const tool=nativeToolFor({phase:'ink',role:mark.role??''}),n=pts.length,len=pathLength(pts),target=clamp(f)*len;
  let at=pts[0],hx=1,hy=0,walked=0;
  for(let i=1;i<n;i++){const a=pts[i-1],b=pts[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l>0){hx=(b[0]-a[0])/l;hy=(b[1]-a[1])/l;}
    if(walked+l>=target){const t=l?(target-walked)/l:0;at=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];break;}walked+=l;at=b;}
  const mm=Math.max(.05,(mark.width??1))*PLAYBACK.plateMm/1200;
  return {tool,x:at[0],y:at[1],hx,hy,w:PLAYBACK_CURSOR.w,dpi:PLAYBACK_CURSOR.dpi,sizeMm:cursorSizeForWidthMm(tool,mm)};
}
// Cursor state for the brush in hand (media/brush.js state), at the hand
// point q (sheet cells) heading (hx, hy): the tuft's tip and bend, each hair's
// length and the water it holds, as the lab's worker reports them.
export function nativeBrushCursor(brush,q,heading,{sheetW,palette}){
  if(!brush||!q)return null;const k=PLAYBACK_CURSOR.w/sheetW,mmPerCell=PLAYBACK.plateMm/sheetW;
  return {tool:'round',model:brush.model??'tuft',flat:!!brush.flat,x:q.x*k,y:q.y*k,hx:heading?.x??1,hy:heading?.y??0,p:q.p??1,
    tip:brush.tip?{x:brush.tip.x*k,y:brush.tip.y*k}:null,bend:brush.bend??0,len:(brush.model??'tuft')==='tuft'?brush.hairs.map(h=>h.len):null,
    sat:brush.hairs.map(h=>h.water/(brush.capacity*h.len||1)),w:PLAYBACK_CURSOR.w,dpi:PLAYBACK_CURSOR.dpi,sizeMm:2*brush.radius*mmPerCell,colour:pigmentSwatch(palette)};
}
// The window of a sheet (cell rect, inclusive) as layers for nativeOpticalFields:
// every fixed layer and the wet top (G + D + P), cut to the window.
export function nativeWindowLayers(sheet,{x0,y0,x1,y1}){
  const w=sheet.w,ww=x1-x0+1,wh=y1-y0+1,K=sheet.K??sheet.pigments.length;
  const cut=arrays=>arrays.map(src=>{const out=new Float32Array(ww*wh);for(let y=0;y<wh;y++)out.set(src.subarray((y0+y)*w+x0,(y0+y)*w+x1+1),y*ww);return out;});
  const layers=sheet.layers.map(cut);
  const top=Array.from({length:K},(_,k)=>{const o=new Float32Array(ww*wh);for(let y=0;y<wh;y++)for(let x=0;x<ww;x++){const i=(y0+y)*w+x0+x;o[y*ww+x]=sheet.G[k][i]+sheet.D[k][i]+sheet.P[k][i];}return o;});
  return [...layers,top];
}
// Output pixels covered by a cell rect (inclusive), on a W x H raster.
export function nativePatchRect({x0,y0,x1,y1},sw,sh,W,H){
  const px0=Math.max(0,Math.floor(x0*W/sw)),py0=Math.max(0,Math.floor(y0*H/sh)),px1=Math.min(W,Math.ceil((x1+1)*W/sw)),py1=Math.min(H,Math.ceil((y1+1)*H/sh));
  return {x:px0,y:py0,w:Math.max(0,px1-px0),h:Math.max(0,py1-py0)};
}
export async function simulateNativePassages(study,{width=NATIVE_PAINT_LIMITS.width,seed=301,maskFor,onCheckpoint=async()=>{},isCancelled=()=>false,yieldWork=nativeYield,depositDurationMs=0,checkpointIntervalMs=0,paperTemplate=null,onPaper=()=>{},onBrush=null,travelMs=0,skipPacing=()=>false,limits=NATIVE_PAINT_LIMITS}={}){
  const started=performance.now(),passages=planNativePassages(study),keys=nativePalette(passages);
  width=nativeSheetWidth(width,keys,limits);
  const height=Math.round(width/1.2),n=width*height,scale=width/1200,mmPerCell=.2/scale;
  const paperReused=paperTemplate?.materialVersion===NATIVE_PAPER_VERSION&&paperTemplate.w===width&&paperTemplate.h===height;
  const paper=paperReused?paperTemplate:makeNativePaper(width,height),pigments=keys.map(k=>BY_KEY[k]);
  if(!paperReused)onPaper(paper);
  const sheet=createSheet(paper,pigments);let strokes=0,steps=0,checkpoints=0,strokeSegments=0,brushDips=0,brushLifts=0,clearWaterStrokes=0,lastCheckpoint=-Infinity;
  const timings={paperMs:performance.now()-started,maskMs:0,depositMs:0,transportMs:0};
  const flow=options=>{const t=performance.now(),active=step(sheet,options);timings.transportMs+=performance.now()-t;steps++;return active;};
  const check=()=>{if(isCancelled())throw new DOMException('Cancelled','AbortError');};
  const stats=()=>({nativeWidth:width,nativeHeight:height,nativeCells:n,channels:keys,strokes,strokeSegments,brushDips,brushLifts,clearWaterStrokes,steps,fixedLayers:sheet.layers.length,...totals(sheet),elapsedMs:performance.now()-started,timings:{...timings},paperReused,ink:'custom variable-pressure vector ink',drying:'accelerated native transport',previewOptics:'sharp 1200px ink; 4x4 native mass average + RGB multiply paint preview; final exact layered KM'});
  // The time limit counts the simulation's own work, not the time spent
  // showing frames or waiting for the live brush's pace (idleMs).
  let idleMs=0;const overBudget=()=>performance.now()-started-idleMs>limits.maxMs;
  const publish=async(stage,progress,complete=false,force=false)=>{check();if(!complete&&!force&&performance.now()-lastCheckpoint<checkpointIntervalMs)return;checkpoints++;const shownAt=performance.now();await onCheckpoint({sheet,stage,progress,complete,force,metrics:stats()});lastCheckpoint=performance.now();idleMs+=lastCheckpoint-shownAt;check();};
  const markCount=passages.reduce((n,p)=>n+p.marks.length,0);
  // Live painting (travelMs): the brush moves at one speed over every pass,
  // so the plate's whole travel takes travelMs; a pause at each lift. The
  // work of painting and showing frames runs inside that time: behind it,
  // the brush catches up, but never by more than PLAYBACK.lagMs, and each
  // passage starts afresh after its drying. skipPacing drops the waits.
  const travelTotal=travelMs>0?nativeWashTravel(passages)*scale:0;let deadline=performance.now();
  const travelWait=async ms=>{if(skipPacing()){deadline=performance.now();return;}deadline+=ms;const wait=deadline-performance.now();if(wait>0){const at=performance.now();await new Promise(r=>setTimeout(r,Math.min(120,wait)));idleMs+=performance.now()-at;}else deadline=Math.max(deadline,performance.now()-PLAYBACK.lagMs);};
  for(let pi=0;pi<passages.length;pi++){
    const passage=passages[pi],start=pi/passages.length,span=1/passages.length;deadline=performance.now();
    const transport=nativePassageTransport(passage);
    for(let mi=0;mi<passage.marks.length;mi++){
      const mark=passage.marks[mi];check();
      const maskAt=performance.now();setClip(sheet,maskFor?await maskFor(mark,{width,height,scale,paper}):null);timings.maskMs+=performance.now()-maskAt;
      const gestures=nativeWashPasses(nativeBrushGestures(mark),mark);
      for(let gi=0;gi<gestures.length;gi++){
      const gesture=gestures[gi],material=nativeGestureMaterial(passage,mark,gesture,{keys,scale,seed,strokes});
      const brush=createBrush(material.brush);
      dip(brush,{water:material.water,conc:material.conc});brushDips++;
      const points=material.points;
      const segments=nativeStrokeSegments(points),markStarted=performance.now();
      for(let si=0;si<segments.length;si++){
        const depositAt=performance.now();stroke(brush,sheet,segments[si],{spacing:1.5,lift:si===segments.length-1});timings.depositMs+=performance.now()-depositAt;strokeSegments++;
        onBrush?.({brush,segment:segments[si],lifted:si===segments.length-1,palette:mark.palette,sheet});
        await publish(`${gesture.prewet?'Wetting the paper':passage.id} · stroke ${mi+1} of ${passage.marks.length}`, .22+.78*(start+span*.4*(mi+(gi+(si+1)/segments.length)/gestures.length)/passage.marks.length));
        if(travelTotal>0)await travelWait(travelMs*pathLength(segments[si].map(q=>[q.x,q.y]))/travelTotal);
        else{const due=markStarted+depositDurationMs/Math.max(1,markCount)/gestures.length*(si+1)/segments.length;
        if(due>performance.now())await new Promise(r=>setTimeout(r,Math.min(33,due-performance.now())));}
        await yieldWork();check();
      }
      if(travelTotal>0)await travelWait(PLAYBACK.liftMs);
      strokes++;brushLifts++;if(gesture.prewet)clearWaterStrokes++;if(!passage.flat&&(!mark.batchedFlow||gi===gestures.length-1))flow(transport);
      }
    }
    setClip(sheet,null);await publish(`${passage.id} · wet pigment`,.22+.78*(start+span*.4),false,pi===passages.length-1);
    if(passage.flat){
      for(let j=0;j<NATIVE_FLAT_SETTLE.steps;j++)if(!flow({...transport,dt:NATIVE_FLAT_SETTLE.dt}))break;
      dryInPlace(sheet);fix(sheet);await publish(`${passage.id} · dry`,.22+.78*(start+span),pi===passages.length-1,true);continue;
    }
    let dryDone=false;
    for(let j=0;j<limits.maxSteps;j++){
      dryDone=!flow({...transport,dt:j<16?.6:2});if(dryDone)break;
      if((j&3)===3){await publish(`${passage.id} · flow and pooling`,.22+.78*(start+span*(.4+.58*(1-Math.exp(-j/90)))));await yieldWork();check();if(overBudget())break;}
    }
    if(!dryDone)throw new Error('Native wash is still wet at the time limit; painting remains incomplete');
    // The dried last pass streams once before it is fixed: the same pigment as
    // the settled plate, so the final frame does not jump.
    fix(sheet);if(pi===passages.length-1)await publish(`${passage.id} · dried`,.22+.78*(start+span*.99),false,true);await publish(`${passage.id} · dry`,.22+.78*(start+span),pi===passages.length-1,true);
  }
  if(!passages.length)await publish('Ink complete',1,true,true);
  return {...stats(),checkpoints,complete:true};
}

export function nativeMaskRasterizer(){
  let maskCanvas,maskContext,islandCanvas,islandContext;
  return (mark,{width,height,scale})=>{
    if(!maskCanvas||maskCanvas.width!==width||maskCanvas.height!==height){maskCanvas=newCanvas(width,height);maskContext=maskCanvas.getContext('2d',{willReadFrequently:true});islandCanvas=newCanvas(width,height);islandContext=islandCanvas.getContext('2d');}
    const c=maskContext;c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-over';c.clearRect(0,0,width,height);c.scale(scale,scale);c.fillStyle='#fff';c.fill(polygon(mark.shape));
    if(Array.isArray(mark.islands)){const q=islandContext;q.setTransform(1,0,0,1,0,0);q.clearRect(0,0,width,height);q.scale(scale,scale);q.fillStyle='#fff';const union=new Path2D();for(const island of mark.islands)union.addPath(polygon(island));q.fill(union);c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='destination-in';c.drawImage(islandCanvas,0,0);c.scale(scale,scale);}
    c.globalCompositeOperation='destination-out';for(const reserve of mark.reserves??[])c.fill(polygon(reserve));
    if(mark.depthFaces){const b=bounds(mark.shape),coverage=lamellarCoverage(mark.depthFaces,b),depth=newCanvas(coverage.width,coverage.height),d=depth.getContext('2d'),pixels=d.createImageData(coverage.width,coverage.height);for(let i=0;i<coverage.alpha.length;i++)pixels.data[i*4+3]=coverage.alpha[i];d.putImageData(pixels,0,0);c.globalCompositeOperation='destination-in';c.drawImage(depth,coverage.x,coverage.y);}
    const rgba=c.getImageData(0,0,width,height).data,out=new Uint8Array(width*height);for(let i=0;i<out.length;i++)out[i]=rgba[i*4+3]>=128?1:0;return out;
  };
}

// Display resolution. The plate is authored on a fixed 1200 × 1000 sheet, but
// the ink is vector and is rasterized at the display's device-pixel density.
// Scales are quantized so a given screen class always yields the same pixels.
export const PLATE_RESOLUTION=Object.freeze({width:1200,height:1000,step:.25,minScale:1,maxBaseScale:2.5,maxDetailPixels:6e6});
export function plateBackingScale(cssWidth,dpr=1,{step=PLATE_RESOLUTION.step,min=PLATE_RESOLUTION.minScale,max=PLATE_RESOLUTION.maxBaseScale}={}){
  const css=Number.isFinite(cssWidth)&&cssWidth>0?cssWidth:PLATE_RESOLUTION.width,ratio=Number.isFinite(dpr)&&dpr>0?dpr:1;
  return clamp(Math.ceil(css*ratio/PLATE_RESOLUTION.width/step-1e-6)*step,min,max);
}
// The plate rectangle visible through a zoomed viewport and the device-pixel
// raster that covers it exactly. Returns null when the base raster suffices.
export function plateDetailRegion(view,size,dpr=1,baseScale=1,{maxPixels=PLATE_RESOLUTION.maxDetailPixels}={}){
  if(!view||!size?.width||!size?.height||!(view.scale>1))return null;
  const ratio=Number.isFinite(dpr)&&dpr>0?dpr:1,sx=PLATE_RESOLUTION.width/(size.width*view.scale),sy=PLATE_RESOLUTION.height/(size.height*view.scale);
  if(size.width*view.scale*ratio<=PLATE_RESOLUTION.width*baseScale*1.05)return null;
  const x=clamp(-view.x*sx,0,PLATE_RESOLUTION.width),y=clamp(-view.y*sy,0,PLATE_RESOLUTION.height);
  const w=Math.min(PLATE_RESOLUTION.width-x,size.width*sx),h=Math.min(PLATE_RESOLUTION.height-y,size.height*sy);
  let width=Math.round(size.width*ratio),height=Math.round(size.height*ratio);
  const fit=Math.min(1,Math.sqrt(maxPixels/(width*height)));width=Math.max(1,Math.floor(width*fit));height=Math.max(1,Math.floor(height*fit));
  return {view:{...view},x,y,w,h,width,height};
}
// Catmull-Rom weights. The settled wash is upsampled with a C1 kernel so the
// native cell lattice never shows as bilinear creases at display resolution;
// results are clamped to the 2 × 2 cell range, so no ringing halos appear.
export function cubicWeights(t,out=new Float64Array(4)){
  const t2=t*t,t3=t2*t;out[0]=(-t3+2*t2-t)/2;out[1]=(3*t3-5*t2+2)/2;out[2]=(-3*t3+4*t2+t)/2;out[3]=(t3-t2)/2;return out;
}
// The native clip is a cell rasterization of each passage's vector edge, so a
// wash boundary against bare paper lands on the cell grid. Where the four
// native neighbours straddle that boundary, resolve it with the same vector
// shapes at output resolution: painted neighbours supply the paint inside the
// edge and bare ones the paper outside. The mask covers the plate rectangle
// `region` at width × height, so the base plate and every zoom re-raster
// decide edges with identical geometry.
export function nativeCoverageMask(washes,region={x:0,y:0,w:PLATE_RESOLUTION.width,h:PLATE_RESOLUTION.height},width=PLATE_RESOLUTION.width,height=PLATE_RESOLUTION.height){
  const canvas=newCanvas(width,height),c=canvas.getContext('2d',{willReadFrequently:true}),union=new Path2D(),sx=width/region.w,sy=height/region.h;
  c.setTransform(sx,0,0,sy,-region.x*sx,-region.y*sy);c.fillStyle='#fff';
  for(const mark of washes)if(mark.load>0&&mark.shape?.length)for(const poly of (mark.islands?.length?mark.islands:[mark.shape]))if(poly?.length>2)union.addPath(polygon(poly));
  c.fill(union,'nonzero');
  const rgba=c.getImageData(0,0,width,height).data,out=new Uint8Array(width*height);for(let i=0;i<out.length;i++)out[i]=rgba[i*4+3];return out;
}
// Reconstruction of the native optical fields. A native cell is a sample of
// the wash, not a square tile: displayed through the clamped cubic, a steep
// change of pigment between neighbouring cells reads as a staircase of cell
// blocks. A one-cell binomial reconstruction (1-2-1) over R, B and T removes
// that grid without moving any outline: silhouettes and passage edges are
// still resolved at output resolution by the vector coverage and region ids.
export const NATIVE_RECONSTRUCT=Object.freeze({from:.05,span:.1});
export function nativeReconstructFields(fields,w,h){
  // Only where the wash steps steeply from cell to cell (where a staircase
  // would show); granulation and flat passages keep their native texture.
  const T0=fields.T,steep=new Float32Array(w*h),dens=i=>3-T0[i*3]-T0[i*3+1]-T0[i*3+2];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,v=dens(i);let d=0;if(x>0)d=Math.max(d,Math.abs(v-dens(i-1)));if(x<w-1)d=Math.max(d,Math.abs(v-dens(i+1)));if(y>0)d=Math.max(d,Math.abs(v-dens(i-w)));if(y<h-1)d=Math.max(d,Math.abs(v-dens(i+w)));steep[i]=smooth(clamp((d-NATIVE_RECONSTRUCT.from)/NATIVE_RECONSTRUCT.span));}
  const out={};
  for(const key of ['R','B','T']){
    const src=fields[key],tmp=new Float32Array(src.length),dst=new Float32Array(src.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){const i=(y*w+x)*3+c,l=(y*w+Math.max(0,x-1))*3+c,r=(y*w+Math.min(w-1,x+1))*3+c;tmp[i]=(src[l]+2*src[i]+src[r])*.25;}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){const i=(y*w+x)*3+c,u=(Math.max(0,y-1)*w+x)*3+c,d=(Math.min(h-1,y+1)*w+x)*3+c;dst[i]=mix(src[i],(tmp[u]+2*tmp[i]+tmp[d])*.25,steep[y*w+x]);}
    out[key]=dst;
  }
  return out;
}
// Passage regions at output resolution: each wash, glaze and accent mask
// filled in painting order with its own id, so the top-most mask at a pixel
// names the passage whose clip edge runs there. Interior clip edges (a glaze
// meeting the wash beneath, a cap rim over the gills) then resolve at output
// resolution instead of on the native cell grid.
export function nativeRegionIds(washes,region={x:0,y:0,w:PLATE_RESOLUTION.width,h:PLATE_RESOLUTION.height},width=PLATE_RESOLUTION.width,height=PLATE_RESOLUTION.height){
  const canvas=newCanvas(width,height),c=canvas.getContext('2d',{willReadFrequently:true}),sx=width/region.w,sy=height/region.h;
  c.setTransform(sx,0,0,sy,-region.x*sx,-region.y*sy);let id=0;
  for(const mark of washes){
    if(!(mark.load>0)||!mark.shape?.length)continue;id=Math.min(65535,id+1);
    const path=new Path2D();for(const poly of (mark.islands?.length?mark.islands:[mark.shape]))if(poly?.length>2)path.addPath(polygon(poly));
    const box=bounds(mark.shape);c.save();
    // A reserve is part of the clip: the passage ends at its edge.
    for(const reserve of mark.reserves??[]){if(!(reserve?.length>2))continue;const r=bounds(reserve);if(r.x>box.x+box.w||r.x+r.w<box.x||r.y>box.y+box.h||r.y+r.h<box.y)continue;const cut=new Path2D();cut.rect(-1e4,-1e4,3e4,3e4);cut.addPath(polygon(reserve));c.clip(cut,'evenodd');}
    c.fillStyle=`rgb(${id>>8},${id&255},0)`;c.fill(path,'nonzero');c.restore();
  }
  const rgba=c.getImageData(0,0,width,height).data,out=new Int32Array(width*height);
  for(let i=0;i<out.length;i++)out[i]=rgba[i*4+3]===255&&rgba[i*4+2]===0?(rgba[i*4]<<8|rgba[i*4+1]):-1;
  return out;
}
// Sub-cell settling. A native cell is ~0.47 mm, about one cold-press dome,
// so the wash mass it holds is redistributed over the 0.2 mm output pixels by
// the same paper's height: optical density is raised in hollows and pits
// (where settling pigment collects) and lowered on the domes, where a light
// passage skips. The exponent averages to ~1 over the sheet, so the cell's
// mean density is kept; ink and bare paper are untouched.
export const PAPER_SETTLING=Object.freeze({depth:.75,min:.45,max:1.6,peak:.82,skip:.75});
export function paperSettlingExponents(field){
  let mean=0;for(const v of field)mean+=v;mean/=field.length||1;
  const out=new Float32Array(field.length),{depth,min,max,peak,skip}=PAPER_SETTLING;let sum=0;
  for(let i=0;i<field.length;i++){let m=clamp(1+depth*(mean-field[i]),min,max);if(field[i]>peak)m*=skip;out[i]=m;sum+=m;}
  const scale=field.length/(sum||1);for(let i=0;i<out.length;i++)out[i]*=scale;return out;
}
let paperSettlingField=null;
// The paper-height exponents on the paper grid, sampled bilinearly in plate
// units, so a 2× or zoomed raster settles pigment into the same hollows.
export function nativePaperSettling(){
  return {field:paperSettlingField??=paperSettlingExponents(paperAppearance()),width:PAPER_SIZE.width,height:PAPER_SIZE.height};
}
// Compose transported pigment optics over ink. `ink` is RGBA for the plate
// rectangle `region` (plate units) at ow × oh; fields are w × h native cells.
// Optional `coverage` (ow × oh vector edge mask) splits straddled cells at the
// vector edge; optional `settling` modulates wash density by paper height.
export function composeNativePixels(ink,ow,oh,fields,w,h,region={x:0,y:0,w:PLATE_RESOLUTION.width,h:PLATE_RESOLUTION.height},{coverage=null,settling=null,regions=null,rows=null,target=null}={}){
  // rows=[from,to] composes only that band (a tile of a parallel compose);
  // target is a reused full-size buffer whose band is reset from the ink.
  const r0=rows?rows[0]:0,r1=rows?rows[1]:oh,out=target?(target.set(ink.subarray(r0*ow*4,r1*ow*4),r0*ow*4),target):new Uint8ClampedArray(ink),planes=[fields.R,fields.B,fields.T],{R,B,T}=fields;
  const kx=w/PLATE_RESOLUTION.width,ky=h/PLATE_RESOLUTION.height;
  const colTap=new Int32Array(ow*4),colW=new Float64Array(ow*4),col0=new Int32Array(ow),col1=new Int32Array(ow),colF=new Float64Array(ow),weights=new Float64Array(4);
  for(let x=0;x<ow;x++){
    const gx=clamp((region.x+(x+.5)*region.w/ow)*kx-.5,0,w-1),x0=Math.floor(gx);cubicWeights(gx-x0,weights);
    col0[x]=x0;col1[x]=Math.min(w-1,x0+1);colF[x]=gx-x0;for(let j=0;j<4;j++){colTap[x*4+j]=clamp(x0-1+j,0,w-1);colW[x*4+j]=weights[j];}
  }
  // Paper settling taps (bilinear on the paper grid) per output column.
  const sw=settling?.width??0,sh=settling?.height??0,sField=settling?.field??null;
  const sCol0=sField?new Int32Array(ow):null,sCol1=sField?new Int32Array(ow):null,sColF=sField?new Float64Array(ow):null;
  if(sField)for(let x=0;x<ow;x++){const g=clamp((region.x+(x+.5)*region.w/ow)*sw/PLATE_RESOLUTION.width-.5,0,sw-1),x0=Math.floor(g);sCol0[x]=x0;sCol1[x]=Math.min(sw-1,x0+1);sColF[x]=g-x0;}
  // Optical density per native cell, for splitting a straddled vector edge.
  const density=coverage||regions?new Float32Array(w*h):null;if(density)for(let i=0;i<density.length;i++)density[i]=3-T[i*3]-T[i*3+1]-T[i*3+2];
  const reach=Math.max(1,Math.round(3*ow/region.w)),covAt=(x,y)=>coverage[clamp(y,0,oh-1)*ow+clamp(x,0,ow-1)];
  // Region id under each native cell centre (-1 outside this raster).
  let cellIds=null;const idAt=(x,y)=>regions[clamp(y,0,oh-1)*ow+clamp(x,0,ow-1)];
  if(regions){cellIds=new Int32Array(w*h);for(let cy=0;cy<h;cy++)for(let cx=0;cx<w;cx++){const px=Math.floor(((cx+.5)/kx-region.x)*ow/region.w),py=Math.floor(((cy+.5)/ky-region.y)*oh/region.h);cellIds[cy*w+cx]=px>=0&&py>=0&&px<ow&&py<oh?regions[py*ow+px]:-1;}}
  const own=new Uint8Array(4);
  const dense=new Uint8Array(4),bw=new Float64Array(4),cells=new Int32Array(4);
  // One vertically interpolated row (9 values per cell) plus its 2-row range.
  const row=new Float64Array(w*9),low=new Float64Array(w*9),high=new Float64Array(w*9),taps=new Int32Array(4);
  for(let y=r0;y<r1;y++){
    const gy=clamp((region.y+(y+.5)*region.h/oh)*ky-.5,0,h-1),y0=Math.floor(gy),y1=Math.min(h-1,y0+1),fy=gy-y0;cubicWeights(fy,weights);
    let sRow0=0,sRow1=0,sFy=0;if(sField){const g=clamp((region.y+(y+.5)*region.h/oh)*sh/PLATE_RESOLUTION.height-.5,0,sh-1),r0=Math.floor(g);sRow0=r0*sw;sRow1=Math.min(sh-1,r0+1)*sw;sFy=g-r0;}
    for(let j=0;j<4;j++)taps[j]=clamp(y0-1+j,0,h-1)*w;
    for(let cx=0;cx<w;cx++)for(let f=0;f<3;f++){
      const plane=planes[f];
      for(let c=0;c<3;c++){
        const k=cx*9+f*3+c,i=cx*3+c,a=plane[y0*w*3+i],b=plane[y1*w*3+i];
        row[k]=weights[0]*plane[taps[0]*3+i]+weights[1]*plane[taps[1]*3+i]+weights[2]*plane[taps[2]*3+i]+weights[3]*plane[taps[3]*3+i];
        low[k]=a<b?a:b;high[k]=a<b?b:a;
      }
    }
    for(let x=0;x<ow;x++){
      const t=x*4,a0=colTap[t]*9,a1=colTap[t+1]*9,a2=colTap[t+2]*9,a3=colTap[t+3]*9,w0=colW[t],w1=colW[t+1],w2=colW[t+2],w3=colW[t+3],c0=col0[x]*9,c1=col1[x]*9,p=(y*ow+x)*4;
      let settle=1;
      if(sField){const fx=sColF[x],a=sField[sRow0+sCol0[x]],b=sField[sRow0+sCol1[x]],d=sField[sRow1+sCol0[x]],e=sField[sRow1+sCol1[x]];settle=(a+(b-a)*fx)*(1-sFy)+(d+(e-d)*fx)*sFy;}
      if(regions){
        const id=regions[y*ow+x];
        if(id>=0&&(idAt(x-reach,y-reach)!==id||idAt(x+reach,y-reach)!==id||idAt(x-reach,y+reach)!==id||idAt(x+reach,y+reach)!==id)){
          const x0=col0[x],x1=col1[x],fx=colF[x];
          cells[0]=y0*w+x0;cells[1]=y0*w+x1;cells[2]=y1*w+x0;cells[3]=y1*w+x1;
          bw[0]=(1-fx)*(1-fy);bw[1]=fx*(1-fy);bw[2]=(1-fx)*fy;bw[3]=fx*fy;
          // A cell can sit inside the vector edge yet fall outside its native
          // clip (the clip is a cell rasterization); such unpainted cells are
          // not this passage's paint, so they do not lighten the edge.
          let top=0;for(let k=0;k<4;k++)if(cellIds[cells[k]]===id)top=Math.max(top,density[cells[k]]);
          let wi=0,n=0;for(let k=0;k<4;k++){own[k]=cellIds[cells[k]]===id&&density[cells[k]]>top*.45?1:0;if(own[k]){wi+=bw[k];n++;}}
          if(n>0&&n<4&&wi>1e-6){
            for(let c=0;c<3;c++){
              let ri=0,bi=0,ti=0;for(let k=0;k<4;k++)if(own[k]){const q=cells[k]*3+c,wt=bw[k];ri+=R[q]*wt;bi+=B[q]*wt;ti+=T[q]*wt;}
              const base=ink[p+c],v=nativeOverInk(ri/wi,bi/wi,ti/wi,base);
              out[p+c]=settle!==1&&v<base?Math.round(base*Math.pow(v/base,settle)):v;
            }
            continue;
          }
        }
      }
      if(coverage){
        const a=covAt(x-reach,y-reach),b=covAt(x+reach,y-reach),d=covAt(x-reach,y+reach),e=covAt(x+reach,y+reach);
        if(Math.max(a,b,d,e)-Math.min(a,b,d,e)>64){
          const x0=col0[x],x1=col1[x],fx=colF[x];
          cells[0]=y0*w+x0;cells[1]=y0*w+x1;cells[2]=y1*w+x0;cells[3]=y1*w+x1;
          bw[0]=(1-fx)*(1-fy);bw[1]=fx*(1-fy);bw[2]=(1-fx)*fy;bw[3]=fx*fy;
          let lo=Infinity,hi=-Infinity;for(let k=0;k<4;k++){const v=density[cells[k]];lo=Math.min(lo,v);hi=Math.max(hi,v);}
          if(hi-lo>.012){
            const mid=(lo+hi)/2,inside=coverage[y*ow+x]/255;let wi=0,wo=0;
            for(let k=0;k<4;k++){dense[k]=density[cells[k]]>mid?1:0;if(dense[k])wi+=bw[k];else wo+=bw[k];}
            for(let c=0;c<3;c++){
              let ri=0,bi=0,ti=0,ro=0,bo=0,to=0;
              for(let k=0;k<4;k++){const q=cells[k]*3+c,wt=bw[k];if(dense[k]){ri+=R[q]*wt;bi+=B[q]*wt;ti+=T[q]*wt;}else{ro+=R[q]*wt;bo+=B[q]*wt;to+=T[q]*wt;}}
              const base=ink[p+c],inner=nativeOverInk(ri/wi,bi/wi,ti/wi,base),outer=nativeOverInk(ro/wo,bo/wo,to/wo,base),v=Math.round(mix(outer,inner,inside));
              out[p+c]=settle!==1&&v<base?Math.round(base*Math.pow(v/base,settle)):v;
            }
            continue;
          }
        }
      }
      for(let c=0;c<3;c++){
        let r=0,back=0,tr=0;
        for(let f=0;f<3;f++){
          const o=f*3+c,lo=Math.min(low[c0+o],low[c1+o]),hi=Math.max(high[c0+o],high[c1+o]);
          const v=clamp(w0*row[a0+o]+w1*row[a1+o]+w2*row[a2+o]+w3*row[a3+o],lo,hi);
          if(f===0)r=v;else if(f===1)back=v;else tr=v;
        }
        const base=ink[p+c],v=nativeOverInk(r,back,tr,base);
        out[p+c]=settle!==1&&v<base?Math.round(base*Math.pow(v/base,settle)):v;
      }
    }
  }
  return out;
}
function composeNativePainting(ink,fields,w,h,region,options){
  return new ImageData(composeNativePixels(ink.data,ink.width,ink.height,fields,w,h,region,options),ink.width,ink.height);
}

// Select illustrative contacts while preserving all structural contours and the
// full underlying hymenium geometry. Not every blade needs every hatch in ink.
// Selection depends on authored phase/index, never display rate or wall time.
export function nativeInkSelection(marks){const keep={fibres:.12,'lamella-shadow':.08,gills:.95,veil:.42,habitat:.4};return marks.filter((mark,i)=>mark.nativeSelected||keep[mark.role]===undefined||sample(i,mark.phase??0)<keep[mark.role]);}

// Same-color ink composites commutatively. Keep identical mask/opacity runs
// together so a progressive group does not rebuild many complex clip stacks.
// This changes only drawing order; each original pressure-shaped mark survives.
export function nativeInkOrder(marks){
  const ids=new WeakMap(),groups=new Map();let serial=0;
  const id=shape=>{if(!shape)return 0;if(!ids.has(shape))ids.set(shape,++serial);return ids.get(shape);};
  for(const mark of marks){const alpha=Math.min(1,mark.opacity*(['cap-contour','stem-contour','ring'].includes(mark.role)?1.6:1.5)),key=[id(mark.clip),id(mark.clipRegions),...(mark.exclude??[]).map(id),Math.round(alpha*24)].join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mark);}
  return [...groups.values()].flat();
}

// Ink is accumulated in a transparent CPU canvas with cheap solid fills. Apply
// the registered paper contact once to the composed prefix, then put paper below.
// This keeps each real ink prefix sharp without repeating textured clip fills.
function finishNativeInk(context,painter,quality='low'){
  // Paper rasters are 1200 × 1000 (one per plate unit). Settled plates use the cubic
  // resampler; streaming frames use bilinear, which costs far less per frame.
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality=quality;
  context.globalAlpha=1;context.globalCompositeOperation='destination-in';context.drawImage(painter.inkPaper,0,0,1200,1000);
  context.globalCompositeOperation='destination-over';context.drawImage(painter.paper,0,0,1200,1000);context.globalCompositeOperation='source-over';
}
function drawNativeInkBatches(context,painter,batches){for(const batch of batches.values()){context.save();if(batch.clip)context.clip(painter.path(batch.clip));if(batch.clipRegions)context.clip(painter.regionPath(batch.clipRegions));painter.outside(context,batch.exclude,batch.footprint);context.globalAlpha=batch.opacity;context.fillStyle=painter.inkPattern;context.fill(batch.path);context.restore();}}
// Period plate caption: the name set in italic under the figures, closed with
// a full stop as on engraved plates. The procedural disclosure stays on the
// sheet, set small in the bottom margin, clear of the drawing.
export const PLATE_CAPTION=Object.freeze({titleFont:'italic 23px Georgia, serif',noteFont:'10px Georgia, serif',noteY:972});
export function plateCaptionText(title){const t=String(title??'').trim();return t?t[0].toUpperCase()+t.slice(1)+(/[.!?]$/.test(t)?'':'.'):'';}
// A field plate's reference note joins the procedural label on one line in
// the bottom margin, so the two never overlap.
function plateNoteText(study,label){const ref=(study?.annotations??[]).find(n=>n.fieldPlateId==='adjunct:reference-note');return ref?`${ref.text.toUpperCase()} · ${label}`:label;}
function drawPlateCaption(c,caption,genome,note){
  caption??={x:600,title:912,footer:939};
  c.textAlign='center';c.fillStyle='rgba(61,56,43,.8)';c.font=PLATE_CAPTION.titleFont;
  // A fictional hybrid is named as such, with what came from which parent.
  const line=genome.donorId&&!genome.correspondence?genome.hybridLine??'':'';
  c.fillText(plateCaptionText(line?'Fictional hybrid':genome.title??FAMILIES[genome.family].latin),caption.x,caption.title,1020);
  if(line){c.font='italic 15px Georgia, serif';c.fillStyle='rgba(61,56,43,.7)';c.fillText(line,caption.x,caption.title+25,1060);}
  c.font=PLATE_CAPTION.noteFont;c.fillStyle='rgba(61,56,43,.45)';c.fillText(note,caption.x,Math.max(caption.footer,PLATE_CAPTION.noteY));
}
// Period sheet furniture, drawn procedurally: a hand-lettered genus name with
// "sp." (the types are descriptive archetypes, not asserted species), figure
// numerals with fine leader lines, and the plate numeral. No signature, date,
// stamp or person's name.
const PLATE_GENUS={amanita:'Amanita',bolete:'Boletus',chanterelle:'Cantharellus',morel:'Morchella',parasol:'Macrolepiota',inkcap:'Coprinus',oyster:'Pleurotus',bracket:'Polyporus',puffball:'Lycoperdon',coral:'Ramaria',agaric:'Agrocybe',bonnet:'Mycena',waxcap:'Hygrocybe',milkcap:'Lactarius',hedgehog:'Hydnum',cup:'Peziza',trumpet:'Craterellus',earthstar:'Geastrum',nest:'Cyathus',club:'Clavaria',jelly:'Tremella',tooth:'Hericium',saddle:'Helvella',stinkhorn:'Phallus'};
export function plateGenusLabel(genome){
  if(!genome||genome.fictional||genome.correspondence)return '';
  // The ecology record names the taxon each archetype resembles; its genus is
  // the label (Laetiporus, Armillaria, Trametes ...), with the background on
  // or off, so showing the habitat never renames the specimen.
  const analogue=genome.profileId&&TYPES_BY_ID.has(genome.profileId)?habitatFor(genome).analogue:null,eco=analogue&&analogue!=='Unidentified'?analogue.split(' ')[0]:null;
  const genus=eco??PLATE_GENUS[genome.phenotype?.grammar]??PLATE_GENUS[genome.family];return genus?`${genus} sp.`:'';
}
const PLATE_BODY_ROLE=/^(cap|funnel-cap|stem|underside|puffball|coral|folded-body|margin)$/;
export function plateFigureBoxes(study){
  const boxes=new Map();
  for(const mark of [...(study.bodies??[]),...(study.washes??[])]){
    if(!Number.isInteger(mark.individual)||mark.studyRole||!PLATE_BODY_ROLE.test(mark.role??''))continue;
    for(const poly of (mark.islands?.length?mark.islands:[mark.shape]))if(poly?.length>2){const prev=boxes.get(mark.individual)??{pts:[]};prev.pts.push(...poly);boxes.set(mark.individual,prev);}
  }
  return [...boxes.entries()].map(([individual,{pts}])=>({individual,box:bounds(pts),pts})).filter(f=>f.box.w>4&&f.box.h>4);
}
const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
function drawFigureNumbers(c,figures){
  if(figures.length<2)return;
  const order=figures.slice().sort((a,b)=>(a.box.x+a.box.w/2)-(b.box.x+b.box.w/2)),group=unionBounds(figures.map(f=>f.box)),gx=group.x+group.w/2;
  c.save();c.font='italic 15px Georgia, serif';c.textAlign='center';c.textBaseline='middle';
  order.forEach((figure,k)=>{
    // Under the foot, as engraved plates number their figures; to the outer
    // side when the foot is crowded by a neighbour or the sheet edge.
    const b=figure.box,side=b.x+b.w/2<gx?-1:1,foot=figure.pts.filter(p=>p[1]>b.y+b.h*.95),fx=foot.reduce((a,p)=>a+p[0],0)/(foot.length||1);
    let x=fx+side*10,y=b.y+b.h+22;
    if(y>872||figures.some(f=>f!==figure&&intersects({x:x-9,y:y-9,w:18,h:18},f.box))){
      const half=foot.length?Math.max(...foot.map(p=>Math.abs(p[0]-fx))):b.w*.1;x=fx+side*(half+30);y=b.y+b.h*.93;
    }
    let near=figure.pts[0],best=Infinity;for(const p of figure.pts){const d=Math.hypot(p[0]-x,p[1]-y);if(d<best){best=d;near=p;}}
    const dx=near[0]-x,dy=near[1]-y,d=Math.hypot(dx,dy)||1;
    // A fine pen leader, slightly bowed and fading toward the figure.
    const ax=x+dx/d*10,ay=y+dy/d*10,bx=near[0]-dx/d*3,by=near[1]-dy/d*3,bow=(sample(k,77)-.5)*Math.min(8,d*.12);
    const lead=c.createLinearGradient(ax,ay,bx,by);lead.addColorStop(0,'rgba(48,37,28,.55)');lead.addColorStop(1,'rgba(48,37,28,.3)');
    c.strokeStyle=lead;c.lineWidth=.55;c.lineCap='round';c.beginPath();c.moveTo(ax,ay);c.quadraticCurveTo((ax+bx)/2-dy/d*bow,(ay+by)/2+dx/d*bow,bx,by);c.stroke();
    drawPenNumerals(c,`${k+1}`,x,y+6,k+3,{size:13,align:'center'});
  });
  c.restore();
}
// Hand lettering: glyph by glyph, with a drifting baseline, slight slant and
// size changes and uneven ink, so no two letters are set identically.
const HAND_FONT=size=>`italic ${size.toFixed(1)}px "Snell Roundhand","Apple Chancery","URW Chancery L","Zapf Chancery",cursive,Georgia,serif`;
function drawHandLettering(c,text,x,y,seed,{size:base=25,align='left'}={}){
  if(!text)return;
  // Script letters join, so each word is written as one stroke run; words
  // vary in size, slope and baseline, and the ink thins along the line.
  c.save();c.textBaseline='alphabetic';c.textAlign='left';const salt=hashSeed(text+seed)%997,words=String(text).split(' ');
  let width=0;words.forEach((word,i)=>{c.font=HAND_FONT(base*(.93+.14*valueNoise(i*.7+salt,1.3)));width+=c.measureText(word+(i<words.length-1?' ':'')).width;});
  let pen=align==='center'?x-width/2:align==='right'?x-width:x;const start=pen;
  words.forEach((word,i)=>{
    const size=base*(.93+.14*valueNoise(i*.7+salt,1.3)),drift=((valueNoise(i*.6+salt,4.1)-.5)*5+i*1.5)*base/25;
    c.font=HAND_FONT(size);
    c.fillStyle=`rgba(48,37,28,${(.74-.1*i+.08*valueNoise(i*.9+salt,7.7)).toFixed(3)})`;
    c.save();c.translate(pen,y+drift);c.rotate(-.025+(valueNoise(i*.5+salt,2.2)-.5)*.05);c.fillText(word,0,0);c.restore();
    pen+=c.measureText(word+' ').width;
  });
  c.restore();return pen-start;
}
// Pen numerals: digits, roman numerals and "Pl." written as pen strokes
// (unit box, y down), not set in a font. Each stroke is smoothed through
// jittered points, slanted, and swells and fades with pen pressure.
const PEN_GLYPHS={
  '0':[[[.3,0],[.08,.25],[.06,.7],[.28,1],[.5,.75],[.52,.3],[.3,0]]],
  '1':[[[.12,.2],[.3,0],[.3,1]]],
  '2':[[[.05,.22],[.25,.02],[.48,.08],[.5,.35],[.05,1],[.55,.98]]],
  '3':[[[.05,.1],[.3,0],[.52,.15],[.45,.42],[.22,.48],[.5,.58],[.55,.85],[.3,1],[.04,.9]]],
  '4':[[[.42,1],[.42,0],[.02,.68],[.58,.68]]],
  '5':[[[.52,0],[.14,.02],[.1,.44],[.38,.4],[.56,.62],[.48,.92],[.22,1],[.03,.9]]],
  '6':[[[.5,.06],[.24,.12],[.07,.52],[.12,.88],[.32,1],[.52,.84],[.48,.6],[.28,.5],[.09,.64]]],
  '7':[[[.03,.02],[.58,0],[.22,1]]],
  '8':[[[.3,.48],[.08,.3],[.15,.05],[.42,.05],[.5,.28],[.3,.48],[.06,.68],[.12,.95],[.42,.98],[.54,.72],[.3,.48]]],
  '9':[[[.48,.36],[.3,.48],[.1,.36],[.12,.08],[.36,0],[.52,.2],[.46,.6],[.24,1]]],
  'I':[[[.12,0],[.12,1]]],
  'V':[[[0,0],[.28,1],[.58,0]]],
  'X':[[[0,0],[.56,1]],[[.56,0],[0,1]]],
  'L':[[[.1,0],[.1,1],[.52,.98]]],
  'P':[[[.1,1],[.1,0],[.42,.04],[.52,.24],[.4,.46],[.1,.46]]],
  'l':[[[.16,0],[.12,.92],[.24,1]]],
  '.':[[[.08,.92],[.12,.98]]],
  ' ':[],
};
const PEN_ADVANCE={'1':.48,'I':.34,'l':.32,'.':.3,' ':.3,'X':.72,'V':.72};
export function penGlyphStrokes(text,x,y,size,seed){
  const strokes=[];let pen=x;const salt=hashSeed(String(text)+seed)%997;
  for(const [k,ch] of [...String(text)].entries()){
    const glyph=PEN_GLYPHS[ch];if(!glyph){pen+=size*.4;continue;}
    const s=size*(.92+.16*valueNoise(k*.9+salt,1.7)),base=y+(valueNoise(k*.5+salt,2.9)-.5)*size*.08,slant=.18+.06*(valueNoise(k+salt,3.3)-.5);
    for(const [j,stroke] of glyph.entries()){
      const pts=stroke.map(([u,v],i)=>{const jx=(valueNoise(salt+k*3.1+i,j+.5)-.5)*.06,jy=(valueNoise(salt+k*2.7+i,j+1.5)-.5)*.06;const yy=base-s+(v+jy)*s;return[pen+(u+jx)*s*.62+(base-yy)*slant,yy];});
      strokes.push(curveThrough(pts,6));
    }
    pen+=s*.62*(PEN_ADVANCE[ch]??.78);
  }
  return {strokes,width:pen-x};
}
function curveThrough(pts,steps){
  if(pts.length<3)return pts.length===2?[pts[0],[mix(pts[0][0],pts[1][0],.5),mix(pts[0][1],pts[1][1],.5)],pts[1]]:pts;
  const out=[];
  for(let i=0;i<pts.length-1;i++){const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    for(let t=0;t<steps;t++){const u=t/steps,u2=u*u,u3=u2*u;out.push([0,1].map(d=>.5*(2*p1[d]+(-p0[d]+p2[d])*u+(2*p0[d]-5*p1[d]+4*p2[d]-p3[d])*u2+(-p0[d]+3*p1[d]-3*p2[d]+p3[d])*u3)));}}
  out.push(pts.at(-1));return out;
}
function drawPenNumerals(c,text,x,y,seed,{size=14,align='left',weight=1}={}){
  let {strokes,width}=penGlyphStrokes(text,0,0,size,seed);const dx=align==='center'?x-width/2:align==='right'?x-width:x;
  c.save();c.lineCap='round';c.lineJoin='round';
  for(const [k,stroke] of strokes.entries()){
    for(let i=1;i<stroke.length;i++){const t=i/(stroke.length-1),press=.45+.55*Math.sin(Math.PI*Math.min(1,t*1.1));
      c.strokeStyle=`rgba(48,37,28,${(.5+.35*press).toFixed(3)})`;c.lineWidth=size*.075*weight*press*(.8+.4*valueNoise(k+i*.3,seed%97));
      c.beginPath();c.moveTo(stroke[i-1][0]+dx,stroke[i-1][1]+y);c.lineTo(stroke[i][0]+dx,stroke[i][1]+y);c.stroke();}
  }
  c.restore();
}
function drawPlateFurniture(c,study,genome){
  const figures=study.figureBoxes??plateFigureBoxes(study);
  if(!study.fieldPlate)drawFigureNumbers(c,figures);
  const label=plateGenusLabel(genome);if(!label||study.fieldPlate)return;
  const width=label.length*11,spots=[[78,866],[1122-width,866],[78,84]];
  const free=spots.find(([x,y])=>!figures.some(f=>intersects({x:x-6,y:y-26,w:width+12,h:34},f.box)))??spots[2];
  drawHandLettering(c,label,free[0],free[1],genome.seed);
}
// A period plate number in the upper outer corner, as on bound plates.
// Plate numbers follow the type's place in the catalogue, so two types in one
// set never share a number (37 is coprime to 89, the span the pen glyphs cover).
export function plateNumeral(seed,profileId=null){
  const index=profileId?MUSHROOM_TYPES.findIndex(type=>type.id===profileId):-1;
  let n=index>=0?1+(index*37)%89:1+hashSeed(String(seed))%48,out='';
  for(const [v,r] of [[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']])while(n>=v){out+=r;n-=v;}
  return `Pl. ${out}.`;
}
// Pen lettering takes the paper the same way the drawing's ink does: it is
// written on its own layer, then keeps only the ink the paper tooth accepts.
let letteringContact=null;
function drawPenLettering(c,draw){
  const W=c.canvas.width,H=c.canvas.height,layer=newCanvas(W,H),l=layer.getContext('2d');
  l.setTransform(c.getTransform());draw(l);
  letteringContact??=makeInkContactTexture();
  l.globalCompositeOperation='destination-in';l.imageSmoothingEnabled=true;l.drawImage(letteringContact,0,0,1200,1000);
  c.save();c.setTransform(1,0,0,1,0,0);c.drawImage(layer,0,0);c.restore();
}
function drawNativeLabels(c,study,genome){
  c.save();
  // Figure captions on the sheet are lettered by hand like the name; the
  // typeset title stays in the caption band.
  drawPenLettering(c,l=>{
    drawPenNumerals(l,plateNumeral(genome.seed,genome.profileId),1122,86,hashSeed(String(genome.seed))%997,{size:17,align:'right'});drawPlateFurniture(l,study,genome);
    // Panel captions on a period plate are bare figure numbers; the words
    // ("Habit study", "Schematic") belong in the letterpress explanation.
    for(const [i,note] of (study.annotations??[]).entries())if(note.y<PLATE_CAPTION.noteY-20){const m=/^\s*(\d+)\./.exec(note.text);if(m)drawPenNumerals(l,`${m[1]}.`,note.x,note.y,i+11,{size:13,align:'center'});}
  });
  c.textAlign='center';
  for(const note of study.annotations??[])if(!(note.y<PLATE_CAPTION.noteY-20)&&note.fieldPlateId!=='adjunct:reference-note'){c.fillStyle='rgba(61,56,43,.63)';c.font='italic 13px Georgia, serif';c.fillText(note.text,note.x,note.y);}drawPlateCaption(c,study.pageCaption,genome,plateNoteText(study,genome.correspondence?'FICTIONAL GEOMETRIC CONSTRUCTION':genome.fictional?'FICTIONAL HYBRID · PROCEDURAL FIELD STUDY':'PROCEDURAL FIELD STUDY'));c.restore();
}
// Settled plate state retained by the Worker so zoom and resize can re-raster
// the same ink and the same transported wash without repeating the physics.
let nativeDetailState=null;
// Re-raster a plate rectangle at a device-pixel size. Ink groups, clip stacks,
// wash fields and labels are the settled ones, so detail stays registered.
export function renderNativeDetail(state,{x=0,y=0,w=1200,h=1000,width,height}){
  const {painter,inkMarks,fields,sheetW,sheetH,study,genome}=state,started=performance.now();
  const canvas=newCanvas(width,height),c=canvas.getContext('2d',{willReadFrequently:true}),sx=width/w,sy=height/h;
  c.setTransform(sx,0,0,sy,-x*sx,-y*sy);painter.ctx=c;
  for(let index=0;index<inkMarks.length;index+=16){const batches=new Map();for(let i=index;i<Math.min(inkMarks.length,index+16);i++)painter.inkStroke(inkMarks[i],1,batches);drawNativeInkBatches(c,painter,batches);}
  finishNativeInk(c,painter,'high');
  // The same vector edges and paper settling as the base plate, at this raster.
  const ink=c.getImageData(0,0,width,height),coverage=state.coverageWashes?nativeCoverageMask(state.coverageWashes,{x,y,w,h},width,height):null,regions=state.coverageWashes?nativeRegionIds(planNativePassages({washes:state.coverageWashes}).flatMap(p=>p.marks),{x,y,w,h},width,height):null;
  c.putImageData(composeNativePainting(ink,fields,sheetW,sheetH,{x,y,w,h},{coverage,settling:nativePaperSettling(),regions}),0,0);
  drawNativeLabels(c,study,genome);
  return {canvas,ms:performance.now()-started};
}

// A large re-raster (the zoom cache) composes its wash in row bands on helper
// Workers. Each band carries a few extra rows so the cubic kernel and the
// edge resolve see the same neighbours; those rows are dropped on assembly.
export async function renderNativeDetailParallel(state,{x=0,y=0,w=1200,h=1000,width,height}){
  const {painter,inkMarks,fields,sheetW,sheetH,study,genome}=state,started=performance.now();
  const canvas=newCanvas(width,height),c=canvas.getContext('2d',{willReadFrequently:true}),sx=width/w,sy=height/h;
  c.setTransform(sx,0,0,sy,-x*sx,-y*sy);painter.ctx=c;
  for(let index=0;index<inkMarks.length;index+=16){const batches=new Map();for(let i=index;i<Math.min(inkMarks.length,index+16);i++)painter.inkStroke(inkMarks[i],1,batches);drawNativeInkBatches(c,painter,batches);}
  finishNativeInk(c,painter,'high');
  const inkAt=performance.now(),ink=c.getImageData(0,0,width,height),region={x,y,w,h};
  const coverage=state.coverageWashes?nativeCoverageMask(state.coverageWashes,region,width,height):null,regions=state.coverageWashes?nativeRegionIds(planNativePassages({washes:state.coverageWashes}).flatMap(p=>p.marks),region,width,height):null;
  const helpers=[],bands=Math.max(1,Math.min(4,(self.navigator?.hardwareConcurrency||4)-2)),margin=8;
  for(let i=1;i<bands;i++){try{helpers.push(new Worker(import.meta.url,{type:'module'}));}catch{break;}}
  const n=helpers.length+1,cut=i=>Math.round(height*i/n),out=new ImageData(width,height);
  const band=i=>{const r0=cut(i),r1=cut(i+1),b0=Math.max(0,r0-margin),b1=Math.min(height,r1+margin);return {r0,r1,b0,b1,sub:{x,y:y+b0*h/height,w,h:(b1-b0)*h/height}};};
  const rows=(src,b,channels,Type)=>{const o=new Type((b.b1-b.b0)*width*channels);o.set(src.subarray(b.b0*width*channels,b.b1*width*channels));return o;};
  const place=(pixels,b)=>out.data.set(pixels.subarray((b.r0-b.b0)*width*4,(b.r1-b.b0)*width*4),b.r0*width*4);
  try{
    const pending=helpers.map((helper,k)=>new Promise((resolve,reject)=>{
      const b=band(k+1),R=fields.R.slice(),B=fields.B.slice(),T=fields.T.slice(),inkRows=rows(ink.data,b,4,Uint8ClampedArray),covRows=coverage?rows(coverage,b,1,coverage.constructor):null,regRows=regions?rows(regions,b,1,regions.constructor):null;
      helper.onmessage=event=>event.data.error?reject(new Error(event.data.error)):resolve({b,pixels:event.data.pixels});helper.onerror=()=>reject(new Error('detail band failed'));
      helper.postMessage({kind:'detail-band',id:k,ink:inkRows,width,height:b.b1-b.b0,R,B,T,sheetW,sheetH,region:b.sub,coverage:covRows,regions:regRows},[inkRows.buffer,R.buffer,B.buffer,T.buffer]);
    }));
    const b=band(0);place(composeNativePixels(rows(ink.data,b,4,Uint8ClampedArray),width,b.b1-b.b0,fields,sheetW,sheetH,b.sub,{coverage:coverage?rows(coverage,b,1,coverage.constructor):null,settling:nativePaperSettling(),regions:regions?rows(regions,b,1,regions.constructor):null}),b);
    for(const r of await Promise.all(pending))place(r.pixels,r.b);
  }finally{for(const helper of helpers)helper.terminate();}
  c.setTransform(1,0,0,1,0,0);c.putImageData(out,0,0);c.setTransform(sx,0,0,sy,-x*sx,-y*sy);
  drawNativeLabels(c,study,genome);
  return {canvas,ms:performance.now()-started,inkMs:inkAt-started,bands:n};
}

// The plate a settle request paints: its study, its ordered ink and the
// washes with their hand edges, form glazes and grounding. Shared by the
// native painting and by the Paint Lab export, so both see the same plan.
export function nativePlateStudy({genome,scene,morph,fieldPlate=false,composition=null}){
  return morph?.orbitRest?orbitRestStudy(morph.a,composition??morph.composition,{view:morph.view,shapeModifiers:morph.shapeModifiers,scene}):morph?buildMorphStudy(withFieldPlatePair(createMorphPair(morph.a,morph.b,{composition:composition??morph.composition,view:morph.view,shapeModifiers:morph.shapeModifiers}),fieldPlate,{composition:composition??morph.composition,requireCaptured:true}),morph.blend,{scene}):buildStudy(genome,{scene});
}
export function nativePlateInk(study){return nativeInkOrder(nativeInkLighting(nativeTextureSelection(nativeInkSelection([...study.ink,...(GROUND_STYLE.hatch?nativeGroundHatching(study):[])])),study.washes??[]));}
export function nativePlateWashes(study){
  const handEdges=nativeHandEdges(study.washes??[]);
  return {...study,washes:[...(PLATE_PASSES.value?nativeWarmLights(handEdges):handEdges),...nativeFormGlazes(study.washes??[]),...(PLATE_PASSES.value?nativeValueAccents(study.washes??[]):[]),...nativeGroundingWashes(study)]};
}
export const nativePlateSeed=(genome,scene)=>hashSeed(JSON.stringify([genome.profileId,genome.values,scene]));

// ---- Paint Lab export ---------------------------------------------------------
// The plate's paint plan for Paint Lab (../index.html?import=mushroom): the
// paper, the ink as pen strokes and the wash passages as clipped brush
// gestures with their loads, flows and drying, all in sheet cells. Paint Lab
// validates it and paints it again with its own pen, brushes and operations.
export const PAINT_LAB_PLAN=Object.freeze({format:'unpainting-paint-plan',version:1,storageKey:'unpainting:paint-lab-import',maxChars:4500000,inkStep:2,inkPigment:'walnut',inkMix:Object.freeze({indigo:5})});
// Paint Lab is demos/lab/, a sibling of demos/fungi/.
export const PAINT_LAB_PAGE='lab/?import=mushroom';
export function paintLabUrl(pageUrl){return new URL('../'+PAINT_LAB_PAGE,pageUrl).href;}
// The lab pen at this sheet's cell size: a fine walnut nib with a short wick.
const PAINT_LAB_PEN=Object.freeze({nib:.6,flex:.5,reach:3,travel:1,reservoir:250,drop:1,strength:.8});
const roundTo=(v,places)=>{const k=10**places;return Math.round(v*k)/k;};
function pointInPolygon(poly,x,y){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}
  return inside;
}
// Canvas clips the vector ink with mark.clip, mark.clipRegions and the
// occluders in mark.exclude. A pen cannot be clipped, so the same tests split
// the pen path into its visible runs.
function inkVisibility(mark){
  const boxes=new WeakMap(),inside=(shape,x,y)=>{let b=boxes.get(shape);if(!b){b=bounds(shape);boxes.set(shape,b);}return x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h&&pointInPolygon(shape,x,y);};
  return (x,y)=>(!mark.clip||inside(mark.clip,x,y))&&(!mark.clipRegions||mark.clipRegions.some(shape=>inside(shape,x,y)))&&!(mark.exclude??[]).some(shape=>inside(shape,x,y));
}
// The pressure-shaped ribbon of Painter.inkStroke, as contact width and feed
// along the centreline (plate units).
function inkProfile(mark,pts){
  const full=pathLength(pts),out=[];let length=0;
  for(let i=0;i<pts.length;i++){
    if(i)length+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
    const before=pts[Math.max(0,i-1)],after=pts[Math.min(pts.length-1,i+1)],dx=after[0]-before[0],dy=after[1]-before[1],norm=Math.hypot(dx,dy)||1;
    const t=length/(full||1),u=[pts[i][0]-before[0],pts[i][1]-before[1]],v=[after[0]-pts[i][0],after[1]-pts[i][1]],den=Math.hypot(...u)*Math.hypot(...v);
    const turn=den>1e-8?1-clamp((u[0]*v[0]+u[1]*v[1])/den,-1,1):0,contact=inkContactProfile(mark,t,length,full,turn);
    const nib=.025+mark.width*(Math.pow(contact.pressure,1.1)*(.55+.45*Math.abs((dx*.62-dy*.78)/norm))*(1+contact.dwell)+.035*contact.dwell);
    const lit=mark.lightBox?lightShade(pts[i][0],pts[i][1],mark.lightBox):.5,lift=mark.lightBox&&lit<.32?smooth(clamp((valueNoise(length/9+(mark.phase??0)*1.3,7.7)-.18)/.2)):1;
    const grain=(.82+.36*valueNoise(length/2.2+3,(mark.phase??0)*.31))*(mark.lightBox?(.45+1.25*lit)*(.12+.88*lift):1);
    out.push({x:pts[i][0],y:pts[i][1],w:2*nib*grain,p:contact.pressure,dwell:contact.dwell});
  }
  return out;
}
export function paintLabInkStrokes(inkMarks,scale,step=PAINT_LAB_PLAN.inkStep){
  const strokes=[];
  for(const mark of inkMarks){
    const fragments=mark.hiddenBy?.length?visiblePathFragments(mark.points,mark.hiddenBy,lamellarSurfaces.get(mark)):[mark.points];
    const alpha=Math.min(1,(mark.opacity??.6)*(['cap-contour','stem-contour','ring'].includes(mark.role)?1.6:1.5)),visible=inkVisibility(mark);
    for(const fragment of fragments){
      if(!(fragment?.length>1))continue;
      const profile=inkProfile(mark,fragment);let run=[];
      const flush=()=>{if(run.length>1)strokes.push({role:mark.role??'',points:run});run=[];};
      const add=q=>{if(!visible(q.x,q.y)){flush();return;}run.push([roundTo(q.x*scale,3),roundTo(q.y*scale,3),roundTo(clamp(alpha*(.35+.65*q.p)),3),roundTo(q.w*scale,3)]);};
      add(profile[0]);
      for(let i=1;i<profile.length;i++){
        const a=profile[i-1],b=profile[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/step));
        for(let k=1;k<=n;k++){const t=k/n;add({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),w:mix(a.w,b.w,t),p:mix(a.p,b.p,t)});}
      }
      flush();
    }
  }
  return strokes;
}
// payload: what a settle request paints ({genome, scene, morph, fieldPlate,
// composition}). Needs a canvas for the passage masks, so it runs on the page.
export function paintLabPlan(payload,{title=payload.genome?.title??'Mushroom plate',inkStep=PAINT_LAB_PLAN.inkStep}={}){
  const study=nativePlateStudy(payload),inkMarks=nativePlateInk(study),grounded=nativePlateWashes(study);
  const passages=planNativePassages(grounded),keys=nativePalette(passages),width=nativeSheetWidth(NATIVE_PAINT_LIMITS.width,keys);
  const height=Math.round(width/1.2),scale=width/1200,seed=nativePlateSeed(payload.genome,payload.scene);
  // The plate's ink is near-black: walnut darkened with indigo, the lab's darkest neutral pair.
  const pigments=[...new Set([...keys,PAINT_LAB_PLAN.inkPigment,...Object.keys(PAINT_LAB_PLAN.inkMix)])],widen=conc=>pigments.map((_,i)=>i<conc.length?conc[i]:0);
  const maskFor=nativeMaskRasterizer();let strokes=0;
  const planned=passages.map(passage=>{
    const transport=nativePassageTransport(passage);
    const marks=passage.marks.map(mark=>{
      const gestures=nativeWashPasses(nativeBrushGestures(mark),mark);
      return {role:mark.role??'',clip:clipRuns(maskFor(mark,{width,height,scale})),gestures:gestures.map((gesture,gi)=>{
        const material=nativeGestureMaterial(passage,mark,gesture,{keys,scale,seed,strokes});strokes++;
        return {prewet:!!gesture.prewet,brush:material.brush,water:material.water,load:widen(material.conc),spacing:1.5,flowAfter:!passage.flat&&(!mark.batchedFlow||gi===gestures.length-1),
          points:material.points.map(q=>[roundTo(q.x,3),roundTo(q.y,3),roundTo(q.p,4),roundTo(q.r,3)])};
      })};
    });
    return {id:passage.id,kind:passage.kind,flat:!!passage.flat,transport,marks,
      settle:passage.flat?{steps:NATIVE_FLAT_SETTLE.steps,dt:NATIVE_FLAT_SETTLE.dt}:null,
      dry:passage.flat?{inPlace:true}:{maxSteps:NATIVE_PAINT_LIMITS.maxSteps,levelSteps:16,dt:2}};
  });
  return {format:PAINT_LAB_PLAN.format,version:PAINT_LAB_PLAN.version,source:'mushroom',title:String(title).slice(0,200),
    sheet:{width,height,mmPerCell:.2/scale,paper:nativePaperOptions(width),paperRGB:[...PAPER_TONE.base],paperShade:.04},
    pigments,
    ink:{pigment:PAINT_LAB_PLAN.inkPigment,concentration:12,mix:{...PAINT_LAB_PLAN.inkMix},amount:1,pen:{...PAINT_LAB_PEN},minWidth:1,dipLength:400,
      dry:{maxSteps:4000,levelSteps:16,dt:2,transport:{...NATIVE_TRANSPORT}},strokes:paintLabInkStrokes(inkMarks,scale,inkStep)},
    passages:planned};
}
// The plan as stored text, coarsening the ink sampling once if it is too big.
export function serializePaintLabPlan(payload,options={}){
  let text=JSON.stringify(paintLabPlan(payload,options));
  if(text.length>PAINT_LAB_PLAN.maxChars)text=JSON.stringify(paintLabPlan(payload,{...options,inkStep:PAINT_LAB_PLAN.inkStep*3}));
  if(text.length>PAINT_LAB_PLAN.maxChars)throw new RangeError('This plate is too large to open in Paint Lab');
  return text;
}

async function renderNativePainting(payload,emit,waitForFrame=async()=>{}){
  const {genome,scene,morph,revision,fieldPlate=false,composition=null}=payload,started=performance.now();
  // Raster at the display's device-pixel scale; plate geometry stays 1200 × 1000.
  const scale=clamp(Number(payload.outputScale)||1,PLATE_RESOLUTION.minScale,PLATE_RESOLUTION.maxBaseScale),W=Math.round(1200*scale),H=Math.round(1000*scale);nativeDetailState=null;
  const study=nativePlateStudy(payload);
  const renderTimings={planMs:performance.now()-started,inkMs:0,opticsMs:0,previewSampleMs:0,previewKmMs:0,finalOpticsMs:0,composeMs:0,encodeMs:0,frameWaitMs:0,transferMs:0,frames:0,fullFrames:0,fullFrameMs:0,fullFrameMaxMs:0};
  let inkPaper=null;
  if(payload.inkPaperRaster){const raster=payload.inkPaperRaster;inkPaper=newCanvas(raster.width,raster.height);inkPaper.getContext('2d').putImageData(raster,0,0);}
  const canvas=newCanvas(W,H);canvas.getContext('2d',{willReadFrequently:true});const painter=new Painter(canvas,{paper:inkPaper}),c=painter.ctx;
  // Stream sharp ink at output resolution; only the wet pigment optics remain
  // downsampled. The existing two-bitmap acknowledgement budget is unchanged.
  const preview=newCanvas(W,H),pc=preview.getContext('2d'),committed=newCanvas(W,H),ic=committed.getContext('2d',{willReadFrequently:true});
  for(const context of [c,pc,ic])context.setTransform(scale,0,0,scale,0,0);
  let frameIndex=0,lastFrame=-Infinity,paintCanvas,paintContext,paintSmooth,paintSmoothContext,white,rgba;const previewCache={};
  const awaitFrame=async()=>{const t=performance.now();await waitForFrame();renderTimings.frameWaitMs+=performance.now()-t;};
  let lastRecorded=-Infinity;
  const send=async(stage,progress,complete,metrics={})=>{
    await awaitFrame();let blob=null,frameBlob=null;renderTimings.frames++;
    // A prepared plate records its painting sequence (ink, washes, glazes) so
    // the page can replay it at natural pace when the plate is chosen.
    if(payload.recordFrames&&!complete&&performance.now()-lastRecorded>=PREPARED_PLATE.recordEveryMs){lastRecorded=performance.now();frameBlob=await preview.convertToBlob({type:'image/webp',quality:PREPARED_PLATE.frameQuality});}
    if(complete){const t=performance.now();blob=await canvas.convertToBlob({type:'image/png'});renderTimings.encodeMs+=performance.now()-t;}
    const transferAt=performance.now(),bitmap=(complete?canvas:preview).transferToImageBitmap();renderTimings.transferMs+=performance.now()-transferAt;
    emit({revision,native:true,index:frameIndex++,stage,progress,complete,blob,frameBlob,elapsed:performance.now()-started,bitmap,metrics:{...metrics,renderTimings:{...renderTimings},totalMs:performance.now()-started,fictionalConstruction:!!genome.correspondence}},[bitmap]);
  };
  painter.ctx=ic;painter.inkShapeIds=new WeakMap();painter.inkShapeCount=0;
  const inkMarks=handChainMarks(nativePlateInk(study));
  const weights=inkMarks.map(m=>Math.max(6,pathLength(m.points))),total=weights.reduce((a,b)=>a+b,0),inkStarted=performance.now();let index=0,done=0;
  // Paint playback: an artist's pace, the tool's state with every frame.
  const playback=!!payload.playback,pacing=playback?nativePlaybackPacing({inkLength:total,washMm:nativeWashTravel(planNativePassages(nativePlateWashes(study)))*PLAYBACK.plateMm/1200}):null;
  const settle=settlePacing({turned:!playback&&!!payload.turned}),inkMs=playback?pacing.inkMs:settle.inkMs;let cursorNow=null;
  const drawBatches=(context,batches)=>drawNativeInkBatches(context,painter,batches);
  // Fixed groups make overlapping alpha exactly independent of frame cadence.
  // Completed groups are rasterized once; only the current group is transient.
  while(index<inkMarks.length){
    const frameAt=performance.now(),budget=total*Math.min(1,playback&&nativePlaybackSkip.on?1:(frameAt-inkStarted)/inkMs);
    while(index<inkMarks.length){
      const end=Math.min(inkMarks.length,index+16),weight=weights.slice(index,end).reduce((a,b)=>a+b,0);if(budget<total&&done+weight>budget+1e-7)break;
      const batches=new Map();for(let i=index;i<end;i++)painter.inkStroke(inkMarks[i],1,batches);drawBatches(ic,batches);done+=weight;index=end;if(performance.now()-frameAt>22)break;
    }
    pc.globalCompositeOperation='source-over';pc.globalAlpha=1;pc.clearRect(0,0,1200,1000);pc.drawImage(committed,0,0,1200,1000);
    if(index<inkMarks.length){
      painter.ctx=pc;pc.save();const batches=new Map();let available=Math.max(0,budget-done);
      for(let i=index;i<Math.min(inkMarks.length,index+16)&&available>0;i++){const f=clamp(available/weights[i]);painter.inkStroke(inkMarks[i],f,batches);available-=weights[i];if(playback&&f<1)cursorNow=nativeInkCursor(inkMarks[i],f);}
      drawBatches(pc,batches);pc.restore();painter.ctx=ic;
    }
    finishNativeInk(pc,painter);drawNativeLabels(pc,study,genome);renderTimings.inkMs+=performance.now()-frameAt;
    if(playback&&index>=inkMarks.length)cursorNow=null;
    await send('Ink',.22*Math.min(1,budget/Math.max(1,total)),false,playback?{cursor:nativePlaybackSkip.on?null:cursorNow}:{});
    await new Promise(r=>setTimeout(r,Math.max(0,33-(performance.now()-frameAt))));
  }
  c.clearRect(0,0,1200,1000);c.drawImage(committed,0,0,1200,1000);finishNativeInk(c,painter,'high');const ink=c.getImageData(0,0,W,H);painter.ctx=c;
  const pixelHash=data=>{let h=2166136261;for(let i=0;i<data.length;i++)h=Math.imul(h^data[i],16777619);return(h>>>0).toString(16).padStart(8,'0');};
  const inkHash=pixelHash(ink.data);
  const grounded=nativePlateWashes(study);
  // Coverage and region ids depend only on the plan: built once for every frame.
  const frameCoverage=nativeCoverageMask(grounded.washes,undefined,W,H),frameRegions=nativeRegionIds(planNativePassages(grounded).flatMap(p=>p.marks),undefined,W,H);
  // Wash frames are composed at the settled plate's quality by a second
  // Worker, so the transport here keeps running while a frame is composed.
  // Without nested Workers the frame is composed here instead.
  const composer=nativeFrameComposer({ink,W,H,scale,coverage:frameCoverage,regions:frameRegions,study,genome});
  let inFlight=null,lastRecordedWash=-Infinity,frameCompleted=false,lastStreamed=null;
  const emitFrame=async(bitmap,frameBlob,stage,progress,metrics)=>{
    await awaitFrame();if(frameCompleted){bitmap.close();return;}renderTimings.frames++;
    const transferAt=performance.now();renderTimings.transferMs+=performance.now()-transferAt;
    emit({revision,native:true,index:frameIndex++,stage,progress,complete:false,blob:null,frameBlob,elapsed:performance.now()-started,bitmap,metrics:{...metrics,renderTimings:{...renderTimings},totalMs:performance.now()-started,fictionalConstruction:!!genome.correspondence}},[bitmap]);
  };
  const frameMetrics=metrics=>({...metrics,inkHash,inkMarksPlanned:study.ink.length,inkMarksRendered:inkMarks.length,outputScale:scale,outputWidth:W,outputHeight:H,...(playback?{cursor:nativePlaybackSkip.on?null:cursorNow}:{})});
  // Live patches (playback): the part of the plate the brush and the wet wash
  // changed since the last frame, composed exactly as the settled plate is,
  // posted at display cadence. Cells outside it keep their last fields.
  let liveFields=null,dirty=null,lastFullAt=0,patchInFlight=null;
  // Lettering lies in the top and bottom bands and under each figure's foot;
  // a patch elsewhere leaves it alone (the next full frame restores any).
  const letterBoxes=[{x:0,y:0,w:1200,h:125},{x:0,y:815,w:1200,h:185},...plateFigureBoxes(study).map(f=>({x:f.box.x-30,y:f.box.y+f.box.h-30,w:f.box.w+60,h:80}))];
  const grow=(r,x0,y0,x1,y1)=>r?{x0:Math.min(r.x0,x0),y0:Math.min(r.y0,y0),x1:Math.max(r.x1,x1),y1:Math.max(r.y1,y1)}:{x0,y0,x1,y1};
  const onBrush=playback?({brush,segment,lifted,palette,sheet})=>{
    const r=brush.radius*1.5+8;let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const q of segment){x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y);}
    dirty=grow(dirty,Math.floor(x0-r),Math.floor(y0-r),Math.ceil(x1+r),Math.ceil(y1+r));
    const a=segment[0],b=segment.at(-1),l=Math.hypot(b.x-a.x,b.y-a.y)||1;
    cursorNow=lifted?null:nativeBrushCursor(brush,b,{x:(b.x-a.x)/l,y:(b.y-a.y)/l},{sheetW:sheet.w,palette});
  }:null;
  const livePatch=async(sheet,stage,progress,metrics)=>{
    const sw=sheet.w,sh=sheet.h,n=sw*sh;
    if(!liveFields)liveFields={R:new Float32Array(n*3),B:new Float32Array(n*3),T:new Float32Array(n*3).fill(1)};
    // The brush's own footprint since the last patch (and the one before, for
    // the wash still settling there). Wider flow between strokes and while a
    // passage dries arrives with the full frames.
    const cells=dirty;dirty=null;
    if(!cells)return false;
    const m=3,win={x0:Math.max(0,cells.x0-m),y0:Math.max(0,cells.y0-m),x1:Math.min(sw-1,cells.x1+m),y1:Math.min(sh-1,cells.y1+m)},ww=win.x1-win.x0+1,wh=win.y1-win.y0+1;
    const t0=performance.now(),optical=nativeOpticalFields(nativeWindowLayers(sheet,win),sheet.pigments,ww*wh),recon=nativeReconstructFields(optical,ww,wh);
    // Keep the window's interior (its edge cells lack neighbours outside it).
    const ix0=win.x0>0?win.x0+1:0,iy0=win.y0>0?win.y0+1:0,ix1=win.x1<sw-1?win.x1-1:sw-1,iy1=win.y1<sh-1?win.y1-1:sh-1;
    for(const key of ['R','B','T'])for(let y=iy0;y<=iy1;y++)liveFields[key].set(recon[key].subarray(((y-win.y0)*ww+(ix0-win.x0))*3,((y-win.y0)*ww+(ix1-win.x0)+1)*3),(y*sw+ix0)*3);
    const rect=nativePatchRect(cells,sw,sh,W,H);if(!rect.w||!rect.h)return;
    const pr={x:rect.x/scale,y:rect.y/scale,w:rect.w/scale,h:rect.h/scale},letters=letterBoxes.some(b=>pr.x<b.x+b.w&&pr.x+pr.w>b.x&&pr.y<b.y+b.h&&pr.y+pr.h>b.y);
    if(composer){
      const inner={x0:ix0,y0:iy0,x1:ix1,y1:iy1},R=recon.R,B=recon.B,T=recon.T,frame={...frameMetrics(metrics)};
      patchInFlight=composer.patch({sw,sh,win,inner,rect,letters,R,B,T},[R.buffer,B.buffer,T.buffer]).then(async({bitmap,ms})=>{
        renderTimings.livePatches=(renderTimings.livePatches??0)+1;renderTimings.livePatchMs=(renderTimings.livePatchMs??0)+ms;
        await awaitFrame();if(frameCompleted){bitmap.close();return;}renderTimings.frames++;
        emit({revision,native:true,patch:{x:rect.x,y:rect.y,w:rect.w,h:rect.h},index:frameIndex++,stage,progress,complete:false,blob:null,frameBlob:null,elapsed:performance.now()-started,bitmap,metrics:{...frame,renderTimings:{...renderTimings},totalMs:performance.now()-started,fictionalConstruction:!!genome.correspondence}},[bitmap]);
      }).catch(error=>console.warn('Live patch not composed',error)).finally(()=>{patchInFlight=null;});
      return;
    }
    const sub=(src,channels,Type)=>{const o=new Type(rect.w*rect.h*channels);for(let y=0;y<rect.h;y++)o.set(src.subarray(((rect.y+y)*W+rect.x)*channels,((rect.y+y)*W+rect.x+rect.w)*channels),y*rect.w*channels);return o;};
    const pixels=composeNativePixels(sub(ink.data,4,Uint8ClampedArray),rect.w,rect.h,liveFields,sw,sh,{x:rect.x/scale,y:rect.y/scale,w:rect.w/scale,h:rect.h/scale},{coverage:sub(frameCoverage,1,frameCoverage.constructor),settling:nativePaperSettling(),regions:sub(frameRegions,1,frameRegions.constructor)});
    const patch=newCanvas(rect.w,rect.h),pctx=patch.getContext('2d',{willReadFrequently:true});pctx.putImageData(new ImageData(pixels,rect.w,rect.h),0,0);
    if(letters){pctx.setTransform(scale,0,0,scale,-rect.x,-rect.y);drawNativeLabels(pctx,study,genome);}
    renderTimings.livePatches=(renderTimings.livePatches??0)+1;renderTimings.livePatchMs=(renderTimings.livePatchMs??0)+performance.now()-t0;
    await awaitFrame();if(frameCompleted)return;renderTimings.frames++;
    const bitmap=patch.transferToImageBitmap();
    emit({revision,native:true,patch:{x:rect.x,y:rect.y,w:rect.w,h:rect.h},index:frameIndex++,stage,progress,complete:false,blob:null,frameBlob:null,elapsed:performance.now()-started,bitmap,metrics:{...frameMetrics(metrics),renderTimings:{...renderTimings},totalMs:performance.now()-started,fictionalConstruction:!!genome.correspondence}},[bitmap]);
  };
  const result=await simulateNativePassages(grounded,{seed:nativePlateSeed(genome,scene),maskFor:nativeMaskRasterizer(),paperTemplate:payload.paperTemplate,onPaper:paper=>emit({revision,nativeMaterial:true,paper}),onBrush,depositDurationMs:playback?0:settle.depositMs,travelMs:playback?pacing.washMs:0,skipPacing:()=>nativePlaybackSkip.on,checkpointIntervalMs:playback?PLAYBACK.frameMs:composer?NATIVE_COMPOSED_FRAME_MS:NATIVE_FULL_FRAME_MS,onCheckpoint:async({sheet,stage,progress,complete,force,metrics})=>{
    const live=playback&&!nativePlaybackSkip.on;
    if(playback&&!live&&!complete&&!force&&performance.now()-lastFullAt<PLAYBACK.refreshMs)return;
    lastFrame=performance.now();
    const opticsAt=performance.now();
    if(complete){
      const fields=nativeReconstructFields(nativeOpticalFields(layersOf(sheet),sheet.pigments,sheet.n),sheet.w,sheet.h);renderTimings.finalOpticsMs+=performance.now()-opticsAt;renderTimings.opticsMs+=performance.now()-opticsAt;
      const t=performance.now(),coverage=nativeCoverageMask(grounded.washes,undefined,W,H),regions=nativeRegionIds(planNativePassages(grounded).flatMap(p=>p.marks),undefined,W,H);c.putImageData(composeNativePainting(ink,fields,sheet.w,sheet.h,undefined,{coverage,settling:nativePaperSettling(),regions}),0,0);renderTimings.composeMs+=performance.now()-t;
      drawNativeLabels(c,study,genome);
      nativeDetailState={painter,inkMarks,fields,sheetW:sheet.w,sheetH:sheet.h,study,genome,revision,scale,coverageWashes:grounded.washes};
      const finalPixels=c.getImageData(0,0,W,H).data;
      // The last streamed frame is on screen before the settled plate arrives.
      if(patchInFlight)await patchInFlight;if(inFlight)await inFlight;frameCompleted=true;await awaitFrame();
      // How far the settled plate is from the last streamed frame (0 = no snap).
      const snap=composer?await composer.snap(finalPixels):lastStreamed?nativeSnapDiff(finalPixels,lastStreamed):null;composer?.close();
      await send(stage,progress,true,{...frameMetrics(metrics),...(snap??{}),finalPixelHash:pixelHash(finalPixels)});
      return;
    }
    // While a brush is moving, patches carry the frames; a full frame every
    // refreshMs picks up the wash that has run beyond the brush.
    if(live&&!force&&dirty&&performance.now()-lastFullAt<PLAYBACK.refreshMs){if(inFlight||patchInFlight)return;await livePatch(sheet,stage,progress,metrics);return;}
    if(live&&!force&&performance.now()-lastFullAt<PLAYBACK.fullFrameMs)return;
    if(playback){if(!force&&(inFlight||patchInFlight))return;lastFullAt=performance.now();dirty=null;}
    if(composer){
      // One frame in flight; a newer checkpoint replaces a frame not yet started.
      if(inFlight&&!force)return;if(inFlight)await inFlight;if(patchInFlight)await patchInFlight;
      const fields=nativeReconstructFields(nativeOpticalFields(layersOf(sheet),sheet.pigments,sheet.n),sheet.w,sheet.h);renderTimings.opticsMs+=performance.now()-opticsAt;
      if(playback)liveFields={R:fields.R.slice(),B:fields.B.slice(),T:fields.T.slice()};
      const record=!!payload.recordFrames&&performance.now()-lastRecordedWash>=PREPARED_PLATE.recordEveryMs;if(record)lastRecordedWash=performance.now();
      const frame=frameMetrics(metrics);
      inFlight=composer.compose(fields,sheet.w,sheet.h,record).then(async({bitmap,frameBlob,ms})=>{
        renderTimings.fullFrames++;renderTimings.fullFrameMs+=ms;renderTimings.fullFrameMaxMs=Math.max(renderTimings.fullFrameMaxMs,ms);
        await emitFrame(bitmap,frameBlob,stage,progress,frame);
      }).catch(error=>{console.warn('Wash frame not composed',error);}).finally(()=>{inFlight=null;});
      return;
    }
    await awaitFrame();
    const fields=nativeReconstructFields(nativeOpticalFields(layersOf(sheet),sheet.pigments,sheet.n),sheet.w,sheet.h);renderTimings.opticsMs+=performance.now()-opticsAt;
    pc.putImageData(composeNativePainting(ink,fields,sheet.w,sheet.h,undefined,{coverage:frameCoverage,settling:nativePaperSettling(),regions:frameRegions}),0,0);drawNativeLabels(pc,study,genome);
    const ms=performance.now()-opticsAt;renderTimings.composeMs+=ms;renderTimings.fullFrames++;renderTimings.fullFrameMs+=ms;renderTimings.fullFrameMaxMs=Math.max(renderTimings.fullFrameMaxMs,ms);
    lastStreamed=pc.getImageData(0,0,W,H).data;
    await send(stage,progress,false,frameMetrics(metrics));
  }});
  return {...result,totalMs:performance.now()-started};
}

// Largest per-channel difference between two RGBA rasters, and the share of
// pixels that differ by more than one level.
export function nativeSnapDiff(a,b,width=0){let max=0,over=0,box=null;for(let i=0;i<a.length;i+=4){const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));if(d>max)max=d;if(d>1){over++;if(width&&(globalThis.__snapSamples??=[]).length<12&&over%20===1)globalThis.__snapSamples.push([(i/4)%width,Math.floor(i/4/width),a[i],a[i+1],a[i+2],b[i],b[i+1],b[i+2]]);if(width){const x=(i/4)%width,y=Math.floor(i/4/width);box=box?[Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x),Math.max(box[3],y)]:[x,y,x,y];}}}return {snapMaxDiff:max,snapOver1:over/(a.length/4),...(box?{snapBox:box,snapSamples:globalThis.__snapSamples}:{})};}
// A second Worker that composes wash frames exactly as the settled plate is
// composed (vector-edge resolve, cubic upsample, paper settling, labels).
function nativeFrameComposer({ink,W,H,scale,coverage,regions,study,genome}){
  let worker;
  try{if(typeof Worker==='undefined')return null;worker=new Worker(import.meta.url,{type:'module'});}catch{return null;}
  // Everything the plate lettering reads, as plain data (figure boxes precomputed).
  const labels=JSON.parse(JSON.stringify({study:{annotations:study.annotations??[],pageCaption:study.pageCaption,fieldPlate:study.fieldPlate,scene:study.scene,figureBoxes:plateFigureBoxes(study)},genome:{seed:genome.seed,profileId:genome.profileId,correspondence:genome.correspondence,fictional:genome.fictional,family:genome.family,title:genome.title,phenotype:genome.phenotype}}));
  let next=0;const waiting=new Map();
  worker.onmessage=event=>{const resolve=waiting.get(event.data.id);if(resolve){waiting.delete(event.data.id);resolve(event.data);}};
  worker.onerror=()=>{for(const resolve of waiting.values())resolve({error:'composer failed'});waiting.clear();};
  // Lettering takes this plate's paper tooth: hand the composer the same contact texture.
  letteringContact??=makeInkContactTexture();const contact=letteringContact.getContext('2d').getImageData(0,0,letteringContact.width,letteringContact.height);
  worker.postMessage({kind:'frame-init',ink:ink.data.slice(),W,H,scale,coverage,regions,labels,contact,quality:PREPARED_PLATE.frameQuality});
  const ask=(message,transfer=[])=>new Promise(resolve=>{const id=++next;waiting.set(id,resolve);worker.postMessage({...message,id},transfer);});
  return {
    patch:async(message,transfer)=>{const reply=await ask({kind:'frame-patch',...message},transfer);if(reply.error)throw new Error(reply.error);return reply;},
    compose:async(fields,w,h,record)=>{const R=fields.R.slice(),B=fields.B.slice(),T=fields.T.slice(),reply=await ask({kind:'frame-compose',w,h,R,B,T,record},[R.buffer,B.buffer,T.buffer]);if(reply.error)throw new Error(reply.error);return reply;},
    snap:async pixels=>{const copy=pixels.slice(),reply=await ask({kind:'frame-snap',pixels:copy},[copy.buffer]);return reply.error?null:reply.snap;},
    close:()=>worker.terminate()
  };
}
let frameComposerState=null,frameBandState=null;
async function nativeComposerMessage(data){
  if(data.kind==='frame-init'){
    const canvas=newCanvas(data.W,data.H),c=canvas.getContext('2d',{willReadFrequently:true});c.setTransform(data.scale,0,0,data.scale,0,0);
    if(data.contact){letteringContact=newCanvas(data.contact.width,data.contact.height);letteringContact.getContext('2d').putImageData(data.contact,0,0);}
    const helpers=[];
    // Bands: one per helper plus this Worker. Leave a core for the page and
    // one for the physics Worker.
    const bands=Math.max(1,Math.min(4,(self.navigator?.hardwareConcurrency||4)-2));
    for(let i=1;i<bands;i++){try{const helper=new Worker(import.meta.url,{type:'module'});helper.postMessage({kind:'band-init',ink:data.ink,W:data.W,H:data.H,coverage:data.coverage,regions:data.regions});helpers.push(helper);}catch{break;}}
    frameComposerState={...data,canvas,c,inkImage:new ImageData(new Uint8ClampedArray(data.ink),data.W,data.H),target:new Uint8ClampedArray(data.ink),helpers,last:null,bandId:0};return null;
  }
  if(data.kind==='band-init'){frameBandState={...data,target:new Uint8ClampedArray(data.ink)};return null;}
  if(data.kind==='detail-band'){
    const pixels=composeNativePixels(data.ink,data.width,data.height,{R:data.R,B:data.B,T:data.T},data.sheetW,data.sheetH,data.region,{coverage:data.coverage,settling:nativePaperSettling(),regions:data.regions});
    return {id:data.id,pixels,transfer:[pixels.buffer]};
  }
  if(data.kind==='band-compose'){
    const b=frameBandState,[r0,r1]=data.rows;composeNativePixels(b.ink,b.W,b.H,{R:data.R,B:data.B,T:data.T},data.w,data.h,undefined,{coverage:b.coverage,settling:nativePaperSettling(),regions:b.regions,rows:data.rows,target:b.target});
    const pixels=b.target.slice(r0*b.W*4,r1*b.W*4);return {id:data.id,band:true,rows:data.rows,pixels,transfer:[pixels.buffer]};
  }
  const st=frameComposerState;if(!st)return {id:data.id,error:'composer not ready'};
  if(data.kind==='frame-compose'){
    const t=performance.now(),fields={R:data.R,B:data.B,T:data.T},n=st.helpers.length+1,cut=i=>Math.round(st.H*i/n);
    // Helpers take the lower bands; this Worker composes the first band meanwhile.
    const pending=st.helpers.map((helper,i)=>new Promise((resolve,reject)=>{
      const id=++st.bandId,rows=[cut(i+1),cut(i+2)],R=data.R.slice(),B=data.B.slice(),T=data.T.slice();
      helper.onmessage=event=>event.data.error?reject(new Error(event.data.error)):resolve(event.data);
      helper.postMessage({kind:'band-compose',id,w:data.w,h:data.h,R,B,T,rows},[R.buffer,B.buffer,T.buffer]);
    }));
    composeNativePixels(st.inkImage.data,st.W,st.H,fields,data.w,data.h,undefined,{coverage:st.coverage,settling:nativePaperSettling(),regions:st.regions,rows:[0,cut(1)],target:st.target});
    for(const band of await Promise.all(pending))st.target.set(band.pixels,band.rows[0]*st.W*4);
    const image=new ImageData(st.target,st.W,st.H);
    st.c.putImageData(image,0,0);drawNativeLabels(st.c,st.labels.study,st.labels.genome);st.live={R:data.R.slice(),B:data.B.slice(),T:data.T.slice()};
    const frameBlob=data.record?await st.canvas.convertToBlob({type:'image/webp',quality:st.quality}):null;
    st.last=st.c.getImageData(0,0,st.W,st.H).data;
    const bitmap=st.canvas.transferToImageBitmap();return {id:data.id,bitmap,frameBlob,ms:performance.now()-t,transfer:[bitmap]};
  }
  if(data.kind==='frame-patch'){
    // Paint playback: write the window's fields, compose only the patch.
    const t=performance.now(),{sw,sh,inner,win,rect,letters}=data,ww=win.x1-win.x0+1;
    st.live??={R:new Float32Array(sw*sh*3),B:new Float32Array(sw*sh*3),T:new Float32Array(sw*sh*3).fill(1)};
    for(const key of ['R','B','T'])for(let y=inner.y0;y<=inner.y1;y++)st.live[key].set(data[key].subarray(((y-win.y0)*ww+(inner.x0-win.x0))*3,((y-win.y0)*ww+(inner.x1-win.x0)+1)*3),(y*sw+inner.x0)*3);
    const sub=(src,channels,Type)=>{const o=new Type(rect.w*rect.h*channels);for(let y=0;y<rect.h;y++)o.set(src.subarray(((rect.y+y)*st.W+rect.x)*channels,((rect.y+y)*st.W+rect.x+rect.w)*channels),y*rect.w*channels);return o;};
    const pixels=composeNativePixels(sub(st.inkImage.data,4,Uint8ClampedArray),rect.w,rect.h,st.live,sw,sh,{x:rect.x/st.scale,y:rect.y/st.scale,w:rect.w/st.scale,h:rect.h/st.scale},{coverage:sub(st.coverage,1,st.coverage.constructor),settling:nativePaperSettling(),regions:sub(st.regions,1,st.regions.constructor)});
    const patch=newCanvas(rect.w,rect.h),pctx=patch.getContext('2d',{willReadFrequently:true});pctx.putImageData(new ImageData(pixels,rect.w,rect.h),0,0);
    if(letters){pctx.setTransform(st.scale,0,0,st.scale,-rect.x,-rect.y);drawNativeLabels(pctx,st.labels.study,st.labels.genome);}
    const bitmap=patch.transferToImageBitmap();return {id:data.id,bitmap,ms:performance.now()-t,transfer:[bitmap]};
  }
  if(data.kind==='frame-snap')return {id:data.id,snap:st.last?nativeSnapDiff(data.pixels,st.last,st.W):null};
  return {id:data.id,error:'unknown composer message'};
}


// Motion frames, when requested, are geometry previews; finished paintings use native transport.
// A morph is a short gesture; the settled painting is prepared during it.
// Loop holds each finished painting this long (from completion) before the next morph.
export const LOOP_PAUSE_DEFAULT_SECONDS=6;
export const MORPH_DEFAULT_SECONDS=5,MORPH_FADE_MS=320,MORPH_SETTLE_FADE_MS=480;
// Pre-rendered next plates. At most `limit` are held; a replay of the recorded
// sequence lasts replayMs whatever the machine's speed.
// Zoom cache: the settled plate re-rastered at factor x the backing scale,
// at most maxWidth px wide (maxWidthLowMemory on devices reporting < 4 GB).
export const ZOOM_CACHE=Object.freeze({factor:2,maxWidth:5000,maxWidthLowMemory:3000,idleMs:600,pinchRedrawMs:90});
export const PREPARED_PLATE=Object.freeze({limit:2,idleMs:700,recordEveryMs:180,frameQuality:.94,replayMs:3600,version:2});
// Full identity of a prepared painting: plate (genome, recipe, composition,
// view, scene, field study), raster scale and paper sheet. Any difference means
// the prepared artefact is a different picture and must never be shown.
export function preparedPlateKey({plateKey,outputScale,sheet}){return JSON.stringify(['prepared',PREPARED_PLATE.version,plateKey,outputScale,sheet]);}
export function preparedPlateMatches(job,request){return !!job&&!job.failed&&!job.cancelled&&job.key===preparedPlateKey(request);}
export function morphSettings(state) {
  return {seed:state.seed,next:state.next,typeId:state.typeId,donorId:state.donorId||null,
    nextTypeId:state.nextTypeId??state.typeId,nextDonorId:state.nextDonorId||null,
    fieldPlate:!!state.fieldPlate,compositionAnchors:state.compositionAnchors??null,compositionSeed:state.compositionSeed,compositionCount:state.compositionCount,...orbitViewOptions(state),scene:state.scene,duration:state.duration,fps:24,width:720,height:600,quality:.9,format:'image/webp',version:2};
}
export function morphSamples(duration, fps=24) {
  if (!Number.isFinite(duration) || duration<3 || duration>20 || fps!==24) throw new RangeError('Unsupported morph sampling');
  const intervals=Math.ceil(duration*fps);
  return Array.from({length:intervals+1},(_,i)=>i/intervals);
}
export const morphIdentity = settings => JSON.stringify(settings);
export class MorphCache {
  constructor(maxBytes=96*1024*1024-5*720*600*4,maxFrames=481) { this.maxBytes=maxBytes;this.maxFrames=maxFrames;this.epoch=0;this.reset(); }
  reset(key=null) {
    this.epoch++;this.worker?.terminate();this.worker=null;
    for(const bitmap of this.decoded?.values()??[])bitmap.close();
    this.decoded=new Map();this.fingerprints=[];this.blobs=[];this.bytes=0;this.key=key;this.ready=false;
    return this.epoch;
  }
  add(epoch,blob) {
    if(epoch!==this.epoch)return false;
    if(this.bytes+blob.size>this.maxBytes||this.blobs.length>=this.maxFrames)throw new RangeError('Morph cache limit reached; choose a shorter duration');
    this.blobs.push(blob);this.bytes+=blob.size;return true;
  }
  async bitmap(index) {
    if(this.decoded.has(index))return this.decoded.get(index);
    const epoch=this.epoch,blob=this.blobs[index];if(!blob)return null;
    let bitmap;try{bitmap=await createImageBitmap(blob);}catch(error){if(epoch!==this.epoch)return null;throw error;}
    if(epoch!==this.epoch){bitmap.close();return null;}
    // At most four decoded 720×600 RGBA frames (6.6 MiB), plus one in-flight decode.
    while(this.decoded.size>=4){const first=this.decoded.keys().next().value;this.decoded.get(first).close();this.decoded.delete(first);}
    this.decoded.set(index,bitmap);return bitmap;
  }
}

// Coalesce many input events into one sketch per browser frame. A held pointer
// never starts a detailed repaint; settling gets two frames to show its status.
// Generation guards also reject callbacks already queued when cancellation ran.
export class SketchScheduler {
  constructor({preview,refine,phase=()=>{},requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=handle=>cancelAnimationFrame(handle),setDelay=(callback,ms)=>setTimeout(callback,ms),clearDelay=handle=>clearTimeout(handle),delay=180}){
    Object.assign(this,{preview,refine,phase,requestFrame,cancelFrame,setDelay,clearDelay,delay});
    this.frame=0;this.timer=0;this.refineFrame=0;this.generation=0;this.version=0;this.value=null;this.held=false;
  }
  stopRefine(){this.clearDelay(this.timer);this.timer=0;this.cancelFrame(this.refineFrame);this.refineFrame=0;this.releasePending=false;}
  cancel(){this.generation++;this.version++;this.cancelFrame(this.frame);this.frame=0;this.stopRefine();this.value=null;this.held=false;}
  hold(){this.held=true;this.stopRefine();}
  input(value){
    this.value=value;this.version++;this.stopRefine();this.phase('sketch');
    if(!this.frame){const generation=this.generation;this.frame=this.requestFrame(()=>{
      if(generation!==this.generation)return;
      this.frame=0;this.preview(this.value);
      if(this.releasePending){this.releasePending=false;this.settle();}
    });}
    if(!this.held)this.settle(this.delay);
  }
  release(){this.held=false;this.settle();}
  settle(delay=0){
    this.clearDelay(this.timer);this.timer=0;
    if(!this.value||this.held)return;
    const generation=this.generation,version=this.version;
    const current=()=>generation===this.generation&&version===this.version&&!this.held;
    this.timer=this.setDelay(()=>{
      this.timer=0;if(!current())return;
      if(this.frame){this.releasePending=true;return;}
      if(this.refineFrame)return;
      this.refineFrame=this.requestFrame(()=>{
        if(!current())return;
        this.phase('refining');
        this.refineFrame=this.requestFrame(()=>{
          if(!current())return;this.refineFrame=0;this.refine(this.value,current);
        });
      });
    },delay);
  }
}

export function presentSettledBitmap(bitmap,isCurrent,present){
  try{if(!isCurrent())return false;present(bitmap);return true;}
  finally{bitmap.close();}
}

async function renderMorph(settings,emit,isCurrent) {
  const target=newCanvas(settings.width,settings.height),painter=new Painter(target);
  const a=generateSpecimen(settings.seed,settings.typeId,settings.donorId),b=generateSpecimen(settings.next,settings.nextTypeId??settings.typeId,settings.nextTypeId?settings.nextDonorId:settings.donorId),pair=withFieldPlatePair(createMorphPair(a,b,{...settings,composition:applyCompositionAnchors(createSpecimenComposition({...a,seed:settings.compositionSeed??a.seed},{count:settings.compositionCount||buildSketch(a).specimenCount}),settings.compositionAnchors)}),settings.fieldPlate);
  const samples=morphSamples(settings.duration,settings.fps);let encodedBytes=0;
  for(let i=0;i<samples.length&&isCurrent();i++) {
    // Full native anatomy and pigment; only the motion canvas resolution is reduced.
    const t=smooth(samples[i]);painter.sketch(morphGenome(pair,t),{morph:pair,blend:t,scene:settings.scene??'plain'});
    const blob=target.convertToBlob?await target.convertToBlob({type:settings.format,quality:settings.quality}):
      await new Promise(resolve=>target.toBlob(resolve,settings.format,settings.quality));
    if(!blob)throw new Error('Frame encoding failed');
    encodedBytes+=blob.size;if(encodedBytes>96*1024*1024)throw new RangeError('Morph cache byte limit reached');
    if(!isCurrent())return;
    const bytes=painter.ctx.getImageData(0,0,settings.width,settings.height).data;let hash=2166136261;
    for(const byte of bytes)hash=Math.imul(hash^byte,16777619);
    emit({blob,index:i,total:samples.length,fingerprint:hash>>>0});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
}
if(typeof document==='undefined'&&typeof self!=='undefined'&&typeof self.postMessage==='function') {
  let nativeOutstanding=0,frameWaiter=null;
  const waitForFrame=()=>nativeOutstanding<2?Promise.resolve():new Promise(resolve=>{frameWaiter=resolve;});
  self.onmessage=async event=>{
    if(event.data.kind==='native-frame-ack'){nativeOutstanding=Math.max(0,nativeOutstanding-1);if(nativeOutstanding<2&&frameWaiter){const resolve=frameWaiter;frameWaiter=null;resolve();}return;}
    if(/^(frame-(init|compose|snap|patch)|band-(init|compose)|detail-band)$/.test(event.data.kind??'')){
      try{const reply=await nativeComposerMessage(event.data);if(reply){const {transfer=[],...message}=reply;self.postMessage(message,transfer);}}
      catch(error){self.postMessage({id:event.data.id,error:error.message});}
      return;
    }
    try {
      if(event.data.kind==='implicit-prepare'){const {a,b,composition,view,shapeModifiers,nativeTargets}=event.data;const data=createImplicitMorph(a,b,composition,{view,shapeModifiers,nativeTargets:!!nativeTargets});self.postMessage({kind:'implicit-ready',data:serializableImplicitMorph(data),revision:event.data.revision});return;}
      if(event.data.kind==='native-detail'){
        const state=nativeDetailState,{region,requestId,revision}=event.data;
        if(!state||state.revision!==revision){self.postMessage({nativeDetail:true,requestId,revision,unavailable:true});return;}
        try{const {canvas,ms}=event.data.parallel?await renderNativeDetailParallel(state,region):renderNativeDetail(state,region),bitmap=canvas.transferToImageBitmap();self.postMessage({nativeDetail:true,requestId,revision,region,bitmap,ms},[bitmap]);}
        catch(error){self.postMessage({nativeDetail:true,requestId,revision,detailError:error.message});}
        return;
      }
      if(event.data.kind==='native-skip'){nativePlaybackSkip.on=true;return;}
      if(event.data.kind==='settle'){
        nativePlaybackSkip.on=false;await renderNativePainting(event.data,(message,transfer)=>{if(message.bitmap)nativeOutstanding++;self.postMessage(message,transfer);},waitForFrame);return;
      }
      await renderMorph(event.data,frame=>self.postMessage(frame),()=>true);self.postMessage({done:true});
    }catch(error){self.postMessage({error:error.message,revision:event.data.revision});}
  };
}

function shortSeed(seed) { return seed.length > 21 ? seed.slice(0, 18) + '…' : seed; }

export function parseState(search) {
  const q = new URLSearchParams(search);
  const typeId = TYPES_BY_ID.has(q.get('type')) ? q.get('type') : 'amanita-1';
  const profile = getMushroomType(typeId), donor = q.get('donor');
  const donorId = TYPES_BY_ID.has(donor) && compatibleHybrid(typeId, donor).ok ? donor : null;
  const seed = (q.get('seed') || 'woodland-042').slice(0, 64), next = (q.get('next') || 'woodland-108').slice(0, 64);
  const includeAlpha=q.get('alpha')==='1',nextTypeId=TYPES_BY_ID.has(q.get('nextType'))?q.get('nextType'):chooseMorphTarget(typeId,next,{includeAlpha});
  const nextDonor=q.get('nextDonor'),nextDonorId=TYPES_BY_ID.has(nextDonor)&&compatibleHybrid(nextTypeId,nextDonor).ok?nextDonor:null;
  const amount = Number(q.get('blend') || 0), pace = Number(q.get('pace') || MORPH_DEFAULT_SECONDS);
  const selectedScene=HABITAT_CHOICES.includes(q.get('scene'))?q.get('scene'):'auto';
  const background=q.get('background')==='1';
  const paint=q.get('paint')==='fast'?'fast':'full';
  const param=(key,value,min,max)=>{const n=Number(q.get(key)??value);return Number.isFinite(n)?clamp(n,min,max):value;};
  return { compositionAnchors:decodeCompositionAnchors(q.get('anchors')),compositionSeed:(q.get('layout')||seed).slice(0,64),compositionCount:Math.round(param('members',0,0,5)),yaw:param('yaw',.12,-Math.PI,Math.PI),pitch:param('pitch',.36,-.12,.85),capDepth:param('depth',1,.65,1.4),stemBend:param('bend',0,-50,50),seed, next, family: profile.family, typeId, donorId,nextTypeId,nextDonorId, selectedScene, background, paint, fieldPlate:q.get('plate')==='1', scene:background?resolveHabitat(selectedScene,typeId):'plain',
    includeAlpha,blend: Number.isFinite(amount) ? clamp(amount) : 0,
    duration: Number.isFinite(pace) ? clamp(pace, 3, 20) : 8, loopPause: param('dwell', LOOP_PAUSE_DEFAULT_SECONDS, 2, 20) };
}

// Beta (field guide): the 20 forms being brought to field-guide quality
// (BETA.md, user decision 2026-10-20). Every other type is alpha (experimental):
// still selectable and still a valid morph source and destination, but random
// picks draw from beta unless experimental forms are included.
export const BETA_TYPES=Object.freeze(['amanita-1','amanita-3','bolete-1','chanterelle-1','morel-1','parasol-1','inkcap-1','agaric-1','agaric-4','waxcap-1','milkcap-1','hedgehog-1','oyster-1','bracket-6','bracket-1','tooth-1','puffball-1','earthstar-1','stinkhorn-1','coral-1']);
const BETA_SET=new Set(BETA_TYPES);
export function isBetaType(id){return BETA_SET.has(id);}
// Only beta forms present in this catalog take part (bracket-6 arrives with the habitat work).
// bracket-6 (Sulphur shelf) is a habitat-view type: it is selectable but not
// drawn as a random or morph destination, so default plates stay unchanged.
export function randomTypePool(includeAlpha=false){return (includeAlpha?MUSHROOM_TYPES:MUSHROOM_TYPES.filter(type=>BETA_SET.has(type.id))).filter(type=>type.id!=='bracket-6');}
export function chooseMorphTarget(typeId,seed,{includeAlpha=false}={}){
  // Every other form in the pool is a valid destination, same family included.
  const choices=randomTypePool(includeAlpha).filter(type=>type.id!==typeId);
  return choices[hashSeed(`target:${seed}`)%choices.length].id;
}
// Promote the endpoint without recapturing the field layout. Its sourceBox
// and adjunct slots belong to the carried plate, not the newly selected target.
export function createPromotedMorphPair(pair,next,{fieldPlate=!!pair.fieldPlate}={}){
  // A seed morph lands on its destination's own constructor layout (its
  // preview targets native roots). Record those roots, so the next field pair
  // paints the destination where the morph left it instead of re-blocking it.
  let composition=pair.composition;const b=pair.b,sameNext=b.profileId===next.profileId&&b.donorId===next.donorId&&b.family===next.family;
  const landed=pair.sameRecipe&&!pair.implicitMorph&&!pair.connectedAnatomy&&!composition?.implicitAnchors&&!sameNext;
  if(landed)composition=implicitAnchoredComposition(b,composition,{view:pair.view,shapeModifiers:pair.shapeModifiers,blocking:false}).composition;
  const promoted=createMorphPair(pair.b,next,{composition,view:pair.view,shapeModifiers:pair.shapeModifiers}),carried=pair.composition?.pageFrame;
  // Recording the roots changes the endpoint identity; keep the page frame the
  // morph ended on so the settled plate lands at the same scale and offset.
  if(landed&&carried?.version===1){promoted.composition={...promoted.composition,pageFrame:Object.freeze({...carried,key:'carried',bId:pageEndpointId(promoted,0,carried.scene)})};composition=promoted.composition;}
  return withFieldPlatePair(promoted,fieldPlate,{composition});
}
export function advanceMorphState(state,nextSeed){
  const typeId=state.nextTypeId??state.typeId,scene=state.background&&state.selectedScene?resolveHabitat(state.selectedScene,typeId):state.scene;
  return {...state,typeId,scene,family:getMushroomType(typeId).family,donorId:state.nextDonorId??null,seed:state.next,
    next:nextSeed,nextTypeId:chooseMorphTarget(typeId,nextSeed,{includeAlpha:!!state.includeAlpha}),nextDonorId:null,blend:0};
}

function randomSeed() {
  const words = ['woodland', 'fern', 'moss', 'rain', 'spore', 'birch', 'lichen', 'hollow'];
  const n = crypto.getRandomValues(new Uint32Array(2));
  return `${words[n[0] % words.length]}-${n[1].toString(36).slice(0, 6)}`;
}

// Display-only viewport. These helpers never request a paint, alter the canvas
// bitmap, touch morphology/physics, or change the PNG export source.
export function clampPlateViewport(view,{width,height}){
  const scale=Math.max(1,Math.min(6,Number.isFinite(view.scale)?view.scale:1));
  const clampOffset=(v,size)=>Math.max(Math.max(0,size)*(1-scale),Math.min(0,Number.isFinite(v)?v:0));
  return {scale,x:clampOffset(view.x,width),y:clampOffset(view.y,height)};
}
export function zoomPlateViewport(view,nextScale,anchor,size){
  const scale=Math.max(1,Math.min(6,Number.isFinite(nextScale)?nextScale:view.scale));
  const ratio=scale/view.scale;
  return clampPlateViewport({scale,x:anchor.x-(anchor.x-view.x)*ratio,y:anchor.y-(anchor.y-view.y)*ratio},size);
}
// The plate zooms about its centre only, so it never sits off-centre and
// there is nothing to pan.
export function centredPlateViewport(scale,size){
  const s=Math.max(1,Math.min(6,Number.isFinite(scale)?scale:1));
  return {scale:s,x:Math.max(0,size.width)*(1-s)/2,y:Math.max(0,size.height)*(1-s)/2};
}
// Display zoom is independent of model-space camera rotation.
export const ORBIT_YAW_PER_WIDTH=3.2;
export function orbitPlateCamera(camera,delta,size){
  const yaw=camera.yaw+delta.x*ORBIT_YAW_PER_WIDTH/Math.max(1,size.width),wrapped=((yaw+Math.PI)%CA_TAU+CA_TAU)%CA_TAU-Math.PI;
  return {yaw:Number.isFinite(wrapped)?wrapped:camera.yaw,
    pitch:clamp(camera.pitch-delta.y*1.4/Math.max(1,size.height),-.12,.85)};
}
// The plate's gestures: a drag turns it once it has travelled a few pixels
// (so a tap stays a tap), scroll or pinch zooms about the centre, a double
// click or double tap fits, and a single tap or click calls onTap.
export const PLATE_TOUCH=Object.freeze({turnSlop:6,mouseSlop:3,tapMs:350,doubleTapMs:320,doubleTapSlop:28});
export function mountPlateViewport({viewport,canvas,onOrbitStart=()=>{},onOrbit=()=>{},onOrbitEnd=()=>{},onFit=()=>{},onView=()=>{},onTap=()=>{},root=viewport.parentElement}){
  let view={scale:1,x:0,y:0},size={width:viewport.clientWidth,height:viewport.clientHeight},pinch=null;
  let orbitEnabled=false,gestureMode=null,orbitHeld=false,pending=null,lastTap=null;
  const pointers=new Map(),events=new AbortController();
  const listen=(el,type,fn,options={})=>el?.addEventListener(type,fn,{...options,signal:events.signal});
  const sync=()=>{
    viewport.dataset.viewportMode=orbitEnabled?'rotate':'none';viewport.dataset.viewportGesture=gestureMode??'none';
    viewport.classList.toggle('is-orbiting',gestureMode==='rotate');
  };
  const apply=scale=>{
    view=centredPlateViewport(scale,size);
    canvas.style.transform=`translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    viewport.dataset.viewportZoom=canvas.dataset.viewportZoom=String(view.scale);
    viewport.dataset.viewportX=String(view.x);viewport.dataset.viewportY=String(view.y);
    viewport.classList.toggle('is-zoomed',view.scale>1);
    onView({...view},{...size});
    return view;
  };
  const zoom=factor=>apply(view.scale*factor);
  const endOrbit=settle=>{if(!orbitHeld)return;orbitHeld=false;onOrbitEnd({settle});};
  const cancelGesture=({settle=false}={})=>{
    const ids=[...pointers.keys()];pointers.clear();pinch=null;gestureMode=null;pending=null;
    for(const id of ids)if(viewport.hasPointerCapture(id))viewport.releasePointerCapture(id);
    endOrbit(settle);sync();
  };
  const reset=()=>{cancelGesture({settle:true});const result=apply(1);onFit();return result;};
  const local=event=>{const r=viewport.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};};
  const spread=()=>{const [a,b]=[...pointers.values()];return a&&b?Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)):null;};
  const beginPinch=()=>{const distance=spread();pinch=distance?{distance,scale:view.scale}:null;};
  listen(viewport,'contextmenu',event=>event.preventDefault());
  // Safari's own pinch-zoom of the page never starts on the plate.
  for(const type of ['gesturestart','gesturechange','gestureend'])listen(viewport,type,event=>event.preventDefault(),{passive:false});
  listen(viewport,'wheel',event=>{
    event.preventDefault();
    const unit=event.deltaMode===1?16:event.deltaMode===2?size.height:1;
    const delta=Math.max(-240,Math.min(240,event.deltaY*unit));
    zoom(Math.exp(-delta*.002));
  },{passive:false});
  listen(viewport,'dblclick',event=>{event.preventDefault?.();reset();});
  listen(viewport,'pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    event.preventDefault();viewport.focus({preventScroll:true});
    pointers.set(event.pointerId,local(event));viewport.setPointerCapture(event.pointerId);
    // A second finger makes the gesture a pinch. A turn that had begun stays
    // held (and settles when every finger lifts); one that had not never fires.
    if(pointers.size>=2){pending=null;gestureMode='pinch';beginPinch();}
    else{gestureMode='pending';pending={id:event.pointerId,start:local(event),time:event.timeStamp,touch:event.pointerType==='touch'};}
    sync();
  });
  listen(viewport,'pointermove',event=>{
    const previous=pointers.get(event.pointerId);if(!previous)return;
    const current=local(event);pointers.set(event.pointerId,current);
    if(pointers.size>=2){if(!pinch)beginPinch();const distance=spread();if(pinch&&distance)apply(pinch.scale*distance/pinch.distance);}
    else if(gestureMode==='pending'){
      if(Math.hypot(current.x-pending.start.x,current.y-pending.start.y)<(pending.touch?PLATE_TOUCH.turnSlop:PLATE_TOUCH.mouseSlop))return;
      const start=pending.start;pending=null;
      if(!orbitEnabled){gestureMode='still';sync();return;}
      gestureMode='rotate';orbitHeld=true;onOrbitStart();onOrbit({x:current.x-start.x,y:current.y-start.y},size);
    }else if(gestureMode==='rotate'&&orbitEnabled)onOrbit({x:current.x-previous.x,y:current.y-previous.y},size);
    sync();
  });
  const release=event=>{
    if(!pointers.has(event.pointerId))return;
    const tap=event.type==='pointerup'&&pointers.size===1&&gestureMode==='pending'&&pending?.id===event.pointerId&&event.timeStamp-pending.time<PLATE_TOUCH.tapMs;
    const touch=!!pending?.touch,at=local(event);
    pointers.delete(event.pointerId);
    if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
    if(pointers.size>=2){gestureMode='pinch';beginPinch();}
    else if(pointers.size){pinch=null;if(gestureMode==='pinch')gestureMode='still';}
    else{pinch=null;pending=null;gestureMode=null;endOrbit(true);}
    sync();
    if(!tap)return;
    // A double tap fits the plate; a mouse double click arrives as dblclick.
    if(touch&&lastTap&&event.timeStamp-lastTap.time<PLATE_TOUCH.doubleTapMs&&Math.hypot(at.x-lastTap.x,at.y-lastTap.y)<PLATE_TOUCH.doubleTapSlop){lastTap=null;reset();return;}
    lastTap=touch?{...at,time:event.timeStamp}:null;onTap();
  };
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(viewport,type,release);
  listen(root,'keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName??''))return;
    if(!['+','=','-','_','0'].includes(event.key))return;
    event.preventDefault();if(event.key==='0')reset();else zoom(event.key==='+'||event.key==='='?1.25:1/1.25);
  });
  const resize=()=>{
    const next={width:viewport.clientWidth,height:viewport.clientHeight};
    if(!next.width||!next.height||next.width===size.width&&next.height===size.height)return;
    cancelGesture({settle:true});size=next;apply(view.scale);
  };
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  if(observer)observer.observe(viewport);else if(globalThis.addEventListener)listen(globalThis,'resize',resize);
  if(globalThis.addEventListener)listen(globalThis,'blur',()=>cancelGesture({settle:true}));
  apply(1);sync();
  return {getState:()=>({...view}),getMode:()=>orbitEnabled?'rotate':'none',isOrbitHolding:()=>orbitHeld,cancelGesture,
    setOrbitEnabled:enabled=>{enabled=!!enabled;if(enabled!==orbitEnabled){cancelGesture({settle:false});orbitEnabled=enabled;}sync();},
    fit:reset,zoomIn:()=>zoom(1.25),zoomOut:()=>zoom(1/1.25),
    destroy:()=>{cancelGesture({settle:false});events.abort();observer?.disconnect();}};
}

async function mount() {
  const $ = id => document.getElementById(id), state = parseState(location.search),colonyParam=new URLSearchParams(location.search).get('colony');
  if(colonyParam==='0'||colonyParam==='1')setHabitColonyAtRest(colonyParam==='1');
  const canvas = $('painting'), status = $('status');
  const plateViewport=$('plate-viewport')?mountPlateViewport({viewport:$('plate-viewport'),canvas,onTap:()=>skipLivePainting(),
    onOrbitStart:()=>{dropZoomCache();cancelPrepared();pause({settle:false,fromOrbit:true});if(!morphPair?.connectedAnatomy&&state.blend>0&&state.blend<1){state.blend=state.blend<.5?0:1;}sketchQueue.hold();requestSketch();},
    onOrbit:(delta,size)=>{Object.assign(state,orbitPlateCamera(state,delta,size));applyView();update3DControls();requestSketch();},
    onOrbitEnd:({settle})=>{if(settle){sketchQueue.release();persist();}else sketchQueue.cancel();},
    onFit:()=>{if(!morphPair||isDefaultOrbitView(state))return;pause({settle:false});Object.assign(state,DEFAULT_ORBIT_VIEW);applyView();update3DControls();persist();showFinished();},
    onView:(view,size)=>queueMicrotask(()=>onPlateView(view,size))
  }):null;
  let painter, a, b, morphPair, playing = false, continuous = false, replaying = false, drawingStage = 1, frame = 0, last = 0, dirty = true, lastTraits = 0;
  let loopPauseTimer=0,loopPauseToken=0;
  const cache=new MorphCache();let playbackEpoch=0;let preparing=false,prepareStarted=0,playStart=0,playBlend=0,displayIndex=-1,decoding=false;
  let metrics={delivered:0,skipped:0,intervals:[],preparationMs:0},displayAt=0,hiddenAt=0;
  let renderMode='painted',sketchPlaying=false,lastSketchAt=0,settledWorker=null,settledBusy=false,settledRevision=0,workerUnavailable=false;
  const previewSamples=[];
  const implicitPreparation=new MorphPreparation(()=>new Worker(import.meta.url,{type:'module'}));
  // A warm painting Worker: its module is already loaded and parsed, so a new
  // plate's ink starts streaming without the Worker start-up cost. One spare is
  // kept; it is replaced when the page is idle again.
  let spareWorker=null,spareTimer=0;
  function warmSpare(delay=0){clearTimeout(spareTimer);spareTimer=setTimeout(()=>{spareTimer=0;if(!spareWorker&&typeof Worker!=='undefined'){try{spareWorker=new Worker(import.meta.url,{type:'module'});}catch{spareWorker=null;}}},delay);}
  function paintingWorker(){const worker=spareWorker??new Worker(import.meta.url,{type:'module'});spareWorker=null;warmSpare(1500);return worker;}
  warmSpare(0);
  let implicitReadyIntent=null,implicitSettle=false;
  function cancelImplicitPreparation(){implicitPreparation.cancel();implicitReadyIntent=null;canvas.dataset.preparingShapes='false';implicitSettle=false;}
  function fieldPending(pair){return !!pair&&(pair.implicitMorph?!pair.implicitData:!!pair.previewField&&!pair.previewData&&morphPreviewKind(pair)==='field');}
  function ensureImplicitReady(ready){
    if(!fieldPending(morphPair)){ready();return;}
    const pair=morphPair,key=JSON.stringify([pair.a,pair.b,pair.composition,pair.view,pair.shapeModifiers,!pair.implicitMorph]);implicitReadyIntent=ready;
    canvas.dataset.preparingShapes='true';status.textContent='Getting shapes ready…';
    implicitPreparation.prepare(key,{a:pair.a,b:pair.b,composition:pair.composition,view:pair.view,shapeModifiers:pair.shapeModifiers,nativeTargets:!pair.implicitMorph},data=>{
      if(pair!==morphPair)return;
      if(!pair.implicitMorph){pair.previewData=data;canvas.dataset.preparingShapes='false';canvas.dataset.shapePreparationMs=data.preparationMs.toFixed(2);const callback=implicitReadyIntent;implicitReadyIntent=null;preparing=false;callback?.();return;}
      pair.implicitData=data;pair.composition=data.composition;syncImplicitPlateIdentity(pair);pair.source=sampleImplicitMorph(data,0);pair.target=sampleImplicitMorph(data,1);pair.measuresA=measureSketch(pair.source);pair.measuresB=measureSketch(pair.target);
      state.compositionAnchors=data.composition.implicitAnchors;canvas.dataset.preparingShapes='false';canvas.dataset.shapePreparationMs=data.preparationMs.toFixed(2);
      const callback=implicitReadyIntent;implicitReadyIntent=null;preparing=false;persist();callback?.();
    },error=>{canvas.dataset.preparingShapes='false';preparing=false;status.textContent=error.message;controls();});
  }
  let nativeResult=null,nativeBuilding=null,nativePhase='',nativeReplayIndex=-1,nativeDecodeBusy=false;
  let nativePaperTemplate=null,nativeInkPaperRaster=null;
  // Display resolution. The backing store follows CSS size × devicePixelRatio;
  // a zoomed, settled view gets a device-resolution re-raster of exactly the
  // visible plate rectangle from the Worker that holds the settled painting.
  // A zoomed view asks for its sharp re-raster almost at once; a continuing
  // gesture supersedes the request.
  const DETAIL_REQUEST_DELAY_MS=60;
  let baseScale=1,detailWorker=null,detailKey=null,detailRevision=0,detailSerial=0,detailTimer=0,detailShown=null,detailResolutionQuery=null;
  const detailLatest={base:0,detail:0,zoom:0},detailPending=new Map();
  const detailCanvas=document.createElement('canvas');detailCanvas.className='plate-detail';detailCanvas.setAttribute('aria-hidden','true');
  Object.assign(detailCanvas.style,{position:'absolute',left:'0',top:'0',width:'100%',height:'100%',pointerEvents:'none',transformOrigin:'0 0',display:'none'});
  $('plate-viewport')?.append(detailCanvas);
  // Paint playback cursor: Paint Lab's own brush, nib and pencil preview, on a
  // layer of its own that follows the plate's zoom and pan.
  const cursorLayer=document.createElement('canvas');cursorLayer.className='paint-cursor';cursorLayer.setAttribute('aria-hidden','true');
  Object.assign(cursorLayer.style,{position:'absolute',left:'0',top:'0',width:'100%',height:'100%',pointerEvents:'none',transformOrigin:'0 0',display:'none',zIndex:'3'});
  $('plate-viewport')?.append(cursorLayer);
  const paintCursor=createCursor(cursorLayer);
  function showCursor(state){
    if(!state){cursorLayer.style.display='none';canvas.dataset.paintCursor='off';return;}
    const vp=$('plate-viewport'),w=vp?.clientWidth||canvas.clientWidth,h=vp?.clientHeight||canvas.clientHeight,dpr=clamp(Number(globalThis.devicePixelRatio)||1,1,3);
    if(cursorLayer.width!==Math.round(w*dpr)||cursorLayer.height!==Math.round(h*dpr))paintCursor.size(w,h,dpr);
    cursorLayer.style.transform=canvas.style.transform;cursorLayer.style.opacity=String(paintCursorOpacity(state.sizeMm));cursorLayer.style.display='block';
    paintCursor.clear();paintCursor.draw(state);canvas.dataset.paintCursor=state.tool;
  }
  const deviceRatio=()=>clamp(Number(globalThis.devicePixelRatio)||1,1,3);
  const viewportSize=()=>{const v=$('plate-viewport');return v?{width:v.clientWidth,height:v.clientHeight}:{width:canvas.clientWidth,height:canvas.clientHeight};};
  const targetBaseScale=()=>plateBackingScale(canvas.clientWidth||viewportSize().width,deviceRatio());
  // The cheap form runs on every pointer move; the key check runs per raster.
  const settledPainting=(exact=true)=>renderMode==='painted'&&!!nativeResult?.complete&&!!detailWorker&&detailKey===nativeResult.key&&(!exact||nativeResult.key===nativeKey(snapshot()));
  function setBacking(scale){
    const w=Math.round(1200*scale),h=Math.round(1000*scale);baseScale=scale;canvas.dataset.backingScale=String(scale);
    if(canvas.width===w&&canvas.height===h)return false;
    // Resizing clears the canvas; carry the current picture across, smoothly.
    let copy=null;if(canvas.width&&canvas.height&&painter){copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;copy.getContext('2d').drawImage(canvas,0,0);}
    canvas.width=w;canvas.height=h;
    if(copy){const c=canvas.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(copy,0,0,w,h);}
    return true;
  }
  function hideDetail(){
    clearTimeout(detailTimer);detailTimer=0;detailLatest.detail=-1;detailShown=null;detailCanvas.style.display='none';
    if(detailLatest.base<=0)canvas.dataset.displayRefining='false';
  }
  function retireDetailWorker(){dropZoomCache();detailWorker?.terminate();detailWorker=null;detailKey=null;detailPending.clear();detailLatest.base=0;hideDetail();}
  function positionDetail(view){
    if(!detailShown||!view)return;const r=view.scale/detailShown.view.scale;
    detailCanvas.style.transform=`translate(${view.x-detailShown.view.x*r}px, ${view.y-detailShown.view.y*r}px) scale(${r})`;
  }
  function onPlateView(view,size){
    if(!(view.scale>1)){hideDetail();return;}
    positionDetail(view);clearTimeout(detailTimer);
    // While two fingers are moving, the shown detail just follows the view;
    // it is redrawn from the zoom cache once the pinch pauses.
    clearTimeout(zoomRedrawTimer);
    if(detailShown&&zoomCache&&$('plate-viewport')?.dataset.viewportGesture==='pinch'){zoomRedrawTimer=setTimeout(()=>{const v=plateViewport?.getState();if(v?.scale>1)onPlateView(v,viewportSize());},ZOOM_CACHE.pinchRedrawMs);return;}
    if(showZoomCache(view,size)){if(detailLatest.base<=0)canvas.dataset.displayRefining='false';return;}
    const needed=settledPainting(false)&&plateDetailRegion(view,size,deviceRatio(),baseScale);
    canvas.dataset.displayRefining=String(!!needed);if(needed)detailTimer=setTimeout(requestDetail,DETAIL_REQUEST_DELAY_MS);
  }
  function postDetail(target,region,extra={}){
    const requestId=++detailSerial;detailLatest[target]=requestId;detailPending.set(requestId,{target,region,...extra});
    if(target!=='zoom')canvas.dataset.displayRefining='true';
    detailWorker.postMessage({kind:'native-detail',revision:detailRevision,requestId,parallel:target==='zoom',region:{x:region.x,y:region.y,w:region.w,h:region.h,width:region.width,height:region.height}});
  }
  // Zoom cache: once a plate is settled and the page is idle, the whole plate
  // is re-rastered once at a higher scale. Zoom then shows it at once for
  // the levels it covers, and asks for an exact re-raster only beyond them.
  let zoomCache=null,zoomCacheTimer=0,zoomRedrawTimer=0;
  function dropZoomCache(){clearTimeout(zoomCacheTimer);zoomCacheTimer=0;zoomCache?.bitmap?.close?.();zoomCache=null;detailLatest.zoom=0;canvas.dataset.zoomCache='none';}
  function zoomCacheScale(){
    const phone=(globalThis.navigator?.deviceMemory??8)<4;
    return Math.min(baseScale*ZOOM_CACHE.factor,(phone?ZOOM_CACHE.maxWidthLowMemory:ZOOM_CACHE.maxWidth)/1200);
  }
  function scheduleZoomCache(delay=ZOOM_CACHE.idleMs){
    clearTimeout(zoomCacheTimer);
    zoomCacheTimer=setTimeout(()=>{
      zoomCacheTimer=0;if(zoomCache||detailLatest.zoom>0||!settledPainting())return;
      if(!pageIdle()||detailLatest.base>0||detailLatest.detail>0){scheduleZoomCache();return;}
      const scale=zoomCacheScale();if(!(scale>baseScale*1.05))return;
      canvas.dataset.zoomCache='rendering';canvas.dataset.zoomCacheStarted=String(performance.now());
      postDetail('zoom',{x:0,y:0,w:1200,h:1000,width:Math.round(1200*scale),height:Math.round(1000*scale)},{scale,key:detailKey});
    },delay);
  }
  // Draws the zoomed view from the cache; true when the cache is sharp enough.
  function showZoomCache(view,size){
    if(!zoomCache||zoomCache.key!==detailKey||!settledPainting(false))return false;
    const region=plateDetailRegion(view,size,deviceRatio(),baseScale,{maxPixels:Infinity});if(!region)return false;
    const k=zoomCache.scale;
    if(detailCanvas.width!==region.width||detailCanvas.height!==region.height){detailCanvas.width=region.width;detailCanvas.height=region.height;}
    const c=detailCanvas.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.clearRect(0,0,region.width,region.height);
    c.drawImage(zoomCache.bitmap,region.x*k,region.y*k,region.w*k,region.h*k,0,0,region.width,region.height);
    detailShown={view:region.view};positionDetail(view);detailCanvas.style.display='block';
    const covered=region.width/region.w<=k*1.001;canvas.dataset.detailSource=covered?'cache':'cache-interim';canvas.dataset.displayScale=(region.width/region.w).toFixed(3);
    canvas.dataset.detailShownAt=String(performance.now());
    return covered;
  }
  function requestDetail(){
    detailTimer=0;const view=plateViewport?.getState(),region=view&&settledPainting()?plateDetailRegion(view,viewportSize(),deviceRatio(),baseScale):null;
    if(!region){if(detailLatest.base<=0)canvas.dataset.displayRefining='false';return;}
    postDetail('detail',region,{key:detailKey});
  }
  function requestBaseScale(scale){
    postDetail('base',{x:0,y:0,w:1200,h:1000,width:Math.round(1200*scale),height:Math.round(1000*scale)},{scale,key:detailKey});
  }
  function onDetailMessage(event){
    const message=event.data,pending=detailPending.get(message?.requestId);detailPending.delete(message?.requestId);
    const current=pending&&message.revision===detailRevision&&detailLatest[pending.target]===message.requestId&&pending.key===detailKey&&settledPainting();
    if(pending&&detailLatest[pending.target]===message.requestId)detailLatest[pending.target]=0;
    try{
      if(!current||!message.bitmap)return;
      if(pending.target==='zoom'){
        zoomCache?.bitmap?.close?.();zoomCache={key:pending.key,scale:pending.scale,bitmap:message.bitmap,width:message.bitmap.width,height:message.bitmap.height};message.bitmap=null;
        Object.assign(canvas.dataset,{zoomCache:'ready',zoomCacheMs:message.ms.toFixed(1),zoomCacheBytes:String(zoomCache.width*zoomCache.height*4),zoomCacheScale:pending.scale.toFixed(3)});
        const view=plateViewport?.getState();if(view?.scale>1)onPlateView(view,viewportSize());
      }else if(pending.target==='base'){
        canvas.width=message.bitmap.width;canvas.height=message.bitmap.height;baseScale=pending.scale;canvas.dataset.backingScale=String(pending.scale);
        paintBitmap(message.bitmap);canvas.dataset.baseRasterMs=message.ms.toFixed(1);dropZoomCache();scheduleZoomCache();
        if((plateViewport?.getState().scale??1)>1)onPlateView(plateViewport.getState(),viewportSize());
      }else{
        detailCanvas.width=message.bitmap.width;detailCanvas.height=message.bitmap.height;
        const c=detailCanvas.getContext('2d');c.clearRect(0,0,detailCanvas.width,detailCanvas.height);c.drawImage(message.bitmap,0,0);
        detailShown={view:pending.region.view};positionDetail(plateViewport?.getState());detailCanvas.style.display='block';
        canvas.dataset.displayScale=(pending.region.width/pending.region.w).toFixed(3);canvas.dataset.detailRasterMs=message.ms.toFixed(1);
      }
    }finally{
      message?.bitmap?.close?.();
      if(detailLatest.base<=0&&detailLatest.detail<=0)canvas.dataset.displayRefining='false';
    }
  }
  function adoptDetailWorker(worker,key,revision){
    dropZoomCache();detailWorker?.terminate();detailWorker=worker;detailKey=key;detailRevision=revision;detailPending.clear();scheduleZoomCache();
    worker.onmessage=onDetailMessage;worker.onerror=event=>{event.preventDefault();retireDetailWorker();};
    const next=targetBaseScale();if(next!==baseScale||canvas.width!==Math.round(1200*next))requestBaseScale(next);
    const view=plateViewport?.getState();if(view?.scale>1)onPlateView(view,viewportSize());
  }
  function syncResolution(){
    const next=targetBaseScale();
    if(next===baseScale&&canvas.width===Math.round(1200*next))return;
    if(settledPainting()){requestBaseScale(next);return;}
    if(settledBusy){baseScale=next;return;}
    if(setBacking(next)&&painter&&renderMode==='sketch')drawPreview(snapshot());
  }
  function watchDeviceRatio(){
    detailResolutionQuery?.removeEventListener?.('change',watchDeviceRatio);
    detailResolutionQuery=globalThis.matchMedia?.(`(resolution: ${globalThis.devicePixelRatio||1}dppx)`)??null;
    detailResolutionQuery?.addEventListener?.('change',watchDeviceRatio);syncResolution();
  }
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>syncResolution()).observe(canvas);
  // The page frame is derived from the pair and recorded on its composition
  // lazily (first sketch or paint); it must not change the plate's identity.
  const nativeRecipeKey=recipe=>recipe?.composition?.pageFrame?{...recipe,composition:{...recipe.composition,pageFrame:undefined}}:recipe;
  const nativeKey=value=>JSON.stringify([value.genome,nativeRecipeKey(bridgeRecipe(value)),value.scene,value.fieldPlate]);
  const sketchQueue=new SketchScheduler({preview:drawPreview,refine:refinePreview,phase:mode=>{
    renderMode=mode;canvas.dataset.renderMode=mode;
    status.textContent=mode==='refining'?'Painting…':'Shape preview';controls();
  }});
  // At rest the plate shows the endpoint's own 3D body; a connected pair
  // (both endpoints share one chart) stays on its own continuous model.
  let restCache=null;
  // A colony's page frame is fitted once, to its painted plan at the default
  // camera, and held through the orbit.
  const habitFrames=new Map();
  function habitRestFrame(genome,pair,st){
    const key=JSON.stringify([genome.seed,genome.profileId,genome.donorId,pair.composition.id,pair.composition.members,st.scene,st.capDepth,st.stemBend]);
    if(!habitFrames.has(key)){
      if(habitFrames.size>16)habitFrames.delete(habitFrames.keys().next().value);
      const rest=createOrbitRestPair(genome,orbitRestComposition(genome,pair.composition,{habit:true}),{view:{yaw:DEFAULT_ORBIT_VIEW.yaw,pitch:DEFAULT_ORBIT_VIEW.pitch},shapeModifiers:{capDepth:st.capDepth??1,stemBend:st.stemBend??0}});
      habitFrames.set(key,pageFrameAt(pagePairFrame(rest,st.scene),0));
    }
    return habitFrames.get(key);
  }
  function orbitRestFor(blend,pair=morphPair,ga=a,gb=b,st=state,{anyView=false}={}){
    const colony=habitRestPreferred(blend>=1?gb:ga,st.scene);
    if(!pair||!anyView&&isDefaultOrbitView(st)&&!colony||pair.connectedAnatomy||(blend>0&&blend<1)||(st.fieldPlate&&pair.fieldPlate?.supported))return null;
    const genome=blend>=1?gb:ga,options=connectedViewOptions(st),frame=colony?habitRestFrame(genome,pair,st):pageFrameAt(pagePairFrame(pair,st.scene),blend>=1?1:0);
    const key=JSON.stringify([genome.seed,genome.profileId,genome.donorId,pair.composition.id,pair.composition.members,frame,st.scene,options]);
    if(restCache?.key!==key){if(restCache?.genome!==genome||restCache.anchors!==pair.composition.implicitAnchors)restCache={genome,anchors:pair.composition.implicitAnchors,composition:orbitRestComposition(genome,pair.composition,{habit:colony})};restCache={...restCache,key,pair:createOrbitRestPair(genome,restCache.composition,options,{frame,scene:st.scene})};}
    return restCache.pair;
  }
  // A fictional field morph is prepared from 3D endpoints at one camera, so a
  // new camera discards it; the next morph re-prepares from the turned bodies.
  let lastRecipeKey=null;
  function applyView(){Object.assign(morphPair,orbitViewOptions(state));if(morphPair.implicitMorph&&morphPair.implicitData){cancelImplicitPreparation();morphPair.implicitData=null;}if(morphPair.previewData){cancelImplicitPreparation();morphPair.previewData=null;}}
  function snapshotOf(pair,ga,gb,position,st){const blend=smooth(position),rest=orbitRestFor(blend,pair,ga,gb,st);return {genome:morphGenome(pair,blend),morph:rest??pair,blend:rest?0:blend,scene:st.scene,fieldPlate:rest?false:st.fieldPlate};}
  function snapshot(){return snapshotOf(morphPair,a,b,state.blend,state);}  // Playback draws every frame, endpoints included, from the morph's own
  // coloured preview so the first and last frames share its visual language.
  function playbackSnapshot(){
    if(!morphPreviewKind(morphPair))return snapshot();
    const blend=smooth(state.blend);return {genome:morphGenome(morphPair,blend),morph:morphPair,blend,scene:state.scene,fieldPlate:state.fieldPlate};
  }
  // The plate that finishMorph will settle on, built without side effects so
  // its native painting can be prepared while the morph is still playing.
  function finishedSnapshot(nextSeed){
    const next=advanceMorphState(state,nextSeed),ga=generateSpecimen(next.seed,next.typeId,next.donorId),gb=generateSpecimen(next.next,next.nextTypeId,next.nextDonorId);
    const pair=createPromotedMorphPair(morphPair,gb,{fieldPlate:state.fieldPlate});
    // A field pair records its anchors when its shapes are prepared; record
    // the same anchors now so the predicted plate has the settled identity.
    if(pair.implicitMorph&&!pair.composition.implicitAnchors)pair.composition=implicitAnchoredComposition(pair.a,pair.composition,{view:pair.view,shapeModifiers:pair.shapeModifiers}).composition;
    return snapshotOf(pair,ga,gb,0,next);
  }
  // Native painting of the morph's destination, prepared in its own Worker
  // during playback. Only the finished image is kept; nothing is presented.
  let prefetch=null,plannedNextSeed=null;
  function cancelPrefetch(){prefetch?.worker?.terminate();if(prefetch){const waiters=prefetch.waiters.splice(0);prefetch=null;waiters.forEach(f=>f(null));}plannedNextSeed=null;canvas.dataset.prefetch='none';}
  function prefetchNative(value){
    {const ready=takePrepared(value);if(ready){prefetch?.worker?.terminate();ready.key=ready.plateKey;prefetch=ready;canvas.dataset.prefetch=ready.complete?'complete':'painting';canvas.dataset.prefetchPrepared='true';return;}}
    prefetch?.worker?.terminate();prefetch=null;
    if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||!OffscreenCanvas.prototype.convertToBlob)return;
    const job={key:nativeKey(value),worker:null,blob:null,metrics:null,complete:false,failed:false,started:performance.now(),waiters:[]};
    // A completed prefetch Worker is kept: adopted, it serves zoom re-rasters
    // of the landed plate exactly like a settle Worker does.
    const finish=ok=>{if(!ok){job.worker?.terminate();job.worker=null;}if(ok)job.complete=true;else job.failed=true;job.ms=performance.now()-job.started;
      if(prefetch===job)canvas.dataset.prefetch=ok?'complete':'failed';job.waiters.splice(0).forEach(f=>f(ok?job:null));};
    try{
      const worker=job.worker=new Worker(import.meta.url,{type:'module'});prefetch=job;canvas.dataset.prefetch='painting';
      worker.onmessage=event=>{
        const message=event.data;if(prefetch!==job||job.complete){message.bitmap?.close();return;}
        if(message.error){finish(false);return;}
        if(message.nativeMaterial){nativePaperTemplate??=message.paper;return;}
        if(!message.native||!message.bitmap)return;
        message.bitmap.close();worker.postMessage({kind:'native-frame-ack'});
        if(message.complete){job.blob=message.blob;job.metrics=message.metrics;finish(true);}
      };
      worker.onerror=event=>{event.preventDefault();if(prefetch===job)finish(false);};
      nativeInkPaperRaster??=painter.paper.getContext('2d').getImageData(0,0,painter.paper.width,painter.paper.height);
      worker.postMessage({kind:'settle',genome:value.genome,scene:value.scene,morph:bridgeRecipe(value),fieldPlate:value.fieldPlate,composition:value.morph.composition,revision:0,paperTemplate:nativePaperTemplate,inkPaperRaster:nativeInkPaperRaster,outputScale:targetBaseScale()});
    }catch{job.worker?.terminate();prefetch=null;canvas.dataset.prefetch='failed';}
  }
  // Prepared plates: the next Morph destination and the next Random plate are
  // painted in a background Worker while the page is idle. They are used only
  // when the requested plate's full identity matches, and are discarded on any
  // interaction that could change what they show.
  const preparedJobs=new Map();let preparedTimer=0,nextRandomChoice=null;
  const preparedRequest=value=>({plateKey:nativeKey(value),outputScale:targetBaseScale(),sheet:plateSheetSeed(value)});
  function takePrepared(value){
    const request=preparedRequest(value),key=preparedPlateKey(request),job=preparedJobs.get(key);
    if(!job)return null;preparedJobs.delete(key);
    if(!preparedPlateMatches(job,request)){job.worker?.terminate();return null;}
    return job;
  }
  function dropPrepared(job){job.cancelled=true;job.worker?.terminate();job.worker=null;job.waiters.splice(0).forEach(f=>f(null));}
  function cancelPrepared({keepComplete=true}={}){
    clearTimeout(preparedTimer);preparedTimer=0;
    for(const [key,job] of preparedJobs)if(!keepComplete||!job.complete){dropPrepared(job);preparedJobs.delete(key);}
  }
  function startPrepared(value,{record=false}={}){
    if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||!OffscreenCanvas.prototype.convertToBlob)return null;
    const request=preparedRequest(value),key=preparedPlateKey(request);
    if(preparedJobs.has(key))return preparedJobs.get(key);
    while(preparedJobs.size>=PREPARED_PLATE.limit){const [oldKey,old]=preparedJobs.entries().next().value;dropPrepared(old);preparedJobs.delete(oldKey);}
    const job={key,plateKey:request.plateKey,worker:null,blob:null,metrics:null,frames:[],complete:false,failed:false,cancelled:false,started:performance.now(),waiters:[]};
    const finish=ok=>{if(!ok){job.worker?.terminate();job.worker=null;}if(ok)job.complete=true;else job.failed=true;job.ms=performance.now()-job.started;job.waiters.splice(0).forEach(f=>f(ok?job:null));canvas.dataset.preparedReady=String([...preparedJobs.values()].filter(j=>j.complete).length);if(ok)queuePreparation();};
    try{
      const worker=job.worker=new Worker(import.meta.url,{type:'module'});preparedJobs.set(key,job);
      worker.onmessage=event=>{
        const message=event.data;if(job.cancelled||job.complete){message.bitmap?.close();return;}
        if(message.error){finish(false);return;}
        if(message.nativeMaterial){nativePaperTemplate??=message.paper;return;}
        if(!message.native||!message.bitmap)return;
        message.bitmap.close();worker.postMessage({kind:'native-frame-ack'});
        if(message.frameBlob)job.frames.push({blob:message.frameBlob,elapsed:message.elapsed,progress:message.progress,stage:message.stage});
        if(message.complete){job.blob=message.blob;job.metrics=message.metrics;job.elapsed=message.elapsed;finish(true);}
      };
      worker.onerror=event=>{event.preventDefault();finish(false);};
      nativeInkPaperRaster??=painter.paper.getContext('2d').getImageData(0,0,painter.paper.width,painter.paper.height);
      worker.postMessage({kind:'settle',genome:value.genome,scene:value.scene,morph:bridgeRecipe(value),fieldPlate:value.fieldPlate,composition:value.morph.composition,revision:0,paperTemplate:nativePaperTemplate,inkPaperRaster:nativeInkPaperRaster,outputScale:request.outputScale,recordFrames:record});
      return job;
    }catch{job.worker?.terminate();preparedJobs.delete(key);return null;}
  }
  // The next Random plate is chosen up front so it can be painted ahead.
  function pickRandomChoice(hybrid=false){
    const n=crypto.getRandomValues(new Uint32Array(2)),pool=randomTypePool(state.includeAlpha);
    const hosts=hybrid?pool.filter(host=>pool.some(donor=>compatibleHybrid(host.id,donor.id).ok)):pool,host=hosts[n[0]%hosts.length];
    const donors=hybrid?pool.filter(type=>compatibleHybrid(host.id,type.id).ok):[];
    const seed=randomSeed(),next=randomSeed();
    return {hybrid,includeAlpha:!!state.includeAlpha,typeId:host.id,family:host.family,donorId:donors.length?donors[n[1]%donors.length].id:null,seed,next,nextTypeId:chooseMorphTarget(host.id,next,{includeAlpha:state.includeAlpha}),compositionSeed:randomSeed()};
  }
  // The exact plate regenerate() would build for a given state.
  function plannedPlate(st){
    const ga=generateSpecimen(st.seed,st.typeId,st.donorId),gb=generateSpecimen(st.next,st.nextTypeId,st.nextDonorId);
    const count=st.compositionCount||seedSpecimenCount(ga,buildSketch(ga).specimenCount);
    const composition=applyCompositionAnchors(createSpecimenComposition({...ga,seed:st.compositionSeed},{count}),st.compositionAnchors);
    const pair=withFieldPlatePair(createMorphPair(ga,gb,{composition,...orbitViewOptions(st)}),st.fieldPlate);
    if(pair.implicitMorph&&!pair.composition.implicitAnchors)pair.composition=implicitAnchoredComposition(pair.a,pair.composition,{view:pair.view,shapeModifiers:pair.shapeModifiers}).composition;
    return snapshotOf(pair,ga,gb,0,st);
  }
  function randomChoiceState(choice){
    return {...state,...DEFAULT_ORBIT_VIEW,scene:state.background?resolveHabitat(state.selectedScene,choice.typeId):'plain',typeId:choice.typeId,family:choice.family,donorId:choice.donorId,seed:choice.seed,next:choice.next,nextTypeId:choice.nextTypeId,nextDonorId:null,compositionSeed:choice.compositionSeed,compositionCount:0,compositionAnchors:null,blend:0};
  }
  const pageIdle=()=>!playing&&!replaying&&!preparing&&!settledBusy&&!plateViewport?.isOrbitHolding()&&!document.hidden&&renderMode==='painted';
  function queuePreparation(){
    clearTimeout(preparedTimer);
    preparedTimer=setTimeout(()=>{
      preparedTimer=0;if(!pageIdle()){queuePreparation();return;}
      if([...preparedJobs.values()].some(job=>!job.complete))return;
      try{
        // One background painting at a time: Morph destination first, then Random.
        if(!state.fieldPlate&&morphPair?.supportedMotion!==false&&!(state.blend>0&&state.blend<1)){
          plannedNextSeed??=randomSeed();const value=finishedSnapshot(plannedNextSeed),key=preparedPlateKey(preparedRequest(value));
          if(!preparedJobs.has(key)&&!(prefetch&&prefetch.key===nativeKey(value))){startPrepared(value);return;}
        }
        // Full painting plays a Random plate live, so only Fast prepares one.
        if(livePainting())return;
        if(nextRandomChoice&&nextRandomChoice.includeAlpha!==!!state.includeAlpha)nextRandomChoice=null;
        nextRandomChoice??=pickRandomChoice(false);
        const value=plannedPlate(randomChoiceState(nextRandomChoice));
        if(!preparedJobs.has(preparedPlateKey(preparedRequest(value))))startPrepared(value,{record:true});
      }catch(error){console.warn('Next plate not prepared',error);}
    },PREPARED_PLATE.idleMs);
  }
  // Replays a prepared painting's recorded stages at natural pace, then shows
  // its final; the plate is then exactly the native painting.
  function replayPrepared(job,value,isCurrent){
    const key=job.plateKey,revision=++settledRevision,started=performance.now();
    const current=()=>revision===settledRevision&&isCurrent()&&!playing;
    const promise=new Promise(resolve=>{nativeBuilding={resolve,key};});
    nativeResult={key,frames:[],streamedFrames:0,bytes:0,complete:false,metrics:null,priorFinal:null};
    replaying=true;settledBusy=true;renderMode='painting';canvas.dataset.renderMode=renderMode;canvas.dataset.refining='true';canvas.dataset.nativeComplete='false';canvas.dataset.preparedReplay='true';controls();
    const frames=job.frames,total=Math.max(1,job.elapsed??frames.at(-1)?.elapsed??1),scale=PREPARED_PLATE.replayMs/total;
    (async()=>{
      for(const frame of frames){
        const due=started+frame.elapsed*scale;
        if(due>performance.now())await new Promise(r=>setTimeout(r,due-performance.now()));
        if(!current())return;
        let bitmap;try{bitmap=await createImageBitmap(frame.blob);}catch{continue;}
        if(!current()){bitmap.close();return;}
        paintBitmap(bitmap);bitmap.close();drawingStage=frame.progress;nativePhase=frame.stage;status.textContent=frame.stage;controls();
      }
      const due=started+PREPARED_PLATE.replayMs;if(due>performance.now())await new Promise(r=>setTimeout(r,due-performance.now()));
      if(!current())return;
      let bitmap;try{bitmap=await createImageBitmap(job.blob);}catch{if(current()){settledBusy=false;replaying=false;refinePreview(value,isCurrent,{rerun:true});}return;}
      if(!current()){bitmap.close();return;}
      const result=nativeResult;result.frames=[{blob:job.blob,progress:1,stage:'Complete'}];result.bytes=job.blob.size;result.metrics=job.metrics;result.complete=true;result.finalBlob=job.blob;result.streamedFrames=frames.length+1;
      const finalCopy=copyImage(bitmap,bitmap.width,bitmap.height);paintBitmap(bitmap);bitmap.close();captureReprojection(value,finalCopy);
      if(job.worker){adoptDetailWorker(job.worker,key,0);job.worker=null;}
      drawingStage=1;nativePhase='Native painting complete';renderMode='painted';settledBusy=false;replaying=false;
      canvas.dataset.refining='false';canvas.dataset.nativeComplete='true';canvas.dataset.renderMode=renderMode;canvas.dataset.refineMs=(performance.now()-started).toFixed(2);canvas.dataset.preparedReplay='done';
      if(job.metrics?.finalPixelHash)canvas.dataset.nativeFinalPixelHash=job.metrics.finalPixelHash;
      status.textContent='';nativeBuilding?.resolve(result);nativeBuilding=null;controls();updateTraits(value.genome,performance.now(),true);queuePreparation();
    })();
    return promise;
  }
  // Same-geometry crossfades: the coloured preview of a plate and its native
  // painting share every contour, so blending them is a reveal, not a dissolve.
  let fadeToken=0,fadeFrom=null,morphFrom=null;
  function captureCanvas(){const copy=newCanvas(canvas.width,canvas.height);copy.getContext('2d').drawImage(canvas,0,0);return copy;}
  function crossfadeTo(bitmap,ms=MORPH_SETTLE_FADE_MS){
    const token=++fadeToken;
    if(!painter.previewColoured||reducedMotion.matches){paintBitmap(bitmap);bitmap.close();return;}
    fadeFrom=captureCanvas();const from=fadeFrom,start=performance.now();canvas.dataset.settleFade='running';
    const step=now=>{
      if(token!==fadeToken){bitmap.close();return;}
      const k=smooth(clamp((now-start)/ms));paintBitmap(bitmap);
      if(k<1){const c=painter.ctx;c.globalAlpha=1-k;c.drawImage(from,0,0);c.globalAlpha=1;requestAnimationFrame(step);}
      else{bitmap.close();fadeFrom=null;painter.previewColoured=false;canvas.dataset.settleFade='done';}
    };
    step(start);
  }
  // Every settled plate goes through the pair so the Worker reuses the captured page frame.
  function bridgeRecipe(value){if(value.morph.orbitRest)return {a:value.morph.a,b:value.morph.a,blend:0,composition:value.morph.composition,view:value.morph.view,shapeModifiers:value.morph.shapeModifiers,orbitRest:true};return {a:value.morph.a,b:value.morph.b,blend:value.blend,composition:value.morph.composition,view:value.morph.view,shapeModifiers:value.morph.shapeModifiers};}
  function cancelRefinement(){
    showCursor(null);canvas.dataset.livePainting='false';hideDetail();settledRevision++;settledWorker?.terminate();settledWorker=null;
    if(nativeBuilding){nativeBuilding.resolve(null);nativeBuilding=null;}
    settledBusy=false;replaying=false;canvas.dataset.refining='false';endReveal();
  }
  function paintBitmap(bitmap){
    const c=painter.ctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';c.imageSmoothingQuality='high';
    c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(bitmap,0,0,canvas.width,canvas.height);
  }
  // Reprojection: the last finished painting registered on the 3D mesh. While
  // the camera turns the painting rides on the bodies; on release the native
  // repaint of the new view arrives over the reprojected image of that view.
  let reprojection=null,reveal=null,reprojectLayer=null;
  function reprojectSource(value,{anyView=false}={}){
    if(ORBIT_DRAG_DISPLAY!=='reproject'||!value?.morph)return null;
    if(value.morph.orbitRest)return {pair:value.morph,t:0};
    if(value.morph.connectedAnatomy)return {pair:value.morph,t:value.blend};
    if(!anyView||value.fieldPlate)return null;
    const rest=orbitRestFor(value.blend,morphPair,a,b,state,{anyView:true});return rest?{pair:rest,t:0}:null;
  }
  function currentReprojection(value,anyView=false){
    if(!reprojection)return null;const source=reprojectSource(value,{anyView});if(!source)return null;
    try{return reprojectionKey(source.pair,source.t,value.scene)===reprojection.key?source:null;}
    catch(error){console.warn('Reprojection key unavailable',error);return null;}
  }
  function copyImage(image,width,height){const copy=newCanvas(width,height),c=copy.getContext('2d');c.imageSmoothingQuality='high';c.drawImage(image,0,0,width,height);return copy;}
  // A settled plate fixes its page frame at the camera it was painted from,
  // so a later turn keeps that frame and Fit returns the same plate.
  function pinPageFrame(value){
    if(!value?.morph||value.morph.orbitRest||value.morph.connectedAnatomy||value.fieldPlate)return;
    try{orbitRestFor(value.blend,morphPair,a,b,state,{anyView:true});}catch(error){console.warn('Page frame not pinned',error);}
  }
  // Build the turned body's world geometry once the plate is settled, so the
  // first frame of a drag only re-projects it.
  function warmOrbitLines(value){
    setTimeout(()=>{
      try{
        const morph=value?.morph,rest=morph?.orbitRest?morph:morph&&!morph.connectedAnatomy&&!value.fieldPlate?orbitRestFor(value.blend,morphPair,a,b,state,{anyView:true}):null;
        // Twice: the second build takes the cached re-projection path.
        if(rest)for(let i=0;i<2;i++)buildMorphSketch(rest,0,{inkOnly:true,interactive:true,scene:value.scene});
      }catch(error){console.warn('Orbit drawing not prepared',error);}
    },0);
  }
  function captureReprojection(value,painted){
    // The turned bodies are prepared after the settle crossfade, when nothing
    // on the page moves; at completion this froze the last frames for ~0.6 s.
    if(ORBIT_DRAG_DISPLAY!=='reproject'){const pair=morphPair;setTimeout(()=>{if(pair!==morphPair)return;pinPageFrame(value);warmOrbitLines(value);},REPROJECTION.fadeMs+80);return;}
    const source=reprojectSource(value,{anyView:true});if(!source||!painter)return;
    let key,view;
    try{key=reprojectionKey(source.pair,source.t,value.scene);view={...source.pair.view};}catch(error){console.warn('Reprojection capture skipped',error);return;}
    const {pair,t}=source,scene=value.scene,drawing=value.morph.orbitRest||value.morph.connectedAnatomy?null:{morph:value.morph,blend:value.blend};
    setTimeout(()=>{
      try{
        const started=performance.now(),mesh=orbitMeshAt(pair,t,{scene,view});
        const plan=drawing?buildMorphSketch(drawing.morph,drawing.blend,{inkOnly:true,interactive:true,scene}):null;
        const sw=300,sh=250,pixels=image=>copyImage(image,sw,sh).getContext('2d').getImageData(0,0,sw,sh).data;
        const sampler=data=>(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return null;const i=(Math.floor(clamp(y/1000,0,.9999)*sh)*sw+Math.floor(clamp(x/1200,0,.9999)*sw))*4;return [data[i],data[i+1],data[i+2]];};
        const registration=orbitReprojectionTones(orbitReprojectionRegistration(mesh,{warp:drawingRegistrationWarp(mesh,plan)}),sampler(pixels(painted)),sampler(pixels(painter.paper)),{paperTest:!!plan});
        const background=newCanvas(painted.width,painted.height);
        paintReprojectionBackground(background.getContext('2d'),{painted,paper:painter.paper,footprint:reprojectionFootprint(mesh,plan),width:background.width,height:background.height});
        const lw=Math.min(REPROJECTION_PREVIEW.width,painted.width),lh=Math.min(REPROJECTION_PREVIEW.height,painted.height);
        reprojection={key,registration,texture:painted,background,layerTexture:copyImage(painted,lw,lh),layerBackground:copyImage(background,lw,lh)};
        Object.assign(canvas.dataset,{reprojectionReady:'true',reprojectionCaptureMs:(performance.now()-started).toFixed(2),reprojectionTriangles:String(registration.triangleCount),reprojectionCaptured:String(registration.captured),reprojectionMirrored:String(registration.mirrored)});
      }catch(error){console.warn('Reprojection capture failed',error);reprojection=null;canvas.dataset.reprojectionReady='false';}
    },0);
  }
  function drawReprojectedPreview(value){
    const source=currentReprojection(value,!!plateViewport?.isOrbitHolding());if(!source)return false;
    const started=performance.now(),mesh=orbitMeshAt(source.pair,source.t,{scene:value.scene,view:source.pair.view}),geometry=performance.now()-started;
    const {layerTexture,layerBackground,registration}=reprojection,lw=layerTexture.width,lh=layerTexture.height;
    if(reprojectLayer?.width!==lw||reprojectLayer?.height!==lh)reprojectLayer=newCanvas(lw,lh);
    const stats=drawOrbitReprojection(reprojectLayer.getContext('2d'),registration,mesh,{width:lw,height:lh,texture:layerTexture,background:layerBackground});
    const c=painter.ctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.filter='none';c.imageSmoothingQuality='low';c.drawImage(reprojectLayer,0,0,canvas.width,canvas.height);
    const ms=performance.now()-started;Object.assign(painter,{lastPreviewGeometryMs:geometry,lastPreviewDrawMs:ms-geometry,lastPreviewMs:ms,previewFrames:(painter.previewFrames??0)+1});
    Object.assign(canvas.dataset,{reprojected:'true',reprojectTextured:String(stats.textured),reprojectFilled:String(stats.filled),reprojectFaces:String(stats.faces),reprojectTimings:JSON.stringify({geometry:+geometry.toFixed(2),background:+stats.backgroundMs.toFixed(2),surface:+stats.surfaceMs.toFixed(2),ink:+stats.inkMs.toFixed(2)})});
    return true;
  }
  function endReveal(){if(reveal){reveal=null;canvas.dataset.revealing='false';}}
  function startReveal(value,revision){
    endReveal();
    if(ORBIT_DRAG_DISPLAY==='lines'&&value?.morph?.orbitRest&&painter?.previewPlan&&!painter.previewColoured){
      // The pen drawing of the turned body is the reveal base: native ink and
      // washes arrive over it and it fades out as the washes go down.
      const base=newCanvas(canvas.width,canvas.height);base.getContext('2d').drawImage(canvas,0,0);reveal={revision,base,fading:false};
      Object.assign(canvas.dataset,{revealing:'true',revealBaseMs:'0',revealWeight:'1'});return;
    }
    const source=currentReprojection(value);if(!source)return;
    try{
      const started=performance.now(),mesh=orbitMeshAt(source.pair,source.t,{scene:value.scene,view:source.pair.view}),base=newCanvas(canvas.width,canvas.height);
      drawOrbitReprojection(base.getContext('2d'),reprojection.registration,mesh,{width:base.width,height:base.height,texture:reprojection.texture,background:reprojection.background});
      paintBitmap(base);reveal={revision,base,fading:false};Object.assign(canvas.dataset,{revealing:'true',revealBaseMs:(performance.now()-started).toFixed(2),revealWeight:'1'});
    }catch(error){console.warn('Reprojection reveal unavailable',error);endReveal();}
  }
  // Native frames composite over the reprojection; the final frame fades in
  // and then lands exactly, so the settled pixels are the native painting's.
  function presentNativeFrame(bitmap,message,revision,finalCopy){
    const active=reveal?.revision===revision&&reveal.base.width===canvas.width&&reveal.base.height===canvas.height?reveal:null;
    if(!active){endReveal();paintBitmap(finalCopy??bitmap);return;}
    if(!message.complete){const weight=revealWeight(message.progress);composeReveal(painter.ctx,bitmap,active.base,weight,{width:canvas.width,height:canvas.height});canvas.dataset.revealWeight=weight.toFixed(3);return;}
    const from=copyImage(canvas,canvas.width,canvas.height),to=finalCopy??copyImage(bitmap,canvas.width,canvas.height),started=performance.now();active.fading=true;
    const step=()=>{
      if(reveal!==active||canvas.width!==to.width||canvas.height!==to.height){if(reveal===active)endReveal();if(revision===settledRevision&&!settledBusy)canvas.dataset.refining='false';return;}
      const k=clamp((performance.now()-started)/REPROJECTION.fadeMs),c=painter.ctx;
      if(k>=1){paintBitmap(to);endReveal();canvas.dataset.revealWeight='0';if(revision===settledRevision&&!settledBusy)canvas.dataset.refining='false';return;}
      c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-over';c.globalAlpha=1;c.drawImage(from,0,0);c.globalAlpha=k;c.drawImage(to,0,0);c.globalAlpha=1;
      requestAnimationFrame(step);
    };
    step();
  }
  async function presentNativeStage(stage){
    const result=nativeResult;if(stage<1||!result?.complete||nativeDecodeBusy)return;
    nativeDecodeBusy=true;const run=playbackEpoch,revision=settledRevision;let bitmap;
    try{bitmap=await createImageBitmap(result.finalBlob);if(run!==playbackEpoch||revision!==settledRevision||result!==nativeResult||result.key!==nativeKey(snapshot()))return;const shown=bitmap;bitmap=null;crossfadeTo(shown);nativePhase='Native painting complete';canvas.dataset.renderMode=renderMode='painted';controls();}
    finally{bitmap?.close();nativeDecodeBusy=false;}
  }

  function requestSketch(settle=false,{keepFrame=false}={}){
    const restBlend=smooth(state.blend);
    // A resting plate paints straight away: its layout anchors are fixed now
    // (the same anchors the shape preparation would record), the native ink
    // streams live, and the morph field is prepared alongside for later use.
    if(settle&&!keepFrame&&!playing&&(restBlend<=0||restBlend>=1)&&morphPair?.implicitMorph&&!morphPair.implicitData&&!orbitRestFor(restBlend)){
      if(!morphPair.composition.implicitAnchors){morphPair.composition=implicitAnchoredComposition(morphPair.a,morphPair.composition,{view:morphPair.view,shapeModifiers:morphPair.shapeModifiers}).composition;state.compositionAnchors=morphPair.composition.implicitAnchors;}
      ensureImplicitReady(()=>{if(nativeResult&&nativeResult.key===nativeKey(snapshot()))return;requestSketch(true);});
      cancelRefinement();dirty=false;if(!painter||!a||!b)return;
      const value=snapshot();value.skipPreview=true;sketchQueue.input(value);sketchQueue.release();return;
    }
    if(fieldPending(morphPair)&&!orbitRestFor(restBlend)){implicitSettle||=settle;ensureImplicitReady(()=>{const refine=implicitSettle;implicitSettle=false;requestSketch(refine,{keepFrame});});return;}
    cancelRefinement();dirty=false;if(!painter||!a||!b)return;
    // keepFrame: the last morph frame already shows this plate's geometry in
    // colour, so it stays until the native painting crossfades over it.
    const value=snapshot();if(keepFrame){value.keepFrame=true;value.landing=true;}if(plateViewport?.isOrbitHolding())value.turned=true;
    sketchQueue.input(value);if(settle)sketchQueue.release();
  }
  function drawPreview(value){
    if(!painter||!value)return;
    // Painting starts immediately; the native ink stream is the first thing shown.
    if(value.skipPreview){canvas.dataset.renderMode=renderMode='sketch';return;}const frameStarted=performance.now();hideDetail();
    if(painter.useSheet(plateSheetSeed(value)))nativeInkPaperRaster=null;
    const keep=value.keepFrame&&painter.previewColoured;value.keepFrame=false;
    if(!keep){fadeToken++;if(drawReprojectedPreview(value))painter.previewColoured=false;else{painter.sketch(value.genome,{morph:value.morph,blend:value.blend,scene:value.scene,coloured:playbackColouring({playing,sketchPlaying}),interactive:playing||!!plateViewport?.isOrbitHolding()});canvas.dataset.reprojected='false';}}renderMode='sketch';canvas.dataset.renderMode=renderMode;
    if(morphFrom&&playing){const c=painter.ctx,k=clamp(morphFrom.until-performance.now(),0,MORPH_FADE_MS)/MORPH_FADE_MS;if(k>0){c.setTransform(1,0,0,1,0,0);c.globalAlpha=smooth(k);c.drawImage(morphFrom.canvas,0,0);c.globalAlpha=1;}else morphFrom=null;}
    canvas.dataset.previewColoured=String(!!painter.previewColoured);
    canvas.dataset.previewGeometryMs=painter.lastPreviewGeometryMs.toFixed(2);canvas.dataset.previewDrawMs=painter.lastPreviewDrawMs.toFixed(2);canvas.dataset.previewMs=painter.lastPreviewMs.toFixed(2);canvas.dataset.previewFrame=String(painter.previewFrames);
    canvas.dataset.previewBlend=String(state.blend);canvas.dataset.sourceType=state.typeId;canvas.dataset.targetType=state.nextTypeId;canvas.dataset.orbitRest=String(!!value.morph.orbitRest);canvas.dataset.morphKind=value.morph.orbitRest?'rest-3d':value.morph.connectedAnatomy?'connected-3d':value.morph.implicitMorph?'fictional-2d':value.morph.sameRecipe?'seed':'unsupported';canvas.dataset.cameraYaw=String(state.yaw);canvas.dataset.cameraPitch=String(state.pitch);controls();updateTraits(value.genome,performance.now());
    canvas.dataset.previewFrameMs=(performance.now()-frameStarted).toFixed(2);
    previewSamples.push(painter.lastPreviewMs);if(previewSamples.length>120)previewSamples.shift();
    if(!playing||painter.previewFrames%15===0)publishPreviewMetrics();
    canvas.setAttribute('aria-label',`Shape preview of ${value.genome.title}. ${Math.round(state.blend*100)} percent toward ${state.next}; ink and wash return when movement stops.`);
  }
  function publishPreviewMetrics(){
    if(!previewSamples.length)return;
    const sorted=[...previewSamples].sort((x,y)=>x-y);
    canvas.dataset.previewSamples=String(sorted.length);
    canvas.dataset.previewP95Ms=sorted[Math.ceil(sorted.length*.95)-1].toFixed(2);
    canvas.dataset.previewMaxMs=sorted.at(-1).toFixed(2);
  }
  function publishMotionMetrics(){
    if(!metrics.playbackStarted)return;
    metrics.playbackMs=performance.now()-metrics.playbackStarted;
    canvas.dataset.morphFrames=String(metrics.delivered);
    canvas.dataset.morphDurationMs=metrics.playbackMs.toFixed(2);
    canvas.dataset.morphFps=(metrics.delivered*1000/Math.max(1,metrics.playbackMs)).toFixed(2);
    canvas.dataset.morphTargetFps=sketchPlaying||metrics.mode==='sketch'?'30':'24';
    publishPreviewMetrics();
  }
  function refinePreview(value,isCurrent,{rerun=false}={}){
    if(!isCurrent()||playing||replaying&&!rerun)return Promise.resolve(null);
    const key=nativeKey(value);
    if(!rerun&&nativeResult?.key===key&&nativeResult.complete){drawingStage=1;nativeReplayIndex=-1;presentNativeStage(1);return Promise.resolve(nativeResult);}
    cancelRefinement();
    if(!rerun&&prefetch&&prefetch.key===key&&!prefetch.failed)return adoptPrefetch(value,isCurrent);
    if(!rerun){const job=takePrepared(value);
      // A recorded plate replays its painting; a morph landing (or a plate
      // still painting) is adopted like the morph prefetch: same Worker, same key.
      if(job?.complete&&job.frames.length>2&&!value.landing)return replayPrepared(job,value,isCurrent);
      if(job){prefetch?.worker?.terminate();job.key=job.plateKey;prefetch=job;return adoptPrefetch(value,isCurrent);}
    }
    const revision=++settledRevision,started=performance.now();let lastNativeUI=0;
    // After a coloured preview the plate stays on screen until the finished
    // painting can be crossfaded in; it never restarts from blank paper.
    const quiet=!rerun&&!!painter.previewColoured;
    const current=()=>revision===settledRevision&&isCurrent()&&!playing;
    const promise=new Promise(resolve=>{nativeBuilding={resolve,key};});
    nativeResult={key,frames:[],streamedFrames:0,bytes:0,complete:false,metrics:null,priorFinal:rerun&&nativeResult?.key===key?nativeResult.finalBlob:null};nativePhase='Preparing ink';drawingStage=0;nativeReplayIndex=-1;replaying=true;updateTraits(value.genome,performance.now(),true);
    const fail=message=>{
      if(!current())return;
      settledWorker?.terminate();settledWorker=null;settledBusy=false;canvas.dataset.refining='false';canvas.dataset.nativeComplete='false';
      endReveal();replaying=false;renderMode='error';nativePhase='Painting incomplete';status.textContent=message;controls();
      nativeBuilding?.resolve(null);nativeBuilding=null;
    };
    if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||!OffscreenCanvas.prototype.convertToBlob){fail('Native painting needs module Workers and OffscreenCanvas');return promise;}
    retireDetailWorker();setBacking(targetBaseScale());const outputScale=baseScale;if(!rerun)startReveal(value,revision);
    try{
      settledWorker=paintingWorker();settledBusy=true;canvas.dataset.refining='true';canvas.dataset.nativeComplete='false';controls();
      settledWorker.onmessage=event=>{
        const message=event.data;
        if(!current()||message.revision!==revision){message.bitmap?.close();return;}
        if(message.error){fail(message.error);return;}
        if(message.nativeMaterial){nativePaperTemplate=message.paper;return;}
        if(!message.native||!message.bitmap)return;
        // Paint playback: the tool's cursor, and live patches of the plate.
        if('cursor' in (message.metrics??{}))showCursor(message.metrics.cursor);
        if(message.complete){showCursor(null);canvas.dataset.livePainting='false';}
        if(message.patch){
          if(current()){const c=painter.ctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.drawImage(message.bitmap,message.patch.x,message.patch.y);}
          message.bitmap.close();settledWorker?.postMessage({kind:'native-frame-ack'});
          drawingStage=message.progress;nativePhase=message.stage;canvas.dataset.livePatches=String(message.metrics?.renderTimings?.livePatches??0);return;
        }
        const result=nativeResult;
        if(message.complete&&message.blob.size>NATIVE_PAINT_LIMITS.cacheBytes){message.bitmap.close();fail('Native final image memory limit reached');return;}
        result.streamedFrames++;result.metrics=message.metrics;
        if(message.complete){result.frames=[{blob:message.blob,progress:1,stage:message.stage}];result.bytes=message.blob.size;result.priorFinal=null;}
        // Keep a copy of the final for orbit reprojection in both paths: a quiet
        // repaint after a coloured morph preview crossfades, others reveal.
        const finalCopy=message.complete?copyImage(message.bitmap,message.bitmap.width,message.bitmap.height):null;
        if(message.complete&&quiet){endReveal();const bitmap=message.bitmap;if(current())crossfadeTo(bitmap);else bitmap.close();}
        else if(quiet)message.bitmap.close();
        else presentSettledBitmap(message.bitmap,current,bitmap=>presentNativeFrame(bitmap,message,revision,finalCopy));
        settledWorker?.postMessage({kind:'native-frame-ack'});
        drawingStage=message.progress;nativePhase=message.stage;renderMode=message.complete?'painted':'painting';canvas.dataset.renderMode=renderMode;
        painter.frames++;painter.lastRenderMs=message.metrics.totalMs;
        const uiNow=performance.now(),updateUI=message.complete||uiNow-lastNativeUI>=100;
        if(updateUI){lastNativeUI=uiNow;
        canvas.dataset.nativeSteps=String(message.metrics.steps??0);canvas.dataset.nativeLayers=String(message.metrics.fixedLayers??0);canvas.dataset.nativeWater=String(message.metrics.water??0);
        canvas.dataset.nativePaperReused=String(message.metrics.paperReused??false);canvas.dataset.nativeCells=String(message.metrics.nativeCells??0);canvas.dataset.nativeRenderMs=String(message.metrics.totalMs);canvas.dataset.nativeSnapMaxDiff=String(message.metrics.snapMaxDiff??'');canvas.dataset.nativeSnapOver1=String(message.metrics.snapOver1??'');canvas.dataset.nativeSnapBox=JSON.stringify(message.metrics.snapBox??null);canvas.dataset.nativeSnapSamples=JSON.stringify(message.metrics.snapSamples??null);canvas.dataset.nativeTimings=JSON.stringify({engine:message.metrics.timings,render:message.metrics.renderTimings});canvas.dataset.nativeCheckpoints=String(result.streamedFrames);canvas.dataset.nativePreviewOptics=message.metrics.previewOptics??'custom ink';canvas.dataset.nativeStrokeSegments=String(message.metrics.strokeSegments??0);canvas.dataset.nativeClearWaterStrokes=String(message.metrics.clearWaterStrokes??0);canvas.dataset.nativeCacheBytes=String(result.bytes);canvas.dataset.nativeInk='custom variable-pressure ink';if(message.metrics.inkHash)canvas.dataset.nativeInkHash=message.metrics.inkHash;if(message.metrics.inkMarksRendered)canvas.dataset.nativeInkMarks=String(message.metrics.inkMarksRendered);if(message.metrics.finalPixelHash)canvas.dataset.nativeFinalPixelHash=message.metrics.finalPixelHash;
        status.textContent=message.complete?'':message.stage;
        }
        if(message.complete){
          queuePreparation();result.complete=true;result.finalBlob=message.blob;settledBusy=false;replaying=false;canvas.dataset.refining=reveal?.fading?'true':'false';canvas.dataset.nativeComplete='true';captureReprojection(value,finalCopy);canvas.dataset.refineMs=(performance.now()-started).toFixed(2);
          nativeBuilding?.resolve(result);nativeBuilding=null;const worker=settledWorker;settledWorker=null;if(worker)adoptDetailWorker(worker,key,revision);
          canvas.setAttribute('aria-label',`Custom variable-pressure ink and simulated watercolor ${value.genome.title}. Native wash, flow, drying and glaze complete.`);
        }
        if(updateUI)controls();if(message.complete)updateTraits(value.genome,performance.now(),true);
      };
      settledWorker.onerror=event=>{event.preventDefault();fail(event.message||'Native painting failed');};
      if(painter.useSheet(plateSheetSeed(value)))nativeInkPaperRaster=null;
      nativeInkPaperRaster??=painter.paper.getContext('2d').getImageData(0,0,painter.paper.width,painter.paper.height);
      // Structured clone keeps immutable template arrays in the main thread;
      // cancellation can terminate the entire Worker without losing material.
      settledWorker.postMessage({kind:'settle',genome:value.genome,scene:value.scene,morph:bridgeRecipe(value),fieldPlate:value.fieldPlate,composition:value.morph.composition,revision,paperTemplate:nativePaperTemplate,inkPaperRaster:nativeInkPaperRaster,outputScale,playback:!!rerun,turned:!!value.turned});
    }catch(error){fail(error.message);}
    return promise;
  }
  // Settle on the destination painting that was prepared during playback.
  function adoptPrefetch(value,isCurrent){
    const job=prefetch,key=job.key,revision=++settledRevision,started=performance.now();
    const current=()=>revision===settledRevision&&isCurrent()&&!playing;
    const promise=new Promise(resolve=>{nativeBuilding={resolve,key};});
    nativeResult={key,frames:[],streamedFrames:0,bytes:0,complete:false,metrics:null,priorFinal:null};
    nativePhase='Drying the last wash';drawingStage=.9;replaying=true;settledBusy=true;renderMode='painting';
    canvas.dataset.refining='true';canvas.dataset.nativeComplete='false';canvas.dataset.prefetchAdopted='true';controls();
    const settle=async done=>{
      if(!current())return;
      if(!done?.blob){prefetch=null;settledBusy=false;replaying=false;nativeBuilding?.resolve(null);nativeBuilding=null;refinePreview(value,isCurrent);return;}
      let bitmap;try{bitmap=await createImageBitmap(done.blob);}catch(error){if(current()){prefetch=null;settledBusy=false;replaying=false;refinePreview(value,isCurrent);}return;}
      if(!current()){bitmap.close();return;}
      const result=nativeResult;result.frames=[{blob:done.blob,progress:1,stage:'Complete'}];result.bytes=done.blob.size;result.metrics=done.metrics;result.complete=true;result.finalBlob=done.blob;result.streamedFrames=1;
      const finalCopy=copyImage(bitmap,bitmap.width,bitmap.height);
      crossfadeTo(bitmap);if(prefetch===job)prefetch=null;captureReprojection(value,finalCopy);
      if(job.worker){adoptDetailWorker(job.worker,key,0);job.worker=null;}
      drawingStage=1;nativePhase='Native painting complete';renderMode='painted';settledBusy=false;replaying=false;
      canvas.dataset.refining='false';canvas.dataset.nativeComplete='true';canvas.dataset.renderMode=renderMode;canvas.dataset.refineMs=(performance.now()-started).toFixed(2);canvas.dataset.prefetchMs=(done.ms??0).toFixed(2);
      if(done.metrics?.finalPixelHash)canvas.dataset.nativeFinalPixelHash=done.metrics.finalPixelHash;
      status.textContent='';nativeBuilding?.resolve(result);nativeBuilding=null;controls();updateTraits(value.genome,performance.now(),true);queuePreparation();
    };
    if(job.complete)settle(job);else{status.textContent='Drying the last wash';job.waiters.push(settle);}
    return promise;
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  $('seed').value = state.seed; $('next-seed').value = state.next;
  $('scene').value=state.background?state.selectedScene:'plain';
  $('field-plate').checked=state.fieldPlate;
  $('duration').value = state.duration; $('duration-value').value = `${state.duration}s`;
  $('loop-pause').value = state.loopPause; $('loop-pause-value').value = `${state.loopPause}s`;
  $('loop-pause').addEventListener('input',()=>{state.loopPause=Number($('loop-pause').value);$('loop-pause-value').value=`${state.loopPause}s`;persist();});
  // Native, keyboard-searchable lists: the field guide (beta) first, then the
  // experimental (alpha) forms by body plan, each labelled alpha.
  const betaHere=BETA_TYPES.filter(id=>TYPES_BY_ID.has(id));
  for (const id of ['type-profile', 'donor-profile','next-type-profile']) {
    const select = $(id),beta=document.createElement('optgroup'),alpha=document.createElement('optgroup');
    beta.label='Field guide (beta)';alpha.label='Experimental (alpha)';select.append(beta,alpha);
    for (const typeId of betaHere) {const type=getMushroomType(typeId),option=document.createElement('option');option.value=type.id;option.textContent=type.name;beta.append(option);}
    for (const type of MUSHROOM_TYPES) {
      if(isBetaType(type.id))continue;
      const option = document.createElement('option'); option.value = type.id; option.textContent = `${type.name} · ${type.group} (alpha)`;option.dataset.stage='alpha';
      alpha.append(option);
    }
  }
  if($('include-alpha')){$('include-alpha').checked=!!state.includeAlpha;$('include-alpha').addEventListener('change',()=>{state.includeAlpha=$('include-alpha').checked;persist();});}
  const profileLabels = {
    agaric:{15:'Gill density',16:'Gill curve'}, bonnet:{0:'Bell span',1:'Bell rise',15:'Gill density'},
    waxcap:{0:'Cap span',1:'Cone rise',15:'Gill spacing'}, milkcap:{1:'Funnel depth',15:'Gill density',16:'Gill curve'},
    hedgehog:{15:'Tooth density',16:'Tooth curve',17:'Tooth depth'},
    cup:{0:'Cup span',1:'Cup depth',6:'Cup lean',19:'Surface relief',23:'Body wash'},
    trumpet:{0:'Mouth span',1:'Horn depth',7:'Horn length',15:'Outer folds',17:'Cavity depth'},
    earthstar:{0:'Ray spread',1:'Sac height',6:'Body lean',19:'Surface relief',23:'Body wash'},
    nest:{0:'Nest span',1:'Nest depth',6:'Nest lean',19:'Surface relief',23:'Body wash'},
    club:{0:'Group spread',1:'Club length',5:'Growth lean',8:'Club thickness'},
    jelly:{0:'Lobe spread',1:'Lobe height',6:'Lobe lean',19:'Surface relief',23:'Body wash'},
    tooth:{0:'Crown spread',1:'Tooth length',5:'Branch spread',8:'Tooth thickness'},
    saddle:{0:'Lobe span',1:'Lobe height',15:'Fold density',16:'Fold curve'},
    stinkhorn:{0:'Head span',1:'Head height',15:'Relief density',16:'Relief curve'},
  };
  function currentTraitLabels(typeId=state.typeId) {
    const type=getMushroomType(typeId);return {...(FORM_LABELS[type.family]??{}),...(profileLabels[type.grammar]??{})};
  }
  // The Wikipedia line under the title. Rebuilt only when its target changes,
  // since updateTraits runs at 10 Hz during a morph.
  let specimenLinkKey=null;
  function showSpecimenLink(genome){
    const el=$('specimen-link');if(!el)return;
    const parts=specimenLinkParts(genome),key=parts?parts.links.map(link=>link.href).join('|')+parts.kind:'';
    if(key===specimenLinkKey)return;specimenLinkKey=key;el.hidden=!parts;
    if(!parts){el.replaceChildren();return;}
    const anchor=(link,text)=>{const a=document.createElement('a');a.href=link.href;a.target='_blank';a.rel='noopener';
      a.textContent=text;a.setAttribute('aria-label',`${link.label} on Wikipedia (opens in a new tab)`);return a;};
    if(parts.kind==='single'){el.replaceChildren(anchor(parts.links[0],parts.links[0].label+parts.suffix));return;}
    const nodes=[parts.prefix];parts.links.forEach((link,i)=>{if(i)nodes.push(parts.joiner);nodes.push(anchor(link,link.label));});
    el.replaceChildren(...nodes,parts.suffix);
  }
  function describeRecipe() {
    const profile = getMushroomType(state.typeId), donor = state.donorId && getMushroomType(state.donorId);
    $('type-profile').value = state.typeId;$('next-type-profile').value=state.nextTypeId;
    for (const option of $('donor-profile').options) {
      option.disabled = !!option.value && !compatibleHybrid(state.typeId, option.value).ok;
    }
    $('donor-profile').value = state.donorId || '';
    $('specimen-name').textContent = a.title;
    showSpecimenLink(a);
  }
  const anatomyElements=ANATOMY_MEASURES.map(([key,label,unit])=>{
    const row=document.createElement('tr'),heading=document.createElement('th');heading.scope='row';heading.textContent=`${label}${unit?' · '+unit:''}`;
    const cells=Array.from({length:4},()=>document.createElement('td'));row.append(heading,...cells);$('anatomy-values').append(row);return {key,cells};
  });
  const intrinsicElements=CONNECTED_ANATOMY_MEASURES.map(([key,label,unit])=>{
    const row=document.createElement('tr'),heading=document.createElement('th');heading.scope='row';heading.textContent=`${label}${unit?' · '+unit:''}`;
    const cells=Array.from({length:4},()=>document.createElement('td'));row.dataset.measure=key;row.append(heading,...cells);$('intrinsic-values').append(row);return {key,cells};
  });
  // Shape traits first, then the painting traits.
  const traitElements = [...TRAITS.keys()].sort((x,y)=>((x>=21&&x<=29)-(y>=21&&y<=29))||x-y).map(i => {const name=TRAITS[i];
    const row=document.createElement('tr'),heading=document.createElement('th');heading.scope='row';
    const label=document.createElement('span');label.textContent=name;heading.append(label);
    if(i>=21&&i<=29){const stage=document.createElement('small');stage.textContent='wash';heading.append(stage);}
    const endpointA=document.createElement('td'),current=document.createElement('td'),endpointB=document.createElement('td'),delta=document.createElement('td');
    row.append(heading,endpointA,current,endpointB,delta);$(i>=21&&i<=29?'traits-painting':'traits').append(row);
    return {row,label,endpointA,current,endpointB,delta,i};
  });
  function updateTraitCounts(){
    const shown=traitElements.filter(item=>!item.row.hidden),painting=shown.filter(item=>item.i>=21&&item.i<=29).length;
    $('sum-shape').textContent=`${shown.length-painting} traits`;$('sum-painting').textContent=`${painting} traits`;
  }
  // Debug sections remember being open or closed for this session.
  {
    let saved={};try{saved=JSON.parse(sessionStorage.getItem('spore-debug-sections')||'{}');}catch{saved={};}
    for(const section of document.querySelectorAll('.debug-section')){
      const name=section.dataset.section;if(name in saved)section.open=!!saved[name];
      section.addEventListener('toggle',()=>{saved={...saved,[name]:section.open};try{sessionStorage.setItem('spore-debug-sections',JSON.stringify(saved));}catch{}});
    }
  }
  const setDebug=visible=>{$('debug-toggle').setAttribute('aria-pressed',String(visible));$('morph-debug').hidden=!visible;document.body.dataset.debug=String(visible);};
  $('debug-copy')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(specimenRecord(snapshot().genome),null,2));$('debug-copy').textContent='Copied';setTimeout(()=>{$('debug-copy').textContent='Copy JSON';},1200);}catch{$('debug-copy').textContent='Copy failed';}});
  $('debug-toggle').addEventListener('click',()=>{
    const visible=$('debug-toggle').getAttribute('aria-pressed')!=='true';setDebug(visible);persist();
    if(visible&&a&&b){lastTraits=0;updateTraits(snapshot().genome,performance.now(),true);}
  });
  if(new URLSearchParams(location.search).get('debug')==='1')setDebug(true);
  if(globalThis.matchMedia?.('(min-width:1101px)').matches)$('more-controls').open=true;
  function persist() {
    const q = new URLSearchParams({ type: state.typeId, seed: state.seed, next: state.next,nextType:state.nextTypeId,
      blend: String(state.blend), pace: String(state.duration), dwell: String(state.loopPause) });
    if (state.donorId) q.set('donor', state.donorId);if(state.nextDonorId)q.set('nextDonor',state.nextDonorId);
    if(state.compositionAnchors)q.set('anchors',JSON.stringify(state.compositionAnchors));q.set('layout',state.compositionSeed);q.set('members',String(state.compositionCount));for(const [key,value] of [['yaw',state.yaw],['pitch',state.pitch],['depth',state.capDepth],['bend',state.stemBend]])q.set(key,String(value));
    q.set('scene',state.selectedScene);q.set('background',state.background?'1':'0');q.set('paint',state.paint);if(state.fieldPlate)q.set('plate','1');if(state.includeAlpha)q.set('alpha','1');if(!HABIT_COLONY_AT_REST)q.set('colony','0');if($('debug-toggle').getAttribute?.('aria-pressed')==='true')q.set('debug','1');
    history.replaceState(null, '', `${location.pathname}?${q}`);
  }
  function regenerate({preview=true,promoteFrom=null}={}) {
    canvas.dataset.nativeComplete='false';
    const recipeKey=JSON.stringify([state.typeId,state.donorId,state.seed]);
    if(lastRecipeKey!==null&&recipeKey!==lastRecipeKey&&!promoteFrom)Object.assign(state,DEFAULT_ORBIT_VIEW);
    lastRecipeKey=recipeKey;
    state.scene=state.background?resolveHabitat(state.selectedScene,state.typeId):'plain';
    cancelImplicitPreparation();
    plateViewport?.cancelGesture({settle:false});
    sketchQueue.cancel();cancelRefinement();
    if(cache.key!==morphIdentity(morphSettings(state)))cache.reset();
    const profile = getMushroomType(state.typeId); state.family = profile.family;
    a = generateSpecimen(state.seed, state.typeId, state.donorId); b = generateSpecimen(state.next, state.nextTypeId, state.nextDonorId);
    if(!state.compositionCount)state.compositionCount=seedSpecimenCount(a,buildSketch(a).specimenCount);
    const composition=applyCompositionAnchors(createSpecimenComposition({...a,seed:state.compositionSeed},{count:state.compositionCount}),state.compositionAnchors);
    morphPair=promoteFrom?createPromotedMorphPair(promoteFrom,b,{fieldPlate:state.fieldPlate}):
      withFieldPlatePair(createMorphPair(a,b,{composition,...orbitViewOptions(state)}),state.fieldPlate);
    if(!morphPair.supportedMotion)state.blend=0;
    morphPair.measuresA=measureSketch(morphPair.source);morphPair.measuresB=measureSketch(morphPair.target);
    update3DControls();
    const active=[...new Set([...activeTraitsFor(a),...activeTraitsFor(b)])],labels=currentTraitLabels(),labelsB=currentTraitLabels(state.nextTypeId);
    describeRecipe();
    $('debug-body-plan').textContent=a.phenotype.grammar===b.phenotype.grammar?`Body plan: ${a.phenotype.grammar}`:`Body plan: ${a.phenotype.grammar} → ${b.phenotype.grammar}`;
    $('debug-habitat-line').textContent=`Habitat: ${state.background?state.selectedScene==='auto'?`auto (${state.scene})`:state.selectedScene:'off'}`;
    $('debug-type-a').textContent=`${a.profileId}${a.donorId?' × '+a.donorId+' — '+a.hybridLine:''}`;if($('debug-ecology'))$('debug-ecology').textContent=ecologyLabel(a);$('debug-type-b').textContent=`${b.profileId}${b.donorId?' × '+b.donorId:''}`;
    for(const {row,label,endpointA,endpointB,i} of traitElements){
      row.hidden=!active.includes(i)||false;const nameA=labels[i]??TRAITS[i],nameB=labelsB[i]??TRAITS[i];label.textContent=morphPair.sameRecipe||nameA===nameB?nameA:`${nameA} → ${nameB}`;
      endpointA.textContent=a.values[i].toFixed(4);endpointB.textContent=b.values[i].toFixed(4);
      row.dataset.direction=b.values[i]>a.values[i]?'up':b.values[i]<a.values[i]?'down':'same';
    }
    updateTraitCounts();
    $('debug-seed-a').textContent=state.seed;$('debug-seed-b').textContent=state.next;
    for (const el of document.querySelectorAll('[data-family]')) el.setAttribute('aria-pressed', String(el.dataset.family === state.family));
    $('field-plate').checked=state.fieldPlate;
    dirty = false;if(preview)requestSketch();
  }
  function controls() {
    const supported=morphPair?.supportedMotion!==false;for(const id of ['blend','morph','evolve'])$(id).disabled=!supported;$('morph-support').hidden=supported;
    $('blend').value = state.blend; $('blend-value').value = `${Math.round(state.blend * 100)}%`;
    const setAction=(id,label,paused)=>{const el=$(id),span=el.querySelector?.('.label');if(span)span.textContent=label;else el.textContent=label;el.setAttribute('aria-label',label);el.title=label;el.dataset.pause=String(!!paused);};
    setAction('morph',preparing ? 'Cancel' : playing && !continuous ? 'Pause' : 'Morph',preparing||playing&&!continuous);
    $('morph-progress').hidden=!preparing;
    setAction('evolve',continuous ? 'Pause' : 'Loop',continuous);
    setAction('draw',replaying ? 'Pause' : drawingStage < 1 ? 'Replay' : 'Paint',replaying);
    $('draw').setAttribute('aria-pressed', String(replaying));
    $('evolve').setAttribute('aria-pressed', String(continuous));
    document.body.dataset.playing = String(playing || replaying);
    $('render-state').textContent = renderMode==='sketch'?'Shape preview':renderMode==='error'?'Painting incomplete':`${nativePhase||'Painting'} · ${Math.round(drawingStage*100)}%`;
    $('save').disabled=settledBusy||playing||renderMode==='sketch'||renderMode==='error';
    $('paint-lab').disabled=playing;
    $('drawing-progress').value = drawingStage;
    $('drawing-progress').setAttribute('aria-valuetext', `${Math.round(drawingStage*100)} percent drawn`);
  }
  function pause({settle=true,fromOrbit=false}={}) {
    stopLoopPause();cancelImplicitPreparation();
    if(!fromOrbit)plateViewport?.cancelGesture({settle:false});
    playbackEpoch++;const restoreDetail=playing||renderMode!=='painted';
    if(playing)publishMotionMetrics();
    sketchQueue.cancel();cancelRefinement();cancelPrefetch();fadeToken++;morphFrom=null;
    if(preparing){cache.reset();preparing=false;$('morph-progress').hidden=true;}
    playStart=0;playing=continuous=replaying=sketchPlaying=false;last=0;dirty=false;controls();persist();
    if(settle&&restoreDetail)showFinished();
  }
  function queueFrame() { if (!frame && painter) frame = requestAnimationFrame(tick); }
  function tick(now) {
    frame = 0;
    if(playing&&sketchPlaying){
      if(!playStart){playStart=now+(morphFrom?MORPH_FADE_MS:0);playBlend=state.blend;if(morphFrom)morphFrom.until=playStart;}
      state.blend=Math.min(1,playBlend+Math.max(0,now-playStart)/(state.duration*1000));
      if(!lastSketchAt||now-lastSketchAt>=1000/30||state.blend===1){
        drawPreview(playbackSnapshot());lastSketchAt=lastSketchAt?now-(now-lastSketchAt)%(1000/30):now;metrics.delivered++;
        if(metrics.delivered%15===0)publishMotionMetrics();
        if(state.blend===1)finishMorph();
      }
    }
    if (playing && !sketchPlaying && cache.ready) {
      if (!playStart) {playStart=now;playBlend=state.blend;}
      const requested=Math.min(1,playBlend+(now-playStart)/(state.duration*1000));
      const intervals=cache.blobs.length-1;
      const index=Math.min(intervals,Math.floor(requested*intervals));
      // Retain the exact settled scrub position until a forward sample is due.
      const forwardSample=index/intervals>=playBlend;
      if(forwardSample&&index!==displayIndex&&!decoding) {
        decoding=true;const epoch=cache.epoch,run=playbackEpoch;
        cache.bitmap(index).then(bitmap=>{
          if(!bitmap||epoch!==cache.epoch||run!==playbackEpoch||!playing||document.hidden)return;
          const at=performance.now();if(displayAt)metrics.intervals.push(at-displayAt);displayAt=at;
          if(displayIndex>=0)metrics.skipped+=Math.max(0,index-displayIndex-1);
          displayIndex=index;metrics.delivered++;state.blend=index/(cache.blobs.length-1);
          painter.ctx.setTransform(1,0,0,1,0,0);painter.ctx.globalAlpha=1;painter.ctx.globalCompositeOperation='source-over';painter.ctx.filter='none';painter.ctx.clearRect(0,0,canvas.width,canvas.height);
          painter.ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
          controls();updateTraits(snapshot().genome,at);
          canvas.setAttribute('aria-label',`Ink and wash ${a.title}. Seed ${state.seed}, ${Math.round(state.blend*100)} percent toward ${state.next}.`);
          canvas.dataset.morphFrame=String(index);
          if(state.blend===1)finishMorph();
        }).catch(error=>{if(epoch===cache.epoch&&run===playbackEpoch&&playing){pause();status.textContent=error.message;}}).finally(()=>{decoding=false;});
      }
    }
    if(dirty){dirty=false;if(!playing&&!replaying)refinePreview(snapshot(),()=>true);}
    if (playing) queueFrame();
  }
  function renderSpecimenRecord(g){
    const r=specimenRecord(g),rows=[['Type',r.type],['Seed',r.seed],['Title',r.title],['Fictional',r.fictional?'yes':'no'],...(r.donor?[['Crossed with',r.donor]]:[]),
      ...Object.entries(r.phenotype).map(([k,v])=>[k,v])],ecology=[['Species',r.ecology.analogue],['Substrate',r.ecology.substrate],['Hosts',r.ecology.hosts.join(', ')||'none'],['Season',r.ecology.season],['Fairy ring',r.ecology.fairyRing?'yes':'no']];
    const pairs=list=>list.flatMap(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=String(v??'');return [dt,dd];});
    $('debug-record').replaceChildren(...pairs(rows));$('debug-ecology-record').replaceChildren(...pairs(ecology));
    $('sum-specimen').textContent=`${r.type} · ${r.seed}`;$('sum-ecology').textContent=`${r.ecology.analogue} · ${r.ecology.substrate} · ${r.ecology.season}`;
    $('sum-measures').textContent=`${ANATOMY_MEASURES.length} measures`;
  }
  function updateTraits(g,now,force=false) {
      // Reuse cells and sample at 10 Hz; the sketch stays on its 30 Hz clock.
      // Read the actual rendered genome, including the same easing function.
      if (force || now-lastTraits>=100) {
        if(!$('morph-debug').hidden){
          renderSpecimenRecord(g);
          for(const {i,row,current,delta} of traitElements){
            // Now: the value the plate is drawn with this frame; Δ: how far it has moved from A.
            if(row.hidden)continue;const change=g.values[i]-a.values[i];
            current.textContent=g.values[i].toFixed(4);
            delta.textContent=Math.abs(change)<.00005?'0.0000':`${change>0?'+':'−'}${Math.abs(change).toFixed(4)}`;
            row.dataset.direction=change>=.00005?'up':change<=-.00005?'down':'same';
          }
          const chart=morphPair.connectedAnatomy?morphPair:morphPair.sourceConnected?{...morphPair.sourceConnected,view:morphPair.view,shapeModifiers:morphPair.shapeModifiers}:null;
          $('intrinsic-panel').hidden=!chart;
          if(chart){
            const av=connectedIntrinsicValues(chart,0),bv=morphPair.connectedAnatomy?connectedIntrinsicValues(chart,1):null,cv=connectedIntrinsicValues(chart,smooth(state.blend));
            for(const {key,cells} of intrinsicElements){[av[key],cv[key],bv?.[key],cv[key]-av[key]].forEach((n,i)=>cells[i].textContent=Number.isFinite(n)?n.toFixed(3):'—');}
            
            $('view-values').textContent=`Camera: yaw ${(state.yaw*180/Math.PI).toFixed(1)}° · pitch ${(state.pitch*180/Math.PI).toFixed(1)}°`;
          }
          const measure=measureSketch(painter.previewPlan??buildMorphSketch(morphPair,smooth(state.blend),{scene:state.scene}));
          for(const {key,cells} of anatomyElements){const av=morphPair.measuresA[key],bv=morphPair.measuresB[key],now=measure[key],delta=now-av;[av,now,bv,delta].forEach((n,i)=>cells[i].textContent=n.toFixed(1));}
          $('debug-current-id').textContent=state.blend===0?a.profileId:state.blend===1?b.profileId:`${a.profileId} → ${b.profileId} @ ${smooth(state.blend).toFixed(3)}`;
          $('debug-position').textContent=`Morph ${(state.blend*100).toFixed(1)}% · shape ${(smooth(state.blend)*100).toFixed(1)}%`;
        }
        $('specimen-name').textContent=g.title;showSpecimenLink(g);
        lastTraits = now;
      }
  }
  function finishMorph() {
    publishMotionMetrics();
    const loop=continuous;playing=sketchPlaying=false;playStart=0;
    metrics.playbackMs=performance.now()-metrics.playbackStarted;
    const nextSeed=plannedNextSeed??randomSeed();plannedNextSeed=null;
    Object.assign(state,advanceMorphState(state,nextSeed));
    $('seed').value=state.seed;$('next-seed').value=state.next;regenerate({preview:false,promoteFrom:morphPair});persist();
    if(!loop)continuous=false;
    drawingStage=1;replaying=false;dirty=false;sketchQueue.cancel();requestSketch(true,{keepFrame:true});controls();
    if(loop)holdLoopPause();
  }
  // Loop: the landed plate paints in full, then stays on screen for the loop
  // pause, counted from completion, before the next morph begins. Prepared
  // plates keep painting in the background meanwhile.
  function stopLoopPause(){clearTimeout(loopPauseTimer);loopPauseTimer=0;loopPauseToken++;canvas.dataset.loopPause='off';}
  function holdLoopPause(){
    stopLoopPause();const token=loopPauseToken;canvas.dataset.loopPause='painting';
    const live=()=>token===loopPauseToken&&continuous&&!playing&&!preparing;
    const check=()=>{
      loopPauseTimer=0;if(!live())return;const d=canvas.dataset;
      if(d.nativeComplete!=='true'||d.refining==='true'||d.settleFade==='running'||replaying){loopPauseTimer=setTimeout(check,100);return;}
      Object.assign(canvas.dataset,{loopPause:'holding',loopPauseFrom:String(performance.now())});
      loopPauseTimer=setTimeout(()=>{loopPauseTimer=0;if(!live())return;canvas.dataset.loopPause='off';beginSketchPlayback(true);},state.loopPause*1000);
    };
    loopPauseTimer=setTimeout(check,100);
  }
  function beginSketchPlayback(loop){
    dropZoomCache();canvas.dataset.nativeComplete='false';
    if(fieldPending(morphPair)){preparing=true;continuous=loop;ensureImplicitReady(()=>beginSketchPlayback(loop));controls();return;}
    if(morphPair.supportedMotion===false){continuous=false;playing=false;showFinished();status.textContent='This target can\x27t morph yet';return;}
    // A painted plate crossfades into its own coloured preview before moving.
    morphFrom=renderMode==='painted'&&!reducedMotion.matches?{canvas:captureCanvas(),until:Infinity}:null;
    sketchQueue.cancel();cancelRefinement();playbackEpoch++;preparing=false;
    playing=sketchPlaying=true;continuous=loop;replaying=false;drawingStage=1;dirty=false;
    // A single morph settles on a known plate: paint it while the shapes move.
    plannedNextSeed??=randomSeed();try{prefetchNative(finishedSnapshot(plannedNextSeed));}catch(error){console.warn('Destination painting not prepared',error);prefetch=null;}
    playStart=0;lastSketchAt=0;hiddenAt=0;renderMode='sketch';
    metrics={preparationMs:0,cached:false,mode:'sketch',delivered:0,skipped:0,intervals:[],playbackStarted:performance.now()};
    controls();queueFrame();status.textContent=loop?'Looping':'Morphing';
  }
  async function prepareAndPlay(loop) {
    const settings=morphSettings(state),key=morphIdentity(settings);
    continuous=loop;showFinished();
    if(cache.key===key&&cache.ready){beginPlayback(true);return;}
    const epoch=cache.reset(key);preparing=true;prepareStarted=performance.now();controls();
    const total=morphSamples(settings.duration).length;
    $('morph-progress').max=total;$('morph-progress').value=0;
    const progress=message=>{
      if(epoch!==cache.epoch)return;
      if(message.error){fail(new Error(message.error));return;}
      if(message.done){
        cache.worker?.terminate();cache.worker=null;cache.ready=true;preparing=false;
        metrics.preparationMs=performance.now()-prepareStarted;beginPlayback();return;
      }
      try{cache.add(epoch,message.blob);cache.fingerprints.push(message.fingerprint);}catch(error){fail(error);return;}
      $('morph-progress').value=cache.blobs.length;
      status.textContent=`${loop?'Preparing next morph':'Preparing morph'}: ${cache.blobs.length} of ${total}`;
    };
    const fail=error=>{if(epoch!==cache.epoch)return;cache.reset();preparing=false;playing=continuous=false;controls();status.textContent=`Morph failed: ${error.message}`;};
    status.textContent=`Preparing morph: 0 of ${total}`;
    if(typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'&&OffscreenCanvas.prototype.convertToBlob) {
      try{
        cache.worker=new Worker(import.meta.url,{type:'module'});
        cache.worker.onmessage=event=>progress(event.data);cache.worker.onerror=event=>{event.preventDefault();fail(new Error(event.message||'Worker unavailable'));};
        cache.worker.postMessage(settings);
      }catch(error){fail(error);}
    }else{
      status.textContent='Preparing morph';
      await new Promise(resolve=>setTimeout(resolve,0));
      try{await renderMorph(settings,progress,()=>epoch===cache.epoch);if(epoch===cache.epoch)progress({done:true});}catch(error){fail(error);}
    }
  }
  function beginPlayback(cached=false) {
    sketchQueue.cancel();cancelRefinement();sketchPlaying=false;renderMode='painted';
    playbackEpoch++;preparing=false;playing=true;playStart=0;displayIndex=-1;displayAt=0;
    hiddenAt=0;metrics={preparationMs:cached?0:metrics.preparationMs,cached,delivered:0,skipped:0,intervals:[],playbackStarted:performance.now()};
    dirty=false;controls();queueFrame();status.textContent=continuous?'Looping':'Playing morph';
  }
  function applyInputs({keepLayout=false,live=false}={}) {
    clearTimeout(seedEditTimer);pause({settle:false});
    const previousSeed=state.seed;state.seed = $('seed').value.trim().slice(0, 64) || 'woodland-042';
    // A seed typed or rolled by hand is a new plate: its own layout and member
    // count. Random sets the layout itself (keepLayout).
    if(!keepLayout&&state.seed!==previousSeed){state.compositionSeed=state.seed;state.compositionCount=0;state.compositionAnchors=null;}
    state.next = $('next-seed').value.trim().slice(0, 64) || 'woodland-108';
    $('seed').value = state.seed; $('next-seed').value = state.next; state.blend = 0;
    const paintLive=live&&livePainting();regenerate({preview:!paintLive}); persist();
    if(paintLive)beginDrawing();else showFinished();
  }
  let seedEditTimer;
  for (const id of ['seed', 'next-seed']) {
    $(id).addEventListener('input',()=>{pause({settle:false});cache.reset();clearTimeout(seedEditTimer);seedEditTimer=setTimeout(applyInputs,180);});
    $(id).addEventListener('change',()=>{clearTimeout(seedEditTimer);applyInputs();});
    $(id).addEventListener('keydown',event=>{if(event.key==='Enter'){clearTimeout(seedEditTimer);applyInputs();}});
  }
  function chooseRecipe(typeId, donorId = null) {
    clearTimeout(seedEditTimer); pause({settle:false});
    state.typeId = typeId; state.family = getMushroomType(typeId).family;
    state.donorId = donorId && compatibleHybrid(typeId, donorId).ok ? donorId : null;
    state.blend = 0; regenerate(); persist(); showFinished();
  }
  function changeBackground(enabled,scene=state.selectedScene) {
    pause({settle:false});cache.reset();state.selectedScene=scene;state.background=enabled;state.scene=enabled?resolveHabitat(scene,state.typeId):'plain';
    $('scene').value=enabled?state.selectedScene:'plain';persist();showFinished();
  }
  $('scene').addEventListener('change',()=>{const scene=$('scene').value;changeBackground(scene!=='plain',scene==='plain'?state.selectedScene:scene);});
  $('field-plate').addEventListener('change',()=>{
    pause({settle:false});cache.reset();state.fieldPlate=$('field-plate').checked;
    regenerate({preview:false});persist();showFinished();
  });
  const viewBindings=[['shape-depth','capDepth'],['shape-bend','stemBend']];
  function update3DControls(){
    const enabled=!!morphPair&&!(state.fieldPlate&&morphPair.fieldPlate?.supported&&!morphPair.connectedAnatomy);
    plateViewport?.setOrbitEnabled(enabled);
    for(const [id,key] of viewBindings){$(id).disabled=!enabled;$(id).value=state[key];$(id+'-value').value=(key==='yaw'||key==='pitch')?`${Math.round(state[key]*180/Math.PI)}°`:key==='stemBend'?`${state[key].toFixed(0)} px`:`${state[key].toFixed(2)}×`;}
    if($('debug-camera'))$('debug-camera').textContent=`Camera: yaw ${(state.yaw*180/Math.PI).toFixed(1)}° · pitch ${(state.pitch*180/Math.PI).toFixed(1)}°`;
  }
  for(const [id,key] of viewBindings){
    $(id).addEventListener('pointerdown',()=>{pause({settle:false});sketchQueue.hold();});
    $(id).addEventListener('input',()=>{if(playing||replaying)pause({settle:false});state[key]=Number($(id).value);applyView();update3DControls();requestSketch();});
    for(const event of ['change','keyup','blur'])$(id).addEventListener(event,()=>{sketchQueue.release();persist();});
  }
  $('type-profile').addEventListener('change', () => chooseRecipe($('type-profile').value, state.donorId));
  function chooseTarget(){
    clearTimeout(seedEditTimer);pause({settle:false});
    state.nextTypeId=$('next-type-profile').value;
    state.nextDonorId=null;state.blend=0;regenerate();persist();showFinished();
  }
  $('next-type-profile').addEventListener('change',()=>chooseTarget());
  $('donor-profile').addEventListener('change', () => chooseRecipe(state.typeId, $('donor-profile').value || null));
  $('random').addEventListener('click', () => { $('seed').value = randomSeed(); applyInputs({live:true}); });
  function randomRecipe() {
    const choice=nextRandomChoice&&nextRandomChoice.includeAlpha===!!state.includeAlpha?nextRandomChoice:null;nextRandomChoice=null;
    if(choice){
      state.compositionSeed=choice.compositionSeed;state.compositionCount=0;state.compositionAnchors=null;
      state.typeId=choice.typeId;state.family=choice.family;state.donorId=choice.donorId;
      $('seed').value=choice.seed;$('next-seed').value=choice.next;state.nextTypeId=choice.nextTypeId;state.nextDonorId=null;applyInputs({keepLayout:true,live:true});
      status.textContent='A new mushroom';return;
    }
    const pool=randomTypePool(state.includeAlpha),host=pool[crypto.getRandomValues(new Uint32Array(1))[0]%pool.length];
    state.compositionSeed=randomSeed();state.compositionCount=0;state.compositionAnchors=null;
    state.typeId = host.id; state.family = host.family;
    state.donorId = null;
    $('seed').value = randomSeed(); $('next-seed').value = randomSeed();state.nextTypeId=chooseMorphTarget(state.typeId,$('next-seed').value,{includeAlpha:state.includeAlpha});state.nextDonorId=null;applyInputs({keepLayout:true,live:true});
    status.textContent = 'A new mushroom';
  }
  $('random-mushroom').addEventListener('click', () => randomRecipe());
  $('blend').addEventListener('pointerdown',()=>{pause({settle:false});sketchQueue.hold();});
  $('blend').addEventListener('input', () => {
    const value=Number($('blend').value),held=sketchQueue.held;
    if(playing||replaying||preparing)pause({settle:false});
    if(held)sketchQueue.hold();state.blend=value;drawingStage=1;requestSketch();
  });
  $('blend').addEventListener('change', persist);
  $('blend').addEventListener('keyup',()=>{sketchQueue.release();persist();});
  $('blend').addEventListener('blur',()=>{sketchQueue.release();persist();});
  for(const event of ['pointerup','pointercancel'])window.addEventListener(event,()=>{if(sketchQueue.held&&!plateViewport?.isOrbitHolding()){sketchQueue.release();persist();}});
  $('duration').addEventListener('input', () => {
    pause();state.duration = Number($('duration').value);cache.reset(); $('duration-value').value = `${state.duration}s`; persist();
  });
  function showFinished() { drawingStage=1;replaying=false;dirty=false;sketchQueue.cancel();requestSketch(true);controls(); }
  // Full painting: a new plate (first load, Random) paints itself live from
  // blank paper; Fast shows the finished plate at once.
  function livePainting(){return state.paint!=='fast'&&!reducedMotion.matches;}
  // A tap on the plate finishes a live painting at once.
  function skipLivePainting(){
    if(!replaying||!settledWorker||canvas.dataset.livePainting!=='true')return false;
    settledWorker.postMessage({kind:'native-skip'});showCursor(null);canvas.dataset.paintSkipped='true';return true;
  }
  function setPaintSpeed(speed){
    state.paint=speed==='fast'?'fast':'full';
    $('paint-full').setAttribute('aria-pressed',String(state.paint==='full'));$('paint-fast').setAttribute('aria-pressed',String(state.paint==='fast'));
    if(state.paint==='fast')skipLivePainting();persist();
  }
  $('paint-full').addEventListener('click',()=>setPaintSpeed('full'));$('paint-fast').addEventListener('click',()=>setPaintSpeed('fast'));
  function beginDrawing() {
    pause({settle:false});playing=continuous=false;last=0;
    // The plate's layout anchors are fixed now, as a settle would fix them.
    if(morphPair?.implicitMorph&&!morphPair.composition.implicitAnchors&&!orbitRestFor(smooth(state.blend))){morphPair.composition=implicitAnchoredComposition(morphPair.a,morphPair.composition,{view:morphPair.view,shapeModifiers:morphPair.shapeModifiers}).composition;state.compositionAnchors=morphPair.composition.implicitAnchors;persist();}
    canvas.dataset.livePainting='true';canvas.dataset.paintSkipped='false';
    const value=snapshot();replaying=true;drawingStage=0;renderMode='painting';nativePhase='Preparing ink';status.textContent='Preparing ink';
    const c=painter.ctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.drawImage(painter.paper,0,0,canvas.width,canvas.height);
    refinePreview(value,()=>nativeKey(snapshot())===nativeKey(value),{rerun:true});canvas.dataset.livePainting=String(replaying);controls();
  }
  $('draw').addEventListener('click',()=>{if(replaying){pause({settle:false});return;}beginDrawing();});
  function start(loop) {
    if(morphPair.supportedMotion===false){status.textContent='This target can\x27t morph yet';return;}
    if (preparing || (playing && continuous === loop)) { pause(); status.textContent = 'Growth paused'; return; }
    if (loop && continuous && !playing) { stopLoopPause(); continuous=false; controls(); persist(); return; }
    pause({settle:false});drawingStage=1;
    if (state.blend >= 1) {
      Object.assign(state,advanceMorphState(state,randomSeed()));
      $('seed').value = state.seed; $('next-seed').value = state.next; regenerate({preview:false,promoteFrom:morphPair});
    }
    if (reducedMotion.matches) {
      state.blend = 1;finishMorph();return;
    }
    if(cache.ready&&cache.key===morphIdentity(morphSettings(state))){continuous=loop;beginPlayback(true);}
    else beginSketchPlayback(loop);
  }
  $('morph').addEventListener('click', () => start(false));
  $('evolve').addEventListener('click', () => start(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Invalidate a pending presentation without discarding prepared frames.
      playbackEpoch++;cancelAnimationFrame(frame);frame=0;last=0;displayAt=0;
      sketchQueue.cancel();cancelRefinement();
      if(playing){hiddenAt=performance.now();playBlend=state.blend;playStart=0;}
    } else {
      if(hiddenAt){metrics.playbackStarted+=performance.now()-hiddenAt;hiddenAt=0;}
      if(playing||replaying||dirty)queueFrame();else if(renderMode!=='painted')showFinished();
    }
  });
  window.addEventListener('pagehide',()=>{pause({settle:false});cache.reset();settledWorker?.terminate();settledWorker=null;retireDetailWorker();});
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { pause(); showFinished(); } });
  $('paint-lab').addEventListener('click',()=>{
    // Store before opening: a new tab copies this tab's session storage when it opens.
    const value=snapshot();
    try{
      const text=serializePaintLabPlan({genome:value.genome,scene:value.scene,morph:bridgeRecipe(value),fieldPlate:value.fieldPlate,composition:value.morph.composition},{title:value.genome.title});
      sessionStorage.setItem(PAINT_LAB_PLAN.storageKey,text);
      const tab=window.open(paintLabUrl(location.href),'_blank');
      status.textContent=tab?'Opened in Paint Lab':'Allow pop-ups to open Paint Lab';
    }catch(error){status.textContent=error?.name==='QuotaExceededError'?'This plate is too large to open in Paint Lab':error.message;}
  });
  $('save').addEventListener('click', async () => {
    pause({settle:false}); const savedState={...state},savedValue=snapshot(),savedGenome=savedValue.genome;
    status.textContent = 'Saving'; $('save').disabled = true;
    try {
      const key=nativeKey(savedValue);
      const result=nativeResult?.complete&&nativeResult.key===key?nativeResult:await refinePreview(savedValue,()=>nativeKey(snapshot())===key);
      if(!result?.complete||!result.finalBlob)throw new Error('The native painting is not complete');
      const blob=result.finalBlob;drawingStage=1;nativeReplayIndex=-1;await presentNativeStage(1);
      if (!blob) throw new Error('Image export failed');
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      const seedLabel=savedState.blend===1?savedState.next:savedState.blend===0?savedState.seed:`${savedState.seed}-toward-${savedState.next}-at-${Math.round(savedState.blend*1000)}`;
      link.href = url; link.download = `spore-study-${savedState.typeId}${savedState.donorId ? `-x-${savedState.donorId}` : ''}-${seedLabel.replace(/[^a-z0-9_-]/gi, '_')}${savedState.scene!=='plain'?`-${savedState.scene}`:''}.png`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); status.textContent = 'Saved';
    } catch (error) { status.textContent = error.message; }
    finally { $('save').disabled = false; }
  });
  status.textContent = '';
  // Show the lightweight geometry immediately; the Worker owns native paint state.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    setBacking(targetBaseScale());painter = new Painter(canvas);watchDeviceRatio();
    $('paint-full').setAttribute('aria-pressed',String(state.paint==='full'));$('paint-fast').setAttribute('aria-pressed',String(state.paint==='fast'));
    if(livePainting()){regenerate({preview:false});beginDrawing();}else{regenerate();showFinished();}
    // Narrow inspection API for determinism, geometry and real browser checks.
    window.sporeStudy = { getViewport:()=>plateViewport?.getState(), fitViewport:()=>plateViewport?.fit(), skipPainting:()=>skipLivePainting(), getState: () => ({ ...state, playing, continuous, replaying, drawingStage, preparing,renderMode,sketchPlaying }),
      getPerformance: () => ({ frames: painter.frames, renderMs: painter.lastRenderMs,previewFrames:painter.previewFrames??0,previewMs:painter.lastPreviewMs??0 }),
      getMorphPerformance: () => ({...metrics,prepared:cache.blobs.length,uniqueArtworkFrames:new Set(cache.fingerprints).size,cacheBytes:cache.bytes,decodedFrames:cache.decoded.size,decodedBytes:cache.decoded.size*720*600*4,ready:cache.ready,key:cache.key,epoch:cache.epoch}),
      getMorphFrame: index => cache.blobs[index],
      getNativePainting:()=>nativeResult?{complete:nativeResult.complete,bytes:nativeResult.bytes,streamedFrames:nativeResult.streamedFrames,frames:nativeResult.frames.map(({stage,progress,blob})=>({stage,progress,bytes:blob.size})),metrics:nativeResult.metrics}:null,
      getNativeFrame:index=>nativeResult?.frames[index]?.blob,
      getGenome: () => snapshot().genome,
      getPlan: () => {const value=snapshot();return bridgeRecipe(value)?buildMorphStudy(value.morph,value.blend,{scene:value.scene}):buildStudy(value.genome,{scene:value.scene});},
      setStage: value => { pause({settle:false}); renderMode='painted'; drawingStage=clamp(value);nativeReplayIndex=-1;presentNativeStage(drawingStage);controls(); }, painter };
  } catch (error) {
    status.textContent = 'Could not prepare the paints'; console.error(error);
    canvas.setAttribute('aria-label', `Painting could not start: ${error.message}`);
  }
}

if (typeof document !== 'undefined' && document.getElementById('painting') && !document.getElementById('painting').dataset.mounted) {
  document.getElementById('painting').dataset.mounted='true';
  mount();
}
