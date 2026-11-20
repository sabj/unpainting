// The CPU sheet's flow, pores and scour now run in physical time (src/media/flow-time.mjs: flow iterations and their
// share of a step from dt and the cell size, pore passes split rather than clipped, scour per mm of travel, the step
// split into chunks of dt 2, permeability scaled by the relief, advection at the donor's concentration). The WGSL has
// not been ported (stepfull.wgsl faces, wsc, pflux_k, ppout and apply_g; cap_s, cap_p and cap_sp; dep_k; and the step
// loop in gpu/stepfull.mjs), so the GPU parity tests run and report as todo until it is.
export const GPU_PORT_TODO = 'GPU port of the physical-time flow, pores and scour (flow-time.mjs) pending';
