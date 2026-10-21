// M13-AC3 (unit `png-rgb`): RGBA → RGB compositing, round trip through the module's own decoder, determinism.
import { describe, expect, it } from 'vitest';
import { crc32, decodePng, encodePng, flattenToRgb, opaqueBounds, parseHexColor, readPngHeader, toRgbPng } from './png-rgb.mjs';

/** 2×2 RGBA: (0,0) fully transparent red, (1,0) half-transparent blue, (0,1) opaque green, (1,1) 25 % white. */
const RGBA_2X2 = Uint8Array.from([
  255, 0, 0, 0,     0, 0, 255, 128,
  0, 255, 0, 255,   255, 255, 255, 64,
]);

describe('png-rgb', () => {
  it('crc32 matches the PNG reference value for "IEND"', () => {
    expect(crc32(Buffer.from('IEND', 'latin1'))).toBe(0xae426082);
  });

  it('encodes an RGBA 2×2 PNG that its own decoder reads back exactly', () => {
    const png = encodePng({ width: 2, height: 2, colorType: 6, data: RGBA_2X2 });
    expect(readPngHeader(png)).toMatchObject({ width: 2, height: 2, bitDepth: 8, colorType: 6, interlace: 0 });
    const back = decodePng(png);
    expect(back.channels).toBe(4);
    expect(Array.from(back.data)).toEqual(Array.from(RGBA_2X2));
  });

  it('flattens on #FFFFFF: transparent → background, half-transparent blended (±1 per channel), opaque untouched', () => {
    const rgb = flattenToRgb(decodePng(encodePng({ width: 2, height: 2, colorType: 6, data: RGBA_2X2 })), parseHexColor('#FFFFFF'));
    const px = (i) => Array.from(rgb.subarray(i * 3, i * 3 + 3));
    expect(px(0)).toEqual([255, 255, 255]);
    const half = px(1);
    // 128/255 blue over white: r = g = 255·(1 − 0.502) ≈ 127, b = 255.
    expect(Math.abs(half[0] - 127)).toBeLessThanOrEqual(1);
    expect(Math.abs(half[1] - 127)).toBeLessThanOrEqual(1);
    expect(half[2]).toBe(255);
    expect(px(2)).toEqual([0, 255, 0]);
    expect(px(3)).toEqual([255, 255, 255]);
  });

  it('toRgbPng returns an RGB (color type 2, no alpha) PNG of the same size, deterministically', () => {
    const src = encodePng({ width: 2, height: 2, colorType: 6, data: RGBA_2X2 });
    const a = toRgbPng(src, '#121513');
    const b = toRgbPng(src, '#121513');
    expect(a.equals(b)).toBe(true);
    const header = readPngHeader(a);
    expect(header).toMatchObject({ width: 2, height: 2, bitDepth: 8, colorType: 2 });
    const back = decodePng(a);
    expect(back.channels).toBe(3);
    expect(Array.from(back.data.subarray(0, 3))).toEqual([0x12, 0x15, 0x13]);
  });

  it('decodes grey, grey+alpha and RGB too; rejects palette / 16-bit / interlaced / non-PNG input', () => {
    const grey = encodePng({ width: 2, height: 1, colorType: 0, data: Uint8Array.from([10, 200]) });
    expect(flattenToRgb(decodePng(grey), [0, 0, 0])).toEqual(Uint8Array.from([10, 10, 10, 200, 200, 200]));
    const greyA = encodePng({ width: 1, height: 1, colorType: 4, data: Uint8Array.from([0, 0]) });
    expect(flattenToRgb(decodePng(greyA), [9, 8, 7])).toEqual(Uint8Array.from([9, 8, 7]));
    const rgb = encodePng({ width: 1, height: 1, colorType: 2, data: Uint8Array.from([1, 2, 3]) });
    expect(flattenToRgb(decodePng(rgb), [9, 8, 7])).toEqual(Uint8Array.from([1, 2, 3]));

    const palette = Buffer.from(rgb);
    palette[25] = 3;
    expect(() => decodePng(palette)).toThrow(/color type 3/);
    const sixteen = Buffer.from(rgb);
    sixteen[24] = 16;
    expect(() => decodePng(sixteen)).toThrow(/bit depth 16/);
    const interlaced = Buffer.from(rgb);
    interlaced[28] = 1;
    expect(() => decodePng(interlaced)).toThrow(/interlaced/);
    expect(() => readPngHeader(Buffer.from('not a png at all, really not'))).toThrow(/signature/);
    expect(() => encodePng({ width: 2, height: 2, colorType: 2, data: new Uint8Array(5) })).toThrow(/length/);
  });

  it('opaqueBounds: bounding box of alpha > 0; null when fully transparent; whole image when there is no alpha', () => {
    const img = decodePng(encodePng({ width: 2, height: 2, colorType: 6, data: RGBA_2X2 }));
    expect(opaqueBounds(img)).toEqual({ left: 0, top: 0, right: 1, bottom: 1 });
    const corner = decodePng(encodePng({ width: 3, height: 3, colorType: 6, data: new Uint8Array(36).fill(0).map((_, i) => (i === 8 * 4 + 3 ? 255 : 0)) }));
    expect(opaqueBounds(corner)).toEqual({ left: 2, top: 2, right: 2, bottom: 2 });
    expect(opaqueBounds(decodePng(encodePng({ width: 2, height: 1, colorType: 6, data: new Uint8Array(8) })))).toBeNull();
    expect(opaqueBounds(decodePng(encodePng({ width: 2, height: 1, colorType: 2, data: new Uint8Array(6) })))).toEqual({ left: 0, top: 0, right: 1, bottom: 0 });
  });

  it('parseHexColor accepts #RRGGBB (any case) and rejects anything else', () => {
    expect(parseHexColor('#F7F6F2')).toEqual([0xf7, 0xf6, 0xf2]);
    expect(parseHexColor('121513')).toEqual([0x12, 0x15, 0x13]);
    expect(() => parseHexColor('#fff')).toThrow(/RRGGBB/);
  });
});
