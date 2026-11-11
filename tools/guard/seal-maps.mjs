// Every map made from the target, sealed for the paint step (tools/guard/no-target.mjs).
//
// The painter plans from the target freely. From TARGET_GUARD.beginPaint() to the end of painting nothing may read the
// target's pixels or any per-cell map computed from them; a look (guard.look) gets shape means only. pen.mjs seals the
// target and its value-plan maps (px, D_SOURCE, A, AL, SRC, G). The maps below are made from the target too, in other
// stages, and stayed open: sealTargetMaps closes them on ctx at beginPaint, and the stages that keep a map in a closure
// seal it where they make it (sealAtBirth). Then a cell read while painting is blocked (gentle, hard) or logged (warn),
// in default and strict runs alike, and assertCleanContext refuses a raw target map still handed on through ctx.

// per-cell maps on ctx, with what each is made from
export const TARGET_MAPS = Object.freeze({
  PX_RAW: 'the target pixels',
  PX_SOURCE: 'the target pixels the separator reads',
  D_AIM: 'the styled target density',
  HP: 'a high-pass of the target density',
  TARGET_DRAW_EDGE: 'the target luminance edge strength on the pen grid',
  SKY_WARM_RB: 'the target red minus blue (--skywarm)',
  DRAW_DENSITY: 'the target density the drawing reads',
});
// objects on ctx whose typed-array fields are per-cell maps of the target
export const TARGET_MAP_HOLDERS = Object.freeze({
  SEP: 'the separation of the target into ink and wash',
  MOD: 'the modulation fields fitted to the target',
  FINE: 'the fine-scale target density',
});

const isMap = v => ArrayBuffer.isView(v) && !(v instanceof DataView) && v.length > 0;

/** Seal one map where a stage makes it, so a closure that keeps it is closed too. Returns the map or its sealed view. */
export function sealAtBirth(guard, name, arr) {
  if (!Object.hasOwn(TARGET_MAPS, name)) throw new Error(`seal-maps: ${name} is not a listed target map`);
  return guard && guard.mode !== 'off' && isMap(arr) ? guard.seal(name, arr) : arr;
}

/** At beginPaint: seal every listed target map on ctx and every map field of the holders. Returns the sealed names. */
export function sealTargetMaps(guard, ctx) {
  if (!guard || guard.mode === 'off') return [];
  const sealed = [];
  for (const k of Object.keys(TARGET_MAPS)) if (isMap(ctx[k])) { ctx[k] = guard.seal(k, ctx[k]); sealed.push(k); }
  for (const k of Object.keys(TARGET_MAP_HOLDERS)) {
    const o = ctx[k];
    if (!o || typeof o !== 'object' || ArrayBuffer.isView(o)) continue;
    for (const [f, v] of Object.entries(o)) if (isMap(v)) { o[f] = guard.seal(`${k}.${f}`, v); sealed.push(`${k}.${f}`); }
  }
  return sealed;
}
