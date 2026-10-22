# Design — 1% Better per Day

Phiên bản: **v5.0** (mode `revise`, 2026-10-21: **M12-T7 — toàn bộ phần UI/copy/hình ảnh của phase 6, app iOS lên App Store bằng Capacitor**, dùng cho M12 … M15; PRD v5.0 FR-58 … FR-67, NFR-18 … NFR-24, A-57 … A-71, OQ-12 … OQ-20; ARCH v5.0 §5.12 … §5.16, §4.7; TASKS v5.0 M12 … M15. **Không đổi layout, token màu cũ, key cũ nào; bản web giống hệt v4.0.** Thêm: biến thể native + bảng kiểm kê chuỗi web phải thay/ẩn (mục 7.8.1), nút **Sign in with Apple** (A1/A10, LoginPromptBanner, ExportSignInHint), lối vào **Delete account** + hộp thoại **D6** + panel thu hồi Apple thủ công (S7, 7.8.3), copy notification lên lịch trước + quyền iOS + **quyết định ẩn card `.ics` khi `scheduledNotifications`** (7.8.4), icon / launch screen / status bar (mục 5 "Native shell", S10), quy tắc safe area (mục 5), `support.html` + `privacy.html` en/vi (7.8.6), hồ sơ App Store `en-US` + `vi` (7.8.7), 5 screenshot + dataset demo (7.8.8), rà 360 px `vi` (3.6), a11y (8.3), **57 key mới** (en + vi, không key cũ nào đổi chữ), 6 token mới (`--apple-bg/-text`, `--safe-top/right/bottom/left`); chi tiết ở Changelog v5.0). Trước đó **v4.0** (mode `revise`, 2026-10-19: M11-T7 — thêm lựa chọn thứ ba **"Không có thời hạn"** (`No end date`) cho section Ends của form goal, chỉ với chỉ tiêu Phút mỗi ngày; kéo theo hàng goal ở Goals/Goal detail ("từ {start}"), "Day {k}" không tổng, bỏ Range, Stat Progress "tới hôm nay", hai câu lỗi mới; **12 key mới, không đổi chữ key cũ**; mọi goal có hạn hiển thị y như v3.1; chi tiết ở S2, S3, S4, S6, 7.3, 7.6.2 … 7.6.4, 7.6.6, 8.2, Changelog v4.0; PRD v4.0 FR-56/FR-57 A-47 … A-56, ARCH v4.0 §4.6, TASKS v4.0 M11). Trước đó **v3.1** (mode `revise`, 2026-10-17: M10-T8 — không thêm tính năng; **ghi nhận deviation đã ship** của phase 2/3 [brand mark ảnh logo, quy tắc một toast, hint Export chỉ khi online, `empty.day.noGoals` không dấu chấm] và **chốt copy/quy tắc còn mở**: 7 key hàng bị cloud từ chối, `settings.about.privacyLink`, `errors.IMPORT_INVALID_SCHEMA_outOfRange`, `errors.EXPORT_FAILED`, nhãn giá trị cột BarChart, câu chữ heatmap 1024–1191 px; chi tiết ở Changelog v3.1; PRD v3.1 A-44 … A-46, ARCH v3.1 ADR-28/30, TASKS v3.1 M10). Trước đó **v3.0** (mode `revise`, 2026-10-13: phase 3 — đường cong "Bạn" tính theo phút so với ngày có ghi trước, FR-27 v3.0; PRD v3.0, ARCHITECTURE v3.0 §4.5, TASKS v3.0 M9). **v3.0 chỉ đổi Goal detail (S4)**: headline, phụ đề, biểu đồ đường cong, bảng dữ liệu, chú thích và các key `goal.detail.*` / `empty.detail.curve` (xem Changelog); mọi màn khác, token màu/cỡ chữ, bố cục và copy giữ nguyên. Trước đó v2.0 (2026-10-12: phase 2 — đăng nhập Google tuỳ chọn + đồng bộ cloud; app build không cấu hình cloud giống hệt v1.1) và v1.1 (2026-10-09, thêm tiếng Việt). Nguồn: `docs/plan/PRD.md`, `ARCHITECTURE.md`, `TASKS.md`.
Loại app: **GUI** (PWA một người dùng, mobile-first 360 px, dùng tốt trên desktop 1440 px). **UI song ngữ English (`en`) / Tiếng Việt (`vi`)**: mặc định theo `navigator.language`, đổi trong Settings (FR-32 … FR-36). Tài liệu bằng tiếng Việt. **Nguồn sự thật của mọi chuỗi UI là mục 7 (bảng key `en` / `vi`); developer copy nguyên văn từ đó vào `en.json` / `vi.json`.** Các khối "Copy" trong mục 4 là bản `en` để đọc nhanh theo ngữ cảnh; nếu lệch với mục 7 thì mục 7 thắng.

Mockup HTML tĩnh (mỗi file tự chứa, không CDN, responsive 360 → 1440 px, tự theo sáng/tối của hệ thống): xem `docs/design/mockups/index.html`. Các mockup viết bằng `en`; riêng Today có thêm bản `vi`. **(v3.1)** Brand mark trong nav của mọi mockup nạp ảnh `public/brand-mark-96.png` của repo bằng đường dẫn tương đối `../../../public/brand-mark-96.png` (không qua mạng; ngoại lệ có chủ đích của quy tắc "tự chứa" vì không nhúng được ảnh dạng base64 trong lượt làm này — nếu mở file mockup ngoài repo thì ô trắng sẽ trống, phần còn lại không ảnh hưởng).

| Mockup | Màn hình | Milestone chính |
| :- | :- | :- |
| `mockups/01-today.html` | S1 Today (banner nhắc, form ghi nhanh, card đạt/chưa đạt). **v2:** bộ chọn trạng thái tài khoản (chưa đăng nhập + LoginPromptBanner, hoặc đã đăng nhập với SyncIndicator 5 trạng thái), nút đổi sáng/tối | M1 (+M2 banner); M7 (SyncIndicator); M8 (LoginPromptBanner) |
| `mockups/01-today.vi.html` | S1 Today bản tiếng Việt (cùng dữ liệu; tham chiếu độ dài chuỗi `vi` ở 360 px). **v2:** cùng bộ chọn trạng thái tài khoản, chuỗi `vi` | M1 (+M2 banner); M7; M8 |
| `mockups/02-goals.html` | S2 Goals (nhóm trạng thái, xác nhận xoá). **v4.0:** thêm 2 hàng goal không thời hạn (Active "Meditate", Upcoming "Piano"), nút đổi `English` / `Tiếng Việt` cho cả trang (kiểm hàng `vi` ở 360 px) | M1; M11 |
| `mockups/03-goal-form.html` | S3 Goal form (lỗi inline, gợi ý chỉ tiêu ngày). **v4.0:** viết lại có tương tác: radio thứ ba "No end date" / "Không có thời hạn", khoá khi chọn Total hours + ghi chú, tự chuyển sang "This year" kèm thông báo, chế độ sửa goal không hạn, nút đổi `English` / `Tiếng Việt`, bộ chọn tình huống | M1; M11 |
| `mockups/04-timer.html` | S1 khi timer chạy + D1 Stop dialog | M2 |
| `mockups/05-day.html` | S5 Day (ghi bù) | M3 |
| `mockups/06-review.html` | S6 Review (heatmap, streak, thống kê, biểu đồ tuần/tháng; đổi được All goals / Read) | M4 |
| `mockups/07-goal-detail.html` | S4 Goal detail với đường cong 1%. **v3:** dữ liệu thật của user (R1: 5 → 10 → 14 → 27 phút = +440,0%), nút đổi `English` / `Tiếng Việt`, bộ chọn 7 tình huống (R1, R1 sang ngày chưa ghi, hôm nay ghi dở, R3 đi xuống, R4 cực trị, chỉ một ngày có ghi, chưa có entry), thang Y tự co giãn + đường 0%. **v4.0:** thêm 3 tình huống goal không thời hạn (O1 ngày 9; O1 ngày đầu tiên; chưa bắt đầu): "Day {k}" không tổng, không có Range, Progress "tới hôm nay", chưa bắt đầu không có biểu đồ | M3 (lịch sử) / M5 (đầy đủ) / M9 (đường cong v3) / M11 (goal không thời hạn) |
| `mockups/08-settings.html` | S7 Settings (ngôn ngữ, **card Account (v2)**, nhắc nhở, backup, storage, about). **v2:** bộ chọn trạng thái tài khoản (chưa đăng nhập / đang đăng nhập / đã đăng nhập / hết phiên / ngoại tuyến), ghi chú "theo tài khoản", Backup/Storage/About theo trạng thái, D3 biến thể đã đăng nhập | M1–M3; M6 (Account, About); M7 (đồng bộ, D3); M8 (gợi ý Backup/Storage) |
| `mockups/09-account.html` | **Mới (v2):** bảng tham chiếu mọi trạng thái của card Account, nút Google, SyncIndicator, LoginPromptBanner, ExportSignInHint, dialog D3 (đã đăng nhập), D4, D5. Có nút đổi `English` / `Tiếng Việt` (bản `vi` đầy đủ để kiểm 360 px) và sáng/tối. **v5.0:** thêm mục 7 … 11 ở cuối trang: Account trên iOS (nút Apple đặt trên nút Google, A1/A2/A3/A4/A5/A10, đăng nhập bằng Apple với email relay), nút Apple (5 trạng thái, sáng + tối), LoginPromptBanner và ExportSignInHint trên iOS, lối vào **Delete account** (bật / tắt khi offline / tắt khi hết phiên), **D6** (xoá dữ liệu máy mặc định, giữ dữ liệu, có bước Apple, đang xoá, 4 lỗi `ACCOUNT_DELETE_*`), kết quả (toast, panel thu hồi Apple thủ công) | M6, M7, M8; **M14 (v5.0)** |
| `mockups/08-settings.html` (v5.0) | Cùng file Settings ở trên, thêm chọn **Platform**: `Web`, `iOS app (M12–M14)` (không lên lịch thông báo, tài khoản ẩn), `iOS app (M15)` (thông báo lên lịch, không card `.ics`); biến thể native của Language, Reminders, Backup (share sheet), Storage, About (link Privacy + Support), sơ đồ safe area iPhone | **M12 … M15 (v5.0)** |
| `mockups/10-store-screenshots.html` | **Mới (v5.0):** phác bố cục **5 screenshot App Store** (440×956 CSS px, thu nhỏ 50 % để xem): Today, Today có timer, Goal detail (đường cong), Review (heatmap), Goals; đổi `en` / `vi`; theme sáng/tối theo kế hoạch ở 7.8.8; heatmap sinh từ công thức dataset demo; không khung máy, không chữ quảng cáo | M15 |

Mockup dùng một đoạn JS nhỏ inline: (a) sinh heatmap/biểu đồ từ dataset S1 (đúng số liệu trong `TASKS.md`); (b) **v2:** nút đổi giao diện sáng/tối (đặt `data-theme` trên `<html>`, mặc định theo hệ điều hành), bộ chọn trạng thái tài khoản (bật/tắt khối bằng thuộc tính `data-acct`), và ở `09-account.html` đổi `en`/`vi`. Không có request mạng, không CDN, không font ngoài; logo chữ G của Google là SVG inline.

---

## 1. Nguyên tắc thiết kế

1. **Ghi nhanh hơn nghĩ.** Việc lặp lại nhiều nhất (ghi thời gian hôm nay) làm được ngay trên Today, tối đa 3 thao tác: bấm `Log time` → nhập phút → `Save entry` (PRD §8). Không điều hướng sang màn khác để ghi.
2. **Khích lệ nhẹ, không phô trương.** "+1%" là một viên thuốc (pill) nhỏ màu hổ phách, chỉ xuất hiện khi goal đạt chỉ tiêu ngày. Không confetti, không âm thanh, không điểm/huy hiệu (PRD non-goal). Ngày chưa đạt **không dùng màu đỏ** và không có chữ "failed"/"missed". **(v3.0)** Đường "Bạn" giờ có thể đi xuống (FR-27 v3.0; A-02 cũ "ngày lỡ không trừ" chỉ còn đúng với ngày 0 phút, vốn đi ngang): số âm vẫn **không đỏ**, không có chữ "worse"/"failed"; headline âm đổi sang màu chữ thường `--text` và nói trung tính "so với ngày đầu". Đỏ chỉ dành cho lỗi và hành động phá huỷ.
3. **Số liệu trung thực.** **(v3.0)** Đường lý tưởng 1.01^k (**v5.1:** 1.01^(k−1), ngày đầu của khoảng ở +0%) và đường "Bạn" (phút của ngày có ghi gần nhất so với ngày đầu có ghi, nhân dồn từ mỗi ngày so với ngày có ghi trước) vẽ cùng một thang tuyến tính **tự co giãn theo cả hai** và luôn có vạch 0%; hiển thị đúng con số (một chữ số thập phân, có dấu `+`/`−`), có chú thích cách tính và đúng số phút làm nên con số đó. Heatmap/biểu đồ luôn có bản text tương đương.
4. **Mobile-first, desktop rộng rãi.** Cùng nội dung, khác bố cục: thanh tab dưới (< 1024 px) → sidebar trái (≥ 1024 px); Review và Goal detail tận dụng chiều rộng để thấy cả heatmap năm.
5. **Dữ liệu của bạn, nằm trên máy bạn trước.** Giọng điệu bình tĩnh, nói rõ giới hạn thật (nhắc nhở chỉ khi app mở, cần backup, trình duyệt có thể dọn dữ liệu). Không dọa, không đổ lỗi người dùng.
6. **(Phase 2) Tài khoản là một lựa chọn, không phải một cánh cổng.** Đăng nhập Google chỉ thêm một bản sao an toàn trên cloud; app không bao giờ chặn, không hỏi lặp, không làm chậm việc ghi thời gian vì chưa đăng nhập hoặc vì mất mạng. Mọi chỗ nhắc đăng nhập đều là banner/dòng chữ có "Not now" hoặc có thể bỏ qua, không phải dialog. Mọi nơi nói về dữ liệu phải nói **đúng nơi dữ liệu đang nằm** (chỉ trên máy này / máy này + tài khoản của bạn) và trạng thái đồng bộ phải luôn đọc được, kể cả bằng screen reader.
7. **(Phase 6, v5.0) Cùng một app, chỉ khác ở chỗ nền tảng bắt buộc khác.** App iOS dùng đúng màn hình, bố cục, token và chữ của bản web; chỉ **ba loại** thay đổi, và mỗi loại phải có lý do ghi được: (a) **bỏ thứ không còn đúng** trên native (cài PWA, "New version", "browser", hướng dẫn Add to Home Screen, giới hạn "chỉ khi app mở"); (b) **thêm thứ Apple bắt buộc** (nút Sign in with Apple ngang hàng nút Google, Delete account trong app); (c) **dùng thành phần của hệ điều hành** (share sheet, quyền thông báo, safe area, status bar, launch screen). Không thêm màn hình, không thêm điều hướng, không đổi thứ tự card. Người dùng chuyển từ web sang app không phải học lại gì; chữ trên app nói đúng nơi dữ liệu nằm ("trên iPhone này", không nói "trình duyệt").
8. **(Phase 6) Hành động không thể hoàn tác phải khó bấm nhầm nhưng không khó tìm.** "Delete account" luôn thấy ngay trong card Account (Apple yêu cầu dễ tìm), nhưng đi qua một hộp thoại nêu rõ hậu quả, nút xác nhận kiểu phá huỷ, focus ban đầu ở `Cancel`; lúc chưa làm được (offline, hết phiên) thì nút vô hiệu **kèm lý do hiện sẵn**, không giấu nút.

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
[Goals] bấm tên goal --> [Goal detail]: headline "+X% better" (âm: "−X% vs your first day"), đường cong Ideal vs You, stat, lịch sử
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
(v2, M7) Đã đăng nhập: D3 dùng biến thể "Replace data on all your devices?" (nói rõ import cũng thay dữ liệu trong tài khoản);
         offline thêm dòng "reaches your account when you're back online"; sau import chỉ báo đồng bộ chuyển "Syncing…" --> "Synced".
(v2, M8) Chưa đăng nhập + cloud bật + chưa gợi ý trong 30 ngày + **đang online lúc Export thành công** (v3.1, A-44): sau Export hiện ExportSignInHint trong card Backup (F14).
(v3.1, M10) Export thất bại (đọc dữ liệu lỗi, không tạo được tệp) --> (!) Alert danger trong card Backup `errors.EXPORT_FAILED` (cùng chỗ với lỗi import);
         KHÔNG có toast "Backup exported", KHÔNG tải tệp, KHÔNG gợi ý đăng nhập, "Last backup" không đổi; nút Export dùng lại được ngay.
         Export thành công nhưng việc "tiêu lượt" hint lỗi --> bỏ qua hint (im lặng), vẫn toast "Backup exported" và vẫn tải tệp.
```

### F8 — Archive / xoá goal (US-12, FR-04) — M1 (xoá), M5 (archive)

```text
[Goals / Goal detail] "Delete" --> [D2 Delete dialog: nêu số entry sẽ mất] --> "Delete goal" / "Cancel"
        (đang có timer chạy: dialog thêm dòng "Its running timer will be discarded.")
"Archive" --> <timer đang chạy trên goal?> --yes--> (!) GOAL_TIMER_RUNNING --> thông báo, không đổi
          --no--> goal sang nhóm "Archived", ẩn khỏi Today/nhắc nhở; "Restore" để đưa lại
```

### Phase 2 — đăng nhập tuỳ chọn và đồng bộ (v2.0)

Mọi flow dưới đây chỉ tồn tại khi bản build có cấu hình cloud (FR-38). Chưa đăng nhập thì F1–F8 không đổi. Trang đăng nhập/đồng ý của Google là **trang ngoài app**, không thiết kế ở đây.

### F9 — Đăng nhập bằng Google (US-16, FR-39, FR-40) — M6 (banner Today: M8)

```text
Điểm vào (đều dẫn tới cùng một luồng, khác nhau ở returnTo):
  [Settings > Account "Sign in with Google"]   returnTo = #/settings            (M6)
  [Today > LoginPromptBanner "Sign in with Google"]  returnTo = #/today         (M8)
  [Settings > Backup > ExportSignInHint "Sign in with Google"]  returnTo = #/settings   (M8)
        |
        v  bấm nút
   <online?> --no--> nút `disabled` + dòng "You're offline. Connect to the internet to sign in." (AUTH_OFFLINE nếu vẫn gọi được)
        |yes
        v  nút đổi thành "Signing in…" (disabled); lưu returnTo; điều hướng TOÀN TRANG tới Google
[Trang Google: chọn tài khoản --> đồng ý]   (ngoài app; người dùng có thể bấm Cancel/Back)
        |--- huỷ ---> về <BASE_URL>?auth=callback&error=access_denied
        |--- đồng ý -> về <BASE_URL>?auth=callback&code=…
        v
[App mở lại] bootstrap đọc + xoá query --> vào ĐÚNG màn returnTo (không nháy màn khác)
   Account card + StatusRow hiện "Signing in…" (signing-in) trong lúc đổi code lấy phiên
   <thành công?>
     |no --> (!) signed-out + lỗi: AUTH_CANCELLED (huỷ) | AUTH_FAILED (lỗi khác, gồm mở callback ở trình duyệt khác)
     |        Ở Settings: Alert danger trong card Account (có nút "Dismiss"), nút đăng nhập dùng lại được ngay.
     |        Ở màn khác (Today): toast lỗi (8 s) kèm nút "Go to Account" --> #/settings.
     |        Dữ liệu cục bộ KHÔNG đổi; không có dialog chặn.
     |yes--> signed-in: toast "Signed in as <email>" (v3.1: nếu lần đồng bộ đầu có gộp dữ liệu thì chỉ hiện `toast.mergeDone`, thay thế câu này — quy tắc một toast, mục 5); focus ở <h1> của màn (như mọi lần đổi route)
              Card Account hiện avatar chữ cái đầu + tên + email.
              (M7) --> F11 (gộp dữ liệu) --> F13 (đồng bộ)
```
Mở app khi offline: phiên đã lưu vẫn hiện (email, tên) và **không** báo lỗi (FR-40); chỉ báo đồng bộ nói "Offline".

### F10 — Đăng xuất, giữ hoặc xoá dữ liệu trên máy (US-19, FR-41) — M6 (cảnh báo chưa đồng bộ: M7)

```text
[Settings > Account (signed-in)] bấm "Sign out"
        |
        v
[D4 Sign out dialog]  mặc định: (•) Keep data on this device   ( ) Remove data from this device
   (M7) <còn thay đổi chưa đồng bộ?> --yes--> khối cảnh báo "N changes haven't synced…" + "We'll try to sync before signing you out." (online)
                                               hoặc "You're offline … they'll sync when you sign in again" (offline)
   (v3.1, ADR-28) <còn hàng trên máy bị cloud từ chối (`dirty = 2`)?> --yes--> cùng khối cảnh báo thêm "N items on this device couldn't be uploaded…" + "Whatever couldn't be uploaded stays on this device if you keep the data here…";
                                               mô tả lựa chọn Remove đổi sang bản KHÔNG nói "Your account keeps everything" (`removeDescRejected`);
                                               chọn Remove --> thêm "…anything that couldn't be uploaded will be lost. Export a backup first…" (7.7.2). Các hàng này KHÔNG đếm vào "đang chờ" và không chặn đồng bộ lần cuối.
   |Cancel / Esc ------------------------------> đóng dialog, vẫn đăng nhập, focus về nút "Sign out"
   |chọn Remove --> nút primary đổi thành "Sign out and remove data" (danger); (nếu còn thay đổi chưa đồng bộ) hiện thêm
   |                 "If you remove the data from this device, these changes will be lost."
   |"Sign out" / "Sign out and remove data"
        v  nút "Signing out…" (disabled); (M7, online) thử đồng bộ lần cuối, tối đa 10 s
   <Remove và vẫn còn thay đổi chưa đẩy được?> --yes--> (!) dialog GIỮ MỞ, Alert "Couldn't sync your changes. If you remove the data now, they will be lost."
                                                        nút đổi "Remove anyway" (danger); người dùng đổi sang Keep hoặc Cancel hoặc xác nhận lại
   v
Keep:   signed-out, goal/entry/timer/cài đặt còn nguyên;  toast "Signed out. Your data is still on this device."
Remove: signed-out, goal/entry/timer/cài đặt nhắc bị xoá, NGÔN NGỮ giữ nguyên; Today về empty "Start with one small goal";
        toast "Signed out. Data removed from this device."
Đăng xuất không xoá gì trên cloud. Focus sau khi đóng: tiêu đề card Account.
 (!) Mất mạng khi đăng xuất không chặn: phiên cục bộ vẫn được xoá (ARCH §5.9).
```

### F11 — Đăng nhập lần đầu trên máy đã có dữ liệu; đổi sang tài khoản khác (US-16, US-17, FR-47) — M7

```text
Vừa signed-in (F9)
   <thiết bị từng gắn tài khoản KHÁC và còn dữ liệu cục bộ?>
     |no  (chưa từng gắn tài khoản, hoặc cùng tài khoản)
     |     --> gộp NGAY, không hỏi: dữ liệu chưa đăng nhập được đẩy lên và gộp với dữ liệu trên cloud
     |         StatusRow "Syncing…" --> "Synced"; toast "Signed in. Your account now has 6 goals, 25 entries."
     |         (cùng id: bản mới hơn thắng; không có bản ghi nào bị xoá vì việc đăng nhập)
     |yes  --> [D5 Merge account dialog] (đồng bộ tạm dừng, chưa đẩy gì lên)
                 "Add this device's data to your account?" nêu số goal/entry + email tài khoản mới
                 |"Add to account" --> gộp (như nhánh no) --> toast tóm tắt
                 |"Cancel" / Esc    --> đăng xuất (Keep), KHÔNG đẩy gì lên, toast "Signed out. Your data is still on this device."
                 Focus ban đầu: "Cancel" (an toàn hơn; không có gì được tải lên cho tới khi người dùng chủ động xác nhận)
Hết phiên rồi đăng nhập bằng tài khoản Google khác --> rơi vào nhánh "yes" (tài khoản đã lưu ≠ tài khoản mới).
```

### F12 — Phiên hết hạn (FR-40) — M6 (chỉ báo: M7)

```text
Refresh token không dùng được / REST trả 401 --> trạng thái `expired` (không có dialog, không chặn)
   StatusRow: chip info "Sign in again to sync" (là link --> #/settings); aria-live: "Your sign-in expired. …"
   Account card: Alert info "Your sign-in expired" + email đã lưu + [Sign in with Google] [Sign out]
   Dữ liệu cục bộ và thay đổi chưa đẩy lên GIỮ NGUYÊN; đồng bộ tạm dừng; app dùng bình thường (ghi, timer, review)
   Đăng nhập lại (cùng tài khoản) --> F9 --> thay đổi chờ được đẩy lên --> Synced
   "Sign out" từ trạng thái này --> D4 (không có bước đồng bộ lần cuối vì không có phiên)
```

### F13 — Đồng bộ nền và chỉ báo (US-17, US-18, FR-45, FR-46, FR-50) — M7

```text
Ghi cục bộ (tạo/sửa/xoá goal, entry, Save timer, import, đổi giờ nhắc/ngôn ngữ) --> lưu IndexedDB NGAY, UI cập nhật NGAY
   --> StatusRow: "N changes waiting to sync" (online) hoặc "Offline · N changes waiting" (offline)
   --> ~2 s sau (gom thay đổi) hoặc khi online / quay lại tab / mỗi 5 phút / bấm "Sync now":
        "Syncing…" (xoay nhẹ) --> "Synced 14:05"
   (!) Lỗi mạng/máy chủ: "Couldn't sync · Retry" (chip lỗi); tự thử lại 30 s → tối đa 15 phút; "Retry" / "Sync now" thử ngay
   (!) 401/403: chuyển `expired` (F12)
   (!) Dữ liệu cloud sai định dạng: bị bỏ qua, chỉ báo vẫn "Synced"; card Account hiện dòng thông tin SYNC_REMOTE_INVALID
Thay đổi từ thiết bị khác xuất hiện sau lần đồng bộ kế tiếp (không realtime). Giờ nhắc/ngôn ngữ từ cloud:
   áp ngay không reload (ngôn ngữ đổi tại chỗ), toast "Settings updated from your account"; KHÔNG tự xin quyền notification.
```

### F14 — Nhắc đăng nhập nhẹ nhàng (US-20, FR-52, FR-53, FR-54) — M8

```text
[Today] cloud bật + chưa đăng nhập + online + (≥ 7 ngày từ bản ghi đầu tiên hoặc ≥ 10 entry) + chưa "Not now" trong 14 ngày + chưa đủ 3 lần
   --> LoginPromptBanner (không modal, không che goal, không chiếm focus)
        |"Sign in with Google" --> F9 (returnTo #/today)
        |"Not now" --> banner ẩn, toast "OK. You can sign in any time from Settings.", focus về <h1>;
                       14 ngày sau hiện lại; sau 3 lần "Not now" không hiện trên Today nữa (Account card vẫn luôn có nút)
        BackupBanner không hiện cùng lúc (banner đăng nhập ưu tiên); khi banner đăng nhập ẩn do "Not now", BackupBanner hiện như cũ.
[Settings > Backup] Export thành công + cloud bật + chưa đăng nhập + ĐANG ONLINE lúc Export thành công + chưa gợi ý trong 30 ngày
   --> ngoài toast "Backup exported", dưới hai nút hiện ExportSignInHint (khối thông tin, có nút "Sign in with Google")
   Export lúc OFFLINE (v3.1, A-44): KHÔNG hiện hint và KHÔNG tiêu "lượt 30 ngày"; lần Export online kế tiếp vẫn có thể hiện hint.
   (Hint đã hiện rồi mới mất mạng: giữ khối, nút đăng nhập bị vô hiệu kèm dòng "You're offline. Connect to the internet to sign in." — chỉ là trạng thái, không còn là đường vào chính.)
[Settings > Account] chưa đăng nhập: LUÔN có lời giải thích + nút, không có "Not now"
[Settings > Storage] "Not protected" + cloud bật + chưa đăng nhập: thêm câu gợi ý + nút "Go to Account"
Không bao giờ hiện lời nhắc đăng nhập khi: cloud tắt, đã đăng nhập, phiên hết hạn (card Account lo). Cả banner Today (FR-52) lẫn ExportSignInHint (FR-53, v3.1) cần đang online.
Quy tắc mốc thời gian (v3.1, A-46): mốc "Not now"/"đã gợi ý" lưu trên máy mà lớn hơn bây giờ quá 24 giờ (đồng hồ máy từng sai) được coi như chưa từng có → banner/hint lại theo quy tắc thường;
   số lần "Not now" đã đếm vẫn giữ. "Not now" bấm khi banner đang trong thời gian ẩn (ví dụ hai tab cùng bấm) không đếm thêm lượt. Không đổi gì ở giao diện.
```

### F15 — Tạo hoặc chuyển goal sang "Không có thời hạn" (US-21, FR-56, FR-57) — M11

```text
[Goal form #/goals/new  hoặc  #/goals/:id/edit]
   Target = "Minutes per day" (mặc định)
   Ends:  ( ) This year — ends …   ( ) On a specific date [End date]   ( ) No end date   <-- radio thứ ba, bật
        |
        v  chọn "No end date"
   hiện dưới radio: goal.form.endsNeverHint (mục tiêu chạy tới khi archive/xoá; tiến độ tính tới hôm nay); hint dưới Target ẩn
        |
        v  bấm "Save goal" / "Save changes"
   <hợp lệ?>  (tên, chỉ tiêu phút, Start date)
     |no--> (!) lỗi inline như F1
     |yes--> lưu endDate = null --> [Goals] hàng "10 min/day · from 2026-10-01, no end date", badge Active (hoặc Upcoming nếu Start date ở tương lai)

[Đang chọn "No end date" rồi đổi Target sang "Total hours"]   (A-D52, A-D53)
   --> radio "No end date" bị KHOÁ (disabled) + ghi chú goal.form.endsNeverTotalNote dưới nó
   --> Ends tự chuyển sang "This year — ends …" (không bao giờ để "total" + không hạn)
   --> vùng role="status" (sr-only) đọc goal.form.endsNeverSwitched; focus ở lại trên Target
   --> đổi Target về "Minutes per day": radio mở khoá; KHÔNG tự chọn lại "No end date"

[Sửa goal không thời hạn → có hạn]   chọn "This year" / "On a specific date"
   <hợp lệ?> ngày kết thúc phải bao mọi entry đã có
     |no--> (!) errors.GOAL_PERIOD_EXCLUDES_ENTRIES dưới End date (như F1), không lưu
[Sửa goal có hạn → không thời hạn]   luôn hợp lệ (không có entry tương lai)
[Goal không thời hạn khi chạy]   badge Active mãi; KHÔNG BAO GIỜ nhóm "Ended"/badge "Ended"; rời Active chỉ bằng Archive hoặc Delete
```

### Phase 6 — app iOS và xoá tài khoản (v5.0)

F16, F18, F19 chỉ có trên app native; F17 có ở cả web (khi cloud bật) và native. Bảng điều khiển của hệ điều hành (Sign in with Apple, Google, xin quyền thông báo, share sheet, Files) là **ngoài app**, không thiết kế ở đây.

### F16 — Đăng nhập trên app iOS bằng Apple hoặc Google (US-23, FR-59, FR-60) — M14

```text
Điểm vào (cùng một bộ hai nút, Apple Ở TRÊN, Google ở dưới, cùng chiều rộng và cao 44 px):
  [Settings > Account A1/A10]   [Today > LoginPromptBanner]   [Settings > Backup > ExportSignInHint]
        |
        v  bấm "Sign in with Apple" (hoặc "Sign in with Google")
   <online?> --no--> cả hai nút `disabled` + dòng "You're offline. Connect to the internet to sign in."
        |yes
        v  nút vừa bấm đổi thành "Signing in…" (busy), nút kia disabled; KHÔNG điều hướng, KHÔNG rời app, KHÔNG returnTo
[Bảng đăng nhập của iOS / Google]   (ngoài app; Apple: Face ID, "Share My Email" hoặc "Hide My Email", tên)
   |người dùng đóng bảng ---> (!) AUTH_CANCELLED: Settings = Alert A4; màn khác = toast ngắn + "Go to Account"; nút dùng lại ngay
   |lỗi token/nonce/mạng ----> (!) AUTH_FAILED, bản native (errors.AUTH_FAILED_native); không có gì trên máy bị đổi
   v thành công
signed-in: cùng đường với F9 sau bước đổi code (gộp FR-47 → D5 nếu cần → F13 đồng bộ); card A5 nêu "Signed in with Apple" / "…Google";
           Apple lần đầu có tên → lưu làm tên hiển thị; toast `signedIn` hoặc `mergeDone` (một toast); focus ở <h1>.
Cùng email đã xác minh (Gmail) → Apple và Google là MỘT tài khoản; "Hide My Email" → tài khoản RIÊNG (A-60): câu `settings.account.hideEmailNote` nói trước ở A1.
```

### F17 — Xoá tài khoản trong app (US-24, FR-61) — M14 (web + native)

```text
[Settings > Account, signed-in (A5 … A9)]   khối "Delete account" dưới hàng Sync now / Sign out, ngăn bằng đường kẻ
   <online?>  --no--> nút `disabled` + dòng settings.account.deleteOffline
   <expired?> --yes-> nút `disabled` + dòng settings.account.deleteExpired (đăng nhập lại trước; card ở A10)
        |bấm "Delete account"
        v
[D6 — Delete your account?]   (. ) Remove data from this device  <-- mặc định (OQ-16)     ( ) Keep data on this device
        |  (iOS + tài khoản có identity Apple) khối thông tin auth.delete.appleNote
        |  focus ban đầu: Cancel
   |Cancel / Esc / backdrop --> đóng, không gọi gì, focus về nút "Delete account"
   |"Delete account" (đỏ)
        v   <iOS + tài khoản có Apple?> --yes--> [bảng Sign in with Apple của iOS] (lấy authorization code, hạn 5 phút)
        |                                              |người dùng huỷ --> (!) ACCOUNT_DELETE_CANCELLED: Alert trong D6, D6 giữ mở, CHƯA xoá gì
        v
   D6 busy: "Deleting…", mọi control disabled, Esc bị bỏ qua, vùng role="status" đọc workingStatus; gọi Edge Function (≤ 20 s)
        |
   <kết quả?>
     |mất mạng ------------> (!) ACCOUNT_DELETE_OFFLINE          (Alert; D6 giữ mở; vẫn signed-in; nút xác nhận dùng lại được)
     |401 / phiên hết hạn --> (!) ACCOUNT_DELETE_SESSION_EXPIRED (Alert; đóng D6 → card A10; có thể tài khoản đã xoá ở lần trước — ARCH §4.7 f)
     |5xx / timeout --------> (!) ACCOUNT_DELETE_FAILED          (Alert; bấm xác nhận lần nữa = thử lại, thao tác idempotent)
     |200 -----------------> D6 đóng · phiên xoá · card về A1 · dữ liệu máy theo lựa chọn · toast (một toast) · focus → h2 "Account"
                              <appleRevoked = 'manual-required' VÀ tài khoản có Apple?> --yes--> panel hướng dẫn tự thu hồi Apple (ngay dưới h2, ở lại tới "Dismiss")
Thiết bị khác đã đăng nhập tài khoản này: lần đồng bộ kế tiếp → "Sign in again" (F12); dữ liệu cục bộ của chúng giữ nguyên.
Không có "Undo", không có thời gian chờ 30 ngày: xoá là xoá (PRD FR-61).
```

### F18 — Nhắc nhở bằng thông báo lên lịch trước trên iOS (US-25, FR-62) — M15

```text
[Settings > Reminders] bật switch  --- quyền iOS "chưa hỏi" --->  hộp xin quyền của iOS (ngoài app, hỏi đúng 1 lần khi bật)
   |hoặc: nhắc đã bật từ tài khoản khác, máy này chưa có quyền → chip "Not asked yet" + nút "Allow notifications" (A-64, không tự xin)
   |Allow ------> chip "Allowed"; app lên lịch 14 ngày tới (ngày nào có goal đang chạy); mô tả nativeGrantedDesc
   |Don't Allow -> chip "Blocked" + nativeDeniedDesc (Settings > Notifications > 1% Better); app vẫn có banner nhắc trong app (FR-15)
iOS gửi thông báo đúng giờ, kể cả khi app đóng hẳn: tiêu đề "1% Better", thân nói chung (không nêu số phút, không nêu tiến độ)
   |chạm thông báo --> app mở ở Today
Lập lịch lại khi: mở app, quay lại, đổi giờ / bật-tắt / ngôn ngữ, goal hoặc entry đổi (gom 2 s).
Bỏ HÔM NAY khi mọi goal đang chạy đã đạt hoặc đã qua giờ nhắc; 14 ngày không mở app → hết nhắc; tắt switch → huỷ mọi lịch.
(M12–M14, chưa có lịch trước: Reminders dùng bản web "chỉ khi app mở", chip "Not supported" + nativeUnsupportedDesc; card .ics còn.)
```

### F19 — Export và import qua share sheet (US-26, FR-63) — M12

```text
[Settings > Backup] "Export backup (JSON)" --> nút "Working…" --> [share sheet iOS: Save to Files, AirDrop, Mail…]  (ngoài app)
   |chọn đích xong ---> toast "Backup exported"; "Last backup" = hôm nay; ExportSignInHint theo quy tắc F14 (online, chưa đăng nhập, 30 ngày)
   |đóng share sheet --> HUỶ: không toast, không đổi "Last backup", không hint; nút về bình thường (A-65)
   |không tạo được tệp -> Alert errors.EXPORT_FAILED_native (như S7 "Export thất bại")
"Add reminder to calendar (.ics)" (chỉ khi KHÔNG có thông báo lên lịch, xem 7.8.4): cùng cách; hoàn tất → toast `toast.icsShared`; huỷ → im lặng
"Import backup…" --> bộ chọn tài liệu của iOS (Files) --> kiểm tra --> D3 như F7; lỗi → Alert như cũ
```

---

## 3. Sơ đồ màn hình và điều hướng

### 3.1 Điều hướng

- **< 1024 px**: thanh tab dưới cố định, 4 mục: `Today`, `Goals`, `Review`, `Settings`. Cao 56 px + safe-area.
- **≥ 1024 px**: sidebar trái rộng 232 px: **(v3.1) brand** = `BrandMark` (ảnh logo trên ô trắng bo góc 32 px, xem mục 5 "Brand") + chữ `app.name` **"1% Better per Day"** (một dòng, đậm 700, `--text`; xuống dòng được nếu chữ phóng 200 %), 4 mục như trên. Brand là link về `#/today` với `aria-label` = `app.name`. **Thanh tab dưới < 1024 px không có brand** (như cũ).
- Tab đang chọn: màu `--primary`, chữ đậm, có vạch/nền (không chỉ dựa vào màu), `aria-current="page"`.
- **Tab `Review` chỉ hiện từ M4** (chưa có route). Mục ở M1–M3 chỉ có 3 tab. Link "Log a past day" trên Today chỉ hiện từ M3. Link tên goal → Goal detail chỉ có từ M3.
- Màn hình con (Goal form, Goal detail, Day) giữ nguyên tab cha được tô sáng: Goal form và Goal detail → `Goals`; Day → `Today`.
- Mỗi lần đổi route: đặt `document.title` ("Today — 1% Better"), chuyển focus tới `<h1>` của màn mới (`tabindex="-1"`), có skip link "Skip to content" ở đầu trang.
- **(v2) StatusRow**: một hàng cao 32 px ở **đầu `<main>`**, ngay trên `page-head`, canh phải, dùng chung cho mọi màn trong AppShell (Today, Goals, Goal form/detail, Day, Review, Settings). Nó chứa `OfflineChip` (như v1, canh trái) **hoặc** `SyncIndicator`: khi `AuthState` là `signing-in`, `signed-in` hoặc `expired`, `SyncIndicator` thay chỗ `OfflineChip` (chip sync đã nói "Offline" khi cần); riêng `expired` mà đang offline thì hiện cả hai. Chưa đăng nhập hoặc cloud tắt: hàng này chỉ chứa `OfflineChip` khi offline và **không chiếm chỗ** khi không có gì để hiện (không đổi bố cục phase 1). Đã đăng nhập: hàng luôn hiện (chiều cao cố định 32 px, không nhảy bố cục khi đổi trạng thái).
- **(v2) Callback OAuth không phải route**: `<BASE_URL>?auth=callback&code=…` (query, trước dấu `#`) được `bootstrap` xử lý và thay bằng `returnTo` (`#/settings` hoặc `#/today`) trước khi render; người dùng không bao giờ thấy màn hình "callback". Không thêm route mới.
- **(v5.0) App native (iPhone, chỉ dọc)** luôn ở khoảng `base` (< 640 px; iPad chạy chế độ tương thích không được tối ưu, PRD A-59): **thanh tab dưới** (4 mục, cao 56 px + vùng an toàn dưới), không có sidebar/brand mark, **không route mới**. Đầu `<main>` chừa vùng an toàn trên (tai thỏ/Dynamic Island); thanh tab, toast, dialog dạng bottom sheet chừa vùng an toàn dưới; toàn bộ quy tắc ở mục 5 "Native shell". Link ra ngoài app (Privacy, Support, hướng dẫn của Apple) là URL tuyệt đối, `target="_blank" rel="noopener"`, mở bằng Safari; có chữ ẩn `a11y.opensExternal`. Điều hướng trong app vẫn là `#/…`.

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
| `lg` (desktop) | ≥ 1024 px | Sidebar trái thay tab bar; padding nội dung 32/40 px (Review: 24 px); **(v3.1)** heatmap ô 13 px: vừa khít, không cuộn, **chỉ khi viewport ≥ 1192 px**; từ 1024 đến 1191 px vẫn cuộn ngang trong hộp `.heatmap-scroll` (xem mục 6.3); stat card 5 cột; chart cao 320 px |

Không có thanh cuộn ngang ở `documentElement` ở 360–1440 px (NFR-06). Ngoại lệ có chủ đích: vùng heatmap cuộn ngang bên trong `.heatmap-scroll` ở mobile (< 640 px) **và (v3.1) ở mọi viewport từ 640 đến 1191 px** mà vùng nội dung chưa đủ chỗ cho 53 tuần (M4-AC10); `documentElement` không bao giờ cuộn ngang.

### 3.3 Bản đồ milestone (developer M1 đọc mục này đầu tiên)

| Milestone | Màn hình / component cần dựng |
| :- | :- |
| **M1** | Tokens + CSS nền; AppShell (tab bar/sidebar, skip link, 3 tab); S1 Today (GoalCard, ProgressBar, PlusOnePill tĩnh, EntryForm, EntryRow, EmptyState tối thiểu); S2 Goals; S3 Goal form; S7 Settings (mục **Language** + Storage + About; M1-T8); `LanguageSwitcher`; S8 Not found; S9 StorageError (bản đầy đủ, rẻ); D2 Delete goal; Button, Field (Text/Number/TextArea/Date), SegmentedControl/Radio, Badge, Toast, ConfirmDialog (dùng `<dialog>`), OfflineChip, UpdateToast |
| *(i18n, mọi milestone)* | M1 dựng hạ tầng và copy `en`/`vi` của mọi màn M1; từ M2 trở đi, mỗi milestone thêm đủ cặp `en`/`vi` cho chuỗi mới của mình (bảng 7.x ghi sẵn milestone cho từng nhóm key). Mỗi màn hình mới phải qua kiểm tra bố cục 360 px ở `vi` (mục 3.4). |
| **M2** | TimerCard + nút Start trên GoalCard; D1 StopTimerDialog; ReminderBanner; Settings mục Reminders (Switch, time input, trạng thái quyền, text giới hạn, iOS tip, nút `.ics`) |
| **M3** | S5 Day + DateNav; S4 Goal detail bản cơ bản (thông tin + lịch sử, chưa có chart); Settings mục Backup + D3 ImportPreviewDialog + Alert lỗi import; BackupBanner (Today); link "Log a past day"; tên goal thành link |
| **M4** | Tab Review + S6 Review; Heatmap; StatCard; BarChart (Recharts, lazy); chip streak trên Today |
| **M5** | CurveChart + Goal detail đầy đủ (headline, stat, nút Archive); hiệu ứng/announce "+1%" một lần; Archive/Restore + nhóm "Archived"; EmptyState/ErrorState đầy đủ mọi màn; ErrorBoundary; Skeleton/loading rà soát |
| **M6** *(v2)* | `GoogleSignInButton`; `AccountCard` trong Settings (ẩn khi cloud chưa cấu hình; signed-out, offline, signing-in, signed-in cơ bản [avatar, tên, email, "Sign out"], expired, Alert lỗi `AUTH_*`); `SignOutDialog` (D4, chưa có cảnh báo đồng bộ); `Toast` biến thể lỗi có `action`; card About mới (`settings.about.descCloud/descSignedIn/privacy`); thứ tự card Language → **Account** → Reminders → Backup → Storage → About; chuỗi `settings.account.*`, `auth.signOut.*` (trừ cảnh báo), `auth.signInGoogle`, `errors.AUTH_*`, toast `signedIn/signedOutKept/signedOutRemoved` |
| **M7** *(v2)* | `SyncIndicator` + StatusRow trong AppShell (5 trạng thái + signing-in); chi tiết đồng bộ trong `AccountCard` (Last synced, Waiting to sync, "Sync now", Alert lỗi `SYNC_*`, dòng `SYNC_REMOTE_INVALID`); `MergeAccountDialog` (D5); cảnh báo chưa đồng bộ trong D4; D3 biến thể đã đăng nhập; ghi chú "theo tài khoản" ở card Language và Reminders + biến thể quyền `default` khi nhắc đã bật từ cloud; mô tả Backup khi đã đăng nhập; toast `mergeDone`, `prefsFromAccount`, `syncNowDone`; chuỗi `sync.*`, `auth.merge.*`, `import.*SignedIn`, `errors.SYNC_*` |
| **M8** *(v2)* | `LoginPromptBanner` (Today); `ExportSignInHint` (card Backup); gợi ý đăng nhập ở card Storage "Not protected"; mô tả Backup khi chưa đăng nhập; chuỗi `loginPrompt.*`, `exportHint.*`, `settings.backup.descSignedOut`, `settings.storage.notProtectedSignIn` (+ nút dùng `settings.account.goTo`) |
| **M9** *(v3)* | Chỉ Goal detail (S4), không màn nào khác: headline có dấu + biến thể âm (`goal.detail.headlineDown`, màu `--text`), phụ đề 2 dòng (`subDay` + `subToday`/`subEarlier`/`subStart`/`empty.detail.curve`), `CurveChart` v3 (đường "Bạn" `stepAfter`, vạch 0%, thang Y theo `curveYDomain`, nhãn trục có dấu + compact, nhãn trực tiếp không đè nhau, tooltip 4 biến thể, chấm nhỏ ở ngày có ghi), legend 3 mục, chú thích mới, tóm tắt SR 2 biến thể, bảng dữ liệu 5 cột; formatter có dấu (`+`/`−` U+2212) và `f.factor` (`×5.4`). Chuỗi: mục 7.6.4 (cột MS = M9) và `empty.detail.curve` |
| **M10** *(v3.1, M10-T6 đọc mục này)* | Không có màn hình mới. Việc UI/copy: (1) 7 key hàng bị cloud từ chối, 7.7.1 và 7.7.2 (**chỉ 2 chuỗi `en` đổi**: `auth.signOut.rejectedKeep`, `auth.signOut.rejectedRemove`; 5 key còn lại giữ nguyên văn đã ship) + vị trí hiển thị ở S7 (A9, D4); (2) `settings.about.privacyLink`, 7.7.5 (chuỗi đã ship, giữ); (3) `errors.IMPORT_INVALID_SCHEMA_outOfRange` và `errors.EXPORT_FAILED` (**key mới**), 7.3, vị trí ở S7 Backup; (4) `empty.day.noGoals`: chỉ sửa chữ ở S5 (đã không có dấu chấm trong 7.4 và `en.json`); (5) **nhãn giá trị cột BarChart** (S6, mục 5 `BarChart`: điều kiện đo được); (6) brand mark (3.1, mục 5 "Brand") và quy tắc một toast (mục 5 `Toast`): ghi nhận hành vi đã ship, không cần đổi code |
| **M11** *(v4.0, M11-T4/T5 đọc mục này; không màn mới, không token mới)* | **T4 — Goal form (S3, 7.6.3):** radio thứ ba `goal.form.endsNever` (cuối nhóm Ends); `End date` chuyển lên nằm ngay dưới radio "On a specific date"; ghi chú/mô tả dưới radio thứ ba (`endsNeverHint` khi đang chọn, `endsNeverTotalNote` khi bị khoá); khoá khi Target = Total hours + tự chuyển sang "This year" + `role="status"` `endsNeverSwitched`; ẩn hint Target khi chọn "No end date"; form sửa goal `endDate = null`; lỗi `errors.GOAL_PERIOD_INVALID_openEndedTotal` (phòng hờ). **T5 — hiển thị:** S2 hàng `goals.rowDailyOpen` (Goals và đầu Goal detail), không bao giờ nhóm/badge Ended; S4 `goal.detail.subDayOpen`, `chartSummaryOpen`, `chartSummaryEmptyOpen`, **bỏ Range**, upcoming = không có thẻ biểu đồ; S4/S6 `stat.progressSubOpen`; S6 `review.progressNoteOpen`; `errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded`. Chuỗi: 7.3, 7.6.2 … 7.6.4, 7.6.6 (12 key mới) |
| **M12** *(v5.0, M12-T2/T3 đọc mục này; không màn mới, không token mới trừ `--safe-*` ở M13)* | **Biến thể native của chuỗi** theo bảng kiểm kê 7.8.1: card Reminders (không `settings.reminders.ios`, `limit` còn, chip "Not supported" + `settings.permission.nativeUnsupportedDesc`), Language (`settings.language.nativeNote`), Backup (`settings.backup.shareHint`, `backup.banner.neverNative`, `errors.EXPORT_FAILED_native`, `toast.icsShared`), Storage (`settings.storage.native*`), About (`settings.about.descNative`), S9 (`storageError.*Native`); ẩn `UpdateToast`; ẩn card Account (tài khoản `unavailable`). Quyết định hiển thị theo `capabilities` ở 7.8.1. Link ngoài app có chữ ẩn `a11y.opensExternal`. Share sheet: F19 (huỷ = im lặng). **15 key** (7.8.1) |
| **M13** *(v5.0, M13-T3/T4)* | Icon, launch screen/splash, màu status bar (S10, mục 5 "Native shell"); quy tắc **safe area** cho thanh trên, tab bar, toast, dialog/bottom sheet, trang đầy màn hình; bàn phím; không nảy; token `--safe-top/right/bottom/left`. Không có chuỗi mới |
| **M14** *(v5.0, M14-T5)* | `AppleSignInButton`; card Account trên iOS (A1/A2/A3/A4/A5/A10 có nút Apple + hai ghi chú); `LoginPromptBanner` và `ExportSignInHint` có nút Apple trên iOS; lối vào **Delete account**; **D6** `DeleteAccountDialog`; panel thu hồi Apple thủ công; toast sau xoá; 4 lỗi `ACCOUNT_DELETE_*`; `errors.AUTH_FAILED_native`. Chuỗi: 7.8.2, 7.8.3 (**33 key**) |
| **M15** *(v5.0, M15-T3/T4/T5)* | Settings Reminders native (3 trạng thái quyền, hướng dẫn mở Cài đặt iOS, ẩn card `.ics`); `notification.nativeTitle/nativeBody`; About có link Privacy + Support (cả web và native); `public/support.html` + `public/privacy.html` (7.8.6); hồ sơ App Store (7.8.7); screenshot + dataset demo (7.8.8). Chuỗi: 7.8.4, 7.8.5 (**9 key**) |

### 3.4 Bố cục với chuỗi tiếng Việt (rà 360 px)

Chuỗi `vi` thường dài hơn `en` khoảng 10–30 % (nhất là câu hướng dẫn, hint, lỗi), nhưng nhãn nút và tab lại thường **ngắn hơn** vì đã được viết gọn. Bố cục hiện tại đã dùng `flex-wrap`, `min-width: 0` và không đặt chiều rộng cố định cho chữ, nên **không đổi layout**; mục này chốt quy tắc và chỉ ra chỗ phải kiểm.

**Quy tắc chung (mọi màn, cả `en` lẫn `vi`)**

1. Không đặt `width`/`height` cố định cho thứ chứa chữ; dùng `min-height` (44 px cho control). Mọi phần tử con của flex/grid có chữ phải có `min-width: 0`.
2. Nút: `white-space: normal; text-align: center;` được phép xuống 2 dòng (nút cao lên, không cắt chữ, không `…`). Không dùng `text-overflow: ellipsis` cho nhãn control; chỉ dùng cho dòng `why` 1 dòng ở Goals (là dữ liệu người dùng, đã có sẵn).
3. Hàng có ≥ 2 nút/chip/badge: `flex-wrap: wrap; gap: 8px` (đã có). Khi xuống hàng, nút giữ kích thước tự nhiên (không giãn), trừ nút trong dialog/bottom sheet và nút primary của form: xếp dọc, rộng đầy.
4. Không giảm cỡ chữ dưới 12 px. Cách giảm duy nhất được phép: giá trị StatCard **dạng chữ** (không phải số thuần) dùng `--text-xl` (20/28) thay `--text-2xl` ở < 640 px.
5. Dấu thanh tiếng Việt cao (Ể, Ớ, Ữ…): không dùng `overflow: hidden` trên khối có chiều cao cố định; `line-height` tối thiểu 1,33 (16/12 cho nhãn tab, đã đạt). Font hệ thống (`system-ui`, Segoe UI, Roboto, SF) đều có đủ glyph tiếng Việt; không thêm font ngoài (NFR-01).
6. Văn bản do người dùng nhập (tên goal, why, note) luôn `overflow-wrap: anywhere` (đã có ở tên goal và note).
7. Con số, ngày, giờ dùng `font-variant-numeric: tabular-nums`. Cụm "số + đơn vị" ngắn (`20 phút`, `20/30 phút`, `00:25:31`) bọc trong phần tử có `white-space: nowrap` khi nằm giữa câu dài (ví dụ cột `em` của EntryRow); **không** chèn ký tự đặc biệt (U+00A0) vào bản dịch, để chuỗi trong `vi.json` giữ nguyên văn như bảng ở mục 7. Ngày `dd/MM/yyyy` không có khoảng trắng nên không bị ngắt.

**Bảng rủi ro ở viewport 360 px** (nội dung rộng 328 px; trong card còn ≈ 294 px)

| Vị trí | Chuỗi `vi` | Ước lượng | Xử lý |
| :- | :- | :- | :- |
| Tab bar (4 tab × 90 px, chữ 12 px đậm) | `Hôm nay`, `Mục tiêu`, `Tổng kết`, `Cài đặt` (≤ 8 ký tự) | ≈ 56 px/tab, còn dư | Không `nowrap`; nếu zoom chữ 200 % thì tự xuống 2 dòng, thanh tab cao lên (không cắt). **Giới hạn copy: nhãn tab `vi` ≤ 10 ký tự** |
| Goals: hàng 3 nút `Sửa` `Lưu trữ` `Xóa` (nhóm Archived: `Sửa` `Khôi phục` `Xóa`) | 3–9 ký tự | ≈ 216–250 px, **vừa một hàng** (nhãn `vi` ngắn hơn `en`) | Giữ `flex-wrap`; nếu tên rộng hơn (zoom, 320 px) nút xuống hàng thứ hai, đủ 44 px, khoảng cách 8 px. Không bao giờ thu nhỏ nút |
| Goals: dòng ngày `17 phút/ngày (tổng 100 giờ) · 01/01/2026 – 31/12/2026` | ≈ 55 ký tự | ≈ 390 px > 294 | Cho xuống 2 dòng (đã là `<p>` thường, `en` cũng xuống dòng). Không cắt |
| Goals: badge `Đã kết thúc` cạnh tên goal | 11 ký tự, `nowrap` | ≈ 100 px | Hàng tên + badge `flex-wrap`: badge xuống dưới tên nếu tên dài |
| Today: hàng `Ghi thời gian` + `Đếm giờ` | 13 + 7 ký tự | ≈ 136 + 116 + 8 = 260 px, vừa | Nhãn `Start timer` ở `vi` cố ý viết gọn `Đếm giờ` (không dùng `Bắt đầu đếm giờ` ≈ 172 px làm hàng tràn). Nếu vẫn tràn (zoom): nút thứ hai xuống hàng |
| Today: tiêu đề + chip `Chuỗi 8 ngày` | h1 `Hôm nay` + chip ≈ 110 px | vừa | `page-head` đã `flex-wrap` |
| Today: banner nhắc `Đã quá 20:00 — còn 2 mục tiêu chưa đạt chỉ tiêu.` | ≈ 55 ký tự | 2 dòng | Banner cao theo nội dung |
| Today: link `Quên ghi một ngày? Ghi bù cho ngày đã qua` | 42 ký tự | ≈ 300 px, có thể xuống 2 dòng | Link là `inline-block`, `min-height: 44px`; dùng `line-height: 24px` + `padding-block: 10px` thay `line-height: 44px` để 2 dòng không đè nhau |
| Form: label + counter `Ghi chú (không bắt buộc)` `0/280` | 24 ký tự + counter | ≈ 230 px, vừa | `.label-row` thêm `flex-wrap: wrap` để counter xuống dòng khi hẹp hơn |
| Goal form: SegmentedControl `Phút mỗi ngày` / `Tổng số giờ` (mỗi nửa ≈ 147 px) | 13 và 11 ký tự | ≈ 128 px, vừa | Cho chữ xuống 2 dòng trong nửa của nó (không `nowrap` ở form); chiều cao nút tự lớn. Quy tắc: tối đa 3 lựa chọn/segmented; mỗi nhãn ≤ 14 ký tự ở `vi` |
| Goal form: radio `Trong năm nay — kết thúc 31/12/2026` | 36 ký tự | ≈ 290 px + radio | Chữ nhãn radio được xuống dòng, radio căn trên |
| Goal detail: Range `Cả giai đoạn` / `Đến nay` (có `nowrap`) | 12 và 7 ký tự | ≈ 210 px | Vừa; tiêu đề chart `Lý tưởng và thực tế` đứng cùng hàng sẽ tự xuống dòng (`flex-wrap`). Giữ `nowrap` chỉ cho control này |
| StatCard (lưới 2 cột ≈ 158 px, nội dung ≈ 124 px) | nhãn `Ngày đạt chỉ tiêu` (17), giá trị chữ `Chậm 30 phút` / `Nhanh 1 giờ 20 phút`, phụ `Dự kiến 270 phút tính đến hôm nay` | giá trị 24 px đậm ≈ 156–250 px > 124 | (a) Nhãn và phụ được xuống dòng, thẻ cao theo nội dung (các thẻ cùng hàng giãn bằng nhau). (b) Thẻ **Pace** (giá trị dạng chữ) chiếm cả hàng (`grid-column: 1 / -1`) ở < 640 px, cỡ giá trị 20 px. (c) Thẻ số thuần (`9,4 giờ`, `25,8%`, `8 ngày`) giữ 24 px. Áp dụng cho cả `en` (`30 min behind` cũng tràn) |
| Heatmap: nhãn thứ `Th 2`, `Th 4`, `Th 6` và nhãn tháng `thg 10` (từ `Intl` `vi-VN`) | 4–6 ký tự, 11 px | thứ ≈ 24 px; tháng ≈ 36 px | Cột nhãn thứ rộng `auto` (tối thiểu 28 px); nhãn tháng `white-space: nowrap`, chỉ vẽ ở tuần đầu của tháng và bỏ nhãn nếu cách nhãn trước < 40 px. Heatmap vẫn cuộn ngang trong `.heatmap-scroll` như cũ |
| Biểu đồ cột: nhãn trục 12 tuần (`9 thg 10`) và 12 tháng (`thg 10`) | 6–8 ký tự | 12 cột / 294 px ≈ 24 px mỗi cột | Recharts `interval="preserveStartEnd"` + `minTickGap={8}`: tự ẩn bớt nhãn, không xoay chữ. Giá trị đầy đủ có ở tooltip, tóm tắt và bảng ẩn |
| Settings: hàng switch `Nhắc nhở hằng ngày` + mô tả + công tắc | nhãn 18, mô tả 55 ký tự | OK | Khối chữ `flex: 1; min-width: 0`, công tắc `flex: none` |
| Settings: `Quyền thông báo` + chip `Đã cho phép` / `Không hỗ trợ` | 15 + 12 ký tự | ≈ 120 + 100 px, vừa | `.perm` đã `flex-wrap`; chip xuống dưới nếu hẹp |
| Settings: nút `Thêm lời nhắc vào lịch (.ics)` | 29 ký tự | ≈ 280 px, sát mép | Cho xuống 2 dòng trong nút; icon căn giữa theo chiều dọc |
| Settings: `Xuất sao lưu (JSON)` + `Nhập sao lưu…` | 19 + 14 ký tự | ≈ 300 px > 294 | `.btn-row` đã `flex-wrap`: nút thứ hai xuống hàng |
| Dialog / bottom sheet: `Thay thế toàn bộ dữ liệu`, `Bỏ phiên này`, `Tiếp tục đếm` | ≤ 24 ký tự | vừa | Nút xếp dọc, rộng đầy ở < 640 px (đã có) |
| Toast `Đã nhập bản sao lưu: 5 mục tiêu, 23 lần ghi` | 43 ký tự | ≈ 330 px > 296 | Toast `max-width: calc(100vw - 32px)`, chữ xuống dòng, không `nowrap` |
| Chip Offline `Ngoại tuyến — lưu trên thiết bị` | 31 ký tự | ≈ 230 px | Cho xuống dòng, không cắt |
| Lịch sử Goal detail (< 640 px xếp chồng) | cột `Số phút`, `Ghi chú`, `Nguồn`; nguồn `Thủ công` / `Đếm giờ` | OK | Giữ cách xếp chồng hiện tại |
| **(v3)** Goal detail: headline cực trị `Tốt hơn +143.900,0%` / `−99,9% so với ngày đầu` (40 px đậm) | 19–24 ký tự | ≈ 400–520 px > 294 | Headline `overflow-wrap: anywhere`, không `nowrap`, không chiều cao cố định; xuống 2 dòng là chấp nhận được. Không giảm cỡ chữ (quy tắc 4). Phải không cuộn ngang (M9-AC3) |
| **(v3)** Goal detail: phụ đề `Hôm nay: 27 phút, +92,9% so với 12 thg 10 (14 phút). ×5,4 kể từ 10 thg 10 (5 phút).` | ≈ 100 ký tự | 3 dòng ở 294 px | Một `<p>` thường, tự xuống dòng; dòng `Ngày 4/83` đứng riêng phía trên nên không bao giờ bị đẩy mất |
| **(v3)** Goal detail: nhãn trục Y `+143.900%` → compact `+144 N%`; tooltip dài (≈ 110 ký tự) | ≤ 8 ký tự; tooltip ≤ 280 px | OK | Lề trái trục tính theo nhãn dài nhất (≈ 6,6 px/ký tự + 14); tooltip `white-space: normal; max-width: min(280px, 100% - 16px)` |
| **(v3)** Goal detail: bảng dữ liệu 5 cột (`Ngày`, `Lý tưởng`, `Bạn`, `Số phút`, `So với ngày có ghi trước`) | tiêu đề cột 4–24 ký tự | rộng hơn 294 px | Bảng nằm trong `.tbl-wrap` (đã `overflow: auto`) nên cuộn ngang **trong** vùng bảng; tiêu đề cột được xuống dòng; `document.scrollWidth` không đổi |
| **(v4.0)** Goal form: radio thứ ba `Không có thời hạn` | 17 ký tự | ≈ 140 px + radio 20 px + khoảng 10 px, vừa **một dòng** | Không đổi bố cục radio (3 hàng xếp dọc, mỗi hàng `min-height: 44px`, khoảng cách giữa hai hàng ≥ 0 vì cả hàng là vùng chạm) |
| **(v4.0)** Goal form: mô tả dưới radio thứ ba, `vi` khi chọn (`Mục tiêu chạy mỗi ngày cho đến khi bạn lưu trữ hoặc xóa nó. Tiến độ được tính đến hôm nay.`) | 89 ký tự | ≈ 590 px → **3 dòng** ở 266 px (294 − 28 thụt lề) | `.hint` thường: thụt lề trái 30 px (20 px radio + 10 px khoảng) để thẳng hàng với chữ nhãn; xuống dòng tự do, không cắt, không `nowrap` |
| **(v4.0)** Goal form: ghi chú khoá, `vi` (`Chỉ dùng được với Phút mỗi ngày. Tổng số giờ cần có ngày kết thúc để tính chỉ tiêu mỗi ngày.`) | 100 ký tự | 3–4 dòng ở 264 px | Như trên. Form cao thêm ≈ 80 px, không cần cuộn riêng; nút `Lưu mục tiêu` vẫn rộng đầy, xếp dưới |
| **(v4.0)** Goals / Goal detail đầu trang: `10 phút/ngày · từ 01/10/2026, không có thời hạn` | 47 ký tự | ≈ 330 px > 294 px (card) | `<p>` thường xuống **2 dòng** (giống hàng có hạn `17 phút/ngày (tổng 100 giờ) · 01/01/2026 – 31/12/2026`, dài hơn); không cắt. Hàng nút `Sửa` `Lưu trữ` `Xóa` giữ nguyên |
| **(v4.0)** Goal detail: `Ngày 9` (không tổng) và tóm tắt `Ngày 9: đường của bạn ở mức +100,0% so với ngày có ghi đầu tiên. Đường lý tưởng ở mức +9,4%.` | ngắn hơn bản có tổng (`Ngày 9/83`) | không tràn | Không đổi bố cục; hàng Range **không còn** (chart-head chỉ có h2) nên tiêu đề chart không bao giờ phải xuống dòng vì Range |
| **(v4.0)** StatCard Progress, phụ đề `55/90 phút dự kiến đến nay` | 26 ký tự, 14 px | ≈ 160 px > 124 px nội dung thẻ | Phụ đề xuống 2 dòng (quy tắc StatCard 3.4: nhãn/phụ được xuống dòng, thẻ cao theo nội dung, thẻ cùng hàng giãn bằng nhau). Thẻ Pace vẫn chiếm cả hàng < 640 px |
| **(v4.0)** Review: `Tiến độ và nhịp độ của mục tiêu không có thời hạn được tính đến hôm nay.` | 73 ký tự | 2–3 dòng | `<p>` thường dưới hàng stat |

**Kiểm chứng** (NFR-11e, M1-AC18): Playwright viewport 360×740 ở `vi-VN`, `document.documentElement.scrollWidth <= clientWidth` trên Today (có form mở), Goals (đủ 3 nhóm), Goal form (có lỗi ở mọi field), Settings; từ M4 thêm Review (ngoại lệ `.heatmap-scroll`). Mockup tham chiếu: `mockups/01-today.vi.html` (mở ở 360 px, so với `01-today.html`).

### 3.5 Rủi ro 360 px cho thành phần phase 2 (v2.0)

Áp dụng đủ 7 quy tắc chung của 3.4. Số đo ước lượng ở 360 px (nội dung 328 px; trong card ≈ 294 px; trong banner/hint ≈ 296 px). Các chuỗi dài nhất là chuỗi `vi`; chuỗi lấy từ dữ liệu người dùng/Google (tên, email) có thể dài hơn mọi chuỗi dịch.

| Vị trí | Chuỗi / dữ liệu | Ước lượng | Xử lý |
| :- | :- | :- | :- |
| Account card: hàng danh tính (avatar 40 px + 12 px khoảng + chữ) | Email dài (`nguyen.thi.hong.nhung.phuong.2026@gmail.com`, 44 ký tự); tên dài (`Nguyễn Thị Hồng Nhung Phương`) | cột chữ còn ≈ 242 px; email 44 ký tự ≈ 320 px; tên 28 ký tự đậm ≈ 230 px | Avatar `flex: none`, canh trên (`align-items: flex-start`); cột chữ `flex: 1; min-width: 0`; tên và email `overflow-wrap: anywhere`, **cho xuống dòng, không cắt `…`**. Tên tối đa 2–3 dòng là chấp nhận được |
| Nút `Sign in with Google` / `Đăng nhập bằng Google` | 19 / 21 ký tự | logo 20 + khoảng 10 + chữ ≈ 165 + padding 24 = ≈ 220 px | Dưới 640 px nút **rộng đầy** vùng chứa (chữ canh giữa cùng logo); từ 640 px rộng theo nội dung, canh trái. `min-height: 44 px`; chữ được xuống 2 dòng nếu zoom 200 % |
| Card Account: hàng `Sync now` + `Sign out` | `Đồng bộ ngay` + `Đăng xuất` (cả hai đang bận: `Đang đồng bộ…`) | ≈ 125 + 105 + 8 = 238 px; bận ≈ 150 + 105 + 8 | `.btn-row` đã `flex-wrap`; nút thứ hai xuống hàng khi thiếu chỗ, không thu nhỏ |
| Card Account: `dl` chi tiết đồng bộ | `Đồng bộ gần nhất` + `hôm nay lúc 14:05`; `Đang chờ đồng bộ` + `12 thay đổi` | nhãn ≈ 130 + giá trị ≈ 140 = 270 px (sát 294) | Mỗi hàng là `flex-wrap: wrap; justify-content: space-between; gap: 2px 12px`: giá trị rơi xuống dòng dưới (canh trái) khi hẹp. Không dùng bảng hai cột cố định |
| SyncIndicator, chuỗi dài nhất | `Ngoại tuyến · 12 thay đổi đang chờ` (34 ký tự), `1.234 thay đổi đang chờ đồng bộ` (30), `Đăng nhập lại để đồng bộ` (24) | ≈ 230–290 px gồm icon 16 px + padding 24 px, trong 328 px | Chip `white-space: normal`, `max-width: 100%`, có thể 2 dòng (bo góc `--r-md` thay `--r-full` khi 2 dòng nhờ `border-radius: 16px`); `min-height: 32 px` |
| StatusRow khi `expired` + offline | `Ngoại tuyến — lưu trên thiết bị` (≈ 230 px) + `Đăng nhập lại để đồng bộ` (≈ 200 px) | 430 px > 328 | `flex-wrap: wrap; gap: 8px`; hai chip chồng lên hai dòng, mỗi chip canh theo phía của nó |
| Chip lỗi `Không đồng bộ được` + nút `Thử lại` | 18 + 7 ký tự | ≈ 170 px | Nút `Thử lại` là vùng bấm 44 px bằng `::after` mở rộng (xem 5, SyncIndicator); không làm chip cao hơn 32 px |
| LoginPromptBanner | Tiêu đề `Giữ tiến trình của bạn an toàn` (30 ký tự đậm ≈ 245 px) + thân ≈ 105 ký tự (3–4 dòng) + hai nút `Đăng nhập bằng Google` (≈ 220 px) và `Để sau` (≈ 70 px) | cao ≈ 160–210 px | Banner **không có cột icon riêng** ở < 640 px (icon cùng hàng với tiêu đề) để thân chiếm đủ 296 px; hàng nút `flex-wrap`, hai nút thường vừa một hàng (≈ 298 px sát mép) nên **dự phòng** xuống hai hàng; từ 640 px icon thành cột trái và hai nút nằm cùng hàng |
| ExportSignInHint | thân ≈ 120 ký tự + nút Google | cao ≈ 150 px | Khối chữ rồi nút xếp dọc; nút rộng đầy < 640 px |
| Dialog D4 (SignOut) | tiêu đề, thân 90 ký tự, 2 radio có mô tả 70–110 ký tự, khối cảnh báo ≈ 200 ký tự (cả `vi`), 2 nút | cao ≈ 560–640 px, vượt 740 px khi có cảnh báo + bàn phím ảo | Dialog `max-height: calc(100dvh - 16px)`, phần nội dung **cuộn bên trong**, hàng nút **dính đáy** (`position: sticky; bottom: 0`, nền `--surface`, viền trên). Radio: nhãn đậm, mô tả `--text-muted` nằm dưới nhãn, cả khối là một vùng chạm ≥ 44 px |
| Dialog D5 (Merge) | tiêu đề `Thêm dữ liệu trên thiết bị này vào tài khoản của bạn?` (54 ký tự → 3 dòng ở 20 px), email dài trong thân | OK | Email trong thân dùng `overflow-wrap: anywhere`; nút xếp dọc, rộng đầy |
| Dialog D3 đã đăng nhập | tiêu đề `Thay thế dữ liệu trên mọi thiết bị của bạn?`, thân ≈ 260 ký tự | cuộn nhẹ | Dùng chung quy tắc cuộn nội dung + nút dính đáy với D4 |
| Toast `vi` | `Đã đăng nhập. Tài khoản của bạn hiện có 6 mục tiêu, 25 lần ghi.` (≈ 64 ký tự) | 2–3 dòng | `max-width: calc(100vw - 32px)`, không `nowrap`. Toast lỗi đăng nhập dùng **bản ngắn** (`toast.signInCancelled/Failed`, ≤ 40 ký tự) + nút `Đến mục Tài khoản`; câu đầy đủ (`errors.AUTH_*`) nằm ở Alert trong card |
| Ghi chú "theo tài khoản" (card Language, Reminders) | ≈ 110–190 ký tự, có icon 16 px | 3–5 dòng | `.hint` thường có icon đầu dòng (`flex`, `min-width: 0`); không `nowrap` |
| Card Account (chưa đăng nhập): lời giải thích + dòng riêng tư | ≈ 160 + 60 ký tự | 5–6 dòng | Đặt nút Google **sau** lời giải thích, dòng riêng tư (`.hint`) **sau** nút; không tách thành tooltip |
| Avatar chữ cái đầu | Tên bắt đầu bằng ký tự có dấu (`Đức`, `Ánh`), emoji, hoặc tên rỗng | 40 px | Lấy **grapheme đầu** (`Intl.Segmenter`, rơi về `Array.from(s)[0]`), viết hoa theo `toLocaleUpperCase(locale)`; tên rỗng → chữ cái đầu của email; không có gì → `?` |

**Kiểm chứng** (M6-AC11, M7-AC15, M8-AC5): Playwright 360×740 ở `vi-VN` — Today (có LoginPromptBanner hoặc SyncIndicator), Settings (signed-out, signed-in với email 44 ký tự, expired), mở D4/D5/D3: `document.documentElement.scrollWidth <= clientWidth`. Mockup tham chiếu: `mockups/09-account.html` bật `Tiếng Việt`, ô "email dài" tick sẵn, mở ở 360 px.

### 3.6 Rủi ro 360 px cho thành phần phase 6 (v5.0)

Áp dụng đủ 7 quy tắc chung của 3.4 và các quy tắc của 3.5 (dialog cuộn bên trong + hàng nút dính đáy, `overflow-wrap: anywhere` cho email). Nội dung ở 360 px: 328 px, trong card ≈ 294 px. iPhone nhỏ nhất được hỗ trợ là 375 pt (SE), nên 360 px là mốc xấu hơn thực tế; iPhone 16 Pro Max (440 pt) có nhiều chỗ hơn nhưng **thêm** vùng an toàn trên 62 px và dưới 34 px (mục 5 "Native shell").

| Vị trí | Chuỗi / dữ liệu (`vi` là bản dài nhất) | Ước lượng | Xử lý |
| :- | :- | :- | :- |
| Cặp nút `Đăng nhập bằng Apple` + `Đăng nhập bằng Google` (card Account, LoginPromptBanner, ExportSignInHint) | 21 + 21 ký tự | mỗi nút ≈ 20 (logo) + 10 + 165 + 28 (padding) ≈ 223 px; hai nút cạnh nhau cần 458 px > 294 | **Luôn xếp dọc** trên native, rộng đầy, cách nhau 12 px (≥ 8), **Apple trên Google**, cùng `min-height` 44 px và cùng cỡ chữ 15 px (HIG: Apple không được kém nổi bật hơn). Chữ được xuống 2 dòng khi zoom 200 %, nút cao lên, không cắt |
| Card Account iOS, A1 | `settings.account.descSignedOutIos` (≈ 170 ký tự) + 2 nút + `privacyNoteIos` (≈ 65) + `hideEmailNote` (≈ 140) | ≈ 6 + 2 + 3 + 5 dòng; card cao ≈ 520 px | Thứ tự cố định: mô tả → nút Apple → nút Google → `privacyNoteIos` → `hideEmailNote` (hai `.hint`, cách nhau 8 px). Card cuộn cùng trang; không thu gọn, không tooltip |
| Email relay của Apple trong A5 | `x7k2p9q4rt.8d@privaterelay.appleid.com` (39 ký tự) | ≈ 280 px, sát 242 px của cột chữ | Như email dài ở 3.5: `overflow-wrap: anywhere`, xuống dòng, không cắt `…` |
| Khối Delete account (A5 … A9, A10) | nút `Xóa tài khoản` (13) + `deleteDesc` (≈ 95 ký tự → 3 dòng) + `deleteOffline` (≈ 70 → 2–3 dòng) | cao ≈ 150–190 px | Đường kẻ ngăn trên 16 px; mô tả **trên** nút; lý do vô hiệu **dưới** nút (nối `aria-describedby`); nút `min-height: 44px`, **không** rộng đầy (canh trái) để không giống nút chính; chữ xuống dòng tự do |
| D6, tiêu đề + thân | `Xóa tài khoản của bạn?` (22) + `auth.delete.body` (≈ 190 ký tự → 8 dòng ở 294 px) + dòng `Tài khoản: {email}` (email dài 3 dòng) | ≈ 30 + 160 + 60 px | Tiêu đề 20 px xuống 2 dòng được; email `overflow-wrap: anywhere` |
| D6, hai lựa chọn dữ liệu máy | `removeDesc` (≈ 100 ký tự) và `keepDesc` (≈ 100 ký tự) → 4 dòng mỗi lựa chọn ở 250 px (294 − 44 padding radio) | mỗi lựa chọn cao ≈ 130 px | Như radio của D4 (3.5): cả khối là vùng chạm ≥ 44 px, nhãn đậm + mô tả `--text-muted` dưới nhãn |
| D6 có khối `auth.delete.appleNote` + Alert lỗi | `appleNote` ≈ 175 ký tự (6 dòng); Alert `ACCOUNT_DELETE_FAILED` ≈ 170 ký tự (6 dòng) | **tổng D6 ≈ 900–1000 px > 740 px** ở 360×740, và còn bị thu thêm 62 + 34 px vùng an toàn trên iPhone | Dialog `max-height: calc(100dvh - 16px - var(--safe-top))`, nội dung cuộn bên trong (vùng cuộn `tabindex="0"`), **hàng nút dính đáy** có `padding-bottom: var(--safe-bottom)`. Alert lỗi nằm **ngay trên hàng nút** (không cuộn mất) và được cuộn vào tầm nhìn khi xuất hiện (`scrollIntoView({block:"nearest"})`) |
| D6 busy | `Đang xóa…` + vùng `workingStatus` | 1 dòng | Nhãn nút thay `Xóa tài khoản` bằng `Đang xóa…` (vòng xoay 16 px bên trái); chữ trạng thái nằm trên hàng nút |
| Panel thu hồi Apple (sau khi xoá, đứng dưới h2 Account) | `auth.delete.revokeBody` ≈ 270 ký tự (10 dòng) + tiêu đề đậm + link `Xem hướng dẫn của Apple` + nút `Đóng` | cao ≈ 330 px | Nền `--info-soft`, chữ `--info`; link và `Đóng` xếp dọc nếu hẹp, mỗi cái ≥ 44 px; không cắt, không thu gọn |
| Reminders native (iOS, M15) | `nativeInfo` (≈ 190 ký tự, 7 dòng), `nativeDeniedDesc` (≈ 175, 6 dòng), `nativeSwitchDesc` (≈ 120, 4 dòng) | card cao hơn ≈ 120 px so với bản web (bỏ khung `limit` + gợi ý iOS + nút `.ics`, nên **ngắn hơn** tổng thể) | Hàng switch `flex: 1; min-width: 0` như cũ; `nativeInfo` dùng khung `.limit` có sẵn (viền trái `--info`) |
| Storage native | nhãn `Nơi lưu dữ liệu của bạn` (24) + chip `Trong app này` (13) | ≈ 190 + 105 px | `.perm` đã `flex-wrap`: chip xuống dưới nhãn nếu hẹp |
| About có thêm hai link `Chính sách quyền riêng tư` và `Hỗ trợ` | 25 và 5 ký tự + chữ ẩn "(mở trong Safari)" | hai link xếp dọc hoặc cùng hàng | `display: inline-flex; min-height: 44px`, cách nhau 16 px, `flex-wrap`; gạch chân luôn hiện |
| Toast `vi` sau xoá tài khoản | `Đã xóa tài khoản. Dữ liệu của bạn vẫn còn trên thiết bị này.` (≈ 62 ký tự) | 3 dòng | Toast nằm **trên** tab bar: `bottom: calc(var(--tabbar-h) + var(--safe-bottom) + 12px)`, không che nhãn tab |
| Tab bar + safe area dưới, iPhone SE (không có thanh Home) | `--safe-bottom` = 0 | tab bar 56 px | Không thêm khoảng trống nào khi inset = 0 (iPhone SE, web) |

**Kiểm chứng** (M12-AC11, M14-AC6/AC11, M15-AC5): Playwright 360×740 ở `vi-VN`: Settings ở project `native-web` (M12) và Settings + D6 + panel thu hồi ở project `cloud` (bản web, mock; D6 và panel dùng chung cho web và native): `document.documentElement.scrollWidth <= clientWidth`. Card Account iOS (A1, A5 email relay, A10), D6 có khối Apple và Alert lỗi, Reminders native: kiểm bằng component test với `capabilities` iOS (không có E2E native thật, NFR-24) và bằng mockup. Mockup tham chiếu: `mockups/09-account.html` mục 7 … 11 bật `Tiếng Việt`, mở ở 360 px.

---

## 4. Màn hình

Quy ước chung cho mọi màn hình:

- **Loading** (lần đọc IndexedDB đầu tiên, thường < 100 ms): không hiện gì trong 150 ms đầu (tránh nháy), sau đó hiện Skeleton cùng hình dạng nội dung; vùng chứa có `aria-busy="true"`; một `role="status"` ẩn chứa chữ "Loading…". Review/Goal detail còn có loading cho chunk lazy: Skeleton của stat cards + khung chart.
- **Offline**: app vẫn dùng bình thường. Khi `navigator.onLine === false` hiện `OfflineChip` nhỏ ở header: "Offline — saved on this device" (`role="status"`, không chặn). Không bao giờ chặn thao tác vì offline. **(v2)** Khi đã đăng nhập, `SyncIndicator` thay `OfflineChip` trong StatusRow (xem 3.1): chữ `Offline · N changes waiting` vừa nói offline vừa nói số thay đổi chưa đồng bộ.
- **(v2) Đồng bộ và tài khoản**: không màn hình nào chờ mạng hay chờ đồng bộ mới hiển thị; mọi ghi vào IndexedDB trước (FR-45). Lỗi cloud chỉ hiện ở `SyncIndicator` + card Account, không bao giờ làm đổi hay khoá form ghi thời gian. Màn hình mới của phase 2 **không có** (card Account nằm trong Settings, callback OAuth không phải màn).
- **Lỗi lưu** (StorageError khi ghi): thông báo inline gần form "Couldn't save. Your changes are still in the form — try again." giữ nguyên giá trị đã nhập (M5-AC6).
- **Không có quyền**: app không có phân quyền người dùng. Trạng thái "quyền" duy nhất là quyền Notification (xem S7).
- Ngày/giờ/số hiển thị theo quy ước ở mục 7.1 (theo ngôn ngữ đang chọn).
- **Ngôn ngữ**: mọi chuỗi trong khối *Copy* dưới đây là bản `en`; bản `vi` và **key i18n** của từng chuỗi nằm ở mục 7. Đổi ngôn ngữ trong Settings đổi ngay mọi màn (kể cả màn đang mở, toast đang hiện, `document.title`, `<html lang>`), không reload, không mất dữ liệu đang hiển thị hay giá trị đang nhập trong form (form đang mở giữ nguyên giá trị; chỉ nhãn, hint, lỗi đổi ngôn ngữ). Lỗi validate đang hiện được dịch lại theo ngôn ngữ mới (lưu mã lỗi, không lưu chuỗi).
- Mỗi màn có trạng thái *default / loading / empty / error / success* như mô tả; trạng thái đó có đủ bản `vi` ở mục 7.

### S1 — Today  (Milestone: M1; M2 timer + banner; M3 link ghi bù + banner backup; M4 chip streak; M5 phản hồi "+1%", empty/error đầy đủ; **M7 SyncIndicator trong StatusRow; M8 LoginPromptBanner**. User story: US-02, US-03, US-04, US-09, US-18, US-20)

- **Mục đích:** Thấy ngay hôm nay còn thiếu gì và ghi thời gian trong vài giây. Primary action: `Log time` (lặp ở mỗi card goal; card đã đạt hạ xuống nút secondary).
- **Layout (mobile 360 px):**

```text
┌──────────────────────────────────────┐
│                      [☁ Synced 14:05]   <- StatusRow (M7, chỉ khi đã đăng nhập)
│ Today                    [8-day streak]  <- chip từ M4
│ Friday, October 9                    │
│ 1 of 3 goals on target               │
│ ┌ Banner (M2) ──────────────────────┐│  nền --info-soft, icon bell
│ │ It's past 20:00 — 2 goals are not ││
│ │ on target yet.                    ││
│ └───────────────────────────────────┘│
│ ┌ LoginPromptBanner (M8) ───────────┐│  chỉ khi chưa đăng nhập + đủ điều kiện FR-52
│ │ ☁ Keep your progress safe         ││  nền --primary-soft; thay BackupBanner
│ │ Sign in to back up your goals ... ││
│ │ [G Sign in with Google] [Not now] ││
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

- **Component dùng:** AppShell (StatusRow: OfflineChip / SyncIndicator), PageHeader, Banner (ReminderBanner, BackupBanner, **LoginPromptBanner**), TimerCard, GoalCard (ProgressBar, PlusOnePill, Button), EntryForm, EntryRow, ConfirmInline, Toast, EmptyState, Skeleton.
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
  - *banner đăng nhập* (M8, FR-52, **LoginPromptBanner**): nền `--primary-soft`, nằm **dưới banner nhắc, trên TimerCard/danh sách goal**; **ưu tiên hơn BackupBanner** (khi cả hai đủ điều kiện chỉ hiện banner đăng nhập; sau "Not now" thì BackupBanner hiện lại). `<section aria-label="Sign-in suggestion">`, **không** phải dialog (không `role="dialog"`, không `aria-modal`), không tự lấy focus, không che nội dung, ghi entry/timer vẫn dùng bình thường. Gồm tiêu đề `Keep your progress safe`, một câu giải thích, nút `Sign in with Google` (nút Google, `returnTo = #/today`) và `Not now` (ghost). Offline hoặc đã đăng nhập hoặc cloud tắt hoặc hết phiên: không hiện.
  - *StatusRow* (M7): khi đã đăng nhập, `SyncIndicator` luôn hiện ở đầu `<main>` (5 trạng thái, xem mục 5 và S7); chưa đăng nhập: không có gì (ngoài OfflineChip khi offline).
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
  - (M8) `Sign in with Google` trong LoginPromptBanner → F9 (nút đổi thành `Signing in…`, rồi điều hướng sang Google). `Not now` → ghi nhận (ẩn 14 ngày, tối đa 3 lần), banner biến mất, toast `loginPrompt.snoozedToast`, **focus chuyển về `<h1>`** (phần tử có focus đã bị gỡ). Banner không có nút ✕ riêng ngoài `Not now`.
  - (M7) `SyncIndicator` ở trạng thái lỗi: nút `Retry` chạy `syncNow('manual')`; ở trạng thái `expired`: chip là link tới `#/settings`.
- **Copy:**
  - Tiêu đề trang: `Today`. Dòng ngày: `Friday, October 9`.
  - Tóm tắt: `{n} of {m} goals on target` (m = 1: `{n} of 1 goal on target`). Khi mọi goal đạt: `All {m} goals on target — a little better than yesterday.` (m = 1: `Goal on target — a little better than yesterday.`)
  - Chip streak (M4): `{n}-day streak`.
  - Card: `{minutes}/{target} min`; phụ đề goal loại `total`: `{dailyTarget} min/day · {hours} h total`; `{r} min to go`; `Target reached`; `Target reached · {x} min extra`.
  - Nút: `Log time`, `Start timer`, `Save entry`, `Save changes`, `Cancel`, `Edit`, `Delete`, `Keep`.
  - Nhãn entry: `Today's entries`; aria-label nút icon: `Edit entry: 20 min, Ch. 3`, `Delete entry: 20 min, Ch. 3`.
  - Empty: xem 7.4.
  - Link: `Missed a day? Log time for a past day`.
  - (v2) Banner đăng nhập: tiêu đề `Keep your progress safe`; thân `Sign in to back up your goals and entries online and use them on all your devices. It's optional.`; nút `Sign in with Google`, `Not now`; toast sau `Not now`: `OK. You can sign in any time from Settings.` Chỉ báo đồng bộ: mục 5 (bảng trạng thái) và 7.7.3. Key: `loginPrompt.*`, `sync.indicator.*`.

### S2 — Goals  (Milestone: M1; tên goal thành link M3; Archive/Restore + nhóm Archived M5; **hàng goal không thời hạn M11**. User story: US-01, US-02, US-12, US-21)

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
  - **(v4.0) Goal không thời hạn** (`endDate = null`, chỉ `daily`): cùng một `GoalRow`, **chỉ đổi dòng thông tin** — `goals.rowDailyOpen` thay cho `goals.rowDaily` (không có ` – {end}`). Ví dụ `en`: `10 min/day · from 2026-10-01, no end date`; `vi`: `10 phút/ngày · từ 01/10/2026, không có thời hạn`. Badge: `Active` từ `startDate` trở đi, `Upcoming` (kèm dòng `Starts {date}` như mọi goal sắp tới) trước đó, `Archived` khi lưu trữ; **không bao giờ có badge `Ended`, dòng `Ended {date}` hay nằm trong nhóm `Ended`** (dù chạy 10 năm). Vị trí trong nhóm: Active theo `createdAt` ↑, Upcoming theo `startDate` ↑ (cùng quy tắc, A-50). Tên goal, `why`, các nút và vùng chạm giữ nguyên. Goal có hạn hiển thị y như v3.1.
  ```text
  │ Meditate                         [Active]  │
  │ 10 min/day · from 2026-10-01, no end date  │   (vi: 10 phút/ngày · từ 01/10/2026, không có thời hạn — xuống 2 dòng ở 360 px)
  │ [Edit] [Archive] [Delete]                  │
  ```
- **Tương tác:** `New goal` → `#/goals/new`; `Edit` → `#/goals/:id/edit`; `Delete` → D2; xác nhận → xoá, toast `Goal deleted`, focus về `<h1>`; `Archive` → toast `Goal archived` (hoặc lỗi GOAL_TIMER_RUNNING); `Restore` (nhóm Archived) → toast `Goal restored`.
- **Copy:** `Goals`, `New goal`, `Active ({n})`, `Upcoming ({n})`, `Ended ({n})`, `Archived ({n})`, `Starts {date}`, `Ended {date}`, `Edit`, `Archive`, `Restore`, `Delete`. Hàng goal `daily`: `{n} min/day · {start} – {end}`; goal `total`: `{dailyTarget} min/day ({hours} h total) · {start} – {end}`; **(v4.0)** goal `daily` không thời hạn: `{n} min/day · from {start}, no end date` (`goals.rowDailyOpen`, 7.6.2).
- **D2 — Delete goal dialog** (M1): tiêu đề `Delete "{name}"?`; nội dung `This permanently deletes the goal and its {n} entries. This can't be undone.` (n = 0: `This permanently deletes the goal. It has no entries yet. This can't be undone.`; có timer chạy thêm: ` Its running timer will be discarded.`); nút `Delete goal` (danger), `Cancel` (focus ban đầu ở `Cancel`).

### S3 — Goal form (tạo/sửa)  (Milestone: M1; **radio "No end date" M11**. User story: US-01, US-21)

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
│   ( ) On a specific date             │
│       End date *  [2026-12-31]       │  chỉ hiện khi chọn "On a specific date" (v4.0: nằm NGAY DƯỚI radio này)
│   ( ) No end date                    │  (v4.0) radio thứ ba, cuối nhóm
│       <mô tả / ghi chú, 14 px muted> │  v4.0: chỉ có khi đang chọn (endsNeverHint) hoặc khi bị khoá (endsNeverTotalNote)
│ [Save goal]            [Cancel]      │
└──────────────────────────────────────┘
```
  Desktop: form rộng tối đa 560 px, nút xếp ngang; mobile: `Save goal` full-width.

  **(v4.0) Section Ends — chi tiết bố cục.** Fieldset `Ends` có **3 radio xếp dọc**, thứ tự cố định: `This year — ends {date}`, `On a specific date`, `No end date`. Mỗi radio giữ kiểu hiện tại (hàng cao ≥ 44 px, radio 20 px, khoảng 10 px, chữ 16 px). Khác v3.1 duy nhất về vị trí: field **End date** (hiện khi chọn "On a specific date") nằm **ngay dưới radio thứ hai** (thụt lề trái 30 px, thẳng với chữ nhãn) thay vì dưới cả nhóm, để radio thứ ba nằm cuối mà không tách field khỏi radio của nó. Dòng mô tả dưới radio thứ ba là `<p class="hint">` thụt lề 30 px, có `id` và được nối bằng `aria-describedby` vào chính radio đó. Không icon, không viền, không đổi màu.
- **Component dùng:** PageHeader (nút Back), TextField, TextArea (có counter), SegmentedControl (radio group), NumberField, DateField, RadioGroup (**v4.0:** mỗi lựa chọn có thể `disabled` + `describedBy` + dòng mô tả bên dưới), Button.
- **Trạng thái:**
  - *default*: tạo → Start date = hôm nay, Ends = "This year", Target = Minutes per day, giá trị trống. Sửa → điền sẵn từ goal. Id không tồn tại → Not found.
  - *error*: lỗi inline dưới từng field (`aria-invalid="true"`, `aria-describedby` trỏ tới lỗi + hint, icon + chữ, màu `--danger`). Khi submit: focus field lỗi đầu tiên; vùng `role="alert"` trên đầu form: `Fix {n} field to save.` / `Fix {n} fields to save.`. Goal không được lưu khi còn lỗi. Lỗi GOAL_PERIOD_EXCLUDES_ENTRIES hiện dưới Start date/End date.
  - *loading*: (sửa) skeleton form trong lúc đọc goal. *success*: về `#/goals` + toast `Goal created` / `Goal updated`. *empty*: không áp dụng. *offline*: bình thường.
  - Hint chỉ tiêu: `daily` → `That's {totalMin} min ({hours} h) over {days} days.`; `total` → `That's about {dailyTarget} min per day over {days} days.` (cập nhật khi gõ; nếu `dailyTarget` > 1440 thì thay bằng lỗi).
  - Chế độ sửa, nếu goal đã có entry: hint dưới Start date: `Your entries run from {firstDate} to {lastDate}, so the period must include those dates.`
  - **(v4.0) Radio "No end date" — các trạng thái:**
    1. *Mở khoá, chưa chọn* (Target = Minutes per day): radio bình thường, không có dòng mô tả.
    2. *Đang chọn* (Target = Minutes per day): hiện `goal.form.endsNeverHint` dưới radio; **ẩn hint dưới field Target** (hint `hintDaily` nói "over N days" nên vô nghĩa khi không có ngày cuối); field End date ẩn; Save gửi `endDate: null`.
    3. *Khoá* (Target = Total hours): radio `disabled` (không chọn được bằng chuột, bàn phím, chạm), chữ nhãn giữ `--text-muted` (**không** giảm opacity, tương phản chữ ≥ 4.5:1), con trỏ `not-allowed`; **luôn hiện** `goal.form.endsNeverTotalNote` dưới radio (không phải tooltip, không chỉ hiện khi hover); radio có `aria-describedby` trỏ ghi chú. Hai radio còn lại hoạt động bình thường. (Chọn **khoá + ghi chú thay vì ẩn** vì ẩn làm người dùng không biết lựa chọn tồn tại hay vì sao biến mất, và làm nhóm Ends nhảy từ 3 xuống 2 radio khi đổi Target; xem A-D52.)
    4. *Sửa goal có `endDate = null`*: mở form với "No end date" **đã chọn** (trạng thái 2), End date (ẩn) được khởi tạo = cuối năm của Start date để nếu người dùng chọn "On a specific date" thì ô không trống.
    5. *Lỗi `openEndedTotal`* (dự phòng — UI không để xảy ra): `errors.GOAL_PERIOD_INVALID_openEndedTotal` hiện dưới nhóm Ends (icon + chữ `--danger`, `id` nối vào `aria-describedby` của fieldset); focus vào radio đang chọn của nhóm Ends (hoặc radio đầu nếu không có); vẫn tính vào số lỗi của `goal.form.summary`.
- **Tương tác:** Chọn "On a specific date" → hiện DateField "End date" (mặc định = Start date); đổi Start date → nhãn "This year — ends {YYYY-12-31}" cập nhật theo năm của Start date.
  **(v4.0)** Chọn "No end date" → ẩn End date (giá trị đã gõ được giữ nếu quay lại "On a specific date"), thay hint Target bằng mô tả dưới radio. Đổi Target sang **Total hours** khi đang chọn "No end date" → (a) radio bị khoá + hiện ghi chú, (b) Ends **tự chuyển sang "This year — ends …"** (chọn "This year" vì luôn hợp lệ, không cần nhập thêm, và là mặc định của form tạo), (c) vùng `role="status"` sr-only (luôn có trong DOM, trong fieldset Ends) đặt nội dung `goal.form.endsNeverSwitched` để SR đọc một lần, (d) focus **ở lại** control Target (người dùng vừa thao tác ở đó). Đổi Target về Minutes per day → mở khoá, xoá nội dung vùng status, **không** tự chọn lại "No end date" (không nhớ lựa chọn cũ; A-D53). Radio thứ ba chỉ gửi `endDate: null` khi `targetType = daily`; form không bao giờ gọi service với `total` + `null`. Đổi loại chỉ tiêu → đổi nhãn/đơn vị field số, giữ giá trị nếu hợp lệ. `Save goal` → validate (zod) → lưu. `Cancel`/Back → `#/goals` (hỏi xác nhận nếu form đã sửa? **không**, giữ đơn giản; xem Assumptions).
- **Copy:** nhãn `Name`, `Why (optional)`, `Target`, `Minutes per day`, `Total hours`, `Start date`, `Ends`, `This year — ends {date}`, `On a specific date`, `End date`, **(v4.0)** `No end date`; placeholder Name `e.g. Read`, Why `Why does this matter to you?`; nút `Save goal`, `Save changes`, `Cancel`; counter `{n}/60`, `{n}/280`. Thông báo lỗi: bảng 7.3. **(v4.0)** Mô tả/ghi chú dưới radio thứ ba: `goal.form.endsNeverHint` (`The goal keeps running every day until you archive or delete it. Progress is measured up to today.`), `goal.form.endsNeverTotalNote` (`Only available for Minutes per day. Total hours needs an end date to work out your daily target.`), thông báo SR `goal.form.endsNeverSwitched` (`Ends changed to This year, because No end date only works with Minutes per day.`); nguồn là 7.6.3.

### S4 — Goal detail  (Milestone: M3 bản cơ bản [thông tin + lịch sử]; M5 đầy đủ [headline, đường cong, stat, archive]; **M9 đường cong v3** [headline có dấu, phụ đề, biểu đồ, bảng, chú thích, copy]; **M11 goal không thời hạn** [dòng khoảng thời gian, "Day {k}", tóm tắt, bỏ Range, upcoming, Progress tới hôm nay]. User story: US-08, US-21, FR-18, FR-27 (v3.0), FR-28, FR-56)

- **Mục đích:** Một goal trong một trang: lý do, tiến độ, và hình dung "mỗi ngày tốt hơn một chút". Primary action: không có hành động nổi bật (trang đọc); `Edit` là secondary.
- **Layout (v3, dữ liệu thật của user R1 tại 2026-10-13, `en`):**

```text
┌────────────────────────────────────────────────────┐
│ ‹ Goals                                            │
│ Đọc sách                [Active]  [Edit][Archive][Delete]
│ 2026-10-10 – 2026-12-31 · 30 min/day               │
│                                                    │
│ Your 1% curve                        (eyebrow)     │
│ +440.0% better                       (display 40px)│  headline
│ Day 4 of 83                                        │  phụ đề dòng 1
│ Today: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).   dòng 2
│ ┌ CurveChart ────────────────────────────────────┐ │
│ │ +500% ┤                          ┌── You       │ │
│ │ +400% ┤                     ┌────┘             │ │
│ │ +200% ┤              ┌──────┘                  │ │
│ │    0% ┼━━━━━━━━━━━━ (vạch 0%, đậm) ━━━━━━━━━━━ │ │  Ideal nét đứt sát 0%
│ └────────────────────────────────────────────────┘ │
│ Legend: - - Ideal (+1% every day)  ── You (vs. previous logged day, compounded)  ━ 0% = your first logged day
│ Chart summary (text) · Chart note (muted) · [Range: Whole period|So far]
│ [Progress 2.2%] [Pace …] [Streak 0] [Longest …]    │
│ History (newest first): date | minutes | note | source
└────────────────────────────────────────────────────┘
```
  M3 chỉ có: tiêu đề, why, khoảng thời gian, chỉ tiêu, nút Edit/Delete, History. M5 thêm headline, chart, stat, Archive. **M9 đổi định nghĩa số liệu của headline/phụ đề/chart (FR-27 v3.0); Stat card (Progress, Pace, streak), History, nút giữ nguyên.** Thứ tự các khối không đổi so với M5.

**Cách đọc con số (để copy có nghĩa).** "Bạn" = phút của **ngày có ghi gần nhất** ÷ phút của **ngày đầu tiên có ghi** (baseline). Ngày đầu có ghi = 0% ; mỗi ngày có ghi sau đó được so với ngày có ghi liền trước và các tỉ lệ nhân dồn; ngày 0 phút đi ngang; ngày ghi ít hơn ngày trước thì đường đi xuống (có thể xuống dưới 0%). Chỉ tiêu ngày (`dailyTarget`) **không** ảnh hưởng đường này (A-42). Hôm nay đang ghi dở tính ngay (A-39, OQ-11): hôm qua 27 phút, sáng nay mới 3 phút thì headline tụt xuống `−40.0%` rồi tăng lại khi ghi thêm.
- **Component dùng:** PageHeader, Badge, CurveChart (Recharts lazy), StatCard, HistoryTable, Button, ConfirmDialog, EmptyState, Skeleton, ErrorState.
- **Trạng thái:**
  - *default*: như layout. Chiều rộng 960 px; chart 320 px cao ở desktop, 240 px ở mobile.
  - *loading*: skeleton headline + khung chart (chunk lazy), `aria-busy`.
  - *empty — chưa có entry* (`baseline = null`): headline `+0.0% better`; phụ đề dòng 1 `Day {k} of {total}`, dòng 2 là `empty.detail.curve` (thay cho câu số liệu); chart **chỉ có đường Ideal + vạch 0%** (đường "Bạn" không vẽ, không nhãn "Bạn", cột "Bạn"/`Số phút`/`So với…` của bảng ghi `—`); tóm tắt dùng `goal.detail.chartSummaryEmpty`; History: EmptyState nhỏ `No entries yet` / `Time you log for this goal will show up here.`
  - *một ngày có ghi* (`baseline = latest`, `previous = null`): headline `+0.0% better`; dòng 2 là `goal.detail.subStart` (điểm xuất phát, có phút + ngày, **không** có `×`); chart vẽ đường "Bạn" đi ngang trên 0% từ ngày có ghi tới hôm nay.
  - *nhiều ngày có ghi* (`previous ≠ null`): headline theo dấu (`headline` khi ≥ 0, `headlineDown` khi < 0); dòng 2 là `goal.detail.subToday` nếu `latest.date` = hôm nay, ngược lại `goal.detail.subEarlier` (đường đi ngang, headline giữ nguyên giá trị ngày có ghi gần nhất — A-39).
  - *đi xuống* (headline < 0, vd. R3: 5 → 3 phút): headline `−40.0% vs your first day` màu `--text` (không đỏ, không xanh); đường "Bạn" xuống dưới vạch 0%; trục Y có nhãn âm.
  - *upcoming*: headline `+0.0% better`, dòng `Starts {date}. Your line will appear once the goal begins.` (`goal.detail.upcoming`, **không đổi**); chỉ đường Ideal; không có `subDay`.
  - *ended*: Actual dừng ở `endDate` (nên `latest.date` < hôm nay → `subEarlier`); badge `Ended`; `Day {k} of {total}` có k = `elapsedDays` ≤ total.
  - *archived*: badge `Archived`, nút `Restore` thay `Archive`.
  - *error*: chunk lazy lỗi → ErrorState `Couldn't load this view` + `Retry`; id không tồn tại → Not found.
  - *offline*: bình thường (chunk đã precache).
  - Mặc định **Range**: `Whole period` nếu khoảng ≤ 120 ngày, ngược lại `So far` (đọc Assumptions A-D4). Control chỉ lọc dữ liệu hiển thị. **(v4.0)** Không áp dụng cho goal không thời hạn (xem ngay dưới: control bị bỏ).
  - **(v4.0) Goal không thời hạn (`endDate = null`, M11; FR-56, A-51, A-52).** Chỉ khác goal có hạn ở các điểm sau; mọi thứ còn lại (headline, phụ đề dòng 2, quy tắc vẽ, nhãn, tooltip, bảng, History, nút) **giữ nguyên v3.0/v3.1**. Goal có hạn hiển thị y như cũ.
    1. **Dòng khoảng thời gian đầu trang** (dưới tên goal, cạnh badge): `goals.rowDailyOpen` — `10 min/day · from 2026-10-01, no end date`. Cùng key với hàng ở Goals (không có key riêng cho Goal detail). Không có ngày kết thúc, không có `–`.
    2. **Phụ đề dòng 1** (`headline-day`): `goal.detail.subDayOpen` — `Day {k}` (k = `elapsedDays`, ví dụ `Day 9`, `Day 1,828`), **không** có `of {total}`. Goal có hạn vẫn dùng `goal.detail.subDay`. Ẩn khi chưa bắt đầu (như mọi goal upcoming).
    3. **Tóm tắt dưới chart (SR)**: `goal.detail.chartSummaryOpen` (có ≥ 1 ngày có ghi) / `goal.detail.chartSummaryEmptyOpen` (chưa có entry) thay cho `chartSummary` / `chartSummaryEmpty`; chỉ khác là `Day {k}` thay `Day {k} of {total}`, các biến `{x}`, `{y}` giữ nguyên.
    4. **Range bị bỏ**: với goal không thời hạn, "Whole period" và "So far" là cùng một dữ liệu (không có ngày tương lai) nên **không hiện control Range** (hàng `chart-head` chỉ còn h2 `Ideal vs. you`). Biểu đồ và bảng luôn là `startDate → hôm nay`; trục X luôn kết thúc ở hôm nay. Không có vạch "hôm nay" riêng (đã trùng điểm cuối).
    5. **Số điểm**: Ideal và "Bạn" cùng có `elapsedDays` điểm (không có điểm tương lai); bảng dữ liệu có đúng `elapsedDays` hàng, hàng cuối là hôm nay (O1 ngày 9 = 9 hàng). Goal chạy rất lâu (> 1.827 ngày) vẫn vẽ đủ; thang Y theo `curveYDomain` như mọi goal (hệ quả: Ideal `1.01^k` sau vài trăm ngày làm "Bạn" nằm sát vạch 0% — đọc giá trị ở nhãn trực tiếp, tooltip, bảng; xem A-D55 và OQ-D21).
    6. **Ngày đầu tiên (`elapsedDays = 1`, tức `startDate` = hôm nay)**: chỉ có một điểm mỗi đường → x-domain suy biến; vẽ chấm Ideal và chấm "Bạn" (nếu có entry) **ở giữa chiều ngang vùng vẽ**, một nhãn trục X (hôm nay), không đường nối; nhãn trực tiếp, tooltip, tóm tắt, bảng (1 hàng) hoạt động như thường. Không dùng điểm giả cho ngày mai.
    7. **Chưa bắt đầu (`upcoming`: hôm nay < `startDate`)**: `ideal = []`, `actual = []` nên **không có gì để vẽ** (khác goal có hạn chưa bắt đầu, vốn vẽ đường Ideal cả khoảng). Màn hiển thị: badge `Upcoming`; thẻ headline: `+0.0% better`, dòng `goal.detail.upcoming` (`Starts {date}. Your line will appear once the goal begins.`, **không đổi**), không có `subDay`; **bỏ hẳn thẻ biểu đồ** (h2, chart, legend, tóm tắt, chú thích, bảng — không có khung rỗng, không có Range); giữ nguyên hàng StatCard (Progress `0.0%` / `0 of 0 min expected so far`, Pace `On pace` / `Expected 0 min by today`, hai streak `0 days`) và History (rỗng → EmptyState nhỏ như hiện tại). Tóm tắt SR của trạng thái này chính là dòng `goal.detail.upcoming`.
    8. **StatCard Progress** (và Review): giá trị `61.1%` tính **tới hôm nay** (A-51; có thể > 100%, thanh progress chặn ở 100%, `StatCard` giữ nguyên hành vi hiện có; xem 8.2); phụ đề dùng `stat.progressSubOpen` (`55 of 90 min expected so far`) thay `stat.progressSub` để người đọc hiểu "90" là chỉ tiêu tích luỹ tới hôm nay chứ không phải tổng cả goal. Thẻ Pace giữ `stat.pace*` và `stat.paceExpected` (câu `Expected {n} min by today` vốn đã đúng). Hai thẻ streak không đổi.
    9. **Archive / Ended**: goal không thời hạn không bao giờ `ended` nên không có biến thể "ended" của S4; `archived` giữ nguyên (badge `Archived`, nút `Restore`).
- **Tương tác:** `Edit` → form; `Delete` → D2 (xong về `#/goals`); `Archive` → toast; bấm ngày trong History → `#/day/:date` (M3); hover/focus trên chart hiện tooltip (v3, R1, ngày 12/10): `Oct 12 · 14 min, +40.0% vs previous logged day · You +180.0% since your first day · Ideal +3.0%`; bàn phím: chart focus được, mũi tên trái/phải di chuyển điểm đọc (mỗi lần một ngày, đọc cùng chuỗi tooltip); vùng `details` "Show data as table" có bảng đầy đủ. Đổi `Range` → vẽ lại với miền Y tính lại theo các điểm đang hiển thị.
- **Biểu đồ v3 — quy tắc vẽ (M9-T3).**
  1. **Đường "Bạn"**: nét liền dày `--chart-actual`, kiểu **bậc thang `stepAfter`** (giữ giá trị tới ngày kế rồi nhảy tại ngày có ghi; ngày 0 phút là đoạn ngang, ngày ghi ít hơn là bậc đi xuống). Vẽ mọi điểm `ActualPoint` (trước baseline là 0%); **không vẽ** khi `baseline = null`. Chấm nhỏ (r = 3) ở mỗi ngày **có ghi** khi số điểm "Bạn" đang hiển thị ≤ 45; chấm lớn (r = 5,5) ở hôm nay / ngày cuối. **Đường Ideal**: nét đứt xám, tuyến tính, như M5.
  2. **Vạch 0%** (mức ngày đầu có ghi): đường ngang liền 1,5 px `--chart-zero`, luôn hiện (miền luôn chứa 0 vì `yMin ≤ 0 < yMax`); nhãn trục `0%`. Là mốc đọc "trên hay dưới ngày đầu"; có mục legend riêng (`goal.detail.legendZero`). Các vạch lưới khác 1 px `--border`.
  3. **Thang Y** (giữ control Range A-D4): tuyến tính, miền = `curveYDomain(ideal%, you%)` của **các điểm đang hiển thị**; không giới hạn cứng, không thang log. **Đầu dưới chỉ nới (5 %) khi có giá trị âm**; nếu "Bạn" không bao giờ dưới 0 thì `yMin = 0` đúng (không chừa khoảng trống dưới vạch 0%, nếu không R1 sẽ có cả một bậc `−100%` vô nghĩa) — vẫn nằm trong dung sai của M9-AC2 (xem OQ-D17). Vạch/nhãn: bước "đẹp" (1, 2, 5 × 10ⁿ), **không nhỏ hơn 1 (đơn vị %)** để nhãn luôn là số nguyên, 4–6 vạch, luôn có 0.
  4. **Nhãn trục Y** = % số nguyên **có dấu**: `+100%`, `0%` (không dấu), `−50%` (U+2212). |v| < 10.000: có nhóm hàng nghìn (`+1,000%` / `+1.000%`); |v| ≥ 10.000: `Intl.NumberFormat` `notation: 'compact'` — `en` `+144K%`, `vi` `+144 N%` (dùng đúng kết quả của Intl, không tự ghép), tối đa 8 ký tự. Lề trái chừa theo nhãn dài nhất (≈ 6,6 px × số ký tự + 14 px, tối thiểu 44 px).
  5. **Nhãn trực tiếp tại điểm cuối** (`goal.detail.labelIdeal`, `labelYou`): mặc định mỗi nhãn nằm ngay **trên** chấm của nó (chuyển xuống dưới chấm nếu sẽ chạm đỉnh vùng vẽ); nếu hai chấm cách nhau < 24 px thì nhãn của series cao hơn ở trên chấm, nhãn của series thấp hơn ở dưới chấm — hai nhãn không bao giờ đè nhau, kể cả khi "Bạn" thấp hơn Ideal. Kẹp trong vùng vẽ; nhãn nằm bên phải chấm, neo phải (nằm bên trái chấm) nếu x > 70 % chiều rộng. **(v3.1, tuỳ chọn, chỉ CSS, không có AC; QC M9 r1 §9.4)** Chữ của cả hai nhãn có **viền sáng 3 px** màu `--surface` (`paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round`) để đường Ideal nét đứt chạy sát chấm gần vạch 0% (R3, 360 px) không cắt ngang chữ. Không đổi vị trí, chuỗi hay màu chữ; mockup `07-goal-detail.html` đã có. Nếu dev không làm trong M10 thì để backlog Minor, không chặn.
  6. **Trục X**: nhãn ngày ngắn không năm (~ mỗi 72 px), như M5. Chiều cao 240 px (mobile) / 320 px (desktop).
  7. **Hệ quả đã chấp nhận (ARCH §4.5)**: khi "Bạn" vượt xa Ideal (R1: +440% so với +4,1%) Ideal nằm sát vạch 0% — đúng thực tế, giá trị đọc ở nhãn trực tiếp, tooltip và bảng. Goal dài vẫn mặc định `So far` để Ideal không nuốt thang.
- **Copy:** mục 7.6.4 là nguồn; dưới đây là bản `en` với R1 / R3 (số đã qua formatter, mục 7.1).
  - Headline: `+440.0% better` (≥ 0, màu `--primary`); `−40.0% vs your first day` (< 0, màu `--text`). Dấu nằm trong `{{value}}`, template không có `+` cứng.
  - Phụ đề: dòng 1 `Day 4 of 83`; dòng 2 (nhiều ngày có ghi, hôm nay có ghi) `Today: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).`; (ngày có ghi gần nhất là quá khứ) `Last logged Oct 13: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).`; (một ngày có ghi) `Starting point: 5 min on Oct 10. Your line moves once you log on another day.`; (chưa có entry) `Your line starts on the first day you log time. That day is your starting point (0%).`. Hệ số `×N` dùng `f.factor`, ký tự `×` (U+00D7) nằm trong template, ví dụ `×0.6` khi thấp hơn ngày đầu.
  - Chú thích dưới chart: `Each day you log is compared with your previous logged day, and the changes multiply from your first day. Days without time keep the line flat. Logging less than before moves it down.`
  - Legend: `Ideal (+1% every day)`, `You (vs. previous logged day, compounded)`, `0% = your first logged day`.
  - Tóm tắt cho SR (hiện luôn dưới chart): `Day 4 of 83: your line is +440.0% compared with your first logged day. The ideal line is +4.1%.`; chưa có entry: `Day 4 of 83: nothing logged yet. The ideal line is +4.1%.`
  - Bảng dữ liệu: cột `Date`, `Ideal`, `You`, `Minutes`, `vs previous logged day`. Hàng 2026-10-13: `+4.1%`, `+440.0%`, `27`, `+92.9%`. Ngày không ghi: `Minutes` = `0`, cột so sánh `—`; ngày tương lai (Whole period): `You`, `Minutes`, so sánh đều `—`.
  - Stat: `Progress` (`25.8%`, phụ `240 of 930 min`), `Pace` (`30 min behind`, phụ `Expected 270 min by today`), `Current streak` (`8 days`), `Longest streak` (`8 days`).
  - History: tiêu đề `History`; cột `Date`, `Minutes`, `Note`, `Source`; nguồn `Manual` / `Timer`; ngày dạng `YYYY-MM-DD`; ghi chú rỗng hiển thị `—`.
  - Nút: `Edit`, `Archive`, `Restore`, `Delete`, `Retry`; toggle `Whole period` / `So far`; `Show data as table`.
  - **(v4.0) Goal không thời hạn, dataset O1 (`Meditate`, 10 min/day từ 2026-10-01, entry 10/15/10/20 phút), hôm nay 2026-10-09, `en`:** dòng khoảng thời gian `10 min/day · from 2026-10-01, no end date`; headline `+100.0% better`; phụ đề dòng 1 `Day 9`; dòng 2 `Last logged Oct 8: 20 min, +100.0% vs Oct 5 (10 min). ×2 since Oct 1 (10 min).`; tóm tắt SR `Day 9: your line is +100.0% compared with your first logged day. The ideal line is +9.4%.`; không có Range; Progress `61.1%` + phụ `55 of 90 min expected so far`; Pace `35 min behind` + phụ `Expected 90 min by today`; Current streak `1 day`; Longest streak `2 days`. `vi` tương ứng: `10 phút/ngày · từ 01/10/2026, không có thời hạn`; `Tốt hơn +100,0%`; `Ngày 9`; `Ngày 9: đường của bạn ở mức +100,0% so với ngày có ghi đầu tiên. Đường lý tưởng ở mức +9,4%.`; `61,1%` + `55/90 phút dự kiến đến nay`; `Chậm 35 phút`.

### S5 — Day  (Milestone: M3; **M11: goal không thời hạn có mặt ở mọi ngày từ `startDate` tới hôm nay**. User story: US-05)

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
  - *default*: liệt kê goal (kể cả `ended`, `archived`) có `startDate ≤ date ≤ endDate`. **(v4.0)** Goal không thời hạn: `date ≥ startDate` (ngày tương lai đã bị chặn riêng ở trên). Bố cục, copy không đổi. Nếu một thao tác vẫn bị từ chối vì ngày < `startDate` của goal không thời hạn (ví dụ lưu từ dialog Stop timer sau khi sửa Start date), Alert dùng `errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded` (`That date is before this goal starts (2026-10-01).`) thay câu có hai ngày.
  - *loading*: skeleton. *empty*: không goal nào chứa ngày đó → tiêu đề `No goals were running on this day` (**không có dấu chấm cuối**: là tiêu đề `empty.day.noGoals`, đúng `en.json`; v3.1) + thân `empty.day.noGoalsBody` + `View goals`.
  - *goal chưa có entry ngày đó*: `No time logged for this goal on this day.` + nút `Add entry`.
  - *ngày tương lai* (kể cả mở bằng URL): không có form; thông báo `You can't log time for a future date.` + `Go to today`.
  - *ngày sai định dạng* (`#/day/abc`, `2026-13-40`): màn lỗi `That date isn't valid.` + link `Go to Today`.
  - *error*: lỗi lưu inline; *success*: toast `Entry saved` / `Entry updated` / `Entry deleted`. *offline*: bình thường.
- **Tương tác:** `Previous day`/`Next day` → đổi route (focus giữ ở nút bấm); ô chọn ngày (`<input type="date" max=hôm nay>`) → đổi route; `Add entry`/`Edit`/`Delete` như Today. Ngày hợp lệ nhưng ngoài mọi khoảng → empty.
- **Copy:** `Day`, `Previous day`, `Next day`, `Go to today`, `Date`, heading ngày `Thursday, October 8, 2026`, `Add entry`, `Only goals running on this day are shown.`, nhãn nguồn `Manual`/`Timer`, các thông báo ở trên.

### S6 — Review  (Milestone: M4; M5 xử lý rỗng/archived; **M11 Progress/ghi chú "tới hôm nay" cho goal không thời hạn**. User story: US-06, US-07, US-21)

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
  - **(v4.0) Một goal không thời hạn** (M11; A-51): bố cục và 6 thẻ giữ nguyên. Khác ở hai chỗ chữ: (1) thẻ **Progress** có phụ đề `stat.progressSubOpen` (`55 of 90 min expected so far`) thay `stat.progressSub` — giá trị `61.1%` là tổng phút ÷ chỉ tiêu tích luỹ tới hôm nay (0 khi chưa bắt đầu; có thể > 100%); thẻ Pace giữ nguyên chữ; (2) ghi chú dưới hàng stat dùng `review.progressNoteOpen` (`Progress and pace for a goal with no end date are measured up to today.`) thay `review.progressNote` (câu cũ nói "toàn bộ thời gian của mục tiêu", sai với goal không có ngày cuối). Khi năm đang xem < năm của `startDate`: vẫn là `review.outsideYear` (`This goal doesn't run in {year}.`) thay ghi chú, mọi ô `outside`. Ô heatmap `outside` của goal này chỉ là ngày trước `startDate`; không có ô `outside` ở phía sau (tới hôm nay là ô tương lai nét đứt như mọi goal). All goals: không đổi (không có Progress/Pace).
  - *error*: tính toán/chunk lỗi → ErrorState `Couldn't load this view` + `Retry`. *offline*: bình thường.
  - *Heatmap — ô*: mức 0–4 (màu `--heat-0..4`), hôm nay có viền đậm, ô tương lai viền nét đứt nhạt, ô `outside` (ngoài khoảng goal, hoặc ngoài năm) kẻ sọc nhạt.
  - *Heatmap — chiều rộng (v3.1, M4-P1a)*: lưới 53 tuần cần ≈ 959 px (845 lưới + 34 cột nhãn thứ + 2 × 16 padding card + 2 × 24 padding `main.wide`), nên **chỉ vừa khít, không cuộn khi vùng nội dung đạt 960 px, tức viewport ≥ 232 (sidebar) + 960 = 1192 px**. Từ 640 đến 1191 px (kể cả 1024–1191 px, nơi sidebar 232 px chỉ chừa 792–959 px) heatmap vẫn cuộn ngang **trong** `.heatmap-scroll`, tự cuộn tới tuần hiện tại khi mở; trang không cuộn ngang. Đây là hành vi đúng (không có ô nào bị cắt ở 1192 px trở lên); không đổi cỡ ô để ép vừa.
  - *Nhãn giá trị trên cột BarChart (v3.1, M4-P1b)*: áp dụng cho **cả hai** biểu đồ cột (12 tuần, 12 tháng), không cho CurveChart. Quy tắc đo được:
    1. **Điều kiện "đủ chỗ"**: `slot = (chartWidth − 38) / số cột ≥ 30 px`, với `chartWidth` = chiều rộng đo được của `.chart` (đúng giá trị đang truyền làm `width` cho Recharts), 38 = trục Y 34 + lề phải 4, số cột = 12. Tương đương `chartWidth ≥ 398 px`. Hệ quả ở viewport: 360, 390, 414 px (xếp dọc, chart = viewport − 64 ≈ 296–350 px) **không** nhãn; từ ≈ 462 px xếp dọc (480 px: 416 px) và 768 px (704 px) **có**; 1024–1100 px (hai chart cạnh nhau, ≈ 332–370 px) **không**; từ ≈ 1156 px (1280 px: ≈ 460 px; 1440 px: ≈ 416 px) **có**. Không đủ chỗ → không vẽ nhãn nào (không vẽ một phần).
    2. **Cột nào có nhãn** (khi đủ chỗ): cột có ≥ 3 phút. Cột 0 phút **không** có nhãn (không có chiều cao, nhãn `0.0` chỉ là nhiễu); cột 1–2 phút cũng không (làm tròn ra `0.0`).
    3. **Định dạng**: số **giờ** (cùng đơn vị với trục Y; trục không ghi đơn vị, đơn vị đã nằm ở tóm tắt và tooltip) **không kèm đơn vị**: `hours = minutes / 60`; `hours < 100` → `f.decimal1` (`en` `2.7`, `vi` `2,7`); `hours ≥ 100` → số nguyên theo `f.number` (`168`, `744`). Tối đa 4 ký tự. Không dấu `+`, không hậu tố.
    4. **Kiểu và vị trí**: chữ SVG 11 px đậm 600, `text-anchor: middle`, đặt trên đỉnh cột (cách 4 px); màu `--text-muted` cho cột thường, `--text` cho cột kỳ hiện tại (cột `--primary`); `aria-hidden` (cả biểu đồ đã `aria-hidden`; số liệu có ở tóm tắt, tooltip và bảng ẩn, nên nhãn **không** thêm vào bảng ẩn). Lề trên của chart ≥ 20 px (hiện 12) để nhãn cột cao nhất không bị cắt. Gợi ý `data-testid="bar-value"` cho mỗi nhãn.
    5. Không đổi: trục, tooltip, tóm tắt SR, bảng ẩn, màu cột. Khi đổi kích thước cửa sổ hoặc xoay màn hình, nhãn hiện/ẩn theo điều kiện 1 ngay (không cần reload).
- **Tương tác:**
  - Bấm hoặc Enter/Space trên ô quá khứ/hôm nay → `#/day/:date`; ô tương lai và `outside` không điều hướng (`aria-disabled="true"`).
  - Bàn phím trên heatmap: một tab-stop (hôm nay, hoặc ô đầu); mũi tên Trái/Phải = tuần trước/sau, Lên/Xuống = ngày trước/sau, Home/End = ngày đầu/cuối năm; chi tiết ở mục 8.
  - Hover/focus ô → tooltip chữ (cùng nội dung accessible name), không chỉ dùng `title`.
  - Mobile **và mọi viewport < 1192 px** (v3.1): vùng heatmap tự cuộn tới tuần hiện tại khi mở.
- **Copy:** `Review`, `Goal`, `All goals`, `Year`, `Time logged`, `Days on target`, `Current streak`, `Longest streak`, `Progress`, `Pace`, `Activity in {year}`, `Less`, `More`, `Last 12 weeks`, `Months of {year}`, `Pick a goal to see progress and pace.`, `{n} days` (`1 day`), pace: `{x} min ahead` / `{x} min behind` / `On pace` (≥ 60 phút: `{h} h {m} min ahead`), phụ đề card: Time logged `In {year}` (một goal thêm `Whole goal: {h} h`), Progress `{minutes} of {total} min`, Pace `Expected {n} min by today`. Heatmap tóm tắt (SR): `In {year} you logged time on {a} days and hit your target on {b} days. Longest streak: {c} days.` Tooltip/label ô: mục 7.5. Nút: `Retry`, `Create a goal`.

### S7 — Settings  (Milestone: M1 [Language + Storage + About]; M2 [Reminders]; M3 [Backup]; **M6 [Account, About mới]; M7 [đồng bộ, D3 đã đăng nhập]; M8 [gợi ý Backup/Storage]**. User story: US-09, US-10, US-11, US-13, US-14, US-15 … US-20)

- **Mục đích:** Chọn ngôn ngữ, **(v2) đăng nhập/đăng xuất và xem trạng thái đồng bộ**, nhắc nhở, backup, thông tin lưu trữ. Primary action: không có (mỗi card có hành động riêng; ở card Account chưa đăng nhập, nút Google là hành động chính của card).
- **Layout:** 5 card xếp dọc (6 card khi cloud được cấu hình), mỗi card có h2. **Thứ tự card cố định: Language → Account (v2, chỉ khi cloud bật) → Reminders → Backup → Storage → About.** Account đứng ngay sau Language vì (a) Language vẫn đứng đầu theo lý do dưới; (b) giờ nhắc và ngôn ngữ giờ "theo tài khoản", nên người dùng thấy trạng thái đăng nhập ngay trước các thiết lập được đồng bộ; (c) card chưa đăng nhập luôn có nút (FR-54) và không cần cuộn nhiều để thấy. Language đứng đầu vì (a) là thiết lập "toàn app" và người dùng lỡ vào nhầm ngôn ngữ cần tìm thấy nó ngay không phải cuộn, (b) tiêu đề card luôn song ngữ `Language / Ngôn ngữ` (cùng một chuỗi ở cả hai bản dịch) nên nhận ra được dù đang ở ngôn ngữ nào. Card chưa có ở milestone nào thì không hiện (M1: Language, Storage, About).

```text
┌ Language / Ngôn ngữ ─────────────────┐ (M1)
│ Choose the language of menus, ...    │  mô tả (theo ngôn ngữ đang chọn)
│ ┌────────────────┬─────────────────┐ │  SegmentedControl 2 lựa chọn (radio group)
│ │  ● English     │   Tiếng Việt    │ │  mỗi nhãn bằng chính ngôn ngữ của nó
│ └────────────────┴─────────────────┘ │
│ hint: ô chọn ngày/giờ, hộp xin quyền theo ngôn ngữ trình duyệt
│ ☁ (đã đăng nhập, M7) Saved to your account ...
├ Account ─────────────────────────────┤ (M6; ẩn khi cloud chưa cấu hình) — chi tiết từng trạng thái bên dưới
│ chưa đăng nhập: lời giải thích         │
│ [ G  Sign in with Google ]             │
│ dòng riêng tư                          │
│ ── hoặc, đã đăng nhập ──               │
│ (M) Minh Test                          │  avatar chữ cái đầu + tên
│     minh.test@example.com              │  email
│ Last synced   today at 14:05           │  (M7)
│ Waiting to sync  0 changes             │  (M7)
│ [Sync now] [Sign out]                  │
├ Reminders ───────────────────────────┤ (M2)
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
- **Component dùng:** PageHeader, LanguageSwitcher (SegmentedControl), Switch, TimeField, StatusChip, Banner, Alert, Button, ImportPreviewDialog (D3), Toast; **(v2)** AccountCard (GoogleSignInButton, Avatar, SyncDetails), SignOutDialog (D4), MergeAccountDialog (D5), SettingsSyncNote, ExportSignInHint, StatusRow/SyncIndicator (ở AppShell).
- **Trạng thái:**
  - *Language* (M1, FR-32 … FR-34): luôn có đúng một lựa chọn được chọn = **ngôn ngữ đang hiển thị** (kết quả `LocaleService.resolve`: lựa chọn đã lưu, nếu chưa có thì ngôn ngữ phát hiện từ trình duyệt). Hai lựa chọn: `English` (`lang="en"`) và `Tiếng Việt` (`lang="vi"`), **hiển thị bằng chính ngôn ngữ của nó ở cả hai chế độ** (nhãn không đổi khi đổi ngôn ngữ). Không có nút Save: chọn là áp dụng ngay. Trạng thái: *default* (một lựa chọn chọn sẵn), *focus* (vòng focus quanh lựa chọn), *hover*, *saving*: ghi kv gần như tức thì nên **không** có spinner; nếu ghi kv lỗi thì giao diện vẫn đổi ngôn ngữ cho phiên này và hiện Alert `settings.language.saveFailed` bên dưới control (lựa chọn không bền qua reload). *Loading/empty*: không áp dụng. *Offline*: không đổi. Chưa từng chọn thì chưa ghi gì vào kv (A-16); mô tả không nêu việc này để khỏi rối.
  - *Reminders*: switch tắt mặc định, giờ `20:00`; khi switch tắt, field giờ bị vô hiệu. **4 trạng thái quyền** (hiển thị bằng StatusChip có chữ + mô tả):
    - `default` → chip `Not asked yet`; mô tả `Turn on the reminder and your browser will ask for permission.`; nút `Allow notifications`.
    - `granted` → chip `Allowed`; mô tả `You'll get one notification a day while 1% Better is open.`
    - `denied` → chip `Blocked`; mô tả `Notifications are blocked for this site. Allow them in your browser's site settings, then come back. You'll still see a reminder banner in the app.`
    - không hỗ trợ → chip `Not supported`; mô tả `This browser doesn't support notifications. You'll still see a reminder banner in the app.`
  - *Backup* (M3): `Last backup: Never` / `Last backup: 2026-10-09`; khi quá 30 ngày hoặc chưa từng và có goal: Banner `It's been {n} days since your last backup.` / `You haven't backed up yet.`; lỗi import hiện Alert (7.3) và không thay đổi dữ liệu (**v3.1:** file đúng kiểu JSON nhưng có giá trị ngoài giới hạn của app → câu riêng `errors.IMPORT_INVALID_SCHEMA_outOfRange`, không dùng câu chung "không giống bản sao lưu"); lỗi Export → Alert `errors.EXPORT_FAILED` (xem Tương tác); *loading* khi đang đọc/ghi file: nút vô hiệu + `Working…`; *success*: toast.
  - *Storage* (M1): `Protected` (persisted = true) — `Your browser won't clear this data automatically.`; `Not protected` — `Your browser may clear this data if the device runs low on space. Install the app (browser menu → Install, or Add to Home Screen) and export a backup now and then.`; không hỗ trợ API → `Unknown` + `Your browser doesn't report storage protection. Export a backup now and then.`
  - *offline*: chip Offline chung (đã đăng nhập: SyncIndicator); không đổi gì khác.
  - **(v2) Card Account** (M6 trở đi; **không render** khi `AuthState = unavailable`, tức cloud chưa cấu hình — FR-38, và khi đó cũng không có D4/D5/SyncIndicator/banner/hint nào). Một card, 10 trạng thái (A1 … A10); bảng dưới là hợp đồng giao diện, mockup `09-account.html` là hình dung:

| # | Trạng thái (`AuthState` + `SyncStatus`) | Nội dung card | Ghi chú / MS |
| :- | :- | :- | :- |
| A1 | `signed-out`, online | Lời giải thích `settings.account.descSignedOut`; **nút Google** `Sign in with Google`; dòng riêng tư `settings.account.privacyNote` (`.hint`) | Luôn có (FR-54), **không** có "Not now". M6 |
| A2 | `signed-out`, offline | Như A1 nhưng nút Google `disabled`, thêm dòng `settings.account.offlineHint` nối bằng `aria-describedby` | M6 |
| A3 | `signing-in` | Dòng trạng thái `settings.account.signingInStatus` có vòng xoay + `settings.account.signingInBody`; nút Google thay bằng bản `disabled` ghi `Signing in…` | Xuất hiện cả khi vừa bấm (trước khi rời app) và khi quay lại từ Google đang đổi code. M6 |
| A4 | `signed-out` + `lastError` (`AUTH_CANCELLED` / `AUTH_FAILED`) | Alert danger (`role="alert"`) với `errors.AUTH_*` + nút `Dismiss` ghost, **trên** lời giải thích; nút Google vẫn dùng được ngay | Bấm Google lần nữa hoặc `Dismiss` xoá lỗi. Ở màn khác Settings: toast ngắn `toast.signInCancelled` / `toast.signInFailed` + nút `settings.account.goTo` (7.2). M6 |
| A5 | `signed-in`, idle, `pending = 0` | Avatar + tên + email + `settings.account.provider`; `dl`: `Last synced` / `Waiting to sync = 0 changes`; dòng `settings.account.syncedInfo` (`.hint`); nút `Sync now` (secondary) + `Sign out` (secondary) | Chưa có M7: chỉ avatar/tên/email/provider + `Sign out` (M6) |
| A6 | `signed-in`, `syncing` | Như A5; `Sync now` `aria-disabled`, nhãn `Syncing…` | M7 |
| A7 | `signed-in`, `pending > 0` (online hoặc offline) | Như A5, `Waiting to sync = N changes`; offline: `Sync now` `disabled` + dòng `settings.account.offlineSync` | M7 |
| A8 | `signed-in`, `error` (`SYNC_OFFLINE` / `SYNC_UNREACHABLE`) | Như A5 + Alert danger `errors.SYNC_*` + dòng `Trying again at {time}.` (`nextRetryAt`); `Sync now` bấm được (bỏ qua backoff) | M7. Không có Alert nếu chỉ offline (A7) |
| A9 | `signed-in`, idle nhưng có hàng bị bỏ: từ cloud (`SYNC_REMOTE_INVALID`) **và/hoặc** hàng trên máy bị cloud từ chối (`dirty = 2`, ADR-28) | Như A5 + dòng thông tin (icon info, `--text-muted`) mang `data-reason`: `remote` (chỉ hàng từ cloud bị bỏ) → `errors.SYNC_REMOTE_INVALID`; `local` (chỉ hàng trên máy bị từ chối) → `settings.account.localRejected_*` (`{{count}}` = số hàng); `both` → **hai dòng**, `localRejected_*` trước rồi `SYNC_REMOTE_INVALID`. **Không** đổi chỉ báo (vẫn `Synced`), không đếm vào "Waiting to sync" | M7 (`remote`); M8 (`local`, `both`; copy chốt ở v3.1, mục 7.7.1) |
| A10 | `expired` | Alert info (`role="status"`) `settings.account.expiredTitle` + `errors.AUTH_SESSION_EXPIRED` + dòng `Account: {email}`; nút Google `Sign in with Google` + `Sign out`; **không** có `Sync now`, `dl` | Dữ liệu cục bộ giữ nguyên. M6 (chỉ báo: M7) |

**Loading** (SDK đang nạp khi có phiên lưu sẵn): hiện ngay A5 với email/tên đã lưu (`sync.account`), `Sync now` bị vô hiệu, **không** hiện A1 rồi đổi (tránh nháy). **Empty**: không áp dụng. **Quyền**: mỗi thiết bị một tài khoản (A-22); không có phân quyền khác.
  - **(v2) Ghi chú "theo tài khoản của bạn"** (M7): khi `signed-in`, card **Language** và **Reminders** có thêm một dòng `.hint` đầu bằng icon đám mây-dấu-tích (`settings.language.syncNote` / `settings.reminders.syncNote`) nói giá trị này lưu vào tài khoản và áp cho thiết bị khác; chưa đăng nhập hoặc hết phiên: **không** hiện (không nhắc đăng nhập ở đây, tránh lặp). Khi một thiết lập được áp từ cloud: ngôn ngữ đổi tại chỗ, switch/giờ nhắc cập nhật ngay, toast `toast.prefsFromAccount`. Nếu nhắc được bật từ cloud mà thiết bị này chưa có quyền notification (`default`): chip `Not asked yet`, mô tả `settings.permission.defaultOnDesc`, nút `Allow notifications` (không tự xin quyền).
  - **(v2) Backup / Storage / About theo trạng thái** (copy ở 7.7.5):

| Thành phần | Cloud tắt | Cloud bật, chưa đăng nhập (và hết phiên) | Đã đăng nhập |
| :- | :- | :- | :- |
| Backup — mô tả | `settings.backup.desc` (như v1.1) | `settings.backup.descSignedOut` (M8) | `settings.backup.descSignedIn` (M7) |
| Backup — hint dưới nút | `settings.backup.importHint` | như cột trái | `settings.backup.importHintSignedIn` |
| Backup — sau Export | toast `Backup exported` | toast + **ExportSignInHint** (M8; tối đa 1 lần/30 ngày; **chỉ khi đang online lúc Export**, v3.1; không khi hết phiên) | toast |
| Storage "Not protected" | `settings.storage.notProtectedDesc` | + câu `settings.storage.notProtectedSignIn` và nút `Go to Account` (M8) | như cột trái (không gợi ý) |
| About — mô tả | `settings.about.desc` (như v1.1: "No account, no tracking") | `settings.about.descCloud` + `settings.about.privacy` (M6) | `settings.about.descSignedIn` + `settings.about.privacy` (M6) |
| About — liên kết chính sách (v3.1, M6-P1a) | **Có** (`settings.about.privacyLink`, M6 D8) | có | có |

- **Tương tác:**
  - *Language*: bấm/chạm một lựa chọn, hoặc dùng mũi tên Trái/Phải (radio group), Space chọn → `LocaleService.set` ghi kv, `i18next.changeLanguage`, `<html lang>`, `document.title` đổi **đồng bộ trong cùng khung hình**; toàn bộ chữ trên trang (kể cả h1 `Settings` → `Cài đặt`, tab bar, mô tả card, mọi card khác) đổi tại chỗ. Focus **giữ nguyên** trên lựa chọn vừa chọn (không nhảy về h1, không reload, không cuộn). Hiện toast `toast.languageChanged` bằng ngôn ngữ **mới** (`role="status"` để người dùng trình đọc màn hình nghe được rằng ngôn ngữ đã đổi). Chọn lại lựa chọn đang chọn: không làm gì, không toast. Toast, banner, form đang hiển thị ở màn khác sẽ dùng ngôn ngữ mới khi quay lại.
  - Switch → lưu ngay, lần đầu bật khi quyền `default` gọi `Notification.requestPermission()` đúng 1 lần; đổi giờ → lưu ngay (onBlur/onChange hợp lệ), toast `Reminder time saved`. `Allow notifications` → xin quyền. `Add reminder to calendar (.ics)` → tải `1percent-better-reminder.ics`, toast `Calendar file downloaded`. `Export backup (JSON)` → tải file, toast `Backup exported`. `Import backup…` → hộp chọn file → parse → D3 (hoặc Alert lỗi).
  - **(v2) Account:** `Sign in with Google` → F9 (`returnTo = #/settings`; nút → `Signing in…`; điều hướng sang Google). `Dismiss` (Alert lỗi) → xoá lỗi, focus về nút Google. `Sync now` → `syncNow('manual')`: nút `Syncing…`; thành công → chỉ báo `Synced`, toast `toast.syncNowDone`; lỗi → Alert A8 (không toast). `Sign out` → mở D4 (focus ban đầu: lựa chọn Keep). Mọi nút trong card ≥ 44 px, thứ tự Tab: nút Google (hoặc `Sync now`, `Sign out`).
  - **(v2) Sau khi quay về từ Google** (callback): app render `#/settings` ngay, focus vào `<h1>` như mọi lần đổi route; card ở A3 rồi A5 (hoặc A4); toast `toast.signedIn` (`role="status"`) cho người dùng screen reader. **Không** tự chuyển focus vào card, **không** cuộn.
  - **(v2) Sau khi đóng D4 bằng "Sign out":** card chuyển sang A1, focus về **h2 "Account"** của card (`tabindex="-1"`), toast `toast.signedOutKept` / `toast.signedOutRemoved`.
  - **(v2) Storage:** `Go to Account` cuộn tới card Account và focus nút Google (không đổi route, không dùng hash).
  - **(v2) Export** (M8): sau khi tải xong, nếu `claimExportHint` thắng → ExportSignInHint xuất hiện **dưới** hai nút Export/Import (không lấy focus, không `role="alert"`; toast `Backup exported` đã đủ để SR biết việc đã xong). Nút trong hint = nút Google với `returnTo = #/settings`. **(v3.1, A-44)** `claimExportHint` chỉ được gọi khi đang online lúc Export thành công; offline → không hint, không tiêu lượt. `claimExportHint` ném lỗi → bỏ qua hint (không Alert, không toast lỗi; `console.warn`), việc Export vẫn là thành công.
  - **(v3.1, M10) Export thất bại** (`backupService.export` lỗi: đọc IndexedDB hỏng, không tạo được tệp): Alert danger `role="alert"` `errors.EXPORT_FAILED` hiện trong card Backup, **đúng vị trí Alert lỗi import** (dưới `settings.backup.importHint` và ExportSignInHint nếu có; **một Alert tại một thời điểm**: lần Export hoặc Import kế tiếp xoá Alert cũ trước khi chạy). Không toast "Backup exported", không tải tệp, không hint, "Last backup" không đổi, nút `Export backup (JSON)` về trạng thái bình thường (hết `Working…`) và dùng lại được; không có nút `Dismiss` (Alert tự mất ở lần thao tác Backup kế tiếp, giống lỗi import). Không lấy focus (người dùng đang đứng ở nút Export; `role="alert"` đã đủ để SR đọc).
- **Copy:** `Settings`; card `Language / Ngôn ngữ` (cùng một chuỗi ở `en` và `vi`), mô tả `Choose the language of menus, messages and dates. Your own goal names and notes stay as you wrote them.`, lựa chọn `English` / `Tiếng Việt`, hint `The date and time pickers and permission prompts follow your browser's language.`, toast `Language changed`; card `Reminders`, `Backup`, `Storage`, `About`; `Daily reminder`; mô tả switch `Get a nudge when you haven't hit your targets today.`; `Reminder time`; `Notification permission`; giới hạn: `Heads up: reminders are sent only while 1% Better is open (in a tab or an installed window, even in the background). To be reminded when the app is closed, add a daily event to your calendar.`; iOS: `On iPhone or iPad, notifications work only after you add this app to your Home Screen (iOS 16.4 or later).`; `Add reminder to calendar (.ics)`; phụ `Adds a repeating daily event at {time}.`; Backup mô tả `Your data lives only on this device. Export a backup now and then, or to move to another device.` và `Importing replaces everything currently on this device.`; nút `Export backup (JSON)`, `Import backup…`; About: `1% Better per Day` / `Everything you log stays on this device. No account, no tracking.`
- **D3 — Import preview dialog** (M3): tiêu đề `Replace all data?`; nội dung `This backup has {5 goals, 23 entries}, exported {2026-10-09}. Importing replaces everything currently on this device ({a goals, b entries}). This can't be undone.`; nút `Replace all data` (danger), `Cancel` (focus ban đầu ở `Cancel`). Pluralization: `1 goal`, `1 entry`.
- **(v2) Copy mới của S7** ở 7.7 (Account: 7.7.1; Backup/Storage/About/ghi chú: 7.7.5). Chuỗi cũ không đổi.
- **(v3.1) Liên kết chính sách quyền riêng tư** (cuối card About, **luôn hiện, cả khi cloud tắt**; M6 D8): một `<a>` thường (không phải nút) trong `.hint`, chữ `settings.about.privacyLink`, trỏ tới `privacy.html` cùng origin (`BASE_URL + 'privacy.html'`), mở **cùng tab** (trang tĩnh đó có sẵn liên kết "Better per Day" quay về app, nên không cần tab mới và không có "(opens in a new tab)"). Đứng dưới dòng `settings.about.privacy` (khi cloud bật). Vùng chạm cao ≥ 44 px (`display: inline-flex; align-items: center; min-height: var(--tap)`), gạch chân luôn hiện, màu `--primary` (≥ 4.5:1 trên `--surface`). Nếu bản đã ship dùng kiểu link khác nhưng vẫn đạt axe và có focus nhìn thấy thì chấp nhận (không phải tiêu chí M10-AC11).
- **D3 — biến thể đã đăng nhập** (M7, FR-51): cùng cấu trúc và cùng nút như D3, khác chữ. Tiêu đề `Replace data on all your devices?`; thân `This backup has {goals}, {entries}, exported {date}. Importing replaces everything currently on this device ({curGoals}, {curEntries}) and, once synced, everything in your account too — so it changes your other devices as well. This can't be undone.` Nếu đang offline thêm một dòng riêng `You're offline, so the change will reach your account when you're back online.` Nút `Replace all data` (danger, cùng key `import.confirm`), `Cancel` (focus ban đầu). Chọn biến thể theo `AuthState.kind === 'signed-in'`; `expired` dùng D3 chuẩn.
- **D4 — Sign out dialog** (`SignOutDialog`; M6, cảnh báo chưa đồng bộ M7; FR-41). `<dialog>` + `showModal()`, bottom sheet < 640 px, hộp giữa 480 px từ 640 px; nội dung cuộn, hàng nút dính đáy (3.5).

```text
┌ Sign out? ───────────────────────────────────────┐
│ You'll stop syncing on this device. Your data in │
│ your account stays safe.                         │
│ (M7, chỉ khi pending > 0)                        │
│ ┌─ ⓘ 2 changes haven't synced to your account yet. │  khối cảnh báo, nền --info-soft
│ │  We'll try to sync before signing you out.      │  (offline: câu khác — xem 7.7.2)
│ └───────────────────────────────────────────────┘ │
│ What should happen to the data on this device?   │  legend
│ (•) Keep data on this device                     │  radio, mặc định + focus ban đầu
│     Recommended. You can keep using 1% Better…   │
│ ( ) Remove data from this device                 │
│     Deletes your goals, entries and reminder …   │
│ ┌ (hiện khi chọn Remove và pending > 0) ────────┐ │  role="status"
│ │ If you remove the data from this device, …    │ │
│ └───────────────────────────────────────────────┘ │
│ [Sign out]                       [Cancel]        │  Remove: [Sign out and remove data] (danger)
└──────────────────────────────────────────────────┘
```
  - *Mặc định:* lựa chọn **Keep** được chọn **và có focus** khi mở (khác D2/D3 vì lựa chọn mặc định là phương án an toàn). Nút xác nhận là `primary` khi Keep; đổi thành `danger` + nhãn `Sign out and remove data` khi chọn Remove. `Cancel`/Esc/click backdrop = đóng, không làm gì.
  - *Busy:* sau khi xác nhận, hai nút và radio bị vô hiệu, nhãn nút xác nhận `Signing out…`, `aria-busy="true"` (tối đa ≈ 10 s nếu đang đồng bộ lần cuối). Dialog không đóng cho tới khi xong.
  - *Cảnh báo chưa đồng bộ* (M7): chỉ khi `pending > 0`. Online: `auth.signOut.unsynced` + `auth.signOut.unsyncedOnline`. Offline: `auth.signOut.unsynced` + `auth.signOut.unsyncedOffline`. Chọn Remove (cả online lẫn offline): thêm khối `role="status"` `auth.signOut.unsyncedRemove`.
  - *Hàng trên máy bị cloud từ chối* (M8 → v3.1 chốt copy, ADR-28, `rejected > 0`; **đếm tươi mỗi lần mở D4**, không phụ thuộc `pending`): cùng khối cảnh báo (nền `--info-soft`, DOM `unsynced-warning` + `data-rejected`) hiện khi `pending > 0` **hoặc** `rejected > 0`. Thứ tự đoạn trong khối: (1) nếu `pending > 0`: `auth.signOut.unsynced_*` + dòng online/offline như trên; (2) nếu `rejected > 0`: `auth.signOut.rejected_*` + `auth.signOut.rejectedKeep`. Mô tả lựa chọn **Remove** đổi từ `auth.signOut.removeDesc` sang `auth.signOut.removeDescRejected` (vì `removeDesc` nói "Your account keeps everything", sai với các hàng này). Chọn Remove: vùng `role="status"` hiện thêm `auth.signOut.rejectedRemove` (cùng lúc với `unsyncedRemove` nếu `pending > 0`, `rejectedRemove` ở dưới). Các hàng này **không** làm dialog giữ mở và không đổi nhãn nút (đồng bộ lần cuối không thể đẩy chúng; Alert `syncFailed`/`Remove anyway` chỉ vì `pending`). Keep: không đổi hành vi, hàng vẫn nằm trên máy.
  - *Đồng bộ lần cuối lỗi + đang chọn Remove* (M7): dialog **ở lại**, hiện Alert `role="alert"` `auth.signOut.syncFailed`, nhãn nút đổi thành `Remove anyway` (danger); người dùng có thể đổi sang Keep, Cancel, hoặc xác nhận lần nữa (xem OQ-D10). Với Keep, lỗi đồng bộ không chặn đăng xuất (thay đổi vẫn nằm trên máy, F10).
  - *Lỗi xoá dữ liệu cục bộ* (hiếm): Alert `errors.WRITE_FAILED` trong dialog, dialog giữ mở.
- **D5 — Merge account dialog** (`MergeAccountDialog`; M7; FR-47). Hiện đúng một lần sau khi đăng nhập khi thiết bị từng gắn tài khoản **khác** và còn dữ liệu cục bộ; đồng bộ tạm dừng cho tới khi chọn.

```text
┌ Add this device's data to your account? ─────────┐
│ This device still has 6 goals, 25 entries from   │
│ another account. If you continue, they'll be     │
│ added to the account minh.test@example.com, next │
│ to what's already there.                         │
│ Cancel signs you out. Nothing is uploaded.       │  .hint
│ [Add to account]                    [Cancel]     │  focus ban đầu: Cancel
└──────────────────────────────────────────────────┘
```
  - Nút `Add to account` (primary), `Cancel` (secondary, **focus ban đầu**). Esc = `Cancel`. `Cancel` = đăng xuất giữ dữ liệu (không xoá, không đẩy gì), toast `toast.signedOutKept`. Số `{goals}`, `{entries}` đếm bản ghi **còn sống** trên máy (`format.goalsCount`/`entriesCount`). Dialog không chặn khi offline (xác nhận chỉ đánh dấu để đẩy lên khi có mạng).
  - Sau `Add to account`: StatusRow `Syncing…` rồi `Synced`; toast `toast.mergeDone`.

### S7 (tiếp, v5.0) — Biến thể native, Sign in with Apple, Delete account, D6  (Milestone: M12 [biến thể native], M14 [Apple, Delete account, D6], M15 [Reminders native, link About]. User story: US-22 … US-26; FR-58, FR-60 … FR-63)

- **Mục đích:** Không có màn hình hay card mới. Settings giữ nguyên **thứ tự card** (Language → Account → Reminders → Backup → Storage → About) và bố cục; phase 6 chỉ (1) đổi **chữ** của vài card trên app native, (2) thêm **nút Apple** vào mọi chỗ có nút Google trên iOS, (3) thêm khối **Delete account** + **D6** vào card Account (web và native), (4) thêm hai link About. Primary action của card Account chưa đăng nhập vẫn là nút đăng nhập; trên iOS có **hai** nút ngang hàng (Apple trên, Google dưới), cả hai là hành động chính của card.
- **Cách chọn biến thể:** UI chỉ đọc `capabilities` (ARCH §5.12), không import integration. "native" dưới đây = `capabilities.platform !== 'web'`. Bảng kiểm kê đầy đủ (chuỗi web → chuỗi native, điều kiện, milestone) ở **7.8.1**; điều kiện thêm: nút Apple ⇔ `capabilities.appleSignIn`; Reminders lên lịch trước ⇔ `capabilities.scheduledNotifications`; không `UpdateToast` ⇔ `capabilities.serviceWorker === false`; không `settings.reminders.ios` và không "Install the app" ⇔ `capabilities.pwaHints === false`.

**Settings trên native — từng card** (chỉ nêu phần khác bản web; card không nêu = giống hệt)

| Card | Native M12 … M14 (`scheduledNotifications = false`) | Native M15 (`scheduledNotifications = true`) |
| :- | :- | :- |
| Language | hint dưới control = `settings.language.nativeNote` (thay `browserNote`) | như M12 |
| Account | **ẩn** (`AuthState = unavailable`, M12 … M13) → hiện từ M14 với nút Apple + Google (xem dưới) | như M14 |
| Reminders | switch + giờ như web; chip quyền = `Not supported` + `settings.permission.nativeUnsupportedDesc` (WKWebView không có `Notification`); khung `limit` ("chỉ khi app mở") **còn**; **không** có `settings.reminders.ios`; nút `.ics` **còn** (đi qua share sheet) | `settings.reminders.nativeSwitchDesc` thay `switchDesc`; chip quyền 3 trạng thái (`Not asked yet` / `Allowed` / `Blocked`) + mô tả native; nút `Allow notifications` khi `Not asked yet`; khung `limit` thay bằng **`settings.reminders.nativeInfo`**; **bỏ** nút `.ics` và `icsHint`; **không** có `settings.reminders.ios` |
| Backup | thêm `settings.backup.shareHint` dưới hai nút; banner "chưa sao lưu" dùng `backup.banner.neverNative`; Alert export lỗi dùng `errors.EXPORT_FAILED_native`; Export huỷ ở share sheet = im lặng | như M12 |
| Storage | nhãn `settings.storage.nativeLabel`, chip trung tính `settings.storage.nativeChip`, mô tả `settings.storage.nativeDesc`; nếu cloud bật + chưa đăng nhập thêm `notProtectedSignIn` + nút `Go to Account` (như web "Not protected") | như M12 |
| About | `settings.about.descNative` khi tài khoản `unavailable`; từ M14 dùng `descCloud`/`descSignedIn` như web; link `Privacy policy` mở trong Safari | thêm link `settings.about.supportLink`; cả hai link có chữ ẩn `a11y.opensExternal` |

**Card Account trên iOS (M14).** Thứ tự dọc cố định; Apple **luôn ở trên** Google; hai nút cùng chiều rộng (đầy card), cùng cao 44 px, cách nhau 12 px:

```text
┌ Account ─────────────────────────────────────────┐   A1 · chưa đăng nhập, online
│ Sign in with Apple or Google to keep a copy of   │   settings.account.descSignedOutIos
│ your goals and entries in your account and use   │
│ them on all your devices. You don't need an …    │
│ [  Sign in with Apple               ]            │   AppleSignInButton: đen (sáng) / trắng (tối)
│ [G Sign in with Google              ]            │   GoogleSignInButton (như phase 2)
│ From Google or Apple, the app only receives      │   .hint  settings.account.privacyNoteIos
│ your name and email.                             │
│ If you choose Hide My Email, Apple gives you a   │   .hint  settings.account.hideEmailNote
│ private address and you get a separate account … │
└──────────────────────────────────────────────────┘
```

| # | Khác biệt so với bản web (A1 … A10) |
| :- | :- |
| A1 | Mô tả `descSignedOutIos`; hai nút; hai `.hint` (`privacyNoteIos`, `hideEmailNote`) thay `privacyNote`. Không có "Not now" |
| A2 (offline) | **Cả hai** nút `disabled`; dòng `settings.account.offlineHint` nối `aria-describedby` cho cả hai |
| A3 (signing-in) | Nút vừa bấm hiện `auth.signingIn` + `aria-busy`; nút còn lại `disabled`; dòng trạng thái như web |
| A4 (lỗi) | Alert như web; với `AUTH_FAILED` dùng **`errors.AUTH_FAILED_native`** (bản web nói "cùng trình duyệt", sai trên app); `AUTH_CANCELLED` giữ nguyên chữ. Cả hai nút dùng lại ngay |
| A5 … A9 (đã đăng nhập) | Dòng nhà cung cấp: `settings.account.providerApple` (identity chỉ có Apple), `provider` (chỉ Google), `providerBoth` (cả hai). Email có thể là địa chỉ relay `…@privaterelay.appleid.com`, hiển thị nguyên văn. Thêm **khối Delete account** dưới hàng `Sync now` / `Sign out` (xem dưới) |
| A10 (hết phiên) | Alert info như web; hàng nút: Apple, Google, `Sign out` (xếp dọc, Apple trên cùng); khối Delete account hiện nhưng **vô hiệu** + `settings.account.deleteExpired` |

**Khối Delete account** (web và native, từ M14; chỉ khi `AuthState = signed-in` hoặc `expired`; không có ở A1 … A4):

```text
│ [Sync now] [Sign out]                          │
│ ─────────────────────────────────────────────  │   đường kẻ `--border`, cách trên 16 px
│ Permanently deletes your account and everything │   .hint  settings.account.deleteDesc
│ stored in it. This can't be undone.             │
│ [ Delete account ]                              │   Button `danger-ghost`: chữ + viền 1 px `--danger`, nền trong
│ You're offline. Connect to the internet to …    │   (chỉ khi disabled) settings.account.deleteOffline / deleteExpired
```

- Trạng thái nút: *default* (bấm được), *offline* → `disabled` + `aria-describedby` trỏ dòng lý do (hiện luôn), *expired* → `disabled` + dòng `deleteExpired`, *syncing / pending* → bấm được (D6 sẽ tạm dừng đồng bộ). Nút không bao giờ ẩn khi `signed-in`.
- Tương tác: bấm → mở **D6**; focus ban đầu ở `Cancel`. Đóng D6 không xoá → focus về nút `Delete account`.

**D6 — Delete account dialog** (`DeleteAccountDialog`; M14; FR-61). `<dialog>` + `showModal()`, bottom sheet < 640 px, hộp giữa 480 px từ 640 px; nội dung cuộn, hàng nút dính đáy (3.5, 3.6).

```text
┌ Delete your account? ─────────────────────────────┐
│ This permanently deletes your account and all the │  auth.delete.body
│ goals, entries and settings stored in it. It can't│
│ be undone. Other devices signed in to this account│
│ will need to sign in again.                       │
│ Account: minh.test@example.com                    │  auth.delete.account (.hint, email nguyên văn)
│ ┌ⓘ You use Sign in with Apple, so iOS will ask … ┐│  auth.delete.appleNote — CHỈ khi iOS + có identity Apple
│ └────────────────────────────────────────────────┘│
│ What should happen to the data on this device?    │  legend
│ (•) Remove data from this device                  │  MẶC ĐỊNH (OQ-16)
│     Deletes the goals, entries and reminder …     │
│ ( ) Keep data on this device                      │
│     You can keep using 1% Better without an …     │
│ ┌⚠ (lỗi) Couldn't delete your account just now …┐ │  Alert role="alert", chỉ khi có lỗi
│ └────────────────────────────────────────────────┘│
│ [Delete account]                    [Cancel]      │  nút xác nhận `danger`; Cancel `secondary`
└───────────────────────────────────────────────────┘
```

  - *Mặc định:* lựa chọn **Remove** được chọn sẵn (OQ-16: ý định "xoá tài khoản" mặc định là xoá hết; người dùng chọn Keep nếu muốn giữ). **Focus ban đầu ở `Cancel`** (khác D4: hành động phá huỷ không được nằm cách một cú Enter). Esc, click backdrop = `Cancel`. Thứ tự Tab: radio Remove → radio Keep → `Delete account` → `Cancel`.
  - *Nút xác nhận:* luôn `Delete account` (`auth.delete.confirm`), kiểu `danger` (đỏ) ở **cả hai** lựa chọn (cả hai đều xoá tài khoản).
  - *Có Apple:* khi `capabilities.appleSignIn` và `session.providers` chứa `apple`, hiện khối `auth.delete.appleNote` (nền `--info-soft`, icon info) **trên** legend. Bấm xác nhận → bảng Sign in with Apple của iOS (ngoài app) trước khi D6 chuyển sang busy; huỷ bảng → `ACCOUNT_DELETE_CANCELLED`.
  - *Busy:* sau khi xác nhận (và sau bước Apple nếu có): nút xác nhận hiện vòng xoay + `auth.delete.working`, `aria-disabled="true"` (giữ focus), `Cancel` và hai radio `disabled`, `aria-busy="true"` trên dialog, **Esc và click backdrop bị bỏ qua**; vùng `role="status"` luôn có trong DOM nhận `auth.delete.workingStatus`. Tối đa 20 s (timeout của function).
  - *Lỗi:* Alert `role="alert"` ngay trên hàng nút, **D6 ở lại mở**, nút xác nhận và radio dùng lại được (bấm lần nữa = thử lại), focus ở nút xác nhận. Bốn lỗi: `errors.ACCOUNT_DELETE_OFFLINE`, `errors.ACCOUNT_DELETE_CANCELLED`, `errors.ACCOUNT_DELETE_FAILED`, `errors.ACCOUNT_DELETE_SESSION_EXPIRED` (7.8.3). `SESSION_EXPIRED`: người dùng đóng D6 thì card đã sang A10; không có nút "Sign in" riêng trong D6.
  - *Thành công:* D6 đóng; card về A1; toast `toast.accountDeletedRemoved` (đã chọn Remove) hoặc `toast.accountDeletedKept` (chọn Keep) — một toast; focus về **h2 "Account"** (`tabindex="-1"`). Nếu `appleRevoked = 'manual-required'` và tài khoản có Apple: hiện **panel thu hồi** (dưới).
  - *Offline giữa chừng* (mất mạng sau khi mở D6): bấm xác nhận → `ACCOUNT_DELETE_OFFLINE`; D6 không tự đóng.

**Panel hướng dẫn tự thu hồi Apple** (`AppleRevokePanel`; M14; A-62). Khối thông tin (nền `--info-soft`, chữ `--info`, icon info, **không** `role` live) nằm **ngay dưới h2 "Account"** của card ở A1, chỉ hiện sau lần xoá mà function trả `manual-required` và tài khoản đã xoá có identity Apple:

```text
┌ⓘ One more step for Apple ──────────────────────────────┐   auth.delete.revokeTitle (đậm)
│ Your account is deleted, but Apple may still list 1% Better │   auth.delete.revokeBody
│ under Sign in with Apple. To remove it, open Settings on …  │
│ [See Apple's instructions ↗]   [Dismiss]                    │   link tới https://support.apple.com/102571; common.dismiss
└─────────────────────────────────────────────────────────┘
```

  - Link: `<a href="https://support.apple.com/102571" target="_blank" rel="noopener">` + chữ ẩn `a11y.opensExternal`, cao ≥ 44 px, gạch chân luôn hiện. `Dismiss` (ghost) ẩn panel; focus về h2 "Account".
  - Panel sống trong bộ nhớ của phiên chạy app (không lưu bền): ở lại khi người dùng đổi tab rồi quay lại Settings cho tới `Dismiss` hoặc tải lại app (A-D65). Toast thành công vẫn hiện như thường.
  - Xoá từ bản web (không lấy được code) cho tài khoản có Apple cũng hiện panel (cùng chữ: "open Settings on your iPhone…").

### S10 — Launch screen (app native)  (Milestone: M13. FR-64)

- **Mục đích:** Thay màn trắng của WKWebView trong lúc app khởi động; không phải route, không có chữ, không tương tác.
- **Layout:** toàn màn hình, logo ở chính giữa; `LaunchScreen.storyboard` + `Splash.imageset` (mục 5 "Native shell" có kích thước, màu, tệp).

```text
 Sáng (#F7F6F2)                       Tối (#121513)
┌────────────────────┐              ┌────────────────────┐
│                    │              │                    │
│    1° ↗            │              │   ┌────────────┐   │
│    BETTER          │   (logo)     │   │ logo trên  │   │   ô trắng bo góc (đúng brand mark)
│                    │              │   └────────────┘   │
└────────────────────┘              └────────────────────┘
```

- **Trạng thái:** chỉ default. Ẩn bằng `SplashScreen.hide()` **một lần** sau lần render đầu của React (dự phòng tự ẩn sau 3 s); không có spinner, không có chữ "Loading". Theo theme hệ điều hành ở lúc khởi động.
- **Tương tác:** không có.

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
- **Ngôn ngữ:** vì không đọc được kv, màn này (và ErrorBoundary khi lỗi xảy ra trước khi biết ngôn ngữ đã lưu) dùng ngôn ngữ **phát hiện từ `navigator.language`** (FR-33). Không có control đổi ngôn ngữ ở màn này (không có nơi lưu); các bước 1–3 hiển thị bằng thẻ `<ol>`, số thứ tự do trình duyệt vẽ (chuỗi i18n **không** chứa "1.", "2.", "3.").
- **Copy:** (bản `en`; `vi` ở mục 7.6)
  - StorageError: `Can't open local storage` / `1% Better keeps your data in your browser's storage, and it isn't available right now. This often happens in private or incognito windows, or when site data is blocked in browser settings. Nothing has been changed.` / bước: `1. Open the app in a regular (non-private) window.` `2. Allow site data and cookies for this site in your browser settings.` `3. Reload the page.` / nút `Try again`.
  - ErrorBoundary: `Something went wrong` / `The app ran into an unexpected problem. Your data is still stored on this device.` / nút `Reload app`, `Go to Today`.

---

## 5. Component

Tất cả là component React thuần dùng CSS custom properties của mục 6 (không dùng Tailwind/MUI: `ARCHITECTURE.md` không chọn UI framework). Tên component bám cấu trúc `src/ui/components/` trong ARCH §6.

| Component | Mục đích | Props / biến thể | Trạng thái | Dùng ở (milestone) |
| :- | :- | :- | :- | :- |
| `AppShell` | Khung: skip link, tab bar (< 1024) / sidebar (≥ 1024), vùng `<main id="main">`, vùng Toast, **StatusRow** (OfflineChip hoặc SyncIndicator, 3.1) | `activeTab` | tab active, offline, (v2) đã đăng nhập | tất cả (M1; tab Review từ M4; StatusRow đồng bộ M7) |
| `PageHeader` | `<h1>` + mô tả + vùng action | `title`, `subtitle?`, `actions?`, `back?` | — | tất cả |
| `Button` | Hành động | `variant`: primary / secondary / ghost / danger / danger-ghost; `size`: md (44 px) / sm (44 px cao, padding nhỏ); `full` | default, hover, active, focus-visible, disabled, `aria-disabled`, busy | tất cả (M1) |
| `IconButton` | Edit/Delete entry (icon + `aria-label`) | `icon`, `label` | như Button; vùng chạm 44×44 | Today, Day (M1) |
| `TextField` / `NumberField` / `TextArea` / `DateField` / `TimeField` | Field có label | `label`, `hint?`, `error?`, `counter?`, `required?`, `suffix?` | default, focus, filled, error (`aria-invalid`), disabled | Goal form, EntryForm, Day, Settings (M1) |
| `SegmentedControl` / `RadioGroup` | Chọn 1 trong ít lựa chọn | `legend`, `options`, `value`; **(v4.0)** `options[].disabled?`, `options[].describedBy?` + dòng mô tả `.hint` thụt lề 30 px dưới lựa chọn | default, selected, focus, disabled (**v4.0:** chữ `--text-muted` giữ tương phản ≥ 4.5:1, kèm ghi chú luôn hiện; xem S3 và 8.2) | Goal form (M1; radio "No end date" M11), Goal detail Range (M5) |
| `Select` | Chọn Goal/Year | `label`, `options` | default, focus, disabled | Review (M4) |
| `Switch` | Bật/tắt (role switch) | `label`, `description?`, `checked` | on, off, focus, disabled | Settings (M2) |
| `LanguageSwitcher` | Chọn `en` / `vi` (dựng trên `SegmentedControl`/radio group; áp dụng ngay, không nút Save) | `value: 'en' \| 'vi'`, `onChange`; mỗi lựa chọn có `lang` riêng và nhãn endonym `English` / `Tiếng Việt` | default (1 lựa chọn đang chọn), hover, focus-visible, error (Alert khi ghi kv lỗi) | Settings card Language (M1) |
| `Badge` / `StatusChip` | Nhãn trạng thái luôn có chữ | tone: success / info / neutral / warning | — | Goals, Goal detail, Settings, EntryRow nguồn (M1) |
| `PlusOnePill` | Chỉ báo "+1%" khi đạt chỉ tiêu | `animate?` (M5, đúng 1 lần) | static, entering (≤ 240 ms, tắt khi reduced-motion) | GoalCard, Day (M1; animate M5) |
| `ProgressBar` | Tiến độ hôm nay | `value`, `max`, `label` (`role="progressbar"`) | 0, partial, full (tối đa 100 %) | GoalCard, StatCard (M1) |
| `GoalCard` | Card goal trên Today/Day | `goal`, `minutes`, `target`, `variant`: today / day; `timerRunning?` | idle, form-open, met, timer-running, timer-disabled | Today (M1; timer M2), Day (M3) |
| `EntryForm` | Thêm/sửa entry | `mode`: add / edit; `defaultValues`; `onSubmit` | default, error theo field, saving (`Saving…`), disabled | Today, Day (M1), StopTimerDialog (M2) |
| `EntryRow` | Một entry + Edit/Delete + xác nhận xoá inline | `entry`, `showSource?` | default, editing, confirming-delete | Today, Day, GoalCard (M1) |
| `ConfirmDialog` | Xác nhận phá huỷ (D2, D3; **v2:** nền cho D4, D5) | `title`, `body`, `confirmLabel`, `tone`, `initialFocus: cancel`; **(v2)** `children` (radio, cảnh báo), `initialFocus: 'cancel' \| 'first-control'`, nội dung cuộn + hàng nút dính đáy | open, busy | Goals, Goal detail (M1), Settings (M3; D4/D5 M6–M7) |
| `StopTimerDialog` | D1 | `elapsed`, `defaultMinutes`, `startedDate` | open, error, saving | Today (M2) |
| `TimerCard` | Hiển thị timer đang chạy | `goal`, `startedAt` | running (cập nhật mỗi giây, `role="timer"`), stopping | Today (M2) |
| `Banner` (`ReminderBanner`, `BackupBanner`, **`LoginPromptBanner`** v2) | Thông báo không chặn | tone: info / neutral / warning / **promo** (v2, nền `--primary-soft`, chỉ LoginPromptBanner) | — | Today (M2, M3, M8), Settings (M3) |
| `Alert` | Lỗi/thành công inline (`role="alert"` / `status`) | tone: danger / success | — | Goal form, Settings import (M1/M3) |
| `Toast` / `ToastRegion` | Phản hồi tạm 4 s (`role="status"`, `aria-live="polite"`), tối đa 1 toast hiển thị | `message`, `action?`; **(v2)** `tone`: default / error (viền trái `--danger`, icon cảnh báo, 8 s, vẫn `role="status"`), dùng cho lỗi đăng nhập ở màn ngoài Settings | enter, exit | tất cả (M1; error + action M6) |
| `UpdateToast` | `A new version is available.` + `Reload` (SW cập nhật) | — | persistent đến khi bấm | AppShell (M1) |
| `OfflineChip` | Báo offline | — | hiện/ẩn theo `navigator.onLine` | AppShell (M1) |
| `StatCard` | Một chỉ số | `label`, `value`, `sub?`, `progress?` | default, loading (skeleton), zero. **(v4.0)** không đổi component; goal không thời hạn chỉ đổi chuỗi `sub` của thẻ Progress (`stat.progressSubOpen`) | Review, Goal detail (M4, M5; M11) |
| `Heatmap` | Lưới năm 53×7 | `year`, `cells`, `mode`: goal / all, `onSelect` | cell levels 0–4, today, future, outside; focus; tooltip | Review (M4) |
| `BarChart` | Cột tuần/tháng (Recharts, lazy). **(v3.1)** có nhãn giá trị trên cột khi "đủ chỗ" (điều kiện đo được ở S6 "Nhãn giá trị trên cột BarChart": `(chartWidth − 38) / 12 ≥ 30 px`; cột ≥ 3 phút; số giờ không đơn vị) | `series`, `unit`, `title` | default, empty (text), loading; **labels-on / labels-off** theo chiều rộng | Review (M4; nhãn M10) |
| `CurveChart` | Đường Ideal vs You (Recharts, lazy). **v3:** "You" = `ActualPoint.percent` (bậc thang, đi xuống được), vạch 0%, thang Y theo `curveYDomain`, nhãn trục có dấu/compact, tooltip 4 biến thể, bảng 5 cột (S4 "Biểu đồ v3") | `ideal[]`, `actual[]` (`ActualPoint` v3: `minutes`, `logged`, `percent`, `changePercent`), `today`, `range` | default, empty-actual (`baseline = null`: chỉ Ideal + vạch 0%), negative, flat (ngày cuối không ghi), upcoming (goal có hạn). **(v4.0)** goal không thời hạn: không có ngày tương lai, **không nhận prop `range`**, một điểm duy nhất → chấm ở giữa; chưa bắt đầu → **không render** (S4 mục 7 v4.0) | Goal detail (M5; v3 M9; M11) |
| `HistoryTable` | Lịch sử entry | `entries` | default, empty | Goal detail (M3) |
| `DateNav` | Điều hướng ngày | `date`, `today` | next vô hiệu ở hôm nay | Day (M3) |
| `EmptyState` | Trạng thái rỗng | `title`, `body`, `action?` | — | Today, Goals, Review, Day, Goal detail (M1 tối thiểu / M5 đủ) |
| `ErrorState` | Lỗi có hành động | `title`, `body`, `action` | — | Not found, StorageError, Review/Detail lazy lỗi |
| `Skeleton` | Placeholder loading | `lines`, `block` | tĩnh; nhấp nháy nhẹ (tắt khi reduced-motion) | mọi màn (M5 rà soát) |
| `GoogleSignInButton` *(v2)* | Nút đăng nhập theo hướng dẫn thương hiệu Google (nền trắng/viền, logo G nhiều màu không đổi, chữ không đổi màu) | `onClick`, `busy`, `disabled`, `full` (< 640 px mặc định rộng đầy), `describedBy?` | default, hover (lớp phủ 8 % `--google-text`), active (12 %), focus-visible (vòng `--focus`), disabled (`opacity: .38`), busy (chữ `Signing in…`, `aria-busy`) | Account card, LoginPromptBanner, ExportSignInHint (M6; M8) |
| `AccountCard` *(v2)* | Card Account trong Settings (A1 … A10 ở S7) | `auth: AuthState`, `sync: SyncStatus`, `online: boolean`, `lastError?` | A1 … A10 | Settings (M6; đồng bộ chi tiết M7) |
| `Avatar` *(v2)* | Vòng tròn 40 px chứa chữ cái đầu (không tải ảnh từ Google, FR-42) | `name`, `email` | — (trang trí, `aria-hidden`) | AccountCard (M6) |
| `SyncIndicator` *(v2)* | Chip trạng thái đồng bộ gọn ở StatusRow, có text cho SR | `status: SyncStatus`, `auth: AuthState`, `online`, `onRetry` | 6 trạng thái (bảng dưới) | AppShell, mọi màn (M7) |
| `SignOutDialog` *(v2, D4)* | Hộp thoại đăng xuất Keep/Remove | `pending`, `online`, `onConfirm({ keepData })` | open, remove-selected, busy, sync-failed | Settings (M6; cảnh báo M7) |
| `MergeAccountDialog` *(v2, D5)* | Xác nhận gộp dữ liệu máy vào tài khoản mới | `goals`, `entries`, `email`, `onConfirm`, `onCancel` | open, busy | AppShell (hiện sau đăng nhập; M7) |
| `LoginPromptBanner` *(v2)* | Nhắc đăng nhập nhẹ nhàng trên Today | `onSignIn`, `onNotNow` | default, busy (nút Google đang đăng nhập) | Today (M8) |
| `ExportSignInHint` *(v2)* | Gợi ý đăng nhập sau Export thành công (**v3.1:** chỉ được tạo khi online lúc Export, A-44) | `onSignIn`, `online` | default; offline (nút vô hiệu + lý do) — **chỉ còn xảy ra khi mất mạng sau khi hint đã hiện** | Settings Backup (M8) |
| `BrandMark` *(v3.1, ghi nhận bản đã ship, ADR-30 g)* | Dấu thương hiệu ở sidebar ≥ 1024 px: ảnh logo trên ô trắng (xem "Brand" dưới bảng) | không props; `alt=""`, `aria-hidden` (tên truy cập nằm ở link cha, `aria-label` = `app.name`) | một trạng thái, giống nhau ở sáng và tối | AppShell sidebar (M1; ảnh logo từ commit `feat(brand)` sau M7) |
| `SettingsSyncNote` *(v2)* | Dòng `.hint` có icon "đã lưu vào tài khoản" ở Language/Reminders | `text` | — | Settings (M7) |
| `AppleSignInButton` *(v5.0)* | Nút **Sign in with Apple** theo HIG của Apple: đen ở theme sáng, **trắng ở theme tối**, glyph Apple + chữ `auth.signInApple`; chỉ render khi `capabilities.appleSignIn` | `onClick`, `busy`, `disabled`, `full` (< 640 px rộng đầy; trên native luôn rộng đầy), `describedBy?` | default, hover (lớp phủ 8 % `--apple-text`), active (12 %), focus-visible (vòng `--focus`), disabled (`opacity: .45`), busy (chữ `Signing in…`, `aria-busy`). Chi tiết "Nút Sign in with Apple" dưới bảng | Account card, LoginPromptBanner, ExportSignInHint (M14) |
| `SignInButtons` *(v5.0)* | Nhóm nút đăng nhập dùng chung ba chỗ: `AppleSignInButton` (nếu có) **trên** `GoogleSignInButton`, xếp dọc, khoảng cách 12 px, cùng chiều rộng. Trên web (không Apple) chỉ có nút Google, **hình dạng y như v2** | `returnTo`, `busyProvider?: 'apple' \| 'google'`, `disabled`, `describedBy?`, `full` | default, busy một nút (nút kia `disabled`), disabled (offline) | AccountCard, LoginPromptBanner, ExportSignInHint (M14; web: M6/M8) |
| `DeleteAccountDialog` *(v5.0, D6)* | Hộp thoại xoá tài khoản (S7 tiếp): thân, email, khối Apple, radio dữ liệu máy (mặc định Remove), Alert lỗi, xác nhận `danger` | `email`, `hasApple` (`appleSignIn` ∧ identity Apple), `online`, `onConfirm({ keepData })`, `onCancel` | open, apple-note, busy, error (4 mã), closed-success | Settings (M14) |
| `AppleRevokePanel` *(v5.0)* | Panel hướng dẫn tự thu hồi Sign in with Apple sau khi xoá tài khoản (`appleRevoked = 'manual-required'`) | `onDismiss` | một trạng thái (hiện / ẩn); nằm dưới h2 của card Account ở A1 | AccountCard (M14) |
| `AccountCard` *(sửa v5.0)* | Thêm: nút Apple (iOS), dòng nhà cung cấp theo identity, khối Delete account, `AppleRevokePanel` | `auth`, `sync`, `online`, `lastError?`, **`capabilities`** | A1 … A10 + delete (enabled / offline / expired) | Settings (M14) |
| `LoginPromptBanner`, `ExportSignInHint` *(sửa v5.0)* | Dùng `SignInButtons`; `ExportSignInHint` dùng `exportHint.textNative` khi `capabilities.nativeShare` | như v2 | như v2 | Today (M8), Settings Backup (M14) |
| `UpdateToast` *(sửa v5.0)* | **Không render** khi `capabilities.serviceWorker === false` (native): app chỉ cập nhật qua App Store | — | — | AppShell (M12) |

**SyncIndicator — 6 trạng thái** (5 trạng thái của PRD FR-50 + `signing-in`; chưa đăng nhập hoặc cloud tắt = **ẩn**, không render). Ưu tiên khi nhiều điều kiện cùng đúng: `expired` > `signing-in` > `error` > `offline/pending` > `syncing` > `synced`.

| Trạng thái | Điều kiện | Icon (SVG inline, 16 px) | Chữ hiển thị (`en`) | Kiểu | Tương tác |
| :- | :- | :- | :- | :- | :- |
| `synced` | signed-in, `idle`, `pending = 0`, online | đám mây + dấu tích, màu `--primary` | `Synced 14:05` (`Synced` nếu chưa có mốc) | nền `--surface`, viền `--border`, chữ `--text-muted` | không (chỉ trạng thái) |
| `syncing` | `syncing` | hai mũi tên vòng, **xoay** 1 s tuyến tính (tắt khi `prefers-reduced-motion`; chữ `…` vẫn có) | `Syncing…` | như `synced`, chữ `--text` | không |
| `pending` | `idle` với `pending > 0` (đang chờ lô 2 s hoặc backoff chưa hết), **hoặc** `offline` (mất mạng) | đám mây gạch chéo khi offline; đám mây + chấm khi online | online: `{n} change(s) waiting to sync`; offline: `Offline · {n} change(s) waiting` (không có thay đổi chờ: `Offline · all changes synced`) | nền `--surface-2`, viền `--border`, chữ `--text` | không |
| `error` | `error` (SYNC_UNREACHABLE; lỗi khác khi online) | tam giác cảnh báo, `--on-danger-soft` | `Couldn't sync` + nút `Retry` | nền `--danger-soft`, chữ `--on-danger-soft` | nút `Retry` → `syncNow('manual')` |
| `expired` | `AuthState = expired` | khoá mở / mũi tên người dùng, `--info` | `Sign in again to sync` | nền `--info-soft`, chữ `--info`; là **link** tới `#/settings` | link |
| `signing-in` | `AuthState = signing-in` | như `syncing` (xoay) | `Signing in…` | như `syncing` | không |
| *(ẩn)* | `signed-out`, `unavailable` | — | — | — | — |

Chi tiết dùng chung: chip cao 32 px (`min-height`), padding ngang 12 px, bo `--r-full` (hoặc 16 px khi 2 dòng), chữ `--text-sm` 600, khoảng cách icon–chữ 6 px; `max-width: 100%`, `white-space: normal`. Chip tương tác (`error`, `expired`) có vùng bấm **≥ 44 px** nhờ `::after { inset: -6px 0 }` (không đổi chiều cao hiển thị). Mọi thay đổi trạng thái chỉ đổi chip tại chỗ (không nhảy bố cục). Text cho screen reader: xem mục 8.

Quy tắc dùng chung:

- Mỗi `Button` luôn có chữ hoặc `aria-label`; nút phá huỷ dùng `danger`, không đặt cạnh primary mà không có khoảng cách ≥ 8 px.
- Chỉ **một** toast tại một thời điểm; toast mới thay toast cũ (thay ngay, đặt lại thời gian hiển thị của toast mới; vùng `role="status"` nghe được nội dung mới đúng một lần). **Quy tắc một toast (v3.1, ghi nhận ADR-30 d / M7 D9)** — vì cùng một sự kiện không được tạo hai toast liên tiếp, các cặp sau chỉ hiện **một** toast, theo bảng ưu tiên:

  | Tình huống | Toast hiện | Toast KHÔNG hiện |
  | :- | :- | :- |
  | Vừa đăng nhập xong, lần đồng bộ đầu có gộp dữ liệu (đẩy hoặc kéo ≥ 1 bản ghi) và thành công | `toast.mergeDone` (nêu số mục tiêu/lần ghi trong tài khoản) | `toast.signedIn` ("Signed in as …") |
  | Vừa đăng nhập xong, máy sạch / chọn Cancel ở D5 / chu kỳ gộp lỗi | `toast.signedIn` (D5 Cancel: `toast.signedOutKept`) | `toast.mergeDone` |
  | Bấm `Sync now` thành công mà đồng thời áp tuỳ chọn từ tài khoản (giờ nhắc, ngôn ngữ) | `toast.prefsFromAccount` | `toast.syncNowDone` |
  | Bấm `Sync now` thành công, không có gì áp từ tài khoản | `toast.syncNowDone` | — |
  | Mọi trường hợp khác (ví dụ `toast.entrySaved` ngay sau `toast.languageChanged`) | toast sau cùng | toast trước (bị thay) |

  Hệ quả cho người làm test: không assert "hai toast cùng lúc"; assert toast cuối cùng. Toast lỗi có `action` (8 s) cũng bị thay bởi toast mới hơn như mọi toast khác (không có độ ưu tiên riêng).
- Dialog dùng phần tử `<dialog>` + `showModal()` (có sẵn focus trap, Esc đóng, `::backdrop`), trả focus về phần tử đã mở dialog (nếu phần tử đó không còn, về `<h1>` hoặc TimerCard).
- Form: lỗi hiển thị dưới field bằng icon + chữ, `id` lỗi được nối vào `aria-describedby`; không đổi layout nhảy đột ngột (chừa chỗ cho hint).
- **(v2) Nút Google** là nút duy nhất không dùng token `--primary`: theo hướng dẫn thương hiệu (nền trắng, viền xám, chữ `#1F1F1F`, logo G nhiều màu, không bóng đổ, không đổi màu/hình logo, không thêm viền quanh logo); bản tối dùng bộ màu "dark" của Google. Nhãn **chỉ** là `Sign in with Google` / `Đăng nhập bằng Google` (không viết thêm `bằng tài khoản`). Có thể có hai nút Google trên Settings (card Account + ExportSignInHint ở Backup, chỉ sau Export); nút trong ExportSignInHint chỉ là lối tắt, không thay thế nút của card. Khoảng cách giữa nút Google và nút kề ≥ 8 px.
- **(v2) Dialog có radio (D4):** lựa chọn mặc định an toàn nhận focus ban đầu (ngoại lệ có chủ đích của quy tắc "focus ở Cancel"); Esc = Cancel; hàng nút dính đáy, nội dung cuộn trong dialog; khi mở dialog, phần còn lại của trang `inert` (do `showModal()` lo).
- **(v2) Không bao giờ hiện hai banner đăng nhập/sao lưu cùng lúc** trên Today: thứ tự ưu tiên LoginPromptBanner > BackupBanner; ReminderBanner độc lập, luôn ở trên.

### Nút Sign in with Apple (v5.0, M14; FR-60, Guideline 4.8, HIG "Sign in with Apple")

| Thuộc tính | Quy định |
| :- | :- |
| Nhãn | **Chỉ** `auth.signInApple` = `Sign in with Apple` / `Đăng nhập bằng Apple`. Không rút gọn ("Apple", "Continue with Apple"), không thêm chữ, không đổi chữ theo ngữ cảnh. Glyph Apple đứng **bên trái** chữ, không đổi hình, chỉ **đen hoặc trắng** |
| Màu | Theme sáng: nền `--apple-bg` `#000000`, glyph + chữ `--apple-text` `#FFFFFF`. Theme tối: nền `#FFFFFF`, glyph + chữ `#000000` (kiểu "white" của Apple trên nền tối). Tương phản 21:1 ở cả hai; viền 1 px cùng màu nền (không viền thấy được). Không dùng `--primary`, không dùng màu thương hiệu, không bóng đổ |
| Kích thước | `min-height: 44px` (= `--tap`, ≥ 44 pt), `padding: 6px 16px 6px 12px`, glyph cao 20 px (rộng ≈ 15 px) cách chữ 10 px, chữ system-ui 15/20 **cùng cỡ và độ đậm** (500) với nút Google để hai nút **ngang hàng**; `border-radius: var(--r-md)` (10 px, cùng nút Google); tối thiểu rộng 140 pt (đạt vì rộng đầy); khoảng trống quanh glyph + chữ ≥ 1/10 chiều cao nút (đạt nhờ padding). Chữ có thể xuống 2 dòng khi phóng, nút cao lên, không cắt |
| Vị trí | Luôn **trên** nút Google, cùng chiều rộng, cách 12 px (HIG: Apple đặt ngang hàng hoặc trên các nút đăng nhập khác; không nhỏ hơn, không mờ hơn, không dưới). Trên iOS **mọi** nơi có nút Google đều có nút Apple: card Account (A1, A10), LoginPromptBanner, ExportSignInHint. Bản web và Android: **không có** nút Apple |
| Glyph | Dùng tệp glyph Apple do Apple cung cấp (Apple Design Resources / hướng dẫn nút) hoặc SVG vector tương đương, nhúng inline, `aria-hidden="true"`, không tải từ mạng (NFR-01). Mockup dùng một glyph thay thế chỉ để dàn trang |
| Trạng thái | default · hover (lớp phủ `--apple-text` 8 %, chỉ thiết bị có chuột) · active (12 %) · focus-visible (vòng `2px solid var(--focus)`, offset 2 px) · disabled (`opacity: .45`, `cursor: not-allowed`; lý do hiện ở dòng `offlineHint` nối `aria-describedby`) · busy (chữ `auth.signingIn`, `aria-busy="true"`, glyph giữ nguyên, không đổi màu) |
| Hành vi | Bấm → `authService.signIn(<hash hiện tại>, 'apple')`. Không có "Not now" riêng cho nút này; "Not now" thuộc banner |

### Native shell (v5.0, M13; FR-64, NFR-19) — icon, launch screen, status bar, vùng an toàn

Mọi giá trị dưới đây là hợp đồng cho M13-T3/T4; chỉ áp dụng cho app native (bản web không đổi một pixel: ở web các `--safe-*` bằng 0).

**1) Icon app** (`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`)

| Mục | Giá trị |
| :- | :- |
| Định dạng | PNG **1024 × 1024**, RGB 8 bit, **không kênh alpha** (color type 2), không bo góc (iOS tự bo), không đổ bóng |
| Nền | **Trắng `#FFFFFF`** đặc (quyết định user 2026-10-20, OQ-18), không gradient, không viền |
| Logo | Đúng logo hiện có (`logo/1_percent_better_transparent.png`, cùng hình với `public/icons/pwa-512.png`: chữ "1% BETTER" đen, mũi tên xanh, tờ lịch), **giữ tỉ lệ**, vừa **trong hình vuông 820 × 820 px ở chính giữa** (lề ≥ 102 px ≈ 10 % mỗi cạnh), căn giữa theo hộp bao các điểm ảnh không trong suốt; không cắt, không xoay, không thêm chữ |
| Kết quả mong đợi | Giống `apple-touch-icon.png` của bản web nhưng 1024 px và RGB. Chữ đen trên trắng ≈ 21:1 |
| Không làm | Không bản tối / tinted của iOS 18 (A-D66); không icon riêng cho iPad (app chỉ iPhone) |
| Tên dưới icon | `1% Better` (`CFBundleDisplayName`, 9 ký tự, không bị cắt) |

**2) Launch screen** (`LaunchScreen.storyboard` + `Splash.imageset`; ADR-43)

| Mục | Sáng | Tối |
| :- | :- | :- |
| Màu nền storyboard (màu có tên `LaunchBackground`, hai appearance) | `#F7F6F2` (= `--bg`) | `#121513` (= `--bg` tối) |
| Ảnh `Splash` (PNG **2732 × 2732**, RGB, không alpha; ảnh sáng mặc định, ảnh tối trong `appearances` `luminosity: dark`) | nền `#F7F6F2`; logo (trong suốt) ở chính giữa, hộp bao ≤ **520 × 520 px** | nền `#121513`; **ô trắng `#FFFFFF` 600 × 600 px, bo góc 28 % (≈ 168 px)** ở chính giữa (cùng tỉ lệ brand mark, vì chữ logo màu đen sẽ biến mất trên nền tối); logo trong ô, hộp bao ≤ 500 × 500 px, căn giữa ô |
| Chữ, spinner | **Không có** (không "1% Better per Day", không "Loading") | **Không có** |
| Ẩn | `SplashScreen.hide()` đúng một lần sau lần render đầu của React; tự ẩn sau 3 s nếu chưa render xong; mờ dần mặc định 200 ms (reduced-motion: tắt) | như sáng |

**3) Status bar** (`@capacitor/status-bar`; overlay mặc định, web view phủ dưới status bar vì `ios.contentInset: 'never'`)

| Theme hiệu lực | Nền nhìn thấy sau status bar | Kiểu chữ/icon của status bar |
| :- | :- | :- |
| Sáng | `--bg` `#F7F6F2` (do `body`/`main` vẽ) | chữ tối: `Style.Light` |
| Tối | `--bg` `#121513` | chữ sáng: `Style.Dark` |

Theme hiệu lực = `prefers-color-scheme` của hệ điều hành (app không có công tắc, A-D2); đổi theme khi app đang chạy thì status bar đổi ngay. Status bar luôn hiện (không ẩn, không màu riêng, không `meta theme-color`).

**4) Vùng an toàn (safe area)** — token trong `:root`: `--safe-top: env(safe-area-inset-top, 0px)`, `--safe-right: env(safe-area-inset-right, 0px)`, `--safe-bottom: env(safe-area-inset-bottom, 0px)`, `--safe-left: env(safe-area-inset-left, 0px)`. Chỉ bản native có `viewport-fit=cover` trong `<meta name="viewport">` (nếu không, `env()` luôn bằng 0); bản web giữ meta cũ. iPhone 16 Pro Max (dọc): top 62, bottom 34; iPhone SE: top 20, bottom 0.

| Vùng | Selector (khoảng `base` < 1024 px) | Quy tắc |
| :- | :- | :- |
| Nền toàn trang | `html`, `body` | `background: var(--bg)` (vùng dưới status bar và thanh Home luôn đúng màu app); `overscroll-behavior: none` (không nảy, không lộ nền trắng) |
| Đầu nội dung / StatusRow / `<h1>` | `main` | `padding-top: calc(16px + var(--safe-top))`; `padding-left: max(16px, var(--safe-left))`; `padding-right: max(16px, var(--safe-right))` |
| Cuối nội dung | `main` | `padding-bottom: calc(var(--tabbar-h) + var(--safe-bottom) + 32px)` |
| Thanh tab dưới | `.nav` | cao `calc(56px + var(--safe-bottom))`; `padding-bottom: var(--safe-bottom)`; `padding-left/right: var(--safe-left/right)`; nhãn và icon tab nằm **trên** vùng Home indicator |
| Toast | `.toast-region` | `bottom: calc(var(--tabbar-h) + var(--safe-bottom) + 12px)`; `padding-inline: max(16px, var(--safe-left)) max(16px, var(--safe-right))` |
| Dialog dạng bottom sheet (D1 … D6) | `dialog` (< 640 px) | `max-height: calc(100dvh - 16px - var(--safe-top))`; hàng nút dính đáy: `padding-bottom: calc(12px + var(--safe-bottom))`; nền hàng nút = `--surface` phủ cả vùng inset |
| Banner, card, form trong luồng | — | không thêm gì (đã nằm trong `main`) |
| Màn đầy trang (S8, S9, ErrorBoundary) | khung của màn | `padding-top: calc(24px + var(--safe-top))`; `padding-bottom: calc(24px + var(--safe-bottom))` |
| Skip link | `.skip:focus` | `top: calc(8px + var(--safe-top))` |
| ≥ 1024 px | sidebar | không dùng token (iPad/Mac ngoài phạm vi; bản web desktop không có inset) |

Kiểm tĩnh (M13-AC5): `app.css` khai báo bốn token bằng `env(safe-area-inset-*)` và các selector ở bảng dùng `var(--safe-*)`; có `overscroll-behavior: none` cho `html` hoặc `body`. Screenshot App Store (7.8.8) giả lập iPhone 16 Pro Max bằng cách đặt `--safe-top: 62px; --safe-bottom: 34px` trên `:root` trước khi chụp.

**5) Bàn phím và hướng** — `Keyboard.resize: 'native'` (web view co lại khi bàn phím mở, ô đang nhập không bị che). Khi bàn phím đang mở, **thanh tab dưới ẩn** (`body.keyboard-open .nav { display: none }`; class do listener `keyboardWillShow` / `keyboardWillHide` đặt) để nhường chỗ cho form; hiện lại khi đóng. Chỉ dọc (portrait); không thiết kế ngang. Nếu NV-13 cho thấy ẩn tab bar gây giật, giữ tab bar và ghi vào handoff (không đổi token). Phóng chữ: iOS không có Dynamic Type trong app (non-goal PRD); zoom trang không bị khoá.

**6) Link ra ngoài app** — URL tuyệt đối (`capabilities.publicSiteUrl` + `privacy.html` / `support.html`, hoặc `https://support.apple.com/102571`), `target="_blank" rel="noopener"`, mở bằng Safari; nhãn có thêm chữ ẩn `a11y.opensExternal` (`(opens in Safari)` / `(mở trong Safari)`); vùng chạm ≥ 44 px; gạch chân luôn hiện.

### Brand (v3.1 — thay mục "logo ô xanh chữ 1%" của v1; ghi nhận bản đã ship, ADR-30 g)

Orchestrator gắn logo sản phẩm của user ngày 2026-10-12/13 (commit `feat(brand)` sau M7); user và orchestrator đã chấp nhận. Đây là contract từ v3.1.

| Thành phần | Quy định |
| :- | :- |
| Ảnh | `public/brand-mark-96.png` (96 × 96, PNG **trong suốt**, chữ logo màu đen, mũi tên xanh); tải bằng `BASE_URL + 'brand-mark-96.png'`, `decoding="async"` |
| Ô nền | Hình vuông **32 × 32 px**, `border-radius: 9px`, `padding: 2px`, nền **`#FFFFFF` ở cả hai theme** (sáng và tối), `flex: none`; ảnh hiển thị **28 × 28 px** (`width/height: 100%`, `object-fit: contain`). Không viền, không bóng. Lý do trắng cả ở theme tối: chữ logo đen trong suốt sẽ biến mất trên nền tối |
| Chữ cạnh mark | `app.name` = **"1% Better per Day"** (cả `en` và `vi`), 700, `--text`, khoảng cách 10 px từ ô. Key `app.brandSuffix` ("Better per Day") **bị bỏ** (không còn dùng; xem 7.2) |
| Vị trí | Đầu sidebar (≥ 1024 px), `padding: 0 12px 20px`; link tới `#/today`, `aria-label` = `app.name`; ảnh `alt=""` + `aria-hidden` (tránh đọc đôi với chữ bên cạnh). **Không có brand ở thanh tab dưới < 1024 px**, nên 360 px không đổi bố cục |
| Icon hệ thống | PWA icon 192/512 và maskable, apple-touch 180: nền trắng; favicon 32 và `favicon.svg`: trong suốt (do orchestrator tạo từ logo; không thiết kế lại ở đây) |
| Khoá bởi test | `tests/qc/m7-r1-brand.spec.ts` khoá ô 32 px / ảnh 28 px. Muốn mark lớn hơn (ví dụ 36/32 để chữ trong logo dễ đọc) thì QC nới assertion trước; xem OQ-D19 |

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
| `--chart-zero` *(v3)* | = `--text-muted` | = `--text-muted` | vạch tham chiếu 0% của CurveChart (liền, 1,5 px; tương phản ≥ 3:1 với `--surface`). Không thêm giá trị màu mới |
| `--scrim` | `rgba(20,28,24,.5)` | `rgba(0,0,0,.6)` | lớp phủ dialog |
| `--google-bg` *(v2)* | `#FFFFFF` | `#131314` | nền nút Google (bộ màu chính thức của Google: theme "light" / "dark") |
| `--google-border` *(v2)* | `#747775` | `#8E918F` | viền nút Google (≥ 3:1 so với `--surface`/`--primary-soft`) |
| `--google-text` *(v2)* | `#1F1F1F` | `#E3E3E3` | chữ nút Google; lớp phủ hover/active = `--google-text` ở 8 % / 12 % |
| `--brand-tile` *(v3.1, ghi nhận)* | `#FFFFFF` | `#FFFFFF` | ô nền của brand mark (mục 5 "Brand"): **trắng ở cả hai theme** vì ảnh logo trong suốt có chữ đen. Bản đã ship dùng literal `#fff` trong `.mark`; không bắt buộc tạo biến CSS |

Phase 2 **không thêm** token màu nào khác: SyncIndicator, AccountCard, banner và dialog mới chỉ dùng token sẵn có (`--surface-2`, `--border`, `--primary`, `--primary-soft`/`--on-primary-soft`, `--info*`, `--danger*`). Màu amber `--plus-*` vẫn chỉ dành cho "+1%" (không dùng cho trạng thái đồng bộ/hết phiên). Logo chữ G của Google giữ bốn màu gốc (`#4285F4`, `#34A853`, `#FBBC05`, `#EA4335`) ở cả sáng lẫn tối, là ngoại lệ có chủ đích của quy tắc "chỉ dùng token".

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
| `--text-display` | 40 / 44 | 700 | timer `hh:mm:ss`, headline `+440.0% better` (Goal detail; được phép xuống dòng, mục 3.4) |

### 6.3 Khoảng cách, bo góc, đổ bóng, z-index, chuyển động

| Nhóm | Token = giá trị |
| :- | :- |
| Spacing (4 px) | `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 24, `--sp-6` 32, `--sp-7` 48 |
| Radius | `--r-sm` 6, `--r-md` 10, `--r-lg` 16, `--r-full` 999 |
| Shadow | `--shadow-1`: `0 1px 2px rgba(20,30,25,.06)` (card); `--shadow-2`: `0 12px 40px rgba(20,30,25,.22)` (dialog, toast) |
| Kích thước | `--tap` 44 (vùng chạm tối thiểu), `--content-max` 960, `--nav-w` 232, `--tabbar-h` 56 |
| Z-index | nav 20, toast 40, dialog 50 |
| Motion | `--dur-fast` 120 ms, `--dur` 200 ms, easing `ease-out`; mọi animation tắt (`0.01ms`) khi `prefers-reduced-motion: reduce`. **(v2)** vòng xoay đồng bộ/đăng nhập: `rotate` 1 s `linear infinite`, **tắt hẳn** (không xoay, giữ icon tĩnh) khi reduced-motion |
| Kích thước phase 2 *(v2)* | `--chip-h` 32 (chiều cao SyncIndicator), avatar 40, nút Google `min-height` = `--tap` (44), logo G 20 (trong ô 20×20), khoảng logo–chữ 10, radio D4 vùng bấm ≥ 44 |
| Breakpoint | `sm` 640, `lg` 1024 (xem 3.2) |

Heatmap: ô 11 px + khoảng 2 px (mobile < 640 px; cuộn ngang trong vùng chứa), 13 px + 3 px (≥ 640 px; 53 cột = 845 px); bo 2 px. Biến CSS `--cell`, `--gap`. **(v3.1, M4-P1a; thay câu của v1 nói lưới không cần cuộn ngay từ 1024 px, vốn không đúng vì sidebar chiếm 232 px)** Tổng chiều rộng cần = 845 (lưới) + 34 (cột nhãn thứ) + 32 (padding card 2 × 16) + 48 (padding `main.wide` 2 × 24, ≥ 1024 px) ≈ 959 px ≤ 960 px (`--content-max`). Heatmap **vừa khít và không cuộn chỉ khi vùng nội dung đạt ≈ 959–960 px, tức viewport ≥ 232 (`--nav-w`) + 960 = 1192 px** (ngưỡng làm tròn; đo ở trình duyệt có thanh cuộn dạng overlay như Chromium headless — trên máy có thanh cuộn dọc cổ điển ≈ 15 px, ngưỡng thực tế dịch lên ≈ 1207 px). Dưới ngưỡng đó, gồm 640–1023 px (tab bar, nội dung ≤ viewport) và **1024–1191 px** (sidebar chừa 792–959 px; ở 1024 px ẩn ≈ 169 px), heatmap cuộn ngang bên trong `.heatmap-scroll` và tự cuộn tới tuần hiện tại; trang không cuộn ngang. Biến CSS `--cell`/`--gap` **không đổi** theo viewport trong khoảng này (không co ô để ép vừa). QC kiểm: `scrollWidth − clientWidth` của `.heatmap-scroll` ≤ 2 ở 1200, 1280, 1440, 1920 px (khớp QC M4 r2); > 0 ở 1024 và 1100 px; `documentElement` không cuộn ngang ở mọi viewport (khớp QC M4 r2: 360 … 1920 px). Không kiểm chính xác 1191/1192 px (sai số làm tròn).

**(v4.0) Token:** không thêm, không đổi giá trị token nào. Radio "No end date" bị khoá dùng chữ `--text-muted` (≈ 6,3:1 trên `--surface`, đủ 4.5:1) và ghi chú `.hint` có sẵn; không dùng `opacity` để làm mờ (sẽ kéo tương phản xuống dưới 4.5:1). Con trỏ chuột `not-allowed` trên nhãn khoá là kiểu, không phải token.

**(v5.0) Token mới — 6 token, không đổi giá trị token cũ:**

| Token | Sáng | Tối | Dùng cho |
| :- | :- | :- | :- |
| `--apple-bg` | `#000000` | `#FFFFFF` | nền nút Sign in with Apple (HIG: đen trên nền sáng, trắng trên nền tối) |
| `--apple-text` | `#FFFFFF` | `#000000` | glyph + chữ nút Apple; lớp phủ hover/active = `--apple-text` ở 8 % / 12 % |
| `--safe-top` | `env(safe-area-inset-top, 0px)` | (như sáng) | vùng an toàn trên; web = 0 (mục 5 "Native shell") |
| `--safe-right` | `env(safe-area-inset-right, 0px)` | (như sáng) | vùng an toàn phải |
| `--safe-bottom` | `env(safe-area-inset-bottom, 0px)` | (như sáng) | vùng an toàn dưới (thanh Home) |
| `--safe-left` | `env(safe-area-inset-left, 0px)` | (như sáng) | vùng an toàn trái |

Nút Apple là ngoại lệ thứ hai (sau nút Google) của quy tắc "chỉ dùng token màu của app": theo hướng dẫn của Apple, đen hoặc trắng thuần, không dùng `--primary`. Màu của tài nguyên native (icon nền `#FFFFFF`; nền launch screen = `--bg` sáng `#F7F6F2` / tối `#121513`; ô trắng `#FFFFFF` trong splash tối) không thêm token: là giá trị tệp ảnh/storyboard, ghi ở mục 5 "Native shell". Không thêm token chữ, khoảng cách, bo góc, đổ bóng.

---

## 7. Copy và thông báo

### 7.0 Quy tắc key, tham số, số nhiều và cách viết tiếng Việt

**Cách dùng mục này.** Mỗi bảng có cột `Key`, `en`, `vi` (và `Ngữ cảnh`/`MS` = milestone cần chuỗi đó). Developer tạo `en.json` / `vi.json` bằng cách copy nguyên văn hai cột này; key dạng `a.b.c` là đường dẫn lồng nhau trong JSON. Không dịch lại, không sửa dấu. Nếu thiếu chuỗi cho một thành phần thì dừng và báo orchestrator (M1-T8).

**Quy tắc key**

1. Tên key theo thành phần/màn hình: `app.*`, `nav.*`, `common.*`, `unit.*`, `offline.*`, `update.*`, `format.*`, `toast.*`, `plusone.*`, `chart.*`, `errors.*`, `empty.*`, `today.*`, `goalCard.*`, `entry.*`, `goals.*`, `goal.form.*`, `goal.delete.*`, `goal.detail.*`, `goal.status.*`, `day.*`, `review.*`, `stat.*`, `heatmap.*`, `timer.*`, `reminder.*`, `backup.*`, `import.*`, `settings.*`, `notFound.*`, `storageError.*`, `errorBoundary.*`, `notification.*`, `ics.*`, `a11y.*`, `doc.*`; **(v2)** `auth.*` (nút đăng nhập, D4, D5), `sync.*` (SyncIndicator, thông báo cho SR), `loginPrompt.*`, `exportHint.*`; chuỗi của card Account nằm dưới `settings.account.*` (theo quy ước `settings.<card>.*` và M6-AC3; đây là nhóm `account.*` mà orchestrator nêu). Không dùng tiền tố `screen.` (xem A-D14).
2. **Không key nào là tiền tố (theo dấu `.`) của key khác** (i18next không cho một khóa vừa là chuỗi vừa là object). Vì thế tiêu đề/nội dung/nút của một khối tách bằng hậu tố liền tên, không bằng dấu chấm: `empty.today.noGoals` (tiêu đề), `empty.today.noGoalsBody`, `empty.today.noGoalsAction`.
3. Biến dùng cú pháp i18next `{{name}}`. Ngày, số, phút, giờ, phần trăm đã được `format.ts` định dạng theo locale **trước khi** truyền vào (`{{date}}` = `01/10/2026` ở `vi`). Tên goal/why/note truyền vào nguyên văn, không dịch.
4. **Số nhiều:** key có biến `count` theo chuẩn i18next JSON v4: `key_one` / `key_other` cho `en`. `vi` chỉ có `key_other` (không chia số nhiều); trong bảng, dòng `key_one` ghi `vi` = `—` (không tạo key trong `vi.json`). Biến của `vi` `_other` phải **giống** biến của `en` `_other`. Cụm đếm được dùng lại trong câu khác (`1 goal`, `5 goals`, `1 entry`, `8 days`) lấy từ `format.goalsCount`, `format.entriesCount`, `format.daysCount`, rồi truyền vào câu dưới dạng biến chuỗi (`{{goals}}`, `{{days}}`); **không** ghép chuỗi bằng `+` trong UI.
5. Chuỗi giống nhau ở `en` và `vi` (tên thương hiệu, `+1%`, `—`, `{{n}}/280`, `English`, `Tiếng Việt`, `Language / Ngôn ngữ`) vẫn có mặt ở cả hai file và được **miễn** test quét "không lẫn tiếng Anh" (NFR-11c); danh sách miễn = các dòng có cột `vi` ghi `= en`.
6. `+1%`, `1% Better`, `1% Better per Day`, `JSON`, `.ics`, mã lỗi, tên file, `hh:mm:ss` và `HH:MM` không dịch.

**Quy tắc viết tiếng Việt (A-18: designer chốt giọng văn)**

- **Có dấu đầy đủ**, dùng Unicode dựng sẵn (NFC), kiểu đặt dấu thanh hiện đại, thống nhất toàn app (`Hủy`, `Xóa`, `hòa`, `thủy`, không viết `Huỷ`, `Xoá`, `hoà`). Không viết không dấu, không viết tắt kiểu nhắn tin.
- **Xưng hô "bạn"** khi cần nhắc đến người dùng; câu mệnh lệnh mở đầu bằng `Hãy …` khi cần lịch sự, nút thì động từ trần (`Lưu`, `Xóa`). Không dùng "quý khách", "mình/ta". Không đổ lỗi ("bạn đã sai"); nói chuyện gì xảy ra và làm gì tiếp (giống `en`).
- **Giọng ngắn gọn, bình tĩnh**, giống `en`: câu đơn, bỏ chủ ngữ khi hiển nhiên. Nút ≤ 3 từ nếu được; nhãn tab ≤ 10 ký tự.
- **Thuật ngữ** (nhất quán toàn app):

| Khái niệm (`en`) | `vi` | Ghi chú |
| :- | :- | :- |
| goal | mục tiêu | |
| entry | lần ghi | đếm: `5 lần ghi` |
| target (daily target) | chỉ tiêu | "đạt chỉ tiêu" = on target |
| log time | ghi thời gian | |
| timer | bộ đếm giờ (nút: `Đếm giờ`; badge nguồn: `Đếm giờ`) | không dùng "timer" |
| session | phiên | `Bỏ phiên này` |
| reminder | nhắc nhở / lời nhắc | |
| backup / export / import | sao lưu / xuất / nhập | `Xuất sao lưu (JSON)`, `Nhập sao lưu…` |
| archive / restore | lưu trữ / khôi phục | |
| storage | bộ nhớ | không dùng "lưu trữ" (để dành cho archive) |
| review | tổng kết | tab và h1 |
| streak | chuỗi (… ngày) | `Chuỗi 8 ngày` |
| pace | nhịp độ | khác với `tiến độ` (progress) |
| heatmap | biểu đồ nhiệt / bản đồ nhiệt | aria: `Biểu đồ nhiệt hoạt động năm …` |
| app | app | giữ như người Việt hay dùng; "ứng dụng" chỉ khi hướng dẫn menu trình duyệt |
| file | tệp | "tệp" thay "file", trừ tên loại (`.ics`, JSON) |
| notification | thông báo | |
| today / yesterday | hôm nay / hôm qua | |
| sign in / sign out | đăng nhập / đăng xuất | nút: `Đăng nhập bằng Google`, `Đăng xuất` |
| account | tài khoản | "tài khoản của bạn" = your account (Google/Supabase); không dùng "cloud", "đám mây" trong chuỗi |
| sync / synced | đồng bộ / đã đồng bộ | `Đang đồng bộ…`, `Đã đồng bộ 14:05` |
| change (pending sync) | thay đổi | `2 thay đổi đang chờ` |
| device | thiết bị | "trên thiết bị này" (this device) |
| Not now | Để sau | |
| Google | Google | **không dịch**, không thêm dấu |

- Giữ nguyên tiếng Anh: `JSON`, `.ics`, `iOS`, `iPhone`, `iPad`, `PWA`, `cookie`, `MB`, `1% Better`.
- Số thập phân dùng dấu phẩy (`25,8%`), hàng nghìn dùng dấu chấm (`1.440`); các số có sẵn trong câu (ví dụ `1.440`, `10.000`, `1.827`) đã viết đúng theo quy ước này trong bảng.
- Dấu câu: dấu chấm cuối câu đầy đủ cho câu hoàn chỉnh; không viết hoa mỗi từ ở tiêu đề (`Mục tiêu mới`, không phải `Mục Tiêu Mới`). Dấu ngoặc kép thẳng `"…"` như `en`. Dấu `—` (em dash) và `·`, `–` giữ như `en`.

### 7.1 Quy ước định dạng

Mọi định dạng do `src/i18n/format.ts` (ARCH §5.8) sinh ra; developer **không** gõ tay ngày/số vào bản dịch. Cột `vi` là kết quả mong đợi (ngày dài lấy từ `Intl.DateTimeFormat('vi-VN')`, có thể khác nhẹ giữa phiên bản ICU nên test so với `Intl` tại chỗ).

| Loại | `en` (`en-US`) | `vi` (`vi-VN`) | Ví dụ `en` → `vi` |
| :- | :- | :- | :- |
| Ngày dài (tiêu đề, heatmap, `Day`) | thứ, tháng ngày (+ năm nếu không phải năm hiện tại hoặc ở màn Day) | `Intl` `vi-VN`: thứ, ngày tháng (+ năm) | `Friday, October 9` → `Thứ Sáu, 9 tháng 10`; `Thursday, October 8, 2026` → `Thứ Năm, 8 tháng 10, 2026` (có thể là `… 8 tháng 10 năm 2026` tùy ICU) |
| Ngày ngắn (khoảng goal, lịch sử, `Last backup`, hint) | `YYYY-MM-DD`; khoảng nối bằng ` – ` (en dash) | `dd/MM/yyyy`; khoảng nối bằng ` – ` | `2026-10-01 – 2026-10-31` → `01/10/2026 – 31/10/2026` |
| Ngày ngắn không năm (tooltip biểu đồ, trục tuần) | `Oct 9` | `9 thg 10` (`Intl` `vi-VN`) | |
| Tên thứ, tháng ngắn (heatmap, trục) | `Mon`, `Oct` | `Th 2`, `thg 10` (theo `Intl` `vi-VN`) | Tuần luôn bắt đầu thứ Hai (A-01) |
| Số, hàng nghìn | `1,440` | `1.440` | |
| Số thập phân 1 chữ số | `15.5`, `4.0` | `15,5`, `4,0` | |
| Phút | `{n} min`; card Today `{a}/{b} min` | `{n} phút`; `{a}/{b} phút` | `20/30 min` → `20/30 phút` |
| Thời lượng dài | `< 60`: `{n} min`; `≥ 60`: `{h} h {m} min` (bỏ phần 0) | `{n} phút`; `{h} giờ {m} phút` (bỏ phần 0) | `2 h 40 min` → `2 giờ 40 phút` |
| Tổng giờ (thống kê) | `{x.x} h` | `{x,x} giờ` | `4.0 h` → `4,0 giờ` |
| Phần trăm | `25.8%`, `+440.0% better` | `25,8%`, `Tốt hơn +440,0%` | key `format.percent` = `{{value}}%` |
| **(v3)** Phần trăm **có dấu** (mọi % của đường cong: headline, "Bạn", Ideal, so với ngày trước, nhãn, tooltip, bảng, tóm tắt) | `+440.0%`, `+0.0%`, `−40.0%`, `+143,900.0%`, `+92.9%` | `+440,0%`, `+0,0%`, `−40,0%`, `+143.900,0%`, `+92,9%` | Một formatter (tên do developer đặt, vd. `signed1`): 1 chữ số thập phân, nhóm hàng nghìn theo locale, `+` khi ≥ 0 (kể cả `+0.0`), `−` khi < 0, `−0` → `+0.0`. **Template trong bảng key không chứa `+` cứng**: dấu nằm trong `{{value}}`/`{{x}}`… để không ra `++`. Giá trị đã được làm tròn theo `pct` (ARCH §4.5) trước khi định dạng |
| **(v3)** Dấu trừ | `−` **U+2212** (không dùng `-` ASCII) | `−` U+2212 | Chốt một loại cho cả app để trình đọc màn hình đọc là "trừ" và độ rộng khớp với `+`. `Intl` trả `-` ASCII ở `en-US` và `vi-VN` nên formatter phải thay thủ công `-` → `−`. Test chấp nhận cả hai (`/[-−]/`) nhưng code chỉ sinh U+2212 |
| **(v3)** Hệ số `×N` (`f.factor`) | `×5.4`, `×2.8`, `×0.6`, `×1,440` | `×5,4`, `×2,8`, `×0,6`, `×1.440` | `×` = U+00D7, nằm trong template (`×{{factor}}`), không có khoảng trắng sau `×`; số do `f.factor` (ARCH §4.5: ≥ 1 tối đa 2 chữ số thập phân bỏ số 0 thừa; < 1 hai chữ số có nghĩa) |
| **(v3)** Nhãn trục Y của CurveChart | `+500%`, `0%`, `−50%`, `+1,000%`, `+144K%` | `+500%`, `0%`, `−50%`, `+1.000%`, `+144 N%` | Số nguyên có dấu; zero không dấu; |v| ≥ 10.000 → `Intl` compact (xem S4 "Biểu đồ v3") |
| Timer | `hh:mm:ss` (giống nhau) | giống `en` | `00:25:31` |
| Giờ nhắc | 24h `HH:MM` (giống nhau) | giống `en` | `20:00` |
| Số nhiều | `1 goal`, `2 goals`; `1 entry`, `23 entries`; `1 day`, `8 days`; **(v2)** `1 change`, `3 changes` | `1 mục tiêu`, `2 mục tiêu`; `23 lần ghi`; `8 ngày`; `3 thay đổi` (không chia số nhiều) | qua `format.*Count` |
| **(v2)** Thời điểm đồng bộ — chỉ báo (`{{time}}` trong `sync.indicator.synced`) | hôm nay: `14:05`; ngày khác: ngày ngắn `YYYY-MM-DD` | hôm nay: `14:05`; ngày khác: `dd/MM/yyyy` | giờ 24h theo giờ cục bộ, cùng quy tắc "giờ nhắc" |
| **(v2)** Thời điểm đồng bộ — card Account (`format.todayAt` / `format.dateAt`) | `today at 14:05`; `2026-10-08 at 09:30` | `hôm nay lúc 14:05`; `08/10/2026 lúc 09:30` | `format.ts` chọn key theo "cùng ngày cục bộ"; chưa từng đồng bộ: `settings.account.neverSynced` |

### 7.2 Chung: app, điều hướng, thành phần dùng lại, định dạng, toast

Cột **MS** = milestone cần chuỗi đó (M1 = có ngay từ M1).

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `app.name` | M1 | tên app, `<title>` mặc định, About | `1% Better per Day` | `1% Better per Day` (= en) |
| `app.shortName` | M1 | tên ngắn, `aria-label` logo, tiêu đề trang | `1% Better` | `1% Better` (= en) |
| ~~`app.brandSuffix`~~ | M1 | **(v3.1) KHÔNG CÒN DÙNG, đã bỏ khỏi `en.json`/`vi.json`.** Chữ cạnh brand mark ở sidebar nay là `app.name` (mục 5 "Brand") | ~~`Better per Day`~~ | ~~`Better per Day`~~ |
| `app.tagline` | M1 | EmptyState/About | `1% better, one day at a time.` | `Mỗi ngày tốt hơn 1%.` |
| `doc.title` | M1 | `document.title` mọi màn; `{{page}}` = tiêu đề h1 của màn | `{{page}} — 1% Better` | `{{page}} — 1% Better` (= en) |
| `nav.label` | M1 | `aria-label` của thanh điều hướng | `Main` | `Chính` |
| `nav.today` | M1 | tab | `Today` | `Hôm nay` |
| `nav.goals` | M1 | tab; link "quay lại" ở Goal form/Goal detail | `Goals` | `Mục tiêu` |
| `nav.review` | M4 | tab | `Review` | `Tổng kết` |
| `nav.settings` | M1 | tab | `Settings` | `Cài đặt` |
| `a11y.skip` | M1 | skip link | `Skip to content` | `Chuyển đến nội dung chính` |
| `a11y.required` | M1 | chữ ẩn cạnh dấu `*` | `(required)` | `(bắt buộc)` |
| `offline.chip` | M1 | OfflineChip | `Offline — saved on this device` | `Ngoại tuyến — lưu trên thiết bị` |
| `update.message` | M1 | UpdateToast (SW có bản mới) | `A new version is available.` | `Đã có phiên bản mới.` |
| `update.reload` | M1 | nút của UpdateToast | `Reload` | `Tải lại` |
| `common.loading` | M1 | SR loading (`role="status"` ẩn) | `Loading…` | `Đang tải…` |
| `common.saving` | M1 | nút đang lưu | `Saving…` | `Đang lưu…` |
| `common.working` | M3 | nút đang đọc/ghi file | `Working…` | `Đang xử lý…` |
| `common.cancel` | M1 | nút | `Cancel` | `Hủy` |
| `common.edit` | M1 | nút | `Edit` | `Sửa` |
| `common.delete` | M1 | nút | `Delete` | `Xóa` |
| `common.keep` | M1 | nút (xác nhận xoá entry) | `Keep` | `Giữ lại` |
| `common.retry` | M4 | nút | `Retry` | `Thử lại` |
| `common.tryAgain` | M1 | nút ở StorageError | `Try again` | `Thử lại` |
| `common.dismiss` | M6 | nút đóng Alert lỗi đăng nhập (v2) | `Dismiss` | `Đóng` |
| `common.emptyValue` | M3 | ghi chú rỗng trong bảng | `—` | `—` (= en) |
| `unit.min` | M1 | đơn vị sau số lớn ở card (`20/30` + đơn vị) | `min` | `phút` |
| `unit.hour` | M1 | hậu tố field "Total hours" | `h` | `giờ` |
| `format.minutes` | M1 | `{{n}}` đã định dạng | `{{n}} min` | `{{n}} phút` |
| `format.hours` | M4 | `{{n}}` đã định dạng (1 chữ số thập phân khi là thống kê) | `{{n}} h` | `{{n}} giờ` |
| `format.duration` | M1 | thời lượng ≥ 60 phút, có phần phút | `{{h}} h {{m}} min` | `{{h}} giờ {{m}} phút` |
| `format.durationHours` | M1 | thời lượng tròn giờ (bỏ phần 0) | `{{h}} h` | `{{h}} giờ` |
| `format.minSec` | M2 | gợi ý làm tròn của Stop dialog | `{{m}} min {{s}} s` | `{{m}} phút {{s}} giây` |
| `format.percent` | M1 | `{{value}}` đã định dạng | `{{value}}%` | `{{value}}%` (= en) |
| `format.dateRange` | M1 | khoảng ngày | `{{start}} – {{end}}` | `{{start}} – {{end}}` (= en) |
| `format.goalsCount_one` | M1 | cụm đếm dùng trong câu | `{{count}} goal` | — |
| `format.goalsCount_other` | M1 | | `{{count}} goals` | `{{count}} mục tiêu` |
| `format.entriesCount_one` | M1 | | `{{count}} entry` | — |
| `format.entriesCount_other` | M1 | | `{{count}} entries` | `{{count}} lần ghi` |
| `format.daysCount_one` | M1 | | `{{count}} day` | — |
| `format.daysCount_other` | M1 | | `{{count}} days` | `{{count}} ngày` |
| `format.changesCount_one` | M7 | số thay đổi chưa đồng bộ, dùng trong card Account và câu khác (v2) | `{{count}} change` | — |
| `format.changesCount_other` | M7 | | `{{count}} changes` | `{{count}} thay đổi` |
| `format.todayAt` | M7 | thời điểm đồng bộ gần nhất, cùng ngày cục bộ; `{{time}}` = `HH:MM` | `today at {{time}}` | `hôm nay lúc {{time}}` |
| `format.dateAt` | M7 | ngày khác; `{{date}}` = ngày ngắn | `{{date}} at {{time}}` | `{{date}} lúc {{time}}` |
| `toast.goalCreated` | M1 | sau tạo goal | `Goal created` | `Đã tạo mục tiêu` |
| `toast.goalUpdated` | M1 | sau sửa goal | `Goal updated` | `Đã cập nhật mục tiêu` |
| `toast.goalDeleted` | M1 | sau xóa goal | `Goal deleted` | `Đã xóa mục tiêu` |
| `toast.goalArchived` | M5 | | `Goal archived` | `Đã lưu trữ mục tiêu` |
| `toast.goalRestored` | M5 | | `Goal restored` | `Đã khôi phục mục tiêu` |
| `toast.entrySaved` | M1 | thêm entry, lưu từ timer | `Entry saved` | `Đã lưu lần ghi` |
| `toast.entryUpdated` | M1 | sửa entry | `Entry updated` | `Đã cập nhật lần ghi` |
| `toast.entryDeleted` | M1 | xóa entry | `Entry deleted` | `Đã xóa lần ghi` |
| `toast.languageChanged` | M1 | sau khi đổi ngôn ngữ (hiện bằng ngôn ngữ mới) | `Language changed` | `Đã đổi ngôn ngữ` |
| `toast.timerDiscarded` | M2 | | `Timer discarded` | `Đã bỏ phiên đếm giờ` |
| `toast.reminderTime` | M2 | | `Reminder time saved` | `Đã lưu giờ nhắc` |
| `toast.icsDownloaded` | M2 | | `Calendar file downloaded` | `Đã tải tệp lịch` |
| `toast.backupExported` | M3 | | `Backup exported` | `Đã xuất bản sao lưu` |
| `toast.backupImported` | M3 | `{{goals}}`, `{{entries}}` = cụm từ `format.goalsCount` / `format.entriesCount` | `Backup imported: {{goals}}, {{entries}}` | `Đã nhập bản sao lưu: {{goals}}, {{entries}}` |
| `toast.signedIn` | M6 | sau khi đăng nhập xong (v2); `{{email}}` nguyên văn | `Signed in as {{email}}` | `Đã đăng nhập: {{email}}` |
| `toast.signedOutKept` | M6 | sau đăng xuất giữ dữ liệu; cũng sau `Cancel` ở D5 | `Signed out. Your data is still on this device.` | `Đã đăng xuất. Dữ liệu của bạn vẫn còn trên thiết bị này.` |
| `toast.signedOutRemoved` | M6 | sau đăng xuất + xoá dữ liệu | `Signed out. Data removed from this device.` | `Đã đăng xuất. Dữ liệu đã được xóa khỏi thiết bị này.` |
| `toast.signInCancelled` | M6 | lỗi `AUTH_CANCELLED` khi quay về màn **không phải** Settings (tone error, kèm nút `settings.account.goTo`) | `Sign-in was cancelled.` | `Đã hủy đăng nhập.` |
| `toast.signInFailed` | M6 | lỗi `AUTH_FAILED` ở màn không phải Settings | `Couldn't sign you in.` | `Không đăng nhập được.` |
| `toast.mergeDone` | M7 | sau lần đồng bộ đầu tiên có gộp dữ liệu; **thay thế** `toast.signedIn` (không hiện cả hai — quy tắc một toast, mục 5); `{{goals}}`, `{{entries}}` = `format.goalsCount` / `entriesCount` của dữ liệu còn sống trên máy sau khi gộp | `Signed in. Your account now has {{goals}}, {{entries}}.` | `Đã đăng nhập. Tài khoản của bạn hiện có {{goals}}, {{entries}}.` |
| `toast.prefsFromAccount` | M7 | khi giờ nhắc hoặc ngôn ngữ được áp từ cloud (hiện bằng ngôn ngữ **mới**) | `Settings updated from your account` | `Đã cập nhật cài đặt từ tài khoản của bạn` |
| `toast.syncNowDone` | M7 | sau `Sync now` thành công; **không hiện** nếu cùng lần đó đã áp tuỳ chọn từ tài khoản (khi đó chỉ hiện `toast.prefsFromAccount`; quy tắc một toast, mục 5) | `Everything is up to date` | `Mọi thứ đã được cập nhật` |
| `plusone.live` | M5 | vùng `aria-live` khi +1% | `+1% for {{goal}} today.` | `+1% cho {{goal}} hôm nay.` |

### 7.3 Thông báo lỗi và ánh xạ `src/ui/error-messages.ts`

Nguyên tắc: nói rõ chuyện gì, và làm gì tiếp. **`src/ui/error-messages.ts`** (thay cho `src/ui/copy.ts` nêu ở bản v1; ARCH §6) ánh xạ `DomainError` (code + ngữ cảnh) → `{ key, params }` rồi UI gọi `t(key, params)`; `DomainError.message` chỉ để debug/log, không bao giờ hiển thị. Lưu **mã lỗi** trong state của form (không lưu chuỗi đã dịch) để đổi ngôn ngữ thì lỗi đang hiện đổi theo.

**Quy tắc chọn key** (biến thể thêm hậu tố `_variant` theo ARCH §5.4, không lồng):

| Code | Điều kiện | Key |
| :- | :- | :- |
| `GOAL_TARGET_INVALID` | `targetType = daily` | `errors.GOAL_TARGET_INVALID_daily` |
| | `targetType = total`, số giờ ngoài 1–10.000 hoặc không nguyên | `errors.GOAL_TARGET_INVALID_total` |
| | `targetType = total`, giờ hợp lệ nhưng `dailyTarget` > 1440 | `errors.GOAL_TARGET_INVALID_tooMuch` |
| `GOAL_PERIOD_INVALID` | ngày trống/sai định dạng | `errors.GOAL_PERIOD_INVALID` |
| | `endDate < startDate` | `errors.GOAL_PERIOD_INVALID_endBeforeStart` |
| | khoảng > 1827 ngày | `errors.GOAL_PERIOD_INVALID_tooLong` |
| | **(v4.0)** `params.variant = 'openEndedTotal'` (`endDate = null` với `targetType = total`; dự phòng, UI không để xảy ra) | `errors.GOAL_PERIOD_INVALID_openEndedTotal` (hiện dưới nhóm Ends, S3 trạng thái 5). Chuỗi rỗng/sai định dạng **không** có biến thể này: vẫn `errors.GOAL_PERIOD_INVALID` |
| `DATE_OUTSIDE_GOAL_PERIOD` | **(v4.0)** `params.end === null` (goal không thời hạn; chỉ truyền `start`) | `errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded` |
| | `params.end` là ngày (goal có hạn) | `errors.DATE_OUTSIDE_GOAL_PERIOD` (như cũ) |
| `ENTRY_DAY_LIMIT_EXCEEDED` | `remaining > 0` (truyền `remaining`) | `errors.ENTRY_DAY_LIMIT_EXCEEDED` |
| | `remaining = 0` | `errors.ENTRY_DAY_LIMIT_EXCEEDED_full` |
| mọi code khác ở bảng dưới | — | `errors.<CODE>` |
| `STORAGE_UNAVAILABLE` | khi mở DB | không dùng key `errors.*`: hiển thị màn S9 (`storageError.*`, mục 7.6) |
| lỗi ghi storage (không phải `DomainError`) | trong form/dialog/Settings | `errors.WRITE_FAILED` |
| lỗi tải chunk/đọc dữ liệu (ErrorState) | Review, Goal detail | `errors.loadViewTitle` + `errors.loadViewBody` + `common.retry` |
| code không có trong bảng | phòng hờ | `errors.UNKNOWN` |
| `NOTIFICATIONS_UNSUPPORTED` / `NOTIFICATIONS_DENIED` | mô tả dưới chip quyền ở Settings | dùng đúng các key `errors.NOTIFICATIONS_*` bên dưới |
| tóm tắt form có lỗi | đầu form | `goal.form.summary_one/_other` (mục 7.6) |
| `AUTH_*`, `SYNC_*` (v2) | Alert/dòng trong card Account | `errors.<CODE>` (không có biến thể) |
| `AUTH_CANCELLED` / `AUTH_FAILED` khi người dùng quay về màn **không phải** Settings (v2) | Toast tone error + nút `settings.account.goTo` | `toast.signInCancelled` / `toast.signInFailed` (bản ngắn); bản đầy đủ `errors.AUTH_*` vẫn nằm ở card Account (A4) |
| lỗi đồng bộ khi đăng xuất + chọn Remove (v2) | Alert trong D4 | `auth.signOut.syncFailed` (7.7.2) |
| `IMPORT_INVALID_SCHEMA` có `params.variant = 'outOfRange'` (v3.1, M5-P1) | Alert trong card Backup. Dùng khi file **đúng kiểu dữ liệu** nhưng một giá trị vượt giới hạn của app: tên > 60 hoặc why > 280 ký tự, chỉ tiêu ngày ngoài 1–1.440 hoặc giờ tổng ngoài 1–10.000, khoảng goal > 1.827 ngày, phút entry ngoài 1–1.440 hoặc không nguyên, ghi chú > 280 ký tự | `errors.IMPORT_INVALID_SCHEMA_outOfRange` |
| `IMPORT_INVALID_SCHEMA` không có `variant` (v3.1) | gốc không phải object, `app` khác, sai kiểu (vd. `minutes: "30"`), id > 64 ký tự, thiếu field | `errors.IMPORT_INVALID_SCHEMA` (như cũ) |
| lỗi khi Export (`backupService.export` ném lỗi; không phải `DomainError`) (v3.1, M3-P1) | Alert trong card Backup (S7, Tương tác "Export thất bại") | `errors.EXPORT_FAILED` (không dùng `errors.WRITE_FAILED`: câu đó nói về "thay đổi còn trong biểu mẫu") |
| **(v5.0)** `EXPORT_FAILED` khi `capabilities.nativeShare` | Alert trong card Backup (app native) | `errors.EXPORT_FAILED_native` (7.8.1) |
| **(v5.0)** `AUTH_FAILED` khi `capabilities.nativeAuth` | Alert A4 (Settings) | `errors.AUTH_FAILED_native` (7.8.2); toast ngắn ở màn khác vẫn `toast.signInFailed` |
| **(v5.0)** `ACCOUNT_DELETE_OFFLINE` / `_CANCELLED` / `_FAILED` / `_SESSION_EXPIRED` | Alert `role="alert"` trong D6 (S7 tiếp) | `errors.ACCOUNT_DELETE_<…>` (7.8.3), không biến thể |

| Key | MS | Hiển thị ở | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `errors.GOAL_NAME_REQUIRED` | M1 | dưới Name | `Enter a name for your goal.` | `Hãy nhập tên cho mục tiêu của bạn.` |
| `errors.GOAL_NAME_TOO_LONG` | M1 | dưới Name | `Name must be 60 characters or fewer.` | `Tên tối đa 60 ký tự.` |
| `errors.GOAL_WHY_TOO_LONG` | M1 | dưới Why | `Why must be 280 characters or fewer.` | `Lý do tối đa 280 ký tự.` |
| `errors.GOAL_TARGET_INVALID_daily` | M1 | dưới field phút | `Enter a whole number of minutes from 1 to 1,440.` | `Hãy nhập số phút là số nguyên từ 1 đến 1.440.` |
| `errors.GOAL_TARGET_INVALID_total` | M1 | dưới field giờ | `Enter a whole number of hours from 1 to 10,000.` | `Hãy nhập số giờ là số nguyên từ 1 đến 10.000.` |
| `errors.GOAL_TARGET_INVALID_tooMuch` | M1 | dưới field giờ | `That's more than 1,440 minutes a day for this period. Lower the hours or choose a later end date.` | `Như vậy là hơn 1.440 phút mỗi ngày trong khoảng thời gian này. Hãy giảm số giờ hoặc chọn ngày kết thúc muộn hơn.` |
| `errors.GOAL_PERIOD_INVALID` | M1 | dưới Start/End date | `Choose a valid date.` | `Hãy chọn một ngày hợp lệ.` |
| `errors.GOAL_PERIOD_INVALID_endBeforeStart` | M1 | dưới End date | `End date must be on or after the start date.` | `Ngày kết thúc phải trùng hoặc sau ngày bắt đầu.` |
| `errors.GOAL_PERIOD_INVALID_tooLong` | M1 | dưới End date | `A goal can last up to 1,827 days (about 5 years). Choose an earlier end date.` | `Một mục tiêu kéo dài tối đa 1.827 ngày (khoảng 5 năm). Hãy chọn ngày kết thúc sớm hơn.` |
| `errors.GOAL_PERIOD_INVALID_openEndedTotal` | M11 *(mới v4.0)* | dưới nhóm Ends (dự phòng; xem quy tắc chọn key ở trên) | `A Total hours goal needs an end date. Choose when it ends, or switch to Minutes per day.` | `Mục tiêu Tổng số giờ cần có ngày kết thúc. Hãy chọn ngày kết thúc, hoặc chuyển sang Phút mỗi ngày.` |
| `errors.GOAL_PERIOD_EXCLUDES_ENTRIES` | M1 | dưới Start/End date | `Some of your entries fall outside these dates. Choose dates that include every logged day, or delete those entries first.` | `Một số lần ghi của bạn nằm ngoài các ngày này. Hãy chọn khoảng thời gian bao gồm mọi ngày đã ghi, hoặc xóa các lần ghi đó trước.` |
| `errors.GOAL_NOT_FOUND` | M1 | Not found / Alert | `This goal doesn't exist anymore. It may have been deleted.` | `Mục tiêu này không còn tồn tại. Có thể nó đã bị xóa.` |
| `errors.ENTRY_NOT_FOUND` | M1 | Alert | `This entry doesn't exist anymore. It may have been deleted.` | `Lần ghi này không còn tồn tại. Có thể nó đã bị xóa.` |
| `errors.ENTRY_MINUTES_INVALID` | M1 | dưới Minutes | `Enter a whole number of minutes from 1 to 1,440.` | `Hãy nhập số phút là số nguyên từ 1 đến 1.440.` |
| `errors.ENTRY_NOTE_TOO_LONG` | M1 | dưới Note | `Note must be 280 characters or fewer.` | `Ghi chú tối đa 280 ký tự.` |
| `errors.ENTRY_DAY_LIMIT_EXCEEDED` | M1 | dưới Minutes | `A goal can have at most 1,440 minutes in one day. You can add up to {{remaining}} more for this day.` | `Mỗi mục tiêu có tối đa 1.440 phút trong một ngày. Bạn chỉ có thể thêm tối đa {{remaining}} phút cho ngày này.` |
| `errors.ENTRY_DAY_LIMIT_EXCEEDED_full` | M1 | dưới Minutes | `This day is already full (1,440 minutes).` | `Ngày này đã đầy (1.440 phút).` |
| `errors.DATE_IN_FUTURE` | M3 | Day / dialog | `You can't log time for a future date.` | `Bạn không thể ghi thời gian cho một ngày trong tương lai.` |
| `errors.DATE_OUTSIDE_GOAL_PERIOD` | M2 | Alert trong form/dialog | `That date is outside this goal's dates ({{start}} – {{end}}).` | `Ngày đó nằm ngoài thời gian của mục tiêu này ({{start}} – {{end}}).` |
| `errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded` | M11 *(mới v4.0)* | Alert trong form/dialog, khi goal không thời hạn và ngày < `startDate`; `{{start}}` = ngày ngắn của `startDate` | `That date is before this goal starts ({{start}}).` | `Ngày đó nằm trước ngày mục tiêu này bắt đầu ({{start}}).` |
| `errors.GOAL_NOT_ACTIVE` | M2 | Alert (Start timer) | `Timers can only run on active goals.` | `Chỉ có thể đếm giờ cho mục tiêu đang chạy.` |
| `errors.TIMER_ALREADY_RUNNING` | M2 | Alert | `A timer is already running. Stop it before starting another.` | `Đang có một bộ đếm giờ chạy. Hãy dừng nó trước khi bắt đầu bộ khác.` |
| `errors.TIMER_NOT_RUNNING` | M2 | Alert | `There's no timer running.` | `Hiện không có bộ đếm giờ nào đang chạy.` |
| `errors.GOAL_TIMER_RUNNING` | M5 | Alert/toast (Archive) | `Stop or discard the running timer before archiving this goal.` | `Hãy dừng hoặc bỏ bộ đếm giờ đang chạy trước khi lưu trữ mục tiêu này.` |
| `errors.IMPORT_FILE_TOO_LARGE` | M3 | Alert Backup | `This file is larger than 5 MB, so it can't be a 1% Better backup. Choose a different file. Nothing was changed.` | `Tệp này lớn hơn 5 MB nên không thể là bản sao lưu của 1% Better. Hãy chọn tệp khác. Chưa có gì bị thay đổi.` |
| `errors.IMPORT_INVALID_JSON` | M3 | Alert Backup | `This file isn't valid JSON. Choose a backup exported from 1% Better. Nothing was changed.` | `Tệp này không phải JSON hợp lệ. Hãy chọn bản sao lưu đã xuất từ 1% Better. Chưa có gì bị thay đổi.` |
| `errors.IMPORT_INVALID_SCHEMA` | M3 | Alert Backup | `This file doesn't look like a 1% Better backup. Choose a file exported from this app. Nothing was changed.` | `Tệp này không giống bản sao lưu của 1% Better. Hãy chọn tệp đã xuất từ app này. Chưa có gì bị thay đổi.` |
| `errors.IMPORT_INVALID_SCHEMA_outOfRange` | M10 *(mới v3.1)* | Alert Backup (file đúng kiểu nhưng có giá trị ngoài giới hạn; xem quy tắc chọn key ở trên) | `This backup contains a value 1% Better doesn't allow, such as a goal period longer than 1,827 days, minutes outside 1–1,440, or a name or note that's too long. Fix the file, or export a fresh backup from this app. Nothing was changed.` | `Bản sao lưu này có giá trị mà 1% Better không cho phép, ví dụ khoảng thời gian mục tiêu dài hơn 1.827 ngày, số phút ngoài khoảng 1–1.440, hoặc tên, ghi chú quá dài. Hãy sửa tệp, hoặc xuất một bản sao lưu mới từ app này. Chưa có gì bị thay đổi.` |
| `errors.EXPORT_FAILED` | M10 *(mới v3.1)* | Alert Backup, khi Export thất bại (S7 Tương tác "Export thất bại"); `role="alert"` | `Couldn't create the backup file. Your data on this device is unchanged. Try again, and if it keeps failing, check that your browser allows downloads from this site.` | `Không tạo được tệp sao lưu. Dữ liệu trên thiết bị này không thay đổi. Hãy thử lại; nếu vẫn lỗi, hãy kiểm tra xem trình duyệt có cho phép tải tệp từ trang này không.` |
| `errors.IMPORT_UNSUPPORTED_VERSION` | M3 | Alert Backup | `This backup uses a format version ({{v}}) this app can't read. Export it again from an up-to-date copy of the app. Nothing was changed.` | `Bản sao lưu này dùng phiên bản định dạng ({{v}}) mà app không đọc được. Hãy xuất lại từ bản app mới nhất. Chưa có gì bị thay đổi.` |
| `errors.IMPORT_INTEGRITY` | M3 | Alert Backup | `This backup is inconsistent (for example, entries that don't belong to any goal). Nothing was changed.` | `Bản sao lưu này không nhất quán (ví dụ: có lần ghi không thuộc mục tiêu nào). Chưa có gì bị thay đổi.` |
| `errors.WRITE_FAILED` | M1 | Alert inline trong form/dialog/Language | `Couldn't save. Your changes are still in the form — try again.` | `Không lưu được. Thay đổi của bạn vẫn còn trong biểu mẫu — hãy thử lại.` |
| `errors.loadViewTitle` | M4 | ErrorState tải chunk/dữ liệu lỗi | `Couldn't load this view` | `Không tải được màn hình này` |
| `errors.loadViewBody` | M4 | | `Check your connection if you just updated the app, then try again.` | `Nếu bạn vừa cập nhật app, hãy kiểm tra kết nối mạng rồi thử lại.` |
| `errors.NOTIFICATIONS_UNSUPPORTED` | M2 | Settings | `This browser doesn't support notifications. You'll still see a reminder banner in the app.` | `Trình duyệt này không hỗ trợ thông báo. Bạn vẫn sẽ thấy lời nhắc ngay trong app.` |
| `errors.NOTIFICATIONS_DENIED` | M2 | Settings | `Notifications are blocked for this site. Allow them in your browser's site settings, then come back. You'll still see a reminder banner in the app.` | `Thông báo đang bị chặn cho trang này. Hãy cho phép trong cài đặt trang web của trình duyệt rồi quay lại. Bạn vẫn sẽ thấy lời nhắc ngay trong app.` |
| `errors.UNKNOWN` | M1 | phòng hờ khi gặp mã lỗi chưa biết | `Something went wrong. Please try again.` | `Đã xảy ra lỗi. Hãy thử lại.` |
| `errors.AUTH_OFFLINE` | M6 | Alert A4 / mô tả nút đăng nhập khi gọi lúc offline | `You're offline. Connect to the internet, then sign in.` | `Bạn đang ngoại tuyến. Hãy kết nối mạng rồi đăng nhập.` |
| `errors.AUTH_CANCELLED` | M6 | Alert A4 (người dùng huỷ ở Google) | `Sign-in was cancelled. You're not signed in, and nothing on this device changed.` | `Bạn đã hủy đăng nhập. Bạn chưa đăng nhập và không có gì trên thiết bị này bị thay đổi.` |
| `errors.AUTH_FAILED` | M6 | Alert A4 (lỗi khác, gồm mở callback ở trình duyệt khác) | `Couldn't sign you in. Nothing on this device changed. Try again, and finish signing in in the same browser where you started.` | `Không đăng nhập được. Không có gì trên thiết bị này bị thay đổi. Hãy thử lại và hoàn tất đăng nhập trong cùng trình duyệt bạn đã bắt đầu.` |
| `errors.AUTH_SESSION_EXPIRED` | M6 | Alert A10, và nội dung `aria-live` khi hết phiên | `Your sign-in expired. Sign in again to keep syncing. Your data, including changes that haven't synced yet, is kept on this device.` | `Phiên đăng nhập của bạn đã hết hạn. Hãy đăng nhập lại để tiếp tục đồng bộ. Dữ liệu của bạn, kể cả các thay đổi chưa đồng bộ, vẫn được giữ trên thiết bị này.` |
| `errors.SYNC_OFFLINE` | M7 | Alert A8 (khi lỗi mạng giữa chu kỳ) | `You're offline. Your changes are saved on this device and will sync when you're back online.` | `Bạn đang ngoại tuyến. Thay đổi của bạn đã được lưu trên thiết bị này và sẽ được đồng bộ khi có mạng trở lại.` |
| `errors.SYNC_UNREACHABLE` | M7 | Alert A8 | `Couldn't reach your account just now. Your changes are safe on this device. We'll try again soon, or you can tap Sync now.` | `Hiện chưa kết nối được tới tài khoản của bạn. Thay đổi của bạn vẫn an toàn trên thiết bị này. App sẽ tự thử lại, hoặc bạn có thể bấm Đồng bộ ngay.` |
| `errors.SYNC_UNAUTHORIZED` | M7 | Alert (hiếm: trước khi `AuthState` kịp chuyển `expired`) | `Your sign-in is no longer valid. Sign in again to keep syncing. Your data on this device is safe.` | `Phiên đăng nhập không còn hợp lệ. Hãy đăng nhập lại để tiếp tục đồng bộ. Dữ liệu trên thiết bị này vẫn an toàn.` |
| `errors.SYNC_REMOTE_INVALID` | M7 | dòng thông tin A9 (không phải lỗi chặn) | `Some items from your account couldn't be read and were skipped. Everything else is synced.` | `Một số mục từ tài khoản của bạn không đọc được nên đã bị bỏ qua. Mọi thứ còn lại đã được đồng bộ.` |

### 7.4 Empty state

Quy ước key (luật 2, mục 7.0): `<key>` = tiêu đề, `<key>Body` = nội dung, `<key>Action` = nhãn nút. Dòng không có tiêu đề/nút thì chỉ có `Body` hoặc chỉ có key đơn.

| Key | MS | Màn hình | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `empty.today.noGoals` | M1 | Today — tiêu đề | `Start with one small goal` | `Bắt đầu với một mục tiêu nhỏ` |
| `empty.today.noGoalsBody` | M1 | Today — nội dung | `Pick something you want to do a little every day. Log your time and watch it add up.` | `Chọn một việc bạn muốn làm một chút mỗi ngày. Ghi lại thời gian và xem nó dày lên theo ngày.` |
| `empty.today.noGoalsAction` | M1 | Today — nút | `Create your first goal` | `Tạo mục tiêu đầu tiên` |
| `empty.today.noActive` | M1 | Today (có goal nhưng không goal active) — tiêu đề | `No active goals today` | `Hôm nay chưa có mục tiêu nào đang chạy` |
| `empty.today.noActiveBody` | M1 | — nội dung | `Your goals haven't started yet, have ended, or are archived.` | `Các mục tiêu của bạn chưa bắt đầu, đã kết thúc hoặc đã được lưu trữ.` |
| `empty.today.noActiveAction` | M1 | — nút | `View goals` | `Xem mục tiêu` |
| `empty.goals` | M1 | Goals — tiêu đề | `No goals yet` | `Chưa có mục tiêu nào` |
| `empty.goalsBody` | M1 | Goals — nội dung | `Pick something you want to do a little every day. Log your time and watch it add up.` | `Chọn một việc bạn muốn làm một chút mỗi ngày. Ghi lại thời gian và xem nó dày lên theo ngày.` |
| `empty.goalsAction` | M1 | Goals — nút | `Create your first goal` | `Tạo mục tiêu đầu tiên` |
| `empty.review` | M4 | Review (chưa có goal) — tiêu đề | `Nothing to review yet` | `Chưa có gì để xem lại` |
| `empty.reviewBody` | M4 | — nội dung | `Create a goal and log some time. Your year will show up here.` | `Hãy tạo một mục tiêu và ghi chút thời gian. Cả năm của bạn sẽ hiện ra ở đây.` |
| `empty.reviewAction` | M4 | — nút | `Create a goal` | `Tạo mục tiêu` |
| `empty.reviewYear` | M4 | Review (có goal, chưa entry trong năm) — dòng chữ | `No time logged in {{year}} yet.` | `Năm {{year}} chưa có thời gian nào được ghi.` |
| `empty.detail.history` | M3 | Goal detail — tiêu đề | `No entries yet` | `Chưa có lần ghi nào` |
| `empty.detail.historyBody` | M3 | — nội dung | `Time you log for this goal will show up here.` | `Thời gian bạn ghi cho mục tiêu này sẽ hiện ở đây.` |
| `empty.detail.curve` | M9 *(sửa v3: chuỗi mới)* | Goal detail (chưa entry) — dòng 2 của phụ đề, thay câu số liệu | `Your line starts on the first day you log time. That day is your starting point (0%).` | `Đường của bạn bắt đầu từ ngày đầu tiên bạn ghi thời gian. Ngày đó là điểm xuất phát (0%).` |
| `empty.day.noGoals` | M3 | Day — tiêu đề. **(v3.1, M8 QC)** Chốt **không có dấu chấm cuối** ở cả `en` và `vi`, khớp `en.json`/`vi.json` đã ship; quy ước chung: tiêu đề EmptyState không kết thúc bằng dấu chấm, `…Body` là câu đầy đủ có dấu chấm. Chỗ S5 từng ghi có dấu chấm đã sửa | `No goals were running on this day` | `Không có mục tiêu nào đang chạy trong ngày này` |
| `empty.day.noGoalsBody` | M3 | — nội dung | `Goals show up here on the days they're active.` | `Mục tiêu sẽ hiện ở đây vào những ngày chúng đang chạy.` |
| `empty.day.noGoalsAction` | M3 | — nút | `View goals` | `Xem mục tiêu` |
| `empty.day.noEntries` | M3 | Day (một goal chưa có entry) — dòng chữ; nút dùng `goalCard.addEntry` | `No time logged for this goal on this day.` | `Chưa ghi thời gian nào cho mục tiêu này trong ngày này.` |

### 7.5 Banner, nhắc nhở, notification, `.ics`, heatmap

Chuỗi sinh **ngoài React** (notification, `.ics`) được dịch bằng `Translator` theo ngôn ngữ đang chọn tại thời điểm gửi/tải (A-19). Notification: `title` = `notification.title`, `body` = `notification.body`; mỗi goal trong danh sách dùng `notification.item`, tối đa 3 goal, nối bằng `, `; nếu còn nữa thì bọc bằng `notification.more` (ví dụ `en`: `3 goals left today: Read 0/30 min, Guitar 0/20 min, Spanish 0/17 min` — 4 goal trở lên: `4 goals left today: Read 0/30 min, Guitar 0/20 min, Spanish 0/17 min, and 1 more`).

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `reminder.banner_one` | M2 | Today banner (1 goal); `{{time}}` = `HH:MM` | `It's past {{time}} — 1 goal is not on target yet.` | — |
| `reminder.banner_other` | M2 | Today banner (nhiều goal) | `It's past {{time}} — {{count}} goals are not on target yet.` | `Đã quá {{time}} — còn {{count}} mục tiêu chưa đạt chỉ tiêu.` |
| `reminder.bannerLabel` | M2 | `aria-label` của banner nhắc | `Reminder` | `Nhắc nhở` |
| `backup.banner.never` | M3 | Today (có nút), Settings (không nút) | `You haven't backed up yet. Export a backup so your data is safe if this browser clears it.` | `Bạn chưa sao lưu lần nào. Hãy xuất một bản sao lưu để dữ liệu vẫn an toàn nếu trình duyệt xóa dữ liệu.` |
| `backup.banner.old` | M3 | Today (có nút), Settings (không nút); `{{n}}` > 30 | `It's been {{n}} days since your last backup.` | `Đã {{n}} ngày kể từ lần sao lưu gần nhất.` |
| `backup.banner.action` | M3 | nút chỉ ở Today (→ `#/settings`) | `Back up now` | `Sao lưu ngay` |
| `notification.title` | M2 | tiêu đề notification | `1% Better` | `1% Better` (= en) |
| `notification.body_one` | M2 | thân notification, 1 goal; `{{list}}` ghép từ `notification.item` | `1 goal left today: {{list}}` | — |
| `notification.body_other` | M2 | | `{{count}} goals left today: {{list}}` | `Hôm nay còn {{count}} mục tiêu: {{list}}` |
| `notification.item` | M2 | một goal trong danh sách | `{{goal}} {{current}}/{{target}} min` | `{{goal}} {{current}}/{{target}} phút` |
| `notification.more` | M2 | khi > 3 goal; `{{items}}` = 3 item nối `, `, `{{k}}` = số còn lại | `{{items}}, and {{k}} more` | `{{items}} và {{k}} mục tiêu nữa` |
| `ics.summary` | M2 | `SUMMARY` của sự kiện lịch | `1% Better — log today's time` | `1% Better — ghi thời gian hôm nay` |
| `ics.alarm` | M2 | `DESCRIPTION` của `VALARM` | `Log today's time in 1% Better.` | `Hãy ghi thời gian hôm nay trong 1% Better.` |
| `heatmap.cell.goalMet` | M4 | tên truy cập ô (một goal); `{{date}}` = ngày dài có năm, `{{minutes}}` = `format.minutes` | `{{date}}: {{minutes}}, target met` | `{{date}}: {{minutes}}, đã đạt chỉ tiêu` |
| `heatmap.cell.goalNotMet` | M4 | ô có phút nhưng chưa đạt | `{{date}}: {{minutes}}, target not met` | `{{date}}: {{minutes}}, chưa đạt chỉ tiêu` |
| `heatmap.cell.all` | M4 | All goals, đạt (ít nhất một goal đạt) | `{{date}}: {{minutes}}, target met` | `{{date}}: {{minutes}}, đã đạt chỉ tiêu` |
| `heatmap.cell.allNotMet` | M4 | All goals, có phút nhưng không goal nào đạt | `{{date}}: {{minutes}}, target not met` | `{{date}}: {{minutes}}, chưa đạt chỉ tiêu` |
| `heatmap.cell.none` | M4 | ô không có entry (trong khoảng) | `{{date}}: no time logged` | `{{date}}: chưa ghi thời gian` |
| `heatmap.cell.future` | M4 | ô tương lai | `{{date}}: upcoming` | `{{date}}: sắp tới` |
| `heatmap.cell.outside` | M4 | ngoài khoảng goal | `{{date}}: outside this goal's dates` | `{{date}}: ngoài thời gian của mục tiêu này` |
| `heatmap.aria` | M4 | `aria-label` của lưới; `{{goal}}` = tên goal hoặc `review.goal.all` | `Activity heatmap for {{year}}, {{goal}}` | `Biểu đồ nhiệt hoạt động năm {{year}}, {{goal}}` |
| `heatmap.legendLess` | M4 | chú giải | `Less` | `Ít hơn` |
| `heatmap.legendMore` | M4 | chú giải | `More` | `Nhiều hơn` |
| `heatmap.legendAll` | M4 | cạnh chú giải (All goals) | `Colors show total minutes per day.` | `Màu thể hiện tổng số phút mỗi ngày.` |
| `heatmap.legendGoal` | M4 | cạnh chú giải (một goal) | `Colors show the share of your daily target.` | `Màu thể hiện tỷ lệ so với chỉ tiêu ngày của bạn.` |
| `heatmap.summary` | M4 | tóm tắt trên lưới; `{{logged}}`, `{{met}}`, `{{streak}}` = `format.daysCount` | `In {{year}} you logged time on {{logged}} and hit your target on {{met}}. Longest streak: {{streak}}.` | `Năm {{year}}, bạn đã ghi thời gian trong {{logged}} và đạt chỉ tiêu trong {{met}}. Chuỗi dài nhất: {{streak}}.` |
| `chart.bar.weeklySummary` | M4 | tóm tắt chart cột tuần (SR, hiển thị) | `Last 12 weeks: {{total}} logged, busiest week starting {{date}} with {{max}}.` | `12 tuần gần nhất: đã ghi {{total}}, tuần nhiều nhất bắt đầu từ {{date}} với {{max}}.` |
| `chart.bar.monthlySummary` | M4 | tóm tắt chart cột tháng | `{{year}}: {{total}} logged, busiest month {{month}} with {{max}}.` | `Năm {{year}}: đã ghi {{total}}, tháng nhiều nhất là {{month}} với {{max}}.` |
| `chart.bar.colWeek` | M4 | tiêu đề cột bảng ẩn | `Week starting` | `Tuần bắt đầu` |
| `chart.bar.colMonth` | M4 | | `Month` | `Tháng` |
| `chart.bar.colTime` | M4 | | `Time logged` | `Thời gian đã ghi` |
| `chart.bar.tooltip` | M4 | tooltip/`<title>` cột; `{{label}}` = khoảng ngày hoặc tháng, `{{value}}` = `format.duration` | `{{label}}: {{value}}` | `{{label}}: {{value}}` (= en) |
| `chart.bar.empty` | M4 | thay tóm tắt khi không có dữ liệu | `No time logged in this range.` | `Chưa ghi thời gian nào trong khoảng này.` |

### 7.6 Chuỗi theo màn hình

Mọi bảng dưới có cùng cột như 7.2. Dòng `_one` có `vi` = `—` (không tạo key). `(= en)` nghĩa là `vi` giống hệt `en`.

#### 7.6.1 Today (S1), GoalCard, Entry — M1 (timer M2; streak M4)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `today.title` | M1 | h1 | `Today` | `Hôm nay` |
| `today.summary_one` | M1 | tóm tắt khi có đúng 1 goal | `{{n}} of 1 goal on target` | — |
| `today.summary_other` | M1 | `{{n}}` = số goal đạt, `{{count}}` = tổng | `{{n}} of {{count}} goals on target` | `Đã đạt {{n}}/{{count}} mục tiêu` |
| `today.allOnTarget_one` | M1 | mọi goal đạt, 1 goal | `Goal on target — a little better than yesterday.` | — |
| `today.allOnTarget_other` | M1 | mọi goal đạt | `All {{count}} goals on target — a little better than yesterday.` | `Đạt cả {{count}} mục tiêu — tốt hơn hôm qua một chút.` |
| `today.streak` | M4 | chip streak tổng | `{{n}}-day streak` | `Chuỗi {{n}} ngày` |
| `today.goalsLabel` | M1 | `aria-label` danh sách card | `Goals for today` | `Mục tiêu hôm nay` |
| `today.pastDayLink` | M3 | link → Day | `Missed a day? Log time for a past day` | `Quên ghi một ngày? Ghi bù cho ngày đã qua` |
| `goalCard.amount` | M1 | số lớn; đơn vị là `unit.min` | `{{current}}/{{target}}` | `{{current}}/{{target}}` (= en) |
| `goalCard.subtitleTotal` | M1 | phụ đề goal loại `total` | `{{daily}} min/day · {{hours}} h total` | `{{daily}} phút/ngày · tổng {{hours}} giờ` |
| `goalCard.toGo` | M1 | chưa đạt | `{{n}} min to go` | `Còn {{n}} phút` |
| `goalCard.reached` | M1 | đạt | `Target reached` | `Đã đạt chỉ tiêu` |
| `goalCard.reachedExtra` | M1 | vượt chỉ tiêu | `Target reached · {{n}} min extra` | `Đã đạt chỉ tiêu · vượt {{n}} phút` |
| `goalCard.plusOne` | M1 | chữ trong pill | `+1%` | `+1%` (= en) |
| `goalCard.plusOneSrToday` | M1 | chữ ẩn cạnh pill (Today) | `Target reached for today` | `Hôm nay đã đạt chỉ tiêu` |
| `goalCard.plusOneSrDay` | M3 | chữ ẩn cạnh pill (Day) | `Target reached` | `Đã đạt chỉ tiêu` |
| `goalCard.progressLabel` | M1 | `aria-label` progressbar (Today) | `{{goal}} today` | `{{goal}} hôm nay` |
| `goalCard.progressLabelDay` | M3 | `aria-label` progressbar (Day) | `{{goal}} on {{date}}` | `{{goal}} ngày {{date}}` |
| `goalCard.progressValue` | M1 | `aria-valuetext` | `{{current}} of {{target}} minutes` | `{{current}} trên {{target}} phút` |
| `goalCard.logTime` | M1 | nút | `Log time` | `Ghi thời gian` |
| `goalCard.addEntry` | M3 | nút (Day) | `Add entry` | `Thêm lần ghi` |
| `goalCard.startTimer` | M2 | nút (vi cố ý gọn, xem 3.4) | `Start timer` | `Đếm giờ` |
| `goalCard.timerDisabled` | M2 | lý do nút Start bị vô hiệu | `Stop the running timer first.` | `Hãy dừng bộ đếm giờ đang chạy trước.` |
| `goalCard.timerRunningBadge` | M2 | badge trên card đang chạy timer | `Timer running` | `Đang đếm giờ` |
| `entry.listTitle` | M1 | h3 danh sách entry | `Today's entries` | `Các lần ghi hôm nay` |
| `entry.form.minutesLabel` | M1 | label | `Minutes` | `Số phút` |
| `entry.form.minutesPlaceholder` | M1 | placeholder | `e.g. 25` | `Ví dụ: 25` |
| `entry.form.noteLabel` | M1 | label | `Note (optional)` | `Ghi chú (không bắt buộc)` |
| `entry.form.notePlaceholder` | M1 | placeholder | `What did you work on?` | `Bạn đã làm gì?` |
| `entry.form.counter` | M1 | bộ đếm ký tự | `{{n}}/280` | `{{n}}/280` (= en) |
| `entry.form.save` | M1 | nút (cả trong Stop dialog) | `Save entry` | `Lưu lần ghi` |
| `entry.form.saveChanges` | M1 | nút khi sửa | `Save changes` | `Lưu thay đổi` |
| `entry.form.labelAdd` | M1 | `aria-label` form (Today) | `Log time for {{goal}}` | `Ghi thời gian cho {{goal}}` |
| `entry.form.labelAddDay` | M3 | `aria-label` form (Day) | `Add entry for {{goal}} on {{date}}` | `Thêm lần ghi cho {{goal}} ngày {{date}}` |
| `entry.form.labelEdit` | M1 | `aria-label` form sửa | `Edit entry for {{goal}}` | `Sửa lần ghi của {{goal}}` |
| `entry.row.summary` | M1 | `{{minutes}}` = `format.minutes`, `{{note}}` = ghi chú người dùng | `{{minutes}}, {{note}}` | `{{minutes}}, {{note}}` (= en) |
| `entry.row.summaryNoNote` | M1 | entry không có ghi chú | `{{minutes}}` | `{{minutes}}` (= en) |
| `entry.row.editAria` | M1 | `aria-label` nút icon; `{{summary}}` = một trong hai key trên | `Edit entry: {{summary}}` | `Sửa lần ghi: {{summary}}` |
| `entry.row.deleteAria` | M1 | `aria-label` nút icon | `Delete entry: {{summary}}` | `Xóa lần ghi: {{summary}}` |
| `entry.row.confirmTitle` | M1 | xác nhận xóa inline (kèm `common.delete` / `common.keep`) | `Delete this entry?` | `Xóa lần ghi này?` |
| `entry.row.confirmAria` | M1 | `aria-label` nhóm xác nhận | `Confirm delete: {{summary}}` | `Xác nhận xóa: {{summary}}` |
| `entry.source.manual` | M3 | badge nguồn | `Manual` | `Thủ công` |
| `entry.source.timer` | M3 | badge nguồn | `Timer` | `Đếm giờ` |

#### 7.6.2 Goals (S2) và dialog xóa goal (D2) — M1 (Archive/Restore M5; hàng không thời hạn M11)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `goals.title` | M1 | h1 | `Goals` | `Mục tiêu` |
| `goals.new` | M1 | nút primary | `New goal` | `Mục tiêu mới` |
| `goals.groupActive` | M1 | h2 nhóm | `Active ({{n}})` | `Đang chạy ({{n}})` |
| `goals.groupUpcoming` | M1 | h2 nhóm | `Upcoming ({{n}})` | `Sắp tới ({{n}})` |
| `goals.groupEnded` | M1 | h2 nhóm | `Ended ({{n}})` | `Đã kết thúc ({{n}})` |
| `goals.groupArchived` | M5 | h2 nhóm | `Archived ({{n}})` | `Đã lưu trữ ({{n}})` |
| `goal.status.active` | M1 | badge | `Active` | `Đang chạy` |
| `goal.status.upcoming` | M1 | badge | `Upcoming` | `Sắp tới` |
| `goal.status.ended` | M1 | badge | `Ended` | `Đã kết thúc` |
| `goal.status.archived` | M5 | badge | `Archived` | `Đã lưu trữ` |
| `goals.startsOn` | M1 | dòng phụ goal upcoming | `Starts {{date}}` | `Bắt đầu {{date}}` |
| `goals.endedOn` | M1 | dòng phụ goal ended | `Ended {{date}}` | `Đã kết thúc {{date}}` |
| `goals.rowDaily` | M1 | `{{range}}` = `format.dateRange` | `{{n}} min/day · {{range}}` | `{{n}} phút/ngày · {{range}}` |
| `goals.rowTotal` | M1 | | `{{daily}} min/day ({{hours}} h total) · {{range}}` | `{{daily}} phút/ngày (tổng {{hours}} giờ) · {{range}}` |
| `goals.rowDailyOpen` | M11 *(mới v4.0)* | hàng goal `daily` không thời hạn, ở Goals **và** dòng khoảng thời gian đầu trang Goal detail; `{{n}}` = `f.number(targetMinutes)`, `{{start}}` = `f.dateShort(startDate)` (`en` `2026-10-01`, `vi` `01/10/2026`). Dùng cho mọi trạng thái (Active/Upcoming/Archived); **không bao giờ** đi cùng `goals.endedOn` | `{{n}} min/day · from {{start}}, no end date` | `{{n}} phút/ngày · từ {{start}}, không có thời hạn` |
| `goals.archive` | M5 | nút | `Archive` | `Lưu trữ` |
| `goals.restore` | M5 | nút | `Restore` | `Khôi phục` |
| `goal.delete.title` | M1 | D2 | `Delete "{{name}}"?` | `Xóa mục tiêu "{{name}}"?` |
| `goal.delete.bodyNoEntries` | M1 | D2, goal 0 entry | `This permanently deletes the goal. It has no entries yet. This can't be undone.` | `Thao tác này xóa vĩnh viễn mục tiêu. Mục tiêu chưa có lần ghi nào. Bạn không thể hoàn tác.` |
| `goal.delete.body_one` | M1 | D2, đúng 1 entry | `This permanently deletes the goal and its 1 entry. This can't be undone.` | — |
| `goal.delete.body_other` | M1 | D2, nhiều entry | `This permanently deletes the goal and its {{count}} entries. This can't be undone.` | `Thao tác này xóa vĩnh viễn mục tiêu và {{count}} lần ghi của nó. Bạn không thể hoàn tác.` |
| `goal.delete.timerNote` | M2 | đoạn riêng thêm khi có timer chạy | `Its running timer will be discarded.` | `Bộ đếm giờ đang chạy của mục tiêu này sẽ bị bỏ.` |
| `goal.delete.confirm` | M1 | nút danger | `Delete goal` | `Xóa mục tiêu` |

#### 7.6.3 Goal form (S3) — M1 (radio "No end date" và ghi chú: M11)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `goal.form.titleNew` | M1 | h1 (tạo) | `New goal` | `Mục tiêu mới` |
| `goal.form.titleEdit` | M1 | h1 (sửa) | `Edit goal` | `Sửa mục tiêu` |
| `goal.form.srNew` | M1 | `aria-label`/chữ ẩn của form (tạo) | `New goal form` | `Biểu mẫu mục tiêu mới` |
| `goal.form.srEdit` | M1 | (sửa) | `Edit goal form` | `Biểu mẫu sửa mục tiêu` |
| `goal.form.summary_one` | M1 | `role="alert"` đầu form | `Fix 1 field to save.` | — |
| `goal.form.summary_other` | M1 | | `Fix {{count}} fields to save.` | `Cần sửa {{count}} ô nhập để lưu.` |
| `goal.form.nameLabel` | M1 | label | `Name` | `Tên` |
| `goal.form.namePlaceholder` | M1 | placeholder | `e.g. Read` | `Ví dụ: Đọc sách` |
| `goal.form.nameCounter` | M1 | counter | `{{n}}/60` | `{{n}}/60` (= en) |
| `goal.form.whyLabel` | M1 | label | `Why (optional)` | `Lý do (không bắt buộc)` |
| `goal.form.whyPlaceholder` | M1 | placeholder | `Why does this matter to you?` | `Vì sao điều này quan trọng với bạn?` |
| `goal.form.whyCounter` | M1 | counter | `{{n}}/280` | `{{n}}/280` (= en) |
| `goal.form.targetLegend` | M1 | legend | `Target` | `Chỉ tiêu` |
| `goal.form.targetDaily` | M1 | lựa chọn + label field số | `Minutes per day` | `Phút mỗi ngày` |
| `goal.form.targetTotal` | M1 | lựa chọn + label field số | `Total hours` | `Tổng số giờ` |
| `goal.form.hintDaily` | M1 | hint; `{{days}}` = `format.daysCount` | `That's {{total}} min ({{hours}} h) over {{days}}.` | `Tổng cộng {{total}} phút ({{hours}} giờ) trong {{days}}.` |
| `goal.form.hintTotal` | M1 | hint | `That's about {{daily}} min per day over {{days}}.` | `Khoảng {{daily}} phút mỗi ngày trong {{days}}.` |
| `goal.form.startLabel` | M1 | label | `Start date` | `Ngày bắt đầu` |
| `goal.form.startHint` | M1 | chế độ sửa, goal đã có entry | `Your entries run from {{first}} to {{last}}, so the period must include those dates.` | `Các lần ghi của bạn kéo dài từ {{first}} đến {{last}}, nên khoảng thời gian phải bao gồm các ngày đó.` |
| `goal.form.endsLegend` | M1 | legend | `Ends` | `Kết thúc` |
| `goal.form.endsThisYear` | M1 | radio | `This year — ends {{date}}` | `Trong năm nay — kết thúc {{date}}` |
| `goal.form.endsSpecific` | M1 | radio | `On a specific date` | `Vào một ngày cụ thể` |
| `goal.form.endLabel` | M1 | label field ngày | `End date` | `Ngày kết thúc` |
| `goal.form.endsNever` | M11 *(mới v4.0)* | radio **thứ ba** (cuối nhóm Ends); `vi` là nguyên văn yêu cầu của user 2026-10-19 (A-56) | `No end date` | `Không có thời hạn` |
| `goal.form.endsNeverHint` | M11 *(mới v4.0)* | `.hint` dưới radio thứ ba, **chỉ khi đang chọn** (Target = Minutes per day); `id` nối `aria-describedby` của radio | `The goal keeps running every day until you archive or delete it. Progress is measured up to today.` | `Mục tiêu chạy mỗi ngày cho đến khi bạn lưu trữ hoặc xóa nó. Tiến độ được tính đến hôm nay.` |
| `goal.form.endsNeverTotalNote` | M11 *(mới v4.0)* | `.hint` dưới radio thứ ba **luôn hiện khi radio bị khoá** (Target = Total hours); nối `aria-describedby` | `Only available for Minutes per day. Total hours needs an end date to work out your daily target.` | `Chỉ dùng được với Phút mỗi ngày. Tổng số giờ cần có ngày kết thúc để tính chỉ tiêu mỗi ngày.` |
| `goal.form.endsNeverSwitched` | M11 *(mới v4.0)* | vùng `role="status"` sr-only trong fieldset Ends; đặt nội dung **một lần** khi Ends bị ép từ "No end date" sang "This year" do đổi Target sang Total hours; xoá khi đổi Target về Minutes per day | `Ends changed to This year, because No end date only works with Minutes per day.` | `Mục Kết thúc đã chuyển sang Trong năm nay, vì Không có thời hạn chỉ dùng được với Phút mỗi ngày.` |
| `goal.form.save` | M1 | nút primary (tạo) | `Save goal` | `Lưu mục tiêu` |
| `goal.form.saveChanges` | M1 | nút primary (sửa) | `Save changes` | `Lưu thay đổi` |

#### 7.6.4 Goal detail (S4) và stat card dùng chung — M3 (lịch sử), M5 (phần còn lại), M4 (`stat.*` ở Review), M11 (biến thể goal không thời hạn)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `goal.detail.eyebrow` | M5 | nhãn nhỏ trên headline | `Your 1% curve` | `Đường cong 1% của bạn` |
| `goal.detail.headline` | M9 *(sửa: dấu nằm trong `{{value}}`)* | headline khi `headlinePercent` ≥ 0 (kể cả `+0.0`); `{{value}}` = % **có dấu** (7.1), vd. `+440.0`; màu `--primary` | `{{value}}% better` | `Tốt hơn {{value}}%` |
| `goal.detail.headlineDown` | M9 *(mới)* | headline khi `headlinePercent` < 0; `{{value}}` = % có dấu, vd. `−40.0`; màu `--text` (không đỏ) | `{{value}}% vs your first day` | `{{value}}% so với ngày đầu` |
| `goal.detail.subDay` | M9 *(mới)* | phụ đề dòng 1 (mọi trạng thái trừ upcoming); `{{k}}` = `elapsedDays`, `{{total}}` = `periodDays` | `Day {{k}} of {{total}}` | `Ngày {{k}}/{{total}}` |
| `goal.detail.subDayOpen` | M11 *(mới v4.0)* | như `subDay` nhưng cho goal **không thời hạn** (không có tổng); `{{k}}` = `elapsedDays` (đã qua `f.number`, vd. `9`, `1,828`) | `Day {{k}}` | `Ngày {{k}}` |
| `goal.detail.subToday` | M9 *(mới)* | phụ đề dòng 2: ≥ 2 ngày có ghi và `latest.date` = hôm nay. `{{minutes}}`, `{{prevMinutes}}`, `{{firstMinutes}}` = `format.minutes`; `{{change}}` = `latestChangePercent` có dấu (7.1); `{{prevDate}}`, `{{firstDate}}` = ngày ngắn không năm (`Oct 12` / `12 thg 10`); `{{factor}}` = `f.factor(actualFactor)` | `Today: {{minutes}}, {{change}}% vs {{prevDate}} ({{prevMinutes}}). ×{{factor}} since {{firstDate}} ({{firstMinutes}}).` | `Hôm nay: {{minutes}}, {{change}}% so với {{prevDate}} ({{prevMinutes}}). ×{{factor}} kể từ {{firstDate}} ({{firstMinutes}}).` |
| `goal.detail.subEarlier` | M9 *(mới)* | phụ đề dòng 2: ≥ 2 ngày có ghi và `latest.date` ≠ hôm nay (đường đi ngang, goal đã kết thúc…); thêm `{{date}}` = ngày ngắn không năm của `latest.date`; các biến khác như `subToday` | `Last logged {{date}}: {{minutes}}, {{change}}% vs {{prevDate}} ({{prevMinutes}}). ×{{factor}} since {{firstDate}} ({{firstMinutes}}).` | `Lần ghi gần nhất {{date}}: {{minutes}}, {{change}}% so với {{prevDate}} ({{prevMinutes}}). ×{{factor}} kể từ {{firstDate}} ({{firstMinutes}}).` |
| `goal.detail.subStart` | M9 *(mới)* | phụ đề dòng 2: chỉ một ngày có ghi (`previous = null`); `{{minutes}}` = `format.minutes`, `{{date}}` = ngày ngắn không năm. **Không chứa `×`** | `Starting point: {{minutes}} on {{date}}. Your line moves once you log on another day.` | `Điểm xuất phát: {{minutes}} vào {{date}}. Đường của bạn sẽ di chuyển khi bạn ghi thêm vào một ngày khác.` |
| `goal.detail.chartTitle` | M5 | h2 | `Ideal vs. you` | `Lý tưởng và thực tế` |
| `goal.detail.rangeLegend` | M5 | legend ẩn | `Range` | `Phạm vi` |
| `goal.detail.rangeWhole` | M5 | lựa chọn | `Whole period` | `Cả giai đoạn` |
| `goal.detail.rangeSoFar` | M5 | lựa chọn | `So far` | `Đến nay` |
| `goal.detail.chartCaption` | M9 *(sửa chữ)* | `figcaption` ẩn | `Line chart comparing the ideal +1% a day curve with how your logged time changes from day to day` | `Biểu đồ đường so sánh đường lý tưởng +1% mỗi ngày với mức thay đổi thời gian bạn ghi qua từng ngày` |
| `goal.detail.legendIdeal` | M5 | legend | `Ideal (+1% every day)` | `Lý tưởng (+1% mỗi ngày)` |
| `goal.detail.legendYou` | M9 *(sửa chữ)* | legend; bỏ "+1% vào ngày đạt chỉ tiêu" | `You (vs. previous logged day, compounded)` | `Bạn (so với ngày có ghi trước, nhân dồn)` |
| `goal.detail.legendZero` | M9 *(mới)* | legend mục 3 (mẫu nét: vạch 0% liền, đậm) | `0% = your first logged day` | `0% = ngày có ghi đầu tiên` |
| `goal.detail.chartSummary` | M9 *(sửa: bỏ `{{n}}`, dấu trong `{{x}}`/`{{y}}`)* | tóm tắt hiển thị dưới chart (SR) khi có ≥ 1 ngày có ghi; `{{x}}` = `headlinePercent` có dấu, `{{y}}` = `idealPercent` có dấu | `Day {{k}} of {{total}}: your line is {{x}}% compared with your first logged day. The ideal line is {{y}}%.` | `Ngày {{k}}/{{total}}: đường của bạn ở mức {{x}}% so với ngày có ghi đầu tiên. Đường lý tưởng ở mức {{y}}%.` |
| `goal.detail.chartSummaryEmpty` | M9 *(mới)* | như trên khi chưa có entry (`baseline = null`) | `Day {{k}} of {{total}}: nothing logged yet. The ideal line is {{y}}%.` | `Ngày {{k}}/{{total}}: chưa ghi gì. Đường lý tưởng ở mức {{y}}%.` |
| `goal.detail.chartSummaryOpen` | M11 *(mới v4.0)* | như `chartSummary` cho goal không thời hạn (có ≥ 1 ngày có ghi); `{{k}}` = `elapsedDays`; `{{x}}`, `{{y}}` như `chartSummary` | `Day {{k}}: your line is {{x}}% compared with your first logged day. The ideal line is {{y}}%.` | `Ngày {{k}}: đường của bạn ở mức {{x}}% so với ngày có ghi đầu tiên. Đường lý tưởng ở mức {{y}}%.` |
| `goal.detail.chartSummaryEmptyOpen` | M11 *(mới v4.0)* | như `chartSummaryEmpty` cho goal không thời hạn (chưa có entry) | `Day {{k}}: nothing logged yet. The ideal line is {{y}}%.` | `Ngày {{k}}: chưa ghi gì. Đường lý tưởng ở mức {{y}}%.` |
| `goal.detail.chartNote` | M9 *(sửa chữ)* | chú thích dưới chart (giải thích: so với ngày có ghi trước, nhân dồn, ngày trống đi ngang, có thể đi xuống) | `Each day you log is compared with your previous logged day, and the changes multiply from your first day. Days without time keep the line flat. Logging less than before moves it down.` | `Mỗi ngày bạn ghi được so với ngày có ghi trước đó, và các thay đổi được nhân dồn từ ngày đầu tiên. Ngày không ghi thời gian thì đường đi ngang. Ghi ít hơn trước thì đường đi xuống.` |
| `goal.detail.tooltipChange` | M9 *(mới; thay `tooltip`)* | tooltip / đọc bằng phím: ngày có ghi và `changePercent` ≠ null; `{{date}}` = ngày ngắn không năm, `{{minutes}}` = `format.minutes`, `{{change}}`, `{{you}}`, `{{ideal}}` = % có dấu | `{{date}} · {{minutes}}, {{change}}% vs previous logged day · You {{you}}% since your first day · Ideal {{ideal}}%` | `{{date}} · {{minutes}}, {{change}}% so với ngày có ghi trước · Bạn {{you}}% so với ngày đầu · Lý tưởng {{ideal}}%` |
| `goal.detail.tooltipBase` | M9 *(mới)* | tooltip: ngày đầu tiên có ghi (`logged`, `changePercent` = null) | `{{date}} · {{minutes}}, your first logged day · You {{you}}% · Ideal {{ideal}}%` | `{{date}} · {{minutes}}, ngày có ghi đầu tiên · Bạn {{you}}% · Lý tưởng {{ideal}}%` |
| `goal.detail.tooltipFlat` | M9 *(mới)* | tooltip: ngày không ghi (`logged` = false), đã tới hạn (có điểm "Bạn") | `{{date}} · Nothing logged, the line stays flat · You {{you}}% · Ideal {{ideal}}%` | `{{date}} · Không ghi thời gian, đường đi ngang · Bạn {{you}}% · Lý tưởng {{ideal}}%` |
| `goal.detail.tooltipIdeal` | M9 *(sửa: dấu trong `{{ideal}}`)* | tooltip cho ngày tương lai hoặc khi chưa có entry (chỉ đường Ideal) | `{{date}} · Ideal {{ideal}}%` | `{{date}} · Lý tưởng {{ideal}}%` |
| `goal.detail.labelIdeal` | M9 *(sửa: dấu trong `{{value}}`)* | nhãn trực tiếp tại điểm cuối | `Ideal {{value}}%` | `Lý tưởng {{value}}%` |
| `goal.detail.labelYou` | M9 *(sửa: dấu trong `{{value}}`)* | nhãn trực tiếp tại điểm cuối ("Bạn" có thể âm: `You −40.0%`) | `You {{value}}%` | `Bạn {{value}}%` |
| `goal.detail.showTable` | M5 | `<summary>` của `<details>` | `Show data as table` | `Xem dữ liệu dạng bảng` |
| `goal.detail.tableDate` | M5 | cột bảng chart | `Date` | `Ngày` |
| `goal.detail.tableIdeal` | M5 | | `Ideal` | `Lý tưởng` |
| `goal.detail.tableYou` | M5 | | `You` | `Bạn` |
| `goal.detail.tableMinutes` | M9 *(mới)* | cột số phút của ngày (số nguyên, không đơn vị) | `Minutes` | `Số phút` |
| `goal.detail.tableChange` | M9 *(mới)* | cột `changePercent` (có dấu; `—` khi null) | `vs previous logged day` | `So với ngày có ghi trước` |
| `goal.detail.upcoming` | M5 | goal chưa bắt đầu | `Starts {{date}}. Your line will appear once the goal begins.` | `Bắt đầu {{date}}. Đường của bạn sẽ xuất hiện khi mục tiêu bắt đầu.` |

**Tóm tắt thay đổi key của Goal detail ở v3.0 (M9).** Developer áp dụng đúng danh sách này vào `en.json` / `vi.json`:

- **Key mới (12):** `goal.detail.headlineDown`, `goal.detail.subDay`, `goal.detail.subToday`, `goal.detail.subEarlier`, `goal.detail.subStart`, `goal.detail.legendZero`, `goal.detail.chartSummaryEmpty`, `goal.detail.tooltipChange`, `goal.detail.tooltipBase`, `goal.detail.tooltipFlat`, `goal.detail.tableMinutes`, `goal.detail.tableChange`.
- **Key sửa chữ/biến (9):** `goal.detail.headline`, `goal.detail.chartCaption`, `goal.detail.legendYou`, `goal.detail.chartSummary`, `goal.detail.chartNote`, `goal.detail.tooltipIdeal`, `goal.detail.labelIdeal`, `goal.detail.labelYou`, `empty.detail.curve`. (Các key này giữ nguyên tên.)
- **Key bị bỏ (3) — xoá khỏi cả `en.json` và `vi.json`, không còn được tham chiếu trong `src`:** `goal.detail.headlineSub_one`, `goal.detail.headlineSub_other`, `goal.detail.tooltip`.
- **Giữ nguyên:** `goal.detail.eyebrow` (`Your 1% curve`), `chartTitle`, `rangeLegend`, `rangeWhole`, `rangeSoFar`, `legendIdeal`, `showTable`, `tableDate`, `tableIdeal`, `tableYou`, `upcoming`, và mọi key `goal.detail.*` khác (lịch sử, nút, `stat.*`).
- **Quy tắc tham số:** mọi `{{…}}` là % của đường cong (`value`, `x`, `y`, `change`, `you`, `ideal`) đã được formatter có dấu sinh ra (7.1) — template không chứa `+`/`−` cứng. `{{minutes}}`, `{{prevMinutes}}`, `{{firstMinutes}}` = kết quả `format.minutes` (`27 min` / `27 phút`). Ngày ngắn không năm lấy từ `Intl`, không gõ tay. Số nhiều: không dùng (câu số liệu không đổi dạng theo số).
- **Biến thể nào dùng khi nào** (cho `GoalDetail`): `baseline = null` → `empty.detail.curve` + `chartSummaryEmpty`; `previous = null` → `subStart`; ngược lại `latest.date = hôm nay` → `subToday`, còn lại `subEarlier`. Headline: `headlinePercent ≥ 0` → `headline`, `< 0` → `headlineDown`. Tooltip: ngày > `lastElapsedDay` hoặc `baseline = null` → `tooltipIdeal`; `logged` và `changePercent ≠ null` → `tooltipChange`; `logged` và là baseline → `tooltipBase`; còn lại → `tooltipFlat`.
| `goal.detail.historyTitle` | M3 | h2 | `History` | `Lịch sử` |
| `goal.detail.colDate` | M3 | cột | `Date` | `Ngày` |
| `goal.detail.colMinutes` | M3 | cột | `Minutes` | `Số phút` |
| `goal.detail.colNote` | M3 | cột | `Note` | `Ghi chú` |
| `goal.detail.colSource` | M3 | cột | `Source` | `Nguồn` |
| `stat.timeLogged` | M4 | StatCard | `Time logged` | `Thời gian đã ghi` |
| `stat.timeLoggedYear` | M4 | phụ đề | `In {{year}}` | `Trong năm {{year}}` |
| `stat.timeLoggedWhole` | M4 | phụ đề (một goal); `{{hours}}` = `format.hours` | `Whole goal: {{hours}}` | `Cả mục tiêu: {{hours}}` |
| `stat.daysOnTarget` | M4 | StatCard | `Days on target` | `Ngày đạt chỉ tiêu` |
| `stat.daysOnTargetSub` | M4 | phụ đề (một goal) | `Days you hit your daily target` | `Số ngày bạn đạt chỉ tiêu ngày` |
| `stat.anyGoal` | M4 | phụ đề (All goals: Days on target, Current streak) | `Any goal on target` | `Ít nhất một mục tiêu đạt chỉ tiêu` |
| `stat.currentStreak` | M4 | StatCard; giá trị = `format.daysCount` | `Current streak` | `Chuỗi hiện tại` |
| `stat.longestStreak` | M4 | StatCard | `Longest streak` | `Chuỗi dài nhất` |
| `stat.progress` | M4 | StatCard (một goal) | `Progress` | `Tiến độ` |
| `stat.progressSub` | M4 | phụ đề | `{{current}} of {{total}} min` | `{{current}}/{{total}} phút` |
| `stat.progressSubOpen` | M11 *(mới v4.0)* | phụ đề thẻ Progress của goal **không thời hạn** (Goal detail và Review): `{{total}}` = chỉ tiêu tích luỹ tới hôm nay (`totalTarget(goal, today)`), chưa bắt đầu = `0` | `{{current}} of {{total}} min expected so far` | `{{current}}/{{total}} phút dự kiến đến nay` |
| `stat.pace` | M4 | StatCard | `Pace` | `Nhịp độ` |
| `stat.paceAhead` | M4 | `{{value}}` = `format.minutes` hoặc `format.duration` | `{{value}} ahead` | `Nhanh {{value}}` |
| `stat.paceBehind` | M4 | | `{{value}} behind` | `Chậm {{value}}` |
| `stat.paceOnTrack` | M4 | | `On pace` | `Đúng nhịp` |
| `stat.paceExpected` | M4 | phụ đề | `Expected {{n}} min by today` | `Dự kiến {{n}} phút tính đến hôm nay` |

**Tóm tắt thay đổi key của v4.0 (M11) — developer M11-T4/T5 áp dụng đúng danh sách này vào `en.json` / `vi.json` (mỗi key có cả `en` và `vi`; `vi` không có số nhiều nên không có `_one/_other`).**

- **Key mới (12):** `goal.form.endsNever`, `goal.form.endsNeverHint`, `goal.form.endsNeverTotalNote`, `goal.form.endsNeverSwitched` (7.6.3); `goals.rowDailyOpen` (7.6.2); `goal.detail.subDayOpen`, `goal.detail.chartSummaryOpen`, `goal.detail.chartSummaryEmptyOpen`, `stat.progressSubOpen` (7.6.4); `review.progressNoteOpen` (7.6.6 / bảng Review); `errors.GOAL_PERIOD_INVALID_openEndedTotal`, `errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded` (7.3).
- **Key sửa chữ: 0.** Mọi key hiện có giữ nguyên chữ `en` và `vi` (goal có hạn hiển thị y như v3.1). **Key bỏ: 0.**
- **Chọn key khi nào (cho `GoalForm`, `Goals`, `GoalDetail`, `Review`, `error-messages.ts`):**
  - `Goals`/`GoalDetail` dòng thông tin: `goal.endDate === null` → `goals.rowDailyOpen` (`{ n, start }`); ngược lại `goals.rowDaily` / `goals.rowTotal` như cũ. `goals.endedOn` không bao giờ được gọi với goal `endDate === null`.
  - `GoalDetail`: `goal.endDate === null` → `goal.detail.subDayOpen` (`{ k }`) thay `subDay`; `chartSummaryOpen` / `chartSummaryEmptyOpen` thay `chartSummary` / `chartSummaryEmpty`; không render Range; `upcoming` (elapsedDays = 0) → không render thẻ biểu đồ; `stat.progressSubOpen` thay `stat.progressSub`.
  - `Review`: goal đang chọn có `endDate === null` → `stat.progressSubOpen` (thẻ Progress) và `review.progressNoteOpen` (ghi chú); `review.outsideYear` giữ nguyên ưu tiên khi năm < năm `startDate`.
  - `error-messages.ts`: `GOAL_PERIOD_INVALID` + `params.variant === 'openEndedTotal'` → `errors.GOAL_PERIOD_INVALID_openEndedTotal`; `DATE_OUTSIDE_GOAL_PERIOD` + `params.end === null` → `errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded` (params `{ start }`).
  - `GoalForm`: radio thứ ba luôn có nhãn `goal.form.endsNever`; dòng mô tả dưới nó = `endsNeverHint` nếu đang chọn, `endsNeverTotalNote` nếu `targetType = total` (radio `disabled`), ngược lại không render dòng nào.

#### 7.6.5 Day (S5) — M3

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `day.title` | M3 | h1 | `Day` | `Ngày` |
| `day.goToToday` | M3 | nút ghost; cũng dùng cho ngày tương lai | `Go to today` | `Về hôm nay` |
| `day.navLabel` | M3 | `aria-label` nhóm DateNav | `Choose a day` | `Chọn ngày` |
| `day.prev` | M3 | nút (chỉ icon < 640 px, vẫn có tên này) | `Previous day` | `Ngày trước` |
| `day.next` | M3 | nút (vô hiệu ở hôm nay) | `Next day` | `Ngày sau` |
| `day.dateLabel` | M3 | label ẩn của ô chọn ngày | `Date` | `Ngày` |
| `day.onlyRunning` | M3 | ghi chú | `Only goals running on this day are shown.` | `Chỉ hiển thị các mục tiêu đang chạy trong ngày này.` |
| `day.goalsLabel` | M3 | `aria-label` danh sách | `Goals on this day` | `Mục tiêu trong ngày này` |
| `day.invalid` | M3 | URL ngày sai định dạng | `That date isn't valid.` | `Ngày này không hợp lệ.` |
| `day.invalidAction` | M3 | link | `Go to Today` | `Về trang Hôm nay` |

#### 7.6.6 Review (S6) — M4 (ghi chú goal không thời hạn: M11)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `review.title` | M4 | h1 | `Review` | `Tổng kết` |
| `review.goalLabel` | M4 | label Select | `Goal` | `Mục tiêu` |
| `review.goalAll` | M4 | option | `All goals` | `Tất cả mục tiêu` |
| `review.goalArchived` | M4 | option goal đã archive | `{{name}} (archived)` | `{{name}} (đã lưu trữ)` |
| `review.yearLabel` | M4 | label Select | `Year` | `Năm` |
| `review.pickGoal` | M4 | thay thẻ Progress/Pace ở All goals | `Pick a goal to see progress and pace.` | `Chọn một mục tiêu để xem tiến độ và nhịp độ.` |
| `review.progressNote` | M4 | ghi chú dưới hàng stat (một goal **có hạn**) | `Progress and pace cover the whole goal period.` | `Tiến độ và nhịp độ tính trên toàn bộ thời gian của mục tiêu.` |
| `review.progressNoteOpen` | M11 *(mới v4.0)* | như `review.progressNote` nhưng khi goal đang chọn **không thời hạn** (A-51) | `Progress and pace for a goal with no end date are measured up to today.` | `Tiến độ và nhịp độ của mục tiêu không có thời hạn được tính đến hôm nay.` |
| `review.heatmapTitle` | M4 | h2 | `Activity in {{year}}` | `Hoạt động năm {{year}}` |
| `review.weeklyTitle` | M4 | h2 | `Last 12 weeks` | `12 tuần gần nhất` |
| `review.weeklySub` | M4 | phụ đề | `Hours logged per week` | `Số giờ đã ghi mỗi tuần` |
| `review.monthlyTitle` | M4 | h2 | `Months of {{year}}` | `Các tháng của năm {{year}}` |
| `review.monthlySub` | M4 | phụ đề | `Hours logged per month` | `Số giờ đã ghi mỗi tháng` |
| `review.outsideYear` | M5 | một goal, năm ngoài khoảng | `This goal doesn't run in {{year}}.` | `Mục tiêu này không diễn ra trong năm {{year}}.` |

#### 7.6.7 Timer và dialog D1 — M2

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `timer.cardTitle` | M2 | h2 TimerCard | `Timer running · {{goal}}` | `Đang đếm giờ · {{goal}}` |
| `timer.badge` | M2 | badge | `Running` | `Đang chạy` |
| `timer.elapsedLabel` | M2 | `aria-label` của `role="timer"` | `Elapsed time` | `Thời gian đã trôi qua` |
| `timer.startedAt` | M2 | `{{time}}` = `HH:MM` | `Started at {{time}}` | `Bắt đầu lúc {{time}}` |
| `timer.stop` | M2 | nút | `Stop` | `Dừng` |
| `timer.stopAria` | M2 | `aria-label` nút Stop | `Stop timer for {{goal}}, running {{elapsed}}` | `Dừng đếm giờ cho {{goal}}, đã chạy {{elapsed}}` |
| `timer.dialogTitle` | M2 | D1 | `Save this session?` | `Lưu phiên này?` |
| `timer.dialogSummary` | M2 | D1; `{{elapsed}}` = `hh:mm:ss` | `{{goal}} · tracked {{elapsed}}` | `{{goal}} · đã đếm {{elapsed}}` |
| `timer.roundedHint` | M2 | hint dưới Minutes; `{{raw}}` = `format.minSec` | `Rounded from {{raw}}. You can change it.` | `Làm tròn từ {{raw}}. Bạn có thể sửa lại.` |
| `timer.savedTo` | M2 | `{{date}}` = ngày dài của ngày bắt đầu | `Saved to {{date}} (the day you started).` | `Sẽ lưu vào {{date}} (ngày bạn bắt đầu).` |
| `timer.keepRunning` | M2 | nút secondary / Esc | `Keep running` | `Tiếp tục đếm` |
| `timer.discard` | M2 | nút danger-ghost | `Discard session` | `Bỏ phiên này` |

(D1 còn dùng `entry.form.minutesLabel`, `entry.form.noteLabel`, `entry.form.notePlaceholder`, `entry.form.counter`, `entry.form.save`.)

#### 7.6.8 Settings (S7), dialog nhập (D3) — M1 (Language, Storage, About), M2 (Reminders), M3 (Backup)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `settings.title` | M1 | h1 | `Settings` | `Cài đặt` |
| `settings.language.title` | M1 | h2 card; **song ngữ cố định ở cả hai file** | `Language / Ngôn ngữ` | `Language / Ngôn ngữ` (= en) |
| `settings.language.desc` | M1 | mô tả card | `Choose the language of menus, messages and dates. Your own goal names and notes stay as you wrote them.` | `Chọn ngôn ngữ cho menu, thông báo và ngày tháng. Tên mục tiêu và ghi chú của bạn giữ nguyên như bạn đã viết.` |
| `settings.language.option.en` | M1 | lựa chọn (`lang="en"`) | `English` | `English` (= en) |
| `settings.language.option.vi` | M1 | lựa chọn (`lang="vi"`) | `Tiếng Việt` | `Tiếng Việt` (= en) |
| `settings.language.browserNote` | M1 | hint dưới control (A-17) | `The date and time pickers and permission prompts follow your browser's language.` | `Ô chọn ngày, giờ và hộp xin quyền do trình duyệt hiển thị nên theo ngôn ngữ của trình duyệt.` |
| `settings.language.saveFailed` | M1 | Alert dưới control khi ghi kv lỗi (giao diện vẫn đã đổi ngôn ngữ) | `Language changed, but it couldn't be saved on this device. It may reset when you reload.` | `Đã đổi ngôn ngữ, nhưng không lưu được trên thiết bị này. Ngôn ngữ có thể trở về mặc định khi bạn tải lại trang.` |
| `settings.reminders.title` | M2 | h2 | `Reminders` | `Nhắc nhở` |
| `settings.reminders.switch` | M2 | label switch | `Daily reminder` | `Nhắc nhở hằng ngày` |
| `settings.reminders.switchDesc` | M2 | mô tả switch | `Get a nudge when you haven't hit your targets today.` | `Nhận lời nhắc khi hôm nay bạn chưa đạt chỉ tiêu.` |
| `settings.reminders.on` | M2 | chữ trạng thái cạnh switch | `On` | `Bật` |
| `settings.reminders.off` | M2 | | `Off` | `Tắt` |
| `settings.reminders.time` | M2 | label giờ | `Reminder time` | `Giờ nhắc` |
| `settings.reminders.permission` | M2 | nhãn trạng thái quyền | `Notification permission` | `Quyền thông báo` |
| `settings.permission.default` | M2 | chip | `Not asked yet` | `Chưa hỏi` |
| `settings.permission.granted` | M2 | chip | `Allowed` | `Đã cho phép` |
| `settings.permission.denied` | M2 | chip | `Blocked` | `Bị chặn` |
| `settings.permission.unsupported` | M2 | chip | `Not supported` | `Không hỗ trợ` |
| `settings.permission.defaultDesc` | M2 | mô tả (quyền chưa hỏi) | `Turn on the reminder and your browser will ask for permission.` | `Bật nhắc nhở và trình duyệt sẽ xin quyền thông báo của bạn.` |
| `settings.permission.grantedDesc` | M2 | mô tả (cho phép) | `You'll get one notification a day while 1% Better is open.` | `Bạn sẽ nhận một thông báo mỗi ngày khi 1% Better đang mở.` |
| (mô tả khi bị chặn / không hỗ trợ) | M2 | | dùng `errors.NOTIFICATIONS_DENIED` / `errors.NOTIFICATIONS_UNSUPPORTED` | |
| `settings.reminders.allow` | M2 | nút (quyền `default`) | `Allow notifications` | `Cho phép thông báo` |
| `settings.reminders.limit` | M2 | khung giới hạn NFR-07 | `Heads up: reminders are sent only while 1% Better is open (in a tab or an installed window, even in the background). To be reminded when the app is closed, add a daily event to your calendar.` | `Lưu ý: lời nhắc chỉ được gửi khi 1% Better đang mở (trong một tab hoặc cửa sổ đã cài, kể cả khi chạy nền). Để được nhắc khi đã đóng app, hãy thêm một sự kiện hằng ngày vào lịch của bạn.` |
| `settings.reminders.ios` | M2 | mẹo iOS | `On iPhone or iPad, notifications work only after you add this app to your Home Screen (iOS 16.4 or later).` | `Trên iPhone hoặc iPad, thông báo chỉ hoạt động sau khi bạn thêm app vào Màn hình chính (iOS 16.4 trở lên).` |
| `settings.reminders.ics` | M2 | nút | `Add reminder to calendar (.ics)` | `Thêm lời nhắc vào lịch (.ics)` |
| `settings.reminders.icsHint` | M2 | `{{time}}` = `HH:MM` | `Adds a repeating daily event at {{time}}.` | `Thêm một sự kiện lặp lại hằng ngày lúc {{time}}.` |
| `settings.backup.title` | M3 | h2 | `Backup` | `Sao lưu` |
| `settings.backup.desc` | M3 | mô tả | `Your data lives only on this device. Export a backup now and then, or to move to another device.` | `Dữ liệu của bạn chỉ nằm trên thiết bị này. Hãy thỉnh thoảng xuất bản sao lưu, hoặc khi cần chuyển sang thiết bị khác.` |
| `settings.backup.last` | M3 | `{{date}}` = ngày ngắn | `Last backup: {{date}}` | `Lần sao lưu gần nhất: {{date}}` |
| `settings.backup.lastNever` | M3 | | `Last backup: Never` | `Lần sao lưu gần nhất: Chưa có` |
| `settings.backup.export` | M3 | nút | `Export backup (JSON)` | `Xuất sao lưu (JSON)` |
| `settings.backup.import` | M3 | nút | `Import backup…` | `Nhập sao lưu…` |
| `settings.backup.importHint` | M3 | | `Importing replaces everything currently on this device.` | `Nhập sao lưu sẽ thay thế toàn bộ dữ liệu hiện có trên thiết bị này.` |
| `import.title` | M3 | D3 | `Replace all data?` | `Thay thế toàn bộ dữ liệu?` |
| `import.body` | M3 | D3; `{{goals}}` `{{entries}}` `{{curGoals}}` `{{curEntries}}` = cụm `format.*Count`, `{{date}}` = ngày ngắn | `This backup has {{goals}}, {{entries}}, exported {{date}}. Importing replaces everything currently on this device ({{curGoals}}, {{curEntries}}). This can't be undone.` | `Bản sao lưu này có {{goals}}, {{entries}}, xuất ngày {{date}}. Nhập sẽ thay thế toàn bộ dữ liệu hiện có trên thiết bị này ({{curGoals}}, {{curEntries}}). Bạn không thể hoàn tác.` |
| `import.confirm` | M3 | nút danger | `Replace all data` | `Thay thế toàn bộ dữ liệu` |
| `settings.storage.title` | M1 | h2 | `Storage` | `Bộ nhớ` |
| `settings.storage.label` | M1 | nhãn dòng trạng thái | `Protection from automatic clearing` | `Bảo vệ khỏi bị xóa tự động` |
| `settings.storage.protected` | M1 | chip | `Protected` | `Đã bảo vệ` |
| `settings.storage.notProtected` | M1 | chip | `Not protected` | `Chưa bảo vệ` |
| `settings.storage.unknown` | M1 | chip | `Unknown` | `Không rõ` |
| `settings.storage.protectedDesc` | M1 | | `Your browser won't clear this data automatically.` | `Trình duyệt sẽ không tự động xóa dữ liệu này.` |
| `settings.storage.notProtectedDesc` | M1 | | `Your browser may clear this data if the device runs low on space. Install the app (browser menu → Install, or Add to Home Screen) and export a backup now and then.` | `Trình duyệt có thể xóa dữ liệu này khi thiết bị sắp hết dung lượng. Hãy cài app (menu trình duyệt → Cài đặt ứng dụng, hoặc Thêm vào Màn hình chính) và thỉnh thoảng xuất bản sao lưu.` |
| `settings.storage.unknownDesc` | M1 | | `Your browser doesn't report storage protection. Export a backup now and then.` | `Trình duyệt không cho biết dữ liệu có được bảo vệ hay không. Hãy thỉnh thoảng xuất bản sao lưu.` |
| `settings.about.title` | M1 | h2 | `About` | `Giới thiệu` |
| `settings.about.desc` | M1 | (tên app lấy từ `app.name`) | `Everything you log stays on this device. No account, no tracking.` | `Mọi thứ bạn ghi lại đều nằm trên thiết bị này. Không tài khoản, không theo dõi.` |

#### 7.6.9 Not found (S8), StorageError / ErrorBoundary (S9) — M1 (ErrorBoundary M5)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `notFound.pageTitle` | M1 | h1, route lạ | `Page not found` | `Không tìm thấy trang` |
| `notFound.pageBody` | M1 | | `That page doesn't exist or has moved.` | `Trang này không tồn tại hoặc đã được chuyển đi.` |
| `notFound.pageAction` | M1 | nút (cũng dùng ở ErrorBoundary) | `Go to Today` | `Về trang Hôm nay` |
| `notFound.goalTitle` | M1 | h1, goal id không tồn tại (nội dung = `errors.GOAL_NOT_FOUND`) | `Goal not found` | `Không tìm thấy mục tiêu` |
| `notFound.goalAction` | M1 | nút | `Go to Goals` | `Về trang Mục tiêu` |
| `storageError.title` | M1 | h1 (S9) | `Can't open local storage` | `Không mở được bộ nhớ cục bộ` |
| `storageError.body` | M1 | | `1% Better keeps your data in your browser's storage, and it isn't available right now. This often happens in private or incognito windows, or when site data is blocked in browser settings. Nothing has been changed.` | `1% Better lưu dữ liệu của bạn trong bộ nhớ của trình duyệt, nhưng hiện không dùng được. Lỗi này thường gặp ở cửa sổ riêng tư (ẩn danh) hoặc khi trình duyệt chặn dữ liệu trang web. Chưa có gì bị thay đổi.` |
| `storageError.step1` | M1 | mục 1 của `<ol>` (không chứa số) | `Open the app in a regular (non-private) window.` | `Mở app trong cửa sổ thường (không phải riêng tư).` |
| `storageError.step2` | M1 | mục 2 | `Allow site data and cookies for this site in your browser settings.` | `Cho phép dữ liệu trang web và cookie cho trang này trong cài đặt trình duyệt.` |
| `storageError.step3` | M1 | mục 3 | `Reload the page.` | `Tải lại trang.` |
| `errorBoundary.title` | M5 | h1 | `Something went wrong` | `Đã xảy ra lỗi` |
| `errorBoundary.body` | M5 | | `The app ran into an unexpected problem. Your data is still stored on this device.` | `App gặp sự cố ngoài dự kiến. Dữ liệu của bạn vẫn được lưu trên thiết bị này.` |
| `errorBoundary.reload` | M5 | nút | `Reload app` | `Tải lại app` |

(StorageError dùng nút `common.tryAgain`; ErrorBoundary dùng `errorBoundary.reload` và `notFound.pageAction`.)

### 7.7 Phase 2 — đăng nhập và đồng bộ (v2.0)

Cùng quy tắc ở 7.0 (key, `{{biến}}`, `_one/_other`, giọng `vi`). **Không dịch "Google"**; email và tên lấy từ Google truyền nguyên văn. Các chuỗi dùng lại từ bảng cũ: `common.cancel`, `common.retry`, `settings.reminders.allow`, `errors.WRITE_FAILED`, `format.goalsCount`, `format.entriesCount`. Các chuỗi phase 2 nằm rải ở 7.2 (toast `signedIn` … `syncNowDone`, `format.changesCount`, `format.todayAt`, `format.dateAt`, `common.dismiss`) và 7.3 (`errors.AUTH_*`, `errors.SYNC_*`); bảng dưới là phần còn lại.

#### 7.7.1 Card Account và nút đăng nhập (S7)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `auth.signInGoogle` | M6 | nhãn nút Google (mọi nơi: card, banner, hint); **chỉ** chuỗi này | `Sign in with Google` | `Đăng nhập bằng Google` |
| `auth.signingIn` | M6 | nhãn nút Google khi bận | `Signing in…` | `Đang đăng nhập…` |
| `settings.account.title` | M6 | h2 card (A1 … A10) | `Account` | `Tài khoản` |
| `settings.account.descSignedOut` | M6 | A1, lời giải thích cố định (FR-54) | `Sign in with Google to keep a copy of your goals and entries in your account and use them on all your devices. You don't need an account to use 1% Better.` | `Đăng nhập bằng Google để lưu một bản sao mục tiêu và lần ghi vào tài khoản của bạn và dùng trên mọi thiết bị. Bạn không cần tài khoản để dùng 1% Better.` |
| `settings.account.privacyNote` | M6 | A1, `.hint` dưới nút | `From Google, the app only receives your name and email.` | `Từ Google, app chỉ nhận tên và email của bạn.` |
| `settings.account.offlineHint` | M6 | A2, nối `aria-describedby` với nút đã vô hiệu | `You're offline. Connect to the internet to sign in.` | `Bạn đang ngoại tuyến. Hãy kết nối mạng để đăng nhập.` |
| `settings.account.signingInStatus` | M6 | A3, dòng trạng thái (`role="status"`) | `Signing you in…` | `Đang đăng nhập cho bạn…` |
| `settings.account.signingInBody` | M6 | A3 | `Finishing up. This only takes a moment.` | `Sắp xong. Chỉ mất một lát.` |
| `settings.account.provider` | M6 | A5, dưới email | `Signed in with Google` | `Đã đăng nhập bằng Google` |
| `settings.account.lastSynced` | M7 | A5, nhãn (`dt`) | `Last synced` | `Đồng bộ gần nhất` |
| `settings.account.neverSynced` | M7 | A5, giá trị khi chưa có mốc | `Not yet` | `Chưa lần nào` |
| `settings.account.pending` | M7 | A5, nhãn; giá trị = `format.changesCount` | `Waiting to sync` | `Đang chờ đồng bộ` |
| `settings.account.syncedInfo` | M7 | A5, `.hint` | `Synced with this account: goals, entries, reminder settings and language. A running timer stays on the device where you started it.` | `Được đồng bộ với tài khoản này: mục tiêu, lần ghi, cài đặt nhắc nhở và ngôn ngữ. Bộ đếm giờ đang chạy chỉ nằm trên thiết bị bạn bắt đầu.` |
| `settings.account.syncNow` | M7 | nút | `Sync now` | `Đồng bộ ngay` |
| `settings.account.offlineSync` | M7 | A7 offline, dưới nút `Sync now` đã vô hiệu | `You're offline. Changes are saved on this device and sync when you're back online.` | `Bạn đang ngoại tuyến. Thay đổi được lưu trên thiết bị này và sẽ đồng bộ khi có mạng trở lại.` |
| `settings.account.nextRetry` | M7 | A8, `{{time}}` = `HH:MM` của `nextRetryAt` | `Trying again at {{time}}.` | `Sẽ thử lại lúc {{time}}.` |
| `settings.account.localRejected_one` | M8 *(v3.1: chốt, giữ nguyên văn bản đã ship)* | A9, dòng thông tin `data-reason="local"` (hoặc `both`, đứng **trước** dòng `SYNC_REMOTE_INVALID`); đúng **1** hàng trên máy bị cloud từ chối (`dirty = 2`, ADR-28). Hàng "mục" = goal hoặc entry (không phân biệt) | `1 item on this device couldn't be uploaded to your account and stays only here. Export a backup to keep a copy; everything else is synced.` | — |
| `settings.account.localRejected_other` | M8 *(v3.1: chốt, giữ nguyên)* | như trên, `{{count}}` ≥ 2 = số hàng (`f.number`) | `{{count}} items on this device couldn't be uploaded to your account and stay only here. Export a backup to keep a copy; everything else is synced.` | `{{count}} mục trên thiết bị này không tải lên được tài khoản của bạn nên chỉ còn ở đây. Hãy xuất bản sao lưu để giữ một bản sao; mọi thứ còn lại đã được đồng bộ.` |
| `settings.account.signOut` | M6 | nút mở D4 | `Sign out` | `Đăng xuất` |
| `settings.account.expiredTitle` | M6 | A10, dòng đậm đầu Alert | `Sign in again` | `Hãy đăng nhập lại` |
| `settings.account.expiredAccount` | M6 | A10 | `Account: {{email}}` | `Tài khoản: {{email}}` |
| `settings.account.goTo` | M6 | nút action của toast lỗi đăng nhập; nút ở card Storage (M8) | `Go to Account` | `Đến mục Tài khoản` |

#### 7.7.2 Dialog D4 (Sign out), D5 (Merge), D3 đã đăng nhập

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `auth.signOut.title` | M6 | D4, tiêu đề | `Sign out?` | `Đăng xuất?` |
| `auth.signOut.body` | M6 | D4, thân | `You'll stop syncing on this device. Your data in your account stays safe.` | `Thiết bị này sẽ ngừng đồng bộ. Dữ liệu trong tài khoản của bạn vẫn được giữ nguyên.` |
| `auth.signOut.legend` | M6 | D4, legend của nhóm radio | `What should happen to the data on this device?` | `Dữ liệu trên thiết bị này sẽ được xử lý thế nào?` |
| `auth.signOut.keep` | M6 | lựa chọn mặc định | `Keep data on this device` | `Giữ dữ liệu trên thiết bị này` |
| `auth.signOut.keepDesc` | M6 | mô tả lựa chọn Keep | `Recommended. You can keep using 1% Better without an account.` | `Nên chọn. Bạn vẫn dùng 1% Better bình thường mà không cần tài khoản.` |
| `auth.signOut.remove` | M6 | lựa chọn Remove | `Remove data from this device` | `Xóa dữ liệu khỏi thiết bị này` |
| `auth.signOut.removeDesc` | M6 | mô tả lựa chọn Remove | `Deletes your goals, entries and reminder settings on this device. Choose this on a shared device. Your account keeps everything.` | `Xóa mục tiêu, lần ghi và cài đặt nhắc nhở trên thiết bị này. Hãy chọn khi dùng máy chung. Tài khoản của bạn vẫn giữ mọi thứ.` |
| `auth.signOut.confirmKeep` | M6 | nút xác nhận khi Keep | `Sign out` | `Đăng xuất` |
| `auth.signOut.confirmRemove` | M6 | nút xác nhận khi Remove (danger) | `Sign out and remove data` | `Đăng xuất và xóa dữ liệu` |
| `auth.signOut.working` | M6 | nhãn nút xác nhận khi bận | `Signing out…` | `Đang đăng xuất…` |
| `auth.signOut.unsynced_one` | M7 | khối cảnh báo, `pending = 1` | `1 change hasn't synced to your account yet.` | — |
| `auth.signOut.unsynced_other` | M7 | `pending` ≥ 2 | `{{count}} changes haven't synced to your account yet.` | `{{count}} thay đổi chưa được đồng bộ vào tài khoản của bạn.` |
| `auth.signOut.unsyncedOnline` | M7 | dòng dưới, đang online | `We'll try to sync before signing you out.` | `App sẽ thử đồng bộ trước khi đăng xuất.` |
| `auth.signOut.unsyncedOffline` | M7 | dòng dưới, đang offline | `You're offline, so they can't sync right now. If you keep the data on this device, they'll sync when you sign in again with this account.` | `Bạn đang ngoại tuyến nên chưa đồng bộ được. Nếu giữ dữ liệu trên thiết bị này, các thay đổi sẽ được đồng bộ khi bạn đăng nhập lại bằng tài khoản này.` |
| `auth.signOut.unsyncedRemove` | M7 | `role="status"`, hiện khi chọn Remove và `pending > 0` | `If you remove the data from this device, these changes will be lost.` | `Nếu xóa dữ liệu khỏi thiết bị này, các thay đổi đó sẽ mất.` |
| `auth.signOut.syncFailed` | M7 | Alert trong D4 khi đồng bộ lần cuối lỗi mà đang chọn Remove | `Couldn't sync your changes. If you remove the data now, they will be lost.` | `Không đồng bộ được các thay đổi của bạn. Nếu xóa dữ liệu bây giờ, chúng sẽ mất.` |
| `auth.signOut.removeAnyway` | M7 | nhãn nút xác nhận sau `syncFailed` | `Remove anyway` | `Vẫn xóa` |
| `auth.signOut.rejected_one` | M8 *(v3.1: chốt, giữ nguyên văn bản đã ship)* | D4, khối cảnh báo `unsynced-warning` (`data-rejected`), `rejected = 1` hàng trên máy bị cloud từ chối (ADR-28); đoạn sau đoạn `unsynced_*` nếu có | `1 item on this device couldn't be uploaded to your account.` | — |
| `auth.signOut.rejected_other` | M8 *(v3.1: chốt, giữ nguyên)* | `rejected` ≥ 2 | `{{count}} items on this device couldn't be uploaded to your account.` | `{{count}} mục trên thiết bị này không tải lên được tài khoản của bạn.` |
| `auth.signOut.rejectedKeep` | M8 *(**v3.1: `en` ĐỔI**, `vi` giữ nguyên)* | D4, ngay sau `rejected_*` (cùng đoạn cảnh báo). `en` bản cũ "It stays on this device if you keep the data here. …" sai ngữ pháp khi `{{count}}` ≥ 2 ("N items … It stays"); bản mới không phụ thuộc số nhiều | `Whatever couldn't be uploaded stays on this device if you keep the data here. Export a backup to keep a copy.` | `Chúng vẫn nằm trên thiết bị này nếu bạn giữ dữ liệu ở đây. Hãy xuất bản sao lưu để giữ một bản sao.` |
| `auth.signOut.rejectedRemove` | M8 *(**v3.1: `en` ĐỔI**, `vi` giữ nguyên)* | D4, vùng `role="status"` khi chọn Remove và `rejected > 0`. `en` bản cũ "…these items will be lost. Export a backup first to keep them." lệch số khi 1 hàng | `If you remove the data from this device, anything that couldn't be uploaded will be lost. Export a backup first to keep it.` | `Nếu xóa dữ liệu khỏi thiết bị này, các mục đó sẽ mất. Hãy xuất bản sao lưu trước để giữ chúng.` |
| `auth.signOut.removeDescRejected` | M8 *(v3.1: chốt, giữ nguyên văn bản đã ship)* | D4, mô tả lựa chọn Remove, **thay** `auth.signOut.removeDesc` khi `rejected > 0` | `Deletes your goals, entries and reminder settings on this device. Choose this on a shared device. Items that couldn't be uploaded are not in your account.` | `Xóa mục tiêu, lần ghi và cài đặt nhắc nhở trên thiết bị này. Hãy chọn khi dùng máy chung. Các mục không tải lên được không có trong tài khoản của bạn.` |
| `auth.merge.title` | M7 | D5, tiêu đề | `Add this device's data to your account?` | `Thêm dữ liệu trên thiết bị này vào tài khoản của bạn?` |
| `auth.merge.body` | M7 | D5; `{{goals}}`, `{{entries}}` = cụm đếm; `{{email}}` nguyên văn | `This device still has {{goals}}, {{entries}} from another account. If you continue, they'll be added to the account {{email}}, next to what's already there.` | `Thiết bị này vẫn còn {{goals}}, {{entries}} từ một tài khoản khác. Nếu tiếp tục, chúng sẽ được thêm vào tài khoản {{email}}, cạnh những gì đã có.` |
| `auth.merge.note` | M7 | D5, `.hint` | `Cancel signs you out. Nothing is uploaded.` | `Chọn Hủy sẽ đăng xuất. Không có gì được tải lên.` |
| `auth.merge.confirm` | M7 | nút primary | `Add to account` | `Thêm vào tài khoản` |
| `auth.merge.working` | M7 | nhãn nút khi bận | `Adding…` | `Đang thêm…` |
| `import.titleSignedIn` | M7 | D3 đã đăng nhập, tiêu đề | `Replace data on all your devices?` | `Thay thế dữ liệu trên mọi thiết bị của bạn?` |
| `import.bodySignedIn` | M7 | D3 đã đăng nhập; cùng biến với `import.body` | `This backup has {{goals}}, {{entries}}, exported {{date}}. Importing replaces everything currently on this device ({{curGoals}}, {{curEntries}}) and, once synced, everything in your account too, so it changes your other devices as well. This can't be undone.` | `Bản sao lưu này có {{goals}}, {{entries}}, xuất ngày {{date}}. Nhập sẽ thay thế toàn bộ dữ liệu hiện có trên thiết bị này ({{curGoals}}, {{curEntries}}) và, sau khi đồng bộ, cả dữ liệu trong tài khoản của bạn, nên các thiết bị khác của bạn cũng thay đổi theo. Bạn không thể hoàn tác.` |
| `import.offlineNote` | M7 | D3 đã đăng nhập, dòng thêm khi offline | `You're offline, so the change will reach your account when you're back online.` | `Bạn đang ngoại tuyến nên thay đổi sẽ đến tài khoản của bạn khi có mạng trở lại.` |

(D3 đã đăng nhập dùng lại nút `import.confirm` / `common.cancel`.)

#### 7.7.3 SyncIndicator (M7)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `sync.indicator.label` | M7 | `aria-label` của nhóm StatusRow đồng bộ | `Sync status` | `Trạng thái đồng bộ` |
| `sync.indicator.synced` | M7 | `synced`; `{{time}}` theo 7.1 | `Synced {{time}}` | `Đã đồng bộ {{time}}` |
| `sync.indicator.syncedNoTime` | M7 | `synced` khi chưa có mốc | `Synced` | `Đã đồng bộ` |
| `sync.indicator.syncing` | M7 | `syncing`; cũng là nhãn nút `Sync now` khi bận | `Syncing…` | `Đang đồng bộ…` |
| `sync.indicator.signingIn` | M7 | `signing-in` | `Signing in…` | `Đang đăng nhập…` |
| `sync.indicator.waiting_one` | M7 | `pending` online | `{{count}} change waiting to sync` | — |
| `sync.indicator.waiting_other` | M7 | | `{{count}} changes waiting to sync` | `{{count}} thay đổi chờ đồng bộ` |
| `sync.indicator.offline_one` | M7 | `pending` offline | `Offline · {{count}} change waiting` | — |
| `sync.indicator.offline_other` | M7 | | `Offline · {{count}} changes waiting` | `Ngoại tuyến · {{count}} thay đổi đang chờ` |
| `sync.indicator.offlineNone` | M7 | offline, `pending = 0` | `Offline · all changes synced` | `Ngoại tuyến · mọi thay đổi đã đồng bộ` |
| `sync.indicator.error` | M7 | `error` | `Couldn't sync` | `Không đồng bộ được` |
| `sync.indicator.retry` | M7 | nút trong chip lỗi | `Retry` | `Thử lại` |
| `sync.indicator.retryAria` | M7 | `aria-label` nút Retry (chứa chữ hiển thị) | `Retry sync` | `Thử lại đồng bộ` |
| `sync.indicator.expired` | M7 | `expired` (link tới Settings) | `Sign in again to sync` | `Đăng nhập lại để đồng bộ` |
| `sync.announce.synced` | M7 | vùng `aria-live` ẩn, khi về `synced` sau lỗi/offline | `All changes are synced.` | `Mọi thay đổi đã được đồng bộ.` |
| `sync.announce.offline` | M7 | khi chuyển sang offline | `You're offline. Changes will sync when you're back online.` | `Bạn đang ngoại tuyến. Thay đổi sẽ được đồng bộ khi có mạng trở lại.` |
| `sync.announce.error` | M7 | khi chuyển sang `error` | `Sync failed. Your changes are safe on this device and will be retried.` | `Đồng bộ không thành công. Thay đổi của bạn vẫn an toàn trên thiết bị này và sẽ được thử lại.` |
| `sync.announce.expired` | M7 | khi chuyển sang `expired` | `Your sign-in expired. Sign in again to keep syncing.` | `Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục đồng bộ.` |

#### 7.7.4 Nhắc đăng nhập (M8)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `loginPrompt.label` | M8 | `aria-label` của banner | `Sign-in suggestion` | `Gợi ý đăng nhập` |
| `loginPrompt.title` | M8 | tiêu đề đậm | `Keep your progress safe` | `Giữ tiến trình của bạn an toàn` |
| `loginPrompt.body` | M8 | thân | `Sign in to back up your goals and entries online and use them on all your devices. It's optional.` | `Đăng nhập để sao lưu mục tiêu và lần ghi lên tài khoản và dùng trên mọi thiết bị. Việc này không bắt buộc.` |
| `loginPrompt.notNow` | M8 | nút ghost | `Not now` | `Để sau` |
| `loginPrompt.snoozedToast` | M8 | toast sau `Not now` | `OK. You can sign in any time from Settings.` | `Được rồi. Bạn có thể đăng nhập bất cứ lúc nào trong Cài đặt.` |
| `exportHint.label` | M8 | `aria-label` khối hint | `Automatic backup` | `Sao lưu tự động` |
| `exportHint.text` | M8 | thân hint (không có tiêu đề) | `Backup downloaded. To keep a copy automatically, sign in with Google: your goals and entries then sync to your account.` | `Đã tải bản sao lưu. Để có thêm một bản sao tự động, hãy đăng nhập bằng Google: mục tiêu và lần ghi của bạn sẽ được đồng bộ vào tài khoản.` |

#### 7.7.5 Settings: ghi chú "theo tài khoản", Backup, Storage, About

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `settings.language.syncNote` | M7 | card Language, chỉ khi `signed-in` | `Saved to your account and used on your other devices.` | `Được lưu vào tài khoản của bạn và dùng cho các thiết bị khác của bạn.` |
| `settings.reminders.syncNote` | M7 | card Reminders, chỉ khi `signed-in` | `Reminder on/off and time are saved to your account and used on your other devices. Notification permission is set separately on each device.` | `Việc bật/tắt và giờ nhắc được lưu vào tài khoản của bạn và dùng cho các thiết bị khác. Quyền thông báo được đặt riêng trên từng thiết bị.` |
| `settings.permission.defaultOnDesc` | M7 | quyền `default` mà nhắc đã bật (từ cloud) | `Reminders are on, but this device hasn't allowed notifications yet. Allow them to get a notification; you'll still see the reminder banner in the app.` | `Nhắc nhở đang bật nhưng thiết bị này chưa cho phép thông báo. Hãy cho phép để nhận thông báo; bạn vẫn sẽ thấy lời nhắc ngay trong app.` |
| `settings.backup.descSignedIn` | M7 | mô tả Backup khi đã đăng nhập | `Your data is saved on this device and synced to your account. A backup file is an extra copy you keep yourself.` | `Dữ liệu của bạn được lưu trên thiết bị này và đồng bộ vào tài khoản. Tệp sao lưu là một bản sao bạn tự giữ.` |
| `settings.backup.descSignedOut` | M8 | cloud bật, chưa đăng nhập (hoặc hết phiên) | `Your data lives on this device. Sign in to keep a copy in your account too, or export a backup file now and then.` | `Dữ liệu của bạn nằm trên thiết bị này. Hãy đăng nhập để có thêm một bản sao trong tài khoản, hoặc thỉnh thoảng xuất tệp sao lưu.` |
| `settings.backup.importHintSignedIn` | M7 | hint dưới nút khi đã đăng nhập | `Importing replaces everything on this device and in your account.` | `Nhập sao lưu sẽ thay thế toàn bộ dữ liệu trên thiết bị này và trong tài khoản của bạn.` |
| `settings.storage.notProtectedSignIn` | M8 | nối sau `notProtectedDesc` khi cloud bật + chưa đăng nhập | `Signing in also keeps a copy of your data in your account.` | `Đăng nhập cũng giúp giữ một bản sao dữ liệu trong tài khoản của bạn.` |
| `settings.about.descCloud` | M6 | About khi cloud bật, chưa đăng nhập/hết phiên (thay `settings.about.desc`) | `Everything you log is saved on this device first. Signing in is optional, and there's no tracking.` | `Mọi thứ bạn ghi lại đều được lưu trên thiết bị này trước. Đăng nhập là tùy chọn và không có theo dõi.` |
| `settings.about.descSignedIn` | M6 | About khi đã đăng nhập | `Everything you log is saved on this device first and synced to your account. There's no tracking.` | `Mọi thứ bạn ghi lại đều được lưu trên thiết bị này trước, rồi đồng bộ vào tài khoản của bạn. Không có theo dõi.` |
| `settings.about.privacy` | M6 | About, `.hint`, khi cloud bật (cả hai trạng thái) | `If you sign in, your goals, entries, reminder settings and language are stored in this app's database (Supabase) under your account. Other people who use the app can't see them.` | `Nếu bạn đăng nhập, mục tiêu, lần ghi, cài đặt nhắc nhở và ngôn ngữ của bạn được lưu trong cơ sở dữ liệu của app (Supabase) dưới tài khoản của bạn. Những người khác dùng app không xem được chúng.` |
| `settings.about.privacyLink` | M6 *(v3.1: bổ sung vào DESIGN, M6-P1a; giữ nguyên văn bản đã ship)* | About, nhãn liên kết tới `privacy.html` (cùng origin, `BASE_URL + 'privacy.html'`, cùng tab), đứng cuối card About; **luôn hiện, kể cả khi cloud tắt** (M6 D8). Vì có ở cả hai trạng thái, key này **không** thuộc nhóm "chỉ khi cloud bật" | `Privacy policy` | `Chính sách quyền riêng tư` |

Khi cloud tắt, phần lớn 7.7 không được dùng (trừ `settings.about.privacyLink`, luôn hiện) và `settings.about.desc` (`No account, no tracking.`) giữ nguyên như v1.1 (FR-38).

### 7.8 Phase 6 — native / App Store (v5.0)

Cùng quy tắc 7.0 (key, `{{biến}}`, `_one/_other`, giọng `vi`). **57 key mới**, mỗi key có cả `en` và `vi`; **không key cũ nào đổi chữ** (bản web giống hệt v4.0). Phần này gồm: 7.8.1 kiểm kê chuỗi web phải thay/ẩn trên native + 15 key biến thể (M12); 7.8.2 Sign in with Apple (8 key, M14); 7.8.3 Delete account / D6 / panel thu hồi / 4 lỗi `ACCOUNT_DELETE_*` / 2 toast (25 key, M14); 7.8.4 thông báo lên lịch trước + quyền iOS (8 key, M15); 7.8.5 link About (1 key, M15); 7.8.6 `support.html` và `privacy.html`; 7.8.7 hồ sơ App Store; 7.8.8 screenshot và dataset demo. Từ vựng `vi` mới: **Apple, Safari, iPhone, iOS, AirDrop, Mail, Face ID** không dịch (như `Google`); "ID Apple" theo cách gọi của Apple Việt Nam; nút/mục của iOS ghi bằng tên iOS tiếng Việt kèm tên tiếng Anh khi chưa chắc (xem OQ-D26).

#### 7.8.1 Kiểm kê chuỗi web → native và 15 key biến thể (M12)

Quy ước: "native" = `capabilities.platform !== 'web'`. UI chọn key biến thể bằng **điều kiện ở cột 4** (đọc `capabilities`, không đọc `platform` trong service). Một chuỗi web **không** nằm trong bảng thì dùng nguyên cho native (đã trung tính: "device", "app", "account").

| # | Key / thành phần web | Vì sao sai trên native | Xử lý trên native | Điều kiện | MS |
| :- | :- | :- | :- | :- | :- |
| 1 | `update.message`, `update.reload` (`UpdateToast`) | không có service worker; app cập nhật qua App Store | **không render** | `serviceWorker === false` | M12 |
| 2 | `settings.reminders.ios` ("add this app to your Home Screen") | không có PWA/Home Screen | **không render** | `pwaHints === false` | M12 |
| 3 | `settings.reminders.limit` ("only while 1% Better is open …") | đúng khi chưa có lịch trước (M12 … M14); sai khi có lịch trước | M12 … M14: **giữ**; M15: thay bằng `settings.reminders.nativeInfo` | `scheduledNotifications` | M12 / M15 |
| 4 | `settings.reminders.ics`, `settings.reminders.icsHint`, nút `.ics` | lối vòng cho giới hạn trên; khi iOS tự nhắc cả lúc đóng app, `.ics` thừa và gây nhắc đôi | M12 … M14: **giữ** (qua share sheet, toast `toast.icsShared`); M15: **ẩn cả nút và dòng phụ** (quyết định ở 7.8.4) | `scheduledNotifications` | M12 / M15 |
| 5 | `settings.reminders.switchDesc` ("when you haven't hit your targets today") | thông báo lên lịch trước không biết tiến độ lúc hiện | `settings.reminders.nativeSwitchDesc` | `scheduledNotifications` | M15 |
| 6 | `settings.permission.defaultDesc/grantedDesc`, `errors.NOTIFICATIONS_DENIED/UNSUPPORTED`, `settings.permission.defaultOnDesc` ("browser", "site settings", "while open") | nói "trình duyệt", sai cách bật lại quyền | M12 … M14: chip `Not supported` + `settings.permission.nativeUnsupportedDesc`; M15: `native{Default,Granted,Denied,DefaultOn}Desc` | `platform !== 'web'`; `scheduledNotifications` | M12 / M15 |
| 7 | `settings.language.browserNote` | "browser's language" | `settings.language.nativeNote` | native | M12 |
| 8 | `backup.banner.never` ("if this browser clears it") | không phải trình duyệt | `backup.banner.neverNative` | native | M12 |
| 9 | Hàng nút Export/Import | Export mở share sheet, người dùng chưa quen | thêm `settings.backup.shareHint` dưới hai nút (trên `importHint`) | `nativeShare` | M12 |
| 10 | `errors.EXPORT_FAILED` ("browser allows downloads") | không có "tải xuống" | `errors.EXPORT_FAILED_native` | `nativeShare` | M12 |
| 11 | `toast.icsDownloaded` ("downloaded") | không tải xuống, mà chia sẻ | `toast.icsShared` | `nativeShare` | M12 |
| 12 | `settings.storage.label`, chip `protected` / `notProtected` / `unknown`, `…Desc` ("browser", "Install the app", "Add to Home Screen") | không có `persist()`; dữ liệu nằm trong app | `nativeLabel` + chip `nativeChip` (trung tính, `Badge` neutral) + `nativeDesc`; nếu cloud bật + chưa đăng nhập: thêm `notProtectedSignIn` + nút `Go to Account` như web | native | M12 |
| 13 | `settings.about.desc` ("on this device. No account, no tracking") | đúng nhưng nói "device" chung | `settings.about.descNative` ("this iPhone") khi tài khoản `unavailable`; từ M14 dùng `descCloud` / `descSignedIn` như web | native ∧ `AuthState = unavailable` | M12 |
| 14 | `settings.about.privacyLink` | link tương đối trong WebView sẽ điều hướng ra khỏi SPA | **giữ chữ**, link tuyệt đối `publicSiteUrl + 'privacy.html'`, `target="_blank"`, thêm chữ ẩn `a11y.opensExternal` | native | M12 |
| 15 | `storageError.body`, `step1` … `step3` (S9: "private or incognito windows", "Reload the page") | không có cửa sổ riêng tư / tải lại trang | `storageError.bodyNative`, `step1Native` … `step3Native`; tiêu đề `storageError.title` giữ; nút `common.tryAgain` giữ | native | M12 |
| 16 | `errors.AUTH_FAILED` ("same browser"), `exportHint.text`, `settings.account.descSignedOut`, `privacyNote`, `provider` | nói "trình duyệt", "Google" | xem 7.8.2 | `nativeAuth`, `appleSignIn` | M14 |

Giữ nguyên trên native (đã rà): `offline.chip`, `settings.reminders.on/off/time/allow`, `settings.permission.default/granted/denied/unsupported` (chip), `settings.backup.desc/last/lastNever/export/import/importHint`, `import.*`, `backup.banner.old/action`, `settings.storage.notProtectedSignIn`, `settings.about.descCloud/descSignedIn/privacy`, `errors.loadView*`, `errorBoundary.*`, `notFound.*`, mọi chuỗi Today/Goals/Review/Goal detail/Day, `ics.*` (nội dung tệp `.ics`), `toast.backupExported`.

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `settings.language.nativeNote` | M12 | card Language native, `.hint` thay `browserNote` | `The date and time pickers and permission prompts follow your iPhone's language.` | `Ô chọn ngày, giờ và hộp xin quyền do iOS hiển thị nên theo ngôn ngữ của iPhone.` |
| `settings.permission.nativeUnsupportedDesc` | M12 | Reminders native M12 … M14, dưới chip `Not supported` | `Reminder notifications aren't available in this version of the app. You'll still see a reminder banner in the app.` | `Thông báo nhắc nhở chưa có trong phiên bản app này. Bạn vẫn sẽ thấy lời nhắc ngay trong app.` |
| `settings.backup.shareHint` | M12 | card Backup native, `.hint` dưới hàng nút | `Export opens the iOS share sheet. Choose Save to Files, AirDrop, Mail or another app.` | `Xuất sao lưu sẽ mở bảng chia sẻ của iOS. Hãy chọn Lưu vào Tệp, AirDrop, Mail hoặc app khác.` |
| `backup.banner.neverNative` | M12 | thay `backup.banner.never` (Today có nút, Settings không nút) | `You haven't backed up yet. Export a backup so your data is safe if you delete the app or switch iPhones.` | `Bạn chưa sao lưu lần nào. Hãy xuất một bản sao lưu để dữ liệu vẫn an toàn nếu bạn xóa app hoặc đổi iPhone.` |
| `errors.EXPORT_FAILED_native` | M12 | thay `errors.EXPORT_FAILED` khi `nativeShare`; Alert `role="alert"` trong card Backup | `Couldn't create the backup file. Your data on this device is unchanged. Try again, and if it keeps failing, free up some space on your iPhone.` | `Không tạo được tệp sao lưu. Dữ liệu trên thiết bị này không thay đổi. Hãy thử lại; nếu vẫn lỗi, hãy giải phóng bớt dung lượng trên iPhone.` |
| `toast.icsShared` | M12 | sau khi share sheet hoàn tất cho `.ics` (thay `toast.icsDownloaded`) | `Calendar file shared` | `Đã chia sẻ tệp lịch` |
| `settings.storage.nativeLabel` | M12 | nhãn dòng trạng thái card Storage native | `Where your data is kept` | `Nơi lưu dữ liệu của bạn` |
| `settings.storage.nativeChip` | M12 | chip trung tính (không "Protected"/"Not protected") | `In this app` | `Trong app này` |
| `settings.storage.nativeDesc` | M12 | mô tả dưới chip | `Your data is kept inside this app on your iPhone. Deleting the app deletes this data, and iOS may clear it if the iPhone runs very low on space. Export a backup now and then.` | `Dữ liệu của bạn được lưu bên trong app này trên iPhone. Xóa app sẽ xóa dữ liệu này, và iOS có thể xóa nó khi iPhone gần hết dung lượng. Hãy thỉnh thoảng xuất bản sao lưu.` |
| `settings.about.descNative` | M12 | About native khi tài khoản `unavailable` (thay `settings.about.desc`) | `Everything you log stays on this iPhone. No account, no tracking.` | `Mọi thứ bạn ghi lại đều nằm trên iPhone này. Không tài khoản, không theo dõi.` |
| `storageError.bodyNative` | M12 | S9 native, thay `storageError.body` | `1% Better keeps your data in this app's storage on your iPhone, and it isn't available right now. Nothing has been changed.` | `1% Better lưu dữ liệu của bạn trong bộ nhớ của app trên iPhone, nhưng hiện không dùng được. Chưa có gì bị thay đổi.` |
| `storageError.step1Native` | M12 | mục 1 của `<ol>` (không chứa số) | `Close 1% Better completely and open it again.` | `Đóng hẳn 1% Better rồi mở lại.` |
| `storageError.step2Native` | M12 | mục 2 | `Restart your iPhone.` | `Khởi động lại iPhone.` |
| `storageError.step3Native` | M12 | mục 3 | `Make sure your iPhone has some free space.` | `Đảm bảo iPhone còn dung lượng trống.` |
| `a11y.opensExternal` | M12 | chữ ẩn (`sr-only`) cuối nhãn mọi link mở bằng Safari: Privacy, Support, hướng dẫn Apple | `(opens in Safari)` | `(mở trong Safari)` |

Bản web không bao giờ dùng 15 key này (kiểm bằng parity test: key có ở cả `en.json` và `vi.json`; không cần kiểm "không dùng ở web").

#### 7.8.2 Sign in with Apple và biến thể iOS của card Account (M14)

Nhãn nút Apple do Apple quy định (không dịch ý, `vi` theo bản địa hoá của Apple). `settings.account.provider` ("Signed in with Google") giữ nguyên cho tài khoản chỉ có Google.

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `auth.signInApple` | M14 | nhãn nút Apple (mọi nơi: card, banner, hint); **chỉ** chuỗi này; tên truy cập của nút | `Sign in with Apple` | `Đăng nhập bằng Apple` |
| `settings.account.descSignedOutIos` | M14 | A1 trên iOS, thay `descSignedOut` | `Sign in with Apple or Google to keep a copy of your goals and entries in your account and use them on all your devices. You don't need an account to use 1% Better.` | `Đăng nhập bằng Apple hoặc Google để lưu một bản sao mục tiêu và lần ghi vào tài khoản của bạn và dùng trên mọi thiết bị. Bạn không cần tài khoản để dùng 1% Better.` |
| `settings.account.privacyNoteIos` | M14 | A1 trên iOS, `.hint` dưới hai nút, thay `privacyNote` | `From Google or Apple, the app only receives your name and email.` | `Từ Google hoặc Apple, app chỉ nhận tên và email của bạn.` |
| `settings.account.hideEmailNote` | M14 | A1 trên iOS, `.hint` thứ hai (A-60) | `If you choose Hide My Email, Apple gives you a private address and you get a separate account that isn't linked to a Google account.` | `Nếu bạn chọn "Ẩn email của tôi" (Hide My Email), Apple sẽ cấp một địa chỉ riêng tư và bạn có một tài khoản riêng, không liên kết với tài khoản Google.` |
| `settings.account.providerApple` | M14 | A5 … A9, dưới email, identity chỉ có Apple | `Signed in with Apple` | `Đã đăng nhập bằng Apple` |
| `settings.account.providerBoth` | M14 | A5 … A9, có cả hai identity (cùng email đã xác minh) | `Signed in with Apple or Google` | `Đã đăng nhập bằng Apple hoặc Google` |
| `errors.AUTH_FAILED_native` | M14 | thay `errors.AUTH_FAILED` khi `nativeAuth`; Alert A4 và (bản ngắn) toast dùng `toast.signInFailed` | `Couldn't sign you in. Nothing on this device changed. Try again.` | `Không đăng nhập được. Không có gì trên thiết bị này bị thay đổi. Hãy thử lại.` |
| `exportHint.textNative` | M14 | `ExportSignInHint` khi `nativeShare` (thay `exportHint.text`; nói đúng "exported", không nêu riêng Google vì có cả Apple) | `Backup exported. To keep a copy automatically, sign in: your goals and entries then sync to your account.` | `Đã xuất bản sao lưu. Để có thêm một bản sao tự động, hãy đăng nhập: mục tiêu và lần ghi của bạn sẽ được đồng bộ vào tài khoản.` |

Quy tắc chọn key (bổ sung bảng 7.3): `AUTH_FAILED` ∧ `capabilities.nativeAuth` → `errors.AUTH_FAILED_native`; còn lại `errors.AUTH_FAILED`. `EXPORT_FAILED` ∧ `capabilities.nativeShare` → `errors.EXPORT_FAILED_native`. `AUTH_OFFLINE`, `AUTH_CANCELLED`, `AUTH_SESSION_EXPIRED` dùng chung web/native (không nhắc "trình duyệt").

#### 7.8.3 Delete account, D6, panel thu hồi Apple, lỗi `ACCOUNT_DELETE_*` (M14, web và native)

Các mã lỗi theo ARCH §5.4 (`ACCOUNT_DELETE_OFFLINE`, `_CANCELLED`, `_FAILED`, `_SESSION_EXPIRED`); `src/ui/error-messages.ts` ánh xạ `errors.<CODE>` (không biến thể). Lỗi hiện trong **Alert `role="alert"` bên trong D6** (không toast). Thành công dùng toast (một toast) và, nếu cần, panel.

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `settings.account.delete` | M14 | nhãn nút ở card Account (`danger-ghost`) | `Delete account` | `Xóa tài khoản` |
| `settings.account.deleteDesc` | M14 | `.hint` trên nút | `Permanently deletes your account and everything stored in it. This can't be undone.` | `Xóa vĩnh viễn tài khoản của bạn và mọi thứ được lưu trong đó. Bạn không thể hoàn tác.` |
| `settings.account.deleteOffline` | M14 | dưới nút khi offline (nối `aria-describedby`) | `You're offline. Connect to the internet to delete your account.` | `Bạn đang ngoại tuyến. Hãy kết nối mạng để xóa tài khoản.` |
| `settings.account.deleteExpired` | M14 | dưới nút khi `expired` (A10) | `Your sign-in expired. Sign in again first, then delete your account.` | `Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại trước, rồi xóa tài khoản.` |
| `auth.delete.title` | M14 | D6, tiêu đề | `Delete your account?` | `Xóa tài khoản của bạn?` |
| `auth.delete.body` | M14 | D6, thân (nêu hậu quả: vĩnh viễn, không hoàn tác, thiết bị khác) | `This permanently deletes your account and all the goals, entries and settings stored in it. It can't be undone. Other devices signed in to this account will need to sign in again.` | `Thao tác này xóa vĩnh viễn tài khoản của bạn và mọi mục tiêu, lần ghi, cài đặt được lưu trong đó. Bạn không thể hoàn tác. Các thiết bị khác đang đăng nhập tài khoản này sẽ phải đăng nhập lại.` |
| `auth.delete.account` | M14 | D6, `.hint` dưới thân; `{{email}}` nguyên văn | `Account: {{email}}` | `Tài khoản: {{email}}` |
| `auth.delete.appleNote` | M14 | D6, khối thông tin; **chỉ** khi iOS và tài khoản có identity Apple | `You use Sign in with Apple, so iOS will ask you to confirm with Apple first. This also removes 1% Better from the apps connected to your Apple ID.` | `Bạn đang dùng Đăng nhập bằng Apple nên iOS sẽ yêu cầu bạn xác nhận với Apple trước. Việc này cũng gỡ 1% Better khỏi danh sách app đã kết nối với ID Apple của bạn.` |
| `auth.delete.legend` | M14 | D6, legend của nhóm radio | `What should happen to the data on this device?` | `Dữ liệu trên thiết bị này sẽ được xử lý thế nào?` |
| `auth.delete.remove` | M14 | lựa chọn **mặc định** (OQ-16) | `Remove data from this device` | `Xóa dữ liệu khỏi thiết bị này` |
| `auth.delete.removeDesc` | M14 | mô tả Remove | `Deletes the goals, entries and reminder settings on this device too, so nothing is left behind.` | `Xóa luôn mục tiêu, lần ghi và cài đặt nhắc nhở trên thiết bị này, nên không còn gì sót lại.` |
| `auth.delete.keep` | M14 | lựa chọn Keep | `Keep data on this device` | `Giữ dữ liệu trên thiết bị này` |
| `auth.delete.keepDesc` | M14 | mô tả Keep | `You can keep using 1% Better without an account. Only your account and the copy stored in it are deleted.` | `Bạn vẫn dùng 1% Better bình thường mà không cần tài khoản. Chỉ tài khoản của bạn và bản sao lưu trong đó bị xóa.` |
| `auth.delete.confirm` | M14 | nút xác nhận (`danger`), cả hai lựa chọn | `Delete account` | `Xóa tài khoản` |
| `auth.delete.working` | M14 | nhãn nút xác nhận khi bận | `Deleting…` | `Đang xóa…` |
| `auth.delete.workingStatus` | M14 | vùng `role="status"` khi bận | `Deleting your account. This can take a few seconds.` | `Đang xóa tài khoản của bạn. Việc này có thể mất vài giây.` |
| `auth.delete.revokeTitle` | M14 | panel thu hồi Apple, dòng đậm | `One more step for Apple` | `Còn một bước với Apple` |
| `auth.delete.revokeBody` | M14 | panel thu hồi Apple (khi `appleRevoked = 'manual-required'`) | `Your account is deleted, but Apple may still list 1% Better under Sign in with Apple. To remove it, open Settings on your iPhone, tap your name, then Sign-In & Security > Sign in with Apple, choose 1% Better per Day and tap Stop Using Apple ID.` | `Tài khoản của bạn đã được xóa, nhưng Apple có thể vẫn liệt kê 1% Better trong mục Đăng nhập bằng Apple. Để gỡ, hãy mở Cài đặt trên iPhone, chạm vào tên của bạn, chọn Đăng nhập & Bảo mật > Đăng nhập bằng Apple, chọn 1% Better per Day rồi chạm "Stop Using Apple ID" (Ngừng dùng ID Apple).` |
| `auth.delete.revokeLink` | M14 | link tới `https://support.apple.com/102571` (có chữ ẩn `a11y.opensExternal`) | `See Apple's instructions` | `Xem hướng dẫn của Apple` |
| `errors.ACCOUNT_DELETE_OFFLINE` | M14 | Alert trong D6 | `You're offline, so your account wasn't deleted. Connect to the internet and try again.` | `Bạn đang ngoại tuyến nên tài khoản chưa được xóa. Hãy kết nối mạng rồi thử lại.` |
| `errors.ACCOUNT_DELETE_CANCELLED` | M14 | Alert trong D6, người dùng huỷ bảng Sign in with Apple | `The Apple confirmation was cancelled, so your account wasn't deleted. Nothing changed.` | `Bạn đã hủy bước xác nhận với Apple nên tài khoản chưa được xóa. Không có gì thay đổi.` |
| `errors.ACCOUNT_DELETE_FAILED` | M14 | Alert trong D6 (function lỗi / timeout) | `Couldn't delete your account just now. Nothing was removed from this device. Check your connection and try again. If it keeps failing, contact support from the About card.` | `Chưa xóa được tài khoản của bạn. Không có gì bị xóa khỏi thiết bị này. Hãy kiểm tra kết nối rồi thử lại. Nếu vẫn lỗi, hãy liên hệ hỗ trợ trong mục Giới thiệu.` |
| `errors.ACCOUNT_DELETE_SESSION_EXPIRED` | M14 | Alert trong D6 (401 hoặc `expired`) | `Your sign-in is no longer valid, so the account couldn't be deleted. Sign in again and try again. If you deleted it a moment ago, it is already gone.` | `Phiên đăng nhập không còn hợp lệ nên chưa xóa được tài khoản. Hãy đăng nhập lại rồi thử lại. Nếu bạn vừa xóa xong, tài khoản đã được xóa rồi.` |
| `toast.accountDeletedKept` | M14 | sau xoá, đã chọn Keep | `Account deleted. Your data is still on this device.` | `Đã xóa tài khoản. Dữ liệu của bạn vẫn còn trên thiết bị này.` |
| `toast.accountDeletedRemoved` | M14 | sau xoá, đã chọn Remove | `Account deleted. Data removed from this device.` | `Đã xóa tài khoản. Dữ liệu đã được xóa khỏi thiết bị này.` |

(D6 dùng lại `common.cancel`, `common.dismiss` cho nút ở panel. Chuỗi "Sign in with Apple" trong `auth.delete.appleNote` và `revokeBody` là tên tính năng của Apple, không phải nhãn nút.)

#### 7.8.4 Thông báo lên lịch trước và quyền iOS (M15; FR-62)

**Quyết định (item 4 của M12-T7):** khi `capabilities.scheduledNotifications === true` (iOS từ M15), card Reminders **ẩn nút `.ics` và dòng `icsHint`** (và khung giới hạn "chỉ khi app mở", gợi ý Home Screen). Lý do: (1) `.ics` chỉ là lối vòng cho giới hạn "app đóng thì không nhắc" (NFR-07) mà iOS đã giải quyết; (2) thêm sự kiện lịch **và** thông báo của app sẽ nhắc đôi mỗi ngày; (3) đưa tệp `.ics` qua share sheet là bước thừa, dễ làm người dùng lạc ở Mail/Files. Trước M15 (M12 … M14, chưa có lịch trước) nút `.ics` **còn** và đi qua share sheet (M12-T3, M12-AC5). Quyết định đảo ngược chỉ cần hiện lại một nút; không đổi key. Bản web: như cũ.

Thông báo là **tổng quát, không nêu tiến độ** vì được lập lịch trước tới 14 ngày (lúc nó hiện, số phút có thể đã khác). Chuỗi do `Translator` dịch theo ngôn ngữ đang chọn **lúc lập lịch** (đổi ngôn ngữ thì lập lịch lại).

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `notification.nativeTitle` | M15 | `title` của local notification | `1% Better` | `1% Better` (= en) |
| `notification.nativeBody` | M15 | `body` của local notification (cùng một câu mọi ngày, mọi số goal) | `Log today's time. Small steps add up.` | `Hãy ghi thời gian hôm nay. Từng bước nhỏ sẽ dày lên.` |
| `settings.reminders.nativeSwitchDesc` | M15 | mô tả switch native, thay `switchDesc` | `Get a notification every day at your reminder time. If you've already met all your targets today, today's is skipped.` | `Nhận thông báo mỗi ngày vào giờ nhắc. Nếu hôm nay bạn đã đạt mọi chỉ tiêu, thông báo của hôm nay sẽ được bỏ qua.` |
| `settings.reminders.nativeInfo` | M15 | khung `.limit` (viền trái `--info`) thay `settings.reminders.limit`; nói đúng giới hạn 14 ngày (A-63) | `Your iPhone sends these reminders, even when 1% Better is closed. They're scheduled for the next 14 days each time you open the app, so open it now and then.` | `iPhone của bạn sẽ gửi các lời nhắc này, kể cả khi 1% Better đã đóng. Mỗi lần bạn mở app, lời nhắc được lên lịch cho 14 ngày tới, nên hãy thỉnh thoảng mở app.` |
| `settings.permission.nativeDefaultDesc` | M15 | chip `Not asked yet`, thay `defaultDesc` | `Turn on the reminder and iOS will ask for permission to send you notifications.` | `Bật nhắc nhở và iOS sẽ xin quyền gửi thông báo cho bạn.` |
| `settings.permission.nativeGrantedDesc` | M15 | chip `Allowed`, thay `grantedDesc` | `You'll get a notification at your reminder time, even when 1% Better is closed.` | `Bạn sẽ nhận thông báo vào giờ nhắc, kể cả khi 1% Better đã đóng.` |
| `settings.permission.nativeDeniedDesc` | M15 | chip `Blocked`, thay `errors.NOTIFICATIONS_DENIED`; **hướng dẫn mở Cài đặt iOS** (chỉ có chữ hướng dẫn, không có nút mở thẳng Cài đặt; xem A-D70 và OQ-D27) | `Notifications are turned off for 1% Better. Open the Settings app on your iPhone, tap Notifications, choose 1% Better and turn on Allow Notifications, then come back. You'll still see a reminder banner in the app.` | `Thông báo đang bị tắt cho 1% Better. Hãy mở app Cài đặt trên iPhone, chạm Thông báo, chọn 1% Better và bật Cho phép thông báo, rồi quay lại. Bạn vẫn sẽ thấy lời nhắc ngay trong app.` |
| `settings.permission.nativeDefaultOnDesc` | M15 | chip `Not asked yet` khi nhắc đã bật từ tài khoản (A-64), thay `defaultOnDesc` | `Reminders are on, but this iPhone hasn't allowed notifications yet. Allow them to get your reminder; you'll still see the reminder banner in the app.` | `Nhắc nhở đang bật nhưng iPhone này chưa cho phép thông báo. Hãy cho phép để nhận lời nhắc; bạn vẫn sẽ thấy lời nhắc ngay trong app.` |

Ba trạng thái quyền của iOS dùng lại chip `settings.permission.default/granted/denied` (không có `unsupported` trên iOS từ M15). Nút `settings.reminders.allow` ("Allow notifications") hiện ở `Not asked yet`, bấm → hộp xin quyền của iOS (đúng một lần; sau khi từ chối chỉ còn hướng dẫn Cài đặt). Thông báo nhắc **không** có nút hành động, không âm riêng, không badge số; chạm → `#/today`.

#### 7.8.5 Link About (M15)

| Key | MS | Ngữ cảnh | `en` | `vi` |
| :- | :- | :- | :- | :- |
| `settings.about.supportLink` | M15 | card About (web **và** native), link tới `support.html` cùng cách với `privacyLink`: web cùng tab, native mở Safari; đứng **dưới** `privacyLink` | `Support` | `Hỗ trợ` |

#### 7.8.6 Trang công khai: `public/support.html` và `public/privacy.html` (M15-T4, M14-T6; FR-65)

Hai trang **tĩnh, tự chứa** (HTML + CSS inline, không script, không font/ảnh/tài nguyên ngoài origin), cùng khung với `public/privacy.html` hiện có: `<html lang="en">`, logo brand mark (`./brand-mark-96.png` cùng origin) + chữ `1% Better per Day` ở đầu trang (link về `./`), **hai card** xếp dọc ngăn bằng `<hr>`: card tiếng Anh (`en`) rồi card tiếng Việt (`<section lang="vi">`); token màu sáng/tối như `privacy.html` (cùng giá trị với mục 6.1); `<meta name="color-scheme" content="light dark">`; `<title>` theo ngôn ngữ chính (`Support — 1% Better per Day`, `Privacy policy — 1% Better per Day`); mỗi card có một `<h1>` (`id` riêng cho `aria-labelledby`). Địa chỉ liên hệ: **minh.lgm@gmail.com** (như `privacy.html` hiện có; xem OQ-D22). Hai trang link chéo cho nhau ở cuối mỗi card. Văn bản dưới đây là **nguyên văn** cho developer (không có key i18n vì là HTML tĩnh).

##### `support.html` — tiếng Anh

- **h1** `Support`
- Đoạn mở: `Need help with 1% Better per Day, or found a problem? Write to minh.lgm@gmail.com (mailto link). I'm one person, so I reply as soon as I can, usually within a few days. Please tell me which device you use (for example iPhone 15, iOS 18) and what you were doing.`
- **h2** `Common questions` rồi 6 cặp **h3** (câu hỏi) + đoạn trả lời:
  1. `How do I back up my data or move to a new iPhone?` → `Open Settings → Backup → Export backup (JSON) and choose Save to Files, or send the file to yourself. On the new device open Settings → Backup → Import backup… and pick the file. Or sign in with Apple or Google on both devices and your goals and entries sync to your account.`
  2. `Why didn't I get my reminder?` → `Open Settings → Reminders. Check that the reminder is on and that notifications say Allowed. If they say Blocked, open the iPhone Settings app → Notifications → 1% Better and turn on Allow Notifications. Reminders are scheduled for the next 14 days each time you open the app, so open it now and then. A day is skipped when you've already met all your targets.`
  3. `Is my data on the web app and the iPhone app the same?` → `Not automatically: each keeps its own data on the device. Sign in to the same account on both (Google, or Apple with the same email) and they sync, or export from one and import into the other.`
  4. `How do I delete my account?` → `Sign in, then open Settings → Account → Delete account. This deletes your account and everything stored in it, and it can't be undone. You choose whether the data on that device is removed too.`
  5. `What does Hide My Email do?` → `If you choose Hide My Email when you sign in with Apple, you get a separate account. It does not share data with an account that uses your Gmail address.`
  6. `Found a bug or have an idea?` → `Open an issue on GitHub (link https://github.com/minh-lgm/one-percent-better/issues) or email me.`
- Cuối card: `Privacy policy` (link `privacy.html`).

##### `support.html` — tiếng Việt (`<section lang="vi">`)

- **h1** `Hỗ trợ`
- Đoạn mở: `Bạn cần giúp đỡ với 1% Better per Day, hoặc gặp sự cố? Hãy gửi email tới minh.lgm@gmail.com. Mình chỉ có một người, nên sẽ trả lời sớm nhất có thể, thường trong vài ngày. Vui lòng cho biết bạn dùng thiết bị nào (ví dụ iPhone 15, iOS 18) và bạn đang làm gì.`
- **h2** `Câu hỏi thường gặp` rồi 6 cặp:
  1. `Làm sao để sao lưu dữ liệu hoặc chuyển sang iPhone mới?` → `Mở Cài đặt → Sao lưu → Xuất sao lưu (JSON) rồi chọn Lưu vào Tệp, hoặc gửi tệp cho chính bạn. Trên thiết bị mới, mở Cài đặt → Sao lưu → Nhập sao lưu… và chọn tệp đó. Hoặc đăng nhập bằng Apple hoặc Google trên cả hai thiết bị để mục tiêu và lần ghi được đồng bộ vào tài khoản.`
  2. `Vì sao tôi không nhận được lời nhắc?` → `Mở Cài đặt → Nhắc nhở. Kiểm tra lời nhắc đang bật và quyền thông báo là Đã cho phép. Nếu là Bị chặn, hãy mở app Cài đặt trên iPhone → Thông báo → 1% Better và bật Cho phép thông báo. Lời nhắc được lên lịch cho 14 ngày tới mỗi lần bạn mở app, nên hãy thỉnh thoảng mở app. Ngày bạn đã đạt đủ chỉ tiêu sẽ được bỏ qua.`
  3. `Dữ liệu trên bản web và trên app iPhone có giống nhau không?` → `Không tự động: mỗi nơi giữ dữ liệu riêng trên thiết bị. Hãy đăng nhập cùng một tài khoản ở cả hai nơi (Google, hoặc Apple dùng cùng email) để đồng bộ, hoặc xuất từ nơi này rồi nhập vào nơi kia.`
  4. `Làm sao để xóa tài khoản?` → `Đăng nhập, rồi mở Cài đặt → Tài khoản → Xóa tài khoản. Thao tác này xóa tài khoản của bạn và mọi thứ được lưu trong đó, và không thể hoàn tác. Bạn tự chọn có xóa luôn dữ liệu trên thiết bị đó hay không.`
  5. `"Ẩn email của tôi" (Hide My Email) làm gì?` → `Nếu bạn chọn "Ẩn email của tôi" khi đăng nhập bằng Apple, bạn sẽ có một tài khoản riêng. Tài khoản đó không dùng chung dữ liệu với tài khoản dùng địa chỉ Gmail của bạn.`
  6. `Gặp lỗi hoặc có ý tưởng?` → `Hãy mở một issue trên GitHub (link https://github.com/minh-lgm/one-percent-better/issues) hoặc gửi email cho mình.`
- Cuối card: `Chính sách quyền riêng tư` (link `privacy.html`).

##### `privacy.html` — thay toàn bộ nội dung hai card hiện có (cấu trúc, màu, brand giữ nguyên); ngày cập nhật = ngày đẩy bản này (mặc định `2026-10-21` / `21/10/2026`)

Đoạn **mới hoặc đổi** được đánh dấu **[mới]** / **[đổi]**; đoạn không đánh dấu giữ nguyên ý bản 2026-10-12 (chỉ điều chỉnh từ ngữ "trình duyệt" → "thiết bị"). Developer dùng nguyên văn.

*Tiếng Anh* — **h1** `Privacy policy` · `Last updated: 2026-10-21`
- **h2** `Who this is for` **[mới]**: `1% Better per Day is a personal, open-source project by Minh. It is available as a web app and as an iPhone app. This policy covers both.`
- **h2** `What the app stores` **[đổi]**: `1% Better per Day keeps your goals, time entries, settings and running timer on your device: in the app's own storage on iPhone, or in your browser's IndexedDB on the web. Without an account nothing ever leaves your device: no analytics, no server, no advertising, no third-party scripts or SDKs that collect data.`
- **h2** `If you sign in (optional)` **[đổi]**:
  - `On the iPhone app you can sign in with Apple or with Google. On the web you can sign in with Google. Signing in is optional.`
  - `From Apple or Google the app receives only your name and email address (Google scopes openid email profile; Apple: name and email, which may be Apple's private relay address if you choose Hide My Email). No profile photo, no contacts, no other data. Apple shares your name only the first time you sign in.`
  - `Your goals, entries, reminder settings and language are then synced to the app's database (Supabase, project grmcmidzyqwryaangpug) under your account, so you can use them on all your devices. This data, with your email, name and a user ID, is linked to your account and used only to run the app; it is not used for tracking or advertising. Row Level Security ensures that only you can read or change your rows; other people who use the app cannot see them.`
  - `The session token is stored on your device so you stay signed in. Signing out removes it.`
- **h2** `Notifications` **[mới]**: `On iPhone, reminders are local notifications scheduled by the app on your device. No push notification server is used and nothing about your reminders leaves your device. You can turn them off in Settings → Reminders or in the iPhone Settings app.`
- **h2** `What the app does not do`: `No tracking, no advertising identifier, no advertising, no selling or sharing of data with anyone. The app does not send device, location or usage information, and does not use your camera, contacts, photos or health data.`
- **h2** `Deleting your data` **[đổi]**:
  - `Delete your account in the app: sign in, then Settings → Account → Delete account. This permanently deletes your account and every goal, entry and setting stored in it, right away. You choose whether the data on that device is removed too. If you used Sign in with Apple, the app also asks Apple to disconnect it; if that can't be done you can do it yourself in iPhone Settings → your name → Sign-In & Security → Sign in with Apple → 1% Better per Day → Stop Using Apple ID.`
  - `On a device only: Settings → Account → Sign out → "Remove data from this device" deletes goals, entries and reminder settings on that device (the language setting stays). Deleting the iPhone app also removes the data stored on that iPhone, but not your account.`
  - `If you can't open the app, write to minh.lgm@gmail.com from the address you signed in with and I will delete your account.`
- **h2** `Children` **[mới]**: `The app is not directed at children and contains no advertising or tracking. If you think a child has created an account, email me and I will delete it.`
- **h2** `Changes` **[mới]**: `If this policy changes, the date at the top changes too.`
- **h2** `Contact`: `Questions: minh.lgm@gmail.com. The app is open source: github.com/minh-lgm/one-percent-better. Support: support.html.`

*Tiếng Việt* — **h1** `Chính sách quyền riêng tư` · `Cập nhật: 21/10/2026`
- **h2** `Chính sách này dành cho ai` **[mới]**: `1% Better per Day là dự án cá nhân, mã nguồn mở của Minh. App có dạng ứng dụng web và ứng dụng iPhone. Chính sách này áp dụng cho cả hai.`
- **h2** `App lưu những gì` **[đổi]**: `1% Better per Day lưu mục tiêu, lần ghi, cài đặt và bộ đếm giờ đang chạy trên thiết bị của bạn: trong bộ nhớ riêng của app trên iPhone, hoặc trong IndexedDB của trình duyệt trên web. Khi chưa đăng nhập, không có gì rời khỏi thiết bị: không phân tích, không máy chủ, không quảng cáo, không script hay SDK bên thứ ba thu thập dữ liệu.`
- **h2** `Nếu bạn đăng nhập (tùy chọn)` **[đổi]**:
  - `Trên app iPhone bạn có thể đăng nhập bằng Apple hoặc Google. Trên web bạn có thể đăng nhập bằng Google. Đăng nhập là tùy chọn.`
  - `Từ Apple hoặc Google, app chỉ nhận tên và địa chỉ email của bạn (Google: scope openid email profile; Apple: tên và email, có thể là địa chỉ riêng tư của Apple nếu bạn chọn "Ẩn email của tôi"). Không ảnh đại diện, không danh bạ, không dữ liệu nào khác. Apple chỉ chia sẻ tên của bạn ở lần đăng nhập đầu tiên.`
  - `Mục tiêu, lần ghi, cài đặt nhắc nhở và ngôn ngữ của bạn sau đó được đồng bộ vào cơ sở dữ liệu của app (Supabase, project grmcmidzyqwryaangpug) dưới tài khoản của bạn để dùng trên mọi thiết bị. Dữ liệu này, cùng email, tên và mã người dùng của bạn, gắn với tài khoản của bạn và chỉ dùng để vận hành app; không dùng để theo dõi hay quảng cáo. Row Level Security bảo đảm chỉ bạn đọc hoặc sửa được dữ liệu của mình; những người khác dùng app không xem được chúng.`
  - `Token phiên đăng nhập được lưu trên thiết bị để bạn không phải đăng nhập lại. Đăng xuất sẽ xóa nó.`
- **h2** `Thông báo` **[mới]**: `Trên iPhone, lời nhắc là thông báo cục bộ do app lên lịch ngay trên thiết bị của bạn. Không dùng máy chủ thông báo đẩy và không có gì về lời nhắc của bạn rời khỏi thiết bị. Bạn có thể tắt chúng trong Cài đặt → Nhắc nhở hoặc trong app Cài đặt của iPhone.`
- **h2** `App không làm gì`: `Không theo dõi, không mã định danh quảng cáo, không quảng cáo, không bán hay chia sẻ dữ liệu với bất kỳ ai. App không gửi thông tin thiết bị, vị trí hay cách sử dụng, và không dùng camera, danh bạ, ảnh hay dữ liệu sức khỏe của bạn.`
- **h2** `Xóa dữ liệu của bạn` **[đổi]**:
  - `Xóa tài khoản ngay trong app: đăng nhập, rồi Cài đặt → Tài khoản → Xóa tài khoản. Thao tác này xóa vĩnh viễn tài khoản của bạn và mọi mục tiêu, lần ghi, cài đặt được lưu trong đó, ngay lập tức. Bạn chọn có xóa luôn dữ liệu trên thiết bị đó hay không. Nếu bạn đã dùng Đăng nhập bằng Apple, app cũng yêu cầu Apple ngắt kết nối; nếu không làm được, bạn có thể tự làm trong Cài đặt iPhone → tên của bạn → Đăng nhập & Bảo mật → Đăng nhập bằng Apple → 1% Better per Day → "Stop Using Apple ID" (Ngừng dùng ID Apple).`
  - `Chỉ trên một thiết bị: Cài đặt → Tài khoản → Đăng xuất → "Xóa dữ liệu khỏi thiết bị này" sẽ xóa mục tiêu, lần ghi và cài đặt nhắc nhở trên thiết bị đó (ngôn ngữ được giữ). Xóa app iPhone cũng xóa dữ liệu lưu trên iPhone đó, nhưng không xóa tài khoản của bạn.`
  - `Nếu không mở được app, hãy gửi email tới minh.lgm@gmail.com từ địa chỉ bạn đã dùng để đăng nhập; mình sẽ xóa tài khoản cho bạn.`
- **h2** `Trẻ em` **[mới]**: `App không nhắm tới trẻ em và không có quảng cáo hay theo dõi. Nếu bạn cho rằng một trẻ đã tạo tài khoản, hãy gửi email cho mình và mình sẽ xóa nó.`
- **h2** `Thay đổi` **[mới]**: `Nếu chính sách này thay đổi, ngày ở đầu trang cũng thay đổi.`
- **h2** `Liên hệ`: `Thắc mắc: minh.lgm@gmail.com. Mã nguồn mở: github.com/minh-lgm/one-percent-better. Hỗ trợ: support.html.`

Kiểm tĩnh (M15-AC7): `privacy.html` chứa "Sign in with Apple", "Settings → Account → Delete account" và bản `vi` "Cài đặt → Tài khoản → Xóa tài khoản", "local notifications" / "thông báo cục bộ", "iPhone"; `support.html` có `mailto:minh.lgm@gmail.com`, `https://github.com/minh-lgm/one-percent-better/issues`, `lang` cho từng phần.

#### 7.8.7 Hồ sơ App Store (`store/ios/metadata/{en-US,vi}/`; M15-T5, M15-AC8; FR-65)

Mỗi mục là **một tệp `.txt` UTF-8, không dòng trống thừa ở cuối** (đúng tên tệp ở cột 1). Giới hạn của Apple: name ≤ 30 ký tự, subtitle ≤ 30, promotional text ≤ 170, description ≤ 4000, keywords ≤ **100 byte** UTF-8 (đo bằng regex byte; `vi` có dấu nên đếm byte, không đếm ký tự). Tên app không lặp trong keywords; không chữ "Android", "beta", không giá tiền hay "free"/"miễn phí". Chủ đề: Productivity (chính), Health & Fitness (phụ); độ tuổi 4+ (A-67). Số đo ghi ở cột "Đo" là kết quả đo thật trên đúng chuỗi dưới đây.

| Tệp | `en-US` | Đo | `vi` | Đo |
| :- | :- | :- | :- | :- |
| `name.txt` | `1% Better per Day` | 17 ký tự | `1% Better per Day` | 17 ký tự |
| `subtitle.txt` | `Track tiny daily progress` | 25 ký tự | `Mỗi ngày tiến bộ thêm 1%` | 24 ký tự |
| `promotional_text.txt` | `Set a goal, log a few minutes each day and watch the small gains add up. Heatmap, streaks, a timer and gentle reminders. Works offline, no ads.` | 143 ký tự | `Đặt mục tiêu, ghi vài phút mỗi ngày và xem những bước nhỏ dày lên. Biểu đồ nhiệt, chuỗi ngày, bộ đếm giờ, nhắc nhở. Dùng được khi ngoại tuyến, không quảng cáo.` | 155 … 159 ký tự |
| `keywords.txt` | `habit,tracker,goals,streak,timer,progress,daily,routine,heatmap,study,reading,practice,minutes` | 94 byte | `thói quen,mục tiêu,theo dõi,chuỗi ngày,đếm giờ,nhắc nhở,học tập` | 84 byte |
| `support_url.txt` | `https://minh-lgm.github.io/one-percent-better/support.html` | — | (giống `en-US`) | — |
| `privacy_url.txt` | `https://minh-lgm.github.io/one-percent-better/privacy.html` | — | (giống `en-US`) | — |

`description.txt` (≈ 1.600 ký tự `en-US`, ≈ 1.800 `vi`; xuống dòng bằng `\n`, mục đầu dòng bằng `•`):

```text
[en-US]
1% Better per Day helps you get a little better every day, on purpose.

Pick the things you want to do more of: reading, practice, study, exercise, anything you can measure in minutes. Set a daily target or a total number of hours, then log your time in a few taps or start the built-in timer.

WHAT YOU GET
• Goals your way: minutes per day, or total hours for a period. A goal can also run with no end date.
• Fast logging: add minutes by hand, start a timer, or fill in a day you missed.
• A year at a glance: a heatmap of every day, your current and longest streak, weekly and monthly charts.
• The 1% curve: see your real progress next to the ideal of getting 1% better every day.
• Daily reminders: a gentle notification at the time you choose, skipped when you've already met your targets.
• Works offline: everything is saved on your iPhone first.
• Backup: export your data to Files or share it anywhere, and import it back whenever you like.
• English and Vietnamese, light and dark appearance.

SIMPLE AND PRIVATE
No ads, no tracking, no analytics. You don't need an account. If you want your goals on all your devices, sign in with Apple or Google and your goals and entries sync to your account. You can delete your account and its data from inside the app at any time.

Small steps, every day. That's the whole idea.

[vi]
1% Better per Day giúp bạn tiến bộ thêm một chút mỗi ngày, một cách có chủ đích.

Chọn những việc bạn muốn làm đều đặn: đọc sách, luyện tập, học tập, thể dục, bất cứ thứ gì đo được bằng phút. Đặt chỉ tiêu theo ngày hoặc tổng số giờ, rồi ghi thời gian chỉ với vài chạm hoặc bấm bộ đếm giờ có sẵn.

BẠN CÓ GÌ
• Mục tiêu theo cách của bạn: số phút mỗi ngày, hoặc tổng số giờ trong một khoảng thời gian. Mục tiêu cũng có thể không có thời hạn.
• Ghi nhanh: nhập phút bằng tay, bấm bộ đếm giờ, hoặc ghi bù cho ngày bạn đã quên.
• Cả năm trong một cái nhìn: biểu đồ nhiệt từng ngày, chuỗi ngày hiện tại và dài nhất, biểu đồ theo tuần và theo tháng.
• Đường cong 1%: so sánh tiến bộ thực tế của bạn với mức lý tưởng là tốt hơn 1% mỗi ngày.
• Nhắc nhở hằng ngày: một thông báo nhẹ nhàng vào giờ bạn chọn, tự bỏ qua khi bạn đã đạt đủ chỉ tiêu.
• Dùng được khi ngoại tuyến: mọi thứ được lưu trên iPhone của bạn trước.
• Sao lưu: xuất dữ liệu ra Tệp hoặc chia sẻ đi bất cứ đâu, rồi nhập lại khi cần.
• Tiếng Việt và English, giao diện sáng và tối.

ĐƠN GIẢN VÀ RIÊNG TƯ
Không quảng cáo, không theo dõi, không phân tích hành vi. Bạn không cần tài khoản. Nếu muốn dùng mục tiêu trên mọi thiết bị, hãy đăng nhập bằng Apple hoặc Google; mục tiêu và lần ghi của bạn sẽ được đồng bộ vào tài khoản. Bạn có thể xóa tài khoản và dữ liệu của nó ngay trong app bất cứ lúc nào.

Những bước nhỏ, mỗi ngày. Chỉ có vậy.
```

`release_notes.txt` (What's New, bản 1.0.0):

```text
[en-US]
Welcome to 1% Better per Day on iPhone. Set goals, log your time or use the timer, see your whole year as a heatmap, follow your 1% curve, and get a daily reminder even when the app is closed. Sign in with Apple or Google if you want your goals on all your devices.

[vi]
Chào mừng bạn đến với 1% Better per Day trên iPhone. Đặt mục tiêu, ghi thời gian hoặc dùng bộ đếm giờ, xem cả năm của bạn dưới dạng biểu đồ nhiệt, theo dõi đường cong 1% và nhận lời nhắc hằng ngày kể cả khi đã đóng app. Đăng nhập bằng Apple hoặc Google nếu bạn muốn dùng mục tiêu trên mọi thiết bị.
```

`review_notes.txt` (ghi chú cho App Review, A-68; viết cho người duyệt đọc; bản `vi` để user nắm, **tệp nộp lên App Store Connect là bản `en-US`**):

```text
[en-US]
No sign-in is required to use the app: every feature works without an account and without a network connection. Signing in (Sign in with Apple or Google) is optional and only syncs the user's goals and entries to their own account. Please use your own Apple ID if you want to try it; no demo account is needed.

Account deletion: sign in, then open Settings > Account > Delete account and confirm. This permanently deletes the account and all its data from our server right away. If the account uses Sign in with Apple, iOS first asks you to confirm with Apple so the Sign in with Apple connection is revoked.

Reminders are local notifications scheduled on the device (Settings > Reminders); no push server is used. The app does not use tracking, advertising, location, camera, contacts or HealthKit.

Contact: minh.lgm@gmail.com

[vi]
Không cần đăng nhập để dùng app: mọi tính năng đều chạy được khi không có tài khoản và không có mạng. Đăng nhập (Sign in with Apple hoặc Google) là tùy chọn và chỉ đồng bộ mục tiêu và lần ghi của người dùng vào tài khoản của chính họ. Người duyệt có thể dùng Apple ID của mình để thử; không cần tài khoản demo.

Xóa tài khoản: đăng nhập, rồi mở Cài đặt > Tài khoản > Xóa tài khoản (Settings > Account > Delete account) và xác nhận. Thao tác này xóa vĩnh viễn tài khoản và toàn bộ dữ liệu khỏi máy chủ ngay lập tức. Nếu tài khoản dùng Sign in with Apple, iOS sẽ yêu cầu xác nhận với Apple trước để thu hồi kết nối Sign in with Apple.

Lời nhắc là thông báo cục bộ do thiết bị lên lịch (Cài đặt > Nhắc nhở / Settings > Reminders); không dùng máy chủ thông báo đẩy. App không dùng theo dõi, quảng cáo, vị trí, camera, danh bạ hay HealthKit.

Liên hệ: minh.lgm@gmail.com
```

Hai khối `[en-US]` / `[vi]` ở trên là **hai tệp riêng** (`store/ios/metadata/en-US/<tệp>.txt` và `store/ios/metadata/vi/<tệp>.txt`), không có dòng `[en-US]` / `[vi]` trong tệp. Tên dự phòng nếu "1% Better per Day" bị trùng khi tạo app (OQ-14): `1% Better per Day: Habits` (25 ký tự, ≤ 30).

#### 7.8.8 Kế hoạch 5 screenshot App Store và dataset demo (M15-T5, M15-AC9; FR-65)

**Quy cách chung.** iPhone 6,9" (iPhone 16 Pro Max): **1320 × 2868 px**, JPEG (`quality: 90`), không alpha, < 8 MB mỗi ảnh. Chụp từ bản build `native-e2e` (cloud tắt, nên **không** có card Account, SyncIndicator hay banner đăng nhập), Chromium, viewport **440 × 956** với `deviceScaleFactor: 3`, `timezoneId: 'Asia/Ho_Chi_Minh'`, giờ cố định `2026-10-09T19:30:00+07:00` (thứ Sáu), locale `en-US` hoặc `vi-VN`, `colorScheme` theo bảng. Trước khi chụp, đặt `--safe-top: 62px; --safe-bottom: 34px` trên `:root` (giả lập iPhone 16 Pro Max; mục 5 "Native shell") và kv `settings.lastBackupAt = 2026-10-05T12:00:00.000Z` (để không có banner "chưa sao lưu"); nhắc nhở **tắt** (không có banner nhắc). **Không** khung máy, **không** chữ quảng cáo/chú thích chồng lên (ADR-43): ảnh chính là màn hình của app. Mỗi ngôn ngữ 5 ảnh, tên `store/ios/screenshots/{en-US,vi}/0N-<màn>.jpg`. Mockup `10-store-screenshots.html` là bản phác bố cục.

| # | Tệp | Route | Theme | Trạng thái và điều cần thấy (en) |
| :- | :- | :- | :- | :- |
| 1 | `01-today.jpg` | `#/today` | **Sáng** | Tiêu đề `Today`, `Friday, October 9`, chip chuỗi ngày, `2 of 3 goals on target`; ba card: **Read `30/30 min`** (pill `+1%`, thanh đầy, ghi chú "Chapter 12"), **Guitar `22/20 min`** (pill `+1%`, thanh đầy, `Target reached · 2 min extra`), **Spanish `10/15 min`** (thanh 67 %, `5 min to go`); thanh tab dưới có vùng an toàn |
| 2 | `02-timer.jpg` | `#/today` | **Sáng** | Như ảnh 1 nhưng **bộ đếm giờ đang chạy cho Spanish: `00:12:41`** (bắt đầu 19:30:00, đẩy đồng hồ 12 phút 41 giây), TimerCard ở đầu danh sách với nút `Stop`; Read/Guitar giữ trạng thái đã đạt; Spanish card hiện `10/15 min` |
| 3 | `03-curve.jpg` | `#/goals/demo-guitar` | **Tối** | Goal detail **Guitar**: `20 min/day · 2026-08-01 – 2026-12-31`, `Day 70 of 153`, headline **`+175.0% better`** / `Tốt hơn +175,0%` (22 phút hôm nay ÷ 8 phút ngày đầu 2026-08-01), phụ đề `Today: 22 min, +4.8% vs Oct 8 (21 min). ×2.75 since Aug 1 (8 min).`, biểu đồ đường cong với "You" ở trên đường Ideal (`+100.7%` ở ngày 70), Range `So far` (khoảng > 120 ngày) |
| 4 | `04-review.jpg` | `#/review` | **Tối** | Review, `All goals`, năm 2026: heatmap đầy từ tháng 1 tới 2026-10-09 (cuộn tới tuần hiện tại), chip chuỗi, các stat card (tổng giờ, ngày đạt chỉ tiêu, chuỗi dài nhất); nếu chưa vừa thì đầu trang tới stat card đầu tiên |
| 5 | `05-goals.jpg` | `#/goals` | **Sáng** | Goals với 3 nhóm: **Active** (Read, Guitar, Spanish — dòng `15 min/day · from 2026-06-01, no end date`), **Upcoming** (Piano), **Ended** (Stretch); nút `New goal` |

Lý do chọn: ảnh 1–2 là việc dùng hằng ngày (ghi nhanh, timer); ảnh 3 là điểm khác biệt (đường cong 1%); ảnh 4 là "cả năm trong một cái nhìn"; ảnh 5 cho thấy nhiều kiểu mục tiêu (kể cả không thời hạn). Hai ảnh tối (3, 4) là nơi biểu đồ xanh trên nền tối đẹp nhất; ba ảnh sáng còn lại. Không ảnh nào cần Settings hoặc Account (bản `native-e2e` không có các phần native thật).

**Dataset demo** — `store/fixtures/demo-en.json` và `demo-vi.json` (backup `schemaVersion` 1; `exportedAt` `2026-10-09T12:30:00.000Z`; `id` ổn định như cột 1; chỉ khác tên, why, ghi chú giữa hai bản). Hôm nay = 2026-10-09 (ngày thứ 282 của năm). Tên có thể nhập đúng giới hạn (≤ 60, why ≤ 280).

| id | Tên `en` / `vi` | Why `en` / `vi` | Chỉ tiêu | Bắt đầu | Kết thúc | Trạng thái |
| :- | :- | :- | :- | :- | :- | :- |
| `demo-read` | `Read` / `Đọc sách` | `Finish 24 books this year` / `Đọc xong 24 cuốn trong năm nay` | 30 phút/ngày | 2026-01-01 | 2026-12-31 | Active |
| `demo-guitar` | `Guitar` / `Guitar` | `Play my first full song` / `Chơi trọn vẹn bài hát đầu tiên` | 20 phút/ngày | 2026-08-01 | 2026-12-31 | Active |
| `demo-spanish` | `Spanish` / `Tiếng Tây Ban Nha` | `Talk with Ana in Spanish` / `Trò chuyện với Ana bằng tiếng Tây Ban Nha` | 15 phút/ngày | 2026-06-01 | **không có** (`endDate = null`) | Active |
| `demo-piano` | `Piano` / `Piano` | `Learn a small piece by heart` / `Chơi thuộc lòng một bản nhạc nhỏ` | 25 phút/ngày | 2026-11-01 | 2026-12-31 | Upcoming |
| `demo-stretch` | `Stretch` / `Giãn cơ` | `A looser back after long desk days` / `Bớt đau lưng sau những ngày ngồi làm việc dài` | 10 phút/ngày | 2026-09-01 | 2026-09-30 | Ended |

**Entries — quy tắc xác định** (một entry mỗi ngày nếu không bị bỏ; `id` = `e-<goalId>-<YYYYMMDD>`; `source` thủ công; ghi chú trống trừ ba entry hôm nay; từ `start` tới **2026-10-08** theo công thức, riêng **2026-10-09** theo bảng riêng; `n` = thứ tự ngày trong năm, 1-1 = 1; `i` = số ngày kể từ ngày bắt đầu, ngày bắt đầu = 0):

| Goal | Bỏ ngày nếu | Số phút | Hôm nay 2026-10-09 |
| :- | :- | :- | :- |
| `demo-read` | `n mod 7 = 3` | `15 + 5 × (n mod 6)` (15 … 40) | **30**, ghi chú `Chapter 12` / `Chương 12` |
| `demo-guitar` | `i mod 6 = 5` | `8 + ⌊i / 5⌋ + (i mod 2)` | **22** (đúng công thức, `i = 69`), ghi chú `Scales and chorus` / `Gam và điệp khúc` |
| `demo-spanish` | `i mod 5 = 4` | `10 + 5 × (i mod 3)` (10, 15, 20) | **10** (ghi đè công thức), ghi chú `Lesson 8` / `Bài 8` |
| `demo-stretch` | `i mod 4 = 3` | `10` | — (đã kết thúc 2026-09-30) |
| `demo-piano` | — | — | không entry |

**Giá trị kiểm** (developer dùng làm assert trong `store-metadata`/fixture test): `demo-read` 2026-01-01 = 20 phút; 2026-01-03 không có entry; 2026-10-08 = 40. `demo-guitar` 2026-08-01 = 8; 2026-08-06 không có; 2026-10-08 = 21; 2026-10-09 = 22. `demo-spanish` 2026-06-01 = 10; 2026-06-05 không có; 2026-10-09 = 10. `demo-stretch` 2026-09-01 = 10; 2026-09-04 không có. Mọi entry thoả giới hạn (phút 1 … 1.440, ngày nằm trong thời gian goal, không có ngày tương lai). Không dùng dữ liệu cá nhân; "Ana" là tên hư cấu.

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
- Nút icon có `aria-label` mô tả đối tượng (`en`: `Edit entry: 20 min, Ch. 3`; `vi`: `Sửa lần ghi: 20 phút, Ch. 3` — key `entry.row.editAria`). Badge luôn có chữ.
- `ProgressBar`: `role="progressbar"` với `aria-valuenow/min/max` và `aria-valuetext="20 of 30 minutes"` (`vi`: `20 trên 30 phút`, key `goalCard.progressValue`), `aria-label` nêu tên goal (`goalCard.progressLabel`).
- Switch: `role="switch"` + `aria-checked`. Toast/banner động: `role="status"` (polite), lỗi chặn: `role="alert"`. Toast không tự biến mất khi đang hover/focus.
- `TimerCard`: `role="timer"` (không đọc từng giây); nút Stop có `aria-label="Stop timer for Read, running 00:25:31"` (`vi`: `Dừng đếm giờ cho Read, đã chạy 00:25:31`, key `timer.stopAria`; chứa chữ hiển thị `Dừng` nên thỏa "label in name") cập nhật khi nhận focus.
- Trạng thái vô hiệu của `Start timer`: `aria-disabled="true"` + `aria-describedby` trỏ "Stop the running timer first." (`vi`: `Hãy dừng bộ đếm giờ đang chạy trước.`; vẫn focus được để người dùng đọc lý do).
- Pill "+1%" là text thật (`+1%`), không dùng `aria-label`; kèm chữ ẩn visually `Target reached for today` (`vi`: `Hôm nay đã đạt chỉ tiêu`) cho SR. M5: vùng `aria-live="polite"` đọc `+1% for {goal} today.` (`vi`: `+1% cho {goal} hôm nay.`) đúng một lần.

**Heatmap**

- Container: `role="grid"`, `aria-label` = key `heatmap.aria` (`en`: `Activity heatmap for {year}, {goal}`; `vi`: `Biểu đồ nhiệt hoạt động năm {year}, {goal}`), `aria-rowcount=7`; hàng = thứ Hai … Chủ nhật (trùng bố cục trực quan để phím mũi tên khớp hướng nhìn); mỗi ô `role="gridcell"`, `tabindex` roving (chỉ một ô `0`: hôm nay hoặc ô cuối cùng đã qua; còn lại `-1`), có accessible name đúng mục 7.5. Ô ngoài năm là ô đệm `aria-hidden="true"`.
- Phím: Trái/Phải = tuần trước/sau (cùng thứ), Lên/Xuống = ngày trước/sau, Home/End = đầu/cuối năm, Enter/Space = mở Day (với ô hợp lệ). Ô tương lai/outside: `aria-disabled="true"`, vẫn focus được để đọc.
- Trên heatmap có tóm tắt text ngay trên lưới (hiển thị, không ẩn) — xem S6 Copy — và danh sách số liệu ở stat card.
- Không dùng `title` làm cơ chế duy nhất; tooltip hiện khi hover và focus.

**Biểu đồ (BarChart, CurveChart)**

- Mỗi biểu đồ nằm trong `<figure>` có `<figcaption>` và tóm tắt text hiển thị (7.5 / S4); SVG của Recharts đặt `aria-hidden` hoặc `role="img"` + `aria-label` bằng tóm tắt ngắn.
- Có bảng dữ liệu tương đương: BarChart — bảng ẩn visually (`.sr-only`) với `caption`; CurveChart — `<details>` "Show data as table" hiển thị được cho mọi người.
- Phân biệt hai đường Ideal/You không dựa vào màu: Ideal nét đứt mảnh + màu xám; You nét liền dày + màu xanh + marker tròn tại hôm nay; legend có mẫu nét; nhãn trực tiếp tại điểm hôm nay (v3: `Ideal +4.1%`, `You +440.0%`; "Bạn" có thể là `You −40.0%`).
- **(v3) Đường cong có số âm:** (a) dấu luôn là **chữ** (`+`, `−` U+2212) chứ không chỉ vị trí/màu; headline âm có cả chữ `so với ngày đầu`, nên không phụ thuộc màu `--text` vs `--primary`; (b) vạch 0% là nét liền đậm 1,5 px, phân biệt với lưới 1 px và Ideal nét đứt, tương phản ≥ 3:1; (c) mọi giá trị của chart đều có ở tóm tắt text (hiện luôn), tooltip (hover **và** focus/phím mũi tên, chuỗi `goal.detail.tooltip*`) và bảng 5 cột; (d) tooltip **không** là live region (tránh đọc dồn khi rê chuột); khi dùng phím mũi tên, chuỗi tooltip của ngày đang đọc được gán cho vùng chart đang focus (`role="img"`, `aria-describedby` trỏ tóm tắt) để SR đọc đúng một lần mỗi bước; (e) khi đổi Range, miền Y đổi nhưng focus ở lại control Range và tóm tắt không đổi; (f) `U+2212` được trình đọc phổ biến đọc là "trừ"/"minus", `-` ASCII dễ bị đọc là "gạch ngang"; vì thế code chỉ sinh `−`; (g) headline cực trị (`Tốt hơn +143.900,0%`) xuống dòng được, không cắt, phóng chữ 200 % không tràn.
- **(v3.1, đo được)** Cột biểu đồ có **nhãn giá trị khi "đủ chỗ"** — định nghĩa duy nhất ở S6 "Nhãn giá trị trên cột BarChart": `(chartWidth − 38) / 12 ≥ 30 px` (tương đương `chartWidth ≥ 398 px`), chỉ cột ≥ 3 phút, số giờ không đơn vị, `aria-hidden`; không đủ chỗ thì không có nhãn nào. Tooltip khi hover/focus giữ nguyên. Nhãn là phụ trợ thị giác: mọi giá trị vẫn có ở tóm tắt text, tooltip và bảng ẩn, nên không có nhãn không làm mất thông tin (WCAG 1.1.1/1.3.1 không phụ thuộc nhãn).

**Khác**

- Vùng chạm ≥ 44×44 px (nút, tab, ô chọn, icon button); khoảng cách giữa hai vùng chạm kề nhau ≥ 8 px. Ngoại lệ: ô heatmap nhỏ (≥ 11 px) — thay bằng bàn phím và danh sách số liệu; trên mobile mỗi ô là đích bấm nhỏ nhưng thao tác này là phụ (Should, FR-26).
- Text co giãn đến 200 % không mất nội dung (dùng `rem` cho cỡ chữ, bố cục dùng `min-width: 0`/wrap, không chiều cao cố định cho chữ). Reflow ở 320 px không cần cuộn ngang (trừ heatmap).
- `prefers-reduced-motion`: tắt hiệu ứng pill, skeleton nhấp nháy, transition.
- `viewport` không khoá zoom; input cỡ ≥ 16 px.
- **Ngôn ngữ (NFR-08, FR-32):** `<html lang>` luôn khớp ngôn ngữ đang hiển thị (`en` hoặc `vi`) và đổi ngay khi người dùng đổi ngôn ngữ (cùng lúc với `document.title`). Trong Settings, mỗi lựa chọn ngôn ngữ có thuộc tính `lang` riêng (`lang="en"` cho `English`, `lang="vi"` cho `Tiếng Việt`) để trình đọc màn hình đọc đúng giọng; nhãn của hai lựa chọn không đổi theo ngôn ngữ giao diện. Tên goal/why/note của người dùng không gắn `lang` (không biết ngôn ngữ). Mọi `aria-label`, `aria-valuetext`, chữ ẩn (`sr-only`), `figcaption`, `caption` bảng ẩn, tooltip, tên truy cập của ô heatmap đều lấy từ bảng key ở mục 7 (có bản `vi`), không viết cứng trong JSX.
- Sau khi đổi ngôn ngữ, focus không bị mất (ở lại trên lựa chọn vừa chọn) và có thông báo `role="status"` (`toast.languageChanged`) bằng ngôn ngữ mới. Kiểm tra bằng bàn phím: Tab tới nhóm ngôn ngữ, mũi tên Trái/Phải đổi lựa chọn (radio group), mọi chữ trên trang đổi ngay.
- Bản `vi` không làm giảm tương phản (cùng token) và không cần cỡ chữ lớn hơn; dấu thanh tiếng Việt được chừa chỗ theo mục 3.4 (quy tắc 5). Người dùng phóng chữ 200 %: các hàng nút tự xuống dòng, không cắt chữ (mục 3.4).
- Màu không phải kênh duy nhất: badge có chữ, lỗi có icon + chữ, pace có chữ "ahead/behind", tab active có vạch/đậm.

### 8.1 Phase 2 — đăng nhập và đồng bộ (v2.0)

Kiểm bằng `@axe-core/playwright` (0 serious/critical) ở `en` và `vi`, sáng và tối, cho Today (có banner hoặc chỉ báo), Settings (A1, A5, A10), D3 (đã đăng nhập), D4, D5; và kiểm bàn phím thủ công theo danh sách dưới.

**Tương phản (tính tay, QC xác nhận bằng axe):**

| Cặp | Sáng | Tối |
| :- | :- | :- |
| Chữ nút Google (`--google-text`) trên `--google-bg` | ≈ 16.8:1 | ≈ 14.5:1 |
| Viền nút Google (`--google-border`) trên `--surface` / `--primary-soft` (non-text ≥ 3:1) | ≈ 4.8:1 / ≈ 4.1:1 | ≈ 5.2:1 / ≈ 4.4:1 |
| SyncIndicator `synced`: `--text-muted` trên `--surface`; icon `--primary` (non-text) | ≈ 6.3:1; ≈ 5.0:1 | ≈ 7.2:1; ≈ 7.3:1 |
| `pending`: `--text` trên `--surface-2` | ≈ 13:1 | ≈ 12:1 |
| `error`: `--on-danger-soft` trên `--danger-soft` | ≈ 5.5:1 | > 7:1 |
| `expired`: `--info` trên `--info-soft` | ≈ 6.9:1 | > 7:1 |
| LoginPromptBanner: `--on-primary-soft` trên `--primary-soft` (mọi chữ trong banner dùng màu này, kể cả thân; không dùng `--text-muted` trên nền này) | ≈ 7.4:1 | > 7:1 |

**SyncIndicator (FR-50, US-18)**

- StatusRow có `role="group"` + `aria-label` = `sync.indicator.label`; chữ hiển thị của chip chính là tên truy cập (icon `aria-hidden`). Đọc được bằng cách duyệt (virtual cursor) ở mọi lúc.
- **Thông báo thay đổi trạng thái** qua một vùng riêng, luôn có trong DOM: `<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">`. Chỉ đặt nội dung (key `sync.announce.*`) khi chuyển **vào** `error`, `offline` (mất mạng), `expired`, hoặc **trở lại** `synced` sau một trong ba trạng thái đó. **Không** thông báo `syncing`, `waiting`, và không thông báo `synced` thường kỳ hay lần render đầu (tránh nói liên tục). Gom thay đổi trong 1 s (debounce); không lặp lại cùng một thông báo liên tiếp. Chip không có `aria-live` riêng (tránh đọc đôi), không bao giờ chiếm focus.
- Chip `error`: nút `Retry` là `<button>` có `aria-label` = `sync.indicator.retryAria` (chứa chữ hiển thị — WCAG 2.5.3). Chip `expired` là `<a href="#/settings">` có tên là chữ hiển thị.
- Vòng xoay là SVG `aria-hidden`; reduced-motion: không xoay, chữ `Syncing…` vẫn đủ nghĩa.

**Card Account và nút Google**

- Card là `<section aria-labelledby>` với h2 `Account`. Avatar `aria-hidden="true"`; tên và email là chữ thường (không gắn `lang`). Chi tiết đồng bộ là `<dl>` (nhãn `dt`, giá trị `dd`); `Last synced` hiển thị thời điểm bằng chữ (`today at 14:05`).
- Nút Google: `<button>` thật, chữ hiển thị là tên truy cập, logo `aria-hidden`; vô hiệu khi offline bằng `disabled` **và** `aria-describedby` trỏ `settings.account.offlineHint` (hiển thị luôn, không chỉ khi hover). `busy`: `aria-busy="true"`, chữ `Signing in…`. Focus-visible dùng vòng `--focus` 2 px, offset 2 px (không bị bo/cắt bởi viền nút).
- A3 `signing-in`: dòng trạng thái là `role="status"`; A4 (lỗi đăng nhập) là `role="alert"` (người dùng vừa thao tác xong nên cần nghe ngay); A10 (hết phiên) là `role="status"` (không ngắt), vì `sync.announce.expired` đã thông báo.
- `Sync now`: khi bận dùng `aria-disabled="true"` (vẫn focus được, không mất vị trí focus), nhãn `Syncing…`; khi offline dùng `disabled` + `aria-describedby` trỏ `settings.account.offlineSync`. Kết quả thành công do toast `role="status"` đọc.

**Focus**

- **Sau callback OAuth:** app render màn `returnTo` và focus vào `<h1>` như mọi lần đổi route (không cuộn, không nhảy vào card). Kết quả được thông báo bằng toast `role="status"` (thành công) hoặc Alert `role="alert"` trong card / toast lỗi (thất bại). Nếu callback xảy ra ngay lúc tải trang, focus ban đầu vẫn là `<h1>`.
- **Sau "Sign out" (D4 đóng):** focus về h2 của card Account (`tabindex="-1"`) vì nút "Sign out" đã biến mất; sau `Cancel`/Esc: về nút "Sign out" đã mở dialog.
- **Sau "Not now":** focus về `<h1>` của Today. **Sau `Dismiss` (Alert lỗi):** focus về nút Google.
- **Sau D5:** `Add to account` → focus về `<h1>`; `Cancel` → như đăng xuất (h2 của card Account nếu đang ở Settings, ngược lại `<h1>`).
- **Storage → `Go to Account`:** focus chuyển vào nút Google của card Account (đích di chuyển rõ ràng; không dùng hash).

**Dialog D4, D5, D3 đã đăng nhập**

- Cùng cơ chế `<dialog>` + `showModal()` (focus trap, Esc, `inert` nền, trả focus). `aria-labelledby` = tiêu đề; `aria-describedby` = đoạn thân (D4: thân + khối cảnh báo chưa đồng bộ nếu có).
- D4: nhóm radio là `<fieldset>` + `<legend>` (`auth.signOut.legend`); mỗi radio có nhãn + mô tả nối `aria-describedby`; **focus ban đầu ở radio Keep (đã chọn)**; phím mũi tên đổi lựa chọn; vùng `role="status"` cho cảnh báo "Remove + chưa đồng bộ" luôn có trong DOM (rỗng khi không áp dụng) để việc nội dung xuất hiện được đọc; Alert `syncFailed` là `role="alert"`; khi bận: `aria-busy="true"`, mọi control `disabled`, tránh đóng bằng Esc cho tới khi xong.
- D5: focus ban đầu ở `Cancel`; thân nêu rõ số lượng và email (không chỉ dùng màu); Esc = `Cancel`.
- Hàng nút dính đáy không che nội dung khi phóng chữ 200 % (nội dung cuộn trong dialog, thanh cuộn nhận focus bàn phím nhờ `tabindex="0"` trên vùng cuộn nếu nội dung tràn).

**(v3.1) Brand, Export lỗi, hàng bị từ chối, liên kết chính sách**

- Brand mark: ảnh `alt=""` trong `<span aria-hidden="true">`; link cha có `aria-label` = `app.name` (tên truy cập "1% Better per Day", trùng chữ hiển thị — WCAG 2.5.3); chữ hiển thị `app.name` đã đủ nghĩa nên ảnh không cần mô tả. Ô trắng bảo đảm tương phản của chữ logo (đen trên trắng ≈ 21:1) ở cả theme tối.
- Export thất bại: Alert `role="alert"` (người dùng vừa thao tác xong nên cần nghe ngay, như lỗi import); nút Export hết `aria-busy` và focus vẫn ở nút Export. Không dùng toast cho lỗi này (toast `role="status"` polite và biến mất sau 4 s, dễ bị bỏ lỡ với lỗi cần hành động).
- D4 có hàng bị từ chối: khối cảnh báo nằm trong phần `aria-describedby` của dialog (như cảnh báo chưa đồng bộ); vùng `role="status"` luôn có trong DOM để `rejectedRemove` được đọc khi người dùng chọn Remove; mô tả radio Remove (`removeDescRejected`) nằm trong `aria-describedby` của radio như `removeDesc`.
- Dòng A9 (`data-reason`) là chữ tĩnh, không live region (không phải lỗi mới xảy ra); icon `aria-hidden`.
- Liên kết `settings.about.privacyLink`: `<a href>` thật, tên truy cập là chữ hiển thị, focus-visible như mọi link; mở cùng tab nên không cần cảnh báo "cửa sổ mới".

**LoginPromptBanner và ExportSignInHint**

- Banner: `<section aria-label>` (`loginPrompt.label`), **không** `role="dialog"`/`alertdialog`, không `aria-live` (không ngắt người dùng đang ghi), không tự lấy focus; Tab tới được theo thứ tự đọc ngay sau banner nhắc. Hai nút ≥ 44 px, cách nhau ≥ 8 px. Nút "Not now" có tên truy cập là chính chữ hiển thị.
- ExportSignInHint: `<div role="group" aria-label>` (`exportHint.label`), không live; toast `Backup exported` đã thông báo việc Export.

**Khác**

- Ghi chú "theo tài khoản" (Language, Reminders) là chữ tĩnh, icon `aria-hidden`; khi giờ nhắc/ngôn ngữ được áp từ cloud, toast `toast.prefsFromAccount` (`role="status"`, ngôn ngữ mới) báo thay đổi; `<html lang>` và `document.title` đổi đồng bộ như FR-32.
- Màu không phải kênh duy nhất ở mọi trạng thái đồng bộ (icon khác nhau + chữ khác nhau); hết phiên/lỗi không chỉ dựa vào đỏ/xanh dương.
- Logo Google chỉ là hình trang trí kèm chữ "Google" trong nhãn nút; không có `alt` riêng.

### 8.2 Goal không thời hạn — radio "No end date" và hiển thị (v4.0, M11)

Kiểm bằng `@axe-core/playwright` (0 serious/critical) ở `en` và `vi`, sáng và tối, cho GoalForm (cả trạng thái Target = Total hours với radio khoá), Goals, Goal detail (O1), Review (chọn O1); bàn phím thủ công theo danh sách dưới.

**Radio "No end date"**

- Là `<input type="radio" name="endsMode">` thật, cùng nhóm với hai radio kia, trong `<fieldset>` + `<legend>` `Ends`; chữ nhãn hiển thị (`goal.form.endsNever`) là tên truy cập. Cả hàng (radio + chữ) là vùng chạm ≥ 44 px.
- **Khoá = thuộc tính `disabled` thật** (không dùng riêng `aria-disabled`): radio không thể chọn bằng chuột, chạm, mũi tên hay Space, và không có đường nào để một `aria-disabled` "lọt" giá trị `total` + không hạn. `aria-disabled` chỉ được thêm nếu thư viện/CSS cần để đồng bộ kiểu; không thay `disabled`. Hệ quả có chủ đích: radio khoá **không nhận focus Tab/mũi tên** (nhóm radio chỉ đi qua hai radio còn lại); lý do không bị giấu vì nằm trong **chữ hiển thị liền sau radio**, nên người dùng đọc theo thứ tự duyệt (virtual cursor, Rotor, TalkBack lướt) vẫn gặp ghi chú ngay sau nhãn.
- **Mô tả:** radio khoá có `aria-describedby` = `id` của `goal.form.endsNeverTotalNote` (đoạn `.hint` **luôn hiện**, không chỉ hover/focus, không `title`); tên truy cập mô tả tính được cả khi `disabled` (test: `toHaveAccessibleDescription`). Khi đang chọn (mở khoá) radio nối `goal.form.endsNeverHint` bằng cùng cách. Khi chưa chọn và mở khoá không có `aria-describedby`.
- **Tương phản:** chữ nhãn khoá dùng `--text-muted` (≈ 6,3:1 sáng / ≈ 7,2:1 tối, 8 mục "Tương phản" ở đầu mục 8); không giảm `opacity`. Ghi chú `.hint` cùng màu `--text-muted` (≥ 4.5:1). Trạng thái khoá không chỉ dựa vào màu: có chữ ghi chú đi kèm. Chữ ghi chú không phải control nên không bị miễn trừ tương phản.
- **Bàn phím:** nhóm Ends là một tab-stop (radio đang chọn); mũi tên Trái/Phải/Lên/Xuống chuyển giữa các radio **đang bật** (3 radio khi Minutes per day, 2 khi Total hours; vòng quanh); chọn "On a specific date" hiện End date ngay dưới (focus ở lại radio, không tự nhảy vào ô ngày); chọn "No end date" ẩn End date (nếu focus đang ở End date thì không xảy ra vì ô ngày chỉ hiện khi radio kia được chọn).
- **Thông báo khi Ends bị ép đổi:** vùng `<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">` **luôn có trong DOM** (trong fieldset Ends, rỗng ban đầu) nhận `goal.form.endsNeverSwitched` đúng một lần khi Target chuyển sang Total hours đang lúc chọn "No end date"; xoá nội dung khi đổi Target về Minutes per day hoặc khi người dùng tự chọn một radio Ends. Focus **không** bị dời (ở lại control Target). Không dùng `role="alert"` (người dùng không mắc lỗi, đây là thông tin).
- **Lỗi dự phòng `openEndedTotal`:** nằm trong `aria-describedby` của fieldset Ends (cùng `id` lỗi), icon `aria-hidden`, chữ `--danger`; focus vào radio đang chọn của nhóm (S3 trạng thái 5); tính vào `goal.form.summary` (`role="alert"` ở đầu form).
- **Axe:** không dùng `aria-hidden` lên radio khoá; không có `label` rỗng; không `tabindex` dương.

**Hiển thị goal không thời hạn**

- Dòng thông tin `goals.rowDailyOpen` là chữ thường (`<p>`), không icon `∞`, không ký tự đặc biệt: trình đọc màn hình đọc đúng "từ 01/10/2026, không có thời hạn" / "from 2026-10-01, no end date". (Đã **không** chọn dạng `{start} – ∞` vì `∞` đọc là "vô cực"/"infinity" và dấu `–` đọc là "đến" nhưng sau đó không có gì.)
- Goal detail: khi bỏ Range, không còn control bị thiếu: `chart-head` chỉ có h2; thứ tự focus của trang không đổi (nút Edit/Archive/Delete → vùng chart → `details` bảng).
- Goal detail upcoming (không thẻ biểu đồ): câu `goal.detail.upcoming` trong thẻ headline là nội dung thay thế đầy đủ cho biểu đồ (SR không bị mất thông tin vì không có biểu đồ để mô tả).
- Thẻ Progress: `role="progressbar"` của `StatCard` **giữ nguyên hành vi hiện có** (không sửa component dùng chung); `aria-valuetext` là giá trị thật (`61.1%` / `61,1%`; goal không thời hạn vượt chỉ tiêu tích luỹ có thể ra `120.5%`), thanh vẽ chặn ở 100%; phụ đề `stat.progressSubOpen` giải thích mẫu số bằng chữ.

### 8.3 Phase 6 — nút Apple, Delete account (D6), native (v5.0, M12 … M15)

Kiểm bằng `@axe-core/playwright` (0 serious/critical) ở `en` và `vi`, sáng và tối, cho: Settings ở hai biến thể native (project `native-web`, M12; M15 bằng component test với `capabilities` iOS), D6 ở mọi trạng thái và panel thu hồi (project `cloud`, mock, bản web); card Account iOS A1 / A5 / A10 bằng component test (NFR-24); và kiểm bàn phím thủ công theo danh sách dưới. Phần chỉ đo được trên iPhone (VoiceOver, safe area thật) là `NOT VERIFIED` ở NV-13, NV-15, NV-16.

**Tương phản (tính tay, QC xác nhận bằng axe):**

| Cặp | Sáng | Tối |
| :- | :- | :- |
| Chữ/glyph nút Apple `--apple-text` trên `--apple-bg` | 21:1 (trắng/đen) | 21:1 (đen/trắng) |
| Viền focus `--focus` quanh nút Apple trên `--surface` / `--primary-soft` (non-text ≥ 3:1) | ≈ 6:1 / ≈ 5:1 | > 8:1 / > 7:1 |
| Nút `danger-ghost` (`Delete account`): `--danger` trên `--surface` (chữ và viền) | ≈ 6,5:1 | ≈ 7,3:1 |
| Nút xác nhận D6 `danger`: `--on-danger` trên `--danger` | ≈ 6,5:1 | > 7:1 |
| Khối `auth.delete.appleNote` và panel thu hồi: `--info` trên `--info-soft` | ≈ 6,9:1 | > 7:1 |

**Nút Apple và nhóm nút đăng nhập**

- `<button type="button">` thật; **tên truy cập = chữ hiển thị** `Sign in with Apple` / `Đăng nhập bằng Apple` (WCAG 2.5.3); glyph `aria-hidden="true"`; không `aria-label` khác chữ. Offline: `disabled` **và** `aria-describedby` trỏ `settings.account.offlineHint` (hiện luôn, như nút Google). Busy: `aria-busy="true"`, chữ `Signing in…`.
- Thứ tự Tab = thứ tự đọc = thứ tự hiển thị: **Apple → Google**. Vùng chạm 44 px, khoảng cách 12 px.
- Kết quả đăng nhập đọc như F9: lỗi ở A4 là Alert `role="alert"`; thành công là toast `role="status"`; focus ở `<h1>` (không dời vào card).

**Delete account và D6**

- Nút `Delete account`: `<button>` thật; khi `disabled` (offline / hết phiên) lý do là đoạn `.hint` **luôn hiện** ngay dưới nút và nối `aria-describedby` (người dùng trình đọc màn hình duyệt theo thứ tự đọc vẫn gặp lý do, cùng nguyên lý của radio khoá ở 8.2). Không có thông tin nào chỉ nằm trong `title`/tooltip.
- D6: `<dialog>` + `showModal()` (focus trap, `inert` nền, Esc); `aria-labelledby` = `auth.delete.title`; `aria-describedby` = đoạn thân + (nếu có) khối `appleNote`. Nhóm lựa chọn là `<fieldset>` + `<legend>` (`auth.delete.legend`); mỗi radio có mô tả nối `aria-describedby`; **focus ban đầu ở nút `Cancel`**; phím mũi tên đổi lựa chọn; vùng `role="status"` (`auth.delete.workingStatus`) luôn có trong DOM, rỗng khi không bận.
- **Busy:** `aria-busy="true"` trên dialog; nút xác nhận `aria-disabled="true"` (giữ focus, không bị `disabled` làm mất vị trí) với chữ `Deleting…`; `Cancel` và radio `disabled`; sự kiện `cancel` của `<dialog>` (Esc) và click backdrop bị `preventDefault()` cho tới khi xong.
- **Lỗi:** Alert `role="alert"` chèn ngay trên hàng nút (SR đọc ngay); focus ở nút xác nhận (đã bấm); nội dung theo `errors.ACCOUNT_DELETE_*`; không toast.
- **Sau khi đóng:** `Cancel`/Esc → focus về nút `Delete account`; thành công → focus về h2 "Account" (`tabindex="-1"`), toast `role="status"` đọc kết quả. Panel thu hồi **không** là live region (tránh đọc đôi với toast); nó nằm ngay sau h2 nên SR đọc tiếp tự nhiên; link và nút `Dismiss` ≥ 44 px; `Dismiss` trả focus về h2.
- Mọi nút trong D6 ≥ 44 px, cách nhau ≥ 8 px; hàng nút dính đáy không che nội dung khi phóng chữ 200 % (nội dung cuộn, vùng cuộn `tabindex="0"`).

**Native**

- **VoiceOver:** mọi chuỗi, `aria-label`, chữ ẩn lấy từ mục 7 (có `vi`). Link ra ngoài app có chữ ẩn `a11y.opensExternal`. Launch screen không có nội dung truy cập.
- **Reduce Motion:** WKWebView truyền cài đặt vào `prefers-reduced-motion`; vòng xoay đồng bộ/đăng nhập/xoá dừng xoay (chữ vẫn đủ nghĩa), mờ dần của splash tắt.
- **Focus không bị che:** `html { scroll-padding-top: calc(var(--safe-top) + 8px); scroll-padding-bottom: calc(var(--tabbar-h) + var(--safe-bottom) + 16px); }` để phần tử được focus bằng bàn phím phần cứng/VoiceOver không nằm dưới thanh trạng thái hoặc thanh tab (WCAG 2.4.11). Khi bàn phím mở, thanh tab ẩn nên không còn che.
- **Chữ:** iOS không có Dynamic Type trong app này (non-goal PRD); cỡ chữ cơ bản giữ ≥ 14 px (hint, chip) và ≥ 16 px ở input. Người cần chữ lớn dùng được "Zoom"/"Display Zoom" của iOS; ghi nhận giới hạn ở A-D69.
- **Màu không là kênh duy nhất:** chip quyền thông báo (`Not asked yet` / `Allowed` / `Blocked`) luôn có chữ; chip Storage native trung tính có chữ; nút vô hiệu luôn kèm lý do bằng chữ.
- **`<html lang>`** vẫn khớp ngôn ngữ đang hiển thị trên native; nhãn Apple/Google lấy theo ngôn ngữ đang chọn của app (không theo ngôn ngữ iOS).

---

## 9. Interface spec (cho CLI/API/bot)

Không áp dụng — app có giao diện đồ hoạ (PWA). **(v2)** Trang đăng nhập/đồng ý của Google và URL callback `?auth=callback` là giao diện **ngoài** app (không thiết kế ở đây; contract ở `ARCHITECTURE.md` §5.9); lỗi quay về từ callback đã có copy (`errors.AUTH_*`). Các "giao diện" không phải màn hình đã có đặc tả ở nơi khác: payload notification (`ARCHITECTURE.md` §5.6; copy `en`/`vi` ở mục 7.5: `notification.*`), file `.ics` (§5.7; `ics.summary`, `ics.alarm` ở mục 7.5), file backup (§5.5; tên file và nội dung JSON không dịch).

**(v5.0) Giao diện không phải màn hình của app native** (đặc tả ở nơi khác hoặc ngay đây; không có UI để thiết kế):

| Giao diện | Nội dung | Nguồn |
| :- | :- | :- |
| Local notification (M15) | `title` = `notification.nativeTitle` (`1% Better`), `body` = `notification.nativeBody`, `id` 1000 … 1013 (một id mỗi ngày trong cửa sổ 14 ngày), `schedule.at` = giờ nhắc cục bộ, `extra.url` = `#/today`; không âm riêng, không badge, không nút hành động; dịch theo ngôn ngữ lúc lập lịch | 7.8.4; ARCH §5.6 |
| Share sheet (M12) | `Backup`: tệp `1percent-better-backup-YYYY-MM-DD.json` (UTF-8); `.ics` (chỉ khi không có thông báo lên lịch): `1percent-better-reminder.ics`; tiêu đề share sheet = tên tệp; huỷ share sheet = im lặng | F19; ARCH §5.15 |
| Tên app | `CFBundleDisplayName` = `1% Better` (dưới icon); tên trên App Store = `1% Better per Day` | PRD A-57; 7.8.7 |
| Bảng hệ điều hành | Sign in with Apple, Google, hộp xin quyền thông báo, share sheet, Files: do iOS/Google vẽ, ngoài thiết kế | F16, F18, F19 |
| Edge Function `delete-account` | Không có giao diện; contract HTTP và mã lỗi ở ARCH §4.7; thông báo cho người dùng qua D6 (7.8.3) | F17 |
| Trang tĩnh `support.html`, `privacy.html` | Nội dung ở 7.8.6 | M15 |

---

## 10. Assumptions

- **A-D1.** Màn Review ở chế độ **All goals** không hiển thị `Progress` và `Pace` (PRD FR-24 và AC M4-AC5 chỉ định nghĩa số liệu này theo từng goal; tổng hợp nhiều goal có chỉ tiêu và khoảng khác nhau dễ gây hiểu sai). Thay bằng gợi ý chọn một goal. Cần planner/user xác nhận (xem Open questions).
- **A-D2.** Giao diện sáng/tối **tự theo hệ điều hành**, không có công tắc trong MVP (không có trong PRD). Token tối đã định nghĩa sẵn.
- **A-D3.** Không dùng thư viện UI (Tailwind/MUI): CSS thuần với custom properties, vì `ARCHITECTURE.md` không chọn UI framework. Developer có thể dùng CSS Modules hoặc một file global; chỉ cần đúng token.
- **A-D4.** Biểu đồ đường cong có control **Range** (`Whole period` / `So far`) để khỏi bị đường Ideal "ăn" hết thang đo với goal dài (1.01^365 ≈ ×37.8; 1.01^1827 ≈ ×7,9·10^7). Mặc định `So far` khi khoảng > 120 ngày, ngược lại `Whole period`. Đây là điều khiển phụ, chỉ lọc dữ liệu đã có; thang Y luôn tuyến tính. **(v3.0)** Giữ nguyên quy tắc và mặc định; thay đổi duy nhất: miền Y không còn bắt đầu cứng ở 0 mà theo `curveYDomain` của các điểm đang hiển thị sau khi lọc (kể cả giá trị âm của "Bạn"), nên đổi Range có thể đổi cả hai đầu trục. Với R1 (83 ngày ≤ 120) mặc định vẫn là `Whole period`: "Bạn" chiếm 4 ngày đầu, Ideal leo tới ≈ +128,4 % ở cuối. **(v4.0)** Với goal **không thời hạn** control Range **bị bỏ** (A-D55): không có ngày tương lai nên `Whole period` ≡ `So far`; quy tắc mặc định 120 ngày chỉ còn áp cho goal có hạn.
- **A-D5.** Xoá entry có xác nhận inline (`Delete this entry?` → `Delete`/`Keep`) vì vùng chạm Edit/Delete nằm sát nhau trên điện thoại. Xoá goal dùng dialog (D2).
- **A-D6.** Đóng dialog Stop (Esc hoặc `Keep running`) **không** dừng/huỷ timer: dialog chỉ là bước xác nhận; timer chỉ kết thúc khi `Save entry` hoặc `Discard session` (khớp `TimerService.stop` chỉ tính số phút, `save`/`discard` mới xoá `activeTimer`).
- **A-D7.** Entry chỉ sửa được `minutes` và `note` (theo `EntryService.update`); muốn chuyển entry sang ngày khác thì xoá và thêm lại ở Day đúng ngày.
- **A-D8.** Form Goal không hỏi xác nhận khi rời với thay đổi chưa lưu (giữ đơn giản).
- **A-D9.** Banner nhắc (FR-15) không có nút đóng; banner backup đặt ở Today (dưới banner nhắc) và ở đầu card Backup trong Settings. Chỉ hiện ≤ 1 banner backup.
- **A-D10.** Streak chip trên Today (`{n}-day streak`, tính streak tổng) chỉ xuất hiện từ M4 (cần `StatsService`).
- **A-D11.** `Last backup` hiển thị ngày ngắn theo giờ cục bộ từ `lastBackupAt`: `en` `YYYY-MM-DD`, `vi` `dd/MM/yyyy` (FR-36).
- **A-D12.** Màu amber của "+1%" là điểm nhấn thương hiệu duy nhất ngoài xanh chủ đạo; logo là ô vuông bo góc chữ "1%" nền `--primary` **(v3.1: không còn đúng; thay bằng brand mark ảnh logo trên ô trắng, xem mục 5 "Brand" và A-D41)**. Icon vẽ bằng SVG inline (không icon font, không tải ngoài).
- **A-D13 (i18n).** Card **Language / Ngôn ngữ** đứng **đầu** trang Settings (trước Reminders), tiêu đề card là cùng một chuỗi song ngữ ở cả `en.json` và `vi.json` để người lỡ vào nhầm ngôn ngữ vẫn nhận ra. Control là SegmentedControl 2 lựa chọn, áp dụng ngay (không nút Save), kèm toast `toast.languageChanged`. Nếu user muốn đặt card ở cuối (gần About) thì chỉ cần đổi thứ tự, không ảnh hưởng key.
- **A-D14 (i18n).** Tên key theo thành phần/màn hình (`today.*`, `goal.form.*`, `errors.*`…) như yêu cầu, **không** dùng tiền tố `screen.<tên>.*` mà ARCH §5.8 nêu như ví dụ; không key nào là tiền tố của key khác (xem 7.0). Các key mà plan/AC đã tham chiếu giữ đúng tên: `nav.today`, `empty.today.noGoals`, `errors.GOAL_NAME_REQUIRED`, `errors.GOAL_TARGET_INVALID_daily`, `errors.GOAL_PERIOD_INVALID_tooLong`, `errors.IMPORT_INVALID_JSON`, `notification.body`, `heatmap.cell.all`, `ics.summary`, `settings.language.option.en|vi`, `format.percent`, `format.minutes`, `format.duration`, `app.name`, `app.shortName`.
- **A-D15 (i18n).** Nhãn nút `Start timer` ở `vi` là `Đếm giờ` (gọn, ≈ 116 px) thay cho `Bắt đầu đếm giờ` (≈ 172 px) để hàng 2 nút ở card Today vừa 360 px; ngữ cảnh đã rõ nhờ biểu tượng play, badge `Đang đếm giờ` và TimerCard.
- **A-D16 (i18n).** Bản dịch `vi` do designer viết, chưa qua người bản ngữ khác duyệt. Thuật ngữ đã chốt ở 7.0: `entry` = `lần ghi`, `Review` = `Tổng kết`, `Pace` = `Nhịp độ`, `Storage` = `Bộ nhớ` (tách khỏi `Lưu trữ` = archive), `timer` = `bộ đếm giờ`. Đổi thuật ngữ chỉ cần sửa bảng ở mục 7, không đụng layout.
- **A-D17 (i18n).** Số nhiều: `vi` chỉ có `_other`; mọi cụm đếm được dùng trong câu qua `format.goalsCount` / `entriesCount` / `daysCount` (không ghép chuỗi). Riêng `goal.delete.*` tách `bodyNoEntries` (0 entry) khỏi `body_one/_other` vì i18next không dùng `_zero` cho `en`.
- **A-D18 (i18n).** Lỗi đang hiện trong form được lưu dưới dạng mã lỗi và dịch lại khi đổi ngôn ngữ; giá trị người dùng đang nhập không bị reset khi đổi ngôn ngữ (đổi ngôn ngữ chỉ xảy ra ở Settings nên thực tế form chỉ giữ lại nếu người dùng quay về).
- **A-D19 (i18n).** Thêm so với v1 để đủ chuỗi cho i18n (không thêm tính năng): `toast.languageChanged`, card Language (`settings.language.*`), `errors.UNKNOWN`, `errors.WRITE_FAILED` (đã có chữ nhưng chưa có key), `doc.title`, `nav.label`, `a11y.required`, các `aria-label`/chữ ẩn đã có sẵn trong mockup (`entry.form.label*`, `goalCard.progress*`, `timer.elapsedLabel`, `reminder.bannerLabel`, `today.goalsLabel`, `day.navLabel`, `day.goalsLabel`), `chart.bar.monthlySummary` và tiêu đề cột bảng ẩn, `goal.detail.table*`, `goal.detail.tooltip/label*`, `timer.*` của D1 (đã có trong mockup 04). Sửa nhẹ `en` cho đúng ngữ pháp số ít: `goal.delete.body_one` (`its 1 entry`, bản v1 chung `{n} entries`).

**Assumptions của phase 2 (v2.0)**

- **A-D20.** Chỉ báo đồng bộ nằm trong một **StatusRow** ở đầu `<main>` (thay chỗ `OfflineChip`), không thêm thanh header/app bar mới: app v1 không có header trên mobile và thêm một thanh cố định sẽ làm mất chiều cao và đổi bố cục mọi màn. Chip canh phải; `OfflineChip` canh trái. Khi chưa đăng nhập/cloud tắt, hàng không tồn tại (bố cục v1 không đổi).
- **A-D21.** SyncIndicator có **6** trạng thái hiển thị: 5 trạng thái của PRD FR-50 (`synced`, `syncing`, `pending/offline`, `error`, `expired` = "cần đăng nhập lại") + `signing-in` (khi quay về từ Google ở màn không phải Settings); `signed-out`/`unavailable` ẩn. `pending` (online, đang chờ lô 2 s hoặc backoff) và `offline` dùng cùng kiểu, khác chữ. PRD FR-50 thắng cách gom "5 trạng thái" trong yêu cầu của orchestrator.
- **A-D22.** Card Account đứng **thứ hai** (sau Language, trước Reminders). Key của card là `settings.account.*` (quy ước `settings.<card>.*`, khớp M6-AC3); nhóm `account.*` trong yêu cầu của orchestrator chính là nhóm này. Dialog dùng `auth.signOut.*`, `auth.merge.*`.
- **A-D23.** Nút Google theo hướng dẫn thương hiệu (nền trắng/viền, G nhiều màu; tối: `#131314`/viền `#8E918F`), nhưng dùng **font hệ thống** thay Roboto (không tải font ngoài, NFR-01), `min-height` 44 px thay 40 px (vùng chạm), chữ 15 px/600 như các nút khác. Nhãn đúng cụm hướng dẫn của Google: `Sign in with Google` / `Đăng nhập bằng Google`. Theme của nút theo hệ điều hành (như toàn app), không dùng biến thể "neutral".
- **A-D24.** Card Language/Reminders chỉ nói "theo tài khoản" khi **đã đăng nhập**; chưa đăng nhập hoặc hết phiên không hiện gì thêm (không nhắc đăng nhập ở đây, tránh lặp ngoài FR-52/53/54).
- **A-D25.** Lỗi đăng nhập quay về màn **ngoài Settings** (chỉ xảy ra từ banner Today ở M8): toast ngắn tone error (8 s) kèm nút `Go to Account`; lỗi đầy đủ nằm ở Alert trong card, tồn tại đến khi người dùng bấm `Dismiss`, bấm đăng nhập lại, hoặc reload. Toast tone `error` + `action` là mở rộng nhỏ của `Toast` (M6-T5).
- **A-D26.** D4 giữ mở và hỏi lại ("Remove anyway") khi đã chọn Remove mà đồng bộ lần cuối không đẩy hết thay đổi — chống mất dữ liệu âm thầm; ARCH §5.9 nói lỗi mạng "không chặn việc xoá phiên", điều đó vẫn đúng với Keep. Xem OQ-D10.
- **A-D27.** `expired` được coi như "chưa đăng nhập" ở Backup, D3, Storage, About (dữ liệu chỉ nằm trên máy cho tới khi đăng nhập lại), nhưng **không** hiện LoginPromptBanner/ExportSignInHint (card Account và chip `Sign in again to sync` đã lo, M8-AC1).
- **A-D28.** `toast.mergeDone` đếm bản ghi **còn sống trên máy sau lần đồng bộ đầu** (chính là những gì tài khoản có sau khi gộp); chỉ hiện khi lần đồng bộ đầu có đẩy hoặc kéo ít nhất một bản ghi; ngược lại chỉ có `toast.signedIn`. Toast mới thay toast cũ (quy tắc một toast).
- **A-D29.** Avatar lấy grapheme đầu của `name` (rơi về `email`, rồi `?`), nền `--primary-soft`, chữ `--on-primary-soft`, không ảnh Google (FR-42).
- **A-D30.** `settings.about.privacy` nói "Những người khác dùng app không xem được chúng" — đúng với RLS; **không** nói "chỉ bạn xem được" vì chủ project Supabase có thể đọc bảng qua Dashboard. Xem OQ-D11.
- **A-D31.** Chip `synced` hiện giờ `HH:MM` nếu cùng ngày cục bộ, ngày ngắn nếu khác ngày (`2026-10-08` / `08/10/2026`); card Account hiện câu đầy đủ `today at 14:05`. Không dùng "2 minutes ago" vì cần tự cập nhật theo giờ (gây re-render và thông báo SR).
- **A-D32.** Mockup có nút đổi sáng/tối (`data-theme`) và bộ chọn trạng thái chỉ để duyệt thiết kế; **app thật vẫn chỉ theo hệ điều hành** (A-D2). Token tối giữ nguyên giá trị.
- **A-D33.** Khi có phiên lưu sẵn nhưng SDK chưa nạp xong, card Account hiện thẳng A5 với `sync.account` đã lưu (nút `Sync now` vô hiệu) để không nháy A1 → A5 (ARCH §5.9 "Lazy-load").

**Assumptions của phase 3 (v3.0, Goal detail M9)**

- **A-D34.** Headline âm nói trung tính `−40.0% vs your first day` / `−40,0% so với ngày đầu` (không "worse"/"thấp hơn"/"tệ hơn"), màu `--text`, không đỏ: đường đi xuống là thông tin, không phải lỗi (nguyên tắc 2). "Ngày đầu" = ngày đầu tiên **có ghi** (baseline); ngày cụ thể luôn có ở phụ đề (`{{firstDate}}`).
- **A-D35.** Mọi % của đường cong đi qua một formatter có dấu; template bảng key **không** có `+`/`−` cứng (khác M5: `+{{value}}% better`). Vì vậy `goal.detail.headline`, `tooltipIdeal`, `labelIdeal`, `labelYou` đổi chuỗi dù hiển thị giống cũ khi dương. Dấu trừ chốt là **U+2212** (7.1).
- **A-D36.** Phụ đề tách 2 dòng: `subDay` (`Day 4 of 83`) luôn có chỗ, `sub…` (câu số liệu) xuống dòng tự do. Câu số liệu nêu bằng "ngày + phút" cả ba mốc (gần nhất, trước đó, đầu tiên) để người dùng tự đối chiếu được con số `+92.9%` và `×5.4` với dữ liệu họ đã nhập. Khi ngày có ghi gần nhất không phải hôm nay, câu mở đầu đổi từ `Today:` sang `Last logged {date}:` thay vì thêm câu giải thích riêng (chú thích dưới chart đã nói "ngày không ghi đi ngang").
- **A-D37.** "Bạn" vẽ **bậc thang `stepAfter`** (không nội suy xiên) vì giá trị thật chỉ đổi tại ngày có ghi; ngày 0 phút là đoạn ngang đúng nghĩa FR-27. Phần trước baseline vẽ ở 0% (đúng dữ liệu `ActualPoint`); không có entry nào (`baseline = null`) thì không vẽ "Bạn" để khỏi có một đường xanh khi chưa làm gì (hành vi M5 "chỉ Ideal" được giữ).
- **A-D38.** Đường Ideal gốc ở `startDate` (+1,0 % tại ngày 1) còn "Bạn" gốc ở ngày đầu có ghi (0 %): hai gốc khác nhau là chủ ý (PRD A-40). Vạch 0% có legend riêng `0% = your first logged day` để người đọc không hiểu nhầm là gốc chung.
- **A-D39.** Tooltip có 4 biến thể (có thay đổi / ngày đầu / không ghi / chỉ Ideal) thay vì một chuỗi chung với phần "Bạn" bỏ trống, để mỗi biến thể là một câu đọc được bằng SR và dịch được độc lập.
- **A-D40.** Nhãn trục `vi` compact lấy từ `Intl` `vi-VN` (`144 N` = nghìn). Nếu QC thấy khó hiểu thì phương án thay là bỏ compact ở `vi` (chấp nhận nhãn dài hơn, `+143.900%`, cần lề trái ≈ 66 px) — cần planner đổi ARCH §4.5, designer không tự đổi.

**Assumptions của phase 4 (v3.1, M10-T8 — ghi nhận deviation và chốt copy; không thêm tính năng)**

- **A-D41 (brand).** Brand mark = ảnh logo trong suốt trên ô trắng 32 px (ảnh 28 px) ở cả hai theme; chữ cạnh mark là `app.name` "1% Better per Day"; key `app.brandSuffix` bỏ. Nguồn: ADR-30 (g), dev-M7 "Brand assets". Ô trắng ở theme tối là **chủ ý** (logo có chữ đen trong suốt), không phải lỗi thiếu theme.
- **A-D42 (7 key hàng bị cloud từ chối).** Duyệt 5/7 chuỗi dev đề xuất giữ **nguyên văn** (`localRejected_one/_other`, `rejected_one/_other`, `removeDescRejected`); **sửa `en` của 2 chuỗi** (`rejectedKeep`, `rejectedRemove`) vì chúng đứng sau câu có `{{count}}` nên "It stays"/"these items … keep them" sai ngữ pháp khi 1 hoặc nhiều hàng; `vi` không bị (tiếng Việt không chia số) nên giữ nguyên. "mục" trong `vi` = "item" (goal hoặc entry), nhất quán với `errors.SYNC_REMOTE_INVALID` ("Một số mục từ tài khoản…"), và không nhầm với "mục tiêu" nhờ có "trên thiết bị này". Vị trí hiển thị: A9 và D4 (S7).
- **A-D43 (privacy link).** `settings.about.privacyLink` luôn hiện (kể cả cloud tắt), cùng tab: trang `privacy.html` có sẵn liên kết quay về app; mở tab mới chỉ thêm một chuỗi cảnh báo "cửa sổ mới" mà không cần.
- **A-D44 (hint Export, OQ-D12).** Theo A-44: hint Export chỉ khi **online** lúc Export thành công, không tiêu lượt khi offline. Trạng thái "nút đăng nhập bị vô hiệu kèm dòng offline" của `ExportSignInHint` chỉ còn khi mất mạng sau khi hint đã hiện (component giữ nguyên).
- **A-D45 (headline âm, OQ-D16).** Theo A-45: giữ `goal.detail.headlineDown` = `−40.0% vs your first day` / `−40,0% so với ngày đầu` (A-D34) cho tới khi user chọn câu khác; đổi câu chỉ là đổi hai chuỗi, không đổi layout/logic/AC.
- **A-D46 (nhãn giá trị cột).** Chọn **làm** (không bỏ yêu cầu) với quy tắc rất hẹp để rẻ và đo được: ngưỡng `slot ≥ 30 px`, chỉ cột ≥ 3 phút, số giờ 1 chữ số thập phân không đơn vị (khớp trục Y đang tính theo giờ), `aria-hidden`. Hệ quả chấp nhận: ở điện thoại dọc và ở 1024–≈1155 px (hai chart cạnh nhau) không có nhãn; thông tin vẫn đủ nhờ tooltip/tóm tắt/bảng ẩn. Không thêm key i18n (số do `f.decimal1`/`f.number` sinh), nên không có bản dịch mới. Nếu dev thấy tốn công hơn lợi ích thì báo orchestrator để bỏ yêu cầu (ghi lại ở Backlog), không tự đổi ngưỡng.
- **A-D47 (Export thất bại).** Dùng Alert trong card Backup (như lỗi import) thay vì toast: lỗi cần hành động ("thử lại / kiểm tra cho phép tải tệp") và toast polite 4 s dễ bị bỏ lỡ. Không dùng `errors.WRITE_FAILED` vì câu đó nói "thay đổi vẫn còn trong biểu mẫu" (sai ngữ cảnh). Việc `claimExportHint` lỗi **không** hiện gì ra UI (bỏ qua hint, `console.warn`).
- **A-D48 (import ngoài giới hạn).** `outOfRange` liệt kê ví dụ giới hạn thay vì nêu đúng field (importer chỉ biết "một giá trị vượt giới hạn" và `errors[0]` có thể thuộc bất kỳ field nào; nêu sai field còn tệ hơn câu chung). Các con số trong câu (1.827 ngày, 1–1.440 phút) khớp `config/constants.ts` và bảng 7.3; nếu giới hạn đổi thì phải sửa chuỗi này và test `limits-parity` (M10-AC2) báo.
- **A-D49 (quy tắc một toast).** Ghi nhận hành vi đã ship (ADR-30 d) và hợp thức hoá bằng bảng ưu tiên ở mục 5 (`mergeDone` > `signedIn`, `prefsFromAccount` > `syncNowDone`, còn lại toast sau cùng thắng). Không thêm hàng đợi toast.
- **A-D50 (heatmap).** Giữ nguyên kích thước ô; chỉ sửa câu chữ: vừa khít khi viewport ≥ 1192 px (ngưỡng làm tròn), cuộn trong hộp ở 1024–1191 px. Không đổi ngưỡng breakpoint `lg` (1024) vì sidebar xuất hiện ở đó.
- **A-D51 (nhãn trực tiếp "Ideal +X%").** Thêm viền sáng quanh chữ nhãn (tuỳ chọn, chỉ CSS) thay vì dời vị trí: giữ nguyên thuật toán vị trí đã được QC kiểm (`curve-label` không đè nhau). Không có AC; không chặn.

**Assumptions của phase 5 (v4.0, M11-T7 — user 2026-10-19 không có Gate duyệt design; designer tự chốt, sửa chữ chỉ là đổi hai chuỗi)**

- **A-D52 (Total hours: khoá, không ẩn).** Radio "No end date" **hiện nhưng khoá** (`disabled`) cùng ghi chú luôn hiện khi Target = Total hours, thay vì ẩn. Lý do: (1) người dùng thấy lựa chọn tồn tại và hiểu vì sao Total hours không có (ghi chú nói thẳng: cần ngày kết thúc để tính chỉ tiêu ngày); (2) nhóm Ends giữ 3 hàng, không nhảy bố cục khi đổi Target; (3) test/AT có một nút để kiểm. Đánh đổi: thêm ≈ 60–80 px chiều cao ở Total hours và radio khoá không focus được (đã bù bằng chữ hiển thị liền sau, 8.2).
- **A-D53 (đang "No end date" rồi đổi sang Total hours).** Ends **tự chuyển sang "This year — ends {date}"** (luôn hợp lệ, không cần nhập thêm, trùng mặc định của form tạo) kèm thông báo SR `goal.form.endsNeverSwitched`; không chuyển sang "On a specific date" vì sẽ bắt người dùng nhập thêm một ô ngay lúc họ chưa quyết định. Đổi về Minutes per day **không** tự chọn lại "No end date" (không nhớ trạng thái cũ): đơn giản, dễ đoán, người dùng thấy rõ radio đang chọn; nếu họ lỡ tay, chọn lại là một chạm.
- **A-D54 (vị trí radio và ô End date).** Radio thứ ba nằm **cuối** nhóm (đúng "radio thứ ba" của M11-AC9); ô End date chuyển lên **ngay dưới "On a specific date"** để không bị tách khỏi radio của nó bởi radio thứ ba. Chỉ đổi vị trí DOM của một field có điều kiện; mọi test locate theo label không bị ảnh hưởng.
- **A-D55 (Range bị bỏ với goal không thời hạn).** Whole period ≡ So far nên bỏ control thay vì khoá một control thừa (không có "lựa chọn vô nghĩa"). Hệ quả: không có cách thu hẹp cửa sổ thời gian cho goal chạy rất lâu (xem OQ-D21); bảng dữ liệu vẫn có mọi ngày.
- **A-D56 (hàng goal: "từ {start}, không có thời hạn").** Chọn "từ …" thay vì `{start} – ∞`: đọc được bằng SR, dịch được, không phải giải thích ký hiệu. Thêm cụm "no end date / không có thời hạn" (cùng chữ với radio) để người dùng nhận ra goal này khác goal "This year" dù không thấy ngày cuối; ngắn hơn một badge riêng nên không thêm thành phần mới. Cùng một key cho Goals và đầu trang Goal detail. Không có badge/nhóm Ended.
- **A-D57 (Progress tới hôm nay).** Phụ đề `{cur} of {total} min expected so far` thay cho `of {total} min` vì mẫu số của goal không thời hạn là chỉ tiêu tích luỹ tới hôm nay (A-51), không phải tổng cả goal; giá trị % có thể > 100%. Nhãn thẻ vẫn là `Progress`.
- **A-D58 (upcoming không hạn: bỏ thẻ biểu đồ).** Không có điểm nào để vẽ (A-52) nên không render khung biểu đồ rỗng; câu `goal.detail.upcoming` có sẵn đã nói đúng điều cần nói, không thêm key.
- **A-D59 (một điểm).** Goal không hạn ngày đầu tiên: chấm ở giữa vùng vẽ, không thêm điểm giả (xem S4 mục 6).
- **A-D60 (End date khi sửa goal không hạn).** Ô End date (ẩn) khởi tạo = cuối năm của Start date; nếu entry nằm sau ngày đó thì lỗi `GOAL_PERIOD_EXCLUDES_ENTRIES` đã có hint Start date giải thích. Không tự tính "ngày muộn nhất của entry" để giữ form đơn giản.
- **A-D61 (`en`).** `No end date` (song song với nhãn `End date`; ngắn, không gợi ý "never ends" như một lời hứa). `vi` `Không có thời hạn` nguyên văn user (A-56).

**Assumptions của phase 6 (v5.0, M12-T7 — Gate 1 đã duyệt 2026-10-21, giữ OQ-12 … OQ-20; không có Gate duyệt design, designer tự chốt, sửa chữ chỉ là đổi chuỗi)**

- **A-D62 (Apple trên Google, cùng cỡ).** Trên iOS, nút Apple luôn **trên** nút Google, cùng chiều rộng/chiều cao/cỡ chữ, cách 12 px, ở cả ba nơi có nút Google. Lý do: Guideline 4.8 và HIG yêu cầu Apple ngang hàng hoặc nổi bật hơn; đặt trên là cách rẻ nhất để chắc chắn. Nút Apple không có biến thể "nhỏ" nào. Bản web/Android không có nút Apple (OQ-15).
- **A-D63 (card `.ics`).** Ẩn khi `capabilities.scheduledNotifications` (iOS từ M15), còn ở M12 … M14 và ở web (7.8.4). Lý do: tránh nhắc đôi, tránh bước share sheet thừa. Hệ quả: người dùng iOS muốn nhắc trong Lịch mất đường đó; họ vẫn có thông báo của app. Đảo ngược chỉ là hiện lại nút.
- **A-D64 (D6).** Mặc định **Remove** (OQ-16), nhưng **focus ban đầu ở `Cancel`** và nút xác nhận luôn đỏ, kể cả khi chọn Keep (cả hai đều xoá tài khoản). Không có bước gõ chữ "DELETE": D6 đã nêu hậu quả và có nút Cancel nổi bật; người dùng Apple còn phải qua bảng xác nhận của Apple. Thiết bị khác sau khi tài khoản bị xoá và người dùng đăng nhập lại (cùng Gmail = user **mới**, A-61) sẽ hiện D5 "Add this device's data…" vì `lastUserId` cũ khác user mới (suy ra từ FR-47 và A-27; M14-AC6 chỉ kiểm tới "Sign in again", chưa có AC cho bước D5 sau đó) — nên dữ liệu trên thiết bị kia không "sống lại" trong tài khoản mới mà không hỏi.
- **A-D65 (panel thu hồi).** Chỉ nằm trong bộ nhớ của phiên chạy app, hiện lại mỗi lần vào Settings cho tới `Dismiss` hoặc đóng app; không ghi kv. Lý do: tài khoản đã mất, không có nơi bền để lưu theo người dùng, và đây chỉ là hướng dẫn một lần.
- **A-D66 (icon).** Một icon duy nhất nền trắng (OQ-18), không biến thể tối/tinted của iOS 18: logo có chữ đen nên trên nền tối/tinted cần thiết kế lại; iOS vẫn hiển thị icon chuẩn. Muốn làm sau chỉ thêm ảnh vào `AppIcon.appiconset`.
- **A-D67 (launch screen).** Sáng: logo trực tiếp trên `#F7F6F2`; tối: ô trắng bo góc chứa logo trên `#121513` (đúng cách brand mark ở sidebar); không chữ, không spinner (FR-64). Kích thước hộp logo chọn nhỏ (≤ 520 px trên canvas 2732) để khi iOS phóng `scaleAspectFill` logo chiếm ≈ 40–48 % chiều rộng màn hình.
- **A-D68 (safe area dùng token).** Khai báo `--safe-*` một lần rồi dùng `var()` thay vì rải `env()` khắp CSS: cho phép chụp screenshot giả lập vùng an toàn và đổi một chỗ khi cần. Thanh tab ẩn khi bàn phím mở (`body.keyboard-open`) là yêu cầu mới nhỏ cho M13-T4 (xem OQ-D25); nếu NV-13 thấy giật thì bỏ, không đổi gì khác.
- **A-D69 (chữ).** Không hỗ trợ Dynamic Type (non-goal PRD). Cỡ chữ app cố định theo token; người dùng cần chữ lớn dùng Display Zoom của iOS.
- **A-D70 (không có nút "Open Settings").** Hướng dẫn mở Cài đặt iOS khi quyền bị chặn chỉ là chữ (`nativeDeniedDesc`), để giữ phạm vi M15 và vì chưa chắc cách mở thẳng (`App.openUrl('app-settings:')` của `@capacitor/app` đã pin, chưa kiểm trên iPhone thật) qua được App Review mà không thêm rủi ro. Nếu NV-17 cho thấy người dùng khó tìm, thêm một nút `Open iPhone Settings` (1 key mới + `vi`) mà không đổi gì khác; ghi ở OQ-D27.
- **A-D71 (nội dung thông báo).** Một câu cố định mỗi ngày (`Log today's time. Small steps add up.`), không nêu tên goal, số phút hay chuỗi ngày: lịch được lập trước tới 14 ngày nên mọi con số có thể đã sai lúc thông báo hiện, và nội dung màn khoá nên không lộ tên mục tiêu của người dùng (riêng tư).
- **A-D72 (Storage native).** Không dùng nhãn "Protected/Not protected" vì iOS không có `persist()`; dùng chip trung tính `In this app` và nói thẳng hai điều có thật: xoá app = mất dữ liệu; iOS có thể dọn khi hết dung lượng (NV-20). Khuyến khích Export/đăng nhập, không hù doạ.
- **A-D73 (screenshot).** Không chụp Settings/Account vì bản `native-e2e` (Chromium, cloud tắt) không có card Account và Reminders native thật; ba màn dùng hằng ngày + đường cong + heatmap kể đủ câu chuyện. Hai ảnh tối là ảnh 3 và 4. Không caption, không khung máy (ADR-43); nếu App Review hoặc user muốn caption, thêm lớp ở bước hậu kỳ, không đổi app.
- **A-D74 (support / privacy).** Giọng `vi` ở hai trang tĩnh xưng "mình" (người làm app viết cho người dùng), khác `bạn` trong app (app nói với người dùng); đây là văn bản của người làm app, không phải UI. Email liên hệ giữ `minh.lgm@gmail.com` như trang hiện có (OQ-D22).
- **A-D75 (About).** Không thêm dòng phiên bản app (PRD không yêu cầu; cần `@capacitor/app.getInfo()` và một key). Thêm link `Support` ở cả web và native (M15-T4).
- **A-D76 (Hide My Email).** Ghi chú đặt ở card A1 (`hideEmailNote`), không đặt trên/bên trong nút Apple để nút giữ đúng nhãn do Apple quy định; không cần ở LoginPromptBanner/ExportSignInHint (người dùng thấy ở Settings khi đăng nhập qua đó nhiều nhất; banner chỉ gợi ý).
- **A-D77 (nhà cung cấp trong A5).** `providers` là danh sách identity đã liên kết, nên nhãn hai nhà cung cấp là "Signed in with Apple or Google", không nói người dùng vừa dùng cái nào.

---

## 11. Open questions

- **OQ-D1 (cho planner/user).** FR-24 chưa nói Review "All goals" hiển thị `Progress`/`Pace` thế nào. Thiết kế hiện ẩn hai thẻ này ở All goals (A-D1). Nếu muốn có, cần định nghĩa công thức tổng hợp (ví dụ: chỉ cộng các goal `active`).
- **OQ-D2 (cho user, nhỏ).** Control `Range` trên đường cong (A-D4) là phần thêm ngoài PRD để biểu đồ dùng được với goal dài. Duyệt hay bỏ (bỏ thì goal "This year" sẽ thấy đường You gần như phẳng ở đầu năm)?
- **OQ-D3 (cho planner).** PRD chưa có luồng "đóng banner nhắc" hay "tắt nhắc hôm nay". Thiết kế không thêm (A-D9). Nếu muốn, thêm FR.
- **OQ-D4 (cho planner, thông tin).** TASKS M1-AC7 mô tả "xoá entry" không nhắc bước xác nhận; thiết kế có xác nhận inline (A-D5) nên e2e cần thêm một cú bấm `Delete`.
- **OQ-D5 (cho planner, thông tin).** Quy ước hiển thị mà các AC đang tham chiếu và thiết kế đã thống nhất: Today `20/30`, timer `00:01:05`, Stop điền sẵn `26`, khoảng goal `2026-10-01 – 2026-10-31`, `30 min/day`, `25.8%`, ~~`+8.3% better`~~ (v3.0: `+0.0% better` cho S1 "Read", `+440.0% better` cho R1), preview import `5 goals, 23 entries`, notification body `3 goals left today: Read 0/30 min, …` (các giá trị này là của `en`; `vi` xem 7.1).
- **OQ-D6 (cho user, quan trọng với i18n).** Bạn có muốn người bản ngữ xem lại bản dịch `vi` và thuật ngữ trong 7.0 trước khi developer M1 copy vào `vi.json` không (A-D16)? Mặc định: dùng nguyên văn như hiện tại; sửa chữ sau này chỉ là thay đổi trong `vi.json`.
- **OQ-D7 (cho planner/QC, thông tin).** (a) Parity test (M1-AC17) phải so `vi` `_other` với `en` `_other` và bỏ qua `_one` (vi không có); biến `{{count}}` có mặt ở cả hai `_other`. (b) Các dòng đánh dấu `(= en)` ở mục 7 (`app.name`, `settings.language.title`, `settings.language.option.*`, `+1%`, `{{n}}/280`…) cần được miễn trong test "không lẫn tiếng Anh" (NFR-11c). (c) `settings.language.title` = `Language / Ngôn ngữ` chứa chữ tiếng Việt ở bản `en` và chữ tiếng Anh ở bản `vi` có chủ đích.
- **OQ-D8 (cho planner/developer, thông tin).** Tên thứ/tháng ngắn của `Intl` `vi-VN` (`Th 2`, `thg 10`) khác nhau giữa các phiên bản ICU và có thể rộng hơn nhãn `en`; heatmap/biểu đồ phải chịu được (mục 3.4). Nếu QC thấy nhãn đè nhau ở 360 px, dùng dạng số (`T2`, `10`) cho nhãn trục ở < 640 px, chi tiết đầy đủ vẫn có ở tooltip/bảng ẩn.
- **OQ-D9 (cho planner, nhỏ).** `LocaleService` chưa có API cho biết ngôn ngữ hiện tại là "đã chọn" hay "đang theo trình duyệt"; thiết kế không cần (Language chỉ hiện ngôn ngữ đang dùng). Nếu sau này muốn thêm tuỳ chọn "Theo trình duyệt" thì cần quyết định ở plan.
- **OQ-D10 (cho planner, M7, quan trọng với dữ liệu).** Thiết kế D4 (A-D26): khi người dùng chọn **Remove data** mà đồng bộ lần cuối không đẩy hết thay đổi (offline, lỗi, hết 10 s), dialog **ở lại** và hỏi lại bằng nút `Remove anyway`. ARCH §5.9 hiện nói lỗi mạng không chặn đăng xuất; TASKS M7-AC12 chỉ kiểm nhánh Keep. Cần planner xác nhận (thêm một AC nhỏ cho nhánh Remove + còn thay đổi chờ) hoặc bỏ bước hỏi lại (khi đó chỉ còn khối cảnh báo `auth.signOut.unsyncedRemove`, người dùng bấm `Sign out and remove data` là xoá luôn). Mặc định thiết kế: có hỏi lại.
- **OQ-D11 (cho user, quyền riêng tư).** Chuỗi `settings.about.privacy` nói dữ liệu được lưu trong cơ sở dữ liệu của app (Supabase) và "người khác dùng app không xem được"; thực tế chủ project (anh) đọc được mọi hàng trong Dashboard. Giữ cách nói trung thực này hay muốn nêu rõ "chủ app có thể truy cập kỹ thuật"? (Có thể đổi chữ sau mà không đụng layout.)
- **OQ-D12 — ĐÃ QUYẾT (v3.1, PRD A-44, ARCH ADR-30 b).** ~~`ExportSignInHint` (FR-53) dùng "lượt" 30 ngày qua `claimExportHint` ngay khi Export thành công; nếu lúc đó offline thì nút đăng nhập bị vô hiệu và lượt bị tiêu.~~ Quyết định: chỉ `claim` khi **online** lúc Export thành công; offline → không hint, không tiêu lượt. F14, S7 và §5 đã viết lại (v3.1); developer M8 đã làm đúng như vậy từ trước.
- **OQ-D13 (cho planner/developer, thông tin).** Để dựng đúng, M6/M7 cần hiển thị được: `AuthState.signed-out.lastError` (có thể xoá bằng `Dismiss`), `SyncStatus.nextRetryAt`, số bản ghi `skippedInvalid` (chỉ cần cờ có/không cho A9), số goal/entry còn sống sau lần đồng bộ đầu (cho `toast.mergeDone`), và email/tên đã lưu trong kv `sync.account` (cho `expired`). Nếu một trong các dữ liệu này không có trong `AuthState`/`SyncStatus`, báo lại để chỉnh thiết kế thay vì tự suy ra.
- **OQ-D14 (cho planner, nhỏ).** Phase 2 chưa có cách để người dùng đã đăng nhập xem hoặc xoá dữ liệu cloud/tài khoản trong app (OQ-09 đã quyết "để Later"). Thiết kế không thêm; chỉ nêu trong `settings.about.privacy` và README rằng dữ liệu nằm ở Supabase.
- **OQ-D15 (cho planner/developer, thông tin, M9).** Ánh xạ copy ↔ AC để khỏi tìm: M9-AC4 (phụ đề chứa `27`, `14`, `+92.9%`, `×5.4`, `5`) = `goal.detail.subToday`; M9-AC6(2) (một ngày có ghi, không `×`) = `subStart`; M9-AC6(1) = `empty.detail.curve` + `chartSummaryEmpty`; M9-AC6(3)/M9-AC5 (headline âm chứa `40.0` / `40,0`) = `goal.detail.headlineDown`; "key headline" trong M9-AC4/AC5 = `goal.detail.headline` (≥ 0), còn `< 0` là `headlineDown` (hai key, chọn theo dấu `headlinePercent`). Tooltip ngày baseline cần `baseline.date` (đã có trong `CurveData`) để chọn `tooltipBase`; không cần trường mới.
- **OQ-D17 (cho planner, nhỏ, M9).** ARCH §4.5 viết "mỗi đầu nới thêm 5 % của `yMax − yMin`". Với R1 (không giá trị âm) áp dụng nguyên văn cho đầu dưới cho `yMin = −22` rồi làm tròn ra `−100` (bậc đẹp = 100): một dải trống ~1/6 chiều cao dưới vạch 0%. Mockup và S4 yêu cầu **không nới đầu dưới khi min của "Bạn" ≥ 0** (`yMin = 0`); vẫn thoả `yMin ∈ [−0.25·S, 0]` của M9-AC2 nên không cần đổi AC, chỉ cần dòng chữ ở ARCH §4.5 và `curveYDomain` theo đó. Nếu planner muốn giữ nguyên văn thì báo lại để designer chỉnh mockup.
- **OQ-D16 (cho user, nhỏ, M9) — TRẠNG THÁI (v3.1, PRD A-45): CHỐT TẠM, CHỜ USER CHỌN CÂU KHÁC.** Headline âm giữ `−40.0% vs your first day` / `−40,0% so với ngày đầu` (A-D34, A-D45). Chưa có yêu cầu đổi câu từ user (STATUS không ghi quyết định nào về việc này). Muốn câu khác (ví dụ `40.0% below your first day` / `Thấp hơn ngày đầu 40,0%`) thì chỉ cần đổi hai chuỗi `goal.detail.headlineDown`, không đụng layout hay logic. Không chặn M10.
- **OQ-D18 (cho developer/orchestrator, nhỏ, v3.1).** `public/privacy.html` (trang tĩnh) vẫn dùng brand cũ: ô xanh chữ "1%" + chữ "Better per Day" (dòng 109), lệch với brand mark ảnh logo của app (A-D41). Ngoài phạm vi DESIGN (file nằm ở `public/`, chỉ developer sửa). Đề nghị đổi cho khớp ở một lần dọn sau; không chặn M10 và không có AC.
- **OQ-D19 (cho user/QC, nhỏ, v3.1).** Ảnh logo ở 28 px khó đọc chữ "BETTER"; chữ `app.name` bên cạnh đã đủ nghĩa. Nếu muốn mark lớn hơn (ví dụ ô 36 px / ảnh 32 px) thì QC phải nới assertion `tests/qc/m7-r1-brand.spec.ts:102` trước, rồi đổi CSS `.mark`; designer không đổi con số ở v3.1 vì đang bị test khoá và chưa có yêu cầu từ user.
- **OQ-D20 (cho planner, thông tin, v3.1).** Trục Y của BarChart không ghi đơn vị (giờ) và nhãn giá trị mới (A-D46) cũng không kèm đơn vị; đơn vị hiện ở tóm tắt, tooltip và bảng ẩn. Nếu QC/user thấy "2.7" khó hiểu thì thêm một tiêu đề đơn vị nhỏ cho trục (cần một key mới + bản dịch, ví dụ `chart.bar.unitHours` = `Hours` / `Giờ`) — designer sẽ thêm khi được yêu cầu; không làm trong M10.
- **OQ-D21 (cho planner/user, nhỏ, KHÔNG chặn M11, v4.0).** Goal không thời hạn chạy lâu (vài trăm ngày trở lên) có đường Ideal `1.01^k` rất lớn (ngày 365 ≈ +367.800%; ngày 1.000 ≈ +2,1 triệu %), nên đường "Bạn" nằm sát vạch 0% — đúng toán học và đã là hệ quả được chấp nhận của ARCH §4.5 cho goal có hạn, nhưng với goal "chạy mãi" nó sẽ thành tình trạng thường trực, và vì Range bị bỏ (A-D55) không có cách thu hẹp cửa sổ. Giá trị vẫn đọc được ở nhãn trực tiếp, tooltip, tóm tắt và bảng. Nếu user thấy khó dùng, đề xuất cho sau (cần FR/plan, không phải designer tự thêm): control Range kiểu `Last 30 days` / `Last 90 days` / `All` chỉ cho goal không thời hạn, hoặc ẩn đường Ideal sau N ngày. Đã ghi vào Later của planner chưa: chưa (designer không sửa `docs/plan/**`).
- **OQ-D22 (cho user, nhỏ, v5.0).** Email liên hệ công khai trên `support.html`, `privacy.html` và ghi chú cho App Review là `minh.lgm@gmail.com` (đã có trên `privacy.html` từ 2026-10-12). App Store hiển thị URL hỗ trợ/riêng tư công khai; có muốn dùng một địa chỉ riêng cho app (alias) thay email cá nhân không? Mặc định: giữ nguyên. Đổi chỉ là thay chuỗi ở 7.8.6, 7.8.7.
- **OQ-D23 (cho user, nhỏ, v5.0).** Trang privacy ghi "a personal, open-source project by Minh". Apple (đăng ký cá nhân, OQ-12) sẽ hiển thị **họ tên thật** của anh làm người bán trên App Store; có muốn ghi cùng họ tên đó vào đoạn "Who this is for" cho khớp không? Mặc định: chỉ "Minh". Cũng chưa có dòng Copyright (App Store Connect hỏi `© 2026 <tên>`); designer không tự điền tên.
- **OQ-D24 (cho orchestrator, thông tin, v5.0).** `support.html` và `privacy.html` phải **đã lên GitHub Pages** (URL trả 200, nội dung mới) trước khi user nộp review, vì App Store Connect kiểm URL (TASKS M15 "Phát hành"). Ngày "Last updated" trong `privacy.html` = ngày push thật (mặc định ghi `2026-10-21`; developer cập nhật theo ngày đẩy).
- **OQ-D25 (cho planner/developer, nhỏ, v5.0).** M13-T4 chưa nêu bốn việc nhỏ mà DESIGN v5.0 cần (không đổi AC, không đổi ADR): (1) chỉ bản **native** có `viewport-fit=cover` trong `<meta name="viewport">` (nếu không `env(safe-area-inset-*)` luôn 0; bản web giữ meta cũ, không đổi hành vi PWA); (2) khai báo `--safe-*` trong `:root` và dùng `var(--safe-*)` ở các selector của mục 5 "Native shell"; (3) `html { scroll-padding… }` (8.3); (4) class `body.keyboard-open` do listener `keyboardWillShow/Hide` của `@capacitor/keyboard` đặt, để ẩn thanh tab khi bàn phím mở. Cả bốn chỉ là CSS + vài dòng trong `system-ui.ts`; nếu planner thấy ngoài phạm vi M13-T4 thì dev ghi vào handoff và QC kiểm theo DESIGN (M13-AC5 chỉ yêu cầu `env(safe-area-inset-*)` cho thanh trên, tab bar, toast, dialog — thoả).
- **OQ-D26 (cho user hoặc người bản ngữ, nhỏ, v5.0).** Tên các mục của iOS bằng tiếng Việt trong chuỗi `vi` (`Lưu vào Tệp`, `Đăng nhập & Bảo mật`, `Đăng nhập bằng Apple`, `Cho phép thông báo`, `ID Apple`, và `"Stop Using Apple ID" (Ngừng dùng ID Apple)`) viết theo bản địa hoá Apple Việt Nam nhưng **chưa kiểm trên iPhone chạy tiếng Việt**. Khi TestFlight có (NV-15, NV-16, NV-17) đối chiếu rồi báo, chỉnh sửa chỉ là đổi chuỗi `vi`. Đồng thời xem OQ-D6 (bản dịch `vi` chưa qua người bản ngữ).
- **OQ-D27 (cho user, sau NV-17, nhỏ, v5.0).** Khi quyền thông báo bị chặn, app chỉ có hướng dẫn bằng chữ (A-D70). Nếu 3 ngày thử (NV-17) thấy khó tìm, đề xuất thêm nút `Open iPhone Settings` (cần kiểm `App.openUrl('app-settings:')` trên máy thật). Không chặn M15.
- **OQ-D28 (cho developer, thông tin, v5.0).** Glyph Apple trong nút Sign in with Apple phải lấy từ tài nguyên chính thức của Apple (Apple Design Resources / trang hướng dẫn nút); mockup `09-account.html` dùng một glyph thay thế chỉ để dàn trang. Developer M14 không tự vẽ lại logo; nếu chưa có tệp chính thức thì dùng một SVG glyph Apple đơn sắc (đen hoặc trắng, đúng tỉ lệ) và ghi vào handoff để thay bằng tệp chính thức trước khi nộp review (App Review xem nút này). Không tải glyph từ mạng (NFR-01).
- **Phase 6 (v5.0): không phát hiện luồng PRD thiếu.** Lưu ý thông tin: PRD FR-62 nói banner trong app giữ nguyên; trên native pre-M15 và khi quyền bị chặn app vẫn có `ReminderBanner` kiểu web (chỉ khi app mở), thiết kế không đổi.
- **Không phát hiện luồng PRD thiếu cho FR-56/FR-57.** Lưu ý thông tin (không phải câu hỏi): PRD A-53 nói đổi sang `total` khi đang "không thời hạn" thì form "không cho lưu ở trạng thái đó"; thiết kế thực hiện bằng cách khoá radio + tự chuyển Ends (A-D52, A-D53) nên trạng thái đó không bao giờ tồn tại trong form, `openEndedTotal` chỉ là lớp dự phòng.

---

## Changelog

- 2026-10-22 — **v5.1**: đường Ideal bắt đầu ở +0% ngày đầu của khoảng (`1.01^(k−1)`, PRD/ARCH v5.1); không đổi layout, copy, key hay token — chỉ số liệu trên biểu đồ, nhãn trực tiếp, tooltip, tóm tắt và bảng dịch xuống một ngày (R1 ngày 4: +3,0% thay vì +4,1%).

- 2026-10-09 — v1, tạo mới (mode `new`): user flows, 9 màn hình + 3 dialog, component, tokens (sáng/tối), copy, a11y, 8 mockup HTML.
- 2026-10-09 — v1.1 (mode `revise`, feedback Gate 2: thêm tiếng Việt; PRD v1.2, FR-32 … FR-36, NFR-11):
  - Mục 7 viết lại: bảng đầy đủ key i18n với cột `en` / `vi` cho mọi chuỗi (nhãn, nút, placeholder, hint, toast, dialog, lỗi, empty/error state, aria-label, notification, `.ics`, heatmap/chart, Not found, StorageError, ErrorBoundary); thêm 7.0 (quy tắc key, tham số `{{}}`, số nhiều `_one/_other`, glossary và quy tắc viết tiếng Việt), 7.1 thêm cột `vi`, 7.3 thêm bảng ánh xạ `src/ui/error-messages.ts` → `errors.*` (thay `src/ui/copy.ts`), 7.6 chuỗi theo màn hình. Key cũ bị đổi tên để không có key nào là tiền tố của key khác (`empty.review.year` → `empty.reviewYear`, `reminder.banner(.one)` → `reminder.banner_one/_other`, `form.*` → `entry.form.*`/`goal.form.*`, `chart.bar.summary` → `chart.bar.weeklySummary`…).
  - Settings (S7): thêm card **Language / Ngôn ngữ** (M1, đứng đầu), control `English` / `Tiếng Việt`, trạng thái, tương tác, a11y; cập nhật mục 3.3 (bản đồ milestone), mục 5 (`LanguageSwitcher`), mục 8 (a11y ngôn ngữ, `lang` từng lựa chọn), mục 9.
  - Thêm 3.4 "Bố cục với chuỗi tiếng Việt (rà 360 px)": quy tắc chung và bảng rủi ro/xử lý (tab bar, nút Goals, segmented, StatCard, heatmap, chart, toast, dialog…). Thay đổi bố cục duy nhất: `.label-row` được `flex-wrap`, thẻ Pace chiếm cả hàng < 640 px và giá trị dạng chữ 20 px, link "ghi bù" dùng `line-height` 24 + padding thay cho `line-height` 44. Không đổi token màu, typography, spacing.
  - Mockup: thêm `01-today.vi.html` (Today bản `vi`); `08-settings.html` thêm card Language (bản `en`) ở đầu; `index.html` thêm liên kết.
  - Sửa nhẹ `en`: `goal.delete.body_one` ("its 1 entry"). Thêm `errors.UNKNOWN`, `toast.languageChanged`, `chart.bar.monthlySummary` và các aria-label đã có trong mockup nhưng chưa có key (A-D19).
  - Assumptions A-D11 (sửa), A-D13 … A-D19 (mới); Open questions OQ-D5 (cập nhật), OQ-D6 … OQ-D9 (mới).
- 2026-10-12 — **v2.0** (mode `revise`, phase 2: đăng nhập Google tuỳ chọn + đồng bộ cloud; PRD v2.1 FR-37 … FR-55, ARCH v2.1, TASKS v2.1 M6/M7/M8). Cập nhật tại chỗ, giữ nguyên token và bố cục phase 1; build không cấu hình cloud giống hệt v1.1.
  - §1: nguyên tắc 5 sửa nhẹ ("trên máy bạn trước"), thêm nguyên tắc 6 (tài khoản là lựa chọn, không phải cánh cổng). §2: thêm F9 đăng nhập, F10 đăng xuất (D4), F11 gộp lần đầu / đổi tài khoản (D5), F12 hết phiên, F13 đồng bộ nền + chỉ báo, F14 nhắc đăng nhập; F7 ghi chú D3 đã đăng nhập.
  - §3: 3.1 thêm **StatusRow** (SyncIndicator thay OfflineChip khi đã đăng nhập) và ghi chú callback không phải route; 3.3 thêm hàng M6/M7/M8; **3.5 mới**: rủi ro 360 px cho thành phần phase 2 (email/tên dài, chuỗi `vi`, dialog cuộn + nút dính đáy).
  - §4: S1 thêm LoginPromptBanner (M8) và StatusRow (M7); S7 thêm card **Account** (thứ tự Language → Account → Reminders …; 10 trạng thái A1 … A10), ghi chú "theo tài khoản" ở Language/Reminders, Backup/Storage/About theo trạng thái (bảng 3 cột), tương tác/focus, D3 biến thể đã đăng nhập, **D4** (đăng xuất Keep/Remove), **D5** (gộp tài khoản).
  - §5: component mới `GoogleSignInButton`, `AccountCard`, `Avatar`, `SyncIndicator` (bảng 6 trạng thái), `SignOutDialog`, `MergeAccountDialog`, `LoginPromptBanner`, `ExportSignInHint`, `SettingsSyncNote`; sửa `AppShell`, `Banner` (tone `promo`), `Toast` (tone `error` + action), `ConfirmDialog`. §6: 3 token Google (`--google-bg/-border/-text`), `--chip-h`, motion vòng xoay; không thêm màu khác.
  - §7: **97 key logic mới** (101 dòng `en`; `vi` đủ 97, `_one` không có `vi`), cả `en` và `vi`: 7.2 (+12: `format.changesCount/todayAt/dateAt`, `common.dismiss`, 8 toast), 7.3 (+8: `errors.AUTH_*` 4, `errors.SYNC_*` 4), 7.7.1 Account (+20), 7.7.2 D4/D5/D3 (+24), 7.7.3 SyncIndicator (+16), 7.7.4 nhắc đăng nhập (+7), 7.7.5 Settings (+10); 7.0 thêm tiền tố key, thuật ngữ (đăng nhập, tài khoản, đồng bộ, thay đổi, thiết bị, "Để sau"; "Google" không dịch); 7.1 thêm định dạng thời điểm đồng bộ.
  - §8.1 mới: a11y phase 2 (tương phản, vùng `aria-live` riêng cho trạng thái đồng bộ, focus sau callback/đăng xuất/Not now, dialog D4/D5, banner không modal, nút Google). §9: ghi chú trang Google/callback là ngoài app.
  - Mockup: `08-settings.html` (card Account + bộ chọn trạng thái, ghi chú đồng bộ, Backup/Storage/About theo trạng thái, D3/D4/D5 preview), `01-today.html` + `01-today.vi.html` (LoginPromptBanner, SyncIndicator, bộ chọn trạng thái), **`09-account.html` mới** (bảng tham chiếu mọi trạng thái, đổi `en`/`vi`, sáng/tối, email dài); `index.html` thêm liên kết. Tất cả có nút sáng/tối.
  - Assumptions A-D20 … A-D33; Open questions OQ-D10 … OQ-D14.
- 2026-10-13 — **v3.0** (mode `revise`, phase 3: đường cong "Bạn" = phút ngày có ghi gần nhất ÷ phút ngày đầu có ghi, nhân dồn so với ngày có ghi trước; user duyệt Gate 1; PRD v3.0 FR-27/A-39…A-43, ARCH §4.5, TASKS M9). Chỉ đổi Goal detail; token màu, bố cục và mọi màn khác không đổi.
  - §S4: layout, trạng thái (chưa entry / một ngày có ghi / nhiều ngày / đi xuống / upcoming / ended), "Cách đọc con số", **quy tắc biểu đồ v3** (bậc thang `stepAfter`, vạch 0%, thang Y theo `curveYDomain` kể cả âm, nhãn trục có dấu + compact ≥ 10.000, nhãn trực tiếp không đè nhau, tooltip, chấm ngày có ghi), copy mẫu R1/R3. A-D4 (Range) giữ nguyên, chỉ thêm ghi chú miền Y không còn bắt đầu cứng ở 0.
  - §1 nguyên tắc 2, 3 sửa (đường đi xuống nhưng không đỏ; thang tự co giãn); §3.3 thêm hàng M9; §3.4 thêm 4 dòng rủi ro 360 px (headline cực trị, phụ đề, nhãn trục/tooltip, bảng 5 cột); §5 `CurveChart`; §6 thêm token `--chart-zero` (= `--text-muted`) và cập nhật ví dụ `--text-display`.
  - §7.1: định dạng % có dấu, **dấu trừ chốt U+2212**, hệ số `×N`, nhãn trục Y. §7.6.4: **12 key mới** (`goal.detail.headlineDown`, `subDay`, `subToday`, `subEarlier`, `subStart`, `legendZero`, `chartSummaryEmpty`, `tooltipChange`, `tooltipBase`, `tooltipFlat`, `tableMinutes`, `tableChange`), **9 key sửa** (`goal.detail.headline`, `chartCaption`, `legendYou`, `chartSummary`, `chartNote`, `tooltipIdeal`, `labelIdeal`, `labelYou`, `empty.detail.curve`), **3 key bỏ** (`goal.detail.headlineSub_one`, `headlineSub_other`, `tooltip`); đủ `en` và `vi`, cột MS = M9.
  - §8: a11y đường cong có số âm (dấu bằng chữ, vạch 0%, tooltip không live region, U+2212). Mockup `07-goal-detail.html` viết lại: dữ liệu R1, đổi `English`/`Tiếng Việt`, 7 tình huống (R1, R1 sang ngày không ghi, hôm nay ghi dở, R3 đi xuống, R4 cực trị, một ngày có ghi, chưa có entry), Range, bảng 5 cột; `index.html` cập nhật mô tả.
  - Assumptions A-D34 … A-D40; Open questions OQ-D15 (ánh xạ copy ↔ AC), OQ-D16 (câu headline âm), OQ-D17 (đầu dưới trục Y không nới khi không có số âm, lệch nhẹ chữ ARCH §4.5, trong dung sai AC). Không phát hiện luồng PRD thiếu.
- 2026-10-17 — **v3.1** (mode `revise`, M10-T8; PRD v3.1 A-44 … A-46, ARCH v3.1 ADR-28/30, TASKS v3.1 M10). **Không thêm tính năng, không đổi layout** ngoài các mục dưới; ghi nhận deviation đã ship và chốt copy còn mở. Mỗi key mới có cả `en` và `vi`.
  - **(1) Brand** — §3.1, §5 (mục "Brand" mới + component `BrandMark`), §6 (`--brand-tile`), A-D12/A-D41: brand mark = ảnh `brand-mark-96.png` trên ô **trắng** 32 px (ảnh 28 px, `border-radius: 9px`, `padding: 2px`) ở **cả hai theme**; chữ cạnh mark = `app.name` "1% Better per Day"; `app.brandSuffix` **bỏ** (7.2). Mockup: nav của 10 file (`01-today*.html`, `02` … `09`) đổi sang ảnh logo trên ô trắng + chữ `1% Better per Day`.
  - **(2) 7 key hàng bị cloud từ chối** — 7.7.1 (`settings.account.localRejected_one/_other`), 7.7.2 (`auth.signOut.rejected_one/_other`, `rejectedKeep`, `rejectedRemove`, `removeDescRejected`), hết trạng thái "chưa có trong DESIGN". **Giữ nguyên văn đã ship: 5 key** (`localRejected_one/_other`, `rejected_one/_other`, `removeDescRejected`; `vi` của cả 7 key giữ nguyên). **Đổi `en`: 2 key** — `auth.signOut.rejectedKeep` và `auth.signOut.rejectedRemove` (lệch số ít/nhiều sau `rejected_*`; dev cập nhật ở M10-T6 + literal trong test `m8-prompts` "M7-D5"). Vị trí hiển thị: S7 A9 (`data-reason` local/remote/both) và D4 (khối cảnh báo, mô tả Remove, vùng `role="status"`).
  - **(3) `settings.about.privacyLink`** — 7.7.5 (+ S7): `en` "Privacy policy" / `vi` "Chính sách quyền riêng tư" (giữ nguyên văn đã ship), luôn hiện kể cả cloud tắt, cùng tab tới `privacy.html`.
  - **(4) F14 / OQ-D12** — hint Export chỉ khi online, offline không hint, không tiêu lượt (A-44); F7, F14, S7, §5 `ExportSignInHint`, A-D44; **OQ-D12 đóng**. F14 thêm quy tắc mốc tương lai > 24 giờ và hai tab "Not now" (A-46, không đổi UI). **OQ-D16**: giữ câu headline âm theo A-45 (A-D45).
  - **(5) §6 / §3.2 heatmap** — câu cũ khẳng định lưới 53 tuần không cuộn ngay từ 1024 px đã bỏ (sai vì sidebar 232 px); ngưỡng đúng: vừa khít khi viewport ≥ 1192 px (845 + 34 + 32 + 48 ≈ 959 ≤ 960); 1024–1191 px cuộn trong `.heatmap-scroll`; không đổi cỡ ô (A-D50).
  - **(6) Nhãn giá trị cột BarChart** — S6 + §5 `BarChart` + §8 + A-D46: quy tắc đo được `(chartWidth − 38) / 12 ≥ 30 px`, cột ≥ 3 phút, số giờ không đơn vị, `aria-hidden`; không key mới. Là việc dev ở M10-T6 (d).
  - **(7) Copy mới (M10-T6)** — 7.3: `errors.IMPORT_INVALID_SCHEMA_outOfRange` (**key mới**, + hai dòng quy tắc chọn key theo `params.variant`), `errors.EXPORT_FAILED` (**key mới**; Alert trong card Backup, S7 "Export thất bại"); 7.4 `empty.day.noGoals`: chốt không dấu chấm (chỉ sửa chữ ở S5; `en.json` đã đúng, **không đổi code**); §5 Toast: **quy tắc một toast** + bảng ưu tiên (`mergeDone` > `signedIn`; `prefsFromAccount` > `syncNowDone`); 7.2 ghi chú ở `toast.mergeDone`/`syncNowDone`.
  - **(8) Tuỳ chọn** — S4 quy tắc 5: viền sáng quanh chữ nhãn trực tiếp "Ideal +X%/You +X%" (CSS, không AC; mockup `07-goal-detail.html` đã có). Không đổi vị trí nhãn.
  - **Tổng hợp key cho M10-T6**: **2 key mới** (`errors.IMPORT_INVALID_SCHEMA_outOfRange`, `errors.EXPORT_FAILED`; cả `en` và `vi`); **2 chuỗi `en` đổi** (`auth.signOut.rejectedKeep`, `auth.signOut.rejectedRemove`; `vi` không đổi); **6 key chỉ ghi nhận vào DESIGN, chữ đã ship giữ nguyên** (`settings.account.localRejected_one/_other`, `auth.signOut.rejected_one/_other`, `auth.signOut.removeDescRejected`, `settings.about.privacyLink`); `empty.day.noGoals` không đổi chữ (chỉ sửa chỗ viết sai ở §4 S5); **1 key đã bỏ khỏi code** (`app.brandSuffix`, đánh dấu bỏ trong 7.2). Mọi key khác không đổi.
  - Assumptions A-D41 … A-D51; Open questions OQ-D12 (đã quyết), OQ-D16 (cập nhật), OQ-D18 … OQ-D20 (mới). Không phát hiện luồng PRD thiếu.
- 2026-10-19 — **v4.0** (mode `revise`, M11-T7; yêu cầu user "thêm option Không có thời hạn" ở section Ends; PRD v4.0 FR-56/FR-57, A-47 … A-56; ARCH v4.0 §4.6; TASKS v4.0 M11; không có Gate duyệt design). Thêm lựa chọn **thứ ba** cho Ends, chỉ với Minutes per day; goal có hạn **hiển thị y như v3.1** (không key cũ nào đổi chữ, không token mới, không component mới).
  - **(1) §4 S3 + 7.6.3 — radio thứ ba:** `goal.form.endsNever` (`en` `No end date`, `vi` `Không có thời hạn` nguyên văn user, A-D61), đặt **cuối** nhóm Ends; End date chuyển lên ngay dưới "On a specific date" (A-D54). Chọn "No end date": ẩn End date, ẩn hint Target, hiện `goal.form.endsNeverHint` dưới radio. Form sửa goal `endDate = null` mở với radio đang chọn; End date ẩn khởi tạo = cuối năm của Start date (A-D60).
  - **(2) Quy tắc Total hours:** radio **hiện nhưng khoá** (`disabled`) + ghi chú luôn hiện `goal.form.endsNeverTotalNote` (A-D52). Đang chọn "No end date" rồi đổi Target sang Total hours → Ends **tự chuyển sang "This year"** + thông báo SR `goal.form.endsNeverSwitched`; đổi về Minutes per day không tự chọn lại (A-D53). Câu dự phòng `errors.GOAL_PERIOD_INVALID_openEndedTotal`. Flow mới **F15**.
  - **(3) §4 S2 + 7.6.2 — hàng goal:** `goals.rowDailyOpen` = `{n} min/day · from {start}, no end date` / `{n} phút/ngày · từ {start}, không có thời hạn` (A-D56); không bao giờ badge/nhóm/dòng Ended.
  - **(4) §4 S4 + 7.6.4 — Goal detail:** dòng khoảng thời gian dùng cùng key hàng; `goal.detail.subDayOpen` (`Day {k}`); `chartSummaryOpen` / `chartSummaryEmptyOpen` (không tổng); **Range bị bỏ** (A-D55, A-D4 cập nhật); một điểm → chấm giữa (A-D59); upcoming → **không render thẻ biểu đồ**, dùng lại `goal.detail.upcoming` (A-D58).
  - **(5) §4 S6 + `stat.*`:** `stat.progressSubOpen` (`{cur} of {total} min expected so far`) và `review.progressNoteOpen` (A-D57); Pace giữ nguyên chữ.
  - **(6) §7.3:** `errors.GOAL_PERIOD_INVALID_openEndedTotal`; `errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded` (khi `params.end === null`, chỉ có ngày bắt đầu) + hai hàng quy tắc chọn key.
  - **(7) Rà 360 px `vi`:** 7 dòng mới ở bảng 3.4 (radio thứ ba 1 dòng; mô tả/ghi chú 3–4 dòng, thụt lề 30 px; hàng goal 2 dòng; "Ngày 9"; phụ đề Progress 2 dòng; ghi chú Review). Không đổi bố cục ngoài các mục này.
  - **(8) §8.2 mới (a11y):** radio khoá = `disabled` thật + `aria-describedby` tới ghi chú luôn hiện, tương phản `--text-muted` (không `opacity`), bàn phím bỏ qua radio khoá, vùng `role="status"` cho `endsNeverSwitched`, lỗi dự phòng, hàng goal không ký hiệu `∞`.
  - **(9) Mockup:** `03-goal-form.html` viết lại có tương tác (radio thứ ba, khoá + ghi chú, tự chuyển Ends, chế độ sửa, lỗi, `English`/`Tiếng Việt`, sáng/tối theo OS); `02-goals.html` thêm hàng "Meditate" (Active) và "Piano" (Upcoming) + đổi `en`/`vi`; `07-goal-detail.html` thêm 3 tình huống goal không thời hạn (O1 ngày 9, ngày đầu tiên, chưa bắt đầu). Figma: chưa cập nhật (orchestrator làm nếu cần).
  - **Tổng hợp key cho M11-T4/T5:** **12 key mới** (cả `en` và `vi`): `goal.form.endsNever`, `goal.form.endsNeverHint`, `goal.form.endsNeverTotalNote`, `goal.form.endsNeverSwitched`, `goals.rowDailyOpen`, `goal.detail.subDayOpen`, `goal.detail.chartSummaryOpen`, `goal.detail.chartSummaryEmptyOpen`, `stat.progressSubOpen`, `review.progressNoteOpen`, `errors.GOAL_PERIOD_INVALID_openEndedTotal`, `errors.DATE_OUTSIDE_GOAL_PERIOD_openEnded`. **0 key sửa chữ, 0 key bỏ.**
  - Assumptions A-D52 … A-D61; Open questions OQ-D21 (nhỏ, không chặn: Ideal quá lớn với goal chạy lâu, không còn Range). Không phát hiện luồng PRD thiếu.
- 2026-10-21 — **v5.0** (mode `revise`, **M12-T7**; Gate 1 phase 6 đã duyệt, giữ OQ-12 … OQ-20; user chốt: icon nền trắng, D6 mặc định xoá dữ liệu máy, Apple chỉ trên iOS, tên "1% Better per Day" / dưới icon "1% Better", không demo account, mọi quốc gia). PRD v5.0 FR-58 … FR-67, NFR-18 … NFR-24; ARCH v5.0 §4.7, §5.12 … §5.16; TASKS v5.0 M12 … M15. **Bản web giống hệt v4.0:** không key cũ nào đổi chữ, không token cũ nào đổi giá trị, không đổi bố cục, không màn hình mới. Thứ tự card Settings không đổi. Làm đủ 12 mục của M12-T7:
  - **(1) Biến thể native + kiểm kê** — 7.8.1: bảng 16 dòng "chuỗi web → xử lý trên native" (UpdateToast, `settings.reminders.ios`/`limit`/`ics`, quyền thông báo, Language, Backup banner/Export/toast, Storage, About, S9, link ngoài app, chuỗi đăng nhập) với **điều kiện đọc từ `capabilities`**; 15 key (`en` + `vi`), M12; S7 (tiếp) bảng "Settings trên native — từng card" (M12 … M14 và M15); §3.1, §3.3 (hàng M12 … M15); nguyên tắc 7, 8 (§1).
  - **(2) Nút Sign in with Apple** — §5 mục "Nút Sign in with Apple" (HIG: đen/trắng theo theme, nhãn duy nhất, ≥ 44 pt, **Apple trên Google**, cùng cỡ), component `AppleSignInButton` + `SignInButtons` (Account card A1/A10, `LoginPromptBanner`, `ExportSignInHint`), F16, S7 (tiếp) card Account iOS (A1 … A10), ghi chú "Hide My Email" (A-60) `settings.account.hideEmailNote`; token `--apple-bg/-text`; 8 key, M14 (7.8.2).
  - **(3) Delete account + D6** — F17, S7 (tiếp): khối Delete account (bật / vô hiệu offline / vô hiệu hết phiên), **D6** (mặc định Remove, focus `Cancel`, khối Apple, busy, 4 lỗi `ACCOUNT_DELETE_*` trong Alert, thành công), `AppleRevokePanel` với link `https://support.apple.com/102571`, 2 toast; component `DeleteAccountDialog`; 7.3 thêm 3 hàng quy tắc chọn key; 25 key, M14 (7.8.3).
  - **(4) Thông báo lên lịch trước + quyền iOS + `.ics`** — 7.8.4: copy `notification.nativeTitle/nativeBody` (tổng quát, không nêu tiến độ), 3 trạng thái quyền + hướng dẫn mở Cài đặt iOS khi bị chặn, `nativeSwitchDesc`, `nativeInfo`; **quyết định: ẩn card `.ics` khi `scheduledNotifications`** (còn ở M12 … M14 và web); F18, F19; 8 key, M15.
  - **(5) Icon, launch screen, status bar** — §5 "Native shell" 1–3 (icon 1024×1024 RGB **nền trắng** `#FFFFFF`, logo trong hộp 820 px; splash 2732×2732 sáng/tối, ô trắng ở bản tối; storyboard; status bar `Style.Light/Dark` theo theme), S10 (Launch screen), A-D66, A-D67.
  - **(6) Safe area** — §5 "Native shell" 4–6: 4 token `--safe-*` + bảng selector (nền, `main`, tab bar, toast, dialog, trang đầy màn, skip link), `viewport-fit=cover` chỉ native, bàn phím, hướng dọc, link ngoài app; §6 token mới; OQ-D25.
  - **(7) `support.html` + `privacy.html` en/vi** — 7.8.6 (nguyên văn, đánh dấu đoạn mới/đổi; 6 câu hỏi thường gặp; xoá tài khoản trong app; thông báo cục bộ; Sign in with Apple).
  - **(8) Hồ sơ App Store `en-US` + `vi`** — 7.8.7: name 17, subtitle 25/24, promotional text 143/155 … 159 ký tự (≤ 170), keywords 94/84 **byte** (≤ 100; đo bằng regex byte), description (≈ 1.600 / 1.800 ký tự), release notes, review notes (có "Delete account" và "không cần đăng nhập"), support/privacy URL; tên dự phòng.
  - **(9) 5 screenshot + dataset demo** — 7.8.8: bảng 5 ảnh (route, theme, trạng thái), quy cách 1320×2868, `--safe-top: 62px / --safe-bottom: 34px`; dataset 5 goal (gồm 1 không thời hạn, 1 sắp tới, 1 đã kết thúc), quy tắc entry xác định + giá trị kiểm; mockup `10-store-screenshots.html`.
  - **(10) 360 px + `vi`** — §3.6 (14 dòng rủi ro, D6 cao hơn màn hình → cuộn trong dialog + nút dính đáy + vùng an toàn); mockup `09-account.html` mục 7 … 11 và `08-settings.html` ở `Tiếng Việt`.
  - **(11) §8.3 a11y** — nút Apple (tên truy cập = chữ hiển thị, tương phản 21:1), Delete account vô hiệu kèm lý do hiện sẵn, D6 (focus `Cancel`, busy `aria-disabled` + Esc bị bỏ qua, Alert `role="alert"`, trả focus), panel không live, VoiceOver, Reduce Motion, `scroll-padding`.
  - **(12) Changelog** (mục này) + §9 (giao diện không phải màn hình: notification, share sheet, tên app), §10 A-D62 … A-D77, §11 OQ-D22 … OQ-D28.
  - **Mockup:** `09-account.html` (+ mục 7 … 11: Account iOS, nút Apple, banner/hint iOS, Delete account, **D6** mọi trạng thái, kết quả/panel), `08-settings.html` (chọn **Platform**: Web / iOS M12–M14 / iOS M15, biến thể native từng card, sơ đồ safe area), **`10-store-screenshots.html` mới**, `index.html` (liên kết). Figma: chưa cập nhật (orchestrator làm sau).
  - **Tổng hợp 57 key mới cho developer** (đủ `en` và `vi`; `_one/_other` không có): **M12 (15)** `settings.language.nativeNote`, `settings.permission.nativeUnsupportedDesc`, `settings.backup.shareHint`, `backup.banner.neverNative`, `errors.EXPORT_FAILED_native`, `toast.icsShared`, `settings.storage.nativeLabel`, `settings.storage.nativeChip`, `settings.storage.nativeDesc`, `settings.about.descNative`, `storageError.bodyNative`, `storageError.step1Native`, `storageError.step2Native`, `storageError.step3Native`, `a11y.opensExternal`. **M14 (33)** `auth.signInApple`, `settings.account.descSignedOutIos`, `settings.account.privacyNoteIos`, `settings.account.hideEmailNote`, `settings.account.providerApple`, `settings.account.providerBoth`, `errors.AUTH_FAILED_native`, `exportHint.textNative`, `settings.account.delete`, `settings.account.deleteDesc`, `settings.account.deleteOffline`, `settings.account.deleteExpired`, `auth.delete.title`, `auth.delete.body`, `auth.delete.account`, `auth.delete.appleNote`, `auth.delete.legend`, `auth.delete.remove`, `auth.delete.removeDesc`, `auth.delete.keep`, `auth.delete.keepDesc`, `auth.delete.confirm`, `auth.delete.working`, `auth.delete.workingStatus`, `auth.delete.revokeTitle`, `auth.delete.revokeBody`, `auth.delete.revokeLink`, `errors.ACCOUNT_DELETE_OFFLINE`, `errors.ACCOUNT_DELETE_CANCELLED`, `errors.ACCOUNT_DELETE_FAILED`, `errors.ACCOUNT_DELETE_SESSION_EXPIRED`, `toast.accountDeletedKept`, `toast.accountDeletedRemoved`. **M15 (9)** `notification.nativeTitle`, `notification.nativeBody`, `settings.reminders.nativeSwitchDesc`, `settings.reminders.nativeInfo`, `settings.permission.nativeDefaultDesc`, `settings.permission.nativeGrantedDesc`, `settings.permission.nativeDeniedDesc`, `settings.permission.nativeDefaultOnDesc`, `settings.about.supportLink`. **0 key sửa chữ, 0 key bỏ.** 6 token mới. Hồ sơ App Store, `support.html`, `privacy.html` không phải key i18n (tệp tĩnh / metadata).
  - Assumptions A-D62 … A-D77; Open questions OQ-D22 … OQ-D28. Không phát hiện luồng PRD thiếu cho FR-58 … FR-65.
