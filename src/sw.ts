/// <reference lib="webworker" />
// Service worker (ADR-06): precache the app shell so the app opens offline, and
// bring the app to Today when the daily reminder notification is clicked (M2).
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { handleNotificationClick } from './integration/notification-click';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.waitUntil(handleNotificationClick({ notification: event.notification, clients: self.clients, scope: self.registration.scope }));
});
