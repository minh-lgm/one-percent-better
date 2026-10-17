/**
 * M10-AC1 (F2-R1, NFR-03 v3.1), cloud project: cold load of …/one-percent-better/#/today with the cloud
 * configured but nobody signed in stays within the 230 kB working budget; no Recharts, SDK or zod chunk
 * is transferred and the mock Supabase receives no request.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

test('M10-AC6 (3): the cloud build still ships the lazy supabase-client chunk (and it is the one mentioning auth/v1)', async () => {
  const dir = join(process.cwd(), 'dist-cloud-e2e', 'assets');
  const files = readdirSync(dir);
  const sdk = files.filter((f) => /^supabase-client-.*\.js$/.test(f));
  expect(sdk).toHaveLength(1);
  expect(readFileSync(join(dir, sdk[0]), 'utf8')).toContain('auth/v1');
  const others = files.filter((f) => f.endsWith('.js') && !sdk.includes(f) && readFileSync(join(dir, f), 'utf8').includes('auth/v1'));
  expect(others).toEqual([]);
});
