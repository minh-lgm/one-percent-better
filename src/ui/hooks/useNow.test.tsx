// M15 (QC M12 §9 / dev-M13 note): `useNow` refreshes on the Capacitor `resume` event, not only on `visibilitychange`.
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider } from '../../app/AppContext';
import { createTestContainer, fakeNativePlatform, type TestContainer } from '../../test/container';
import { useNow } from './useNow';

function Clock() {
  const now = useNow(60_000);
  return <time data-testid="now">{now.toISOString()}</time>;
}

let tc: TestContainer | undefined;
afterEach(async () => {
  await tc?.dispose();
  tc = undefined;
});

describe('useNow', () => {
  it('native: a resume refreshes the value; unmount unsubscribes', async () => {
    const native = fakeNativePlatform('ios');
    tc = await createTestContainer({ native });
    const { unmount } = render(
      <ServicesProvider container={tc.container}>
        <Clock />
      </ServicesProvider>,
    );
    expect(screen.getByTestId('now')).toHaveTextContent('2026-10-09T03:00:00.000Z');
    expect(native.resumeListeners()).toBe(1);
    vi.setSystemTime(new Date('2026-10-10T00:30:00+07:00')); // the app comes back after midnight
    act(() => native.resume());
    expect(screen.getByTestId('now')).toHaveTextContent('2026-10-09T17:30:00.000Z');
    unmount();
    expect(native.resumeListeners()).toBe(0);
  });

  it('web (no runtime) and outside the provider: visibilitychange still refreshes', () => {
    render(<Clock />);
    expect(screen.getByTestId('now')).toHaveTextContent('2026-10-09T03:00:00.000Z');
    vi.setSystemTime(new Date('2026-10-09T05:00:00+07:00'));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByTestId('now')).toHaveTextContent('2026-10-08T22:00:00.000Z');
  });
});
