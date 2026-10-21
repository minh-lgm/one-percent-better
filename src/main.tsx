import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './app/App';
import { bootstrap } from './app/bootstrap';
import { createContainer } from './app/container';
import { FirstRenderSignal } from './app/FirstRenderSignal';
import { startMaintenance } from './app/maintenance';
import { startReminderScheduler } from './app/reminder-scheduler';
import { createAppRouter } from './app/router';
import { startApp, startNativeShell } from './app/start';
import { startSyncScheduler } from './app/sync-scheduler';
import { env } from './config/env';
import { cleanCallbackUrl, clearPkceVerifier, readAuthCallback, sessionReturnTo } from './integration/auth-callback';
import { loadNativePlatform } from './integration/platform';
import { listenForNavigation } from './integration/sw-messages';
import { registerServiceWorker } from './integration/sw-register';
import { StorageError } from './ui/screens/StorageError';
import './ui/styles/app.css';

const root = createRoot(document.getElementById('root') as HTMLElement);

// M13 (M13-D1): the native launch image is hidden after the FIRST commit of whatever renders first — the app or the
// S8 storage-error screen — or after 3 s. Armed once, before bootstrap, so no failure path can leave it on screen.
let markRendered: () => void = () => {};
const firstRender = new Promise<void>((resolve) => {
  markRendered = resolve;
});
let shellArmed = false;

async function start(): Promise<void> {
  // v5.0 (ADR-35): the Capacitor runtime, or `null` on the web build (the call is a constant `null` there).
  const native = await loadNativePlatform();
  if (!shellArmed) {
    shellArmed = true;
    startNativeShell(native, firstRender);
  }
  // OAuth callback (`<BASE_URL>?auth=callback&code=…`, ADR-19) is read once, before the hash router exists.
  const authCallback = readAuthCallback(window.location);
  const result = await bootstrap({
    navigatorLanguage: navigator.language,
    createContainer: (i18n) => createContainer({ i18n, dbName: env.dbName, cloud: env.cloud, notificationIconUrl: `${import.meta.env.BASE_URL}icons/pwa-192.png`, native }),
    authCallback,
    cleanCallbackUrl: () => cleanCallbackUrl(window.history, import.meta.env.BASE_URL, sessionReturnTo(window.sessionStorage).take()),
    // The single-use PKCE verifier must not outlive the callback (M6-P1).
    onCallbackSettled: () => clearPkceVerifier(window.localStorage),
  });

  if (!result.ok) {
    root.render(
      <StrictMode>
        <I18nextProvider i18n={result.i18n}>
          <FirstRenderSignal onFirstRender={markRendered} />
          <StorageError onRetry={start} platform={native?.platform ?? 'web'} />
        </I18nextProvider>
      </StrictMode>,
    );
    return;
  }

  const { container } = result;
  root.render(
    <StrictMode>
      <App container={container} router={createAppRouter()} onFirstRender={markRendered} />
    </StrictMode>,
  );

  // Background work (maintenance, reminders, sync, service worker on the web build only — ARCH §5.12).
  startApp({
    container,
    reminderCheckIntervalMs: env.reminderCheckIntervalMs,
    syncIntervalMs: env.syncIntervalMs,
    prod: import.meta.env.PROD,
    baseUrl: import.meta.env.BASE_URL,
    deps: { registerServiceWorker, listenForNavigation, startMaintenance, startReminderScheduler, startSyncScheduler },
  });
}

void start();
