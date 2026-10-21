// M14-AC8 / M14-AC9 (static parts): the iOS project, the workflow and the configuration for native sign-in and the
// Edge Function, read as text (no Xcode on this machine), plus the secret-hygiene rules of DoD 14 / NFR-22.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('iOS project (M14-AC8)', () => {
  it('App.entitlements: com.apple.developer.applesignin = [Default]', () => {
    const ent = read('ios/App/App/App.entitlements');
    const m = /<key>com\.apple\.developer\.applesignin<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(ent);
    expect(m).not.toBeNull();
    expect([...m![1].matchAll(/<string>([^<]+)<\/string>/g)].map((x) => x[1])).toEqual(['Default']);
  });

  it('project.pbxproj: CODE_SIGN_ENTITLEMENTS = App/App.entitlements for Debug and Release; GOOGLE_IOS_URL_SCHEME placeholder the CI overrides; still no team', () => {
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    expect(pbx.split('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;').length - 1).toBe(2);
    expect(pbx.split('GOOGLE_IOS_URL_SCHEME = com.googleusercontent.apps.placeholder;').length - 1).toBe(2);
    expect(pbx).toContain('App.entitlements */ = {isa = PBXFileReference;');
    expect(pbx).not.toMatch(/DEVELOPMENT_TEAM = [A-Z0-9]+;/);
    expect(pbx).not.toMatch(/PROVISIONING_PROFILE/);
  });

  it('Info.plist: CFBundleURLTypes → CFBundleURLSchemes contains $(GOOGLE_IOS_URL_SCHEME) (Google Sign-In callback)', () => {
    const plist = read('ios/App/App/Info.plist');
    const types = /<key>CFBundleURLTypes<\/key>\s*<array>([\s\S]*?)<\/array>\s*(?=<key>)/.exec(plist);
    expect(types).not.toBeNull();
    const schemes = /<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(types![1]);
    expect([...schemes![1].matchAll(/<string>([^<]+)<\/string>/g)].map((x) => x[1])).toEqual(['$(GOOGLE_IOS_URL_SCHEME)']);
    // No real client id baked into the project: the scheme is a build setting (variables, U21).
    expect(plist).not.toMatch(/com\.googleusercontent\.apps\.\d/);
  });

  it('ios.yml: the testflight lane passes GOOGLE_IOS_URL_SCHEME to xcodebuild and VITE_GOOGLE_WEB/IOS_CLIENT_ID (variables) to build:native', () => {
    const yml = read('.github/workflows/ios.yml');
    const testflight = yml.slice(yml.indexOf('  testflight:'));
    expect(testflight).toMatch(/GOOGLE_IOS_URL_SCHEME: \$\{\{ vars\.GOOGLE_IOS_URL_SCHEME \}\}/);
    expect(testflight).toMatch(/GOOGLE_IOS_URL_SCHEME="\$\{GOOGLE_IOS_URL_SCHEME:-com\.googleusercontent\.apps\.placeholder\}"/);
    expect(testflight).toMatch(/VITE_GOOGLE_WEB_CLIENT_ID: \$\{\{ vars\.VITE_GOOGLE_WEB_CLIENT_ID \}\}/);
    expect(testflight).toMatch(/VITE_GOOGLE_IOS_CLIENT_ID: \$\{\{ vars\.VITE_GOOGLE_IOS_CLIENT_ID \}\}/);
    expect(testflight).toContain('npm run build:native');
  });

  it('capacitor.config.ts: SocialLogin providers google + apple on, facebook + twitter off; the plugin is pinned 8.7.4 and in Package.swift', () => {
    const cfg = read('capacitor.config.ts');
    const block = /SocialLogin: \{ providers: \{([^}]*)\}/.exec(cfg);
    expect(block).not.toBeNull();
    const providers = Object.fromEntries([...block![1].matchAll(/(\w+): (true|false)/g)].map((m) => [m[1], m[2] === 'true']));
    expect(providers).toEqual({ google: true, apple: true, facebook: false, twitter: false });
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@capgo/capacitor-social-login']).toBe('8.7.4');
    expect(read('ios/App/CapApp-SPM/Package.swift')).toContain('.package(name: "CapgoCapacitorSocialLogin", path: "../../../node_modules/@capgo/capacitor-social-login")');
  });
});

describe('secrets and configuration hygiene (M14-AC9, DoD 14, NFR-22)', () => {
  // Tracked + not-yet-committed files (a new file must not slip through before its first commit).
  const tracked = execSync('git ls-files --cached --others --exclude-standard', { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const textFiles = tracked.filter((f) => !/\.(png|jpg|jpeg|ico|woff2?|gif|webp|pdf)$/i.test(f));

  it('SUPABASE_SERVICE_ROLE_KEY appears in one source file only: supabase/functions/delete-account/index.ts (docs excluded)', () => {
    const hits = textFiles.filter((f) => !f.startsWith('docs/') && f !== 'src/test/native-auth-static.test.ts' && read(f).includes('SUPABASE_SERVICE_ROLE_KEY'));
    expect(hits).toEqual(['supabase/functions/delete-account/index.ts']);
  });

  it('no VITE_* variable name contains APPLE_, SERVICE or SECRET (every VITE_* lands in the JS bundle)', () => {
    const names = new Set<string>();
    for (const f of textFiles) {
      if (f.startsWith('docs/')) continue;
      for (const m of read(f).matchAll(/\bVITE_[A-Z0-9_]+/g)) names.add(m[0]);
    }
    expect([...names].filter((n) => /APPLE_|SERVICE|SECRET/.test(n))).toEqual([]);
    expect([...names]).toEqual(expect.arrayContaining(['VITE_GOOGLE_WEB_CLIENT_ID', 'VITE_GOOGLE_IOS_CLIENT_ID']));
  });

  it('DoD 14: no key files tracked; no PKCS#8 EC key prefix, no secret-key role name or secret-key prefix in tracked files outside docs (and the QC specs that spell the forbidden words)', () => {
    expect(tracked.filter((f) => /\.(p8|p12|mobileprovision|cer|jks|keystore)$/i.test(f))).toEqual([]);
    // The needles are assembled so this file does not itself match the DoD 14 grep.
    const needle = new RegExp(['AgEAMBMG', 'ByqGSM49', '|service', '_role|sb_', 'secret_'].join(''));
    const hits = textFiles.filter((f) => !f.startsWith('docs/') && !f.startsWith('tests/qc/') && f !== 'src/test/native-auth-static.test.ts' && needle.test(read(f)));
    expect(hits).toEqual([]);
  });

  it('supabase/config.toml: [functions.delete-account] verify_jwt = false (the handler verifies the JWT itself)', () => {
    const toml = read('supabase/config.toml');
    expect(toml).toMatch(/\[functions\.delete-account\]\s*\n(?:#[^\n]*\n)*verify_jwt = false/);
  });

  it('.env.example documents the two public Google ids and warns against Apple / App Store Connect keys', () => {
    const env = read('.env.example');
    expect(env).toMatch(/^VITE_GOOGLE_WEB_CLIENT_ID=$/m);
    expect(env).toMatch(/^VITE_GOOGLE_IOS_CLIENT_ID=$/m);
    expect(env).toMatch(/NEVER put Apple/);
  });

  it('the Edge Function entry is the only Deno file and it is outside tsc/ESLint; handler.ts and apple.ts import nothing from Deno/npm', () => {
    expect(read('tsconfig.app.json')).toContain('"supabase/functions/**/index.ts"');
    expect(read('eslint.config.js')).toContain("'supabase/functions/**/index.ts'");
    for (const f of ['supabase/functions/delete-account/handler.ts', 'supabase/functions/delete-account/apple.ts']) {
      const src = read(f);
      expect(src, f).not.toMatch(/from 'npm:|Deno\./);
    }
    expect(read('supabase/functions/delete-account/index.ts')).toMatch(/Deno\.serve\(/);
  });
});
