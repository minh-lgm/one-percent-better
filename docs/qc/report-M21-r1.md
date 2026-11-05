# QC report — M21 round 1

**Verdict:** PASS
**Ngay:** 2026-11-05  **Commit:** 769fc74 (nhanh feat/m21-roadmap-hours) + re-target `tests/qc/**` (commit QC kem theo)

## 1. Tom tat

Tat ca AC1-AC6 PASS co bang chung tu chay. Khong con defect Critical/Major. Tu goc nhin user: lo trinh QPT (fixture Q1) hien "Da hoc 6,6 gio" = Goal detail 395 phut, dong "Gom 0,8 gio tu truoc ngay bat dau lo trinh." hien dung; o ngay "Bat dau/Ket thuc thuc te" hien du `27/10/2026`, `01/11/2026` o 690 px vi (dark) va 360 px. AC7 la viec designer, DESIGN v8.3 co san (da doc, khop copy). 2 Minor/de xuat khong chan. Phan hien thi tren Firefox/Safari va lo trinh QPT that tren Pages la NOT VERIFIED (muc 8).

## 2. Moi truong va lenh da chay

| Buoc | Lenh | Ket qua |
| :- | :- | :- |
| Vitest (truoc re-target) | `npx vitest run` | 212 file / 2827 test: 3 do, deu o `tests/qc/**` (m17-r1-domain:57, m19-r1-copy:56, m20-r1-copy:56), dung nhu handoff |
| Vitest (sau re-target) | `npx vitest run` | **212/212 file, 2827/2827 pass** |
| Lint | `npm run lint` | 0 loi, 0 warning |
| Typecheck | `npx tsc -b --noEmit` | 0 loi |
| Audit | `npm audit --omit=dev` | 0 vulnerabilities |
| E2E 3 project | `npm run test:e2e` (9,7 phut, truoc khi them spec QC moi) | 857 pass / 21 fail. 20 fail = dung danh sach do san tren main (report-final-phase8 §6); 1 fail con lai = `cloud/m6-r1-flow.spec.ts:142` (flaky da biet; chay rieng lai van do trong 1 lan thu, khong lien quan M21, khong cham roadmap) |
| Spec QC moi | `npm run test:e2e -- --project=chromium tests/qc/m21-r1-explore.spec.ts` | 5/5 pass |
| Ngan sach | `BUDGET-EXACT` trong full e2e | chromium **227.177** B, cloud **227.591** B (<= 230.000; delta -3 / +5 so voi 227.180 / 227.586) |
| Bat bien du lieu | `git diff abd6fd7 -- src/data/dexie/db.ts supabase/ src/domain/backup-file.ts src/domain/backup.ts src/services/sync-service.ts` | 0 dong |
| Copy cu | `git grep -nE "aren't counted here\|khong tinh o day" -- src` | 0 (dev), parity test pass |

## 3. Acceptance criteria

| AC | Ket qua | Bang chung |
| :- | :- | :- |
| M21-AC1 | PASS | `npx vitest run` toan bo pass, gom `src/domain/roadmap-progress.test.ts` (oracle v8.3, property test 200 lo trinh, so voi `goalStats`) va `tests/qc/m17-r1-domain.test.ts` (brute-force :76-115 pass khong sua; chi :57 re-target 345 -> 395 theo bang TASKS). Doc code `roadmapView`: `hoursDoneMinutes = Σ item + outside`, `beforeStartMinutes` chi tinh ngay < min plannedStart; entry lay tu `linkedGoalData` da loc `isLive` (khong tinh entry da xoa). |
| M21-AC2 | PASS | `e2e/m21-roadmap-hours.spec.ts` pass trong full e2e: vi-VN 360 va en-US 1440. QC E2 (`tests/qc/m21-r1-explore.spec.ts`): doi W1 ket thuc 10-29 -> tong van `6.6 h`, dong chua cau chung "outside every item". Anh QC E5 (vi 360 dark): "6,6 gio" / "Gom 0,8 gio tu truoc ngay bat dau lo trinh." / "Ke hoach den het tuan nay: 16 gio" - doc duoc, khong tran. |
| M21-AC3 | PASS | `e2e/m21-roadmap-hours.spec.ts` (en): Goal detail 395 = 6.6 h; +30 phut -> 425 / 7.1 h / W2 1.8 h / 105/480 / outside van 0.8 h; archive -> 7.1 h + ghi chu archived; xoa goal -> "—". Pass trong full e2e. |
| M21-AC4 | PASS | parity test 7/7 + e2e; DESIGN v8.3 muc 7.9.2 doi chieu bang `tests/qc/m20-r1-copy.test.ts` (nay quet ca hang M21: `howHours.body`, 2 key moi, en + vi nguyen van) pass. axe light+dark trong spec dev pass. |
| M21-AC5 | PASS | `e2e/m21-date-inputs.spec.ts` 4/4 trong full e2e. QC doc lap (E4): quet bề rong 320..1500 buoc 20 (60 muc) x en-US/vi-VN, 2 o ngay thuc te cua W1: `actual >= natural - 0.5`, khong chong len nut Hom nay/Xoa, khong cuon ngang -> 0 vi pham. Xem anh dev `docs/handoff/m21/m21-dates-vi-690-dark-after.png` va `...-360-dark-after.png`: thay `27/10/2026`, `01/11/2026` day du, nut xuong dong nguyen cap. Day la loi user bao (690 px vi dark): da het. |
| M21-AC6 | PASS | Muc 2: vitest sach, lint/tsc sach, ngan sach, khong doi schema/sync/backup. README co cau cach tinh moi (dev; QC khong thay doi). 3 project e2e: khong fail ngoai 20 spec do san + flaky da biet. |
| M21-AC7 | PASS (designer) | DESIGN v8.3 co Changelog, `howHours`, 2 key `hours-outside` (en+vi), token `--date-min`; copy trong app khop (test QC m20 copy). |

## 4. Defect

Khong co defect Critical hoac Major. Khong mo defect Minor.

(Ghi nhan khong phai defect, xem muc 9.)

## 5. Kiem lai defect vong truoc

Khong co (vong 1).

## 6. Regression

- Toan bo vitest (2827) va e2e 3 project: khong test nao do ngoai danh sach da biet. Cac assertion QC da re-target (m17-r1-explore, m19-r1-accept x3, m20-r1-accept, cloud/final-phase8-journey x2) deu pass voi gia tri moi.
- Ngan sach tai lanh trong +-50 B.

**Danh gia re-target `tests/qc/**` (9 assertion + 2 test copy):**
- 9 assertion dung bang TASKS: 345 -> 395 (domain), `5.8 h`/`5,8 gio` -> `6.6 h`/`6,6 gio` (explore :49/:53, accept m19 :38/:69/:135, m20 :132, final-phase8-journey :44/:77). Doi chieu: moi gia tri moi suy ra doc lap tu fixture (50+60+90+120+45+30 = 395 phut = 6,58 gio -> 6,6) va khop `goalStats`, khong chi "doi theo code". Khong noi long kiem tra nao: giu nguyen toan bo phep so sanh khac (item 270/75/0, 75/480).
- 2 test copy (`m19-r1-copy:56`, `m20-r1-copy:56`): developer chan doan dung - parser QC `^\| \`key\` \| (M\d+)` khong nhan cot MS in dam `**M21 *(moi v8.3)***`. Day la loi parser QC (khong phai thieu key hay copy sai): sua regex thanh `\*{0,2}(M\d+)` va hop le. Them: `m20-r1-copy` nay nhan hang M21 vao tap kiem "nguyen van" (live + dem hang) nen 2 key moi duoc doi chieu en/vi voi DESIGN (pass), khong chi duoc cho qua khoi danh sach "key thua". `m19-r1-copy` chi nhan parser (pham vi M17/M19 giu nguyen). Khong lam yeu kiem tra: cap key thua van bi bat.
- `tests/qc/m17-r1-format.test.ts` khong doi (dung bang TASKS).

## 7. Bao mat

- Khong secret trong repo/handoff moi; `.env`/`.env.local` khong duoc track. `npm audit --omit=dev`: 0.
- Khong them endpoint, khong doi quyen, khong doi du lieu/sync/backup (diff 0). Hien thi so/chuoi qua i18n + `useFormat`, khong chen HTML. Khong thay rui ro injection moi.

## 8. Chua kiem chung duoc (NOT VERIFIED)

- O ngay tren Firefox, Safari desktop, Safari iOS: chi do Chromium (DESIGN A-D99 b). Cach tu kiem: mo `#/roadmaps/<id>` sau khi len Pages, mo "Ngay & ghi chu" cua mot muc o 360 va ~690 px, xem du `dd/mm/yyyy`. Dev nen luu y: san `--date-min` (166/176 px) nho hon do rong tu nhien tren Chromium (175/214 px) nen tren trinh duyet khong ho tro `width:max-content` cho o date, san khong du bao ve (handoff §7.2) - rui ro chi o trinh duyet khac, chua kiem.
- Lo trinh QPT that cua user tren Pages (goal `7ea38fbe-...`, so gio = tong goal): can sau deploy. Cach kiem: so "Gio da hoc" tren lo trinh voi tong phut cua goal trong Goal detail.

## 9. De xuat (khong chan)

1. OQ-D88 (an `hours-outside` khi lo trinh chua co muc) la quyet dinh tam cua orchestrator, khong tinh la defect. Luu y user: voi lo trinh co goal lien ket nhung chua co muc, tong gio hien dung nhung khong co dong giai thich.
2. Planner sua ARCH §4.8 (c) cho khop UI (an khi chua co muc), designer xet nang san `--date-min` len ~`calc(10ch + 72px)` (de xuat cua dev §7.2).
3. Lam tron hien thi doc lap: tong = 6,6 co the lech 0,1 gio so voi tong cac phan (bat bien ARCH, khong phai loi).
4. `cloud/m6-r1-flow.spec.ts:142` flaky da biet: lan chay lai rieng van do mot lan; dang gop vao nhom flaky/do san, khong lien quan M21 (khong cham roadmap).
