// `npm run icons` — PWA icons, favicon and brand mark now come from the product logo
// (docs/handoff/dev-M7.md "Brand assets"). The derived files are committed under public/:
//   public/icons/pwa-192.png, pwa-512.png, pwa-maskable-512.png (icon safe zone),
//   public/apple-touch-icon.png (180, white background), public/favicon.svg (wraps a 64 px PNG),
//   public/favicon-32.png, public/brand-mark-96.png (transparent, used by the nav brand mark).
// The source logo lives outside the repo (logo/, git-ignored). This script only re-copies files that
// were regenerated into logo/ with the same names; it never draws over the committed assets.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'logo');
const targets = [
  ['pwa-192.png', join('public', 'icons', 'pwa-192.png')],
  ['pwa-512.png', join('public', 'icons', 'pwa-512.png')],
  ['pwa-maskable-512.png', join('public', 'icons', 'pwa-maskable-512.png')],
  ['apple-touch-icon.png', join('public', 'apple-touch-icon.png')],
  ['favicon.svg', join('public', 'favicon.svg')],
  ['favicon-32.png', join('public', 'favicon-32.png')],
  ['brand-mark-96.png', join('public', 'brand-mark-96.png')],
];

let copied = 0;
for (const [name, target] of targets) {
  const from = join(source, name);
  if (!existsSync(from)) continue;
  copyFileSync(from, join(root, target));
  console.log(`icons: copied logo/${name} -> ${target}`);
  copied += 1;
}
if (copied === 0) {
  console.log('icons: nothing to do — icons now come from the product logo and are committed under public/ (see README "Brand assets").');
  console.log('       To regenerate, export the sizes listed above into logo/ (git-ignored) and run `npm run icons` again.');
}
