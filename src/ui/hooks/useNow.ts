import { useEffect, useState } from 'react';

/**
 * Current time, refreshed every `intervalMs` (default: once a minute, enough for
 * day rollover) and whenever the tab becomes visible again (a backgrounded tab
 * may have been throttled for hours).
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
  return now;
}
