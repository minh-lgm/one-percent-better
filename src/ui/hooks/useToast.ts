import { createContext, useContext } from 'react';
import type { MessageKey, TParams } from '../../i18n/types';

export interface ToastMessage {
  id: number;
  key: MessageKey;
  params?: TParams;
}

export interface ToastApi {
  show(key: MessageKey, params?: TParams): void;
  current: ToastMessage | null;
  dismiss(): void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
