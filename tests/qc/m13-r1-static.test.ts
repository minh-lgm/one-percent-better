// QC M13 round 1 — independent static invariants of the release lane, the version script, the icon/launch assets and the
// native project. Every text file is normalised to LF first (result independent of core.autocrlf). Does not depend on
// the git history (CI clones are shallow) and does not need the git-ignored logo/ folder.
import { execSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

function jobText(yml: string, name: string): string {
  const jobs = yml.slice(yml.indexOf('\njobs:\n'));
  const part = jobs.split(/^ {2}(?=[a-z][\w-]*:$)/m).find((p) => p.startsWith(`${name}:\n`));
  expect(part, `job ${name}`).toBeDefined();
  return part as string;
}

describe('M13 QC: ios.yml lane testflight (M13-AC1, NFR-22)', () => {
  const yml = read('.github/workflows/ios.yml');
  const tf = jobText(yml, 'testflight');

  it('every `secrets.` reference in the whole file is an `env` assignment; none is echoed, printed or expanded in a run script', () => {
    const lines = yml.split('\n');
    const offenders = lines.filter((l) => l.includes('secrets.') && !/^\s+[A-Z][A-Z0-9_]*: \$\{\{ secrets\.[A-Z0-9_]+( != '')? \}\}\s*$/.test(l) && !l.trim().startsWith('#'));
    expect(offenders).toEqual([]);
    for (const forbidden of [/\bset -x\b/, /\bset -[a-z]*x/, /echo[^\n]*\$\{?(KEY_B64|P12_B64|P12_PASSWORD|PROFILE_B64|APP_STORE_CONNECT_API_KEY_P8_BASE64|KEYCHAIN_PASSWORD)/, /cat [^\n]*(\.p8|\.p12|AuthKey)/, /printenv|\benv \|/, /upload-artifact/, /\.ipa/, /::add-mask::/]) {
      expect(tf, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('secret-bearing variables appear only in the step that needs them (least exposure)', () => {
    const jobEnv = tf.slice(tf.indexOf('    env:\n'), tf.indexOf('    steps:\n'));
    // Job-wide env (visible to npm ci / lint / test): only the two public Supabase values and the boolean fallback switch.
    const secretNames = [...jobEnv.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]).sort();
    expect(secretNames).toEqual(['IOS_DIST_CERT_P12_BASE64', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_URL']);
    expect(jobEnv).toMatch(/MANUAL_SIGNING: \$\{\{ secrets\.IOS_DIST_CERT_P12_BASE64 != '' \}\}/); // a boolean, not the certificate
    // The base64 key is read in exactly one step, and that step writes mode 600.
    const stepsWithKey = tf.split(/^ {6}- /m).filter((s) => s.includes('APP_STORE_CONNECT_API_KEY_P8_BASE64'));
    expect(stepsWithKey).toHaveLength(2); // "Check release secrets" (emptiness only) and "Write the App Store Connect API key"
    const write = stepsWithKey.find((s) => s.startsWith('name: Write the App Store Connect API key'))!;
    expect(write).toMatch(/umask 077/);
    expect(write).toMatch(/chmod 600/);
    expect(write).toMatch(/base64 --decode > "\$RUNNER_TEMP\/AuthKey\.p8"/);
    const check = stepsWithKey.find((s) => s.startsWith('name: Check release secrets'))!;
    expect(check).not.toMatch(/echo[^\n]*\$\{!?name\}|echo[^\n]*\$\{?APP_STORE/); // it reports names, never values
  });

  it('user-controlled input never lands inside a script (passed through env), and the version script is fed from env only', () => {
    expect(yml).not.toMatch(/run:[^\n]*\$\{\{\s*(inputs|github\.event|github\.head_ref)/);
    const runBlocks = [...yml.matchAll(/^\s+run: ([|>]-?\n(?:\s{10,}[^\n]*\n?)+|[^\n]+)/gm)].map((m) => m[1]);
    for (const block of runBlocks) expect(block).not.toMatch(/\$\{\{/);
  });

  it('is gated to the real repository, cancels nothing in flight, 60 min, macos-26, Xcode 26 gate before the build', () => {
    expect(tf).toMatch(/if: github\.repository == 'minh-lgm\/one-percent-better' && /);
    expect(tf).toMatch(/runs-on: macos-26/);
    expect(tf).toMatch(/timeout-minutes: 60/);
    expect(tf).toMatch(/concurrency:\n\s+group: ios-release\n\s+cancel-in-progress: false/);
    expect(tf.indexOf("grep -q '^Xcode 26\\.'")).toBeGreaterThan(0);
    expect(tf.indexOf("grep -q '^Xcode 26\\.'")).toBeLessThan(tf.indexOf('xcodebuild archive'));
    // workflow-level permissions are least privilege and no job overrides them
    expect(yml).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(tf).not.toMatch(/^\s+permissions:/m);
  });

  it('archive and export both carry the full API-key flag set and -allowProvisioningUpdates; export uses the checked-in plist', () => {
    const archive = tf.slice(tf.indexOf('xcodebuild archive'), tf.indexOf('- name: Export and upload'));
    const exportStep = tf.slice(tf.indexOf('- name: Export and upload'), tf.indexOf('- name: Clean up'));
    for (const part of [archive, exportStep]) {
      for (const flag of ['-allowProvisioningUpdates', '-authenticationKeyPath "$RUNNER_TEMP/AuthKey.p8"', '-authenticationKeyID', '-authenticationKeyIssuerID']) expect(part).toContain(flag);
    }
    expect(archive).toMatch(/-configuration Release/);
    expect(archive).toMatch(/-destination 'generic\/platform=iOS'/);
    expect(archive).toMatch(/MARKETING_VERSION="\$MARKETING_VERSION"/);
    expect(archive).toMatch(/CURRENT_PROJECT_VERSION="\$BUILD_NUMBER"/);
    expect(archive).toMatch(/DEVELOPMENT_TEAM="\$APPLE_TEAM_ID"/);
    expect(exportStep).toMatch(/ios\/ci\/ExportOptions\.plist/);
    expect(exportStep).toMatch(/ios\/ci\/ExportOptions-manual\.plist/);
    // Each result is asserted from the log, not assumed from the exit code of a piped command.
    expect(tf).toMatch(/grep -q '\\\*\\\* ARCHIVE SUCCEEDED \\\*\\\*'/);
    expect(tf).toMatch(/grep -q '\\\*\\\* EXPORT SUCCEEDED \\\*\\\*'/);
  });

  it('clean-up is `if: always()`, removes the key, certificate, profile, keychain, archive and export', () => {
    const cleanup = tf.slice(tf.indexOf('- name: Clean up signing material'), tf.indexOf('- name: Summary'));
    expect(cleanup).toMatch(/if: always\(\)/);
    for (const needle of ['AuthKey.p8', 'dist.p12', 'profile.mobileprovision', 'security delete-keychain', 'App.xcarchive', 'export', 'IOS_PROFILE_PATH']) expect(cleanup, needle).toContain(needle);
    // and it is the last step that can touch signing material (Summary only reads logs)
    expect(tf.slice(tf.indexOf('- name: Summary'))).not.toMatch(/AuthKey|\.p12\b.*\$RUNNER_TEMP|security /);
  });

  it('manual-signing fallback only runs when the certificate secret exists; keychain is temporary and unlocked with a random password', () => {
    expect(yml).toMatch(/MANUAL_SIGNING: \$\{\{ secrets\.IOS_DIST_CERT_P12_BASE64 != '' \}\}/);
    const manual = tf.slice(tf.indexOf('- name: Import the distribution certificate'), tf.indexOf('- name: Archive'));
    expect(manual).toMatch(/if: env\.MANUAL_SIGNING == 'true'/);
    expect(manual).toMatch(/openssl rand -hex/);
    expect(manual).toMatch(/rm -f "\$RUNNER_TEMP\/dist\.p12"/);
    expect(manual).toMatch(/security import[^\n]*> \/dev\/null/); // no import chatter in the log
    expect(manual).not.toMatch(/login\.keychain/);
  });

  it('the simulator job is the M12 one: no secrets, no vars, no signing', () => {
    const sim = jobText(yml, 'simulator');
    expect(sim).not.toMatch(/secrets\.|vars\.|allowProvisioningUpdates|authenticationKey/);
    expect(sim).toContain('CODE_SIGNING_ALLOWED=NO');
  });
});

describe('M13 QC: ExportOptions plists (M13-AC1)', () => {
  const auto = read('ios/ci/ExportOptions.plist');
  const manual = read('ios/ci/ExportOptions-manual.plist');
  const val = (p: string, key: string) => new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(p)?.[1];
  it('automatic: app-store-connect, upload, automatic; no certificate or profile named', () => {
    expect(val(auto, 'method')).toBe('app-store-connect');
    expect(val(auto, 'destination')).toBe('upload');
    expect(val(auto, 'signingStyle')).toBe('automatic');
    expect(val(auto, 'teamID')).toBe('TEAM_ID_PLACEHOLDER'); // never a real team id in the repo
    expect(auto).not.toMatch(/provisioningProfiles|signingCertificate/);
    expect(auto).toMatch(/<key>manageAppVersionAndBuildNumber<\/key>\s*<false\/>/); // the workflow owns the build number
  });
  it('manual: same method/destination, manual, Apple Distribution, profile map for the bundle id', () => {
    expect(val(manual, 'method')).toBe('app-store-connect');
    expect(val(manual, 'destination')).toBe('upload');
    expect(val(manual, 'signingStyle')).toBe('manual');
    expect(val(manual, 'signingCertificate')).toBe('Apple Distribution');
    expect(manual).toMatch(/<key>provisioningProfiles<\/key>\s*<dict>\s*<key>io\.github\.minhlgm\.onepercentbetter<\/key>\s*<string>[^<]+<\/string>/);
    expect(val(manual, 'teamID')).toBe('TEAM_ID_PLACEHOLDER');
  });
});

describe('M13 QC: scripts/ios-version.mjs as the workflow runs it (M13-AC2)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qc-iosver-'));
  const run = (env: Record<string, string>) => {
    const ghEnv = join(dir, `env-${Math.random().toString(36).slice(2)}`);
    writeFileSync(ghEnv, '');
    try {
      const stdout = execFileSync(process.execPath, ['scripts/ios-version.mjs'], { cwd: root, env: { PATH: process.env.PATH ?? '', GITHUB_ENV: ghEnv, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, stdout, stderr: '', ghEnv: readFileSync(ghEnv, 'utf8') };
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      return { code: err.status, stdout: err.stdout, stderr: err.stderr, ghEnv: readFileSync(ghEnv, 'utf8') };
    }
  };
  it.each([
    [{ GITHUB_REF: 'refs/tags/ios-v2.3.4', GITHUB_RUN_NUMBER: '7' }, '2.3.4', '7'],
    [{ GITHUB_REF: 'refs/heads/main', INPUT_MARKETING_VERSION: '1.0.1', GITHUB_RUN_NUMBER: '8' }, '1.0.1', '8'],
    [{ GITHUB_REF: 'refs/heads/main', GITHUB_RUN_NUMBER: '9' }, '1.0.0', '9'],
    [{ GITHUB_REF: 'refs/heads/main', GITHUB_RUN_NUMBER: '7', IOS_BUILD_OFFSET: '100' }, '1.0.0', '107'],
    [{ GITHUB_REF: 'refs/heads/main', GITHUB_RUN_NUMBER: '7', IOS_BUILD_OFFSET: '' }, '1.0.0', '7'],
    [{ GITHUB_REF: 'refs/tags/ios-v3.0.0', INPUT_MARKETING_VERSION: '9.9.9', GITHUB_RUN_NUMBER: '1' }, '3.0.0', '1'], // the tag wins over the input
  ])('%j -> %s (%s)', (env, marketing, build) => {
    const r = run(env);
    expect(r.code).toBe(0);
    expect(r.ghEnv).toBe(`MARKETING_VERSION=${marketing}\nBUILD_NUMBER=${build}\n`);
  });
  it.each([
    [{ GITHUB_REF: 'refs/tags/ios-v1.0', GITHUB_RUN_NUMBER: '1' }, /must be X\.Y\.Z/],
    [{ GITHUB_REF: 'refs/heads/main', INPUT_MARKETING_VERSION: '1.0.0-beta', GITHUB_RUN_NUMBER: '1' }, /must be X\.Y\.Z/],
    [{ GITHUB_REF: 'refs/heads/main', INPUT_MARKETING_VERSION: '1.0.0\nINJECT=1', GITHUB_RUN_NUMBER: '1' }, /must be X\.Y\.Z/], // no $GITHUB_ENV injection through the input
    [{ GITHUB_REF: 'refs/heads/main', GITHUB_RUN_NUMBER: '0' }, /GITHUB_RUN_NUMBER/],
    [{ GITHUB_REF: 'refs/heads/main', GITHUB_RUN_NUMBER: 'abc' }, /GITHUB_RUN_NUMBER/],
    [{ GITHUB_REF: 'refs/heads/main' }, /GITHUB_RUN_NUMBER/],
    [{ GITHUB_REF: 'refs/heads/main', GITHUB_RUN_NUMBER: '7', IOS_BUILD_OFFSET: '-1' }, /IOS_BUILD_OFFSET/],
    [{ GITHUB_REF: 'refs/heads/main', GITHUB_RUN_NUMBER: '7', IOS_BUILD_OFFSET: 'x' }, /IOS_BUILD_OFFSET/],
  ])('%j -> exit 1 with a clear message, GITHUB_ENV untouched', (env, message) => {
    const r = run(env);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^ios-version: /);
    expect(r.stderr).toMatch(message);
    expect(r.ghEnv).toBe('');
  });
  it('ios/ci/version.json is a bare X.Y.Z and equals MARKETING_VERSION in the Xcode project (so a local build and the lane agree)', () => {
    const v = (JSON.parse(read('ios/ci/version.json')) as { marketingVersion: string }).marketingVersion;
    expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    const versions = [...read('ios/App/App.xcodeproj/project.pbxproj').matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map((m) => m[1]);
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([v]));
  });
});

// Minimal independent PNG reader (not the developer's module): IHDR + IDAT, 8-bit, non-interlaced.
function decodePng(file: string) {
  const buf = readFileSync(join(root, file));
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  let off = 8;
  let ihdr: Buffer | undefined;
  const idat: Buffer[] = [];
  const chunks: string[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('latin1');
    const data = buf.subarray(off + 8, off + 8 + len);
    chunks.push(type);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const width = ihdr!.readUInt32BE(0);
  const height = ihdr!.readUInt32BE(4);
  const bitDepth = ihdr!.readUInt8(8);
  const colorType = ihdr!.readUInt8(9);
  const interlace = ihdr!.readUInt8(12);
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  let prev: Buffer = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let add = 0;
      if (f === 1) add = a;
      else if (f === 2) add = b;
      else if (f === 3) add = (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = (line[i] + add) & 0xff;
    }
    line.copy(px, y * stride);
    prev = line;
  }
  const at = (x: number, y: number) => [...px.subarray(y * stride + x * channels, y * stride + x * channels + channels)];
  return { width, height, bitDepth, colorType, interlace, chunks, at, px, channels };
}

describe('M13 QC: icon and launch images (M13-AC3, M13-AC4)', () => {
  const icon = decodePng('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
  const light = decodePng('ios/App/App/Assets.xcassets/Splash.imageset/splash-light.png');
  const dark = decodePng('ios/App/App/Assets.xcassets/Splash.imageset/splash-dark.png');
  it('icon: 1024x1024, 8-bit RGB (colour type 2), no alpha chunk, no interlace, opaque white background and a visible logo', () => {
    expect([icon.width, icon.height, icon.bitDepth, icon.colorType, icon.interlace]).toEqual([1024, 1024, 8, 2, 0]);
    expect(icon.chunks).not.toContain('tRNS');
    for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023], [512, 20], [20, 512]]) expect(icon.at(x, y), `${x},${y}`).toEqual([255, 255, 255]);
    // Logo area has non-white pixels, and the artwork is horizontally and vertically centred (±12 px).
    let minX = 1024, maxX = 0, minY = 1024, maxY = 0;
    for (let y = 0; y < 1024; y += 2) for (let x = 0; x < 1024; x += 2) {
      const [r, g, b] = icon.at(x, y);
      if (r < 235 || g < 235 || b < 235) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    expect(maxX).toBeGreaterThan(minX);
    expect(Math.abs((minX + maxX) / 2 - 512)).toBeLessThanOrEqual(12);
    expect(Math.abs((minY + maxY) / 2 - 512)).toBeLessThanOrEqual(12);
    // Margin: Apple masks a rounded square; keep the artwork inside the safe 80 % (>= 100 px from every edge).
    expect(minX).toBeGreaterThanOrEqual(100);
    expect(1023 - maxX).toBeGreaterThanOrEqual(100);
    expect(minY).toBeGreaterThanOrEqual(80);
    expect(1023 - maxY).toBeGreaterThanOrEqual(80);
  });
  it('splash light/dark: 2732x2732 RGB, backgrounds #F7F6F2 / #121513, logo present at the centre', () => {
    for (const s of [light, dark]) expect([s.width, s.height, s.bitDepth, s.colorType, s.interlace]).toEqual([2732, 2732, 8, 2, 0]);
    for (const [x, y] of [[0, 0], [2731, 0], [0, 2731], [2731, 2731]]) {
      expect(light.at(x, y)).toEqual([0xf7, 0xf6, 0xf2]);
      expect(dark.at(x, y)).toEqual([0x12, 0x15, 0x13]);
    }
    for (const s of [light, dark]) {
      const bg = s.at(0, 0);
      let differs = 0;
      for (let y = 1066; y < 1666; y += 4) for (let x = 1066; x < 1666; x += 4) if (s.at(x, y).some((v, i) => Math.abs(v - bg[i]) > 12)) differs++;
      expect(differs).toBeGreaterThan(500);
    }
  });
  it('storyboard: only the Splash image on the LaunchBackground colour; no label, spinner or text; colour set has light and dark', () => {
    const sb = read('ios/App/App/Base.lproj/LaunchScreen.storyboard');
    expect(sb).toContain('image="Splash"');
    expect(sb).toContain('<color key="backgroundColor" name="LaunchBackground"/>');
    expect(sb).not.toMatch(/<label|<activityIndicatorView|<button|<textField|<progressView/);
    const cs = JSON.parse(read('ios/App/App/Assets.xcassets/LaunchBackground.colorset/Contents.json')) as { colors: Array<{ appearances?: Array<{ value: string }>; color: { components: Record<string, string> } }> };
    const hex = (c: (typeof cs.colors)[number]) => ['red', 'green', 'blue'].map((k) => c.color.components[k].replace('0x', '')).join('');
    expect(hex(cs.colors.find((c) => !c.appearances)!)).toBe('F7F6F2');
    expect(hex(cs.colors.find((c) => c.appearances?.[0].value === 'dark')!)).toBe('121513');
  });
  it('no stale template splash files remain; Contents.json files reference files that exist', () => {
    const tracked = execSync('git ls-files ios/App/App/Assets.xcassets', { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
    expect(tracked.filter((f) => /splash-2732x2732/.test(f))).toEqual([]);
    for (const set of ['AppIcon.appiconset', 'Splash.imageset']) {
      const c = JSON.parse(read(`ios/App/App/Assets.xcassets/${set}/Contents.json`)) as { images: Array<{ filename?: string }> };
      for (const img of c.images) expect(tracked, `${set}/${img.filename}`).toContain(`ios/App/App/Assets.xcassets/${set}/${img.filename}`);
    }
  });
});

describe('M13 QC: native project and secrets hygiene (M13-AC7)', () => {
  it('Info.plist: iPhone portrait only, encryption exemption declared, no permission strings, launch storyboard', () => {
    const plist = read('ios/App/App/Info.plist');
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
    expect(plist).toMatch(/<key>UILaunchStoryboardName<\/key>\s*<string>LaunchScreen<\/string>/);
    const orient = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)![1];
    expect([...orient.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1])).toEqual(['UIInterfaceOrientationPortrait']);
    expect(plist).not.toMatch(/UISupportedInterfaceOrientations~ipad|NS\w+UsageDescription|UIBackgroundModes/);
  });
  it('pbxproj: iPhone only, version 1.0.0, no team id, no profile, no entitlements', () => {
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    expect(new Set([...pbx.matchAll(/TARGETED_DEVICE_FAMILY = ([^;]+);/g)].map((m) => m[1]))).toEqual(new Set(['1']));
    expect(pbx).not.toMatch(/DEVELOPMENT_TEAM|PROVISIONING_PROFILE|CODE_SIGN_ENTITLEMENTS|SUPPORTS_MACCATALYST = YES/);
  });
  it('no key, certificate or profile is tracked; no private-key text or API-key-shaped blob in any tracked file outside docs and tests/qc', () => {
    const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
    expect(files.filter((f) => /\.(p8|p12|pfx|mobileprovision|cer|jks|keystore|pem)$/i.test(f))).toEqual([]);
    expect(files.filter((f) => f.startsWith('logo/'))).toEqual([]);
    const marker = ['-----BEGIN', ' [A-Z ]*PRIVATE KEY-----'].join('');
    const hits: string[] = [];
    for (const f of files) {
      if (f.startsWith('docs/') || f.startsWith('tests/qc/') || /\.(png|jpg|ico|woff2?)$/.test(f)) continue;
      const text = readFileSync(join(root, f), 'utf8');
      if (new RegExp(marker).test(text) || new RegExp(['MIGT', 'AgEAMBMG', 'ByqGSM49'].join('')).test(text)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });
  it('.gitignore keeps signing material and the logo folder out of the repository', () => {
    const ignore = read('.gitignore');
    for (const p of ['*.p8', '*.p12', '*.mobileprovision', '*.cer', 'logo/']) expect(ignore, p).toContain(p);
  });
  it('line endings are LF in the index (M12-D2): .gitattributes forces eol=lf', () => {
    expect(read('.gitattributes')).toMatch(/^\* text=auto eol=lf$/m);
    const out = execSync('git ls-files --eol ios/ci .github/workflows supabase/migrations package.json', { cwd: root, encoding: 'utf8' });
    expect(out).not.toMatch(/i\/crlf|i\/mixed/);
  });
});
