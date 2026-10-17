/**
 * M10-AC1 (F2-R1, NFR-03 v3.1), cloud project: cold load of …/one-percent-better/#/today with the cloud
 * configured but nobody signed in stays within the 230 kB working budget; no Recharts, SDK or zod chunk
 * is transferred and the mock Supabase receives no request.
 */
import { expect, test } from './fixtures';
import { CLOUD_BASE_URL } from '../../playwright.config';
import { expectWithinBudget, logColdLoad, measureColdToday } from '../helpers/bundle';
import { recordRequests } from './helpers';

test('M10-AC1: cold #/today (cloud on, signed out) <= 230 kB gzip, no Recharts / SDK / zod chunk, no request to the mock', async ({ page, mock }) => {
  await mock.reset();
  const rec = recordRequests(page);
  const load = await measureColdToday(page, CLOUD_BASE_URL);
  logColdLoad('budget cloud', load);
  expectWithinBudget(load);
  expect(rec.mock()).toEqual([]);
  expect(rec.sdk()).toEqual([]);
  expect(rec.external()).toEqual([]);
});
