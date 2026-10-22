# 1% Better per Day

A local-first PWA for tracking the time you put into your goals every day. Set a goal with a daily (or total) time target, log minutes each day, and watch the "+1%" days add up. Everything is stored in your browser (IndexedDB) first; signing in with Google is optional (phase 2) and there is no tracking.

Current milestone: **M12 — iOS app walking skeleton (Capacitor)**: the same code base builds a native iOS app (`npm run build:native`, committed Xcode project in `ios/`, GitHub Actions workflow **iOS** that builds it for the Simulator on a macOS runner — see "iOS app (Capacitor)"); the web app is byte-for-byte unaffected (no Capacitor code in `dist/`). Before that: **M11 — goals with no end date**, **M10 — backlog + bundle budget**, **M9 — the 1% curve v3** (your line compares each logged day with the previous logged day and compounds the changes from the first logged day; see "Goal detail and the 1% curve") on top of **M8 — gentle sign-in prompts and the end of phase 2** (a non-blocking banner on Today once there is data worth protecting, a one-line hint after Export, and copy that always says where your data lives) on top of M7 (offline-first sync: goals, entries, reminder settings and language follow the Google account across devices; the device stays the source of truth), M6 (optional Google sign-in) and the phase-1 MVP: M1 (goals, manual time entries for today, offline PWA, English/Vietnamese UI), M2 (timer and daily reminders), M3 (past days, history, JSON backup), M4 (Review: heatmap, streaks, charts) and M5 (the 1% curve, full goal detail, archive, empty/error states).

**Upgrading from a phase-1 build (M1–M6):** the first start of the M7 build upgrades the local database in place (schema v2: soft delete + sync markers) and keeps every goal, entry and setting. As a precaution, **export a backup first** (Settings → Backup → Export backup) and keep the file — this is step U0 of `docs/plan/TASKS.md`.

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
| `VITE_SYNC_INTERVAL_MS` | `300000` | Background sync period (ms, 60000–3600000) while the app is visible |

Every `VITE_*` value is embedded in the JavaScript bundle: never put a secret (service-role) key in any of them. Without a valid URL + key the build is exactly the phase-1 app: no Account card, no Supabase code loaded, no request outside the app's origin.

## Run

```bash
npm run dev      # dev server at http://localhost:5173 (service worker disabled)
npm run build    # typecheck + production build to dist/ (uses .env.local when present → cloud on)
npm run preview  # serve dist/ at http://localhost:4173 with the service worker (PWA, offline)
```

`npm run build` is the deploy build (`.github/workflows/pages.yml` runs it with the GitHub secrets): with a `.env.local` on the machine it produces the cloud-on app. `npm run check` (below) ends with `npm run build:e2e` instead, which forces the cloud **off** (`--mode e2e`) so its result is the same on every machine; a build without cloud configuration contains no Supabase code at all (not even an unused chunk).

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
npm run test:e2e      # Playwright (Chromium): projects `chromium` (cloud off, port 4173), `cloud` (mock Supabase, port 4174) and `native-web` (the native build in a browser, port 4175)
npm run test:db       # SQL/RLS tests on Supabase local (Docker); prints "skipped" and exits 0 without Docker
npm run check         # lint + typecheck + test + build:e2e (cloud off, identical on every machine)
```

`npm run test:e2e` starts four servers itself: `npm run build:e2e && npm run preview` (phase-1 build, `--mode e2e` so the cloud is off even on a machine with a real `.env.local`), `npm run build:cloud-e2e && npm run preview:cloud-e2e` (cloud on, served under `/one-percent-better/` like GitHub Pages, port 4174), `npm run build:native-e2e && npm run preview:native-e2e` (the Capacitor build, `--mode native-e2e`, base `/`, no service worker, port 4175; specs in `e2e/native/`) and `npm run mock:supabase` (port 54321). Cloud specs live in `e2e/cloud/` and import `test` from `e2e/cloud/fixtures.ts`: every Playwright worker gets its own browser User-Agent and the mock keeps separate state per worker, so parallel files never disturb each other (`mock.reset()` in `beforeEach`, `mock.log()`, `mock.fail()`, `mock.session()` are the test controls).

E2E tests run with a fixed clock (`2026-10-09 10:00 Asia/Ho_Chi_Minh`) and a fresh browser context per test. QC tests live in `tests/qc/` and are picked up by both Vitest (`*.test.ts(x)`) and Playwright (`*.spec.ts`). Sample data for E2E lives in `e2e/fixtures/` (`sample-backup.json` is dataset S1: 5 goals, 23 entries; `o1-open-ended-backup.json` is dataset O1: one goal with no end date and 4 entries, M11; `large-backup.json` is the NFR-03 performance dataset: 5 goals × 3 years, 5,449 entries, regenerate with `npm run fixtures:large`; the `invalid-*.json`, `unsupported-version.json` and `xss-note.json` files exercise the import validation) and is loaded through the real Import flow (`importBackup(page)` in `e2e/helpers/app.ts`). The statistics benchmark (`src/services/stats-service.test.ts`) prints its timings as `[bench] …` lines; the Review perf E2E prints `[perf] …`.

### Bundle budget

NFR-03 has two numbers: a **hard limit of 250 kB** gzip for the cold load of `#/today` (the QC specs `tests/qc/final-nfr.spec.ts`, `tests/qc/final2-cloudoff-nfr.spec.ts`) and, since M10, a **working budget of 230 kB** checked by `e2e/m10-bundle.spec.ts` (cloud off) and `e2e/cloud/m10-bundle.spec.ts` (cloud on, signed out). Both measure the same way: a fresh context, frozen clock, open `#/today`, wait for the heading and `networkidle`, then add up `gzipSync(body, { level: 9 })` of every JS/CSS/HTML response of the app origin except `sw*`/`workbox*`; the specs print one `url  kB` line per response plus the total. After M10 the cold load was ≈ **222.6 kB** in both builds (`index-*.js` 197.6 + `dates-*.js` 9.5 + `useFormat-*.js` 6.9 + `preload-helper-*.js` 0.8 + `constants-*.js` 0.1 + `types-*.js` 0.1 + `index-*.css` 7.0 + `index.html` 0.6); before M10 it was 248.3 / 248.4 kB. After M11 (goals with no end date) it is **224.2 kB** cloud off (`index-*.js` 200.2 + `dates` 9.4 + `useFormat` 6.9 + css 7.1 + html 0.6 — the bundler now folds the tiny `constants`/`types`/`preload-helper` chunks into the entry) and **224.9 kB** cloud on, signed out.

The rule that keeps it there (ARCHITECTURE ADR-27): **anything Today does not need lives behind an `import()`**, and zod is only allowed in the two lazy validation boundaries — `src/domain/backup.ts` (the backup file, loaded by `BackupService.parse` the first time you import; chunk `schemas-*.js` ≈ 25 kB gzip, precached so Import works offline) and `src/integration/supabase/**` (rows pulled from the account, inside the SDK chunk). Forms (`domain/goal.ts`, `domain/entry.ts`) and `config/env.ts` validate in plain TypeScript; `src/domain/limits-parity.test.ts` proves the form validators and the importer agree on every limit. ESLint fails on `import … from 'zod'` anywhere else and on a static value import of `domain/backup` outside tests (use `domain/backup-file` for the constants/types). The Supabase SDK is its own lazy chunk (`supabase-client-*.js`, ≈ 58 kB gzip) requested only when you press "Sign in with Google", when the page is the OAuth callback, or when a session is already stored; a build without cloud configuration does not emit that chunk at all (`vite.config.ts` `define: { __OPB_CLOUD__ }` removes the dynamic import). Recharts is never in the entry: the bundler puts it in one shared chunk named after the helper both chart wrappers import (`useRechartsWidth-*.js`, ≈ 97 kB gzip), loaded together with `BarChart-*.js` the first time Review renders its charts or with `CurveChart-*.js` the first time a goal detail page renders its curve; the Goal detail screen itself is lazy too (`GoalDetail-*.js`). All chunks are precached by the service worker, so every screen opens offline after the first visit. `e2e/m2-reminder.spec.ts` runs on the full Chromium build (`channel: 'chromium'`, installed by `npm run e2e:install`) because the default headless shell always reports notification permission as blocked.

## Language

The UI is available in **English** and **Tiếng Việt**.

- First launch: the language follows the browser (`navigator.language` starting with `vi` → Vietnamese, otherwise English).
- Change it any time in **Settings → Language / Ngôn ngữ**. The choice is stored on the device (IndexedDB) and takes effect immediately, including dates and numbers (`2026-10-01 – 2026-10-31` vs `01/10/2026 – 31/10/2026`, `1,440` vs `1.440`).
- All strings live in `src/i18n/resources/en.json` and `vi.json`. Both files must contain the same keys (a parity test enforces this), and UI code must use `t()` instead of literal text (enforced by ESLint).
- To add or change a string: add the key to **both** files (same `{{variables}}`; plural forms use `_one`/`_other` in `en.json` and only `_other` in `vi.json`), then use it with `t('key', params)` (keys are typed from `en.json`). Check parity and the "no English leaks" DOM scan with `npx vitest run src/i18n` (or the whole suite with `npm test`); ESLint rejects literal UI text in JSX. Dates and numbers go through `useFormat()` (Intl, `en-US`/`vi-VN`), never through string concatenation.

## Goals

**Goals → New goal** (`#/goals/new`): a name (1–60 characters), an optional "why" (≤ 280), a **Target** — *Minutes per day* (1–1,440) or *Total hours* (1–10,000 over the period, turned into a daily target by dividing by the number of days) — a **Start date** (defaults to today) and **Ends**:

- **This year — ends 31 Dec** of the start year (default), or **On a specific date** ≥ the start date; a goal with an end date can last at most 1,827 days (about 5 years).
- **No end date** (since v4.0, M11; `Không có thời hạn` in Vietnamese): the goal runs every day until you archive or delete it. It is available **only with Minutes per day** — with Total hours the option is shown but disabled, with a note explaining why (a total needs a period to derive a daily target); if you switch an open-ended goal to Total hours the form moves Ends back to "This year" and says so. Such a goal is stored with `endDate: null` (never a fake far-future date), is never "Ended", has no 1,827-day limit, and every figure that used to cover "the whole period" is **measured up to today**: Goals and the goal page say `10 min/day · from 2026-10-01, no end date`; the goal page shows `Day 9` (no "of N"), the 1% curve runs from the start date to today (so there is no *Range* control, the two options would be the same), and **Progress** is minutes logged ÷ `daily target × days elapsed so far` (`55 of 90 min expected so far`, can exceed 100 %); Pace, streaks and the heatmap are unchanged. Entries can be logged for any day from the start date up to today. Editing switches freely between an end date and none (setting an end date still has to include every logged day).

Edit, Archive/Restore and Delete live on the Goals list and on the goal page; an edit that would leave existing entries outside the period is refused with a clear message.

## Timer

On **Today**, press **Start timer** on an active goal. Only one timer runs at a time; it is stored on the device (start time only), so it keeps the right elapsed time after a reload or after closing and reopening the app. **Stop** opens a dialog pre-filled with the rounded minutes (nearest minute, 1–1440) and a note; **Save entry** logs the time on the day the timer was started (even across midnight), **Keep running** / Esc continues, **Discard session** drops it. Deleting a goal discards its running timer.

## Past days and history

- **Today → "Missed a day? Log time for a past day"** opens the **Day** screen (`#/day/YYYY-MM-DD`, defaults to yesterday). Use *Previous day* / *Next day* or the date picker; every goal whose period contains that day is listed (including ended ones) and entries can be added, edited or deleted there. Future dates cannot be logged (*Next day* is disabled on today); an invalid date in the URL shows a message with a link back to Today.
- **Goals → goal name** opens the **goal detail** page (see below): period, target, the 1% curve, stats, Edit/Archive/Delete and the **History** of entries (newest first, with the Manual/Timer source). Dates in the history link to the Day screen.

## Goal detail and the 1% curve

Each goal page shows its **1% curve** with two lines:

- **Ideal** is `1.01^(k−1)` for day *k* of the period (one percent better every day, starting at +0.0 % on the first day of the goal). It never changes.
- **You** (since v3, M9) compares the minutes you log with your **previous logged day** and compounds the changes from your **first logged day**. Because the daily ratios multiply out, the value on any day is simply *minutes of the most recent logged day ÷ minutes of the first logged day*; the first logged day is 0 %. Days without time keep the line flat (nothing is subtracted), and logging less than the previous logged day moves it down (the headline can be negative, e.g. `−40.0% vs your first day`). The daily target plays no part here: it still drives the "+1%" feedback on Today, days on target, streaks, progress and pace.

Example with real data — 5, 10, 14 and 27 minutes on four consecutive days: +100 % (10 vs 5), then +40 % (14 vs 10), then +92.9 % (27 vs 14); compounded, 27 ÷ 5 = ×5.4, so the headline reads **`+440.0% better`** and the subtitle `Today: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).` Percentages are rounded to one decimal, half away from zero, and always carry a sign (`+0.0%`, `−40.0%`; the minus is U+2212).

The chart (Recharts, loaded lazily) draws You as steps with a dot on each logged day, a solid 0 % line (= your first logged day), a Y axis that adapts to both lines (signed labels, compact `+144K%` above 10,000 %), a hover tooltip, a keyboard mode (focus the chart, then ←/→ move the reading day by day, Home/End jump to the first/last day, Esc clears) and a *Show data as table* fallback with the minutes and the change vs the previous logged day per row; the *Range* control shows the whole period or only the days so far (default: whole period for goals up to 120 days). Below the chart: Progress, Pace, Current streak, Longest streak (same rules as Review) and the History.

- **+1% feedback**: the first time an entry (manual or timer) makes a goal reach its daily target, Today plays a short effect on the "+1%" pill and announces it to screen readers — once per goal and day (stored in settings as `plusOneShown`, so a reload or re-logging the same day does not repeat it).
- **Archive**: *Archive* on Goals or on the goal page hides a goal from Today, reminders and the timer (its data stays; Review and the goal page still show it; it has its own *Archived* group on Goals). *Restore* brings it back. A goal whose timer is running cannot be archived until the timer is stopped or discarded.
- **Empty and error states**: every screen has an empty state with a way forward; a failed read shows *Couldn't load this view* with *Retry*; a failed write keeps your input in the form with *Couldn't save…*; if the browser blocks IndexedDB (private window, blocked site data) the app shows a full-page explanation with steps and *Try again*; any unexpected render error shows *Something went wrong* with *Reload app* / *Go to Today* instead of a blank page.

## Review (heatmap, streaks, charts)

The **Review** tab (`#/review?goal=<id|all>&year=<YYYY>`) looks back over a calendar year:

- **Goal / Year** selectors (synced to the URL; unknown values fall back to *All goals* and the current year). Years run from the earliest goal or entry to the current year.
- **Stat cards**: time logged in the year, days on target, current and longest streak. A single goal adds **Progress** (minutes logged over the whole goal period ÷ total target; for a goal with no end date the denominator is `daily target × days elapsed so far`, and the note under the cards says so) and **Pace** (minutes ahead of or behind `daily target × days elapsed up to today`). A streak counts consecutive days on target; a day that is not on target *yet* (today) does not break it. "All goals" counts a day when at least one goal hit its target.
- **Heatmap**: one cell per day, Monday to Sunday rows, one column per week. Colour levels: one goal → share of the daily target (0, < 50 %, < 100 %, < 200 %, ≥ 200 %); all goals → total minutes (0, 1–29, 30–59, 60–119, ≥ 120). Every cell has a text label (date, minutes, target met/not met), shown as a tooltip on hover/focus. Keyboard: Tab reaches today's cell, ←/→ move a week, ↑/↓ a day, Home/End to the first/last day, Enter/Space opens that day on the **Day** screen (past days only). On narrow screens the heatmap scrolls horizontally inside its box and starts at the current week.
- **Last 12 weeks** and **Months of the year** bar charts (hours), each with a text summary and a screen-reader data table.
- **Today** shows the overall current streak as a chip next to the title.

## Backup and restore

Your data only lives in this browser's IndexedDB. **Settings → Backup**:

- **Export backup (JSON)** downloads `1percent-better-backup-YYYY-MM-DD.json` (`"app": "one-percent-better"`, `"schemaVersion": 1`, all goals, entries and settings; the UI language is a device setting and is not included). A goal with no end date is written as `"endDate": null` (the key is always present); the schema version stays 1, so every file this app ever exported still imports, and a file with such a goal opened by a build older than M11 is simply refused as "not a valid backup" without changing anything (ADR-32). "Last backup" is updated, and a banner on Today/Settings nags when you have goals but never exported or the last export is more than 30 days old.
- **Import backup…** validates the file first (max 5 MB, JSON, schema, version, the same goal limits as the form — daily 1–1,440 min, total 1–10,000 h, period ≤ 1,827 days, `"endDate": null` only for daily goals — and referential integrity: every entry belongs to a goal, dates inside the goal period and not after today, at most 1,440 minutes per goal and day, unique ids of at most 64 characters, the same limit as the account database). You then see a preview (*"5 goals, 23 entries"*) and must confirm **Replace all data**: the import replaces everything in one transaction (goals, entries, settings; the running timer is dropped and the reminder day counter reset). An invalid file shows an error and changes nothing: a file that is not a 1% Better backup gets the generic sentence, a well-formed file with a value the app does not allow (period too long, minutes outside 1–1,440, a name or note too long…) gets its own sentence. If creating the export file fails, the same spot shows "Couldn't create the backup file…" and nothing changes. The language you chose stays as it is.
- Recommendation: **install the app** (Chrome/Edge: address-bar install icon or browser menu → Install; iOS: Share → Add to Home Screen). Browsers are far less likely to evict storage of installed apps, and the app also asks for persistent storage (see Settings → Storage). Export a backup before changing devices or clearing browser data.

## Account & sync (optional)

Phase 2 adds an optional Google account. Nothing requires one: every screen and feature works exactly as before without an account, and the device stays the source of truth (offline-first).

- The **Account** card appears in Settings (between Language and Reminders) only when the build has `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`. Without them the app is identical to phase 1 (no card, no Supabase code, 0 requests outside the app's origin).
- **Sign in with Google** sends you to Google (through Supabase Auth, OAuth PKCE) and brings you back to the screen you started on, with no token or code left in the URL. The card then shows your name and email (initial avatar, no Google photo). The app only receives your name and email from Google.
- The session is kept on the device (`localStorage` key `opb-auth`): you stay signed in after a reload, a restart or when offline. If the session is revoked or expires for good, the card and the status chip say "Sign in again"; your data and any unsynced changes stay on the device until you sign in again.
- **Sign out** asks what to do with the data on this device: *Keep* (default; keep using the app without an account) or *Remove* (deletes goals, entries, the running timer and reminder settings on this device in one transaction; the UI language stays). Signing out never deletes anything in the account. If changes are still waiting to sync, the dialog says how many; when online, *Keep* first tries a last sync (10 s at most), and *Remove* asks you to confirm again ("Remove anyway") if that sync failed.
- When you are offline the sign-in button is disabled with an explanation; cancelling at Google or any other failure leaves you signed out with a clear message and changes nothing on the device.
- **Gentle prompts, never a gate (M8).** The app suggests signing in only once there is data worth protecting, and only while the build has cloud configuration and you are signed out:
  - **Today banner** ("Keep your progress safe") once you have logged **10 entries** or **7 days** have passed since your first goal/entry, while online. It is a plain banner under the reminder banner — no dialog, no focus steal, logging time and the timer keep working. **Not now** hides it for **14 days**; after the **third** "Not now" it never comes back on Today (the backup reminder banner then shows as before). The Account card in Settings always keeps the explanation and the sign-in button.
  - **After Export** (Settings → Backup), a short hint with a sign-in button appears under the buttons, at most **once every 30 days** and only when online. It is a shortcut: the Account card does the same.
  - **Copy follows the state:** Backup says "Your data lives on this device. Sign in to keep a copy in your account too…" while signed out and "…synced to your account" while signed in; Storage "Not protected" adds "Signing in also keeps a copy of your data in your account." with a **Go to Account** button; About says signing in is optional. A build without cloud configuration keeps the phase-1 wording ("No account, no tracking") and shows none of this.
  - The prompt state (count, last "Not now", last hint) is a device-only setting: it is not synced, not in a backup, and survives Import and "Sign out → Remove".
- **Sign out → Remove with items the account refused:** if some rows on this device could never be uploaded (see "Rows the account refuses" below), the sign-out dialog lists them ("N items on this device couldn't be uploaded to your account"), the Remove option no longer claims that your account keeps everything, and choosing Remove shows "anything that couldn't be uploaded will be lost. Export a backup first to keep it."
- **Deleted records are cleaned up after 30 days (M10).** Deleting a goal or entry only marks it as deleted on the device so the deletion can reach your account and your other devices. Once such a record is older than 30 days and nobody can still need it from this device (it has been uploaded, the account refused it, or this device never signed in), the app removes it from the device's database at the next start. The account keeps its own copy of the deletion marker, so other devices still receive it; nothing you can see changes.
- Security: the browser only ever holds the publishable key (public by design); Postgres Row Level Security (`supabase/migrations/20261012000000_cloud_sync.sql`) lets a signed-in user read and write only rows with their own `user_id`, the `anon` role has no access and rows are never hard-deleted by clients. No analytics, no third-party scripts.

### What is synced, and how

- **Synced to the account:** goals, time entries (including deletions), the reminder on/off + time, and the UI language. **Device-only:** the running timer, the "+1%" feedback, the day a reminder was last shown, "Last backup", the notification permission.
- **When:** right after sign-in, at startup with a session, when the tab becomes visible, when the network comes back, about 2 s after a change, every 5 minutes while the app is visible (`VITE_SYNC_INTERVAL_MS`), and on **Sync now** in the Account card. Changes made offline wait on the device and go up on the next sync. After a failure the app retries with a growing delay (30 s → 15 min); *Sync now* ignores the delay.
- **Conflicts (last write wins):** every goal and entry carries the time it was last edited on the device; when two devices edit the same record, the later edit wins (a delete is an edit too). The server decides, so a device whose clock is wrong cannot overwrite newer data forever: a device never produces a timestamp older than the record it is editing. Reminder settings and language are compared the same way, each as its own group, so changing the language on one device and the reminder time on another keeps both.
- **Deletions** are soft deletes (a tombstone with `deletedAt`) so they propagate to every device; deleted rows never show up in the app or in an exported backup. Entries of a goal deleted on another device disappear with it.
- **Status chip** at the top of every screen while signed in: *Synced hh:mm*, *N changes waiting*, *Syncing…*, *Offline · N changes waiting*, *Sync error · Retry*, *Sign in again*. The Account card shows *Last synced*, *Waiting to sync* and the last error (with the next retry time). Screen readers are told only about errors, going offline, an expired session and the recovery afterwards.
- **First sign-in and switching accounts:** data already on the device is added to the account on the first sign-in (toast "Signed in. Your account now has N goals, N entries."). If this device was last used with a *different* account and still has data, a dialog asks whether to **add it to the new account** or **cancel** (which signs you out again, uploading nothing). Signing back into the same account never asks.
- **Backup while signed in:** Export still writes the plain `schemaVersion: 1` file (no sync markers, no `user_id`). Import replaces the data on this device **and, once synced, in the account** (the dialog says so; the previous cloud rows are tombstoned).
- **Rows the account refuses:** a record already on the device that the account database cannot take (for example an id longer than 64 characters from a hand-edited backup imported before this version) stays on the device, keeps working and is exported as usual, but is no longer counted as waiting and is not retried until you edit it; the Account card says "N items on this device couldn't be uploaded to your account and stay only here. Export a backup to keep a copy" while this is the case (rows *from* the account that fail validation get the separate "couldn't be read and were skipped" line). Everything else keeps syncing.
- **Untrusted cloud data:** every row coming from the account is validated like an imported backup (limits, enum values, dates); invalid rows are skipped and the Account card mentions it. Notes are always rendered as text.
- **Goals with no end date (v4.0, M11):** the account stores them as `end_date` NULL, which the original schema did not allow. The SQL migration `supabase/migrations/20261019000000_goal_open_ended.sql` relaxes the column (NULL only for `target_type = 'daily'`, two named check constraints, nothing else touched) and **must be run on the project before the M11 build is deployed** (step U12 below). If an M11 build pushes such a goal before the migration ran, the server refuses the row (`23502`), the goal stays on the device as one of the "rows the account refuses" (see above) and keeps working; after running the migration, open the goal, press *Save changes* (or sign in to another account, which re-marks everything) and it is uploaded. A device still running a build older than M11 skips such rows when it pulls (the Account card shows the "couldn't be read" line) and, once it updates, re-reads the whole goals table exactly once (kv `sync.pullResetVersion`, ADR-33), so the goal and its entries appear without any action.
- **Free-tier project paused:** Supabase pauses a Free project after about a week without activity. The app then shows *Sync error* / "Couldn't reach the cloud" and keeps working from the device; restore the project in the Supabase dashboard (U11) and press *Sync now*.

### Try it without an account (mock)

```bash
npm run mock:supabase                          # fake Supabase on http://127.0.0.1:54321 (users: Minh Test, Other User)
npm run build:cloud-e2e && npm run preview:cloud-e2e
# open http://localhost:4174/one-percent-better/#/settings -> Account -> Sign in with Google -> pick "Minh Test"
```

### Cloud setup (owner)

Creating the Supabase project, the Google OAuth client, running the SQL migration and setting the GitHub Actions secrets are manual steps for the repository owner. They are listed in order, with the "done when" check for each, in `docs/plan/TASKS.md` → **"User setup"** (U0–U11). The same steps, matched to what the code expects:

| Step | What to do | Done when |
| --- | --- | --- |
| **U0** (before deploying a phase-2 build over a phase-1 one) | On the app you are using: Settings → **Export backup (JSON)**, keep the file. | A `1percent-better-backup-YYYY-MM-DD.json` file |
| **U1** | supabase.com → new project on the Free plan (e.g. `one-percent-better`, region Southeast Asia). The database password is never used by the app. | Dashboard opens |
| **U2** | Project Settings → API Keys: copy **Project URL** (`https://<ref>.supabase.co`) and the **publishable key** (`sb_publishable_…`). Never copy or share the secret (service-role) key. Authentication → Sign In / Providers → Google: copy the **Callback URL** (`https://<ref>.supabase.co/auth/v1/callback`). | URL, publishable key, callback URL |
| **U3** | Google Cloud Console → project → Google Auth Platform / OAuth consent screen: External, app name `1% Better per Day`, your Gmail as support email, default scopes only (`openid`, `email`, `profile`), then **Publish app** so the status is *In production* (anyone with a Google account may sign in; the basic scopes need no verification). Clients → **Web application**: Authorized JavaScript origins `https://minh-lgm.github.io` and `http://localhost:5173`; Authorized redirect URI = the Callback URL from U2. Copy Client ID + secret. | Client ID / secret |
| **U4** | Supabase → Authentication → Sign In / Providers → Google: enable, paste Client ID and secret, Save. | Google provider *Enabled* |
| **U5** | Supabase → Authentication → URL Configuration: **Site URL** `https://minh-lgm.github.io/one-percent-better/`; **Redirect URLs** `https://minh-lgm.github.io/one-percent-better/**`, `http://localhost:5173/**`, `http://localhost:4173/**`. The app redirects to `<origin><base>?auth=callback` (no hash), which these patterns cover. | 3 redirect URLs |
| **U6** | SQL Editor → New query → paste all of `supabase/migrations/20261012000000_cloud_sync.sql` → Run (tables `goals`, `entries`, `settings`; RLS; last-write-wins triggers; grants). | "Success", Table Editor shows the 3 tables with RLS enabled |
| **U12** (v4.0 — after M11 passes QC, **before** pushing/deploying it) | Export a backup first (Settings → Export). Then SQL Editor → New query → paste all of `supabase/migrations/20261019000000_goal_open_ended.sql` → Run. The file is idempotent (running it twice is fine) and touches nothing but `goals.end_date` and its two check constraints — no RLS, grant or trigger changes, no data rewritten. Verify with `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.goals'::regclass and contype = 'c';` → `goals_period_check` (`end_date IS NULL OR end_date >= start_date`) and `goals_open_ended_daily_check` are listed, the old inline `end_date >= start_date` check is gone, Table Editor shows `end_date` as nullable and the row count of `goals` is unchanged. Rollback, only if no row has `end_date` NULL any more (otherwise `set not null` fails): drop the two named constraints, `alter table public.goals alter column end_date set not null;`, then `add constraint goals_period_check check (end_date >= start_date)` (the statements are in the comment at the top of the file). | "Success. No rows returned"; the two constraints exist; data intact → tell the orchestrator to deploy |
| **U7** | Locally: create `.env.local` (git-ignored) with `VITE_SUPABASE_URL=<Project URL>` and `VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>` → `npm run dev` → `http://localhost:5173/#/settings` → Sign in with Google. | The Account card shows your Gmail; Supabase → Authentication → Users lists you |
| **U8** (after the final QC of phase 2) | GitHub repo → Settings → Secrets and variables → Actions → **New repository secret**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (same values as U7). `.github/workflows/pages.yml` passes them to `npm run build`. Push to `main` or re-run "Deploy to GitHub Pages". Until the secrets exist the deployed app simply has no Account card. | The deployed app shows the Account card in Settings |
| **U9** | *Not needed* (decision OQ-06: anyone with a Google account may sign in). To lock it down later: Supabase → Authentication → Sign In / Providers → turn off **Allow new users to sign up**; existing accounts keep working, new ones get `AUTH_FAILED` in the app. | — |
| **U10** (after U8) | Manual checks for what automated tests cannot cover (NV-1 … NV-8 in `docs/handoff/dev-M8.md`): sign in on a laptop and on a phone (Chrome Android / Safari iOS, also as an installed PWA); log on one device, **Sync now** on the other; delete a goal on one device and see it vanish on the other; turn the phone offline, log, go online → it syncs; change language + reminder time on the laptop → the phone follows after Sync now; Table Editor shows rows with your `user_id` and one `settings` row; `curl "<Project URL>/rest/v1/goals?select=*" -H "apikey: <publishable key>"` (and `…/rest/v1/settings…`) returns `[]` or a permission error, never data; a friend with another Gmail does not see your goals. | Results reported to the project status |
| **U11** (ongoing) | The Free plan pauses a project after about 7 days without activity: if the app shows *Sync error* / "Couldn't reach the cloud", open the Supabase dashboard → **Restore project**, then press *Sync now*. Keep exporting a backup now and then. | — |

### Testing cloud features (two "devices")

The `cloud` Playwright project (`e2e/cloud/*.spec.ts`, `tests/qc/cloud/*.spec.ts`) runs the cloud build against the mock Supabase (`e2e/mock-supabase/server.mjs`: auth, `/rest/v1/goals|entries|settings` with the same last-write-wins rules as the SQL triggers, RLS by the JWT `sub`). Import `test`/`expect` from `e2e/cloud/fixtures.ts`:

- `mock` — test controls bound to this worker's partition: `reset()`, `seed(user, rows)`, `rows(user)` / `liveRows(user)`, `log()` (every request with the batch size), `fail(path, status, times, delayMs)`, `clearFailures()`, `session(...)`.
- `device()` — opens a **second browser context** (own IndexedDB/localStorage, same mock partition): `const b = await device(); await signInAsMinh(b.page);` is "the same account on another device". Offline is per context (`context.setOffline(true)`).
- `e2e/cloud/helpers.ts` — `signInAsMinh`, `signInViaMock`, `expectSyncState(page, 'synced' | 'pending' | 'offline' | 'error' | 'expired')`, `syncNow(page)`, `pendingCount(page)`, `collectErrors(page)` (page errors + unhandled rejections), dataset `C1`.

By hand: `npm run mock:supabase`, `npm run build:cloud-e2e && npm run preview:cloud-e2e`, then open `http://localhost:4174/one-percent-better/` in two browser profiles (or a normal and an incognito window) and sign in both as "Minh Test". The same contract (`src/services/remote-store.contract.ts`) runs against the fake store and the mock in `npm test`, and against Supabase local in `npm run test:db`.

`npm run test:db` runs the RLS/trigger tests, the `RemoteStore` contract and the v4.0 nullable `end_date` cases (`tests/db/`) against **Supabase local** (`npm run db:start`, needs Docker Desktop; export the keys printed by `npx --yes supabase@2.120.0 status` as `SUPABASE_TEST_PUBLISHABLE_KEY` / `SUPABASE_TEST_SECRET_KEY`). Without Docker it prints "skipped" and exits 0; the behaviour is then verified by hand (U10).

## Reminders: limitations

The app has no server, so the daily reminder is **best effort and only works while 1% Better is open** (a browser tab or an installed window, even in the background):

- Turn it on in **Settings → Reminders**, pick a time (default 20:00) and allow notifications when the browser asks. The permission state (not asked / allowed / blocked / not supported) is shown on the card.
- While the app is open it checks at startup, every `VITE_REMINDER_CHECK_INTERVAL_MS` and whenever the tab becomes visible. Past the reminder time, if at least one active goal is not on target, it sends **one notification per day** and shows a banner on Today (the banner does not need notification permission). Clicking the notification opens the app on Today.
- When the app is closed nothing can fire. For a reliable reminder use **Add reminder to calendar (.ics)** on the Reminders card: it downloads `1percent-better-reminder.ics`, a daily repeating 15-minute event (starting tomorrow at the reminder time, in your local time) with a display alarm. Open the file with Google Calendar (Settings → Import & export), Outlook, Apple Calendar or any calendar app; re-import it if you change the reminder time.
- iPhone/iPad: web notifications only work after adding the app to the Home Screen (iOS 16.4+).

## iOS app (Capacitor)

Since M12 the same code base also builds a native iOS app with [Capacitor 8](https://capacitorjs.com) (ADR-34/35 in `docs/plan/ARCHITECTURE.md`): the Vite bundle is packaged into a WKWebView, and the few things that differ between the web and the app live in **adapters** behind the existing ports.

**How it is wired**

- `npm run build:native` = `tsc -b && vite build --mode native` → `dist-native/`: base `/` (Capacitor serves from `capacitor://localhost`), **no service worker and no web manifest** (`vite-plugin-pwa` is disabled), and the build-time constant `__OPB_NATIVE__ = true`. `npm run build:native-e2e` is the same with the cloud forced off (`.env.native-e2e`) for Playwright. Like `npm run build`, `build:native` reads `.env.local`, but in M12 the app ignores the cloud configuration on native (no account until native sign-in exists, M14).
- `src/integration/platform.ts` holds the **only** `import()` into `src/integration/native/**`, guarded by `__OPB_NATIVE__`; on the web build the bundler drops it, so `dist/` contains no Capacitor code (`grep -rl Filesystem dist` → nothing, while the same grep finds the plugin in `dist-native/`). ESLint refuses `@capacitor/*` / `@capgo/*` imports anywhere else, refuses `import()` of `integration/native` outside `platform.ts`, and refuses value imports from `src/integration/**` in `src/ui/**` (the UI reads `capabilities` and the ports from the container).
- `src/integration/native/`: `index.ts` (`createNativePlatform()` — `null` when `Capacitor.getPlatform()` is `'web'`), `file-export.ts` (`FileExportPort`: write the file to the app cache with `@capacitor/filesystem`, then the iOS **share sheet** with `@capacitor/share`; dismissing the sheet is a silent cancel and does not count as a backup), `lifecycle.ts` (`resume` from `@capacitor/app` triggers the same reminder check / sync as `visibilitychange`).
- `src/app/capabilities.ts` (`AppCapabilities`: `platform`, `serviceWorker`, `pwaHints`, `nativeShare`, `nativeAuth`, `appleSignIn`, `scheduledNotifications`, `publicSiteUrl`) is computed once in `src/app/container.ts`; the UI picks the native copy from it (Settings: Language note, Reminders "Not supported", Backup share hint, Storage "In this app", About "this iPhone", absolute privacy link that opens in Safari; no "New version" toast; no "Add to Home Screen" hints; native S9 copy). `src/app/start.ts` skips the service worker and its message channel on the native build.
- `capacitor.config.ts`: `appId` `io.github.minhlgm.onepercentbetter`, `appName` `1% Better`, `webDir` `dist-native`. `ios/` is the committed Xcode project (Swift Package Manager, `ios/App/CapApp-SPM/Package.swift` regenerated by `cap sync`): bundle id as above, display name `1% Better`, iOS 16.4+, iPhone only, portrait only, `ITSAppUsesNonExemptEncryption = false`, version `1.0.0` build `1`. Generated files (`ios/App/App/public/`, `capacitor.config.json`, `config.xml`) are git-ignored, as are `dist-native*/` and every signing artefact (`*.p8`, `*.p12`, `*.mobileprovision`, …).

**Commands**

```bash
npm run build:native          # web assets for the app → dist-native/
npm run cap:sync              # build:native + `cap sync ios` (copies dist-native into ios/App/App/public, regenerates Package.swift) — works on Windows
npm run build:native-e2e && npm run preview:native-e2e   # the native build in a browser at http://localhost:4175/ (what the `native-web` Playwright project tests)
```

**What a Windows machine cannot do.** Xcode, the iOS Simulator and signing exist only on macOS, so nothing here opens Xcode (`npx cap open ios` is not used) and nothing is installed globally. `npx cap add ios` / `npx cap sync ios` *do* run on Windows (they copy files and write `Package.swift`), which is how `ios/` was created. The actual Xcode build runs on GitHub: **Actions → iOS → Run workflow**, lane `simulator` (`.github/workflows/ios.yml`, runner `macos-26`, checks `xcodebuild -version` is Xcode 26, then `npm run build:native`, `npx cap sync ios` and an unsigned `xcodebuild … -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build`; the job summary shows the result). The `testflight` lane (signing with an App Store Connect API key and upload) is described in "iOS release (GitHub Actions)" below. Static tests keep the project honest without Xcode: `src/test/ios-project.test.ts` (pbxproj / Info.plist / capacitor.config), `src/test/ci-workflows.test.ts` + `src/test/ci-testflight.test.ts` (the workflow), `src/test/ios-assets.test.ts` + `scripts/gen-ios-assets.test.mjs` (icon / launch images / export options), `src/test/safe-area.test.ts` (CSS safe area), `src/test/lint-boundaries.test.ts` (the ESLint boundaries); the native adapters are unit-tested with mocked plugins (`vi.mock('@capacitor/…')`).

**Native shell (M13).** `@capacitor/status-bar`, `@capacitor/splash-screen` and `@capacitor/keyboard` (pinned exact) are wired in `src/integration/native/system-ui.ts`: the status-bar text follows the OS theme (`prefers-color-scheme`), the launch image is hidden by the app once React has rendered (3 s fallback; `SplashScreen.launchAutoHide: false` in `capacitor.config.ts`), and `body.keyboard-open` hides the tab bar while the keyboard is up (`Keyboard.resize: 'native'`). Safe areas come from four CSS tokens (`--safe-top/right/bottom/left` = `env(safe-area-inset-*)`) declared in `src/ui/styles/app.css` and used by the header, tab bar, toasts, bottom sheets and full-page screens; on the web they are 0. The app icon (`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`, 1024 px RGB, white background) and the launch images (`Splash.imageset/splash-light.png` / `splash-dark.png`, 2732 px RGB; `LaunchBackground` colour set) are generated by `npm run ios:assets` (`scripts/gen-ios-assets.mjs`: Playwright Chromium renders the product logo, `scripts/lib/png-rgb.mjs` strips the alpha channel; deterministic output, no extra dependency). The script needs the source logo at `logo/1_percent_better_transparent.png` (git-ignored) and exits 1 with a message when it is missing; the generated PNGs are committed, so nobody else needs the logo.

## iOS release (GitHub Actions)

Signing and uploading happen only on GitHub (`.github/workflows/ios.yml`, lane `testflight`, runner `macos-26`), with `xcodebuild` and an **App Store Connect API key** — no fastlane, no Mac (ADR-38). Xcode manages the distribution certificate and provisioning profile in the cloud (`-allowProvisioningUpdates`), archives a Release build and uploads it straight to App Store Connect (`ios/ci/ExportOptions.plist`: `method app-store-connect`, `destination upload`).

**Secrets and variables** (GitHub → Settings → Secrets and variables → Actions; the `U` steps are in `docs/plan/TASKS.md` "User setup phase 6"):

| Name | Kind | Where it comes from |
| :- | :- | :- |
| `APPLE_TEAM_ID` | secret | developer.apple.com → Membership details (10 characters) — U14 |
| `APP_STORE_CONNECT_API_KEY_ID` | secret | App Store Connect → Users and Access → Integrations → Team Keys (key with **Admin** access) — U17 |
| `APP_STORE_CONNECT_API_ISSUER_ID` | secret | same page, "Issuer ID" — U17 |
| `APP_STORE_CONNECT_API_KEY_P8_BASE64` | secret | the downloaded `AuthKey_<KEYID>.p8`, base64 (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_<KEYID>.p8")) \| Set-Clipboard`) — U18 |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | secret | already set for Pages (U8); baked into the app's web bundle |
| `VITE_GOOGLE_WEB_CLIENT_ID`, `VITE_GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME` | variable | Google Cloud (U21); public identifiers, used from M14 — may be empty until then |
| `IOS_BUILD_OFFSET` | variable | optional; added to the run number when the build number must jump |
| `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64` (secrets) + `IOS_PROVISIONING_PROFILE_NAME` (variable) | fallback only | manual signing (U17b), see below |

Nothing in the repository contains a key: `.p8`, `.p12`, `.mobileprovision`, `.cer` are git-ignored; the workflow decodes the key into `$RUNNER_TEMP` with mode 600 and deletes it in a final `if: always()` step; no IPA or key is uploaded as an artifact.

**Running a lane.** GitHub → Actions → **iOS** → Run workflow → `lane` = `simulator` (unsigned build, no secrets needed) or `testflight` (lint, typecheck, unit tests, `build:native`, `cap sync`, archive, export/upload; ~15–25 min). Pushing a tag `ios-vX.Y.Z` also runs the `testflight` lane and sets the marketing version from the tag. The job summary shows the Xcode version, the version/build and the archive/export results; the build then appears in App Store Connect → TestFlight after Apple's processing (TASKS U19).

**Version and build number** (`scripts/ios-version.mjs`): `MARKETING_VERSION` = the tag `ios-vX.Y.Z` → the `marketing_version` input of Run workflow → `ios/ci/version.json` (`{"marketingVersion":"1.0.0"}`), in that order; `BUILD_NUMBER` = the workflow run number (+ `IOS_BUILD_OFFSET`). To release 1.0.1: edit `ios/ci/version.json` (or run the lane with `marketing_version = 1.0.1`, or push `ios-v1.0.1`). Build numbers only ever go up, so re-running the lane simply makes the next build.

**Common errors.**

- *"No Xcode 26.x on this runner image"* — Apple rejects uploads built with older Xcode; the job selects the newest `Xcode_26*` on the image and fails if there is none (check the `macos-26` image notes).
- *Cloud signing permission error / "Provisioning profile … doesn't support" / "No profiles for …"* — the API key cannot manage certificates (needs Admin) or the App ID is missing (U15). Fix the key/App ID, or switch to manual signing (below).
- *"The bundle version must be higher than the previously uploaded version"* — a build with that number already exists (e.g. after moving to a new repository): set the variable `IOS_BUILD_OFFSET` above the highest uploaded build.
- *Missing agreement* — App Store Connect → Agreements, Tax, and Banking (U16).
- *Secret not set* — the first step lists which of the four release secrets is missing.

**Fallback: manual signing (U17b).** When cloud signing is refused, create an Apple Distribution certificate with OpenSSL (TASKS U17b), export it as `.p12`, download an App Store provisioning profile for the bundle id, and add the secrets `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64` and the variable `IOS_PROVISIONING_PROFILE_NAME`. The lane detects the certificate secret, imports it into a temporary keychain, installs the profile, signs with `CODE_SIGN_STYLE=Manual` and `ios/ci/ExportOptions-manual.plist`, and still uploads with the API key; the keychain and profile are removed at the end of the job. Remove the three secrets to go back to automatic signing.

## Project layout

```
src/
  app/          composition root (container), capabilities (what this build/platform can do), bootstrap (incl. OAuth callback), start (post-render wiring), router, App, ErrorBoundary
  config/       env (zod-validated, incl. cloud config), business constants
  domain/       pure logic: dates, goal, entry, timer, reminder, ics, backup, settings, stats, heatmap, curve, plusone (no React, no Dexie, no i18n)
  data/         repository interfaces + Dexie (IndexedDB) implementation (goal, entry, kv, timer, backup, local-data)
  services/     use cases: GoalService, EntryService, LocaleService, SettingsService, TimerService, ReminderService, BackupService, StatsService, AuthService (+ AuthPort contract)
  integration/  browser APIs: storage persistence, service-worker registration, notifications, file download (web FileExportPort), connectivity, auth-callback;
                supabase/ = the ONLY place that imports @supabase/supabase-js (loader.ts = lazy import, supabase-client.ts = SupabaseAuthPort);
                platform.ts = the ONLY import() into native/; native/ = the ONLY place that imports @capacitor/* (file-export, lifecycle)
  i18n/         i18next instance, locale detection, Intl formatters, resources
  ui/           screens (Review and Goal detail are lazy-loaded), components (Heatmap, StatCard, BarChart + CurveChart = Recharts in a shared lazy chunk, AccountCard, SignOutDialog, GoogleSignInButton), hooks, styles
  sw.ts         service worker (Workbox precache, notification click → Today)
supabase/       config.toml (Supabase local) + migrations/ (SQL run once on the project)
capacitor.config.ts, ios/   Capacitor configuration and the committed Xcode project (see "iOS app (Capacitor)")
.github/workflows/  pages.yml (deploy the web app), ios.yml (build the iOS app on macOS runners)
e2e/            Playwright specs, helpers and fixtures; cloud/ = specs for the `cloud` project; native/ = specs for the `native-web` project; mock-supabase/server.mjs = mock Supabase (Node http, no deps)
scripts/        icon generation, large fixture generation, test-db runner
tests/qc/       QC-owned tests; tests/db/ = RLS/trigger tests for Supabase local (npm run test:db)
```

Dependency rules between layers are enforced by `eslint.config.js` (`no-restricted-imports`).

## Brand assets

The PWA icons, favicon and the brand mark in the navigation come from the product logo ("1% Better per Day", black lettering): `public/icons/pwa-192.png`, `pwa-512.png` (logo at 92 % on white), `pwa-maskable-512.png` (72 %, icon safe zone), `public/apple-touch-icon.png` (180 px, white), `public/favicon.svg` (wraps a 64 px transparent PNG) + `public/favicon-32.png`, and `public/brand-mark-96.png` (transparent, shown at 28 px on a white 32 px tile in both colour schemes). The logo source is kept outside the repository (`logo/`, git-ignored). `npm run icons` only re-copies files with the same names from `logo/` when they exist; it never redraws the committed assets.
