// The per-pixel projected-gradient unmix of pigments.mjs for pixels i0..i1 - 1, so the thread pool can split pixels.
// Pixels are independent, so output matches the serial run. No imports: the workers load it.
//   D: density per channel (3 a pixel); A: amounts (k a pixel); Gf: the k x k Gram matrix; P0..P2: each pigment's channels.
export function unmixRange(D, A, k, Gf, P0, P1, P2, L, iterations, i0, i1) {
  // x stays a Float32Array so every update rounds where it always did; the sums are doubles in the same order
  const x = new Float32Array(k), bvec = new Float64Array(k);
  for (let i = i0; i < i1; i++) {
    const d0 = D[i * 3], d1 = D[i * 3 + 1], d2 = D[i * 3 + 2];
    for (let j = 0; j < k; j++) { x[j] = 0; bvec[j] = P0[j] * d0 + P1[j] * d1 + P2[j] * d2; }
    for (let it = 0; it < iterations; it++) for (let j = 0; j < k; j++) { let g = -bvec[j]; const r = j * k; for (let q = 0; q < k; q++) g += Gf[r + q] * x[q]; x[j] = Math.max(0, x[j] - g / L); }
    for (let j = 0; j < k; j++) A[i * k + j] = x[j];
  }
}
