import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { IMPORT_MAX_BYTES } from '../../config/constants';
import { BACKUP_MIME_TYPE, backupReminder } from '../../domain/backup';
import { toISODate } from '../../domain/dates';
import { buildReminderIcs, ICS_FILE_NAME } from '../../domain/ics';
import type { NotificationPermissionState } from '../../domain/reminder';
import type { SyncStatus } from '../../domain/sync';
import type { DomainError } from '../../domain/types';
import type { MessageKey } from '../../i18n/types';
import { downloadTextFile, ICS_MIME_TYPE, readTextFile } from '../../integration/file-io';
import type { PersistState } from '../../integration/storage';
import type { BackupCounts, BackupPreview } from '../../services/backup-service';
import { AccountCard } from '../components/AccountCard';
import { Alert } from '../components/Alert';
import { BackupBanner } from '../components/BackupBanner';
import { Badge, type BadgeTone } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { PageHeader } from '../components/PageHeader';
import { ReminderTimeField } from '../components/ReminderTimeField';
import { SignOutDialog, type SignOutChoice } from '../components/SignOutDialog';
import { Switch } from '../components/Switch';
import { errorMessage, WRITE_FAILED_KEY } from '../error-messages';
import { useFormat } from '../hooks/useFormat';
import { useNow } from '../hooks/useNow';
import { useOnline } from '../hooks/useOnline';
import { useServices } from '../hooks/useServices';
import { useSubscribable } from '../hooks/useSubscribable';
import { useT } from '../hooks/useT';
import { useToast } from '../hooks/useToast';

const STORAGE_VIEW: Record<PersistState, { chip: 'settings.storage.protected' | 'settings.storage.notProtected' | 'settings.storage.unknown'; desc: 'settings.storage.protectedDesc' | 'settings.storage.notProtectedDesc' | 'settings.storage.unknownDesc'; tone: BadgeTone }> = {
  persisted: { chip: 'settings.storage.protected', desc: 'settings.storage.protectedDesc', tone: 'success' },
  'not-persisted': { chip: 'settings.storage.notProtected', desc: 'settings.storage.notProtectedDesc', tone: 'warning' },
  unsupported: { chip: 'settings.storage.unknown', desc: 'settings.storage.unknownDesc', tone: 'neutral' },
};

const PERMISSION_VIEW: Record<NotificationPermissionState, { chip: MessageKey; desc: MessageKey; tone: BadgeTone }> = {
  default: { chip: 'settings.permission.default', desc: 'settings.permission.defaultDesc', tone: 'neutral' },
  granted: { chip: 'settings.permission.granted', desc: 'settings.permission.grantedDesc', tone: 'success' },
  denied: { chip: 'settings.permission.denied', desc: 'errors.NOTIFICATIONS_DENIED', tone: 'danger' },
  unsupported: { chip: 'settings.permission.unsupported', desc: 'errors.NOTIFICATIONS_UNSUPPORTED', tone: 'neutral' },
};

interface ImportState {
  preview: BackupPreview;
  counts: BackupCounts;
  opener: HTMLElement | null;
}

/** "Saved to your account" note on the Language / Reminders cards (DESIGN SettingsSyncNote, M7). */
function SettingsSyncNote({ text, testId }: { text: string; testId: string }) {
  return (
    <p className="hint sync-note" data-testid={testId}>
      <Icon name="cloudCheck" />
      <span>{text}</span>
    </p>
  );
}

/** Settings (DESIGN S7). Cards: Language, Account (M6, only with cloud config), Reminders (M2), Backup (M3), Storage, About. */
export function Settings() {
  const { t } = useT();
  const f = useFormat();
  const toast = useToast();
  const id = useId();
  const now = useNow();
  const { storagePersistence, settingsService, notifications, backupService, goalService, authService, syncService } = useServices();
  const online = useOnline();
  const auth = useSubscribable(() => authService.watch(), [authService]);
  const authState = auth.data ?? authService.state();
  const syncStatus = useSubscribable<SyncStatus>(() => (syncService ? syncService.watchStatus() : { subscribe: () => () => {} }), [syncService]);
  const sync: SyncStatus | null = syncService ? (syncStatus.data ?? syncService.current()) : null;
  const accountHeading = useRef<HTMLHeadingElement>(null);
  const signInButton = useRef<HTMLButtonElement>(null);
  const signOutButton = useRef<HTMLButtonElement>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutWriteFailed, setSignOutWriteFailed] = useState(false);
  const [signOutSyncFailed, setSignOutSyncFailed] = useState(false);
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>(() => notifications.permission());
  const settings = useSubscribable(() => settingsService.watch(), [settingsService]);
  const goals = useSubscribable(() => goalService.watchAll(), [goalService]);

  // Backup card state (M3)
  const fileInput = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [importError, setImportError] = useState<DomainError | 'read' | 'write' | null>(null);
  const [importing, setImporting] = useState<ImportState | null>(null);

  useEffect(() => {
    let active = true;
    void storagePersistence.then((s) => {
      if (active) setPersist(s);
    });
    return () => {
      active = false;
    };
  }, [storagePersistence]);

  // Re-read the permission when the user comes back from the browser's site settings.
  useEffect(() => {
    const refresh = () => setPermission(notifications.permission());
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [notifications]);

  const storage = persist ? STORAGE_VIEW[persist] : null;
  const reminderEnabled = settings.data?.reminderEnabled ?? false;
  const reminderTime = settings.data?.reminderTime ?? '20:00';
  const perm = PERMISSION_VIEW[permission];
  // Reminders turned on elsewhere (synced) while this device never allowed notifications (DESIGN S7, FR-55).
  const permDesc: MessageKey = permission === 'default' && reminderEnabled ? 'settings.permission.defaultOnDesc' : perm.desc;

  async function requestPermission() {
    setPermission(await notifications.requestPermission());
  }

  async function toggleReminder(checked: boolean) {
    await settingsService.setReminderEnabled(checked);
    if (checked && permission === 'default') await requestPermission();
  }

  async function changeTime(value: string) {
    await settingsService.setReminderTime(value);
  }

  async function exportBackup() {
    if (busy) return;
    setBusy('export');
    try {
      const { fileName, json } = await backupService.export(new Date());
      downloadTextFile(fileName, json, BACKUP_MIME_TYPE);
      toast.show('toast.backupExported');
    } finally {
      setBusy(null);
    }
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || busy) return;
    setBusy('import');
    setImportError(null);
    try {
      // `parse` rejects by size before looking at the text; do not even read huge files.
      const text = file.size > IMPORT_MAX_BYTES ? '' : await readTextFile(file);
      const parsed = backupService.parse(text, file.size, toISODate(new Date()));
      if (!parsed.ok) {
        setImportError(parsed.errors[0] ?? 'read');
        return;
      }
      const counts = await backupService.counts();
      setImporting({ preview: parsed.value, counts, opener: importButton.current });
    } catch {
      setImportError('read');
    } finally {
      setBusy(null);
    }
  }

  async function confirmImport() {
    if (!importing || busy) return;
    setBusy('import');
    try {
      const r = await backupService.import(importing.preview, new Date());
      if (r.ok) {
        toast.show('toast.backupImported', { goals: f.count('format.goalsCount', r.value.goals), entries: f.count('format.entriesCount', r.value.entries) });
        setImportError(null);
      }
    } catch {
      setImportError('write');
    } finally {
      setBusy(null);
      closeImport();
    }
  }

  function closeImport() {
    const opener = importing?.opener;
    setImporting(null);
    requestAnimationFrame(() => opener?.focus());
  }

  let importErrorText: string | null = null;
  if (importError === 'read') importErrorText = t('errors.UNKNOWN');
  else if (importError === 'write') importErrorText = t(WRITE_FAILED_KEY);
  else if (importError) {
    const m = errorMessage(importError, f);
    importErrorText = t(m.key, m.params);
  }

  const lastBackupAt = settings.data?.lastBackupAt ?? null;
  const backupNag = settings.data && goals.data ? backupReminder(lastBackupAt, goals.data.length, now) : null;
  const count = (key: 'format.goalsCount' | 'format.entriesCount', n: number) => f.count(key, n);
  const cloudOn = authState.kind !== 'unavailable';
  const signedIn = authState.kind === 'signed-in';
  const importBodyParams = importing
    ? {
        goals: count('format.goalsCount', importing.preview.goals),
        entries: count('format.entriesCount', importing.preview.entries),
        date: f.dateShort(new Date(importing.preview.exportedAt)),
        curGoals: count('format.goalsCount', importing.counts.goals),
        curEntries: count('format.entriesCount', importing.counts.entries),
      }
    : null;
  // D3 signed-in variant (FR-51): the import also replaces the account's copy; `expired` uses the standard D3.
  const importBody = importBodyParams ? t(signedIn ? 'import.bodySignedIn' : 'import.body', importBodyParams) : '';
  const importExtra = importing && signedIn && !online ? t('import.offlineNote') : undefined;

  // ---- Account (M6, FR-39 … FR-41; M7 sync) ----
  function signIn() {
    void authService.signIn('#/settings');
  }

  function dismissAuthError() {
    authService.dismissError();
    requestAnimationFrame(() => signInButton.current?.focus());
  }

  async function syncNow() {
    if (!syncService) return;
    const r = await syncService.syncNow('manual');
    if (r.status === 'ran' && r.ok) toast.show('toast.syncNowDone');
  }

  function openSignOut() {
    setSignOutWriteFailed(false);
    setSignOutSyncFailed(false);
    setSignOutOpen(true);
  }

  function cancelSignOut() {
    setSignOutOpen(false);
    requestAnimationFrame(() => signOutButton.current?.focus());
  }

  async function confirmSignOut({ keepData, removeAnyway }: SignOutChoice) {
    if (signOutBusy) return;
    setSignOutBusy(true);
    setSignOutWriteFailed(false);
    try {
      // FR-41 (M7): one last sync when online, bounded in time; "Remove" with changes still waiting asks again.
      if (syncService && signedIn && online && !removeAnyway && (sync?.pending ?? 0) > 0) {
        const { pending } = await syncService.finalSyncBeforeSignOut();
        if (!keepData && pending > 0) {
          setSignOutSyncFailed(true);
          return;
        }
      }
      const r = await authService.signOut({ keepData });
      if (!r.ok) {
        setSignOutWriteFailed(true);
        return;
      }
      setSignOutOpen(false);
      toast.show(keepData ? 'toast.signedOutKept' : 'toast.signedOutRemoved');
      requestAnimationFrame(() => accountHeading.current?.focus());
    } catch {
      setSignOutWriteFailed(true);
    } finally {
      setSignOutBusy(false);
    }
  }

  const aboutDesc = signedIn ? t('settings.about.descSignedIn') : cloudOn ? t('settings.about.descCloud') : t('settings.about.desc');
  const backupDesc = signedIn ? t('settings.backup.descSignedIn') : t('settings.backup.desc');

  function downloadIcs() {
    const now = new Date();
    const ics = buildReminderIcs({
      reminderTime,
      today: toISODate(now),
      summary: t('ics.summary'),
      alarmDescription: t('ics.alarm'),
      uid: `${crypto.randomUUID()}@one-percent-better`,
      now,
    });
    downloadTextFile(ICS_FILE_NAME, ics, ICS_MIME_TYPE);
    toast.show('toast.icsDownloaded');
  }

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="sections">
        <section className="card" aria-labelledby="h-lang">
          <h2 id="h-lang">{t('settings.language.title')}</h2>
          <p className="desc" id="lang-desc">
            {t('settings.language.desc')}
          </p>
          <LanguageSwitcher describedBy="lang-desc" />
          {signedIn ? <SettingsSyncNote text={t('settings.language.syncNote')} testId="language-sync-note" /> : null}
          <p className="hint">{t('settings.language.browserNote')}</p>
        </section>

        {authState.kind !== 'unavailable' ? (
          <AccountCard
            auth={authState}
            online={online}
            sync={sync}
            onSignIn={signIn}
            onSignOut={openSignOut}
            onDismissError={dismissAuthError}
            onSyncNow={() => void syncNow()}
            headingRef={accountHeading}
            signInRef={signInButton}
            signOutRef={signOutButton}
          />
        ) : null}

        <section className="card" aria-labelledby="h-reminders">
          <h2 id="h-reminders">{t('settings.reminders.title')}</h2>
          {signedIn ? <SettingsSyncNote text={t('settings.reminders.syncNote')} testId="reminders-sync-note" /> : null}
          <Switch
            id={`${id}-reminder`}
            label={t('settings.reminders.switch')}
            description={t('settings.reminders.switchDesc')}
            checked={reminderEnabled}
            disabled={settings.loading}
            onChange={(checked) => void toggleReminder(checked)}
          />
          <ReminderTimeField
            id={`${id}-time`}
            label={t('settings.reminders.time')}
            value={reminderTime}
            disabled={!reminderEnabled}
            onCommit={changeTime}
            onSettled={() => toast.show('toast.reminderTime')}
            describedBy={`${id}-ics-hint`}
          />
          <div className="perm">
            <strong id={`${id}-perm-label`}>{t('settings.reminders.permission')}</strong>
            <Badge tone={perm.tone} id={`${id}-perm-value`}>
              {t(perm.chip)}
            </Badge>
          </div>
          <p className="hint" data-testid="permission-desc">
            {t(permDesc)}
          </p>
          {permission === 'default' ? (
            <div className="btn-row">
              <Button variant="secondary" onClick={() => void requestPermission()}>
                {t('settings.reminders.allow')}
              </Button>
            </div>
          ) : null}
          <div className="limit">
            <p>{t('settings.reminders.limit')}</p>
            <p>{t('settings.reminders.ios')}</p>
          </div>
          <div className="btn-row">
            <Button variant="secondary" icon="cal" onClick={downloadIcs}>
              {t('settings.reminders.ics')}
            </Button>
          </div>
          <p className="hint" id={`${id}-ics-hint`}>
            {t('settings.reminders.icsHint', { time: reminderTime })}
          </p>
        </section>

        <section className="card" aria-labelledby="h-backup">
          <h2 id="h-backup">{t('settings.backup.title')}</h2>
          <p className="desc" data-testid="backup-desc">
            {backupDesc}
          </p>
          {backupNag ? <BackupBanner reminder={backupNag} /> : null}
          <p className="backup-last num" data-testid="last-backup">
            {lastBackupAt ? t('settings.backup.last', { date: f.dateShort(new Date(lastBackupAt)) }) : t('settings.backup.lastNever')}
          </p>
          <div className="btn-row">
            <Button variant="primary" icon="download" disabled={busy !== null} aria-busy={busy === 'export' || undefined} onClick={() => void exportBackup()}>
              {busy === 'export' ? t('common.working') : t('settings.backup.export')}
            </Button>
            <Button ref={importButton} variant="secondary" icon="upload" disabled={busy !== null} aria-busy={busy === 'import' || undefined} onClick={() => fileInput.current?.click()}>
              {busy === 'import' ? t('common.working') : t('settings.backup.import')}
            </Button>
            <input
              ref={fileInput}
              className="file-input"
              type="file"
              accept=".json,application/json"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="import-file"
              onChange={(e) => void onImportFile(e)}
            />
          </div>
          <p className="hint" data-testid="import-hint">
            {signedIn ? t('settings.backup.importHintSignedIn') : t('settings.backup.importHint')}
          </p>
          {importErrorText ? <Alert>{importErrorText}</Alert> : null}
        </section>

        <section className="card" aria-labelledby="h-storage">
          <h2 id="h-storage">{t('settings.storage.title')}</h2>
          <div className="perm">
            <strong id="storage-label">{t('settings.storage.label')}</strong>
            {storage ? (
              <Badge tone={storage.tone} id="storage-value">
                {t(storage.chip)}
              </Badge>
            ) : null}
          </div>
          {storage ? <p className="hint">{t(storage.desc)}</p> : null}
        </section>

        <section className="card" aria-labelledby="h-about">
          <h2 id="h-about">{t('settings.about.title')}</h2>
          <p>
            <strong>{t('app.name')}</strong>
          </p>
          <p className="desc">{aboutDesc}</p>
          {cloudOn ? <p className="hint">{t('settings.about.privacy')}</p> : null}
          <p className="hint">
            <a href={`${import.meta.env.BASE_URL}privacy.html`} data-testid="privacy-link">
              {t('settings.about.privacyLink')}
            </a>
          </p>
        </section>
      </div>
      <ConfirmDialog
        open={importing !== null}
        title={t(importing && signedIn ? 'import.titleSignedIn' : 'import.title')}
        body={importBody}
        extra={importExtra}
        confirmLabel={t('import.confirm')}
        busy={busy === 'import'}
        onConfirm={() => void confirmImport()}
        onCancel={closeImport}
      />
      {cloudOn ? (
        <SignOutDialog
          open={signOutOpen}
          busy={signOutBusy}
          writeFailed={signOutWriteFailed}
          syncFailed={signOutSyncFailed}
          pending={signedIn ? (sync?.pending ?? 0) : 0}
          online={online}
          onConfirm={(c) => void confirmSignOut(c)}
          onCancel={cancelSignOut}
        />
      ) : null}
    </>
  );
}
