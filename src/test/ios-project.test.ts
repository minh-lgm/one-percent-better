// M12-AC7: static checks of the committed Xcode project (ARCHITECTURE §5.13; PRD A-57, A-59, A-71).
// There is no Xcode on the development machine, so the files are read as text.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const BUNDLE_ID = 'io.github.minhlgm.onepercentbetter';

describe('ios/App/App.xcodeproj/project.pbxproj', () => {
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  const count = (needle: string) => pbx.split(needle).length - 1;

  it('bundle identifier in both target configurations (Debug + Release)', () => {
    expect(count(`PRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE_ID};`)).toBe(2);
  });
  it('deployment target 16.4 everywhere (project + target, Debug + Release), no other value', () => {
    expect(count('IPHONEOS_DEPLOYMENT_TARGET = 16.4;')).toBe(4);
    expect(pbx.match(/IPHONEOS_DEPLOYMENT_TARGET = (?!16\.4;)[^;]*;/g)).toBeNull();
  });
  it('iPhone only, version 1.0.0 build 1, automatic signing with no team baked in', () => {
    expect(count('TARGETED_DEVICE_FAMILY = 1;')).toBe(2);
    expect(pbx).not.toContain('TARGETED_DEVICE_FAMILY = "1,2";');
    expect(count('MARKETING_VERSION = 1.0.0;')).toBe(2);
    expect(count('CURRENT_PROJECT_VERSION = 1;')).toBe(2);
    expect(count('CODE_SIGN_STYLE = Automatic;')).toBe(2);
    expect(pbx).not.toMatch(/DEVELOPMENT_TEAM = [A-Z0-9]+;/);
  });
  it('uses Swift Package Manager (CapApp-SPM), not CocoaPods', () => {
    expect(pbx).toContain('XCLocalSwiftPackageReference');
    expect(pbx).toContain('CapApp-SPM');
    expect(pbx).not.toContain('Pods');
    expect(existsSync(join(root, 'ios/App/Podfile'))).toBe(false);
    expect(existsSync(join(root, 'ios/App/CapApp-SPM/Package.swift'))).toBe(true);
  });
});

describe('ios/App/App/Info.plist', () => {
  const plist = read('ios/App/App/Info.plist');
  const value = (key: string) => new RegExp(`<key>${key}</key>\\s*<([a-z]+)(?:/>|>([\\s\\S]*?)</\\1>)`).exec(plist);

  it('display name "1% Better"', () => {
    expect(value('CFBundleDisplayName')?.[2]).toBe('1% Better');
  });
  it('portrait only, no iPad-specific orientations', () => {
    const m = value('UISupportedInterfaceOrientations');
    expect(m?.[1]).toBe('array');
    expect(m?.[2]?.match(/<string>[^<]+<\/string>/g)).toEqual(['<string>UIInterfaceOrientationPortrait</string>']);
    expect(plist).not.toContain('UISupportedInterfaceOrientations~ipad');
  });
  it('ITSAppUsesNonExemptEncryption = false (A-71)', () => {
    expect(value('ITSAppUsesNonExemptEncryption')?.[1]).toBe('false');
  });
  it('no tracking / background / camera / photo / location keys (ARCH §5.13)', () => {
    for (const key of ['NSUserTrackingUsageDescription', 'UIBackgroundModes', 'NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSLocationWhenInUseUsageDescription']) {
      expect(plist, key).not.toContain(key);
    }
  });
  it('version and bundle id come from the build settings', () => {
    expect(value('CFBundleShortVersionString')?.[2]).toBe('$(MARKETING_VERSION)');
    expect(value('CFBundleVersion')?.[2]).toBe('$(CURRENT_PROJECT_VERSION)');
    expect(value('CFBundleIdentifier')?.[2]).toBe('$(PRODUCT_BUNDLE_IDENTIFIER)');
  });
});

describe('capacitor.config.ts', () => {
  const cfg = read('capacitor.config.ts');
  it('appId = bundle id, appName "1% Better", webDir dist-native, no insets, DESIGN --bg background', () => {
    expect(cfg).toContain(`appId: '${BUNDLE_ID}'`);
    expect(cfg).toContain("appName: '1% Better'");
    expect(cfg).toContain("webDir: 'dist-native'");
    expect(cfg).toContain("contentInset: 'never'");
    expect(cfg).toContain("backgroundColor: '#F7F6F2'");
  });
});

describe('generated files stay out of git (.gitignore)', () => {
  const ignore = read('.gitignore');
  it('ignores dist-native*, the synced web assets and every signing artefact (NFR-22)', () => {
    for (const line of ['dist-native/', 'dist-native-e2e/', 'ios/App/App/public/', 'ios/App/App/capacitor.config.json', '*.p8', '*.p12', '*.mobileprovision', '*.cer', '*.jks', '*.keystore']) {
      expect(ignore.split(/\r?\n/), line).toContain(line);
    }
  });
});
