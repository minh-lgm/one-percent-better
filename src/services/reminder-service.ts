import type { EntryRepository, GoalRepository } from '../data/repositories';
import { REMINDER_NOTIFICATION_ID_BASE } from '../config/constants';
import { toISODate } from '../domain/dates';
import { minutesByGoal } from '../domain/entry';
import { activeGoals, dailyTarget } from '../domain/goal';
import { reminderData, shouldNotify, shouldShowBanner, type GoalProgress, type ReminderData } from '../domain/reminder';
import { planReminderDates, reminderDateTime } from '../domain/reminder-plan';
import type { Translator } from '../i18n/types';
import { Mutex } from './mutex';
import type { NotificationPort, ScheduledReminder } from './notification-port';
import type { SettingsService } from './settings-service';

export const REMINDER_TAG = 'daily-reminder';
export const REMINDER_URL = '#/today';

export interface BannerState {
  show: boolean;
  count: number;
  time: string;
}

/**
 * v5.0 (M15): outcome of `replan`. `'failed'` (not in ARCH §5.6, additive): the adapter could not write the schedule;
 * the next trigger tries again.
 */
export type ReplanResult = 'scheduled' | 'cancelled' | 'no-permission' | 'unsupported' | 'failed';

/**
 * Daily reminder (FR-14, FR-15; ARCHITECTURE §5.6). `check(now)` sends at most one
 * notification per day while the app is open; text is translated at send time.
 * v5.0 (M15, FR-62, ADR-40): on native, `replan(now)` replaces the OS schedule for the next 14 days instead.
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

  /** `check` reads settings, sends, then writes `lastReminderDate`: one at a time (M2-D3). `replan` shares it. */
  private readonly lock = new Mutex();
  /** Coalescing for `replan` (M15-AC2): a call during a run is remembered and run once more with the latest `now`. */
  private replanInFlight: Promise<ReplanResult> | null = null;
  private replanNext: Date | null = null;
  private replanFollowUp: Promise<ReplanResult> | null = null;

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

  /**
   * v5.0 (M15): replace the OS schedule (ARCH §5.6 v5.0): `'unsupported'` when the port cannot schedule (web),
   * `'cancelled'` when reminders are off (schedule cleared), `'no-permission'` when iOS has not allowed notifications
   * (never asks: A-64), otherwise one notification per planned day at the reminder time, text in the current locale.
   * Concurrent calls coalesce: at most one extra run, with the latest `now` (M15-AC2).
   */
  replan(now: Date): Promise<ReplanResult> {
    if (this.replanInFlight) {
      this.replanNext = now;
      if (!this.replanFollowUp) {
        this.replanFollowUp = this.replanInFlight.then(
          () => this.runFollowUp(),
          () => this.runFollowUp(),
        );
      }
      return this.replanFollowUp;
    }
    const run = this.lock.run(() => this.doReplan(now)).finally(() => {
      this.replanInFlight = null;
    });
    this.replanInFlight = run;
    return run;
  }

  private runFollowUp(): Promise<ReplanResult> {
    const next = this.replanNext ?? new Date();
    this.replanNext = null;
    this.replanFollowUp = null;
    return this.replan(next);
  }

  private async doReplan(now: Date): Promise<ReplanResult> {
    if (!this.notifications.canSchedule) return 'unsupported';
    const settings = await this.settings.get();
    if (!settings.reminderEnabled) {
      await this.notifications.cancelAll();
      return 'cancelled';
    }
    const permission = this.notifications.refreshPermission ? await this.notifications.refreshPermission() : this.notifications.permission();
    if (permission !== 'granted') return 'no-permission';
    const [goals, todayProgress] = await Promise.all([this.goals.getAll(), this.progress(now)]);
    const dates = planReminderDates({ now, reminderEnabled: true, reminderTime: settings.reminderTime, goals, todayProgress });
    const title = this.translator.t('notification.nativeTitle');
    const body = this.translator.t('notification.nativeBody');
    const items: ScheduledReminder[] = dates.map((date, i) => ({ id: REMINDER_NOTIFICATION_ID_BASE + i, at: reminderDateTime(date, settings.reminderTime), title, body, url: REMINDER_URL }));
    return (await this.notifications.schedule(items)) ? 'scheduled' : 'failed';
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
