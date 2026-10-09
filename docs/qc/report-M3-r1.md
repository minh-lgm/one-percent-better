# QC report — M3 round 1

**Verdict:** PASS
**Ngày:** 2026-10-10  **Commit:** b85aa16 (code M3 ở ec60104; working tree: QC thêm `tests/qc/m3-r1-domain.test.ts`, `tests/qc/m3-r1.spec.ts`, sửa `tests/qc/m2-r2-domain.test.ts` theo dispute, và file report này)

## 1. Tóm tắt
- M3-AC1…AC15 đều PASS có bằng chứng tự chạy. `npm run check` exit 0 (Vitest 54 file, 430/430, build 214,85 kB gzip) và Playwright đầy đủ 243/243 xanh ở 2 lần chạy liên tiếp (dev M1–M3 + QC M1–M3). Không có Critical/Major.
- **Dispute xử lý: ĐỒNG Ý, đã re-target.** Đọc `timer-service.ts`/`timer-repo.ts`: `save` = `prepareAdd` + `TimerRepository.saveTimerEntry` (một transaction), không còn gọi `EntryService.add` (đúng M3-T7 d, ADR-16). Test `tests/qc/m2-r2-domain.test.ts` "TimerService.save…" nay chèn lỗi vào `db.entries.put` của Dexie (một lần) và giữ nguyên ý đồ: call đó reject, không có entry, timer còn, mutex không treo, call xếp hàng thành công; 9/9 xanh. Thêm 2 test mới trong `m3-r1-domain.test.ts` (lỗi `entries.put` và lỗi `kv.delete` trong transaction: rollback, entry không tạo, timer còn).
- 4 defect Minor (M3-D1…D4), không chặn: ký tự rác quanh "why" ở Goal detail, số lượng ≥ 1000 không có dấu phân cách, import chấp nhận goal/entry vi phạm bất biến của goal, dialog Save của tab thua cuộc hiện tóm tắt thiếu tên goal.
- NOT VERIFIED: hộp thoại Save/Open file thật của trình duyệt, Firefox/Safari, iOS (mục 8).

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2, Chromium của Playwright, tại project root; dựng theo handoff (build + preview 4173 qua `webServer`).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Gate (trước khi sửa test QC) | `npm run check` | exit 1 đúng như dev báo: Vitest 406/407, fail duy nhất là test QC M2 bị dispute |
| Gate (sau re-target + test QC M3) | `npm run check` | **exit 0**: eslint `--max-warnings 0` sạch, typecheck 0, Vitest **54 file, 430/430**, build `index-*.js` 703,14 kB raw / **214,85 kB gzip** (≤ 250) |
| E2E đầy đủ (trước test QC M3) | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | 213 passed / 0 failed (56,1 s) |
| E2E đầy đủ x2 (sau) | như trên | **243 passed / 0 failed** cả 2 lần (58,6 s, 58,7 s) |
| Unit QC mới | `npx vitest run tests/qc/m3-r1-domain.test.ts` | 23/23 |
| Audit | `npm audit` | found 0 vulnerabilities |
| Quét mã | rg `dangerouslySetInnerHTML`, `eval(`, `new Function`, `innerHTML`, `document.write` trong `src`; rg `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`; rg `0000-01-01` trong `src/services`; `git ls-files` lọc `.env` | chỉ có `innerHTML` trong test i18n-scan; không có fetch/XHR; 0 kết quả `0000-01-01`; chỉ `.env.example` được commit |

Lưu ý quy trình: lint và `tsc -b` (nằm trong `npm run build`) quét cả `tests/qc/`, nên file test QC phải sạch lint/type; đã kiểm.

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M3-AC1 ghi bù | PASS | `e2e/m3-day.spec.ts` AC1 xanh; QC: ghi 30 phút ngày 10-05, Today không đổi; ghi bù cho goal ended (Old course 06-30) tới đúng 1440, 1426 báo "up to 1,425 more"; entry hiện ở Goal detail; không chạm Today |
| M3-AC2 ngày tương lai | PASS | QC: `#/day/2026-10-10`, `2030-01-01`, `9999-12-31` cho thông báo `DATE_IN_FUTURE`, 0 nút Add entry, Next vô hiệu; gõ ngày tương lai vào picker bị bỏ qua; service `add` future trả `DATE_IN_FUTURE` |
| M3-AC3 chỉ trong khoảng goal | PASS | QC: 09-30 không có Read, 10-01 có Read (biên đầu), 06-30 có Old course (biên cuối), 07-01 không; 2025-12-25 empty + link Goals; 03-02 chỉ Spanish `60/17` |
| M3-AC4 route sai | PASS | QC 13 dạng sai (`abc`, `2026-13-40`, `2026-02-30`, `2026-1-5`, `20261005`, `0000-01-01`, `%20`, `..%2F..`, thẻ script, `2027-02-29`, chữ số Ả Rập…) cho `day-invalid` + link `#/today`, 0 pageerror/console error; `2024-02-29` hợp lệ; `0001-01-01`, `1900-01-01` ra empty |
| M3-AC5 lịch sử | PASS | QC: Guitar 13 hàng, entry mới tạo cùng ngày xếp đầu, ngày không tăng, link ngày mở Day; timer qua nửa đêm lưu đúng ngày bắt đầu, nguồn `Timer`, note `—`; id lạ (`khong-ton-tai`, `__proto__`, `constructor`, `%20`…) ra Not found; `/goals/new` vẫn là form; `/goals/g2/` và `/edit` chạy |
| M3-AC6 export | PASS | QC: tải đúng tên, JSON pretty UTF-8 (tiếng Việt/emoji không bị escape), `app`, `schemaVersion 1`, 5/23, `settings`, không `locale`/`activeTimer`; `lastBackupAt = now` trong file; "Last backup" cập nhật; export DB rỗng ra file 0/0 và import lại được (D3 "0 goals, 0 entries") |
| M3-AC7 round-trip | PASS | QC unit: goal/entry có ký tự lạ (nháy, `<b>`, emoji, RTL, xuống dòng, tab) qua export, DB mới, import: `toEqual` mọi field; QC E2E: export rồi import lại qua UI, entries bằng nhau; fixture `sample-backup.json` khớp bảng S1 (đếm độc lập 8/13/1/0/1 entry, 240/250/60/0/15 phút) |
| M3-AC8 xem trước và xác nhận | PASS | `m3-backup.spec.ts` AC8 xanh; QC: D3 hiện số hiện có và số trong file, focus ban đầu ở Cancel, Escape đóng và trả focus về nút Import, Tab không thoát khỏi dialog, bấm đúp "Replace" chỉ import 1 lần; import khi timer chạy xoá timer ngay cả ở tab thứ hai (không reload) |
| M3-AC9 import lỗi | PASS | QC unit: 40+ ca (JSON hỏng/rỗng/lồng 100.000 tầng, root không phải object, app/version sai, minutes 0/-5/1.5/1441/chuỗi, ngày sai, note/name/why quá dài, field lạ, id trùng, orphan, ngoài khoảng, 1000+441 phút/ngày là INTEGRITY, 1000+440 OK, biên 5 MiB đúng và +1 byte). Rollback: lỗi `bulkAdd` hoặc `kv.put` giữa `replaceAll` thì goals, entries, settings, `activeTimer` nguyên vẹn. QC E2E: 8 file xấu (rỗng, cắt cụt, nhị phân, mảng, app khác, version 7, orphan, > 5 MB) cho Alert đúng chuỗi, không dialog, DB không đổi, Alert biến mất sau import tốt |
| M3-AC10 nhắc backup | PASS | QC E2E sau import: 31 ngày hiện "31 days" ở Today (có nút `Back up now`) và Settings; đúng 30 ngày ẩn; null hiện "never"; không goal ẩn; Export xoá nhắc ở cả hai nơi |
| M3-AC11 an toàn hiển thị | PASS | QC: name/why/note chứa `<img onerror>` và `<script>` hiện literal ở Today, Goals, Goal detail, Day, dialog D2; 0 `img`/`script` trong `main`, `window.__pwned` undefined, 0 JS dialog |
| M3-AC12 không regression, a11y | PASS | 243/243 gồm toàn bộ M1, M2; QC axe 0 serious/critical trên Today, Day (mặc định, tương lai, sai), Goal detail (có/không lịch sử), Settings (cả khi có Alert lỗi, cả D3 mở ở vi) ở 360 px và 1440 px |
| M3-AC13 song ngữ | PASS | QC `vi-VN` 360 px: 10 route (Today, Day x4, Goals, Goal detail x3, Settings) quét vi 0 phát hiện, không cuộn ngang, axe sạch; heading `Thứ Năm, 8 tháng 10, 2026`; History `08/10/2026`; D3 vi `5 mục tiêu, 23 lần ghi`; Alert vi cho `{abc` và `schemaVersion 3` đúng chuỗi từ `vi.json`; import giữ `locale` (unit + reload) |
| M3-AC14 getById | PASS | `rg "0000-01-01" src/services` = 0; QC unit: `update` chỉ dùng index `[goalId+date]` (của `sumMinutes`), id lạ trả `ENTRY_NOT_FOUND`, DB không đổi; test dev `timer-repo.test.ts`/`timer-save-atomic.test.ts` xanh |
| M3-AC15 save nguyên tử | PASS | QC unit tự dựng (hai và ba "tab" = bộ repo + service riêng trên một DB): 30/30 vòng đúng 1 entry `timer` 30 phút, bên thua `TIMER_NOT_RUNNING`, `activeTimer` xoá; save đua discard 30/30 (0 hoặc 1 entry, không còn timer, không 2 entry); save đua xoá goal 20/20 không entry mồ côi; `day-limit` với 1420 đã có trả `remaining 20` và timer còn; QC E2E trình duyệt thật: hai tab mở dialog Stop, bấm Save đồng thời, 8 vòng, mỗi vòng đúng 1 entry |

## 4. Defect

### M3-D1 — Ký tự rác quanh dòng "why" ở Goal detail  [Minor]
- Bước tái hiện: import `e2e/fixtures/sample-backup.json`, mở `#/goals/g2` (Guitar, why "Play a full song by Christmas"), xem dưới tiêu đề.
- Mong đợi: why là blockquote nghiêng, bao bởi dấu ngoặc kép (DESIGN S4; dev handoff mục 7.4 nói vẽ bằng CSS).
- Thực tế: hiện ô vuông thiếu glyph + chữ `C` ở đầu và ô vuông + chữ `D` ở cuối dòng why, ở 360 px và 1440 px. Nội dung CSS là chuỗi bị hỏng mã hoá (byte `C2 81` + `C`/`D`) thay vì dấu ngoặc kép cong.
- Vị trí nghi ngờ: `src/ui/styles/app.css:1125-1130` (`.gd-head .why::before/::after`). Test E2E của dev không kiểm chỗ này.

### M3-D2 — Số lượng ≥ 1000 trong D3 và toast import không có dấu phân cách hàng nghìn  [Minor]
- Bước tái hiện: import file có 16.000 entry (QC spec "near-limit valid file"), xem toast; D3 dùng cùng cơ chế.
- Mong đợi: DESIGN §7.1 "Số, hàng nghìn: `1,440` (en) / `1.440` (vi)".
- Thực tế: toast `Backup imported: 20 goals, 16000 entries`; D3 vi sẽ là `16000 lần ghi` thay vì `16.000`. Phút ở nơi khác (`1,440`) có dấu.
- Vị trí nghi ngờ: `src/ui/screens/Settings.tsx:148, 175-182` (truyền số thô vào `count`).

### M3-D3 — Import chấp nhận dữ liệu mà chính app sẽ từ chối khi tạo goal/entry  [Minor]
- Bước tái hiện: import file schema hợp lệ có goal `daily` với `targetMinutes: 600000`, goal có khoảng 2000-01-01 đến 2099-12-31, entry ngày 2030-05-05 (tương lai).
- Mong đợi: FR-20/NFR-04 "validate đầy đủ"; ARCH §4: daily 1–1440, khoảng ≤ 1827 ngày, `date ≤ today`.
- Thực tế: cả ba được nhận (unit QC log `accepted-by-import {"dailyTargetOver1440":true,"periodOver1827Days":true,"entryAfterToday":true}`). Today hiện thẻ `0/600,000 min`, `600,000 min to go`; History hiện entry năm 2030. Không crash. Chỉ xảy ra với file bị sửa tay/hỏng; AC9 không liệt kê rõ nên để Minor.
- Vị trí nghi ngờ: `src/domain/backup.ts` `goalSchema` (`targetMinutes` max 600000 cho cả daily) và `checkIntegrity`.

### M3-D4 — Dialog Stop/Save ở tab thua cuộc hiện tóm tắt thiếu tên goal  [Minor]
- Bước tái hiện: hai tab cùng có timer chạy, cả hai mở dialog Stop, cùng bấm `Save entry` (QC spec "Two tabs saving").
- Mong đợi: tab thua nhận lỗi `TIMER_NOT_RUNNING` (đạt: `There's no timer running.`); dialog hiển thị đúng.
- Thực tế: dialog còn mở, dòng tóm tắt thành ` · tracked 10:30:00` (mất tên goal vì timer đã bị xoá), nút `Save entry` vẫn bật; người dùng phải bấm `Keep running`/`Discard session` để thoát. Dữ liệu đúng (1 entry), chỉ là UX/hiển thị.
- Vị trí nghi ngờ: dialog Stop ở Today/`TimerCard` (tóm tắt dựng từ timer hiện tại, không giữ goal đã chọn khi mở).

## 5. Kiểm lại defect vòng trước
| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M2-D1 … D4 | FIXED (giữ nguyên) | toàn bộ spec/test QC M2 xanh trong 2 lần chạy đầy đủ |
| M2-D3 phần còn lại (Save hai tab tạo 2 entry) | FIXED | M3-AC15, xem trên |
| Dispute test `m2-r2-domain` "entries.add throwing once" | ĐỒNG Ý, đã re-target | xem mục 1; không còn test đỏ |

## 6. Regression
- Dev M1 + M2 và QC M1 + M2 (kể cả `m2-r2-dblclick`, `m2-notify`) xanh 2/2 lần chạy đầy đủ (243 test). Vitest 430/430.
- Gói JS 214,85 kB gzip (M2: 206,98). Còn khoảng 35 kB tới giới hạn 250 kB cho M4–M5.
- Offline (SW precache + IndexedDB): Day, Goal detail, Export và Import đều chạy khi `setOffline(true)`.

## 7. Bảo mật
- Import là input không tin cậy: giới hạn 5 MiB (kiểm trước khi đọc), `JSON.parse` trong try/catch (lồng 100.000 tầng không làm crash), zod strict, integrity, một transaction. Không `eval`, không `innerHTML`/`dangerouslySetInnerHTML` (rg); `__proto__` trong `plusOneShown` không làm ô nhiễm `Object.prototype`.
- XSS: xem M3-AC11, mọi nơi hiển thị đều literal. 0 request ra ngoài origin trong export/import, không có `fetch`/XHR trong `src`. File export không chứa secret. `.env` không bị commit (chỉ `.env.example`). `npm audit` 0 lỗ hổng.
- Hạn chế: M3-D3 (dữ liệu vi phạm bất biến vẫn vào được, chỉ do người dùng tự nạp file).

## 8. Chưa kiểm chứng được (NOT VERIFIED)
1. **Hộp thoại Save/Open của trình duyệt thật (AC6, AC7).** Playwright bắt download và `setInputFiles`, không đi qua hộp thoại hệ điều hành. Cách tự kiểm trên Chrome/Edge desktop: `npm run build && npm run preview`, mở `http://localhost:4173`, import `e2e/fixtures/sample-backup.json` qua Settings; bấm `Export backup (JSON)`: file `1percent-better-backup-<hôm nay>.json` xuất hiện trong Downloads (hoặc hộp Save nếu bật "hỏi nơi lưu"); mở profile/trình duyệt khác, Import đúng file đó, thấy D3 "5 goals, 23 entries", xác nhận, dữ liệu giống nhau.
2. **Firefox, Safari, iOS Safari (tải file, chọn file).** Chromium của Playwright tự nhận BOM UTF-8/UTF-16 trong `Blob.text()`; trình duyệt khác có thể từ chối file UTF-16 hoặc có BOM (kết quả là Alert "isn't valid JSON", không mất dữ liệu). Kiểm: export rồi import lại trên chính trình duyệt đó, và thử file lưu từ Notepad (có BOM).
3. **Thiết bị thật** (cảm ứng, bàn phím ảo với ô chọn ngày ở Day): chưa có thiết bị; ảnh 360 px chụp bằng Chromium, bố cục đạt.

## 9. Đề xuất (không chặn)
- Thêm assertion E2E cho dòng why (chặn tái phát M3-D1) và một test kiểm số ≥ 1000 trong D3/toast.
- `exportBackup` không có `catch`: nếu đọc DB lỗi sẽ là rejection không có phản hồi UI; nên hiện Alert `errors.UNKNOWN`.
- Sau khi xoá goal từ Goal detail, màn có thể nháy Not found một khung hình trước khi điều hướng (quan sát từ code, không bắt được ổn định bằng E2E).
- DESIGN ghi `empty.day.noGoals` có dấu chấm cuối, `en.json` không có; thống nhất.
- Hạn chế ARCH §10 còn lại: hai tab cùng `add` thủ công cùng goal/ngày có thể vượt 1440 (đã ghi ở Later).

## Tệp QC thêm hoặc đổi trong round 1
- `tests/qc/m2-r2-domain.test.ts`: re-target test "TimerService.save…" sang lỗi ở Dexie `entries.put` trong `saveTimerEntry` (đồng ý dispute).
- `tests/qc/m3-r1-domain.test.ts` (23 test: fixture S1 độc lập, 40+ file import xấu, round-trip, rollback, import đua save, file ~4,2 MiB, hai/ba tab save, save đua discard/xoá goal, day-limit, lỗi giữa transaction, getById).
- `tests/qc/m3-r1.spec.ts` (30 test Playwright: Day, Goal detail, Backup, hai tab thật, vi 360 px, bố cục/axe 360 và 1440, import dữ liệu ngoài khoảng).
- Không sửa source, unit test của dev, `docs/plan|design|handoff`.
