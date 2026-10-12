# 1% Better per Day

A local-first PWA for tracking the time you put into your goals every day. Set a goal with a daily (or total) time target, log minutes each day, and watch the "+1%" days add up. Everything is stored in your browser (IndexedDB) first; signing in with Google is optional (phase 2) and there is no tracking.

Current milestone: **M6 — optional Google sign-in (auth walking skeleton)** on top of the phase-1 MVP: M1 (goals, manual time entries for today, offline PWA, English/Vietnamese UI), M2 (timer and daily reminders), M3 (past days, history, JSON backup), M4 (Review: heatmap, streaks, charts) and M5 (the 1% curve, full goal detail, archive, empty/error states). Sync itself arrives in M7.

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

No configuration is required. Optional variables (copy `.env.example` to `.env.local`, which is git-ignored):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_DB_NAME` | `one-percent-better` | IndexedDB database name |
| `VITE_REMINDER_CHECK_INTERVAL_MS` | `60000` | How often (ms, 1000–3600000) the open app checks whether the daily reminder is due |
| `BASE_PATH` | `/` | Vite `base` when hosting under a sub-path (build time only) |
| `VITE_SUPABASE_URL` | (empty = cloud off) | Supabase Project URL (`https://<ref>.supabase.co`; `http://localhost` / `http://127.0.0.1` only for local testing). Anything else turns the cloud off |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | (empty) | Supabase publishable key (`sb_publishable_…`). Public by design: Row Level Security protects the data. Needed together with the URL |
| `VITE_SUPABASE_ANON_KEY` | (empty) | Fallback for projects that still use the legacy anon JWT; only read when the publishable key is empty |
| `VITE_SYNC_INTERVAL_MS` | `300000` | Background sync period (ms, 60000–3600000) while the app is visible (used from M7) |

Every `VITE_*` value is embedded in the JavaScript bundle: never put a secret (service-role) key in any of them. Without a valid URL + key the build is exactly the phase-1 app: no Account card, no Supabase code loaded, no request outside the app's origin.

## Run

```bash
npm run dev      # dev server at http://localhost:5173 (service worker disabled)
npm run build    # typecheck + production build to dist/
npm run preview  # serve dist/ at http://localhost:4173 with the service worker (PWA, offline)
```

Open `http://localhost:4173` after `npm run preview` to install the app (Chrome/Edge: address-bar install icon or browser menu → Install).

### Install on a phone (PWA)

Service workers and "Add to Home Screen" require a **secure context**: `localhost` works for the desktop, but a real phone needs the app served over **HTTPS** (a local tunnel such as `npx localtunnel`/`ngrok`, or any static host — the build is plain static files in `dist/`; set `BASE_PATH` when hosting under a sub-path; hosting itself is out of scope for the MVP, see `docs/plan/PRD.md` OQ-02). Then:

- **Android (Chrome/Edge)**: open the URL → browser menu → *Install app* (or the install banner). The app opens in its own window and works offline after the first visit.
- **iPhone/iPad (Safari, iOS 16.4+)**: open the URL → Share → *Add to Home Screen*. Notifications only work from the Home Screen app.
- **Desktop Firefox**: no install prompt; the app works as a normal web app, including offline.

Nothing is installed globally at any point (`npm ci` + `npm run e2e:install` keep everything inside `node_modules`).

## Test

```bash
npm run lint          # ESLint (--max-warnings 0), including layer, i18n and Supabase-containment rules
npm run typecheck     # tsc -b --noEmit
npm test              # Vitest: unit, integration (fake-indexeddb, in-process mock Supabase) and component tests
npm run test:coverage # same, with coverage for src/domain
npm run test:e2e      # Playwright (Chromium): project `chromium` (cloud off, port 4173) + project `cloud` (mock Supabase, port 4174)
npm run test:db       # SQL/RLS tests on Supabase local (Docker); prints "skipped" and exits 0 without Docker
npm run check         # lint + typecheck + test + build
```

`npm run test:e2e` starts three servers itself: `npm run build:e2e && npm run preview` (phase-1 build, `--mode e2e` so the cloud is off even on a machine with a real `.env.local`), `npm run build:cloud-e2e && npm run preview:cloud-e2e` (cloud on, served under `/one-percent-better/` like GitHub Pages, port 4174) and `npm run mock:supabase` (port 54321). Cloud specs live in `e2e/cloud/` and import `test` from `e2e/cloud/fixtures.ts`: every Playwright worker gets its own browser User-Agent and the mock keeps separate state per worker, so parallel files never disturb each other (`mock.reset()` in `beforeEach`, `mock.log()`, `mock.fail()`, `mock.session()` are the test controls).

E2E tests run with a fixed clock (`2026-10-09 10:00 Asia/Ho_Chi_Minh`) and a fresh browser context per test. QC tests live in `tests/qc/` and are picked up by both Vitest (`*.test.ts(x)`) and Playwright (`*.spec.ts`). Sample data for E2E lives in `e2e/fixtures/` (`sample-backup.json` is dataset S1: 5 goals, 23 entries; `large-backup.json` is the NFR-03 performance dataset: 5 goals × 3 years, 5,449 entries, regenerate with `npm run fixtures:large`; the `invalid-*.json`, `unsupported-version.json` and `xss-note.json` files exercise the import validation) and is loaded through the real Import flow (`importBackup(page)` in `e2e/helpers/app.ts`). The statistics benchmark (`src/services/stats-service.test.ts`) prints its timings as `[bench] …` lines; the Review perf E2E prints `[perf] …`.

Bundle budget (NFR-03): the entry chunk (plus the small chunks it preloads) must stay ≤ 250 kB gzip; `npm run build` prints the sizes (M6: `index-*.js` 221.3 kB + `useFormat-*.js` 6.7 kB + `preload-helper-*.js` 0.8 kB gzip ≈ 228.8 kB). The Supabase SDK is its own lazy chunk (`supabase-client-*.js`, 55.8 kB gzip), requested only when you press "Sign in with Google", when the page is the OAuth callback, or when a session is already stored; a build without cloud configuration never loads it and does not even precache it. Recharts is never in the entry: the bundler puts it in one shared chunk named after the helper both chart wrappers import (`useRechartsWidth-*.js`, ≈ 97 kB gzip), loaded together with `BarChart-*.js` the first time Review renders its charts or with `CurveChart-*.js` the first time a goal detail page renders its curve; the Goal detail screen itself is lazy too (`GoalDetail-*.js`). All chunks are precached by the service worker, so every screen opens offline after the first visit. `e2e/m2-reminder.spec.ts` runs on the full Chromium build (`channel: 'chromium'`, installed by `npm run e2e:install`) because the default headless shell always reports notification permission as blocked.

## Language

The UI is available in **English** and **Tiếng Việt**.

- First launch: the language follows the browser (`navigator.language` starting with `vi` → Vietnamese, otherwise English).
- Change it any time in **Settings → Language / Ngôn ngữ**. The choice is stored on the device (IndexedDB) and takes effect immediately, including dates and numbers (`2026-10-01 – 2026-10-31` vs `01/10/2026 – 31/10/2026`, `1,440` vs `1.440`).
- All strings live in `src/i18n/resources/en.json` and `vi.json`. Both files must contain the same keys (a parity test enforces this), and UI code must use `t()` instead of literal text (enforced by ESLint).
- To add or change a string: add the key to **both** files (same `{{variables}}`; plural forms use `_one`/`_other` in `en.json` and only `_other` in `vi.json`), then use it with `t('key', params)` (keys are typed from `en.json`). Check parity and the "no English leaks" DOM scan with `npx vitest run src/i18n` (or the whole suite with `npm test`); ESLint rejects literal UI text in JSX. Dates and numbers go through `useFormat()` (Intl, `en-US`/`vi-VN`), never through string concatenation.

## Timer

On **Today**, press **Start timer** on an active goal. Only one timer runs at a time; it is stored on the device (start time only), so it keeps the right elapsed time after a reload or after closing and reopening the app. **Stop** opens a dialog pre-filled with the rounded minutes (nearest minute, 1–1440) and a note; **Save entry** logs the time on the day the timer was started (even across midnight), **Keep running** / Esc continues, **Discard session** drops it. Deleting a goal discards its running timer.

## Past days and history

- **Today → "Missed a day? Log time for a past day"** opens the **Day** screen (`#/day/YYYY-MM-DD`, defaults to yesterday). Use *Previous day* / *Next day* or the date picker; every goal whose period contains that day is listed (including ended ones) and entries can be added, edited or deleted there. Future dates cannot be logged (*Next day* is disabled on today); an invalid date in the URL shows a message with a link back to Today.
- **Goals → goal name** opens the **goal detail** page (see below): period, target, the 1% curve, stats, Edit/Archive/Delete and the **History** of entries (newest first, with the Manual/Timer source). Dates in the history link to the Day screen.

## Goal detail and the 1% curve

Each goal page shows its **1% curve**: the ideal line is `1.01^k` for day *k* of the period (one percent better every day), your line is `1.01^n` where *n* is the number of days you hit the daily target so far (it rises as a step on every day on target and never goes down on a missed day). The headline is `+X% better` with `X = (1.01^n − 1) × 100`, e.g. 8 days on target → `+8.3% better`. The chart (Recharts, loaded lazily) has a hover tooltip, a keyboard mode (focus the chart, then ←/→ move the reading day by day, Home/End jump to the first/last day, Esc clears) and a *Show data as table* fallback; the *Range* control shows the whole period or only the days so far (default: whole period for goals up to 120 days). Below the chart: Progress, Pace, Current streak, Longest streak (same rules as Review) and the History.

- **+1% feedback**: the first time an entry (manual or timer) makes a goal reach its daily target, Today plays a short effect on the "+1%" pill and announces it to screen readers — once per goal and day (stored in settings as `plusOneShown`, so a reload or re-logging the same day does not repeat it).
- **Archive**: *Archive* on Goals or on the goal page hides a goal from Today, reminders and the timer (its data stays; Review and the goal page still show it; it has its own *Archived* group on Goals). *Restore* brings it back. A goal whose timer is running cannot be archived until the timer is stopped or discarded.
- **Empty and error states**: every screen has an empty state with a way forward; a failed read shows *Couldn't load this view* with *Retry*; a failed write keeps your input in the form with *Couldn't save…*; if the browser blocks IndexedDB (private window, blocked site data) the app shows a full-page explanation with steps and *Try again*; any unexpected render error shows *Something went wrong* with *Reload app* / *Go to Today* instead of a blank page.

## Review (heatmap, streaks, charts)

The **Review** tab (`#/review?goal=<id|all>&year=<YYYY>`) looks back over a calendar year:

- **Goal / Year** selectors (synced to the URL; unknown values fall back to *All goals* and the current year). Years run from the earliest goal or entry to the current year.
- **Stat cards**: time logged in the year, days on target, current and longest streak. A single goal adds **Progress** (minutes logged over the whole goal period ÷ total target) and **Pace** (minutes ahead of or behind `daily target × days elapsed up to today`). A streak counts consecutive days on target; a day that is not on target *yet* (today) does not break it. "All goals" counts a day when at least one goal hit its target.
- **Heatmap**: one cell per day, Monday to Sunday rows, one column per week. Colour levels: one goal → share of the daily target (0, < 50 %, < 100 %, < 200 %, ≥ 200 %); all goals → total minutes (0, 1–29, 30–59, 60–119, ≥ 120). Every cell has a text label (date, minutes, target met/not met), shown as a tooltip on hover/focus. Keyboard: Tab reaches today's cell, ←/→ move a week, ↑/↓ a day, Home/End to the first/last day, Enter/Space opens that day on the **Day** screen (past days only). On narrow screens the heatmap scrolls horizontally inside its box and starts at the current week.
- **Last 12 weeks** and **Months of the year** bar charts (hours), each with a text summary and a screen-reader data table.
- **Today** shows the overall current streak as a chip next to the title.

## Backup and restore

Your data only lives in this browser's IndexedDB. **Settings → Backup**:

- **Export backup (JSON)** downloads `1percent-better-backup-YYYY-MM-DD.json` (`"app": "one-percent-better"`, `"schemaVersion": 1`, all goals, entries and settings; the UI language is a device setting and is not included). "Last backup" is updated, and a banner on Today/Settings nags when you have goals but never exported or the last export is more than 30 days old.
- **Import backup…** validates the file first (max 5 MB, JSON, schema, version, the same goal limits as the form — daily 1–1,440 min, total 1–10,000 h, period ≤ 1,827 days — and referential integrity: every entry belongs to a goal, dates inside the goal period and not after today, at most 1,440 minutes per goal and day, unique ids). You then see a preview (*"5 goals, 23 entries"*) and must confirm **Replace all data**: the import replaces everything in one transaction (goals, entries, settings; the running timer is dropped and the reminder day counter reset). An invalid file shows an error and changes nothing. The language you chose stays as it is.
- Recommendation: **install the app** (Chrome/Edge: address-bar install icon or browser menu → Install; iOS: Share → Add to Home Screen). Browsers are far less likely to evict storage of installed apps, and the app also asks for persistent storage (see Settings → Storage). Export a backup before changing devices or clearing browser data.

## Account & sync (optional)

Phase 2 adds an optional Google account. **M6 (this milestone) ships sign-in only; syncing goals and entries to the account arrives in M7.** Nothing requires an account: every screen and feature works exactly as before without one.

- The **Account** card appears in Settings (between Language and Reminders) only when the build has `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`. Without them the app is identical to phase 1 (no card, no Supabase code, 0 requests outside the app's origin).
- **Sign in with Google** sends you to Google (through Supabase Auth, OAuth PKCE) and brings you back to the screen you started on, with no token or code left in the URL. The card then shows your name and email (initial avatar, no Google photo). The app only receives your name and email from Google.
- The session is kept on the device (`localStorage` key `opb-auth`): you stay signed in after a reload, a restart or when offline. If the session is revoked or expires for good, the card says "Sign in again"; your data stays on the device.
- **Sign out** asks what to do with the data on this device: *Keep* (default; keep using the app without an account) or *Remove* (deletes goals, entries, the running timer and reminder settings on this device in one transaction; the UI language stays). Signing out never deletes anything in the account.
- When you are offline the sign-in button is disabled with an explanation; cancelling at Google or any other failure leaves you signed out with a clear message and changes nothing on the device.
- Security: the browser only ever holds the publishable key (public by design); Postgres Row Level Security (`supabase/migrations/20261012000000_cloud_sync.sql`) lets a signed-in user read and write only rows with their own `user_id`, the `anon` role has no access and rows are never hard-deleted by clients. No analytics, no third-party scripts.

### Try it without an account (mock)

```bash
npm run mock:supabase                          # fake Supabase on http://127.0.0.1:54321 (users: Minh Test, Other User)
npm run build:cloud-e2e && npm run preview:cloud-e2e
# open http://localhost:4174/one-percent-better/#/settings -> Account -> Sign in with Google -> pick "Minh Test"
```

### Cloud setup (owner)

Creating the Supabase project, the Google OAuth client, running the SQL migration and setting the GitHub Actions secrets are manual steps for the repository owner, listed in order in `docs/plan/TASKS.md` → **"User setup"** (U1–U8; U10 is the manual check list for what cannot be tested automatically). Short version:

1. Supabase (Free): create project → copy **Project URL** and **publishable key** → enable the **Google** provider with a Google Cloud OAuth client (Web application; authorized redirect URI = the Supabase callback URL) → **Site URL** `https://minh-lgm.github.io/one-percent-better/` and **Redirect URLs** `https://minh-lgm.github.io/one-percent-better/**`, `http://localhost:5173/**`, `http://localhost:4173/**`.
2. SQL Editor → run `supabase/migrations/20261012000000_cloud_sync.sql` once (tables `goals`, `entries`, `settings`, RLS, triggers, grants).
3. Locally: `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` → `npm run dev` → Settings → Sign in with Google.
4. GitHub Pages: repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (read by `.github/workflows/pages.yml`); until they exist the deployed app simply has no Account card.

`npm run test:db` runs the RLS/trigger tests against **Supabase local** (`npm run db:start`, needs Docker Desktop; export the keys printed by `npx --yes supabase@2.120.0 status` as `SUPABASE_TEST_PUBLISHABLE_KEY` / `SUPABASE_TEST_SECRET_KEY`). Without Docker it prints "skipped" and exits 0; the behaviour is then verified by hand (U10).

## Reminders: limitations

The app has no server, so the daily reminder is **best effort and only works while 1% Better is open** (a browser tab or an installed window, even in the background):

- Turn it on in **Settings → Reminders**, pick a time (default 20:00) and allow notifications when the browser asks. The permission state (not asked / allowed / blocked / not supported) is shown on the card.
- While the app is open it checks at startup, every `VITE_REMINDER_CHECK_INTERVAL_MS` and whenever the tab becomes visible. Past the reminder time, if at least one active goal is not on target, it sends **one notification per day** and shows a banner on Today (the banner does not need notification permission). Clicking the notification opens the app on Today.
- When the app is closed nothing can fire. For a reliable reminder use **Add reminder to calendar (.ics)** on the Reminders card: it downloads `1percent-better-reminder.ics`, a daily repeating 15-minute event (starting tomorrow at the reminder time, in your local time) with a display alarm. Open the file with Google Calendar (Settings → Import & export), Outlook, Apple Calendar or any calendar app; re-import it if you change the reminder time.
- iPhone/iPad: web notifications only work after adding the app to the Home Screen (iOS 16.4+).

## Project layout

```
src/
  app/          composition root (container), bootstrap (incl. OAuth callback), router, App, ErrorBoundary
  config/       env (zod-validated, incl. cloud config), business constants
  domain/       pure logic: dates, goal, entry, timer, reminder, ics, backup, settings, stats, heatmap, curve, plusone (no React, no Dexie, no i18n)
  data/         repository interfaces + Dexie (IndexedDB) implementation (goal, entry, kv, timer, backup, local-data)
  services/     use cases: GoalService, EntryService, LocaleService, SettingsService, TimerService, ReminderService, BackupService, StatsService, AuthService (+ AuthPort contract)
  integration/  browser APIs: storage persistence, service-worker registration, notifications, file download, connectivity, auth-callback;
                supabase/ = the ONLY place that imports @supabase/supabase-js (loader.ts = lazy import, supabase-client.ts = SupabaseAuthPort)
  i18n/         i18next instance, locale detection, Intl formatters, resources
  ui/           screens (Review and Goal detail are lazy-loaded), components (Heatmap, StatCard, BarChart + CurveChart = Recharts in a shared lazy chunk, AccountCard, SignOutDialog, GoogleSignInButton), hooks, styles
  sw.ts         service worker (Workbox precache, notification click → Today)
supabase/       config.toml (Supabase local) + migrations/ (SQL run once on the project)
e2e/            Playwright specs, helpers and fixtures; cloud/ = specs for the `cloud` project; mock-supabase/server.mjs = mock Supabase (Node http, no deps)
scripts/        icon generation, large fixture generation, test-db runner
tests/qc/       QC-owned tests; tests/db/ = RLS/trigger tests for Supabase local (npm run test:db)
```

Dependency rules between layers are enforced by `eslint.config.js` (`no-restricted-imports`).

## Icons

`npm run icons` regenerates the PWA icons in `public/` (plain Node script, no dependencies).
