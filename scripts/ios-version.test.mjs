// M13-AC2: marketing version + build number (pure function and the CLI that writes $GITHUB_ENV).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeIosVersion, readVersionFile } from './ios-version.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CLI = join(here, 'ios-version.mjs');

describe('computeIosVersion', () => {
  it('tag ios-v1.0.0 wins; build = run number', () => {
    expect(computeIosVersion({ ref: 'refs/tags/ios-v1.0.0', input: '', file: '1.0.0', runNumber: 7 })).toEqual({ marketing: '1.0.0', build: '7' });
    expect(computeIosVersion({ ref: 'refs/tags/ios-v2.3.4', input: '9.9.9', file: '1.0.0', runNumber: '7' })).toEqual({ marketing: '2.3.4', build: '7' });
  });
  it('no tag: the workflow input, then the version file', () => {
    expect(computeIosVersion({ ref: 'refs/heads/main', input: '1.0.1', file: '1.0.0', runNumber: 8 })).toEqual({ marketing: '1.0.1', build: '8' });
    expect(computeIosVersion({ ref: 'refs/heads/main', input: '', file: '1.0.0', runNumber: 8 })).toEqual({ marketing: '1.0.0', build: '8' });
    expect(computeIosVersion({ ref: '', input: '  ', file: '1.0.0', runNumber: 8 }).marketing).toBe('1.0.0');
  });
  it('rejects malformed versions with a clear message', () => {
    expect(() => computeIosVersion({ ref: 'refs/tags/ios-v1.0', file: '1.0.0', runNumber: 1 })).toThrow(/tag ios-v1\.0 must be X\.Y\.Z/);
    expect(() => computeIosVersion({ ref: '', input: '1.0.0-beta', file: '1.0.0', runNumber: 1 })).toThrow(/input marketing_version must be X\.Y\.Z/);
    expect(() => computeIosVersion({ ref: '', input: '', file: 'v1.0.0', runNumber: 1 })).toThrow(/version\.json/);
    expect(() => computeIosVersion({ ref: 'refs/tags/ios-v', file: '1.0.0', runNumber: 1 })).toThrow(/must be X\.Y\.Z/);
  });
  it('rejects a run number that is not a positive integer', () => {
    expect(() => computeIosVersion({ file: '1.0.0', runNumber: '0' })).toThrow(/GITHUB_RUN_NUMBER/);
    expect(() => computeIosVersion({ file: '1.0.0', runNumber: 'abc' })).toThrow(/GITHUB_RUN_NUMBER/);
    expect(() => computeIosVersion({ file: '1.0.0', runNumber: undefined })).toThrow(/GITHUB_RUN_NUMBER/);
    expect(() => computeIosVersion({ file: '1.0.0', runNumber: 1.5 })).toThrow(/GITHUB_RUN_NUMBER/);
  });
  it('adds IOS_BUILD_OFFSET (default 0, empty string = 0); negative or non-numeric offsets are rejected', () => {
    expect(computeIosVersion({ file: '1.0.0', runNumber: 7, buildOffset: '100' }).build).toBe('107');
    expect(computeIosVersion({ file: '1.0.0', runNumber: 7, buildOffset: 100 }).build).toBe('107');
    expect(computeIosVersion({ file: '1.0.0', runNumber: 7, buildOffset: '' }).build).toBe('7');
    expect(() => computeIosVersion({ file: '1.0.0', runNumber: 7, buildOffset: '-1' })).toThrow(/IOS_BUILD_OFFSET/);
    expect(() => computeIosVersion({ file: '1.0.0', runNumber: 7, buildOffset: 'x' })).toThrow(/IOS_BUILD_OFFSET/);
  });
});

describe('ios/ci/version.json', () => {
  it('holds the current marketing version in X.Y.Z form', () => {
    expect(readVersionFile(join(root, 'ios', 'ci', 'version.json'))).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('CLI (node scripts/ios-version.mjs)', () => {
  function run(env) {
    const dir = mkdtempSync(join(tmpdir(), 'ios-version-'));
    const githubEnv = join(dir, 'github.env');
    try {
      const stdout = execFileSync(process.execPath, [CLI], {
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GITHUB_ENV: githubEnv, ...env },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { stdout, file: readFileSync(githubEnv, 'utf8') };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('writes MARKETING_VERSION and BUILD_NUMBER to $GITHUB_ENV (tag + offset)', () => {
    const { stdout, file } = run({ GITHUB_REF: 'refs/tags/ios-v1.2.3', GITHUB_RUN_NUMBER: '7', IOS_BUILD_OFFSET: '100' });
    expect(file).toBe('MARKETING_VERSION=1.2.3\nBUILD_NUMBER=107\n');
    expect(stdout).toBe(file);
  });

  it('falls back to ios/ci/version.json and exits 1 with a message on a bad input', () => {
    const { file } = run({ GITHUB_REF: 'refs/heads/main', GITHUB_RUN_NUMBER: '3', INPUT_MARKETING_VERSION: '' });
    expect(file).toMatch(/^MARKETING_VERSION=\d+\.\d+\.\d+\nBUILD_NUMBER=3\n$/);

    let failure;
    try {
      run({ GITHUB_REF: 'refs/heads/main', GITHUB_RUN_NUMBER: '3', INPUT_MARKETING_VERSION: '1.0.0-beta' });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
    expect(failure.status).toBe(1);
    expect(String(failure.stderr)).toMatch(/ios-version: input marketing_version must be X\.Y\.Z/);
  });
});
