# QC report — M6 round 1

**Verdict:** PASS (kèm 1 defect Minor đang mở, các mục NOT VERIFIED cần project/thiết bị thật)
**Ngày:** 2026-10-12  **Commit:** 1926726 (code M6: 934db28). Working tree sạch trước khi QC; QC chỉ thêm file trong `tests/qc/` và `docs/qc/`.

## 1. Tóm tắt

- M6-AC1…AC13: 13/13 PASS có bằng chứng tự chạy; riêng AC10 phần Postgres thật và AC6/AC8 phần Google/phiên thật là NOT VERIFIED (NV-1, NV-2, NV-4, NV-6), đúng danh sách dự kiến của TASKS.
- `npm run check` chạy 3 lần (cộng 1 lần trên clone sạch): đều exit 0, Vitest 786/786 (lần 3 có thêm test QC: 831/831). `npm run test:e2e` chạy 3 lần: 363/363 (nguyên bản dev), 413/413, 415/415 (kèm test QC), 0 flaky.
- Build không có env cloud giống hệt phase 1: không card Account, 0 request ngoài origin, SDK không được yêu cầu, không modulepreload/precache, entry + chunk tĩnh 228,85 kB gzip (≤ 250).
- 1 defect Minor (M6-D1): callback cũ/giả khi đang có phiên hợp lệ làm card chuyển sang "Sign in again". Không chặn milestone. Test QC kèm marker `test.fail` để tự báo khi đã sửa.
- Rà SQL tĩnh đạt; kiểm chứng bổ sung trên PGlite (Postgres 17 WASM, thư mục scratch, không phải Supabase thật): 40/40 hành vi đúng. Vẫn ghi NV-2 cho RLS thật.

## 2. Môi trường và lệnh đã chạy

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Check lần 1 | `npm run check` | exit 0; lint 0 lỗi; tsc sạch; Vitest 79 file / 786 test; build OK |
| Check lần 2 | `npm run check` | exit 0; 786/786 |
| Check lần 3 (sau khi thêm test QC) | `npm run check` | exit 0; 81 file / 831 test |
| Clone sạch | `git clone` → `npm ci` → `npm run check` (scratch) | `npm ci` 587 package, 0 vulnerabilities; check exit 0; 786/786 |
| Playwright lần 1 | `npm run test:e2e` (3 webServer tự dựng) | 363 passed (chromium 348 + cloud 15), exit 0, 2,7 phút |
| Playwright lần 2 | `npm run test:e2e` | 413 passed, exit 0, 2,8 phút |
| Playwright lần 3 | `npm run test:e2e` | 415 passed, exit 0, 3,0 phút (gồm 1 test expected-fail của M6-D1) |
| test:db | `npm run test:db` | `test:db skipped: …` exit 0 (không Docker: đúng kỳ vọng OQ-08) |
| Bench | `npm run bench` | median 3,9 ms (< 200 ms) |
| Audit | `npm audit`, `npm audit --omit=dev` | 0 vulnerabilities |
| Bundle (cloud tắt) | `npm run build` | `index-*.js` 727,22 kB / 221,37 kB gzip + `useFormat` 6,69 + `preload-helper` 0,79 = 228,85 kB gzip; `supabase-client-*.js` 216,37 kB / 55,77 kB gzip (chunk riêng) |
| Chống rò cấu hình | clone scratch + `.env.local` giả, `build:e2e` | 0 kết quả `fake-project` (xem AC3) |
| SQL phụ | PGlite 17 (scratch) áp migration + kịch bản RLS/LWW | 40/40 (xem §7) |

Test QC thêm: `tests/qc/cloud/m6-r1-flow.spec.ts` (26 test), `tests/qc/cloud/m6-r1-ui.spec.ts` (22), `tests/qc/m6-r1-cloud-off.spec.ts` (4, project chromium), `tests/qc/m6-r1-copy.test.ts` (40), `tests/qc/m6-r1-env.test.ts` (5). Qua eslint và `tsc -p tsconfig.node.json`. Project `cloud` khớp sẵn `tests/qc/cloud/**`.

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M6-AC1 | PASS | `package.json` `"@supabase/supabase-js": "2.117.3"` (không `^`/`~`); `npm ls supabase` → `(empty)`; `npm ls @supabase/supabase-js` → 2.117.3; `npm ls -g --depth=0` không có supabase; clone sạch `npm ci` + `check` exit 0; `test:e2e` cả hai project xanh 3 lần. `e2e:install` không chạy lại (Chromium đã có). |
| M6-AC2 | PASS | Dev có 9 test; QC viết oracle riêng `m6-r1-env.test.ts` (5 test): đúng mọi ví dụ AC; thêm từ chối `user:pw@`, có path/query/hash, `localhost.evil.com`, `127.0.0.1.evil.com`, `[::1]`, `ws:`, `file:`, `data:`, giá trị không phải chuỗi, khóa có khoảng trắng/ký tự điều khiển/quá 2000 ký tự; khóa publishable hỏng thì rơi về anon hợp lệ; interval 3600000 hợp lệ, 3600001/60000.5/-1/rỗng → 300000. |
| M6-AC3 | PASS | Project chromium 348 test dev + `tests/qc` M1–M5/final xanh (không sửa assertion). `m6-r1-cloud-off.spec.ts` (QC): 6 màn → 0 request ngoài origin, 0 request chứa `supabase`, không heading Account/nút Google/`account-card`, thứ tự card = Language, Reminders, Backup, Storage, About, 0 key `opb-auth*`, 0 pageerror; `sw.js` và `index.html` không chứa `supabase`; entry bundle không chứa `.supabase.co`, `127.0.0.1:54321`, `sb_publishable_`. Chống rò: repo thật không có `.env.local` và QC không tạo (lệnh của orchestrator); làm trên clone scratch: tạo `.env.local` (`fake-project`), `npm run build:e2e` exit 0 → `grep -rl fake-project dist` = 0, `grep -c supabase-client dist/sw.js` = 0; đối chứng dương: `npm run build` (mode mặc định) cùng `.env.local` → 1 file chứa `fake-project`, `sw.js` precache chunk SDK (cloud bật đúng kỳ vọng). Unit `bootstrap.test.ts` (cloud = null → unavailable, loader không được gọi) nằm trong 786. |
| M6-AC4 | PASS | Probe `createClient` từ `@supabase/supabase-js`: `src/services/`, `src/ui/probe.tsx`, `src/app/`, `src/domain/`, `src/data/`, `src/integration/probe.ts`, `src/test/`, `tests/qc/`, `e2e/` → exit 1; `src/integration/supabase/probe.ts` → exit 0. Import tĩnh `../integration/supabase/supabase-client` ở `src/app` và `src/ui` → 1; `../integration/connectivity` ở `src/services` → 1; M1-AC13 (dexie trong domain) → 1; M1-AC17 (i18next trong services) → 1; `require` SDK ở services → 1; `@supabase/auth-js` ở ui → 1. Lưu ý (không phải defect): `import('@supabase/supabase-js')` động ở `src/ui` → exit 0 (xem §9). |
| M6-AC5 | PASS | Dev: `m6-lazy.spec.ts` (2), service test loader 0/1 lần. QC bổ sung (xanh): đăng nhập → reload → Keep sign-out → reload + 4 màn → 0 request SDK và 0 request tới mock; sự kiện offline/online/visibilitychange khi chưa đăng nhập → 0 request SDK/mock. Số đo: entry 221,37 kB gzip, tổng chunk tĩnh 228,85 kB ≤ 250; SDK 55,77 kB gzip chunk riêng, `index.html` không modulepreload; cloud tắt thì không precache. |
| M6-AC6 | PASS (mock); NV-1, NV-4 | Dev `m6-auth.spec.ts` AC6 xanh 3/3 lần: URL cuối `http://localhost:4174/one-percent-better/#/settings`, 1 exchange, reload không exchange thêm, authorize `code_challenge_method=s256` và `redirect_to=…/?auth=callback`. QC thêm: returnTo `#/goals` lúc callback → URL cuối `#/goals`, màn Goals, toast `Signed in as minh.test@example.com`; `?code=abc#/today` (không có `auth=callback`) → bỏ qua, URL giữ nguyên, 0 exchange; `?auth=callback` không code/error → `AUTH_FAILED`, không trắng trang; có SW kiểm soát trang (đợi `controller`) vòng đăng nhập vẫn chạy; click đúp nút Google → đúng 1 request authorize. |
| M6-AC7 | PASS (mock) | Dev: Cancel, token 500, callback `bogus`, toast `Go to Account`, offline disabled. QC thêm: Cancel rồi thử lại thành công, Alert biến mất; request token bị `abort` → `AUTH_FAILED`, không phiên, kv `sync` null; hostile returnTo (`https://evil.example/`, `#//evil.example/x`, `javascript:alert(1)`, `#/settings<script>`, rỗng) → luôn về `…/#/settings` cùng origin; XSS probe (`error_description=<img onerror>`, `code="><svg onload>`) → không `__xss`, không dialog, không `<img src=x>`; A3: giữ response token → card `signing-in`, `role=status` "Signing you in…", nút `Signing in…` disabled + `aria-busy`, không cuộn ngang, kết thúc `signed-in`. |
| M6-AC8 | PASS (mock); NV-6 | Dev: page mới cùng context, offline reload, hết hạn bằng `page.clock`. QC thêm (đồng hồ thật): `ttl=4`, `refresh=invalid_grant` → card tự chuyển `expired` không cần reload, "Read" còn, kv `sync.account` giữ. Xem M6-D1 về callback cũ khi đang có phiên. |
| M6-AC9 | PASS (mock) | Dev: D4 Keep/Remove/Cancel ở `vi`. QC thêm: Keep và Remove khi offline hoàn tất cục bộ, dialog đóng, `opb-auth` bị xoá, locale giữ; timer đang chạy: Keep → timer còn, Remove → không card timer và kv `activeTimer` null; Remove trên IndexedDB thật: `goals`, `entries` rỗng, kv chỉ còn `locale`/`loginPrompt`; hai tab: đăng xuất ở tab A → tab B tự về `signed-out` (≤ 15 s); Esc đóng D4 không đăng xuất. |
| M6-AC10 | PASS phần tĩnh; NOT VERIFIED Postgres thật (NV-2) | Rà tay `supabase/migrations/20261012000000_cloud_sync.sql` + `cloud-migration.test.ts` (7 test, xanh): RLS bật cho 3 bảng; 9 policy select/insert/update `to authenticated` dùng `(select auth.uid()) = user_id`; không `for delete`, không `to anon`; `revoke all … from anon, authenticated` rồi `grant select, insert, update … to authenticated`; trigger `sync_before_write` (goals, entries) và `settings_before_write`; `settings` không có `last_reminder_date`/`plus_one_shown`/`last_backup_at`/`active_timer`; hàm trigger `set search_path = ''`. `test:db` skipped, exit 0. Bổ sung (không thay NV-2): §7. |
| M6-AC11 | PASS | `m6-r1-copy.test.ts`: cả 36 dòng DESIGN §7 đánh dấu M6 khớp nguyên văn `en.json` và `vi.json`; key set en/vi khớp (trừ `_one` của vi); `settings.about.desc` phase 1 không đổi. Dev: quét vi ở component + E2E. QC E2E: `scanVi` + axe sáng/tối × en/vi cho A1, A4, A5, D4 (Keep, Remove), A10; toast lỗi ở chế độ tối; danh tính dài (email 44 ký tự + tên dài, tên 120 ký tự liền, emoji, thiếu tên → phần local của email, HTML trong tên) ở 360 px en+vi: không cuộn ngang, axe sạch, thoát HTML, chữ cái avatar đúng; D4 vừa viewport 360×740, 1440×900, 640×360 (hàng nút nằm trong viewport, nút ≥ 44 px); Settings 360/768/1440: thứ tự card Language → Account → Reminders → Backup → Storage → About, nút Google và Sign out ≥ 44 px, không cuộn ngang. Đã xem ảnh chụp A1/A4/A5/D4 ở `vi` sáng/tối: khớp DESIGN. |
| M6-AC12 | PASS | Dev: mọi request ∈ {app, mock}, 0 `googleusercontent.com`, 0 `img` trong card, authorize không `scopes`. QC: `git grep -nE "service_role\|sb_secret_" -- . ":!docs"` → 0; `git ls-files ".env*"` = `.env.cloud-e2e`, `.env.e2e`, `.env.example`; `pages.yml` có đúng 2 biến `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` từ `secrets.*`; vệ sinh phiên: access/refresh token và khóa `sb_publishable_mock` không xuất hiện trong console, URL điều hướng, URL request, kv IndexedDB; không cookie; localStorage chỉ có khóa `opb-auth*` (gồm khóa PKCE verifier của SDK); sessionStorage chỉ `opb-auth*`; request tới mock không mang `service_role`/`sb_secret`; production code không `console.*` (trừ `ErrorBoundary` ở DEV). |
| M6-AC13 | PASS | Chromium 348 + `tests/qc` M1–M5 + final xanh 3 lần; `npm run bench` 3,9 ms; README có "Account & sync (optional)" và "Cloud setup (owner)"; handoff có số đo bundle, `test:db` skipped, NV-1/2/4/6 và tên file SQL cho U6. |

## 4. Defect

### M6-D1 — Callback cũ/giả khi đang có phiên hợp lệ làm card chuyển sang "Sign in again"  [Minor]
- Bước tái hiện: đăng nhập (mock) → mở `http://localhost:4174/one-percent-better/?auth=callback&code=already-used-or-bogus` (ví dụ mở lại URL callback từ lịch sử/bookmark, hoặc callback tới từ trình duyệt khác). Quan sát Settings.
- Mong đợi: phiên lưu trên thiết bị vẫn hợp lệ (`localStorage.opb-auth` còn nguyên) nên card nên ở `signed-in` (có thể kèm thông báo lỗi), không bắt đăng nhập lại (FR-40).
- Thực tế: card ở `data-state="expired"` ("Sign in again", kèm `AUTH_FAILED`), không tự hồi phục trong ≥ 5 s quan sát; chỉ reload mới về `signed-in`. Khi M7 có đồng bộ, `expired` sẽ tạm dừng đồng bộ cho tới khi reload.
- Vị trí nghi ngờ: `src/services/auth-service.ts` `completeCallback` (đặt `signing-in` dù đã có phiên) và `runCallback` nhánh catch (`idleState()` trả `expired` vì kv `sync.userId` còn); chạy song song với `verifyStoredSession`.
- Test tái hiện: `tests/qc/cloud/m6-r1-flow.spec.ts` "replaying a stale callback URL…", gắn `test.fail(true, …)` để suite xanh; khi sửa xong Playwright báo "unexpectedly passed", lúc đó gỡ marker.

## 5. Kiểm lại defect vòng trước

Không có (vòng 1).

## 6. Regression

M1–M5: toàn bộ project chromium (dev + `tests/qc` M1–M5 + final-journey + final-nfr) xanh 3/3 lần. Build không env cloud: bundle, SW, request, copy About phase 1 (`settings.about.desc`) không đổi. Khác biệt có chủ đích: link "Privacy policy" ở About cũng hiện khi cloud tắt (deviation D8, yêu cầu orchestrator); `/privacy.html` trả 200.

## 7. Bảo mật

- Secret/`.env`: `git grep` 0 kết quả; repo thật không có `.env.local`; chỉ 3 file `.env*` được phép. Khóa publishable chỉ nằm trong bundle khi build cloud (đúng thiết kế), không log ra console.
- Token: không lọt URL (callback được dọn bằng `replaceState` trước khi tạo router; đã kiểm `page.url()` và `framenavigated`), console, cookie, kv. Khóa localStorage ngoài `opb-auth`: `opb-auth-flows-code-verifier` và `opb-auth-flow-<id>-code-verifier` (verifier PKCE do SDK tạo, dùng một lần) vẫn còn sau khi đăng nhập xong, được xóa khi đăng xuất (xem §9).
- Validate đầu vào: returnTo chỉ nhận `#/…`; tham số callback không bao giờ render HTML; danh tính từ provider được thoát HTML.
- `npm audit`: 0 lỗ hổng (dev + prod).
- SQL tĩnh: đạt toàn bộ AC10. Kiểm chứng bổ sung bằng PGlite (Postgres 17 WASM; giả lập `auth.uid()`, role `anon`/`authenticated`, default privileges kiểu Supabase) trong thư mục scratch: migration áp không lỗi; A thấy 1 hàng, B thấy 0; B update hàng của A → 0 hàng; B insert với `user_id = A` → lưu dưới B, A vẫn chỉ thấy hàng mình; B upsert cùng id không đụng hàng của A; `anon` select/insert (cả 3 bảng) → permission denied; LWW: `updated_at` cũ hơn và bằng → giữ nguyên (`server_updated_at` không đổi), mới hơn → đổi và `server_updated_at` tăng; xóa mềm áp dụng, `DELETE` → permission denied (cả `settings`); update không đổi được `user_id`/`created_at`; check constraint (độ dài tên, `target_minutes`, `end < start`, `target_type`, `minutes`, `source`, id rỗng, `reminder_time = '25:00'`, `locale = 'fr'`, nhóm nửa vời) bị từ chối; `settings` hai nhóm reminder/locale LWW độc lập; 9 policy đều `authenticated`, không `DELETE`/`ALL`; `anon` không có grant, `authenticated` chỉ SELECT/INSERT/UPDATE. 40/40 (một assertion của QC ban đầu báo sai vì chính nó đã tạo hàng `g1` của B ở bước trước; hàng của A không đổi). Đây là bằng chứng phụ, không thay thế NV-2 (PostgREST, GoTrue, JWT thật chưa kiểm).

## 8. Chưa kiểm chứng được (NOT VERIFIED)

| ID | Nội dung | Cách người dùng tự kiểm |
| :- | :- | :- |
| NV-1 | Đăng nhập Google thật qua project `grmcmidzyqwryaangpug`, về `https://minh-lgm.github.io/one-percent-better/` và `http://localhost:5173/`; gồm việc Supabase có khớp `redirect_to=…/?auth=callback` với Redirect URL dạng `…/**` (wildcard có query) | U6 chạy SQL, U7 `.env.local` → `npm run dev` → `#/settings` → Sign in with Google; URL cuối không còn `?auth=callback&code=`; Authentication → Users có user. Nếu bị từ chối redirect, thêm `…/?auth=callback` vào Redirect URLs |
| NV-2 | Migration, RLS, trigger trên Postgres/PostgREST thật (máy không Docker) | U10 (3)(4)(6): Table Editor có `goals`/`entries`/`settings` bật RLS; `curl "<URL>/rest/v1/goals?select=*" -H "apikey: <publishable>"` → `[]` hoặc lỗi quyền; Gmail khác không thấy dữ liệu |
| NV-4 | iOS Safari và PWA đã cài (iOS/Android): code verifier, cửa sổ standalone | U10 (1) |
| NV-6 | Phiên thật hết hạn sau 1 giờ được làm mới; offline lâu rồi mở lại | U10 |
| NV-8 (QC) | Firefox/Safari và trình đọc màn hình thật (axe + bàn phím trong Chromium đã đạt) | Kiểm tay |

## 9. Đề xuất (không chặn)

1. M6-D1: callback thất bại khi đã có phiên hợp lệ không nên đẩy card sang `expired` (về `signed-in` sau `verifyStoredSession`, hoặc không đặt `signing-in` khi đã có phiên).
2. ESLint chỉ chặn import tĩnh `@supabase/*` ngoài `src/integration/supabase/**`; `import('@supabase/supabase-js')` động ở `src/ui` vẫn qua lint (probe exit 0). Cân nhắc rule `ImportExpression`.
3. Khóa PKCE verifier của SDK còn lại trong localStorage sau khi đăng nhập/hủy (xóa khi đăng xuất). Vô hại vì code dùng một lần, nhưng có thể dọn.
4. Build cloud tắt vẫn đưa `supabase-client-*.js` (216 kB) vào `dist/` và lên GitHub Pages dù không ai yêu cầu; không precache, không preload.
5. `public/privacy.html` đã nói dữ liệu được đồng bộ lên Supabase trong khi M6 chưa đồng bộ gì (M7): nếu deploy M6 trước M7, nội dung đi trước tính năng.
6. OQ-M6-1: `settings.about.privacyLink` ngoài DESIGN, designer cần ghi vào §7.7.5.
7. Khi cloud tắt, URL `?auth=callback…` vẫn bị dọn về `#/settings` (vô hại).
