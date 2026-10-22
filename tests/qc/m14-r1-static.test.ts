// QC M14 round 1 - independent static invariants of native sign-in, account deletion and secrets hygiene.
// Every text file is normalised to LF first (independent of core.autocrlf).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const tracked = (): string[] => execSync('git ls-files', { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);

describe('QC M14: secrets hygiene (M14-AC9, NFR-22, DoD 14)', () => {
  const files = tracked();
  const textFiles = files.filter((f) => !/\.(png|jpg|jpeg|gif|ico|webp|woff2?|zip|pdf|icns|xcprivacy)$/i.test(f) && !f.startsWith('docs/') && !f.startsWith('tests/qc/'));

  it('no key, certificate, profile or .env is tracked', () => {
    expect(files.filter((f) => /\.(p8|p12|pfx|mobileprovision|cer|jks|keystore|pem)$/i.test(f))).toEqual([]);
    expect(files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f) && !/\.env\.(e2e|cloud-e2e|native-e2e)$/.test(f))).toEqual([]);
  });

  it('no PKCS#8 body prefix, no service-role / secret key shape in any tracked file outside docs and tests/qc', () => {
    const offenders: string[] = [];
    for (const f of textFiles) {
      let t: string;
      try {
        t = read(f);
      } catch {
        continue;
      }
      if (/AgEAMBMGByqGSM49|sb_secret_[A-Za-z0-9_]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) offenders.push(f);
      if (/eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(t) && !f.startsWith('e2e/') && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx')) offenders.push(`${f} (JWT-shaped)`);
    }
    expect(offenders).toEqual([]);
  });

  it('the service-role env var is read only in supabase/functions/delete-account/index.ts (tests that merely name it are allowed)', () => {
    const svc = new RegExp('SUPABASE_SERVICE' + '_ROLE_KEY');
    const hits = textFiles.filter((f) => svc.test(read(f)) && !/\.test\.tsx?$/.test(f));
    expect(hits.filter((f) => !/^(README\.md|\.env\.example|\.github\/)/.test(f))).toEqual(['supabase/functions/delete-account/index.ts']);
    expect(files.filter((f) => f.startsWith('src/')).filter((f) => /service[_-]?role/i.test(read(f)) && !/\.test\.tsx?$/.test(f))).toEqual([]);
  });

  it('no VITE_* name mentions APPLE / SERVICE / SECRET / PRIVATE anywhere, and the only VITE_GOOGLE_* values in tracked env files are empty', () => {
    const names = new Set<string>();
    for (const f of textFiles) for (const m of read(f).matchAll(/\bVITE_[A-Z0-9_]+/g)) names.add(m[0]);
    expect([...names].filter((n) => /APPLE|SERVICE|SECRET|PRIVATE|P8|KEY_ID/.test(n) && !/PUBLISHABLE_KEY/.test(n))).toEqual([]);
    const example = read('.env.example');
    expect(example).toMatch(/^VITE_GOOGLE_WEB_CLIENT_ID=$/m);
    expect(example).toMatch(/^VITE_GOOGLE_IOS_CLIENT_ID=$/m);
    for (const f of files.filter((x) => /^\.env\./.test(x))) expect(read(f), f).not.toMatch(/googleusercontent\.com|APPLE_|PRIVATE/);
  });

  it('no real Google client id / URL scheme is committed (only the placeholder scheme)', () => {
    const offenders = textFiles.filter((f) => /[0-9]{6,}-[a-z0-9]{20,}\.apps\.googleusercontent\.com|com\.googleusercontent\.apps\.[0-9]{6,}/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe('QC M14: native project configuration (M14-AC8)', () => {
  it('App.entitlements has exactly one key: com.apple.developer.applesignin = [Default]', () => {
    const t = read('ios/App/App/App.entitlements');
    expect([...t.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1])).toEqual(['com.apple.developer.applesignin']);
    expect(/<key>com\.apple\.developer\.applesignin<\/key>\s*<array>\s*<string>Default<\/string>\s*<\/array>/.test(t)).toBe(true);
  });

  it('pbxproj: the entitlements file is referenced once, listed in the App group, is NOT in any build phase; object ids are unique; braces balance', () => {
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    const ref = /([0-9A-F]{24}) \/\* App\.entitlements \*\/ = \{isa = PBXFileReference;/.exec(pbx);
    expect(ref).not.toBeNull();
    const id = ref![1];
    const occurrences = pbx.split(id).length - 1;
    expect(occurrences, 'definition + one group entry').toBe(2);
    expect(/children = \([^)]*App\.entitlements/.test(pbx)).toBe(true);
    expect(pbx).not.toMatch(new RegExp(`${id} /\\* App\\.entitlements in `));
    const defined = [...pbx.matchAll(/^\t\t([0-9A-F]{24}) (?:\/\*[^*]*\*\/ )?= \{/gm)].map((m) => m[1]);
    expect(new Set(defined).size).toBe(defined.length);
    expect(pbx.split('{').length).toBe(pbx.split('}').length);
    expect([...pbx.matchAll(/GOOGLE_IOS_URL_SCHEME = ([^;]+);/g)].map((m) => m[1])).toEqual(['com.googleusercontent.apps.placeholder', 'com.googleusercontent.apps.placeholder']);
  });

  it('Info.plist: one URL type whose only scheme is $(GOOGLE_IOS_URL_SCHEME); no GIDClientID, no usage strings, no ATS exception', () => {
    const plist = read('ios/App/App/Info.plist');
    const types = /<key>CFBundleURLTypes<\/key>\s*<array>([\s\S]*?)<\/array>\s*<key>/.exec(plist);
    expect(types).not.toBeNull();
    expect([...plist.matchAll(/<string>([^<]*GOOGLE_IOS_URL_SCHEME[^<]*)<\/string>/g)].map((m) => m[1])).toEqual(['$(GOOGLE_IOS_URL_SCHEME)']);
    expect(plist).not.toMatch(/GIDClientID|GIDServerClientID|NSAllowsArbitraryLoads|NS\w+UsageDescription/);
    expect(plist).not.toMatch(/googleusercontent/);
  });

  it('capacitor.config.ts enables only google + apple social providers', () => {
    const cfg = read('capacitor.config.ts');
    expect(cfg).toMatch(/SocialLogin/);
    expect(cfg).toMatch(/google:\s*true/);
    expect(cfg).toMatch(/apple:\s*true/);
    expect(cfg).toMatch(/facebook:\s*false/);
    expect(cfg).toMatch(/twitter:\s*false/);
  });

  it('ios.yml: Google ids come from vars (public), no Apple/Google secret is passed to the build step, the scheme goes to xcodebuild', () => {
    const yml = read('.github/workflows/ios.yml');
    expect(yml).toMatch(/VITE_GOOGLE_WEB_CLIENT_ID: \$\{\{ vars\.VITE_GOOGLE_WEB_CLIENT_ID \}\}/);
    expect(yml).toMatch(/VITE_GOOGLE_IOS_CLIENT_ID: \$\{\{ vars\.VITE_GOOGLE_IOS_CLIENT_ID \}\}/);
    expect(yml).not.toMatch(/secrets\.(VITE_GOOGLE|GOOGLE|APPLE_PRIVATE|APPLE_KEY)/);
    expect(yml).toMatch(/GOOGLE_IOS_URL_SCHEME="\$\{GOOGLE_IOS_URL_SCHEME:-com\.googleusercontent\.apps\.placeholder\}"/);
  });
});

describe('QC M14: Edge Function files (ARCH 4.7, ADR-39)', () => {
  const dir = 'supabase/functions/delete-account';
  it('config.toml: verify_jwt=false only for delete-account; the handler authenticates itself before any deletion', () => {
    const toml = read('supabase/config.toml');
    expect([...toml.matchAll(/^\[functions\.([\w-]+)\]\s*\nverify_jwt = (\w+)/gm)].map((m) => `${m[1]}=${m[2]}`)).toEqual(['delete-account=false']);
    const h = read(`${dir}/handler.ts`);
    expect(h.indexOf('deps.getUser(')).toBeGreaterThan(-1);
    expect(h.indexOf('deps.getUser(')).toBeLessThan(h.indexOf('deps.deleteUser('));
    expect(h.indexOf('deps.deleteUser(')).toBeLessThan(h.indexOf('deps.exchangeAppleCode('));
  });

  it('handler.ts and apple.ts import nothing at runtime; index.ts is the only file with Deno globals; no console in handler/apple; function never imports app code', () => {
    for (const f of ['handler.ts', 'apple.ts']) {
      const t = read(`${dir}/${f}`);
      expect([...t.matchAll(/^import (?!type )[^\n]*from '([^']+)'/gm)].map((m) => m[1]), f).toEqual([]);
      expect(t, f).not.toMatch(/\bDeno\./);
      expect(t, f).not.toMatch(/console\./);
      expect(t, f).not.toMatch(/\.\.\/\.\.\/\.\.\/src|from '@\//);
    }
    const idx = read(`${dir}/index.ts`);
    expect([...idx.matchAll(/console\.(\w+)\(/g)].map((m) => m[1])).toEqual(['log']);
    expect(idx).toMatch(/JSON\.stringify\(\{ fn: 'delete-account', event \}\)/);
    expect(idx).not.toMatch(/Deno\.env\.get\('(APPLE_PRIVATE_KEY)'\)\s*[,)]\s*console/);
  });

  it('the app ships nothing from supabase/functions (no import path from src/ into the function)', () => {
    const offenders = tracked()
      .filter((f) => f.startsWith('src/') && /\.(ts|tsx)$/.test(f))
      .filter((f) => /supabase\/functions/.test(read(f)) && !/\.test\.tsx?$/.test(f));
    expect(offenders).toEqual([]);
  });

  it('CORS default allow-list equals the ARCH 4.7 (c) list', () => {
    const h = read(`${dir}/handler.ts`);
    const list = /DEFAULT_ALLOWED_ORIGINS = \[([^\]]+)\]/.exec(h)![1].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(list).toEqual(['https://minh-lgm.github.io', 'http://localhost:5173', 'http://localhost:4173', 'http://localhost:4174', 'capacitor://localhost', 'https://localhost']);
  });
});

describe('QC M14: privacy page and docs (M14-AC12)', () => {
  it('privacy.html mentions in-app account deletion (en + vi), Sign in with Apple and keeps the contact email', () => {
    const html = read('public/privacy.html');
    expect(html).toMatch(/Delete account/);
    expect(html).toMatch(/Apple/);
    expect(html).toMatch(/minh\.lgm@gmail\.com/);
    expect(html).toMatch(/X[oó]a t[aà]i kho[aả]n/i);
  });
  it('README documents Sign in on iOS, Delete account and the Edge Function (owner)', () => {
    const r = read('README.md');
    for (const h of ['Sign in on iOS', 'Delete account', 'Edge Function delete-account (owner)']) expect(r, h).toContain(h);
  });
});
