# Dev handoff — M18 Đồng bộ lộ trình: `SYNC_TABLES`, 4 bảng Supabase + RLS, chịu lỗi khi chưa migration (+ lazy sync)

Ngày: 2026-11-04. Build theo `docs/plan/TASKS.md` v8.x ("Phase 8 — Quy ước bổ sung", M18-T1 … T5, M18-AC1 … AC8, DoD), `ARCHITECTURE.md` v8.1 (§4.8 g/h/j, §5.10 v8.0, §10 bảng rủi ro v8.0/v8.1, ADR-50, ADR-52), `PRD.md` (FR-78, FR-79; FR-41/44/47/48/50/51/61; NFR-12/13/15/16/23/28), `DESIGN.md` v8.0 (§7.9.1 `settings.account.roadmapsUnavailable`, §4 "Phase 8 — chỉnh màn cũ", S11), `docs/handoff/dev-M17.md`, `docs/qc/report-M17-r1.md`. Quyết định bổ sung của user (2026-11-04): **lazy hoá engine sync ngay trong M18** (phương án dự phòng ARCH §10).
Commit gốc trước M18: `1fb3baf`. Commit M18 (local, chưa push): `70eb574` (T1), `208e02c` (T2), `a3897af` (T3 + lazy sync), `8860790` (T4), rồi T5 (`test(M18)`) và `docs(M18)` — xem `git log 1fb3baf..HEAD`.

**Orchestrator: chỉ push `main` sau khi QC PASS và user báo đã làm U31** (chạy `supabase/migrations/20261104000000_roadmaps.sql` trên project). Push trước U31 app vẫn chạy (ADR-52) nhưng lộ trình chưa lên cloud và card Account hiện dòng `roadmapsUnavailable`.

## 1. Tóm tắt

- **Bảng đăng ký `SYNC_TABLES`** (`src/data/sync-tables.ts`, ADR-50): 6 bảng, thứ tự cha → con, nhóm `core`/`roadmap`, quan hệ cha (`goalId`, `roadmapId`, `phaseId`). `DexieSyncStore` viết lại generic theo bảng này: `getDirty(limit, group?)`, `countDirty(group?)`, `applyRemote` lan tombstone goal → entry, roadmap → phase/mục/checkpoint, phase → mục **trong một transaction**, `tombstoneOrphanEntries` dọn con mồ côi của roadmap/phase đã xoá, `markAllDirty`/`markRejected`/`countRejected`/`watchPendingCount` 6 bảng. `purgeTombstones` tách ra `data/dexie/purge-tombstones.ts` (vẫn eager cho `app/maintenance`).
- **Remote 6 bảng**: `RemoteTable`/`RemoteRecordByTable`, `pull<T>` generic, `IdsByTable`, `RemoteError.tableMissing`; mapper zod + codec hai chiều cho 4 bảng (`numeric` nhận số hoặc chuỗi số, tối đa 1 chữ số lẻ, `position` hữu hạn), `TABLE_CODECS`; `SupabaseRemoteStore` lặp theo `SYNC_TABLES`, `toRemoteError(status, error, cause, table)` nhận diện 404 `PGRST205`/`42P01`, 403 `42501` **chỉ trên bảng roadmap** → `tableMissing` (goals/entries/settings giữ ánh xạ M7). `FakeRemoteStore` + mock `server.mjs` 6 bảng, `roadmapTables` toggle (`POST /__test/config`), `/__test/rows?table=`, hợp đồng `remote-store.contract.ts` mở rộng.
- **`SyncService`** theo nhóm: đẩy `core` rồi `roadmap` bằng lệnh riêng, kéo 6 bảng cha trước, dọn mồ côi, đẩy lại chỉ nhóm còn khả dụng, prefs. ADR-52: `tableMissing` → bỏ phần còn lại của nhóm roadmap trong chu kỳ, hàng giữ `dirty = 1`, không `markRejected`, không `expired`, chu kỳ `ok`, `SyncStatus.roadmapsUnavailable = true`; chu kỳ sau thử lại, thành công thì cờ về `undefined`. Thiết bị cũ (kv `sync` 2 khoá cursor) kéo đủ 4 bảng mới từ `null`, goals/entries giữ con trỏ. `prepareFirstSignIn` đếm thêm `countLive().roadmaps`.
- **Lazy sync** (quyết định user, ARCH §10): `LazySyncEngine` (`src/services/lazy-sync-engine.ts`) đứng trước engine với cùng bề mặt public; `container.ts` chỉ `import()` `services/sync-service` + `data/dexie/sync-store` khi auth state là `signed-in`/`signing-in` (phiên lưu sẵn lúc khởi động hoặc user bấm đăng nhập) — gate `__OPB_CLOUD__` nên bản cloud tắt **không phát chunk**. Chunk `sync-engine-*.js` ≈ 5,1 kB gzip (+ `sync-tables-*.js` 0,3 kB dùng chung với SDK). ESLint `SYNC_LAZY_RULE` chặn import tĩnh ngoài test; probe trong `lint-boundaries.test.ts`. Scheduler/StatusRow/Settings/AuthFeedback/SyncFeedback/AuthService không đổi hành vi (sync-on-load, retry, lock `opb-sync` giữ nguyên; test M7 pass).
- **UI**: key `settings.account.roadmapsUnavailable` (en/vi nguyên văn DESIGN 7.9.1) — dòng `.hint.info-line` dưới `dl` ở card Account (trước `Sync now`), `<p class="note rm-note" role="status">` dưới đầu trang S11.
- **SQL** `supabase/migrations/20261104000000_roadmaps.sql` idempotent đúng ARCH §4.8 (g); 2 file cũ nguyên vẹn (sha256 pin trong static test). `tests/db/roadmaps.test.ts` (skip không Docker, exit 0). README: mục "Big goals in the account", **U31** + triệu chứng khi chưa chạy, MockApi mới, số ngân sách.
- **Hội tụ**: `two-devices.ts` có `roadmaps`/`roadmapService`/`seedRoadmap`, snapshot 6 bảng (device + server); 5 kịch bản AC4 (a…e) + random **20 seed × 200 thao tác** có 8 loại thao tác roadmap → 20/20 hội tụ 6 bảng. E2E `e2e/cloud/m18-roadmap-sync.spec.ts` theo Demo M18 (3 test).
- **Ngân sách tải lạnh**: baseline HEAD `1fb3baf` **229.454 B (cloud tắt) / 229.658 B (cloud bật)** → sau M18 **226.611 B / 227.032 B** (−2.843 B / −2.626 B; headroom 3.389 B / 2.968 B). Chi tiết §8.
- `zod` 4.6.5 → **4.6.7** (GHSA-mrhx-c7xc-m3w5), API không đổi, `npm audit --omit=dev` = 0 lỗ hổng.

## 2. Task

| ID | Trạng thái | Ghi chú |
| :- | :- | :- |
| M18-T1 | DONE | `src/data/sync-tables.ts`, `data/dexie/sync-store.ts` (generic), `data/dexie/purge-tombstones.ts`, `data/repositories.ts` (`RemoteChanges` 6 khoá tuỳ chọn, `FullRemoteChanges`, `IdsByTable`, `emptyChanges`, `changesCount`, `SYNC_LOCAL_TABLES`), test `sync-store.roadmap.test.ts` (12), `roadmap-repo.test.ts` (1 re-target) |
| M18-T2 | DONE | `services/remote-store.ts`, `integration/supabase/mapper.ts` (+ `mapper.roadmap.test.ts` 6), `supabase-client.ts`, `remote-store.test.ts` (+3 ánh xạ lỗi), `test/fake-remote-store.ts` (+ harness), `services/remote-store.contract.ts` (+3 ca, `roadmapRaw`/`roadmapItemRaw`), `e2e/mock-supabase/server.mjs` + `server.d.mts`, `e2e/cloud/fixtures.ts` (`MockApi.config`, `rowsOf`, `MockRows` 7 bảng) |
| M18-T3 | DONE | `services/sync-service.ts`, `domain/sync.ts` (`roadmapsUnavailable`), `services/lazy-sync-engine.ts` (+ test 6), `app/container.ts`, `eslint.config.js` (`SYNC_LAZY_RULE`), `vite.config.ts` (nhóm chunk `sync-engine`, `includeDependenciesRecursively: false`), `en.json`/`vi.json`, `ui/components/AccountCard.tsx`, `ui/screens/Roadmaps.tsx`, `ui/styles/roadmaps.css`, test `sync-service.roadmap.test.ts` (8), `AccountCard.sync.test.tsx` (+2), `Roadmaps.test.tsx` (+2), `roadmap-parity.test.ts` (+1), `lint-boundaries.test.ts` (+10), `test/two-devices.ts` |
| M18-T4 | DONE | `supabase/migrations/20261104000000_roadmaps.sql`, `src/data/cloud-migration-roadmaps.test.ts` (7), `tests/db/roadmaps.test.ts` (7, skip không Docker), `tests/db/remote-store.test.ts` (reset 7 bảng), `README.md` |
| M18-T5 | DONE | `services/sync-convergence.test.ts` (`expectConverged` 6 bảng, random ops roadmap, +5 kịch bản), `e2e/cloud/m18-roadmap-sync.spec.ts` (3), `e2e/m10-bundle.spec.ts`, `e2e/cloud/m10-bundle.spec.ts` (+1), `e2e/cloud/m6-lazy.spec.ts`, handoff này |
| (backlog) | DONE | `zod` 4.6.7 (`package.json`, `package-lock.json`) |

## 3. File chính đã thêm/sửa

- **Data:** `src/data/sync-tables.ts` (mới), `src/data/repositories.ts`, `src/data/dexie/sync-store.ts`, `src/data/dexie/purge-tombstones.ts` (mới), `src/data/dexie/sync-store.roadmap.test.ts` (mới), `src/data/dexie/roadmap-repo.test.ts`, `src/data/cloud-migration-roadmaps.test.ts` (mới).
- **Logic:** `src/domain/sync.ts`, `src/services/sync-service.ts`, `src/services/lazy-sync-engine.ts` (mới, + test), `src/services/remote-store.ts`, `src/services/remote-store.contract.ts`, `src/services/sync-service.roadmap.test.ts` (mới), `src/services/sync-service.test.ts` (2 assertion re-target), `src/services/sync-convergence.test.ts`.
- **Integration:** `src/integration/supabase/mapper.ts` (+ `mapper.roadmap.test.ts`), `supabase-client.ts`, `remote-store.test.ts`.
- **App/UI/i18n:** `src/app/container.ts`, `src/ui/components/AccountCard.tsx` (+ test), `src/ui/screens/Roadmaps.tsx` (+ test), `src/ui/styles/roadmaps.css`, `src/i18n/resources/en.json`, `vi.json`, `src/i18n/roadmap-parity.test.ts`.
- **Test infra:** `src/test/fake-remote-store.ts` (+ test), `src/test/two-devices.ts`, `src/test/lint-boundaries.test.ts`, `e2e/mock-supabase/server.mjs`, `server.d.mts`, `e2e/cloud/fixtures.ts`.
- **E2E:** `e2e/cloud/m18-roadmap-sync.spec.ts` (mới), `e2e/m10-bundle.spec.ts`, `e2e/cloud/m10-bundle.spec.ts`, `e2e/cloud/m6-lazy.spec.ts`.
- **Cloud/DB/docs:** `supabase/migrations/20261104000000_roadmaps.sql` (mới), `tests/db/roadmaps.test.ts` (mới), `tests/db/remote-store.test.ts`, `README.md`, `eslint.config.js`, `vite.config.ts`, `package.json`, `package-lock.json`.

## 4. Cách chạy

```bash
npm ci                     # Node 22 (zod 4.6.7)
cp .env.example .env.local # không có biến môi trường mới ở M18
npm run dev                # http://localhost:5173
# Thử đồng bộ lộ trình với mock (hai cửa sổ / hai profile):
npm run mock:supabase && npm run build:cloud-e2e && npm run preview:cloud-e2e
# http://localhost:4174/one-percent-better/#/settings → Import e2e/fixtures/q1-roadmap-backup.json → Sign in "Minh Test"
# curl -X POST http://127.0.0.1:54321/__test/config -H 'content-type: application/json' -d '{"roadmapTables":false}'  → mô phỏng chưa chạy U31
```

Project thật: **U31 trước khi deploy** (README "Account & sync" bảng User setup, hàng U31).

## 5. Cách test

```bash
npm run check                                   # lint + typecheck + vitest + build:e2e
npx vitest run src/data src/services src/integration src/test src/ui src/i18n   # phần M18 nằm trong đây
npx vitest run src/data/dexie/sync-store.roadmap.test.ts src/services/sync-service.roadmap.test.ts src/services/sync-convergence.test.ts src/services/lazy-sync-engine.test.ts src/integration/supabase src/test/fake-remote-store.test.ts src/data/cloud-migration-roadmaps.test.ts
npm run test:e2e -- --project=cloud e2e/cloud/m18-roadmap-sync.spec.ts
npm run test:e2e -- --project=chromium --project=cloud e2e/m10-bundle.spec.ts tests/qc/m17-r1-budget.spec.ts e2e/cloud/m10-bundle.spec.ts tests/qc/cloud/m17-r1-budget.spec.ts e2e/cloud/m6-lazy.spec.ts   # ngân sách + lazy
npm run test:e2e                                # cả 3 project (~9 phút)
npm run test:db                                 # cần Docker; máy này in "skipped", exit 0 (NV-22 → U31)
```

Kết quả lần chạy cuối: §10.

## 6. Tự kiểm AC

| AC | Kết quả | Bằng chứng (lệnh + output rút gọn) |
| :- | :- | :- |
| M18-AC1 | PASS | `npx vitest run src/data/dexie/sync-store.roadmap.test.ts` 12/12: Q1 → `countDirty` 6+29+32 = 67, `countDirty('roadmap')` 32; `getDirty(500)` khoá theo thứ tự goals, entries, roadmaps, roadmapPhases, roadmapItems, roadmapCheckpoints (1/5/21/5), theo nhóm chỉ trả bảng của nhóm; tombstone `rq` newer → 31 con `deletedAt = updatedAt = stamp`, `dirty 1`, `applied 1`; hook ném ở mục thứ 10 → rollback toàn bộ (1/5/21/5 còn sống); tombstone `pq1` → đúng 4 mục wq1…wq4, phase chưa có local vẫn lan; remote cũ hơn → `keptLocal 1` (dirty giữ), bằng version → chỉ hạ dirty, mới hơn → thay, hàng chỉ chứa đúng 14 field; `tombstoneOrphanEntries`: phase xoá → 4 mục (đếm 4, lần 2 = 0), roadmap xoá → 4+17+5 = 26, goal xoá → 6 entry; `markAllDirty` 6+29+1+5+20+5 (bỏ tombstone); `watchPendingCount` 0 → 32 khi `putMany` Q1; `markRejected({roadmapItems:[…], roadmapCheckpoints:[…]})` → 3, `countRejected` 6 bảng; `normalizeSyncMeta({cursor:{goals,entries}})` → 4 khoá `null`, 2 khoá cũ giữ. `sync-store.test.ts` M7 (14) pass không đổi assertion |
| M18-AC2 | PASS | `mapper.roadmap.test.ts` 6/6: round-trip 4 bảng deep-equal; `"32.0"`/`32` → 32, `"7.5"` → 7,5; 7,25 / `'NaN'` / `'abc'` / 0 / 10000,5 / 33 / −1 → `skippedInvalid 1`; `position` `'NaN'`, NaN, ∞, 1e15, `'1'` → bỏ; item: `planned_end < planned_start`, span 367 ngày, `actual_end < actual_start`, tiêu đề 201, note 1001, `2026-02-30`, tiêu đề rỗng, `phase_id null` → bỏ (8), hàng hợp lệ giữ. Contract (Fake + mock) `remote-store.contract.ts` +3 ca: push Q1 → `fetchByIds` deep-equal 4 bảng, `serverUpdatedAt` dạng ISO ms, keyset `roadmap_items` limit 10 → `[10, 10, 1]`, tie `updatedAt` → server giữ, newer thắng, tombstone là write, u2 thấy rỗng; pre-validate `actual_end < actual_start`/tiêu đề 201/`planned_end < planned_start` → `rejected.roadmapItems` 3 id không gửi, id 65 → `rejected.roadmaps`; push sạch → `{ rejected: { goals: [], entries: [] } }`. Thiếu bảng: push/pull/fetchByIds roadmap → `RemoteError` `tableMissing true`, code ≠ `SYNC_UNAUTHORIZED`; goals/entries/settings bình thường; bật lại → ok. `remote-store.test.ts` (`SupabaseRemoteStore` → mock) +3: `toRemoteError` 404 PGRST205/42P01, 403 42501, 404 không code trên 4 bảng roadmap → `tableMissing`; cùng mã trên `goals`/`entries`/`settings` → M7 (403 → `SYNC_UNAUTHORIZED`, 404 → `SYNC_UNREACHABLE` không `tableMissing`); 401 PGRST301 trên `roadmaps` → `SYNC_UNAUTHORIZED`; qua store với fetch giả 403 `42501`: `roadmaps` → `tableMissing`, `goals` → `SYNC_UNAUTHORIZED` |
| M18-AC3 | PASS | `sync-service.roadmap.test.ts` 8/8: Fake `roadmapTables = false` → `syncNow` `{ran, ok}`, `countDirty('core') 0`, 32 roadmap `dirty 1`, server 6 goals/29 entries/0 roadmaps, `current()` `{idle, roadmapsUnavailable: true, pending 32}`, không `error`/`nextRetryAt`, `onUnauthorized` không gọi, `markRejected` không gọi, đúng 1 request roadmap (push `roadmaps`) rồi bỏ nhóm, cursor goals có / roadmaps null, `lastError null`; chu kỳ 2 vẫn kéo goals; bật bảng → 32 `dirty 0`, cờ `undefined`, server 1/5/21/5, cursor `roadmap_items` có. Không có gì để đẩy → phát hiện ở pull (`goals, entries, roadmaps`), vẫn ok. `reset()` xoá cờ. Thiết bị cũ kv 2 cursor + `pullResetVersion 1` → pulls `[goals rewind(OLD)], [entries rewind(OLD)], [roadmaps null] ×4` (không đặt lại), nhận 1/21 hàng, chu kỳ 2 dùng cursor roadmap đã lưu. 500 trên `roadmap_items` (`failTable`) → `{ran, ok:false, SYNC_UNREACHABLE}`, `kind error`, `nextRetryAt` +30 s, không `roadmapsUnavailable`, `lastError` ghi; manual kế tiếp ok. Toàn bộ `sync-service.test.ts` (35), `sync-service.deletion.test.ts`, `sync-convergence.test.ts` (40) pass — 2 assertion đếm request re-target (§7). Component: `AccountCard.sync.test.tsx` +2 (dòng gợi ý chữ DESIGN en/vi, class `hint`, icon, không alert, thứ tự dl → dòng → Sync now, ẩn khi không cờ, quét vi 0), `Roadmaps.test.tsx` +2 (cloud bật: ẩn → hiện sau chu kỳ thiếu bảng → ẩn sau chu kỳ ok; cloud tắt: không bao giờ; vi nguyên văn) |
| M18-AC4 | PASS | `sync-convergence.test.ts` "roadmaps converge" 5/5: (a) A seed Q1 → B 1/5/21/5 mọi field (wq1 actual, cq1 score 5, rq goalId/weekly/milestone) + server = A; (b) A sửa note W2 10:03, B tick 10:05 → sau A, B, A cả hai giữ hàng của B (`actualEnd` today, note `''`, updatedAt 03:05); (c) A xoá p2 offline 10:05, B sửa W5 10:06 → sau A, B, A: p2 mất, W5 mất ở cả hai (LWW sống rồi bị dọn mồ côi ngay trong chu kỳ A), remote W5 tombstone **mang note của B**, remote p2 `deleted_at` 03:05; (d) A xoá `gq` → B `rq.goalId null`, 21 mục giữ, server `goal_id null`; (e) A xoá rq khi B vừa tick → rỗng cả hai, server tombstone hết. Random **20 seed × 200 thao tác** (thêm 8 loại thao tác roadmap: tạo ±link, thêm phase, thêm mục, tick/sửa mục, xoá phase, xoá roadmap, link/unlink, xoá goal đang liên kết) → 20/20 hội tụ 6 bảng (`expectConverged` so A = B = server từng bảng). NFR-13: `e2e/cloud/m18-roadmap-sync.spec.ts` test 1 in `first sync of Q1 … done in N ms` < 15.000 (xem §10); `m7-import-perf` (large-backup) vẫn pass |
| M18-AC5 | PASS | `sync-service.roadmap.test.ts` "merge": u2 đăng nhập → `confirm-merge`; `confirmMerge()` → `markAllDirty` 1 lần trả 35+32 = 67, u2 trên server 6 goals + 1/5/21/5, `countDirty 0`; chỉ có roadmap (0 goal) cho tài khoản khác → `confirm-merge`; `clearUserData` → 6 bảng rỗng, kv `sync` mất, cloud giữ 21 hàng. E2E test 3: B "Sign out → Remove" → 6 store Dexie = 0, cloud giữ; A "Delete account" (mock function) → `/__test/rows` 7 bảng rỗng, 4 store local rỗng, card signed-out |
| M18-AC6 | PASS (static) / NOT VERIFIED (Postgres thật, NV-22) | File tồn tại; `git diff 1fb3baf -- supabase/migrations/20261012000000_cloud_sync.sql supabase/migrations/20261019000000_goal_open_ended.sql` rỗng (sha256 hai file pin trong `cloud-migration-roadmaps.test.ts`). Static test 7/7: 4 `create table if not exists`, mỗi bảng `primary key (user_id, id)`, `references auth.users (id) on delete cascade`, 4 cột sync, `enable row level security`, 12 policy đều `to authenticated` + `(select auth.uid()) = user_id`, mỗi policy/trigger có `drop … if exists` **trước** `create`, 4 trigger gọi `public.sync_before_write()`, 4 index `(user_id, server_updated_at, id)`, `revoke all … from anon, authenticated`, đúng 1 `grant select, insert, update … to authenticated`; độ dài/khoảng đọc từ `config/constants.ts` (80/2000/40, 30…10080, 80/120, 200/1000, 365 ngày = `ITEM_SPAN_MAX_DAYS − 1`, 80/280, 10000); không `for delete`/`to anon`/`to public`/`disable row level security`/`drop table`/`drop function`/`delete from`/`truncate`/`update public.`/`insert into`/`create or replace function`/chạm `goals|entries|settings`/`service_role`. `npm run test:db` → "skipped", exit 0 (`tests/db/roadmaps.test.ts` 7 ca sẵn: 4 bảng tồn tại, RLS A/B, anon từ chối, trigger LWW, 23514 cho 9 vi phạm gồm `planned_end < planned_start`, numeric 1 lẻ đọc về số, không delete) |
| M18-AC7 | PASS | `npm run test:e2e -- --project=cloud e2e/cloud/m18-roadmap-sync.spec.ts` 3/3 (xem §10 cho log): A import Q1 + sign in → `rowsOf('u1','roadmap_items')` 21, rows 1/5/5 + 6 goals/29 entries, `rq.goal_id 'gq'`, cột đúng §4.8 g; B sign in → `#/roadmaps` "QPT 21 tuần", `Goal: QPT study`, `Done 1/21`, `Studied 5.8 h of 16 h`, `On track`, Dexie `roadmapItems` 21; A xoá goal → mock `rq.goal_id null`, goal tombstone; B Sync now → `No goal linked`, `Study time: —`, `Done 1/21`; `roadmapTables: false` → sign in: goals 6 lên, roadmaps 0, pending 32, dòng gợi ý ở card Account (chữ EN nguyên văn), `data-state signed-in`, không `auth-expired`/`sync-error`/`remote-invalid`, indicator `pending` (không "Sign in again"); ghi giờ → entry lên (30); `#/roadmaps` có `<p role="status">`; `roadmapTables: true` → Sync now → toast "Everything is up to date", dòng mất, pending 0, 21 mục lên, không dòng ở S11. Request chỉ tới `localhost:4174` / `127.0.0.1:54321`; `pageerror` 0 ở cả hai context |
| M18-AC8 | PASS (phạm vi dev) | `npm run check`: lint 0 warning, typecheck 0, vitest (§10), `build:e2e` ok. Ngân sách: `[budget chromium] 226.611 B / 5 response`, `[budget cloud] 227.032 B / 5 response` ≤ 230.000 (§8). `git grep -nE "service_role\|sb_secret_" -- . ":!docs"` → chỉ các chỗ đã có từ M14 (Edge Function dùng biến môi trường service-role, README/handler comment) — không có giá trị secret; README có U31. E2E 3 project: §10 |

## 7. Deviations so với plan/design

1. **Lazy sync engine (quyết định user, không có trong TASKS M18):** `AppContainer.syncService` nay có kiểu `SyncEngine | null` (`Pick<SyncService, …>` — các phương thức public) và là một `LazySyncEngine`; mọi nơi dùng (`start.ts`, scheduler, StatusRow, Settings, AuthFeedback, SyncFeedback, AuthService) không đổi code ngoài kiểu. Trước khi engine nạp, `current()` = `{ paused, 0, null }` (y như `SyncService` mới); `watchStatus`/`onEvent`/`watchMergePrompt`/`pause`/`cancelMerge`/`countRejected`/`finalSyncBeforeSignOut`/`reset`/`pauseForAccountDeletion` **không** kích hoạt nạp (trả fallback); `syncNow`/`handleSignedIn`/`prepareFirstSignIn` nạp rồi chuyển tiếp. Kích hoạt nạp: container theo dõi `authService.watch()` → `signed-in` hoặc `signing-in` (phiên lưu sẵn ở khởi động hoặc user bấm đăng nhập); `expired`/`signed-out` không nạp. Nạp thất bại (offline trước khi chunk được cache) → `syncNow` trả `{ ran, ok: false, SYNC_UNREACHABLE }`, status `error`, lần gọi sau thử nạp lại; không bao giờ ném.
2. **`purgeTombstones` tách khỏi `DexieSyncStore`** sang `data/dexie/purge-tombstones.ts` để `app/maintenance` (chạy mọi lần khởi động, cloud tắt hay bật) không kéo engine vào đường tải lạnh; `DexieSyncStore.purgeTombstones` uỷ quyền, test cũ giữ nguyên.
3. **Chunk `sync-engine`** khai báo trong `vite.config.ts` với `includeDependenciesRecursively: false` (mặc định `true` của Rolldown kéo cả `repositories`/`db.ts`/Dexie vào chunk và làm `index` import tĩnh nó — phát hiện khi đo, đã sửa). `remote-store.ts` nằm cùng chunk; `sync-tables.ts` thành chunk 0,3 kB riêng (dùng chung SDK chunk và engine), không trên đường tải lạnh.
4. **`PushResult.rejected` / `RemoteChanges` khoá roadmap tuỳ chọn, chỉ có khi dùng** (ARCH "field mới tuỳ chọn ở đầu vào"): đầu ra `getDirty`/`fetchByIds` luôn đủ 6 mảng (`FullRemoteChanges`), nhưng `rejected` chỉ có khoá roadmap khi có hàng bị từ chối, để các test M7 `toEqual({ rejected: { goals: [], entries: [] } })` pass không đổi.
5. **`toRemoteError` chấp nhận 404 không mã trên bảng roadmap** là `tableMissing` (ARCH chỉ nêu `PGRST205`/`42P01`) — PostgREST thật luôn gửi mã; lenient hơn để một 404 lạ trên 4 bảng mới không thành backoff vô hạn. 401 trên bảng roadmap vẫn là `SYNC_UNAUTHORIZED`.
6. **Mapper kiểm thêm "tối đa 1 chữ số lẻ"** cho `max_score`/`threshold`/`score` (SQL `numeric(7,1)` tự làm tròn, không từ chối) để khớp validate domain (A-91) và import; `weekly_target_minutes` chỉ kiểm khoảng như SQL (không kiểm bước 30, như SQL).
7. **S11:** dòng `roadmapsUnavailable` dùng `className="note rm-note"` (DESIGN nói `class="note"`; `.note` chưa có style toàn cục nên thêm `.rm-note` trong `roadmaps.css`: `--info-soft`/`--info`, icon `info` 16 px, `flex`, `min-width: 0`, không `nowrap`).
8. **Chỉ báo khi cloud thiếu bảng = "N changes waiting", không phải "Synced"** (TASKS Demo/AC7 ghi "trạng thái Synced", DESIGN ghi "không đổi `SyncIndicator` (vẫn `Synced`)"): ARCH §4.8 (h) quy định `watchPendingCount` cộng hàng `dirty = 1` của cả 6 bảng và AC7 nói "số chờ về 0" sau khi bật bảng — tức số chờ > 0 trong lúc thiếu bảng — nên `indicatorState` hiện có cho `pending` ("32 changes waiting"), không `error`/`expired`/"Sign in again"; chu kỳ vẫn `idle`, `Last synced` cập nhật, card có dòng gợi ý. Nếu designer/QC muốn chip "Synced" trong trường hợp này thì cần quyết định tách số chờ roadmap khỏi `pending` (đổi ARCH); e2e `m18-roadmap-sync.spec.ts` test 2 assert `pending` + "32 changes waiting".
9. **`two-devices.ts`**: `snapshot()`/`serverSnapshot()` giữ nguyên dạng `{ goals, entries }` (QC `tests/qc/m7-r1-oracle.test.ts:220–222` deep-equal dạng này); thêm `snapshotAll()`/`serverSnapshotAll()` 6 bảng cho `expectConverged` và test M18.
10. **Test cũ bị ảnh hưởng (dev đã sửa, không đổi hành vi):**

| File | Thay đổi | Lý do |
| :- | :- | :- |
| `src/services/sync-service.test.ts:77` | chuỗi `calls.map(method)` `['push','fetchByIds','pull','pull','pushPrefs']` → 6 `pull` | chu kỳ kéo 6 bảng (ADR-50) |
| `src/services/sync-service.test.ts:474` | `pulls()` thêm `['roadmaps', null]` … `['roadmap_checkpoints', null]` sau goals/entries | thiết bị cũ kéo 4 bảng mới từ `null` |
| `src/services/sync-service.test.ts` "single-flight" (chờ 120 → 400 ms) và "the scheduled retry runs a cycle by itself" (chờ 20 → 100 ms) | chỉ nới thời gian chờ, assertion giữ | chu kỳ có thêm 4 pull × `delayMs`; test thứ hai đã flaky từ M7 (lần chạy chung với e2e đỏ, chạy riêng 3/3 xanh ở cả hai bản) |
| `src/data/dexie/roadmap-repo.test.ts:209` | "watchPendingCount does not count roadmap rows yet" → đếm +1 | M18 đếm roadmap (TASKS M17 ghi "M18 adds them") |
| `src/services/sync-convergence.test.ts` | `expectConverged` thêm 4 bảng (assertion cũ giữ); random test đổi phân bố xác suất để thêm thao tác roadmap (chuỗi thao tác đổi, cùng seed) | M18-AC4 |
| `e2e/m10-bundle.spec.ts`, `e2e/cloud/m10-bundle.spec.ts`, `e2e/cloud/m6-lazy.spec.ts` | thêm assertion: không request `sync-engine` lúc tải lạnh / khi duyệt signed-out; bản cloud tắt không phát chunk; bản cloud bật có đúng 1 chunk chứa `opb-sync`; bấm Sign in nạp 1 chunk | lazy sync |
| `tests/db/remote-store.test.ts` | `reset()` xoá thêm 4 bảng roadmap | contract 6 bảng trên Postgres |
| Spec `cloud` đếm request mỗi chu kỳ | **không có spec nào phải đổi**: `m7-sync` lọc `POST /rest/v1/entries`, `m7-merge:153` so tổng REST trước/sau (cùng chu kỳ), `m7-import-perf` lấy max batch | — |
| `tests/qc/**` | **không chạm**; chạy chung trong `npm run check` tất cả pass (kể cả `m7-r1-oracle`, `m10-r1-purge-oracle`, `m14-r1/r2-service`). QC lưu ý: spec QC nào đếm `calls.map(method)` của Fake hoặc số `GET /rest/v1/*` mỗi chu kỳ sẽ thấy +4 pull/chu kỳ; `/__test/rows` nay trả 7 khoá (các spec dùng `rows.goals/entries/settings` không ảnh hưởng) | QC re-target nếu có |

## 8. Known issues và giới hạn

**Ngân sách tải lạnh `#/today` (gzip 9, cách `e2e/helpers/bundle.ts`; số từ `tests/qc/*m17-r1-budget.spec.ts` chạy trên HEAD).**

| Bản | Baseline `1fb3baf` (= M17) | Sau M18 | Δ | Headroom tới 230.000 |
| :- | :- | :- | :- | :- |
| cloud tắt (`e2e/m10-bundle.spec.ts`) | **229.454 B** (5 response: html 573 · rolldown-runtime 428 · css 9.828 · core 18.104 · index 200.521) | **226.611 B** (5 response: html 572 · rolldown-runtime 428 · css 9.828 · core 18.104 · index 197.679) | **−2.843 B** | 3.389 B |
| cloud bật (`e2e/cloud/m10-bundle.spec.ts`) | **229.658 B** (html 587 · rolldown-runtime 428 · css 9.843 · core 18.105 · index 200.695) | **227.032 B** (html 588 · rolldown-runtime 428 · css 9.843 · core 18.105 · index 198.068) | **−2.626 B** | 2.968 B |

Ước lượng byte gzip theo thành phần (đọc từ diff + kích thước chunk, ±30 %):

| Thành phần | ≈ gzip trên đường tải lạnh |
| :- | :- |
| **Rời khỏi index**: `SyncService` + `DexieSyncStore` + `remote-store` → chunk `sync-engine-*.js` (5.143 B gzip đo trực tiếp) + `sync-tables-*.js` (317 B) | **−5,1 kB** |
| Thêm `LazySyncEngine` (`services/lazy-sync-engine.ts`) | +0,9 kB |
| Container: `importSyncEngine` + `buildSyncService` + auth watch nạp engine | +0,2 kB |
| `repositories.ts`: `SYNC_LOCAL_TABLES`, `emptyChanges`, `changesCount`, JSDoc (kiểu không tính) | +0,15 kB |
| `purge-tombstones.ts` (code cũ chuyển chỗ, generic 6 bảng thay `ROADMAP_TABLES` spread) | ±0 |
| `settings.account.roadmapsUnavailable` en + vi trong resource chính (≈ 190 + 170 ký tự) | +0,3 kB |
| `AccountCard` dòng gợi ý + `Icon` (đã có) | +0,1 kB |
| Dexie, `db.ts`, `domain/sync.ts`, `normalizeSyncMeta`, scheduler, StatusRow: vẫn eager như trước (AuthService/maintenance cần) | 0 |
| **Tổng ước lượng** | **≈ −3,4 kB** (đo thực: −2,8 / −2,6 kB; phần lệch là wrapper chunk + import map của Rolldown) |

Ước lượng −6 kB của handoff M17 không đạt vì `repositories.ts`, `domain/sync.ts`, `db.ts`/Dexie và `kv`-watch của `AuthService` đã nằm trên đường tải lạnh từ trước (không thuộc engine). Phương án giảm thêm nếu M19/M20 chạm ngưỡng (ARCH §10): (1) tách phần roadmap của `backup-repo`/`backup-service` thành module lazy (≈ −400 B); (2) `lazy-sync-engine` thu gọn API (bỏ các phương thức chỉ test dùng, ≈ −200 B); (3) chuyển `normalizeSyncMeta`/`SyncMeta` khỏi `repositories.ts` nếu AuthService chỉ cần `userId/account` (≈ −300 B); (4) gộp `rolldown-runtime` vào `core` (chưa tìm được id ổn định).

**Khác:**
- `tests/db/**` chưa chạy trên Postgres thật (máy không Docker): M18-AC6 phần hành vi = **NV-22**, kiểm ở U31 (README mô tả truy vấn kiểm). Idempotence "chạy hai lần" chỉ kiểm tĩnh (mọi `create` có `if not exists`/`drop … if exists`) + U31 chạy lần hai.
- 20 spec e2e đỏ sẵn trên `main` (QC report M17 §6: trôi lịch `freezeClock`, tương phản D4/D6, token v7 status bar) **không sửa trong M18** theo quyết định user (task riêng); M18 không chạm các file đó. Phân loại trong §10.
- `src/services/sync-service.test.ts` "the scheduled retry runs a cycle by itself" vẫn có lúc flaky khi chạy chung (đã biết từ M7); lần chạy cuối pass.
- Bản app cũ (iOS/PWA chưa cập nhật) không biết 4 bảng → không đọc/ghi chúng (ARCH §10 v8.0); bản mới trên project chưa U31 → dòng gợi ý, không mất dữ liệu.
- `MergePrompt`/D5 và D4 vẫn chỉ nêu goals/entries (DESIGN M18 không đổi copy); `prepareFirstSignIn` đã tính roadmap để hỏi D5 khi thiết bị chỉ có lộ trình.
- Không có biến môi trường mới; `.env.example` không đổi.

## 9. Dispute (nếu có)

Không.

## 10. Kết quả lần chạy cuối

(ghi sau khi `npm run check` và `npm run test:e2e` 3 project chạy xong — xem cuối file)
