# Design — 1% Better per Day

Phiên bản: v1 (mode `new`, 2026-10-09). Nguồn: `docs/plan/PRD.md`, `ARCHITECTURE.md`, `TASKS.md`.
Loại app: **GUI** (PWA một người dùng, mobile-first 360 px, dùng tốt trên desktop 1440 px). UI tiếng Anh. Tài liệu bằng tiếng Việt, **mọi chuỗi trong khối "Copy" và mục 7 là nguyên văn để developer dùng đúng như viết**.

Mockup HTML tĩnh (mỗi file tự chứa, không CDN, responsive 360 → 1440 px, tự theo sáng/tối của hệ thống): xem `docs/design/mockups/index.html`.

| Mockup | Màn hình | Milestone chính |
| :- | :- | :- |
| `mockups/01-today.html` | S1 Today (banner nhắc, form ghi nhanh, card đạt/chưa đạt) | M1 (+M2 banner) |
| `mockups/02-goals.html` | S2 Goals (nhóm trạng thái, xác nhận xoá) | M1 |
| `mockups/03-goal-form.html` | S3 Goal form (lỗi inline, gợi ý chỉ tiêu ngày) | M1 |
| `mockups/04-timer.html` | S1 khi timer chạy + D1 Stop dialog | M2 |
| `mockups/05-day.html` | S5 Day (ghi bù) | M3 |
| `mockups/06-review.html` | S6 Review (heatmap, streak, thống kê, biểu đồ tuần/tháng; đổi được All goals / Read) | M4 |
| `mockups/07-goal-detail.html` | S4 Goal detail với đường cong 1% | M3 (lịch sử) / M5 (đầy đủ) |
| `mockups/08-settings.html` | S7 Settings (nhắc nhở, backup, storage) | M1–M3 |

Mockup dùng một đoạn JS nhỏ inline chỉ để sinh heatmap/biểu đồ từ dataset S1 (đúng số liệu trong `TASKS.md`); không có request mạng.

---

## 1. Nguyên tắc thiết kế

1. **Ghi nhanh hơn nghĩ.** Việc lặp lại nhiều nhất (ghi thời gian hôm nay) làm được ngay trên Today, tối đa 3 thao tác: bấm `Log time` → nhập phút → `Save entry` (PRD §8). Không điều hướng sang màn khác để ghi.
2. **Khích lệ nhẹ, không phô trương.** "+1%" là một viên thuốc (pill) nhỏ màu hổ phách, chỉ xuất hiện khi goal đạt chỉ tiêu ngày. Không confetti, không âm thanh, không điểm/huy hiệu (PRD non-goal). Ngày chưa đạt **không dùng màu đỏ** và không có chữ "failed"/"missed" (A-02: ngày lỡ không trừ). Đỏ chỉ dành cho lỗi và hành động phá huỷ.
3. **Số liệu trung thực.** Đường cong lý tưởng 1.01^k và đường thực tế 1.01^n vẽ cùng một thang đo; hiển thị đúng con số (một chữ số thập phân), có chú thích cách tính. Heatmap/biểu đồ luôn có bản text tương đương.
4. **Mobile-first, desktop rộng rãi.** Cùng nội dung, khác bố cục: thanh tab dưới (< 1024 px) → sidebar trái (≥ 1024 px); Review và Goal detail tận dụng chiều rộng để thấy cả heatmap năm.
5. **Dữ liệu của bạn, nằm trên máy bạn.** Giọng điệu bình tĩnh, nói rõ giới hạn thật (nhắc nhở chỉ khi app mở, cần backup, trình duyệt có thể dọn dữ liệu). Không dọa, không đổ lỗi người dùng.

---

## 2. User flows

Ký hiệu: `[ ]` bước/màn hình, `<?>` điểm rẽ nhánh, `(!)` điểm lỗi, `-->` đi tiếp.

### F1 — Lần đầu mở app và tạo goal đầu tiên (US-01, US-02) — M1

```text
[Mở app lần đầu] --> [Today: empty "Start with one small goal"]
        |
        v  bấm "Create your first goal"
[Goal form #/goals/new] --> nhập Name, Why, Target, Dates
        |
        v  bấm "Save goal"
   <hợp lệ?>
     |no--> (!) lỗi inline từng field, focus vào field lỗi đầu tiên, KHÔNG lưu --> sửa --> Save lại
     |yes--> lưu --> [Goals #/goals] + toast "Goal created"
        |
        v  tab "Today"
[Today: card goal "0/30 min"]
```

### F2 — Ghi nhanh thời gian hôm nay (US-03) — M1

```text
[Today] --> bấm "Log time" trên card goal --> form inline mở, focus vào "Minutes"
        |
        v  nhập phút (+ note tuỳ chọn) --> "Save entry"
   <hợp lệ?>
     |no--> (!) lỗi dưới field (ENTRY_MINUTES_INVALID / ENTRY_NOTE_TOO_LONG / ENTRY_DAY_LIMIT_EXCEEDED); form giữ nguyên giá trị
     |yes--> lưu --> form đóng, tổng cập nhật tại chỗ, toast "Entry saved"
              <tổng >= chỉ tiêu ngày?>
                 |yes--> pill "+1%" xuất hiện trên card (M5: kèm hiệu ứng nhẹ đúng 1 lần/goal/ngày)
                 |no --> hiện "N min to go"
 (!) lỗi ghi IndexedDB --> "Couldn't save ..." giữ nguyên form (M5-AC6)
```
Sửa/xoá entry: từ danh sách entry dưới card: `Edit` → form inline có sẵn giá trị → `Save changes`; `Delete` → dòng đổi thành xác nhận "Delete this entry?" → `Delete` / `Keep`.

### F3 — Timer (US-04) — M2

```text
[Today] --> "Start timer" trên goal active
        |  <đang có timer khác?> --yes--> nút Start của goal khác bị vô hiệu ("Stop the running timer first.")
        v
[TimerCard ghim đầu Today: 00:00:00 chạy mỗi giây]  (reload/đóng app vẫn đúng: tính now - startedAt)
        |  bấm "Stop"
        v
[D1 Stop dialog: Minutes điền sẵn (làm tròn), Note]
   |"Save entry"----> <hợp lệ?> --no--> (!) lỗi inline trong dialog (vd. DATE_OUTSIDE_GOAL_PERIOD, DAY_LIMIT) timer còn nguyên
   |                         --yes--> tạo entry source=timer vào NGÀY BẮT ĐẦU --> đóng dialog, toast "Entry saved"
   |"Keep running"/Esc --> đóng dialog, timer tiếp tục chạy
   |"Discard session" --> huỷ timer, không tạo entry, toast "Timer discarded"
```

### F4 — Ghi bù ngày đã qua (US-05) — M3

```text
[Today] link "Missed a day? Log time for a past day" --> [Day #/day/<hôm qua>]
[Review] bấm ô heatmap (M4)  ---------------------------> [Day #/day/<ngày đó>]
[Goal detail] bấm ngày trong lịch sử (M3) ---------------> [Day #/day/<ngày đó>]
        |
        v  đổi ngày bằng "Previous day" / "Next day" / ô chọn ngày
   <ngày hợp lệ?> --no--> (!) "That date isn't valid." + link "Go to Today"
   <ngày tương lai?> --yes--> (!) "You can't log time for a future date." (không có form)
        v
[Danh sách goal có khoảng chứa ngày đó] --> "Add entry" --> form inline như F2
```

### F5 — Xem lại quá trình (US-06, US-07, US-08) — M4/M5

```text
[Review #/review] --> chọn Goal (All goals / từng goal) và Year --> URL đồng bộ
   --> heatmap + stat cards + 2 biểu đồ cột
   --> bấm ô heatmap (quá khứ/hôm nay) --> [Day] (F4)
   --> (chọn 1 goal) link "Open goal" --> [Goal detail]
[Goals] bấm tên goal --> [Goal detail]: headline "+X% better", đường cong Ideal vs You, stat, lịch sử
 (!) chunk biểu đồ không tải được (offline chưa precache) --> ErrorState "Couldn't load this view" + "Retry"
```

### F6 — Bật nhắc nhở và nhận nhắc (US-09, US-13) — M2

```text
[Settings] bật switch "Daily reminder"
   --> <quyền Notification?>
        default --> trình duyệt hỏi quyền --> allowed / blocked
        granted --> OK
        denied  --> (!) hiện hướng dẫn mở khoá; banner trong app vẫn hoạt động
        unsupported --> (!) "This browser doesn't support notifications..."; banner vẫn hoạt động
   --> chọn "Reminder time" (mặc định 20:00)
   --> (tuỳ chọn) "Add reminder to calendar (.ics)" cho trường hợp app đóng
Khi app đang mở và đã qua giờ nhắc và còn goal chưa đạt:
   --> 1 notification/ngày (nếu granted) + ReminderBanner trên Today (luôn, kể cả không có quyền)
   --> bấm notification --> mở #/today
```

### F7 — Backup và khôi phục (US-10) — M3

```text
[Settings > Backup] "Export backup (JSON)" --> tải file 1percent-better-backup-YYYY-MM-DD.json --> toast "Backup exported" + "Last backup" cập nhật
"Import backup…" --> chọn file
   <parse + validate OK?> --no--> (!) Alert lỗi theo mã (IMPORT_*), dữ liệu cũ KHÔNG đổi
   --yes--> [D3 Import preview dialog: "5 goals, 23 entries"] --> "Replace all data" / "Cancel"
   --> thay thế trong 1 transaction --> toast "Backup imported: 5 goals, 23 entries"
```

### F8 — Archive / xoá goal (US-12, FR-04) — M1 (xoá), M5 (archive)

```text
[Goals / Goal detail] "Delete" --> [D2 Delete dialog: nêu số entry sẽ mất] --> "Delete goal" / "Cancel"
        (đang có timer chạy: dialog thêm dòng "Its running timer will be discarded.")
"Archive" --> <timer đang chạy trên goal?> --yes--> (!) GOAL_TIMER_RUNNING --> thông báo, không đổi
          --no--> goal sang nhóm "Archived", ẩn khỏi Today/nhắc nhở; "Restore" để đưa lại
```

---

## 3. Sơ đồ màn hình và điều hướng

### 3.1 Điều hướng

- **< 1024 px**: thanh tab dưới cố định, 4 mục: `Today`, `Goals`, `Review`, `Settings`. Cao 56 px + safe-area.
- **≥ 1024 px**: sidebar trái rộng 232 px: logo "1%" + "Better per Day", 4 mục như trên.
- Tab đang chọn: màu `--primary`, chữ đậm, có vạch/nền (không chỉ dựa vào màu), `aria-current="page"`.
- **Tab `Review` chỉ hiện từ M4** (chưa có route). Mục ở M1–M3 chỉ có 3 tab. Link "Log a past day" trên Today chỉ hiện từ M3. Link tên goal → Goal detail chỉ có từ M3.
- Màn hình con (Goal form, Goal detail, Day) giữ nguyên tab cha được tô sáng: Goal form và Goal detail → `Goals`; Day → `Today`.
- Mỗi lần đổi route: đặt `document.title` ("Today — 1% Better"), chuyển focus tới `<h1>` của màn mới (`tabindex="-1"`), có skip link "Skip to content" ở đầu trang.

```text
                ┌──────────── Tab bar / Sidebar ────────────┐
                │  Today     Goals      Review*    Settings │      * M4
                └──┬───────────┬──────────┬──────────┬──────┘
                   │           │          │          │
 #/today ──────────┘           │          │          └── #/settings
   │  "Log a past day"(M3)     │          └── #/review?goal=&year=   (ô heatmap --> Day)
   v                           │
 #/day/:date (M3) <──────┐     ├── #/goals/new   (nút "New goal")
   ^                     │     ├── #/goals/:id/edit
   │ ngày trong lịch sử  │     └── #/goals/:id  (Goal detail; M3 lịch sử, M5 đầy đủ)
   └─────────────────────┘
 #/  --> redirect #/today        khác --> Not found (S8)
 IndexedDB không mở được --> StorageError (S9) thay toàn bộ app shell
```

### 3.2 Breakpoint (CSS `min-width`)

| Tên | Khoảng | Bố cục |
| :- | :- | :- |
| base (mobile) | 0–639 px | Một cột, padding ngang 16 px, tab bar dưới, form/dialog full-width (dialog dạng bottom sheet), stat card 2 cột, heatmap cuộn ngang trong vùng chứa riêng (tự cuộn tới tuần hiện tại) |
| `sm` (tablet) | ≥ 640 px | Nội dung căn giữa, rộng tối đa 720 px (màn hẹp) hoặc 960 px (Review, Goal detail); hành động hàng goal nằm cùng hàng; dialog căn giữa rộng 480 px |
| `lg` (desktop) | ≥ 1024 px | Sidebar trái thay tab bar; padding nội dung 32/40 px; heatmap vừa khít (ô 14 px) không cần cuộn; stat card 5 cột; chart cao 320 px |

Không có thanh cuộn ngang ở `documentElement` ở 360–1440 px (NFR-06). Ngoại lệ có chủ đích: vùng heatmap trên mobile (< 640 px) cuộn ngang bên trong `.heatmap-scroll` (M4-AC10).

### 3.3 Bản đồ milestone (developer M1 đọc mục này đầu tiên)

| Milestone | Màn hình / component cần dựng |
| :- | :- |
| **M1** | Tokens + CSS nền; AppShell (tab bar/sidebar, skip link, 3 tab); S1 Today (GoalCard, ProgressBar, PlusOnePill tĩnh, EntryForm, EntryRow, EmptyState tối thiểu); S2 Goals; S3 Goal form; S7 Settings (chỉ mục Storage + About); S8 Not found; S9 StorageError (bản đầy đủ, rẻ); D2 Delete goal; Button, Field (Text/Number/TextArea/Date), SegmentedControl/Radio, Badge, Toast, ConfirmDialog (dùng `<dialog>`), OfflineChip, UpdateToast |
| **M2** | TimerCard + nút Start trên GoalCard; D1 StopTimerDialog; ReminderBanner; Settings mục Reminders (Switch, time input, trạng thái quyền, text giới hạn, iOS tip, nút `.ics`) |
| **M3** | S5 Day + DateNav; S4 Goal detail bản cơ bản (thông tin + lịch sử, chưa có chart); Settings mục Backup + D3 ImportPreviewDialog + Alert lỗi import; BackupBanner (Today); link "Log a past day"; tên goal thành link |
| **M4** | Tab Review + S6 Review; Heatmap; StatCard; BarChart (Recharts, lazy); chip streak trên Today |
| **M5** | CurveChart + Goal detail đầy đủ (headline, stat, nút Archive); hiệu ứng/announce "+1%" một lần; Archive/Restore + nhóm "Archived"; EmptyState/ErrorState đầy đủ mọi màn; ErrorBoundary; Skeleton/loading rà soát |

---

## 4. Màn hình

Quy ước chung cho mọi màn hình:

- **Loading** (lần đọc IndexedDB đầu tiên, thường < 100 ms): không hiện gì trong 150 ms đầu (tránh nháy), sau đó hiện Skeleton cùng hình dạng nội dung; vùng chứa có `aria-busy="true"`; một `role="status"` ẩn chứa chữ "Loading…". Review/Goal detail còn có loading cho chunk lazy: Skeleton của stat cards + khung chart.
- **Offline**: app vẫn dùng bình thường. Khi `navigator.onLine === false` hiện `OfflineChip` nhỏ ở header: "Offline — saved on this device" (`role="status"`, không chặn). Không bao giờ chặn thao tác vì offline.
- **Lỗi lưu** (StorageError khi ghi): thông báo inline gần form "Couldn't save. Your changes are still in the form — try again." giữ nguyên giá trị đã nhập (M5-AC6).
- **Không có quyền**: app không có phân quyền người dùng. Trạng thái "quyền" duy nhất là quyền Notification (xem S7).
- Ngày/giờ/số hiển thị theo quy ước ở mục 7.1.

### S1 — Today  (Milestone: M1; M2 timer + banner; M3 link ghi bù + banner backup; M4 chip streak; M5 phản hồi "+1%", empty/error đầy đủ. User story: US-02, US-03, US-04, US-09)

- **Mục đích:** Thấy ngay hôm nay còn thiếu gì và ghi thời gian trong vài giây. Primary action: `Log time` (lặp ở mỗi card goal; card đã đạt hạ xuống nút secondary).
- **Layout (mobile 360 px):**

```text
┌──────────────────────────────────────┐
│ Today                    [8-day streak]  <- chip từ M4
│ Friday, October 9                    │
│ 1 of 3 goals on target               │
│ ┌ Banner (M2) ──────────────────────┐│  nền --info-soft, icon bell
│ │ It's past 20:00 — 2 goals are not ││
│ │ on target yet.                    ││
│ └───────────────────────────────────┘│
│ ┌ TimerCard (M2, chỉ khi đang chạy) ┐│  xem mockup 04
│ └───────────────────────────────────┘│
│ ┌ GoalCard ─────────────────────────┐│
│ │ Read                      [+1%]   ││  tên (h2) + PlusOnePill khi đạt
│ │ 20/30 min                         ││  số lớn, tabular
│ │ ▓▓▓▓▓▓▓▓▓░░░░░  (progressbar)     ││
│ │ 10 min to go                      ││  đạt: "Target reached"
│ │ [Log time]  [Start timer]         ││  Start timer: M2
│ │ ── Today's entries ──             ││
│ │ 20 min · Ch. 3      [Edit][Delete]││
│ └───────────────────────────────────┘│
│ Missed a day? Log time for a past day│  link, từ M3
└──────────────────────────────────────┘
[Tab bar: Today | Goals | Review | Settings]
```
  Desktop ≥ 1024 px: sidebar trái; cột nội dung 720 px căn giữa; nút `Log time` và `Start timer` nằm cạnh nhau, entry hiển thị một dòng.

- **Component dùng:** AppShell, PageHeader, OfflineChip, Banner (ReminderBanner, BackupBanner), TimerCard, GoalCard (ProgressBar, PlusOnePill, Button), EntryForm, EntryRow, ConfirmInline, Toast, EmptyState, Skeleton.
- **Trạng thái:**
  - *default*: các goal `active` (không archived), thứ tự theo `createdAt` tăng dần; goal đang có timer vẫn ở vị trí cũ (TimerCard ghim riêng ở đầu).
  - *loading*: 2 skeleton card.
  - *empty — chưa có goal*: EmptyState "Start with one small goal" + nút `Create your first goal` (M1).
  - *empty — có goal nhưng không goal nào active* (upcoming/ended/archived): EmptyState "No active goals today" + nút `View goals`.
  - *goal chưa đạt*: số `20/30 min`, progress, "10 min to go". *Đạt*: PlusOnePill "+1%", dòng "Target reached" (nếu vượt: "Target reached · 10 min extra"). Không dùng đỏ cho chưa đạt.
  - *form ghi mở*: EntryForm inline trong card; chỉ một form mở tại một thời điểm.
  - *timer chạy* (M2): TimerCard ở đầu; mọi nút `Start timer` còn lại bị vô hiệu (`aria-disabled="true"`, mô tả "Stop the running timer first.").
  - *banner nhắc* (M2): hiện khi `shouldShowBanner` (qua giờ nhắc, nhắc đang bật, còn goal chưa đạt), không phụ thuộc quyền notification; biến mất ngay khi mọi goal đạt. Không có nút đóng.
  - *banner backup* (M3, A-12): nền trung tính, nằm dưới banner nhắc.
  - *success*: toast "Entry saved" (4 s, `role="status"`); M5: pill "+1%" xuất hiện kèm hiệu ứng nhẹ đúng một lần/goal/ngày.
  - *error*: lỗi trong form (xem mục 7.3); lỗi lưu storage inline; lỗi nặng → ErrorBoundary/S9.
  - *offline*: OfflineChip; mọi thứ khác không đổi.
- **Tương tác:**
  - `Log time` → mở EntryForm trong card, focus vào "Minutes"; nút đổi `aria-expanded="true"`.
  - `Save entry` hợp lệ → lưu, đóng form, trả focus về nút `Log time`, toast. Không hợp lệ → lỗi dưới field, focus vào field lỗi đầu tiên.
  - `Cancel` hoặc Esc trong form → đóng, bỏ thay đổi, trả focus.
  - `Edit` (entry) → thay dòng entry bằng EntryForm có giá trị sẵn; `Save changes`.
  - `Delete` (entry) → dòng đổi thành "Delete this entry?" + `Delete` (danger) / `Keep`; focus vào `Keep`.
  - `Start timer` → xem F3. `Create your first goal` → `#/goals/new`.
- **Copy:**
  - Tiêu đề trang: `Today`. Dòng ngày: `Friday, October 9`.
  - Tóm tắt: `{n} of {m} goals on target` (m = 1: `{n} of 1 goal on target`). Khi mọi goal đạt: `All {m} goals on target — a little better than yesterday.` (m = 1: `Goal on target — a little better than yesterday.`)
  - Chip streak (M4): `{n}-day streak`.
  - Card: `{minutes}/{target} min`; phụ đề goal loại `total`: `{dailyTarget} min/day · {hours} h total`; `{r} min to go`; `Target reached`; `Target reached · {x} min extra`.
  - Nút: `Log time`, `Start timer`, `Save entry`, `Save changes`, `Cancel`, `Edit`, `Delete`, `Keep`.
  - Nhãn entry: `Today's entries`; aria-label nút icon: `Edit entry: 20 min, Ch. 3`, `Delete entry: 20 min, Ch. 3`.
  - Empty: xem 7.4.
  - Link: `Missed a day? Log time for a past day`.

### S2 — Goals  (Milestone: M1; tên goal thành link M3; Archive/Restore + nhóm Archived M5. User story: US-01, US-02, US-12)

- **Mục đích:** Xem, sửa, xoá, (M5) archive mọi goal. Primary action: `New goal`.
- **Layout:**

```text
┌──────────────────────────────────────┐
│ Goals                     [New goal] │
│ Active (3)                           │  h2 nhóm
│ ┌───────────────────────────────────┐│
│ │ Read                    [Active]  ││  tên = link (M3); badge trạng thái (có chữ)
│ │ 30 min/day · 2026-10-01 – 2026-10-31
│ │ Be smarter                        ││  why (1 dòng, cắt …)
│ │ [Edit] [Archive] [Delete]         ││  Archive: M5
│ └───────────────────────────────────┘│
│ Upcoming (1) · Ended (1) · Archived (0, ẩn nếu rỗng)
└──────────────────────────────────────┘
```
  Desktop: hành động nằm bên phải cùng hàng với nội dung.
- **Component dùng:** PageHeader, GoalRow (Badge, Button), ConfirmDialog (D2), Toast, EmptyState, Skeleton.
- **Trạng thái:**
  - *default*: nhóm theo thứ tự `Active`, `Upcoming`, `Ended`, `Archived` (nhóm rỗng không hiện). Sắp xếp: Active theo `createdAt` ↑; Upcoming theo `startDate` ↑; Ended theo `endDate` ↓; Archived theo `updatedAt` ↓.
  - *loading*: 3 skeleton row. *empty*: EmptyState "No goals yet" + `Create your first goal`. *error*: ErrorState nếu đọc lỗi. *success*: toast sau tạo/sửa/xoá/archive.
  - Badge: `Active` (xanh), `Upcoming` (xanh dương) kèm dòng "Starts 2026-11-01", `Ended` (xám) kèm "Ended 2026-06-30", `Archived` (xám viền).
- **Tương tác:** `New goal` → `#/goals/new`; `Edit` → `#/goals/:id/edit`; `Delete` → D2; xác nhận → xoá, toast `Goal deleted`, focus về `<h1>`; `Archive` → toast `Goal archived` (hoặc lỗi GOAL_TIMER_RUNNING); `Restore` (nhóm Archived) → toast `Goal restored`.
- **Copy:** `Goals`, `New goal`, `Active ({n})`, `Upcoming ({n})`, `Ended ({n})`, `Archived ({n})`, `Starts {date}`, `Ended {date}`, `Edit`, `Archive`, `Restore`, `Delete`. Hàng goal `daily`: `{n} min/day · {start} – {end}`; goal `total`: `{dailyTarget} min/day ({hours} h total) · {start} – {end}`.
- **D2 — Delete goal dialog** (M1): tiêu đề `Delete "{name}"?`; nội dung `This permanently deletes the goal and its {n} entries. This can't be undone.` (n = 0: `This permanently deletes the goal. It has no entries yet. This can't be undone.`; có timer chạy thêm: ` Its running timer will be discarded.`); nút `Delete goal` (danger), `Cancel` (focus ban đầu ở `Cancel`).

### S3 — Goal form (tạo/sửa)  (Milestone: M1. User story: US-01)

- **Mục đích:** Đặt cam kết rõ ràng. Primary action: `Save goal` (tạo) / `Save changes` (sửa).
- **Layout:**

```text
┌──────────────────────────────────────┐
│ New goal            (Edit goal)      │
│ Name *            [__________] 0/60  │
│ Why (optional)    [textarea ] 0/280  │
│ Target            (•) Minutes per day  ( ) Total hours
│ Minutes per day * [ 30 ] min         │  total: "Total hours" [100] h
│ hint: That's 930 min (15.5 h) over 31 days.
│ Start date *      [2026-10-09]       │
│ Ends                                 │
│   (•) This year — ends 2026-12-31    │
│   ( ) On a specific date  [date]     │
│ [Save goal]            [Cancel]      │
└──────────────────────────────────────┘
```
  Desktop: form rộng tối đa 560 px, nút xếp ngang; mobile: `Save goal` full-width.
- **Component dùng:** PageHeader (nút Back), TextField, TextArea (có counter), SegmentedControl (radio group), NumberField, DateField, RadioGroup, Button.
- **Trạng thái:**
  - *default*: tạo → Start date = hôm nay, Ends = "This year", Target = Minutes per day, giá trị trống. Sửa → điền sẵn từ goal. Id không tồn tại → Not found.
  - *error*: lỗi inline dưới từng field (`aria-invalid="true"`, `aria-describedby` trỏ tới lỗi + hint, icon + chữ, màu `--danger`). Khi submit: focus field lỗi đầu tiên; vùng `role="alert"` trên đầu form: `Fix {n} field to save.` / `Fix {n} fields to save.`. Goal không được lưu khi còn lỗi. Lỗi GOAL_PERIOD_EXCLUDES_ENTRIES hiện dưới Start date/End date.
  - *loading*: (sửa) skeleton form trong lúc đọc goal. *success*: về `#/goals` + toast `Goal created` / `Goal updated`. *empty*: không áp dụng. *offline*: bình thường.
  - Hint chỉ tiêu: `daily` → `That's {totalMin} min ({hours} h) over {days} days.`; `total` → `That's about {dailyTarget} min per day over {days} days.` (cập nhật khi gõ; nếu `dailyTarget` > 1440 thì thay bằng lỗi).
  - Chế độ sửa, nếu goal đã có entry: hint dưới Start date: `Your entries run from {firstDate} to {lastDate}, so the period must include those dates.`
- **Tương tác:** Chọn "On a specific date" → hiện DateField "End date" (mặc định = Start date); đổi Start date → nhãn "This year — ends {YYYY-12-31}" cập nhật theo năm của Start date. Đổi loại chỉ tiêu → đổi nhãn/đơn vị field số, giữ giá trị nếu hợp lệ. `Save goal` → validate (zod) → lưu. `Cancel`/Back → `#/goals` (hỏi xác nhận nếu form đã sửa? **không**, giữ đơn giản; xem Assumptions).
- **Copy:** nhãn `Name`, `Why (optional)`, `Target`, `Minutes per day`, `Total hours`, `Start date`, `Ends`, `This year — ends {date}`, `On a specific date`, `End date`; placeholder Name `e.g. Read`, Why `Why does this matter to you?`; nút `Save goal`, `Save changes`, `Cancel`; counter `{n}/60`, `{n}/280`. Thông báo lỗi: bảng 7.3.

### S4 — Goal detail  (Milestone: M3 bản cơ bản [thông tin + lịch sử]; M5 đầy đủ [headline, đường cong, stat, archive]. User story: US-08, FR-18, FR-27, FR-28)

- **Mục đích:** Một goal trong một trang: lý do, tiến độ, và hình dung "1% mỗi ngày". Primary action: không có hành động nổi bật (trang đọc); `Edit` là secondary.
- **Layout:**

```text
┌────────────────────────────────────────────────────┐
│ ‹ Goals                                            │
│ Read                    [Active]  [Edit][Archive][Delete]
│ "Be smarter"                                       │  why (blockquote)
│ 2026-10-01 – 2026-10-31 · 30 min/day               │
│                                                    │
│ +8.3% better                         (display 40px)│  headline
│ Day 9 of 31 · 8 days on target · 1.01⁸ = 1.083     │
│ ┌ CurveChart ────────────────────────────────────┐ │
│ │  (Ideal: nét đứt xám, You: nét liền xanh, bậc thang) │
│ └────────────────────────────────────────────────┘ │
│ Legend: - - Ideal (+1% a day)   ── You             │
│ Chart summary (text) · [Range: Whole period|So far]│
│ [Progress 25.8%] [Pace 30 min behind] [Streak 8] [Longest 8]
│ History (newest first): date | minutes | note | source
└────────────────────────────────────────────────────┘
```
  M3 chỉ có: tiêu đề, why, khoảng thời gian, chỉ tiêu, nút Edit/Delete, History. M5 thêm headline, chart, stat, Archive.
- **Component dùng:** PageHeader, Badge, CurveChart (Recharts lazy), StatCard, HistoryTable, Button, ConfirmDialog, EmptyState, Skeleton, ErrorState.
- **Trạng thái:**
  - *default*: như layout. Chiều rộng 960 px; chart 320 px cao ở desktop, 240 px ở mobile.
  - *loading*: skeleton headline + khung chart (chunk lazy), `aria-busy`.
  - *empty — chưa có entry*: headline `+0.0% better`, chart chỉ có đường Ideal, dòng `Your line starts rising on the first day you hit your target.`; History: EmptyState nhỏ `No entries yet` / `Time you log for this goal will show up here.`
  - *upcoming*: headline `+0.0% better`, dòng `Starts {date}. Your line will appear once the goal begins.`; chỉ đường Ideal.
  - *ended*: Actual dừng ở `endDate`; badge `Ended`.
  - *archived*: badge `Archived`, nút `Restore` thay `Archive`.
  - *error*: chunk lazy lỗi → ErrorState `Couldn't load this view` + `Retry`; id không tồn tại → Not found.
  - *offline*: bình thường (chunk đã precache).
  - Mặc định **Range**: `Whole period` nếu khoảng ≤ 120 ngày, ngược lại `So far` (đọc Assumptions A-D4). Control chỉ lọc dữ liệu hiển thị.
- **Tương tác:** `Edit` → form; `Delete` → D2 (xong về `#/goals`); `Archive` → toast; bấm ngày trong History → `#/day/:date` (M3); hover/focus trên chart hiện tooltip `Oct 9 · Ideal +9.4% · You +8.3%`; bàn phím: chart focus được, mũi tên trái/phải di chuyển điểm đọc; vùng `details` "Show data as table" có bảng đầy đủ.
- **Copy:**
  - Headline: `+{x}% better` (x một chữ số thập phân). Phụ đề: `Day {k} of {periodDays} · {n} days on target · 1.01^{n} = {value}` (value 3 chữ số thập phân; hiển thị mũ bằng ký tự `^` trong text thuần để SR đọc được, đồ hoạ có thể dùng `<sup>`).
  - Chú thích dưới chart: `Each day on target multiplies your line by 1.01. Days you miss never take anything away.`
  - Legend: `Ideal (+1% every day)`, `You (+1% on days you hit your target)`.
  - Tóm tắt cho SR (hiện luôn dưới chart): `Day {k} of {periodDays}: you are +{x}% better. The ideal line is +{y}%. You hit your target on {n} of {k} days.`
  - Stat: `Progress` (`25.8%`, phụ `240 of 930 min`), `Pace` (`30 min behind`, phụ `Expected 270 min by today`), `Current streak` (`8 days`), `Longest streak` (`8 days`).
  - History: tiêu đề `History`; cột `Date`, `Minutes`, `Note`, `Source`; nguồn `Manual` / `Timer`; ngày dạng `YYYY-MM-DD`; ghi chú rỗng hiển thị `—`.
  - Nút: `Edit`, `Archive`, `Restore`, `Delete`, `Retry`; toggle `Whole period` / `So far`; `Show data as table`.

### S5 — Day  (Milestone: M3. User story: US-05)

- **Mục đích:** Xem/ghi bù/sửa entry của một ngày. Primary action: `Add entry`.
- **Layout:**

```text
┌──────────────────────────────────────┐
│ Day                                  │
│ [‹ Previous day] [2026-10-08] [Next day ›]   "Next day" vô hiệu ở hôm nay
│ Thursday, October 8, 2026   [Go to today]
│ ┌ GoalCard (variant day) ───────────┐│
│ │ Read                      [+1%]   ││
│ │ 30/30 min                         ││
│ │ 30 min · Manual   [Edit][Delete]  ││
│ │ [Add entry]                       ││
│ └───────────────────────────────────┘│
│ Guitar … / Spanish …                 │
│ Only goals running on this day are shown.
└──────────────────────────────────────┘
```
- **Component dùng:** PageHeader, DateNav, GoalCard (day), EntryForm, EntryRow (có Badge nguồn), EmptyState, Toast, Skeleton.
- **Trạng thái:**
  - *default*: liệt kê goal (kể cả `ended`, `archived`) có `startDate ≤ date ≤ endDate`.
  - *loading*: skeleton. *empty*: không goal nào chứa ngày đó → `No goals were running on this day.` + `View goals`.
  - *goal chưa có entry ngày đó*: `No time logged for this goal on this day.` + nút `Add entry`.
  - *ngày tương lai* (kể cả mở bằng URL): không có form; thông báo `You can't log time for a future date.` + `Go to today`.
  - *ngày sai định dạng* (`#/day/abc`, `2026-13-40`): màn lỗi `That date isn't valid.` + link `Go to Today`.
  - *error*: lỗi lưu inline; *success*: toast `Entry saved` / `Entry updated` / `Entry deleted`. *offline*: bình thường.
- **Tương tác:** `Previous day`/`Next day` → đổi route (focus giữ ở nút bấm); ô chọn ngày (`<input type="date" max=hôm nay>`) → đổi route; `Add entry`/`Edit`/`Delete` như Today. Ngày hợp lệ nhưng ngoài mọi khoảng → empty.
- **Copy:** `Day`, `Previous day`, `Next day`, `Go to today`, `Date`, heading ngày `Thursday, October 8, 2026`, `Add entry`, `Only goals running on this day are shown.`, nhãn nguồn `Manual`/`Timer`, các thông báo ở trên.

### S6 — Review  (Milestone: M4; M5 xử lý rỗng/archived. User story: US-06, US-07)

- **Mục đích:** Nhìn lại cả năm. Primary action: không có (màn đọc); điều khiển chính là bộ chọn Goal/Year.
- **Layout (desktop; mobile xếp dọc, heatmap cuộn ngang):**

```text
┌──────────────────────────────────────────────────────────────┐
│ Review                          Goal [All goals ▾]  Year [2026 ▾]
│ [Time logged 9.4 h][Days on target 20][Current streak 8][Longest streak 10]
│ (chọn 1 goal: + [Progress 25.8%][Pace 30 min behind])        │
│ Activity in 2026                                             │
│       Jan  Feb  Mar  Apr … Oct  Nov  Dec                     │
│  Mon  ▢▢▢…                                                   │
│  Wed                                                         │
│  Fri                                                         │
│  Less ▢▢▢▢▢ More     (legend)   Summary text for SR          │
│ Last 12 weeks (BarChart)       Months of 2026 (BarChart)     │
└──────────────────────────────────────────────────────────────┘
```
- **Component dùng:** PageHeader, Select (Goal, Year), StatCard, Heatmap, BarChart (x2), EmptyState, Skeleton, ErrorState.
- **Trạng thái:**
  - *default*: `goal=all`, `year` = năm hiện tại; thay đổi → cập nhật URL (`#/review?goal=<id|all>&year=<YYYY>`, dùng `replace` để không làm đầy history). Tham số sai → về mặc định, không báo lỗi.
  - Select Goal: `All goals` + từng goal (goal archived thêm hậu tố ` (archived)`). Select Year: từ năm sớm nhất có goal/entry đến năm hiện tại.
  - *All goals*: 4 stat card (Time logged, Days on target, Current streak, Longest streak) + gợi ý `Pick a goal to see progress and pace.` thay hai card Progress/Pace (Assumption A-D1). *Một goal*: 6 card.
  - *loading*: skeleton stat + khung heatmap + 2 khung chart (chunk Recharts lazy). Heatmap hiển thị < 1,5 s (NFR-03).
  - *empty — chưa có goal*: EmptyState "Nothing to review yet" + `Create a goal`. *Có goal, chưa có entry trong năm*: heatmap toàn ô trống, stat = 0, dòng `No time logged in {year} yet.`, chart rỗng kèm text.
  - *Một goal, năm ngoài khoảng goal*: mọi ô ở trạng thái `outside`; dòng `This goal doesn't run in {year}.`
  - *error*: tính toán/chunk lỗi → ErrorState `Couldn't load this view` + `Retry`. *offline*: bình thường.
  - *Heatmap — ô*: mức 0–4 (màu `--heat-0..4`), hôm nay có viền đậm, ô tương lai viền nét đứt nhạt, ô `outside` (ngoài khoảng goal, hoặc ngoài năm) kẻ sọc nhạt.
- **Tương tác:**
  - Bấm hoặc Enter/Space trên ô quá khứ/hôm nay → `#/day/:date`; ô tương lai và `outside` không điều hướng (`aria-disabled="true"`).
  - Bàn phím trên heatmap: một tab-stop (hôm nay, hoặc ô đầu); mũi tên Trái/Phải = tuần trước/sau, Lên/Xuống = ngày trước/sau, Home/End = ngày đầu/cuối năm; chi tiết ở mục 8.
  - Hover/focus ô → tooltip chữ (cùng nội dung accessible name), không chỉ dùng `title`.
  - Mobile: vùng heatmap tự cuộn tới tuần hiện tại khi mở.
- **Copy:** `Review`, `Goal`, `All goals`, `Year`, `Time logged`, `Days on target`, `Current streak`, `Longest streak`, `Progress`, `Pace`, `Activity in {year}`, `Less`, `More`, `Last 12 weeks`, `Months of {year}`, `Pick a goal to see progress and pace.`, `{n} days` (`1 day`), pace: `{x} min ahead` / `{x} min behind` / `On pace` (≥ 60 phút: `{h} h {m} min ahead`), phụ đề card: Time logged `In {year}` (một goal thêm `Whole goal: {h} h`), Progress `{minutes} of {total} min`, Pace `Expected {n} min by today`. Heatmap tóm tắt (SR): `In {year} you logged time on {a} days and hit your target on {b} days. Longest streak: {c} days.` Tooltip/label ô: mục 7.5. Nút: `Retry`, `Create a goal`.

### S7 — Settings  (Milestone: M1 [Storage + About]; M2 [Reminders]; M3 [Backup]. User story: US-09, US-10, US-11, US-13)

- **Mục đích:** Nhắc nhở, backup, thông tin lưu trữ. Primary action: không có (mỗi card có hành động riêng).
- **Layout:** 4 card xếp dọc, mỗi card có h2:

```text
┌ Reminders ───────────────────────────┐ (M2)
│ [switch] Daily reminder              │
│ Reminder time [20:00]                │
│ Notification permission: [Allowed]   │  + mô tả theo trạng thái
│ Heads up … (giới hạn NFR-07)         │
│ iOS tip                              │
│ [Add reminder to calendar (.ics)]    │
├ Backup ──────────────────────────────┤ (M3)
│ Last backup: 2026-10-09              │
│ [Export backup (JSON)] [Import backup…]
├ Storage ─────────────────────────────┤ (M1)
│ Protected from automatic clearing    │
├ About ───────────────────────────────┤ (M1)
└──────────────────────────────────────┘
```
- **Component dùng:** PageHeader, Switch, TimeField, StatusChip, Banner, Alert, Button, ImportPreviewDialog (D3), Toast.
- **Trạng thái:**
  - *Reminders*: switch tắt mặc định, giờ `20:00`; khi switch tắt, field giờ bị vô hiệu. **4 trạng thái quyền** (hiển thị bằng StatusChip có chữ + mô tả):
    - `default` → chip `Not asked yet`; mô tả `Turn on the reminder and your browser will ask for permission.`; nút `Allow notifications`.
    - `granted` → chip `Allowed`; mô tả `You'll get one notification a day while 1% Better is open.`
    - `denied` → chip `Blocked`; mô tả `Notifications are blocked for this site. Allow them in your browser's site settings, then come back. You'll still see a reminder banner in the app.`
    - không hỗ trợ → chip `Not supported`; mô tả `This browser doesn't support notifications. You'll still see a reminder banner in the app.`
  - *Backup* (M3): `Last backup: Never` / `Last backup: 2026-10-09`; khi quá 30 ngày hoặc chưa từng và có goal: Banner `It's been {n} days since your last backup.` / `You haven't backed up yet.`; lỗi import hiện Alert (7.3) và không thay đổi dữ liệu; *loading* khi đang đọc/ghi file: nút vô hiệu + `Working…`; *success*: toast.
  - *Storage* (M1): `Protected` (persisted = true) — `Your browser won't clear this data automatically.`; `Not protected` — `Your browser may clear this data if the device runs low on space. Install the app (browser menu → Install, or Add to Home Screen) and export a backup now and then.`; không hỗ trợ API → `Unknown` + `Your browser doesn't report storage protection. Export a backup now and then.`
  - *offline*: chip Offline chung; không đổi gì khác.
- **Tương tác:** Switch → lưu ngay, lần đầu bật khi quyền `default` gọi `Notification.requestPermission()` đúng 1 lần; đổi giờ → lưu ngay (onBlur/onChange hợp lệ), toast `Reminder time saved`. `Allow notifications` → xin quyền. `Add reminder to calendar (.ics)` → tải `1percent-better-reminder.ics`, toast `Calendar file downloaded`. `Export backup (JSON)` → tải file, toast `Backup exported`. `Import backup…` → hộp chọn file → parse → D3 (hoặc Alert lỗi).
- **Copy:** `Settings`; card `Reminders`, `Backup`, `Storage`, `About`; `Daily reminder`; mô tả switch `Get a nudge when you haven't hit your targets today.`; `Reminder time`; `Notification permission`; giới hạn: `Heads up: reminders are sent only while 1% Better is open (in a tab or an installed window, even in the background). To be reminded when the app is closed, add a daily event to your calendar.`; iOS: `On iPhone or iPad, notifications work only after you add this app to your Home Screen (iOS 16.4 or later).`; `Add reminder to calendar (.ics)`; phụ `Adds a repeating daily event at {time}.`; Backup mô tả `Your data lives only on this device. Export a backup now and then, or to move to another device.` và `Importing replaces everything currently on this device.`; nút `Export backup (JSON)`, `Import backup…`; About: `1% Better per Day` / `Everything you log stays on this device. No account, no tracking.`
- **D3 — Import preview dialog** (M3): tiêu đề `Replace all data?`; nội dung `This backup has {5 goals, 23 entries}, exported {2026-10-09}. Importing replaces everything currently on this device ({a goals, b entries}). This can't be undone.`; nút `Replace all data` (danger), `Cancel` (focus ban đầu ở `Cancel`). Pluralization: `1 goal`, `1 entry`.

### S8 — Not found  (Milestone: M1)

- **Mục đích:** Route không tồn tại (kể cả goal id không tồn tại).
- **Layout:** ErrorState căn giữa: icon, `<h1>`, một câu, nút.
- **Trạng thái:** chỉ có default. Hiển thị trong AppShell (tab bar vẫn còn).
- **Tương tác:** `Go to Today` → `#/today`.
- **Copy:** `Page not found` / `That page doesn't exist or has moved.` / nút `Go to Today`. Với goal không tồn tại: tiêu đề `Goal not found`, câu `This goal doesn't exist anymore. It may have been deleted.`, nút `Go to Goals`.

### S9 — StorageError / ErrorBoundary  (Milestone: M1 [StorageError]; M5 [ErrorBoundary + lỗi ghi]. FR-31)

- **Mục đích:** Khi IndexedDB không mở được, không để trang trắng; nói rõ nguyên nhân thường gặp và cách xử lý.
- **Layout:** toàn trang (không có tab bar, vì app không dùng được), căn giữa, rộng tối đa 520 px: icon cảnh báo, `<h1>`, đoạn giải thích, danh sách 3 bước, nút `Try again`.
- **Trạng thái:** *StorageError* (không mở được DB lúc khởi động, `STORAGE_UNAVAILABLE`); *ErrorBoundary* (lỗi render không lường trước); *write failure* không dùng màn này mà dùng lỗi inline (xem đầu mục 4).
- **Tương tác:** `Try again` → thử mở DB lại (không reload nếu thành công); `Reload app` (ErrorBoundary) → `location.reload()`.
- **Copy:**
  - StorageError: `Can't open local storage` / `1% Better keeps your data in your browser's storage, and it isn't available right now. This often happens in private or incognito windows, or when site data is blocked in browser settings. Nothing has been changed.` / bước: `1. Open the app in a regular (non-private) window.` `2. Allow site data and cookies for this site in your browser settings.` `3. Reload the page.` / nút `Try again`.
  - ErrorBoundary: `Something went wrong` / `The app ran into an unexpected problem. Your data is still stored on this device.` / nút `Reload app`, `Go to Today`.

---

## 5. Component

Tất cả là component React thuần dùng CSS custom properties của mục 6 (không dùng Tailwind/MUI: `ARCHITECTURE.md` không chọn UI framework). Tên component bám cấu trúc `src/ui/components/` trong ARCH §6.

| Component | Mục đích | Props / biến thể | Trạng thái | Dùng ở (milestone) |
| :- | :- | :- | :- | :- |
| `AppShell` | Khung: skip link, tab bar (< 1024) / sidebar (≥ 1024), vùng `<main id="main">`, vùng Toast, OfflineChip | `activeTab` | tab active, offline | tất cả (M1; tab Review từ M4) |
| `PageHeader` | `<h1>` + mô tả + vùng action | `title`, `subtitle?`, `actions?`, `back?` | — | tất cả |
| `Button` | Hành động | `variant`: primary / secondary / ghost / danger / danger-ghost; `size`: md (44 px) / sm (44 px cao, padding nhỏ); `full` | default, hover, active, focus-visible, disabled, `aria-disabled`, busy | tất cả (M1) |
| `IconButton` | Edit/Delete entry (icon + `aria-label`) | `icon`, `label` | như Button; vùng chạm 44×44 | Today, Day (M1) |
| `TextField` / `NumberField` / `TextArea` / `DateField` / `TimeField` | Field có label | `label`, `hint?`, `error?`, `counter?`, `required?`, `suffix?` | default, focus, filled, error (`aria-invalid`), disabled | Goal form, EntryForm, Day, Settings (M1) |
| `SegmentedControl` / `RadioGroup` | Chọn 1 trong ít lựa chọn | `legend`, `options`, `value` | default, selected, focus, disabled | Goal form (M1), Goal detail Range (M5) |
| `Select` | Chọn Goal/Year | `label`, `options` | default, focus, disabled | Review (M4) |
| `Switch` | Bật/tắt (role switch) | `label`, `description?`, `checked` | on, off, focus, disabled | Settings (M2) |
| `Badge` / `StatusChip` | Nhãn trạng thái luôn có chữ | tone: success / info / neutral / warning | — | Goals, Goal detail, Settings, EntryRow nguồn (M1) |
| `PlusOnePill` | Chỉ báo "+1%" khi đạt chỉ tiêu | `animate?` (M5, đúng 1 lần) | static, entering (≤ 240 ms, tắt khi reduced-motion) | GoalCard, Day (M1; animate M5) |
| `ProgressBar` | Tiến độ hôm nay | `value`, `max`, `label` (`role="progressbar"`) | 0, partial, full (tối đa 100 %) | GoalCard, StatCard (M1) |
| `GoalCard` | Card goal trên Today/Day | `goal`, `minutes`, `target`, `variant`: today / day; `timerRunning?` | idle, form-open, met, timer-running, timer-disabled | Today (M1; timer M2), Day (M3) |
| `EntryForm` | Thêm/sửa entry | `mode`: add / edit; `defaultValues`; `onSubmit` | default, error theo field, saving (`Saving…`), disabled | Today, Day (M1), StopTimerDialog (M2) |
| `EntryRow` | Một entry + Edit/Delete + xác nhận xoá inline | `entry`, `showSource?` | default, editing, confirming-delete | Today, Day, GoalCard (M1) |
| `ConfirmDialog` | Xác nhận phá huỷ (D2, D3) | `title`, `body`, `confirmLabel`, `tone`, `initialFocus: cancel` | open, busy | Goals, Goal detail (M1), Settings (M3) |
| `StopTimerDialog` | D1 | `elapsed`, `defaultMinutes`, `startedDate` | open, error, saving | Today (M2) |
| `TimerCard` | Hiển thị timer đang chạy | `goal`, `startedAt` | running (cập nhật mỗi giây, `role="timer"`), stopping | Today (M2) |
| `Banner` (`ReminderBanner`, `BackupBanner`) | Thông báo không chặn | tone: info / neutral / warning | — | Today (M2, M3), Settings (M3) |
| `Alert` | Lỗi/thành công inline (`role="alert"` / `status`) | tone: danger / success | — | Goal form, Settings import (M1/M3) |
| `Toast` / `ToastRegion` | Phản hồi tạm 4 s (`role="status"`, `aria-live="polite"`), tối đa 1 toast hiển thị | `message`, `action?` | enter, exit | tất cả (M1) |
| `UpdateToast` | `A new version is available.` + `Reload` (SW cập nhật) | — | persistent đến khi bấm | AppShell (M1) |
| `OfflineChip` | Báo offline | — | hiện/ẩn theo `navigator.onLine` | AppShell (M1) |
| `StatCard` | Một chỉ số | `label`, `value`, `sub?`, `progress?` | default, loading (skeleton), zero | Review, Goal detail (M4, M5) |
| `Heatmap` | Lưới năm 53×7 | `year`, `cells`, `mode`: goal / all, `onSelect` | cell levels 0–4, today, future, outside; focus; tooltip | Review (M4) |
| `BarChart` | Cột tuần/tháng (Recharts, lazy) | `series`, `unit`, `title` | default, empty (text), loading | Review (M4) |
| `CurveChart` | Đường Ideal vs You (Recharts, lazy) | `ideal[]`, `actual[]`, `today`, `range` | default, empty-actual, upcoming | Goal detail (M5) |
| `HistoryTable` | Lịch sử entry | `entries` | default, empty | Goal detail (M3) |
| `DateNav` | Điều hướng ngày | `date`, `today` | next vô hiệu ở hôm nay | Day (M3) |
| `EmptyState` | Trạng thái rỗng | `title`, `body`, `action?` | — | Today, Goals, Review, Day, Goal detail (M1 tối thiểu / M5 đủ) |
| `ErrorState` | Lỗi có hành động | `title`, `body`, `action` | — | Not found, StorageError, Review/Detail lazy lỗi |
| `Skeleton` | Placeholder loading | `lines`, `block` | tĩnh; nhấp nháy nhẹ (tắt khi reduced-motion) | mọi màn (M5 rà soát) |

Quy tắc dùng chung:

- Mỗi `Button` luôn có chữ hoặc `aria-label`; nút phá huỷ dùng `danger`, không đặt cạnh primary mà không có khoảng cách ≥ 8 px.
- Chỉ **một** toast tại một thời điểm; toast mới thay toast cũ.
- Dialog dùng phần tử `<dialog>` + `showModal()` (có sẵn focus trap, Esc đóng, `::backdrop`), trả focus về phần tử đã mở dialog (nếu phần tử đó không còn, về `<h1>` hoặc TimerCard).
- Form: lỗi hiển thị dưới field bằng icon + chữ, `id` lỗi được nối vào `aria-describedby`; không đổi layout nhảy đột ngột (chừa chỗ cho hint).

---

## 6. Design tokens

Cài đặt: một file `src/ui/styles/tokens.css` khai báo CSS custom properties trên `:root`; bản tối ghi đè trong `@media (prefers-color-scheme: dark)`. **Giá trị trong bảng đúng với mockup** (có thể copy từ khối `:root` ở đầu mọi file mockup). Không có công tắc sáng/tối trong MVP: theo hệ điều hành (Assumption A-D2). `<meta name="theme-color">` dùng `#F7F6F2` (sáng) / `#121513` (tối).

### 6.1 Màu

| Token | Sáng | Tối | Dùng cho |
| :- | :- | :- | :- |
| `--bg` | `#F7F6F2` | `#121513` | nền trang |
| `--surface` | `#FFFFFF` | `#1B1F1C` | card, dialog, nav |
| `--surface-2` | `#F0EEE7` | `#242925` | nền phụ, track progress, skeleton |
| `--border` | `#DDD9CE` | `#343B36` | viền card, đường kẻ |
| `--border-input` | `#7F8882` | `#7C867F` | viền ô nhập, radio (≥ 3:1) |
| `--text` | `#1D2320` | `#ECEFEA` | chữ chính |
| `--text-muted` | `#5A625D` | `#A3ACA5` | chữ phụ |
| `--primary` | `#1F7A4D` | `#5CC98F` | hành động chính, progress, đường "You" |
| `--primary-hover` | `#17613D` | `#7AD6A5` | hover/active của primary |
| `--on-primary` | `#FFFFFF` | `#0C2217` | chữ trên nền primary |
| `--primary-soft` | `#E3F2E9` | `#1E3328` | nền badge Active, tab đang chọn (desktop) |
| `--on-primary-soft` | `#14573A` | `#A8E6C3` | chữ trên primary-soft |
| `--plus-bg` | `#FDF1DC` | `#3A2D14` | nền pill "+1%" |
| `--plus-text` | `#8A3F06` | `#F5C97F` | chữ pill "+1%" |
| `--plus-border` | `#E9C98F` | `#6B5224` | viền pill "+1%" |
| `--danger` | `#B3261E` | `#FF8A80` | lỗi, nút xoá |
| `--on-danger` | `#FFFFFF` | `#3B0A07` | chữ trên nút danger |
| `--danger-soft` | `#FCE9E7` | `#3D1F1D` | nền alert lỗi |
| `--on-danger-soft` | `#8C1D18` | `#FFB4AD` | chữ trên danger-soft |
| `--info` | `#1D4E9E` | `#8DB4F5` | chữ banner/badge Upcoming |
| `--info-soft` | `#E8F0FC` | `#1C2A44` | nền banner nhắc, badge Upcoming |
| `--focus` | `#2457C5` | `#8DB4F5` | vòng focus |
| `--heat-0` … `--heat-4` | `#E7E5DC` `#BFE3CC` `#82C69C` `#3FA06A` `#1F7A4D` | `#2A302C` `#24503A` `#2F7A55` `#43A773` `#7FDDA8` | heatmap mức 0–4 |
| `--chart-ideal` | = `--text-muted` | = `--text-muted` | đường Ideal (nét đứt) |
| `--chart-actual` | = `--primary` | = `--primary` | đường You, cột nhấn |
| `--chart-bar` | = `--heat-3` | = `--heat-3` | cột biểu đồ (kỳ hiện tại dùng `--primary`) |
| `--scrim` | `rgba(20,28,24,.5)` | `rgba(0,0,0,.6)` | lớp phủ dialog |

Quy tắc dùng màu: amber (`--plus-*`) **chỉ** dành cho pill "+1%" (giữ nó hiếm và có ý nghĩa); xanh `--primary` cho tiến độ, hành động chính và đường "You"; đỏ chỉ cho lỗi và hành động xoá; xanh dương `--info` cho banner thông tin và badge Upcoming. Không dùng màu làm thông tin duy nhất: luôn kèm chữ/icon/hình dạng.

### 6.2 Typography

Font hệ thống (NFR-01: không font ngoài): `--font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Số dùng `font-variant-numeric: tabular-nums` (timer, tiến độ, stat, bảng).

| Token | Cỡ / dòng | Weight | Dùng cho |
| :- | :- | :- | :- |
| `--text-xs` | 12 / 16 | 400–600 | nhãn tab, chú thích, trục chart |
| `--text-sm` | 14 / 20 | 400–600 | chữ phụ, hint, badge |
| `--text-base` | 16 / 24 | 400 | thân bài, input (≥ 16 px để iOS không zoom) |
| `--text-lg` | 18 / 26 | 600 | h2 (tên goal, tiêu đề card) |
| `--text-xl` | 20 / 28 | 600–700 | tiêu đề dialog |
| `--text-2xl` | 24 / 30 | 700 | số lớn trên card (`20/30`), giá trị StatCard |
| `--text-h1` | 24 / 30 (28 / 34 ở ≥ 1024) | 700 | h1 |
| `--text-display` | 40 / 44 | 700 | timer `hh:mm:ss`, headline `+8.3% better` |

### 6.3 Khoảng cách, bo góc, đổ bóng, z-index, chuyển động

| Nhóm | Token = giá trị |
| :- | :- |
| Spacing (4 px) | `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 24, `--sp-6` 32, `--sp-7` 48 |
| Radius | `--r-sm` 6, `--r-md` 10, `--r-lg` 16, `--r-full` 999 |
| Shadow | `--shadow-1`: `0 1px 2px rgba(20,30,25,.06)` (card); `--shadow-2`: `0 12px 40px rgba(20,30,25,.22)` (dialog, toast) |
| Kích thước | `--tap` 44 (vùng chạm tối thiểu), `--content-max` 960, `--nav-w` 232, `--tabbar-h` 56 |
| Z-index | nav 20, toast 40, dialog 50 |
| Motion | `--dur-fast` 120 ms, `--dur` 200 ms, easing `ease-out`; mọi animation tắt (`0.01ms`) khi `prefers-reduced-motion: reduce` |
| Breakpoint | `sm` 640, `lg` 1024 (xem 3.2) |

Heatmap: ô 11 px + khoảng 2 px (mobile < 640 px; cuộn ngang trong vùng chứa), 13 px + 3 px (≥ 640 px; 53 cột = 845 px, vừa khít vùng nội dung 960 px ở ≥ 1024 px, tablet vẫn có thể cuộn); bo 2 px. Biến CSS `--cell`, `--gap`.

---

## 7. Copy và thông báo

### 7.1 Quy ước định dạng

| Loại | Quy tắc | Ví dụ |
| :- | :- | :- |
| Ngày trong tiêu đề | `Intl` `en-US`, thứ + tháng + ngày (+ năm nếu không phải năm hiện tại, hoặc ở màn Day) | `Friday, October 9` / `Thursday, October 8, 2026` |
| Ngày kỹ thuật (khoảng goal, lịch sử, input) | `YYYY-MM-DD`, dấu `–` (en dash) giữa hai đầu khoảng | `2026-10-01 – 2026-10-31` |
| Phút | `{n} min`; trên card Today `{a}/{b} min` | `20/30 min` |
| Thời lượng dài | < 60: `{n} min`; ≥ 60: `{h} h {m} min` (bỏ phần 0); tổng giờ thống kê: một chữ số thập phân | `2 h 40 min`, `4.0 h` |
| Phần trăm | một chữ số thập phân | `25.8%`, `+8.3% better` |
| Timer | `hh:mm:ss` | `00:25:31` |
| Số nhiều | `1 goal`, `2 goals`; `1 entry`, `23 entries`; `1 day`, `8 days` | |
| Giờ nhắc | 24h `HH:MM` | `20:00` |

### 7.2 Nhãn, nút, toast

| Key | Ngữ cảnh | Nội dung |
| :- | :- | :- |
| `app.name` | tên app, `<title>` mặc định | `1% Better per Day` |
| `app.tagline` | EmptyState/About | `1% better, one day at a time.` |
| `nav.today` / `nav.goals` / `nav.review` / `nav.settings` | tab | `Today` / `Goals` / `Review` / `Settings` |
| `a11y.skip` | skip link | `Skip to content` |
| `offline.chip` | OfflineChip | `Offline — saved on this device` |
| `update.toast` | SW có bản mới | `A new version is available.` + nút `Reload` |
| `common.loading` | SR loading | `Loading…` |
| `common.saving` | nút đang lưu | `Saving…` |
| `toast.goalCreated` | sau tạo goal | `Goal created` |
| `toast.goalUpdated` | sau sửa goal | `Goal updated` |
| `toast.goalDeleted` | sau xoá goal | `Goal deleted` |
| `toast.goalArchived` / `toast.goalRestored` | M5 | `Goal archived` / `Goal restored` |
| `toast.entrySaved` | thêm entry, lưu từ timer | `Entry saved` |
| `toast.entryUpdated` | sửa entry | `Entry updated` |
| `toast.entryDeleted` | xoá entry | `Entry deleted` |
| `toast.timerDiscarded` | M2 | `Timer discarded` |
| `toast.reminderTime` | M2 | `Reminder time saved` |
| `toast.icsDownloaded` | M2 | `Calendar file downloaded` |
| `toast.backupExported` | M3 | `Backup exported` |
| `toast.backupImported` | M3 | `Backup imported: {n goals}, {m entries}` |
| `plusone.live` | vùng `aria-live` khi +1% (M5) | `+1% for {goal name} today.` |

### 7.3 Thông báo lỗi (map theo mã lỗi trong ARCH §5.4)

Nguyên tắc: nói rõ chuyện gì, và làm gì tiếp. UI ánh xạ `code` → chuỗi dưới đây (file `src/ui/copy.ts`); `message` trong `DomainError` chỉ để debug/log.

| Mã | Hiển thị ở | Nội dung |
| :- | :- | :- |
| `GOAL_NAME_REQUIRED` | dưới Name | `Enter a name for your goal.` |
| `GOAL_NAME_TOO_LONG` | dưới Name | `Name must be 60 characters or fewer.` |
| `GOAL_WHY_TOO_LONG` | dưới Why | `Why must be 280 characters or fewer.` |
| `GOAL_TARGET_INVALID` (loại `daily`) | dưới field phút | `Enter a whole number of minutes from 1 to 1,440.` |
| `GOAL_TARGET_INVALID` (loại `total`, số giờ sai) | dưới field giờ | `Enter a whole number of hours from 1 to 10,000.` |
| `GOAL_TARGET_INVALID` (loại `total`, giờ hợp lệ nhưng `dailyTarget` > 1440) | dưới field giờ | `That's more than 1,440 minutes a day for this period. Lower the hours or choose a later end date.` |
| `GOAL_PERIOD_INVALID` (ngày trống/sai) | dưới Start/End date | `Choose a valid date.` |
| `GOAL_PERIOD_INVALID` (end < start) | dưới End date | `End date must be on or after the start date.` |
| `GOAL_PERIOD_INVALID` (> 1827 ngày) | dưới End date | `A goal can last up to 1,827 days (about 5 years). Choose an earlier end date.` |
| `GOAL_PERIOD_EXCLUDES_ENTRIES` | dưới Start/End date | `Some of your entries fall outside these dates. Choose dates that include every logged day, or delete those entries first.` |
| `GOAL_NOT_FOUND` | Not found / Alert | `This goal doesn't exist anymore. It may have been deleted.` |
| `ENTRY_NOT_FOUND` | Alert | `This entry doesn't exist anymore. It may have been deleted.` |
| `ENTRY_MINUTES_INVALID` | dưới Minutes | `Enter a whole number of minutes from 1 to 1,440.` |
| `ENTRY_NOTE_TOO_LONG` | dưới Note | `Note must be 280 characters or fewer.` |
| `ENTRY_DAY_LIMIT_EXCEEDED` | dưới Minutes | `A goal can have at most 1,440 minutes in one day. You can add up to {remaining} more for this day.` (remaining = 0: `This day is already full (1,440 minutes).`) |
| `DATE_IN_FUTURE` | Day / dialog | `You can't log time for a future date.` |
| `DATE_OUTSIDE_GOAL_PERIOD` | Alert trong form/dialog | `That date is outside this goal's dates ({start} – {end}).` |
| `GOAL_NOT_ACTIVE` | Alert (Start timer) | `Timers can only run on active goals.` |
| `TIMER_ALREADY_RUNNING` | Alert | `A timer is already running. Stop it before starting another.` |
| `TIMER_NOT_RUNNING` | Alert | `There's no timer running.` |
| `GOAL_TIMER_RUNNING` | Alert/toast (Archive) | `Stop or discard the running timer before archiving this goal.` |
| `IMPORT_FILE_TOO_LARGE` | Alert Backup | `This file is larger than 5 MB, so it can't be a 1% Better backup. Choose a different file. Nothing was changed.` |
| `IMPORT_INVALID_JSON` | Alert Backup | `This file isn't valid JSON. Choose a backup exported from 1% Better. Nothing was changed.` |
| `IMPORT_INVALID_SCHEMA` | Alert Backup | `This file doesn't look like a 1% Better backup. Choose a file exported from this app. Nothing was changed.` |
| `IMPORT_UNSUPPORTED_VERSION` | Alert Backup | `This backup uses a format version ({v}) this app can't read. Export it again from an up-to-date copy of the app. Nothing was changed.` |
| `IMPORT_INTEGRITY` | Alert Backup | `This backup is inconsistent (for example, entries that don't belong to any goal). Nothing was changed.` |
| `STORAGE_UNAVAILABLE` | màn S9 | xem S9 |
| (lỗi ghi storage) | Alert inline trong form | `Couldn't save. Your changes are still in the form — try again.` |
| (lỗi đọc dữ liệu/chunk) | ErrorState | `Couldn't load this view` / `Check your connection if you just updated the app, then try again.` + `Retry` |
| `NOTIFICATIONS_UNSUPPORTED` | Settings | `This browser doesn't support notifications. You'll still see a reminder banner in the app.` |
| `NOTIFICATIONS_DENIED` | Settings | `Notifications are blocked for this site. Allow them in your browser's site settings, then come back. You'll still see a reminder banner in the app.` |
| (chung, form có lỗi) | đầu form | `Fix {n} field to save.` / `Fix {n} fields to save.` |

### 7.4 Empty state

| Key | Màn hình | Tiêu đề | Nội dung | Nút |
| :- | :- | :- | :- | :- |
| `empty.today.noGoals` | Today | `Start with one small goal` | `Pick something you want to do a little every day. Log your time and watch it add up.` | `Create your first goal` |
| `empty.today.noActive` | Today | `No active goals today` | `Your goals haven't started yet, have ended, or are archived.` | `View goals` |
| `empty.goals` | Goals | `No goals yet` | `Pick something you want to do a little every day. Log your time and watch it add up.` | `Create your first goal` |
| `empty.review` | Review | `Nothing to review yet` | `Create a goal and log some time. Your year will show up here.` | `Create a goal` |
| `empty.review.year` | Review (có goal, chưa entry) | — | `No time logged in {year} yet.` | — |
| `empty.detail.history` | Goal detail | `No entries yet` | `Time you log for this goal will show up here.` | — |
| `empty.detail.curve` | Goal detail | — | `Your line starts rising on the first day you hit your target.` | — |
| `empty.day.noGoals` | Day | `No goals were running on this day` | `Goals show up here on the days they're active.` | `View goals` |
| `empty.day.noEntries` | Day (một goal) | — | `No time logged for this goal on this day.` | `Add entry` |

### 7.5 Form, banner, nhắc nhở, heatmap

| Key | Ngữ cảnh | Nội dung |
| :- | :- | :- |
| `form.entry.minutes` | label | `Minutes` (placeholder `e.g. 25`) |
| `form.entry.note` | label | `Note (optional)` (placeholder `What did you work on?`; counter `{n}/280`) |
| `form.goal.name` | label | `Name` (placeholder `e.g. Read`) |
| `reminder.banner` | Today banner (nhiều goal) | `It's past {HH:MM} — {n} goals are not on target yet.` |
| `reminder.banner.one` | Today banner (1 goal) | `It's past {HH:MM} — 1 goal is not on target yet.` |
| `backup.banner.never` | Today (có nút), Settings (không nút) | `You haven't backed up yet. Export a backup so your data is safe if this browser clears it.` + nút `Back up now` (chỉ ở Today, → `#/settings`) |
| `backup.banner.old` | Today (có nút), Settings (không nút) | `It's been {n} days since your last backup.` + nút `Back up now` (chỉ ở Today, → `#/settings`) |
| `notification.title` | Notification | `1% Better` |
| `notification.body` | Notification | `{n} goals left today: Read 10/30 min, Guitar 0/20 min` — tối đa 3 goal rồi `, and {k} more`; 1 goal: `1 goal left today: Read 10/30 min` |
| `heatmap.cell.goalMet` | accessible name ô (một goal) | `Wednesday, October 7, 2026: 30 min, target met` |
| `heatmap.cell.goalNotMet` | ô có phút nhưng chưa đạt | `Tuesday, September 15, 2026: 10 min, target not met` |
| `heatmap.cell.none` | ô không có entry (trong khoảng) | `Monday, October 5, 2026: no time logged` |
| `heatmap.cell.all` | All goals | `Wednesday, October 7, 2026: 50 min, target met` (met = ít nhất một goal đạt; chưa đạt: `target not met`) |
| `heatmap.cell.future` | ô tương lai | `Saturday, October 10, 2026: upcoming` |
| `heatmap.cell.outside` | ngoài khoảng goal | `Friday, September 25, 2026: outside this goal's dates` |
| `heatmap.legend` | chú giải | `Less` … `More` |
| `heatmap.legend.all` / `heatmap.legend.goal` | ghi chú cạnh chú giải | `Colors show total minutes per day.` / `Colors show the share of your daily target.` |
| `chart.bar.summary` | tóm tắt chart cột (SR) | `Last 12 weeks: {total} logged, busiest week starting {date} with {x}.` |
| `chart.curve.alt` | alt chart cong | xem S4 "Tóm tắt cho SR" |

---

## 8. Accessibility

Mục tiêu WCAG 2.1 AA; kiểm bằng `@axe-core/playwright` (0 vi phạm serious/critical) + kiểm thủ công bằng bàn phím.

**Tương phản (tính tay, ước lượng; QC xác nhận bằng axe):**

| Cặp | Sáng | Tối |
| :- | :- | :- |
| `--text` trên `--bg` | ≈ 14.8:1 | > 14:1 |
| `--text-muted` trên `--surface` / `--bg` | ≈ 6.3:1 / 5.8:1 | ≈ 7.2:1 |
| `--on-primary` trên `--primary` | ≈ 5.3:1 | ≈ 8.2:1 |
| `--primary` làm chữ trên `--bg` | ≈ 4.9:1 | ≈ 8.1:1 |
| `--on-primary-soft` trên `--primary-soft` | ≈ 7.4:1 | > 7:1 |
| `--plus-text` trên `--plus-bg` | ≈ 6.7:1 | > 7:1 |
| `--on-danger-soft` trên `--danger-soft` | ≈ 5.5:1 | > 7:1 |
| `--info` trên `--info-soft` | ≈ 6.9:1 | > 7:1 |
| `--border-input` trên `--surface` (non-text, ≥ 3:1) | ≈ 3.6:1 | ≈ 4.4:1 |
| `--focus` trên `--bg`/`--surface` | ≈ 6:1 | > 8:1 |

Ngoại lệ có chủ đích: các mức nhạt của heatmap (`--heat-0..2`) không đạt 3:1 so với nền (WCAG 1.4.11). Thông tin của từng ô luôn có ở dạng text (accessible name, tooltip chữ, số liệu thống kê, tóm tắt) nên không mất nội dung; ô có viền mảnh 1 px (`rgba` 8 %) để thấy hình dạng.

**Bàn phím và focus**

- Mọi control dùng được bằng bàn phím; thứ tự Tab theo thứ tự đọc; có skip link. Focus-visible: vòng `2px solid var(--focus)` + offset 2 px trên mọi phần tử tương tác; không bao giờ `outline: none` mà không thay thế.
- Đổi route → focus vào `<h1>` mới (`tabindex="-1"`), `document.title` cập nhật.
- Dialog (`<dialog>` + `showModal()`): focus ban đầu — D1: ô Minutes; D2/D3: nút `Cancel`; Esc = đóng (D1: `Keep running`, giữ timer chạy); Tab bị khoá trong dialog; trả focus về phần tử gọi.
- EntryForm mở → focus vào Minutes; đóng → trả focus về nút gọi. Xoá entry xong → focus về nút `Log time`/`Add entry` của card.
- Submit form lỗi → focus field lỗi đầu tiên; vùng `role="alert"` đầu form tóm tắt số lỗi.

**Label và ngữ nghĩa**

- Mọi input có `<label>` hiển thị (placeholder không thay thế label). Lỗi nối bằng `aria-describedby` + `aria-invalid="true"`; field bắt buộc có `required` + dấu `*` kèm chữ ẩn "required".
- Nút icon có `aria-label` mô tả đối tượng (`Edit entry: 20 min, Ch. 3`). Badge luôn có chữ.
- `ProgressBar`: `role="progressbar"` với `aria-valuenow/min/max` và `aria-valuetext="20 of 30 minutes"`, `aria-label` nêu tên goal.
- Switch: `role="switch"` + `aria-checked`. Toast/banner động: `role="status"` (polite), lỗi chặn: `role="alert"`. Toast không tự biến mất khi đang hover/focus.
- `TimerCard`: `role="timer"` (không đọc từng giây); nút Stop có `aria-label="Stop timer for Read, running 00:25:31"` cập nhật khi nhận focus.
- Trạng thái vô hiệu của `Start timer`: `aria-disabled="true"` + `aria-describedby` trỏ "Stop the running timer first." (vẫn focus được để người dùng đọc lý do).
- Pill "+1%" là text thật (`+1%`), không dùng `aria-label`; kèm chữ ẩn visually `Target reached for today` cho SR. M5: vùng `aria-live="polite"` đọc `+1% for {goal} today.` đúng một lần.

**Heatmap**

- Container: `role="grid"`, `aria-label="Activity heatmap for {year}, {goal}"`, `aria-rowcount=7`; hàng = thứ Hai … Chủ nhật (trùng bố cục trực quan để phím mũi tên khớp hướng nhìn); mỗi ô `role="gridcell"`, `tabindex` roving (chỉ một ô `0`: hôm nay hoặc ô cuối cùng đã qua; còn lại `-1`), có accessible name đúng mục 7.5. Ô ngoài năm là ô đệm `aria-hidden="true"`.
- Phím: Trái/Phải = tuần trước/sau (cùng thứ), Lên/Xuống = ngày trước/sau, Home/End = đầu/cuối năm, Enter/Space = mở Day (với ô hợp lệ). Ô tương lai/outside: `aria-disabled="true"`, vẫn focus được để đọc.
- Trên heatmap có tóm tắt text ngay trên lưới (hiển thị, không ẩn) — xem S6 Copy — và danh sách số liệu ở stat card.
- Không dùng `title` làm cơ chế duy nhất; tooltip hiện khi hover và focus.

**Biểu đồ (BarChart, CurveChart)**

- Mỗi biểu đồ nằm trong `<figure>` có `<figcaption>` và tóm tắt text hiển thị (7.5 / S4); SVG của Recharts đặt `aria-hidden` hoặc `role="img"` + `aria-label` bằng tóm tắt ngắn.
- Có bảng dữ liệu tương đương: BarChart — bảng ẩn visually (`.sr-only`) với `caption`; CurveChart — `<details>` "Show data as table" hiển thị được cho mọi người.
- Phân biệt hai đường Ideal/You không dựa vào màu: Ideal nét đứt mảnh + màu xám; You nét liền dày + màu xanh + marker tròn tại hôm nay; legend có mẫu nét; nhãn trực tiếp tại điểm hôm nay (`Ideal +9.4%`, `You +8.3%`).
- Cột biểu đồ có nhãn giá trị khi đủ chỗ, tooltip khi hover/focus.

**Khác**

- Vùng chạm ≥ 44×44 px (nút, tab, ô chọn, icon button); khoảng cách giữa hai vùng chạm kề nhau ≥ 8 px. Ngoại lệ: ô heatmap nhỏ (≥ 11 px) — thay bằng bàn phím và danh sách số liệu; trên mobile mỗi ô là đích bấm nhỏ nhưng thao tác này là phụ (Should, FR-26).
- Text co giãn đến 200 % không mất nội dung (dùng `rem` cho cỡ chữ, bố cục dùng `min-width: 0`/wrap, không chiều cao cố định cho chữ). Reflow ở 320 px không cần cuộn ngang (trừ heatmap).
- `prefers-reduced-motion`: tắt hiệu ứng pill, skeleton nhấp nháy, transition.
- `lang="en"`; `viewport` không khoá zoom; input cỡ ≥ 16 px.
- Màu không phải kênh duy nhất: badge có chữ, lỗi có icon + chữ, pace có chữ "ahead/behind", tab active có vạch/đậm.

---

## 9. Interface spec (cho CLI/API/bot)

Không áp dụng — app có giao diện đồ hoạ (PWA). Các "giao diện" không phải màn hình đã có đặc tả ở nơi khác: payload notification (`ARCHITECTURE.md` §5.6; copy ở mục 7.5), file `.ics` (§5.7), file backup (§5.5).

---

## 10. Assumptions

- **A-D1.** Màn Review ở chế độ **All goals** không hiển thị `Progress` và `Pace` (PRD FR-24 và AC M4-AC5 chỉ định nghĩa số liệu này theo từng goal; tổng hợp nhiều goal có chỉ tiêu và khoảng khác nhau dễ gây hiểu sai). Thay bằng gợi ý chọn một goal. Cần planner/user xác nhận (xem Open questions).
- **A-D2.** Giao diện sáng/tối **tự theo hệ điều hành**, không có công tắc trong MVP (không có trong PRD). Token tối đã định nghĩa sẵn.
- **A-D3.** Không dùng thư viện UI (Tailwind/MUI): CSS thuần với custom properties, vì `ARCHITECTURE.md` không chọn UI framework. Developer có thể dùng CSS Modules hoặc một file global; chỉ cần đúng token.
- **A-D4.** Biểu đồ đường cong có control **Range** (`Whole period` / `So far`) để khỏi bị đường Ideal "ăn" hết thang đo với goal dài (1.01^365 ≈ ×37.8; 1.01^1827 ≈ ×7,9·10^7). Mặc định `So far` khi khoảng > 120 ngày, ngược lại `Whole period`. Đây là điều khiển phụ, chỉ lọc dữ liệu đã có; thang Y luôn tuyến tính.
- **A-D5.** Xoá entry có xác nhận inline (`Delete this entry?` → `Delete`/`Keep`) vì vùng chạm Edit/Delete nằm sát nhau trên điện thoại. Xoá goal dùng dialog (D2).
- **A-D6.** Đóng dialog Stop (Esc hoặc `Keep running`) **không** dừng/huỷ timer: dialog chỉ là bước xác nhận; timer chỉ kết thúc khi `Save entry` hoặc `Discard session` (khớp `TimerService.stop` chỉ tính số phút, `save`/`discard` mới xoá `activeTimer`).
- **A-D7.** Entry chỉ sửa được `minutes` và `note` (theo `EntryService.update`); muốn chuyển entry sang ngày khác thì xoá và thêm lại ở Day đúng ngày.
- **A-D8.** Form Goal không hỏi xác nhận khi rời với thay đổi chưa lưu (giữ đơn giản).
- **A-D9.** Banner nhắc (FR-15) không có nút đóng; banner backup đặt ở Today (dưới banner nhắc) và ở đầu card Backup trong Settings. Chỉ hiện ≤ 1 banner backup.
- **A-D10.** Streak chip trên Today (`{n}-day streak`, tính streak tổng) chỉ xuất hiện từ M4 (cần `StatsService`).
- **A-D11.** `Last backup` hiển thị ngày dạng `YYYY-MM-DD` theo giờ cục bộ từ `lastBackupAt`.
- **A-D12.** Màu amber của "+1%" là điểm nhấn thương hiệu duy nhất ngoài xanh chủ đạo; logo là ô vuông bo góc chữ "1%" nền `--primary`. Icon vẽ bằng SVG inline (không icon font, không tải ngoài).

---

## 11. Open questions

- **OQ-D1 (cho planner/user).** FR-24 chưa nói Review "All goals" hiển thị `Progress`/`Pace` thế nào. Thiết kế hiện ẩn hai thẻ này ở All goals (A-D1). Nếu muốn có, cần định nghĩa công thức tổng hợp (ví dụ: chỉ cộng các goal `active`).
- **OQ-D2 (cho user, nhỏ).** Control `Range` trên đường cong (A-D4) là phần thêm ngoài PRD để biểu đồ dùng được với goal dài. Duyệt hay bỏ (bỏ thì goal "This year" sẽ thấy đường You gần như phẳng ở đầu năm)?
- **OQ-D3 (cho planner).** PRD chưa có luồng "đóng banner nhắc" hay "tắt nhắc hôm nay". Thiết kế không thêm (A-D9). Nếu muốn, thêm FR.
- **OQ-D4 (cho planner, thông tin).** TASKS M1-AC7 mô tả "xoá entry" không nhắc bước xác nhận; thiết kế có xác nhận inline (A-D5) nên e2e cần thêm một cú bấm `Delete`.
- **OQ-D5 (cho planner, thông tin).** Quy ước hiển thị mà các AC đang tham chiếu và thiết kế đã thống nhất: Today `20/30`, timer `00:01:05`, Stop điền sẵn `26`, khoảng goal `2026-10-01 – 2026-10-31`, `30 min/day`, `25.8%`, `+8.3% better`, preview import `5 goals, 23 entries`, notification body `3 goals left today: Read 0/30 min, …`.

---

## Changelog

- 2026-10-09 — v1, tạo mới (mode `new`): user flows, 9 màn hình + 3 dialog, component, tokens (sáng/tối), copy, a11y, 8 mockup HTML.
