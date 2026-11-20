// Physical-time scheduling, relief permeability, upwind transport, pore subcycles and scour
// have a source port, but no GPU adapter was available to validate shader compilation or parity.
// Keep the existing parity tolerances and TODOs until both execution paths pass on hardware.
export const GPU_PORT_TODO = 'Physical-time GPU port awaits hardware compilation and CPU/GPU parity verification';
