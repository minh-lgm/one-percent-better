import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker, type WorkboxLike } from './sw-register';

function fakeWorkbox() {
  const listeners: Record<string, Array<() => void>> = {};
  const register = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const messageSkipWaiting = vi.fn<() => void>();
  const wb: WorkboxLike = {
    addEventListener: (type, cb) => {
      (listeners[type] ??= []).push(cb);
    },
    register,
    messageSkipWaiting,
  };
  return { ...wb, register, messageSkipWaiting, fire: (t: string) => listeners[t]?.forEach((cb) => cb()) };
}

describe('registerServiceWorker', () => {
  it('registers, reports updates and reloads once after skipWaiting', async () => {
    const wb = fakeWorkbox();
    const onUpdateAvailable = vi.fn();
    const reload = vi.fn();
    const handle = await registerServiceWorker({ swUrl: '/sw.js', onUpdateAvailable, reload, createWorkbox: () => wb, serviceWorkerSupported: true });
    expect(wb.register).toHaveBeenCalledTimes(1);
    expect(handle).not.toBeNull();
    // First activation (clients.claim) fires `controlling` too: must NOT reload.
    wb.fire('controlling');
    expect(reload).not.toHaveBeenCalled();
    wb.fire('waiting');
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
    handle?.applyUpdate();
    expect(wb.messageSkipWaiting).toHaveBeenCalledTimes(1);
    wb.fire('controlling');
    wb.fire('controlling');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('returns null when unsupported or registration fails', async () => {
    expect(await registerServiceWorker({ swUrl: '/sw.js', onUpdateAvailable: () => {}, serviceWorkerSupported: false, createWorkbox: fakeWorkbox })).toBeNull();
    const wb = fakeWorkbox();
    wb.register.mockRejectedValue(new Error('nope'));
    expect(await registerServiceWorker({ swUrl: '/sw.js', onUpdateAvailable: () => {}, serviceWorkerSupported: true, createWorkbox: () => wb })).toBeNull();
  });
});
