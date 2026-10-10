// Cut points that turn measured style shares into the practice planner's ink and dry brush weights
// (methods/practice-style.mjs). Calibrated at 540 px on a corpus of about 40 artworks that includes several benchmark
// pieces. thin and texture are shares of all tone; chroma is in 0..255 levels.
//   ink = clamp((thin - inkFrom) / inkSpan), times monoInkGain when chroma is under monoChroma
//   dry = clamp((texture - dryFrom) / drySpan - dryInkShare * ink)
export const STYLE_CUTS = Object.freeze({ inkFrom: 0.24, inkSpan: 0.15, monoChroma: 20, monoInkGain: 2, dryFrom: 0.13, drySpan: 0.15, dryInkShare: 0.5 });
