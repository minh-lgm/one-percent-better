# QC report — Final phase 2 (scope: final, round 1)

**Verdict:** PASS (không có Critical/Major mở; không defect mới; các mục cần thiết bị hoặc dịch vụ thật là NOT VERIFIED, xem mục 8)
**Ngày:** 2026-10-13  **Commit:** 7232fa5 (cây làm việc sạch; QC chỉ thêm 2 file trong `tests/qc/`, chưa commit)

## 1. Tóm tắt
- **Cài từ đầu theo README trên 2 clone sạch ở đường dẫn ngắn** (`C:\src\opb-e`, `C:\src\opb-f`): `npm ci`, `npm run e2e:install`, `npm run check` lần đầu đều exit 0 (108 file / **1160 test** pass, `found 0 vulnerabilities`). Clone e: `npm run test:e2e` **558 passed** (6,3 phút). Clone f: thêm stress F-D1 (xoá `node_modules/.vite`, hai `vitest run` song song): cả hai 1160/1160. `npm run preview` trả 200; demo mock theo README mở được card Account và đăng nhập "Minh Test". F-D1 không tái phát. Đã xoá hai clone.
- **Project root:** `npm run check` x2 exit 0 (1160/1160 mỗi lần); Playwright đầy đủ (chromium + cloud, workers 8) x2: **568/568** và **568/568** (7,9 phút mỗi lần, 0 flaky, 0 retry). 568 = 558 cũ + 10 test mới của vòng này.
- **Hành trình end-to-end phase 1 + 2** (`tests/qc/cloud/final2-journey.spec.ts`, en/vi x 360/1440, cloud mock): 4/4 xanh; cloud-off (`final-journey` 4/4 + sweep `final2-cloudoff-nfr` 4/4) giống phase 1.
- **NFR:** bundle entry + modulepreload (JS, gzip -9) **239,7 kB (cloud tắt) / 239,8 kB (cloud bật)** <= 250; `npm audit` 0 (cả `--omit=dev`); không secret; axe sạch toàn màn; không cuộn ngang ở 360/1440; migration v1 -> v2 giữ dữ liệu; brand assets đủ. Rủi ro: biên độ ngân sách mỏng (mục 9, R1).
- Defect mới: **không có** (F2-D không mở). M8-D1 (Minor) vẫn mở như đã biết, test `test.fail` của QC M8 vẫn "fail đúng như dự kiến". Mọi defect đã FIXED (M1…M8, F-D1) không tái phát.
- NOT VERIFIED (cần user): đăng nhập Google thật trên bản Pages, RLS/migration trên Postgres thật, đồng bộ hai thiết bị thật, iOS/Android, phiên 1 giờ, project Free bị tạm dừng, Firefox/Safari, screen reader, và các phần thủ công của phase 1 (notification thật, .ics, hộp Save/Open, Install). Xem mục 8.

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2, không Docker. Không đọc `.env.local`. Máy này có `.env.local` nên `npm run check`/`npm run build` ở root ra bản **cloud bật** (precache 31 entry); clone sạch không có file đó nên ra bản cloud tắt (precache 30 entry).

### 2.1 Cài đặt từ đầu (clone sạch, `git clone` từ project root, commit 7232fa5)
| Bước | Clone e (`C:\src\opb-e`) | Clone f (`C:\src\opb-f`) |
| :- | :- | :- |
| `git clone` | 2 s | 1 s |
| `npm ci` | exit 0, 33 s, 587 package, 0 vulnerabilities | exit 0, 18 s (cache npm đã nóng), 0 vulnerabilities |
| `npm run e2e:install` | exit 0, 33 s | exit 0, 33 s |
| `npm run check` (lần đầu) | **exit 0, 178 s**; Vitest 108 file / 1160 pass; build OK; precache 30 entry | **exit 0, 174 s**; 108 / 1160; precache 30 entry |
| `npm run test:e2e` | exit 0, **558 passed, 6,3 phút** | không chạy (theo yêu cầu: một clone) |
| `npm run build` rồi `npm run preview` | build 5 s; `curl http://localhost:4173/` = **200** sau 1 s; `manifest.webmanifest` và `sw.js` 200 | — |
| Demo mock (README) | `npm run build:cloud-e2e` 4 s, `npm run mock:supabase` (health 200), `npm run preview:cloud-e2e` (200); script Playwright: `#/settings` thẻ Account `signed-out` -> Sign in with Google -> "Minh Test" -> `signed-in`, `minh.test@example.com`, URL `.../one-percent-better/#/settings`, 0 pageerror | — |
| Stress cache nguội | — | xoá `node_modules/.vite`, `.vite-temp`, `.cache`; hai `npx vitest run` cùng lúc: cả hai exit 0, 1160/1160, 99 s |
| Dọn | `C:\src\opb-e`, `C:\src\opb-f` và log đã xoá; `C:\src` trống; không còn tiến trình nghe cổng 4173/4174/54321; không cài global | |

README khớp với thực tế: không bước nào sai hay thiếu (Node >= 22.14, `.npmrc` `legacy-peer-deps`, short path, các lệnh, demo mock). Không có defect tài liệu mới (chỉ một câu cũ nhỏ, xem backlog M8-P1).

### 2.2 Project root
| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Check 1 | `npm run check` | exit 0, 79 s; lint 0, tsc 0, Vitest 108 file / 1160 pass, build OK, precache 31 |
| Check 2 | `npm run check` | exit 0, 75 s; như trên |
| Playwright 1 | `npm run test:e2e` (8 worker; chromium + cloud + mock Supabase) | exit 0, **568 passed**, 7,9 phút |
| Playwright 2 | `npm run test:e2e` | exit 0, **568 passed**, 7,9 phút |
| Test mới | `final2-journey.spec.ts` (4), `final2-cloudoff-nfr.spec.ts` (6) | lần đầu journey đỏ do **lỗi của chính test**: console `404` từ `http://127.0.0.1:54321/favicon.ico` (trang chọn tài khoản của mock không có favicon, không phải lỗi app); đã lọc đúng nguồn đó, sau đó xanh ở lần chạy riêng và trong cả 2 lần full |
| Audit | `npm audit`, `npm audit --omit=dev` | `found 0 vulnerabilities` cả hai |
| `test:db` | không chạy được (không Docker; script in "skipped", exit 0) | NOT VERIFIED (NV-2) |

## 3. Acceptance criteria (M1–M8, 109 AC)
Cách làm lại hôm nay: Vitest 1160 (root x2, clone x2, stress x2), Playwright 568 x 2 (+558 trên clone e), cộng hành trình `final2-journey` và `final2-cloudoff-nfr`. Cột "Bằng chứng" nêu report milestone gốc (chi tiết từng lệnh nằm ở đó) và bằng chứng chạy lại hôm nay. Không dòng nào đổi so với report milestone.

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M1-AC1 | PASS | Mục 2.1: `npm ci`, `e2e:install`, `check`, `test:e2e` exit 0 trên 2 clone sạch (F-D1 đã FIXED từ final r2, nay giữ); `engines` >= 22.14 khớp README |
| M1-AC2 … AC9 | PASS | `e2e/m1-goals`, `m1-today`, `tests/qc/m1-*`, domain/service test; xanh 2/2 lần root + clone; tạo/ghi/sửa/xoá lặp lại trong `final-journey` và `final2-journey` (4 cấu hình mỗi cái) |
| M1-AC10 | PASS (tự động) / NOT VERIFIED (thoát hẳn Chrome) | reload/context mới/import xanh; bước thủ công mục 8 (V1) |
| M1-AC11 | PASS (tự động) / NOT VERIFIED (nút Install) | `m1-pwa`, `m7-r1-brand`; manifest + SW + offline 7 route (journey cloud-off) và 5 route (journey cloud-on, offline signed-out) |
| M1-AC12 … AC18 | PASS | 0 request ngoài origin (mọi spec + sweep + NFR), XSS literal, axe, không cuộn ngang, lint tách lớp, i18n parity + quét vi (journey vi-VN, sweep vi-VN) |
| M2-AC1 … AC5, AC7 | PASS | `m2-timer`, `m2-r2*`; timer qua reload + Stop/Save trong cả hai journey (en/vi x 360/1440) |
| M2-AC6 | PASS (tự động) / NOT VERIFIED (hộp xin quyền thật, popup giờ) | `m2-reminder`; journey bật nhắc; V2 |
| M2-AC8, AC9, AC11 | PASS (tự động) / NOT VERIFIED (notification thật, bấm notification, nhập .ics vào lịch thật) | đúng 1 notification, `lang` = ngôn ngữ UI, body có tên goal (journey 8/8 cấu hình); V3, V4 |
| M2-AC10, AC12, AC13 | PASS | banner nhắc trong journey; axe dialog Stop; `m2-i18n` |
| M3-AC1 … AC5, AC8 … AC15 | PASS | `m3-*`, `tests/qc/m3-r1*`; journey: export `1percent-better-backup-2026-10-09.json` (schemaVersion 1, 2 goal, 4 entry, không `locale`), xoá hết, import, khôi phục (cả cloud-off lẫn cloud-on signed-out) |
| M3-AC6, AC7 | PASS (tự động) / NOT VERIFIED (hộp Save/Open của OS, trình duyệt khác) | V5 |
| M4-AC1 … AC8, AC10, AC11 | PASS | `m4-*`, `tests/qc/m4-r*`, `m5-r1-sweep`; heatmap ô 10-08 có màu, streak 2 trong journey |
| M4-AC9 | PASS | `bench` nằm trong Vitest; `final-nfr` và `final2-cloudoff-nfr`: Today không tải Recharts, Review mới tải; bundle mục 7 |
| M5-AC1 … AC8, AC11 … AC13 | PASS | `m5-*`, journey: headline `+2.0%` / `+2,0%`, 2 line, history 3, archive đi qua export/import, offline |
| M5-AC9 | NOT VERIFIED | Firefox, Safari iOS, Chrome Android (V6) |
| M5-AC10 | PASS | Làm theo README trên 2 clone sạch (mục 2.1) |
| M6-AC1 … AC5, AC11 … AC13 | PASS | `m6-*` dev + QC; clone sạch `check`; SDK lazy: signed-out cloud-on không chạm mock/SDK (journey + NFR); lint Supabase; copy DESIGN 7.7 khớp (`m6-r1-copy`) |
| M6-AC6 … AC9 | PASS (mock) / NOT VERIFIED NV-1, NV-4, NV-6 | `m6-auth`, `m6-r1-flow`; đăng nhập/huỷ/offline/Keep/Remove lặp lại trong journey; Google thật: user đã xác nhận trên localhost:5173 (STATUS 2026-10-12), bản Pages chưa (V7) |
| M6-AC10 | PASS (tĩnh) / NOT VERIFIED (Postgres thật, NV-2) | `cloud-migration.test.ts` trong Vitest 1160; V8 |
| M7-AC1, AC2 | PASS | `m7-migration`, `m7-r1-migration` (v1 sang v2 giữ goal, entry, settings, timer, locale), soft-delete; xanh 2/2 |
| M7-AC3, AC4, AC6, AC7, AC8 … AC13, AC15 … AC18 | PASS | `e2e/cloud/m7-*`, `tests/qc/cloud/m7-r*`; journey: merge lần đầu (2 goal, 5 entry), thiết bị B, ngôn ngữ + giờ nhắc theo tài khoản, xoá lan truyền (goal + entry), Sign out Keep/Remove; `m8-journey` phủ vào lại cùng tài khoản không hỏi D5 |
| M7-AC5, AC19 | PASS (Fake + mock) / NOT VERIFIED (Supabase local, NV-2) | contract trong Vitest; V8 |
| M7-AC14 | PASS (mock) / NOT VERIFIED (độ trễ thật, NV-7) | `m7-import-perf` 5.449 entry xanh; V9 |
| M8-AC1 … AC4 | PASS | `m8-prompts`, `tests/qc/cloud/m8-r1-rules`, `m8-r1-ui`, `m8-r1-copy.test`; journey: không banner khi mới có 4 entry/0 ngày, banner hiện sau 8 ngày, đăng nhập từ banner, hint sau Export (signed out, online), cloud-off không có gì trong sweep 6 route x 4 cấu hình |
| M8-AC5 | PASS | `m8-journey` en/vi + `final2-journey` 4 cấu hình |
| M8-AC6 | PASS | README khớp thực tế (mục 2.1); demo mock chạy được |
| M8-AC7 | PASS (test:db NOT VERIFIED) | check x2, Playwright 568 x 2, bundle <= 250 kB (mục 7) |

Tổng: 109 AC; 0 FAIL. AC có phần NOT VERIFIED (phần đó không tính PASS): M1-AC10/11, M2-AC6/8/9/11, M3-AC6/7, M5-AC9, M6-AC6…AC10, M7-AC5/14/19. NV-1…NV-8 của TASKS giữ nguyên NOT VERIFIED.

## 4. Defect
Không có defect mới trong vòng này (không F2-D). Lưu ý: lần đầu `final2-journey` đỏ vì lỗi của test QC (404 favicon của trang mock), không phải của app; đã sửa test.

## 5. Kiểm lại defect các vòng trước (không tái phát)
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| F-D1 (Major, Vitest cache lạnh) | FIXED, giữ | 2 clone cache nguội (`check` lần đầu 178 s / 174 s) + 2 vitest song song cache nguội: tất cả xanh 1160/1160 |
| M1-D1…D3, M2-D1…D4, M3-D1…D4, M4-D1…D4, M5-D1…D3, M4-D5 | FIXED, giữ | `tests/qc/m1-r2`, `m2-*`, `m3-r1*`, `m4-r*`, `m5-r*` xanh 3 lần (clone e, root x2) |
| M6-D1 | FIXED, giữ | `m6-r1-flow`, `m7-r2-flagged` xanh (callback giả khi đang có phiên vẫn signed-in) |
| M7-D1 (Major id dài), M7-D2 (Major đổi tài khoản sau hết hạn), M7-D3, M7-D4 | FIXED, giữ | `m7-r2-ids`, `m7-r2-account`, `m7-r2-flagged`, `m7-r1-ui` xanh |
| M7-D5, M7-P1 (key riêng hàng bị từ chối) | FIXED, giữ | `m7-r2-flagged`, `m7-r1-probe` (đã re-target) xanh |
| M8-D1 (Minor) | **VẪN MỞ** | `src/domain/login-prompt.ts` dòng 64-69, hàm `isSnoozed`, không xử lý mốc ở tương lai; `tests/qc/cloud/m8-r1-rules.spec.ts` có `test.fail`, vẫn fail đúng dự kiến. Minor, vào backlog |

## 6. Hành trình end-to-end phase 1 + 2
Spec mới: `tests/qc/cloud/final2-journey.spec.ts` (cloud on, mock Supabase, fixed clock). A = cấu hình đang chạy, B = chiều rộng còn lại (A 360 thì B 1440, và ngược lại).
1. Phase 1 chưa đăng nhập (cloud on): lần mở đầu (thuộc tính lang của html theo trình duyệt, empty state), tạo 2 goal (daily + total 100 h = 17 phút/ngày), ghi tay 20 + 10, timer 10 phút qua reload, Stop/Save (`30/30`), bật nhắc nhở, lúc 20:01 **đúng 1 notification** (lang đúng ngôn ngữ, body có "Spanish") + banner, ghi bù hôm qua, Review (ô heatmap có màu, streak 2, chart), Goal detail (`+2.0%` / `+2,0%`, 2 line, history 3), archive, Export (đúng tên file, schemaVersion 1, 2 goal, 4 entry) và **hint đăng nhập sau Export hiện**, xoá hết, Import, khôi phục (cùng id), offline (5 route reload từ precache, nút Google disabled, ghi tay 35/30).
2. Trong toàn bộ bước trên: **0 request tới mock và 0 request chunk SDK** (người dùng chưa bấm Sign in).
3. Phase 2: sau 8 ngày banner "Keep your progress safe" hiện (không hiện trước đó); đăng nhập từ banner, về Today, banner biến mất, có toast, chip `synced`; cloud có đúng 2 goal + 5 entry. Thiết bị B đăng nhập, thấy 2 goal, history 4 entry, nhắc nhở đã bật. A đổi ngôn ngữ + giờ nhắc 07:30, B Sync now: lang của html đổi, giờ 07:30. A xoá goal Spanish, cloud còn 1 goal / 4 entry; B Sync now: Spanish biến mất. A Sign out **Keep** (dữ liệu còn 1 goal / 4 entry, không còn chip). B Sign out **Remove** (thiết bị trống, cloud vẫn 1 goal).
4. Mỗi bước: axe 0 serious/critical, không cuộn ngang (scrollWidth không vượt clientWidth), quét vi, 0 pageerror, 0 console error của app, 0 phản hồi HTTP từ 400 trở lên (trừ favicon của mock), chỉ hai origin (app + mock).
5. Cloud-off giống phase 1: `final-journey` 4/4 (cloud tắt, cổng 4173) và sweep `final2-cloudoff-nfr`: sample-backup + đồng hồ +30 ngày, 6 route x 4 cấu hình: không Account card, chip, banner, hint; Settings không nhắc Google/Sign in; Export không hint; 0 request ngoài origin; axe + vi + cuộn ngang sạch.

Kết quả: 4/4 xanh (43 đến 44 s mỗi cấu hình khi chạy riêng), xanh trong cả hai lần full.

## 7. NFR
| NFR | Kết quả | Bằng chứng |
| :- | :- | :- |
| NFR-03 bundle (JS entry + modulepreload, gzip -9) | **PASS** 239,7 kB (cloud tắt) / 239,8 kB (cloud bật), ngưỡng 250 | `final2-cloudoff-nfr`: index 197,7 + schemas 34,3 + useFormat 6,7 + preload-helper 0,8 + types 0,1. `vite build` in 242,2 kB (gzip mặc định của Vite: 199,95 + 34,62 + 6,77 + 0,79 + 0,10). Thêm CSS 7,0 kB: 246,7 kB. Tải lạnh `#/today` gồm cả html + css: 247,3 kB (cloud tắt) / 247,4 kB (cloud bật), cũng trong 250 (`final-nfr` giữ ngưỡng 250.000 byte). Recharts (97 kB) và SDK Supabase (58,0 kB gzip, chunk riêng) **không** được tải lúc mở Today |
| NFR-01 riêng tư | PASS | Cloud tắt: 0 request ngoài origin (4 hành trình + sweep 4 cấu hình + NFR). Cloud bật chưa đăng nhập: 0 request tới mock và 0 chunk SDK (journey 4 cấu hình + NFR). Đăng nhập: chỉ app + `127.0.0.1:54321` (mock); `dist-cloud-e2e` chỉ chứa host `127.0.0.1:54321`; `dist` cloud-off không chứa project URL hay publishable key (chunk SDK có chuỗi `supabase.co` của chính thư viện) |
| NFR-02 offline | PASS | Cloud-off: 7 route reload offline + ghi tay; cloud-on signed-out: 5 route + ghi tay + nút Google disabled |
| NFR-05 bảo mật | PASS | Không `dangerouslySetInnerHTML` trong `src`; `npm audit` 0; `git grep` service_role, sb_secret_, GOCSPX-, AIza, JWT ngoài `docs` = 0; `git ls-files ".env*"` = `.env.cloud-e2e`, `.env.e2e`, `.env.example` (`.env.local` bị ignore, QC không đọc); project ref `grmcmidzyqwryaangpug` chỉ là định danh công khai trong docs và privacy; không có publishable key trong git |
| NFR-06/08 a11y, responsive | PASS | axe 0 serious/critical mọi bước hai journey + sweep; 360 và 1440 không cuộn ngang; vi không rò chuỗi en |
| NFR-14 migration v1 sang v2 | PASS | `m7-migration`, `m7-r1-migration` (spec + test) xanh x3 |
| Brand assets | PASS | Manifest: 3 icon (192, 512, maskable-512); `index.html`: favicon svg + png 32 + apple-touch; tất cả nằm trong precache của `sw.js` (`dist` clone e); `m7-r1-brand`, `m7-r2-brand` xanh x3 |
| NFR-09/17 vận hành | PASS | mục 2.1; mọi test tự động chạy không cần project Supabase thật |
| RLS/Postgres thật (NFR-05, NFR-16 phần cloud) | NOT VERIFIED | NV-2 |

## 8. Chưa kiểm chứng được (NOT VERIFIED) — danh sách gọn cho user (U10)
Môi trường tự động chỉ có Chromium (Playwright) và mock Supabase. AC liên quan không tính PASS cho phần này; orchestrator cần hỏi user.
Chuẩn bị bản thật: user làm **U0** (Export backup từ app đang dùng), **U8** (secret `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` trong GitHub Actions rồi push hoặc re-run workflow), rồi **U10**.

| ID | Nội dung | Cách kiểm |
| :- | :- | :- |
| V7 / NV-1, NV-4 | Đăng nhập Google thật trên bản Pages, về đúng màn; iOS Safari, PWA đã cài | Mở `https://minh-lgm.github.io/one-percent-better/`, Settings, Sign in with Google (và từ banner Today); URL cuối không còn `?auth=callback&code=`; Supabase, Authentication, Users có user của anh. Lặp lại trên điện thoại (Chrome Android; Safari iOS, cả khi đã cài PWA) |
| V8 / NV-2 | Migration, RLS, trigger LWW trên Postgres thật (`test:db` skipped, không Docker) | U10 (3): Table Editor có hàng `user_id` của anh ở `goals`, `entries`, `settings`; (4): curl tới `PROJECT_URL/rest/v1/goals?select=*` với header apikey là publishable key, kết quả phải là `[]` hoặc lỗi quyền; (6): đăng nhập bằng Gmail khác không thấy dữ liệu; thử một goal id 70 ký tự bằng SQL để xem mã lỗi thật |
| NV-3 | Đồng bộ hai thiết bị thật, gồm ngôn ngữ + giờ nhắc | U10 (2)(5)(6): ghi entry trên điện thoại, laptop Sync now thấy; xoá goal ở một máy thì máy kia mất; tắt mạng điện thoại, ghi entry, bật lại tự đồng bộ; đổi ngôn ngữ hoặc giờ nhắc ở một máy, Sync now ở máy kia |
| NV-5 | Project Free bị tạm dừng rồi khôi phục | U11: khi app báo không tới được cloud, vào Dashboard, Restore project, bấm Sync now |
| NV-6 | Phiên thật hết hạn sau 1 giờ được làm mới; offline lâu rồi mở lại | Đăng nhập, để tab hơn 1 giờ, thao tác, chip phải về Synced; hoặc tắt mạng nhiều giờ rồi mở lại |
| V9 / NV-7 | Độ trễ và giới hạn tốc độ thật khi đẩy khoảng 5.500 entry (mock 2,46 s) | Import `e2e/fixtures/large-backup.json` rồi đăng nhập trên bản thật; chip về Synced trong thời gian chấp nhận được |
| NV-8 | PostgREST thật với id chứa dấu nháy kép hoặc gạch chéo ngược; Firefox/Safari; screen reader thật | Import file có id chứa dấu nháy kép, đăng nhập, xem Table Editor; NVDA/VoiceOver: banner đăng nhập không ngắt, chip chỉ đọc lỗi và offline |
| V1 | Cài app và thoát hẳn Chrome (M1-AC10/11) | Chrome/Edge: Install ở thanh địa chỉ, ghi 10 phút, thoát hẳn Chrome, mở lại: dữ liệu còn; Settings, Storage hiện Protected |
| V2 | Hộp xin quyền Notification thật + popup chọn giờ (M2-AC6) | Settings bật Daily reminder: Allow thì chip Allowed; Block thì Blocked và banner vẫn hiện; chọn 07:30, reload vẫn 07:30 |
| V3 | Notification thật và bấm vào (M2-AC8/9) | Đặt giờ bằng giờ hiện tại + 1 phút: đúng 1 notification, bấm mở Today; không có cái thứ hai trong ngày |
| V4 | Nhập `.ics` vào lịch thật (M2-AC11) | Settings, Add reminder to calendar (.ics), mở bằng Google/Outlook/Apple Calendar: sự kiện lặp hằng ngày từ ngày mai, nhắc lúc bắt đầu |
| V5 | Hộp Save/Open của hệ điều hành (M3-AC6/7) | Export ra Downloads; Import đúng file ở profile khác: 5 goals, 23 entries với fixture mẫu; thử file lưu từ Notepad (BOM) |
| V6 | Firefox, Safari iOS 16.4 trở lên, Chrome Android qua HTTPS (M5-AC9) | Tạo goal, ghi entry, reload, Review, Archive, Export/Import, bấm đúp Start timer, bộ chọn giờ gốc |
| V10 | Chất lượng bản dịch tiếng Việt (người bản ngữ), UpdateToast bản mới, hết quota IndexedDB thật, chữ phóng 200 %; bàn phím ảo trên điện thoại thật với banner/hint 360 px (M8) | Đọc `src/i18n/resources/vi.json`; các mục còn lại kiểm tay (mở Today trên điện thoại với dữ liệu từ 7 ngày trở lên, bấm Not now hoặc Google không bị che) |

## 9. Đề xuất và backlog (không chặn)
**Rủi ro mới (R1):** ngân sách NFR-03 còn rất mỏng nếu tính cả html + css: tải lạnh Today **247,3 kB** (ngưỡng 250.000 byte của `final-nfr`), chỉ còn khoảng 2,6 kB; riêng JS entry + preload còn khoảng 10 kB (239,7 kB). Thêm vài tính năng nữa sẽ làm `final-nfr` đỏ; nên tách thêm `schemas` (zod 34 kB) hoặc cân nhắc lại ngưỡng khi có tính năng mới.

**Backlog Minor / đề xuất (gộp từ STATUS và các report):**
| ID | Mô tả |
| :- | :- |
| M8-D1 | Mốc `lastDismissedAt` và `lastExportHintAt` ở tương lai làm banner/hint im tới khi đồng hồ qua mốc (`login-prompt.ts`, `isSnoozed`, `shouldShowExportHint`): kẹp mốc lớn hơn now. Test QC `test.fail` đang chờ fix |
| M8-P1 | OQ-D12 (hint Export chỉ khi online): cập nhật DESIGN F14 và PRD cho khớp; README bảng Configure còn ghi used from M7 ở `VITE_SYNC_INTERVAL_MS`; `exportBackup` không catch quanh `claimExportHint`; hai tab cùng bấm Not now tiêu 2 trong 3 lượt |
| M7-P1 (phần mở) | Dọn tombstone đã đồng bộ; `npm run check` trên máy có `.env.local` ra bản cloud ON (README nên nói rõ, hoặc `check` dùng mode cloud-off); 7 chuỗi NOT IN DESIGN cho hàng bị từ chối: designer chốt |
| M6-P1 | DESIGN §7.7.5 thêm key `settings.about.privacyLink`; ESLint chưa chặn import động của `@supabase/*` trong `src/ui`; khoá PKCE verifier còn trong localStorage tới khi sign-out; bản cloud-off vẫn chứa chunk SDK không dùng (`dist/assets/supabase-client-*.js`, 223 kB raw) lên Pages |
| M3-P1 | `exportBackup` thiếu `catch`; thêm assertion E2E cho dòng why và số từ 1000 trở lên |
| M4-D5, M4-P1 | `m3-r1-domain.test.ts` còn ngưỡng wall-clock 15 s; DESIGN §6 nói heatmap vừa ở 1024 px trở lên nhưng 1024 đến 1191 px vẫn cuộn trong hộp; chưa có nhãn giá trị trên cột chart; thẻ Progress đứng riêng hàng ở 360 px |
| M5-P1 | Trục Y curve hiện `+0.0%` (mockup `+0%`); `focusHeading` dùng `requestAnimationFrame`; lỗi import vượt giới hạn dùng chung `IMPORT_INVALID_SCHEMA` (nên có câu riêng); kiểm entry sau hôm nay khi import dùng ngày máy nhập (có thể từ chối nhầm backup múi giờ đi trước) |
| M1-P3 | `docs/handoff/dev-M1.md` còn nhắc thư mục cũ `1%better` (đã là ghi chú lịch sử) |
| Test | Fallback Suspense của hai chart chưa có unit test; Vitest setup nạp Recharts cho mọi file jsdom; hai tab cùng ghi tay cùng goal/ngày có thể vượt 1440 phút (ARCH §10) |
| Tài liệu | DESIGN `empty.day.noGoals` có dấu chấm cuối còn `en.json` không có; ghi nhận A-24 (gộp hai thiết bị có thể vượt ràng buộc nhập tay) |
| Đã quyết định (không phải defect) | SW precache sẵn chunk Recharts sau khi cài (STATUS 2026-10-10); D7 vào lại cùng tài khoản không hỏi D5 (STATUS 2026-10-12) |

## File QC thêm trong vòng này
- `tests/qc/cloud/final2-journey.spec.ts` (4 test, project `cloud`)
- `tests/qc/final2-cloudoff-nfr.spec.ts` (6 test, project `chromium`: sweep cloud-off 4 cấu hình + đo bundle hai bản build)

Chưa commit (QC không commit); orchestrator commit cùng report.
