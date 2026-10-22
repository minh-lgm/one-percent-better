// M15-AC3: the native NotificationPort over @capacitor/local-notifications (ARCH §5.6 v5.0), plugin mocked.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: 'prompt' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    getPending: vi.fn(async () => ({ notifications: [] })),
    cancel: vi.fn(async () => undefined),
    schedule: vi.fn(async () => ({ notifications: [] })),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })),
  },
}));

import type { PermissionState } from '@capacitor/core';
import { LocalNotifications, type ActionPerformed } from '@capacitor/local-notifications';
import type { ScheduledReminder } from '../../services/notification-port';
import { createLocalNotifications, isReminderId, REMINDER_ID_MAX, REMINDER_ID_MIN, toPermissionState, type LocalNotificationsDeps } from './local-notifications';

afterEach(() => {
  vi.clearAllMocks();
});

const items = (n = 14): ScheduledReminder[] => Array.from({ length: n }, (_, i) => ({ id: 1000 + i, at: new Date(2026, 9, 9 + i, 20, 0, 0, 0), title: '1% Better', body: 'Log today’s time. Small steps add up.', url: '#/today' }));

/** Deps over the mocked plugin, with an injected `navigate` (the default writes `location.hash`). */
function deps(): LocalNotificationsDeps & { navigate: ReturnType<typeof vi.fn<(url: string) => void>> } {
  const navigate = vi.fn<(url: string) => void>();
  return {
    checkPermissions: () => LocalNotifications.checkPermissions(),
    requestPermissions: () => LocalNotifications.requestPermissions(),
    getPending: () => LocalNotifications.getPending(),
    cancel: (ids) => LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) }),
    schedule: (notifications) => LocalNotifications.schedule({ notifications }),
    addActionListener: (cb) => LocalNotifications.addListener('localNotificationActionPerformed', cb),
    navigate,
  };
}

describe('permission mapping', () => {
  it('toPermissionState: prompt / prompt-with-rationale / unknown → default; granted, denied kept', () => {
    expect(toPermissionState('prompt')).toBe('default');
    expect(toPermissionState('prompt-with-rationale')).toBe('default');
    expect(toPermissionState(undefined)).toBe('default');
    expect(toPermissionState('granted')).toBe('granted');
    expect(toPermissionState('denied')).toBe('denied');
  });

  it('permission() is the cached state: default until refreshed; refreshPermission reads checkPermissions', async () => {
    const port = createLocalNotifications(deps());
    expect(port.canSchedule).toBe(true);
    expect(port.permission()).toBe('default');
    for (const [display, expected] of [
      ['prompt', 'default'],
      ['prompt-with-rationale', 'default'],
      ['granted', 'granted'],
      ['denied', 'denied'],
    ] as Array<[PermissionState, string]>) {
      vi.mocked(LocalNotifications.checkPermissions).mockResolvedValueOnce({ display });
      expect(await port.refreshPermission!()).toBe(expected);
      expect(port.permission()).toBe(expected);
    }
    // A runtime without the plugin (the native build in a browser): the cached value stays, nothing throws.
    vi.mocked(LocalNotifications.checkPermissions).mockRejectedValueOnce(new Error('not implemented'));
    expect(await port.refreshPermission!()).toBe('denied');
    // The QC emulation bridge answers `{}` for unknown plugins → default.
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValueOnce({} as { display: PermissionState });
    expect(await port.refreshPermission!()).toBe('default');
  });

  it('requestPermission maps the answer the same way and updates the cache; a rejection falls back to a refresh', async () => {
    const port = createLocalNotifications(deps());
    vi.mocked(LocalNotifications.requestPermissions).mockResolvedValueOnce({ display: 'prompt-with-rationale' });
    expect(await port.requestPermission()).toBe('default');
    vi.mocked(LocalNotifications.requestPermissions).mockResolvedValueOnce({ display: 'denied' });
    expect(await port.requestPermission()).toBe('denied');
    expect(port.permission()).toBe('denied');
    vi.mocked(LocalNotifications.requestPermissions).mockResolvedValueOnce({ display: 'granted' });
    expect(await port.requestPermission()).toBe('granted');
    expect(LocalNotifications.requestPermissions).toHaveBeenCalledTimes(3);
    vi.mocked(LocalNotifications.requestPermissions).mockRejectedValueOnce(new Error('not implemented'));
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValueOnce({ display: 'granted' });
    expect(await port.requestPermission()).toBe('granted');
  });
});

describe('schedule / cancelAll (ids 1000 … 1013)', () => {
  it('cancels only the pending ids inside the plan range, then schedules 14 notifications with at / allowWhileIdle / extra.url', async () => {
    vi.mocked(LocalNotifications.getPending).mockResolvedValueOnce({ notifications: [999, 1000, 1005, 1013, 1014, 2000].map((id) => ({ id, title: 't', body: 'b' })) });
    const port = createLocalNotifications(deps());
    expect(await port.schedule(items())).toBe(true);
    expect(LocalNotifications.getPending).toHaveBeenCalledTimes(1);
    expect(LocalNotifications.cancel).toHaveBeenCalledTimes(1);
    expect(vi.mocked(LocalNotifications.cancel).mock.calls[0][0]).toEqual({ notifications: [{ id: 1000 }, { id: 1005 }, { id: 1013 }] });
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
    const scheduled = vi.mocked(LocalNotifications.schedule).mock.calls[0][0].notifications;
    expect(scheduled).toHaveLength(14);
    expect(scheduled.map((n) => n.id)).toEqual(Array.from({ length: 14 }, (_, i) => 1000 + i));
    for (const [i, n] of scheduled.entries()) {
      expect(n.schedule?.at).toBeInstanceOf(Date);
      expect(n.schedule?.at?.getTime()).toBe(new Date(2026, 9, 9 + i, 20, 0, 0, 0).getTime());
      expect(n.schedule?.allowWhileIdle).toBe(true);
      expect(n.schedule?.repeats).toBeUndefined();
      expect(n.extra).toEqual({ url: '#/today' });
      expect(n.title).toBe('1% Better');
      expect(n.body).toBe('Log today’s time. Small steps add up.');
      // No sound / badge / action buttons (DESIGN 7.8.4).
      expect(n.sound).toBeUndefined();
      expect(n.actionTypeId).toBeUndefined();
    }
    expect(REMINDER_ID_MIN).toBe(1000);
    expect(REMINDER_ID_MAX).toBe(1013);
    expect([999, 1014, 2000].some(isReminderId)).toBe(false);
    expect([1000, 1007, 1013].every(isReminderId)).toBe(true);
  });

  it('nothing pending → no cancel call; an empty plan clears the pending ids and schedules nothing', async () => {
    const port = createLocalNotifications(deps());
    expect(await port.schedule(items(3))).toBe(true);
    expect(LocalNotifications.cancel).not.toHaveBeenCalled();
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
    vi.mocked(LocalNotifications.getPending).mockResolvedValueOnce({ notifications: [{ id: 1000, title: 't', body: 'b' }, { id: 1001, title: 't', body: 'b' }] });
    expect(await port.schedule([])).toBe(true);
    expect(LocalNotifications.cancel).toHaveBeenCalledTimes(1);
    expect(vi.mocked(LocalNotifications.cancel).mock.calls[0][0]).toEqual({ notifications: [{ id: 1000 }, { id: 1001 }] });
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
  });

  it('the plugin throws (schedule or getPending) → false, nothing else thrown', async () => {
    const port = createLocalNotifications(deps());
    vi.mocked(LocalNotifications.schedule).mockRejectedValueOnce(new Error('boom'));
    expect(await port.schedule(items())).toBe(false);
    vi.mocked(LocalNotifications.getPending).mockRejectedValueOnce(new Error('boom'));
    expect(await port.schedule(items())).toBe(false);
    // The QC emulation bridge answers `{}` (no `notifications`) → treated as nothing pending.
    vi.mocked(LocalNotifications.getPending).mockResolvedValueOnce({} as { notifications: [] });
    expect(await port.schedule(items(1))).toBe(true);
  });

  it('cancelAll cancels the pending plan ids only and swallows plugin errors; show() is never used (false)', async () => {
    const port = createLocalNotifications(deps());
    vi.mocked(LocalNotifications.getPending).mockResolvedValueOnce({ notifications: [{ id: 42, title: 't', body: 'b' }, { id: 1002, title: 't', body: 'b' }] });
    await port.cancelAll();
    expect(vi.mocked(LocalNotifications.cancel).mock.calls[0][0]).toEqual({ notifications: [{ id: 1002 }] });
    vi.mocked(LocalNotifications.getPending).mockRejectedValueOnce(new Error('boom'));
    await expect(port.cancelAll()).resolves.toBeUndefined();
    expect(await port.show({ title: 't', body: 'b', lang: 'en', tag: 'daily-reminder', url: '#/today' })).toBe(false);
  });
});

describe('tap on a notification', () => {
  it('listen(): localNotificationActionPerformed → navigate(extra.url), default #/today; stop removes the handle', async () => {
    let handler: ((a: ActionPerformed) => void) | undefined;
    const remove = vi.fn(async () => undefined);
    vi.mocked(LocalNotifications.addListener).mockImplementationOnce(async (_event: string, cb: (a: ActionPerformed) => void) => {
      handler = cb;
      return { remove };
    });
    const d = deps();
    const port = createLocalNotifications(d);
    const stop = port.listen();
    await Promise.resolve();
    expect(LocalNotifications.addListener).toHaveBeenCalledWith('localNotificationActionPerformed', expect.any(Function));
    handler!({ actionId: 'tap', notification: { id: 1000, title: 't', body: 'b', extra: { url: '#/today' } } });
    expect(d.navigate).toHaveBeenCalledWith('#/today');
    handler!({ actionId: 'tap', notification: { id: 1001, title: 't', body: 'b' } });
    expect(d.navigate).toHaveBeenLastCalledWith('#/today');
    stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(1);
    handler!({ actionId: 'tap', notification: { id: 1002, title: 't', body: 'b', extra: { url: '#/goals' } } });
    expect(d.navigate).toHaveBeenCalledTimes(2);
  });

  it('a runtime without the plugin rejects addListener → listen() does not throw', async () => {
    vi.mocked(LocalNotifications.addListener).mockRejectedValueOnce(new Error('not implemented'));
    const port = createLocalNotifications(deps());
    const stop = port.listen();
    await Promise.resolve();
    await Promise.resolve();
    expect(() => stop()).not.toThrow();
  });

  it('default deps talk to the plugin', async () => {
    const port = createLocalNotifications();
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValueOnce({ display: 'granted' });
    expect(await port.refreshPermission!()).toBe('granted');
    expect(LocalNotifications.checkPermissions).toHaveBeenCalledTimes(1);
    await port.schedule(items(2));
    expect(LocalNotifications.getPending).toHaveBeenCalledTimes(1);
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
  });
});
