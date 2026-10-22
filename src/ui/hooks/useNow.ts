import { useContext, useEffect, useState } from 'react';
import { ServicesContext } from '../../app/AppContext';

/**
 * Current time, refreshed every `intervalMs` (default: once a minute, enough for
 * day rollover) and whenever the tab becomes visible again (a backgrounded tab
 * may have been throttled for hours). v5.0 (M15, QC M12 §9): on the native app the
 * Capacitor `resume` event refreshes it too, so Today shows the new date after
 * midnight even if WKWebView emits no `visibilitychange`.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  // Optional: the hook also works outside the app shell (no provider → web behaviour only).
  const native = useContext(ServicesContext)?.native ?? null;
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisibility);
    const stopResume = native?.lifecycle.onResume(() => setNow(new Date()));
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
      stopResume?.();
    };
  }, [intervalMs, native]);
  return now;
}
