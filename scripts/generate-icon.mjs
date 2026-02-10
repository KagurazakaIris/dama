import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'resources');

const size = 512;

// Blue gradient shield with "D" letter
const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4285f4"/>
      <stop offset="100%" stop-color="#1a53c8"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="90" fill="url(#bg)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="central"
    fill="white" font-family="Arial,Helvetica,sans-serif" font-size="320" font-weight="bold">D</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, 'icon.png'));
console.log('Generated resources/icon.png (512x512)');

// Also generate a 16x16 version for tray
await sharp(Buffer.from(svg)).resize(16, 16).png().toFile(path.join(outDir, 'tray-icon.png'));
console.log('Generated resources/tray-icon.png (16x16)');
