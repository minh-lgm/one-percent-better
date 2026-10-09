# QC report — M2 round 3

**Verdict:** PASS
**Ngày:** 2026-10-10  **Commit:** 14d5edc (code sửa ở 91b7ce7; working tree: QC thêm `tests/qc/m2-r3-domain.test.ts` và file report này)

## 1. Tóm tắt
- **M2-D4 (Major) FIXED.** Test hồi quy của dev xanh 10/10 lần lặp; Chromium thật 90/90 (`--repeat-each 15`, 5 worker) và 32/32 ở tải nặng (`--repeat-each 16 --workers 12`, 2 lần) với `DBLCLICK_E2E [] of 60` mỗi lần (0 alert trong 1920 lần bấm đúp gap 0 đến 120 ms). Ở round 2, đúng bài tải nặng này đỏ 4/12 và 7/16.
- Thay đổi thêm của dev (claim ngày nhắc nguyên tử qua `KvRepository.update`, scheduler nhớ trigger, e2e AC8 chuyển sang spy) đạt: "two tabs" và AC8 xanh 30/30 (`--repeat-each 10 --workers 8`) và 60/60 (`--repeat-each 20 --workers 12`); 5 test QC mới về claim/release xanh.
- `npm run check` exit 0 (Vitest 44 file, 339/339); toàn bộ Playwright 200/200 xanh ở cả 3 lần chạy đầy đủ liên tiếp. Không có defect mới. Mọi AC M2-AC1…AC13 đạt ở phần tự động.
- `NOT VERIFIED` (không đổi): bấm notification thật, import `.ics` vào lịch thật, hộp xin quyền thật, popup chọn giờ gốc của trình duyệt, iOS/Android. Orchestrator cần hỏi user (mục 8).

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2, Playwright Chromium (`PLAYWRIGHT_BROWSERS_PATH=0`), chạy tại project root; dựng theo handoff (`npm run build` + `vite preview` qua `webServer` của Playwright).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Gate | `npm run check` (chạy 2 lần) | exit 0 cả hai: eslint `--max-warnings 0` sạch, typecheck 0, Vitest **44 file, 339/339**, build `index-*.js` 673,47 kB raw / **206,98 kB gzip** (≤ 250 kB), SW 16,53 kB, precache 15 entry |
| Vitest lặp cho D4 | `npx vitest run src/ui/screens/Today.timer.test.tsx src/ui/components/GoalCard.timer.test.tsx tests/qc/m2-r2-domain.test.ts` x10 | **10/10 lần**: 3 file, 22/22 test |
| E2E D4 | `playwright test tests/qc/m2-r2-dblclick.spec.ts tests/qc/m2-r2.spec.ts -g "0 ms apart\|double" --repeat-each 15` | **90 passed, 0 failed**; 15 dòng `DBLCLICK_E2E [] of 60` |
| E2E D4 tải nặng | `playwright test tests/qc/m2-r2-dblclick.spec.ts --repeat-each 16 --workers 12` (2 lần) | **16 passed / 0 failed** mỗi lần; 32 dòng `DBLCLICK_E2E [] of 60` |
| E2E cross-tab + AC8 | `playwright test tests/qc/m2-notify.spec.ts e2e/m2-reminder.spec.ts -g "two tabs\|AC8" --repeat-each 10 --workers 8` | 30 passed |
| Như trên, nặng hơn | `... --repeat-each 20 --workers 12` | 60 passed |
| Unit QC mới | `npx vitest run tests/qc/m2-r3-domain.test.ts` x3 | 5/5 mỗi lần |
| E2E đầy đủ | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` x3 | **200 passed / 0 failed** ở cả 3 lần (53,2 đến 54,1 s): dev M1 20 + QC M1 + dev M2 13 + QC M2 |
| Audit | `npm audit` | found 0 vulnerabilities |

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M2-AC1 | PASS | `m2-qc.spec.ts` AC1-AC3, service `TIMER_ALREADY_RUNNING`/`GOAL_NOT_ACTIVE`/`TIMER_NOT_RUNNING` xanh; bấm đúp Start không còn alert thừa (D4 FIXED), luôn đúng 1 timer |
| M2-AC2 | PASS | reload, đóng/mở trang, offline xanh |
| M2-AC3 | PASS | Stop, làm tròn, Save `source=timer`, ma trận lỗi dialog xanh |
| M2-AC4 | PASS | qua nửa đêm, ngoài khoảng goal, cap 1440 xanh |
| M2-AC5 | PASS | xoá goal khác giữ timer, xoá goal đang chạy huỷ timer xanh (3 lần chạy đầy đủ) |
| M2-AC6 | PASS | ô giờ en-US/vi-VN bằng bàn phím thật lưu đúng, 4 trạng thái quyền, text NFR-07 xanh (`m2-r2.spec.ts` 40 test xanh) |
| M2-AC7 | PASS | `m2-domain.test.ts` xanh |
| M2-AC8 | PASS (tự động) / NOT VERIFIED (thủ công) | `m2-notify.spec.ts` và `e2e/m2-reminder.spec.ts` AC8 xanh 90/90 trong các lần lặp có tải; thủ công: mục 8 |
| M2-AC9 | PASS (unit + SW thật) / NOT VERIFIED (focus, openWindow) | như r1/r2 |
| M2-AC10 | PASS | banner `denied` / không có `Notification` xanh |
| M2-AC11 | PASS (tự động) / NOT VERIFIED (lịch thật) | `.ics` RFC 5545 xanh; mục 8 |
| M2-AC12 | PASS | toàn bộ spec M1 và QC M1 xanh, axe 0 serious/critical, 0 request ngoài origin |
| M2-AC13 | PASS | quét vi 0 phát hiện, 360 px không cuộn ngang (6 tên dài x en/vi) |

## 4. Defect
Không có defect mới (không có M2-D5).

## 5. Kiểm lại defect vòng trước

| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M2-D1 (Major) gõ giờ nhắc sai | **FIXED** (giữ nguyên) | `m2-qc.spec.ts` "M2-D1" và `m2-r2.spec.ts` xanh trong 3 lần chạy đầy đủ |
| M2-D2 (Minor) tràn ngang 360 px | **FIXED** (giữ nguyên) | 12 ca tên dài xanh |
| M2-D3 (Minor) không nguyên tử khi gọi đồng thời | **FIXED** (service, UI, và cross-tab cho nhắc nhở) | `m2-r2-domain.test.ts` 9 test xanh; thêm `m2-r3-domain.test.ts`. Giới hạn còn lại: `TimerService.save` hai tab bấm Save đúng cùng lúc vẫn có thể tạo 2 entry (dev đã ghi, chuyển M3); không tính defect |
| M2-D4 (Major) chặn bấm đúp Start còn hở | **FIXED** | Vitest 10/10 (22/22 test mỗi lần); Chromium 90/90 + 16/16 + 16/16, 0 alert / 1920 lần bấm đúp. Round 2 cùng bài: 4/12 và 7/16 lần đỏ |

Đánh giá code sửa D4 (`GoalCard.tsx`, `Today.tsx`): cờ `starting` chỉ hạ khi `start` lỗi hoặc khi prop `timer !== 'none'` (effect), nên lần bấm thứ hai không thể lọt vào khoảng hở giữa "start xong" và "liveQuery phát lại". `Today.pendingTimer` lấy từ kết quả `start()` thành công nên TimerCard, badge và `aria-disabled` của goal khác hiện ngay, và bị xoá khi `timer.data` đổi. Không tìm thấy đường race trong cùng một tab. Một kẽ hở lý thuyết, đánh giá Minor và không tái hiện được: nếu timer vừa start vừa bị xoá bởi tab khác trước khi liveQuery phát lại thì `pendingTimer` có thể còn treo tới lần phát kế tiếp.

Kiểm claim nhắc nhở (`m2-r3-domain.test.ts`, 5 test): show() ném lỗi thì `lastReminderDate` về đúng ngày trước đó (không về null) và check kế tiếp gửi lại; show() trả false thì về null và gửi lại được; trong lúc show() treo, tab khác thấy claim (claim lần hai trả false), người dùng đổi `reminderTime` giữa chừng thì cả claim lẫn release không ghi đè (21:15 còn nguyên, `reminderEnabled` còn); `releaseReminderDay` không huỷ claim của ngày khác; 30 claim đồng thời đúng 1 thắng, 5 `check` đồng thời gọi `show` đúng 1 lần.

## 6. Regression
- Dev M1 (20) và QC M1 (`m1-domain.test.ts`, `m1-qc*.spec.ts`, `m1-r2.spec.ts`) xanh trong 3/3 lần chạy đầy đủ.
- M2 r1/r2 (`m2-qc.spec.ts`, `m2-notify.spec.ts`, `m2-domain.test.ts`, `m2-r2*.ts`) xanh, kể cả test trước đây ngẫu nhiên đỏ. Vitest 339/339.
- Gói JS 206,98 kB gzip (r2: 206,74 kB).

## 7. Bảo mật
- Không secret trong repo, `.env` không nằm trong git, `npm audit` 0 lỗ hổng, 0 request ngoài origin.
- `KvRepository.update` chạy trong transaction `rw` của Dexie; hàm cập nhật chỉ nhận dữ liệu nội bộ, đi qua `normalizeSettings`; không có đường input người dùng mới.

## 8. Chưa kiểm chứng được (NOT VERIFIED)
1. **Bấm notification thật (M2-AC8/AC9).** Sự kiện tổng hợp trong SW không gọi được `WindowClient.focus()`. User kiểm trên Chrome/Edge desktop: `npm run build && npm run preview`, mở `http://localhost:4173`, tạo goal; Settings, bật Daily reminder, bấm Allow; đặt giờ nhắc = giờ hiện tại + 1 phút (gõ phím bình thường); chờ tối đa 60 s hoặc chuyển tab rồi quay lại: có 1 notification "1% Better, 1 goal left today: ..."; bấm vào thì cửa sổ app lên trước ở `#/today`. Đóng cửa sổ app rồi bấm notification còn lại (hoặc sang ngày sau): mở cửa sổ mới ở Today. Trong cùng ngày không có notification thứ hai (mở thêm một tab thứ hai của app cũng không tạo thêm).
2. **Import `.ics` vào lịch thật (M2-AC11).** Settings, Add reminder to calendar (.ics), mở file bằng Google Calendar (Settings, Import & export), Outlook hoặc Apple Calendar: mong đợi sự kiện lặp hằng ngày từ ngày mai lúc giờ nhắc, dài 15 phút, nhắc đúng lúc bắt đầu, tiêu đề đúng ngôn ngữ đang chọn.
3. **Hộp xin quyền thật.** Bật switch lần đầu: trình duyệt hiện hộp xin quyền; Allow thì chip `Allowed`; Block thì chip `Blocked` và banner vẫn hiện sau giờ nhắc.
4. **Popup chọn giờ của trình duyệt** (bấm biểu tượng đồng hồ trong ô giờ, chọn bằng chuột): chọn 07:30, ô hiện 07:30, toast `Reminder time saved` một lần, reload vẫn 07:30.
5. **iOS 16.4+ / Android Chrome:** không có thiết bị; đặc biệt thử ô giờ (bộ chọn gốc và bàn phím ảo khác Chromium desktop) và bấm đúp nhanh Start trên cảm ứng.

## 9. Đề xuất (không chặn) và ghi chú deviation cho planner
- **Deviation so với ARCHITECTURE (planner cập nhật):**
  - (a) `KvRepository` (§5.2) có thêm `update(key, fn)` trả `{ previous, written }`: read-modify-write trong một transaction `rw`; `fn` trả `undefined` thì không ghi.
  - (b) `SettingsService` có thêm `claimReminderDay(date)` (trả boolean) và `releaseReminderDay(date, previous)`.
  - (c) `ReminderService.check` nay claim ngày trước khi gửi, hoàn lại claim khi gửi hỏng; hành vi ngoài giữ nguyên (trả boolean, không đánh dấu ngày khi chưa hiển thị được).
  - (d) `reminder-scheduler` ghi nhớ trigger đến giữa lúc `check` đang chạy và chạy thêm đúng một lần.
  - (e) `Today` giữ `pendingTimer` (trạng thái lạc quan) và `GoalCard` hạ cờ chặn bằng effect theo prop `timer`.
  - Nếu sau này có repository khác ngoài Dexie thì phải cài `update` nguyên tử tương đương.
- Giới hạn còn lại cho M3: `TimerService.save` hai tab đúng cùng lúc có thể tạo 2 entry (cần transaction kv + entries).
- Chi tiết nhỏ: nếu `show()` hỏng và claim được hoàn lại, tab kia (đã bị từ chối ở lần check đó) chỉ gửi ở lần quét kế tiếp. Chấp nhận được.
- Đề xuất cũ còn lại: `aria-describedby` cho ô `Reminder time` nối với dòng "Adds a repeating daily event at ..."; tie-break sắp xếp theo `createdAt` (M1-P1); đưa `goal.delete.timerNote` vào mô tả dialog xoá cho trình đọc màn hình.

## Tệp QC thêm hoặc đổi trong round 3
- `tests/qc/m2-r3-domain.test.ts` (5 test: claim/release nhắc nhở, khôi phục ngày cũ, không ghi đè settings, claim đồng thời).
- Không đổi file QC cũ; không sửa source, unit test của dev, hay `docs/plan|design|handoff`.
