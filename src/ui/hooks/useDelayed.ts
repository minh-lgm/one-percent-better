import { useEffect, useState } from 'react';
import { LOADING_DELAY_MS } from '../../config/constants';

/** True only after `flag` has been true for `delayMs` (avoids skeleton flicker, DESIGN §4). */
export function useDelayed(flag: boolean, delayMs = LOADING_DELAY_MS): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) {
      setShown(false);
      return;
    }
    const id = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(id);
  }, [flag, delayMs]);
  return flag && shown;
}
