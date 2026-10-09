import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { TOAST_DURATION_MS } from '../../config/constants';
import type { MessageKey, TParams } from '../../i18n/types';
import { ToastContext, useToast, type ToastMessage } from '../hooks/useToast';
import { useT } from '../hooks/useT';
import { Icon } from './Icon';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastMessage | null>(null);
  const timer = useRef<number | null>(null);
  const counter = useRef(0);

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clear();
    setCurrent(null);
  }, [clear]);

  const show = useCallback(
    (key: MessageKey, params?: TParams) => {
      clear();
      setCurrent({ id: ++counter.current, key, params });
      timer.current = window.setTimeout(() => setCurrent(null), TOAST_DURATION_MS);
    },
    [clear],
  );

  const api = useMemo(() => ({ show, current, dismiss }), [show, current, dismiss]);
  return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>;
}

/** Renders the single current toast; the text is translated at render time, so language changes apply. */
export function ToastRegion() {
  const { current } = useToast();
  const { t } = useT();
  return (
    <div className="toast-region">
      <div role="status" aria-live="polite">
        {current ? (
          <div className="toast" key={current.id} data-testid="toast">
            <Icon name="check" />
            <span>{t(current.key, current.params)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
