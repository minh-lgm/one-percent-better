import { useEffect, useId, useState } from 'react';
import { toISODate } from '../../domain/dates';
import { buildReminderIcs, ICS_FILE_NAME } from '../../domain/ics';
import { isValidReminderTime, type NotificationPermissionState } from '../../domain/reminder';
import type { MessageKey } from '../../i18n/types';
import { downloadTextFile, ICS_MIME_TYPE } from '../../integration/file-io';
import type { PersistState } from '../../integration/storage';
import { Badge, type BadgeTone } from '../components/Badge';
import { Button } from '../components/Button';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { PageHeader } from '../components/PageHeader';
import { Switch } from '../components/Switch';
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

/** Settings (DESIGN S7). Cards: Language, Reminders (M2), Storage, About. */
export function Settings() {
  const { t } = useT();
  const toast = useToast();
  const id = useId();
  const { storagePersistence, settingsService, notifications } = useServices();
  const [persist, setPersist] = useState<PersistState | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>(() => notifications.permission());
  const settings = useSubscribable(() => settingsService.watch(), [settingsService]);

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
  const perm = PERMISSION_VIEW[permission];
  const reminderEnabled = settings.data?.reminderEnabled ?? false;
  const reminderTime = settings.data?.reminderTime ?? '20:00';

  async function requestPermission() {
    setPermission(await notifications.requestPermission());
  }

  async function toggleReminder(checked: boolean) {
    await settingsService.setReminderEnabled(checked);
    if (checked && permission === 'default') await requestPermission();
  }

  async function changeTime(value: string) {
    if (!isValidReminderTime(value) || value === reminderTime) return;
    await settingsService.setReminderTime(value);
    toast.show('toast.reminderTime');
  }

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
          <p className="hint">{t('settings.language.browserNote')}</p>
        </section>

        <section className="card" aria-labelledby="h-reminders">
          <h2 id="h-reminders">{t('settings.reminders.title')}</h2>
          <Switch
            id={`${id}-reminder`}
            label={t('settings.reminders.switch')}
            description={t('settings.reminders.switchDesc')}
            checked={reminderEnabled}
            disabled={settings.loading}
            onChange={(checked) => void toggleReminder(checked)}
          />
          <div className="field">
            <label htmlFor={`${id}-time`}>{t('settings.reminders.time')}</label>
            <input
              id={`${id}-time`}
              className="input num time"
              type="time"
              step={60}
              value={reminderTime}
              disabled={!reminderEnabled}
              onChange={(e) => void changeTime(e.target.value)}
            />
          </div>
          <div className="perm">
            <strong id={`${id}-perm-label`}>{t('settings.reminders.permission')}</strong>
            <Badge tone={perm.tone} id={`${id}-perm-value`}>
              {t(perm.chip)}
            </Badge>
          </div>
          <p className="hint" data-testid="permission-desc">
            {t(perm.desc)}
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
          <p className="hint">{t('settings.reminders.icsHint', { time: reminderTime })}</p>
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
          <p className="desc">{t('settings.about.desc')}</p>
        </section>
      </div>
    </>
  );
}
