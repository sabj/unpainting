// The CPU sheet's flow, pores and scour now run in physical time (src/media/flow-time.mjs: flow iterations and their
// share of a step from dt and the cell size, pore passes split rather than clipped, scour per mm of travel, the step
// split into chunks of dt 2, permeability scaled by the relief, advection at the donor's concentration). The WGSL has
// not been ported (stepfull.wgsl faces, wsc, pflux_k, ppout and apply_g; cap_s, cap_p and cap_sp; dep_k; and the step
// loop in gpu/stepfull.mjs), so the GPU parity tests run and report as todo until it is.
export const GPU_PORT_TODO = 'GPU port of the physical-time flow, pores and scour (flow-time.mjs) pending';
//
// claude/033-film changes the CPU formulas the GPU mirrors (not yet ported; the parity tests above stay todo):
// - film-level.mjs (new, before the box step in sheet.mjs stepCpu): the glossy film levels by an implicit thin-film
//   solve, conductance level * (rho g / 3 mu) h^3 dt / dx^2 on each face between wet cells (h the faces' mean depth),
//   surface = W + slope height - tilt . position (sheet.tilt from setTilt, the sine of the board's angle along x and y)
//   + the meniscus lowering (meniscus x (meniscusMm - distance to the dry side) within meniscusMm). Water and pigment
//   then move along the solved face fluxes in substeps (95% donor budgets). DEFAULTS level 1, meniscus 0.05,
//   meniscusMm 0.5. The GPU sheet has no tilt either.
// - sheet.mjs phase 3 and sheet-kernel.mjs phaseS3: the hold cap strands only in a film thinner than o.holdDepth
//   (DEFAULTS 0.01 mm): stepfull.wgsl lines with `u.holdCap * Wi` need `Wi < u.holdDepth`, and link.mjs OPT_KEYS
//   needs 'holdDepth', 'level', 'meniscus', 'meniscusMm' and 'fillRef'.
// - sheet.mjs slideFillFor: a box whose mean deposit (with the fixed bed) is above DEFAULTS.fillRef (0.3) fills its
//   hollows by slideFill x fillRef / mean (the step reads o.slideFillNow; sheet-par passes it as `fill`).
// - tuft-section.mjs exchangeCell step 3 (the section brush's pore pull, CPU only today): a loaded lane's free head
//   pushes through the sizing at 1 - SIZING and a standing film shields the pores at TUFT.poreFilm (0.03 mm).
