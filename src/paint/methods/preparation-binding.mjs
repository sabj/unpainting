// Pencil paths from a preparation binding: a registered trace's lines, picked by explicit roles and scaled to the sheet,
// after checking every bound asset's hash. It does not infer registration or invent drawing geometry.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { linePaths, scaleLines } from '../../crop/lines.mjs';
import { DEFAULT_SHEET_MM } from '../../media/sheet-size.mjs';
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function boundPreparation({ bindingFile, base, image, guide, w, h, num, log = () => {} }) {
  const binding = JSON.parse(fs.readFileSync(bindingFile, 'utf8'));
  if (binding.version !== 1 || !binding.roles?.length) throw Error('preparation binding: unsupported or empty roles');
  for (const asset of Object.values(binding.assets)) {
    if (sha(asset.path) !== asset.sha256) throw Error(`preparation binding: changed asset ${asset.path}`);
  }
  const trace = linePaths(base).lines;
  if (sha(trace) !== binding.assets.trace.sha256 || sha(image) !== binding.assets.target.sha256 || sha(guide) !== binding.assets.guide.sha256)
    throw Error('preparation binding: actual target/guide/trace differs from bound inputs');
  const doc = JSON.parse(fs.readFileSync(trace, 'utf8'));
  const [fw, fh] = binding.frame;
  if (doc.image.w !== fw || doc.image.h !== fh || Math.abs(w/fw-h/fh) > 1/Math.min(fw,fh))
    throw Error('preparation binding: incompatible native frame');
  if (binding.worldWidthMm != null && (!num('physical',0) || Math.abs(num('sheetmm', DEFAULT_SHEET_MM)-binding.worldWidthMm)>1e-8))
    throw Error('preparation binding: physical sheet width differs');
  if (binding.pencilWidthMm != null && Math.abs(num('pencilw',1.2)*binding.worldWidthMm/w-binding.pencilWidthMm)>1e-8)
    throw Error('preparation binding: pencil width must retain bound world size');
  const native = scaleLines(doc, w, h, { keepOrder: true });
  // Ordinals refer to raw JSON lines, including any invalid entries. Fail rather
  // than silently shifting the anatomical identity after filtering.
  if (native.length !== doc.lines.length) throw Error('preparation binding: invalid trace line');
  const seen = new Set(), selected = [];
  const basePressure = num('drawwant', num('tier1want', .6));
  for (const role of binding.roles) {
    if (!role.id || !role.instruction || !Array.isArray(role.paths)) throw Error('preparation binding: incomplete role');
    for (const path of role.paths) {
      const { ordinal, sourceOrdinal } = path;
      if (!Number.isInteger(ordinal) || !native[ordinal] || seen.has(ordinal)) throw Error(`preparation binding: invalid/duplicate ordinal ${ordinal}`);
      seen.add(ordinal);
      const line = native[ordinal];
      selected.push({ ...line, tier: 1, rank:2, preparationRole: role.id, sourceOrdinal, instruction: role.instruction,
        points: line.points.map(q => ({ x:q.x, y:q.y, s:basePressure*Math.max(0,Math.min(1,q.weight??line.weight??1)),
          ...(q.width == null ? {} : { nw:Math.max(num('drawwidthmin',.3),q.width*num('drawwidthgain',1.39)-num('drawwidthmargin',.42)) }) })) });
    }
  }
  log(`preparation binding: ${selected.length} registered paths, ${binding.roles.length} explicit roles; no sparse reranking`);
  return selected;
}
