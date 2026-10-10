# Build status — 1% better per day

**Yêu cầu gốc:** App tracking hoạt động. User đặt mục tiêu, sau đó ghi nhận lại thời gian thực hiện mỗi ngày để xem được quá trình phấn đấu nỗ lực của bản thân nhằm đạt mục tiêu, hoặc nhìn lại trong năm.
**Bắt đầu:** 2026-10-09   **Cập nhật:** 2026-10-09 2026-10-10 (thư mục đã đổi tên thành one-percent-better; Final QC PASS r2 — HOÀN TẤT)
**Next step:** DONE — pipeline hoàn tất 2026-10-10. Còn lại: user tự kiểm các mục NOT VERIFIED (docs/qc/report-final-r2.md §8), quyết định push/deploy, backlog Minor (§9)

## Quyết định của user
- 2026-10-09 — Nền tảng? → Web app (PWA, mở được trên điện thoại)
- 2026-10-09 — Stack? → Để planner chọn
- 2026-10-09 — Dữ liệu/tài khoản MVP? → 1 user, lưu cục bộ trên thiết bị, không đăng nhập, có export/import JSON
- 2026-10-09 — Gate 1: duyệt plan? → Duyệt, giữ giả định mặc định OQ-01..05 (nhắc chỉ khi app mở + .ics; không deploy; curve khắt khe để sau; UI tiếng Anh; không chỉ tiêu tuần)
- 2026-10-09 — Gate 2: có duyệt design không? → Có, trình design trước khi code
- 2026-10-09 — Gate 2: duyệt design? → Chưa, user muốn tự review Figma trước; đồng thời yêu cầu thêm ngôn ngữ tiếng Việt (đổi giả định OQ-04: UI song ngữ vi/en, mặc định theo ngôn ngữ trình duyệt, đổi trong Settings)
- 2026-10-09 — Gate 2 (lần 2): duyệt design song ngữ? → Duyệt, bắt đầu build M1
- 2026-10-09 — Thư mục `1%better` làm npx lỗi "URI malformed"? → User chọn đổi tên nhưng chưa làm; 2026-10-10 user nói "triển khai tiếp", orchestrator tạm tạo `subst Z:` nhưng user yêu cầu bỏ; đã gỡ Z:. Chốt: đổi tên thư mục thành `one-percent-better` — đã đổi 2026-10-10, npx chạy bình thường.
- 2026-10-10 — (orchestrator, QC M4 OQ1) SW precache sẵn chunk Recharts/Review (~101 kB) sau khi cài, dù trang chưa vào Review → chấp nhận: NFR-03 nói về tải trang ban đầu, precache phục vụ offline-first; planner ghi nhận ở lần revise sau
- 2026-10-09 — Phạm vi MVP? → (1) Goals + nhập phút mỗi ngày + heatmap năm + streak, (2) Timer đếm giờ trong app, (3) Biểu đồ đường cong 1% so với thực tế, (4) Nhắc nhở hằng ngày (notification)

## Tham chiếu
- Figma: https://www.figma.com/design/DrO15cZxPcb9hp1lGSUddd (team "Minh Lgm's team"); page "Mobile 360" = màn hình, page "Components" = component sets

## Môi trường
- Windows 11, Git Bash / PowerShell
- Node v22.14.0, npm 10.9.2, pnpm 9.15.4, Python 3.14.6
- Greenfield, git init 2026-10-09

## Tiến độ
| Bước | Trạng thái | Output | Ghi chú |
| :- | :- | :- | :- |
| Intake | DONE | docs/STATUS.md | |
| Plan | DONE v1.2 (duyệt 2026-10-09; revise song ngữ en/vi) | docs/plan/PRD.md, ARCHITECTURE.md, TASKS.md | 5 milestone, 34 task, 59 AC; lần gọi planner đầu bị ngắt, lần 2 hoàn tất |
| Design | DONE v1.1 (song ngữ, card Language) (duyệt 2026-10-09) | docs/design/DESIGN.md, docs/design/mockups/*.html | Figma: https://www.figma.com/design/DrO15cZxPcb9hp1lGSUddd (orchestrator đẩy từ mockup; 8 màn mobile 360 + 3 dialog + Dark mode + Today tiếng Việt + card Language, variables Light/Dark, components Button/Badge/PlusPill/TabBar) |
| M1 | PASS (round 2) | docs/qc/report-M1-r2.md | AC10/AC11 phần thủ công NOT VERIFIED (user tự kiểm, mục 8 report) | Dev tự kiểm: lint/typecheck/Vitest 128/build/Playwright 20 xanh trên bản sao sạch; AC10/AC11 phần thủ công NOT VERIFIED |
| M2 | PASS (round 3) | docs/qc/report-M2-r3.md | AC8/9/11 phần thủ công NOT VERIFIED (notification thật, import .ics, popup quyền) | AC8/9/11 phần thủ công NOT VERIFIED |
| M3 | PASS (round 1) | docs/qc/report-M3-r1.md | 4 Minor → backlog; dispute test QC đã re-target; dialog file thật NOT VERIFIED |
| M4 | PASS (round 2) | docs/qc/report-M4-r2.md | Firefox/Safari/iOS, screen reader, bản dịch vi NOT VERIFIED | bundle 218,8 kB gzip; Recharts lazy |
| M5 | PASS (round 2) | docs/qc/report-M5-r2.md | AC9 Firefox/Safari/iOS, screen reader NOT VERIFIED | Dispute M3-D3: orchestrator chọn giữ fix, QC re-target tests/qc/m3-r1.spec.ts:638 |
| Final QC | PASS (round 2) | docs/qc/report-final-r2.md | r1 FAIL F-D1 (Vitest cache lạnh) → fix 5a73e18 → r2 PASS trên 2 clone sạch |

## Backlog (defect Minor, đề xuất chưa làm)
| ID | Mô tả | Nguồn |
| :- | :- | :- |
| M1-P1 | (FIXED trong M5; plan v1.3: gộp vào M5-T4/AC13) Today sort tie-break theo id | QC r1 §9 |
| M1-P2 | (→ plan v1.3: M3-T7/AC14) getById cho EntryRepository | dev handoff M1, QC r1 §9 |
| M2-P1 | (→ plan v1.3: M3-T7/AC15) TimerService.save nguyên tử | dev handoff M2, QC r3 |
| M2-P2 | (FIXED trong M5; plan v1.3: M5-T6/AC13) aria-describedby Reminder time; goal.delete.timerNote; pendingTimer lưu lại khi tab khác xoá timer | QC r3 |
| M3-D1 | (FIXED trong M4, commit 786a82f) CSS `content` ngoặc kép quanh why ở Goal detail hỏng mã hoá (app.css ~1125) — hiện ô vuông + C/D | QC M3 r1 |
| M3-D2 | (FIXED trong M4, commit 786a82f) Số ≥ 1000 trong dialog D3 và toast import thiếu dấu phân cách hàng nghìn | QC M3 r1 |
| M3-D3 | (FIXED trong M5) Import chấp nhận goal targetMinutes 600000, khoảng 100 năm, entry tương lai (app từ chối khi tạo tay) | QC M3 r1 |
| M3-D4 | (FIXED trong M5) Tab thua cuộc đua Save hai tab: dialog Stop còn mở, tóm tắt thiếu tên goal | QC M3 r1 |
| M3-P1 | `exportBackup` thiếu catch; thêm assertion E2E cho dòng why | QC M3 r1 |
| M4-D5 | Vitest chạy 2 process song song có test chạm timeout 5 s (Review/Day/Heatmap 2–3 s); chạy tuần tự ổn định | QC M4 r2 |
| M4-P1 | DESIGN §6 nói heatmap vừa ở ≥1024 px nhưng 1024–1191 px vẫn cuộn trong hộp (sidebar 232 px) — designer sửa câu chữ; nhãn giá trị trên cột chart chưa có | QC M4 r1/r2 |
| M5-P1 | Trục Y curve hiện `+0.0%` (mockup `+0%`); focusHeading dùng requestAnimationFrame; lỗi import vượt giới hạn dùng chung IMPORT_INVALID_SCHEMA (nên có câu riêng) | QC M5 r1/r2 |
| M1-P3 | docs/handoff/dev-M1.md dòng 56 còn nhắc thư mục cũ `1%better` (lịch sử) | QC r2 |

## Tổng kết (2026-10-10)
- 5 milestone + Final QC đều PASS. Unit 686, e2e 347, bundle 214,9 kB gzip (≤ 250). Chạy: `npm ci && npm run e2e:install && npm run check && npm run test:e2e`; dùng: `npm run build && npm run preview` → http://localhost:4173.
- Chưa push, chưa deploy (user quyết định). NOT VERIFIED: docs/qc/report-final-r2.md §8. Backlog Minor: §9 + bảng Backlog ở trên.

## Ghi chú vận hành
- 2026-10-10 — Write tool của subagent `qc` bị harness từ chối ghi file report ("Subagents should return findings as text"). Orchestrator chép nguyên văn text QC trả về vào docs/qc/report-M1-r1.md, có ghi chú đầu file. Áp dụng tương tự cho các report sau nếu còn bị chặn.
