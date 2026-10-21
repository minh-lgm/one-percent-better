// `npm run ios:assets` — app icon and launch-screen images for the iOS app (TASKS M13-T3, ADR-43, DESIGN v5.0
// §5 "Native shell" 1–2). Renders the product logo on the DESIGN backgrounds with Playwright's Chromium (already a
// devDependency), then strips the alpha channel with scripts/lib/png-rgb.mjs (App Store icons must be RGB).
//
// Source: logo/1_percent_better_transparent.png (git-ignored; present on the development machine). The generated
// PNGs are committed under ios/App/App/Assets.xcassets/. Output is deterministic: running the script twice yields
// byte-identical files (same Chromium, same inputs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, opaqueBounds, toRgbPng } from './lib/png-rgb.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = join(root, 'logo', '1_percent_better_transparent.png');
const ASSETS = join(root, 'ios', 'App', 'App', 'Assets.xcassets');

/** DESIGN v5.0 §5 "Native shell": sizes and colours are the contract for M13-AC3/AC4. */
export const SPECS = [
  {
    // 1) App icon: 1024×1024, white (#FFFFFF, OQ-18), logo kept in a centred 820×820 box (≥ 102 px margin).
    file: join(ASSETS, 'AppIcon.appiconset', 'AppIcon-512@2x.png'),
    size: 1024,
    background: '#FFFFFF',
    logoBox: 820,
  },
  {
    // 2) Launch image, light: --bg #F7F6F2, logo box ≤ 520×520.
    file: join(ASSETS, 'Splash.imageset', 'splash-light.png'),
    size: 2732,
    background: '#F7F6F2',
    logoBox: 520,
  },
  {
    // 2) Launch image, dark: --bg #121513 with a white 600×600 tile (corner radius 28 % ≈ 168 px, like the brand
    // mark), logo box ≤ 500×500 centred in the tile.
    file: join(ASSETS, 'Splash.imageset', 'splash-dark.png'),
    size: 2732,
    background: '#121513',
    logoBox: 500,
    tile: { size: 600, radius: 168, color: '#FFFFFF' },
  },
];

/** Fit the logo's opaque bounding box into `box` px keeping the aspect ratio; returns the draw size and offsets. */
export function fitLogo(bounds, box, canvas) {
  const w = bounds.right - bounds.left + 1;
  const h = bounds.bottom - bounds.top + 1;
  const scale = Math.min(box / w, box / h);
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  return { sx: bounds.left, sy: bounds.top, sw: w, sh: h, dx: Math.round((canvas - dw) / 2), dy: Math.round((canvas - dh) / 2), dw, dh };
}

function html(spec, logoDataUrl, fit) {
  const tile = spec.tile
    ? `<div style="position:absolute;left:${(spec.size - spec.tile.size) / 2}px;top:${(spec.size - spec.tile.size) / 2}px;width:${spec.tile.size}px;height:${spec.tile.size}px;border-radius:${spec.tile.radius}px;background:${spec.tile.color}"></div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${spec.background};width:${spec.size}px;height:${spec.size}px;overflow:hidden}
    canvas{position:absolute;left:${fit.dx}px;top:${fit.dy}px;width:${fit.dw}px;height:${fit.dh}px}
  </style></head><body>${tile}<canvas id="c" width="${fit.dw}" height="${fit.dh}"></canvas>
  <script>
    const img = new Image();
    img.onload = () => {
      const ctx = document.getElementById('c').getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, ${fit.sx}, ${fit.sy}, ${fit.sw}, ${fit.sh}, 0, 0, ${fit.dw}, ${fit.dh});
      document.body.dataset.ready = '1';
    };
    img.src = ${JSON.stringify(logoDataUrl)};
  </script></body></html>`;
}

async function main() {
  if (!existsSync(LOGO)) {
    console.error(`ios:assets: missing ${LOGO}`);
    console.error('  The source logo lives outside the repository (logo/ is git-ignored). Put 1_percent_better_transparent.png there and run again.');
    process.exit(1);
  }
  const logoPng = readFileSync(LOGO);
  const bounds = opaqueBounds(decodePng(logoPng));
  if (!bounds) {
    console.error('ios:assets: the logo is fully transparent');
    process.exit(1);
  }
  const logoDataUrl = `data:image/png;base64,${logoPng.toString('base64')}`;

  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    for (const spec of SPECS) {
      const fit = fitLogo(bounds, spec.logoBox, spec.size);
      const page = await browser.newPage({ viewport: { width: spec.size, height: spec.size }, deviceScaleFactor: 1 });
      await page.setContent(html(spec, logoDataUrl, fit));
      await page.waitForSelector('body[data-ready="1"]');
      const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: spec.size, height: spec.size }, animations: 'disabled' });
      await page.close();
      const rgb = toRgbPng(shot, spec.background);
      mkdirSync(dirname(spec.file), { recursive: true });
      writeFileSync(spec.file, rgb);
      console.log(`ios:assets: wrote ${spec.file.slice(root.length + 1)} (${spec.size}x${spec.size} RGB, logo ${fit.dw}x${fit.dh}, ${rgb.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`ios:assets: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
