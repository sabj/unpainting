// Apply exact vector drawing strokes to a sheet's unfixed deposit plane without
// pulling or re-uploading unrelated sheet planes when the sheet lives on the GPU.
import { coherent, layersChanged } from '../../media/sheet.mjs';
import { invalidatePaperCertificate } from '../../media/paper-certificate.mjs';
import { layVectors } from './ink-vectors.mjs';

export function layVectorsOnSheet(sheet, channel, doc, w, h, mm, inkOf, opts = {}) {
  const link = sheet._gpu;
  if (link?.editPigmentCells && !link.paused) {
    const buf = new Float32Array(w * h);
    const result = layVectors(doc, buf, w, h, mm, inkOf, opts);
    const cells = [];
    for (let i = 0; i < buf.length; i++) if (buf[i] > 0) cells.push(i);
    if (cells.length) {
      const D = sheet.D[channel];
      link.editPigmentCells(sheet, channel, Uint32Array.from(cells), () => {
        for (let j = 0; j < cells.length; j++) {
          const i = cells[j];
          if (buf[i] > D[i]) D[i] = buf[i];
        }
      });
      invalidatePaperCertificate(sheet);
    }
    return result;
  }
  coherent(sheet);
  const result = layVectors(doc, sheet.D[channel], w, h, mm, inkOf, opts);
  layersChanged(sheet);
  link?.cpuWroteAll?.();
  return result;
}
