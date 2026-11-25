// The film's frame files: their names, their format and how each is written.
// A film that is switched on (--video 1) is kept lossless, so a player that steps through the frames shows the sheet
// as the painter rendered it: lossless WebP where sharp can write it, else PNG. With the film off the few checkpoint
// frames stay JPEG, as before. The format is carried by the file's extension, so the painter's own thread and the
// frame worker write the same file for the same name.

/** A frame file of any format a painting may hold. */
export const FRAME_FILE = /^f\d+\.(jpg|png|webp)$/;

/** 'webp' | 'png' for a film, 'jpg' otherwise. `webp`: whether sharp can write WebP here (sharp.format.webp.output.file). */
export function frameFormat(film, webp = true) {
  return film ? (webp ? 'webp' : 'png') : 'jpg';
}

/** f0000.jpg, f0001.webp, ... */
export function frameName(index, format = 'jpg') {
  return `f${String(index).padStart(4, '0')}.${format}`;
}

/** The sharp pipeline `image` with the encoder its file name asks for. `quality` is the JPEG's. */
export function encodeFrame(image, name, quality = 88) {
  if (name.endsWith('.webp')) return image.webp({ lossless: true });
  if (name.endsWith('.png')) return image.png();
  return image.jpeg({ quality });
}
