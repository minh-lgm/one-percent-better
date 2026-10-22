// QC M15 r1 — independent checks of the App Store listing against DESIGN.md itself (the text is parsed from
// docs/design/DESIGN.md at run time, not copied from the developer's own test), demo fixtures regenerated from the
// DESIGN formulas, JPEG headers, privacy manifest, Package.swift / package.json.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBackup } from '../../src/domain/backup';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const DESIGN = read('docs/design/DESIGN.md').replace(/\r\n/g, '\n');

const sect = DESIGN.slice(DESIGN.indexOf('#### 7.8.7'), DESIGN.indexOf('#### 7.8.8'));

/** The fenced block that follows the line containing `marker` inside the 7.8.7 section, split into [en-US]/[vi]. */
function block(marker: string): { en: string; vi: string } {
  const at = sect.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const start = sect.indexOf('```text\n', at) + '```text\n'.length;
  const end = sect.indexOf('\n```', start);
  const body = sect.slice(start, end);
  const i = body.indexOf('[en-US]\n');
  const j = body.indexOf('\n\n[vi]\n');
  expect(i).toBe(0);
  expect(j).toBeGreaterThan(0);
  return { en: body.slice('[en-US]\n'.length, j), vi: body.slice(j + '\n\n[vi]\n'.length) };
}

/** A table row of 7.8.7: | `file` | `en` | measure | `vi` | measure |. */
function row(file: string): { en: string; vi: string } {
  const line = sect.split('\n').find((l) => l.startsWith(`| \`${file}\``));
  expect(line, file).toBeDefined();
  const cells = line!.split(/ \| /).map((c) => c.replace(/^\| | \|$/g, '').trim());
  const strip = (c: string) => c.replace(/^`|`$/g, '');
  return { en: strip(cells[1]), vi: cells[3].startsWith('(giống') ? strip(cells[1]) : strip(cells[3]) };
}

const meta = (loc: 'en-US' | 'vi', f: string) => readFileSync(join(ROOT, 'store/ios/metadata', loc, `${f}.txt`));
const text = (loc: 'en-US' | 'vi', f: string) => meta(loc, f).toString('utf8');

describe('M15 QC — store metadata is byte-for-byte the DESIGN 7.8.7 text', () => {
  for (const [loc, key] of [['en-US', 'en'], ['vi', 'vi']] as const) {
    for (const f of ['name', 'subtitle', 'promotional_text', 'keywords', 'support_url', 'privacy_url']) {
      it(`${loc}/${f}.txt`, () => {
        expect(text(loc, f)).toBe(row(`${f}.txt`)[key]);
      });
    }
    for (const [f, marker] of [['description', '`description.txt` ('], ['release_notes', '`release_notes.txt` ('], ['review_notes', '`review_notes.txt` (']] as const) {
      it(`${loc}/${f}.txt`, () => {
        expect(text(loc, f)).toBe(block(marker)[key]);
      });
    }
  }

  it('exactly the 9 files per locale, UTF-8 with no BOM, no CR, no trailing newline', () => {
    for (const loc of ['en-US', 'vi'] as const) {
      const names = readdirSync(join(ROOT, 'store/ios/metadata', loc)).sort();
      expect(names).toEqual(['description', 'keywords', 'name', 'privacy_url', 'promotional_text', 'release_notes', 'review_notes', 'subtitle', 'support_url'].map((n) => `${n}.txt`));
      for (const n of names) {
        const buf = readFileSync(join(ROOT, 'store/ios/metadata', loc, n));
        expect(buf.length, n).toBeGreaterThan(0);
        expect(buf[0] === 0xef && buf[1] === 0xbb, `${loc}/${n} BOM`).toBe(false);
        expect(buf.includes(0x0d), `${loc}/${n} CR`).toBe(false);
        expect(buf.at(-1), `${loc}/${n} trailing newline`).not.toBe(0x0a);
        // valid UTF-8 round trip
        expect(Buffer.from(buf.toString('utf8'), 'utf8').equals(buf)).toBe(true);
      }
    }
  });

  it('Apple limits (Unicode code points; keywords in bytes)', () => {
    const cp = (s: string) => [...s].length;
    for (const loc of ['en-US', 'vi'] as const) {
      expect(cp(text(loc, 'name'))).toBeLessThanOrEqual(30);
      expect(cp(text(loc, 'subtitle'))).toBeLessThanOrEqual(30);
      expect(cp(text(loc, 'promotional_text'))).toBeLessThanOrEqual(170);
      expect(cp(text(loc, 'description'))).toBeLessThanOrEqual(4000);
      expect(cp(text(loc, 'release_notes'))).toBeLessThanOrEqual(4000);
      expect(meta(loc, 'keywords').length).toBeLessThanOrEqual(100);
      // Keywords: comma separated, no space around commas, no duplicates, no app name words repeated.
      const kws = text(loc, 'keywords').split(',');
      expect(kws.every((k) => k === k.trim() && k.length > 0)).toBe(true);
      expect(new Set(kws.map((k) => k.toLowerCase())).size).toBe(kws.length);
      expect(text(loc, 'keywords').toLowerCase()).not.toMatch(/1% better|better per day/);
    }
    // The measures DESIGN prints.
    expect([cp(text('en-US', 'name')), cp(text('en-US', 'subtitle')), cp(text('vi', 'subtitle'))]).toEqual([17, 25, 24]);
    expect([meta('en-US', 'keywords').length, meta('vi', 'keywords').length]).toEqual([94, 84]);
    expect(cp(text('en-US', 'promotional_text'))).toBe(143);
    expect(cp(text('vi', 'promotional_text'))).toBeGreaterThanOrEqual(155);
    expect(cp(text('vi', 'promotional_text'))).toBeLessThanOrEqual(170);
  });

  it('no Android / beta / price / free; review notes carry the Delete-account path and the no-sign-in statement', () => {
    for (const loc of ['en-US', 'vi'] as const) {
      for (const f of ['name', 'subtitle', 'promotional_text', 'description', 'keywords', 'release_notes', 'review_notes']) {
        const t = text(loc, f);
        expect(t, `${loc}/${f}`).not.toMatch(/android|\bbeta\b|\$\s?\d|\bfree\b|miễn phí|\busd\b|\bvnd\b/i);
      }
    }
    expect(text('en-US', 'review_notes')).toContain('Settings > Account > Delete account');
    expect(text('en-US', 'review_notes')).toContain('No sign-in is required');
    expect(text('vi', 'review_notes')).toContain('Không cần đăng nhập');
    expect(text('vi', 'review_notes')).toContain('Cài đặt > Tài khoản > Xóa tài khoản');
    expect(text('en-US', 'support_url')).toBe('https://minh-lgm.github.io/one-percent-better/support.html');
    expect(text('en-US', 'privacy_url')).toBe('https://minh-lgm.github.io/one-percent-better/privacy.html');
  });
});

// ---- Demo fixtures: regenerate from the DESIGN 7.8.8 rules, compare with the committed files ----

const dayOfYear = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
};
const daysBetween = (a: string, b: string) => {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(b) - t(a)) / 86400000);
};
const addDay = (iso: string, n: number) => {
  const dt = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000);
  return dt.toISOString().slice(0, 10);
};

interface Rule { id: string; start: string; end: string; skip: (n: number, i: number) => boolean; minutes: (n: number, i: number) => number; today?: { minutes: number } }
const RULES: Rule[] = [
  { id: 'demo-read', start: '2026-01-01', end: '2026-10-08', skip: (n) => n % 7 === 3, minutes: (n) => 15 + 5 * (n % 6), today: { minutes: 30 } },
  { id: 'demo-guitar', start: '2026-08-01', end: '2026-10-08', skip: (_n, i) => i % 6 === 5, minutes: (_n, i) => 8 + Math.floor(i / 5) + (i % 2), today: { minutes: 22 } },
  { id: 'demo-spanish', start: '2026-06-01', end: '2026-10-08', skip: (_n, i) => i % 5 === 4, minutes: (_n, i) => 10 + 5 * (i % 3), today: { minutes: 10 } },
  { id: 'demo-stretch', start: '2026-09-01', end: '2026-09-30', skip: (_n, i) => i % 4 === 3, minutes: () => 10 },
];

describe('M15 QC — demo fixtures follow the DESIGN 7.8.8 generation rules', () => {
  for (const [loc, file] of [['en', 'demo-en.json'], ['vi', 'demo-vi.json']] as const) {
    const raw = read(`store/fixtures/${file}`);
    const data = JSON.parse(raw) as { schemaVersion: number; exportedAt: string; goals: Array<Record<string, unknown>>; entries: Array<Record<string, unknown>>; settings: Record<string, unknown> };

    it(`${file}: imports through the app's own parseBackup`, () => {
      const r = parseBackup(raw, Buffer.byteLength(raw, 'utf8'), '2026-10-09');
      expect(r.ok, JSON.stringify(r)).toBe(true);
    });

    it(`${file}: header, goals`, () => {
      expect(data.schemaVersion).toBe(1);
      expect(data.exportedAt).toBe('2026-10-09T12:30:00.000Z');
      expect(data.goals.map((g) => g.id)).toEqual(['demo-read', 'demo-guitar', 'demo-spanish', 'demo-piano', 'demo-stretch']);
      expect(data.goals.map((g) => [g.targetMinutes, g.startDate, g.endDate])).toEqual([
        [30, '2026-01-01', '2026-12-31'], [20, '2026-08-01', '2026-12-31'], [15, '2026-06-01', null], [25, '2026-11-01', '2026-12-31'], [10, '2026-09-01', '2026-09-30'],
      ]);
      expect(data.goals.every((g) => g.archived === false && g.targetType === 'daily')).toBe(true);
      const names = data.goals.map((g) => g.name);
      expect(names).toEqual(loc === 'en' ? ['Read', 'Guitar', 'Spanish', 'Piano', 'Stretch'] : ['Đọc sách', 'Guitar', 'Tiếng Tây Ban Nha', 'Piano', 'Giãn cơ']);
      for (const g of data.goals) {
        expect(String(g.name).length).toBeLessThanOrEqual(60);
        expect(String(g.why).length).toBeLessThanOrEqual(280);
      }
    });

    it(`${file}: entries equal the independently regenerated set`, () => {
      const want = new Map<string, { goalId: string; date: string; minutes: number; note: string }>();
      for (const r of RULES) {
        const last = r.id === 'demo-stretch' ? r.end : r.end;
        for (let d = r.start; d <= last; d = addDay(d, 1)) {
          const n = dayOfYear(d);
          const i = daysBetween(r.start, d);
          if (r.skip(n, i)) continue;
          want.set(`e-${r.id}-${d.replaceAll('-', '')}`, { goalId: r.id, date: d, minutes: r.minutes(n, i), note: '' });
        }
        if (r.today) want.set(`e-${r.id}-20261009`, { goalId: r.id, date: '2026-10-09', minutes: r.today.minutes, note: '' });
      }
      const notes = loc === 'en' ? { 'demo-read': 'Chapter 12', 'demo-guitar': 'Scales and chorus', 'demo-spanish': 'Lesson 8' } : { 'demo-read': 'Chương 12', 'demo-guitar': 'Gam và điệp khúc', 'demo-spanish': 'Bài 8' };
      for (const [g, note] of Object.entries(notes)) want.get(`e-${g}-20261009`)!.note = note;

      const got = new Map(data.entries.map((e) => [e.id as string, e]));
      expect(got.size).toBe(data.entries.length); // unique ids
      expect([...got.keys()].sort()).toEqual([...want.keys()].sort());
      for (const [id, w] of want) {
        const e = got.get(id)!;
        expect({ goalId: e.goalId, date: e.date, minutes: e.minutes, note: e.note, source: e.source }, id).toEqual({ ...w, source: 'manual' });
        expect(e.minutes as number).toBeGreaterThanOrEqual(1);
        expect(e.minutes as number).toBeLessThanOrEqual(1440);
        expect((e.date as string) <= '2026-10-09').toBe(true);
      }
    });

    it(`${file}: DESIGN check values`, () => {
      const m = (id: string, d: string) => data.entries.find((e) => e.id === `e-${id}-${d}`)?.minutes;
      expect(m('demo-read', '20260101')).toBe(20);
      expect(m('demo-read', '20260103')).toBeUndefined();
      expect(m('demo-read', '20261008')).toBe(40);
      expect(m('demo-guitar', '20260801')).toBe(8);
      expect(m('demo-guitar', '20260806')).toBeUndefined();
      expect(m('demo-guitar', '20261008')).toBe(21);
      expect(m('demo-guitar', '20261009')).toBe(22);
      expect(m('demo-spanish', '20260601')).toBe(10);
      expect(m('demo-spanish', '20260605')).toBeUndefined();
      expect(m('demo-spanish', '20261009')).toBe(10);
      expect(m('demo-stretch', '20260901')).toBe(10);
      expect(m('demo-stretch', '20260904')).toBeUndefined();
      expect(data.entries.some((e) => e.goalId === 'demo-piano')).toBe(false);
      expect(data.settings.lastBackupAt).toBe('2026-10-05T12:00:00.000Z');
      expect(data.settings.reminderEnabled).toBe(false);
    });
  }
});

// ---- Screenshots: JPEG headers ----

function jpegInfo(buf: Buffer) {
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  let p = 2;
  while (p < buf.length) {
    if (buf[p] !== 0xff) { p += 1; continue; }
    const marker = buf[p + 1];
    if (marker === 0xff) { p += 1; continue; }
    const len = buf.readUInt16BE(p + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { sof: marker, precision: buf[p + 4], h: buf.readUInt16BE(p + 5), w: buf.readUInt16BE(p + 7), comps: buf[p + 9] };
    }
    p += 2 + len;
  }
  throw new Error('no SOF');
}

describe('M15 QC — screenshots are real 1320x2868 JPEG without alpha', () => {
  for (const loc of ['en-US', 'vi']) {
    for (const n of ['01-today', '02-timer', '03-curve', '04-review', '05-goals']) {
      it(`${loc}/${n}.jpg`, () => {
        const f = join(ROOT, 'store/ios/screenshots', loc, `${n}.jpg`);
        const buf = readFileSync(f);
        const i = jpegInfo(buf);
        expect([i.w, i.h]).toEqual([1320, 2868]);
        expect(i.precision).toBe(8);
        expect(i.comps).toBe(3); // YCbCr: no alpha channel exists in JPEG; 3 components = colour image
        expect(buf.at(-2)).toBe(0xff);
        expect(buf.at(-1)).toBe(0xd9); // EOI: not truncated
        expect(statSync(f).size).toBeLessThan(8 * 1024 * 1024);
      });
    }
  }
  it('exactly 5 files per locale, no stray files', () => {
    for (const loc of ['en-US', 'vi']) {
      expect(readdirSync(join(ROOT, 'store/ios/screenshots', loc)).sort()).toEqual(['01-today.jpg', '02-timer.jpg', '03-curve.jpg', '04-review.jpg', '05-goals.jpg']);
    }
  });
});

// ---- Privacy manifest: parse the plist XML independently ----

describe('M15 QC — PrivacyInfo.xcprivacy and Info.plist', () => {
  const xml = read('ios/App/App/PrivacyInfo.xcprivacy').replace(/<!--[\s\S]*?-->/g, '');
  it('is well-formed plist XML (balanced tags)', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    const stack: string[] = [];
    for (const m of xml.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
      const [, close, tag, , selfClose] = m;
      if (selfClose) continue;
      if (close) expect(stack.pop(), `closing ${tag}`).toBe(tag);
      else stack.push(tag);
    }
    expect(stack).toEqual([]);
  });
  it('declares no tracking, no domains, 4 linked app-functionality types, and exactly the two required-reason APIs', () => {
    expect(xml).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(xml).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
    const types = [...xml.matchAll(/<string>(NSPrivacyCollectedDataType[A-Za-z]+)<\/string>/g)].map((m) => m[1]).filter((s) => !s.includes('Purpose'));
    expect(types.sort()).toEqual(['NSPrivacyCollectedDataTypeEmailAddress', 'NSPrivacyCollectedDataTypeName', 'NSPrivacyCollectedDataTypeOtherUserContent', 'NSPrivacyCollectedDataTypeUserID']);
    expect((xml.match(/NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\/>/g) ?? []).length).toBe(4);
    expect((xml.match(/NSPrivacyCollectedDataTypeTracking<\/key>\s*<false\/>/g) ?? []).length).toBe(4);
    expect((xml.match(/NSPrivacyCollectedDataTypePurposeAppFunctionality/g) ?? []).length).toBe(4);
    const apis = [...xml.matchAll(/<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>([^<]+)<\/string>/g)].map((m) => `${m[1]}=${m[2]}`);
    expect(apis).toEqual(['NSPrivacyAccessedAPICategoryUserDefaults=CA92.1', 'NSPrivacyAccessedAPICategoryFileTimestamp=C617.1']);
  });
  it('the app and plugin Swift sources use no required-reason API beyond UserDefaults / file timestamps', () => {
    const roots = ['ios/App/App'];
    const plugins = readdirSync(join(ROOT, 'node_modules/@capacitor')).filter((d) => ['app', 'filesystem', 'keyboard', 'local-notifications', 'share', 'splash-screen', 'status-bar'].includes(d)).map((d) => `node_modules/@capacitor/${d}/ios`);
    plugins.push('node_modules/@capgo/capacitor-social-login/ios');
    const walk = (dir: string): string[] => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(join(dir, e.name))) : e.name.endsWith('.swift') ? [join(dir, e.name)] : [])) : []);
    const forbidden = /systemUptime|mach_absolute_time|systemFreeSize|volumeAvailableCapacity|NSFileSystemFreeSize|NSFileSystemSize|statfs|activeInputModes|getattrlist|\bfstat\b|\blstat\b/;
    for (const f of [...roots, ...plugins].flatMap(walk)) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(forbidden);
    }
  });
  it('Info.plist: encryption flag false, no tracking / background / sensor keys', () => {
    const p = read('ios/App/App/Info.plist');
    expect(p).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
    expect(p).not.toMatch(/NSUserTrackingUsageDescription|UIBackgroundModes|NSCameraUsageDescription|NSPhotoLibrary|NSLocation|NSContactsUsageDescription|NSMicrophone|NSHealth|NSFaceID/);
  });
  it('pbxproj registers the manifest (file reference, build file, group child, Resources phase of App)', () => {
    const p = read('ios/App/App.xcodeproj/project.pbxproj');
    const ref = /([0-9A-F]{24}) \/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference/.exec(p)?.[1];
    expect(ref).toBeTruthy();
    const bf = new RegExp(`([0-9A-F]{24}) /\\* PrivacyInfo\\.xcprivacy in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ${ref}`).exec(p)?.[1];
    expect(bf).toBeTruthy();
    const resources = /\/\* Resources \*\/ = \{\s*isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/.exec(p)?.[1] ?? '';
    expect(resources).toContain(bf!);
    expect(p).toMatch(new RegExp(`children = \\([^)]*${ref}`));
  });
});

describe('M15 QC — plugin list: Package.swift == runtime plugins of package.json (8 after M15)', () => {
  it('equal sets, includes local-notifications 8.3.1 exact pin', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    const runtime = Object.keys(pkg.dependencies).filter((d) => /^@capacitor\/(?!core$|ios$|android$|cli$)|^@capgo\//.test(d)).sort();
    const swift = read('ios/App/CapApp-SPM/Package.swift');
    const inSwift = [...swift.matchAll(/\.package\(name: "[^"]+", path: "\.\.\/\.\.\/\.\.\/node_modules\/([^"]+)"\)/g)].map((m) => m[1]).sort();
    expect(inSwift).toEqual(runtime);
    expect(runtime).toHaveLength(8);
    expect(pkg.dependencies['@capacitor/local-notifications']).toBe('8.3.1');
  });
});
