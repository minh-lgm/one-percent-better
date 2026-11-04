# QC report — M18 round 1

> Ghi chú orchestrator: QC agent không ghi được file này (Write tool bị harness từ chối "Subagents should return findings as text", heredoc Bash lỗi quoting). Orchestrator chép nguyên văn nội dung QC trả về; test QC đã được QC commit ở 21be3d3 (`tests/qc/m18-r1-sync.test.ts`, `tests/qc/m18-r1-lazy.test.ts`, `tests/qc/cloud/m18-r1-demo.spec.ts`).

**Verdict:** FAIL
**Date:** 2026-11-04  **Commit:** 661e46c (baseline before M18 = 1fb3baf)

## 1. Summary
M18 meets nearly every AC. FAIL because of 1 new Major defect (M18-D1) from the lazy sync.

- Lint and typecheck exit 0. `npx vitest run`: 2.681/2.681 before QC tests, then 2.693 pass + 1 expected fail with QC tests. `npm run check` exit 0. `test:db` prints "skipped", exit 0. `npm audit --omit=dev` finds 0 (zod 4.6.7). The `service_role|sb_secret_` grep only hits the two QC regexes.
- Full e2e (3 projects, 8.7 min): 804 pass / 23 fail. 20 fail = exactly the M17 §6 list, unchanged, not counted as M18 defects. 3 are load-flaky and pass alone: `m11-r1-explore:88`, `m5-r2:26`, `cloud/m7-r1-converge:119` (24/24 over 3 repeats).
- Budget (exact gzip bytes, `BUDGET-EXACT`): cloud off 226.606, cloud on 227.036. M17 baseline per handoff was 229.454 / 229.658, so 2.848 / 2.622 lower. Both are under 230.000.
- AC1, AC2, AC3, AC4, AC5, AC7 pass on QC's own tests plus the developer's. The AC5 PASS excludes the engine-load-failure case (M18-D1).
- AC6: static conditions pass. QC read the SQL and checked every listed item. The two old migrations show an empty diff. Postgres behaviour is NOT VERIFIED (no Docker).
- AC8: pass on its own terms (check, e2e classified, budget, grep, README has U31). The milestone is still FAIL because of M18-D1.
- Lazy sync (user decision):
  - Cold `#/today` signed out requests no `sync-engine` chunk, and no eager script contains `opb-sync`.
  - The cloud-off `dist` has no such chunk.
  - Sign in loads a single chunk URL (at most 2 fetches, because the OAuth round trip is two page loads).
  - A stored session loads the engine at startup and syncs without any click.
  - ESLint fails static imports of `services/sync-service` or `data/dexie/sync-store` from `src/main.tsx`, `src/app/**` and `src/ui/**`. `import type` and `import()` are allowed.
  - `LazySyncEngine` offline: `syncNow` returns `SYNC_UNREACHABLE` without throwing, and the next call retries the load.
- Re-targeting: no existing tests/qc file needed a change. QC fixed two mistakes in its own new spec: counting the chunk fetch twice, and `getByText(/sign in again/i)` matching a hidden delete-account dialog.
- `sync-service.test.ts` assertion changes (2 pull-count assertions plus 2 timing waits) are legitimate re-targets, but TASKS M18-AC3 says "no assertion changes". `sync-store.test.ts` (M7) is untouched.

## 2. Environment and commands
| Step | Command | Result |
| :- | :- | :- |
| Lint | `npm run lint` | exit 0, 0 warnings |
| Typecheck | `npm run typecheck` | exit 0 |
| Vitest | `npx vitest run` | before QC tests: 198 files, 2.681/2.681. After QC tests: 200 files, 2.693 pass + 1 expected fail |
| Check | `npm run check` | exit 0 |
| DB | `npm run test:db` | "skipped", exit 0 |
| Audit | `npm audit --omit=dev` | 0 vulnerabilities |
| Secret | `git grep -nE "service_role\|sb_secret_" -- . ":!docs"` | only `tests/qc/m11-r1-open-ended.test.ts:298` and `tests/qc/m14-r1-static.test.ts:30` (QC regexes) |
| Full e2e | `npm run test:e2e` | 804 pass / 23 fail, classified in §6 |
| Budget + lazy + M18 | the `--project=chromium --project=cloud` run of the m10-bundle, m17 budget, m6-lazy, m18 specs and `m18-r1-demo` spec | pass after fixing QC's own spec |
| ESLint probes | `npx eslint --stdin --stdin-filename ...` | static imports of the engine from `src/main.tsx`, `src/app/**`, `src/ui/**` are blocked |

Budget (exact bytes): cloud off 226.606 (html 571, css 9.828, runtime 428, core 18.104, index 197.675). Cloud on 227.036 (html 586, css 9.843, runtime 428, core 18.105, index 198.074). The handoff says 226.611 / 227.032.

## 3. Acceptance criteria
| AC | Result | Evidence |
| :- | :- | :- |
| M18-AC1 | PASS | `m18-r1-sync.test.ts`: 32 dirty roadmap rows, order roadmaps → phases → items → checkpoints. Newer `rq` tombstone → 31 children soft-deleted, dirty 1, idempotent. Older tombstone → keptLocal 1, no cascade. Phase tombstone only hits its own items. Orphan count correct (second run 0). `markAllDirty` 32. `normalizeSyncMeta` gives 4 null cursors. M7 `sync-store.test.ts` diff is empty. |
| M18-AC2 | PASS | `"32.0"` and `32` → 32. `position 'NaN'`, reversed planned dates, 201-char title, reversed actual dates, span > 366 days all dropped. Round-trip deep-equal for 4 tables. 403 `42501` on `roadmaps` → `tableMissing`; on `goals` → `SYNC_UNAUTHORIZED`. Contract suite (Fake + mock) passes. |
| M18-AC3 | PASS | Missing tables: ok, core dirty 0, 32 roadmap dirty 1, flag on, not expired. Re-enable → dirty 0, flag off. The developer's 8 service tests (old cursors, 500, no `markRejected`) pass. |
| M18-AC4 | PASS | A→B identical on 6 tables, also equal to the server. Delete roadmap vs offline add item converges. The developer's 5 scenarios and random 20×200 pass. First sync of Q1 under 15 s. |
| M18-AC5 | PASS (excl. M18-D1 case) | `markAllDirty` 32, `clearUserData` empties 4 tables. E2E delete account → 0 rows in 7 tables. |
| M18-AC6 | PASS static / NOT VERIFIED on Postgres | QC read the SQL and checked each AC6 condition. The two old migrations show an empty diff. |
| M18-AC7 | PASS | The developer's 3 specs and QC's 2 specs: hint text verbatim in Settings and `#/roadmaps`, no visible "Sign in again", pending 32 → 0 after enabling, B receives Q1, requests only to {4174, 54321}. |
| M18-AC8 | PASS on its own terms; milestone FAIL because of M18-D1 | check exit 0, e2e classified, budget, grep, README has U31. |

## 4. Defects
**M18-D1 [Major]** — consent bypass when the engine chunk fails to load during sign-in
- Steps: `tests/qc/m18-r1-lazy.test.ts` (`it.fails`). The device holds U1's data, U2 signs in, the first engine load fails (stale hashed chunk after a deploy, or flaky network after the OAuth callback), then a later `syncNow('visible')` runs.
- Expected: `confirm-merge` (D5) and nothing uploaded to U2 (FR-47, A-27).
- Actual: `LazySyncEngine.handleSignedIn` returns `'same-user'` with no `bindUser` and no prompt. The scheduler never calls it again. The next `syncNow('visible')` uploads U1's 6 goals to U2 (`{decision: 'same-user', uploaded: 6}`).
- Location: `src/services/lazy-sync-engine.ts` `handleSignedIn` catch branch, `src/app/sync-scheduler.ts` ~l.62-66 (calls `handleSignedIn` only once per sign-in).
- Low probability, but it bypasses the user's consent. Once fixed, flip `it.fails` to `it`.

**M18-D2 [Minor]**: lint only blocks static imports. `import('../services/sync-service')` in `src/app/z.ts` or `src/ui/**` passes lint (`eslint.config.js` `SYNC_LAZY_RULE`).

**M18-D3 [Minor]**: `README.md:224` says the chip shows "Synced" while the migration is missing. It actually shows "32 changes waiting to sync" (handoff §7.8). The U31 row is correct.

## 5. Previous-round defects
None (round 1).

## 6. Regression
- The 20 M17 §6 specs are unchanged: `e2e/cloud/m7-sync:25,:165`, `m7-merge:79,:106,:137`, `m7-i18n:48`, `m15-d6-layout:36` ×2, `m14-delete-account:226`, `m8-prompts:242`, `tests/qc/cloud/final2-journey:109` ×4, `m14-r1-explore:282`, `m6-r1-ui:74` ×2, `m7-r1-ui:233`, `m6-r1-flow:159`, `tests/qc/native/m13-r1-native-shell:105`.
- 3 load-flaky specs pass alone: `m11-r1-explore:88`, `m5-r2:26`, `cloud/m7-r1-converge:119`.
- No existing tests/qc file needed a re-target.
- The developer's changes to `sync-service.test.ts` and `roadmap-repo.test.ts:209` are legitimate re-targets and don't weaken any assertion. They contradict the "no assertion changes" wording in AC3.
- Two mistakes in QC's own new spec were fixed: chunk URL counted twice, and a hidden dialog matching "sign in again".

## 7. Security
No new secrets. Audit 0. The RLS reading found no cross-user path. The mapper validates strictly and drops bad rows without throwing. The lenient 404 mapping can only mislabel a real 404 as "not migrated", with no data loss. See M18-D1 for the consent risk.

## 8. NOT VERIFIED
- SQL behaviour on real Postgres. User check at U31: run the file twice in SQL Editor and expect "Success" both times, then run the three verify queries at the end of the file.
- Real-device display.
- A stale hashed chunk after deploy in real life (simulated with a fake loader).
- The random 20×200 convergence (developer test only).

## 9. Suggestions and open questions
1. Chip wording while the migration is missing: TASKS and DESIGN say "Synced", ARCH §4.8 (h) forces "N changes waiting". Designer and planner should pick one. The behaviour is acceptable, with no "Sign in again" and pending reaches 0 after U31 (QC's read: Minor, doc mismatch).
2. Accept or reject the lenient 404-without-code → `tableMissing` (handoff §7.5). QC does not count it as a defect.
3. U31 must be done by the user before the orchestrator pushes `main`. Pushing earlier is safe (ADR-52): goals and entries sync, roadmap rows wait, and the Account card shows the hint.
4. Fix M18-D1 so that a load failure during sign-in does not mean `same-user`: retry the sign-in flow once the engine loads, or keep sync paused until D5 is decided. Then flip `it.fails` to `it`.
5. Add a lint rule against `import()` of the engine outside `container.ts`.
6. Confirm the 20 red specs stay out of M18 (separate task).
