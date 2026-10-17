import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi as vitest } from 'vitest';
import { IMPORT_MAX_BYTES } from '../../config/constants';
import { buildBackup } from '../../domain/backup-file';
import { DEFAULT_SETTINGS } from '../../domain/types';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, buildGoal, datasetS1, FIXED_NOW } from '../../test/builders';
import { createTestContainer, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

function s1File(): string {
  const s1 = datasetS1();
  return JSON.stringify(buildBackup({ goals: s1.goals, entries: s1.entries, settings: DEFAULT_SETTINGS }, FIXED_NOW));
}

function jsonFile(text: string, name = 'backup.json'): File {
  return new File([text], name, { type: 'application/json' });
}

async function withTemp(locale: 'en' | 'vi' = 'en') {
  tc = await createTestContainer({ locale });
  await tc.container.db.goals.put(buildGoal({ id: 'temp', name: 'Temp' }));
  await tc.container.db.entries.bulkPut([buildEntry({ id: 't1', goalId: 'temp' }), buildEntry({ id: 't2', goalId: 'temp', minutes: 5 }), buildEntry({ id: 't3', goalId: 'temp', minutes: 5 })]);
  return tc;
}

function captureDownloads() {
  const blobs: Blob[] = [];
  Object.assign(URL, { createObjectURL: vitest.fn((b: Blob) => (blobs.push(b), 'blob:json')), revokeObjectURL: vitest.fn() });
  const clicks: HTMLAnchorElement[] = [];
  vitest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push(this);
  });
  return { blobs, clicks };
}

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

describe('Settings — Backup card (M3-AC6, AC8, AC9, AC10, AC13)', () => {
  it('shows "Last backup: Never" and the never-backed-up nag when there are goals; export downloads the file and updates the date', async () => {
    const user = userEvent.setup();
    await withTemp();
    await renderApp({ route: '/settings', container: tc });
    expect(await screen.findByText(en.settings.backup.lastNever)).toBeInTheDocument();
    expect(await screen.findByTestId('backup-banner')).toHaveTextContent(en.backup.banner.never);
    expect(screen.getByText(en.settings.backup.desc)).toBeInTheDocument();
    expect(screen.getByText(en.settings.backup.importHint)).toBeInTheDocument();

    const { blobs, clicks } = captureDownloads();
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0].download).toBe('1percent-better-backup-2026-10-09.json');
    const file = JSON.parse(await readBlob(blobs[0])) as { app: string; schemaVersion: number; goals: unknown[]; entries: unknown[]; settings: unknown };
    expect(file).toMatchObject({ app: 'one-percent-better', schemaVersion: 1 });
    expect(file.goals).toHaveLength(1);
    expect(file.entries).toHaveLength(3);
    expect(file.settings).toBeDefined();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.backupExported));
    await waitFor(() => expect(screen.getByTestId('last-backup')).toHaveTextContent('Last backup: 2026-10-09'));
    await waitFor(() => expect(screen.queryByTestId('backup-banner')).toBeNull());
  });

  it('M3-AC10: the nag shows after 31 days, not after 29 days, and never without goals', async () => {
    tc = await createTestContainer();
    await tc.container.settingsService.update({ lastBackupAt: '2026-09-08T10:00:00+07:00' });
    let app = await renderApp({ route: '/settings', container: tc });
    await screen.findByText('Last backup: 2026-09-08');
    expect(screen.queryByTestId('backup-banner')).toBeNull(); // no goals yet
    await tc.container.db.goals.put(buildGoal({ id: 'g', name: 'G' }));
    await waitFor(() => expect(screen.getByTestId('backup-banner')).toHaveTextContent("It's been 31 days since your last backup."));
    app.unmount();

    await tc.container.settingsService.update({ lastBackupAt: '2026-09-10T10:00:00+07:00' });
    app = await renderApp({ route: '/settings', container: tc });
    await screen.findByText('Last backup: 2026-09-10');
    expect(screen.queryByTestId('backup-banner')).toBeNull();
    app.unmount();

    // Today shows the same nag, with a button to Settings.
    await tc.container.settingsService.update({ lastBackupAt: null });
    await renderApp({ route: '/today', container: tc });
    const banner = await screen.findByTestId('backup-banner');
    expect(banner).toHaveTextContent(en.backup.banner.never);
    expect(within(banner).getByRole('link', { name: en.backup.banner.action })).toHaveAttribute('href', '/settings');
  });

  it('M3-AC8: import previews "5 goals, 23 entries", Cancel keeps the data, Confirm replaces it', async () => {
    const user = userEvent.setup();
    await withTemp();
    await tc!.container.db.kv.put({ key: 'activeTimer', value: { goalId: 'temp', startedAt: FIXED_NOW.toISOString() } });
    await tc!.container.settingsService.update({ lastReminderDate: '2026-10-09' });
    await renderApp({ route: '/settings', container: tc });
    await screen.findByText(en.settings.backup.lastNever);
    const input = screen.getByTestId('import-file') as HTMLInputElement;
    await user.upload(input, jsonFile(s1File()));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(en.import.title);
    expect(dialog).toHaveTextContent('This backup has 5 goals, 23 entries, exported 2026-10-09. Importing replaces everything currently on this device (1 goal, 3 entries). This can\'t be undone.');
    expect(within(dialog).getByRole('button', { name: en.common.cancel })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: en.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await tc!.container.db.goals.count()).toBe(1);
    await waitFor(() => expect(screen.getByRole('button', { name: en.settings.backup.import })).toHaveFocus());

    await user.upload(input, jsonFile(s1File()));
    const dialog2 = await screen.findByRole('dialog');
    await user.click(within(dialog2).getByRole('button', { name: en.import.confirm }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Backup imported: 5 goals, 23 entries'));
    expect((await tc!.container.db.goals.get('temp'))?.deletedAt).toBeTruthy(); // v2: soft delete (ADR-20)
    expect(await tc!.container.db.goals.filter((g) => g.deletedAt == null).count()).toBe(5);
    expect(await tc!.container.db.entries.filter((e) => e.deletedAt == null).count()).toBe(23);
    expect(await tc!.container.db.kv.get('activeTimer')).toBeUndefined();
    expect((await tc!.container.settingsService.get()).lastReminderDate).toBeNull();
  });

  it('M3-AC9: invalid files show the matching alert and change nothing', async () => {
    const user = userEvent.setup();
    await withTemp();
    await renderApp({ route: '/settings', container: tc });
    await screen.findByText(en.settings.backup.lastNever);
    const input = screen.getByTestId('import-file');

    await user.upload(input, jsonFile('{abc'));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.IMPORT_INVALID_JSON);
    await user.upload(input, jsonFile(JSON.stringify({ app: 'other' })));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(en.errors.IMPORT_INVALID_SCHEMA));
    await user.upload(input, jsonFile(JSON.stringify({ ...JSON.parse(s1File()), schemaVersion: 2 })));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This backup uses a format version (2) this app can\'t read.'));
    const big = new File([new Uint8Array(IMPORT_MAX_BYTES + 1)], 'big.json', { type: 'application/json' });
    await user.upload(input, big);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(en.errors.IMPORT_FILE_TOO_LARGE));
    const broken = JSON.parse(s1File()) as { entries: Array<{ goalId: string }> };
    broken.entries[0].goalId = 'ghost';
    await user.upload(input, jsonFile(JSON.stringify(broken)));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(en.errors.IMPORT_INTEGRITY));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await tc!.container.db.goals.count()).toBe(1);
    expect(await tc!.container.db.entries.count()).toBe(3);
  });

  it('vi: Backup card (Never, >30 days, D3 open, every IMPORT_* alert) has no English leaks; dates in dd/MM/yyyy', async () => {
    const user = userEvent.setup();
    await withTemp('vi');
    await tc!.container.settingsService.update({ lastBackupAt: '2026-09-08T10:00:00+07:00' });
    await renderApp({ route: '/settings', container: tc });
    await screen.findByText('Lần sao lưu gần nhất: 08/09/2026');
    expect(await screen.findByTestId('backup-banner')).toHaveTextContent('Đã 31 ngày kể từ lần sao lưu gần nhất.');
    expect(scanVi()).toEqual([]);

    const input = screen.getByTestId('import-file');
    await user.upload(input, jsonFile(s1File()));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Bản sao lưu này có 5 mục tiêu, 23 lần ghi, xuất ngày 09/10/2026. Nhập sẽ thay thế toàn bộ dữ liệu hiện có trên thiết bị này (1 mục tiêu, 3 lần ghi). Bạn không thể hoàn tác.');
    expect(scanVi()).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: vi.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const codes = ['IMPORT_FILE_TOO_LARGE', 'IMPORT_INVALID_JSON', 'IMPORT_INVALID_SCHEMA', 'IMPORT_UNSUPPORTED_VERSION', 'IMPORT_INTEGRITY'] as const;
    for (const code of codes) {
      vitest.spyOn(tc!.container.backupService, 'parse').mockResolvedValueOnce({ ok: false, errors: [{ code, message: '', params: { v: '2' } }] });
      await user.upload(input, jsonFile('{}'));
      const expected = code === 'IMPORT_UNSUPPORTED_VERSION' ? vi.errors.IMPORT_UNSUPPORTED_VERSION.replace('{{v}}', '2') : vi.errors[code];
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(expected));
      expect(scanVi()).toEqual([]);
    }

    await tc!.container.settingsService.update({ lastBackupAt: null });
    await waitFor(() => expect(screen.getByText(vi.settings.backup.lastNever)).toBeInTheDocument());
    expect(screen.getByTestId('backup-banner')).toHaveTextContent(vi.backup.banner.never);
    expect(scanVi()).toEqual([]);
  });

  it('D3 for a one-goal, one-entry file uses singular forms in en', async () => {
    const user = userEvent.setup();
    tc = await createTestContainer();
    await renderApp({ route: '/settings', container: tc });
    await screen.findByText(en.settings.backup.lastNever);
    const file = buildBackup({ goals: [buildGoal({ id: 'g' })], entries: [buildEntry({ id: 'e', goalId: 'g', date: '2026-10-05' })], settings: DEFAULT_SETTINGS }, FIXED_NOW);
    await user.upload(screen.getByTestId('import-file'), jsonFile(JSON.stringify(file)));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('This backup has 1 goal, 1 entry, exported 2026-10-09. Importing replaces everything currently on this device (0 goals, 0 entries).');
    await user.click(within(dialog).getByRole('button', { name: en.import.confirm }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Backup imported: 1 goal, 1 entry'));
  });
});
