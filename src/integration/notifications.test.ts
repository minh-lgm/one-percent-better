import { describe, expect, it, vi } from 'vitest';
import { createBrowserNotifications, type NotificationWindowLike, type RegistrationLike } from './notifications';

function fakeWindow(permission: string, answer = 'granted'): NotificationWindowLike & { requestPermission: ReturnType<typeof vi.fn> } {
  const requestPermission = vi.fn(async () => {
    api.permission = answer;
    return answer;
  });
  const api = { permission, requestPermission };
  return { Notification: api, requestPermission };
}

const notification = { title: '1% Better', body: 'b', lang: 'en', tag: 'daily-reminder', url: '#/today', icon: '/i.png' };

describe('createBrowserNotifications (ARCH §5.6)', () => {
  it('maps the four permission states', () => {
    expect(createBrowserNotifications({ win: {} }).permission()).toBe('unsupported');
    expect(createBrowserNotifications({ win: fakeWindow('default') }).permission()).toBe('default');
    expect(createBrowserNotifications({ win: fakeWindow('granted') }).permission()).toBe('granted');
    expect(createBrowserNotifications({ win: fakeWindow('denied') }).permission()).toBe('denied');
  });

  it('requestPermission asks the browser once and returns the new state', async () => {
    const win = fakeWindow('default', 'denied');
    const port = createBrowserNotifications({ win });
    expect(await port.requestPermission()).toBe('denied');
    expect(win.requestPermission).toHaveBeenCalledTimes(1);
    expect(await createBrowserNotifications({ win: {} }).requestPermission()).toBe('unsupported');
  });

  it('shows through the service-worker registration with lang, tag, data.url and icon', async () => {
    const showNotification = vi.fn(async () => undefined);
    const registration: RegistrationLike = { showNotification };
    const port = createBrowserNotifications({ win: fakeWindow('granted'), getRegistration: async () => registration });
    expect(await port.show(notification)).toBe(true);
    expect(showNotification).toHaveBeenCalledWith('1% Better', { body: 'b', lang: 'en', tag: 'daily-reminder', data: { url: '#/today' }, icon: '/i.png' });
  });

  it('returns false without permission, without a registration, or when showing throws', async () => {
    const registration: RegistrationLike = { showNotification: vi.fn(async () => undefined) };
    expect(await createBrowserNotifications({ win: fakeWindow('default'), getRegistration: async () => registration }).show(notification)).toBe(false);
    expect(await createBrowserNotifications({ win: fakeWindow('granted'), getRegistration: async () => undefined }).show(notification)).toBe(false);
    const failing: RegistrationLike = {
      showNotification: async () => {
        throw new Error('nope');
      },
    };
    expect(await createBrowserNotifications({ win: fakeWindow('granted'), getRegistration: async () => failing }).show(notification)).toBe(false);
  });
});
