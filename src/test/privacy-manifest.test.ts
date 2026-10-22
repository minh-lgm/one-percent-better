// M15-AC6: the app privacy manifest (ARCHITECTURE §5.13; PRD NFR-21, A-71) and the final Info.plist, read as text
// (no Xcode on the development machine). The required-reason API list mirrors what the pinned plugins use
// (handoff dev-M15 §6): UserDefaults (@capgo/capacitor-social-login) and file timestamps (@capacitor/filesystem).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const MANIFEST = 'ios/App/App/PrivacyInfo.xcprivacy';

/** `<key>k</key>` followed by its value element (`<true/>`, `<false/>`, `<array>…</array>`, `<string>…</string>`). */
function valueOf(plist: string, key: string): { tag: string; inner: string } | null {
  const m = new RegExp(`<key>${key}</key>\\s*<([a-z]+)(?:/>|>([\\s\\S]*?)</\\1>)`).exec(plist);
  return m ? { tag: m[1], inner: m[2] ?? '' } : null;
}

/** Inner text of the (possibly nested) `<array>` value of `key`, depth-aware; `''` for `<array/>`. */
function arrayOf(plist: string, key: string): string | null {
  const start = plist.indexOf(`<key>${key}</key>`);
  if (start === -1) return null;
  const open = plist.indexOf('<array', start);
  if (open === -1) return null;
  if (plist.startsWith('<array/>', open)) return '';
  const re = /<array>|<\/array>/g;
  re.lastIndex = open;
  let depth = 0;
  for (let m = re.exec(plist); m; m = re.exec(plist)) {
    depth += m[0] === '<array>' ? 1 : -1;
    if (depth === 0) return plist.slice(open + '<array>'.length, m.index);
  }
  return null;
}

/** The top-level `<dict>…</dict>` blocks of an array body (each may contain nested arrays, never nested dicts). */
function dictsOf(inner: string): string[] {
  return inner.match(/<dict>[\s\S]*?<\/dict>/g) ?? [];
}

describe('ios/App/App/PrivacyInfo.xcprivacy (M15-AC6)', () => {
  const manifest = read(MANIFEST);

  it('exists, is a plist, no tracking, no tracking domains', () => {
    expect(existsSync(join(root, MANIFEST))).toBe(true);
    expect(manifest).toContain('<plist version="1.0">');
    expect(valueOf(manifest, 'NSPrivacyTracking')?.tag).toBe('false');
    expect(arrayOf(manifest, 'NSPrivacyTrackingDomains')).toBe('');
  });

  it('collected data: exactly email, name, user id, other user content — each linked, not tracking, app functionality', () => {
    const types = arrayOf(manifest, 'NSPrivacyCollectedDataTypes');
    expect(types).not.toBeNull();
    const dicts = dictsOf(types!);
    expect(dicts).toHaveLength(4);
    const names = dicts.map((d) => valueOf(d, 'NSPrivacyCollectedDataType')?.inner);
    expect(names.sort()).toEqual(['NSPrivacyCollectedDataTypeEmailAddress', 'NSPrivacyCollectedDataTypeName', 'NSPrivacyCollectedDataTypeOtherUserContent', 'NSPrivacyCollectedDataTypeUserID']);
    for (const d of dicts) {
      expect(valueOf(d, 'NSPrivacyCollectedDataTypeLinked')?.tag, d).toBe('true');
      expect(valueOf(d, 'NSPrivacyCollectedDataTypeTracking')?.tag, d).toBe('false');
      const purposes = valueOf(d, 'NSPrivacyCollectedDataTypePurposes');
      expect(purposes?.tag).toBe('array');
      expect(purposes?.inner.match(/<string>[^<]+<\/string>/g)).toEqual(['<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>']);
    }
  });

  it('required-reason APIs: UserDefaults CA92.1 and file timestamps C617.1 (what the pinned plugins use), nothing else', () => {
    const apis = arrayOf(manifest, 'NSPrivacyAccessedAPITypes');
    expect(apis).not.toBeNull();
    const dicts = dictsOf(apis!);
    const byType = Object.fromEntries(dicts.map((d) => [valueOf(d, 'NSPrivacyAccessedAPIType')?.inner, valueOf(d, 'NSPrivacyAccessedAPITypeReasons')?.inner.match(/<string>([^<]+)<\/string>/g)?.map((s) => s.replace(/<\/?string>/g, ''))]));
    expect(byType).toEqual({
      NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
      NSPrivacyAccessedAPICategoryFileTimestamp: ['C617.1'],
    });
  });

  it('the plugin sources really use those APIs (and the local-notifications plugin needs none)', () => {
    const grep = (rel: string, re: RegExp) => re.test(readFileSync(join(root, 'node_modules', rel), 'utf8'));
    expect(grep('@capgo/capacitor-social-login/ios/Sources/SocialLoginPlugin/AppleProvider.swift', /UserDefaults\.standard/)).toBe(true);
    expect(grep('@capacitor/filesystem/ios/Sources/FilesystemPlugin/IONFileStructures+Converters.swift', /modificationDate|creationDate/)).toBe(true);
    for (const f of ['LocalNotificationsPlugin.swift', 'LocalNotificationsHandler.swift']) {
      expect(grep(`@capacitor/local-notifications/ios/Sources/LocalNotificationsPlugin/${f}`, /UserDefaults|modificationDate|systemUptime|volumeAvailableCapacity|activeInputModes/), f).toBe(false);
    }
  });

  it('is part of the App target: PBXFileReference, the App group and the Resources build phase', () => {
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    const ref = /([0-9A-F]{24}) \/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference;[^}]*path = PrivacyInfo\.xcprivacy;/.exec(pbx);
    expect(ref).not.toBeNull();
    const build = new RegExp(`([0-9A-F]{24}) /\\* PrivacyInfo\\.xcprivacy in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ${ref![1]} /\\* PrivacyInfo\\.xcprivacy \\*/; \\};`).exec(pbx);
    expect(build).not.toBeNull();
    const group = /504EC3061FED79650016851F \/\* App \*\/ = \{[\s\S]*?children = \(([\s\S]*?)\);/.exec(pbx);
    expect(group?.[1]).toContain(`${ref![1]} /* PrivacyInfo.xcprivacy */`);
    const resources = /504EC3021FED79650016851F \/\* Resources \*\/ = \{[\s\S]*?files = \(([\s\S]*?)\);/.exec(pbx);
    expect(resources?.[1]).toContain(`${build![1]} /* PrivacyInfo.xcprivacy in Resources */`);
  });
});

describe('ios/App/App/Info.plist — final check (M15-AC6, A-71)', () => {
  const plist = read('ios/App/App/Info.plist');
  it('ITSAppUsesNonExemptEncryption false; no tracking prompt, no background modes, no camera / photo / location / contacts / health keys', () => {
    expect(valueOf(plist, 'ITSAppUsesNonExemptEncryption')?.tag).toBe('false');
    for (const key of ['NSUserTrackingUsageDescription', 'UIBackgroundModes', 'NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysUsageDescription', 'NSContactsUsageDescription', 'NSHealthShareUsageDescription', 'NSMicrophoneUsageDescription']) {
      expect(plist, key).not.toContain(key);
    }
  });
  it('local notifications need no Info.plist key and no Push capability (ADR-40: no server push)', () => {
    expect(plist).not.toContain('aps-environment');
    expect(read('ios/App/App/App.entitlements')).not.toContain('aps-environment');
    expect(plist).not.toContain('remote-notification');
  });
});

describe('@capacitor/local-notifications is pinned and synced (M15-T2)', () => {
  it('package.json pins 8.3.1 exactly; Package.swift lists CapacitorLocalNotifications', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@capacitor/local-notifications']).toBe('8.3.1');
    expect(read('ios/App/CapApp-SPM/Package.swift')).toContain('.package(name: "CapacitorLocalNotifications", path: "../../../node_modules/@capacitor/local-notifications")');
  });
});
