// M13-AC1: static checks of the `testflight` job in .github/workflows/ios.yml (ARCHITECTURE §5.14, ADR-38,
// NFR-22). The lane only runs on GitHub's macOS runner; here the YAML is checked as text (no YAML dependency).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const yml = readFileSync(join(process.cwd(), '.github/workflows/ios.yml'), 'utf8').replace(/\r\n/g, '\n');
const lines = yml.split('\n');

function job(name: string): string {
  const start = lines.findIndex((l) => l === `  ${name}:`);
  expect(start, `job ${name}`).toBeGreaterThan(-1);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}[A-Za-z_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** Steps of a job in order: `{ name, text }` (name = `name:` or the `run:` one-liner). */
function steps(jobText: string): Array<{ name: string; text: string }> {
  const parts = jobText.split(/\n(?= {6}- )/).slice(1);
  return parts.map((text) => ({ name: /name: (.*)/.exec(text)?.[1] ?? /- run: (.*)/.exec(text)?.[1] ?? /- uses: (.*)/.exec(text)?.[1] ?? '?', text }));
}

const tf = job('testflight');
const tfSteps = steps(tf);
const stepIndex = (needle: string | RegExp) => tfSteps.findIndex((s) => (typeof needle === 'string' ? s.text.includes(needle) : needle.test(s.text)));
const step = (needle: string | RegExp) => tfSteps[stepIndex(needle)]?.text ?? '';

describe('ios.yml job testflight (M13-AC1)', () => {
  it('runs only for this repository, on the testflight lane or an ios-v* tag; macos-26; timeout ≤ 60; release concurrency', () => {
    const cond = /^ {4}if: (.*)$/m.exec(tf)?.[1] ?? '';
    expect(cond).toContain("github.repository == 'minh-lgm/one-percent-better'");
    expect(cond).toContain("github.event_name == 'workflow_dispatch' && inputs.lane == 'testflight'");
    expect(cond).toContain("startsWith(github.ref, 'refs/tags/ios-v')");
    expect(tf).toContain('runs-on: macos-26');
    const timeout = Number(/timeout-minutes: (\d+)/.exec(tf)?.[1]);
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(60);
    expect(tf).toMatch(/concurrency:\n\s+group: ios-release\n\s+cancel-in-progress: false/);
  });

  it('step order: npm ci → lint → typecheck → test → Xcode 26 → build:native → cap sync → ios-version → key → archive → export → cleanup', () => {
    const order = [
      'npm ci',
      'npm run lint',
      'npm run typecheck',
      /- run: npm test$/m,
      "grep -q '^Xcode 26\\.'",
      'npm run build:native',
      'npx cap sync ios',
      'node scripts/ios-version.mjs',
      'AuthKey.p8',
      'xcodebuild archive',
      'xcodebuild -exportArchive',
      'Clean up signing material',
    ].map(stepIndex);
    for (let i = 1; i < order.length; i += 1) expect(order[i], `step ${i}`).toBeGreaterThan(order[i - 1]);
  });

  it('archive: Release, generic iOS destination, -allowProvisioningUpdates + the three API-key flags, team/version/build from env, automatic signing by default', () => {
    const archive = step('xcodebuild archive');
    expect(archive).toContain('-configuration Release');
    expect(archive).toContain("-destination 'generic/platform=iOS'");
    expect(archive).toContain('-allowProvisioningUpdates');
    expect(archive).toContain('-authenticationKeyPath "$RUNNER_TEMP/AuthKey.p8"');
    expect(archive).toContain('-authenticationKeyID "$APP_STORE_CONNECT_API_KEY_ID"');
    expect(archive).toContain('-authenticationKeyIssuerID "$APP_STORE_CONNECT_API_ISSUER_ID"');
    expect(archive).toContain('DEVELOPMENT_TEAM="$APPLE_TEAM_ID"');
    expect(archive).toContain('MARKETING_VERSION="$MARKETING_VERSION"');
    expect(archive).toContain('CURRENT_PROJECT_VERSION="$BUILD_NUMBER"');
    expect(archive).toContain('CODE_SIGN_STYLE=Automatic');
    expect(archive).toContain('ARCHIVE SUCCEEDED');
  });

  it('export: ExportOptions.plist with teamID replaced at run time, upload destination, same auth flags', () => {
    const exp = step('xcodebuild -exportArchive');
    expect(exp).toContain('plutil -replace teamID -string "$APPLE_TEAM_ID"');
    expect(exp).toContain('ios/ci/ExportOptions.plist');
    expect(exp).toContain('ios/ci/ExportOptions-manual.plist');
    expect(exp).toContain('-exportOptionsPlist "$RUNNER_TEMP/ExportOptions.plist"');
    expect(exp).toContain('-allowProvisioningUpdates');
    expect(exp).toContain('-authenticationKeyPath "$RUNNER_TEMP/AuthKey.p8"');
    expect(exp).toContain('-authenticationKeyID');
    expect(exp).toContain('-authenticationKeyIssuerID');
    expect(exp).toContain('EXPORT SUCCEEDED');
  });

  it('API key: decoded from the base64 secret into $RUNNER_TEMP with umask 077 / chmod 600, validated by openssl, never printed', () => {
    const key = step('AuthKey.p8');
    expect(key).toContain('umask 077');
    expect(key).toContain('base64 --decode > "$RUNNER_TEMP/AuthKey.p8"');
    expect(key).toContain('chmod 600 "$RUNNER_TEMP/AuthKey.p8"');
    expect(key).toContain('openssl pkey -in "$RUNNER_TEMP/AuthKey.p8" -noout');
    expect(key).toMatch(/KEY_B64: \$\{\{ secrets\.APP_STORE_CONNECT_API_KEY_P8_BASE64 \}\}/);
  });

  it('cleanup step runs `if: always()` and removes the key, the temporary keychain and the installed profile', () => {
    const clean = step('Clean up signing material');
    expect(clean).toMatch(/if: always\(\)/);
    expect(clean).toContain('rm -f "$RUNNER_TEMP/AuthKey.p8"');
    expect(clean).toContain('security delete-keychain "$IOS_KEYCHAIN"');
    expect(clean).toContain('rm -f "$IOS_PROFILE_PATH"');
  });

  it('manual-signing fallback (U17b) only when IOS_DIST_CERT_P12_BASE64 is set; temporary keychain; profile installed; Manual code signing', () => {
    expect(tf).toMatch(/MANUAL_SIGNING: \$\{\{ secrets\.IOS_DIST_CERT_P12_BASE64 != '' \}\}/);
    const manual = step('security create-keychain');
    expect(manual).toMatch(/if: env\.MANUAL_SIGNING == 'true'/);
    expect(manual).toContain('security import "$RUNNER_TEMP/dist.p12"');
    expect(manual).toContain('rm -f "$RUNNER_TEMP/dist.p12"');
    expect(manual).toContain('Provisioning Profiles');
    expect(manual).toMatch(/P12_B64: \$\{\{ secrets\.IOS_DIST_CERT_P12_BASE64 \}\}/);
    expect(manual).toMatch(/PROFILE_B64: \$\{\{ secrets\.IOS_PROVISIONING_PROFILE_BASE64 \}\}/);
    const archive = step('xcodebuild archive');
    expect(archive).toContain('CODE_SIGN_STYLE=Manual');
    expect(archive).toContain('CODE_SIGN_IDENTITY=Apple Distribution');
    expect(archive).toContain('PROVISIONING_PROFILE_SPECIFIER=$IOS_PROFILE_NAME');
    expect(archive).toMatch(/if \[ "\$MANUAL_SIGNING" = "true" \]/);
  });

  it('secrets are only the documented ones (U18, U17b) and reach steps through env, never through echo/cat', () => {
    const secrets = new Set([...yml.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect([...secrets].sort()).toEqual(
      [
        'APPLE_TEAM_ID',
        'APP_STORE_CONNECT_API_ISSUER_ID',
        'APP_STORE_CONNECT_API_KEY_ID',
        'APP_STORE_CONNECT_API_KEY_P8_BASE64',
        'IOS_DIST_CERT_P12_BASE64',
        'IOS_DIST_CERT_PASSWORD',
        'IOS_PROVISIONING_PROFILE_BASE64',
        'VITE_SUPABASE_PUBLISHABLE_KEY',
        'VITE_SUPABASE_URL',
      ].sort(),
    );
    expect(yml).not.toMatch(/echo[^\n]*\$\{\{\s*secrets\./);
    expect(yml).not.toMatch(/\bcat\b[^\n]*(AuthKey|\.p8|\.p12|mobileprovision|KEY_B64|P12_B64|PROFILE_B64)/);
    expect(yml).not.toMatch(/echo[^\n]*(KEY_B64|P12_B64|PROFILE_B64|P12_PASSWORD)/);
    expect(yml).not.toMatch(/set -x/);
    // Every `${{ secrets.* }}` is an env assignment (`NAME: ${{ secrets.X }}`), never inline in a run script.
    for (const line of lines.filter((l) => l.includes('${{ secrets.'))) expect(line).toMatch(/^\s+[A-Z0-9_]+: \$\{\{ secrets\.[A-Z0-9_]+( != '')? \}\}$/);
  });

  it('no artifact upload of the IPA / keys, no Pages deploy, contents: read only', () => {
    expect(yml).not.toContain('actions/upload-artifact');
    expect(yml).not.toMatch(/\.ipa/);
    expect(yml).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(yml).not.toMatch(/pages: write|id-token: write|deploy-pages/);
  });

  it('build-time env: Supabase from secrets, Google client ids from variables, GOOGLE_IOS_URL_SCHEME variable with a placeholder default', () => {
    expect(tf).toMatch(/VITE_SUPABASE_URL: \$\{\{ secrets\.VITE_SUPABASE_URL \}\}/);
    expect(tf).toMatch(/VITE_GOOGLE_WEB_CLIENT_ID: \$\{\{ vars\.VITE_GOOGLE_WEB_CLIENT_ID \}\}/);
    expect(tf).toMatch(/VITE_GOOGLE_IOS_CLIENT_ID: \$\{\{ vars\.VITE_GOOGLE_IOS_CLIENT_ID \}\}/);
    expect(tf).toMatch(/GOOGLE_IOS_URL_SCHEME: \$\{\{ vars\.GOOGLE_IOS_URL_SCHEME \}\}/);
    expect(tf).toContain('com.googleusercontent.apps.placeholder');
    expect(tf).toMatch(/IOS_BUILD_OFFSET: \$\{\{ vars\.IOS_BUILD_OFFSET \}\}/);
    expect(tf).toMatch(/INPUT_MARKETING_VERSION: \$\{\{ inputs\.marketing_version \}\}/);
  });

  it('the simulator job is unchanged by the new lane (still no secrets)', () => {
    const sim = job('simulator');
    expect(sim).not.toContain('secrets.');
    expect(sim).toContain('CODE_SIGNING_ALLOWED=NO');
  });
});
