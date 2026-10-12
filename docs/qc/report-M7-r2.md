# QC report — M7 round 2

> Ghi chú của orchestrator: nội dung dưới đây do agent `qc` viết và trả về dạng text (Write tool của subagent bị harness từ chối ghi file report). Orchestrator chép nguyên văn vào file này ngày 2026-10-13, không sửa nội dung.

**Verdict:** PASS (no Critical/Major open; 1 new Minor M7-D5 to backlog; U10 NOT VERIFIED)
**Ngày:** 2026-10-12  **Commit:** eac8890 (code fix 9110bda). Working tree clean before QC; QC only touched tests/qc and docs/qc.

## 1. Tóm tắt
- M7-D1, D2 (Major) và D3, D4 (Minor): cả 4 FIXED, kiểm độc lập theo bước tái hiện round 1 + biến thể mới. Không REGRESSED.
- `npm run check` x2: exit 0, lint/tsc sạch, Vitest 101 file / 1083 test xanh 100% (không còn `it.fails`), build OK. Playwright đầy đủ (chromium + cloud, workers 8): 495/495, 495/495, rồi 502/502 sau khi thêm spec QC r2 (gồm 1 expected-fail của D5). Không flaky.
- Mới: M7-D5 (Minor): Sign out -> Remove xoá cả hàng bị cloud từ chối (`dirty = 2`) không cảnh báo, trong khi D4 viết "Your account keeps everything". Điều kiện hẹp (id > 64 chỉ đến từ file backup viết tay phase 1), người dùng tự chọn Remove, Export vẫn cứu được; xếp Minor, nhưng nếu muốn "không mất dữ liệu im lặng" thì coi là Major.
- Regression M7-AC1..19 và M1-M6 xanh; AC5, AC19 chỉ PASS với Fake + mock (Postgres thật NOT VERIFIED, NV-2).
- Brand: nav chữ "1% Better per Day" + logo, tên truy cập đúng, không tràn sidebar; 360 px không cuộn ngang (Today/Goals/Settings, sáng/tối).

## 2. Môi trường và lệnh
Windows 11, Node 22.14, Chromium Playwright (PLAYWRIGHT_BROWSERS_PATH=0), không Docker, mock Supabase; không đọc `.env.local`.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Check 1, 2 | `npm run check` | exit 0; 101 file / 1083 pass; build OK, precache 31 entry (1774,70 KiB) |
| Lint, tsc, Vitest sau test cuối | `npm run lint`, `tsc -b --noEmit`, `npm test` | sạch; 1083 pass |
| Playwright 1, 2 | `npm run test:e2e` (8 worker) | 495/495 mỗi lần, ~5,7-5,8 phút |
| Playwright 3 (sau spec QC r2) | `npm run test:e2e` | 502/502 (gồm 1 test.fail đúng kỳ vọng D5) |
| Flake m1-qc-flows AC9 | `--repeat-each=12` | 120/120 |
| test:db | `npm run test:db` | skipped (không Docker), exit 0 |
| Audit / secret | `npm audit` (+`--omit=dev`); `git grep service_role\|sb_secret_`; `git ls-files ".env*"` | 0 vuln; 0 kết quả; chỉ .env.cloud-e2e, .env.e2e, .env.example |
| Bundle gzip -9 | script đo dist-cloud-e2e / dist | cloud 232,48 KiB (≈238,1 kB); cloud tắt 232,42 KiB; SDK chunk riêng; ≤ 250 |
| Bench | `npm run bench` | in-memory median 6,1 ms (< 200) |

## 3. Acceptance criteria
| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M7-AC1 | PASS | dev migration-v2 + QC m7-r1-migration (6 + 2) xanh |
| AC2 | PASS | dev soft-delete; 12 test QC re-target xanh; AC9 delete 120/120 |
| AC3, AC4, AC6, AC9, AC10 | PASS | dev + oracle QC 54 test + converge hai thiết bị xanh |
| AC5, AC19 | PASS (Fake + mock) / NOT VERIFIED (Supabase local, NV-2) | contract Fake/mock xanh (có test `rejected` mới); QC m7-r2-split |
| AC7 | PASS | D5 sau reload, Sign out Keep -> u2, và biến thể phiên hết hạn -> tài khoản khác nay PASS (D2) |
| AC8 | PASS | chip mọi trạng thái; auto-retry thật 32349 ms; 401 không bão |
| AC11 | PASS | import khi đăng nhập (online/offline) |
| AC12 | PASS (kèm M7-D5 Minor) | ma trận Sign out xanh; ngoại lệ D5 |
| AC13 | PASS | hàng cloud sai schema bị bỏ, SYNC_REMOTE_INVALID, 0 pageerror; id dài không chặn lô |
| AC14 | PASS | 5.449 entry lên 2,46 s (13 upsert, lô <= 500), thiết bị B kéo 1,45 s; bundle 232,48 KiB |
| AC15 | PASS | 6 cấu hình x sáng/tối x en/vi: axe 0, không cuộn ngang, quét vi 0; D3 hết ngoại lệ |
| AC16 | PASS (test:db NOT VERIFIED) | 495/495 x2, 502/502 |
| AC17, AC18 | PASS | dev + QC (prefsSync, ngôn ngữ từ cloud không reload) |

## 4. Defect
### M7-D5 — Sign out -> "Remove data from this device" xoá cả hàng `dirty = 2` không cảnh báo [Minor]
- Tái hiện: ghi thẳng IndexedDB 1 goal + 1 entry id 70 ký tự (dữ liệu phase 1 từ backup tay; tự động: tests/qc/cloud/m7-r2-flagged.spec.ts test 2, đang `test.fail`). Đăng nhập Minh Test -> Synced (có dòng remote-invalid, pending 0). Settings -> Sign out -> chọn "Remove data from this device".
- Mong đợi (FR-41, M7-AC12, D4): dữ liệu chưa từng lên tài khoản thì cảnh báo "will be lost", hoặc không khẳng định "Your account keeps everything".
- Thực tế: `unsynced-warning` count 0; mô tả Remove nói "Your account keeps everything"; xác nhận -> IndexedDB sạch, hàng id dài mất, cloud không có.
- Vị trí nghi ngờ: src/services/sync-service.ts `finalSyncBeforeSignOut` / `local.countDirty()` (không tính dirty=2); src/ui/components/SignOutDialog.tsx:67 (`unsynced = pending > 0`).
- Phân loại: Minor vì hàng chỉ tồn tại với id > 64 từ file viết tay (app sinh UUID, importer nay từ chối), user tự chọn Remove, Export giữ được dữ liệu; về nguyên tắc là mất dữ liệu không cảnh báo, orchestrator quyết nâng Major hay không.

## 5. Kiểm lại defect vòng trước
| Defect | Trạng thái | Bằng chứng |
| :- | :- | :- |
| M7-D1 (Major) | FIXED | (a) Importer: 2 test contract (goal/entry id 65) xanh không cần it.fails; Playwright: file id 70 ký tự -> không dialog, IMPORT_INVALID_SCHEMA, dữ liệu cũ nguyên; id 64 vẫn nhận. (b) Dữ liệu cũ ghi thẳng IndexedDB: cloud có đủ 5 goal + 23 entry, Synced, pending 0, remote-invalid hiện, không sync-error; thô: goal dài + entry legacy-e1 `dirty = 2`, mọi hàng khác 0; reload giữ cờ + dòng; sửa goal cũ -> quay về dirty 2, không kẹt; entry mới trên goal hợp lệ lên cloud (24). (c) Tách lô (m7-r2-split.test.ts, 400 + 23514 giả lập qua fetch wrapper): 1 độc/40 -> 39 vào, rejected=['poison-1'], POST <= 2*ceil(log2 40)+3; 2 độc + cả lô độc -> hàng tốt vào hết; 400 PGRST102/không mã -> lỗi chu kỳ; 409/23505 không bị coi là hàng hỏng; id 65 ký tự và tên rỗng không ra mạng. Lưu ý copy SYNC_REMOTE_INVALID nói sai hướng (đề xuất). |
| M7-D2 (Major) | FIXED | m7-r2-account.spec.ts ghi timeline /rest/ và /auth/v1/token (bearer giải mã chỉ lấy `sub`) từ lúc bấm "Other User": sau POST /auth/v1/token (+198 ms / +204 ms) KHÔNG có request REST nào (0 ghi, 0 mang token u1) trước khi trả lời D5, chờ thêm 3 s; u2 = 0 goal, 0 entry. Biến thể: 401 thường; hết hạn giữa chu kỳ đang chạy (401 sau 1,5 s) -> cùng kết quả. Cancel -> đăng xuất, u2 = 0, entry còn trên máy, 0 pageerror. "Add to account" -> u2 nhận 1 entry (chỉ sau khi bấm). Cùng tài khoản đăng nhập lại -> không D5, pending lên u1. Đăng xuất giữa chu kỳ: (Remove) pull trễ 3 s, bấm Sign out -> Remove: thiết bị trống (0 goal, 0 entry, không prefsSync) sau khi phản hồi trễ về, 0 request REST sau đăng xuất; (Keep) dữ liệu giữ, 0 REST sau đăng xuất, đăng nhập u2 -> D5, u2 = 0. |
| M7-D3 (Minor) | FIXED | test "offline with nothing waiting" xanh sau khi gỡ test.fail: live region "You're offline…" -> "All changes are synced." |
| M7-D4 (Minor) | FIXED | test "sign-in feedback when the first sync fails" xanh: toast "Signed in as minh.test@example.com"; lần đồng bộ thành công vẫn toast gộp (m6-r1-flow xanh) |
| M6-D1 | FIXED (giữ) | callback giả khi đang có phiên: vẫn signed-in, đồng bộ tiếp |

NV-8 phía mock (m7-r2-ids.spec.ts): 5 goal id `a"b`, `c\d`, `e,f`, `g(h)`, `i&j=k#l` + 5 entry id `m+n/o`, `p q`, emoji, `q"\"r`, `),(,"`: cloud đủ 5 goal + 23 entry, pending 0; thiết bị B kéo đủ; B đổi tên goal `a"b` -> A Sync now thấy tên mới; 0 pageerror. PostgREST thật vẫn NOT VERIFIED.

## 6. Regression
M1-M6 và M7: toàn bộ project chromium (dev + tests/qc) và cloud (dev M6/M7 + QC) xanh 3 lần liên tiếp. Build cloud tắt (không card Account/chip, 0 request ngoài origin, sw.js không nhắc SDK) xanh. Brand (sáng/tối): m7-r2-brand.spec.ts 4/4 (1440 px chữ đúng "1% Better per Day", accessible name đúng, không tràn; 360 px không cuộn ngang Today/Goals/Settings, không brand tile trên tab bar); m7-r1-brand xanh.

## 7. Bảo mật
Không secret/.env commit; npm audit 0; token không lọt URL/console/storage; D2 đã đóng (không request mang token tài khoản chưa xác nhận trước D5; đăng xuất giữa chu kỳ không ghi lại dữ liệu hay gọi REST thêm); id > 64 bị chặn ở importer và tiền kiểm trước khi gửi. RLS thật chưa kiểm (NV-2).

## 8. NOT VERIFIED
| ID | Nội dung | Cách user kiểm |
| :- | :- | :- |
| NV-2 | Migration, RLS, trigger LWW trên Postgres thật; tests/db chưa chạy; SQLSTATE thật 400 + 23514 khi vi phạm check constraint có đúng như mock giả lập | U10 (3)(4)(6): Table Editor có hàng user_id của anh; `curl "<Project URL>/rest/v1/goals?select=*" -H "apikey: <publishable key>"` trả []/lỗi quyền khi không JWT; tài khoản Gmail khác không thấy dữ liệu; ghi tay 1 goal id 70 ký tự bằng SQL để xem mã lỗi thật |
| NV-3 | Đồng bộ hai thiết bị thật (laptop + điện thoại) gồm ngôn ngữ + giờ nhắc | U10 (2)(5)(6) sau U8 |
| NV-4 | iOS Safari / PWA đã cài (Web Locks, Notification, OAuth standalone) | U10 (1) |
| NV-5 | Project Free bị tạm dừng rồi khôi phục | U11 |
| NV-6 | Phiên thật hết hạn 1 giờ và làm mới; offline lâu; SDK thật còn giữ phiên khi REST 401 thật (điều kiện gốc của D2; fix không phụ thuộc điều này) | U10 |
| NV-7 | Độ trễ/giới hạn tốc độ thật khi đẩy 5.449 entry (mock 2,46 s) | U10 (2) |
| NV-8 | PostgREST thật với id chứa `"` hoặc `\` trong in.(); Firefox/Safari; screen reader thật | Kiểm tay: import file có id `a"b`, đăng nhập, xem Table Editor |

## 9. Đề xuất (không chặn)
1. M7-D5: tính hàng dirty = 2 vào cảnh báo D4 (hoặc đổi mô tả Remove), và/hoặc làm nổi bật "Download backup" khi còn hàng như vậy.
2. Key copy riêng cho hàng trên máy bị cloud từ chối ("N items on this device couldn't be uploaded…"), thay vì dùng lại SYNC_REMOTE_INVALID ("items from your account couldn't be read").
3. Dọn tombstone đã đồng bộ (backlog r1 §9.3); ghi nhận A-24 (gộp hai thiết bị có thể vượt ràng buộc nhập tay).
4. `npm run check` kết thúc bằng bản cloud BẬT trên máy có `.env.local` (như r1 §9.7).
