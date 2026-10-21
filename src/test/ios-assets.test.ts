// M13-AC3 / M13-AC4 / M13-AC1 (plists): static checks of the committed iOS assets, launch screen and export
// options (DESIGN v5.0 "Native shell" 1–2, ARCHITECTURE §5.13/§5.14). PNG headers are parsed by hand here; the
// pixel-level checks (corner colours, logo bounds) live next to the PNG library in scripts/gen-ios-assets.test.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const ASSETS = 'ios/App/App/Assets.xcassets';
const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** IHDR of a PNG: width, height, bit depth, colour type, interlace. */
function pngHeader(rel: string) {
  const buf = readFileSync(join(root, rel));
  expect(buf.subarray(0, 8).toString('hex'), `${rel} signature`).toBe('89504e470d0a1a0a');
  expect(buf.toString('latin1', 12, 16)).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25], interlace: buf[28], bytes: buf.length };
}

describe('AppIcon.appiconset (M13-AC3)', () => {
  const dir = `${ASSETS}/AppIcon.appiconset`;
  const contents = JSON.parse(read(`${dir}/Contents.json`)) as { images: Array<Record<string, string>> };

  it('Contents.json references AppIcon-512@2x.png as the universal iOS 1024x1024 icon', () => {
    const icon = contents.images.find((i) => i.filename === 'AppIcon-512@2x.png');
    expect(icon).toMatchObject({ idiom: 'universal', platform: 'ios', size: '1024x1024' });
    expect(contents.images.filter((i) => i.appearances)).toHaveLength(0); // no dark/tinted variants (A-D66)
  });
  it('AppIcon-512@2x.png: valid PNG, 1024×1024, 8-bit, colour type 2 (RGB, no alpha), not interlaced', () => {
    expect(pngHeader(`${dir}/AppIcon-512@2x.png`)).toMatchObject({ width: 1024, height: 1024, bitDepth: 8, colorType: 2, interlace: 0 });
  });
});

describe('Splash.imageset and LaunchScreen.storyboard (M13-AC4)', () => {
  const dir = `${ASSETS}/Splash.imageset`;
  const contents = JSON.parse(read(`${dir}/Contents.json`)) as { images: Array<{ filename: string; idiom: string; appearances?: Array<{ appearance: string; value: string }> }> };

  it('one light (default) and one dark (appearances luminosity: dark) image, both universal', () => {
    const light = contents.images.filter((i) => !i.appearances);
    const dark = contents.images.filter((i) => i.appearances?.some((a) => a.appearance === 'luminosity' && a.value === 'dark'));
    expect(light).toHaveLength(1);
    expect(dark).toHaveLength(1);
    expect(light[0].idiom).toBe('universal');
    expect(dark[0].idiom).toBe('universal');
    expect(light[0].filename).not.toBe(dark[0].filename);
  });
  it('both images: PNG 2732×2732 RGB (colour type 2), 8-bit', () => {
    for (const image of contents.images) {
      expect(pngHeader(`${dir}/${image.filename}`), image.filename).toMatchObject({ width: 2732, height: 2732, bitDepth: 8, colorType: 2, interlace: 0 });
    }
    // The template's three placeholder files are gone.
    expect(existsSync(join(root, dir, 'splash-2732x2732.png'))).toBe(false);
  });
  it('LaunchScreen.storyboard: full-screen Splash image on the named colour LaunchBackground (--bg light #F7F6F2 / dark #121513)', () => {
    const sb = read('ios/App/App/Base.lproj/LaunchScreen.storyboard');
    expect(sb).toContain('launchScreen="YES"');
    expect(sb).toMatch(/<imageView[^>]*image="Splash"/);
    expect(sb).toMatch(/<color key="backgroundColor" name="LaunchBackground"\/>/);
    expect(sb).toMatch(/<image name="Splash" width="2732" height="2732"\/>/);
    expect(sb).toMatch(/<namedColor name="LaunchBackground">\s*<color red="0\.969" green="0\.965" blue="0\.949"/);
    expect(sb).not.toMatch(/<label|<activityIndicatorView/); // no text, no spinner (S10)

    const colorset = JSON.parse(read(`${ASSETS}/LaunchBackground.colorset/Contents.json`)) as {
      colors: Array<{ color: { components: Record<string, string> }; appearances?: Array<{ appearance: string; value: string }> }>;
    };
    const light = colorset.colors.find((c) => !c.appearances)!;
    const dark = colorset.colors.find((c) => c.appearances?.some((a) => a.value === 'dark'))!;
    expect(light.color.components).toMatchObject({ red: '0xF7', green: '0xF6', blue: '0xF2' });
    expect(dark.color.components).toMatchObject({ red: '0x12', green: '0x15', blue: '0x13' });
  });
});

describe('ios/ci export options and version file (M13-AC1, M13-AC2)', () => {
  const value = (plist: string, key: string) => new RegExp(`<key>${key}</key>\\s*<(?:string|true|false|dict)(?:/>|>([\\s\\S]*?)</(?:string|dict)>)`).exec(plist);

  it('ExportOptions.plist: app-store-connect, upload, automatic signing, teamID placeholder, symbols on, no version management', () => {
    const plist = read('ios/ci/ExportOptions.plist');
    expect(value(plist, 'method')?.[1]).toBe('app-store-connect');
    expect(value(plist, 'destination')?.[1]).toBe('upload');
    expect(value(plist, 'signingStyle')?.[1]).toBe('automatic');
    expect(value(plist, 'teamID')?.[1]).toBe('TEAM_ID_PLACEHOLDER');
    expect(plist).toMatch(/<key>uploadSymbols<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>manageAppVersionAndBuildNumber<\/key>\s*<false\/>/);
    expect(plist).not.toContain('provisioningProfiles');
  });
  it('ExportOptions-manual.plist: manual signing with Apple Distribution and a profile entry for the bundle id', () => {
    const plist = read('ios/ci/ExportOptions-manual.plist');
    expect(value(plist, 'method')?.[1]).toBe('app-store-connect');
    expect(value(plist, 'destination')?.[1]).toBe('upload');
    expect(value(plist, 'signingStyle')?.[1]).toBe('manual');
    expect(value(plist, 'signingCertificate')?.[1]).toBe('Apple Distribution');
    expect(plist).toMatch(/<key>provisioningProfiles<\/key>\s*<dict>\s*<key>io\.github\.minhlgm\.onepercentbetter<\/key>\s*<string>[^<]+<\/string>/);
  });
  it('neither plist contains a real team id or key', () => {
    for (const rel of ['ios/ci/ExportOptions.plist', 'ios/ci/ExportOptions-manual.plist']) {
      const plist = read(rel);
      expect(plist).not.toMatch(/<key>teamID<\/key>\s*<string>[A-Z0-9]{10}<\/string>/);
      // Markers split so DoD 14's `git grep` does not match this line (M13-D3).
      expect(plist).not.toMatch(new RegExp(['BEGIN PRIVATE', 'KEY'].join(' ') + '|' + ['AgEAMBMG', 'ByqGSM49'].join('')));
    }
  });
  it('ios/ci/version.json holds marketingVersion X.Y.Z', () => {
    expect(JSON.parse(read('ios/ci/version.json'))).toEqual({ marketingVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/) });
  });
});
