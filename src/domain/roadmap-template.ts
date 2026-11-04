// The "QPT 21 weeks" roadmap template (phase 8, M20; ARCHITECTURE §4.8 e; FR-76, A-86; DESIGN v8.0 §7.9.3).
// Pure data + one builder. The content is user data once created (not UI copy, never through `t()`): the `vi` text
// is verbatim from docs/plan/ref/qpt-tracker.html (`PHASES[].weeks`, the "Nhịp học mỗi tuần" block, MILESTONES), the
// `en` text is the designer's translation in DESIGN §7.9.3. Lazy-only module (ADR-53, eslint ROADMAP_LAZY_RULE): only
// `RoadmapService` (its own lazy chunk) imports it, so none of this text is on the cold-load path.
import { addDays } from './dates';
import { addDaysOrNull, type Roadmap, type RoadmapAggregate, type RoadmapCheckpoint, type RoadmapItem, type RoadmapPhase } from './roadmap';
import type { ISODate, ISODateTime } from './types';

/** The languages the template ships in (same values as the app `Locale`; the domain does not import i18n). */
export type TemplateLocale = 'en' | 'vi';

export interface QptTemplateContent {
  title: string;
  milestoneLabel: string;
  /** The weekly-rhythm note, one line per entry, joined with `\n`; line 1 is the heading. */
  noteLines: readonly string[];
  /** title, note, number of weekly items (4, 4, 4, 4, 5 = 21). */
  phases: ReadonlyArray<readonly [title: string, note: string, weeks: number]>;
  /** Item titles W1 … W21. */
  weeks: readonly string[];
  /** title, week whose planned end is the date (`0` = the start date), threshold, note. Maximum score 32 for all. */
  checkpoints: ReadonlyArray<readonly [title: string, week: number, threshold: number | null, note: string]>;
}

export const QPT_WEEKS = 21;
/** The exam week (FR-76: the milestone date is its planned start). */
export const QPT_EXAM_WEEK = 20;
export const QPT_WEEKLY_TARGET_MINUTES = 480;
export const QPT_MAX_SCORE = 32;

const CHECKPOINT_WEEKS = [
  ['Diagnostic', 0, null],
  ['Checkpoint 1', 8, null],
  ['Checkpoint 2', 16, 20],
  ['Mock 1', 18, 24],
  ['Mock 2', 19, 26],
] as const;

export const QPT_TEMPLATE: Readonly<Record<TemplateLocale, QptTemplateContent>> = {
  vi: {
    title: 'QPT 21 tuần',
    milestoneLabel: 'Thi QPT',
    noteLines: [
      'Nhịp học mỗi tuần',
      'Thứ 2–4: 1h/tối · video + ghi chú tay',
      'Thứ 5: 1h · quiz, ghi câu sai vào sổ lỗi',
      'Thứ 7: 2h · lab + 10–15 bài tập ngoài',
      'Chủ nhật: 1h · ôn sổ lỗi, tick tuần',
      'Thứ 6: Buffer',
      'Quiz chưa đạt 80% thì chưa sang module mới.',
    ],
    phases: [
      ['Phase 1 · Linear Algebra', 'Course 1 · 34h', 4],
      ['Phase 2 · Calculus', 'Course 2 · 27h', 4],
      ['Phase 3 · Probability & Statistics', 'Course 3 · 33h', 4],
      ['Phase 4 · Differential Equations', 'HKUST · Chasnov', 4],
      ['Phase 5 · Lấp lỗ hổng & thi QPT', 'Mock + hồ sơ', 5],
    ],
    weeks: [
      'Systems of linear equations: singular vs non-singular, determinant',
      'Solving systems: elimination, row echelon form, rank',
      'Vectors & linear transformations: dot product, nhân ma trận, nghịch đảo',
      'Determinants in depth & eigenvectors: basis, span, eigenvalue, PCA',
      'Derivatives & optimization một biến',
      'Gradients & gradient descent (nhiều biến)',
      "Optimization in neural networks, Newton's method",
      'Buffer Noel + Checkpoint 1 + bù tích phân',
      'Probability cơ bản & các phân phối',
      'Describing distributions: kỳ vọng, phương sai, random vector',
      'Sampling & point estimation: MLE, MAP',
      'Confidence interval & hypothesis testing',
      'First-order ODE: separable, linear, Euler method',
      'Tết: nghỉ hoặc ôn nhẹ, không giao bài mới',
      'Second-order ODE, Laplace transform',
      'Systems of ODE + Checkpoint 2',
      'Ôn 2 mảng yếu nhất theo Checkpoint 2',
      'Discrete math + mock QPT lần 1; gom hồ sơ',
      'Sửa lỗi từ mock 1 + mock QPT lần 2',
      'Thi QPT chính thức',
      'Buffer; hoàn tất và nộp hồ sơ trước hạn',
    ],
    checkpoints: CHECKPOINT_WEEKS.map(([title, week, threshold]) => [title, week, threshold, week === 8 ? '≥ 3/4 mỗi mảng LA, Calc' : ''] as const),
  },
  en: {
    title: 'QPT 21 weeks',
    milestoneLabel: 'QPT exam',
    noteLines: [
      'Weekly rhythm',
      'Mon–Wed: 1 h each evening · video + handwritten notes',
      'Thu: 1 h · quiz, log wrong answers in your mistakes notebook',
      'Sat: 2 h · lab + 10–15 extra exercises',
      'Sun: 1 h · review the mistakes notebook, tick off the week',
      'Fri: buffer',
      'Quiz below 80% means no new module yet.',
    ],
    phases: [
      ['Phase 1 · Linear Algebra', 'Course 1 · 34h', 4],
      ['Phase 2 · Calculus', 'Course 2 · 27h', 4],
      ['Phase 3 · Probability & Statistics', 'Course 3 · 33h', 4],
      ['Phase 4 · Differential Equations', 'HKUST · Chasnov', 4],
      ['Phase 5 · Close the gaps & sit the QPT', 'Mock + application', 5],
    ],
    weeks: [
      'Systems of linear equations: singular vs non-singular, determinant',
      'Solving systems: elimination, row echelon form, rank',
      'Vectors & linear transformations: dot product, matrix multiplication, inverse',
      'Determinants in depth & eigenvectors: basis, span, eigenvalue, PCA',
      'Derivatives & optimization in one variable',
      'Gradients & gradient descent (several variables)',
      "Optimization in neural networks, Newton's method",
      'Christmas buffer + Checkpoint 1 + integral catch-up',
      'Basic probability & distributions',
      'Describing distributions: expected value, variance, random vectors',
      'Sampling & point estimation: MLE, MAP',
      'Confidence interval & hypothesis testing',
      'First-order ODE: separable, linear, Euler method',
      'Lunar New Year: rest or light review, no new material',
      'Second-order ODE, Laplace transform',
      'Systems of ODE + Checkpoint 2',
      'Review the 2 weakest areas from Checkpoint 2',
      'Discrete math + QPT mock 1; gather application documents',
      'Fix mistakes from mock 1 + QPT mock 2',
      'Official QPT exam',
      'Buffer; finish and submit the application before the deadline',
    ],
    checkpoints: CHECKPOINT_WEEKS.map(([title, week, threshold]) => [title, week, threshold, week === 8 ? '≥ 3/4 per area: LA, Calc' : ''] as const),
  },
};

/** Id for the n-th (1-based) row of a kind; `RoadmapService` passes fresh UUIDs, tests pass readable ids. */
export type TemplateIds = (kind: 'roadmap' | 'phase' | 'item' | 'checkpoint', n: number) => string;

/**
 * M20-D1: whether a template starting on `startDate` fits the storable dates — the latest derived date is the end of
 * W21 (`start + 146`; checkpoints end at W19, the milestone is the start of W20).
 */
export function qptTemplateFits(startDate: string): boolean {
  return addDaysOrNull(startDate, 7 * QPT_WEEKS - 1) !== null;
}

/** Planned start of week `k` (1-based) for a template starting on `startDate` (throws past 9999-12-31, see `addDays`). */
export const qptWeekStart = (startDate: ISODate, k: number): ISODate => addDays(startDate, 7 * (k - 1));
/** Planned end of week `k` (1-based). */
export const qptWeekEnd = (startDate: ISODate, k: number): ISODate => addDays(startDate, 7 * k - 1);

/**
 * The 32 rows of the template (1 roadmap, 5 phases, 21 items, 5 checkpoints; ARCHITECTURE §4.8 e). Item k runs
 * `startDate + 7(k−1)` … `+6`; the milestone is the start of week 20; checkpoints sit on the start date (Diagnostic)
 * and on the planned end of W8 / W16 / W18 / W19. Every row carries `now` as `createdAt` / `updatedAt`; no actual
 * dates, no scores. `startDate` must be a valid ISO date that `qptTemplateFits` (the service checks both; otherwise
 * `addDays` throws a RangeError rather than writing a 5-digit year).
 */
export function buildQptTemplate(startDate: ISODate, locale: TemplateLocale, ids: TemplateIds, now: ISODateTime): RoadmapAggregate {
  const c = QPT_TEMPLATE[locale];
  const roadmapId = ids('roadmap', 1);
  const roadmap: Roadmap = {
    id: roadmapId,
    title: c.title,
    note: c.noteLines.join('\n'),
    goalId: null,
    weeklyTargetMinutes: QPT_WEEKLY_TARGET_MINUTES,
    milestoneLabel: c.milestoneLabel,
    milestoneDate: qptWeekStart(startDate, QPT_EXAM_WEEK),
    createdAt: now,
    updatedAt: now,
  };
  const phases: RoadmapPhase[] = [];
  const items: RoadmapItem[] = [];
  let week = 0;
  c.phases.forEach(([title, note, weeks], p) => {
    const phaseId = ids('phase', p + 1);
    phases.push({ id: phaseId, roadmapId, title, note, position: p, createdAt: now, updatedAt: now });
    for (let k = 0; k < weeks; k += 1) {
      week += 1;
      items.push({
        id: ids('item', week),
        roadmapId,
        phaseId,
        title: c.weeks[week - 1]!,
        note: '',
        position: k,
        plannedStart: qptWeekStart(startDate, week),
        plannedEnd: qptWeekEnd(startDate, week),
        actualStart: null,
        actualEnd: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
  const checkpoints: RoadmapCheckpoint[] = c.checkpoints.map(([title, w, threshold, note], i) => ({
    id: ids('checkpoint', i + 1),
    roadmapId,
    title,
    note,
    date: w === 0 ? startDate : qptWeekEnd(startDate, w),
    maxScore: QPT_MAX_SCORE,
    threshold,
    score: null,
    createdAt: now,
    updatedAt: now,
  }));
  return { roadmap, phases, items, checkpoints };
}
