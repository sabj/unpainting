// Animated WebP from saved frames, held under a byte cap. Frames are cropped, resized and encoded unchanged: no
// blending or recolouring. If the file is over the cap the quality steps down, then every other frame is dropped
// (its time on screen goes to the frame kept); a file more than twice the cap drops frames first.
import fs from 'node:fs';
import sharp from 'sharp';

// The box around every pixel that differs from the background in any frame, padded and kept inside the frame.
export async function contentBox(files, { background, tolerance = 12, pad = 16 } = {}) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, size = null;
  for (const file of files) {
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    size ??= { width: info.width, height: info.height };
    const bg = background ?? [data[0], data[1], data[2]];
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) <= tolerance) continue;
      if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
    }
  }
  if (!size || right < left) throw new Error('contentBox: every frame is background');
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  return { left, top, width: Math.min(size.width, right + pad + 1) - left, height: Math.min(size.height, bottom + pad + 1) - top };
}

// files: frame images in order. delays: ms per frame (a number, or one per frame).
export async function encodeAnimation(files, out, { width, crop = null, delays = 100, maxBytes = 1_000_000, quality = 80, minQuality = 40, loop = 0 } = {}) {
  if (!files.length) throw new Error('encodeAnimation: no frames');
  let frames = files.map((file, i) => ({ file, ms: Array.isArray(delays) ? delays[i] : delays }));
  const raw = new Map();
  const load = async file => {
    if (!raw.has(file)) {
      let image = sharp(file);
      if (crop) image = image.extract(crop);
      raw.set(file, await image.resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
    }
    return raw.get(file);
  };
  for (;;) {
    const decoded = await Promise.all(frames.map(f => load(f.file)));
    const { width: w, height: h } = decoded[0].info;
    const stack = Buffer.concat(decoded.map(d => d.data));
    for (let q = quality; q >= minQuality; q -= 8) {
      const buffer = await sharp(stack, { raw: { width: w, height: h * frames.length, channels: 4, pageHeight: h } })
        .webp({ quality: q, effort: 4, loop, delay: frames.map(f => f.ms) }).toBuffer();
      if (buffer.length <= maxBytes) {
        fs.writeFileSync(out, buffer);
        return { bytes: buffer.length, quality: q, frames: frames.length, width: w, height: h };
      }
      if (buffer.length > 2 * maxBytes) break; // far over: lower quality alone will not do
    }
    if (frames.length < 4) throw new Error(`encodeAnimation: ${out} stays over ${maxBytes} bytes`);
    // Drop every other frame; the one kept stays on screen for both.
    frames = frames.filter((_, i) => i % 2 === 0).map((f, k) => ({ ...f, ms: f.ms + (frames[2 * k + 1]?.ms ?? 0) }));
  }
}
