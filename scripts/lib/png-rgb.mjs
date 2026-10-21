// Minimal PNG reader/writer on top of node:zlib (ARCHITECTURE §2 v5.0, ADR-43). Enough for the iOS assets:
// decode 8-bit non-interlaced PNGs (grey, grey+alpha, RGB, RGBA), composite them on an opaque background and
// write an RGB PNG without an alpha channel (App Store icons must not have alpha, M13-AC3). No dependency.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

/** CRC-32 as used by PNG chunks. */
export function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Parse the IHDR of a PNG buffer without decoding pixels (fast checks in tests). */
export function readPngHeader(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file (bad signature)');
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') throw new Error('not a PNG file (first chunk is not IHDR)');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
    compression: buffer[26],
    filter: buffer[27],
    interlace: buffer[28],
  };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decode an 8-bit, non-interlaced PNG. Returns `{ width, height, colorType, channels, data }` where `data` is the
 * unfiltered pixel array (row-major, `channels` bytes per pixel). Palette and 16-bit images are rejected.
 */
export function decodePng(buffer) {
  const header = readPngHeader(buffer);
  const { width, height, bitDepth, colorType, interlace } = header;
  const channels = CHANNELS[colorType];
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth} (only 8)`);
  if (channels === undefined) throw new Error(`unsupported PNG color type ${colorType} (palette images are not supported)`);
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported');

  const idat = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const start = offset + 8;
    if (type === 'IDAT') idat.push(buffer.subarray(start, start + length));
    if (type === 'IEND') break;
    offset = start + length + 4;
  }
  if (idat.length === 0) throw new Error('PNG has no IDAT chunk');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (raw.length !== expected) throw new Error(`PNG data length ${raw.length} does not match ${expected}`);
  const data = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = data.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      switch (filter) {
        case 0:
          break;
        case 1:
          v += a;
          break;
        case 2:
          v += b;
          break;
        case 3:
          v += (a + b) >> 1;
          break;
        case 4:
          v += paeth(a, b, c);
          break;
        default:
          throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
      out[i] = v & 0xff;
    }
    prev = out;
  }
  return { width, height, colorType, channels, data };
}

function chunk(type, payload) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), payload]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(payload.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/**
 * Encode an 8-bit non-interlaced PNG from raw pixels (`colorType` 0, 2, 4 or 6; `data` row-major). Rows use the
 * "Sub" filter (type 1) and zlib level 9 — deterministic: the same pixels always give the same bytes.
 */
export function encodePng({ width, height, colorType, data }) {
  const channels = CHANNELS[colorType];
  if (channels === undefined) throw new Error(`unsupported color type ${colorType}`);
  const stride = width * channels;
  if (data.length !== stride * height) throw new Error(`pixel data length ${data.length} does not match ${width}x${height}x${channels}`);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 1;
    const src = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? data[src + i - channels] : 0;
      raw[row + 1 + i] = (data[src + i] - left) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Parse `#RRGGBB` into `[r, g, b]`. */
export function parseHexColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`expected a #RRGGBB colour, got ${hex}`);
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Composite a decoded image on an opaque background colour and return RGB pixels (3 bytes per pixel).
 * Fully transparent pixels become the background; partially transparent ones are blended (straight alpha,
 * rounded to the nearest integer).
 */
export function flattenToRgb({ width, height, colorType, channels, data }, background) {
  const [br, bg, bb] = background;
  const out = new Uint8Array(width * height * 3);
  const hasAlpha = colorType === 4 || colorType === 6;
  const grey = colorType === 0 || colorType === 4;
  for (let p = 0, s = 0, d = 0; p < width * height; p += 1, s += channels, d += 3) {
    const r = data[s];
    const g = grey ? data[s] : data[s + 1];
    const b = grey ? data[s] : data[s + 2];
    const alpha = hasAlpha ? data[s + channels - 1] : 255;
    if (alpha === 255) {
      out[d] = r;
      out[d + 1] = g;
      out[d + 2] = b;
    } else {
      const a = alpha / 255;
      out[d] = Math.round(r * a + br * (1 - a));
      out[d + 1] = Math.round(g * a + bg * (1 - a));
      out[d + 2] = Math.round(b * a + bb * (1 - a));
    }
  }
  return out;
}

/** PNG buffer (any supported type) → PNG buffer, RGB 8-bit (color type 2), composited on `background` (`#RRGGBB`). */
export function toRgbPng(buffer, background) {
  const decoded = decodePng(buffer);
  const data = flattenToRgb(decoded, parseHexColor(background));
  return encodePng({ width: decoded.width, height: decoded.height, colorType: 2, data });
}

/** Bounding box of the pixels with alpha > 0 (`null` for a fully transparent image). Opaque images → whole image. */
export function opaqueBounds({ width, height, colorType, channels, data }) {
  if (colorType !== 4 && colorType !== 6) return { left: 0, top: 0, right: width - 1, bottom: height - 1 };
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * channels + channels - 1] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, top, right, bottom };
}
