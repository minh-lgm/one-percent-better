// M15-AC9 (static part): the committed App Store screenshots — 5 per locale, JPEG, 1320 × 2868, < 8 MB — and the
// JPEG reader itself. `npm run store:screenshots` regenerates them (store/screenshots.spec.ts asserts the same).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jpegInfo } from './jpeg';

const root = join(process.cwd(), 'store', 'ios', 'screenshots');
export const SCREENSHOT_FILES = ['01-today.jpg', '02-timer.jpg', '03-curve.jpg', '04-review.jpg', '05-goals.jpg'] as const;
export const SCREENSHOT_SIZE = { width: 1320, height: 2868 } as const;

describe('jpegInfo', () => {
  it('reads SOI and the SOF0 / SOF2 frame size; rejects non-JPEG bytes', () => {
    // SOI, APP0 (length 16), SOF0 with height 2868 × width 1320, SOS.
    const sof0 = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x0b, 0x34, 0x05, 0x28, 0x03, 0xff, 0xda]);
    expect(jpegInfo(sof0)).toEqual({ width: 1320, height: 2868, jpeg: true });
    const sof2 = Uint8Array.from([0xff, 0xd8, 0xff, 0xc2, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03, 0xff, 0xda]);
    expect(jpegInfo(sof2)).toEqual({ width: 32, height: 16, jpeg: true });
    expect(jpegInfo(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]))).toEqual({ width: 0, height: 0, jpeg: false });
    // DHT (C4) before SOF is skipped, not mistaken for a frame header.
    const dhtFirst = Uint8Array.from([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x04, 0x01, 0xff, 0xda]);
    expect(jpegInfo(dhtFirst)).toEqual({ width: 4, height: 2, jpeg: true });
  });
});

describe.each(['en-US', 'vi'] as const)('store/ios/screenshots/%s (M15-AC9)', (locale) => {
  const dir = join(root, locale);
  const present = existsSync(dir);

  it('exactly the 5 DESIGN 7.8.8 files, each a 1320 × 2868 JPEG under 8 MB', () => {
    // The screenshots are committed; `npm run store:screenshots` regenerates them.
    expect(present, `run npm run store:screenshots to create ${dir}`).toBe(true);
    expect(readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort()).toEqual([...SCREENSHOT_FILES]);
    for (const file of SCREENSHOT_FILES) {
      const path = join(dir, file);
      const info = jpegInfo(new Uint8Array(readFileSync(path)));
      expect(info.jpeg, file).toBe(true);
      expect({ width: info.width, height: info.height }, file).toEqual(SCREENSHOT_SIZE);
      expect(statSync(path).size, file).toBeLessThan(8 * 1024 * 1024);
      expect(statSync(path).size, file).toBeGreaterThan(10 * 1024);
    }
  });
});
