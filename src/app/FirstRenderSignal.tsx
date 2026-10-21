import { useEffect } from 'react';

/**
 * Calls `onFirstRender` once the tree it sits in has committed (M13: the native launch image is hidden on that
 * signal). Rendered in every branch of main.tsx — the app and the S8 storage-error screen — so the signal does not
 * depend on the bootstrap succeeding (M13-D1). Under StrictMode the effect may run twice; callers pass an
 * idempotent resolver.
 */
export function FirstRenderSignal({ onFirstRender }: { onFirstRender: () => void }) {
  useEffect(() => {
    onFirstRender();
    // Only the first commit matters; a changed callback must not re-fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
