# QC report — M8 round 1

**Verdict:** PASS (không còn Critical/Major; 1 Minor mới M8-D1 vào backlog; phần thiết bị/dịch vụ thật là NOT VERIFIED)
**Ngày:** 2026-10-13  **Commit:** 611bacd (code 1267d77). QC chỉ ghi vào `tests/qc/**` và `docs/qc/**`.

## 1. Tóm tắt
- M8-AC1…AC7 đều PASS có bằng chứng tự chạy (AC7: `test:db` NOT VERIFIED do không Docker, đúng DoD 8). M7-D5 và M7-P1: FIXED.
- `npm run check` x2 (+1 trên clone sạch): exit 0, lint/tsc sạch, Vitest 107 file / 1134 pass (108 / 1160 khi tính thêm test QC M8). Playwright đầy đủ (chromium + cloud, workers 8): 557/557, 557/557, 558/558 (sau test QC cuối). Không flaky.
- Việc đầu tiên: re-target `m7-r1-probe.spec.ts:522` sang `settings.account.localRejected_other` (count 2) và gỡ `test.fail` ở `m7-r2-flagged.spec.ts` sau khi tự xác nhận M7-D5 FIXED (D4 `data-rejected=2`, cảnh báo "will be lost", mô tả Remove không còn "Your account keeps everything").
- Defect mới: M8-D1 (Minor): "Not now" có mốc ở tương lai (đồng hồ máy từng sai) làm banner im lặng hàng chục năm.
- Cần orchestrator/planner quyết (không chặn): OQ-D12 (dev chỉ claim hint khi online, lệch chữ DESIGN F14 "không xét online"); 7 chuỗi dev đề xuất NOT IN DESIGN.

## 2. Môi trường và lệnh đã chạy
Windows 11, Node 22.14, Chromium Playwright, không Docker, mock Supabase; không đọc `.env.local` (máy có file này nên `npm run check` kết thúc bằng bản cloud ON; clone sạch thì cloud OFF).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Check 1, 2 | `npm run check` | exit 0 x2; 107 file / 1134 pass (lần 2: 108 / 1160 sau thêm `m8-r1-copy.test.ts`); build OK, precache 31 entry |
| Clone sạch | `git clone` -> `npm ci` -> `npm run check` | exit 0; 107 / 1134; `npm run build:cloud-e2e` OK |
| Demo mock theo README | trong clone: `npm run mock:supabase` + `npm run preview:cloud-e2e` (200/200), rồi chạy spec `m8-prompts`, `m8-journey`, `m8-r1-ui` từ repo chính (reuse server của clone) | 30/30 pass |
| Playwright 1, 2, 3 | `npm run test:e2e` (8 worker) | 557 / 557 / 558 pass, ~6,0 phút mỗi lần |
| test:db | `npm run test:db` | skipped (không Docker), exit 0 |
| Bench | `npm run bench` | in-memory median 6,5 ms; fake-indexeddb 113,6 ms; pure review 17,7 ms (< 200) |
| Audit / secret | `npm audit` (+`--omit=dev`); git grep service_role / sb_secret_ ngoài docs; `git ls-files ".env*"` | 0 vuln; 0 kết quả; chỉ `.env.cloud-e2e`, `.env.e2e`, `.env.example` (`.env.local` bị ignore) |
| Bundle (gzip -9, entry + modulepreload) | script đo `dist-cloud-e2e/index.html` | index 198,2 + schemas 34,5 + useFormat 6,8 + preload-helper 0,8 + types 0,1 = **240,3 kB (234,7 KiB) <= 250**; `supabase-client-*.js` chunk riêng, không preload |

## 3. Acceptance criteria
| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M8-AC1 | PASS | Dev: 18 test domain + 11 service (hai instance `claimExportHint` -> đúng 1 `true`). QC qua trình duyệt với đồng hồ cố định (`m8-r1-rules.spec.ts`): đúng 7 ngày - 1 s -> ẩn, = 7 ngày -> hiện (0 entry); 9 entry -> ẩn, entry thứ 10 gõ trên Today -> hiện không cần reload, xoá entry đó -> ẩn lại; goal lưu trữ vẫn giữ 10 entry sống (banner hiện ở nhánh "No active goals"), xoá goal -> ẩn; ranh giới năm (2026-12-28 -> 2027-01-03 ẩn, 01-04 hiện); snooze 13 ngày 23 h 59 m 59 s ẩn, 14 ngày hiện, lần "Not now" thứ 3 thì 5 năm sau vẫn ẩn |
| M8-AC2 | PASS | Dev `m8-prompts` xanh. QC: banner là section có aria-label, không role/aria-modal; thứ tự Tab: Google -> Not now -> nút goal đầu; Enter trên "Not now" -> toast + focus h1; BackupBanner ưu tiên đúng; ReminderBanner nằm trên banner đăng nhập, banner nằm trên danh sách goal; bấm Google: banner giữ nguyên ở trạng thái busy ("Signing in…", cả hai nút disabled, không biến mất, quan sát bằng MutationObserver) rồi về `#/today` đã đăng nhập, URL sạch; offline ẩn / online hiện lại; hai tab: Not now ở tab A làm banner tab B biến mất không cần reload, đếm 1 lần; hai tab bấm cùng lúc: không lỗi (đếm 2, xem §9); huỷ ở trang Google: về Today, banner dùng lại được; cloud tắt (chromium, dataset lớn, +1 năm, en và vi): không banner/hint/thẻ Account, kv `loginPrompt` null, 0 request ngoài origin |
| M8-AC3 | PASS | Dev xanh (hint +30 ngày, kv không đổi lần 2, returnTo `#/settings`). QC: Export offline không tiêu lượt, Export online sau đó hiện hint; hint đang hiện rồi mất mạng -> nút disabled + `offlineHint`, có mạng lại -> enabled; hai tab Export cùng lúc -> tổng đúng 1 hint, kv ghi 1 lần; rời Settings rồi quay lại -> hint mất, không lặp trong ngày; Import không claim; expired -> không hint, kv null; chữ nguyên văn en/vi |
| M8-AC4 | PASS | QC e2e en và vi: chưa đăng nhập / đã đăng nhập / expired (A-D27: expired dùng copy như chưa đăng nhập, không banner, không hint) cho Backup desc + import hint, About (`descCloud`/`descSignedIn` + privacy), Storage "Not protected" (stub `storage.persist=false`) có `notProtectedSignIn` + nút "Go to Account" (scroll, focus nút Google, hash không đổi, nút trong viewport); card Account chưa đăng nhập có lời giải thích + nút, không "Not now"; cloud tắt: copy phase 1. Vitest `m8-r1-copy.test.ts`: mọi hàng DESIGN 7.7.4 + 7.7.5 (M6/M7/M8) khớp nguyên văn en/vi, parity khoá |
| M8-AC5 | PASS | `m8-journey` en-US và vi-VN xanh 3 lần (A 1440 / B 360: tạo goal, Today, timer, Day, import, đăng nhập từ banner, B offline -> online, A thấy; Sign out Keep, B xoá goal, A đăng nhập lại; mỗi màn axe, quét vi, không cuộn ngang, 0 pageerror, chỉ hai origin). Chạy lại trên clone sạch: xanh |
| M8-AC6 | PASS | README đối chiếu với code: biến môi trường/giá trị mặc định (`env.ts`), redirect `?auth=callback` không hash, `pages.yml` truyền đúng 2 secret, tên file migration tồn tại, `privacy.html` đã nói tới sync, backoff 30 s -> 900 s, timeout đăng xuất 10 s, bảng U0-U11 khớp TASKS; demo mock chạy được trên clone sạch; handoff có NV-1…NV-8 + bước kiểm tay |
| M8-AC7 | PASS (test:db NOT VERIFIED) | check x2 exit 0; Playwright 557/557 x2 + 558/558 (cả hai project, gồm tests/qc và test QC M7 đã re-target); bundle 240,3 kB <= 250; bench < 200 ms; test:db skipped |

Kiểm thêm: a11y axe (0 serious/critical) + không cuộn ngang + quét vi + nút >= 44 px cho banner (Today) và hint (Settings) ở sáng/tối x en/vi x 360/1440 (16 ca, `m8-r1-ui.spec.ts`); đã xem ảnh 360 px vi tối: icon cùng hàng tiêu đề, hai nút xếp dọc, không tràn. Nguồn `firstDataAt`: import (goal cũ 1 entry -> hiện; mới -> ẩn; entry cũ hơn goal thắng) và DB Dexie v1 nâng cấp (giữ `createdAt` cũ -> hiện không cần dữ liệu mới). kv hỏng (chuỗi, mảng, null, số dạng chuỗi, âm, 2,9, 3, 1e9): không lỗi, kết quả đúng. kv `loginPrompt` sống sót qua Import và Sign out -> Remove, không nằm trong file Export.

## 4. Defect
### M8-D1 — "Not now" có mốc ở tương lai làm im banner hàng chục năm  [Minor]
- Bước tái hiện: đặt kv `loginPrompt` = `{dismissCount: 1, lastDismissedAt: "2099-01-01T00:00:00.000Z", lastExportHintAt: null}` (hoặc bấm "Not now" khi đồng hồ máy sai năm 2099 rồi chỉnh lại giờ), có >= 7 ngày dữ liệu, mở Today năm 2026. Test: `tests/qc/cloud/m8-r1-rules.spec.ts` ("clock skew", đang `test.fail`).
- Mong đợi (A-30/FR-52): ẩn 14 ngày sau "Not now"; mốc vô lý (tương lai) không nên làm im vô hạn.
- Thực tế: banner không hiện (đếm 0) cho tới 2099. Tương tự `lastExportHintAt` ở tương lai chặn hint.
- Vị trí nghi ngờ: `src/domain/login-prompt.ts` `isSnoozed` (hiệu `now - last` âm thì luôn nhỏ hơn 14 ngày) và `shouldShowExportHint`.
- Phân loại: Minor (cần đồng hồ máy từng sai; chỉ mất lời nhắc, không mất dữ liệu; Account card vẫn có nút).

## 5. Kiểm lại defect vòng trước
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M7-D5 (Minor) | FIXED | `m7-r2-flagged.spec.ts` sau khi gỡ `test.fail` và thêm assert: D4 `data-rejected=2`, `data-pending=0`, "2 items on this device could not be uploaded…", không còn "Your account keeps everything", mô tả Remove = `removeDescRejected`, chọn Remove -> "…will be lost. Export a backup first…"; Remove xoá máy, Keep giữ hàng |
| M7-P1 (Minor, mục 9.2) | FIXED (phần key riêng) | Thẻ Account hiện `settings.account.localRejected_other` (count 2) với `data-reason="local"`, không còn câu "items from your account could not be read" (`m7-r1-probe.spec.ts:522` re-target, xanh). Phần "dọn tombstone" và "`check` ra bản cloud ON" vẫn mở (không chặn) |
| Dispute của dev (mục 9 handoff) | Chấp nhận | Đúng yêu cầu key riêng ở QC M7 r2 §9.2 |

## 6. Regression
M1-M7: toàn bộ project chromium (dev + tests/qc) và cloud (dev M6/M7/M8 + QC) xanh 3 lần liên tiếp (557, 557, 558). Build cloud tắt: không Account card/chip/banner, 0 request ngoài origin (QC `m8-r1-cloud-off.spec.ts` en và vi, dev `m6-cloud-off`, `m8-cloud-off`). M3-AC10 (BackupBanner) xanh.

## 7. Bảo mật
Không secret trong repo; chỉ 3 file `.env*` được phép; `npm audit` 0. `loginPrompt` chỉ là kv cục bộ (chuẩn hoá khi đọc, không đồng bộ, không trong backup). Không có đường inject mới (returnTo cố định `#/today` / `#/settings`; chuỗi UI qua i18n). Không đọc `.env.local`. RLS thật vẫn NOT VERIFIED (NV-2).

## 8. Chưa kiểm chứng được (NOT VERIFIED)
| ID | Nội dung | Cách user kiểm |
| :- | :- | :- |
| NV-1 (phần Pages) | Đăng nhập Google thật trên bản GitHub Pages, redirect về đúng màn | Sau U8: mở bản Pages -> Settings -> Sign in with Google (và từ banner Today) |
| NV-2 | Migration, RLS, trigger LWW trên Postgres thật; `test:db` skipped | U10: Table Editor có hàng `user_id`; curl tới `/rest/v1/goals?select=*` với publishable key trả `[]`/lỗi quyền; Gmail khác không thấy dữ liệu |
| NV-3, NV-7 | Đồng bộ hai thiết bị thật (gồm ngôn ngữ + giờ nhắc); độ trễ với 5.449 entry | U10 (2)(5)(6) |
| NV-4 | iOS Safari / PWA đã cài (Web Locks, Notification, OAuth standalone); banner/hint trên 360 px thật với bàn phím ảo | U10 (1) |
| NV-5, NV-6 | Project Free bị tạm dừng rồi khôi phục; phiên thật hết hạn 1 giờ và làm mới | U11, U10 |
| NV-8 | PostgREST thật với id chứa dấu nháy kép hoặc gạch chéo ngược; Firefox/Safari; screen reader thật (banner là vùng "Sign-in suggestion", không ngắt) | Kiểm tay như handoff §6b |

## 9. Đề xuất (không chặn)
1. M8-D1: bỏ qua/kẹp `lastDismissedAt` / `lastExportHintAt` lớn hơn `now`.
2. OQ-D12: dev claim hint chỉ khi online (đúng đề xuất designer nhưng lệch chữ DESIGN F14 "không xét online"); nên cập nhật DESIGN/PRD cho khớp.
3. 7 chuỗi dev đề xuất cho hàng bị cloud từ chối NOT IN DESIGN: không tính defect; designer nên duyệt/chốt.
4. Hai tab cùng bấm "Not now" trong cùng khoảnh khắc tiêu 2 trong 3 lượt (đếm 2); hiếm, chấp nhận được.
5. README bảng Configure còn ghi `VITE_SYNC_INTERVAL_MS` "(used from M7)"; `npm run check` trên máy có `.env.local` ra bản cloud ON (M7-P1 còn mở); backlog dọn tombstone.
6. `Settings.exportBackup` không có `catch` quanh `claimExportHint` (ghi kv lỗi sau khi tải xong sẽ thành unhandled rejection): chỉ đọc code, chưa tái hiện.

## File QC thêm/sửa
`tests/qc/cloud/m8-r1-rules.spec.ts`, `tests/qc/cloud/m8-r1-ui.spec.ts`, `tests/qc/m8-r1-cloud-off.spec.ts`, `tests/qc/m8-r1-copy.test.ts`; sửa `tests/qc/cloud/m7-r1-probe.spec.ts` (re-target), `tests/qc/cloud/m7-r2-flagged.spec.ts` (gỡ `test.fail`, thêm assert).
