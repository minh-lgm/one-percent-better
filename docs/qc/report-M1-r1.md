# QC report — M1 round 1

> Ghi chú của orchestrator: nội dung dưới đây do agent `qc` viết và trả về dạng text (Write tool của subagent bị harness từ chối ghi file report). Orchestrator chép nguyên văn vào file này ngày 2026-10-10, không sửa nội dung.

**Verdict:** FAIL
**Ngày:** 2026-10-10  **Commit:** b12b111 (working tree: `docs/STATUS.md` đã sửa bởi orchestrator; thêm `tests/qc/*` của QC)

## 1. Tóm tắt
- Toolchain sạch: lint, typecheck, build, Vitest, Playwright đều exit 0 cả ở project root lẫn trên clone sạch (`npm ci` và `npm run e2e:install` cũng exit 0). `npm ls -g --depth=0` không đổi. 0 request ngoài origin, 0 lỗi console, `npm audit` 0 lỗ hổng, không có `dangerouslySetInnerHTML`, không có `.env` trong repo.
- 169 dòng copy M1 của DESIGN §7 đối chiếu máy với `en.json`/`vi.json`: 0 thiếu, 0 lệch.
- 17/18 AC đạt về mặt tự động. **M1-AC12 FAIL** vì M1-D1 (Major): màn Goals cuộn ngang ở 360 px khi "Why" dài hơn khoảng 55 ký tự. Dev E2E chỉ dùng why ngắn nên không bắt được.
- Phần thủ công của AC10 (đóng hẳn Chrome rồi mở lại) và AC11 (nút Install, cửa sổ app riêng) là `NOT VERIFIED`, có bằng chứng thay thế và hướng dẫn user ở mục 8.
- 3 defect: 1 Major (D1), 2 Minor (D2, D3).

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2, Playwright Chromium 156. Ngày test cố định 2026-10-09T10:00+07:00 (`page.clock.setFixedTime`), timezone Asia/Ho_Chi_Minh.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint (root) | `npm run lint` | exit 0, 0 lỗi, 0 warning (kể cả sau khi thêm `tests/qc`) |
| Typecheck (root) | `npm run typecheck` | exit 0 |
| Vitest (root) | `npm test` | 23 file, 150 passed (131 của dev + 19 QC) |
| Build (root) | `npm run build` | exit 0; `index-*.js` 647,61 kB raw / 199,17 kB gzip (≤ 250 kB); precache 15 entry |
| E2E dev (root) | `npm run test:e2e` (trước khi thêm test QC) | 20 passed |
| E2E dev + QC (root) | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | 56 passed, 2 failed (cả 2 là test QC bắt M1-D1) |
| Dev server | `npm run dev` | HTTP 200 ở :5173 |
| Audit | `npm audit` | found 0 vulnerabilities |
| Clone sạch (AC1) | `git clone` sang `C:\Users\ADMIN\AppData\Local\Temp\qcc`, rồi `npm ci`, `npm run e2e:install`, `lint`, `typecheck`, `test`, `build`, `test:e2e` | tất cả exit 0; Vitest 131 passed, Playwright 20 passed |
| Global | `npm ls -g --depth=0` trước và sau | `diff` rỗng |
| Probe lint | `printf ... \| npx eslint --stdin --stdin-filename <file>` (17 probe) | xem AC13, AC17 |
| Copy vs DESIGN | script đối chiếu bảng DESIGN §7 (MS = M1) với `en.json`/`vi.json` | 169 dòng, 0 thiếu, 0 lệch |

Lưu ý môi trường (không phải defect của app): lần đầu clone vào thư mục scratchpad, `npm run test:e2e` fail 20/20 với `spawn ...chrome-headless-shell.exe ENOENT`. Đường dẫn exe dài 268 ký tự, vượt MAX_PATH 260 của Windows (exe có thật, chạy trực tiếp được). Chạy lại ở đường dẫn ngắn thì pass. Dev ghi nguyên nhân là "Chromium chưa tải xong", chưa đúng (xem mục 9).

## 3. Acceptance criteria
| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M1-AC1 | PASS | Clone sạch ở đường dẫn ngắn: `npm ci`, `e2e:install`, `lint`, `typecheck`, `test` (131), `build`, `test:e2e` (20) đều exit 0. `npm ls -g --depth=0` trước/sau giống hệt. Project root không còn `%`; `npm run ...` và `npx eslint` chạy trực tiếp. |
| M1-AC2 | PASS | `tests/qc/m1-qc-flows.spec.ts`: tạo Read qua form, Goals hiện Active, Today `0/30`. Dev E2E AC2 cũng pass. |
| M1-AC3 | PASS | `tests/qc/m1-domain.test.ts`: name rỗng/khoảng trắng, 60/61 ký tự, why 280/281, daily 0/1441/12.5/NaN/-1/Infinity, total 0/10001/1,5, total 100 h trong 1 ngày (6000/ngày), biên 24 h/1 ngày = 1440, end<start, 1827 hợp lệ và 1828 lỗi, ngày không hợp lệ (`''`, `2026-02-30`, `2026-13-01`, `2026-1-1`). UI (`m1-qc.spec.ts`, 14 case + 1827 ngày + start rỗng): có `role=alert`, `aria-invalid="true"` kèm `aria-describedby`, 0 goal trong IndexedDB, URL vẫn `#/goals/new`. |
| M1-AC4 | PASS | Unit: total 100 h 2026 → 17; 100 h 2028 (366 ngày) → 17; daily 30 → 30; 1 h trong 7 ngày → 9. UI: Spanish → Today `0/17`. |
| M1-AC5 | PASS | Unit `goalStatus` tại 2026-10-09 + biên start=today, end=today, ngày mai, hôm qua, archived. UI: tạo G1-G5 → Goals 5 hàng, Marathon "Upcoming", Old course "Ended"; Today đúng 3 article. |
| M1-AC6 | PASS | `20/30` không có "+1%"; ghi tiếp 10 → `30/30` có "+1%". Minutes `0`, `1441`, `12.5`, rỗng, `abc`, `-3`, `1e2x` → `aria-invalid`, tổng không đổi. Note 281 → lỗi ở Note. 1400+41 lỗi; 1400+40 → `1,440/30`. Unit: `ENTRY_MINUTES_INVALID`, `ENTRY_NOTE_TOO_LONG`, `ENTRY_DAY_LIMIT_EXCEEDED` (`remaining`=40). |
| M1-AC7 | PASS | Không reload (cờ `window.__nr` còn): `30/30` → sửa 20→5 → `15/30`, "+1%" mất; xoá → `10/30`. Sửa 40→41 khi ngày đã 1440 bị từ chối, 40→40 được. Service: update 1400→1400 OK, 1400→1401 bị từ chối. |
| M1-AC8 | PASS | Service: đổi start sang 10-02 khi có entry 10-01 → `GOAL_PERIOD_EXCLUDES_ENTRIES`, DB `toEqual` bản trước; đổi name/why/target → `createdAt` giữ, `updatedAt` đổi. UI: ở lại form Edit, Start date `aria-invalid`; trả start, đổi tên → lưu. |
| M1-AC9 | PASS | UI: Delete → Cancel (focus ban đầu ở Cancel) giữ goal; Esc giữ goal; "Delete goal" → hết khỏi Goals, Today về EmptyState, `entries` = 0. Dialog nêu "1 entry". Service: xoá goal A không đụng entry goal B; chèn lỗi vào `goals.delete` → goal và 2 entry còn nguyên. |
| M1-AC10 | PASS (tự động) / NOT VERIFIED (thủ công) | Reload và page mới cùng context còn dữ liệu. `navigator.storage.persist` wrap: gọi đúng 1 lần sau 3 lần điều hướng; Settings hiện "Protected". `launchPersistentContext` đóng rồi mở lại cùng profile: dữ liệu còn. Chưa kiểm Chrome thật (mục 8). |
| M1-AC11 | PASS (tự động) / NOT VERIFIED (thủ công) | Manifest: name, short_name, start_url, `display: standalone`, icon 192/512 + 1 maskable; 3 PNG tải được, kích thước thật 192/512/512. `serviceWorker.ready` + controller sau reload. Offline + reload ở `#/today`, `#/goals`, `#/settings`, `#/goals/new` đều render; ghi 15 phút offline được; online lại còn `15/30`. CDP `Page.getInstallabilityErrors` = `[]`, `Page.getAppManifest` errors `[]`. Nút Install thật: mục 8. |
| M1-AC12 | **FAIL** | Các ý khác PASS: `context.on('request')` (gồm service worker) 19 request, 0 ngoài `localhost:4173`; `rg dangerouslySetInnerHTML src` → 0; tên `<img src=x onerror=alert(1)>`, why `<script>`, note `<svg onload>` hiển thị literal, 0 thẻ nguy hiểm, 0 dialog; axe Today/Goals/Settings/GoalForm có lỗi, light và dark: 0 serious/critical; 1440×900 không cuộn ngang. **Ý 360×740 không cuộn ngang không đạt khi Why dài: M1-D1.** |
| M1-AC13 | PASS | `eslint --stdin` exit 1 `no-restricted-imports` cho `dexie` ở domain/services/ui; import `../data/repositories` ở `src/services/probe.ts` (cả `import type` và import thường) → exit 0; import `data/dexie/db` từ ui và services → exit 1; `dexie` ở `src/app` → exit 0 (đúng). UUID v4, `createdAt`, `updatedAt` trên goal và entry: unit + đọc thẳng IndexedDB. |
| M1-AC14 | PASS | `#/abc` → "Page not found" + link "Go to Today"; `#/goals/does-not-exist/edit` → "Goal not found"; `#/` → `#/today`; đổi route focus vào h1. |
| M1-AC15 | PASS | Unit `detectLocale`: `vi`, `vi-VN`, `VI-vn`, `Vi` → vi; `en-US`, `fr-FR`, `''`, `undefined`, `null`, `zh-CN` → en. `LocaleService.resolve` (Dexie thật): kv trống + `vi-VN` → vi và kv vẫn trống; kv `en` thắng; kv `fr` hoặc `42` → vi, không lỗi. E2E `vi-VN` DB sạch: `<html lang="vi">`, h1 = `vi.today.title`, quét vi 0 phát hiện; dev E2E phủ `en-US`/`fr-FR`. kv `fr` thật + reload → vẫn English. StorageError (chặn `indexedDB.open`): `vi-VN` → tiếng Việt, `lang=vi`, title tiếng Việt; `en-US` → tiếng Anh; 0 pageerror. |
| M1-AC16 | PASS | Chọn Tiếng Việt → `<html lang>`=vi, `document.title` đổi, `__noReload` còn true, mỗi lựa chọn có `span[lang]` đúng; reload và page mới vẫn vi; kv `locale='vi'`. Bàn phím ArrowRight/Left đổi ngôn ngữ, focus ở lại lựa chọn, có `role=status`. `vi-VN` chọn English, reload → English. Dev E2E phủ luồng Today/Goals/GoalForm giữ "Read", "Be smarter", "Ch. 3". |
| M1-AC17 | PASS | Probe: `<button>Save</button>`, `<input placeholder>`, `<button aria-label>`, `<p>{'Hello'}</p>`, template literal trong JSX → exit 1 `no-restricted-syntax`; `{t('nav.today')}` → exit 0; `dangerouslySetInnerHTML` → exit 1; `i18next` ở domain và services → exit 1. Parity, fixture parity, `t('does.not.exist')` ném lỗi, quét vi component: nằm trong `npm test` (pass). QC E2E `vi-VN`: quét vi 0 phát hiện ở Today, GoalForm có lỗi, Goals, Settings, Not found. 169 chuỗi copy khớp DESIGN. |
| M1-AC18 | PASS | Unit `format.ts`: en `Friday, October 9`, `2026-10-01`, `2026-10-01 – 2026-10-31`, `1,440`, `15.5`, `25.8%`; vi chứa `9` và `tháng 10`, `01/10/2026`, `01/10/2026 – 31/10/2026`, `1.440`, `15,5`, `25,8%`; `hhmmss` giống nhau. E2E `vi-VN`: hàng goal `01/10/2026 – 31/10/2026`; hint chứa `930` và `15,5`; dòng ngày `Thứ Sáu, 9 tháng 10`; lỗi tên rỗng = `vi.errors.GOAL_NAME_REQUIRED`; chuyển English → `2026-10-01 – 2026-10-31` ngay và sau reload. axe `vi-VN` 5 màn: 0 serious/critical; 360 px không cuộn ngang (với why ngắn). Số nhiều `_one/_other` nằm trong `Today.test.tsx` của dev (`npm test`). |

## 4. Defect

### M1-D1 — Màn Goals cuộn ngang ở 360 px khi "Why" của goal dài  [Major]
- Bước tái hiện (`npm run build && npm run preview`, viewport 360×740, locale nào cũng vậy):
  1. Mở `http://localhost:4173/#/goals/new`.
  2. Name `Read`, Why = câu bình thường có dấu cách dài 100 ký tự (ví dụ "Be smarter and read more books every day. " lặp rồi cắt 100), Minutes per day `30`, Save goal.
  3. Ở `#/goals` đọc `document.documentElement.scrollWidth` và `clientWidth`.
  - Why 20, 40, 60, 80, 100, 280 ký tự → scrollWidth = 360, 360, 421, 556, 679, 1854 (clientWidth luôn 360). Ngưỡng lỗi khoảng 55 ký tự.
  - Chạy lại bằng test: `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test tests/qc -g "DEFECT PROBE|long unbroken"`.
- Mong đợi: NFR-06 "360–1440 px không có thanh cuộn ngang"; M1-AC12 `scrollWidth <= clientWidth` ở 360×740; DESIGN S2 "why (1 dòng, cắt …)". Why tới 280 ký tự là input hợp lệ theo FR-01.
- Thực tế: hàng goal bị kéo rộng theo độ dài Why (chữ bị cắt cụt ở mép card, không có `…`), trang cuộn ngang, scrollWidth tới 1854 px với why 280 ký tự. Today không bị (không hiện why); note dài ở Today và tên goal 60 ký tự liền nhau không gây lỗi.
- Vị trí nghi ngờ: `src/ui/styles/app.css:852-857` (`.goal-row .why` có `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`) cùng ô lưới cha trong `src/ui/screens/Goals.tsx` (khoảng dòng 96-110: `<div>` bọc `.top` và `.why` là grid item ở layout 1 cột dưới 640 px, `min-width: auto` nên không co dưới độ rộng nội dung).

### M1-D2 — README còn ghi chú Windows về ký tự `%` đã lỗi thời  [Minor]
- Bước tái hiện: đọc `README.md` mục Requirements, callout "Note (Windows): npm cannot run `npm install`, `npm ci` or `npx` inside a folder whose path contains `%` (for example `1%better`)...". Thư mục đã đổi thành `one-percent-better` và mọi lệnh chạy trực tiếp tại root.
- Mong đợi: README chỉ nêu hướng dẫn còn đúng và cần thiết (NFR-09), không nhắc thư mục `1%better` không còn tồn tại.
- Thực tế: callout vẫn có, kèm câu "`npm run …` scripts work from any path" (QC không kiểm chứng được). `docs/handoff/dev-M1.md` mục 8 và OQ-M1-1 cũng còn nhắc workaround `subst` và "chạy AC1 trên bản sao" (QC không sửa handoff, chỉ ghi lại).
- Vị trí: `README.md`, dưới mục "Requirements".

### M1-D3 — Ô số chấp nhận cú pháp số của JavaScript (`1e1`, `0x1E`, `0b11`)  [Minor]
- Bước tái hiện: ở `#/goals/new` nhập Name `T`, "Minutes per day" = `0x1E` (hoặc `1e1`, `0b11`), Save goal.
- Mong đợi: FR-01/FR-07 yêu cầu số nguyên; giá trị không phải số thập phân thông thường bị báo lỗi inline (như `abc`, `12.5`).
- Thực tế: goal được lưu với `targetMinutes` = 30 (từ `0x1E`), 10 (từ `1e1`), 3 (từ `0b11`). `+30` và `30.0` cũng được chấp nhận (vô hại). Cùng cách parse ở ô Minutes của entry và ô Total hours.
- Vị trí nghi ngờ: `src/ui/screens/GoalForm.tsx:55-58` (`parseNumber` dùng `Number(trimmed)`); `src/ui/components/EntryForm.tsx` (`Number(trimmed)` trong `handleSubmit`).

## 5. Kiểm lại defect vòng trước
Không áp dụng (round 1).

## 6. Regression
Không có milestone trước M1. 20 E2E và 131 test Vitest của dev vẫn pass trên bản hiện tại và trên clone sạch.

## 7. Bảo mật
- Secret: `git ls-files` chỉ có `.env.example` (giá trị mặc định, không secret); `.env` nằm trong `.gitignore`; QC không đọc `.env`. Không thấy token/key trong `src`.
- XSS: `rg dangerouslySetInnerHTML src` → 0 kết quả; name/why/note chứa `<img onerror>`, `<script>`, `<svg onload>` hiển thị literal, 0 phần tử nguy hiểm, 0 dialog `alert`. Lint cưỡng chế bằng `no-restricted-syntax`.
- Request ngoài origin: 19 request trong luồng tạo goal, ghi phút, reload, offline, đổi ngôn ngữ (`context.on('request')` gồm service worker) → 0 ngoài `localhost:4173`. Không có `fetch`, `XMLHttpRequest`, `sendBeacon` hay URL `http(s)` trong `src` (chỉ có namespace SVG ở favicon).
- Input: validate ở `domain/goal.ts`, `domain/entry.ts` (zod) và lặp ở service; dữ liệu sai không vào IndexedDB (đọc thẳng DB). Ngoại lệ Minor: M1-D3.
- Injection SQL/command/path: không áp dụng (không backend; M3 sẽ có import file).
- Dependency: `npm audit` → 0 lỗ hổng; version pin chính xác.
- Race: double-click Save ở form goal và form entry chỉ tạo đúng 1 bản ghi.

## 8. Chưa kiểm chứng được (NOT VERIFIED)
1. M1-AC10 phần thủ công "đóng hẳn Chrome rồi mở lại". Thay thế: `launchPersistentContext` đóng/mở lại cùng profile, dữ liệu còn. User tự kiểm: `npm run build && npm run preview`, mở `http://localhost:4173` trong Chrome, tạo goal "Read" và ghi 10 phút, thoát hẳn Chrome (Task Manager không còn tiến trình chrome), mở lại cùng URL, vào Today: dữ liệu còn. Settings → Storage hiện "Protected" khi đã cài app hoặc trình duyệt cấp quyền persist; chưa cài thì "Not protected" là bình thường.
2. M1-AC11 phần thủ công "nút Install, app mở cửa sổ riêng". Thay thế: CDP `Page.getInstallabilityErrors` = `[]` và manifest hợp lệ. User tự kiểm: mở `http://localhost:4173` trong Chrome/Edge desktop sau `npm run preview`, đợi vài giây, tìm icon Install ở thanh địa chỉ (hoặc menu ⋮ → "Install 1% Better per Day"), cài, kiểm app mở cửa sổ riêng không thanh địa chỉ, có icon và tên "1% Better".
3. UpdateToast khi có bản mới (T7, không phải AC): chưa tái hiện luồng service worker "waiting" (cần build 2 phiên bản liên tiếp). Dev có `sw-register.test.ts` trong `npm test`.
4. Safari iOS và Firefox (NFR-06): không có thiết bị/trình duyệt; chỉ kiểm Chromium.
5. Screen reader thật: chỉ kiểm bằng axe và thuộc tính ARIA/`lang`.

## 9. Đề xuất (không chặn)
- Sửa chú thích trong handoff của dev: E2E trên bản sao fail lần đầu vì đường dẫn > 260 ký tự (MAX_PATH), không phải vì Chromium chưa tải xong. README có thể nhắc "clone vào đường dẫn ngắn trên Windows".
- Thêm vào E2E của dev một case why dài (≥ 100 ký tự) ở 360 px (cả `vi-VN`) cho màn Goals và tên goal 60 ký tự để D1 không tái phát. QC đã có test tương ứng.
- Today sort theo `createdAt`: nếu hai goal trùng timestamp (chỉ xảy ra khi clock bị đóng băng như test) thứ tự không xác định; cân nhắc tie-break theo `id` hoặc `name`.
- `EntryService.update/remove` quét toàn bộ entry để tìm theo id (dev đã nêu); thêm `getById` ở M3 là hợp lý.

## Test QC bổ sung (`tests/qc/`)
| File | Nội dung |
| :- | :- |
| `tests/qc/m1-domain.test.ts` | 19 test Vitest: ma trận validate goal/entry (AC3, AC6), `dailyTarget`, `goalStatus`, service trên Dexie (AC8, rollback AC9, UUID AC13), `detectLocale`, `LocaleService.resolve`, formatter en/vi |
| `tests/qc/m1-qc.spec.ts` | Playwright: 14 case form, double-click, XSS, request ngoài origin, layout 360 px, route, ngôn ngữ (gồm bàn phím và kv `fr`), PWA/offline, axe light/dark, focus |
| `tests/qc/m1-qc-flows.spec.ts` | Playwright: luồng S1 qua UI (AC2, AC4-AC9), qua nửa đêm không reload, 2 tab, 1440 px, `vi-VN` (quét vi, axe, 360 px), dialog xoá tên 60 ký tự |

Hiện 2 test QC đỏ có chủ đích (cả hai là M1-D1): `DEFECT PROBE: Goals list with a normal-length "why"` và `long unbroken name / why / note do not cause horizontal scroll`. Chúng sẽ xanh khi D1 được sửa.
