import type Sharp from 'sharp';
import type { MosaicRegion } from '../shared/types';

// Lazy-load sharp so that native module DLL paths can be configured
// before the native binding is loaded (critical on Windows).
let _sharp: typeof Sharp | null = null;

function getSharp(): typeof Sharp {
  if (!_sharp) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _sharp = require('sharp') as typeof Sharp;
  }
  return _sharp;
}

/**
 * Apply solid color fill to the specified regions.
 * Uses opaque black blocks to prevent ML-based recovery (unlike pixel
 * mosaic or gaussian blur which can be reversed).
 */
export async function applyMosaic(
  imagePath: string,
  regions: MosaicRegion[],
  _blockSize = 10,
): Promise<Buffer> {
  const sharp = getSharp();
  const enabledRegions = regions.filter(r => r.enabled);
  if (enabledRegions.length === 0) {
    return sharp(imagePath).png().toBuffer();
  }

  const metadata = await sharp(imagePath).metadata();
  const imgWidth = metadata.width!;
  const imgHeight = metadata.height!;

  const composites: Sharp.OverlayOptions[] = [];

  for (const region of enabledRegions) {
    // Clamp region to image bounds
    const x = Math.max(0, Math.round(region.x));
    const y = Math.max(0, Math.round(region.y));
    const w = Math.min(Math.round(region.width), imgWidth - x);
    const h = Math.min(Math.round(region.height), imgHeight - y);

    if (w <= 0 || h <= 0) continue;

    // Create a solid black rectangle
    const fillBuffer = await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 255 },
      },
    }).png().toBuffer();

    composites.push({
      input: fillBuffer,
      left: x,
      top: y,
    });
  }

  return sharp(imagePath)
    .composite(composites)
    .png()
    .toBuffer();
}
