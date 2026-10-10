// Vitest setup (ARCHITECTURE §6, §8): fake IndexedDB, jest-dom matchers, fixed
// timezone/time, and small DOM polyfills for jsdom.
process.env.TZ = 'Asia/Ho_Chi_Minh';

import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

const FIXED_TIME = new Date('2026-10-09T10:00:00+07:00');

// `findBy*` / `waitFor` default to 1 s; with many jsdom workers sharing the CPU a
// lazy route + Recharts render can take longer (M5-D2). Tests that need a tighter
// bound pass their own timeout.
configure({ asyncUtilTimeout: 8000 });

beforeEach(() => {
  // Fake only Date so timers (waitFor, Dexie liveQuery) keep working.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED_TIME);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

if (typeof window !== 'undefined') {
  // jsdom does not implement <dialog>.showModal()/close().
  const proto = window.HTMLDialogElement?.prototype;
  if (proto && typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function close(this: HTMLDialogElement, returnValue?: string) {
      this.removeAttribute('open');
      if (returnValue !== undefined) this.returnValue = returnValue;
      this.dispatchEvent(new Event('close'));
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (!('scrollTo' in window) || typeof window.scrollTo !== 'function') {
    window.scrollTo = () => {};
  }
}
