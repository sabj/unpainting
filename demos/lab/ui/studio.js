// Studio controls use the same physical brush settings as hand-painted strokes.
export const BRUSH_PRESETS = Object.freeze({
  wash: { label: 'Wash', tool: 'flat', sizeMm: 24, water: 2.4, amount: .45, pressure: .7 },
  glaze: { label: 'Glaze', tool: 'round', sizeMm: 14, water: 1.6, amount: .25, pressure: .75 },
  dry: { label: 'Dry brush', tool: 'flat', sizeMm: 16, water: .35, amount: .75, pressure: .55 },
  detail: { label: 'Detail', tool: 'round', sizeMm: 3, water: .9, amount: .85, pressure: .85 },
});

export function studioShortcut(e) {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.target?.closest('input,select,textarea,[contenteditable]')) return null;
  const digit = /^Digit[0-9]$/.test(e.code) ? Number(e.code.slice(-1)) : /^[0-9]$/.test(e.key) ? Number(e.key) : null;
  if (e.shiftKey && digit >= 1 && digit <= 4) return { preset: Object.keys(BRUSH_PRESETS)[digit - 1] };
  if (e.shiftKey && e.key.toLowerCase() === 'd') return { action: 'dry-layer' };
  if (e.shiftKey && digit != null) return null;
  if (digit === 0) return { action: 'reset-view' };
  if (digit >= 1 && digit <= 9) return { pigment: digit - 1 };
  const tool = { r: 'round', f: 'flat', w: 'water', i: 'pen', p: 'pencil', d: 'dryer' }[e.key.toLowerCase()];
  if (tool) return { tool };
  const action = { x: 'redip', h: 'focus-view' }[e.key.toLowerCase()];
  if (action) return { action };
  if (e.key === '[' || e.key === ']') return { resize: e.key === '[' ? -.5 : .5 };
  return null;
}

// Worker load is mass, not a percentage. Compare it with the freshest observed
// charge of this dip; no brush capacity or physics is guessed in the UI.
export function createChargeMeter() {
  let water = 0, pigment = 0;
  return {
    reset() { water = pigment = 0; },
    update(load) {
      if (!load) return { water: 0, pigment: 0, text: 'Paint a stroke to see the brush charge' };
      water = Math.max(water, load.water); pigment = Math.max(pigment, load.pigment);
      return { water: water ? Math.max(0, load.water / water) : 0, pigment: pigment ? Math.max(0, load.pigment / pigment) : 0,
        text: `Water ${load.water.toFixed(1)} · paint ${load.pigment.toFixed(1)} remaining` };
    },
  };
}

export function engineLabel(physics, dpi, lagMs) {
  if (physics === 'pending') return 'Starting engine…';
  const name = physics === 'webgpu' ? 'WebGPU' : 'CPU';
  return `${name} · ${Number((25.4 / dpi).toFixed(3))} mm${Number.isFinite(lagMs) ? ` · ${Math.round(lagMs)} ms` : ''}`;
}
