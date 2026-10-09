import type { KvRepository, Subscribable } from '../data/repositories';
import { isValidReminderTime } from '../domain/reminder';
import { normalizeSettings } from '../domain/settings';
import type { Settings } from '../domain/types';

export { normalizeSettings };

/** Settings stored under kv key `settings` (ARCHITECTURE §4). Missing fields fall back to defaults. */
export class SettingsService {
  constructor(private readonly kv: KvRepository) {}

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
    return this.update({ reminderEnabled: enabled });
  }

  setReminderTime(time: string): Promise<Settings> {
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

  watch(): Subscribable<Settings> {
    const source = this.kv.watch<unknown>('settings');
    return {
      subscribe: (onNext, onError) => source.subscribe((value) => onNext(normalizeSettings(value)), onError),
    };
  }
}
