# Build status — 1% better per day

**Yêu cầu gốc:** App tracking hoạt động. User đặt mục tiêu, sau đó ghi nhận lại thời gian thực hiện mỗi ngày để xem được quá trình phấn đấu nỗ lực của bản thân nhằm đạt mục tiêu, hoặc nhìn lại trong năm.
**Bắt đầu:** 2026-10-09   **Cập nhật:** 2026-10-09 (developer M1 DONE; chờ user đổi tên thư mục rồi QC)
**Next step:** user đổi tên thư mục thành `one-percent-better` → mở session mới → `/build-app resume` → qc M1 round 1 (report docs/qc/report-M1-r1.md)

## Quyết định của user
- 2026-10-09 — Nền tảng? → Web app (PWA, mở được trên điện thoại)
- 2026-10-09 — Stack? → Để planner chọn
- 2026-10-09 — Dữ liệu/tài khoản MVP? → 1 user, lưu cục bộ trên thiết bị, không đăng nhập, có export/import JSON
- 2026-10-09 — Gate 1: duyệt plan? → Duyệt, giữ giả định mặc định OQ-01..05 (nhắc chỉ khi app mở + .ics; không deploy; curve khắt khe để sau; UI tiếng Anh; không chỉ tiêu tuần)
- 2026-10-09 — Gate 2: có duyệt design không? → Có, trình design trước khi code
- 2026-10-09 — Gate 2: duyệt design? → Chưa, user muốn tự review Figma trước; đồng thời yêu cầu thêm ngôn ngữ tiếng Việt (đổi giả định OQ-04: UI song ngữ vi/en, mặc định theo ngôn ngữ trình duyệt, đổi trong Settings)
- 2026-10-09 — Gate 2 (lần 2): duyệt design song ngữ? → Duyệt, bắt đầu build M1
- 2026-10-09 — Thư mục `1%better` làm npx lỗi "URI malformed"? → User chọn đổi tên nhưng chưa làm; 2026-10-10 user nói "triển khai tiếp", orchestrator tạm tạo `subst Z:` nhưng user yêu cầu bỏ; đã gỡ Z:. Chốt: đổi tên thư mục thành `one-percent-better`.
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
| M1 | DOING — dev DONE (commit 4932647), chờ QC round 1 | docs/handoff/dev-M1.md | Dev tự kiểm: lint/typecheck/Vitest 128/build/Playwright 20 xanh trên bản sao sạch; AC10/AC11 phần thủ công NOT VERIFIED |
| M2 | TODO | | |
| M3 | TODO | | |
| M4 | TODO | | |
| M5 | TODO | | |
| Final QC | TODO | | |

## Backlog (defect Minor, đề xuất chưa làm)
| ID | Mô tả | Nguồn |
| :- | :- | :- |
