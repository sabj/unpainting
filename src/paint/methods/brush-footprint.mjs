// Brush sizes in mm from the brush file (src/paint/brushes.json), for rules stated at a brush's scale.
import fs from 'node:fs';
import path from 'node:path';

/** Area in mm2 of one touch of a round brush whose belly is widthMm wide. */
export function footprintMm2(widthMm) {
  if (!(widthMm > 0)) throw new Error(`brush footprint: width must be positive, got ${widthMm}`);
  return Math.PI * (widthMm / 2) ** 2;
}

/** A brush role's belly width in mm from the brush file (or the brush named instead). Throws when it is missing. */
export function roleBrushMm(root, role, { brushes = 'src/paint/brushes.json', name = '' } = {}) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, brushes), 'utf8'));
  const k = name || cfg.roles?.[role], b = cfg.brushes?.[k];
  if (!(b?.width_mm > 0)) throw new Error(`no ${role} brush width (${k}) in ${brushes}`);
  return b.width_mm;
}
