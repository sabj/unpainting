// Generated from src/media/film-accuracy.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// Both film solvers stop at the same relative L2 residual. The matrix includes the identity, so its smallest
// eigenvalue is at least one: the absolute L2 error in the surface change is bounded by the remaining residual.
// 1e-12 keeps CPU/GPU cellwise parity across both film-level and 120-step edge-feed fixtures.
export const FILM_RESIDUAL_SQUARED = 1e-12;
