# Dev handoff — M1 Walking skeleton: goals + ghi phút thủ công + IndexedDB + PWA cơ bản + song ngữ

Ngày: 2026-10-09. Developer build theo `docs/plan/TASKS.md` M1 (T1…T8, AC1…AC18), `ARCHITECTURE.md` v1.2, `DESIGN.md` v1.1.

## 1. Tóm tắt

- Dựng toàn bộ skeleton xuyên suốt các lớp: config (`env.ts` zod, `constants.ts`) → domain thuần (`dates`, `goal`, `entry`) → data (Dexie schema v1 + 3 repository, `deleteWithEntries` một transaction, live query) → services (`GoalService`, `EntryService`, `LocaleService`) → composition root (`container.ts`, `bootstrap.ts`) → UI React (Today, Goals, GoalForm, Settings [Language/Storage/About], NotFound, StorageError) → PWA (manifest, `sw.ts` precache, đăng ký SW chỉ ở bản build, `storage.persist()`).
- i18n hoàn chỉnh: `en.json`/`vi.json` chứa **toàn bộ** chuỗi M1 nguyên văn DESIGN §7 (cộng 2 key lỗi mà domain M1 đã có thể trả về, xem Deviations), `detectLocale`, `format.ts` (Intl), key có kiểu, `missingKeyHandler` ném lỗi ở test, parity test, quét DOM `vi` (component + E2E), card Language trong Settings đổi ngay không reload và bền qua reload.
- Lint cưỡng chế tách lớp (`no-restricted-imports` theo regex) và cấm chuỗi hardcode trong JSX + `dangerouslySetInnerHTML` (`no-restricted-syntax`, một khai báo rule). Mọi probe của M1-AC13/AC17 cho kết quả đúng.
- Kết quả lần chạy cuối (bản sao sạch ở đường dẫn không có `%`, xem mục 8): `npm run check` exit 0 (lint 0 lỗi, typecheck 0 lỗi, **128/128** test Vitest, build xong); `npm run test:e2e` **20/20** pass (chạy từ thư mục project; lần chạy trên bản sao sạch ghi ở mục 5).
- Một bug thật được E2E phát hiện và sửa: handler `controlling` của workbox-window làm app tự reload ~300 ms sau lần mở đầu tiên (SW `clients.claim()`); nay chỉ reload sau khi người dùng bấm Reload ở UpdateToast (có regression test).

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M1-T1 | DONE | Dependency pin exact theo ARCH §2; script đủ ARCH §9; ESLint flat config; Vitest `projects` (node cho `*.test.ts`, jsdom cho `*.test.tsx`, include `tests/qc/**`); Playwright `webServer` build+preview 4173, `timezoneId`, `locale`, include `tests/qc/**/*.spec.ts`; `.nvmrc`, `.env.example`, `.npmrc` (xem Deviations) |
| M1-T2 | DONE | `src/domain/{types,dates,goal,entry}.ts` + test (năm nhuận 2028, ranh giới năm, 1827/1828 ngày) |
| M1-T3 | DONE | `src/data/repositories.ts`, `src/data/dexie/{db,goal-repo,entry-repo,kv-repo}.ts` + `repos.test.ts` (cascade, rollback bằng spy ném lỗi giữa transaction, `sumMinutes` với `excludeEntryId`, live query) |
| M1-T4 | DONE | `Result<T>` trong `domain/types.ts`; `GoalService`, `EntryService` test với Dexie thật trên fake-indexeddb; `container.ts`, `AppContext.tsx`; hook `useSubscribable`, `useNow`, `useServices` (+ `useDelayed`, `useToast`) |
| M1-T5 | DONE | `router.tsx` (hash), Goals (3 nhóm, badge, sort theo DESIGN), GoalForm (lỗi inline theo field, summary `role=alert`, focus field lỗi đầu, hint chỉ tiêu, hint entry ở chế độ sửa), D2 bằng `<dialog>`/`showModal` focus ban đầu ở Cancel, NotFound (page/goal) |
| M1-T6 | DONE | Today: goal active, `{current}/{target}` + đơn vị, ProgressBar (`aria-valuetext`), PlusOnePill + chữ ẩn, tóm tắt số nhiều, EntryForm inline (focus Minutes, Esc đóng, trả focus về Log time), EntryRow sửa/xoá có xác nhận inline (focus Keep), toast; empty state tối thiểu (2 biến thể) |
| M1-T7 | DONE | Manifest (name/short_name/icons 192/512/maskable/standalone), `sw.ts` injectManifest precache + `SKIP_WAITING`, `sw-register.ts` (workbox-window, chỉ PROD), `storage.ts` (`persist()` gọi đúng 1 lần ở container), StorageError khi DB không mở được, Settings hiện Protected/Not protected/Unknown, OfflineChip, UpdateToast; icon sinh bằng `scripts/gen-icons.mjs`; E2E 4 spec |
| M1-T8 | DONE | `src/i18n/{types,detect,format,instance,parity,i18next.d.ts}`, `resources/{en,vi}.json`, `LocaleService` + kv `locale` (chưa chọn thì không ghi, A-16), `bootstrap.ts` (không nháy ngôn ngữ, `<html lang>`), `useT`/`useFormat`/`useDocumentTitle`, `ui/error-messages.ts`, `LanguageSwitcher`, helper test `render-with-locale.tsx`, `i18n-scan.ts` (dùng chung cho Vitest và E2E), parity test, `e2e/m1-i18n.spec.ts` |

## 3. File chính đã thêm/sửa

- Toolchain: `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc`, `.env.example`, `.gitignore`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.sw.json`, `tsconfig.node.json`, `vite.config.ts`, `eslint.config.js`, `playwright.config.ts`, `index.html`, `README.md`, `scripts/gen-icons.mjs`, `public/favicon.svg`, `public/apple-touch-icon.png`, `public/icons/*.png`.
- `src/config/env.ts` (+test), `constants.ts`.
- `src/i18n/types.ts`, `detect.ts` (+test), `format.ts` (+test), `instance.ts` (+test), `parity.ts` (+test), `i18next.d.ts`, `resources/en.json`, `resources/vi.json`.
- `src/domain/types.ts`, `dates.ts` (+test), `goal.ts` (+test), `entry.ts` (+test).
- `src/data/repositories.ts`, `src/data/dexie/db.ts`, `goal-repo.ts`, `entry-repo.ts`, `kv-repo.ts`, `repos.test.ts`.
- `src/services/goal-service.ts` (+test), `entry-service.ts` (+test), `locale-service.ts` (+test).
- `src/integration/storage.ts` (+test), `sw-register.ts` (+test). `src/sw.ts`.
- `src/app/container.ts`, `bootstrap.ts` (+test gồm container), `updates.ts`, `AppContext.tsx`, `router.tsx`, `App.tsx`. `src/main.tsx`.
- `src/ui/error-messages.ts` (+test); hooks `useT`, `useFormat`, `useDocumentTitle`, `useSubscribable`, `useNow`, `useDelayed`, `useToast`, `useServices`; components `Icon`, `Button` (+`LinkButton`, `IconButton`), `Badge`, `PlusOnePill`, `ProgressBar`, `Field` (`TextField`, `TextArea`), `SegmentedControl`, `Alert`, `ConfirmDialog`, `Toast` (`ToastProvider`, `ToastRegion`), `UpdateToast`, `OfflineChip`, `EmptyState`, `Skeleton`, `PageHeader`, `AppShell`, `EntryForm`, `EntryRow`, `GoalCard`, `LanguageSwitcher`; screens `Today`, `Goals`, `GoalForm`, `Settings`, `NotFound`, `StorageError` (+ test cho 5 screen); `styles/tokens.css`, `styles/app.css`.
- `src/test/setup.ts`, `builders.ts` (dataset S1), `db.ts`, `container.ts`, `render-with-locale.tsx`, `i18n-scan.ts` (+test).
- `e2e/helpers/app.ts`, `e2e/m1-goals.spec.ts`, `m1-today.spec.ts`, `m1-pwa.spec.ts`, `m1-i18n.spec.ts`.

## 4. Cách chạy

```bash
npm ci               # cài dependency (xem mục 8 về đường dẫn chứa "%")
npm run e2e:install  # Chromium cho Playwright, vào node_modules (PLAYWRIGHT_BROWSERS_PATH=0)
# không cần .env; tuỳ chọn: cp .env.example .env
npm run dev          # http://localhost:5173 (không có SW)
npm run build && npm run preview   # http://localhost:4173 (có SW/PWA, dùng để demo và cài app)
```

## 5. Cách test

| Lệnh | Kết quả lần chạy cuối |
| :- | :- |
| `npm run lint` | 0 lỗi, 0 warning (`--max-warnings 0`) |
| `npm run typecheck` (`tsc -b --noEmit`, 3 project app/sw/node) | 0 lỗi |
| `npm test` | 22 file, **128 passed / 0 failed** (bản sao sạch). Trong thư mục `1%better`: 127 passed, 1 file `src/config/env.test.ts` không load được vì Vite không decode được `%` trong đường dẫn khi xử lý `import.meta.env` (lỗi môi trường, xem mục 8) |
| `npm run test:coverage` | `src/domain`: 96.15 % statements, 88.17 % branches, 90.9 % functions, 100 % lines (≥ 90 % dòng theo ARCH §8) |
| `npm run build` | OK; `dist/assets/index-*.js` 647.6 kB raw / **199.2 kB gzip** (NFR-03 ≤ 250 kB), CSS 3.9 kB gzip; precache 15 entry; `dist/sw.js`, `dist/manifest.webmanifest` |
| `npm run test:e2e` | **20 passed / 0 failed** (14.7 s) chạy từ thư mục project (Playwright + build + preview chạy được từ đường dẫn có `%`); **20 passed / 0 failed** (14.3 s) trên bản sao sạch qua đúng script `npm run test:e2e` |
| `npm run check` | exit 0 trên bản sao sạch |

Probe lint (ARCH §3, chạy `node node_modules/eslint/bin/eslint.js --stdin --stdin-filename <file>` vì `npx` không chạy được trong thư mục có `%`; trên đường dẫn bình thường dùng `npx eslint` như AC ghi):

| Probe | Kết quả |
| :- | :- |
| `import Dexie from 'dexie'` ở `src/domain/probe.ts`, `src/services/probe.ts`, `src/ui/probe.tsx` | exit 1, `no-restricted-imports` |
| `import type { GoalRepository } from '../data/repositories'` ở `src/services/probe.ts` | exit 0 |
| `import i18next from 'i18next'` ở `src/domain/probe.ts`, `src/services/probe.ts` | exit 1, `no-restricted-imports` |
| `<button>Save</button>`, `<input placeholder="e.g. Read" />`, `<button aria-label="Delete">x</button>`, `<p>{'Hello'}</p>` ở `src/ui/probe.tsx` | exit 1, `no-restricted-syntax` |
| `<button>{t('nav.today')}</button>` ở `src/ui/probe.tsx` | exit 0 |
| `<div dangerouslySetInnerHTML={{ __html: 'x' }} />` ở `src/ui/probe.tsx` | exit 1, `no-restricted-syntax` |

`rg dangerouslySetInnerHTML src` → 0 kết quả (chỉ có selector trong `eslint.config.js`).

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (test / lệnh) |
| :- | :- | :- |
| M1-AC1 | PASS (bản sao sạch) / PASS một phần tại `1%better` | `npm ci`, `e2e:install`, `lint`, `typecheck`, `test`, `build`, `test:e2e` đều exit 0 trên bản sao ở đường dẫn không có `%`. Tại chính thư mục `1%better`: `npm ci`/`npx` lỗi `URI malformed` (npm), `env.test.ts` không load (Vite) — xem mục 8. `npm ls -g --depth=0` không đổi (không cài global; Chromium nằm trong `node_modules/playwright-core/.local-browsers`) |
| M1-AC2 | PASS | E2E `m1-goals.spec.ts` "M1-AC2"; component `GoalForm.test.tsx` "creates a goal" |
| M1-AC3 | PASS | Unit `goal.test.ts` (đủ các case AC, 60/61 ký tự, 1827/1828 ngày, total 100 h/1 ngày → `tooMuch`); component `GoalForm.test.tsx` "empty name" (`aria-invalid`, `aria-describedby`, DB rỗng); E2E "M1-AC3" |
| M1-AC4 | PASS | Unit `goal.test.ts` dailyTarget (17/17/30/9); E2E "M1-AC4" Spanish `0/17` |
| M1-AC5 | PASS | Unit `goal.test.ts` status S1 + biên; E2E "M1-AC5" (3 goal, 3 nhãn, Today chỉ Read); component `Today.test.tsx` "shows only active goals" (S1) |
| M1-AC6 | PASS | E2E `m1-today.spec.ts` "M1-AC6 + M1-AC7" và "entry validation errors" (0/1441/12.5 qua unit; 1400+41 → lỗi với `remaining` 40, +40 hợp lệ); unit `entry.test.ts`, service `entry-service.test.ts` |
| M1-AC7 | PASS | E2E: 30/30 → sửa 20→5 → `15/30` mất +1% → xoá → `10/30` không reload; unit/service `update` với `excludeEntryId`; `repos.test.ts` sumMinutes exclude |
| M1-AC8 | PASS | `goal-service.test.ts` (GOAL_PERIOD_EXCLUDES_ENTRIES, DB không đổi; đổi name/why/target: `updatedAt` đổi, `createdAt` giữ); component `GoalForm.test.tsx` "edit mode"; E2E "M1-AC8" |
| M1-AC9 | PASS | E2E "M1-AC9" (Cancel giữ, Confirm xoá khỏi Goals và Today); `repos.test.ts` cascade + rollback (spy `goals.delete` ném lỗi → goal và 8 entry còn nguyên); component `Goals.test.tsx` |
| M1-AC10 | PASS (tự động) / NOT VERIFIED (thủ công) | E2E "M1-AC10" (reload + page mới cùng context); `bootstrap.test.ts` "requests persistent storage exactly once"; `Settings.test.tsx` 3 trạng thái storage. Chưa kiểm thủ công "đóng hẳn Chrome rồi mở lại" — QC kiểm theo bước: `npm run preview`, tạo goal, đóng Chrome, mở lại `http://localhost:4173` |
| M1-AC11 | PASS (tự động) / NOT VERIFIED (nút Install thủ công) | E2E `m1-pwa.spec.ts` "M1-AC11": manifest đúng field, `serviceWorker.ready`, controller sau reload, `setOffline(true)` + reload → Today render, ghi 15 phút được. Kiểm thủ công nút Install: QC làm trên Chrome/Edge với `npm run preview` |
| M1-AC12 | PASS | E2E "M1-AC12": 0 request ngoài `http://localhost:4173`; goal name `<img src=x onerror=alert(1)>` hiển thị literal, 0 thẻ `img` trong `main`, không dialog; axe Today/Goals/GoalForm 0 serious/critical; viewport 360×740 và 1440×900 không cuộn ngang (Today/Goals/GoalForm/Settings) |
| M1-AC13 | PASS | Bảng probe ở mục 5; `goal-service.test.ts`/`entry-service.test.ts` kiểm `id` UUID v4, `createdAt`, `updatedAt` |
| M1-AC14 | PASS | E2E "M1-AC14" (`#/abc` → Not found + link Today; `#/` và `/` → `#/today`); component `NotFound.test.tsx` |
| M1-AC15 | PASS | Unit `detect.test.ts` (vi/vi-VN/VI-vn → vi; en-US/fr-FR/''/undefined → en); `locale-service.test.ts` (kv trống, kv `en` thắng, kv `fr` bỏ qua); E2E `m1-i18n.spec.ts` context `vi-VN` (`<html lang=vi>`, tab/EmptyState chuỗi `vi`, kv không có `locale`), `en-US`, `fr-FR`; component `NotFound.test.tsx` "StorageError renders in the detected language" |
| M1-AC16 | PASS | E2E "changes the whole app immediately" (`__noReload` còn `true`, h1/tab bar/`lang`/`title` đổi, Today/Goals/GoalForm tiếng Việt với "Read"/"Be smarter"/"Ch. 3" giữ nguyên, reload + page mới vẫn `vi`, chọn English về `en` và bền; context `vi-VN` chọn English bền); "keyboard: arrow keys"; `locale-service.test.ts` `set('vi')`; `Settings.test.tsx` (focus giữ trên lựa chọn, `lang` từng option, Alert khi ghi kv lỗi) |
| M1-AC17 | PASS | Probe lint (mục 5); `parity.test.ts` (parity thật + fixture thiếu/thừa key, khác biến, rỗng, `_one` trong vi); `instance.test.ts` `t('does.not.exist')` ném `MissingTranslationError`; quét vi component: Today (rỗng, chưa đạt, đạt, form mở, lỗi minutes, xác nhận xoá), Goals (3 nhóm, D2), GoalForm (tạo, lỗi mọi field, sửa có hint, PERIOD_EXCLUDES), Settings, NotFound (page/goal), StorageError → 0 phát hiện; E2E `vi-VN` luồng AC2→AC7 quét sau mỗi màn và khi toast hiện → 0 phát hiện |
| M1-AC18 | PASS | `format.test.ts` (dateLong en/vi, dateShort, dateRange, number, decimal1, percent1, hhmmss, weekday/monthShort); `Today.test.tsx` "plural summary" (`_one`/`_other` en, `_other` vi); E2E vi-VN: hàng goal `01/10/2026 – 31/10/2026`, hint `930`/`15,5`, dòng ngày = `Intl` vi-VN, lỗi tên rỗng = `vi` của `errors.GOAL_NAME_REQUIRED`; đổi English → `2026-10-01 – 2026-10-31`, `Friday, October 9` ngay; axe vi-VN Today/Goals/GoalForm/Settings 0 serious/critical; 360 px vi-VN 4 màn không cuộn ngang (Today form mở, Goals 3 nhóm, GoalForm lỗi 4 field, Settings) |

## 7. Deviations so với plan/design

1. **`.npmrc` với `legacy-peer-deps=true`.** npm 10.9.2 crash `Cannot read properties of null (reading 'edgesOut')` khi giải peer set của `vitest@4.1.11` (bug arborist, không phụ thuộc đường dẫn). Mọi peer cần thiết đều là dependency tường minh nên không mất gì; `npm ci` chạy sạch với file này. Không đổi version nào so với ARCH §2.
2. **`DomainError` có thêm `params?: Record<string, string | number>`** (ARCH §5.4 chỉ ghi `code`, `field?`, `message`) để mang biến thể (`variant: daily|total|tooMuch|endBeforeStart|tooLong`) và tham số (`remaining`, `start`, `end`) mà `error-messages.ts` cần theo DESIGN §7.3. Không đổi mã lỗi.
3. **`en.json`/`vi.json` chứa thêm 2 key ngoài danh sách M1:** `errors.DATE_IN_FUTURE` (MS M3) và `errors.DATE_OUTSIDE_GOAL_PERIOD` (MS M2), vì `EntryService` M1 đã validate mọi ngày (theo ghi chú M1-T4) nên `error-messages.ts` phải ánh xạ được; copy lấy nguyên văn DESIGN, không tự dịch.
4. **Allowlist parity** (`src/i18n/parity.test.ts`, `SAME_VALUE_ALLOWLIST`): `app.name`, `app.shortName`, `app.brandSuffix`, `doc.title`, `settings.language.title`, `settings.language.option.en`, `settings.language.option.vi`, `goalCard.plusOne`. Các chuỗi chỉ gồm số/ký hiệu/biến (`{{n}}/280`, `{{start}} – {{end}}`, `{{value}}%`, `{{current}}/{{target}}`, `{{minutes}}`) được miễn tự động. Thêm `app.brandSuffix` (DESIGN ghi `= en`) so với danh sách ví dụ ở ARCH §8.
5. **`eslint-disable-next-line no-restricted-syntax`: 0 chỗ.** Có đúng 1 `eslint-disable-next-line react-hooks/exhaustive-deps` trong `src/ui/hooks/useSubscribable.ts` (deps do caller truyền, đúng kiểu hook generic).
6. **Số ở card Today được định dạng theo locale** (`1,400/30` ở en, `1.400/30` ở vi) theo DESIGN §7.1; AC6 viết `1400` không có dấu phẩy nhưng chỉ là ví dụ dưới 1.000 nên không mâu thuẫn.
7. **E2E dùng `page.clock.setFixedTime`** thay vì `install` (timer thật cho toast/live query; `Date` cố định `2026-10-09T10:00+07:00`).
8. **Dữ liệu `goalCard.subtitleTotal`** dùng `number()` cho giờ (`100 h total`) thay vì `decimal1` vì giờ nhập luôn nguyên.
9. **Project Vitest:** `*.test.ts` chạy env `node`, `*.test.tsx` chạy `jsdom` (docblock `// @vitest-environment jsdom` vẫn override được, `bootstrap.test.ts` và `i18n-scan.test.ts` dùng cách này).
10. **Workbox:** không thêm `workbox-core`/`workbox-routing`; `sw.ts` dùng `self.clients.claim()` và `skipWaiting()` trực tiếp; navigation `/` được precache phục vụ qua `index.html` (hash router nên không cần `NavigationRoute`).

## 8. Known issues và giới hạn

- **Đường dẫn project chứa `%` (`1%better`) làm hỏng npm và Vite trên máy này.** `npm install`/`npm ci`/`npx` lỗi `URI malformed` (npm-package-arg `decodeURIComponent` cwd); Vitest không load được file dùng `import.meta.env`/`import.meta.url` (`src/config/env.test.ts`). `npm run <script>`, `vite build`, `vite preview`, Playwright, ESLint, tsc chạy bình thường từ thư mục này. Để cài dependency tôi đã dùng `subst Z: <project>` (đã gỡ bằng `subst Z: /D` sau khi xong) và để chạy **toàn bộ** lệnh chuẩn tôi dùng một bản sao của working tree ở `C:\Users\ADMIN\AppData\Local\Temp\claude\...\scratchpad\verify` (đường dẫn không có `%`). Đề nghị: đổi tên thư mục (vd. `one-percent-better`) trước khi QC chạy AC1 trên "clone sạch"; nếu không, QC dùng cùng cách (subst/clone sang đường dẫn khác). Ghi ở README.
- Kiểm thủ công chưa làm (không có thiết bị/điều kiện trong phiên này): nút Install trên Chrome/Edge desktop và app mở cửa sổ riêng (AC11); đóng hẳn Chrome rồi mở lại còn dữ liệu (AC10); Firefox/Safari iOS (NFR-06).
- Bundle JS ban đầu 199 kB gzip (ngân sách 250 kB). Recharts (M4/M5) phải lazy-load như ADR-10 để không vượt; nếu chật có thể chuyển `zod` sang `zod/mini` hoặc lazy-load file dịch không dùng.
- `EntryService.update/remove` tìm entry bằng `getByDateRange` toàn khoảng rồi lọc theo id vì `EntryRepository` của ARCH §5.2 không có `getById`. Đủ cho M1; nếu M3 cần, đề xuất planner thêm `getById` vào interface.
- Dark mode theo hệ điều hành (A-D2); chưa có snapshot test cho dark mode.
- Playwright đôi khi cần `reuseExistingServer`: nếu còn một `vite preview` cũ đang chiếm cổng 4173 thì E2E sẽ chạy trên bản build cũ; dừng nó trước (`npm run test:e2e` tự build và chạy preview).
- Lần chạy `npm run test:e2e` trên bản sao sạch: lần đầu 20/20 fail chỉ vì Chromium chưa tải xong vào bản sao (không phải lỗi app); sau `npm run e2e:install` chạy lại → 20/20 pass (mục 5).

## 9. Dispute (nếu có)

Không có.

## Assumptions

- A-M1-1: Lỗi `GOAL_PERIOD_EXCLUDES_ENTRIES` hiển thị dưới **Start date** (field `period`), ô End date không đánh dấu lỗi (DESIGN ghi "dưới Start date/End date").
- A-M1-2: Goal `total` ở Goals/Today hiện số giờ nguyên (`100 h total`), vì giờ nhập là số nguyên 1–10.000.
- A-M1-3: Xác nhận xoá entry: nút `Keep` trả focus về nút Delete của entry; xoá xong trả focus về `Log time` của card (DESIGN §8).
- A-M1-4: `OfflineChip` đặt đầu `<main>` (trên PageHeader) ở mọi màn.
- A-M1-5: UpdateToast đặt ở mép trên màn hình để không che toast thường ở dưới.

## Open questions

- OQ-M1-1 (user/orchestrator): Có đổi tên thư mục project để bỏ ký tự `%` không? Nếu giữ, mọi vòng QC phải dùng workaround (mục 8) và `npm ci` của AC1 không chạy được tại chỗ.
- OQ-M1-2 (planner, nhỏ): có chấp nhận thêm `getById` vào `EntryRepository` ở M3 (xem Known issues)?
