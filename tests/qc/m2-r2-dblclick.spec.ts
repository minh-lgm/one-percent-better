// QC round 2 (M2): hammer Start with two clicks at many gaps in real Chromium; count error alerts.
import { expect, test } from '@playwright/test';
import { createGoal, EN, freezeClock, goalCard, gotoHash, kvGet, timerCard } from '../../e2e/helpers/app';

test('double-click Start at gaps 0..120 ms, 12 rounds each (intermittent M2-D4: needs CPU load, run with --repeat-each 12 --workers 12 to see it): never an error alert, always exactly one timer', async ({ page }) => {
  test.setTimeout(180_000);
  await freezeClock(page);
  await createGoal(page, { name: 'Read', targetValue: 30, startDate: '2026-10-01', endDate: '2026-10-31' });
  const outcomes: Array<{ gap: number; alert: boolean; text: string; stillAfter2s?: boolean }> = [];
  for (const gap of [0, 5, 20, 60, 120]) {
    for (let round = 0; round < 12; round++) {
      await gotoHash(page, '/today');
      await page.evaluate(
        () =>
          new Promise<void>((resolve, reject) => {
            const req = indexedDB.open('one-percent-better');
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              const tx = req.result.transaction('kv', 'readwrite');
              tx.objectStore('kv').delete('activeTimer');
              tx.oncomplete = () => resolve();
            };
          }),
      );
      await page.reload();
      const btn = goalCard(page, 'Read').getByRole('button', { name: EN.goalCard.startTimer });
      await expect(btn).toBeVisible();
      const box = (await btn.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.click(x, y);
      if (gap) await page.waitForTimeout(gap);
      await page.mouse.click(x, y);
      await expect(timerCard(page)).toBeVisible();
      await page.waitForTimeout(150);
      outcomes.push({ gap, alert: (await page.getByRole('alert').count()) > 0, text: (await page.getByRole('alert').allTextContents()).join(' | ') });
      if (outcomes[outcomes.length - 1].alert) {
        await page.waitForTimeout(2000);
        outcomes[outcomes.length - 1].stillAfter2s = (await page.getByRole('alert').count()) > 0;
      }
      expect(await kvGet(page, 'activeTimer')).not.toBeNull();
    }
  }
  console.log('DBLCLICK_E2E', JSON.stringify(outcomes.filter((o) => o.alert)), 'of', outcomes.length);
  expect(outcomes.filter((o) => o.alert)).toEqual([]);
});
