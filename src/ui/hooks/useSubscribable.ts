import { useEffect, useState, type DependencyList } from 'react';
import type { Subscribable } from '../../data/repositories';

export interface SubscribableState<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
}

/**
 * Subscribe to a live query. `factory` is re-run when `deps` change.
 */
export function useSubscribable<T>(factory: () => Subscribable<T>, deps: DependencyList): SubscribableState<T> {
  const [state, setState] = useState<SubscribableState<T>>({ data: undefined, loading: true, error: undefined });

  useEffect(() => {
    let active = true;
    const unsubscribe = factory().subscribe(
      (value) => {
        if (active) setState({ data: value, loading: false, error: undefined });
      },
      (error) => {
        if (active) setState((prev) => ({ ...prev, loading: false, error }));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are supplied by the caller
  }, deps);

  return state;
}
