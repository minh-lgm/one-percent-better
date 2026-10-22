// Minimal JPEG inspection for the App Store screenshots (M15-AC9): SOI marker + the frame size from the first
// SOF marker. No dependency; shared by the screenshot spec and the static test.

export interface JpegInfo {
  width: number;
  height: number;
  /** `true` when the first two bytes are the SOI marker FF D8. */
  jpeg: boolean;
}

export function jpegInfo(data: Uint8Array): JpegInfo {
  const jpeg = data.length > 4 && data[0] === 0xff && data[1] === 0xd8;
  if (!jpeg) return { width: 0, height: 0, jpeg };
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    // Standalone markers (no length): FF01, FFD0 … FFD7, padding FF.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (data[offset + 2] << 8) | data[offset + 3];
    // SOF0 … SOF15 except DHT (C4), JPG (C8), DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (data[offset + 5] << 8) | data[offset + 6];
      const width = (data[offset + 7] << 8) | data[offset + 8];
      return { width, height, jpeg };
    }
    if (marker === 0xda) break; // start of scan: no SOF found before the image data
    offset += 2 + length;
  }
  return { width: 0, height: 0, jpeg };
}
