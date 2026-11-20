// The painter's brush: every brush the painter makes is the section brush (src/media/tuft-section.mjs) unless a plan
// names the CPU tuft. A brush that names no model, or the old row model, is made as a section brush; its numbers are
// physical already, so the per-width density scaling and the GPU hair cap the row brush needed do not apply to it.
export const painterBrushOptions = o => (o?.model === undefined || o.model === 'row' ? { ...o, model: 'section' } : o);
export const isSection = o => o?.model === 'section';
