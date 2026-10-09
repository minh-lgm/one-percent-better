import { expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { flattenMessages } from '../../src/i18n/parity';
import en from '../../src/i18n/resources/en.json' with { type: 'json' };
import vi from '../../src/i18n/resources/vi.json' with { type: 'json' };
import { scanUntranslated, type ScanHit } from '../../src/test/i18n-scan';

export const FIXED_TIME = new Date('2026-10-09T10:00:00+07:00');
export const EN = en;
export const VI = vi;
const SCAN_DATA = { en: flattenMessages(en), vi: flattenMessages(vi) };

/** Freeze "now" (TASKS §0) before any app script runs. */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXED_TIME);
}

export async function gotoHash(page: Page, hash: string): Promise<void> {
  await page.goto(`/#${hash}`);
}

/** Run the vi DOM scan in the page; returns offending strings. */
export async function scanVi(page: Page): Promise<string[]> {
  // The scanner is self-contained, so its source can be evaluated in the page.
  const hits = await page.evaluate<ScanHit[]>(`(${scanUntranslated.toString()})(document, ${JSON.stringify(SCAN_DATA)})`);
  return hits.map((h) => `${h.text} (${h.reason})`);
}

export async function expectNoViLeaks(page: Page): Promise<void> {
  expect(await scanVi(page)).toEqual([]);
}

export async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth);
}

export interface GoalSpec {
  name: string;
  why?: string;
  targetType?: 'daily' | 'total';
  targetValue: number;
  startDate?: string;
  endDate?: string; // undefined = "This year"
}

type Copy = typeof en | typeof vi;

/** Create a goal through the UI (M1-AC2 flow). Works in en or vi. */
export async function createGoal(page: Page, goal: GoalSpec, copy: Copy = en): Promise<void> {
  await gotoHash(page, '/goals/new');
  await expect(page.getByRole('heading', { level: 1, name: copy.goal.form.titleNew })).toBeVisible();
  await page.getByLabel(new RegExp(`^${copy.goal.form.nameLabel}`)).fill(goal.name);
  if (goal.why) await page.getByLabel(new RegExp(`^${copy.goal.form.whyLabel.replace(/[()]/g, '\\$&')}`)).fill(goal.why);
  if (goal.targetType === 'total') {
    await page.getByRole('radio', { name: copy.goal.form.targetTotal }).check();
    await page.getByRole('textbox', { name: new RegExp(`^${copy.goal.form.targetTotal}`) }).fill(String(goal.targetValue));
  } else {
    await page.getByRole('textbox', { name: new RegExp(`^${copy.goal.form.targetDaily}`) }).fill(String(goal.targetValue));
  }
  if (goal.startDate) await page.getByLabel(new RegExp(`^${copy.goal.form.startLabel}`)).fill(goal.startDate);
  if (goal.endDate) {
    await page.getByRole('radio', { name: copy.goal.form.endsSpecific }).check();
    await page.getByLabel(new RegExp(`^${copy.goal.form.endLabel}`)).fill(goal.endDate);
  }
  await page.getByRole('button', { name: copy.goal.form.save }).click();
  await expect(page.getByRole('heading', { level: 1, name: copy.goals.title })).toBeVisible();
}

export function goalCard(page: Page, name: string): Locator {
  return page.getByRole('article', { name });
}

/** Log minutes (+ optional note) on a Today card. */
export async function logTime(page: Page, name: string, minutes: number, note = '', copy: Copy = en): Promise<void> {
  const card = goalCard(page, name);
  await card.getByRole('button', { name: copy.goalCard.logTime }).click();
  await card.getByLabel(new RegExp(`^${copy.entry.form.minutesLabel}`)).fill(String(minutes));
  if (note) await card.getByLabel(new RegExp(`^${copy.entry.form.noteLabel.replace(/[()]/g, '\\$&')}`)).fill(note);
  await card.getByRole('button', { name: copy.entry.form.save }).click();
}

export async function expectAmount(page: Page, name: string, amount: string): Promise<void> {
  await expect(goalCard(page, name).locator('.amount')).toContainText(amount);
}

export function plusOne(page: Page, name: string): Locator {
  return goalCard(page, name).getByTestId('plus-one');
}

export function toast(page: Page): Locator {
  return page.getByTestId('toast');
}
