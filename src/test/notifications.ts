import type { NotificationPermissionState } from '../domain/reminder';
import type { NotificationPort, ReminderNotification, ScheduledReminder } from '../services/notification-port';

export interface FakeNotifications extends NotificationPort {
  state: NotificationPermissionState;
  /** What `requestPermission()` resolves to (default: `granted`). */
  nextAnswer: NotificationPermissionState;
  shown: ReminderNotification[];
  requests: number;
  /** When false, `show()` reports failure (no service-worker registration). */
  canShow: boolean;
  /** v5.0 (M15): every `schedule()` call, in order (the last one is the pending schedule). */
  scheduled: ScheduledReminder[][];
  cancels: number;
  /** When false, `schedule()` resolves `false` (plugin failure). */
  canScheduleNow: boolean;
  /** `refreshPermission()` calls (native adapters refresh their cache). */
  refreshes: number;
}

/**
 * In-memory `NotificationPort` for service and component tests. `canSchedule: true` models the native adapter
 * (M15): the OS delivers scheduled notifications; `show()` is never used there.
 */
export function fakeNotifications(state: NotificationPermissionState = 'default', options: { canSchedule?: boolean } = {}): FakeNotifications {
  const fake: FakeNotifications = {
    state,
    nextAnswer: 'granted',
    shown: [],
    requests: 0,
    canShow: true,
    scheduled: [],
    cancels: 0,
    canScheduleNow: true,
    refreshes: 0,
    canSchedule: options.canSchedule ?? false,
    permission: () => fake.state,
    async requestPermission() {
      fake.requests += 1;
      if (fake.state === 'unsupported') return 'unsupported';
      if (fake.state === 'default') fake.state = fake.nextAnswer;
      return fake.state;
    },
    async show(n) {
      if (fake.state !== 'granted' || !fake.canShow) return false;
      fake.shown.push(n);
      return true;
    },
    async schedule(items) {
      if (!fake.canScheduleNow) return false;
      fake.scheduled.push(items.map((i) => ({ ...i })));
      return true;
    },
    async cancelAll() {
      fake.cancels += 1;
      fake.scheduled.push([]);
    },
    async refreshPermission() {
      fake.refreshes += 1;
      return fake.state;
    },
  };
  return fake;
}

/** The schedule currently pending in a fake port (`[]` when nothing was scheduled or it was cancelled). */
export function pendingSchedule(fake: FakeNotifications): ScheduledReminder[] {
  return fake.scheduled.length === 0 ? [] : fake.scheduled[fake.scheduled.length - 1];
}
