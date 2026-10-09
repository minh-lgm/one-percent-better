---
name: team-conventions
description: "Quy ước chung của đội agent xây app (planner, designer, developer, qc): cấu trúc thư mục docs/, quyền ghi file, ID, severity, guardrail an toàn, format báo cáo. Load khi làm việc trong pipeline /build-app."
user-invocable: false
---

# Quy ước chung của đội agent xây app

Mọi agent trong đội (planner, designer, developer, qc) và orchestrator đều tuân theo file này.

## 1. Nguyên tắc cốt lõi

- **File trên đĩa là hợp đồng.** Mỗi agent chạy trong context riêng, không thấy hội thoại của agent khác. Thứ gì không nằm trong `docs/` hoặc trong code thì coi như không tồn tại.
- **Đọc trước, làm sau.** Luôn đọc các file đầu vào được giao trước khi viết bất cứ thứ gì.
- **Không đoán các quyết định khó đảo ngược.** Thiếu thông tin về scope, stack, dữ liệu, bảo mật thì ghi vào mục `Open questions` và trả về cho orchestrator. Quyết định nhỏ, dễ sửa thì tự chốt và ghi vào `Assumptions`.
- **Báo cáo trung thực.** Chưa chạy được thì ghi là chưa chạy. Không ghi PASS/DONE cho thứ chưa kiểm chứng.

## 2. Cấu trúc thư mục và quyền ghi

```text
docs/
├── STATUS.md                  # orchestrator
├── plan/
│   ├── PRD.md                 # planner
│   ├── ARCHITECTURE.md        # planner
│   └── TASKS.md               # planner
├── design/
│   ├── DESIGN.md              # designer
│   └── mockups/               # designer
├── handoff/
│   └── dev-M<n>.md            # developer
└── qc/
    └── report-M<n>-r<k>.md    # qc  (report-final.md cho vòng cuối)
```

| Đối tượng | Người ghi | Người khác |
| :- | :- | :- |
| `docs/STATUS.md` | orchestrator | chỉ đọc |
| `docs/plan/**` | planner | chỉ đọc |
| `docs/design/**` | designer | chỉ đọc |
| Source code, unit test, config, `README.md` | developer | chỉ đọc |
| `docs/handoff/**` | developer | chỉ đọc |
| `docs/qc/**`, `tests/qc/**` | qc | chỉ đọc |

Thấy file của agent khác sai thì **không tự sửa**: ghi lại vấn đề trong output của mình và báo orchestrator.

## 3. ID và trạng thái

- Milestone: `M1`, `M2`, …
- Task: `M1-T1`, `M1-T2`, …
- Acceptance criterion: `M1-AC1`, `M1-AC2`, …
- Defect: `M1-D1`, `M1-D2`, … (đánh số tiếp qua các vòng QC, không reset)
- Trạng thái task: `TODO` / `DOING` / `DONE` / `BLOCKED`
- Kết quả AC: `PASS` / `FAIL` / `BLOCKED` / `NOT VERIFIED`

## 4. Mức độ defect

| Severity | Định nghĩa | Chặn milestone |
| :- | :- | :- |
| Critical | App không build/không chạy, mất hoặc hỏng dữ liệu, lỗ hổng bảo mật, AC chính không đạt | Có |
| Major | Một AC không đạt, lỗi ở luồng chính có workaround, hướng dẫn chạy sai | Có |
| Minor | Lỗi hiển thị, copy, edge case hiếm, cải thiện chất lượng code | Không (đưa vào backlog) |

## 5. Ngôn ngữ

- Tài liệu trong `docs/`: tiếng Việt, thuật ngữ kỹ thuật giữ tiếng Anh.
- Code, tên biến, comment, commit message, nội dung UI mặc định: tiếng Anh, trừ khi PRD yêu cầu khác.

## 6. Mặc định kỹ thuật

- Kiến trúc modular, tách rõ 4 lớp: **config** / **logic (domain, service)** / **data layer** / **integration layer** (API ngoài, SDK, queue). Lớp logic không gọi thẳng API ngoài hay DB driver.
- Config qua biến môi trường, có `.env.example`; không hardcode secret, không commit `.env`.
- Validate input ở biên hệ thống; lỗi có message rõ ràng, không nuốt exception.
- Mỗi task có test đi kèm; lệnh build, lint, test phải chạy được bằng một lệnh ghi trong `README.md`.
- Chọn công nghệ phổ biến, ổn định; pin version dependency.

## 7. Guardrail an toàn

- Chỉ làm việc trong thư mục project. Không sửa file ngoài project, không cài package global.
- Không `git push`, không deploy, không gọi API production, không chạy lệnh xoá hàng loạt (`rm -rf`, `git reset --hard`, `git clean -fd`, drop database).
- Không đọc, không in ra nội dung `.env` hay file chứa secret. Cần secret thì dùng placeholder và ghi vào `Open questions`.
- Git: chỉ commit local, theo Conventional Commits (`feat(M1): ...`, `fix(M1): ...`, `test(M1): ...`).

## 8. Format câu trả lời cuối của mỗi agent

Trả về cho orchestrator tối đa khoảng 15 dòng, không dán lại nội dung file:

```text
STATUS: DONE | BLOCKED | NEEDS_INPUT
FILES: <danh sách file đã tạo/sửa>
SUMMARY: <2–4 dòng kết quả chính>
OPEN QUESTIONS: <câu hỏi cần user trả lời, hoặc "none">
RISKS: <rủi ro đáng chú ý, hoặc "none">
```

QC thêm một dòng `VERDICT: PASS | FAIL` ngay sau `STATUS`.
