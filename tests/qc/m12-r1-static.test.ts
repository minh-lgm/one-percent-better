// QC M12 round 1 — static invariants of the native toolchain, the Xcode project and the iOS workflow.
// Independent of the developer's tests; every file is normalised to LF first so the result does not depend on
// the checkout's line endings (core.autocrlf).
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('M12 QC: Capacitor pins (M12-AC1)', () => {
  const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  it('runtime plugins are pinned exactly in dependencies, the CLI in devDependencies', () => {
    expect(pkg.dependencies).toMatchObject({
      '@capacitor/core': '8.5.3',
      '@capacitor/ios': '8.5.3',
      '@capacitor/app': '8.1.2',
      '@capacitor/filesystem': '8.1.5',
      '@capacitor/share': '8.0.3',
    });
    expect(pkg.devDependencies['@capacitor/cli']).toBe('8.5.3');
    expect(pkg.dependencies['@capacitor/cli']).toBeUndefined();
  });
  it('no range specifier on any @capacitor/@capgo package', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(all)) if (/^@(capacitor|capgo)\//.test(name)) expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('M12 QC: Xcode project consistency (M12-AC7)', () => {
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  const spm = read('ios/App/CapApp-SPM/Package.swift');
  it('deployment target 16.4 everywhere, and the SPM package declares the same major (.v16)', () => {
    const targets = [...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map((m) => m[1]);
    expect(targets).toHaveLength(4);
    expect(new Set(targets)).toEqual(new Set(['16.4']));
    expect(spm).toContain('platforms: [.iOS(.v16)]');
  });
  it('the package list in Package.swift is exactly the three runtime plugins, pinned to the Capacitor core version', () => {
    expect(spm).toContain('exact: "8.5.3"');
    const plugins = [...spm.matchAll(/\.package\(name: "(\w+)"/g)].map((m) => m[1]).sort();
    expect(plugins).toEqual(['CapacitorApp', 'CapacitorFilesystem', 'CapacitorShare']);
  });
  it('no team, no provisioning, no signing identity pinned in the project (signing is the CI lane, M13)', () => {
    expect(pbx).not.toMatch(/DEVELOPMENT_TEAM/);
    expect(pbx).not.toMatch(/PROVISIONING_PROFILE/);
    expect(pbx).not.toMatch(/CODE_SIGN_ENTITLEMENTS/); // arrives with Sign in with Apple (M14)
  });
  it('generated, per-machine files are not tracked', () => {
    const ignore = read('.gitignore') + '\n' + read('ios/.gitignore');
    for (const p of ['dist-native', 'ios/App/App/public', 'ios/App/App/capacitor.config.json', '*.p8', '*.p12', '*.mobileprovision', '*.cer', '*.jks', '*.keystore']) expect(ignore, p).toContain(p);
  });
});

describe('M12 QC: ios.yml (M12-AC8)', () => {
  const yml = read('.github/workflows/ios.yml');
  it('cannot be triggered by a pull request or a plain push (macOS minutes, no secrets exposure)', () => {
    expect(yml).not.toMatch(/^\s*pull_request/m);
    expect(yml).not.toMatch(/^\s*pull_request_target/m);
    expect(yml).not.toMatch(/^\s+branches:/m);
  });
  it('uses no secrets and no deployment/pages permission in the simulator lane', () => {
    expect(yml).not.toMatch(/secrets\./);
    expect(yml).not.toMatch(/id-token|pages:|contents: write/);
  });
  it('every `uses:` is a first-party action pinned to a major version', () => {
    const uses = [...yml.matchAll(/^\s*-?\s*uses: (\S+)/gm)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^actions\/[\w-]+@v\d+$/);
  });
  it('Xcode 26 gate, build, sync and unsigned simulator build appear in this order', () => {
    const order = ['npm ci', 'xcodebuild -version', 'npm run build:native', 'npx cap sync ios', 'xcodebuild -project ios/App/App.xcodeproj'].map((s) => yml.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(yml).toContain('CODE_SIGNING_ALLOWED=NO');
    expect(yml).toContain('-sdk iphonesimulator');
  });
  it('the Capacitor config points at the folder the workflow builds', () => {
    expect(read('capacitor.config.ts')).toContain("webDir: 'dist-native'");
    expect(existsSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'))).toBe(true);
  });
});

describe('M12 QC: web bundle keeps Capacitor out (M12-AC2, static part)', () => {
  it('only src/integration/native/** mentions @capacitor in non-test source', () => {
    const out = execSync('git ls-files src', { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
    const offenders = out.filter((f) => !f.startsWith('src/integration/native/') && /@capacitor\/(?!cli)/.test(read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
    expect(offenders).toEqual([]);
  });
});
