// What Paint Lab asks of the painter's media (the generated paper.js, sheet.js and brush.js) that a painting run never
// needs. Everything else the lab paints with is the painter's own code. DOM free.

/**
 * One more pigment on the sheet, with none of it anywhere yet. The lab's palette is larger than one sheet needs, and every
 * pigment a sheet carries costs memory and work in every step, so a sheet takes a pigment on when a brush first uses it.
 * The sheet's working buffers are sized by the pigment count and are rebuilt on the next step. Returns the sheet.
 */
export function addPigment(sheet, pigment) {
  const n = sheet.n;
  sheet.pigments = [...sheet.pigments, pigment]; sheet.K = sheet.pigments.length;
  sheet.G.push(new Float32Array(n)); sheet.P.push(new Float32Array(n)); sheet.D.push(new Float32Array(n));
  for (const layer of sheet.layers) layer.push(new Float32Array(n));
  return sheet;
}

