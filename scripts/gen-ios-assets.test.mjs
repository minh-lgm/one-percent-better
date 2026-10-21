// M13-AC3/AC4 at pixel level: the committed icon and launch images were produced by gen-ios-assets.mjs from the
// DESIGN v5.0 "Native shell" spec — background colour in the corners, logo kept inside the centred box, and the
// white tile of the dark splash. Runs without Playwright or the logo (it only reads the committed PNGs).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fitLogo, SPECS } from './gen-ios-assets.mjs';
import { decodePng, parseHexColor } from './lib/png-rgb.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (file) => file.slice(root.length + 1).replace(/\\/g, '/');

function pixel(img, x, y) {
  const i = (y * img.width + x) * img.channels;
  return Array.from(img.data.subarray(i, i + 3));
}

/** Is (x, y) inside the rounded rectangle `box` (corner radius `radius`)? */
function insideRoundedRect(x, y, box, radius) {
  if (x < box.left || x > box.right || y < box.top || y > box.bottom) return false;
  const cx = x < box.left + radius ? box.left + radius : x > box.right - radius ? box.right - radius : x;
  const cy = y < box.top + radius ? box.top + radius : y > box.bottom - radius ? box.bottom - radius : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/**
 * Bounding box of the pixels that differ from `background` (the logo, or the tile on the dark splash), optionally
 * restricted to the pixels for which `within(x, y)` is true.
 */
function nonBackgroundBounds(img, background, tolerance = 2, within = () => true) {
  let left = img.width;
  let top = img.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (!within(x, y)) continue;
      const i = (y * img.width + x) * img.channels;
      if (Math.abs(img.data[i] - background[0]) > tolerance || Math.abs(img.data[i + 1] - background[1]) > tolerance || Math.abs(img.data[i + 2] - background[2]) > tolerance) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}

describe('fitLogo', () => {
  it('scales the opaque box to fit `box` keeping the ratio and centres it on the canvas', () => {
    const fit = fitLogo({ left: 10, top: 20, right: 109, bottom: 69 }, 820, 1024); // 100×50
    expect(fit).toEqual({ sx: 10, sy: 20, sw: 100, sh: 50, dw: 820, dh: 410, dx: 102, dy: 307 });
    const tall = fitLogo({ left: 0, top: 0, right: 49, bottom: 99 }, 500, 2732); // 50×100
    expect(tall.dh).toBe(500);
    expect(tall.dw).toBe(250);
    expect(tall.dx).toBe((2732 - 250) / 2);
  });
});

describe('committed iOS assets match the SPECS of gen-ios-assets.mjs', () => {
  for (const spec of SPECS) {
    describe(rel(spec.file), () => {
      const img = decodePng(readFileSync(spec.file));
      const bg = parseHexColor(spec.background);

      it(`is ${spec.size}×${spec.size} RGB with the DESIGN background in all four corners`, () => {
        expect([img.width, img.height, img.colorType]).toEqual([spec.size, spec.size, 2]);
        for (const [x, y] of [[0, 0], [spec.size - 1, 0], [0, spec.size - 1], [spec.size - 1, spec.size - 1]]) {
          expect(pixel(img, x, y), `corner ${x},${y}`).toEqual(bg);
        }
      });

      if (spec.tile) {
        it('dark splash: white tile of the specified size centred, logo inside the tile', () => {
          const tile = nonBackgroundBounds(img, bg);
          expect(tile.width).toBeGreaterThanOrEqual(spec.tile.size - 2);
          expect(tile.width).toBeLessThanOrEqual(spec.tile.size + 2);
          expect(tile.height).toBeGreaterThanOrEqual(spec.tile.size - 2);
          expect(tile.height).toBeLessThanOrEqual(spec.tile.size + 2);
          expect(Math.abs((tile.left + tile.right) / 2 - (spec.size - 1) / 2)).toBeLessThanOrEqual(1.5);
          expect(Math.abs((tile.top + tile.bottom) / 2 - (spec.size - 1) / 2)).toBeLessThanOrEqual(1.5);
          // The tile is pure white where the logo does not reach (its left/right edge midpoints).
          const mid = Math.round(spec.size / 2);
          expect(pixel(img, tile.left + 8, mid)).toEqual([255, 255, 255]);
          expect(pixel(img, tile.right - 8, mid)).toEqual([255, 255, 255]);
          // Rounded corners: the tile's corner pixel is still background.
          expect(pixel(img, tile.left, tile.top)).toEqual(bg);
          // The logo = non-white pixels strictly inside the rounded tile (2 px in from the anti-aliased edge); it fits
          // the logo box and is centred in the tile.
          const inner = { left: tile.left + 2, top: tile.top + 2, right: tile.right - 2, bottom: tile.bottom - 2 };
          const logo = nonBackgroundBounds(img, [255, 255, 255], 2, (x, y) => insideRoundedRect(x, y, inner, spec.tile.radius - 2));
          expect(logo.width).toBeLessThanOrEqual(spec.logoBox + 2);
          expect(logo.height).toBeLessThanOrEqual(spec.logoBox + 2);
          expect(Math.max(logo.width, logo.height)).toBeGreaterThanOrEqual(spec.logoBox - 4);
          expect(Math.abs((logo.left + logo.right) / 2 - (spec.size - 1) / 2)).toBeLessThanOrEqual(2);
          expect(Math.abs((logo.top + logo.bottom) / 2 - (spec.size - 1) / 2)).toBeLessThanOrEqual(2);
        });
      } else {
        it(`logo fits a centred ${spec.logoBox}×${spec.logoBox} box (margin ≥ ${(spec.size - spec.logoBox) / 2} px each side)`, () => {
          const logo = nonBackgroundBounds(img, bg);
          const margin = (spec.size - spec.logoBox) / 2;
          expect(logo.left).toBeGreaterThanOrEqual(margin - 1);
          expect(logo.top).toBeGreaterThanOrEqual(margin - 1);
          expect(logo.right).toBeLessThanOrEqual(spec.size - margin);
          expect(logo.bottom).toBeLessThanOrEqual(spec.size - margin);
          // The largest side uses the whole box (the logo is not shrunk more than needed).
          expect(Math.max(logo.width, logo.height)).toBeGreaterThanOrEqual(spec.logoBox - 4);
          expect(Math.abs((logo.left + logo.right) / 2 - (spec.size - 1) / 2)).toBeLessThanOrEqual(2);
          expect(Math.abs((logo.top + logo.bottom) / 2 - (spec.size - 1) / 2)).toBeLessThanOrEqual(2);
        });
      }
    });
  }
});
