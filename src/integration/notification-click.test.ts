import { describe, expect, it, vi } from 'vitest';
import { handleNotificationClick, isNavigateMessage, type WindowClientLike } from './notification-click';

const SCOPE = 'http://localhost:4173/';

function client(url: string) {
  const focus = vi.fn(async () => undefined);
  const postMessage = vi.fn((_message: unknown) => undefined);
  const c: WindowClientLike = { url, focus, postMessage };
  return Object.assign(c, { focus, postMessage });
}

function setup(windows: WindowClientLike[]) {
  const notification = { close: vi.fn(), data: { url: '#/today' } };
  const clients = { matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => undefined) };
  return { notification, clients };
}

describe('handleNotificationClick (M2-AC9)', () => {
  it('focuses an open client of this scope and sends it to #/today', async () => {
    const open = client(`${SCOPE}#/settings`);
    const { notification, clients } = setup([client('http://other.example/'), open]);
    const result = await handleNotificationClick({ notification, clients, scope: SCOPE });
    expect(result).toBe('focused');
    expect(notification.close).toHaveBeenCalledTimes(1);
    expect(open.focus).toHaveBeenCalledTimes(1);
    expect(open.postMessage).toHaveBeenCalledWith({ type: 'NAVIGATE', hash: '#/today' });
    expect(clients.openWindow).not.toHaveBeenCalled();
    expect(clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
  });

  it('opens a new window at scope + #/today when no client is open', async () => {
    const { notification, clients } = setup([]);
    const result = await handleNotificationClick({ notification, clients, scope: SCOPE });
    expect(result).toBe('opened');
    expect(notification.close).toHaveBeenCalledTimes(1);
    expect(clients.openWindow).toHaveBeenCalledWith(`${SCOPE}#/today`);
  });

  it('falls back to #/today when the notification carries no usable url', async () => {
    const { clients } = setup([]);
    await handleNotificationClick({ notification: { close: vi.fn(), data: { url: 'https://evil.example' } }, clients, scope: SCOPE });
    expect(clients.openWindow).toHaveBeenCalledWith(`${SCOPE}#/today`);
  });

  it('isNavigateMessage guards the page-side message', () => {
    expect(isNavigateMessage({ type: 'NAVIGATE', hash: '#/today' })).toBe(true);
    expect(isNavigateMessage({ type: 'NAVIGATE' })).toBe(false);
    expect(isNavigateMessage(null)).toBe(false);
  });
});
