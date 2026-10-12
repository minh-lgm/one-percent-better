import { createContext, useContext } from 'react';
import type { MessageKey, TParams } from '../../i18n/types';

export interface ToastAction {
  /** Label key (e.g. `settings.account.goTo`). */
  key: MessageKey;
  onClick: () => void;
}

export interface ToastOptions {
  /** `error`: left border in `--danger`, warning icon, stays 8 s (DESIGN 5, v2). */
  tone?: 'default' | 'error';
  action?: ToastAction;
}

export interface ToastMessage {
  id: number;
  key: MessageKey;
  params?: TParams;
  tone: 'default' | 'error';
  action?: ToastAction;
}

export interface ToastApi {
  show(key: MessageKey, params?: TParams, options?: ToastOptions): void;
  current: ToastMessage | null;
  dismiss(): void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
