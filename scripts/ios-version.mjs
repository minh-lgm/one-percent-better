// Marketing version and build number for the iOS release lane (TASKS M13-T2, ARCHITECTURE §5.14).
//
//   MARKETING_VERSION: tag `ios-vX.Y.Z` → X.Y.Z; else the workflow input `marketing_version`; else ios/ci/version.json.
//   BUILD_NUMBER:      GITHUB_RUN_NUMBER (+ IOS_BUILD_OFFSET, default 0) — strictly increasing per workflow, which is
//                      what App Store Connect requires for one marketing version.
//
// CLI (GitHub Actions): `node scripts/ios-version.mjs` reads GITHUB_REF, INPUT_MARKETING_VERSION, GITHUB_RUN_NUMBER,
// IOS_BUILD_OFFSET and appends `MARKETING_VERSION=…` / `BUILD_NUMBER=…` to $GITHUB_ENV (printed when unset).
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+$/;
const TAG_PREFIX = 'refs/tags/ios-v';

function checkVersion(value, source) {
  if (!SEMVER.test(value)) throw new Error(`${source} must be X.Y.Z (digits only), got "${value}"`);
  return value;
}

function positiveInt(value, name) {
  if (typeof value === 'number' ? !Number.isInteger(value) : !/^\d+$/.test(String(value ?? ''))) {
    throw new Error(`${name} must be a positive integer, got "${value}"`);
  }
  const n = Number(value);
  if (n < 1) throw new Error(`${name} must be ≥ 1, got "${value}"`);
  return n;
}

/**
 * Pure: `{ ref, input, file, runNumber, buildOffset }` → `{ marketing, build }` (both strings). Throws on a malformed
 * tag/input/file version, a non-positive run number or a negative offset.
 */
export function computeIosVersion({ ref = '', input = '', file = '', runNumber, buildOffset = 0 }) {
  let marketing;
  if (ref.startsWith(TAG_PREFIX)) marketing = checkVersion(ref.slice(TAG_PREFIX.length), `tag ${ref.slice('refs/tags/'.length)}`);
  else if (input.trim() !== '') marketing = checkVersion(input.trim(), 'input marketing_version');
  else marketing = checkVersion(String(file).trim(), 'ios/ci/version.json marketingVersion');

  const run = positiveInt(runNumber, 'GITHUB_RUN_NUMBER');
  const offsetRaw = buildOffset === '' || buildOffset === undefined || buildOffset === null ? 0 : buildOffset;
  if (!/^\d+$/.test(String(offsetRaw))) throw new Error(`IOS_BUILD_OFFSET must be a non-negative integer, got "${buildOffset}"`);
  return { marketing, build: String(run + Number(offsetRaw)) };
}

export function readVersionFile(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed.marketingVersion !== 'string') throw new Error(`${path}: expected { "marketingVersion": "X.Y.Z" }`);
  return parsed.marketingVersion;
}

export function main(env = process.env) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const result = computeIosVersion({
    ref: env.GITHUB_REF ?? '',
    input: env.INPUT_MARKETING_VERSION ?? '',
    file: readVersionFile(join(root, 'ios', 'ci', 'version.json')),
    runNumber: env.GITHUB_RUN_NUMBER,
    buildOffset: env.IOS_BUILD_OFFSET ?? 0,
  });
  const lines = `MARKETING_VERSION=${result.marketing}\nBUILD_NUMBER=${result.build}\n`;
  if (env.GITHUB_ENV) appendFileSync(env.GITHUB_ENV, lines);
  process.stdout.write(lines);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(`ios-version: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
