# Đội AI agent xây app cho Claude Code

Bốn subagent (planner, designer, developer, qc) và một lệnh điều phối `/build-app`, chạy trong một session Claude Code.

## 1. Kiến trúc

```text
User ── /build-app "<ý tưởng>"
          │
          ▼
   Orchestrator (session chính, skill build-app)
          │  hỏi làm rõ, giữ cổng duyệt, ghi docs/STATUS.md
          │
          ├─► planner ───► docs/plan/{PRD, ARCHITECTURE, TASKS}.md
          │                    └── Gate 1: user duyệt plan
          ├─► designer ──► docs/design/DESIGN.md + mockups/
          │                    └── Gate 2: user duyệt design
          │
          │   lặp cho từng milestone M1..Mn
          ├─► developer ─► code + test + docs/handoff/dev-M<n>.md
          ├─► qc ────────► docs/qc/report-M<n>-r<k>.md  (PASS | FAIL)
          │        FAIL ─► developer (fix) ─► qc …  tối đa 3 vòng
          │
          └─► qc (final) ► docs/qc/report-final.md ─► tổng kết
```

**Data flow.** Các agent không nói chuyện trực tiếp với nhau. Mỗi agent chạy trong context riêng, đọc file của agent đứng trước trong `docs/`, ghi file của mình, rồi trả một bản tóm tắt ngắn cho orchestrator. `docs/` là hợp đồng giữa các agent và cũng là thứ cho phép `/build-app resume` sau khi tắt máy.

## 2. Thành phần

| File | Vai trò | Model | Tool | Ghi vào |
| :- | :- | :- | :- | :- |
| `.claude/agents/planner.md` | PRD, kiến trúc, milestone + AC | `opus` | Read, Write, Edit, Glob, Grep, Web | `docs/plan/` |
| `.claude/agents/designer.md` | Flow, màn hình, token, copy, mockup HTML | `sonnet` | Read, Write, Edit, Glob, Grep | `docs/design/` |
| `.claude/agents/developer.md` | Code, unit test, handoff, fix defect | `inherit` | Read, Write, Edit, Bash, Glob, Grep, Web | source, `docs/handoff/` |
| `.claude/agents/qc.md` | Kiểm AC, test khám phá, bảo mật, verdict | `sonnet` | Read, Write, Bash, Glob, Grep | `docs/qc/`, `tests/qc/` |
| `.claude/skills/build-app/SKILL.md` | Orchestrator: pipeline, gate, vòng fix | session chính | | `docs/STATUS.md` |
| `.claude/skills/team-conventions/SKILL.md` | Quy ước chung, nạp sẵn vào cả 4 agent | | | |

## 3. Cài đặt

1. Giải nén vào thư mục gốc của repo app (thư mục `.claude/` phải nằm ngay dưới gốc repo):

   ```powershell
   Expand-Archive app-agent-team.zip -DestinationPath D:\duong-dan\toi\repo
   ```

   Nếu repo đã có `.claude/agents` hoặc `.claude/skills`, các file mới nằm cạnh file cũ; chỉ trùng khi đã có agent tên `planner`, `designer`, `developer`, `qc` hoặc skill tên `build-app`, `team-conventions`.
2. Mở lại Claude Code trong repo đó (session đang chạy không nhận thư mục `agents` vừa tạo).
3. Kiểm tra: gõ `@` rồi tìm `planner`, `designer`, `developer`, `qc` trong danh sách gợi ý; gõ `/build-app` thấy lệnh xuất hiện.

Muốn dùng cho mọi project thì chép hai thư mục `agents` và `skills` vào `~/.claude/` thay vì repo.

## 4. Sử dụng

```text
/build-app app quản lý chi tiêu cá nhân, web, nhập tay giao dịch, báo cáo theo tháng
/build-app status
/build-app resume
```

Gọi riêng một agent khi không cần cả pipeline:

```text
@agent-qc scope: milestone M2, round: 1
@agent-planner mode: revise — bỏ tính năng export PDF khỏi MVP
```

## 5. Tuỳ chỉnh

| Muốn đổi | Sửa ở đâu |
| :- | :- |
| Model từng agent | field `model` trong frontmatter (`opus`, `sonnet`, `haiku`, `inherit`, hoặc model ID đầy đủ) |
| Số vòng fix tối đa | "3 vòng" trong `build-app/SKILL.md`, Bước 3 |
| Bỏ cổng duyệt design | nói ngay trong lệnh: `/build-app … (không cần duyệt design)` |
| Stack mặc định, kiến trúc, quy tắc commit | `team-conventions/SKILL.md`, mục 6 và 7 |
| Format tài liệu | khối "Format" trong file agent tương ứng |

## 6. Quyền hạn nên cấu hình

Guardrail trong prompt chỉ là chỉ dẫn. Để chặn cứng, thêm vào `.claude/settings.json` của repo:

```json
{
  "permissions": {
    "deny": [
      "Bash(git push *)",
      "Bash(rm -rf *)",
      "Bash(git reset --hard *)",
      "Read(./.env)",
      "Read(./.env.*)"
    ]
  }
}
```

Rule `deny` áp dụng cho cả session chính lẫn subagent.

## 7. Trade-off đã chọn

| Quyết định | Được | Mất |
| :- | :- | :- |
| Orchestrator là session chính (skill), không phải subagent | Hỏi được user ở các gate; subagent không hỏi được | Context session chính dài dần theo số milestone |
| Giao tiếp qua file trong `docs/` | Resume được, audit được, agent không phụ thuộc context nhau | Tốn token đọc lại file mỗi lần gọi |
| Developer chạy tuần tự, một milestone một lần | Không conflict file, QC kiểm trên trạng thái ổn định | Chậm hơn chạy song song |
| QC không được sửa code, mỗi vòng là instance mới | Góc nhìn độc lập, không tự chấm bài mình | Mỗi vòng fix tốn thêm 2 lượt agent |
| Planner dùng `opus` | Plan và AC chất lượng hơn, sai ở đây đắt nhất | Tốn quota hơn |

## 8. Giới hạn và rủi ro

- **Chi phí.** Mỗi agent có context riêng nên một lần build tốn nhiều token hơn làm trong một session. Ước tính MVP 4 milestone cần khoảng 10–20 lượt agent (plan, design, 4 cặp developer–qc, các vòng fix, final QC).
- **QC giao diện.** QC chỉ kiểm được phần hiển thị khi project có công cụ trình duyệt (ví dụ Playwright). Không có thì report ghi `NOT VERIFIED` và anh cần tự xem.
- **Quyền ghi theo vai trò** (QC không sửa source, developer không sửa plan) được giữ bằng prompt, không phải bằng cơ chế chặn. Muốn chặn cứng cần thêm hook `PreToolUse` kiểm tra đường dẫn.
- **Chất lượng phụ thuộc vào AC.** AC mơ hồ thì QC cho qua thứ không dùng được. Gate 1 là chỗ đáng bỏ thời gian đọc nhất.

## 9. Kiểm chứng trước khi dùng cho việc thật

1. Chạy thử với một app nhỏ 2–3 milestone (ví dụ CLI ghi chú hoặc API todo) để xem cả vòng plan → QC.
2. Đo: số vòng fix trung bình mỗi milestone (gợi ý: ≤ 1.5), số defect QC bắt được so với lỗi anh tự tìm ra sau đó, token mỗi milestone (`/cost` hoặc `/usage`).
3. Nếu QC để lọt lỗi: siết phần "Cách kiểm chứng" của AC trong prompt planner. Nếu vòng fix nhiều: chia milestone nhỏ hơn.

## 10. Hướng mở rộng

- Chạy song song nhiều developer trên các task độc lập bằng `isolation: worktree` trong frontmatter, khi plan đánh dấu rõ task nào không đụng file của nhau.
- Thêm `memory: project` cho developer và qc để tích luỹ kinh nghiệm về codebase qua các session.
- Thêm agent `reviewer` (code review, read-only) chạy giữa developer và qc.
