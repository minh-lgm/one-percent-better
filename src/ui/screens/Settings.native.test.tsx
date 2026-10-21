// M12-AC5 / M12-AC6: Settings (and the shell) on the native app, driven by `capabilities` only
// (DESIGN v5.0 7.8.1, S7 "tiếp"). Export / .ics go through the FileExportPort (ARCH §5.15, A-65).
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { BACKUP_MIME_TYPE } from '../../domain/backup-file';
import { ICS_FILE_NAME, ICS_MIME_TYPE } from '../../domain/ics';
import en from '../../i18n/resources/en.json';
import vi from '../../i18n/resources/vi.json';
import { buildEntry, buildGoal } from '../../test/builders';
import { createTestContainer, fakeNativePlatform, type TestContainer } from '../../test/container';
import { renderApp, scanVi } from '../../test/render-with-locale';

let tc: TestContainer | undefined;

afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

async function withData(options: Parameters<typeof createTestContainer>[0] = {}) {
  tc = await createTestContainer(options);
  await tc.container.db.goals.put(buildGoal({ id: 'g1', name: 'Read' }));
  await tc.container.db.entries.put(buildEntry({ id: 'e1', goalId: 'g1', minutes: 20 }));
  return tc;
}

describe('Settings on iOS (M12-AC6)', () => {
  it('en: native copy for Language, Reminders, Backup, Storage, About; no PWA hints; no Account card; no update toast', async () => {
    await withData({ native: 'ios', cloud: true, authStored: true });
    await renderApp({ route: '/settings', container: tc });
    expect(await screen.findByRole('heading', { level: 1, name: en.settings.title })).toBeInTheDocument();

    // Language
    expect(screen.getByText(en.settings.language.nativeNote)).toBeInTheDocument();
    expect(screen.queryByText(en.settings.language.browserNote)).toBeNull();
    // Account: hidden (unavailable in M12 … M13 even with a cloud configuration)
    expect(screen.queryByRole('heading', { level: 2, name: en.settings.account.title })).toBeNull();
    expect(screen.queryByTestId('account-card')).toBeNull();
    expect(screen.queryByRole('button', { name: en.auth.signInGoogle })).toBeNull();
    // Reminders: chip "Not supported" + native description; the "only while open" limit stays; no Home Screen hint; .ics stays
    expect(screen.getByText(en.settings.permission.unsupported)).toBeInTheDocument();
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(en.settings.permission.nativeUnsupportedDesc);
    expect(screen.queryByRole('button', { name: en.settings.reminders.allow })).toBeNull();
    expect(screen.getByText(en.settings.reminders.limit)).toBeInTheDocument();
    expect(screen.queryByText(en.settings.reminders.ios)).toBeNull();
    expect(screen.getByRole('button', { name: en.settings.reminders.ics })).toBeInTheDocument();
    // Backup: share hint under the buttons, native never-backed-up banner
    expect(screen.getByTestId('share-hint')).toHaveTextContent(en.settings.backup.shareHint);
    expect(screen.getByTestId('import-hint')).toHaveTextContent(en.settings.backup.importHint);
    expect(await screen.findByTestId('backup-banner')).toHaveTextContent(en.backup.banner.neverNative);
    expect(screen.queryByText(en.backup.banner.never)).toBeNull();
    expect(screen.getByText(en.settings.backup.desc)).toBeInTheDocument();
    // Storage: neutral chip, no "Install the app"
    expect(screen.getByText(en.settings.storage.nativeLabel)).toBeInTheDocument();
    expect(screen.getByText(en.settings.storage.nativeChip)).toBeInTheDocument();
    expect(screen.getByTestId('storage-desc')).toHaveTextContent(en.settings.storage.nativeDesc);
    expect(document.body.textContent).not.toContain('Install the app');
    expect(document.body.textContent).not.toContain('Add to Home Screen');
    expect(screen.queryByText(en.settings.storage.label)).toBeNull();
    expect(screen.queryByTestId('storage-go-to-account')).toBeNull();
    // About: native description, absolute privacy link opened outside the app, with the hidden "(opens in Safari)"
    expect(screen.getByText(en.settings.about.descNative)).toBeInTheDocument();
    expect(screen.queryByText(en.settings.about.desc)).toBeNull();
    const link = screen.getByTestId('privacy-link');
    expect(link).toHaveAttribute('href', 'https://minh-lgm.github.io/one-percent-better/privacy.html');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
    expect(link).toHaveAccessibleName(`${en.settings.about.privacyLink} ${en.a11y.opensExternal}`);
    expect(within(link).getByText(en.a11y.opensExternal)).toHaveClass('sr-only');

    // No UpdateToast on native, even when the update store is notified.
    act(() => tc!.container.updates.notify());
    expect(screen.queryByText(en.update.message)).toBeNull();
    expect(screen.queryByRole('button', { name: en.update.reload })).toBeNull();
  });

  it('vi: the same cards in Vietnamese, no English leaks', async () => {
    await withData({ native: 'ios', locale: 'vi' });
    await renderApp({ route: '/settings', container: tc, locale: 'vi' });
    expect(await screen.findByRole('heading', { level: 1, name: vi.settings.title })).toBeInTheDocument();
    expect(screen.getByText(vi.settings.language.nativeNote)).toBeInTheDocument();
    expect(screen.getByText(vi.settings.permission.unsupported)).toBeInTheDocument();
    expect(screen.getByTestId('permission-desc')).toHaveTextContent(vi.settings.permission.nativeUnsupportedDesc);
    expect(screen.queryByText(vi.settings.reminders.ios)).toBeNull();
    expect(screen.getByTestId('share-hint')).toHaveTextContent(vi.settings.backup.shareHint);
    expect(await screen.findByTestId('backup-banner')).toHaveTextContent(vi.backup.banner.neverNative);
    expect(screen.getByText(vi.settings.storage.nativeLabel)).toBeInTheDocument();
    expect(screen.getByText(vi.settings.storage.nativeChip)).toBeInTheDocument();
    expect(screen.getByTestId('storage-desc')).toHaveTextContent(vi.settings.storage.nativeDesc);
    expect(screen.getByText(vi.settings.about.descNative)).toBeInTheDocument();
    expect(screen.getByTestId('privacy-link')).toHaveAccessibleName(`${vi.settings.about.privacyLink} ${vi.a11y.opensExternal}`);
    expect(scanVi()).toEqual([]);
  });

  it('web capabilities: DOM as before (web copy, relative privacy link, no share hint)', async () => {
    await withData();
    await renderApp({ route: '/settings', container: tc });
    expect(await screen.findByText(en.settings.language.browserNote)).toBeInTheDocument();
    expect(screen.getByText(en.settings.reminders.ios)).toBeInTheDocument();
    expect(screen.queryByTestId('share-hint')).toBeNull();
    expect(await screen.findByTestId('backup-banner')).toHaveTextContent(en.backup.banner.never);
    await waitFor(() => expect(screen.getByText(en.settings.storage.protected)).toBeInTheDocument());
    expect(screen.getByText(en.settings.about.desc)).toBeInTheDocument();
    const link = screen.getByTestId('privacy-link');
    expect(link).toHaveAttribute('href', '/privacy.html');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveAccessibleName(en.settings.about.privacyLink);
    act(() => tc!.container.updates.notify());
    expect(screen.getByText(en.update.message)).toBeInTheDocument();
  });

  it('Today shows the native never-backed-up banner', async () => {
    await withData({ native: 'ios' });
    await renderApp({ route: '/today', container: tc });
    expect(await screen.findByTestId('backup-banner')).toHaveTextContent(en.backup.banner.neverNative);
  });
});

describe('Export / .ics through the FileExportPort (M12-AC5, A-65)', () => {
  it("share sheet dismissed ('cancelled'): no toast, Last backup unchanged, banner stays, no sign-in hint", async () => {
    const user = userEvent.setup();
    await withData({ native: 'ios', exportOutcome: 'cancelled' });
    await renderApp({ route: '/settings', container: tc });
    expect(await screen.findByText(en.settings.backup.lastNever)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    await waitFor(() => expect(tc!.fileExport!.calls).toHaveLength(1));
    expect(tc!.fileExport!.calls[0]).toMatchObject({ fileName: '1percent-better-backup-2026-10-09.json', mimeType: BACKUP_MIME_TYPE });
    expect(JSON.parse(tc!.fileExport!.calls[0].content).goals).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('button', { name: en.settings.backup.export })).toBeEnabled());
    expect(screen.queryByRole('status')?.textContent ?? '').not.toContain(en.toast.backupExported);
    expect(screen.getByTestId('last-backup')).toHaveTextContent(en.settings.backup.lastNever);
    expect((await tc!.container.settingsService.get()).lastBackupAt).toBeNull();
    expect(screen.getByTestId('backup-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('export-sign-in-hint')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("share sheet completed ('shared'): toast, Last backup = today, banner gone", async () => {
    const user = userEvent.setup();
    await withData({ native: 'ios', exportOutcome: 'shared' });
    await renderApp({ route: '/settings', container: tc });
    expect(await screen.findByText(en.settings.backup.lastNever)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.backupExported));
    await waitFor(() => expect(screen.getByTestId('last-backup')).toHaveTextContent('Last backup: 2026-10-09'));
    expect((await tc!.container.settingsService.get()).lastBackupAt).toBe('2026-10-09T03:00:00.000Z');
    await waitFor(() => expect(screen.queryByTestId('backup-banner')).toBeNull());
  });

  it("web port returning 'saved' with the cloud on and signed out: toast + ExportSignInHint (FR-53, A-44)", async () => {
    const user = userEvent.setup();
    await withData({ cloud: true, exportOutcome: 'saved' });
    await renderApp({ route: '/settings', container: tc });
    expect(await screen.findByText(en.settings.backup.lastNever)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.backupExported));
    expect(await screen.findByTestId('export-sign-in-hint')).toBeInTheDocument();
    expect(tc!.fileExport!.calls).toHaveLength(1);
  });

  it('port rejects on native: the native export error in the card, Last backup unchanged', async () => {
    const user = userEvent.setup();
    const native = fakeNativePlatform('ios');
    native.fileExport.next = new Error('No space left');
    await withData({ native });
    await renderApp({ route: '/settings', container: tc });
    expect(await screen.findByText(en.settings.backup.lastNever)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.settings.backup.export }));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.EXPORT_FAILED_native);
    expect(screen.getByTestId('last-backup')).toHaveTextContent(en.settings.backup.lastNever);
  });

  it('port rejects on the web: the web export error (unchanged copy)', async () => {
    const user = userEvent.setup();
    await withData({ exportOutcome: 'saved' });
    tc!.fileExport!.next = new Error('blocked');
    await renderApp({ route: '/settings', container: tc });
    await user.click(await screen.findByRole('button', { name: en.settings.backup.export }));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.errors.EXPORT_FAILED);
  });

  it(".ics: through the same port with the calendar MIME type; 'shared' → toast icsShared, 'cancelled' → silent", async () => {
    const user = userEvent.setup();
    await withData({ native: 'ios', exportOutcome: 'shared' });
    await renderApp({ route: '/settings', container: tc });
    await user.click(await screen.findByRole('button', { name: en.settings.reminders.ics }));
    await waitFor(() => expect(tc!.fileExport!.calls).toHaveLength(1));
    expect(tc!.fileExport!.calls[0]).toMatchObject({ fileName: ICS_FILE_NAME, mimeType: ICS_MIME_TYPE });
    expect(tc!.fileExport!.calls[0].content).toContain('BEGIN:VCALENDAR');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.icsShared));

    tc!.fileExport!.next = 'cancelled';
    await user.click(screen.getByRole('button', { name: en.settings.reminders.ics }));
    await waitFor(() => expect(tc!.fileExport!.calls).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole('button', { name: en.settings.reminders.ics })).toBeEnabled());
    expect(screen.getAllByRole('status').map((s) => s.textContent).join(' ')).not.toContain(en.toast.icsDownloaded);
  });

  it(".ics on the web ('saved'): toast icsDownloaded as before", async () => {
    const user = userEvent.setup();
    await withData({ exportOutcome: 'saved' });
    await renderApp({ route: '/settings', container: tc });
    await user.click(await screen.findByRole('button', { name: en.settings.reminders.ics }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(en.toast.icsDownloaded));
    expect(tc!.fileExport!.calls[0].mimeType).toBe(ICS_MIME_TYPE);
  });
});
