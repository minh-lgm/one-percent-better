# QC report — M2 round 1

**Verdict:** FAIL
**Ngày:** 2026-10-10  **Commit:** b3bdb3d (code M2 ở f2e9cae; working tree: QC thêm `tests/qc/m2-domain.test.ts`, `m2-qc.spec.ts`, `m2-notify.spec.ts`)

## 1. Tóm tắt
- Build/lint/typecheck/test sạch; 12/13 AC đạt về mặt tự động. **M2-AC6 FAIL** vì M2-D1 (Major): đổi giờ nhắc bằng cách gõ phím vào ô giờ cho kết quả sai (gõ `07:30` lưu `15:00`). E2E của dev chỉ dùng `fill('07:30')` (gán giá trị một lần) nên không bắt được lỗi này.
- 2 defect Minor: M2-D2 (tên goal 60 ký tự liền nhau làm TimerCard kéo trang cuộn ngang ở 360 px), M2-D3 (TimerService/ReminderService không nguyên tử khi gọi đồng thời: 2 `save` tạo 2 entry, 2 `start` đều thành công, 2 `check` gửi 2 lần).
- Bản dịch M2 đối chiếu máy với DESIGN.md: 224/224 key có mã MS đều khớp nguyên văn `en` và `vi` (không sai khác). Quét vi, axe (sáng và tối), 0 request ngoài origin, 0 lỗi console/pageerror trong các luồng đã chạy.
- `NOT VERIFIED` (không kiểm được trong môi trường này, hướng dẫn ở mục 8): bấm notification thật trên Chrome desktop (focus cửa sổ / `openWindow`), import `.ics` vào Google/Outlook/Apple Calendar, hộp xin quyền thật, iOS/Android. Orchestrator cần hỏi user về các phần này.
- Verdict FAIL theo quy tắc: còn 1 defect Major mở và AC6 không đạt.

## 2. Môi trường và lệnh đã chạy
Windows 11, Node v22.14.0, npm 10.9.2, Playwright Chromium (`PLAYWRIGHT_BROWSERS_PATH=0`). Chạy tại project root. Dùng `node_modules` có sẵn (không chạy lại `npm ci`; bước dựng theo mục "Cách chạy" của handoff: `npm run build` + `vite preview` qua `webServer` của Playwright). Test notification dùng `test.use({ channel: 'chromium' })` như dev.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Lint | `npm run lint` | exit 0, 0 lỗi, 0 warning (gồm cả file QC mới) |
| Typecheck | `npm run typecheck` | exit 0 |
| Vitest | `npm test` | 39 file, 304 passed + 3 expected-fail (`it.fails`, M2-D3) / 0 failed. Trước khi thêm file QC: 38 file, 276/276 |
| Build | `npm run build` | exit 0; `index-*.js` 671,61 kB raw / 206,48 kB gzip (≤ 250 kB); precache 15 entry; `dist/sw.js` có `notificationclick` và `NAVIGATE` |
| E2E (trước khi thêm spec QC M2) | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | 120 passed, 0 failed (24,9 s) |
| E2E sau khi thêm spec QC M2 | `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test` | 157 passed, **1 failed** (`m2-qc.spec.ts` "M2-D1: typing a time with the keyboard…", lỗi thật của app) |
| Audit | `npm audit` | found 0 vulnerabilities |
| Bảo mật tĩnh | `git ls-files` lọc `.env`; `git grep` secret/innerHTML/eval/fetch trong `src`; `grep` URL trong `dist` | không có `.env` trong repo (chỉ `.env.example`); 0 secret; 0 `dangerouslySetInnerHTML`/`eval`/`fetch`/XHR/WebSocket trong `src` (chỉ `innerHTML` trong test jsdom); URL trong bundle chỉ là namespace SVG/XML và link trong thông báo lỗi thư viện (react, zod, date-fns, workbox), không có lời gọi mạng |
| Đối chiếu copy | script so `en.json`/`vi.json` với bảng DESIGN.md (mọi dòng có MS M1–M5) | 224 key khớp nguyên văn, 0 sai khác, 0 thiếu |

## 3. Acceptance criteria
Bằng chứng là test QC tự viết (`tests/qc/m2-*`), chạy độc lập với bảng tự kiểm của dev.

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M2-AC1 | PASS | `m2-qc.spec.ts` "AC1-AC3…": Start → `00:00:00`, tua 65 s → `00:01:05` (cũng có trong E2E dev); Start của goal khác `aria-disabled` + mô tả, click không đổi timer. Service: `TIMER_ALREADY_RUNNING`, `GOAL_NOT_ACTIVE` (upcoming/ended), `TIMER_NOT_RUNNING` (dev `timer-service.test.ts` xanh; QC `m2-domain.test.ts` bổ sung timer hỏng trong kv). Thêm: double-click Start → 1 timer, không Alert lỗi; đồng hồ lùi → `00:00:00`; 100 h → `100:00:00`. |
| M2-AC2 | PASS | Start, tua 25:31, `page.reload()` → `00:25:3x` và tiếp tục chạy; đóng page, mở page mới cùng context sau 3 h → `03:00:07`. Offline (SW active, `setOffline(true)`, reload): Start/Stop/Save vẫn chạy (`5/30`). |
| M2-AC3 | PASS | Stop ở 25:31 → ô Minutes `26`, focus ở ô Minutes, "Saved to Friday, October 9"; sửa 25 + note "Pomodoro", Save → `25/30`, IndexedDB: `{minutes 25, note 'Pomodoro', source 'timer', date '2026-10-09'}`, `activeTimer` null. Discard sau 10 phút → không entry mới, toast `Timer discarded`. Làm tròn 25:29→25, 25:30→26, 0:10→1, 1500→1440 (`m2-domain.test.ts`, kèm số âm và Infinity). Ma trận lỗi trong dialog: `0`, `1441`, `12.5`, rỗng, `abc`, `-5`, `1e1`, `0x1E`, `+30`, `30 min`, `99999999999999999999` đều bị từ chối inline (`aria-invalid`), timer còn; note 281 ký tự bị từ chối; ` 10 ` được nhận. |
| M2-AC4 | PASS | E2E: start 23:50 ngày 10-09, đến 00:20 ngày 10-10: header "Saturday, October 10", timer `00:30:00`, dialog `30` + "Saved to Friday, October 9", Save → entry `date 2026-10-09`, Today (10-10) vẫn `0/30`. Goal kết thúc đúng ngày 10-09: sau nửa đêm TimerCard vẫn hiện, Save vào 10-09 thành công. Ngoài khoảng goal → `DATE_OUTSIDE_GOAL_PERIOD`, timer còn (dev service + component test xanh). Vượt giới hạn 1440 phút/ngày (đã có 1400, thêm 41) → lỗi trong dialog, timer còn; thêm 40 thì lưu được. |
| M2-AC5 | PASS | UI: xoá goal KHÔNG chạy timer (D2 không có `timerNote`) → timer còn nguyên; xoá goal đang chạy (D2 có "Its running timer will be discarded.") → `activeTimer` null, Today không có TimerCard, 0 alert. Service: xoá goal khác giữ timer. |
| M2-AC6 | **FAIL** | Mặc định tắt/`20:00`/ô giờ vô hiệu; 4 trạng thái quyền hiển thị đúng (`default` với nút Allow, `granted`, `denied` chip Blocked + mô tả, `unsupported` khi xoá `window.Notification`); text NFR-07 + iOS có; banner theo dõi giờ nhắc ngay (đổi 21:00 → banner mất, 20:15 → "past 20:15"). **Nhưng gõ giờ bằng bàn phím cho giá trị sai: M2-D1.** `fill('07:30')` (gán một lần) thì lưu đúng và còn sau reload. |
| M2-AC7 | PASS | `m2-domain.test.ts`: bảng chân trị 5 điều kiện, biên 19:59:59.999 / 20:00:00.000, `00:00` và `23:59`, giờ sai định dạng không bao giờ bắn; upcoming/ended không tính; body `en` = `3 goals left today: Read 0/30 min, Guitar 0/20 min, Spanish 0/17 min` (dev) và `4 goals … and 1 more` (QC). |
| M2-AC8 | PASS (tự động) / NOT VERIFIED (thủ công) | `m2-notify.spec.ts` (Chromium đầy đủ, `grantPermissions`), đếm lời gọi `showNotification` bằng spy (không dựa vào `getNotifications` vì `tag` che trùng): 19:59:59 → 0; 20:00:00 → 1; thêm 4 lần `visibilitychange` + reload + 22:00 → vẫn 1 (`lastReminderDate = 2026-10-09`); 00:05 hôm sau → vẫn 1; 20:00:10 hôm sau → 2. Nhắc tắt → 0; goal đã đạt → 0, không banner. Nội dung `title '1% Better'`, `lang en`, `tag daily-reminder`, `data.url '#/today'`, `icon /icons/pwa-192.png` (fetch 200). Hai tab cùng mở, kích hoạt lần lượt → 1 lần (chạy đồng thời hoàn toàn thì thành 2: M2-D3). Thủ công trên Chrome desktop: mục 8. |
| M2-AC9 | PASS (unit + một phần SW thật) / NOT VERIFIED (focus, openWindow) | Dev `notification-click.test.ts` xanh. QC trên SW thật: `notificationclick` tổng hợp đóng notification (`getNotifications` → 0); `postMessage {type:'NAVIGATE'}` từ SW đưa tab đang mở từ `#/goals` sang `#/today`; hash lạ (`javascript:alert(1)`, `#/../../etc`) bị bỏ qua. Sự kiện tổng hợp không gọi được `WindowClient.focus()` ("Not allowed to focus a window") nên focus và `clients.openWindow` chỉ kiểm thủ công. |
| M2-AC10 | PASS | Quyền `denied`, 20:30, G1 chưa đạt → banner "It's past 20:00 — 1 goal is not on target yet."; 19:59 không có (dev); ghi 30 phút → banner mất không reload; tắt nhắc → mất; danh sách chỉ đếm goal active (upcoming/ended bị bỏ qua); trình duyệt không có `Notification` → banner vẫn hoạt động, 0 pageerror. |
| M2-AC11 | PASS (tự động) / NOT VERIFIED (import vào lịch thật) | `ics.ts`: đủ thuộc tính AC; CRLF thuần (không LF/CR lẻ), VCALENDAR/VEVENT/VALARM lồng đúng, `DTSTART` floating không `Z`, `DTSTAMP` UTC; "ngày mai" đúng ở ranh giới tháng/năm/nhuận (2026-12-31 → 20270101, 2028-02-28 → 20280229, 2028-02-29 → 20280301) và giờ `00:00`/`23:59`. E2E: tên `1percent-better-reminder.ics`, byte UTF-8 không BOM, mọi dòng ≤ 75 octet, UID khác nhau mỗi lần tải (`<uuid>@one-percent-better`), giờ nhắc 07:30 vào `DTSTART:20261010T073000`. Múi giờ `America/Los_Angeles` lúc 23:30 → `DTSTART` ngày kế tiếp theo giờ địa phương, `DTSTAMP` theo UTC. Fuzz folding 400 chuỗi (dấu tiếng Việt, emoji, ký tự tổ hợp): ≤ 75 octet, unfold khôi phục nguyên văn, không cắt giữa ký tự UTF-8. Import vào lịch thật: mục 8. |
| M2-AC12 | PASS | Toàn bộ spec M1 và QC M1 xanh (regression). axe (serious/critical = 0): Today có timer + banner, dialog Stop, Settings (giao diện sáng và tối, quyền `denied`), vi-VN dialog Stop. 0 request ngoài origin, 0 `console.error`/`pageerror`, 0 hộp thoại JS trong các luồng timer/Settings/`.ics`/notification. |
| M2-AC13 | PASS | Service/unit: body `en`/`vi` đúng (`Hôm nay còn 4 mục tiêu: … và 1 mục tiêu nữa`), `lang: 'vi'`, 1 goal số ít ở `en`; đổi ngôn ngữ giữa hai ngày thì notification ngày sau dịch theo ngôn ngữ mới (E2E thật). `.ics` vi: SUMMARY/DESCRIPTION giữ dấu (kiểm byte UTF-8), PRODID không đổi, có escape dấu phẩy, chấm phẩy, backslash, xuống dòng. E2E `vi-VN`: timer, nút Start vô hiệu, dialog có lỗi, D2 có `timerNote`, banner, Settings `denied`, toast → quét vi 0 phát hiện; axe dialog vi 0; 360/768/1440 px cả `en` và `vi`: Settings, Today (timer + banner), dialog Stop không cuộn ngang, dialog nằm trong khung nhìn. Đổi sang Tiếng Việt khi timer chạy: vẫn `00:01:05` rồi tiếp tục chạy, `startedAt` không đổi, `window.__noReload` còn `true`; Space bật switch bằng bàn phím ở `vi` hoạt động. |

## 4. Defect

### M2-D1 — Gõ giờ nhắc bằng bàn phím cho giá trị sai (ô `Reminder time` bị React đặt lại giữa lúc gõ)  [Major]
- Bước tái hiện (`npm run build && npm run preview`, Chromium, locale `en-US` hoặc `vi-VN`):
  1. Mở `http://localhost:4173/#/settings`, bật `Daily reminder`.
  2. Bấm vào phần giờ của ô `Reminder time` (đang `20:00`), gõ lần lượt `0`, `7`, `3`, `0`, `A` (ý định: 07:30 AM).
  3. Đọc `input.value` và kv `settings.reminderTime` sau từng phím.
  - Chạy lại: `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test tests/qc/m2-qc.spec.ts -g "M2-D1"`.
- Mong đợi: M2-AC6 "Đổi giờ thành 07:30 → lưu vào settings"; DESIGN S7 "đổi giờ → lưu ngay (onBlur/onChange hợp lệ)". Gõ `07:30` ra `07:30`.
- Thực tế: sau `7` giá trị thành `19:00` (07 PM), sau `3` nhảy sang `15:00` (ô giờ bị trả về trạng thái soạn thảo ban đầu nên `3` lại vào phần giờ), kết quả cuối `15:00`, đã lưu `15:00` (output thật: sau phím 7 là input 19:00 / saved 19:00; sau phím 3 là input 15:00 / saved 15:00; FINAL input 15:00 / saved 15:00; giống ở en-US và vi-VN). Phím mũi tên: nhấn chậm (150 ms) chạy được, nhấn nhanh 5 lần xuống chỉ ăn 2 lần (17:03 → 17:01). `fill('07:30')` của Playwright (gán giá trị một lần) lưu đúng nên E2E của dev không phát hiện. Cách vòng: bấm mũi tên từng bước chậm hoặc chọn bằng popup đồng hồ của trình duyệt (chưa kiểm popup, Playwright không điều khiển được).
- Vị trí nghi ngờ: `src/ui/screens/Settings.tsx:124-128` — input `type="time"` có kiểm soát (`value={reminderTime}`, `onChange` gọi `changeTime` bất đồng bộ) mà `reminderTime` lấy từ liveQuery nên chỉ cập nhật sau khi ghi Dexie xong; sau mỗi sự kiện `change`, React khôi phục giá trị cũ ngay, làm Chrome mất trạng thái soạn thảo từng phần của ô giờ. Mỗi giá trị trung gian hợp lệ cũng bị lưu và hiện toast `Reminder time saved`.

### M2-D2 — Tên goal dài 60 ký tự không có dấu cách kéo trang cuộn ngang ở 360 px khi timer chạy  [Minor]
- Bước tái hiện (viewport 360×740): tạo goal tên gồm 60 chữ `W` liền nhau (hoặc tên dạng URL 56 ký tự); vào Today, bấm `Start timer`; đọc `document.documentElement.scrollWidth`.
  - Chạy lại: `npx cross-env PLAYWRIGHT_BROWSERS_PATH=0 playwright test tests/qc/m2-qc.spec.ts -g "M2-D2"` (test dùng `test.fail()`, sẽ báo lỗi khi bug được sửa; lúc đó bỏ dòng `test.fail()`).
- Mong đợi: NFR-06/NFR-11(e) và M2-AC13 "viewport 360 px không cuộn ngang"; QC M1 từng ghi nhận tên 60 ký tự liền nhau không gây lỗi ở Today.
- Thực tế: `scrollWidth` = 1077 (tên 60 ký tự) và 476 (URL 56 ký tự) so với `clientWidth` 360; phần tử tràn là `h2` của TimerCard (tiêu đề "Timer running · tên goal"). Tên có dấu cách (60 ký tự) và tên tiếng Việt có dấu cách không lỗi; trang Goals, GoalCard không lỗi.
- Vị trí nghi ngờ: `src/ui/components/TimerCard.tsx:34` (`h2`) và `.card.timer` trong `src/ui/styles/app.css:756` thiếu quy tắc ngắt từ dài cho tiêu đề.
- Phân loại Minor vì cần tên không dấu cách rất dài (edge case hiếm). Lưu ý M1-D1 từng là Major vì xảy ra với văn bản thường.

### M2-D3 — TimerService và ReminderService không nguyên tử khi bị gọi đồng thời (hai tab)  [Minor]
- Bước tái hiện (service level, `fake-indexeddb`): `npx vitest run tests/qc/m2-domain.test.ts` — ba test `it.fails` "M2-D3: …" (khi sửa xong, `it.fails` sẽ báo lỗi, lúc đó bỏ `.fails`):
  1. `Promise.all([timerService.start(A), timerService.start(B)])` → cả hai `ok`, timer lần ghi sau đè lần trước, người dùng mất timer đầu mà không có thông báo (mong đợi: một lần `TIMER_ALREADY_RUNNING`, FR-11).
  2. Hai `timerService.save()` đồng thời cho cùng một timer → 2 entry `source = timer` cho một phiên (mong đợi: 1 entry; FR-12), ví dụ hai tab cùng mở dialog Stop và cùng bấm Save.
  3. Hai `reminderService.check(now)` đồng thời → `showNotification` được gọi 2 lần (mong đợi tối đa 1 lần/ngày; FR-14). Trình duyệt gộp theo `tag` nên người dùng thường chỉ thấy một thông báo; khi hai tab kích hoạt lần lượt (E2E) vẫn là 1 lần.
- Thực tế: kiểm tra rồi ghi (`get` rồi `set`/`add`) không nằm trong một transaction hay khoá.
- Vị trí nghi ngờ: `src/services/timer-service.ts` (`start`: kiểm `existing` rồi `kv.set`; `save`: `entries.add` rồi `kv.delete`), `src/services/reminder-service.ts` (`check`: `shouldNotify` rồi `show` rồi `settings.update`).

## 5. Kiểm lại defect vòng trước
Không có (đây là vòng 1 của M2). M1-D1…D3 đã FIXED ở M1 r2; test QC M1 vẫn xanh (mục 6).

## 6. Regression
- Toàn bộ spec M1 của dev (20) và test QC M1 (`m1-domain.test.ts` 19 test Vitest, `m1-qc*.spec.ts`, `m1-r2.spec.ts`: 89 Playwright) xanh trong lần chạy 120/120 và 157/158 (chỉ M2-D1 đỏ).
- Smoke luồng chính M1 (tạo goal, ghi phút, `+1%`, đổi ngôn ngữ) nằm trong các spec trên.
- Gói `index-*.js` 206,48 kB gzip (+7 kB so với M1, dưới ngân sách 250 kB).

## 7. Bảo mật
- Không có secret, `.env` không nằm trong git, `npm audit` 0 lỗ hổng, 0 lời gọi mạng trong `src`, 0 `dangerouslySetInnerHTML`.
- Không có request ngoài origin `http://localhost:4173` trong luồng timer, Settings, `.ics`, notification (bắt bằng `page.on('request')`).
- Tên goal độc hại (thẻ img có onerror, và chuỗi mẫu i18next kiểu `{{count}}` cùng cú pháp lồng `$t(...)`) hiển thị nguyên văn trong TimerCard, dialog Stop và body notification (không bị i18next nội suy lồng hay escape HTML); không có hộp thoại JS, không có thẻ `img` chèn vào DOM. `.ics` không chứa tên goal hay input người dùng, chỉ chuỗi `ics.*` đã dịch (có escape).
- `NAVIGATE` từ service worker chỉ chấp nhận hash khớp `^#/[A-Za-z0-9/_-]*$` (đã thử hash `javascript:` và `#/../../etc`: bị bỏ qua).
- Không có backend nên không áp dụng SQL/command/path injection.

## 8. Chưa kiểm chứng được (NOT VERIFIED)
1. **Bấm notification thật (M2-AC8/AC9, phần thủ công).** Sự kiện tổng hợp trong SW không gọi được `WindowClient.focus()`. Cách user tự kiểm trên Chrome/Edge desktop: `npm run build && npm run preview`, mở `http://localhost:4173`, tạo goal; Settings → bật Daily reminder, bấm Allow; đặt giờ nhắc = giờ hiện tại + 1 phút (dùng mũi tên chậm, xem M2-D1); chờ ≤ 60 s hoặc chuyển tab rồi quay lại → có 1 notification "1% Better — 1 goal left today: …"; bấm vào → cửa sổ app lên trước ở `#/today`. Đóng cửa sổ app rồi bấm notification còn lại (hoặc sang ngày sau) → mở cửa sổ mới ở Today. Trong cùng ngày không có notification thứ hai.
2. **Import `.ics` vào lịch thật (M2-AC11).** Settings → Add reminder to calendar (.ics), mở file bằng Google Calendar (Settings → Import & export), Outlook hoặc Apple Calendar: mong đợi sự kiện lặp hằng ngày từ ngày mai lúc giờ nhắc, thời lượng 15 phút, có nhắc đúng lúc bắt đầu, tiêu đề đúng ngôn ngữ đang chọn.
3. **Hộp xin quyền thật.** Trong tự động hoá, `Notification.requestPermission()` không được trả lời (quyền vẫn `default`, nút Allow vẫn hiện). User kiểm: bật switch lần đầu → trình duyệt hiện hộp xin quyền → Allow → chip `Allowed`; Block → chip `Blocked` và banner vẫn hiện sau giờ nhắc.
4. **Popup chọn giờ của trình duyệt** (cách vòng cho M2-D1) chưa được kiểm.
5. **iOS 16.4+ / Android Chrome:** không có thiết bị.

## 9. Đề xuất (không chặn)
- Khi ghi `reminderTime`: dùng state cục bộ cho ô giờ và lưu khi `blur` (đúng như DESIGN: onBlur/onChange hợp lệ), tránh toast lặp.
- E2E của dev cho ô giờ nên có một ca gõ phím thật (`keyboard.type`) bên cạnh `fill`.
- E2E AC8 của dev đếm bằng `getNotifications({tag})` nên không phân biệt được 1 và 2 lần gọi `showNotification`; nên dùng spy như `tests/qc/m2-notify.spec.ts`.
- Sắp xếp goal theo `createdAt` không có tie-break (M1-P1 trong backlog) còn ảnh hưởng thứ tự goal trong body notification khi hai goal có cùng `createdAt`.
- Dòng `goal.delete.timerNote` (prop `extra` của `ConfirmDialog`) nên nằm trong mô tả của dialog để trình đọc màn hình đọc cùng nội dung xác nhận (chưa kiểm bằng SR).

## Tệp QC thêm
- `tests/qc/m2-domain.test.ts` (31 test: `.ics` RFC 5545 + fuzz folding, biên `shouldNotify`/banner, làm tròn timer, `ReminderService` en/vi/tên đặc biệt, probe đồng thời `it.fails` cho M2-D3).
- `tests/qc/m2-qc.spec.ts` (E2E: AC1–AC5, dialog Stop, hai tab, offline, bàn phím/focus, a11y sáng/tối, 360/768/1440 px en/vi, Settings, `.ics`, vi-VN, đổi ngôn ngữ khi timer chạy; M2-D1 đỏ có chủ đích, M2-D2 `test.fail()`).
- `tests/qc/m2-notify.spec.ts` (E2E Chromium đầy đủ: đếm `showNotification`, ngày kế tiếp, vi, tên độc hại, SW `notificationclick` tổng hợp + `NAVIGATE`).
