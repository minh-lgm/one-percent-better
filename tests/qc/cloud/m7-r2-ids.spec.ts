// QC M7 round 2 - NV-8 (mock side): ids with characters that are special in a PostgREST filter
// (`"`, `\`, `,`, `(`, `)`, `&`, `=`, `#`, `+`, `/`, space, emoji) survive push -> fetchByIds (in.(...) with
// quoting) -> pull on a second device, and edits made to such rows on one device reach the other.
// The real PostgREST is still NOT VERIFIED; this checks the app's quoting against the mock's parser.
import { readFileSync } from 'node:fs';
import { expect, test } from '../../../e2e/cloud/fixtures';
import { collectErrors, expectSyncState, pendingCount, signInAsMinh, syncNow } from '../../../e2e/cloud/helpers';
import { EN, fixturePath, gotoHash } from '../../../e2e/helpers/app';

const ODD = ['a"b', 'c\\d', 'e,f', 'g(h)', 'i&j=k#l', 'm+n/o', 'p q', '😀x', 'q"\\"r', '),(,"'];

test.beforeEach(async ({ mock }) => {
  await mock.reset();
});

test('ids with quote, backslash, comma, parentheses, emoji: push + read-back + second device pull + edit round trip, all clean', async ({ page, mock, device }) => {
  const errors = collectErrors(page);
  const file = JSON.parse(readFileSync(fixturePath('sample-backup.json'), 'utf8')) as { goals: Array<{ id: string; name: string }>; entries: Array<{ id: string; goalId: string }> };
  // 5 goals -> first 5 odd ids; entries: odd ids for the first 5 entries as well.
  const idMap = new Map<string, string>();
  file.goals.forEach((g, i) => idMap.set(g.id, ODD[i]!));
  for (const g of file.goals) g.id = idMap.get(g.id)!;
  file.entries.forEach((e, i) => {
    e.goalId = idMap.get(e.goalId) ?? e.goalId;
    if (i < 5) e.id = ODD[5 + i]!;
  });
  await gotoHash(page, '/settings');
  await page.getByTestId('import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: EN.import.confirm }).click();
  await expect(dialog).toBeHidden();

  await signInAsMinh(page);
  await expectSyncState(page, 'synced', 25_000);
  await expect.poll(() => pendingCount(page)).toBe(0);
  const live = await mock.liveRows('u1');
  expect(live.goals.map((g) => g.id).sort()).toEqual([...idMap.values()].sort());
  expect(live.entries).toHaveLength(23);
  for (const odd of ODD.slice(5)) expect(live.entries.map((e) => e.id)).toContain(odd);

  // Second device pulls everything with those ids.
  const b = await device();
  const errB = collectErrors(b.page);
  await signInAsMinh(b.page);
  await expectSyncState(b.page, 'synced', 25_000);
  await gotoHash(b.page, '/goals');
  await expect(b.page.getByRole('heading', { level: 3 })).toHaveCount(5);

  // B edits goal with id `a"b` (rename) -> A pulls it.
  const nameOf = file.goals[0]!.name;
  await gotoHash(b.page, `/goals/${encodeURIComponent('a"b')}/edit`);
  await b.page.getByLabel(new RegExp(`^${EN.goal.form.nameLabel}`)).fill('Renamed on B');
  await b.page.getByRole('button', { name: EN.goal.form.saveChanges }).click();
  await expect(b.page.getByRole('heading', { level: 1, name: EN.goals.title })).toBeVisible();
  await expect.poll(async () => (await mock.liveRows('u1')).goals.find((g) => g.id === 'a"b')?.['name'], { timeout: 15_000 }).toBe('Renamed on B');
  await syncNow(page);
  await gotoHash(page, '/goals');
  await expect(page.getByRole('heading', { level: 3, name: 'Renamed on B' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: nameOf })).toHaveCount(0);
  await gotoHash(page, '/settings');
  await expect.poll(() => pendingCount(page)).toBe(0);
  expect(errors.list).toEqual([]);
  expect(errB.list).toEqual([]);
});
