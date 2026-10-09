import type { NotificationPermissionState } from '../domain/reminder';
import type { NotificationPort, ReminderNotification } from '../services/notification-port';

export interface FakeNotifications extends NotificationPort {
  state: NotificationPermissionState;
  /** What `requestPermission()` resolves to (default: `granted`). */
  nextAnswer: NotificationPermissionState;
  shown: ReminderNotification[];
  requests: number;
  /** When false, `show()` reports failure (no service-worker registration). */
  canShow: boolean;
}

/** In-memory `NotificationPort` for service and component tests. */
export function fakeNotifications(state: NotificationPermissionState = 'default'): FakeNotifications {
  const fake: FakeNotifications = {
    state,
    nextAnswer: 'granted',
    shown: [],
    requests: 0,
    canShow: true,
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
  };
  return fake;
}
