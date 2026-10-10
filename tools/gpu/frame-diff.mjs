// Mean and share of pixels over 2 levels between the numbered frames of two runs: where do they first part company?
//   node tools/gpu/frame-diff.mjs <run dir a> <run dir b>
import fs from 'node:fs';
import sharp from 'sharp';

const [a, b] = process.argv.slice(2);
const frames = fs.readdirSync(a).filter(f => /^f\d+\.jpg$/.test(f)).sort();
for (const f of frames) {
  if (!fs.existsSync(`${b}/${f}`)) continue;
  const A = await sharp(`${a}/${f}`).removeAlpha().raw().toBuffer({ resolveWithObject: true }), B = await sharp(`${b}/${f}`).removeAlpha().raw().toBuffer();
  const n = A.data.length; let sum = 0, over = 0;
  for (let i = 0; i < n; i += 3) { let m = 0; for (let c = 0; c < 3; c++) { const d = Math.abs(A.data[i + c] - B[i + c]); sum += d; if (d > m) m = d; } if (m > 2) over++; }
  console.log(f, 'mean', (sum / n).toFixed(4), 'over2', (100 * over / (n / 3)).toFixed(3) + '%');
}
