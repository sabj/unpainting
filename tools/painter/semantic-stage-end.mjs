// After an area pass, whether it was the last of its area and the last of its stage. Only area-pass layers count:
// the touch-up and final-dark layers that follow the area passes carry no _semantic and belong to no area or stage.
const stageOf = s => s.pass.stage ?? s.pass.id;

/** layers: the paint loop's layers; L: the index of the area-pass layer just laid. */
export function semanticStageEnd(layers, L) {
  const s = layers[L]._semantic, later = layers.slice(L + 1).map(q => q._semantic).filter(Boolean), stage = stageOf(s);
  return { stage, lastArea: !later.some(q => q.area.id === s.area.id), lastStage: !later.some(q => stageOf(q) === stage) };
}
