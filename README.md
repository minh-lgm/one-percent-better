# 1% Better per Day

A local-first PWA for tracking the time you put into your goals every day. Set a goal with a daily (or total) time target, log minutes each day, and watch the "+1%" days add up. Everything is stored in your browser (IndexedDB); there is no account, no server and no tracking.

Current milestone: **M1 — walking skeleton** (goals, manual time entries for today, offline PWA, English/Vietnamese UI). Timer, reminders, backup/restore, review charts and the 1% curve arrive in later milestones.

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
| `VITE_REMINDER_CHECK_INTERVAL_MS` | `60000` | Reminder check interval while the app is open (used from M2) |
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

E2E tests run with a fixed clock (`2026-10-09 10:00 Asia/Ho_Chi_Minh`) and a fresh browser context per test. QC tests live in `tests/qc/` and are picked up by both Vitest (`*.test.ts(x)`) and Playwright (`*.spec.ts`).

## Language

The UI is available in **English** and **Tiếng Việt**.

- First launch: the language follows the browser (`navigator.language` starting with `vi` → Vietnamese, otherwise English).
- Change it any time in **Settings → Language / Ngôn ngữ**. The choice is stored on the device (IndexedDB) and takes effect immediately, including dates and numbers (`2026-10-01 – 2026-10-31` vs `01/10/2026 – 31/10/2026`, `1,440` vs `1.440`).
- All strings live in `src/i18n/resources/en.json` and `vi.json`. Both files must contain the same keys (a parity test enforces this), and UI code must use `t()` instead of literal text (enforced by ESLint).

## Project layout

```
src/
  app/          composition root, bootstrap, router, App
  config/       env (zod-validated), business constants
  domain/       pure logic: dates, goal, entry (no React, no Dexie, no i18n)
  data/         repository interfaces + Dexie (IndexedDB) implementation
  services/     use cases: GoalService, EntryService, LocaleService
  integration/  browser APIs: storage persistence, service-worker registration
  i18n/         i18next instance, locale detection, Intl formatters, resources
  ui/           screens, components, hooks, styles
  sw.ts         service worker (Workbox precache)
e2e/            Playwright specs and helpers
tests/qc/       QC-owned tests
```

Dependency rules between layers are enforced by `eslint.config.js` (`no-restricted-imports`).

## Icons

`npm run icons` regenerates the PWA icons in `public/` (plain Node script, no dependencies).
