import type { EntryRepository, GoalRepository } from '../data/repositories';
import { toISODate } from '../domain/dates';
import { minutesByGoal } from '../domain/entry';
import { activeGoals, dailyTarget } from '../domain/goal';
import { reminderData, shouldNotify, shouldShowBanner, type GoalProgress, type ReminderData } from '../domain/reminder';
import type { Translator } from '../i18n/types';
import { Mutex } from './mutex';
import type { NotificationPort } from './notification-port';
import type { SettingsService } from './settings-service';

export const REMINDER_TAG = 'daily-reminder';
export const REMINDER_URL = '#/today';

export interface BannerState {
  show: boolean;
  count: number;
  time: string;
}

/**
 * Daily reminder (FR-14, FR-15; ARCHITECTURE §5.6). `check(now)` sends at most one
 * notification per day while the app is open; text is translated at send time.
 */
export class ReminderService {
  constructor(
    private readonly settings: SettingsService,
    private readonly goals: GoalRepository,
    private readonly entries: EntryRepository,
    private readonly notifications: NotificationPort,
    private readonly translator: Translator,
    private readonly iconUrl?: string,
  ) {}

  /** `check` reads settings, sends, then writes `lastReminderDate`: one at a time (M2-D3). */
  private readonly lock = new Mutex();

  /** Today's progress of every active goal (Today order). */
  async progress(now: Date): Promise<GoalProgress[]> {
    const today = toISODate(now);
    const [goals, entries] = await Promise.all([this.goals.getAll(), this.entries.getByDateRange(today, today)]);
    const byGoal = minutesByGoal(entries);
    return activeGoals(goals, today).map((g) => ({ id: g.id, name: g.name, current: byGoal.get(g.id) ?? 0, target: dailyTarget(g) }));
  }

  /** Send the reminder if due. Returns `true` when a notification was sent. */
  check(now: Date): Promise<boolean> {
    return this.lock.run(() => this.doCheck(now));
  }

  private async doCheck(now: Date): Promise<boolean> {
    const settings = await this.settings.get();
    if (!settings.reminderEnabled) return false;
    const permission = this.notifications.permission();
    if (permission !== 'granted') return false;
    const progress = await this.progress(now);
    if (!shouldNotify(now, settings, permission, progress)) return false;

    // Claim today atomically (one rw transaction on kv, serialised across tabs) before
    // showing, so two open tabs cannot both send; on failure give the claim back.
    const today = toISODate(now);
    if (!(await this.settings.claimReminderDay(today))) return false;
    const data = reminderData(progress);
    let shown = false;
    try {
      shown = await this.notifications.show({
        title: this.translator.t('notification.title'),
        body: this.body(data),
        lang: this.translator.locale,
        tag: REMINDER_TAG,
        url: REMINDER_URL,
        icon: this.iconUrl,
      });
    } finally {
      if (!shown) await this.settings.releaseReminderDay(today, settings.lastReminderDate);
    }
    return shown;
  }

  async getBannerState(now: Date): Promise<BannerState> {
    const settings = await this.settings.get();
    const progress = await this.progress(now);
    return { show: shouldShowBanner(now, settings, progress), count: reminderData(progress).count, time: settings.reminderTime };
  }

  /** Notification body from structured data (DESIGN §7.5): up to 3 goals, then "and k more". */
  body(data: ReminderData): string {
    const t = this.translator;
    const items = data.items.map((g) => t.t('notification.item', { goal: g.name, current: g.current, target: g.target })).join(', ');
    const list = data.more > 0 ? t.t('notification.more', { items, k: data.more }) : items;
    return t.t('notification.body', { count: data.count, list });
  }
}
