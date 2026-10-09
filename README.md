# 1% Better per Day

A local-first PWA for tracking the time you put into your goals every day. Set a goal with a daily (or total) time target, log minutes each day, and watch the "+1%" days add up. Everything is stored in your browser (IndexedDB); there is no account, no server and no tracking.

Current milestone: **M3 — past days, history and JSON backup** (on top of M1: goals, manual time entries for today, offline PWA, English/Vietnamese UI; M2: timer and daily reminders). Review charts and the 1% curve arrive in later milestones.

## Requirements

- Node.js 22.14 or later (see `.nvmrc`) and npm 10. Nothing is installed globally.
- A Chromium-based browser for the full PWA experience (install prompt). Firefox and Safari work as a web app.

On Windows, clone into a short path (well under the 260-character `MAX_PATH` limit) so Playwright can launch the Chromium binary stored under `node_modules`.

## Install

```bash
npm ci              # first time on a machine without a lockfile: npm install
npm run e2e:install # downloads Chromium for Playwright into node_modules (not global)
```

The project `.npmrc` sets `legacy-peer-deps=true` to work around an npm 10.9 peer-resolution crash with Vitest 4; all required peers are explicit dependencies.

## Configure

No configuration is required. Optional variables (copy `.env.example` to `.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_DB_NAME` | `one-percent-better` | IndexedDB database name |
| `VITE_REMINDER_CHECK_INTERVAL_MS` | `60000` | How often (ms, 1000–3600000) the open app checks whether the daily reminder is due |
| `BASE_PATH` | `/` | Vite `base` when hosting under a sub-path (build time only) |

## Run

```bash
npm run dev      # dev server at http://localhost:5173 (service worker disabled)
npm run build    # typecheck + production build to dist/
npm run preview  # serve dist/ at http://localhost:4173 with the service worker (PWA, offline)
```

Open `http://localhost:4173` after `npm run preview` to install the app (Chrome/Edge: address-bar install icon or browser menu → Install).

## Test

```bash
npm run lint          # ESLint (--max-warnings 0), including layer and i18n rules
npm run typecheck     # tsc -b --noEmit
npm test              # Vitest: unit, integration (fake-indexeddb) and component tests
npm run test:coverage # same, with coverage for src/domain
npm run test:e2e      # Playwright (Chromium) against a fresh build served on port 4173
npm run check         # lint + typecheck + test + build
```

E2E tests run with a fixed clock (`2026-10-09 10:00 Asia/Ho_Chi_Minh`) and a fresh browser context per test. QC tests live in `tests/qc/` and are picked up by both Vitest (`*.test.ts(x)`) and Playwright (`*.spec.ts`). Sample data for E2E lives in `e2e/fixtures/` (`sample-backup.json` is dataset S1: 5 goals, 23 entries; the `invalid-*.json`, `unsupported-version.json` and `xss-note.json` files exercise the import validation) and is loaded through the real Import flow (`importBackup(page)` in `e2e/helpers/app.ts`). `e2e/m2-reminder.spec.ts` runs on the full Chromium build (`channel: 'chromium'`, installed by `npm run e2e:install`) because the default headless shell always reports notification permission as blocked.

## Language

The UI is available in **English** and **Tiếng Việt**.

- First launch: the language follows the browser (`navigator.language` starting with `vi` → Vietnamese, otherwise English).
- Change it any time in **Settings → Language / Ngôn ngữ**. The choice is stored on the device (IndexedDB) and takes effect immediately, including dates and numbers (`2026-10-01 – 2026-10-31` vs `01/10/2026 – 31/10/2026`, `1,440` vs `1.440`).
- All strings live in `src/i18n/resources/en.json` and `vi.json`. Both files must contain the same keys (a parity test enforces this), and UI code must use `t()` instead of literal text (enforced by ESLint).

## Timer

On **Today**, press **Start timer** on an active goal. Only one timer runs at a time; it is stored on the device (start time only), so it keeps the right elapsed time after a reload or after closing and reopening the app. **Stop** opens a dialog pre-filled with the rounded minutes (nearest minute, 1–1440) and a note; **Save entry** logs the time on the day the timer was started (even across midnight), **Keep running** / Esc continues, **Discard session** drops it. Deleting a goal discards its running timer.

## Past days and history

- **Today → "Missed a day? Log time for a past day"** opens the **Day** screen (`#/day/YYYY-MM-DD`, defaults to yesterday). Use *Previous day* / *Next day* or the date picker; every goal whose period contains that day is listed (including ended ones) and entries can be added, edited or deleted there. Future dates cannot be logged (*Next day* is disabled on today); an invalid date in the URL shows a message with a link back to Today.
- **Goals → goal name** opens the **goal detail** page: period, target, Edit/Delete and the **History** of entries (newest first, with the Manual/Timer source). Dates in the history link to the Day screen.

## Backup and restore

Your data only lives in this browser's IndexedDB. **Settings → Backup**:

- **Export backup (JSON)** downloads `1percent-better-backup-YYYY-MM-DD.json` (`"app": "one-percent-better"`, `"schemaVersion": 1`, all goals, entries and settings; the UI language is a device setting and is not included). "Last backup" is updated, and a banner on Today/Settings nags when you have goals but never exported or the last export is more than 30 days old.
- **Import backup…** validates the file first (max 5 MB, JSON, schema, version, referential integrity: every entry belongs to a goal, dates inside the goal period, at most 1,440 minutes per goal and day, unique ids). You then see a preview (*"5 goals, 23 entries"*) and must confirm **Replace all data**: the import replaces everything in one transaction (goals, entries, settings; the running timer is dropped and the reminder day counter reset). An invalid file shows an error and changes nothing. The language you chose stays as it is.
- Recommendation: **install the app** (Chrome/Edge: address-bar install icon or browser menu → Install; iOS: Share → Add to Home Screen). Browsers are far less likely to evict storage of installed apps, and the app also asks for persistent storage (see Settings → Storage). Export a backup before changing devices or clearing browser data.

## Reminders: limitations

The app has no server, so the daily reminder is **best effort and only works while 1% Better is open** (a browser tab or an installed window, even in the background):

- Turn it on in **Settings → Reminders**, pick a time (default 20:00) and allow notifications when the browser asks. The permission state (not asked / allowed / blocked / not supported) is shown on the card.
- While the app is open it checks at startup, every `VITE_REMINDER_CHECK_INTERVAL_MS` and whenever the tab becomes visible. Past the reminder time, if at least one active goal is not on target, it sends **one notification per day** and shows a banner on Today (the banner does not need notification permission). Clicking the notification opens the app on Today.
- When the app is closed nothing can fire. For a reliable reminder use **Add reminder to calendar (.ics)** on the Reminders card: it downloads `1percent-better-reminder.ics`, a daily repeating 15-minute event (starting tomorrow at the reminder time, in your local time) with a display alarm. Open the file with Google Calendar (Settings → Import & export), Outlook, Apple Calendar or any calendar app; re-import it if you change the reminder time.
- iPhone/iPad: web notifications only work after adding the app to the Home Screen (iOS 16.4+).

## Project layout

```
src/
  app/          composition root, bootstrap, router, App
  config/       env (zod-validated), business constants
  domain/       pure logic: dates, goal, entry, timer, reminder, ics, backup, settings (no React, no Dexie, no i18n)
  data/         repository interfaces + Dexie (IndexedDB) implementation (goal, entry, kv, timer, backup)
  services/     use cases: GoalService, EntryService, LocaleService, SettingsService, TimerService, ReminderService, BackupService
  integration/  browser APIs: storage persistence, service-worker registration, notifications, file download
  i18n/         i18next instance, locale detection, Intl formatters, resources
  ui/           screens, components, hooks, styles
  sw.ts         service worker (Workbox precache, notification click → Today)
e2e/            Playwright specs, helpers and fixtures (sample backup = dataset S1)
tests/qc/       QC-owned tests
```

Dependency rules between layers are enforced by `eslint.config.js` (`no-restricted-imports`).

## Icons

`npm run icons` regenerates the PWA icons in `public/` (plain Node script, no dependencies).
