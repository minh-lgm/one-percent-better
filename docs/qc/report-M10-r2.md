# QC report — M10 round 2

**Verdict:** PASS (0 Critical, 0 Major mở; 1 Minor mới M10-D6; D1–D5 của vòng 1 đều FIXED)
**Ngày:** 2026-10-17/18  **Commit:** `e290a43` (HEAD khi chạy lần cuối; mã nguồn = `f8e7576`, `e290a43` chỉ đổi docs + `.gitignore`). Working tree chỉ khác ở `tests/qc/**` của QC.

## 1. Tóm tắt

- **Cả 5 defect vòng 1 đã sửa đúng gốc**: D1 (Major) form đếm theo code point, trùng zod `.max()` ở importer/mapper; D2 "Last backup" chỉ đổi sau khi tệp đã giao cho trình duyệt; D3 ngày không có thật thành `IMPORT_INVALID_SCHEMA` (câu chung), không còn `RangeError`; D4 giữ chuột 350/700/1500 ms vẫn mở bảng; D5 hai test dev không còn đỏ (12/12 dưới 4 tiến trình song song).
- **14/14 AC PASS.** Tải lạnh `#/today`: **222.938 byte** (cloud tắt) và **223.597 byte** (cloud bật, chưa đăng nhập), ngưỡng 230.000. `npm run check` exit 0 x4 (121 file / 1.547 test); Playwright đầy đủ workers 8: **691 pass x2**, 0 fail, 0 flaky; 2 cặp Vitest song song cache nguội trên máy yên: 4/4 exit 0.
- **Một defect mới, Minor (M10-D6):** bộ đếm ký tự `n/60`, `n/280` và thuộc tính `maxLength` của ô nhập vẫn tính theo đơn vị UTF-16 (có từ M1) nên 40 emoji hiện "80/60" dù form chấp nhận, và không gõ nổi quá 50 emoji vào ô tên. Không chặn (validator và mọi biên đã đúng; goal 60 emoji nhập từ file/cloud sửa và lưu lại được).
- **Lưu ý quy trình:** trong lúc QC chạy, developer cũng chạy Playwright/Vitest và commit trên cùng thư mục (`72ca1f4`, `f8e7576`, `e290a43`). Hai lần chạy bị nhiễu (mục 2); mọi số "chính thức" trong report lấy từ lần chạy lúc máy yên, trên mã nguồn `f8e7576`.

## 2. Môi trường và lệnh đã chạy

Windows 11, Node v22.14.0, npm 10.9.2, Playwright Chromium (`PLAYWRIGHT_BROWSERS_PATH=0`); cloud dùng mock; `.env.local` không mở.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Check #1, #2 (mã `f8e7576`, máy yên) | `npm run check` | **exit 0 x2**: lint 0 lỗi, typecheck 0, Vitest 121 file / **1.547 test pass**, `build:e2e` ok |
| Check #3, #4 (trước `f8e7576`) | `npm run check` | exit 0 x2 (121 file / 1.548 test; 1.547 sau khi QC bỏ file oracle tạm) |
| Playwright đầy đủ lần 1 (chromium + cloud, workers 8) | `npm run test:e2e -- --workers=8` | **691 pass**, 10,7 phút, 0 fail |
| Playwright đầy đủ lần 2 | như trên | **691 pass**, 10,2 phút, 0 fail |
| Vitest 2 tiến trình song song, xoá cache `node_modules/.vite/vitest`, 2 cặp, máy yên | `npx vitest run` x2 cùng lúc | **4/4 exit 0**, 1.547 test, 100–106 s, 0 timeout |
| D5: hai test dev dưới 4 tiến trình song song x3 | `npx vitest run src/ui/screens/Settings.sync.test.tsx src/services/login-prompt-service.test.ts` x4 x3 vòng | **12/12 exit 0**, 21 test mỗi tiến trình |
| Tải lạnh, đo độc lập | `m10-r1-bundle.spec.ts`, `e2e/m10-bundle.spec.ts`, `e2e/cloud/m10-bundle.spec.ts`, `final-nfr`, `final2-cloudoff-nfr` | pass; byte tính bằng script gzip-9 trên `dist/` và `dist-cloud-e2e/`: **222.938** / **223.597** |
| Bench | `npm run bench` | in-memory median 7,7 ms (các ca fake-indexeddb và model Review pass, ngưỡng 200) |
| Oracle purge, 150 seed mới | bản sao `m10-r1-purge-oracle.test.ts` với seed = 5.550.000 + 13i (đã xoá sau khi chạy) | 152 test pass trong 90 s; mutant "xoá mọi tombstone" vẫn bị bắt |
| Cloud purge spec lặp | `playwright test tests/qc/cloud/m10-r1-purge.spec.ts --project=cloud --repeat-each=4 --workers=4` | 16/16 pass |
| `npm audit` / `--omit=dev` | | 0 vulnerabilities |
| `git grep` secret ngoài docs; `git ls-files ".env*"` | | 0 kết quả; `.env.cloud-e2e`, `.env.e2e`, `.env.example` |

**Các lần chạy bị nhiễu (không dùng làm bằng chứng đạt, ghi để minh bạch):**
- Vitest 4 tiến trình song song cùng lúc (nặng hơn quy định AC13) và 2 cặp song song trong lúc developer chạy Playwright 8 workers: 1–4 test đỏ mỗi tiến trình, đều là test chờ cố định ms (`sync-service.test.ts` "the scheduled retry runs a cycle by itself" dòng 248, `auth-service.test.ts` "signed-in from another tab" dòng 249, `soft-delete.test.ts` dòng 63, `limits-parity` fuzz chạm 20 s trước khi dev rút gọn ở `72ca1f4`, `tests/qc/m3-r1-domain` 5 MiB). Lặp lại trên máy yên: 0 lỗi.
- Playwright đầy đủ lần đầu (682 pass, 9 fail): 8 fail là `ENOENT ... test-results/.playwright-artifacts-N` vì tiến trình Playwright của developer dọn chung thư mục `test-results/`; 1 fail là spec QC cloud `m10-r1-purge.spec.ts:74` (xem 2b). Chạy lại: 691/691 x2.

### 2b. Marker và cấu hình

- Đã gỡ mọi `it.fails` / `test.fail` của D1–D4 trong `tests/qc/m10-r1-parity-fuzz.test.ts` (5), `m10-r1-import-variant.test.ts` (4), `m10-r1-ui.spec.ts` (D1, D2, D3, D4 "mouse held 400/900 ms"). `grep` còn đúng 1 marker trong test M10: `test.fail` của M10-D6 (`tests/qc/m10-r2-ui.spec.ts:64`), do defect mở.
- `tsconfig.app.json`: `"exclude": ["src/sw.ts"]`, không còn exclude `tests/qc`. `tsc -b` sạch (nằm trong `check`).
- Test QC mới (chạy lại được): `tests/qc/m10-r2-parity.test.ts` (D1), `m10-r2-dates.test.ts` (D3, 39 test), `m10-r2-ui.spec.ts` (D1 UI, D2, D3, D4; 41 test).
- Test QC đã chỉnh: `tests/qc/cloud/m10-r1-purge.spec.ts`. Sau khi đẩy tombstone lên, chấp nhận "dirty 0" hoặc "đã bị dọn rồi": purge khởi động chạy lúc trình duyệt rảnh (tối đa ~10 s) nên trên máy tải nặng có thể chạy sau lần push; hàng đã đẩy và cũ hơn 30 ngày thì dọn là đúng ADR-29. Các khẳng định "tombstone `dirty 1` còn nguyên khi chưa đồng bộ" và "cuối cùng hàng thô biến mất, tài khoản giữ tombstone" giữ nguyên. Đây là sửa test của QC, không phải che lỗi sản phẩm.

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M10-AC1 | PASS | 222.938 byte (cloud tắt, 5 response) và 223.597 byte (cloud bật, 8 response) gzip-9, ngưỡng 230.000; `m10-r1-bundle.spec.ts` request log 6 request, không chunk schema/backup/chart/SDK, 0 request ngoài origin; `final-nfr`, `final2-cloudoff-nfr` (cả 4173 và 4174) pass. Không đổi so với vòng 1 (222.838 / 223,5 kB). |
| M10-AC2 | PASS | Validate form giữ hành vi gốc: 60 emoji / 280 emoji hợp lệ như thời zod (M10-D1 FIXED). Fuzz và biên ở mục 5. 37 probe ESLint lớp zod pass (`m10-r1-lint.test.ts`); `limits-parity`, `goal.test`, `entry.test` pass. |
| M10-AC3 | PASS | `m10-r1-bundle.spec.ts` 8 test: Import offline qua SW, file > 5 MiB không tải chunk, chunk đứt thì báo lỗi chung rồi thử lại được; `m3-r1-domain` 23/23. |
| M10-AC4 | PASS | Bảng 9 ca + integration S1 (dev) và `cloud/m10-r1-purge.spec.ts` (16/16 khi lặp x4, pass ở cả 2 lần chạy đầy đủ). |
| M10-AC5 | PASS | Oracle 30 seed (vòng 1) + **150 seed mới** (152/152 pass) với mã có `f8e7576`: live set của A, B, server giống hệt chạy không purge; mutant bị bắt. Bench 7,7 ms. |
| M10-AC6 | PASS | `m10-r1-lint` 37 test, PKCE 3 kịch bản, `dist/` 0 `supabase`/`auth/v1`/`supabase.co`, `dist-cloud-e2e/` đúng 1 chunk SDK; `check` kết thúc bằng `build:e2e`. |
| M10-AC7 | PASS | `m10-r1-prompts.test.ts` 14 test + `m8-r1-rules` pass trong cả hai lần Playwright đầy đủ. |
| M10-AC8 | PASS | Không còn sót: giữ chuột 350/700/1500 ms ở en/vi x 360/1440 mở bảng (M10-D4 FIXED); `m10-ui` dev và `m10-r1-ui` (nhanh, 100–900 ms, chạm, rời trang, `focusHeading` khi rAF tắt 6/6) pass. |
| M10-AC9 | PASS | `m10-r1-import-variant.test.ts` 47 test pass không còn `it.fails` (ngày sai thì câu chung; khoảng 100 năm / giá trị vượt giới hạn thì `outOfRange`); e2e en/vi. |
| M10-AC10 | PASS | Alert `EXPORT_FAILED` đúng chỗ, không toast, axe sạch, en/vi (`m10-r1-ui`, `m10-r2-ui`); "Last backup" nay đúng (M10-D2 FIXED). |
| M10-AC11 | PASS | `m10-r1-copy.test.ts` (11 key khớp DESIGN), nhãn cột đo 13 độ rộng x 2 chart (`m10-r1-ui`), pass cả 2 lần đầy đủ. |
| M10-AC12 | PASS | README, `m10-backlog` dev 2/2, bảng "Đóng backlog" khớp; handoff nay có Fix log round 1 (kể cả `72ca1f4`, `f8e7576`). |
| M10-AC13 | PASS | `check` exit 0 x4; Playwright 691 x2; bench; M4-D5: 4/4 exit 0 trên máy yên (mục 2); `git grep` secret 0; `.env*` đúng 3 file; chromium 0 request ngoài origin. |
| M10-AC14 | PASS (đọc tài liệu) | Không đổi so với vòng 1 (DESIGN v3.1). |

## 4. Defect

### M10-D6 — Bộ đếm ký tự và `maxLength` của ô nhập vẫn tính theo đơn vị UTF-16  [Minor]
- Bước tái hiện: Goals, New goal, nhập tên 40 emoji (U+1F600) (hoặc `tests/qc/m10-r2-ui.spec.ts` test "M10-D6", đang đánh dấu `test.fail`). Dán/gõ 60 emoji vào ô Name.
- Mong đợi: validator đếm ký tự (M10-D1 đã sửa) nên bộ đếm `{n}/60` (DESIGN: "bộ đếm ký tự") phải cùng đơn vị: 40 emoji hiện `40/60`; ô nhập phải cho phép 60 ký tự (60 emoji hợp lệ ở form, importer, mapper, SQL).
- Thực tế (đo bằng Playwright, Chromium): 40 emoji hiện **`80/60`** dù Save thành công; 50 emoji hiện `100/60`; điền 51 hoặc 60 emoji (`fill`, `insertText`, `type`) thì ô chỉ giữ **50 emoji** (100 đơn vị UTF-16 = `GOAL_NAME_MAX + 40`). Tương tự ô Why (`+40`) và ô ghi chú ở EntryForm/StopTimerDialog (`ENTRY_NOTE_MAX + 50`, bộ đếm `note.length`). Goal 60 emoji nhập từ file/cloud mở được ở form sửa và Save changes không đổi (test `m10-r2-ui.spec.ts`), nhưng người dùng không tự gõ được độ dài đó.
- Vị trí nghi ngờ: `src/ui/screens/GoalForm.tsx:184-185,195-196`, `src/ui/components/EntryForm.tsx:102-103`, `src/ui/components/StopTimerDialog.tsx:128-129` (`state.name.length`, `maxLength={...+40/+50}`). Có từ M1, không phải hồi quy của M10; mức Minor vì chỉ ảnh hưởng chuỗi có ký tự ngoài BMP và dữ liệu không bị mất hay hỏng.

(Không có defect Critical hay Major mới.)

## 5. Kiểm lại defect vòng trước

| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M10-D1 (Major) | **FIXED** | `src/domain/text.ts` `charLength` (for...of, tức code point) dùng ở tên, why, note. Kiểm bằng `m10-r1-parity-fuzz.test.ts` (gỡ marker; BMP và astral: 4.000 goal + 4.000 entry, 0 lệch) và `m10-r2-parity.test.ts` (mới): (a) 5.000 chuỗi ngẫu nhiên từ bảng chữ hiểm (emoji, ZWJ gia đình 5 code point, cờ 2 code point, `e`+U+0301, keycap 3 code point, tông da, U+200D riêng, U+10FFFF, surrogate đơn lẻ): `charLength` = `Array.from(s).length` và ngưỡng `max(n)` đạt, `max(n-1)` rớt của zod 4.6.5; (b) 12 loại nguyên tử, tên **60 nhận / 61 từ chối**, why và note **280 / 281**, id **64 / 65**: form = importer = mapper (id chỉ importer = mapper vì form không nhận id); (c) khoảng trắng đầu/cuối (NBSP, U+3000) cắt trước khi đếm; (d) fuzz **4.000 goal** (tên/why quanh mọi biên theo code point) + **4.000 entry** với bảng chữ hiểm: form = importer = mapper = quy tắc code point, vòng tròn "form, file, nhập lại" được, hơn 2.000 mẫu chứa ký tự ngoài BMP/ZWJ. UI: goal nhập 60 emoji + why 280 "gia đình" (448 đơn vị) sửa và lưu lại được; tạo goal tên 12 "gia đình" (60 code point, 96 đơn vị) qua form; 31 cặp `e`+U+0301 (62 code point) bị từ chối ở form. **SQL `char_length`:** không có Postgres (không Docker) để chạy `tests/db`; theo tài liệu Postgres `char_length` đếm ký tự (code point) với UTF8 và zod 4.6.5 được đo trực tiếp bằng code point, nên các biên khớp; xem mục 8. Còn lại: M10-D6 (đếm ở UI). |
| M10-D2 | **FIXED** | `BackupService.export` không ghi nữa; `Settings.exportBackup` gọi `recordExport(now)` sau `downloadTextFile`. e2e `m10-r2-ui` cho cả hai kiểu lỗi (`URL.createObjectURL` ném, hàm tạo `Blob` ném): Alert `EXPORT_FAILED`, "Last backup: Never", kv `settings.lastBackupAt` = null, banner "never backed up" còn ở Today, bấm lần hai và reload không đổi; bỏ lỗi thì Export kế tiếp thành công, hiện ngày, kv có mốc, banner biến mất; tệp xuất mang đúng mốc lưu trên máy; vi đúng chuỗi, quét vi 0. |
| M10-D3 | **FIXED** | `m10-r2-dates.test.ts` (39 test): `2026-02-30`, `2025-02-29`, `2026-13-01` (cộng `2026-04-31`, `2100-02-29`, `2026-1-5`, rỗng, `hello`, có giờ, toàn-rộng, kiểu số/null/object...) ở `startDate` và `endDate` cho `IMPORT_INVALID_SCHEMA` + key `errors.IMPORT_INVALID_SCHEMA` (không `outOfRange`), không ném; `entry.date` sai thì lỗi có cấu trúc; 3.000 chuỗi ngày ngẫu nhiên không ném lần nào; 2024-02-29 vẫn nhận; khoảng 2000-2099 vẫn `outOfRange`; ngày sai + giá trị vượt giới hạn trong cùng file thì câu chung. e2e (6 tổ hợp + vi + outOfRange): Alert đúng câu, không dialog, không `UNKNOWN`, 0 `pageerror`, dữ liệu không đổi. |
| M10-D4 | **FIXED** | `m10-r2-ui.spec.ts` 25 test, en/vi x 360/1440: giữ chuột 350 / 700 / 1500 ms, dòng đọc **còn nguyên trong lúc giữ** và vị trí nút không nhảy (< 1 px), thả thì bảng mở, dòng đọc rỗng trong 1 s; giữ rồi kéo ra khoảng trống và thả thì không mở bảng, dòng đọc xoá trong 1,5 s; bàn phím không đổi (Escape xoá trong 150 ms; Tab xoá trong 1 s, kể cả sau một lần giữ chuột lâu, không kẹt trạng thái pointer); chuột phải ngoài chart không để kẹt; chạm vi 360 mở ở lần đầu. Các ca cũ của `m10-r1-ui` (0-900 ms) pass không marker. |
| M10-D5 | **FIXED** | 12/12 exit 0 (4 tiến trình x 3 vòng); 4/4 exit 0 ở bộ đầy đủ 2 tiến trình trên máy yên. Test dùng `waitFor` / `vi.waitFor`. Mục 9 nêu các test chờ-cố-định khác chịu tải kém. |

## 6. Regression

- M1-M9: toàn bộ spec dev và QC (chromium + cloud) pass trong cả hai lần Playwright đầy đủ (691/691); Vitest 1.547/1.547. Không defect cũ tái phát (M3-D3, M7-D1 id > 64, M8-D1, M9-D1, M5-P1 `focusHeading`...).
- Thay đổi phát sinh trong lúc QC, ngoài danh sách sửa: `f8e7576` (`DexieSyncStore.applyRemote` không ghi tombstone từ xa đã đủ cũ cho bản ghi thiết bị không giữ; cascade vẫn chạy). Kiểm: test đơn vị của dev, oracle 150 seed, `cloud/m10-r1-purge.spec.ts` x4, hai lần Playwright đầy đủ gồm toàn bộ spec đồng bộ M7/M8 và `final2-journey`: không hồi quy. Lưu ý: đồng hồ thiết bị đi trước nhiều năm làm mọi tombstone từ xa bị coi là "cũ" và không được lưu; vô hại (không bản ghi sống nào bị ảnh hưởng, cascade vẫn chạy).
- Purge lúc khởi động (đo vòng 1: long task tối đa 241-298 ms với 50.000-70.000 entry) không đổi mã; spec `m10-r1-purge-perf` pass trong cả hai lần chạy đầy đủ.

## 7. Bảo mật

- `git grep` tìm `service_role` và `sb_secret_` (ngoài docs) 0; chỉ 3 file `.env*` được theo dõi (khoá giả); `.env.local` không mở.
- `npm audit` 0 lỗ hổng (cả `--omit=dev`).
- Import vẫn qua kích thước, JSON, schema strict, toàn vẹn; thông báo lỗi mới là chuỗi tĩnh, không nhúng nội dung file. Sửa D3 không nới biên (ngày sai vẫn bị từ chối). `recordExport` chỉ ghi `lastBackupAt` cục bộ.
- Không phát hiện lỗ hổng mới.

## 8. Chưa kiểm chứng được (NOT VERIFIED)

- **SQL `char_length` thật** (CHECK ở `supabase/migrations/20261012000000_cloud_sync.sql`): không chạy được `npm run test:db` (không Docker/Supabase local). Biên 60/280/64 đã khớp ở form, importer và mapper; khớp với SQL dựa vào ngữ nghĩa tài liệu của Postgres (`char_length` = số ký tự). Cách kiểm: `npm run db:start` rồi `npm run test:db`, hoặc thử insert goal 60 emoji vào bảng.
- Firefox, Safari, iOS Safari, Edge: chỉ Chromium (nhãn cột, giữ chuột/chạm ở vi 360, Import offline qua SW).
- Đăng nhập Google thật, RLS thật (dùng mock theo quy định); `npm run build` thật với `.env.local` (không đọc file); trình đọc màn hình; `privacy.html` trên sub-path Pages thật; hộp thoại chọn tệp hệ điều hành thật.
- Chuột phải/menu ngữ cảnh trên Windows thật đối với `pointerup` (Playwright phát đủ `pointerdown`/`pointerup`); nếu `pointerup` bị nuốt thì dòng đọc có thể nằm lại tới lần bấm kế tiếp (rất nhẹ).

## 9. Đề xuất (không chặn)

- **M10-D6:** đếm `{n}` bằng `charLength` và đặt `maxLength` theo cách không cắt emoji (bỏ `maxLength` HTML và dựa vào validator, hoặc nới đủ lớn).
- Test dev/Vitest chờ cố định ms vẫn đỏ khi máy chịu tải nặng hơn quy định (4 tiến trình, hoặc Vitest cạnh Playwright 8 workers): `src/services/sync-service.test.ts:248` (20 ms), `src/services/auth-service.test.ts:249` (10 ms), `src/data/dexie/soft-delete.test.ts:63` (50 ms), cùng lớp với M10-D5; nên chuyển sang `vi.waitFor`.
- Developer và QC chạy song song trên cùng cây thư mục gây nhiễu (chung `test-results/`, `dist/`, CPU); nên để orchestrator tuần tự hoá. Thư mục `test-results-dev/` của developer, khi còn tệp `.js` trace bên trong, làm `npm run lint` đỏ (28.602 lỗi) vì ESLint không bỏ qua nó; thêm vào `ignores` của `eslint.config.js` hoặc dọn sau khi chạy.
- `Settings.exportBackup`: nếu `recordExport` ném lỗi sau khi tệp đã tải xuống thì người dùng vẫn thấy Alert `EXPORT_FAILED` (rất hiếm: lỗi ghi IndexedDB). Có thể tách riêng hai bước.
- Đề xuất còn mở từ vòng 1: `keepRunning` trong `Today.tsx` còn dùng `requestAnimationFrame`; nhãn cột "100.0" (5 ký tự); README ghi chunk zod là `schemas-*.js` (cloud tắt đặt tên `backup-*.js`); focus rơi về `<body>` sau Export (từ M3).

## 10. Backlog còn lại sau M10 (không chặn)

Minor mới: M10-D6. Mục "Later" của bảng backlog (M5-P1(d), M4-P1(c)) giữ nguyên; các đề xuất ở mục 9. Phần NOT VERIFIED ở mục 8 cần user tự kiểm hoặc cần Docker/Supabase local.
