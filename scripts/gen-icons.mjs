// Generates the PWA icons (PNG) without any dependency. Run: npm run icons
// Draws the brand mark: primary green rounded square with a white rising line.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRIMARY = [0x1f, 0x7a, 0x4d];
const WHITE = [0xff, 0xff, 0xff];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
};

function png(size, pixelFn) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
};

/** Mark: rising line from bottom-left to top-right with a dot, inside padding. */
function markPixel(x, y, size, pad) {
  const inner = size - 2 * pad;
  const ax = pad + inner * 0.22, ay = pad + inner * 0.72;
  const mx = pad + inner * 0.48, my = pad + inner * 0.5;
  const bx = pad + inner * 0.78, by = pad + inner * 0.28;
  const w = inner * 0.075;
  const onLine = Math.min(dist(x, y, ax, ay, mx, my), dist(x, y, mx, my, bx, by)) <= w;
  const onDot = Math.hypot(x - bx, y - by) <= inner * 0.11;
  return onLine || onDot;
}

function iconPixel(size, maskable) {
  const radius = maskable ? 0 : size * 0.22;
  const pad = maskable ? size * 0.2 : size * 0.16;
  return (x, y) => {
    const cx = Math.min(Math.max(x + 0.5, radius), size - radius);
    const cy = Math.min(Math.max(y + 0.5, radius), size - radius);
    const insideRounded = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius;
    if (!insideRounded) return [0, 0, 0, 0];
    return markPixel(x + 0.5, y + 0.5, size, pad) ? [...WHITE, 255] : [...PRIMARY, 255];
  };
}

mkdirSync(join(root, 'public', 'icons'), { recursive: true });
writeFileSync(join(root, 'public', 'icons', 'pwa-192.png'), png(192, iconPixel(192, false)));
writeFileSync(join(root, 'public', 'icons', 'pwa-512.png'), png(512, iconPixel(512, false)));
writeFileSync(join(root, 'public', 'icons', 'pwa-maskable-512.png'), png(512, iconPixel(512, true)));
writeFileSync(join(root, 'public', 'apple-touch-icon.png'), png(180, iconPixel(180, true)));
console.log('icons written to public/');
