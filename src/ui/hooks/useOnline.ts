import { useSyncExternalStore } from 'react';
import { useServices } from './useServices';

/** `navigator.onLine` as React state, through the container's `Connectivity` (tests can fake it). */
export function useOnline(): boolean {
  const { connectivity } = useServices();
  return useSyncExternalStore(connectivity.subscribe, connectivity.isOnline, () => true);
}
