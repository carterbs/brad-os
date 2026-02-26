import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SCRIPT = path.resolve('scripts/doctor.sh');
const ROOT = path.resolve('.');

function runDoctor(
  envOverrides: Record<string, string> = {},
  cwd = ROOT,
): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`bash ${SCRIPT}`, {
      cwd,
      env: { ...process.env, BRAD_DOCTOR_FAST: '1', ...envOverrides },
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return { stdout, exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

let cachedHealthyRun: { stdout: string; exitCode: number } | null = null;
let cachedMissingToolsRun: { stdout: string; exitCode: number } | null = null;
let healthyCommandDir: string | null = null;

function getHealthyCommandDir(): string {
  if (healthyCommandDir === null) {
    healthyCommandDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brad-os-doctor-healthy-'));
    const toolCommands = [
      ['rustup', '#!/bin/sh\nif [ "$1" = "component" ] && [ "$2" = "list" ]; then\n  echo "llvm-tools-preview"\nfi\n'],
      ['cargo', '#!/bin/sh\n'],
      ['cargo-llvm-cov', '#!/bin/sh\n'],
    ];

    for (const [name, body] of toolCommands) {
      const toolPath = path.join(healthyCommandDir, name);
      fs.writeFileSync(toolPath, body, { mode: 0o755 });
      fs.chmodSync(toolPath, 0o755);
    }
  }

  return healthyCommandDir;
}

function getHealthyRun(): { stdout: string; exitCode: number } {
  if (cachedHealthyRun === null) {
    cachedHealthyRun = runDoctor({ PATH: `${getHealthyCommandDir()}:${process.env.PATH ?? ''}` });
  }
  return cachedHealthyRun;
}

function getMissingToolsRun(): { stdout: string; exitCode: number } {
  if (cachedMissingToolsRun === null) {
    cachedMissingToolsRun = runDoctor({ PATH: '/usr/bin:/bin' });
  }
  return cachedMissingToolsRun;
}

describe('scripts/doctor.sh', () => {
  it('exits 0 when all tools are present', () => {
    const { stdout, exitCode } = getHealthyRun();
    expect(exitCode).toBe(0);
    expect(stdout).toContain('PASS');
    expect(stdout).toContain('All dependencies satisfied.');
  });

  it('reports node version', () => {
    const { stdout } = getHealthyRun();
    expect(stdout).toContain('✓ node');
    expect(stdout).toContain('installed (fast)');
  });

  it('reports all expected tool names', () => {
    const { stdout } = getHealthyRun();
    expect(stdout).toContain('node');
    expect(stdout).toContain('npm');
    expect(stdout).toContain('firebase');
    expect(stdout).toContain('gitleaks');
    expect(stdout).toContain('xcodegen');
    expect(stdout).toContain('git hooks');
    expect(stdout).toContain('node_modules');
  });

  it('exits 1 when a tool is missing', () => {
    const { stdout, exitCode } = getMissingToolsRun();
    expect(exitCode).toBe(1);
    expect(stdout).toContain('FAIL');
  });

  it('prints install commands when tools are missing', () => {
    const { stdout } = getMissingToolsRun();
    expect(stdout).toContain('npm install -g firebase-tools');
    expect(stdout).toContain('brew install gitleaks');
    expect(stdout).toContain('brew install xcodegen');
  });

  it('detects missing node_modules', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brad-os-doctor-'));
    const { stdout, exitCode } = runDoctor({ PATH: '/usr/bin:/bin' }, tempDir);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('✗ node_modules');
    expect(stdout).toContain('missing');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
