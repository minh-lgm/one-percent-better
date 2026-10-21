// M12-AC8: static checks of .github/workflows/ios.yml (ARCHITECTURE §5.14). The workflow only runs on GitHub's
// macOS runner, so the YAML is checked as text here (no YAML dependency in the project).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// M12-D2: normalise CRLF so a Windows checkout with core.autocrlf=true reads the same text.
const readLf = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const yml = readLf('.github/workflows/ios.yml');
const lines = yml.split('\n');

/** Text of one top-level job (from `  <name>:` to the next job at the same indentation). */
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

describe('.github/workflows/ios.yml', () => {
  it('triggers: workflow_dispatch with a `lane` choice (simulator | testflight, default simulator) and tags ios-v*', () => {
    expect(yml).toMatch(/^on:\n\s+workflow_dispatch:/m);
    expect(yml).toMatch(/lane:\n(?:\s+.*\n)*?\s+type: choice/);
    expect(yml).toMatch(/options: \[simulator, testflight\]/);
    expect(yml).toMatch(/lane:\n(?:\s+.*\n)*?\s+default: simulator/);
    expect(yml).toMatch(/push:\n\s+tags: \['ios-v\*'\]/);
  });

  it('permissions: contents read only; not a Pages deploy', () => {
    expect(yml).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(yml).not.toMatch(/pages: write|id-token: write|deploy-pages/);
  });

  describe('job simulator', () => {
    const sim = job('simulator');
    it('runs on macos-26 with a bounded timeout, only for the simulator lane', () => {
      expect(sim).toContain('runs-on: macos-26');
      const timeout = Number(/timeout-minutes: (\d+)/.exec(sim)?.[1]);
      expect(timeout).toBeGreaterThan(0);
      expect(timeout).toBeLessThanOrEqual(60);
      expect(sim).toMatch(/if: github\.event_name == 'workflow_dispatch' && inputs\.lane == 'simulator'/);
    });
    it('node from .nvmrc with the npm cache, then npm ci', () => {
      expect(sim).toContain('node-version-file: .nvmrc');
      expect(sim).toContain('cache: npm');
      expect(sim).toMatch(/- run: npm ci$/m);
    });
    it('verifies Xcode 26 (and switches to one if the default is older)', () => {
      expect(sim).toContain('xcodebuild -version');
      expect(sim).toMatch(/grep -q '\^Xcode 26\\\.'/);
      expect(sim).toContain('sudo xcode-select -s');
    });
    it('builds the web assets, syncs Capacitor and builds for the simulator without signing', () => {
      expect(sim).toContain('npm run build:native');
      expect(sim).toContain('npx cap sync ios');
      expect(sim).toContain('-sdk iphonesimulator');
      expect(sim).toContain("-destination 'generic/platform=iOS Simulator'");
      expect(sim).toContain('CODE_SIGNING_ALLOWED=NO');
      expect(sim).toContain('-project ios/App/App.xcodeproj');
      expect(sim).toContain('-scheme App');
      expect(sim).toContain('BUILD SUCCEEDED');
    });
    it('uses no secrets other than the optional public Supabase build variables', () => {
      const secrets = [...sim.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
      expect(secrets.filter((s) => !['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].includes(s))).toEqual([]);
    });
    it('the build order inside the job is: npm ci → Xcode check → build:native → cap sync → xcodebuild', () => {
      const idx = (s: string) => sim.indexOf(s);
      expect(idx('npm ci')).toBeLessThan(idx('xcodebuild -version'));
      expect(idx('xcodebuild -version')).toBeLessThan(idx('npm run build:native'));
      expect(idx('npm run build:native')).toBeLessThan(idx('npx cap sync ios'));
      expect(idx('npx cap sync ios')).toBeLessThan(idx('-sdk iphonesimulator'));
    });
  });

  it('actions/checkout and actions/setup-node are @v5 in both workflows (Node 20 runtime deprecation seen on run 39624708770)', () => {
    for (const rel of ['.github/workflows/ios.yml', '.github/workflows/pages.yml']) {
      const text = readLf(rel);
      const uses = [...text.matchAll(/uses: (actions\/(?:checkout|setup-node))@(v\d+)/g)].map((m) => `${m[1]}@${m[2]}`);
      expect(uses.length, rel).toBeGreaterThan(0);
      for (const u of uses) expect(u, rel).toMatch(/@v5$/);
    }
  });

  it('pages.yml still deploys from dist with the same steps (only the action majors changed in M13)', () => {
    const pages = readLf('.github/workflows/pages.yml');
    expect(pages).toContain('path: dist\n');
    expect(pages).not.toContain('native');
    expect(pages).not.toContain('capacitor');
  });
});
