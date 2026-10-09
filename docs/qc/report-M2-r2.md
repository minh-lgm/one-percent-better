# QC report — M2 round 2

**Verdict:** FAIL
**Ngày:** 2026-10-10  **Commit:** 86165cb (code sửa ở ab008e6; working tree: QC bỏ các đánh dấu "cố ý đỏ" của round 1 và thêm `tests/qc/m2-r2*`)

## 1. Tóm tắt
- Cả ba defect của round 1 đã được sửa: **M2-D1 FIXED** (gõ phím thật ở en-US và vi-VN ra đúng giá trị, lưu đúng, còn sau reload), **M2-D2 FIXED** (không còn cuộn ngang ở 360 px với 6 kiểu tên dài, en và vi), **M2-D3 FIXED ở mức service** (Mutex tuần tự hoá; 50 `start`/`save` đồng thời chỉ tạo 1 timer/1 entry; lỗi giữa chừng không treo mutex).
- Verdict **FAIL** vì một defect mới, **M2-D4 (Major)**, nằm ở phần sửa D3 phía UI: chặn bấm đúp `Start` của `GoalCard` còn hở. Hậu quả có hai mặt: (a) test hồi quy của chính dev `Today.timer.test.tsx` "double-clicking Start starts once…" đỏ ngẫu nhiên (2/7 lần chạy toàn bộ Vitest, 2/6 lần chạy riêng) nên `npm run check` (lệnh gate trong README) không ổn định; (b) trên Chromium thật, khi máy bận, bấm đúp `Start` thỉnh thoảng hiện lỗi "A timer is already running. Stop it before starting another." dưới goal dù timer đã chạy đúng, và thông báo này không tự mất sau 2 s.
- Mọi AC M2-AC1…AC13 vẫn đạt ở phần tự động; không có lỗi bảo mật; `npm audit` 0 lỗ hổng; regression M1 xanh.
- `NOT VERIFIED` (không đổi so với round 1): bấm notification thật trên Chrome desktop, import `.ics` vào lịch thật, hộp xin quyền thật, popup chọn giờ của trình duyệt, iOS/Android. Orchestrator cần hỏi user (mục 8).
- Test QC đã đổi: bỏ `test.fail()` ở "M2-D2" trong `tests/qc/m2-qc.spec.ts` và 3 `it.fails` M2-D3 trong `tests/qc/m2-domain.test.ts` (defect đã sửa, test chạy xanh thật). Sửa một race trong test QC "AC5" của chính QC (đọc IndexedDB ngay sau khi bấm xác nhận xoá; nay chờ dialog đóng và dùng `expect.poll`).

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2, Playwright Chromium (`PLAYWRIGHT_BROWSERS_PATH=0`), `node_modules` có sẵn, chạy tại project root. Dựng theo handoff (`npm run build` + `vite preview` qua `webServer` của Playwright).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint | `npm run lint` | exit 0, 0 lỗi, 0 warning (gồm file QC mới) |
| Typecheck | `npm run typecheck` | exit 0 |
| Vitest | `npx vitest run` | Lần đầu: 41 file, 316/316 passed. Các lần sau: 42 file, 325/325 (4 lần), nhưng 1 lần `1 failed / 324 passed` và 1 lần trong `npm run check` `1 failed / 315 passed`: luôn là `Today.timer.test.tsx > double-clicking Start starts once and shows no error (M2-D3 UI regression)` với `AssertionError: expected "start" to be called 1 times, but got 2 times` (M2-D4). Chạy riêng file đó 6 lần: 4 xanh, 2 đỏ |
| Gate | `npm run check` | exit 1 ở lần chạy đầu do đúng test nói trên (chuỗi dừng trước `build`) |
| Build | `npm run build` | exit 0; `index-*.js` 672,64 kB raw / 206,74 kB gzip (≤ 250 kB); precache 15 entry |
| E2E | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | 200 test (dev M1+M2, QC M1+M2 r1+r2). Ba lần chạy đầy đủ cuối: 199 passed / 1 failed mỗi lần. Lần 1: dev `e2e/m2-reminder.spec.ts` "M2-AC8…" (mục 9); lần 2 và 3: test QC cho M2-D4 (`m2-r2-dblclick.spec.ts`, `m2-r2.spec.ts` "two clicks 0 ms apart") |
| Audit | `npm audit` | found 0 vulnerabilities |

Bằng chứng riêng cho D4: `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test tests/qc/m2-r2-dblclick.spec.ts --repeat-each 12 --workers 12` cho 4 failed / 8 passed (lần khác 7 failed / 9 passed trong 16). Output mẫu: `DBLCLICK_E2E [{"gap":0,"alert":true,"text":"A timer is already running. Stop it before starting another.","stillAfter2s":true}]`. Chạy một worker, máy rảnh: 0/60 lỗi (không tái hiện).

## 3. Acceptance criteria
Bằng chứng: test QC (`tests/qc/m2-*`) chạy lại độc lập, cộng test khám phá round 2.

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M2-AC1 | PASS | `m2-qc.spec.ts` AC1-AC3 xanh; service `TIMER_ALREADY_RUNNING`, `GOAL_NOT_ACTIVE`, `TIMER_NOT_RUNNING` xanh. Lưu ý D4: bấm đúp Start nhanh có thể hiện alert thừa (timer vẫn đúng 1) |
| M2-AC2 | PASS | reload, đóng/mở trang, offline xanh (spec r1 chạy lại) |
| M2-AC3 | PASS | Stop, làm tròn, Save `source=timer`; ma trận lỗi dialog xanh |
| M2-AC4 | PASS | qua nửa đêm, ngoài khoảng goal, cap 1440 xanh |
| M2-AC5 | PASS | xoá goal khác giữ timer, xoá goal đang chạy huỷ timer (đã sửa race test QC, xanh 3/3 lần chạy riêng) |
| M2-AC6 | PASS | Đổi giờ bằng bàn phím thật nay lưu đúng: 7 chuỗi en-US (`0730AM`→07:30, `1245PM`→12:45, `1200AM`→00:00, `1159PM`→23:59, `0100PM`→13:00, `0945PM`→21:45, `1200PM`→12:00): input, kv `settings.reminderTime`, đúng 1 toast, còn sau `reload`. vi-VN xanh. 4 trạng thái quyền, text NFR-07 xanh |
| M2-AC7 | PASS | `m2-domain.test.ts` xanh |
| M2-AC8 | PASS (tự động) / NOT VERIFIED (thủ công) | `m2-notify.spec.ts` xanh; thủ công: mục 8 |
| M2-AC9 | PASS (unit + SW thật) / NOT VERIFIED (focus, openWindow) | như r1 |
| M2-AC10 | PASS | banner `denied` / không có `Notification` xanh |
| M2-AC11 | PASS (tự động) / NOT VERIFIED (lịch thật) | `.ics` RFC 5545 xanh; mục 8 |
| M2-AC12 | PASS | toàn bộ spec M1 và QC M1 xanh, axe 0 serious/critical (kể cả Settings sáng/tối với ô giờ mới), 0 request ngoài origin |
| M2-AC13 | PASS | vi-VN: quét vi 0 phát hiện ở Settings (ô giờ), axe 0, 360 px không cuộn ngang; 6 tên dài x en/vi không cuộn ngang |

## 4. Defect

### M2-D4 — Chặn bấm đúp `Start` còn hở: lần bấm thứ hai đôi khi vẫn gọi `timerService.start` và hiện lỗi "A timer is already running"; test hồi quy của dev đỏ ngẫu nhiên  [Major]
- Bước tái hiện:
  1. `npx vitest run src/ui/screens/Today.timer.test.tsx`, lặp 6 lần (hoặc `npm run check` vài lần). Kết quả thật: 4 lần xanh, 2 lần đỏ `expected "start" to be called 1 times, but got 2 times` (`Today.timer.test.tsx:191`).
  2. Trên Chromium thật: `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test tests/qc/m2-r2-dblclick.spec.ts --repeat-each 12 --workers 12` (tạo tải CPU). Test tạo goal Read, vào Today, bấm `Start timer` hai lần liên tiếp bằng `page.mouse.click` cùng toạ độ (gap 0 ms), xoá timer rồi lặp.
  3. Thủ công: bấm đúp nhanh nút `Start timer` khi máy đang bận (hoặc CPU throttling 4x trong DevTools).
- Mong đợi: M2-AC1 và FR-11, một timer; bấm đúp không hiện lỗi (handoff Fix log của dev ghi `GoalCard` "ignores a double-click on Start").
- Thực tế: timer vẫn đúng 1 và chạy đúng, nhưng dưới thẻ goal hiện `role="alert"` "A timer is already running. Stop it before starting another." và còn nguyên sau 2 s (`stillAfter2s: true`). Tỉ lệ ở Chromium thật khi máy bận: 4/12 và 7/16 lần chạy lặp có ít nhất một lần bấm đúp gap 0 bị; ở jsdom: 3/12 lần `userEvent.dblClick` bị `start` gọi 2 lần kèm alert (QC thử bằng file thăm dò tạm, không giữ lại vì ngẫu nhiên).
- Vị trí nghi ngờ: `src/ui/components/GoalCard.tsx` (`startTimer`): cờ `starting` được hạ trong `finally` ngay khi `onStartTimer()` xong, trong khi prop `timer` chỉ đổi sau khi liveQuery render lại; lần bấm thứ hai rơi vào khoảng hở giữa hai thời điểm đó nên `timer === 'none'` và `starting.current === false`.
- Vì sao Major: (a) `npm run check` là lệnh gate ghi trong README, nay đỏ ngẫu nhiên (~30%) do chính test hồi quy của phần sửa D3; (b) báo lỗi sai (cho thao tác đã thành công) ở luồng chính Start timer.

## 5. Kiểm lại defect vòng trước

| Defect | Trạng thái | Ghi chú |
| :- | :- | :- |
| M2-D1 (Major) gõ giờ nhắc sai | **FIXED** | `m2-qc.spec.ts` "M2-D1" xanh. Round 2 (`m2-r2.spec.ts`): 7 chuỗi en-US bằng `keyboard.press` từng phím, `keyboard.type` có delay 120 ms, `locator.pressSequentially`: kv và input khớp từng bước, đúng 1 toast, còn sau `reload`. Mũi tên nhanh x5 ở ô phút: 17:30 thành 17:25 (r1: chỉ ăn 2 lần). ArrowUp x7 ở ô giờ đúng. vi-VN (bộ chọn 12 giờ SA/CH): `hhmm` + chỉnh SA/CH bằng bàn phím cho 07:30, 19:45, 00:00, 23:59, 12:00, đều lưu đúng và còn sau reload. Xoá bằng Backspace/Delete/Ctrl+A: ô rỗng khi đang focus, **không lưu** (kv giữ 20:00), blur trả về giá trị đã lưu, không toast. Giá trị không hợp lệ (setter gốc cộng sự kiện input/change: 25:99, 7:5, abc) bị bỏ qua; `fill` 23:59 và 00:00 lưu đúng. Chỉ gõ giờ rồi blur: lưu là HH:MM hợp lệ và bằng giá trị ô hiển thị. Gõ lại đúng giá trị đã lưu: không toast. Escape không đổi gì, không điều hướng. Tab ra ngoài đẩy toast ngay. Tab khác đổi giờ trong lúc đang sửa: tab này kết thúc đúng giá trị mình gõ. Nhãn gắn đúng (label = `Reminder time`, `type=time`), vô hiệu khi tắt nhắc, axe sáng/tối 0 serious/critical |
| M2-D2 (Minor) tràn ngang ở 360 px | **FIXED** | Bỏ `test.fail()`; test "M2-D2" xanh. Thêm 12 ca: 6 kiểu tên (60 chữ W, URL 56 ký tự, 60 chữ Ế, từ tiếng Việt dài không dấu cách, 60 chữ Hán, 60 dấu gạch dưới) x en-US/vi-VN: Today, TimerCard, dialog Stop (nằm trong khung 0 đến 360 px), trang Goals đều không cuộn ngang |
| M2-D3 (Minor) không nguyên tử khi gọi đồng thời | **FIXED (service)**; hở ở UI, xem M2-D4 | Bỏ `.fails` ở 3 test; chạy xanh. `m2-r2-domain.test.ts` (9 test): Mutex đúng thứ tự, không chồng chéo; task reject hoặc throw đồng bộ không làm treo task sau; 200 task xếp hàng; `save` bị `entries.add` lỗi một lần: lời gọi đó reject, lời gọi xếp hàng sau vẫn chạy và tạo đúng 1 entry, timer được xoá, `start`/`discard` sau đó bình thường; `start` bị `goals.get` lỗi không treo; `ReminderService.check`: `show` throw một lần thì check sau vẫn gửi đúng 1 lần, `show` trả false không đánh dấu đã gửi; 50 `start` đồng thời (3 goal) đúng 1 ok; 50 `save` đồng thời đúng 1 entry. Giới hạn đã nêu của dev (hai tab bấm đúng cùng lúc) là giới hạn kiến trúc có ghi lại, không tính là defect |

## 6. Regression
- Toàn bộ spec M1 của dev (20) và test QC M1 (`m1-domain.test.ts`, `m1-qc*.spec.ts`, `m1-r2.spec.ts`) xanh trong cả ba lần chạy đầy đủ; Vitest 325/325 khi không dính D4.
- M2 r1: `m2-qc.spec.ts`, `m2-notify.spec.ts` xanh, kể cả M2-D1 và M2-D2 (không còn đánh dấu cố ý đỏ).
- Gói JS 206,74 kB gzip (r1: 206,48 kB).

## 7. Bảo mật
- Không đổi so với r1: không secret, `.env` không nằm trong git, `npm audit` 0 lỗ hổng, 0 request ngoài origin và 0 pageerror/console.error trong các luồng mới, `NAVIGATE` của SW chỉ nhận hash hợp lệ.
- Ô giờ mới: giá trị đi qua `isValidReminderTime` trước khi lưu; chuỗi rác không vào kv (đã thử 25:99, 7:5, abc, rỗng).

## 8. Chưa kiểm chứng được (NOT VERIFIED)
1. **Bấm notification thật (M2-AC8/AC9).** Sự kiện tổng hợp trong SW không gọi được `WindowClient.focus()`. User kiểm trên Chrome/Edge desktop: `npm run build && npm run preview`, mở `http://localhost:4173`, tạo goal; Settings, bật Daily reminder, bấm Allow; đặt giờ nhắc = giờ hiện tại + 1 phút (gõ phím bình thường); chờ tối đa 60 s hoặc chuyển tab rồi quay lại: có 1 notification "1% Better, 1 goal left today: ..."; bấm vào thì cửa sổ app lên trước ở `#/today`. Đóng cửa sổ app rồi bấm notification còn lại (hoặc sang ngày sau): mở cửa sổ mới ở Today. Trong cùng ngày không có notification thứ hai.
2. **Import `.ics` vào lịch thật (M2-AC11).** Settings, Add reminder to calendar (.ics), mở file bằng Google Calendar (Settings, Import & export), Outlook hoặc Apple Calendar: mong đợi sự kiện lặp hằng ngày từ ngày mai lúc giờ nhắc, dài 15 phút, nhắc đúng lúc bắt đầu, tiêu đề đúng ngôn ngữ đang chọn.
3. **Hộp xin quyền thật.** Bật switch lần đầu: trình duyệt hiện hộp xin quyền; Allow thì chip `Allowed`; Block thì chip `Blocked` và banner vẫn hiện sau giờ nhắc.
4. **Popup chọn giờ của trình duyệt** (bấm biểu tượng đồng hồ trong ô giờ, chọn bằng chuột): Playwright không điều khiển được. Kiểm: chọn 07:30, ô hiện 07:30, toast `Reminder time saved` một lần, reload vẫn 07:30.
5. **iOS 16.4+ / Android Chrome:** không có thiết bị (bộ chọn giờ gốc và bàn phím ảo khác Chromium desktop nên đặc biệt cần thử ô giờ).

## 9. Đề xuất (không chặn)
- Sửa D4: giữ cờ chặn đến khi prop `timer` đã phản ánh timer đang chạy, hoặc bỏ qua `TIMER_ALREADY_RUNNING` khi chính goal đó là goal đang chạy.
- Test `e2e/m2-reminder.spec.ts` "M2-AC8..." của dev đỏ ngẫu nhiên khi máy bận (1/24 với `--repeat-each 24 --workers 12`; 1/3 lần chạy đầy đủ): `expect.poll` số notification vẫn 0 sau 10 s kể từ `advanceTo(20:01)`. QC chưa đủ bằng chứng để kết luận lỗi ứng dụng (nếu lần kiểm đầu `show()` trả false thì `lastReminderDate` không bị đánh dấu và lần quét theo chu kỳ sau sẽ gửi lại). Nên dev xem lại độ ổn định (đợi controller/SW sẵn sàng hoặc dùng spy như `m2-notify.spec.ts`).
- Ô `Reminder time` chưa có `aria-describedby` (không có yêu cầu trong AC); có thể nối với dòng "Adds a repeating daily event at {time}".
- Đề xuất cũ từ r1 còn lại: tie-break khi sắp xếp theo `createdAt` (M1-P1); đưa `goal.delete.timerNote` vào mô tả dialog xoá cho trình đọc màn hình.

## Tệp QC thêm hoặc đổi trong round 2
- `tests/qc/m2-qc.spec.ts`: bỏ `test.fail()` ở "M2-D2"; sửa race trong "AC5".
- `tests/qc/m2-domain.test.ts`: bỏ `.fails` ở 3 test M2-D3.
- `tests/qc/m2-r2-domain.test.ts` (9 test: Mutex và lỗi giữa chừng của TimerService/ReminderService).
- `tests/qc/m2-r2.spec.ts` (40 test E2E: ô giờ en-US/vi-VN, tên dài 360 px en/vi, bấm đúp Start theo khoảng cách 0 đến 150 ms).
- `tests/qc/m2-r2-dblclick.spec.ts` (1 test E2E, 60 lần bấm đúp; đỏ ngẫu nhiên khi máy bận cho tới khi M2-D4 được sửa).
