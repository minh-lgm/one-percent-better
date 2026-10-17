# QC report — M10 round 1

**Verdict:** FAIL (1 Major, 4 Minor mở)
**Ngày:** 2026-10-17  **Commit:** `7a48768` (HEAD; dev M10 = `5aedfdd..85b9c62`, gốc `29f7631`). Working tree chỉ khác ở `tests/qc/**` (re-target + test QC mới); không đụng source.

## 1. Tóm tắt

- **13/14 AC đạt, 1 AC không đạt:** M10-AC2 (zod chỉ ở biên lazy; **validate form không đổi hành vi**). Từ ADR-27, validator form đếm độ dài theo đơn vị UTF-16 (`string.length`), còn zod (trước M10 cũng là validator của form) và importer, mapper cloud, `char_length` SQL đếm theo ký tự (code point). Tên mục tiêu 60 emoji (60 ký tự) trước M10 hợp lệ, nay form báo "quá dài" trong khi file Import cùng giá trị vẫn được nhận → hai validator lệch nhau (đúng loại rủi ro M7-D1 mà ADR-27 yêu cầu test parity chặn). Defect **M10-D1 (Major)**. Test parity của dev chỉ dùng ký tự ASCII nên không thấy.
- **Mục tiêu chính đạt, đo độc lập:** tải lạnh `#/today` **222.838 byte** (cloud tắt, đo bằng spec QC riêng, gzip 9, mọi loại resource) và **223,5 kB** (cloud bật, chưa đăng nhập), ngưỡng 230.000; trước M10 248,3/248,4 kB. Đồ thị import tĩnh của `dist/` và `dist-cloud-e2e/` không chứa zod/SDK/chart; chunk zod chỉ tải khi Import, nằm trong precache nên Import chạy offline; dist cloud tắt không có `supabase-client`, `auth/v1`, `supabase.co`; build kiểu CI (biến môi trường) vẫn phát chunk SDK.
- **Purge tombstone, lint, PKCE, M8-D1, M9-D1, M5-P1, copy DESIGN v3.1, nhãn cột, privacy.html, README đều đạt.** Phát hiện thêm 4 Minor: M10-D2 (Export lỗi lúc tạo tệp vẫn ghi "Last backup"), M10-D3 (import file có ngày không có thật → exception thay vì lỗi schema, có từ M5), M10-D4 (M9-D1 còn sót khi giữ chuột > ~300 ms), M10-D5 (hai test dev nhạy thời gian, 1 lần đỏ thật khi chạy 2 tiến trình nặng).
- **Re-target 5 chỗ test QC xong** (mục 2b); `npm run check` exit 0 ×3, Playwright 613 / 645 / 648 test pass ×3 (workers 8). Chưa kiểm được trên Firefox/Safari/iOS và máy thật (mục 8).

## 2. Môi trường và lệnh đã chạy

Windows 11, Node v22.14.0, npm 10.9.2, Playwright Chromium; `.env.local` tồn tại (chỉ `test -f`, không mở); cloud dùng mock.

| Bước | Lệnh | Kết quả |
| :- | :- | :- |
| Check lần 1 (sau re-target) | `npm run check` | exit 0: lint 0 lỗi, typecheck 0, Vitest 112 file / 1.292 test pass, `build:e2e` ok |
| Check lần 2 (+ test QC mới) | `npm run check` | exit 0: Vitest 117 file / 1.433 pass + 4 expected fail |
| Check lần 3 (trạng thái cuối) | `npm run check` | exit 0: Vitest 118 file / 1.437 pass + 9 expected fail (`it.fails` của M10-D1, D3) |
| Playwright lần 1 (sau re-target, trước test QC mới) | `npm run test:e2e` (chromium + cloud, workers 8) | **613 pass**, 9,2 phút, 0 fail, 0 flaky |
| Playwright lần 2 | `npm run test:e2e` | **645 pass**, 10,4 phút (không thấy ECONNRESET mock mà dev báo) |
| Playwright lần 3 (trạng thái cuối) | `npm run test:e2e` | **648 pass**, 10,4 phút; gồm các expected-fail (`test.fail` của D1…D4) |
| Lint riêng test QC / typecheck | `npx eslint tests/qc --max-warnings 0`; `npx tsc -b --noEmit` | exit 0 |
| Type-check `m3-r1-domain.test.ts` khi gỡ exclude | tsconfig tạm bỏ dòng exclude, `npx tsc --noEmit -p …` (file tạm đã xoá) | 0 lỗi → **dev có thể gỡ `"tests/qc/m3-r1-domain.test.ts"` khỏi `exclude` của `tsconfig.app.json`** |
| Bench | `npm run bench` | in-memory 12,4 ms; fake-indexeddb **130,0 ms**; model Review 17,4 ms (< 200) |
| Coverage | `npx vitest run src/domain --coverage` | 209 test pass; `src/domain` **99,02 %** dòng |
| Vitest 2 tiến trình song song, cache `node_modules/.vite/vitest` xoá, ×2 | `npx vitest run` ×2 cùng lúc, bộ test dev giao (112 file/1.292 test; loại các file `m10-r1-*` của QC) | cặp 3, 4: **4/4 exit 0**, 0 "timed out", 110–111 s |
| Như trên nhưng bộ đầy đủ có test QC mới (nặng hơn ≈ 15 %) | cặp 1: 2/2 exit 0; cặp 2: 1 tiến trình đỏ (M10-D5) | xem M10-D5 |
| Probe lint | `tests/qc/m10-r1-lint.test.ts` (ESLint Node API, 37 test) | pass |
| Đồ thị bundle / request log / offline | `tests/qc/m10-r1-bundle.spec.ts` (8 test) | pass |
| Build kiểu CI (cloud bật qua biến môi trường) | `VITE_SUPABASE_URL=… BASE_PATH=/one-percent-better/ npx vite build --outDir <scratch>` | có `supabase-client-*.js` (58,0 kB gzip) + trong precache `sw.js` |
| `npm audit` (cả `--omit=dev`) | | 0 vulnerabilities |
| `git grep -E "service_role\|sb_secret_" -- . ":!docs"`; `git ls-files ".env*"` | | 0 kết quả; `.env.cloud-e2e`, `.env.e2e`, `.env.example` |

### 2b. Re-target test QC (đầu vào của dev, không phải defect)

| File | Thay đổi | Kết quả |
| :- | :- | :- |
| `tests/qc/m3-r1-domain.test.ts` | thêm `await` ở 6 chỗ `backupService.parse(...)` (dòng 195, 222, 237, 257, 286, 421); phép đo 15 s của test file lớn nay gồm cả thời gian nạp chunk lazy (vẫn xa ngưỡng) | 23/23 pass; type-check sạch khi gỡ exclude (đề xuất dev gỡ dòng exclude ở `tsconfig.app.json`) |
| `tests/qc/m3-r1.spec.ts:672–678` | hai ca (daily 600000, khoảng 100 năm) đổi mong đợi sang `EN.errors.IMPORT_INVALID_SCHEMA_outOfRange`; ca entry tương lai vẫn `IMPORT_INTEGRITY` | pass |
| `tests/qc/cloud/m8-r1-rules.spec.ts` "clock skew" | gỡ `test.fail`; `banner(page).count()` → `await expect(banner(page)).toBeVisible()` (auto-wait; sửa đúng cái flake dev mô tả) | pass cả 3 lần chạy đầy đủ |
| `tests/qc/m9-r1-explore.spec.ts` "M9-D1" | gỡ `test.fail` | pass |
| `tests/qc/m6-r1-copy.test.ts` | premise "privacyLink không có trong DESIGN" hết hiệu lực (DESIGN §7.7.5 v3.1 có) → nay khẳng định `extra` = `[]` và `designKeys.has('settings.about.privacyLink')` | 40/40 pass |
| Literal "M7-D5" | không cần đổi: test QC dùng `EN.auth.signOut.*` (không literal); `m8-r1-copy.test.ts` pass | — |
| Test QC đọc hàng thô IndexedDB sau khi tua ≥ 30 ngày + reload | không file nào dính; mọi spec xoá mềm M7/M8 pass | — |

Test QC mới (đều chạy lại được): `tests/qc/m10-r1-bundle.spec.ts`, `m10-r1-lint.test.ts`, `m10-r1-purge-oracle.test.ts`, `m10-r1-purge-perf.spec.ts`, `m10-r1-prompts.test.ts`, `m10-r1-import-variant.test.ts`, `m10-r1-copy.test.ts`, `m10-r1-parity-fuzz.test.ts`, `m10-r1-ui.spec.ts`, `cloud/m10-r1-purge.spec.ts`. Defect đang mở được đánh dấu `test.fail` / `it.fails` (bật thành "unexpected pass" khi sửa xong, QC lật thành test thường).

## 3. Acceptance criteria

| AC | Kết quả | Bằng chứng |
| :- | :- | :- |
| M10-AC1 | PASS | Đo độc lập: `m10-r1-bundle.spec.ts` request log 6 request (document, `index-BpksW3N5.js`, `useFormat`, `dates`, css, `brand-mark-96.png`), **222.838 byte** gzip-9 / 5 response ≤ 230.000; spec dev `[budget chromium] total 222.8 kB`, `[budget cloud] total 223.5 kB`. Không request `schemas\|backup\|useRechartsWidth\|BarChart\|CurveChart\|supabase-client\|GoalDetail\|Review`, 0 request ngoài origin. Đồ thị import tĩnh từ `index.html` (cloud tắt: `index`, `dates`, `useFormat`; cloud bật: + `constants`, `preload-helper`, `types`) không chứa `ZodError`/`invalid_union`/`too_small`; chunk zod (`backup-*.js` cloud tắt, `schemas-*.js` cloud bật) có thật và không nằm trong closure. `final-nfr.spec.ts`, `final2-cloudoff-nfr.spec.ts` pass không sửa (`[nfr2] cloud OFF 222,8 kB`, `cloud ON 223,5 kB`). |
| M10-AC2 | **FAIL** | Phần kiểm chứng của AC pass: `git grep` zod → chỉ `src/domain/backup.ts` + `src/integration/supabase/**`; 37 probe ESLint đúng (zod ở 10 lớp: lỗi, trừ `integration/supabase` và `domain/backup.ts`; subpath, `import type`, re-export, side-effect, namespace; import tĩnh `domain/backup` ở services/ui/app/data/i18n/domain, có đuôi `.ts`, re-export: lỗi; `import type` và `backup-file`: ok); `goal.test`, `entry.test`, `env.test`, `m1-domain`, `m6-r1-env` pass; `limits-parity.test.ts` pass. **Nhưng** đầu đề AC "validate form … không đổi hành vi": fuzz 4.000 goal + 4.000 entry (seed cố định): ký tự BMP **0 lệch** (form ⇔ file), ký tự astral **147 lệch (goal), 183 lệch (entry)** — xem M10-D1. |
| M10-AC3 | PASS | `m3-r1-domain` 23/23 với `await`; `#/settings` không tải chunk có `ZodError`, chọn file mới tải; D3 "5 goals, 23 entries"; file 5 MiB + 1 byte → `IMPORT_FILE_TOO_LARGE` và **không có request chunk** (QC test, SW chặn); Cache Storage của trình duyệt chứa chunk zod sau khi SW cài (kiểm thật bằng `caches.keys()`), offline reload → Import → D3 → Confirm → toast "Backup imported: 5 goals, 23 entries", 0 `pageerror`; chunk bị chặn/đứt (không SW) → Alert `errors.UNKNOWN`, UI mở lại, bỏ chặn → cùng Import thành công (loader thử lại). |
| M10-AC4 | PASS | Bảng 9 ca `isPurgeableTombstone` và integration S1 (`{goals:1, entries:8}`, rollback) do dev; QC chạy lại pass. Thêm e2e cloud `cloud/m10-r1-purge.spec.ts`: thiết bị đã đồng bộ xoá goal khi mock không với tới được (dirty 1) → 38 ngày sau mở app **tombstone còn nguyên** (dirty 1), sau khi đẩy lên (dirty 0) lần khởi động kế **hàng thô biến mất**, tài khoản vẫn giữ tombstone, tập sống chỉ còn "Keep". Chi phí: mục 6. |
| M10-AC5 | PASS | Dev: kịch bản (a)–(e) + 20 seed. **Oracle độc lập** `m10-r1-purge-oracle.test.ts`: mỗi seed (30 seed × 160 thao tác, hai thiết bị, offline ngẫu nhiên, thao tác "+31 ngày") chạy hai lần với đúng cùng luồng thao tác — một lần thật sự `purgeTombstones`, một lần chỉ nhảy đồng hồ — kết quả sống (goal + entry theo nội dung) của A, B và server **giống hệt**; **3.467** hàng tombstone bị dọn qua 30 seed; mutant "xoá mọi tombstone" bị oracle bắt ở **8/8 seed** (oracle có độ nhạy). e2e cloud: thiết bị B đăng nhập sau đó không thấy goal đã xoá. Bench 130 ms < 200. |
| M10-AC6 | PASS | (1) 37 probe ESLint (cả `import('@supabase/…')` ở 8 thư mục, `import(…/supabase-client)` ngoài `integration/supabase`, `<button>Save</button>`, `dangerouslySetInnerHTML`). (2) PKCE: dev 3/3 (đăng nhập, Cancel, token 500); QC thêm: sau đăng nhập, replay `?auth=callback&code=stale`, callback lỗi `error=access_denied` đều không còn key khớp `/verifier/i`, `opb-auth` còn nguyên. (3) `dist/`: 0 file `*supabase*`, 0 `auth/v1`, 0 `supabase.co`, `sw.js` không nhắc `supabase-client` và có chunk zod trong precache; `dist-cloud-e2e/`: đúng 1 chunk có `auth/v1` và là `supabase-client-*`; build kiểu CI bằng biến môi trường vẫn phát chunk SDK + precache (không làm hỏng bản deploy cloud bật). (4) `check` kết thúc bằng `build:e2e`; máy này có `.env.local`, sau `check` `rg "supabase\.co" dist` → 0. |
| M10-AC7 | PASS | Dev e2e `m10-prompts` pass. QC unit (`m10-r1-prompts.test.ts`, 14 test): dung sai **bao gồm** đúng 24 h (`now+24h` còn ẩn, `now+24h+1ms` coi như không có), 14 ngày biên không đổi, chuỗi lỗi/rỗng/năm 9999 bị bỏ qua, `dismissCount` 3 vẫn ẩn dù mốc tương lai, 5 tab "Not now" cùng lúc tiêu **đúng 1** lượt, tab đồng hồ chậm không đếm đôi, `claimExportHint` với mốc 2099: đúng 1 trong 2 claim thắng. `m8-r1-rules` "clock skew" và "two tabs counts once" pass thường. |
| M10-AC8 | PASS | Dev `m10-ui` 5/5; QC: vi 360 (click nhanh, giữ 100 ms, 200 ms) mở bảng ở lần đầu; chạm (`tap`, `hasTouch`) mở lần đầu; rời trang ngay sau khi blur: 0 lỗi (timer được dọn). `focusHeading` với `requestAnimationFrame` bị vô hiệu: 6/6 lần `<h1>` có focus sau khi thua race Save (code cũ sẽ đỏ). **Còn sót:** giữ chuột ≥ 400 ms thì mất click → M10-D4 (Minor). |
| M10-AC9 | PASS | `m10-r1-import-variant.test.ts` 47 test (qua `BackupService.parse` + `errorMessage`): 16 ca vi phạm giới hạn → `…_outOfRange`; 16 ca cấu trúc/lẫn lộn (kể cả "vượt giới hạn + trường sai kiểu", "+ trường lạ cùng hàng", "+ exportedAt sai") → câu chung; biên đúng giới hạn được nhận; entry tương lai/`endDate < startDate`/goal mồ côi → `IMPORT_INTEGRITY`. e2e: Alert đúng câu en và vi, quét vi 0, một Alert một lúc. Ngoại lệ: ngày không có thật → M10-D3. |
| M10-AC10 | PASS | Dev component test (a) export reject, (b) `claimExportHint` reject. QC e2e: `URL.createObjectURL` ném lỗi → Alert `errors.EXPORT_FAILED` đúng chỗ (sau `importHint`, trong card Backup), không toast, 0 download, không lấy focus, không nút Dismiss, axe 0 serious/critical, nút dùng lại được, Export kế tiếp xoá Alert; vi đúng chuỗi, quét vi 0. Chi tiết "Last backup" → M10-D2 (Minor, ngoài câu chữ AC10). |
| M10-AC11 | PASS | `m10-r1-copy.test.ts` (parser riêng của QC): 11 key en (và vi) khớp nguyên văn bảng DESIGN.md; **quét toàn bộ**: 0 hàng DESIGN lệch `en.json`; diff `29f7631..HEAD` của `en.json`/`vi.json` chỉ gồm 2 key mới (en+vi) và 2 chuỗi en đổi (`rejectedKeep`, `rejectedRemove`), vi không đổi. Nhãn cột (e2e `m10-r1-ui`): quét 13 độ rộng × 2 chart, nhãn có **đúng khi** `(chartWidth−38)/12 ≥ 30` (chart ≥ 398 px: 360–414 px dọc không; ≥ 462 px dọc, 768 px có; 1024–1100 không; 1156+ có), không nhãn một phần; chỉ cột ≥ 3 phút (Aug 2 phút: có cột không nhãn; Jul 3 phút: `0.1`); ≥ 100 h số nguyên (`100`, `720`), vi dấu phẩy `1,0 0,3 3,5 4,7`; 11 px/600/`text-anchor middle`, `aria-hidden`, tâm trùng tâm cột, nằm trên cột, không cắt ở mép trên svg, không chồng nhau; cột kỳ hiện tại `--text`, cột khác `--text-muted` ở sáng và tối; đổi cỡ cửa sổ 1440⇄360 không reload: nhãn mất/hiện lại; bảng ẩn 13 hàng không chứa nhãn; axe sạch (sáng/tối). `e2e/cloud/m8-prompts.spec.ts` "M7-D5" pass. |
| M10-AC12 | PASS | README: 0 "(used from M7)"; mục lệnh, "Bundle budget", câu dọn bản ghi 30 ngày (đọc diff); dev `m10-backlog` 2/2 pass trong cả 3 lần chạy; bảng "Đóng backlog" trong handoff khớp bảng Phase 4 (đối chiếu từng dòng, mục 5). |
| M10-AC13 | PASS (kèm M10-D5) | `check` exit 0 ×3; Playwright 613/645/648 pass; bench 130 ms; coverage 99,02 %; M4-D5: 2 cặp Vitest song song cache nguội trên bộ dev giao → 4/4 exit 0, 0 timeout; `git grep service_role\|sb_secret_` 0; `git ls-files ".env*"` đúng 3 file; chromium 0 request ngoài origin; cloud chưa đăng nhập 0 request tới mock (spec dev pass). Hai cặp trên bộ có test QC mới: 1/4 tiến trình đỏ do một test dev nhạy thời gian → M10-D5. |
| M10-AC14 | PASS (đọc tài liệu) | `DESIGN.md` v3.1 có Changelog và các mục: brand (§3.1, §5), 7 key hàng bị từ chối (7.7.1/7.7.2, 0 "NOT IN DESIGN"), `privacyLink` (7.7.5), F14/OQ-D12 theo A-44 (0 "không xét online"), OQ-D16 theo A-45, câu heatmap 1192 px, quy tắc nhãn cột đo được, 2 key lỗi mới, `empty.day.noGoals`, quy tắc một toast. |

## 4. Defect

### M10-D1 — Form validator đếm UTF-16 thay vì ký tự: lệch zod/importer, đổi hành vi so với trước M10  [Major]
- Bước tái hiện (Vitest, không cần UI): `npx vitest run tests/qc/m10-r1-parity-fuzz.test.ts --reporter=verbose` (các ca `it.fails`); hoặc tay: Goals → New goal → tên = 40 emoji `😀` (40 ký tự, giới hạn 60) → điền chỉ tiêu 30 → Save. Tương tự `why` 280 emoji, ghi chú 280 emoji (Log time / Stop timer).
- Mong đợi: M10-AC2 "validate form … không đổi hành vi (ADR-27)"; trước M10 (`z.string().trim().max(60)`) 60 emoji được nhận; form và importer chấp nhận/từ chối cùng giá trị (M10-AC2 `limits-parity`, bài học M7-D1). Kiểm: `node -e "import('zod').then(({z})=>console.log(z.string().max(60).safeParse('😀'.repeat(60)).success))"` → `true`.
- Thực tế: `validateGoalInput({ name: '😀'.repeat(60), … })` → lỗi `GOAL_NAME_TOO_LONG` (độ dài 120 đơn vị UTF-16); UI ở lại form, không lưu (e2e "M10-D1" ở `m10-r1-ui.spec.ts`: không về trang Goals). `validateEntryFields({ note: '😀'.repeat(280) })` cũng lỗi. Cùng giá trị trong file backup (`parseBackup`) **được nhận**. Fuzz seed cố định: 4.000 goal ngẫu nhiên quanh mọi giới hạn → **147 lệch**, 4.000 entry → **183 lệch**, toàn bộ là chuỗi có ký tự astral (emoji, U+20BB7); với ký tự BMP 0 lệch. Hệ quả: người dùng có tên/ghi chú chứa emoji gần giới hạn (hợp lệ trước M10, hoặc từ Import/đồng bộ cloud, vốn đếm theo ký tự) không sửa/lưu lại được trong form tới khi rút ngắn.
- Vị trí nghi ngờ: `src/domain/goal.ts` (`name.length`, `why.length` quanh dòng 66–80), `src/domain/entry.ts` (`note.length` so với `ENTRY_NOTE_MAX`, dòng ~20–25); `src/domain/limits-parity.test.ts` thiếu ca astral.

### M10-D2 — Export lỗi lúc tạo tệp nhưng "Last backup" vẫn đổi thành hôm nay  [Minor]
- Bước tái hiện: e2e `tests/qc/m10-r1-ui.spec.ts` "M10-D2…": Settings, làm `URL.createObjectURL` ném lỗi (`page.addInitScript(() => { URL.createObjectURL = () => { throw new Error('x'); }; })`), bấm Export backup (JSON).
- Mong đợi: DESIGN S7 (v3.1, Export thất bại): "Last backup" không đổi; không có tệp thì không được coi là đã sao lưu.
- Thực tế: Alert `errors.EXPORT_FAILED` hiện đúng, nhưng dòng "Last backup: Never" đổi thành "Last backup: 2026-10-09" và mốc dùng cho nhắc sao lưu 30 ngày bị dời sang hôm nay dù không có tệp nào (suy ra từ quy tắc nhắc, chưa kiểm riêng banner).
- Vị trí nghi ngờ: `src/services/backup-service.ts` `export()` ghi `settings.update({ lastBackupAt })` trước khi `src/ui/screens/Settings.tsx` `exportBackup` gọi `downloadTextFile`.

### M10-D3 — Import file có ngày không có thật ném exception thay vì lỗi schema (có từ M5)  [Minor]
- Bước tái hiện: `npx vitest run tests/qc/m10-r1-import-variant.test.ts` (4 ca `it.fails`), hoặc Settings → Import file S1 sửa goal đầu `startDate: "2026-02-30"` (hoặc `"2026-1-5"`, `""`; hoặc `endDate: "hello"` khi `endDate ≥ startDate` theo so sánh chuỗi).
- Mong đợi: lỗi có cấu trúc `IMPORT_INVALID_SCHEMA` (một trong hai câu), không đổi dữ liệu.
- Thực tế: `parseBackup` ném `RangeError: Invalid ISO date range: 2026-02-30 – 2026-10-31`; `BackupService.parse` reject; Settings hiện câu chung "Something went wrong. Please try again." (không phải câu về file backup), không crash, dữ liệu không đổi.
- Vị trí nghi ngờ: `src/domain/backup.ts` `goalSchema.superRefine` (dòng ~49 gọi `daysInclusive` khi refine ngày đã báo lỗi nhưng vẫn chạy tiếp); có từ commit M5 `0f1418a`.

### M10-D4 — M9-D1 còn sót: giữ chuột lâu hơn ~300 ms thì click vào "Xem dữ liệu dạng bảng" bị mất  [Minor]
- Bước tái hiện: `m10-r1-ui.spec.ts` (các ca "mouse held 400/900 ms"): `vi-VN`, 360 px, import `r1-real-backup.json`, `#/goals/r1`, focus biểu đồ, ← ×2, rồi `locator.click({ delay: 400 })` vào "Xem dữ liệu dạng bảng". `delay` 0/50/100/150/200/250 mở bảng; 350/400/600/900 không mở.
- Mong đợi: M9-D1 chỉ chấp nhận khi mousedown→mouseup không làm bố cục nhảy; bấm chậm vẫn mở bảng.
- Thực tế: bản sửa chỉ hoãn việc xoá dòng đọc tối đa 300 ms (`BLUR_CLEAR_DELAY_MS`); nếu chuột còn đang nhấn lúc đó, dòng đọc bị xoá, bố cục nhảy lên dưới con trỏ và click không rơi vào summary. Chạm nhanh/click nhanh (AC8) vẫn đạt.
- Vị trí nghi ngờ: `src/ui/components/CurveChart.tsx` `onBlur` (`window.setTimeout(clear, BLUR_CLEAR_DELAY_MS)`).

### M10-D5 — Hai test dev nhạy thời gian, đã đỏ thật dưới tải  [Minor]
- Bước tái hiện: xoá `node_modules/.vite/vitest`, chạy hai `npx vitest run` cùng lúc trên bộ test đầy đủ (gồm các file QC mới); lặp. Lần 2 của tôi: 1 trong 4 tiến trình exit 1.
- Mong đợi: M10-AC13/M4-D5: hai tiến trình song song cùng exit 0.
- Thực tế: `src/ui/screens/Settings.sync.test.tsx` "(M7-D4) first sign-in with device data while the cloud fails…" đỏ ở dòng 156: `sync-indicator` `data-state="syncing"` thay vì `error` (assert ngay sau `waitFor` toast, không chờ). Chạy riêng 16 lần đều xanh; trên bộ dev giao (không có file QC mới) 4/4 xanh. Test dev đã báo trong handoff §8 `src/services/login-prompt-service.test.ts:72` (chờ cố định 30 ms): tôi **không tái hiện** (16/16 xanh, 8 tiến trình song song ×2).
- Vị trí nghi ngờ: `src/ui/screens/Settings.sync.test.tsx:156`; `src/services/login-prompt-service.test.ts:72`.

## 5. Kiểm lại defect vòng trước

Round 1 của M10 nên không có defect M10 trước đó. Kiểm các mục backlog/defect cũ mà M10 tuyên bố đóng (đối chiếu bảng "Đóng backlog" của handoff):

| Mục | Trạng thái | Ghi chú |
| :- | :- | :- |
| F2-R1 (248,3 kB) | FIXED | 222,8 / 223,5 kB (AC1) |
| M9-D1 | FIXED (có sót M10-D4) | click nhanh/chạm ở vi 360, en 360, en 1440 mở bảng ở lần đầu; test `m9-r1-explore` đã gỡ marker, pass |
| M8-D1 | FIXED | mốc tương lai > 24 h bị bỏ qua (AC7), `m8-r1-rules` pass thường |
| M8-P1 (b)(c)(d) | FIXED | README, `claimExportHint` lỗi không làm hỏng Export, hai tab đếm 1 lượt; (a) đóng (DESIGN F14) |
| M7-P1 (a)(b)(c) | FIXED | purge (AC4/AC5), `check` dùng `build:e2e`, 7 chuỗi khớp DESIGN |
| M6-P1 (a)(b)(c)(d) | FIXED | privacyLink trong DESIGN; lint `import()`; PKCE; dist cloud tắt sạch; (e) đóng |
| M5-P1 (b)(c) | FIXED | `focusHeading` không phụ thuộc rAF (6/6 với rAF vô hiệu); câu `outOfRange`; (a) đóng, (d) Later |
| M4-P1 (a)(b) | FIXED | câu heatmap 1192 px; nhãn cột (AC11); (c) Later |
| M4-D5 | CLOSED có điều kiện | 4/4 xanh trên bộ dev giao; 1/4 đỏ trên bộ nặng hơn → M10-D5 (Minor, không phải timeout) |
| M3-P1 (a)(b) | FIXED | Export `catch`; e2e dòng why và `5,449`/`5.449` |
| M3-D3, M7-D1 (id > 64), M3-D4, M2-D*, M1-D* … | không tái phát | toàn bộ spec/test QC cũ của M1…M9 pass trong 3 lần chạy đầy đủ |
| M4-D5 (ngưỡng 15 s `m3-r1-domain`) | QC quyết giữ | đo nay gồm cả nạp chunk lazy, ≈ 1–3 s |

## 6. Regression

- Toàn bộ test QC M1…M9 (chromium + cloud) pass 3/3 lần; không file nào ngoài 5 chỗ re-target cần đổi.
- Luồng chính: Today/timer/log, Goals, Goal detail, Review, Day, Settings, Import/Export, đồng bộ cloud mock, đăng nhập/đăng xuất, brand — qua `final-journey`, `final2-journey` (en/vi, 360/1440) pass.
- Hiệu năng purge lúc khởi động (`m10-r1-purge-perf.spec.ts`, Chromium, IndexedDB tự dựng): 50.000 entry sống, 0 tombstone → Today hiện sau 130 ms, purge xong ≈ 1,0 s, long task (≥ 50 ms) tối đa **241 ms**; thêm 20.000 tombstone cũ → purge xong ≈ 3,3 s, long task tối đa **298 ms**. Không chặn render lần đầu; không coi là defect (DB lớn hơn mức dùng thực).
- Bench 130 ms (`fake-indexeddb`), không ảnh hưởng bởi purge.

## 7. Bảo mật

- Không secret trong repo/log: `git grep "service_role|sb_secret_"` (ngoài docs) 0; chỉ 3 file `.env*` được theo dõi (`.env.cloud-e2e`, `.env.e2e`, `.env.example`: khoá giả của mock, không bí mật); `.env.local` chỉ kiểm sự tồn tại, không mở.
- `npm audit` 0 lỗ hổng (cả production).
- Biên: file Import vẫn qua kích thước → JSON → zod strict → toàn vẹn; thông báo mới chỉ là chuỗi tĩnh, không nhúng nội dung file. Dung sai đồng hồ A-46 chỉ làm lời nhắc hiện lại, không mở quyền. Purge chỉ xoá hàng đã đánh dấu xoá; `dirty 1` của thiết bị đã đồng bộ được giữ (kiểm bằng oracle + e2e). Lint chặn zod/SDK ngoài biên (37 probe).
- Bản build cloud tắt không chứa mã SDK/URL `auth/v1`/`supabase.co`; build cloud bật vẫn đủ (kiểm bằng biến môi trường kiểu CI).
- Quan sát (không là defect): dọn verifier chạy sau khi callback settle; một tab mở URL callback giả đúng lúc tab khác đang đăng nhập dở có thể xoá verifier của tab kia (hành vi cũ `clearPkceVerifiers` cũng vậy; hiếm).

## 8. Chưa kiểm chứng được (NOT VERIFIED)

- Firefox, Safari, iOS Safari, Edge: chỉ chạy Chromium. Cần kiểm tay: nhãn giá trị cột (đo ResizeObserver), Import offline qua service worker, click "Xem dữ liệu dạng bảng" ở vi 360 px.
- Đăng nhập Google thật, RLS thật: dùng mock như quy định; không gọi dịch vụ production.
- Bản `npm run build` thật với `.env.local` của máy (không đọc file): thay bằng build kiểu CI qua biến môi trường giả. Sau khi deploy cần mở trang thật xem nút Sign in with Google còn và chunk SDK tải được.
- Trình đọc màn hình (NVDA/VoiceOver) với nhãn cột `aria-hidden` và Alert Export lỗi.
- Trang `privacy.html` trên sub-path Pages thật `/one-percent-better/privacy.html` (ảnh `./brand-mark-96.png` tương đối, file có trong `dist-cloud-e2e/`; kiểm 200 + ảnh nạp được trên preview gốc `/` ở chromium).
- Chọn tệp bằng hộp thoại hệ điều hành thật (Playwright dùng `setInputFiles`).

## 9. Đề xuất (không chặn)

- Gỡ `"tests/qc/m3-r1-domain.test.ts"` khỏi `exclude` trong `tsconfig.app.json` (đã xác nhận type-check sạch).
- Khi sửa M10-D1: thêm ca astral (emoji, `𠮷`) vào `src/domain/limits-parity.test.ts`; QC lật các `it.fails`/`test.fail` của `m10-r1-parity-fuzz.test.ts`, `m10-r1-ui.spec.ts` "M10-D1" sau khi dev báo xong.
- `login-prompt-service.test.ts:72` và `Settings.sync.test.tsx:156`: dùng `waitFor`/`vi.waitFor` thay cho chờ cố định hoặc assert ngay.
- `keepRunning` trong `Today.tsx` vẫn dùng `requestAnimationFrame(() => opener?.focus())` (cùng lớp rủi ro với `focusHeading` cũ ở tab nền).
- Nhãn cột: giờ 99,95–99,99 hiển thị "100.0" (5 ký tự; DESIGN nói tối đa 4) — cosmetic.
- README ghi chunk zod là `schemas-*.js`; bản cloud tắt đặt tên `backup-*.js` (tên do bundler).
- Sau Export (thành công hay lỗi) focus bàn phím rơi về `<body>` vì nút Export bị `disabled` lúc "Working…" (từ M3); có thể giữ focus bằng `aria-disabled`.
- Khi hai thao tác cùng một mili-giây (đồng hồ bị đóng băng trong test), tombstone có `updatedAt` bằng bản sống và bị server bỏ qua (LWW) — không xảy ra với người dùng thật; ghi lại để test e2e luôn dịch đồng hồ giữa tạo và xoá.
