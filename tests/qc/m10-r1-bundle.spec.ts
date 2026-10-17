// QC M10 round 1 - M10-AC1 / AC3 / AC6(3), measured independently of the developer's helper (e2e/helpers/bundle.ts):
//  - the static import graph of dist/ and dist-cloud-e2e/ starting at index.html contains no zod, no SDK, no charts
//  - cold #/today request log (EVERY resource type, not only text) stays under 230 000 gzip bytes
//  - Import: lazy chunk precached by the service worker (cache storage really holds it), offline Import works,
//    and a chunk that fails to load gives the generic read error, then Import works again once the chunk is reachable
import { expect, test } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { gzipSync } from 'node:zlib';
import { BASE_URL } from '../../playwright.config';
import { EN, chooseBackupFile, expectAmount, freezeClock, gotoHash, importBackup, toast } from '../../e2e/helpers/app';

const ROOT = process.cwd();
const ZOD_FINGERPRINTS = ['ZodError', 'invalid_union', 'too_small'];

function staticGraph(dist: string): { files: string[]; all: string[] } {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const entry = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) => m[1]!);
  expect(entry.length).toBeGreaterThan(0);
  const seen = new Set<string>();
  const queue = entry.map((u) => posix.normalize(u.replace(/^\/one-percent-better\//, '/').replace(/^\//, '')));
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(join(dist, f), 'utf8');
    // static imports only: `from"./x.js"` and bare `import"./x.js"`; dynamic `import("./x.js")` has parentheses.
    for (const m of src.matchAll(/(?:from|import)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) queue.push(posix.normalize(posix.join(posix.dirname(f), m[1]!)));
  }
  return { files: [...seen].sort(), all: readdirSync(join(dist, 'assets')).filter((n) => n.endsWith('.js')).map((n) => `assets/${n}`) };
}

for (const [label, dist] of [['cloud-off dist/', 'dist'], ['cloud-on dist-cloud-e2e/', 'dist-cloud-e2e']] as const) {
  test(`M10-AC1 static graph (${label}): nothing reachable from index.html statically contains zod; the zod chunk exists and is lazy`, () => {
    test.skip(!existsSync(join(ROOT, dist, 'index.html')), `${dist} not built`);
    const g = staticGraph(join(ROOT, dist));
    const withZod = g.all.filter((f) => ZOD_FINGERPRINTS.every((p) => readFileSync(join(ROOT, dist, f), 'utf8').includes(p)));
    console.log(`[qc-graph ${label}] static closure: ${g.files.join(', ')}`);
    console.log(`[qc-graph ${label}] chunks with zod: ${withZod.join(', ')}`);
    expect(withZod.length, 'the fingerprint must find zod somewhere or the check is meaningless').toBeGreaterThan(0);
    for (const f of g.files) {
      const src = readFileSync(join(ROOT, dist, f), 'utf8');
      for (const p of ZOD_FINGERPRINTS) expect(src.includes(p), `${f} contains ${p}`).toBe(false);
      expect(f, 'chart / SDK chunk statically reachable').not.toMatch(/useRechartsWidth|BarChart|CurveChart|supabase-client|schemas-|backup-/);
    }
    for (const f of withZod) expect(g.files, `${f} must not be in the static closure`).not.toContain(f);
  });
}

test('M10-AC6(3) cloud-off dist: no SDK chunk, no auth/v1, no supabase.co, precache manifest has none; lazy zod chunk IS precached', () => {
  test.skip(!existsSync(join(ROOT, 'dist', 'index.html')), 'dist not built');
  const names = readdirSync(join(ROOT, 'dist', 'assets'));
  expect(names.filter((n) => /supabase/.test(n))).toEqual([]);
  for (const n of names.filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(ROOT, 'dist', 'assets', n), 'utf8');
    expect(src.includes('auth/v1'), `${n} has auth/v1`).toBe(false);
    expect(src.includes('supabase.co'), `${n} has supabase.co`).toBe(false);
  }
  const sw = readFileSync(join(ROOT, 'dist', 'sw.js'), 'utf8');
  expect(sw).not.toMatch(/supabase-client/);
  const zodChunk = names.find((n) => n.endsWith('.js') && readFileSync(join(ROOT, 'dist', 'assets', n), 'utf8').includes('ZodError'));
  expect(zodChunk, 'zod chunk exists').toBeTruthy();
  expect(sw.includes(zodChunk!), 'zod chunk is in the SW precache manifest (offline Import)').toBe(true);
});

test('M10-AC6(3) cloud-on dist: exactly one chunk holds the SDK (auth/v1) and it exists', () => {
  test.skip(!existsSync(join(ROOT, 'dist-cloud-e2e', 'index.html')), 'dist-cloud-e2e not built');
  const names = readdirSync(join(ROOT, 'dist-cloud-e2e', 'assets')).filter((n) => n.endsWith('.js'));
  const withAuth = names.filter((n) => readFileSync(join(ROOT, 'dist-cloud-e2e', 'assets', n), 'utf8').includes('auth/v1'));
  expect(withAuth.length).toBe(1);
  expect(withAuth[0]).toMatch(/^supabase-client-/);
});

test('M10-AC1 cold #/today request log: all resource types, gzip 9 on text, <= 230 000 bytes; no schema/backup/chart/SDK chunk requested', async ({ page }) => {
  const reqs: string[] = [];
  const bodies: Array<{ url: string; gzip: number; type: string }> = [];
  const pending: Promise<void>[] = [];
  page.on('request', (r) => reqs.push(`${r.resourceType()} ${r.url()}`));
  page.on('response', (res) => {
    if (!res.url().startsWith(BASE_URL)) return;
    pending.push(
      res.body().then(
        (b) => {
          const type = res.headers()['content-type'] ?? '';
          if (/javascript|css|html/.test(type) && !/\/(sw|workbox)/.test(new URL(res.url()).pathname)) bodies.push({ url: res.url().replace(BASE_URL, '/'), gzip: gzipSync(b, { level: 9 }).length, type });
        },
        () => undefined,
      ),
    );
  });
  await freezeClock(page);
  await gotoHash(page, '/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await Promise.all(pending);
  const total = bodies.reduce((s, b) => s + b.gzip, 0);
  console.log(`[qc-cold] ${reqs.length} requests: ${JSON.stringify(reqs.map((r) => r.replace(BASE_URL, '/')))}`);
  console.log(`[qc-cold] text total ${total} bytes gzip:9 over ${bodies.length} responses`);
  expect(total).toBeLessThanOrEqual(230_000);
  expect(reqs.filter((r) => /\/assets\/(schemas|backup|useRechartsWidth|BarChart|CurveChart|supabase-client|GoalDetail|Review)-/.test(r))).toEqual([]);
  expect(reqs.filter((r) => !r.includes(BASE_URL) && !r.includes(' data:') && !r.includes(' blob:'))).toEqual([]);
});

test('M10-AC3 the zod chunk really is in Cache Storage after install, so Import works offline from a cold reload; D3 counts and data are right', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await freezeClock(page);
  await gotoHash(page, '/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const names = readdirSync(join(ROOT, 'dist', 'assets')).filter((n) => n.endsWith('.js'));
  const lazy = names.filter((n) => readFileSync(join(ROOT, 'dist', 'assets', n), 'utf8').includes('ZodError'));
  expect(lazy.length).toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        page.evaluate(async (wanted) => {
          const keys: string[] = [];
          for (const c of await caches.keys()) for (const r of await (await caches.open(c)).keys()) keys.push(r.url);
          return wanted.every((n) => keys.some((k) => k.includes(n)));
        }, lazy),
      { timeout: 20_000 },
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await chooseBackupFile(page, 'sample-backup.json');
  await expect(page.getByRole('dialog')).toContainText('This backup has 5 goals, 23 entries');
  await page.getByRole('dialog').getByRole('button', { name: EN.import.confirm }).click();
  await expect(toast(page)).toHaveText('Backup imported: 5 goals, 23 entries');
  await gotoHash(page, '/today');
  await expectAmount(page, 'Read', '0/30');
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test.describe('lazy chunk unreachable (no service worker)', () => {
  test.use({ serviceWorkers: 'block' });
  const CHUNK = /\/assets\/(backup|schemas)-[^/]+\.js$/;

  test('first Import fails with the generic read error and unlocks the UI; after the chunk is reachable the same Import succeeds (loader retries)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    let blocked = 0;
    await page.route(CHUNK, (route) => {
      blocked += 1;
      return route.abort('internetdisconnected');
    });
    await freezeClock(page);
    await gotoHash(page, '/settings');
    await chooseBackupFile(page, 'sample-backup.json');
    await expect(page.getByRole('alert')).toHaveText(EN.errors.UNKNOWN);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(blocked).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: EN.settings.backup.import })).toBeEnabled();
    await page.unroute(CHUNK);
    await importBackup(page);
    await expect(toast(page)).toHaveText('Backup imported: 5 goals, 23 entries');
    expect(errors).toEqual([]);
  });

  test('an oversized file (> 5 MiB) is refused before the schema chunk is ever requested', async ({ page }) => {
    const chunk: string[] = [];
    page.on('request', (r) => {
      if (/\/assets\/(backup|schemas)-/.test(r.url())) chunk.push(r.url());
    });
    await freezeClock(page);
    await gotoHash(page, '/settings');
    await page.waitForLoadState('networkidle');
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0x20);
    await page.getByTestId('import-file').setInputFiles({ name: 'big.json', mimeType: 'application/json', buffer: big });
    await expect(page.getByRole('alert')).toHaveText(EN.errors.IMPORT_FILE_TOO_LARGE);
    expect(chunk).toEqual([]);
  });
});
