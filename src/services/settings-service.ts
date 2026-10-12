import type { KvRepository, Subscribable, SyncedPrefsRepository } from '../data/repositories';
import { isValidReminderTime } from '../domain/reminder';
import { markPlusOneShown } from '../domain/plusone';
import { normalizeSettings } from '../domain/settings';
import type { ISODate, Settings } from '../domain/types';

export { normalizeSettings };

/**
 * Settings stored under kv key `settings` (ARCHITECTURE §4). Missing fields fall back to defaults.
 * v2.1 (FR-55): with a `SyncedPrefsRepository`, the reminder on/off + time go through it so the
 * value and its sync marker are written together; the device-only fields (`lastReminderDate`,
 * `plusOneShown`, `lastBackupAt`) never touch the markers.
 */
export class SettingsService {
  constructor(
    private readonly kv: KvRepository,
    private readonly prefs?: SyncedPrefsRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async get(): Promise<Settings> {
    return normalizeSettings(await this.kv.get('settings'));
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    if (patch.reminderTime !== undefined && !isValidReminderTime(patch.reminderTime)) {
      throw new RangeError(`Invalid reminder time: ${String(patch.reminderTime)}`);
    }
    const next = normalizeSettings({ ...(await this.get()), ...patch });
    await this.kv.set('settings', next);
    return next;
  }

  setReminderEnabled(enabled: boolean): Promise<Settings> {
    if (this.prefs) return this.prefs.setReminder({ reminderEnabled: enabled }, this.clock());
    return this.update({ reminderEnabled: enabled });
  }

  setReminderTime(time: string): Promise<Settings> {
    if (this.prefs) return this.prefs.setReminder({ reminderTime: time }, this.clock());
    return this.update({ reminderTime: time });
  }

  /**
   * Mark `date` as "reminder sent" unless it already is — atomically across tabs
   * (M2-D3 cross-tab). Returns true when this caller won the claim.
   */
  async claimReminderDay(date: string): Promise<boolean> {
    const { written } = await this.kv.update<unknown>('settings', (raw) => {
      const current = normalizeSettings(raw);
      return current.lastReminderDate === date ? undefined : { ...current, lastReminderDate: date };
    });
    return written;
  }

  /** Undo `claimReminderDay` when the notification could not be shown, so a later check retries. */
  async releaseReminderDay(date: string, previous: string | null): Promise<void> {
    await this.kv.update<unknown>('settings', (raw) => {
      const current = normalizeSettings(raw);
      return current.lastReminderDate === date ? { ...current, lastReminderDate: previous } : undefined;
    });
  }

  /**
   * Record that the "+1%" feedback for `goalId` was shown on `date` (FR-29),
   * atomically across tabs like `claimReminderDay`. Returns true when this
   * caller is the first to claim it (and therefore the one that shows it).
   */
  async claimPlusOne(goalId: string, date: ISODate): Promise<boolean> {
    const { written } = await this.kv.update<unknown>('settings', (raw) => {
      const current = normalizeSettings(raw);
      return current.plusOneShown[goalId] === date ? undefined : { ...current, plusOneShown: markPlusOneShown(current.plusOneShown, goalId, date) };
    });
    return written;
  }

  watch(): Subscribable<Settings> {
    const source = this.kv.watch<unknown>('settings');
    return {
      subscribe: (onNext, onError) => source.subscribe((value) => onNext(normalizeSettings(value)), onError),
    };
  }
}
