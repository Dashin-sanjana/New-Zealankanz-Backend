import sharp from 'sharp';
import { rename, unlink } from 'fs/promises';
import { extname, join, dirname } from 'path';

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const WEBP_QUALITY = 82;

/**
 * Resizes and converts an uploaded image to WebP in-place.
 * Returns the new filename (with .webp extension).
 */
export async function optimizeImage(filePath: string): Promise<string> {
  const dir = dirname(filePath);
  const base = filePath.replace(extname(filePath), '');
  const webpPath = `${base}.webp`;

  await sharp(filePath)
    .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(webpPath);

  // Remove original if it had a different extension
  if (webpPath !== filePath) {
    await unlink(filePath).catch(() => null);
  }

  return webpPath;
}
