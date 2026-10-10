// CLI Fast approximation for opted-in broad numerical pigment washes only. Spatial sampling changes
// transfer, so it is not pixel-equivalent. Keeps the nominal distance between flow calls.
export function nativeBodyCadence({mode,enabled=false,detail=false,instructionBound=false,technique='',radiusCells,mmPerCell,every,spacing=1.4}) {
 if(!['fast','full'].includes(mode))throw Error('body cadence mode takes fast or full');
 if(!Number.isFinite(spacing)||spacing<.7||spacing>1.4)throw Error('Fast body spacing takes .7..1.4 cells');
 const selected=enabled&&mode==='fast'&&!detail&&!instructionBound&&!technique.startsWith('dry brush')&&['wet on dry','wet on wet','glazed','wet on dry graded','wet on wet graded','glazed graded'].includes(technique)&&Number.isFinite(radiusCells)&&Number.isFinite(mmPerCell)&&radiusCells*mmPerCell>=4;
 return {spacing:selected?spacing:.7,every:selected?Math.max(1,Math.round(every*.7/spacing)):every,approximated:selected&&spacing!==.7};
}
