import sharp from 'sharp';
import type { MosaicRegion } from '../shared/types';

export async function applyMosaic(
  imagePath: string,
  regions: MosaicRegion[],
  blockSize = 10,
): Promise<Buffer> {
  const enabledRegions = regions.filter(r => r.enabled);
  if (enabledRegions.length === 0) {
    return sharp(imagePath).png().toBuffer();
  }

  const metadata = await sharp(imagePath).metadata();
  const imgWidth = metadata.width!;
  const imgHeight = metadata.height!;

  const composites: sharp.OverlayOptions[] = [];

  for (const region of enabledRegions) {
    // Clamp region to image bounds
    const x = Math.max(0, Math.round(region.x));
    const y = Math.max(0, Math.round(region.y));
    const w = Math.min(Math.round(region.width), imgWidth - x);
    const h = Math.min(Math.round(region.height), imgHeight - y);

    if (w <= 0 || h <= 0) continue;

    // Extract region, scale down then scale up to create mosaic effect
    const smallW = Math.max(1, Math.round(w / blockSize));
    const smallH = Math.max(1, Math.round(h / blockSize));

    const mosaicBuffer = await sharp(imagePath)
      .extract({ left: x, top: y, width: w, height: h })
      .resize(smallW, smallH, { kernel: sharp.kernel.nearest })
      .resize(w, h, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();

    composites.push({
      input: mosaicBuffer,
      left: x,
      top: y,
    });
  }

  return sharp(imagePath)
    .composite(composites)
    .png()
    .toBuffer();
}
