import { isValidReminderTime } from '../../domain/reminder';
import { normalizeSettings } from '../../domain/settings';
import { nextUpdatedAt, resolvePrefGroup } from '../../domain/sync';
import type { Settings } from '../../domain/types';
import { isLocale, type Locale } from '../../i18n/types';
import { normalizePrefsSync, type PrefsSyncState, type RemotePrefs, type Subscribable, type SyncedPrefsRepository } from '../repositories';
import { fromLiveQuery, type AppDatabase } from './db';

/**
 * Synced preferences on Dexie (v2.1, FR-55, ADR-25). Values live where they always did
 * (kv `settings`, kv `locale`); kv `prefsSync` holds one `{ updatedAt, dirty }` marker per group.
 * Value + marker are always written in ONE readwrite transaction on `kv`.
 */
export class DexieSyncedPrefsRepository implements SyncedPrefsRepository {
  constructor(private readonly db: AppDatabase) {}

  private async readState(): Promise<PrefsSyncState> {
    return normalizePrefsSync((await this.db.kv.get('prefsSync'))?.value);
  }

  async setReminder(patch: { reminderEnabled?: boolean; reminderTime?: string }, now: Date): Promise<Settings> {
    if (patch.reminderTime !== undefined && !isValidReminderTime(patch.reminderTime)) {
      throw new RangeError(`Invalid reminder time: ${String(patch.reminderTime)}`);
    }
    return this.db.transaction('rw', this.db.kv, async () => {
      const current = normalizeSettings((await this.db.kv.get('settings'))?.value);
      const next = normalizeSettings({ ...current, ...patch });
      const state = await this.readState();
      await this.db.kv.put({ key: 'settings', value: next });
      await this.db.kv.put({ key: 'prefsSync', value: { ...state, reminder: { updatedAt: nextUpdatedAt(now, state.reminder.updatedAt), dirty: 1 } } });
      return next;
    });
  }

  setLocale(locale: Locale, now: Date): Promise<void> {
    return this.db.transaction('rw', this.db.kv, async () => {
      const state = await this.readState();
      await this.db.kv.put({ key: 'locale', value: locale });
      await this.db.kv.put({ key: 'prefsSync', value: { ...state, locale: { updatedAt: nextUpdatedAt(now, state.locale.updatedAt), dirty: 1 } } });
    });
  }

  getDirty(): Promise<RemotePrefs | null> {
    return this.db.transaction('r', this.db.kv, async () => {
      const state = await this.readState();
      const settings = normalizeSettings((await this.db.kv.get('settings'))?.value);
      const localeValue = (await this.db.kv.get('locale'))?.value;
      const reminder = state.reminder.dirty === 1 && state.reminder.updatedAt ? { enabled: settings.reminderEnabled, time: settings.reminderTime, updatedAt: state.reminder.updatedAt } : null;
      const locale = state.locale.dirty === 1 && state.locale.updatedAt && isLocale(localeValue) ? { value: localeValue, updatedAt: state.locale.updatedAt } : null;
      if (!reminder && !locale) return null;
      return { reminder, locale };
    });
  }

  applyRemote(remote: RemotePrefs | null): Promise<{ reminderChanged: boolean; localeChanged: Locale | null }> {
    return this.db.transaction('rw', this.db.kv, async () => {
      const state = await this.readState();
      let next = state;
      let reminderChanged = false;
      let localeChanged: Locale | null = null;

      const reminder = remote?.reminder ?? null;
      if (resolvePrefGroup(state.reminder, reminder) === 'apply' && reminder) {
        const current = normalizeSettings((await this.db.kv.get('settings'))?.value);
        if (current.reminderEnabled !== reminder.enabled || current.reminderTime !== reminder.time) {
          await this.db.kv.put({ key: 'settings', value: { ...current, reminderEnabled: reminder.enabled, reminderTime: reminder.time } });
          reminderChanged = true;
        }
        next = { ...next, reminder: { updatedAt: reminder.updatedAt, dirty: 0 } };
      }

      const locale = remote?.locale ?? null;
      if (resolvePrefGroup(state.locale, locale) === 'apply' && locale) {
        const current = (await this.db.kv.get('locale'))?.value;
        if (current !== locale.value) {
          await this.db.kv.put({ key: 'locale', value: locale.value });
          localeChanged = locale.value;
        }
        next = { ...next, locale: { updatedAt: locale.updatedAt, dirty: 0 } };
      }

      if (next !== state) await this.db.kv.put({ key: 'prefsSync', value: next });
      return { reminderChanged, localeChanged };
    });
  }

  markAllDirty(): Promise<void> {
    return this.db.transaction('rw', this.db.kv, async () => {
      const state = await this.readState();
      const mark = (g: PrefsSyncState['reminder']) => (g.updatedAt ? { ...g, dirty: 1 as const } : g);
      await this.db.kv.put({ key: 'prefsSync', value: { reminder: mark(state.reminder), locale: mark(state.locale) } });
    });
  }

  getState(): Promise<PrefsSyncState> {
    return this.readState();
  }

  watchState(): Subscribable<PrefsSyncState> {
    return fromLiveQuery(() => this.readState());
  }
}
