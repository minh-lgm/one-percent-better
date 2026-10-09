import { describe, expect, it } from 'vitest';
import { listenForNavigation, type MessageSourceLike } from './sw-messages';

function fakeSource() {
  const listeners = new Set<(event: { data: unknown }) => void>();
  const source: MessageSourceLike = {
    addEventListener: (_type, l) => listeners.add(l),
    removeEventListener: (_type, l) => listeners.delete(l),
  };
  return { source, emit: (data: unknown) => listeners.forEach((l) => l({ data })), size: () => listeners.size };
}

describe('listenForNavigation', () => {
  it('sets location.hash on a NAVIGATE message and ignores anything else', () => {
    const { source, emit, size } = fakeSource();
    const location = { hash: '#/settings' };
    const stop = listenForNavigation(source, location);
    emit({ type: 'OTHER' });
    expect(location.hash).toBe('#/settings');
    emit({ type: 'NAVIGATE', hash: 'javascript:alert(1)' });
    expect(location.hash).toBe('#/settings');
    emit({ type: 'NAVIGATE', hash: '#/today' });
    expect(location.hash).toBe('#/today');
    stop();
    expect(size()).toBe(0);
  });

  it('is a no-op without a service worker', () => {
    expect(() => listenForNavigation(undefined, { hash: '' })()).not.toThrow();
  });
});
