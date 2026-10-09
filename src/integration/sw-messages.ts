// Page side of service-worker messages: a `NAVIGATE` message (sent on
// `notificationclick`) moves the hash router to the requested route.
import { isNavigateMessage } from './notification-click';

export interface MessageSourceLike {
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface LocationLike {
  hash: string;
}

export function listenForNavigation(
  source: MessageSourceLike | undefined = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  location: LocationLike = window.location,
): () => void {
  if (!source) return () => {};
  const listener = (event: { data: unknown }) => {
    if (isNavigateMessage(event.data) && /^#\/[A-Za-z0-9/_-]*$/.test(event.data.hash)) {
      location.hash = event.data.hash;
    }
  };
  source.addEventListener('message', listener);
  return () => source.removeEventListener('message', listener);
}
