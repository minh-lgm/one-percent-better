// `notificationclick` logic shared by the service worker (src/sw.ts) and its unit
// test. Only structural types are used so this file compiles under both the
// DOM and the WebWorker lib.

export const NAVIGATE_MESSAGE = 'NAVIGATE';
export const TODAY_HASH = '#/today';

export interface WindowClientLike {
  url: string;
  focus(): Promise<unknown>;
  postMessage(message: unknown): void;
}

export interface ClientsLike {
  matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly WindowClientLike[]>;
  openWindow(url: string): Promise<unknown>;
}

export interface NotificationLike {
  close(): void;
  data?: unknown;
}

export interface NotificationClickInput {
  notification: NotificationLike;
  clients: ClientsLike;
  /** Registration scope, e.g. `https://host/` or `https://host/sub/`. */
  scope: string;
}

export interface NavigateMessage {
  type: typeof NAVIGATE_MESSAGE;
  hash: string;
}

function targetHash(notification: NotificationLike): string {
  const data = notification.data as { url?: unknown } | undefined;
  return typeof data?.url === 'string' && data.url.startsWith('#/') ? data.url : TODAY_HASH;
}

/**
 * Close the notification, then focus an open window of this app and send it to
 * Today; if none is open, open one (ARCHITECTURE §5.6).
 */
export async function handleNotificationClick({ notification, clients, scope }: NotificationClickInput): Promise<'focused' | 'opened'> {
  notification.close();
  const hash = targetHash(notification);
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const client = windows.find((c) => c.url.startsWith(scope));
  if (client) {
    await client.focus();
    client.postMessage({ type: NAVIGATE_MESSAGE, hash } satisfies NavigateMessage);
    return 'focused';
  }
  await clients.openWindow(scope + hash);
  return 'opened';
}

export function isNavigateMessage(data: unknown): data is NavigateMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === NAVIGATE_MESSAGE && typeof (data as { hash?: unknown }).hash === 'string';
}
