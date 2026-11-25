// Brush sizes in mm from the brush file (src/paint/brushes.json), for rules stated at a brush's scale.
import fs from 'node:fs';
import path from 'node:path';


/** A brush role's belly width in mm from the brush file (or the brush named instead). Throws when it is missing. */
export function roleBrushMm(root, role, { brushes = 'src/paint/brushes.json', name = '' } = {}) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, brushes), 'utf8'));
  const k = name || cfg.roles?.[role], b = cfg.brushes?.[k];
  if (!(b?.width_mm > 0)) throw new Error(`no ${role} brush width (${k}) in ${brushes}`);
  return b.width_mm;
}

/** A brush role's point width in mm: the narrowest line it lays at light pressure (brushes.json point_width_mm). Throws when it is missing. */
export function roleBrushPointMm(root, role, { brushes = 'src/paint/brushes.json', name = '' } = {}) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, brushes), 'utf8'));
  const k = name || cfg.roles?.[role], b = cfg.brushes?.[k];
  if (!(b?.point_width_mm > 0)) throw new Error(`no ${role} brush point width (${k}) in ${brushes}`);
  return b.point_width_mm;
}

/** The belly widths in mm of the brushes a wash is laid with: every water brush of the kit at least as wide as the shape brush, widest first. */
export function washKitMm(root, { brushes = 'src/paint/brushes.json' } = {}) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, brushes), 'utf8')), least = roleBrushMm(root, 'shape', { brushes });
  return Object.values(cfg.brushes).filter(b => b.water_ml > 0 && !b.pigment && b.width_mm >= least).map(b => b.width_mm).sort((a, b) => b - a);
}
