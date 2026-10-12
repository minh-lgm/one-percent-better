import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './app/App';
import { bootstrap } from './app/bootstrap';
import { createContainer } from './app/container';
import { startReminderScheduler } from './app/reminder-scheduler';
import { createAppRouter } from './app/router';
import { startSyncScheduler } from './app/sync-scheduler';
import { env } from './config/env';
import { cleanCallbackUrl, readAuthCallback, sessionReturnTo } from './integration/auth-callback';
import { listenForNavigation } from './integration/sw-messages';
import { registerServiceWorker } from './integration/sw-register';
import { StorageError } from './ui/screens/StorageError';
import './ui/styles/app.css';

const root = createRoot(document.getElementById('root') as HTMLElement);

async function start(): Promise<void> {
  // OAuth callback (`<BASE_URL>?auth=callback&code=…`, ADR-19) is read once, before the hash router exists.
  const authCallback = readAuthCallback(window.location);
  const result = await bootstrap({
    navigatorLanguage: navigator.language,
    createContainer: (i18n) => createContainer({ i18n, dbName: env.dbName, cloud: env.cloud, notificationIconUrl: `${import.meta.env.BASE_URL}icons/pwa-192.png` }),
    authCallback,
    cleanCallbackUrl: () => cleanCallbackUrl(window.history, import.meta.env.BASE_URL, sessionReturnTo(window.sessionStorage).take()),
  });

  if (!result.ok) {
    root.render(
      <StrictMode>
        <I18nextProvider i18n={result.i18n}>
          <StorageError onRetry={start} />
        </I18nextProvider>
      </StrictMode>,
    );
    return;
  }

  const { container } = result;
  root.render(
    <StrictMode>
      <App container={container} router={createAppRouter()} />
    </StrictMode>,
  );

  // Daily reminder: check now, every interval and when the tab becomes visible (ARCH §5.6).
  startReminderScheduler({ check: (now) => container.reminderService.check(now), intervalMs: env.reminderCheckIntervalMs });
  // A click on the reminder notification asks the page to go to Today.
  listenForNavigation();
  // M7: background sync triggers (sign-in, startup, online, visible, 2 s after a change, every interval).
  if (container.syncService) startSyncScheduler({ sync: container.syncService, auth: container.authService, intervalMs: env.syncIntervalMs });

  // Service worker only in production builds (ADR-06); dev server runs without it.
  if (import.meta.env.PROD) {
    void registerServiceWorker({
      swUrl: `${import.meta.env.BASE_URL}sw.js`,
      onUpdateAvailable: () => container.updates.notify(),
    }).then((handle) => container.updates.setHandle(handle));
  }
}

void start();
