import sharp from 'sharp';

const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const WEBP_QUALITY = 82;

/**
 * Validates, resizes, and converts an uploaded image to WebP.
 */
export async function optimizeImage(input: Buffer): Promise<Buffer> {
  const image = sharp(input, { limitInputPixels: 25_000_000 });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format ?? '')) {
    throw new Error('Unsupported image format.');
  }

  return image
    .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}
