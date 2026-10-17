# QC report — M9 round 1

**Verdict:** PASS
**Ngày:** 2026-10-17  **Commit:** 6f9c748 (dev M9 = 66ead74); working tree còn các thay đổi chưa commit của QC trong `tests/qc/**` (mục 3A) và một thay đổi `tsconfig.app.json` (mục 3A, ghi chú)

## 1. Tóm tắt

- Mọi AC M9-AC1…AC8 đạt, có bằng chứng tự chạy. Không có defect Critical hay Major. 1 defect Minor mở (M9-D1, tương tác bàn phím + chuột ở 360 px `vi`), đã có test `test.fail` giữ chỗ.
- Re-target xong 5 file test QC dùng định nghĩa 1,01^n (mục 3A). `m5-r1-domain.test.ts` viết lại với oracle độc lập: phân số chính xác (BigInt), nhân dồn từng ngày, không dùng code của app; 51 test xanh.
- `npm run check` exit 0 ba lần (109 file / 1216 test, lint 0, typecheck, build). Playwright đầy đủ (chromium + cloud, 8 workers): 589/589, 589/589, 590/590 (lần 3 có thêm test M9-D1; 2 test `test.fail` đang kỳ vọng fail: M8-D1 cũ và M9-D1 mới).
- Công thức v3 đúng oracle: R1 5→10→14→27 = +440,0 %, S1 G1 = 0, R3 = −40,0 %, R4 = +143.900,0 % / −99,9 %, ngày 0 phút đi ngang, hôm nay ghi dở tính ngay (A-39), làm tròn nửa xa 0, không có −0, 40 bộ dữ liệu ngẫu nhiên khớp oracle.
- Rủi ro đáng chú ý: tải lạnh Today **248,3 kB / 250 kB** (cloud off), 248,4 kB (cloud on): chỉ còn 1,6 kB, không chặn nhưng sát ngưỡng (xem mục 9).

## 2. Môi trường và lệnh đã chạy

Windows 11, Node v22.14.0, npm 10.9.2, Chromium của Playwright (`PLAYWRIGHT_BROWSERS_PATH=0`), không Docker. Không đọc `.env.local`; e2e dùng `--mode e2e` (cloud off) và mock Supabase (cloud).

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Re-target domain | `npx vitest run tests/qc/m5-r1-domain.test.ts tests/qc/m9-r1-copy.test.ts` | 2 file, 83 test pass (51 + 32) |
| Type-check với file QC đã re-target | `npx tsc --noEmit -p tsconfig.app.json` (working copy không còn dòng exclude) | exit 0 |
| Check lần 1 | `npm run check` | lần đầu đỏ ở lint do chính file QC `m9-r1-copy.test.ts:105` có ký tự khoảng trắng bất thường (`no-irregular-whitespace`); QC sửa file của mình (dùng `String.fromCharCode`); chạy lại: exit 0, 109 file, 1216 test |
| Check lần 2 | `npm run check` | exit 0, 109 file, 1216 test, build OK |
| Check lần 3 (sau khi thêm test M9-D1) | `npm run check` | exit 0, 109 file, 1216 test |
| Playwright lần 1 | `npm run test:e2e` | 589 passed (8,9 phút) |
| Playwright lần 2 | `npm run test:e2e` | 589 passed (8,9 phút) |
| Playwright lần 3 | `npm run test:e2e` | 590 passed (9,6 phút); 2 test `test.fail` đúng kỳ vọng (M8-D1, M9-D1) |
| Bench | `npm run bench` (4 lần) | 10/10 pass; in-memory (số được assert) median 15,6–18,0 ms < 200 ms; fake-indexeddb 160–177 ms (chỉ thông tin; dev đo 58 ms, máy hiện chậm hơn, các milestone trước 80–136 ms); pure review model 25–30 ms |
| Coverage | `npx vitest run src/domain --coverage` | 177 test pass; All files 99 % lines; `curve.ts` 100 % lines (98,7 % stmts, 94,82 % branch) ≥ 90 % |
| Bundle | `tests/qc/final-nfr.spec.ts`, `final2-cloudoff-nfr.spec.ts` | cloud OFF: JS 240,7 kB, mọi text asset 248,3 kB; cloud ON: 248,4 kB; ≤ 250 kB; Today không tải Recharts hay SDK |
| Audit | `npm audit`, `npm audit --omit=dev` | 0 vulnerabilities |
| Secret | `git ls-files` + grep diff 7cc51be..HEAD | chỉ `.env.example`, `.env.e2e`, `.env.cloud-e2e` (cấu hình mock, có từ trước); `.env.local` bị ignore; diff M9 không có chuỗi giống secret |
| Soát giao diện thủ công | script Playwright chụp R1 (en 1440, vi 360, dark 360, Whole 1440), R3 (en 360), R4 (en 360); đối chiếu mockup `07-goal-detail.html` R3/R1 | bố cục và vị trí nhãn khớp mockup; số/chuỗi khớp DESIGN |

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng (QC tự chạy) |
| :- | :- | :- |
| M9-AC1 | PASS | `tests/qc/m5-r1-domain.test.ts` ("R1 …", "A-39"): R1 `percent [0,100,180,440]`, `changePercent [null,100,40,92.9]`, headline 440, `periodDays` 83, `latestChangePercent` 92.9, `idealPercent` 4.1; đổi `targetMinutes`/`targetType` → `toEqual` (A-42); today 10-14 không ghi → điểm `{0, false, 5.4, 440, null}`; 3 phút ngày 10-14 → headline −40, change −88.9, latest/previous đúng; entry 20+7 = như 27 (oracle so từng điểm với phân số chính xác). Cộng `src/domain/curve.test.ts` của dev (22 test) xanh |
| M9-AC2 | PASS | `m5-r1-domain.test.ts`: S1 G1 9 điểm `value` mọi ngày 1, change `[null,0×7,null]`, `Object.is(headline,0)`, ideal 31 điểm, k=9 → 1,0937; một ngày; 365 ngày 30 phút = 0 (M5 là 3678,3); năm nhuận 366 ngày có 02-29; upcoming/ended/archived; entry ngoài khoảng bị bỏ; cùng ngày nhiều entry cộng; 1826 ngày; 40 bộ ngẫu nhiên (đến 700 ngày, 45 % ngày không ghi, nhiều entry/ngày, 4 mốc today kể cả 2028-02-29); `pct` so oracle phân số cho mọi a,b ∈ 1..160 và 30.000 cặp ngẫu nhiên ≤ 1440 (17/16=6,3; 15/16=−6,3; 1440/1=143900; 1/1440=−99,9; 405/400=1,3; 395/400=−1,3; không −0). `tests/qc/m9-r1-copy.test.ts`: `curveYDomain` R1 so far, G2 so far `yMin ≤ −50`, G1 whole, toàn 0, rỗng, 300 ngẫu nhiên (miền luôn chứa mọi giá trị và 0, hữu hạn, không suy biến), cực trị 7,9e7 |
| M9-AC3 | PASS | Dev `CurveChart.test.tsx` xanh; QC e2e `m9-r1-explore.spec.ts`: R4 và `+5.759.900,0 %` ở 360 px en+vi: nhãn trục ≤ 8 ký tự, không cuộn ngang, axe sạch; nhãn trực tiếp không đè nhau (R1 Whole/So far, R3, S1) ở 360 px; chấm ≤ 45 điểm có, ≥ 46 không; Range đổi miền Y. Quan sát thực tế: R1 tick `0%…+500%`, vạch 0 % liền, "You" bậc thang; R3 tick `−50%…+150%`; R4 `0%…+200K%`. Đọc `data-y-min/max` trực tiếp |
| M9-AC4 | PASS | Chụp thật R1 en 1440, clock 2026-10-13: headline `+440.0% better` màu `rgb(31,122,77)` (`--primary`); `Day 4 of 83`; `Today: 27 min, +92.9% vs Oct 12 (14 min). ×5.4 since Oct 10 (5 min).`; tóm tắt `Day 4 of 83: your line is +440.0% compared with your first logged day. The ideal line is +4.1%.`; Progress 2,2 % (56/2.490), Current streak 0 days, Pace `1 h 4 min behind`; 2 series, Range `Whole period`. S1 g1 `+0.0%`, g2 hàng 09-15 `−50.0%`, Progress 25,8 %, streak 8/8 qua `e2e/m5-goal-detail.spec.ts` + `m5-r1-curve.spec.ts` (31 hàng / 9 hàng, 5 cột khớp oracle) |
| M9-AC5 | PASS | `m9-r1-copy.test.ts` (32 test): 21 key `goal.detail.*`/`empty.detail.curve` (en và vi) bằng **nguyên văn** bảng DESIGN §7.6.4 (QC parse trực tiếp `DESIGN.md`), mọi dòng `goal.detail.*` còn lại khớp; 3 key bỏ (`headlineSub_one`, `headlineSub_other`, `tooltip`) không còn trong `en.json`, `vi.json`, `src/`, `e2e/`; placeholder en = vi; không có `+`/`-` cứng cạnh `{{`; formatter `signed1` (U+2212, −0 → `+0.0`), `factor`, `axisPercent` (compact ≤ 8 ký tự tới +79M%). Chụp vi 360: `Tốt hơn +440,0%`, `Hôm nay: 27 phút, +92,9% so với 12 thg 10 (14 phút). ×5,4 kể từ 10 thg 10 (5 phút).`. E2E `vi-VN` quét vi (`expectNoViLeaks`), axe, 360 px: pass trong `m9-curve.spec.ts` (dev) và `m9-r1-explore.spec.ts` (QC) |
| M9-AC6 | PASS | `m9-r1-explore.spec.ts`: xóa/sửa entry qua trang Day (xóa ngày đầu → baseline 10-11; xóa hôm nay → đi ngang; xóa hết → trạng thái rỗng); sửa hôm nay 27 → 3 = `−40.0%`, → 40 = `+700.0%`, → 5 = `+0.0%` (A-39); archived/ended/upcoming (upcoming chỉ Ideal dù có entry lạc); backup M1 cũ `sample-backup.json`: 5 goal S1 không NaN; dữ liệu > 1440 phút/ngày (A-25): 3000→2999 in `+0.0%` (không dấu âm), 2000→1999 in `−0.1%`. Headline âm R3 `−40.0% vs your first day` màu `rgb(29,35,32)` (`--text`, không đỏ), tick âm. Dark scheme: axe 0 serious/critical cho R1, R3, rỗng |
| M9-AC7 | PASS | `e2e/m5-journey.spec.ts`, `e2e/m5-i18n.spec.ts` (dev) và `tests/qc/final-journey.spec.ts`, `tests/qc/cloud/final2-journey.spec.ts` (QC re-target): sau timer 30 + ghi bù 30 → `+0.0% better` / `Tốt hơn +0,0%`, phụ đề chứa 30; Export/Import/offline/quét vi/axe giữ nguyên, pass 3/3 lần |
| M9-AC8 | PASS | `git diff --stat 7cc51be..HEAD`: không đụng `src/domain/stats.test.ts`, `src/domain/heatmap.test.ts`, test `Today*`, `e2e/m4-*`, `e2e/cloud/**`; `src/services/stats-service.test.ts` chỉ đổi `describe('StatsService.curve …')`; 3 spec M5 chỉ đổi assertion đường cong (QC đọc từng dòng diff). Check 3/3 và Playwright 3/3 xanh; bundle ≤ 250 kB; 0 request ngoài origin (`watch()` trong spec QC + `m9-curve`); axe R1 en/vi sạch |

### 3A. Re-target test QC cũ (không phải defect, TASKS "Test cũ bị thay thế")

| File | Việc đã làm |
| :- | :- |
| `tests/qc/m5-r1-domain.test.ts` | Viết lại oracle: tỉ số phút ngày có ghi trước, nhân dồn từ ngày đầu bằng phân số BigInt chính xác, ngày 0 phút đi ngang, hôm nay tính ngay, làm tròn nửa xa 0, chuẩn hoá −0; bỏ `p.n`/`daysOnTarget`; giữ ideal 1,01^k và test `plus-one`. 24 test cũ fail → 51 test xanh (thêm `pct` toàn bảng, R1/R3/R4, một ngày, năm nhuận, entry 0 phút, 1826 ngày, 40 bộ ngẫu nhiên) |
| `tests/qc/m5-r1-curve.spec.ts` | Headline G1/G3/G5 `+0.0%`; bảng 5 cột (phút, change); aria-label và chuỗi đọc bàn phím 4 biến thể; `curve-empty` → `headline-sub` `data-variant=empty`, `.recharts-line` 2 → 1 khi chưa có entry; `Day k of N` sang `headline-day`; vi `Bạn +0,0%`; oracle pixel y(0 %) |
| `tests/qc/m5-r1-flows.spec.ts` | Dòng 233 và 520: `+0.0% better` (G1/G3) |
| `tests/qc/final-journey.spec.ts` | 3 chỗ `2[.,]0%` → `+0[.,]0%` |
| `tests/qc/cloud/final2-journey.spec.ts` | `2[.,]0%` → `+0[.,]0%` |

Test QC mới: `tests/qc/m9-r1-copy.test.ts` (32 test), `tests/qc/m9-r1-explore.spec.ts` (15 test, gồm `test.fail` M9-D1).

Ghi chú `tsconfig.app.json`: working copy hiện **không còn** dòng exclude `tests/qc/m5-r1-domain.test.ts` (thay đổi chưa commit, không do các bước của lần chạy này; QC không sửa tsconfig). Với trạng thái đó `tsc -p tsconfig.app.json` exit 0 và `npm run check` xanh 3/3, nên file đã type-check sạch. **Đề xuất:** developer/orchestrator giữ thay đổi gỡ exclude này khi commit bản re-target.

## 4. Defect

### M9-D1 — Lần bấm chuột đầu vào "Xem dữ liệu dạng bảng" bị mất khi đang đọc biểu đồ bằng bàn phím (vi, 360 px)  [Minor]
- Bước tái hiện: build `--mode e2e`, `npm run preview`; ngôn ngữ Tiếng Việt, viewport 360 px, clock 2026-10-13; Settings → Nhập sao lưu `e2e/fixtures/r1-real-backup.json`; mở `#/goals/r1`; focus biểu đồ bằng Tab, bấm ← hai lần (dòng đọc: `12 thg 10 · 14 phút, +40,0% so với ngày có ghi trước · Bạn +180,0% so với ngày đầu · Lý tưởng +3,0%`, 3 dòng); bấm chuột vào "Xem dữ liệu dạng bảng".
- Mong đợi: bảng mở ngay (hành vi `<details>` bình thường).
- Thực tế: bảng không mở; phải bấm lần hai (đo: sau lần bấm 1 `curve-table` = 0 phần tử, sau lần 2 = 1). Cùng thao tác ở `en` 360 px (dòng đọc 2 dòng) và 1440 px mở được ở lần đầu. Nguyên nhân quan sát được: mousedown làm chart blur, dòng `aria-live` bị xoá nên bố cục nhảy lên trước mouseup. Dev đã nêu ở handoff §8; chuỗi đọc mới của DESIGN v3 dài hơn nên dễ gặp hơn M5.
- Vị trí nghi ngờ: `src/ui/components/CurveChart.tsx` (`onBlur={() => setReading(null)}`, dòng `curve-reading`), `src/ui/screens/GoalDetail.tsx` phần `<details>`.
- Test: `tests/qc/m9-r1-explore.spec.ts` "M9-D1 …" là `test.fail`; khi fix xong test báo "unexpected pass" thì QC đổi thành test thường.

## 5. Kiểm lại defect vòng trước

Không có (round 1). Backlog liên quan: M5-P1 ("trục Y curve hiện `+0.0%`, mockup `+0%`") nay là `0%` theo DESIGN v3, đã được thiết kế mới giải quyết.

## 6. Regression

- Toàn bộ test M1–M8 trong `e2e/**` và `tests/qc/**` (chromium + cloud) pass 3/3 lần, gồm hành trình `final-journey` / `final2-journey` en/vi 360/1440, `m5-r2`, `m5-r1-sweep`, `m4-r1-domain`.
- Review, stats, heatmap, "+1%" (Today), Progress/Pace/streak trên Goal detail không đổi (test cũ không sửa assertion; Progress 2,2 % / 25,8 % quan sát thực tế).
- Xóa mềm/sync (M7): xóa entry ở trang Day làm baseline/latest di chuyển đúng.
- Bundle: thêm chunk `dates-*.js` (date-fns) 9,5 kB, `schemas` nhỏ lại; tổng tải lạnh Today +1,0 kB so với M8 (247,3 → 248,3 kB).

## 7. Bảo mật

- `npm audit` 0 lỗ hổng (đủ và `--omit=dev`). `.env.local` bị ignore, không bị commit; diff M9 không chứa secret. M9 không thêm input ở biên hệ thống (chỉ đổi cách tính/hiển thị). Số liệu từ import/sync vượt 1440 phút/ngày không gây NaN/Infinity hay tràn (đã thử hệ số ×57.600).
- Không request ra ngoài origin khi mở Goal detail (kiểm trong spec QC).

## 8. Chưa kiểm chứng được (NOT VERIFIED)

Không AC nào của M9 ở trạng thái NOT VERIFIED. Các mục dưới đây không thuộc AC, giữ như các milestone trước:
- Trình đọc màn hình thật (NVDA/VoiceOver đọc dòng tooltip): chỉ kiểm ở mức DOM (`aria-live="polite"`, `aria-atomic`, `role="img"` + `aria-describedby`). User tự kiểm: focus biểu đồ, bấm ←/→, nghe dòng đọc.
- Firefox, Safari, iOS: chỉ Chromium. Nhãn trục compact `vi` (`+144 N%`) là kết quả `Intl` của Chromium 1248/Node 22; ICU khác có thể ra chuỗi khác (test chỉ ràng buộc ≤ 8 ký tự).
- Hiển thị trên điện thoại thật (360 px, DPR cao): mới xem ảnh chụp Chromium giả lập.
- Câu headline âm (OQ-D16): STATUS ghi "user xem sau khi deploy".

## 9. Đề xuất (không chặn)

1. Bundle: tải lạnh Today 248,3 kB (cloud off) / 248,4 kB (cloud on), cách ngưỡng 250 kB chỉ 1,6 kB. Nên làm backlog F2-R1 (tách `schemas`/zod hoặc xét lại ngưỡng) trước tính năng kế tiếp.
2. M9-D1: giữ dòng đọc tới Escape / đổi focus, hoặc `min-height` theo số dòng đọc.
3. Bench fake-indexeddb trên máy này 160–177 ms (chỉ thông tin, dev 58 ms); số được assert (in-memory) vẫn 15–18 ms. Theo dõi nếu thêm dữ liệu.
4. Nhãn trực tiếp "Ideal +X%" nằm sát đường Ideal nét đứt khi chấm gần vạch 0 % (R3 360 px): giống mockup nên không phải defect; designer có thể xét lại nếu thấy khó đọc.
5. `.env.e2e` và `.env.cloud-e2e` được track (chỉ cấu hình mock, có từ trước); ghi chú để lần sau không nhầm với secret.
