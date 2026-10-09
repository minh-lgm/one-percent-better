import { Workbox } from 'workbox-window';

/** The subset of workbox-window we use (injectable for tests). */
export interface WorkboxLike {
  addEventListener(type: 'waiting' | 'controlling', listener: () => void): void;
  register(): Promise<unknown>;
  messageSkipWaiting(): void;
}

export interface ServiceWorkerHandle {
  /** Ask the waiting worker to take over; the page reloads once it controls. */
  applyUpdate(): void;
}

export interface RegisterOptions {
  swUrl: string;
  onUpdateAvailable: () => void;
  createWorkbox?: (url: string) => WorkboxLike;
  reload?: () => void;
  serviceWorkerSupported?: boolean;
}

/**
 * Register the service worker (production builds only — the caller decides)
 * and surface "new version available" so the UI can show the UpdateToast.
 */
export async function registerServiceWorker({
  swUrl,
  onUpdateAvailable,
  createWorkbox = (url) => new Workbox(url),
  reload = () => window.location.reload(),
  serviceWorkerSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
}: RegisterOptions): Promise<ServiceWorkerHandle | null> {
  if (!serviceWorkerSupported) return null;
  const wb = createWorkbox(swUrl);
  let updateRequested = false;
  let reloading = false;
  wb.addEventListener('waiting', () => onUpdateAvailable());
  // `controlling` also fires when the very first worker claims the page
  // (clients.claim()); only reload when the user asked for the update.
  wb.addEventListener('controlling', () => {
    if (!updateRequested || reloading) return;
    reloading = true;
    reload();
  });
  try {
    await wb.register();
  } catch {
    return null;
  }
  return {
    applyUpdate() {
      updateRequested = true;
      wb.messageSkipWaiting();
    },
  };
}
